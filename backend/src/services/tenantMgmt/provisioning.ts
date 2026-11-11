/**
 * Automated provisioning (plan §6.5) -- WORK PACKAGE D.
 *
 * A ProvisioningRun of ordered ProvisioningSteps, executed in the background on
 * the MIS. Every step is idempotent (safe to re-run after a crash or a failure),
 * the tenant stays PENDING until every step is DONE or SKIPPED, and a failed run
 * is resumed from the failed step by startProvisioning (retry, attempt + 1).
 *
 *   TENANT_ROW     Tenant(PENDING) + TenantSystem rows from the package
 *   MIS_DB         provisionMisTenant + the School row from the application
 *   SUPER_ADMIN    the applicant becomes the school's SUPER_ADMIN + school_owner
 *                  (same bcrypt hash: no new password); Account Directory;
 *                  ApplicantAccount CONVERTED (its onboarding token turns read-only: guards.ts)
 *   BRANDING       an accepted LOGO document -> the school's storage + School.logo
 *   APP_TASKMENTOR / APP_TENDO / APP_TUPO
 *                  POST <spoke>/api/integration/tenants/:tid/provision (CONTRACT.md §5)
 *   SUBSCRIPTION   Subscription ACTIVE, Tenant ACTIVE, application ACTIVE
 *   WELCOME        welcome e-mail to the super admin; platform staff told (tenant.live)
 *
 * Spokes not configured (no URL or no TENANCY_PROVISION_SECRET): SKIPPED with a
 * log outside production, FAILED in production -- never a silent partial
 * activation in prod.
 *
 * Serialised run = frontend/src/api/tenantMgmt.ts `ProvisioningRun`.
 */
import { RowDataPacket } from "mysql2/promise";
import path from "path";
import { controlPool } from "../../db/platform";
import { poolFor } from "../../db/pools";
import { ConflictError, NotFoundError } from "../../errors/CustomError";
import { PRIMARY_TENANT_ID, TenantCtx, runWithTenant } from "../../vendor/nga-tenancy";
import { createTenantRow, provisionMisTenant } from "../../tenancy/provision";
import { getTenant, invalidateTenants } from "../../tenancy/registry";
import { syncDirectoryUser } from "../../tenancy/directory";
import { platformAudit } from "../../tenancy/audit";
import { tenantBlock } from "../../tenancy/claims";
import storageService from "../../utils/fileServer";
import logger from "../../utils/logger";
import { loadApplicationRow, transitionApplication } from "./applicationStore";
import { invalidateEntitlements, resolveEntitlements } from "./entitlements";
import { readPlatformFile } from "./files";
import { notifyPlatformStaff, sendMail } from "./notify";
import { PLATFORM_CAPS } from "./catalog";
import { addCycle, dateOnly, publishTenantChanged } from "./subscription";

export const STEP_KEYS = [
  "TENANT_ROW",
  "MIS_DB",
  "SUPER_ADMIN",
  "BRANDING",
  "APP_TASKMENTOR",
  "APP_TENDO",
  "APP_TUPO",
  "SUBSCRIPTION",
  "WELCOME",
] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** Short labels safe to show an applicant. */
export const STEP_LABELS: Record<StepKey, string> = {
  TENANT_ROW: "Reserving your school",
  MIS_DB: "Creating your MIS",
  SUPER_ADMIN: "Creating your administrator account",
  BRANDING: "Adding your logo",
  APP_TASKMENTOR: "Setting up Task Mentor",
  APP_TENDO: "Setting up Tendo",
  APP_TUPO: "Setting up Tupo",
  SUBSCRIPTION: "Activating",
  WELCOME: "Your school is live",
};

/** Spoke steps: APP entitlement key + where the spoke lives. */
const SPOKES: Record<"APP_TASKMENTOR" | "APP_TENDO" | "APP_TUPO", { app: string; name: string; env: string[] }> = {
  APP_TASKMENTOR: { app: "app.taskmentor", name: "Task Mentor", env: ["TENANCY_SPOKE_TASKMENTOR_URL", "HOME_APP_TASKMENTOR_URL"] },
  APP_TENDO: { app: "app.tendo", name: "Tendo", env: ["TENANCY_SPOKE_TENDO_URL", "HOME_APP_ATTENDANCE_URL"] },
  APP_TUPO: { app: "app.tupo", name: "Tupo", env: ["TENANCY_SPOKE_TUPO_URL", "HOME_APP_TUPO_URL"] },
};

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);
const isProduction = () => process.env.NODE_ENV === "production";

// ---------------------------------------------------------------------------
// Test hooks
// ---------------------------------------------------------------------------

/** Chaos hook: called after a step's work, before it is marked DONE. Throw to fail it. */
type StepHook = (step: StepKey, ctx: { runId: number; tid: number | null; attempt: number }) => void | Promise<void>;
let afterStepHook: StepHook | null = null;
export const setProvisioningStepHook = (fn: StepHook | null) => {
  afterStepHook = fn;
};

/** Spoke transport (tests). Returns the HTTP status and parsed JSON body. */
export type SpokePost = (url: string, secret: string, body: unknown) => Promise<{ status: number; body: any }>;
const realSpokePost: SpokePost = async (url, secret, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.TENANCY_PROVISION_TIMEOUT_MS) || 60_000),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
let spokePost: SpokePost = realSpokePost;
export const setSpokeTransport = (fn: SpokePost | null) => {
  spokePost = fn ?? realSpokePost;
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

async function runRow(runId: number): Promise<RowDataPacket> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ProvisioningRun WHERE run_id = ?", [runId]);
  if (!rows[0]) throw new NotFoundError("Provisioning run not found");
  return rows[0];
}

async function latestRunRow(applicationId: number): Promise<RowDataPacket | null> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM ProvisioningRun WHERE application_id = ? ORDER BY run_id DESC LIMIT 1",
    [applicationId],
  );
  return rows[0] ?? null;
}

async function stepRows(runId: number): Promise<RowDataPacket[]> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ProvisioningStep WHERE run_id = ? ORDER BY seq, step_key", [runId]);
  return rows;
}

async function appendLog(runId: number, step: StepKey, line: string): Promise<void> {
  const stamped = `[${new Date().toISOString()}] ${line}`.slice(0, 2000);
  await controlPool().query(
    "UPDATE ProvisioningStep SET log = IF(log IS NULL OR log = '', ?, CONCAT(log, '\\n', ?)) WHERE run_id = ? AND step_key = ?",
    [stamped, stamped, runId, step],
  );
}

async function setStep(runId: number, step: StepKey, status: string): Promise<void> {
  const started = status === "RUNNING" ? ", started_at = NOW(), finished_at = NULL" : "";
  const finished = ["DONE", "FAILED", "SKIPPED"].includes(status) ? ", finished_at = NOW()" : "";
  await controlPool().query(`UPDATE ProvisioningStep SET status = ?${started}${finished} WHERE run_id = ? AND step_key = ?`, [status, runId, step]);
}

/** Serialise a run (`log` only for the platform). */
export async function serializeRun(runId: number, audience: "applicant" | "platform") {
  const r = await runRow(runId);
  const steps = await stepRows(runId);
  return {
    id: Number(r.run_id),
    status: r.status as "PENDING" | "RUNNING" | "DONE" | "FAILED",
    attempt: Number(r.attempt),
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
    steps: steps.map((s) => ({
      key: String(s.step_key),
      label: STEP_LABELS[s.step_key as StepKey] ?? String(s.step_key),
      status: s.status,
      startedAt: iso(s.started_at),
      finishedAt: iso(s.finished_at),
      ...(audience === "platform" ? { log: s.log ?? null } : {}),
    })),
    ...(audience === "platform" ? { applicationId: r.application_id === null ? null : Number(r.application_id), tenantId: r.tenant_id === null ? null : Number(r.tenant_id) } : {}),
  };
}

/** The latest run of an application, serialised (`log` only for the platform). */
export async function runForApplication(applicationId: number, audience: "applicant" | "platform"): Promise<any | null> {
  const r = await latestRunRow(applicationId);
  return r ? serializeRun(Number(r.run_id), audience) : null;
}

// ---------------------------------------------------------------------------
// Start / resume
// ---------------------------------------------------------------------------

/** In-process runs (one per application). */
const inFlight = new Map<number, Promise<void>>();
/** Start requests being decided (guards two concurrent startProvisioning calls). */
const starting = new Map<number, Promise<{ runId: number }>>();

/** Resolves when the application's in-process run finishes (tests, CLI). */
export async function waitForProvisioning(applicationId: number): Promise<void> {
  await starting.get(applicationId)?.catch(() => undefined);
  await inFlight.get(applicationId);
}

/**
 * Start (or resume) provisioning for an application in PAYMENT_CONFIRMED (or
 * PROVISIONING_FAILED on retry). Moves it to PROVISIONING and runs the steps in
 * the background; returns the run id at once.
 */
export function startProvisioning(applicationId: number, actorId?: number | null): Promise<{ runId: number }> {
  const pending = starting.get(applicationId);
  if (pending) return pending;
  const p = doStart(applicationId, actorId ?? null).finally(() => starting.delete(applicationId));
  starting.set(applicationId, p);
  return p;
}

async function doStart(applicationId: number, actorId: number | null): Promise<{ runId: number }> {
  const app = await loadApplicationRow(applicationId);
  const status = String(app.status);
  const latest = await latestRunRow(applicationId);

  if (inFlight.has(applicationId) && latest) return { runId: Number(latest.run_id) };
  if (status === "ACTIVE" && latest) return { runId: Number(latest.run_id) };
  if (!["PAYMENT_CONFIRMED", "PROVISIONING_FAILED", "PROVISIONING"].includes(status)) {
    throw new ConflictError(`Provisioning needs a confirmed payment (the application is ${status}).`, [
      { code: "INVALID_TRANSITION", machine: "application", from: status, to: "PROVISIONING" },
    ]);
  }

  let runId: number;
  if (latest && latest.status !== "DONE") {
    // Resume: same run, next attempt; failed steps start again.
    runId = Number(latest.run_id);
    if (latest.status === "RUNNING" && status === "PROVISIONING" && !inFlight.has(applicationId)) {
      // A run left RUNNING by a crashed process: resume it.
    } else if (latest.status === "RUNNING") {
      return { runId };
    }
    const [res]: any = await controlPool().query(
      "UPDATE ProvisioningRun SET status = 'PENDING', attempt = attempt + 1, finished_at = NULL WHERE run_id = ? AND status IN ('FAILED','PENDING','RUNNING')",
      [runId],
    );
    if (Number(res.affectedRows ?? 0) === 0) return { runId };
    await controlPool().query("UPDATE ProvisioningStep SET status = 'PENDING', finished_at = NULL WHERE run_id = ? AND status IN ('FAILED','RUNNING')", [runId]);
  } else {
    const [res]: any = await controlPool().query(
      "INSERT INTO ProvisioningRun (application_id, tenant_id, status, attempt) VALUES (?, ?, 'PENDING', 1)",
      [applicationId, app.tenant_id ?? null],
    );
    runId = Number(res.insertId);
    await controlPool().query(
      `INSERT IGNORE INTO ProvisioningStep (run_id, step_key, seq, status) VALUES ${STEP_KEYS.map(() => "(?, ?, ?, 'PENDING')").join(", ")}`,
      STEP_KEYS.flatMap((k, i) => [runId, k, i + 1]),
    );
  }

  if (status !== "PROVISIONING") {
    await transitionApplication(applicationId, "PROVISIONING", { kind: actorId ? "PLATFORM" : "SYSTEM", id: actorId }, {
      message: "We're setting up your school.",
    });
  }
  await platformAudit({ action: "provisioning.start", actorUserId: actorId, targetTid: app.tenant_id ?? null, payload: { applicationId, runId } });

  const run = new Promise<void>((resolve) => {
    setImmediate(() => {
      executeRun(runId, applicationId)
        .catch((err) => logger.error("[provisioning] run crashed", { runId, error: err }))
        .finally(() => {
          inFlight.delete(applicationId);
          resolve();
        });
    });
  });
  inFlight.set(applicationId, run);
  return { runId };
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------

interface RunCtx {
  runId: number;
  attempt: number;
  applicationId: number;
  app: RowDataPacket;
  tid: number | null;
  log: (line: string) => Promise<void>;
}

class StepSkipped extends Error {}

async function executeRun(runId: number, applicationId: number): Promise<void> {
  await controlPool().query("UPDATE ProvisioningRun SET status = 'RUNNING', started_at = COALESCE(started_at, NOW()) WHERE run_id = ?", [runId]);
  const run = await runRow(runId);
  const ctx: RunCtx = {
    runId,
    attempt: Number(run.attempt),
    applicationId,
    app: await loadApplicationRow(applicationId),
    tid: run.tenant_id === null ? null : Number(run.tenant_id),
    log: async () => undefined,
  };
  for (const step of await stepRows(runId)) {
    const key = String(step.step_key) as StepKey;
    if (step.status === "DONE" || step.status === "SKIPPED") continue;
    ctx.log = (line: string) => appendLog(runId, key, line);
    await setStep(runId, key, "RUNNING");
    try {
      ctx.app = await loadApplicationRow(applicationId);
      await STEPS[key](ctx);
      if (afterStepHook) await afterStepHook(key, { runId, tid: ctx.tid, attempt: ctx.attempt });
      await setStep(runId, key, "DONE");
    } catch (err) {
      if (err instanceof StepSkipped) {
        await ctx.log(`skipped: ${err.message}`);
        await setStep(runId, key, "SKIPPED");
        continue;
      }
      await failRun(ctx, key, err);
      return;
    }
  }
  await controlPool().query("UPDATE ProvisioningRun SET status = 'DONE', finished_at = NOW() WHERE run_id = ?", [runId]);
  await platformAudit({ action: "provisioning.done", targetTid: ctx.tid, payload: { applicationId, runId, attempt: ctx.attempt } });
}

async function failRun(ctx: RunCtx, key: StepKey, err: unknown): Promise<void> {
  const message = (err as Error)?.message ?? String(err);
  logger.error(`[provisioning] run ${ctx.runId} failed at ${key}`, { error: err, applicationId: ctx.applicationId, tid: ctx.tid });
  await ctx.log(`FAILED: ${message}`).catch(() => undefined);
  await setStep(ctx.runId, key, "FAILED").catch(() => undefined);
  await controlPool().query("UPDATE ProvisioningRun SET status = 'FAILED', finished_at = NOW() WHERE run_id = ?", [ctx.runId]).catch(() => undefined);
  try {
    await transitionApplication(ctx.applicationId, "PROVISIONING_FAILED", { kind: "SYSTEM", id: null }, {
      message: "We're finishing your setup — no action needed.",
    });
  } catch (e) {
    logger.error("[provisioning] could not mark the application failed", { error: e, applicationId: ctx.applicationId });
  }
  await platformAudit({ action: "provisioning.failed", targetTid: ctx.tid, payload: { applicationId: ctx.applicationId, runId: ctx.runId, step: key, message } });
  void notifyPlatformStaff({
    event: "provisioning.failed",
    caps: [PLATFORM_CAPS.lifecycle],
    title: `Provisioning failed: ${ctx.app.school_name}`,
    body: `Step ${STEP_LABELS[key]} (${key}) failed on attempt ${ctx.attempt}: ${message}`,
    link: `/platform/applications/${ctx.applicationId}`,
    subjectType: "platform_application",
    subjectId: ctx.applicationId,
    email: true,
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function tenantOf(ctx: RunCtx): Promise<TenantCtx> {
  if (!ctx.tid) throw new Error("The tenant row does not exist yet");
  invalidateTenants();
  const t = await getTenant(ctx.tid);
  if (!t) throw new Error(`Tenant ${ctx.tid} is not in the control plane`);
  return t;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

async function stepTenantRow(ctx: RunCtx): Promise<void> {
  const app = ctx.app;
  let tid: number | null = ctx.tid ?? (app.tenant_id ? Number(app.tenant_id) : null);
  if (tid) {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id FROM Tenant WHERE tenant_id = ?", [tid]);
    if (!rows[0]) tid = null;
  }
  if (!tid) {
    // A crash between the insert and the bookkeeping below left a row behind.
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id FROM Tenant WHERE application_id = ? ORDER BY tenant_id LIMIT 1", [ctx.applicationId]);
    if (rows[0]) tid = Number(rows[0].tenant_id);
  }
  if (!tid) {
    const slug = String(app.desired_slug ?? "").trim().toLowerCase();
    if (!SLUG_RE.test(slug)) throw new Error(`The approved short name "${slug}" is not a valid slug`);
    const [taken] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id, application_id FROM Tenant WHERE slug = ?", [slug]);
    if (taken[0]) throw new Error(`The short name "${slug}" already belongs to school ${taken[0].tenant_id}`);
    tid = await createTenantRow({
      slug,
      name: String(app.school_name),
      status: "PENDING",
      pkg: String(app.approved_package ?? app.requested_package ?? "starter"),
      timezone: process.env.TENANCY_DEFAULT_TIMEZONE || "Africa/Kigali",
    });
    await ctx.log(`created tenant ${tid} (${slug})`);
  } else {
    await ctx.log(`tenant ${tid} already exists`);
  }
  if (tid === PRIMARY_TENANT_ID) throw new Error("An application can never provision the primary tenant");
  await controlPool().query("UPDATE Tenant SET application_id = ?, country = COALESCE(country, ?) WHERE tenant_id = ?", [
    ctx.applicationId,
    app.country ?? null,
    tid,
  ]);
  await controlPool().query("UPDATE ProvisioningRun SET tenant_id = ? WHERE run_id = ?", [tid, ctx.runId]);
  await controlPool().query("UPDATE TenantApplication SET tenant_id = ? WHERE application_id = ?", [tid, ctx.applicationId]);
  ctx.tid = tid;
  invalidateTenants();
  invalidateEntitlements(tid);
  try {
    const { deriveTenantSystems } = await import("./tenantSystems");
    const r = await deriveTenantSystems(tid);
    await ctx.log(`apps from the package: ${r.assigned} assigned, ${r.disabled} disabled`);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (!/not implemented/.test(msg)) throw err;
    await ctx.log(`TenantSystem derivation unavailable (${msg}); apps not assigned yet`);
  }
}

async function columnsOf(tid: number, table: string): Promise<Set<string>> {
  const [rows] = await poolFor(tid).query<RowDataPacket[]>(
    "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [table],
  );
  return new Set(rows.map((r) => String(r.c)));
}

async function stepMisDb(ctx: RunCtx): Promise<void> {
  const tenant = await tenantOf(ctx);
  const r = await provisionMisTenant(tenant.tid);
  await ctx.log(`database ${r.database}: ${r.created ? "created" : "existed"}, ${r.tablesCreated} tables, ${r.baselined} migrations baselined`);
  // The School row: the application's details (only columns this schema has).
  const app = ctx.app;
  const cols = await columnsOf(tenant.tid, "School");
  const set: Record<string, unknown> = {
    name: String(app.school_name).slice(0, 150),
    address: [app.address, app.sector, app.district, app.province].filter(Boolean).join(", ").slice(0, 255) || null,
    contact_email: app.school_email ?? null,
    contact_phone: app.school_phone ?? null,
    status: "ACTIVE",
  };
  if (cols.has("slug")) set.slug = tenant.slug;
  if (cols.has("timezone")) set.timezone = tenant.timezone;
  if (cols.has("website")) set.website = app.website ?? null;
  if (cols.has("email_from_name")) set.email_from_name = String(app.school_name).slice(0, 150);
  const keys = Object.keys(set).filter((k) => cols.has(k));
  await poolFor(tenant.tid).query(`UPDATE School SET ${keys.map((k) => `\`${k}\` = ?`).join(", ")} WHERE school_id = ?`, [...keys.map((k) => set[k]), tenant.tid]);
}

function splitName(full: string): { first: string; last: string } {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "Admin", last: "" };
  return { first: parts.slice(0, -1).join(" ").slice(0, 100), last: parts[parts.length - 1].slice(0, 100) };
}

async function stepSuperAdmin(ctx: RunCtx): Promise<void> {
  const tenant = await tenantOf(ctx);
  const [accRows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM ApplicantAccount WHERE account_id = ?", [ctx.app.account_id]);
  const acc = accRows[0];
  if (!acc) throw new Error("The applicant account is missing");
  const email = String(acc.email_norm);

  const userId = await runWithTenant(tenant, async () => {
    // Catalogs: the MIS manifest, presets (school_owner ...) and rules. Insert-only, so a
    // tenant DB cloned from a primary whose catalog was empty still gets its roles.
    const registry = await import("../access/registry");
    if (await registry.accessTablesPresent()) {
      const report = await registry.runAccessBootstrap();
      await ctx.log(`access registry: ${report.capabilitiesCreated} capabilities, ${report.rolesCreated.length} roles created`);
    }
    const pool = poolFor(tenant.tid);
    const one = async (q: string, p: unknown[]) => ((await pool.query<RowDataPacket[]>(q, p))[0][0] ?? null) as RowDataPacket | null;

    let superRole = await one("SELECT role_id FROM `Role` WHERE name = 'SUPER_ADMIN' LIMIT 1", []);
    if (!superRole) {
      const id = await registry.insertRoleWithNextId({
        name: "SUPER_ADMIN",
        description: "Runs this school: every permission inside the school, nothing platform-wide.",
        category: "School",
        allowed_scope_types: "SCHOOL",
      });
      superRole = { role_id: id } as any;
      await ctx.log("created the SUPER_ADMIN role");
    }
    const owner = await one("SELECT role_id FROM `Role` WHERE preset_key = 'school_owner' LIMIT 1", []);
    if (!owner) throw new Error("The school_owner preset is missing from the school's catalog");

    let user = await one("SELECT user_id FROM `User` WHERE email = ? LIMIT 1", [email]);
    if (!user) {
      const base = (email.split("@")[0] || "admin").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "admin";
      let username = base;
      for (let i = 2; await one("SELECT user_id FROM `User` WHERE username = ? LIMIT 1", [username]); i++) username = `${base}${i}`;
      const [res]: any = await pool.query("INSERT INTO `User` (username, email, phone_number, status) VALUES (?, ?, ?, 'ACTIVE')", [
        username,
        email,
        acc.phone ?? null,
      ]);
      user = { user_id: res.insertId } as any;
      await ctx.log(`created user ${res.insertId} (${username})`);
    }
    const uid = Number(user!.user_id);
    await pool.query("UPDATE `User` SET status = 'ACTIVE' WHERE user_id = ?", [uid]);
    if (!(await one("SELECT profile_id FROM UserProfile WHERE user_id = ? LIMIT 1", [uid]))) {
      const { first, last } = splitName(String(acc.full_name));
      await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, ?, ?, 'ADMIN')", [uid, first, last]);
    }
    if (await one("SELECT auth_id FROM AuthCredential WHERE user_id = ? LIMIT 1", [uid])) {
      await pool.query("UPDATE AuthCredential SET password_hash = ? WHERE user_id = ?", [acc.password_hash, uid]);
    } else {
      await pool.query("INSERT INTO AuthCredential (user_id, password_hash) VALUES (?, ?)", [uid, acc.password_hash]);
    }
    if (!(await one("SELECT user_id FROM UserRole WHERE user_id = ? AND role_id = ? LIMIT 1", [uid, superRole!.role_id]))) {
      await pool.query("INSERT INTO UserRole (user_id, role_id) VALUES (?, ?)", [uid, superRole!.role_id]);
    }
    if (!(await one("SELECT grant_id FROM AccessGrant WHERE user_id = ? AND role_id = ? AND status = 'ACTIVE' LIMIT 1", [uid, owner.role_id]))) {
      await pool.query(
        "INSERT INTO AccessGrant (user_id, role_id, school_id, scope_type, source, status, title, justification) VALUES (?, ?, ?, 'SCHOOL', 'MANUAL', 'ACTIVE', 'School Owner', 'The applicant who registered the school (provisioning)')",
        [uid, owner.role_id, tenant.tid],
      );
      await pool.query("UPDATE `User` SET access_version = access_version + 1 WHERE user_id = ?", [uid]).catch(() => undefined);
      await pool
        .query("INSERT INTO AccessAudit (actor_id, subject_user_id, action, target, reason) VALUES (NULL, ?, 'grant.create', ?, ?)", [
          uid,
          JSON.stringify({ role: "school_owner", scope: "SCHOOL" }),
          "School registered through the platform (provisioning)",
        ])
        .catch(() => undefined);
    }
    return uid;
  });

  await syncDirectoryUser(userId, tenant.tid);
  // The applicant is now that school's user: their onboarding token stops working.
  await controlPool().query(
    "UPDATE ApplicantAccount SET status = 'CONVERTED', tenant_id = ? WHERE account_id = ? AND NOT (status = 'CONVERTED' AND tenant_id <=> ?)",
    [tenant.tid, acc.account_id, tenant.tid],
  );
  await ctx.log(`super admin = user ${userId}`);
}

async function stepBranding(ctx: RunCtx): Promise<void> {
  const tenant = await tenantOf(ctx);
  const [docs] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM ApplicationDocument WHERE application_id = ? AND kind = 'LOGO' AND status = 'ACCEPTED' ORDER BY doc_id DESC LIMIT 1",
    [ctx.applicationId],
  );
  const doc = docs[0];
  if (!doc) throw new StepSkipped("no accepted logo");
  const [[school]] = await poolFor(tenant.tid).query<RowDataPacket[]>("SELECT logo FROM School WHERE school_id = ?", [tenant.tid]);
  if (school?.logo) throw new StepSkipped(`logo already set (${school.logo})`);
  const buf = await readPlatformFile(String(doc.file_path));
  const ext = path.extname(String(doc.original_name ?? doc.file_path)).toLowerCase() || ".png";
  const remote = `schools/${tenant.tid}/logo-primary-${Date.now()}${ext}`;
  await runWithTenant(tenant, () => storageService.uploadFile(buf, remote));
  await poolFor(tenant.tid).query("UPDATE School SET logo = ? WHERE school_id = ?", [remote, tenant.tid]);
  await ctx.log(`logo copied to ${remote}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function spokeStep(key: keyof typeof SPOKES) {
  return async (ctx: RunCtx): Promise<void> => {
    const tenant = await tenantOf(ctx);
    const spoke = SPOKES[key];
    invalidateEntitlements(tenant.tid);
    const ent = await resolveEntitlements(tenant.tid);
    if (!ent.unrestricted && !ent.apps.includes(spoke.app)) throw new StepSkipped(`${spoke.name} is not in the ${ent.pkg} package`);
    const base = spoke.env.map((e) => process.env[e]).find((v) => v && v.trim())?.replace(/\/$/, "");
    const secret = process.env.TENANCY_PROVISION_SECRET;
    if (!base || !secret) {
      const missing = [!base ? spoke.env[0] : null, !secret ? "TENANCY_PROVISION_SECRET" : null].filter(Boolean).join(" and ");
      if (isProduction()) throw new Error(`${spoke.name} can't be provisioned: ${missing} is not configured`);
      throw new StepSkipped(`${spoke.name} not configured (${missing}); set it and retry to provision this app`);
    }
    const url = `${base}/api/integration/tenants/${tenant.tid}/provision`;
    const attempts = Number(process.env.TENANCY_PROVISION_POLL_ATTEMPTS) || 20;
    const delay = Number(process.env.TENANCY_PROVISION_POLL_MS) || 3000;
    let last = "";
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await sleep(delay);
      try {
        const r = await spokePost(url, secret, tenantBlock(tenant));
        if (r.status >= 200 && r.status < 300 && r.body?.ok !== false && r.status !== 202) {
          await ctx.log(`${spoke.name}: ${r.body?.created ? "created" : "ready"}`);
          return;
        }
        last = `HTTP ${r.status}${r.body?.message ? ` ${r.body.message}` : ""}`;
        // 202 = still working; 5xx = transient. Anything else is final.
        if (r.status !== 202 && r.status < 500) break;
      } catch (err) {
        last = (err as Error)?.message ?? String(err);
      }
      await ctx.log(`${spoke.name}: waiting (${last})`);
    }
    throw new Error(`${spoke.name} did not provision the school: ${last}`);
  };
}

async function stepSubscription(ctx: RunCtx): Promise<void> {
  const tenant = await tenantOf(ctx);
  const app = ctx.app;
  const pkg = String(app.approved_package ?? app.requested_package ?? tenant.pkg);
  const cycle = (app.billing_cycle ?? "TERM") as "TERM" | "YEAR";
  const [invs] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM Invoice WHERE application_id = ? AND kind = 'NEW' AND status = 'PAID' ORDER BY invoice_id DESC LIMIT 1",
    [ctx.applicationId],
  );
  const inv = invs[0] ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const start = inv?.period_start ? dateOnly(inv.period_start) : today;
  const end = inv?.period_end ? dateOnly(inv.period_end) : addCycle(start, cycle);
  if (inv) await controlPool().query("UPDATE Invoice SET tenant_id = ? WHERE invoice_id = ? AND tenant_id IS NULL", [tenant.tid, inv.invoice_id]);

  const [subs] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM Subscription WHERE tenant_id = ? AND status IN ('ACTIVE','PENDING') ORDER BY (status = 'ACTIVE') DESC, subscription_id DESC LIMIT 1",
    [tenant.tid],
  );
  if (subs[0]?.status === "ACTIVE") {
    await ctx.log(`subscription ${subs[0].subscription_id} already active`);
  } else if (subs[0]) {
    await controlPool().query(
      "UPDATE Subscription SET status = 'ACTIVE', package_code = ?, billing_cycle = ?, period_start = ?, period_end = ?, invoice_id = COALESCE(invoice_id, ?) WHERE subscription_id = ?",
      [pkg, cycle, start, end, inv?.invoice_id ?? null, subs[0].subscription_id],
    );
  } else {
    await controlPool().query(
      "INSERT INTO Subscription (tenant_id, package_code, billing_cycle, period_start, period_end, status, invoice_id) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)",
      [tenant.tid, pkg, cycle, start, end, inv?.invoice_id ?? null],
    );
    await ctx.log(`subscription ${pkg}/${cycle} ${start} .. ${end}`);
  }
  await controlPool().query("UPDATE Tenant SET package_code = ? WHERE tenant_id = ?", [pkg, tenant.tid]);
  await controlPool().query(
    "UPDATE Tenant SET status = 'ACTIVE', activated_at = COALESCE(activated_at, NOW()) WHERE tenant_id = ? AND status = 'PENDING'",
    [tenant.tid],
  );
  await publishTenantChanged(tenant.tid);
  const fresh = await loadApplicationRow(ctx.applicationId);
  if (fresh.status !== "ACTIVE") {
    await transitionApplication(ctx.applicationId, "ACTIVE", { kind: "SYSTEM", id: null }, {
      message: "Your school is live.",
      set: { tenant_id: tenant.tid },
    });
  }
  await platformAudit({ action: "tenant.activate", targetTid: tenant.tid, payload: { applicationId: ctx.applicationId, package: pkg, periodEnd: end } });
}

const SETUP_CHECKLIST = [
  "School profile and logo",
  "Academic year and terms",
  "Programmes, grades, class groups and subjects",
  "Timetable periods",
  "Import staff and students",
  "Roles and access (Access Studio)",
  "Which roles see which apps",
  "Invite parents",
];

async function stepWelcome(ctx: RunCtx): Promise<void> {
  const tenant = await tenantOf(ctx);
  const [accRows] = await controlPool().query<RowDataPacket[]>("SELECT email_norm, full_name FROM ApplicantAccount WHERE account_id = ?", [ctx.app.account_id]);
  const to = accRows[0]?.email_norm ? String(accRows[0].email_norm) : null;
  const link = `/login?tenant=${encodeURIComponent(tenant.slug)}`;
  if (to) {
    const sent = await sendMail(
      to,
      `${tenant.name} is live`,
      `Welcome, ${accRows[0].full_name}. Your school is ready.\n\nSign in with the e-mail and password you registered with, then work through your setup checklist:\n${SETUP_CHECKLIST.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      link,
      "Go to your school",
    );
    await ctx.log(sent ? `welcome e-mail sent to ${to}` : `welcome e-mail not sent (mail unavailable)`);
  }
  await notifyPlatformStaff({
    event: "tenant.live",
    caps: [PLATFORM_CAPS.view],
    title: `${tenant.name} is live`,
    body: `${tenant.slug} on ${tenant.pkg}`,
    link: `/platform/tenants/${tenant.tid}`,
    subjectType: "tenant",
    subjectId: tenant.tid,
  }).catch(() => 0);
}

const STEPS: Record<StepKey, (ctx: RunCtx) => Promise<void>> = {
  TENANT_ROW: stepTenantRow,
  MIS_DB: stepMisDb,
  SUPER_ADMIN: stepSuperAdmin,
  BRANDING: stepBranding,
  APP_TASKMENTOR: spokeStep("APP_TASKMENTOR"),
  APP_TENDO: spokeStep("APP_TENDO"),
  APP_TUPO: spokeStep("APP_TUPO"),
  SUBSCRIPTION: stepSubscription,
  WELCOME: stepWelcome,
};

/** Retry a failed run (platform): resumes from the failed step, attempt + 1. */
export async function retryRun(runId: number, actorId: number | null) {
  const r = await runRow(runId);
  if (r.status !== "FAILED") {
    throw new ConflictError(`Only a failed run can be retried (this one is ${r.status}).`, [
      { code: "INVALID_TRANSITION", machine: "provisioning", from: r.status, to: "RUNNING" },
    ]);
  }
  if (r.application_id === null) throw new ConflictError("This run has no application to resume.");
  await startProvisioning(Number(r.application_id), actorId);
  await platformAudit({ action: "provisioning.retry", actorUserId: actorId, targetTid: r.tenant_id ?? null, payload: { runId } });
  return serializeRun(runId, "platform");
}

/** The latest run of a tenant (TenantDetail.provisioning). */
export async function runForTenant(tid: number) {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT run_id FROM ProvisioningRun WHERE tenant_id = ? ORDER BY run_id DESC LIMIT 1", [tid]);
  return rows[0] ? serializeRun(Number(rows[0].run_id), "platform") : null;
}
