import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { ActivityLog, UserProfile } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";

/**
 * Editing a student's registration number (PUT /users/:id/profile): only with
 * MANAGE_USERS, only for students, unique, never emptied, and logged.
 */
let manager: number, profileEditor: number, student: number, other: number, teacher: number;
const RUN = String(Date.now()).slice(-6);

beforeAll(async () => {
  manager = await createUser({ userType: "ADMIN" });
  await assignRole(manager, await createRoleWithPermissions(`reg_manager_${RUN}`, ["MANAGE_USERS", "UPDATE_USER_PROFILE_INFO"]));
  profileEditor = await createUser({ userType: "STAFF" });
  await assignRole(profileEditor, await createRoleWithPermissions(`reg_profile_${RUN}`, ["UPDATE_USER_PROFILE_INFO"]));
  student = await createUser({ userType: "STUDENT" });
  other = await createUser({ userType: "STUDENT" });
  teacher = await createUser({ userType: "TEACHER" });
  await db.update(UserProfile).set({ registration_number: `OLD-${RUN}` }).where(eq(UserProfile.user_id, student));
  await db.update(UserProfile).set({ registration_number: `TAKEN-${RUN}` }).where(eq(UserProfile.user_id, other));
});

const put = (as: number, id: number, body: object) => request(app).put(`/users/${id}/profile`).set("Authorization", `Bearer ${signToken(as)}`).send(body);
const regOf = async (id: number) => (await db.select().from(UserProfile).where(eq(UserProfile.user_id, id)))[0]?.registration_number;

describe("editing a student's registration number", () => {
  it("changes it with MANAGE_USERS, and logs the change", async () => {
    const res = await put(manager, student, { registration_number: ` 3304-${RUN} ` });
    expect(res.status).toBe(200);
    expect(await regOf(student)).toBe(`3304-${RUN}`);
    const logs = await db.select().from(ActivityLog).where(eq(ActivityLog.user_id, student));
    expect(logs.some((l: any) => l.action_type === "REGISTRATION_NUMBER_CHANGE" && String(l.description).includes(`OLD-${RUN}`))).toBe(true);
  });

  it("refuses without MANAGE_USERS, duplicates, empty or malformed numbers, and non-students", async () => {
    expect((await put(profileEditor, student, { registration_number: `X-${RUN}` })).status).toBe(403);
    const dup = await put(manager, student, { registration_number: `TAKEN-${RUN}` });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toContain("already used");
    expect((await put(manager, student, { registration_number: "  " })).status).toBe(400);
    expect((await put(manager, student, { registration_number: "has space" })).status).toBe(400);
    expect((await put(manager, student, { registration_number: "x".repeat(21) })).status).toBe(400);
    expect((await put(manager, teacher, { registration_number: `T-${RUN}` })).status).toBe(400);
    expect(await regOf(student)).toBe(`3304-${RUN}`);
    // Other profile fields still save without the number.
    expect((await put(profileEditor, student, { address: "Kigali" })).status).toBe(200);
  });
});
