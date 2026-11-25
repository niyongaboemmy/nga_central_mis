/**
 * One person, several schools (services/tenantMgmt/crossSchool.ts):
 * a school admin finds a person of another school by exact e-mail and adds them
 * with a role of their own school (same password); platform staff search every
 * school and assign.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  it("adds them with a role of this school; the same password signs in there", async () => {
    const teacherRole = await roleId(school.tid, "TEACHER");
    expect(teacherRole).toBeGreaterThan(0);
    const r = await request(app).post("/users/elsewhere/import").set(auth(ownerToken)).send({ identifier: teacher.email, sourceTid: 1, roles: [teacherRole] });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.data.roles).toEqual(["TEACHER"]);
    const [[u]] = await poolFor(school.tid).query<any[]>(
      "SELECT u.email, p.first_name, p.user_type FROM `User` u JOIN UserProfile p ON p.user_id = u.user_id WHERE u.user_id = ?",
      [r.body.data.userId],
    );
    expect(u).toMatchObject({ email: teacher.email, first_name: "Grace", user_type: "TEACHER" });
    invalidateTenants();
    const login = await request(app).post("/auth/login").send({ username: teacher.email, password: PW, tenant: school.slug });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    // Without a school, the sign-in asks which one.
    const choose = await request(app).post("/auth/login").send({ username: teacher.email, password: PW });
    expect(choose.body.choose?.map((c: any) => c.tid).sort()).toEqual([1, school.tid].sort());
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
