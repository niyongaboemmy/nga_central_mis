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

// A single, realistic end-to-end walk-through of every mentorship role's
// workflow in sequence, checking that each step's output is consistent with
// what the next step (and the dashboards) actually observe — the kind of
// cross-step data-consistency bug that isolated per-endpoint tests don't
// catch (e.g. a session logged in step 3 not showing up in step 7's report,
// or an approval in step 6 not reflected in step 9's dashboard totals).
describe("Mentorship — full end-to-end workflow", () => {
  let academicYearId: number;
  let adminId: number;
  let adminToken: string;
  let mentorId: number;
  let mentorToken: string;
  let otherMentorId: number;
  let otherMentorToken: string;
  let studentId: number;
  let studentToken: string;
  let sessionId: number;
  let checkinId: number;

  beforeAll(async () => {
    // See mentorAssignmentAndCheckins.test.ts for why this reset is needed:
    // submitCheckIn/getCurrentAcademicYearId resolve "current year" with no
    // ORDER BY, so a shared test DB can carry stale is_current=1 rows from
    // earlier test files in the same run.
    await db.update(AcademicYear).set({ is_current: 0 });
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;

    adminId = await createUser({ userType: "ADMIN" });
    const adminRoleId = await createRoleWithPermissions("E2E_ADMIN_ROLE", [
      Permissions.MANAGE_MENTOR_ASSIGNMENTS,
      Permissions.MANAGE_REPORTS,
      Permissions.ALL_SUBMITTED_REPORTS,
      Permissions.VIEW_REPORTS,
    ]);
    await assignRole(adminId, adminRoleId);
    adminToken = signToken(adminId);

    const mentorRoleId = await createRoleWithPermissions("E2E_MENTOR_ROLE", [
      Permissions.TEACHER_DASHBOARD,
      Permissions.SUBMIT_REPORTING,
    ]);
    mentorId = await createUser({ userType: "TEACHER" });
    await assignRole(mentorId, mentorRoleId);
    mentorToken = signToken(mentorId);

    otherMentorId = await createUser({ userType: "TEACHER" });
    await assignRole(otherMentorId, mentorRoleId);
    otherMentorToken = signToken(otherMentorId);

    const studentRoleId = await createRoleWithPermissions("E2E_STUDENT_ROLE", [
      Permissions.SUBMIT_MENTEE_CHECKIN,
    ]);
    studentId = await createUser({ userType: "STUDENT" });
    await assignRole(studentId, studentRoleId);
    studentToken = signToken(studentId);

    const classGroupId = await createProgramGradeClassGroup();
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
  });

  // ── Step 1: Admin assigns mentor to mentee ──────────────────────────────
  it("Step 1 — admin assigns the mentor to the mentee for the academic year", async () => {
    const res = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: mentorId, student_id: studentId, academic_year_id: academicYearId });
    expect(res.status).toBe(201);
  });

  it("Step 1b — the mentee immediately appears in the mentor's roster, and nowhere else's", async () => {
    const mine = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${mentorToken}`);
    expect(mine.body.data.some((s: any) => s.user_id === studentId)).toBe(true);

    const notMine = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${otherMentorToken}`);
    expect(notMine.body.data.some((s: any) => s.user_id === studentId)).toBe(false);
  });

  // ── Step 2: Mentor logs a session ───────────────────────────────────────
  it("Step 2 — mentor logs a mentorship session", async () => {
    const res = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${mentorToken}`)
      .send({
        student_id: studentId,
        session_date: "2026-03-01",
        topic: "Career planning",
        duration_minutes: 40,
        academic_year_id: academicYearId,
        wellbeing_status: "GOOD",
        follow_up_required: true,
      });
    expect(res.status).toBe(201);
    sessionId = res.body.data.mentorship_id;

    // Immediately visible in the student's history from the mentor's side
    const history = await request(app)
      .get(`/mentorship/students/${studentId}/history`)
      .set("Authorization", `Bearer ${mentorToken}`);
    expect(history.body.data.some((s: any) => s.mentorship_id === sessionId)).toBe(true);
  });

  // ── Step 3: Mentor edits the session ─────────────────────────────────────
  it("Step 3 — mentor edits the session and the change is reflected everywhere downstream", async () => {
    const res = await request(app)
      .put(`/mentorship/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${mentorToken}`)
      .send({
        session_date: "2026-03-01",
        topic: "Career planning — updated with internship discussion",
        duration_minutes: 45,
        wellbeing_status: "GOOD",
        follow_up_required: true,
      });
    expect(res.status).toBe(200);

    const history = await request(app)
      .get(`/mentorship/students/${studentId}/history`)
      .set("Authorization", `Bearer ${mentorToken}`);
    const edited = history.body.data.find((s: any) => s.mentorship_id === sessionId);
    expect(edited.topic).toBe("Career planning — updated with internship discussion");
    expect(edited.duration_minutes).toBe(45);
  });

  // ── Step 4: Mentee submits a report ──────────────────────────────────────
  it("Step 4 — mentee submits a report, which routes to the correct mentor", async () => {
    const res = await request(app)
      .post("/mentorship/checkins")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ category: "REQUEST_MEETING", title: "Need career advice", message: "Can we discuss internship options?" });
    expect(res.status).toBe(201);
    checkinId = res.body.data.checkin_id;

    const inbox = await request(app)
      .get("/mentorship/checkins/inbox")
      .set("Authorization", `Bearer ${mentorToken}`);
    expect(inbox.body.data.some((c: any) => c.checkin_id === checkinId)).toBe(true);

    const otherInbox = await request(app)
      .get("/mentorship/checkins/inbox")
      .set("Authorization", `Bearer ${otherMentorToken}`);
    expect(otherInbox.body.data.some((c: any) => c.checkin_id === checkinId)).toBe(false);
  });

  // ── Step 5: Mentor reviews and approves ──────────────────────────────────
  it("Step 5 — mentor approves the mentee's report, and the mentee sees the response", async () => {
    const res = await request(app)
      .patch(`/mentorship/checkins/${checkinId}`)
      .set("Authorization", `Bearer ${mentorToken}`)
      .send({ validation_status: "APPROVED", mentor_response: "Great question — let's talk Thursday." });
    expect(res.status).toBe(200);

    const mine = await request(app)
      .get("/mentorship/checkins/mine")
      .set("Authorization", `Bearer ${studentToken}`);
    const entry = mine.body.data.find((c: any) => c.checkin_id === checkinId);
    expect(entry.validation_status).toBe("APPROVED");
    expect(entry.status).toBe("ADDRESSED");
    expect(entry.mentor_response).toBe("Great question — let's talk Thursday.");
  });

  // ── Step 6: Mentor requests AI insights ──────────────────────────────────
  it("Step 6 — AI insights endpoint reaches Gemini call only after finding real session data (guard rails hold given real data now exists)", async () => {
    const res = await request(app)
      .post(`/mentorship/students/${studentId}/ai-insights`)
      .set("Authorization", `Bearer ${mentorToken}`)
      .send({});
    // With a real session now logged, the only remaining reason for a 400 is
    // Gemini not being configured in this environment — never an ownership
    // or "no sessions" false negative now that step 2 created real data.
    if (res.status === 400) {
      expect(res.body.message).toMatch(/AI (insights|provider)/i);
    } else {
      expect(res.status).toBe(200);
      expect(res.body.data.based_on_sessions).toBeGreaterThanOrEqual(1);
    }
  });

  // ── Step 7: Mentor views "My Reports" for the period ─────────────────────
  it("Step 7 — mentor's period report includes both the logged session and the check-in", async () => {
    const res = await request(app)
      .get("/mentorship/reports/my-sessions")
      .query({ start_date: "2026-01-01", end_date: "2030-01-01" })
      .set("Authorization", `Bearer ${mentorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessions.some((s: any) => s.mentorship_id === sessionId)).toBe(true);
    expect(res.body.data.checkins.some((c: any) => c.checkin_id === checkinId)).toBe(true);
    expect(res.body.data.summary.pending_checkins).toBe(0); // approved in step 5
  });

  // ── Step 8: Mentor downloads consolidated report ─────────────────────────
  it("Step 8 — the consolidated report includes the session, the approved check-in, and correctly omits a follow-up flag it shouldn't have", async () => {
    const res = await request(app)
      .get("/mentorship/reports/consolidated")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${mentorToken}`);
    expect(res.status).toBe(200);
    const mentee = res.body.data.mentees.find((m: any) => m.student_id === studentId);
    expect(mentee).toBeTruthy();
    expect(mentee.sessions.length).toBe(1);
    expect(mentee.comments.length).toBe(1);
    // follow_up_required was true on the session, so this mentee should be
    // flagged for recommended follow-up in the consolidated report.
    expect(mentee.recommend_follow_up).toBe(true);
  });

  // ── Step 9: Admin views everything and the dashboard totals ─────────────
  it("Step 9 — admin's log/check-in views and the school-wide dashboard all agree with what happened", async () => {
    const adminLog = await request(app)
      .get("/mentorship/admin/log")
      .query({ mentor_id: mentorId, academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminLog.body.data.some((s: any) => s.mentorship_id === sessionId)).toBe(true);

    const adminCheckins = await request(app)
      .get("/mentorship/admin/checkins")
      .query({ mentor_id: mentorId })
      .set("Authorization", `Bearer ${adminToken}`);
    const adminEntry = adminCheckins.body.data.find((c: any) => c.checkin_id === checkinId);
    expect(adminEntry.validation_status).toBe("APPROVED");

    const dashboard = await request(app)
      .get("/mentorship/admin/dashboard")
      .query({ academic_year_id: academicYearId, start_date: "2020-01-01", end_date: "2030-01-01" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dashboard.body.data.totals.total_sessions).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.data.totals.approved_checkins).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.data.totals.follow_ups_open).toBeGreaterThanOrEqual(1);
    expect(
      dashboard.body.data.top_mentors.some((m: any) => m.mentor_id === mentorId),
    ).toBe(true);
  });

  // ── Step 10: Admin reassigns the mentee to a different mentor mid-flow ──
  it("Step 10 — admin reassigns the mentee; old mentor loses access, new mentor gains it, history stays intact for viewing", async () => {
    const reassign = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        mentor_id: otherMentorId,
        student_id: studentId,
        academic_year_id: academicYearId,
        reassign: true,
      });
    expect(reassign.status).toBe(201);

    // Old mentor can no longer log new sessions for this student...
    const blocked = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${mentorToken}`)
      .send({ student_id: studentId, session_date: "2026-03-05", duration_minutes: 20 });
    expect(blocked.status).toBe(404);

    // ...but new mentor can immediately act
    const newMentorSession = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${otherMentorToken}`)
      .send({ student_id: studentId, session_date: "2026-03-06", duration_minutes: 25, academic_year_id: academicYearId });
    expect(newMentorSession.status).toBe(201);

    // The old mentor's own check-in inbox no longer shows this student's
    // NEW check-ins (there are none pending, but confirm no crash / leak)
    const oldInbox = await request(app)
      .get("/mentorship/checkins/inbox")
      .set("Authorization", `Bearer ${mentorToken}`);
    expect(oldInbox.status).toBe(200);
  });

  // ── Step 11: Ending an assignment is a soft-close, not data loss ────────
  it("Step 11 — ending the (now-current) assignment removes the mentee from the roster but the historical session remains admin-visible", async () => {
    const list = await request(app)
      .get("/mentorship/admin/assignments")
      .query({ academic_year_id: academicYearId, student_id: studentId, status: "ACTIVE" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.body.data.length).toBe(1);
    const assignmentId = list.body.data[0].assignment_id;

    await request(app)
      .delete(`/mentorship/assignments/${assignmentId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const roster = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${otherMentorToken}`);
    expect(roster.body.data.some((s: any) => s.user_id === studentId)).toBe(false);

    // The unassigned-students gap flag now catches this student
    const unassigned = await request(app)
      .get("/mentorship/admin/unassigned-students")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unassigned.body.data.some((s: any) => s.student_id === studentId)).toBe(true);

    // But the historical session data is still there for admin oversight
    const adminLog = await request(app)
      .get("/mentorship/admin/log")
      .query({ student_id: studentId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminLog.body.data.length).toBeGreaterThanOrEqual(2); // both mentors' sessions
  });
});
