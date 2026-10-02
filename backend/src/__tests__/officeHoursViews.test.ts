import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { Parenting } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, createUserGradeAssignment, signToken } from "../test/fixtures";
import { createOfficeHoursWorld, OhWorld, OH_MONDAY, pinClock, resetSettings } from "../test/officeHoursFixtures";
import { setOfficeHoursClock } from "../services/officeHours/common";

// Office hours Phase 2 (read models): what students, parents and the timetable
// band see (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §8, §10).
describe("Office hours phase 2: student, parent and band views", () => {
  let w: OhWorld;
  let scheduleId: number;
  let parentToken: string;
  let classTeacherToken: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    await resetSettings();
    pinClock(OH_MONDAY, "09:00");
    w = await createOfficeHoursWorld(4);
    const created = await request(app)
      .post("/office-hours/schedules")
      .set(auth(w.tokens.teacherA))
      .send({ academic_term_id: w.termId, days: [1, 3], subject_id: w.subjectA, location: "B4", effective_to: "2026-04-30" });
    scheduleId = created.body.data.schedule.schedule_id;
    await request(app)
      .post(`/office-hours/schedules/${scheduleId}/assignments`)
      .set(auth(w.tokens.teacherA))
      .send({ student_ids: [w.students[0], w.students[1]], reason_code: "BELOW_STANDARD", reason_note: "Failed the mid-term" });

    const parent = await createUser();
    const parentRole = await createRoleWithPermissions("OH_PARENT", ["OFFICE_HOURS_VIEW_SELF"]);
    await assignRole(parent, parentRole);
    await db.insert(Parenting).values({ parent_id: parent, student_id: w.students[0] } as any);
    parentToken = signToken(parent);

    const classTeacher = await createUser({ userType: "TEACHER" });
    const ctRole = await createRoleWithPermissions("OH_CLASS_TEACHER", ["OFFICE_HOURS_MANAGE_OWN", "OFFICE_HOURS_VIEW"]);
    await assignRole(classTeacher, ctRole);
    await createUserGradeAssignment({ userId: classTeacher, gradeId: w.gradeId, classGroupId: w.classGroupId, academicYearId: w.yearId });
    classTeacherToken = signToken(classTeacher);
  });
  afterAll(async () => {
    setOfficeHoursClock(null);
    await resetSettings();
  });

  it("shows a student their office hours and next sessions without staff-only reasons", async () => {
    const res = await request(app).get("/office-hours/me").query({ term_id: w.termId }).set(auth(w.tokens.s0));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.assignments).toHaveLength(1);
    expect(d.assignments[0]).toMatchObject({ title: expect.stringMatching(/support$/), days: [1, 3], location: "B4", status: "ACTIVE" });
    expect(d.assignments[0].teacher_name).toBeTruthy();
    expect(JSON.stringify(d)).not.toMatch(/BELOW_STANDARD|Failed the mid-term|reason_/);
    expect(d.upcoming[0].session_date).toBe(OH_MONDAY);
    expect(d.upcoming.map((u: any) => u.session_date)).toContain("2026-03-04");
  });

  it("lets a linked parent see their child, and nobody else's", async () => {
    const own = await request(app).get("/office-hours/children").query({ term_id: w.termId }).set(auth(parentToken));
    expect(own.status).toBe(200);
    expect(own.body.data.children.map((c: any) => c.student_id)).toEqual([w.students[0]]);
    expect((await request(app).get("/office-hours/me").query({ term_id: w.termId, student_id: w.students[0] }).set(auth(parentToken))).status).toBe(200);
    expect((await request(app).get("/office-hours/me").query({ term_id: w.termId, student_id: w.students[1] }).set(auth(parentToken))).status).toBe(403);
    // A student cannot look at a classmate.
    expect((await request(app).get("/office-hours/me").query({ term_id: w.termId, student_id: w.students[1] }).set(auth(w.tokens.s0))).status).toBe(403);
    // The teacher who holds the student can; an unrelated teacher cannot.
    expect((await request(app).get("/office-hours/me").query({ term_id: w.termId, student_id: w.students[1] }).set(auth(w.tokens.teacherA))).status).toBe(200);
    expect((await request(app).get("/office-hours/me").query({ term_id: w.termId, student_id: w.students[1] }).set(auth(w.tokens.outsider))).status).toBe(403);
  });

  it("fills the timetable band for the host, the student and the class group", async () => {
    const host = await request(app).get("/office-hours/band").query({ term_id: w.termId }).set(auth(w.tokens.teacherA));
    expect(host.status).toBe(200);
    expect(host.body.data.mode).toBe("personal");
    expect(host.body.data.entries.map((e: any) => [e.day_of_week, e.role, e.count])).toEqual([
      [1, "hosting", 2],
      [3, "hosting", 2],
    ]);

    const student = await request(app).get("/office-hours/band").query({ term_id: w.termId }).set(auth(w.tokens.s1));
    expect(student.body.data.entries.map((e: any) => [e.day_of_week, e.role])).toEqual([
      [1, "attending"],
      [3, "attending"],
    ]);
    expect(student.body.data.entries[0].teacher_name).toBeTruthy();

    // A student with no office hours gets an empty band.
    const free = await request(app).get("/office-hours/band").query({ term_id: w.termId }).set(auth(w.tokens.s3));
    expect(free.body.data.entries).toEqual([]);

    // Leadership and the class teacher see counts for the class group, never names.
    for (const token of [w.tokens.leader, classTeacherToken]) {
      const grid = await request(app).get("/office-hours/band").query({ term_id: w.termId, class_group_id: w.classGroupId }).set(auth(token));
      expect(grid.body.data.mode).toBe("class_group");
      expect(grid.body.data.entries.map((e: any) => [e.day_of_week, e.count])).toEqual([
        [1, 2],
        [3, 2],
      ]);
      expect(JSON.stringify(grid.body.data)).not.toMatch(/student_id/);
    }
    // A plain teacher gets nothing for a class group they do not lead.
    const denied = await request(app).get("/office-hours/band").query({ term_id: w.termId, class_group_id: w.classGroupId }).set(auth(w.tokens.outsider));
    expect(denied.body.data.entries).toEqual([]);
  });
});
