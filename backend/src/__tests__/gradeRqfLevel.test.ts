import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { ClassGroup, Grade } from "../db/schema";
import { assignRole, createProgramGradeClassGroup, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";

/**
 * Grade.rqf_level (migration 145): set on a grade by MANAGE_ACADEMICS,
 * validated, and listed with every class group (grade_rqf_level), which
 * is where Task Mentor reads a learner's level for the report card.
 */
let admin: number, teacher: number, classGroupId: number, gradeId: number;

beforeAll(async () => {
  admin = await createUser({ userType: "ADMIN" });
  await assignRole(admin, await createRoleWithPermissions("academics_admin_rqf", ["MANAGE_ACADEMICS"]));
  teacher = await createUser({ userType: "TEACHER" });
  classGroupId = await createProgramGradeClassGroup();
  const [cg] = await db.select().from(ClassGroup).where(eq(ClassGroup.class_group_id, classGroupId));
  gradeId = Number(cg.grade_id);
});

describe("grade RQF level", () => {
  it("is set with MANAGE_ACADEMICS (\"Level 4\" or 4), validated, and listed with class groups", async () => {
    const put = (u: number, body: object) => request(app).put(`/academics/grades/${gradeId}`).set("Authorization", `Bearer ${signToken(u)}`).send(body);
    expect((await put(teacher, { rqf_level: 3 })).status).toBe(403);
    expect((await put(admin, { rqf_level: "Level 4" })).status).toBe(200);
    let [g] = await db.select().from(Grade).where(eq(Grade.grade_id, gradeId));
    expect((g as any).rqf_level).toBe(4);
    expect((await put(admin, { rqf_level: 9 })).status).toBe(400);
    expect((await put(admin, { rqf_level: "abc" })).status).toBe(400);

    const list = await request(app).get("/academics/class-groups").set("Authorization", `Bearer ${signToken(admin)}`);
    expect(list.status).toBe(200);
    const row = (list.body.data as any[]).find((r) => r.class_group_id === classGroupId);
    expect(row?.grade_rqf_level).toBe(4);
    const grades = await request(app).get("/academics/grades").set("Authorization", `Bearer ${signToken(admin)}`);
    expect((grades.body.data as any[]).find((r) => r.grade_id === gradeId)?.rqf_level).toBe(4);

    expect((await put(admin, { rqf_level: null })).status).toBe(200);
    [g] = await db.select().from(Grade).where(eq(Grade.grade_id, gradeId));
    expect((g as any).rqf_level).toBeNull();
  });
});
