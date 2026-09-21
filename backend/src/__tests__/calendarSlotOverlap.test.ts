import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// Two lessons of one class group must never run at the same time. The write
// path used to refuse only a slot with the *same start minute*, so a stale
// 10:50-12:30 lesson could sit under a live 10:00-11:40 one: the class-group
// grid never drew it (its start row was swallowed by the other lesson's
// rowSpan) while the teacher whose only lesson there was the stale one saw it
// on "My Teaching Schedule" -- the "duplicated slot the calendar doesn't
// have" report.
describe("Calendar slot overlap guard", () => {
  let adminToken: string;
  let academicYearId: number;
  let academicTermId: number;
  let classGroupId: number;
  let calendarId: number;
  let subjectId: number;
  let otherSubjectId: number;
  let teacherId: number;
  let otherTeacherId: number;

  const post = (body: object) =>
    request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(body);

  beforeAll(async () => {
    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("calendar-overlap-admin", [
      "MANAGE_ACADEMIC_CALENDAR",
      "VIEW_ACADEMIC_CALENDAR",
      "CREATE_ACADEMIC_CALENDAR",
      "UPDATE_CALENDAR_SLOT",
    ]);
    await assignRole(adminId, roleId);
    adminToken = signToken(adminId);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;

    const chain = await createProgramGradeClassGroupDetailed();
    classGroupId = chain.classGroupId;

    subjectId = await createSubject();
    otherSubjectId = await createSubject();
    teacherId = await createUser({ userType: "TEACHER" });
    otherTeacherId = await createUser({ userType: "TEACHER" });
    const teacherRoleId = await createRoleWithPermissions("overlap-teacher", [
      "VIEW_MY_CALENDAR",
    ]);
    await assignRole(teacherId, teacherRoleId);
    for (const [userId, subj] of [
      [teacherId, subjectId],
      [otherTeacherId, otherSubjectId],
    ] as const) {
      await createTeacherSubjectAssignment({
        userId,
        subjectId: subj,
        classGroupId,
        academicYearId,
      });
    }

    const calendarRes = await request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
        class_group_id: classGroupId,
        name: "Overlap Calendar",
      });
    calendarId = calendarRes.body.data.calendar_id;

    // Monday P3-P4, another teacher's subject.
    const res = await post({
      calendar_id: calendarId,
      subject_id: otherSubjectId,
      user_id: otherTeacherId,
      day_of_week: 1,
      start_time: "10:00",
      end_time: "11:40",
    });
    expect(res.status).toBe(201);
  });

  it("refuses a lesson that starts inside another lesson of the class group", async () => {
    const res = await post({
      calendar_id: calendarId,
      subject_id: subjectId,
      user_id: teacherId,
      day_of_week: 1,
      start_time: "10:50",
      end_time: "12:30",
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/overlaps/);

    // ...and it did not leak onto the teacher's timetable
    const mine = await request(app)
      .get("/calendar/my-calendar")
      .query({ academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${signToken(teacherId)}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.slots).toHaveLength(0);
  });

  it("refuses a lesson that would swallow an existing one", async () => {
    const res = await post({
      calendar_id: calendarId,
      subject_id: subjectId,
      user_id: teacherId,
      day_of_week: 1,
      start_time: "08:50",
      end_time: "10:50",
    });
    expect(res.status).toBe(409);
  });

  it("allows back-to-back lessons and lessons on other days", async () => {
    const after = await post({
      calendar_id: calendarId,
      subject_id: subjectId,
      user_id: teacherId,
      day_of_week: 1,
      start_time: "11:40",
      end_time: "12:30",
    });
    expect(after.status).toBe(201);

    const otherDay = await post({
      calendar_id: calendarId,
      subject_id: subjectId,
      user_id: teacherId,
      day_of_week: 3,
      start_time: "10:50",
      end_time: "12:30",
    });
    expect(otherDay.status).toBe(201);
  });

  it("refuses moving or stretching a lesson onto another one", async () => {
    const created = await post({
      calendar_id: calendarId,
      subject_id: subjectId,
      user_id: teacherId,
      day_of_week: 2,
      start_time: "10:00",
      end_time: "10:50",
    });
    expect(created.status).toBe(201);
    const slotId = created.body.data.slot_id;

    // Tuesday 08:00-08:50 by the other teacher, then try to stretch ours
    // backwards over it.
    expect(
      (
        await post({
          calendar_id: calendarId,
          subject_id: otherSubjectId,
          user_id: otherTeacherId,
          day_of_week: 2,
          start_time: "08:50",
          end_time: "09:40",
        })
      ).status,
    ).toBe(201);

    const stretched = await request(app)
      .put(`/calendar/slots/${slotId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ start_time: "09:00", end_time: "10:50" });
    expect(stretched.status).toBe(409);

    // Moving onto Monday P4 (under the 10:00-11:40 lesson) is refused too.
    const moved = await request(app)
      .put(`/calendar/slots/${slotId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ day_of_week: 1, start_time: "10:50", end_time: "11:40" });
    expect(moved.status).toBe(409);

    // Editing something other than the time is unaffected.
    const relabelled = await request(app)
      .put(`/calendar/slots/${slotId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ location: "Lab 2" });
    expect(relabelled.status).toBe(200);
  });

  it("ignores a soft-deleted lesson when checking for overlap", async () => {
    const created = await post({
      calendar_id: calendarId,
      subject_id: otherSubjectId,
      user_id: otherTeacherId,
      day_of_week: 4,
      start_time: "10:00",
      end_time: "11:40",
    });
    expect(created.status).toBe(201);
    const del = await request(app)
      .delete(`/calendar/slots/${created.body.data.slot_id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const res = await post({
      calendar_id: calendarId,
      subject_id: subjectId,
      user_id: teacherId,
      day_of_week: 4,
      start_time: "10:50",
      end_time: "12:30",
    });
    expect(res.status).toBe(201);
  });
});
