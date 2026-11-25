/**
 * One person, several schools: GET /auth/my-schools, POST /auth/switch-school,
 * the nga_school cookie, sid in tokens / SSO codes / logout tokens
 * (TENANT_SWITCHING_PLAN.md §4.2–4.3, Appendix A).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";
import { poolFor } from "../db/pools";
import { syncDirectoryUser } from "../tenancy/directory";
import { invalidateTenants } from "../tenancy";
import { copyPersonInto } from "../services/tenantMgmt/crossSchool";
import { resetSwitchFailures } from "../controllers/schoolSwitchController";
import * as backchannel from "../services/sso/backchannelLogout";
import { buildLogoutToken } from "../services/sso/backchannelLogout";
import { parseSchoolCookie } from "../tenancy/schoolCookie";
import crypto from "crypto";
import { primaryDb } from "../db";
import { System } from "../db/schema";
import { assignTestSystems } from "../test/systems";
import { ensurePlatform, provisionSchool, removeSchool, sessionToken, stampOf } from "../test/tenantMgmtFixtures";
import { areLinked } from "../tenancy/personLinks";
import { controlPool } from "../db/platform";

let school: Awaited<ReturnType<typeof provisionSchool>>;
const PW = "Switch-Schools-pw1";
const stamp = stampOf();
const created: number[] = [];
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const cookieOf = (res: request.Response, name: string): string | null => {
  const all = ([] as string[]).concat((res.headers["set-cookie"] as any) ?? []);
  const c = all.find((x) => x.startsWith(`${name}=`));
  return c ? decodeURIComponent(c.split(";")[0].slice(name.length + 1)) : null;
};

async function primaryPerson(first: string, password = PW): Promise<{ id: number; email: string }> {
  const pool = poolFor(1);
  const email = `${first.toLowerCase()}.${stamp}@switch.test`;
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`${first.toLowerCase()}_${stamp}`, email]);
  const id = Number(u.insertId);
  await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, ?, 'Twoschools', 'TEACHER')", [id, first]);
  await pool.query("INSERT INTO AuthCredential (user_id, password_hash) VALUES (?, ?)", [id, await bcrypt.hash(password, 4)]);
  await syncDirectoryUser(id, 1);
  created.push(id);
  return { id, email };
}

/** An account with `email` in school `tid` (e.g. a puppet an admin typed someone's e-mail on). */
async function puppetIn(tid: number, email: string, password: string, forceChange = 0): Promise<number> {
  const pool = poolFor(tid);
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, status) VALUES (?, ?, 'ACTIVE')", [`pup_${stamp}_${crypto.randomBytes(3).toString("hex")}`, email]);
  const id = Number(u.insertId);
  await pool.query("INSERT INTO AuthCredential (user_id, password_hash, force_password_change) VALUES (?, ?, ?)", [id, await bcrypt.hash(password, 4), forceChange]);
  await syncDirectoryUser(id, tid);
  return id;
}

const teacherRole = async (tid: number) => Number(((await poolFor(tid).query<any[]>("SELECT role_id FROM `Role` WHERE name = 'TEACHER'"))[0] as any[])[0].role_id);

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  invalidateTenants();
}, 240_000);

beforeEach(() => resetSwitchFailures());

afterAll(async () => {
  vi.restoreAllMocks();
  for (const id of created) {
    for (const t of ["UserRole", "AuthCredential", "UserProfile"]) await poolFor(1).query(`DELETE FROM ${t} WHERE user_id = ?`, [id]).catch(() => undefined);
    await poolFor(1).query("DELETE FROM `User` WHERE user_id = ?", [id]).catch(() => undefined);
  }
  await removeSchool(school?.tid, school?.applicationId);
});

describe("my schools", () => {
  it("lists only the current school for a one-school person", async () => {
    const p = await primaryPerson("Solo");
    const r = await request(app).get("/auth/my-schools").set(auth(await sessionToken(p.id, 1)));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.schools.map((s: any) => [s.tid, s.current])).toEqual([[1, true]]);
  });

  it("lists both schools (current first) once the person is in two", async () => {
    const p = await primaryPerson("Duo");
    await copyPersonInto({ sourceTid: 1, sourceUserId: p.id, targetTid: school.tid, roleIds: [await teacherRole(school.tid)], actorUserId: null, via: "platform" });
    const r = await request(app).get("/auth/my-schools").set(auth(await sessionToken(p.id, 1)));
    expect(r.status).toBe(200);
    expect(r.body.data.schools.map((s: any) => [s.tid, s.current])).toEqual([
      [1, true],
      [school.tid, false],
    ]);
    expect(r.body.data.schools[1]).toMatchObject({ slug: school.slug });
    // MIS-ISO-5: another school's roles are never revealed; the current school's are.
    expect(r.body.data.schools[1].roles).toBeUndefined();
    expect(Object.keys(r.body.data.schools[1]).sort()).toEqual(["current", "logoUrl", "name", "slug", "status", "tid"]);
    expect(Array.isArray(r.body.data.schools[0].roles)).toBe(true);
  });

  it("GAP-A: a plain e-mail match is never named -- only counted -- even when both accounts chose their own password; a link always is listed", async () => {
    const p = await primaryPerson("Lookalike");
    // A school admin types this person's e-mail on a (puppet) account of their own school.
    const otherId = await puppetIn(school.tid, p.email, "Admin-set-pw1", 0);
    await poolFor(1).query("UPDATE AuthCredential SET force_password_change = 0 WHERE user_id = ?", [p.id]);
    const r = await request(app).get("/auth/my-schools").set(auth(await sessionToken(p.id, 1)));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.schools.map((s: any) => s.tid)).toEqual([1]);
    expect(r.body.data.unlinkedCount).toBe(1);
    // Nothing about the other school leaks: no name, slug, tid or logo anywhere in the body.
    expect(r.text).not.toContain(school.slug);
    expect(r.text).not.toContain(`"tid":${school.tid}`);
    expect(otherId).toBeGreaterThan(0);
    // A copied account (one-time password) is linked, so listed, and not counted.
    const q = await primaryPerson("Linked");
    await copyPersonInto({ sourceTid: 1, sourceUserId: q.id, targetTid: school.tid, roleIds: [await teacherRole(school.tid)], actorUserId: null, via: "platform" });
    const l = await request(app).get("/auth/my-schools").set(auth(await sessionToken(q.id, 1)));
    expect(l.body.data.schools.map((s: any) => s.tid)).toEqual([1, school.tid]);
    expect(l.body.data.unlinkedCount).toBe(0);
  });

  it("never lists a school where the account is not ACTIVE", async () => {
    const p = await primaryPerson("Inactive");
    const r0 = await copyPersonInto({ sourceTid: 1, sourceUserId: p.id, targetTid: school.tid, roleIds: [await teacherRole(school.tid)], actorUserId: null, via: "platform" });
    await poolFor(school.tid).query("UPDATE `User` SET status = 'INACTIVE' WHERE user_id = ?", [r0.userId]);
    await syncDirectoryUser(r0.userId, school.tid);
    const r = await request(app).get("/auth/my-schools").set(auth(await sessionToken(p.id, 1)));
    expect(r.body.data.schools.map((s: any) => s.tid)).toEqual([1]);
  });
});

describe("switch school", () => {
  it("MIS-ISO-2: a copy needs its one-time password (no equal-hash shortcut), sets nga_school, links the pair and ends only this session in the old school", async () => {
    const p = await primaryPerson("Mover");
    const copy = await copyPersonInto({ sourceTid: 1, sourceUserId: p.id, targetTid: school.tid, roleIds: [await teacherRole(school.tid)], actorUserId: null, via: "platform" });
    expect(copy.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const logout = vi.spyOn(backchannel, "notifyLogout").mockResolvedValue([]);
    const token = await sessionToken(p.id, 1, { sid: "oldSession123" });
    const need = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.slug });
    expect([need.status, need.body.code]).toEqual([403, "PASSWORD_REQUIRED"]);
    // The source password does not open the copy.
    const old = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.slug, password: PW });
    expect([old.status, old.body.code]).toEqual([403, "WRONG_PASSWORD"]);
    resetSwitchFailures();
    const r = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.slug, password: copy.tempPassword });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.tenant).toMatchObject({ tid: school.tid, slug: school.slug });
    const claims = jwt.decode(r.body.data.token) as any;
    expect(claims).toMatchObject({ userId: copy.userId, tid: school.tid, amr: "pwd" });
    expect(claims.sid).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
    expect(claims.sid).not.toBe("oldSession123");
    expect(parseSchoolCookie(cookieOf(r, "nga_school"))).toEqual({ tid: school.tid, sid: claims.sid });
    expect(cookieOf(r, "nga_auth_token")).toBe(r.body.data.token);
    await vi.waitFor(() => expect(logout).toHaveBeenCalledWith(p.id, { sid: "oldSession123" }));
    expect(await areLinked({ tid: 1, uid: p.id }, { tid: school.tid, uid: copy.userId })).toBe(true);
    // The new session works in the new school and says so.
    const me = await request(app).get("/auth/my-schools").set(auth(r.body.data.token));
    expect(me.body.data.schools.find((s: any) => s.current).tid).toBe(school.tid);
    logout.mockRestore();
  });

  it("MIS-ISO-2: an equal password hash is not proof", async () => {
    const p = await primaryPerson("Samehash");
    const copy = await copyPersonInto({ sourceTid: 1, sourceUserId: p.id, targetTid: school.tid, roleIds: [await teacherRole(school.tid)], actorUserId: null, via: "platform" });
    const [[src]]: any = await poolFor(1).query("SELECT password_hash FROM AuthCredential WHERE user_id = ?", [p.id]);
    await poolFor(school.tid).query("UPDATE AuthCredential SET password_hash = ? WHERE user_id = ?", [src.password_hash, copy.userId]);
    const r = await request(app).post("/auth/switch-school").set(auth(await sessionToken(p.id, 1))).send({ tenant: school.slug });
    expect([r.status, r.body.code]).toEqual([403, "PASSWORD_REQUIRED"]);
  });

  it("MIS-ISO-2: the same Google account counts only for a session opened by Google sign-in", async () => {
    const p = await primaryPerson("Googler");
    const copy = await copyPersonInto({ sourceTid: 1, sourceUserId: p.id, targetTid: school.tid, roleIds: [await teacherRole(school.tid)], actorUserId: null, via: "platform" });
    const gid = `g-${stamp}-${p.id}`;
    await poolFor(1).query("UPDATE AuthCredential SET google_id = ? WHERE user_id = ?", [gid, p.id]);
    await poolFor(school.tid).query("UPDATE AuthCredential SET google_id = ? WHERE user_id = ?", [gid, copy.userId]);
    vi.spyOn(backchannel, "notifyLogout").mockResolvedValue([]);
    const pwdSession = await request(app).post("/auth/switch-school").set(auth(await sessionToken(p.id, 1, { amr: "pwd" }))).send({ tenant: school.slug });
    expect([pwdSession.status, pwdSession.body.code]).toEqual([403, "PASSWORD_REQUIRED"]);
    const google = await request(app).post("/auth/switch-school").set(auth(await sessionToken(p.id, 1, { amr: "google" }))).send({ tenant: school.slug });
    expect(google.status, JSON.stringify(google.body)).toBe(200);
    expect(jwt.decode(google.body.data.token)).toMatchObject({ userId: copy.userId, tid: school.tid, amr: "google" });
  });

  it("asks for the target password when the passwords differ, refuses a wrong one, rate-limits, then accepts the right one", async () => {
    const p = await primaryPerson("Different");
    const copy = await copyPersonInto({ sourceTid: 1, sourceUserId: p.id, targetTid: school.tid, roleIds: [await teacherRole(school.tid)], actorUserId: null, via: "platform" });
    const OTHER = "Other-School-pw9";
    await poolFor(school.tid).query("UPDATE AuthCredential SET password_hash = ? WHERE user_id = ?", [await bcrypt.hash(OTHER, 4), copy.userId]);
    vi.spyOn(backchannel, "notifyLogout").mockResolvedValue([]);
    const token = await sessionToken(p.id, 1);
    const need = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.tid });
    expect([need.status, need.body.code]).toEqual([403, "PASSWORD_REQUIRED"]);
    const wrong = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.tid, password: PW });
    expect([wrong.status, wrong.body.code]).toEqual([403, "WRONG_PASSWORD"]);
    for (let i = 0; i < 4; i++) await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.tid, password: "nope" });
    const limited = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.tid, password: OTHER });
    expect([limited.status, limited.body.code]).toEqual([429, "TOO_MANY_ATTEMPTS"]);
    resetSwitchFailures();
    const ok = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.tid, password: OTHER });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((jwt.decode(ok.body.data.token) as any).tid).toBe(school.tid);
  });

  it("refuses the same school, an unknown school and a school without an account", async () => {
    const p = await primaryPerson("Stay");
    const token = await sessionToken(p.id, 1);
    expect((await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: 1 })).body.code).toBe("SAME_SCHOOL");
    expect((await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: "no-such-school" })).body.code).toBe("TENANT_UNKNOWN");
    const none = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.slug });
    expect([none.status, none.body.code]).toEqual([404, "NOT_IN_SCHOOL"]);
  });

  it("needs a signed-in session", async () => {
    expect((await request(app).post("/auth/switch-school").send({ tenant: school.slug })).status).toBe(401);
    expect((await request(app).get("/auth/my-schools")).status).toBe(401);
  });
});

describe("GAP-A: link another school", () => {
  const link = (token: string, password?: string) => request(app).post("/auth/link-school").set(auth(token)).send(password === undefined ? {} : { password });
  const auditRows = async (uid: number) =>
    ((await controlPool().query<any[]>("SELECT action, target_tid, payload FROM PlatformAudit WHERE action = 'auth.link_school' AND actor_user_id = ? ORDER BY audit_id", [uid]))[0] as any[]);

  it("GAP-A: the right password of the e-mail-matched account links it, lists it and audits it; switch-school then still needs its proof", async () => {
    const p = await primaryPerson("Linker");
    const THERE = "There-School-pw7";
    const otherId = await puppetIn(school.tid, p.email, THERE);
    const token = await sessionToken(p.id, 1);
    const r = await link(token, THERE);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.school).toMatchObject({ tid: school.tid, slug: school.slug, current: false });
    expect(r.body.data.school.roles).toBeUndefined();
    expect(Object.keys(r.body.data.school).sort()).toEqual(["current", "logoUrl", "name", "slug", "status", "tid"]);
    expect(await areLinked({ tid: 1, uid: p.id }, { tid: school.tid, uid: otherId })).toBe(true);
    const [[row]]: any = await controlPool().query("SELECT via FROM PersonLink WHERE (tid_a = 1 AND uid_a = ? AND tid_b = ? AND uid_b = ?)", [p.id, school.tid, otherId]);
    expect(row.via).toBe("password");
    const list = await request(app).get("/auth/my-schools").set(auth(token));
    expect(list.body.data.schools.map((s: any) => s.tid)).toEqual([1, school.tid]);
    expect(list.body.data.unlinkedCount).toBe(0);
    await vi.waitFor(async () => expect((await auditRows(p.id)).some((a) => a.target_tid === school.tid)).toBe(true));
    // Switching keeps its own proof rules: no password -> PASSWORD_REQUIRED; the right one works.
    vi.spyOn(backchannel, "notifyLogout").mockResolvedValue([]);
    const need = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.slug });
    expect([need.status, need.body.code]).toEqual([403, "PASSWORD_REQUIRED"]);
    const sw = await request(app).post("/auth/switch-school").set(auth(token)).send({ tenant: school.slug, password: THERE });
    expect(sw.status, JSON.stringify(sw.body)).toBe(200);
    expect(jwt.decode(sw.body.data.token)).toMatchObject({ userId: otherId, tid: school.tid });
  });

  it("GAP-A: a wrong password is 403 WRONG_PASSWORD, names no school and links nothing", async () => {
    const p = await primaryPerson("Guesser");
    const otherId = await puppetIn(school.tid, p.email, "Real-There-pw3");
    const token = await sessionToken(p.id, 1);
    const r = await link(token, PW); // this school's password, not the other one's
    expect([r.status, r.body.code]).toEqual([403, "WRONG_PASSWORD"]);
    expect(r.text).not.toContain(school.slug);
    expect(r.text).not.toContain(school.name);
    expect(await areLinked({ tid: 1, uid: p.id }, { tid: school.tid, uid: otherId })).toBe(false);
    const list = await request(app).get("/auth/my-schools").set(auth(token));
    expect(list.body.data.schools.map((s: any) => s.tid)).toEqual([1]);
    expect(list.body.data.unlinkedCount).toBe(1);
    await vi.waitFor(async () => expect((await auditRows(p.id)).length).toBeGreaterThan(0));
    expect((await link(token)).status).toBe(400); // no password at all
  });

  it("GAP-A: an INACTIVE e-mail match is neither counted nor linkable", async () => {
    const p = await primaryPerson("Dormant");
    const otherId = await puppetIn(school.tid, p.email, "Dormant-pw5");
    await poolFor(school.tid).query("UPDATE `User` SET status = 'INACTIVE' WHERE user_id = ?", [otherId]);
    await syncDirectoryUser(otherId, school.tid);
    const token = await sessionToken(p.id, 1);
    expect((await request(app).get("/auth/my-schools").set(auth(token))).body.data.unlinkedCount).toBe(0);
    expect((await link(token, "Dormant-pw5")).status).toBe(403);
  });

  it("GAP-A: 5 wrong passwords per 15 minutes, then 429 even for the right one", async () => {
    const p = await primaryPerson("Hammer");
    const THERE = "Hammer-There-pw2";
    await puppetIn(school.tid, p.email, THERE);
    const token = await sessionToken(p.id, 1);
    for (let i = 0; i < 5; i++) expect((await link(token, `nope-${i}`)).status).toBe(403);
    const limited = await link(token, THERE);
    expect([limited.status, limited.body.code]).toEqual([429, "TOO_MANY_ATTEMPTS"]);
    resetSwitchFailures();
    expect((await link(token, THERE)).status).toBe(200);
  });

  it("GAP-A: needs a signed-in session", async () => {
    expect((await request(app).post("/auth/link-school").send({ password: "x" })).status).toBe(401);
  });
});

describe("sid through SSO", () => {
  it("an SSO code from a session with a sid gives the spoke a token with the same sid and school", async () => {
    const clientId = `client_${crypto.randomBytes(6).toString("hex")}`;
    await primaryDb().insert(System).values({
      name: `Switch ${clientId}`,
      client_id: clientId,
      client_secret: "sw-secret",
      allowed_redirect_uris: "http://localhost/cb",
      icon_url: "x",
      home_url: "http://localhost",
      status: "ACTIVE",
    } as any);
    await assignTestSystems(clientId);
    const p = await primaryPerson("Sso");
    const token = await sessionToken(p.id, 1, { sid: "browserSid42" });
    const a = await request(app).get("/sso/authorize").query({ client_id: clientId, redirect_uri: "http://localhost/cb" }).set(auth(token));
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.data.code).toMatch(/^1\.[0-9a-f]{64}\.sbrowserSid42$/);
    const t = await request(app).post("/sso/token").send({ code: a.body.data.code, client_id: clientId, client_secret: "sw-secret" });
    expect(t.status, JSON.stringify(t.body)).toBe(200);
    expect(jwt.decode(t.body.data.token)).toMatchObject({ userId: p.id, tid: 1, sid: "browserSid42" });
    // A session without a sid keeps the legacy bare code.
    const legacy = await request(app).get("/sso/authorize").query({ client_id: clientId, redirect_uri: "http://localhost/cb" }).set(auth(await sessionToken(p.id, 1)));
    expect(legacy.body.data.code).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sid in logout tokens", () => {
  it("adds sid when given, keeps the legacy shape otherwise", () => {
    const withSid = buildLogoutToken(5, "client", Date.now(), 2, "abcSession99");
    const without = buildLogoutToken(5, "client", Date.now(), 2);
    if (!withSid || !without) return; // no signing key in this environment
    expect(jwt.decode(withSid)).toMatchObject({ sub: "5", tid: 2, sid: "abcSession99" });
    expect((jwt.decode(without) as any).sid).toBeUndefined();
  });
});
