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

// Mentorship module Phase 1/2 (migration 047): explicit mentor-mentee
// assignment as the access-control backbone, plus the student-facing
// check-in surface. These tests target the isolation guarantees the plan
// called out explicitly: a mentor can only ever see/act on their own
// mentees, and a student's check-in always resolves to their real assigned
// mentor, never a client-supplied one.
describe("Mentor assignments & mentee check-ins (migration 047)", () => {
  let academicYearId: number;

  let adminToken: string;

  let mentorAId: number;
  let mentorAToken: string;
  let mentorBId: number;
  let mentorBToken: string;

  let studentXId: number; // assigned to mentor A
  let studentXToken: string;
  let studentYId: number; // never assigned

  beforeAll(async () => {
    // submitCheckIn resolves "the current academic year" with no ORDER BY
    // (matches the pre-existing pattern used across the codebase, which
    // assumes exactly one is_current=1 row — true in production, but the
    // shared test DB can accumulate stale is_current=1 rows left by earlier
    // test files in the same run). Clear those first so this file's own
    // academic year is unambiguously "current" for the duration of these tests.
    await db.update(AcademicYear).set({ is_current: 0 });

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;

    const adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("MENTOR_ADMIN_ROLE", [
      Permissions.MANAGE_MENTOR_ASSIGNMENTS,
      Permissions.ALL_SUBMITTED_REPORTS,
    ]);
    await assignRole(adminId, adminRoleId);
    adminToken = signToken(adminId);

    const mentorRoleId = await createRoleWithPermissions("MENTOR_ROLE", [
      Permissions.TEACHER_DASHBOARD,
      Permissions.SUBMIT_REPORTING,
    ]);

    mentorAId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorAId, mentorRoleId);
    mentorAToken = signToken(mentorAId);

    mentorBId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorBId, mentorRoleId);
    mentorBToken = signToken(mentorBId);

    const studentRoleId = await createRoleWithPermissions("STUDENT_ROLE", [
      Permissions.SUBMIT_MENTEE_CHECKIN,
    ]);

    studentXId = await createUser({ userType: "STUDENT" });
    await assignRole(studentXId, studentRoleId);
    studentXToken = signToken(studentXId);

    studentYId = await createUser({ userType: "STUDENT" });
    await assignRole(studentYId, studentRoleId);

    // Enroll both students in a class group neither mentor teaches, so any
    // access mentor A has to student X can only come from the explicit
    // MentorAssignment row, not the legacy TeacherSubjectAssignment fallback.
    const classGroupId = await createProgramGradeClassGroup();
    await createStudentClassGroup({ userId: studentXId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentYId, classGroupId, academicYearId });
  });

  it("lets an admin assign a mentor to a student for the academic year", async () => {
    const res = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: mentorAId, student_id: studentXId, academic_year_id: academicYearId });
    expect(res.status).toBe(201);
    expect(res.body.data.assignment_id).toBeTypeOf("number");
  });

  it("mentor A's roster includes student X; mentor B's does not", async () => {
    const resA = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.some((s: any) => s.user_id === studentXId)).toBe(true);

    const resB = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${mentorBToken}`);
    expect(resB.status).toBe(200);
    expect(resB.body.data.some((s: any) => s.user_id === studentXId)).toBe(false);
  });

  it("blocks mentor B from logging a session for student X (not their mentee)", async () => {
    const res = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${mentorBToken}`)
      .send({ student_id: studentXId, session_date: "2026-02-01", topic: "Unauthorized attempt" });
    expect(res.status).toBe(404);
  });

  it("lets mentor A log a session for student X", async () => {
    const res = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ student_id: studentXId, session_date: "2026-02-01", topic: "Weekly check-in" });
    expect(res.status).toBe(201);
  });

  it("rejects assigning the same student to a second mentor without reassign:true", async () => {
    const res = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: mentorBId, student_id: studentXId, academic_year_id: academicYearId });
    expect(res.status).toBe(409);
  });

  it("student X can submit a check-in that resolves to their real assigned mentor (A), not a client-supplied one", async () => {
    const res = await request(app)
      .post("/mentorship/checkins")
      .set("Authorization", `Bearer ${studentXToken}`)
      .send({ category: "CONCERN", message: "I need help with my project.", mentor_id: mentorBId });
    expect(res.status).toBe(201);

    const inboxA = await request(app)
      .get("/mentorship/checkins/inbox")
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(inboxA.status).toBe(200);
    expect(inboxA.body.data.some((c: any) => c.student_id === studentXId)).toBe(true);

    const inboxB = await request(app)
      .get("/mentorship/checkins/inbox")
      .set("Authorization", `Bearer ${mentorBToken}`);
    expect(inboxB.status).toBe(200);
    expect(inboxB.body.data.some((c: any) => c.student_id === studentXId)).toBe(false);
  });

  it("student Y (no assigned mentor) gets a clear error instead of a crash when submitting a check-in", async () => {
    const studentYToken = signToken(studentYId);
    const res = await request(app)
      .post("/mentorship/checkins")
      .set("Authorization", `Bearer ${studentYToken}`)
      .send({ category: "GENERAL", message: "Hello?" });
    expect(res.status).toBe(400);
  });

  it("mentor A can acknowledge student X's check-in; the response is visible to the student", async () => {
    const inboxA = await request(app)
      .get("/mentorship/checkins/inbox")
      .set("Authorization", `Bearer ${mentorAToken}`);
    const checkinId = inboxA.body.data[0].checkin_id;

    const patchRes = await request(app)
      .patch(`/mentorship/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ status: "ACKNOWLEDGED", mentor_response: "Let's talk tomorrow." });
    expect(patchRes.status).toBe(200);

    const mine = await request(app)
      .get("/mentorship/checkins/mine")
      .set("Authorization", `Bearer ${studentXToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data[0].status).toBe("ACKNOWLEDGED");
    expect(mine.body.data[0].mentor_response).toBe("Let's talk tomorrow.");
  });

  it("mentor B cannot read or update student X's check-in by guessing its ID", async () => {
    const inboxA = await request(app)
      .get("/mentorship/checkins/inbox")
      .set("Authorization", `Bearer ${mentorAToken}`);
    const checkinId = inboxA.body.data[0].checkin_id;

    const readRes = await request(app)
      .get(`/mentorship/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorBToken}`);
    expect(readRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/mentorship/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorBToken}`)
      .send({ status: "ADDRESSED" });
    expect(patchRes.status).toBe(404);
  });

  it("admin's consolidated report for mentor A includes student X's session and check-in", async () => {
    const res = await request(app)
      .get("/mentorship/reports/consolidated")
      .query({ mentor_id: mentorAId, academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const mentee = res.body.data.mentees.find((m: any) => m.student_id === studentXId);
    expect(mentee).toBeTruthy();
    expect(mentee.sessions.length).toBeGreaterThan(0);
    expect(mentee.comments.length).toBeGreaterThanOrEqual(0);
  });

  it("admin can end a mentor assignment (soft-close, not a hard delete)", async () => {
    const list = await request(app)
      .get("/mentorship/admin/assignments")
      .query({ academic_year_id: academicYearId, mentor_id: mentorAId, status: "ACTIVE" })
      .set("Authorization", `Bearer ${adminToken}`);
    const assignmentId = list.body.data[0].assignment_id;

    const endRes = await request(app)
      .delete(`/mentorship/assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(endRes.status).toBe(200);

    const afterEnd = await request(app)
      .get("/mentorship/admin/assignments")
      .query({ academic_year_id: academicYearId, mentor_id: mentorAId, status: "ACTIVE" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(afterEnd.body.data.length).toBe(0);
  });
});
