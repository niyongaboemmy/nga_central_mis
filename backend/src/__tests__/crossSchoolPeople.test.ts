/**
 * One person, several schools (services/tenantMgmt/crossSchool.ts):
 * a school admin finds a person of another school by exact e-mail and adds them
 * with a role of their own school; platform staff search every school and assign.
 * MIS-ISO-2: a copy never carries the source's password hash or google_id -- it
 * gets its own one-time password (e-mailed; shown once to platform staff only).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import emailService from "../utils/email";
import bcrypt from "bcryptjs";
import request from "supertest";
import app from "../app";
import { poolFor } from "../db/pools";
import { syncDirectoryUser } from "../tenancy/directory";
import { invalidateTenants } from "../tenancy";
import { ensurePlatform, platformUser, provisionSchool, removeSchool, sessionToken, stampOf } from "../test/tenantMgmtFixtures";

let school: Awaited<ReturnType<typeof provisionSchool>>;
let ownerToken: string;
let operator: { id: number; token: string };
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const PW = "Two-Schools-pw1";
const stamp = stampOf();
const people: Array<{ id: number; email: string }> = [];

async function primaryPerson(first: string, last: string): Promise<{ id: number; email: string }> {
  const pool = poolFor(1);
  const email = `${first.toLowerCase()}.${stamp}@two.test`;
  const [u]: any = await pool.query("INSERT INTO `User` (username, email, phone_number, status) VALUES (?, ?, '+250788123456', 'ACTIVE')", [`${first.toLowerCase()}_${stamp}`, email]);
  const id = Number(u.insertId);
  await pool.query("INSERT INTO UserProfile (user_id, first_name, last_name, user_type) VALUES (?, ?, ?, 'TEACHER')", [id, first, last]);
  await pool.query("INSERT INTO AuthCredential (user_id, password_hash) VALUES (?, ?)", [id, await bcrypt.hash(PW, 4)]);
  await syncDirectoryUser(id, 1);
  people.push({ id, email });
  return { id, email };
}

const roleId = async (tid: number, name: string) => Number(((await poolFor(tid).query<any[]>("SELECT role_id FROM `Role` WHERE name = ?", [name]))[0] as any[])[0]?.role_id);

beforeAll(async () => {
  await ensurePlatform();
  delete process.env.TENANCY_PROVISION_SECRET;
  school = await provisionSchool({ pkg: "gold" });
  ownerToken = await sessionToken(school.ownerId, school.tid);
  operator = await platformUser(["PLATFORM_TENANTS_VIEW", "PLATFORM_TENANTS_LIFECYCLE"]);
  invalidateTenants();
}, 240_000);

afterAll(async () => {
  for (const p of people) {
    for (const t of ["UserRole", "AuthCredential", "UserProfile"]) await poolFor(1).query(`DELETE FROM ${t} WHERE user_id = ?`, [p.id]).catch(() => undefined);
    await poolFor(1).query("DELETE FROM `User` WHERE user_id = ?", [p.id]).catch(() => undefined);
  }
  await removeSchool(school?.tid, school?.applicationId);
});

describe("school side: add a person from another school", () => {
  let teacher: { id: number; email: string };
  beforeAll(async () => {
    teacher = await primaryPerson("Grace", "Mutoni");
  });

  it("finds them by exact e-mail only, phone masked", async () => {
    const r = await request(app).get("/users/elsewhere").query({ identifier: teacher.email.toUpperCase() }).set(auth(ownerToken));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).toMatchObject({ tid: 1, userId: teacher.id, name: "Grace Mutoni", alreadyInTarget: false });
    expect(r.body.data[0].phone).toMatch(/^•+456$/);
    const partial = await request(app).get("/users/elsewhere").query({ identifier: "grace" }).set(auth(ownerToken));
    expect(partial.body.data).toEqual([]);
  });

  it("MIS-ISO-2: adds them with a role of this school and their own one-time password (never the source's hash or Google id)", async () => {
    const teacherRole = await roleId(school.tid, "TEACHER");
    expect(teacherRole).toBeGreaterThan(0);
    await poolFor(1).query("UPDATE AuthCredential SET google_id = ? WHERE user_id = ?", [`g-src-${stamp}`, teacher.id]);
    vi.spyOn(emailService, "isAvailable").mockReturnValue(true);
    const send = vi.spyOn(emailService, "sendEmail").mockResolvedValue(true);
    send.mockClear();
    const r = await request(app).post("/users/elsewhere/import").set(auth(ownerToken)).send({ identifier: teacher.email, sourceTid: 1, roles: [teacherRole] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data.roles).toEqual(["TEACHER"]);
    expect(r.body.data.emailed).toBe(true);
    // A school's admin never sees the person's password.
    expect(r.body.data.tempPassword).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/password/i);
    const [[u]] = await poolFor(school.tid).query<any[]>(
      "SELECT u.email, p.first_name, p.user_type FROM `User` u JOIN UserProfile p ON p.user_id = u.user_id WHERE u.user_id = ?",
      [r.body.data.userId],
    );
    expect(u).toMatchObject({ email: teacher.email, first_name: "Grace", user_type: "TEACHER" });
    const [[src]] = await poolFor(1).query<any[]>("SELECT password_hash FROM AuthCredential WHERE user_id = ?", [teacher.id]);
    const [[cred]] = await poolFor(school.tid).query<any[]>("SELECT password_hash, force_password_change, google_id FROM AuthCredential WHERE user_id = ?", [r.body.data.userId]);
    expect(cred.password_hash).not.toBe(src.password_hash);
    expect(Number(cred.force_password_change)).toBe(1);
    expect(cred.google_id).toBeNull();
    // The one-time password went to the person's e-mail.
    const mail = send.mock.calls.map((c: any[]) => c[0]).find((m: any) => m?.to === teacher.email);
    const pw = /One-time password: ([A-Za-z0-9]{12})/.exec(String(mail?.html ?? ""))?.[1];
    expect(pw).toBeTruthy();
    expect(await bcrypt.compare(pw!, cred.password_hash)).toBe(true);
    vi.mocked(emailService.isAvailable).mockRestore();
    invalidateTenants();
    // The source password does not open the copy; the one-time password does.
    const withOld = await request(app).post("/auth/login").send({ username: teacher.email, password: PW, tenant: school.slug });
    expect(withOld.status).toBe(401);
    const login = await request(app).post("/auth/login").send({ username: teacher.email, password: pw, tenant: school.slug });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    // Without a school, the password picks the school it opens (no picker needed).
    const choose = await request(app).post("/auth/login").send({ username: teacher.email, password: PW });
    expect(choose.status).toBe(200);
    expect(choose.body.choose).toBeUndefined();
  });

  it("refuses a second copy and a forged source", async () => {
    const teacherRole = await roleId(school.tid, "TEACHER");
    const again = await request(app).post("/users/elsewhere/import").set(auth(ownerToken)).send({ identifier: teacher.email, sourceTid: 1, roles: [teacherRole] });
    expect(again.status).toBe(409);
    expect(again.body.message).toMatch(/already has an account/);
    const other = await primaryPerson("Other", "Person");
    const forged = await request(app).post("/users/elsewhere/import").set(auth(ownerToken)).send({ identifier: other.email, sourceTid: 999, roles: [teacherRole] });
    expect(forged.status).toBe(404);
  });
});

describe("platform side: search every school and assign", () => {
  it("searches by name and assigns with a role of the target school", async () => {
    const p = await primaryPerson("Jean", `Platformtest${stamp}`);
    const s = await request(app).get("/platform/people").query({ q: `Platformtest${stamp}`, forTid: school.tid }).set(auth(operator.token));
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.data).toHaveLength(1);
    expect(s.body.data[0]).toMatchObject({ tid: 1, userId: p.id, phone: "+250788123456", roles: [] });

    const roles = await request(app).get(`/platform/tenants/${school.tid}/roles`).set(auth(operator.token));
    expect(roles.status).toBe(200);
    expect(roles.body.data.map((r: any) => r.name)).not.toContain("SUPER_ADMIN");
    const staff = roles.body.data.find((r: any) => r.name === "TEACHER");

    const r = await request(app)
      .post(`/platform/tenants/${school.tid}/people`)
      .set(auth(operator.token))
      .send({ sourceTid: 1, sourceUserId: p.id, roleIds: [staff.roleId], reason: "Teaches in both schools" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    // MIS-ISO-2: platform staff get the copy's one-time password once; it is not the source's.
    expect(r.body.data.tempPassword).toMatch(/^[A-Za-z0-9]{12}$/);
    const [[cred]] = await poolFor(school.tid).query<any[]>("SELECT password_hash, force_password_change FROM AuthCredential WHERE user_id = ?", [r.body.data.userId]);
    expect(Number(cred.force_password_change)).toBe(1);
    expect(await bcrypt.compare(PW, cred.password_hash)).toBe(false);
    expect(await bcrypt.compare(r.body.data.tempPassword, cred.password_hash)).toBe(true);
    const after = await request(app).get("/platform/people").query({ q: `Platformtest${stamp}`, forTid: school.tid }).set(auth(operator.token));
    expect(after.body.data[0].alreadyInTarget).toBe(true);
  });

  it("needs the lifecycle capability and refuses SUPER_ADMIN", async () => {
    const viewer = await platformUser(["PLATFORM_TENANTS_VIEW"]);
    const p = await primaryPerson("Noel", "Viewer");
    const denied = await request(app).post(`/platform/tenants/${school.tid}/people`).set(auth(viewer.token)).send({ sourceTid: 1, sourceUserId: p.id, roleIds: [1], reason: "x x x" });
    expect(denied.status).toBe(403);
    const sa = await roleId(school.tid, "SUPER_ADMIN");
    const r = await request(app).post(`/platform/tenants/${school.tid}/people`).set(auth(operator.token)).send({ sourceTid: 1, sourceUserId: p.id, roleIds: [sa], reason: "make owner" });
    expect(r.status).toBe(400);
  });
});
