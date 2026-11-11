/**
 * Entitlement engine wiring (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §3, §4, §11 M1, §12).
 *
 * A test-only school ("te-<stamp>") is a control-plane tenant whose MIS database IS the
 * test database: it is a real non-primary tenant for the snapshot compiler, the SSO
 * checks and the gates, without provisioning another database (the local MAMP MySQL
 * runs out of file handles, see multiTenancy.test.ts). Tenant 1 is switched to Gold and
 * back for the M1 exit criterion and always restored to Max.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import emailService from "../utils/email";
import jwt from "jsonwebtoken";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import app from "../app";
import { db, primaryDb } from "../db";
import { controlPool } from "../db/platform";
import { AccessGrant, AccessRolePermission } from "../db/accessSchema";
import { Role, RoleSystemFragment, School, System } from "../db/schema";
import { TenantCtx, runWithTenant } from "../vendor/nga-tenancy";
import { assignSystem, bootstrapPlatform, createTenantRow, getTenant, invalidateTenants } from "../tenancy";
import { compileSnapshot } from "../services/access/compile";
import { clearSnapshotCache } from "../services/access/snapshotCache";
import { runAccessBootstrap } from "../services/access/registry";
import { getEffectivePermissions } from "../utils/auth";
import { getPublicSystems } from "../utils/publicSystems";
import { invalidateEntitlements, resolveEntitlements } from "../services/tenantMgmt/entitlements";
import { onEntitlementsChanged } from "../services/tenantMgmt/entitlementsChanged";
import { deriveTenantSystems } from "../services/tenantMgmt/tenantSystems";
import {
  PackageLimitError,
  checkPeopleLimit,
  consumeOrThrow,
  consumeTenantLimit,
  resetEntitlementFallback,
  warnOwnersOnce,
} from "../services/tenantMgmt/featureGate";
import { consumeAiRequest } from "../services/aiProviders/limiter";
import { PLATFORM_CAP_LIST } from "../services/tenantMgmt/catalog";
import { assignRole, createRoleWithPermissions, createUser } from "../test/fixtures";

const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const SLUG = `te-${stamp.slice(-9)}`;
const TID = 7000 + Math.floor(Math.random() * 900);
let school: TenantCtx;
let primary: TenantCtx;

const tokenFor = (userId: number, tid: number) =>
  jwt.sign({ userId, tokenVersion: 0, tid }, process.env.JWT_SECRET!, { expiresIn: "1h" });

/** The capability row (app, key), created when the cloned catalog lacks it. */
async function ensureCap(app: string, key: string, kind: "READ" | "WRITE" = "WRITE"): Promise<number> {
  const name = app === "mis" ? key : `${app}:${key}`;
  const find = async () =>
    ((await db.execute(sql`SELECT perm_id FROM Permission WHERE name = ${name} LIMIT 1`)) as any)[0][0]?.perm_id as number | undefined;
  let id = await find();
  if (!id) {
    await db.execute(sql`
      INSERT INTO Permission (name, description, status, app, cap_key, label, domain, kind, depths, restricted, scopeable)
      VALUES (${name}, ${name}, 'ACTIVE', ${app}, ${key}, ${name}, 'SYSTEM', ${kind}, ${kind === "READ" ? "summary,detail" : null}, 0, 0)`);
    id = await find();
  }
  await db.execute(sql`UPDATE Permission SET status = 'ACTIVE', deprecated_at = NULL, app = ${app}, cap_key = ${key} WHERE perm_id = ${id}`);
  return id!;
}

/** A role holding exactly these capabilities, granted school-wide to a new user. */
async function personWith(caps: Array<[string, string]>, userType: "TEACHER" | "ADMIN" = "TEACHER") {
  const roleId = await createRoleWithPermissions("TE_ROLE", []);
  for (const [app, key] of caps) {
    const permId = await ensureCap(app, key, key === "PLATFORM_TENANTS_VIEW" ? "READ" : "WRITE");
    await db.insert(AccessRolePermission).values({ role_id: roleId, perm_id: permId, depth: null }).catch(() => undefined);
  }
  const userId = await createUser({ userType });
  await db.insert(AccessGrant).values({ user_id: userId, role_id: roleId, scope_type: "SCHOOL", source: "MANUAL", status: "ACTIVE" });
  return { userId, roleId };
}

async function setPackage(tid: number, pkg: string) {
  await controlPool().query("UPDATE Tenant SET package_code = ? WHERE tenant_id = ?", [pkg, tid]);
  await onEntitlementsChanged(tid);
}

const capsOf = async (tenant: TenantCtx, userId: number, appKey: string) =>
  Object.keys((await runWithTenant(tenant, () => compileSnapshot(userId, appKey))).caps);

const MATRIX_CAPS: Array<[string, string]> = [
  ["mis", "MANAGE_USERS"],
  ["mis", "MANAGE_COURSE_CONTENT"],
  ["mis", "MANAGE_MENTOR_ASSIGNMENTS"],
  ["mis", "OFFICE_HOURS_CONFIGURE"],
  ["mis", "CODE_PLAYGROUND_USE"],
  ["mis", "AI_PERSONAL_PROVIDERS"],
  ["mis", "AI_EXTERNAL_CONNECT"],
  ["mis", "PLATFORM_TENANTS_VIEW"],
  ["tm", "QUIZZES_VIEW"],
  ["tm", "QUIZ_QUESTIONS_RUN_CODE"],
  ["tm", "AI_PREMIUM"],
  ["tm", "PROCTORING_START_SESSION"],
  ["tm", "GRADING_MANUAL_ASSESS"],
  ["tupo", "MESSAGE_SEND"],
  ["tupo", "MEET_START"],
  ["tupo", "FEED_POST"],
];

/** Which packages (from the seeded catalogue, migrations/platform/002) include each capability. */
const EXPECTED: Record<string, string[]> = {
  "mis:MANAGE_USERS": ["starter", "gold", "premium", "max"],
  "mis:MANAGE_COURSE_CONTENT": ["gold", "premium", "max"],
  "mis:MANAGE_MENTOR_ASSIGNMENTS": ["gold", "premium", "max"],
  "mis:OFFICE_HOURS_CONFIGURE": ["premium", "max"],
  "mis:CODE_PLAYGROUND_USE": ["premium", "max"],
  "mis:AI_PERSONAL_PROVIDERS": ["premium", "max"],
  "mis:AI_EXTERNAL_CONNECT": ["max"],
  "mis:PLATFORM_TENANTS_VIEW": [], // never outside the primary
  "tm:QUIZZES_VIEW": ["gold", "premium", "max"],
  "tm:QUIZ_QUESTIONS_RUN_CODE": ["premium", "max"],
  "tm:AI_PREMIUM": ["premium", "max"],
  "tm:PROCTORING_START_SESSION": ["premium", "max"],
  "tm:GRADING_MANUAL_ASSESS": ["premium", "max"],
  "tupo:MESSAGE_SEND": ["gold", "premium", "max"],
  "tupo:MEET_START": ["premium", "max"],
  "tupo:FEED_POST": ["premium", "max"],
};

let matrixUser: number;

beforeAll(async () => {
  // The test env really reaches SMTP: never send (account e-mails, owner warnings).
  vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);
  await bootstrapPlatform();
  invalidateTenants();
  if (!(await getTenant(TID))) {
    // The second school reuses this test database; tenant 1 never reads its mis_db_name
    // (misDbNameFor answers env DB_NAME), so free the unique name for it.
    await controlPool().query("UPDATE Tenant SET mis_db_name = NULL WHERE tenant_id = 1");
    await createTenantRow({ slug: SLUG, name: "TE School", tid: TID, status: "ACTIVE", pkg: "starter", misDbName: process.env.DB_NAME });
  }
  invalidateTenants();
  school = (await getTenant(TID))!;
  primary = (await getTenant(1))!;
  expect(school.isPrimary).toBe(false);
  await controlPool().query("UPDATE Tenant SET package_code = 'max' WHERE tenant_id = 1");
  invalidateEntitlements();
  matrixUser = (await personWith(MATRIX_CAPS)).userId;
}, 120_000);

afterAll(async () => {
  await controlPool().query("UPDATE Tenant SET package_code = 'max' WHERE tenant_id = 1");
  for (const table of ["TenantSystem", "TenantEntitlementOverride", "TenantUsageCounter", "TenantUsageDaily"]) {
    await controlPool().query(`DELETE FROM ${table} WHERE tenant_id = ?`, [TID]).catch(() => undefined);
  }
  await controlPool().query("DELETE FROM Tenant WHERE tenant_id = ?", [TID]).catch(() => undefined);
  invalidateTenants();
  invalidateEntitlements();
  clearSnapshotCache();
});

// ---------------------------------------------------------------------------
describe("snapshot: package x app matrix", () => {
  for (const pkg of ["starter", "gold", "premium", "max"]) {
    it(`${pkg}: mis, tm and tupo hold exactly the package's capabilities`, async () => {
      await setPackage(TID, pkg);
      const have = new Set<string>();
      for (const appKey of ["mis", "tm", "tupo"]) {
        for (const c of await capsOf(school, matrixUser, appKey)) have.add(`${appKey}:${c}`);
      }
      for (const [cap, pkgs] of Object.entries(EXPECTED)) {
        expect(have.has(cap), `${pkg} ${cap}`).toBe(pkgs.includes(pkg));
      }
      const snap = await runWithTenant(school, () => compileSnapshot(matrixUser, "mis"));
      expect(snap.tenant).toMatchObject({ tid: TID, slug: SLUG, pkg, status: "ACTIVE" });
      expect(snap.tenant!.apps.includes("app.taskmentor")).toBe(pkg !== "starter");
      expect(snap.tenant!.limits["limit.students"]).toBe({ starter: 300, gold: 1000, premium: 2500, max: null }[pkg]);
      // The cross-app compile ("*", MIS's own delegation checks) obeys the same rule.
      const all = Object.keys((await runWithTenant(school, () => compileSnapshot(matrixUser, "*"))).caps);
      expect(all.includes("tm:QUIZ_QUESTIONS_RUN_CODE")).toBe(pkg === "premium" || pkg === "max");
    });
  }

  it("never gives PLATFORM_* outside the primary, even on Max with a role holding them all", async () => {
    await setPackage(TID, "max");
    const { userId } = await personWith(PLATFORM_CAP_LIST.map((c) => ["mis", c] as [string, string]));
    expect((await capsOf(school, userId, "mis")).filter((c) => c.startsWith("PLATFORM_"))).toEqual([]);
    expect((await capsOf(primary, userId, "mis")).filter((c) => c.startsWith("PLATFORM_")).sort()).toEqual([...PLATFORM_CAP_LIST].sort());
  });
});

// ---------------------------------------------------------------------------
describe("M1 exit: tenant 1 on Gold hides Lesson Studio and the code runner, Max restores them", () => {
  const GATED = ["mis:AI_PERSONAL_PROVIDERS", "mis:CODE_PLAYGROUND_USE", "tm:QUIZ_QUESTIONS_RUN_CODE", "tm:AI_PREMIUM"];
  const held = async () => {
    const out = new Set<string>();
    for (const appKey of ["mis", "tm"]) for (const c of await capsOf(primary, matrixUser, appKey)) out.add(`${appKey}:${c}`);
    return out;
  };

  it("switches without any app code change", async () => {
    try {
      await setPackage(1, "gold");
      const gold = await held();
      for (const c of GATED) expect(gold.has(c), c).toBe(false);
      expect(gold.has("tm:QUIZZES_VIEW")).toBe(true);
      expect(gold.has("mis:PLATFORM_TENANTS_VIEW")).toBe(true); // primary keeps platform powers on any package

      // Legacy outputs (req.user.permissions, the SSO token list) obey the package too.
      const legacy = await createUser();
      await assignRole(legacy, await createRoleWithPermissions("TE_LEGACY", ["CODE_PLAYGROUND_USE", "VIEW_USERS"]));
      const goldPerms = await runWithTenant(primary, () => getEffectivePermissions(legacy));
      expect(goldPerms).not.toContain("CODE_PLAYGROUND_USE");

      await setPackage(1, "max");
      const max = await held();
      for (const c of GATED) expect(max.has(c), c).toBe(true);
      expect(await runWithTenant(primary, () => getEffectivePermissions(legacy))).toContain("CODE_PLAYGROUND_USE");
    } finally {
      await setPackage(1, "max");
    }
  });
});

// ---------------------------------------------------------------------------
describe("apps: TenantSystem derivation, SSO and the systems list", () => {
  let tmSystem: number;
  let redirect: string;
  let person: number;

  beforeAll(async () => {
    const [existing] = await primaryDb().select().from(System).where(eq(System.client_id, "taskmentor_app")).limit(1);
    if (existing) {
      tmSystem = existing.system_id;
      redirect = String(existing.allowed_redirect_uris ?? "").split(",")[0].trim();
      if (existing.status !== "ACTIVE") await primaryDb().update(System).set({ status: "ACTIVE" }).where(eq(System.system_id, tmSystem));
    }
    if (!existing || !redirect) {
      if (!existing) {
        const [res] = (await primaryDb().insert(System).values({
          name: "Task Mentor", client_id: "taskmentor_app", client_secret: "x", allowed_redirect_uris: "http://localhost/tm-cb",
          icon_url: "x", home_url: "http://localhost", status: "ACTIVE",
        } as any)) as any;
        tmSystem = res.insertId;
      } else {
        await primaryDb().update(System).set({ allowed_redirect_uris: "http://localhost/tm-cb" }).where(eq(System.system_id, tmSystem));
      }
      redirect = "http://localhost/tm-cb";
    }
    person = await createUser();
  });

  const authorize = () =>
    request(app)
      .get(`/sso/authorize?client_id=taskmentor_app&redirect_uri=${encodeURIComponent(redirect)}&response_type=code`)
      .set("Authorization", `Bearer ${tokenFor(person, TID)}`)
      .set("User-Agent", "Mozilla/5.0");

  it("derives PACKAGE rows from APP entitlements and never touches OVERRIDE rows", async () => {
    await controlPool().query("DELETE FROM TenantSystem WHERE tenant_id = ?", [TID]);
    await setPackage(TID, "gold"); // onEntitlementsChanged derives
    const row = async () =>
      ((await controlPool().query("SELECT status, source FROM TenantSystem WHERE tenant_id = ? AND system_id = ?", [TID, tmSystem])) as any)[0][0];
    expect(await row()).toMatchObject({ status: "ACTIVE", source: "PACKAGE" });
    expect(await deriveTenantSystems(TID)).toEqual({ assigned: 0, disabled: 0 }); // idempotent

    await setPackage(TID, "starter");
    expect(await row()).toMatchObject({ status: "DISABLED", source: "PACKAGE" });

    await assignSystem(TID, tmSystem, "OVERRIDE");
    await setPackage(TID, "gold");
    await setPackage(TID, "starter");
    expect(await row()).toMatchObject({ status: "ACTIVE", source: "OVERRIDE" });
  });

  it("SSO refuses an app outside the package even when assigned, and allows it once entitled", async () => {
    await setPackage(TID, "starter");
    await assignSystem(TID, tmSystem, "OVERRIDE");
    const refused = await authorize();
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("APP_NOT_IN_PACKAGE");
    expect((await getPublicSystems(school)).some((s) => s.system_id === tmSystem)).toBe(false);

    await setPackage(TID, "gold");
    const ok = await authorize();
    expect(ok.status).toBe(200);
    expect(String(ok.body.data.code).startsWith(`${TID}.`)).toBe(true);
    expect((await getPublicSystems(school)).some((s) => s.system_id === tmSystem)).toBe(true);

    await controlPool().query("UPDATE TenantSystem SET status = 'DISABLED' WHERE tenant_id = ? AND system_id = ?", [TID, tmSystem]);
    const unassigned = await authorize();
    expect(unassigned.status).toBe(403);
    expect(unassigned.body.code).toBe("SYSTEM_NOT_ASSIGNED");
  });

  it("lists a role-assigned app only for holders of one of its roles; unassigned apps for everyone", async () => {
    const clientA = `te-a-${stamp}`;
    const clientB = `te-b-${stamp}`;
    const mk = async (client_id: string) =>
      ((await primaryDb().insert(System).values({
        name: client_id, client_id, client_secret: "x", allowed_redirect_uris: "http://localhost", icon_url: "x", home_url: "x", status: "ACTIVE",
      } as any)) as any)[0].insertId as number;
    const a = await mk(clientA);
    const b = await mk(clientB);
    await assignSystem(TID, a);
    await assignSystem(TID, b);
    let [anySchool] = await db.select({ id: School.school_id }).from(School).limit(1);
    if (!anySchool) {
      // The cloned test schema carries no rows: give the fragment a school to hang on.
      const [r] = (await db.insert(School).values({ name: "TE School", school_code: "TE", status: "ACTIVE" } as any)) as any;
      anySchool = { id: Number(r.insertId) };
    }
    const roleId = await createRoleWithPermissions("TE_FRAG", []);
    await db.insert(RoleSystemFragment).values({ school_id: anySchool.id, role_id: roleId, system_id: a });
    const holder = await createUser();
    await assignRole(holder, roleId);
    const other = await createUser();

    const ids = async (userId?: number) => (await getPublicSystems(school, userId)).map((s) => s.system_id);
    expect(await ids(holder)).toEqual(expect.arrayContaining([a, b]));
    expect(await ids(other)).toContain(b);
    expect(await ids(other)).not.toContain(a);
    expect(await ids()).toEqual(expect.arrayContaining([a, b])); // no user: the school's list

    await db.delete(RoleSystemFragment).where(and(eq(RoleSystemFragment.role_id, roleId), eq(RoleSystemFragment.system_id, a)));
    await primaryDb().update(System).set({ status: "DISABLED" }).where(eq(System.system_id, a));
    await primaryDb().update(System).set({ status: "DISABLED" }).where(eq(System.system_id, b));
  });
});

// ---------------------------------------------------------------------------
describe("limits", () => {
  let manager: number;
  let studentRole: number;

  beforeAll(async () => {
    manager = (await personWith([["mis", "MANAGE_USERS"], ["mis", "ACCESS_STUDIO_VIEW"]], "ADMIN")).userId;
    await assignRole(manager, await createRoleWithPermissions("TE_MANAGER", ["MANAGE_USERS", "CODE_PLAYGROUND_USE"]));
    const [role] = await db.select({ id: Role.role_id }).from(Role).where(eq(Role.name, "STUDENT")).limit(1);
    // Exactly "STUDENT": the create path reads the new person's type from the role name
    // (createRoleWithPermissions would add a unique suffix and make it a staff role).
    if (role) studentRole = role.id;
    else {
      const [[max]] = (await db.execute(sql`SELECT COALESCE(MAX(role_id), 0) + 1 AS id FROM Role`)) as any;
      studentRole = Number(max.id);
      await db.insert(Role).values({ role_id: studentRole, name: "STUDENT", status: "ACTIVE" } as any);
    }
  });

  const override = async (key: string, value: number | null) => {
    await controlPool().query("DELETE FROM TenantEntitlementOverride WHERE tenant_id = ? AND ent_key = ?", [TID, key]);
    await controlPool().query(
      "INSERT INTO TenantEntitlementOverride (tenant_id, ent_key, value_int, enabled, reason) VALUES (?, ?, ?, 1, 'test')",
      [TID, key, value],
    );
    invalidateEntitlements(TID);
    resetEntitlementFallback(TID);
  };

  it("refuses a student over limit.students with 403 PACKAGE_LIMIT", async () => {
    await setPackage(TID, "gold");
    const now = (await runWithTenant(school, () => checkPeopleLimit("STUDENT", 0))).used;
    await override("limit.students", now);
    const res = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tokenFor(manager, TID)}`)
      .send({ username: `te_s_${stamp}`, email: `te.s.${stamp}@example.com`, roles: [studentRole], first_name: "T", last_name: "S" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "PACKAGE_LIMIT", limit: "limit.students", max: now });

    // Room for one more: created (a student's registration number needs a school code).
    if (!(await db.select({ id: School.school_id }).from(School).limit(1)).length) {
      await db.insert(School).values({ name: "TE School", school_code: "TE", status: "ACTIVE" } as any);
    }
    await db.execute(sql`UPDATE School SET school_code = 'TE' WHERE school_code IS NULL OR school_code = ''`);
    await override("limit.students", now + 1);
    const ok = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${tokenFor(manager, TID)}`)
      .send({ username: `te_s2_${stamp}`, email: `te.s2.${stamp}@example.com`, roles: [studentRole], first_name: "T", last_name: "S" });
    expect(ok.status).toBeLessThan(300);
  });

  it("refuses a consumable over its daily limit and warns the owners once a period", async () => {
    await setPackage(TID, "premium"); // the code runner is a Premium feature
    await override("limit.code_runs_day", 2);
    await controlPool().query("DELETE FROM TenantUsageCounter WHERE tenant_id = ?", [TID]);
    const inSchool = <T>(fn: () => Promise<T>) => runWithTenant(school, fn);
    expect((await inSchool(() => consumeTenantLimit("limit.code_runs_day"))).ok).toBe(true);
    const second = await inSchool(() => consumeTenantLimit("limit.code_runs_day"));
    expect(second).toMatchObject({ ok: true, used: 2, warn: true });
    const third = await inSchool(() => consumeTenantLimit("limit.code_runs_day"));
    expect(third).toMatchObject({ ok: false, used: 2, limit: 2 });
    await expect(inSchool(() => consumeOrThrow("limit.code_runs_day"))).rejects.toBeInstanceOf(PackageLimitError);

    // warned_at is set once per period (the consume above may already have set it). That
    // warning is fire-and-forget: let it land before resetting, or it races the reset.
    await new Promise((r) => setTimeout(r, 300));
    await controlPool().query("UPDATE TenantUsageCounter SET warned_at = NULL WHERE tenant_id = ?", [TID]);
    expect(await warnOwnersOnce(TID, "limit.code_runs_day", second)).toBe(true);
    expect(await warnOwnersOnce(TID, "limit.code_runs_day", second)).toBe(false);

    // The Code Playground run route answers the refusal before reaching the runner.
    const run = await request(app)
      .post("/code-playground/run")
      .set("Authorization", `Bearer ${tokenFor(manager, TID)}`)
      .send({ language: "python", code: "print(1)" });
    expect(run.status).toBe(403);
    expect(run.body).toMatchObject({ code: "PACKAGE_LIMIT", limit: "limit.code_runs_day", max: 2 });
  });

  it("refuses the school's AI pool at limit.ai_requests_day (PackageLimitError -> 403 body)", async () => {
    await override("limit.ai_requests_day", 0);
    await expect(runWithTenant(school, () => consumeAiRequest())).rejects.toMatchObject({
      statusCode: 403,
      code: "PACKAGE_LIMIT",
      details: { code: "PACKAGE_LIMIT", limit: "limit.ai_requests_day", max: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
describe("gates and locks", () => {
  it("answers 403 PACKAGE_FEATURE on a feature route the package lacks", async () => {
    await setPackage(TID, "starter");
    const person = await createUser();
    const res = await request(app).get("/office-hours/my").set("Authorization", `Bearer ${tokenFor(person, TID)}`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "PACKAGE_FEATURE", feature: "feature.office_hours" });
    const elearning = await request(app).get("/elearning/my/courses").set("Authorization", `Bearer ${tokenFor(person, TID)}`);
    expect(elearning.body.code).toBe("PACKAGE_FEATURE");
  });

  it("lists the package's locked capabilities for the Access Studio", async () => {
    await setPackage(TID, "starter");
    const { userId } = await personWith([["mis", "ACCESS_STUDIO_VIEW"]]);
    const res = await request(app).get("/access/package-locks").set("Authorization", `Bearer ${tokenFor(userId, TID)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pkg).toBe("starter");
    expect(res.body.data.locked.mis.MANAGE_COURSE_CONTENT).toBe("feature.elearning");
    expect(res.body.data.locked.tm.QUIZZES_VIEW).toBe("app.taskmentor");
    expect(res.body.data.locked.mis.MANAGE_USERS).toBeUndefined();
    expect(res.body.data.locked.mis.PLATFORM_TENANTS_VIEW).toBeUndefined();
    expect(res.body.data.features["feature.elearning"]).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("presets after deploy (boot-time registry sync)", () => {
  it("gives the existing SUPER_ADMIN every PLATFORM_* and SCHOOL_* capability and creates the new presets", async () => {
    await runWithTenant(primary, () => runAccessBootstrap());
    const rows = (await db.execute(sql`
      SELECT p.name FROM Role r JOIN RolePermission rp ON rp.role_id = r.role_id JOIN Permission p ON p.perm_id = rp.perm_id
       WHERE r.preset_key = 'platform_owner'`)) as any;
    const names = new Set((rows[0] as any[]).map((r) => r.name));
    for (const c of [...PLATFORM_CAP_LIST, "SCHOOL_SETTINGS_MANAGE", "SCHOOL_BILLING_MANAGE"]) expect(names.has(c), c).toBe(true);
    const presets = (await db.execute(sql`SELECT preset_key FROM Role WHERE preset_key IN ('platform_reviewer','platform_finance','platform_support','school_owner')`)) as any;
    expect((presets[0] as any[]).map((r) => r.preset_key).sort()).toEqual(["platform_finance", "platform_reviewer", "platform_support", "school_owner"]);
  }, 120_000);
});

// ---------------------------------------------------------------------------
describe("no control plane", () => {
  it("is unrestricted: every capability, no limits", async () => {
    const saved = process.env.PLATFORM_DB_NAME;
    process.env.PLATFORM_DB_NAME = `${process.env.DB_NAME}_no_such_platform`;
    invalidateTenants();
    invalidateEntitlements();
    resetEntitlementFallback();
    clearSnapshotCache();
    try {
      const ent = await resolveEntitlements(1);
      expect(ent.unrestricted).toBe(true);
      const caps = Object.keys((await compileSnapshot(matrixUser, "tm")).caps);
      expect(caps).toEqual(expect.arrayContaining(["QUIZ_QUESTIONS_RUN_CODE", "AI_PREMIUM"]));
      expect((await checkPeopleLimit("STUDENT")).ok).toBe(true);
      expect((await consumeTenantLimit("limit.ai_requests_day")).ok).toBe(true);
      await expect(consumeAiRequest()).resolves.toBeUndefined();
    } finally {
      process.env.PLATFORM_DB_NAME = saved;
      invalidateTenants();
      invalidateEntitlements();
      resetEntitlementFallback();
      clearSnapshotCache();
    }
  });
});
