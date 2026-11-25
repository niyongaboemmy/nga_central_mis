/**
 * Cross-school isolation, end to end (school isolation audit 2026-11-25).
 *
 *  1. MIS-ISO-1: the Database Management tool exists only for the primary school's
 *     platform owner, and even there every statement stays in its own schema.
 *  2. MIS-ISO-2: a copied account carries no credential of the source, and
 *     switch-school wants the copy's own password.
 *  3. The canary crawl: two schools, each seeded with a marker the other must never
 *     see; every GET route is called with the other school's super-admin session
 *     (both directions), path parameters filled with the other school's canary ids.
 *     Zero responses may contain the other school's marker.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";
import { poolFor } from "../db/pools";
import { invalidateTenants } from "../tenancy";
import { syncDirectoryUser } from "../tenancy/directory";
import { copyPersonInto } from "../services/tenantMgmt/crossSchool";
import { resetSwitchFailures } from "../controllers/schoolSwitchController";
import * as backchannel from "../services/sso/backchannelLogout";
import { installFakeFileServer } from "../test/fakeFileServer";
import { controlPool } from "../db/platform";
import { getTenant } from "../tenancy/registry";
import { PRIMARY_TENANT_ID, runWithTenant, type TenantCtx } from "../vendor/nga-tenancy";
import { schemeVerifyPath, schemeVerifySig } from "../services/schemeVerifyLink";
import { isUsageLogDisabled, logAIUsage, resetUsageLogFlags } from "../services/aiProviders/usageLog";
import { evalRunning, runEvals } from "../services/desktop/tutorEval";
import { uploadRateLimit } from "../routes/sideProjects";
import { qrSigningForTests } from "../services/officeHours/modern";
import { createJob, getJob } from "../services/aiLessonJobStore";
import { createImportJob, getImportJob } from "../services/curriculumImportJobStore";
import { ensurePlatform, platformUser, provisionSchool, removeSchool, sessionToken, stampOf } from "../test/tenantMgmtFixtures";
import { assignRole, createRoleWithPermissions, createUser } from "../test/fixtures";

installFakeFileServer();

let school: Awaited<ReturnType<typeof provisionSchool>>;
const stamp = stampOf();
const CANARY_A = `CNRYA${stamp}`;
const CANARY_B = `CNRYB${stamp}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const createdA: number[] = [];
const subjectsA: number[] = [];

// ── the Express route table (same walk as tenantManagementE2E.test.ts) ──────────
type Route = { method: string; path: string };
function mountOf(layer: any): string {
  if (layer.regexp?.fast_slash) return "";
  let src: string = layer.regexp?.source ?? "";
  src = src.replace(/^\^/, "").replace(/\\\/\?\(\?=\\\/\|\$\)$/i, "").replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, "1");
  return src.replace(/\\\//g, "/").replace(/\\\./g, ".");
}
function collect(stack: any[], prefix: string, out: Route[]) {
  for (const layer of stack) {
    if (layer.route && typeof layer.route.path === "string") {
      for (const m of Object.keys(layer.route.methods)) if (m !== "_all") out.push({ method: m, path: prefix + layer.route.path });
    } else if (layer.name === "router" && layer.handle?.stack) {
      collect(layer.handle.stack, prefix + mountOf(layer), out);
    }
  }
}
const routes = (): Route[] => {
  const out: Route[] = [];
  collect((app as any)._router.stack, "", out);
  return [...new Map(out.map((r) => [`${r.method} ${r.path}`, r])).values()];
};
const fill = (p: string, v: number | string) => p.replace(/:[A-Za-z_]+\??(\([^)]*\))?/g, String(v)).replace(/\*/g, "x") || "/";

// ── people and canaries ───────────────────────────────────────────────────────
async function seedCanary(tid: number, marker: string): Promise<{ userId: number; subjectId: number }> {
  const pool = poolFor(tid);
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`${marker.toLowerCase()}_u`, `${marker.toLowerCase()}@canary.test`]);
  const userId = Number(u.insertId);
  await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, ?, ?, 'TEACHER')", [userId, marker, marker]);
  await pool.query("INSERT INTO AuthCredential (user_id, password_hash, force_password_change) VALUES (?, ?, 0)", [userId, await bcrypt.hash(`${marker}-pw`, 4)]);
  const [s]: any = await pool.query("INSERT INTO Subject (name, code) VALUES (?, ?)", [`Subject ${marker}`, marker.slice(0, 20)]);
  await syncDirectoryUser(userId, tid);
  if (tid === 1) {
    createdA.push(userId);
    subjectsA.push(Number(s.insertId));
  }
  return { userId, subjectId: Number(s.insertId) };
}

/** A tenant-1 super admin (legacy SUPER_ADMIN role + its PLATFORM-scope grant). */
async function primarySuperAdmin(): Promise<{ id: number; token: string }> {
  const pool = poolFor(1);
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`iso_sa_${stamp}`, `iso.sa.${stamp}@canary.test`]);
  const id = Number(u.insertId);
  createdA.push(id);
  await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, 'Iso', 'Admin', 'ADMIN')", [id]);
  const [[role]]: any = await pool.query("SELECT role_id FROM `Role` WHERE name = 'SUPER_ADMIN' LIMIT 1");
  await pool.query("INSERT INTO UserRole (user_id, role_id) VALUES (?, ?)", [id, role.role_id]);
  await pool.query("INSERT INTO AccessGrant (user_id, role_id, scope_type, source, status) VALUES (?, ?, 'PLATFORM', 'MANUAL', 'ACTIVE')", [id, role.role_id]).catch(() => undefined);
  return { id, token: await sessionToken(id, 1) };
}

let canaryA: { userId: number; subjectId: number };
let canaryB: { userId: number; subjectId: number };
let adminA: { id: number; token: string };
let ownerB = "";

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  invalidateTenants();
  canaryA = await seedCanary(1, CANARY_A);
  canaryB = await seedCanary(school.tid, CANARY_B);
  adminA = await primarySuperAdmin();
  ownerB = await sessionToken(school.ownerId, school.tid);
}, 240_000);

afterAll(async () => {
  vi.restoreAllMocks();
  const pool = poolFor(1);
  for (const id of createdA) {
    for (const t of ["AccessGrant", "UserRole", "AuthCredential", "UserProfile"]) await pool.query(`DELETE FROM ${t} WHERE user_id = ?`, [id]).catch(() => undefined);
    await pool.query("DELETE FROM `User` WHERE user_id = ?", [id]).catch(() => undefined);
  }
  for (const id of subjectsA) await pool.query("DELETE FROM Subject WHERE subject_id = ?", [id]).catch(() => undefined);
  await removeSchool(school?.tid, school?.applicationId);
});

// ── 1. the Database Management tool ───────────────────────────────────────────
describe("MIS-ISO-1: Database Management tool", () => {
  const dbRoutes = () => routes().filter((r) => r.path.startsWith("/database/"));

  it("does not exist for another school's super admin (404 on every route, step-up included)", async () => {
    const list = dbRoutes();
    expect(list.length).toBeGreaterThanOrEqual(11);
    // Even a step-up token signed for this owner in this school does not help.
    const stepUp = jwt.sign({ userId: school.ownerId, dbAccess: true, tokenVersion: 0, tid: school.tid }, process.env.JWT_SECRET!, { expiresIn: "5m" });
    const opened: string[] = [];
    for (const r of list) {
      let q = (request(app) as any)[r.method](fill(r.path, "User")).set(auth(ownerB)).set("X-Db-Access-Token", stepUp);
      if (r.method !== "get") q = q.send({ query: "SELECT 1", confirm: true, values: { a: 1 }, where: { a: 1 } });
      const res = await q;
      if (res.status !== 404) opened.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`);
    }
    expect(opened).toEqual([]);
    const confirm = await request(app).post("/auth/confirm-db-access").set(auth(ownerB)).send({ password: "x" });
    expect(confirm.status).toBe(404);
  });

  it("is refused to a primary-school user without the platform-owner capability", async () => {
    // The legacy permission alone (what every school's SUPER_ADMIN holds) is not enough.
    const id = await createUser({ userType: "ADMIN" });
    createdA.push(id);
    await assignRole(id, await createRoleWithPermissions(`DBTOOL_${stamp}`, ["DATABASE_MANAGEMENT"]));
    const u = { id, token: await sessionToken(id, 1) };
    const stepUp = jwt.sign({ userId: u.id, dbAccess: true, tokenVersion: 0, tid: 1 }, process.env.JWT_SECRET!, { expiresIn: "5m" });
    const r = await request(app).get("/database/tables").set(auth(u.token)).set("X-Db-Access-Token", stepUp);
    expect(r.status).toBe(403);
  });

  describe("the primary platform owner", () => {
    let owner: { id: number; token: string };
    let stepUp = "";
    let otherDb = "";
    let platformDb = "";
    const run = (query: string, confirm = false) =>
      request(app).post("/database/query").set(auth(owner.token)).set("X-Db-Access-Token", stepUp).send({ query, confirm });

    beforeAll(async () => {
      owner = await platformUser(["PLATFORM_PACKAGES_MANAGE"]);
      createdA.push(owner.id);
      await assignRole(owner.id, await createRoleWithPermissions(`DBTOOL_O_${stamp}`, ["DATABASE_MANAGEMENT"]));
      owner.token = await sessionToken(owner.id, 1);
      stepUp = jwt.sign({ userId: owner.id, dbAccess: true, tokenVersion: 0, tid: 1 }, process.env.JWT_SECRET!, { expiresIn: "5m" });
      otherDb = String(((await poolFor(school.tid).query<any[]>("SELECT DATABASE() AS d"))[0] as any[])[0].d);
      platformDb = String(process.env.PLATFORM_DB_NAME);
    });

    it("still runs a normal query on its own database", async () => {
      const r = await run("SELECT COUNT(*) AS n FROM `User`");
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(Number(r.body.data.rows[0].n)).toBeGreaterThan(0);
      const own = String(((await poolFor(1).query<any[]>("SELECT DATABASE() AS d"))[0] as any[])[0].d);
      expect((await run(`SELECT COUNT(*) AS n FROM \`${own}\`.\`User\` u WHERE u.user_id > 0`)).status).toBe(200);
      // A name inside a string literal is data, not a schema.
      expect((await run(`SELECT '${otherDb}.User' AS label`)).status).toBe(200);
      expect((await request(app).get("/database/tables").set(auth(owner.token)).set("X-Db-Access-Token", stepUp)).status).toBe(200);
    });

    it("refuses every statement that names another schema (400)", async () => {
      const bad = [
        `SELECT * FROM ${otherDb}.User`,
        `SELECT * FROM \`${otherDb}\`.\`User\``,
        `SELECT * FROM \`${otherDb}\` . User`,
        `SELECT email FROM User UNION SELECT email FROM ${otherDb}.User`,
        `SELECT * FROM ${platformDb}.Tenant`,
        `SELECT 1 FROM /* hidden */ ${otherDb}.User`,
        `SELECT 1 -- note\n FROM ${otherDb}.User`,
        "SELECT * FROM information_schema.TABLES",
        "SELECT * FROM mysql.user",
        "SELECT * FROM performance_schema.threads",
        "SELECT * FROM sys.version",
        "SHOW DATABASES",
        "SHOW SCHEMAS",
        `SHOW TABLES FROM ${otherDb}`,
        `USE ${otherDb}`,
        "CREATE DATABASE evil",
        `CALL ${otherDb}.anything()`,
        "PREPARE s FROM 'SELECT 1'",
        "SELECT /*!50000 1 */",
        "SHOW FULL PROCESSLIST",
      ];
      const passed: string[] = [];
      for (const q of bad) {
        const r = await run(q, true);
        if (r.status !== 400) passed.push(`${q} -> ${r.status}`);
      }
      expect(passed).toEqual([]);
    });

    it("refuses a table name that is not a plain identifier", async () => {
      const r = await request(app).get("/database/tables/User%60%20x/data").set(auth(owner.token)).set("X-Db-Access-Token", stepUp);
      expect(r.status).toBe(400);
    });
  });
});

// ── 2. copy + switch probe ─────────────────────────────────────────────────────
describe("MIS-ISO-2 probe: copy then switch", () => {
  it("the copy has its own hash, must change it, and switch-school wants it", async () => {
    resetSwitchFailures();
    const pool = poolFor(1);
    const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`iso_cp_${stamp}`, `iso.cp.${stamp}@canary.test`]);
    const id = Number(u.insertId);
    createdA.push(id);
    await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, 'Copy', 'Probe', 'TEACHER')", [id]);
    await pool.query("INSERT INTO AuthCredential (user_id, password_hash, force_password_change, google_id) VALUES (?, ?, 0, ?)", [id, await bcrypt.hash("Probe-pw-123", 4), `g-probe-${stamp}`]);
    await syncDirectoryUser(id, 1);
    const [[teacher]]: any = await poolFor(school.tid).query("SELECT role_id FROM `Role` WHERE name = 'TEACHER'");
    const copy = await copyPersonInto({ sourceTid: 1, sourceUserId: id, targetTid: school.tid, roleIds: [Number(teacher.role_id)], actorUserId: null, via: "platform" });
    const [[a]]: any = await pool.query("SELECT password_hash FROM AuthCredential WHERE user_id = ?", [id]);
    const [[b]]: any = await poolFor(school.tid).query("SELECT password_hash, google_id, force_password_change FROM AuthCredential WHERE user_id = ?", [copy.userId]);
    expect(b.password_hash).not.toBe(a.password_hash);
    expect(b.google_id).toBeNull();
    expect(Number(b.force_password_change)).toBe(1);
    vi.spyOn(backchannel, "notifyLogout").mockResolvedValue([]);
    const token = await sessionToken(id, 1, { amr: "google" });
    const none = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.tid });
    expect([none.status, none.body.code]).toEqual([403, "PASSWORD_REQUIRED"]);
    const ok = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.tid, password: copy.tempPassword });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });
});

// ── 3. the canary crawl ────────────────────────────────────────────────────────
describe("canary crawl: no school sees the other's records", () => {
  // Routes that end the session (the rest of the crawl would run signed out) or
  // stream forever; and service-token routes (spokes, not people).
  const SKIP = /(logout|sign-?out|\/events$|\/stream|\/sse\b|\/live$)/i;

  async function crawl(token: string, fillWith: number, markers: string[]): Promise<{ hits: string[]; called: number; ok: number }> {
    const hits: string[] = [];
    let called = 0;
    let ok = 0;
    const list = routes().filter((r) => r.method === "get" && !SKIP.test(r.path));
    for (const r of list) {
      const path = fill(r.path, fillWith);
      called++;
      try {
        const res = await request(app).get(path).set(auth(token)).timeout({ response: 4000, deadline: 8000 });
        if (res.status < 300) ok++;
        const text = res.text ?? (res.body ? JSON.stringify(res.body) : "");
        for (const m of markers) if (text.includes(m)) hits.push(`GET ${r.path} (${path}) -> ${res.status} contains ${m}`);
      } catch {
        /* timeout / stream: no body to leak */
      }
    }
    return { hits, called, ok };
  }

  it("school B's super admin never sees school A's canary", async () => {
    const r = await crawl(ownerB, canaryA.userId, [CANARY_A]);
    expect(r.called).toBeGreaterThan(300);
    expect(r.ok).toBeGreaterThan(50);
    expect(r.hits).toEqual([]);
    // The session survived the crawl (a crawl run signed out proves nothing).
    expect((await request(app).get("/auth/my-schools").set(auth(ownerB))).status).toBe(200);
    // And B's own canary IS visible to B (the marker is findable at all).
    const own = await request(app).get(`/users/${canaryB.userId}`).set(auth(ownerB));
    expect(own.text).toContain(CANARY_B);
  }, 300_000);

  it("school A's super admin never sees school B's canary", async () => {
    const r = await crawl(adminA.token, canaryB.userId, [CANARY_B]);
    expect(r.called).toBeGreaterThan(300);
    expect(r.ok).toBeGreaterThan(50);
    expect(r.hits).toEqual([]);
    expect((await request(app).get("/auth/my-schools").set(auth(adminA.token))).status).toBe(200);
    const own = await request(app).get(`/users/${canaryA.userId}`).set(auth(adminA.token));
    expect(own.text).toContain(CANARY_A);
  }, 300_000);
});

// ── 4. the smaller per-school findings ─────────────────────────────────────────
describe("MIS-ISO-4..7: per-school state", () => {
  let tA: TenantCtx;
  let tB: TenantCtx;
  beforeAll(async () => {
    tA = (await getTenant(PRIMARY_TENANT_ID))!;
    tB = (await getTenant(school.tid))!;
  });

  it("MIS-ISO-4: the scheme QR names its school (signed); the verify page reads that school only", async () => {
    const pool = poolFor(1);
    const [[term]]: any = await pool.query("SELECT academic_term_id AS id FROM AcademicTerm ORDER BY academic_term_id LIMIT 1");
    const [[cg]]: any = await pool.query("SELECT class_group_id AS id FROM ClassGroup ORDER BY class_group_id LIMIT 1");
    const [ins]: any = await pool.query("INSERT INTO SchemeOfWork (user_id, subject_id, class_group_id, academic_term_id) VALUES (?, ?, ?, ?)", [canaryA.userId, canaryA.subjectId, cg.id, term.id]);
    const id = Number(ins.insertId);
    try {
      expect(schemeVerifyPath(1, id)).toBe(`/verify/${id}?t=1&s=${schemeVerifySig(1, id)}`);
      const signed = await request(app).get(`/scheme-of-work/verify/${id}`).query({ t: 1, s: schemeVerifySig(1, id) });
      expect([signed.status, signed.body.valid]).toEqual([200, true]);
      expect(signed.body.subject_name).toBe(`Subject ${CANARY_A}`);
      // Legacy printed QR (no t): an NGA document -- even for a scanner signed in to school B --
      // but only for a scheme created before the signed links shipped (GAP-C).
      const fresh = await request(app).get(`/scheme-of-work/verify/${id}`).set(auth(ownerB));
      expect([fresh.status, fresh.body.code]).toEqual([410, "QR_FORMAT_OUTDATED"]);
      await pool.query("UPDATE SchemeOfWork SET created_at = FROM_UNIXTIME(?) WHERE scheme_id = ?", [Math.floor(Date.parse("2026-11-01T00:00:00Z") / 1000), id]);
      const legacy = await request(app).get(`/scheme-of-work/verify/${id}`).set(auth(ownerB));
      expect([legacy.status, legacy.body.subject_name]).toEqual([200, `Subject ${CANARY_A}`]);
      // Tampered: t without the right signature.
      expect((await request(app).get(`/scheme-of-work/verify/${id}`).query({ t: school.tid, s: schemeVerifySig(1, id) })).status).toBe(404);
      expect((await request(app).get(`/scheme-of-work/verify/${id}`).query({ t: school.tid })).status).toBe(404);
      // Signed for school B: reads B's database, where this id is not A's document.
      const inB = await request(app).get(`/scheme-of-work/verify/${id}`).query({ t: school.tid, s: schemeVerifySig(school.tid, id) });
      expect(inB.text).not.toContain(CANARY_A);
    } finally {
      await pool.query("DELETE FROM SchemeOfWork WHERE scheme_id = ?", [id]);
    }
  });

  it("MIS-ISO-6: a school without the AI usage table switches logging off for itself only", async () => {
    resetUsageLogFlags();
    await poolFor(school.tid).query("RENAME TABLE AIUsageLog TO AIUsageLog_hidden");
    try {
      runWithTenant(tB, () => logAIUsage({ feature: "iso6", provider: "fake", ok: true, occurred_at: new Date() }));
      await vi.waitFor(() => expect(runWithTenant(tB, () => isUsageLogDisabled())).toBe(true));
      expect(runWithTenant(tA, () => isUsageLogDisabled())).toBe(false);
    } finally {
      await poolFor(school.tid).query("RENAME TABLE AIUsageLog_hidden TO AIUsageLog");
      resetUsageLogFlags();
    }
  });

  it("MIS-ISO-6: a tutor evaluation in one school neither blocks nor answers another", async () => {
    // Run in school B (its results land in B's database, dropped after this file).
    const run = runWithTenant(tB, () => runEvals(school.ownerId));
    expect(runWithTenant(tB, () => evalRunning())).toBe(true);
    expect(runWithTenant(tA, () => evalRunning())).toBe(false);
    await run;
    expect(runWithTenant(tB, () => evalRunning())).toBe(false);
  });

  it("MIS-ISO-7: the upload budget is per school and person", () => {
    const fire = (t: TenantCtx) => {
      let status = 200;
      const res: any = { status: (c: number) => ((status = c), { json: () => undefined }) };
      runWithTenant(t, () => uploadRateLimit({ user: { userId: 424242 } }, res, () => undefined));
      return status;
    };
    for (let i = 0; i < 30; i++) expect(fire(tA)).toBe(200);
    expect(fire(tA)).toBe(429);
    expect(fire(tB)).toBe(200); // the same user id in another school has its own budget
  });

  it("MIS-ISO-7: an office-hours check-in code is bound to its school", () => {
    const a = runWithTenant(tA, () => [qrSigningForTests.sign(7, 100), qrSigningForTests.codeOf(7, 100)]);
    const b = runWithTenant(tB, () => [qrSigningForTests.sign(7, 100), qrSigningForTests.codeOf(7, 100)]);
    expect(a[0]).not.toBe(b[0]);
    expect(a).not.toEqual(b);
  });

  it("MIS-ISO-7: an AI job is visible only in the school that started it", () => {
    runWithTenant(tA, () => createJob(`iso7-${stamp}`, 5));
    expect(runWithTenant(tA, () => getJob(`iso7-${stamp}`))?.userId).toBe(5);
    expect(runWithTenant(tB, () => getJob(`iso7-${stamp}`))).toBeUndefined();
    runWithTenant(tB, () => createImportJob(`iso7i-${stamp}`, 5, 1));
    expect(runWithTenant(tA, () => getImportJob(`iso7i-${stamp}`))).toBeUndefined();
    expect(runWithTenant(tB, () => getImportJob(`iso7i-${stamp}`))?.subjectId).toBe(1);
  });

  it("MIS-ISO-7: sign-in names a pending school for an identifier only after the password matched", async () => {
    await controlPool().query("UPDATE Tenant SET status = 'PENDING' WHERE tenant_id = ?", [school.tid]);
    invalidateTenants();
    try {
      const wrong = await request(app).post("/auth/login").send({ username: `${CANARY_B.toLowerCase()}@canary.test`, password: "not-the-password" });
      expect(wrong.status).toBe(401);
      expect(JSON.stringify(wrong.body)).not.toMatch(/TENANT_PENDING|review/i);
      const right = await request(app).post("/auth/login").send({ username: `${CANARY_B.toLowerCase()}@canary.test`, password: `${CANARY_B}-pw` });
      expect([right.status, right.body.code]).toEqual([403, "TENANT_PENDING"]);
    } finally {
      await controlPool().query("UPDATE Tenant SET status = 'ACTIVE' WHERE tenant_id = ?", [school.tid]);
      invalidateTenants();
    }
  });
});
