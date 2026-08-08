import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { AcademicYear } from "../db/schema";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createStudentClassGroup,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// AI insights endpoint's guard rails — these must reject *before* ever
// calling Gemini, so they're testable without a real (or mocked) API key.
describe("Mentee AI insights — guard rails", () => {
  let academicYearId: number;
  let mentorAId: number;
  let mentorAToken: string;
  let mentorBId: number;
  let mentorBToken: string;
  let studentXId: number;

  beforeAll(async () => {
    await db.update(AcademicYear).set({ is_current: 0 });
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;

    const adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("AI_ADMIN_ROLE", [
      Permissions.MANAGE_MENTOR_ASSIGNMENTS,
    ]);
    await assignRole(adminId, adminRoleId);
    const adminToken = signToken(adminId);

    const mentorRoleId = await createRoleWithPermissions("AI_MENTOR_ROLE", [
      Permissions.TEACHER_DASHBOARD,
    ]);
    mentorAId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorAId, mentorRoleId);
    mentorAToken = signToken(mentorAId);

    mentorBId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorBId, mentorRoleId);
    mentorBToken = signToken(mentorBId);

    studentXId = await createUser({ userType: "STUDENT" });

    const classGroupId = await createProgramGradeClassGroup();
    await createStudentClassGroup({ userId: studentXId, classGroupId, academicYearId });

    await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: mentorAId, student_id: studentXId, academic_year_id: academicYearId });
  });

  it("rejects a mentor who isn't this student's assigned mentor", async () => {
    const res = await request(app)
      .post(`/mentorship/students/${studentXId}/ai-insights`)
      .set("Authorization", `Bearer ${mentorBToken}`)
      .send({});
    expect(res.status).toBe(404);
  });

  it("rejects an invalid student ID", async () => {
    const res = await request(app)
      .post("/mentorship/students/not-a-number/ai-insights")
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("rejects the assigned mentor when Gemini isn't configured, or when no sessions exist yet — either way, it never reaches the AI call unsafely", async () => {
    const res = await request(app)
      .post(`/mentorship/students/${studentXId}/ai-insights`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({});
    // Either guard can fire first depending on whether GEMINI_API_KEY is set
    // in this environment — both are the same class of "safe rejection,"
    // never a 500 from an unguarded Gemini call.
    expect(res.status).toBe(400);
    expect(typeof res.body.message).toBe("string");
  });
});
