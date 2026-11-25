import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AuthCredential, System, User, UserProfile } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { assignTestSystems } from "../test/systems";

// Staff attendance clock (Tendo /c/<school>): Tendo verifies a Google ID token and
// asks MIS which account in this school that Google account is. Matching: the
// Google account id (sub), then the account e-mail, then an attendance e-mail the
// person or an admin named (migration 149). Accounts are never created.
describe("POST /users/service/staff-identity", () => {
  const tag = `si${Date.now().toString(36)}`;
  const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const clientId = `tendo_clock_${tag}`;
  const auth = basic(clientId, "s3cret");
  let teacherId: number;
  let studentId: number;
  let otherId: number;
  let adminToken: string;

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    await db.update(UserProfile).set({ first_name: "Grace", last_name: tag }).where(eq(UserProfile.user_id, teacherId));
    await db.update(User).set({ email: `grace.${tag}@gmail.com` }).where(eq(User.user_id, teacherId));
    studentId = await createUser({ userType: "STUDENT" });
    await db.update(User).set({ email: `kid.${tag}@gmail.com` }).where(eq(User.user_id, studentId));
    otherId = await createUser({ userType: "STAFF" });
    await db.update(User).set({ email: `office.${tag}@school.rw` }).where(eq(User.user_id, otherId));
    const adminId = await createUser({ userType: "ADMIN" });
    await assignRole(adminId, await createRoleWithPermissions(`SI_ADMIN_${tag}`, ["MANAGE_USERS"]));
    adminToken = signToken(adminId);
    await db.insert(System).values({ name: `Tendo clock ${tag}`, client_id: clientId, client_secret: "s3cret", icon_url: "x", home_url: "x", status: "ACTIVE" } as any);
    await assignTestSystems(clientId);
  });

  it("refuses callers without client credentials", async () => {
    const res = await request(app).post("/users/service/staff-identity").send({ google_sub: "1", google_email: "a@b.co" });
    expect(res.status).toBe(401);
  });

  it("matches by e-mail the first time, remembers the Google id, then matches by it", async () => {
    const first = await request(app).post("/users/service/staff-identity").set("Authorization", auth)
      .send({ google_sub: `sub-${tag}`, google_email: `Grace.${tag}@gmail.com` });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ user_id: teacherId, name: `Grace ${tag}`, is_student: false, status: "ACTIVE", matched_by: "email" });
    const [cred] = await db.select().from(AuthCredential).where(eq(AuthCredential.user_id, teacherId));
    expect(cred.google_id).toBe(`sub-${tag}`);
    // The person later changes their Gmail address: the account id still matches.
    const again = await request(app).post("/users/service/staff-identity").set("Authorization", auth)
      .send({ google_sub: `sub-${tag}`, google_email: `renamed.${tag}@gmail.com` });
    expect(again.body.data).toMatchObject({ user_id: teacherId, matched_by: "google_id" });
  });

  it("flags students and answers NO_MATCH for unknown Google accounts", async () => {
    const kid = await request(app).post("/users/service/staff-identity").set("Authorization", auth)
      .send({ google_sub: `kid-${tag}`, google_email: `kid.${tag}@gmail.com` });
    expect(kid.body.data).toMatchObject({ user_id: studentId, is_student: true });
    const none = await request(app).post("/users/service/staff-identity").set("Authorization", auth)
      .send({ google_sub: `x-${tag}`, google_email: `nobody.${tag}@gmail.com` });
    expect(none.status).toBe(404);
    expect(none.body.code).toBe("NO_MATCH");
  });

  it("an admin names a different Google e-mail for attendance; it matches until changed", async () => {
    const set = await request(app).put(`/users/${otherId}/attendance-google`).set("Authorization", `Bearer ${adminToken}`)
      .send({ email: `office.phone.${tag}@gmail.com` });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ linked: true, google_email: `office.phone.${tag}@gmail.com`, verified: false });
    const res = await request(app).post("/users/service/staff-identity").set("Authorization", auth)
      .send({ google_sub: `office-${tag}`, google_email: `office.phone.${tag}@gmail.com` });
    expect(res.body.data).toMatchObject({ user_id: otherId, matched_by: "google_email" });
    // Someone else's address cannot be taken.
    const clash = await request(app).put(`/users/${otherId}/attendance-google`).set("Authorization", `Bearer ${adminToken}`)
      .send({ email: `grace.${tag}@gmail.com` });
    expect(clash.status).toBe(409);
    // Clearing it forgets the account id too.
    await request(app).put(`/users/${otherId}/attendance-google`).set("Authorization", `Bearer ${adminToken}`).send({ email: null });
    const [cred] = await db.select().from(AuthCredential).where(eq(AuthCredential.user_id, otherId));
    expect(cred.google_id).toBeNull();
  });

  it("a person reads and unlinks their own attendance account", async () => {
    const token = signToken(teacherId);
    const mine = await request(app).get("/users/me/attendance-google").set("Authorization", `Bearer ${token}`);
    expect(mine.body.data).toMatchObject({ linked: true, verified: true });
    const off = await request(app).delete("/users/me/attendance-google").set("Authorization", `Bearer ${token}`);
    expect(off.body.data).toMatchObject({ linked: false });
    const rows: any = await db.execute(sql`SELECT google_id FROM AuthCredential WHERE user_id = ${teacherId}`);
    expect((Array.isArray(rows[0]) ? rows[0] : rows)[0].google_id).toBeNull();
  });
});
