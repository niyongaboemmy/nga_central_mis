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

// Migration 048: session edit (ownership-checked full update) and the
// mentee-report approval workflow (validation_status PENDING/APPROVED/REJECTED,
// mirroring SchemeOfWork's existing validation_status convention).
describe("Mentorship session edit & mentee report approval (migration 048)", () => {
  let academicYearId: number;

  let mentorAId: number;
  let mentorAToken: string;
  let mentorBId: number;
  let mentorBToken: string;

  let studentXId: number;
  let studentXToken: string;

  let sessionId: number;

  beforeAll(async () => {
    await db.update(AcademicYear).set({ is_current: 0 });
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;

    const mentorRoleId = await createRoleWithPermissions("SESSION_EDIT_MENTOR_ROLE", [
      Permissions.TEACHER_DASHBOARD,
      Permissions.SUBMIT_REPORTING,
    ]);
    mentorAId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorAId, mentorRoleId);
    mentorAToken = signToken(mentorAId);

    mentorBId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorBId, mentorRoleId);
    mentorBToken = signToken(mentorBId);

    const studentRoleId = await createRoleWithPermissions("SESSION_EDIT_STUDENT_ROLE", [
      Permissions.SUBMIT_MENTEE_CHECKIN,
    ]);
    studentXId = await createUser({ userType: "STUDENT" });
    await assignRole(studentXId, studentRoleId);
    studentXToken = signToken(studentXId);

    const adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("SESSION_EDIT_ADMIN_ROLE", [
      Permissions.MANAGE_MENTOR_ASSIGNMENTS,
    ]);
    await assignRole(adminId, adminRoleId);
    const adminToken = signToken(adminId);

    const classGroupId = await createProgramGradeClassGroup();
    await createStudentClassGroup({ userId: studentXId, classGroupId, academicYearId });

    await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: mentorAId, student_id: studentXId, academic_year_id: academicYearId });

    const sessionRes = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ student_id: studentXId, session_date: "2026-02-01", topic: "Initial topic", duration_minutes: 30 });
    sessionId = sessionRes.body.data.mentorship_id;
  });

  // ── Session edit ──────────────────────────────────────────────────────
  it("lets the owning mentor fetch and edit their own session", async () => {
    const getRes = await request(app)
      .get(`/mentorship/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.topic).toBe("Initial topic");

    const putRes = await request(app)
      .put(`/mentorship/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ session_date: "2026-02-01", topic: "Updated topic", duration_minutes: 45, notes: "Edited notes" });
    expect(putRes.status).toBe(200);

    const afterEdit = await request(app)
      .get(`/mentorship/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(afterEdit.body.data.topic).toBe("Updated topic");
    expect(afterEdit.body.data.duration_minutes).toBe(45);
    expect(afterEdit.body.data.notes).toBe("Edited notes");
  });

  it("blocks a different mentor from reading or editing someone else's session", async () => {
    const getRes = await request(app)
      .get(`/mentorship/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${mentorBToken}`);
    expect(getRes.status).toBe(404);

    const putRes = await request(app)
      .put(`/mentorship/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${mentorBToken}`)
      .send({ session_date: "2026-02-01", topic: "Hijacked" });
    expect(putRes.status).toBe(404);
  });

  it("rejects an edit with no session_date", async () => {
    const res = await request(app)
      .put(`/mentorship/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ topic: "Missing date" });
    expect(res.status).toBe(400);
  });

  // ── Mentee report approval workflow ───────────────────────────────────
  let checkinId: number;

  it("student submits a report with a title, defaulting to PENDING validation", async () => {
    const res = await request(app)
      .post("/mentorship/checkins")
      .set("Authorization", `Bearer ${studentXToken}`)
      .send({ category: "GENERAL", title: "Need help with deadline", message: "Can we discuss an extension?" });
    expect(res.status).toBe(201);
    checkinId = res.body.data.checkin_id;

    const mine = await request(app)
      .get("/mentorship/checkins/mine")
      .set("Authorization", `Bearer ${studentXToken}`);
    const mineEntry = mine.body.data.find((c: any) => c.checkin_id === checkinId);
    expect(mineEntry.title).toBe("Need help with deadline");
    expect(mineEntry.validation_status).toBe("PENDING");
  });

  it("rejects a rejection with no comment", async () => {
    const res = await request(app)
      .patch(`/mentorship/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ validation_status: "REJECTED" });
    expect(res.status).toBe(400);
  });

  it("lets the mentor reject a report with a comment, setting status to ADDRESSED", async () => {
    const res = await request(app)
      .patch(`/mentorship/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ validation_status: "REJECTED", mentor_response: "Please resubmit with more detail." });
    expect(res.status).toBe(200);

    const mine = await request(app)
      .get("/mentorship/checkins/mine")
      .set("Authorization", `Bearer ${studentXToken}`);
    const entry = mine.body.data.find((c: any) => c.checkin_id === checkinId);
    expect(entry.validation_status).toBe("REJECTED");
    expect(entry.status).toBe("ADDRESSED");
    expect(entry.mentor_response).toBe("Please resubmit with more detail.");
  });

  it("lets the mentor approve a different report without requiring a comment", async () => {
    const submitRes = await request(app)
      .post("/mentorship/checkins")
      .set("Authorization", `Bearer ${studentXToken}`)
      .send({ category: "APPRECIATION", message: "Thank you for your help this term!" });
    const newCheckinId = submitRes.body.data.checkin_id;

    const approveRes = await request(app)
      .patch(`/mentorship/checkins/${newCheckinId}`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ validation_status: "APPROVED" });
    expect(approveRes.status).toBe(200);

    const mine = await request(app)
      .get("/mentorship/checkins/mine")
      .set("Authorization", `Bearer ${studentXToken}`);
    const entry = mine.body.data.find((c: any) => c.checkin_id === newCheckinId);
    expect(entry.validation_status).toBe("APPROVED");
    expect(entry.status).toBe("ADDRESSED");
  });

  it("blocks a different mentor from approving/rejecting someone else's mentee report", async () => {
    const res = await request(app)
      .patch(`/mentorship/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorBToken}`)
      .send({ validation_status: "APPROVED" });
    expect(res.status).toBe(404);
  });
});
