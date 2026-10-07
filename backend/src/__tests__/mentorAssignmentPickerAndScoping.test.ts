import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { AcademicYear, MentorAssignment, UserProfile } from "../db/schema";
import { eq } from "drizzle-orm";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createStudentClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// 2026-10-07 mentorship review:
//  1. the Assign Mentor picker must offer anyone who is not a student
//     (staff, admins, profiles without a type), and must not be crowded out
//     by students matching the same search;
//  2. a mentor's roster is exactly their assigned mentees — never every
//     student of the classes they teach;
//  3. a non-teacher mentor can actually work with their mentees;
//  4. the student sees who their mentor is.
describe("Mentor picker, roster scoping and non-teacher mentors", () => {
  let yearId: number;
  let adminToken: string;
  const token = `zq${Date.now().toString(36)}`; // shared search token

  let teacherMentorId: number;
  let teacherMentorToken: string;
  let staffMentorId: number;
  let staffMentorToken: string;
  let adminMentorId: number;
  let typelessId: number;
  let parentId: number;
  let idleStaffToken: string;

  let menteeId: number;
  let menteeToken: string;
  let classmateId: number; // in the teacher's class, NOT their mentee
  let staffMenteeId: number;
  let crowdIds: number[] = [];

  const named = async (id: number, first: string) =>
    db.update(UserProfile).set({ first_name: first, last_name: token }).where(eq(UserProfile.user_id, id));

  beforeAll(async () => {
    await db.update(AcademicYear).set({ is_current: 0 });
    yearId = (await createAcademicPeriod()).academicYearId;

    const adminId = await createUser({ userType: "ADMIN" });
    await assignRole(
      adminId,
      await createRoleWithPermissions("MENTOR_PICKER_ADMIN", [Permissions.MANAGE_MENTOR_ASSIGNMENTS]),
    );
    adminToken = signToken(adminId);

    const teacherRole = await createRoleWithPermissions("MENTOR_PICKER_TEACHER", [
      Permissions.TEACHER_DASHBOARD,
      Permissions.SUBMIT_REPORTING,
    ]);
    const studentRole = await createRoleWithPermissions("MENTOR_PICKER_STUDENT", [
      Permissions.SUBMIT_MENTEE_CHECKIN,
    ]);

    teacherMentorId = await createUser({ userType: "TEACHER" });
    await assignRole(teacherMentorId, teacherRole);
    teacherMentorToken = signToken(teacherMentorId);

    // Staff/admin with NO teacher permissions at all.
    staffMentorId = await createUser({ userType: "STAFF" });
    staffMentorToken = signToken(staffMentorId);
    adminMentorId = await createUser({ userType: "ADMIN" });
    typelessId = await createUser({ userType: "STAFF" });
    await db.update(UserProfile).set({ user_type: null }).where(eq(UserProfile.user_id, typelessId));
    parentId = await createUser({ userType: "PARENT" });
    const idleStaff = await createUser({ userType: "STAFF" });
    idleStaffToken = signToken(idleStaff);

    menteeId = await createUser({ userType: "STUDENT" });
    await assignRole(menteeId, studentRole);
    menteeToken = signToken(menteeId);
    classmateId = await createUser({ userType: "STUDENT" });
    staffMenteeId = await createUser({ userType: "STUDENT" });

    await named(teacherMentorId, "Teacher");
    await named(staffMentorId, "Staffer");
    await named(adminMentorId, "Admin");
    await named(typelessId, "Typeless");
    await named(parentId, "Parent");
    await named(menteeId, "Mentee");
    await named(classmateId, "Classmate");

    // 25 students matching the same search: with the old /users/search
    // (LIMIT 20, then client-side filter) these pushed every staff member out.
    for (let i = 0; i < 25; i++) {
      const id = await createUser({ userType: "STUDENT" });
      await named(id, `Crowd${i}`);
      crowdIds.push(id);
    }

    // The teacher teaches a class holding both the mentee and a classmate.
    const classGroupId = await createProgramGradeClassGroup();
    const subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherMentorId, subjectId, classGroupId, academicYearId: yearId });
    for (const id of [menteeId, classmateId, staffMenteeId]) {
      await createStudentClassGroup({ userId: id, classGroupId, academicYearId: yearId });
    }
  });

  const candidates = (role: string, q = token) =>
    request(app)
      .get("/mentorship/admin/candidates")
      .query({ role, q, academic_year_id: yearId })
      .set("Authorization", `Bearer ${adminToken}`);

  it("offers every non-student as a mentor, even when many students match the search", async () => {
    const res = await candidates("mentor");
    expect(res.status).toBe(200);
    const ids = res.body.data.map((u: any) => u.user_id);
    for (const id of [teacherMentorId, staffMentorId, adminMentorId, typelessId, parentId]) {
      expect(ids).toContain(id);
    }
    expect(res.body.data.every((u: any) => u.user_type !== "STUDENT")).toBe(true);
    // Teaching staff are listed first.
    expect(res.body.data[0].user_id).toBe(teacherMentorId);
  });

  it("lists students only for the mentee picker", async () => {
    const res = await candidates("student");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(25);
    expect(res.body.data.every((u: any) => u.user_type === "STUDENT")).toBe(true);
  });

  it("can narrow the mentee picker to students without a mentor this year", async () => {
    await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: adminMentorId, student_id: crowdIds[5], academic_year_id: yearId });
    const res = await request(app)
      .get("/mentorship/admin/candidates")
      .query({ role: "student", q: token, unassigned_only: 1, academic_year_id: yearId })
      .set("Authorization", `Bearer ${adminToken}`);
    const ids = res.body.data.map((u: any) => u.user_id);
    expect(ids).not.toContain(crowdIds[5]);
    expect(ids).toContain(crowdIds[6]);
    expect(res.body.data.every((u: any) => u.current_mentor_id === null)).toBe(true);
  });

  it("rejects an invalid role and requires the assignment permission", async () => {
    expect((await candidates("parent")).status).toBe(400);
    const res = await request(app)
      .get("/mentorship/admin/candidates")
      .query({ role: "mentor" })
      .set("Authorization", `Bearer ${teacherMentorToken}`);
    expect(res.status).toBe(403);
  });

  it("refuses a student as mentor, a non-student as mentee, and self-mentoring", async () => {
    const asMentor = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: classmateId, student_id: menteeId, academic_year_id: yearId });
    expect(asMentor.status).toBe(400);

    const asMentee = await request(app)
      .post("/mentorship/assignments/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: teacherMentorId, student_ids: [menteeId, staffMentorId], academic_year_id: yearId });
    expect(asMentee.status).toBe(400);
    expect(asMentee.body.message).toMatch(/not a student/);

    const self = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: staffMentorId, student_id: staffMentorId, academic_year_id: yearId });
    expect(self.status).toBe(400);
  });

  it("assigns a teacher mentor; the student picker then shows who mentors that student", async () => {
    const res = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: teacherMentorId, student_id: menteeId, academic_year_id: yearId });
    expect(res.status).toBe(201);

    const list = await candidates("student", "Mentee");
    const row = list.body.data.find((u: any) => u.user_id === menteeId);
    expect(row.current_mentor_id).toBe(teacherMentorId);
    expect(row.current_mentor_name).toBe(`Teacher ${token}`);
    expect(row.class_group_name).toBeTruthy();

    const mentors = await candidates("mentor", "Teacher");
    expect(mentors.body.data.find((u: any) => u.user_id === teacherMentorId).mentee_count).toBe(1);
  });

  it("re-assigning a student to the mentor they already have is a no-op, not a churn", async () => {
    const res = await request(app)
      .post("/mentorship/assignments/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: teacherMentorId, student_ids: [menteeId, menteeId], academic_year_id: yearId, reassign: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ assigned: 0, moved: 0, unchanged: 1 });

    const active = await request(app)
      .get("/mentorship/admin/assignments")
      .query({ academic_year_id: yearId, student_id: menteeId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(active.body.data).toHaveLength(1);
  });

  it("the teacher's roster holds only their mentee, not the rest of the class they teach", async () => {
    const res = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: yearId })
      .set("Authorization", `Bearer ${teacherMentorToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: any) => s.user_id);
    expect(ids).toEqual([menteeId]);
    expect(res.body.data[0]).toMatchObject({ registration_number: null, session_count: 0 });
    expect(res.body.data[0].class_group_name).toBeTruthy();
    expect(res.body.data[0].assigned_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the teacher cannot open or log a session for a classmate who is not their mentee", async () => {
    const session = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${teacherMentorToken}`)
      .send({ student_id: classmateId, session_date: "2026-03-01" });
    expect(session.status).toBe(404);
    const brief = await request(app)
      .get(`/mentorship/students/${classmateId}/intelligence`)
      .set("Authorization", `Bearer ${teacherMentorToken}`);
    expect(brief.status).toBe(404);
  });

  it("a staff member with no teacher permissions is locked out until they mentor someone", async () => {
    const before = await request(app).get("/mentorship/students").set("Authorization", `Bearer ${staffMentorToken}`);
    expect(before.status).toBe(403);
    const me = await request(app).get("/mentorship/me").set("Authorization", `Bearer ${staffMentorToken}`);
    expect(me.body.data).toMatchObject({ is_mentor: false, mentee_count: 0 });
  });

  it("a staff mentor can see and work with their own mentees once assigned", async () => {
    const assign = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: staffMentorId, student_id: staffMenteeId, academic_year_id: yearId });
    expect(assign.status).toBe(201);

    const me = await request(app).get("/mentorship/me").set("Authorization", `Bearer ${staffMentorToken}`);
    expect(me.body.data).toMatchObject({ is_mentor: true, mentee_count: 1 });

    const roster = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: yearId })
      .set("Authorization", `Bearer ${staffMentorToken}`);
    expect(roster.status).toBe(200);
    expect(roster.body.data.map((s: any) => s.user_id)).toEqual([staffMenteeId]);

    const session = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${staffMentorToken}`)
      .send({ student_id: staffMenteeId, session_date: "2026-03-02", academic_year_id: yearId });
    expect(session.status).toBe(201);

    // ...but still not anybody else's mentee.
    const other = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${staffMentorToken}`)
      .send({ student_id: menteeId, session_date: "2026-03-02" });
    expect(other.status).toBe(404);

    const inbox = await request(app).get("/mentorship/checkins/inbox").set("Authorization", `Bearer ${staffMentorToken}`);
    expect(inbox.status).toBe(200);
    const report = await request(app).get("/mentorship/reports/my-sessions").set("Authorization", `Bearer ${staffMentorToken}`);
    expect(report.status).toBe(200);
  });

  it("a staff member who mentors nobody still gets 403 on mentor routes", async () => {
    const res = await request(app).get("/mentorship/checkins/inbox").set("Authorization", `Bearer ${idleStaffToken}`);
    expect(res.status).toBe(403);
  });

  it("the student sees their mentor with role, sessions held and last meeting", async () => {
    await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${teacherMentorToken}`)
      .send({ student_id: menteeId, session_date: "2026-03-03", academic_year_id: yearId });

    const res = await request(app)
      .get("/mentorship/my-mentor")
      .query({ academic_year_id: yearId })
      .set("Authorization", `Bearer ${menteeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      mentor_id: teacherMentorId,
      mentor_name: `Teacher ${token}`,
      mentor_role: "TEACHER",
      session_count: 1,
      last_session_date: "2026-03-03",
    });
    expect(res.body.data.teaches_you).toHaveLength(1);

    const me = await request(app).get("/mentorship/me").set("Authorization", `Bearer ${menteeToken}`);
    expect(me.body.data).toMatchObject({ is_mentor: false, has_mentor: true });
  });

  it("moving a student reports it, and the old mentor keeps read access to only their own history", async () => {
    const move = await request(app)
      .post("/mentorship/assignments/bulk")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: staffMentorId, student_ids: [menteeId, crowdIds[0]], academic_year_id: yearId, reassign: true });
    expect(move.status).toBe(201);
    expect(move.body.data).toMatchObject({ assigned: 1, moved: 1, unchanged: 0 });

    const history = await request(app)
      .get(`/mentorship/students/${menteeId}/history`)
      .set("Authorization", `Bearer ${teacherMentorToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data).toHaveLength(1);

    const write = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${teacherMentorToken}`)
      .send({ student_id: menteeId, session_date: "2026-03-04" });
    expect(write.status).toBe(404);

    const roster = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: yearId })
      .set("Authorization", `Bearer ${teacherMentorToken}`);
    expect(roster.body.data).toEqual([]);
  });

  it("an assignment left ACTIVE in a past year (e.g. the 047 backfill) grants no write or grade access", async () => {
    const [pastYear] = (await db.insert(AcademicYear).values({
      name: `Past ${token}`,
      start_date: "2024-09-01",
      end_date: "2025-07-01",
      is_current: 0,
    } as any)) as any;
    await db.insert(MentorAssignment).values({
      mentor_id: teacherMentorId,
      student_id: classmateId,
      academic_year_id: pastYear.insertId,
      status: "ACTIVE",
      assigned_by: teacherMentorId,
      notes: "Backfilled from TeacherSubjectAssignment on migration 047",
    });
    const write = await request(app)
      .post("/mentorship/sessions")
      .set("Authorization", `Bearer ${teacherMentorToken}`)
      .send({ student_id: classmateId, session_date: "2026-03-05" });
    expect(write.status).toBe(404);
    const brief = await request(app)
      .get(`/mentorship/students/${classmateId}/intelligence`)
      .set("Authorization", `Bearer ${teacherMentorToken}`);
    expect(brief.status).toBe(404);
    // The current year's roster is unaffected by it.
    const roster = await request(app)
      .get("/mentorship/students")
      .query({ academic_year_id: yearId })
      .set("Authorization", `Bearer ${teacherMentorToken}`);
    expect(roster.body.data.map((s: any) => s.user_id)).not.toContain(classmateId);
  });

  it("without reassign, moving an already-mentored student is a 409", async () => {
    const res = await request(app)
      .post("/mentorship/assignments")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mentor_id: teacherMentorId, student_id: menteeId, academic_year_id: yearId });
    expect(res.status).toBe(409);
  });
});
