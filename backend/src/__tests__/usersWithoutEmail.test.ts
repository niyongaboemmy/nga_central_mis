import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import app from "../app";
import { db } from "../db";
import { AuthCredential, Role, School, User, UserProfile } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";

/**
 * Young students may be registered without an e-mail (migration 148), by hand or by
 * Excel upload. Such an account has no password and can't sign in; only students may
 * be saved without an e-mail. Adding an e-mail later grants sign-in.
 */
const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
let admin: string, adminId: number, studentRole: number, teacherRole: number;

/** The role named exactly `name` (user type comes from the role name). */
async function roleNamed(name: string): Promise<number> {
  const [r] = await db.select({ id: Role.role_id }).from(Role).where(eq(Role.name, name)).limit(1);
  if (r) return Number(r.id);
  const [[{ next }]] = (await db.execute(sql`SELECT COALESCE(MAX(role_id), 0) + 1 AS next FROM Role`)) as any;
  await db.insert(Role).values({ role_id: Number(next), name, status: "ACTIVE" });
  return Number(next);
}

const userByName = async (username: string) =>
  (await db.select().from(User).where(eq(User.username, username)).limit(1))[0];
const credentialOf = async (userId: number) =>
  (await db.select().from(AuthCredential).where(eq(AuthCredential.user_id, userId)).limit(1))[0];

beforeAll(async () => {
  adminId = await createUser({ userType: "ADMIN" });
  await assignRole(adminId, await createRoleWithPermissions(`users_no_email_${tag}`, ["MANAGE_USERS"]));
  admin = signToken(adminId);
  // Students get a registration number, which needs the school's code.
  const [school] = await db.select({ id: School.school_id }).from(School).where(eq(School.school_id, 1));
  if (school) await db.update(School).set({ school_code: "120823", status: "ACTIVE" }).where(eq(School.school_id, 1));
  else await db.insert(School).values({ school_id: 1, name: "Test School", school_code: "120823", status: "ACTIVE" });
  studentRole = await roleNamed("STUDENT");
  teacherRole = await roleNamed("TEACHER");
});

const create = (body: object) => request(app).post("/users").set("Authorization", `Bearer ${admin}`).send(body);
const update = (id: number, body: object) =>
  request(app).put(`/users/${id}`).set("Authorization", `Bearer ${admin}`).send(body);

describe("registering a user without an e-mail", () => {
  it("saves a student without an e-mail, with no password, and refuses their sign-in", async () => {
    const res = await create({ username: `kid1_${tag}`, first_name: "Ada", last_name: "Test", roles: [studentRole] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ can_sign_in: false });
    expect(res.body.message).toMatch(/can't sign in/);

    const u = await userByName(`kid1_${tag}`);
    expect(u.email).toBeNull();
    expect(await credentialOf(u.user_id)).toBeUndefined();
    const [p] = await db.select().from(UserProfile).where(eq(UserProfile.user_id, u.user_id));
    expect(p.user_type).toBe("STUDENT");

    // A second e-mail-less student: the UNIQUE key allows many NULLs.
    expect((await create({ username: `kid2_${tag}`, email: "", roles: [studentRole] })).status).toBe(201);

    const login = await request(app).post("/auth/login").send({ username: `kid1_${tag}`, password: "anything" });
    expect(login.status).toBe(401);
    expect(login.body.message).toMatch(/no e-mail address/);
  });

  it("still requires an e-mail for everyone else", async () => {
    const teacher = await create({ username: `t_${tag}`, roles: [teacherRole] });
    expect(teacher.status).toBe(400);
    expect(teacher.body.message).toMatch(/except students/);
    expect((await create({ username: `noone_${tag}` })).status).toBe(400);
    expect(await userByName(`t_${tag}`)).toBeUndefined();
  });

  it("grants sign-in when an e-mail is added, and takes it away when it is removed", async () => {
    await create({ username: `kid3_${tag}`, roles: [studentRole] });
    const u = await userByName(`kid3_${tag}`);

    const added = await update(u.user_id, { email: `kid3_${tag}@example.com` });
    expect(added.status).toBe(200);
    expect(added.body.data).toMatchObject({ can_sign_in: true });
    expect(added.body.message).toMatch(/temporary password/);
    expect(await credentialOf(u.user_id)).toMatchObject({ force_password_change: 1 });

    const removed = await update(u.user_id, { email: null });
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({ can_sign_in: false });
    const after = await userByName(`kid3_${tag}`);
    expect(after.email).toBeNull();
    expect(after.token_version).toBeGreaterThan(u.token_version ?? 0);
    expect(await credentialOf(u.user_id)).toBeUndefined();
  });

  it("does not remove a non-student's e-mail, or your own", async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    const res = await update(teacherId, { email: "" });
    expect(res.status).toBe(400);
    expect((await db.select().from(User).where(eq(User.user_id, teacherId)))[0].email).not.toBeNull();
    expect((await update(adminId, { email: null })).status).toBe(400);
    // Other edits that leave the e-mail out don't touch it.
    expect((await update(teacherId, { phone_number: "0788000000" })).status).toBe(200);
    expect((await db.select().from(User).where(eq(User.user_id, teacherId)))[0].email).not.toBeNull();
  });
});

describe("Excel upload without e-mails", () => {
  const sheet = (rows: object[]) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Users");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  };
  const upload = (roleId: number, buf: Buffer) =>
    request(app)
      .post("/users/bulk")
      .set("Authorization", `Bearer ${admin}`)
      .field("role_id", String(roleId))
      .attach("file", buf, "users.xlsx");

  it("creates students with and without e-mails and says who can't sign in", async () => {
    const res = await upload(
      studentRole,
      sheet([
        { username: `bk1_${tag}`, email: "", first_name: "A" },
        { username: `bk2_${tag}`, email: `bk2_${tag}@example.com`, first_name: "B" },
        { username: `bk3_${tag}`, first_name: "C" },
        { username: "", email: "", first_name: "D" },
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ success: 3, failed: 1, without_email: 2 });
    expect(res.body.message).toMatch(/2 without an e-mail/);
    expect(res.body.data.errors[0]).toMatch(/Row 5: Missing required field \(username\)/);

    const bk1 = await userByName(`bk1_${tag}`);
    const bk2 = await userByName(`bk2_${tag}`);
    expect(bk1.email).toBeNull();
    expect(await credentialOf(bk1.user_id)).toBeUndefined();
    expect(await credentialOf(bk2.user_id)).toBeDefined();
  });

  it("refuses rows without an e-mail for non-students", async () => {
    const res = await upload(teacherRole, sheet([{ username: `bt1_${tag}`, email: "" }]));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ success: 0, failed: 1 });
    expect(res.body.data.errors[0]).toMatch(/Missing e-mail/);
    expect(await userByName(`bt1_${tag}`)).toBeUndefined();
  });
});
