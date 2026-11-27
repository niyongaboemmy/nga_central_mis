/**
 * Tenant lifecycle actions of the primary console (plan §2.2, §6.8) -- WORK PACKAGE D.
 *
 * Every action takes a reason, goes through the "tenant" state machine (409 on
 * an invalid move), writes PlatformAudit and publishes tenant.changed.
 *
 * The primary tenant (NGA) can't be suspended, archived, deleted or moved below
 * the top package (409 PRIMARY_TENANT).
 *
 * Archive / detach: MySQL can't rename a database, so "detach" here means the
 * tenant is ARCHIVED (every gate refuses it), its TenantSystem rows are
 * DISABLED, every session is revoked, and -- when a mysqldump binary is
 * available -- an export of its MIS database is written to TENANCY_EXPORT_DIR
 * (default backend/exports/tenants) and recorded in the audit. The database
 * itself stays until delete.
 *
 * Delete (owner only, typed school name, ARCHIVED only): the MIS database is
 * dropped and the Tenant row is REMOVED (so its slug can be reused), together
 * with its TenantSystem / AccountDirectory / override / usage / setup rows.
 * Subscriptions, invoices, payments, provisioning runs and the PlatformAudit
 * trail are kept as financial and audit records (they carry the tenant id).
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { poolFor } from "../../db/pools";
import { CustomError, NotFoundError, ValidationError } from "../../errors/CustomError";
import { PRIMARY_TENANT_ID, runWithTenant } from "../../vendor/nga-tenancy";
import { dropMisTenantDatabase } from "../../tenancy/provision";
import { getTenant, invalidateTenants } from "../../tenancy/registry";
import { platformAudit } from "../../tenancy/audit";
import { misDbNameFor } from "../../tenancy/dbNames";
import logger from "../../utils/logger";
import { APP_KEYS, PLATFORM_CAPS, isAppKey, kindOfKey } from "./catalog";
import { assertTransition, canTransition } from "./stateMachine";
import { getPlatformSetting } from "./settings";
import { publishTenantChanged, packageRow, reactivateTenantRow, setTenantPackage } from "./subscription";

/** An HTTP error with a typed `code` (errorHandler sends it at the top level). */
export class TenantActionError extends CustomError {
  constructor(status: number, public code: string, message: string) {
    super(message, status);
  }
}

export interface PlatformActorInfo {
  userId: number | null;
  ip?: string | null;
}

export async function tenantRow(tid: number): Promise<RowDataPacket> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM Tenant WHERE tenant_id = ?", [tid]);
  if (!rows[0]) throw new NotFoundError("School not found");
  return rows[0];
}

const isPrimaryRow = (t: RowDataPacket) => Number(t.tenant_id) === PRIMARY_TENANT_ID || Number(t.is_primary) === 1;

function refusePrimary(t: RowDataPacket, what: string) {
  if (isPrimaryRow(t)) throw new TenantActionError(409, "PRIMARY_TENANT", `The primary school can't be ${what}.`);
}

function refuseArchived(t: RowDataPacket, what: string) {
  if (String(t.status) === "ARCHIVED") throw new TenantActionError(409, "INVALID_TRANSITION", `An archived school can't be ${what}.`);
}

function needReason(reason: unknown): string {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length < 3) throw new ValidationError("A reason is required.");
  return r.slice(0, 255);
}

/** Which console actions the tenant's status and the caller's caps allow. */
export function allowedActions(t: RowDataPacket, caps: (cap: string) => boolean) {
  const status = String(t.status);
  const primary = isPrimaryRow(t);
  const out: Array<"suspend" | "reactivate" | "extend_grace" | "archive" | "delete" | "change_package" | "override" | "edit_details"> = [];
  if (caps(PLATFORM_CAPS.lifecycle)) {
    if (status !== "ARCHIVED") out.push("edit_details");
    if (!primary && canTransition("tenant", status, "SUSPENDED")) out.push("suspend");
    if (!primary && (status === "SUSPENDED" || status === "GRACE")) out.push("reactivate");
    if (!primary && status === "GRACE") out.push("extend_grace");
    if (!primary && status === "SUSPENDED") out.push("archive");
    if (!primary && status === "ARCHIVED" && caps(PLATFORM_CAPS.packages)) out.push("delete");
  }
  if (caps(PLATFORM_CAPS.entitlements) && status !== "ARCHIVED") out.push("change_package", "override");
  return out;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * End every session of the school: bump every user's token_version in its DB,
 * then (in the background) back-channel logout to the spokes for each user.
 */
export async function revokeTenantSessions(tid: number): Promise<number> {
  const pool = poolFor(tid);
  const [res]: any = await pool.query("UPDATE `User` SET token_version = token_version + 1");
  const [users] = await pool.query<RowDataPacket[]>("SELECT user_id FROM `User` WHERE status = 'ACTIVE'");
  const tenant = await getTenant(tid).catch(() => null);
  if (tenant && users.length) {
    void (async () => {
      try {
        const { notifyLogout } = await import("../sso/backchannelLogout");
        await runWithTenant(tenant, async () => {
          for (const u of users) await notifyLogout(Number(u.user_id), { retryDelays: [] }).catch(() => undefined);
        });
      } catch (err) {
        logger.warn(`[tenantMgmt] back-channel logout for t${tid} failed: ${(err as Error)?.message ?? err}`);
      }
    })();
  }
  return Number(res?.affectedRows ?? 0);
}

// ---------------------------------------------------------------------------
// Status moves
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// School details (name, legal name, timezone, country)
// ---------------------------------------------------------------------------

export interface TenantDetailsInput {
  name?: unknown;
  legalName?: unknown;
  timezone?: unknown;
  country?: unknown;
  reason?: unknown;
}

const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/**
 * Edit a school's identity. The slug is not editable: it is the school's address and its
 * databases are named after it. A rename also renames the school's own School row when that
 * row still carries the old name (a name the school set itself is left alone), drops the
 * registry cache and tells the other apps, so branding and sign-in pages follow at once.
 */
export async function updateTenantDetails(tid: number, input: TenantDetailsInput, actor: PlatformActorInfo) {
  const why = needReason(input.reason);
  const t = await tenantRow(tid);
  refuseArchived(t, "edited");

  const next: Record<string, string | null> = {};
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    if (name.length < 3 || name.length > 150) throw new ValidationError("The school name must be 3 to 150 characters.");
    next.display_name = name;
  }
  if (input.legalName !== undefined) {
    const legal = typeof input.legalName === "string" ? input.legalName.trim().replace(/\s+/g, " ") : "";
    if (legal.length > 200) throw new ValidationError("The legal name can be at most 200 characters.");
    next.legal_name = legal || null;
  }
  if (input.timezone !== undefined) {
    const tz = typeof input.timezone === "string" ? input.timezone.trim() : "";
    if (!tz || tz.length > 64 || !validTimezone(tz)) throw new ValidationError("Choose a valid timezone, e.g. Africa/Kigali.");
    next.timezone = tz;
  }
  if (input.country !== undefined) {
    const c = typeof input.country === "string" ? input.country.trim().toUpperCase() : "";
    if (c && !/^[A-Z]{2}$/.test(c)) throw new ValidationError("The country is a two-letter code, e.g. RW.");
    next.country = c || null;
  }

  const changed = Object.keys(next).filter((k) => (next[k] ?? null) !== (t[k] === undefined || t[k] === null ? null : String(t[k])));
  if (!changed.length) throw new ValidationError("Nothing changed.");

  if (next.display_name && changed.includes("display_name")) {
    const [dupes] = await controlPool().query<RowDataPacket[]>(
      "SELECT tenant_id FROM Tenant WHERE tenant_id <> ? AND status <> 'ARCHIVED' AND LOWER(TRIM(display_name)) = LOWER(?) LIMIT 1",
      [tid, next.display_name],
    );
    if (dupes.length) throw new TenantActionError(409, "NAME_TAKEN", "Another school already has this name.");
  }

  await controlPool().query(`UPDATE Tenant SET ${changed.map((k) => `\`${k}\` = ?`).join(", ")} WHERE tenant_id = ?`, [...changed.map((k) => next[k]), tid]);
  invalidateTenants();

  // Keep the school's own School row in step (only for a provisioned, non-primary school;
  // the primary tenant's School rows are its campuses and belong to it).
  let schoolRowSynced = false;
  if (!isPrimaryRow(t) && t.mis_db_name) {
    try {
      const pool = poolFor(tid);
      const [cols] = await pool.query<RowDataPacket[]>(
        "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'School'",
      );
      const has = new Set(cols.map((r) => String(r.c)));
      const set: string[] = [];
      const vals: unknown[] = [];
      if (changed.includes("display_name")) {
        set.push("name = IF(name = ?, ?, name)");
        vals.push(String(t.display_name), next.display_name);
        if (has.has("email_from_name")) {
          set.push("email_from_name = IF(email_from_name = ? OR email_from_name IS NULL, ?, email_from_name)");
          vals.push(String(t.display_name), next.display_name);
        }
      }
      if (changed.includes("timezone") && has.has("timezone")) {
        set.push("timezone = ?");
        vals.push(next.timezone);
      }
      if (set.length) {
        const [r]: any = await pool.query(`UPDATE School SET ${set.join(", ")} WHERE school_id = ?`, [...vals, tid]);
        schoolRowSynced = Number(r?.changedRows ?? 0) > 0;
      }
    } catch (err) {
      logger.warn(`[tenantMgmt] School row sync for t${tid} failed: ${(err as Error)?.message ?? err}`);
    }
  }

  await publishTenantChanged(tid);
  const before = Object.fromEntries(changed.map((k) => [k, t[k] ?? null]));
  const after = Object.fromEntries(changed.map((k) => [k, next[k]]));
  await platformAudit({ action: "tenant.details", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { reason: why, before, after, schoolRowSynced } });
  return { changed, schoolRowSynced };
}

export async function suspendTenant(tid: number, reason: unknown, actor: PlatformActorInfo, opts: { system?: boolean } = {}) {
  const why = opts.system ? String(reason) : needReason(reason);
  const t = await tenantRow(tid);
  refusePrimary(t, "suspended");
  assertTransition("tenant", String(t.status), "SUSPENDED");
  await controlPool().query("UPDATE Tenant SET status = 'SUSPENDED', suspended_at = NOW(), status_reason = ? WHERE tenant_id = ?", [why, tid]);
  invalidateTenants();
  const revoked = await revokeTenantSessions(tid).catch((err) => {
    logger.warn(`[tenantMgmt] session revoke for t${tid} failed: ${(err as Error)?.message ?? err}`);
    return 0;
  });
  await publishTenantChanged(tid);
  await platformAudit({ action: "tenant.suspend", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { reason: why, from: t.status, sessionsRevoked: revoked } });
}

export async function reactivateTenant(tid: number, reason: unknown, actor: PlatformActorInfo) {
  const why = needReason(reason);
  const t = await tenantRow(tid);
  refusePrimary(t, "reactivated");
  if (String(t.status) === "ACTIVE") throw new TenantActionError(409, "INVALID_TRANSITION", "This school is already active.");
  // Only a school in grace or suspended comes back: a PENDING one is still being set up.
  if (!["GRACE", "SUSPENDED"].includes(String(t.status))) {
    throw new TenantActionError(409, "INVALID_TRANSITION", `A ${String(t.status).toLowerCase()} school can't be reactivated.`);
  }
  await reactivateTenantRow(tid, why);
  await publishTenantChanged(tid);
  await platformAudit({ action: "tenant.reactivate", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { reason: why, from: t.status } });
}

export async function extendGrace(tid: number, days: unknown, reason: unknown, actor: PlatformActorInfo) {
  const why = needReason(reason);
  const n = Number(days);
  if (!Number.isInteger(n) || n < 1 || n > 365) throw new ValidationError("Days must be a whole number from 1 to 365.");
  const t = await tenantRow(tid);
  refusePrimary(t, "given a grace period");
  if (String(t.status) !== "GRACE") throw new TenantActionError(409, "INVALID_TRANSITION", "Only a school in its grace period can have it extended.");
  await controlPool().query(
    "UPDATE Tenant SET grace_until = DATE_ADD(GREATEST(COALESCE(grace_until, NOW()), NOW()), INTERVAL ? DAY), status_reason = ? WHERE tenant_id = ?",
    [n, why, tid],
  );
  await publishTenantChanged(tid);
  await platformAudit({ action: "tenant.extend_grace", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { reason: why, days: n } });
}

function findMysqldump(): string | null {
  const candidates = [process.env.MYSQLDUMP_PATH, "/usr/bin/mysqldump", "/usr/local/bin/mysqldump", "/opt/homebrew/bin/mysqldump", "/Applications/MAMP/Library/bin/mysqldump"];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return null;
}

/** mysqldump of the tenant's MIS database; null when no binary is available. */
export async function exportTenantDatabase(tid: number): Promise<{ path: string; bytes: number } | null> {
  const bin = findMysqldump();
  if (!bin) return null;
  const db = misDbNameFor(tid);
  const dir = process.env.TENANCY_EXPORT_DIR || path.resolve(__dirname, "../../../exports/tenants");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `mis_t${tid}_${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
  const out = fs.createWriteStream(file);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      bin,
      ["--single-transaction", "--routines", "--protocol=TCP", `--host=${process.env.DB_HOST || "localhost"}`, `--port=${process.env.DB_PORT || "3306"}`, `--user=${process.env.DB_USERNAME || "root"}`, db],
      { env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD || "" } },
    );
    let err = "";
    child.stdout.pipe(out);
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`mysqldump exited ${code}: ${err.slice(0, 300)}`))));
  }).finally(() => out.close());
  return { path: file, bytes: fs.statSync(file).size };
}

export async function archiveTenant(tid: number, reason: unknown, actor: PlatformActorInfo) {
  const why = needReason(reason);
  const t = await tenantRow(tid);
  refusePrimary(t, "archived");
  assertTransition("tenant", String(t.status), "ARCHIVED");
  let exported: { path: string; bytes: number } | null = null;
  let exportError: string | null = null;
  try {
    exported = await exportTenantDatabase(tid);
  } catch (err) {
    exportError = (err as Error)?.message ?? String(err);
    logger.warn(`[tenantMgmt] export of t${tid} failed: ${exportError}`);
  }
  await controlPool().query("UPDATE Tenant SET status = 'ARCHIVED', archived_at = NOW(), status_reason = ? WHERE tenant_id = ?", [why, tid]);
  await controlPool().query("UPDATE TenantSystem SET status = 'DISABLED' WHERE tenant_id = ?", [tid]);
  invalidateTenants();
  await revokeTenantSessions(tid).catch(() => 0);
  await publishTenantChanged(tid);
  await platformAudit({
    action: "tenant.archive",
    actorUserId: actor.userId,
    ip: actor.ip ?? null,
    targetTid: tid,
    payload: { reason: why, export: exported, exportSkipped: exported ? null : exportError ?? "mysqldump not available" },
  });
}

export async function deleteTenant(tid: number, confirmName: unknown, actor: PlatformActorInfo) {
  const t = await tenantRow(tid);
  refusePrimary(t, "deleted");
  if (String(t.status) !== "ARCHIVED") throw new TenantActionError(409, "INVALID_TRANSITION", "Only an archived school can be deleted.");
  const typed = typeof confirmName === "string" ? confirmName.trim().toLowerCase() : "";
  if (!typed || typed !== String(t.display_name).trim().toLowerCase()) {
    throw new ValidationError("Type the school's name exactly to confirm.");
  }
  await getTenant(tid).catch(() => null); // loads its database name
  await dropMisTenantDatabase(tid);
  for (const table of ["TenantSystem", "AccountDirectory", "TenantEntitlementOverride", "TenantUsageDaily", "TenantUsageCounter", "TenantSetupState", "SupportSession"]) {
    await controlPool().query(`DELETE FROM \`${table}\` WHERE tenant_id = ?`, [tid]).catch(() => undefined);
  }
  await controlPool().query("DELETE FROM Tenant WHERE tenant_id = ?", [tid]);
  invalidateTenants();
  await publishTenantChanged(tid);
  await platformAudit({
    action: "tenant.delete",
    actorUserId: actor.userId,
    ip: actor.ip ?? null,
    targetTid: tid,
    payload: { slug: t.slug, name: t.display_name, package: t.package_code, archivedAt: t.archived_at },
  });
}

// ---------------------------------------------------------------------------
// Package, overrides, apps
// ---------------------------------------------------------------------------

const topTier = async (): Promise<number> => {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT MAX(tier) AS t FROM Package WHERE is_active = 1");
  return Number(rows[0]?.t ?? 0);
};

export async function changeTenantPackage(tid: number, code: unknown, reason: unknown, actor: PlatformActorInfo) {
  const why = needReason(reason);
  const pkgCode = typeof code === "string" ? code.trim().toLowerCase() : "";
  const pkg = pkgCode ? await packageRow(pkgCode) : null;
  if (!pkg || Number(pkg.is_active) !== 1) throw new ValidationError("Unknown or inactive package.");
  const t = await tenantRow(tid);
  if (String(t.status) === "ARCHIVED") throw new TenantActionError(409, "INVALID_TRANSITION", "An archived school's package can't change.");
  if (isPrimaryRow(t) && Number(pkg.tier) < (await topTier())) {
    throw new TenantActionError(409, "PRIMARY_TENANT", "The primary school stays on the top package.");
  }
  const from = String(t.package_code);
  await setTenantPackage(tid, pkgCode);
  // The operator's choice wins: a change the school asked for earlier must not re-apply later.
  await controlPool()
    .query("UPDATE SubscriptionChange SET status = 'CANCELLED' WHERE tenant_id = ? AND status IN ('PENDING','SCHEDULED')", [tid])
    .catch((err) => logger.warn(`[tenantMgmt] cancel pending changes t${tid}: ${(err as Error)?.message ?? err}`));
  await publishTenantChanged(tid, { packageChanged: from !== pkgCode });
  await platformAudit({ action: "tenant.package", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { reason: why, from, to: pkgCode } });
}

export async function addOverride(
  tid: number,
  body: { key?: unknown; value?: unknown; enabled?: unknown; reason?: unknown; expiresAt?: unknown },
  actor: PlatformActorInfo,
) {
  const why = needReason(body.reason);
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const kind = kindOfKey(key);
  if (!kind) throw new ValidationError("Unknown entitlement key.");
  const enabled = body.enabled === undefined ? true : body.enabled === true || body.enabled === "true" || body.enabled === 1;
  let value: number | null = null;
  if (kind === "LIMIT" && body.value !== null && body.value !== undefined && body.value !== "") {
    value = Number(body.value);
    if (!Number.isInteger(value) || value < 0) throw new ValidationError("A limit must be a whole number (or empty for unlimited).");
  }
  let expires: Date | null = null;
  if (body.expiresAt) {
    expires = new Date(String(body.expiresAt));
    if (Number.isNaN(expires.getTime())) throw new ValidationError("expiresAt must be a date.");
    if (expires.getTime() <= Date.now()) throw new ValidationError("The expiry date must be in the future.");
  }
  const t = await tenantRow(tid);
  refuseArchived(t, "given overrides");
  if (isPrimaryRow(t) && (!enabled || (kind === "LIMIT" && value !== null))) {
    throw new TenantActionError(409, "PRIMARY_TENANT", "The primary school's entitlements can't be reduced.");
  }
  const [res]: any = await controlPool().query(
    "INSERT INTO TenantEntitlementOverride (tenant_id, ent_key, value_int, enabled, reason, expires_at, granted_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [tid, key, value, enabled ? 1 : 0, why, expires, actor.userId],
  );
  await publishTenantChanged(tid, { packageChanged: isAppKey(key) });
  await platformAudit({ action: "tenant.override.add", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { id: res.insertId, key, value, enabled, reason: why, expiresAt: expires } });
  return Number(res.insertId);
}

export async function removeOverride(tid: number, overrideId: number, actor: PlatformActorInfo) {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM TenantEntitlementOverride WHERE id = ? AND tenant_id = ?", [overrideId, tid]);
  if (!rows[0]) throw new NotFoundError("Override not found");
  refuseArchived(await tenantRow(tid), "changed");
  await controlPool().query("DELETE FROM TenantEntitlementOverride WHERE id = ?", [overrideId]);
  await publishTenantChanged(tid, { packageChanged: isAppKey(String(rows[0].ent_key)) });
  await platformAudit({ action: "tenant.override.remove", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { id: overrideId, key: rows[0].ent_key } });
}

/** An operator's TenantSystem OVERRIDE row (never touched by package derivation). */
/**
 * Switch a module on or off for one school, by hand (source OVERRIDE: it stays as
 * set whatever the package says, until the platform changes it again).
 *
 * The primary school is managed the same way as any other: since Systems are
 * assigned per school (tenancy/systems.ts) it no longer "has every app".
 */
export async function setTenantApp(tid: number, systemId: number, status: unknown, actor: PlatformActorInfo) {
  if (status !== "ACTIVE" && status !== "DISABLED") throw new ValidationError("status must be ACTIVE or DISABLED.");
  if (!Number.isInteger(systemId) || systemId <= 0) throw new ValidationError("Choose an app.");
  const t = await tenantRow(tid);
  // Archive switched every app off; turning one back on would undo it.
  refuseArchived(t, "given apps");
  const { moduleById } = await import("./modules");
  const module = await moduleById(systemId);
  await controlPool().query(
    "INSERT INTO TenantSystem (tenant_id, system_id, status, source) VALUES (?, ?, ?, 'OVERRIDE') ON DUPLICATE KEY UPDATE status = VALUES(status), source = 'OVERRIDE'",
    [tid, systemId, status],
  );
  await publishTenantChanged(tid);
  await platformAudit({ action: "tenant.app", actorUserId: actor.userId, ip: actor.ip ?? null, targetTid: tid, payload: { systemId, name: module.name, status } });
}

/**
 * Switch a module on or off for several schools at once (Modules -> a module's
 * schools, and "which schools" when a module is created). Archived schools are
 * skipped. Returns the tenant ids changed.
 */
export async function setModuleForSchools(systemId: number, tids: number[], status: unknown, actor: PlatformActorInfo): Promise<number[]> {
  if (status !== "ACTIVE" && status !== "DISABLED") throw new ValidationError("status must be ACTIVE or DISABLED.");
  const { moduleById } = await import("./modules");
  const module = await moduleById(systemId);
  if (!tids.length) return [];
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id FROM Tenant WHERE tenant_id IN (?) AND status <> 'ARCHIVED'", [tids]);
  const done: number[] = [];
  for (const r of rows) {
    const tid = Number(r.tenant_id);
    await controlPool().query(
      "INSERT INTO TenantSystem (tenant_id, system_id, status, source) VALUES (?, ?, ?, 'OVERRIDE') ON DUPLICATE KEY UPDATE status = VALUES(status), source = 'OVERRIDE'",
      [tid, systemId, status],
    );
    await publishTenantChanged(tid);
    done.push(tid);
  }
  await platformAudit({ action: "module.schools", actorUserId: actor.userId, ip: actor.ip ?? null, payload: { systemId, name: module.name, status, tids: done } });
  return done;
}

// ---------------------------------------------------------------------------
// Automatic moves (jobs)
// ---------------------------------------------------------------------------

/** ACTIVE -> GRACE (subscription period ended). */
export async function enterGrace(tid: number, periodEnd: string): Promise<boolean> {
  const t = await tenantRow(tid);
  if (isPrimaryRow(t) || String(t.status) !== "ACTIVE") return false;
  const days = Number(await getPlatformSetting("grace.days")) || 14;
  await controlPool().query(
    "UPDATE Tenant SET status = 'GRACE', grace_until = DATE_ADD(?, INTERVAL ? DAY), status_reason = 'Subscription expired' WHERE tenant_id = ? AND status = 'ACTIVE'",
    [`${periodEnd} 23:59:59`, days, tid],
  );
  await controlPool().query("UPDATE Subscription SET status = 'EXPIRED' WHERE tenant_id = ? AND status = 'ACTIVE' AND period_end <= ?", [tid, periodEnd]);
  await publishTenantChanged(tid);
  await platformAudit({ action: "tenant.grace", targetTid: tid, payload: { periodEnd, graceDays: days } });
  return true;
}

