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

// Mentor-wide period reports, admin-level check-in approval, and the
// school-wide mentorship dashboard — the "view all reports by selected
// period range" / "Admins: ... approvals ... dashboard" requirements.
describe("Mentor period reports, admin approvals & mentorship dashboard", () => {
  let academicYearId: number;

  let adminId: number;
  let adminToken: string;

  let mentorAId: number;
  let mentorAToken: string;
  let mentorBId: number;
  let mentorBToken: string;

  let studentXId: number;
  let studentXToken: string;

  beforeAll(async () => {
    await db.update(AcademicYear).set({ is_current: 0 });
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;

    adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("REPORTS_ADMIN_ROLE", [
      Permissions.MANAGE_MENTOR_ASSIGNMENTS,
      Permissions.MANAGE_REPORTS,
      Permissions.ALL_SUBMITTED_REPORTS,
      Permissions.VIEW_REPORTS,
    ]);
    await assignRole(adminId, adminRoleId);
    adminToken = signToken(adminId);

    const mentorRoleId = await createRoleWithPermissions("REPORTS_MENTOR_ROLE", [
      Permissions.TEACHER_DASHBOARD,
      Permissions.SUBMIT_REPORTING,
    ]);
    mentorAId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorAId, mentorRoleId);
    mentorAToken = signToken(mentorAId);

    mentorBId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorBId, mentorRoleId);
    mentorBToken = signToken(mentorBId);

    const studentRoleId = await createRoleWithPermissions("REPORTS_STUDENT_ROLE", [
      Permissions.SUBMIT_MENTEE_CHECKIN,
    ]);
    studentXId = await createUser({ userType: "STUDENT" });
    await assignRole(studentXId, studentRoleId);
    studentXToken = signToken(studentXId);

    const classGroupId = await createProgramGradeClassGroup();
    await createStudentClassGroup({ userId: studentXId, classGroupId, academicYearId });

    await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: mentorAId, student_id: studentXId, academic_year_id: academicYearId });

    await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({
        student_id: studentXId,
        session_date: "2026-02-10",
        topic: "Mid-term check-in",
        duration_minutes: 30,
        academic_year_id: academicYearId,
      });

    await request(app)
      .post("/mentorship/checkins")
      .set("Authorization", `Bearer ${studentXToken}`)
      .send({ category: "CONCERN", title: "Need help", message: "Struggling with deadlines." });
  });

  // ── Mentor period report ──────────────────────────────────────────────
  it("returns the mentor's own sessions within the requested session date range", async () => {
    const res = await request(app)
      .get("/mentorship/reports/my-sessions")
      .query({ start_date: "2026-02-01", end_date: "2026-02-28" })
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessions.length).toBe(1);
    expect(res.body.data.sessions[0].student_name).toContain("Test");
    expect(res.body.data.summary.total_sessions).toBe(1);
  });

  it("returns the mentor's own check-ins when the range covers today (submitted_at defaults to now)", async () => {
    const res = await request(app)
      .get("/mentorship/reports/my-sessions")
      .query({ start_date: "2020-01-01", end_date: "2030-01-01" })
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.checkins.length).toBe(1);
    expect(res.body.data.summary.pending_checkins).toBe(1);
  });

  it("excludes sessions outside the requested date range", async () => {
    const res = await request(app)
      .get("/mentorship/reports/my-sessions")
      .query({ start_date: "2026-03-01", end_date: "2026-03-31" })
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessions.length).toBe(0);
  });

  it("never leaks mentor A's sessions into mentor B's period report", async () => {
    const res = await request(app)
      .get("/mentorship/reports/my-sessions")
      .query({ start_date: "2026-02-01", end_date: "2026-02-28" })
      .set("Authorization", `Bearer ${mentorBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessions.length).toBe(0);
    expect(res.body.data.checkins.length).toBe(0);
  });

  // ── Admin-level approval ───────────────────────────────────────────────
  let checkinId: number;

  it("lets an admin (not the mentor) approve a mentee check-in directly", async () => {
    const inbox = await request(app)
      .get("/mentorship/admin/checkins")
      .query({ mentor_id: mentorAId })
      .set("Authorization", `Bearer ${adminToken}`);
    checkinId = inbox.body.data[0].checkin_id;

    const res = await request(app)
      .patch(`/mentorship/admin/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ validation_status: "APPROVED" });
    expect(res.status).toBe(200);

    const mine = await request(app)
      .get("/mentorship/checkins/mine")
      .set("Authorization", `Bearer ${studentXToken}`);
    expect(mine.body.data.find((c: any) => c.checkin_id === checkinId).validation_status).toBe("APPROVED");
  });

  it("still requires a comment for an admin rejection", async () => {
    const res = await request(app)
      .patch(`/mentorship/admin/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ validation_status: "REJECTED" });
    expect(res.status).toBe(400);
  });

  it("blocks a mentor (without MANAGE_REPORTS) from using the admin approval route", async () => {
    const res = await request(app)
      .patch(`/mentorship/admin/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorAToken}`)
      .send({ validation_status: "APPROVED" });
    expect(res.status).toBe(403);
  });

  // ── Admin mentorship dashboard ─────────────────────────────────────────
  it("aggregates school-wide mentorship stats for the admin dashboard", async () => {
    // Wide enough to cover both the backdated session (Feb 2026) and the
    // check-in, whose submitted_at defaults to the real "now" of the test run.
    const res = await request(app)
      .get("/mentorship/admin/dashboard")
      .query({ academic_year_id: academicYearId, start_date: "2020-01-01", end_date: "2030-01-01" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totals.total_sessions).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totals.total_mentees).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totals.total_mentors).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totals.total_checkins).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totals.approved_checkins).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.data.top_mentors)).toBe(true);
  });

  it("rejects the dashboard for a caller without VIEW_REPORTS/ALL_SUBMITTED_REPORTS", async () => {
    const res = await request(app)
      .get("/mentorship/admin/dashboard")
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(res.status).toBe(403);
  });

  // ── Consolidated report — cross-mentor access control ──────────────────
  // The route is guarded by authorize([TEACHER_DASHBOARD, MANAGE_REPORTS,
  // ALL_SUBMITTED_REPORTS, VIEW_REPORTS]) (OR-logic), which every mentor
  // satisfies via TEACHER_DASHBOARD alone. Without a controller-level check,
  // a plain mentor could pass ?mentor_id=<someone else> and read that
  // mentor's full consolidated report.
  it("blocks a plain mentor from viewing another mentor's consolidated report via ?mentor_id", async () => {
    const res = await request(app)
      .get("/mentorship/reports/consolidated")
      .query({ mentor_id: mentorAId, academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${mentorBToken}`);
    expect(res.status).toBe(403);
  });

  it("still lets a mentor view their own consolidated report", async () => {
    const res = await request(app)
      .get("/mentorship/reports/consolidated")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${mentorAToken}`);
    expect(res.status).toBe(200);
  });

  it("lets an admin (with VIEW_REPORTS) view any mentor's consolidated report via ?mentor_id", async () => {
    const res = await request(app)
      .get("/mentorship/reports/consolidated")
      .query({ mentor_id: mentorAId, academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.mentees.length).toBeGreaterThanOrEqual(1);
  });
});
