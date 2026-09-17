import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createSubject,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// A timetable belongs to one class group, never to a grade level. The picker
// being clamped is a UI convenience; these tests pin the actual rule down on
// the write path, where a hand-rolled request would otherwise let the class
// teacher of L3 Class A build (or wipe) the timetable of L3 Class B.
describe("Academic calendar writes — confined to the caller's class groups", () => {
  let yearId: number;
  let termId: number;
  let myClassGroupId: number;
  let siblingClassGroupId: number;
  let classTeacherToken: string;
  let unscopedToken: string;
  let subjectId: number;
  let teacherId: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    termId = period.academicTermId;

    const mine = await createProgramGradeClassGroupDetailed();
    myClassGroupId = mine.classGroupId;
    const sibling = await createProgramGradeClassGroupDetailed({
      programId: mine.programId,
      gradeId: mine.gradeId,
    });
    siblingClassGroupId = sibling.classGroupId;

    const writerRoleId = await createRoleWithPermissions("CAL_WRITER", [
      Permissions.CREATE_ACADEMIC_CALENDAR,
      Permissions.UPDATE_CALENDAR_SLOT,
      Permissions.MANAGE_ACADEMIC_CALENDAR,
      Permissions.VIEW_ACADEMIC_CALENDAR,
    ]);

    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, writerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: mine.gradeId,
      classGroupId: myClassGroupId,
      academicYearId: yearId,
    });
    classTeacherToken = signToken(classTeacherId);

    const unscopedId = await createUser({ userType: "ADMIN" });
    await assignRole(unscopedId, writerRoleId);
    unscopedToken = signToken(unscopedId);

    subjectId = await createSubject();
    teacherId = await createUser({ userType: "TEACHER" });
    for (const classGroupId of [myClassGroupId, siblingClassGroupId]) {
      await createTeacherSubjectAssignment({
        userId: teacherId,
        subjectId,
        classGroupId,
        academicYearId: yearId,
      });
    }
  });

  const createCalendar = (token: string, classGroupId: number) =>
    request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${token}`)
      .send({
        academic_year_id: yearId,
        academic_term_id: termId,
        class_group_id: classGroupId,
        name: `Calendar ${classGroupId}`,
      });

  it("creates a calendar for a class group the caller was assigned", async () => {
    const res = await createCalendar(classTeacherToken, myClassGroupId);
    expect(res.status).toBe(200);
    expect(res.body.data.calendar_id).toBeGreaterThan(0);
  });

  it("refuses a calendar for a sibling section of the same grade", async () => {
    const res = await createCalendar(classTeacherToken, siblingClassGroupId);
    expect(res.status).toBe(403);
  });

  it("still lets an unscoped admin create for any class group", async () => {
    const res = await createCalendar(unscopedToken, siblingClassGroupId);
    expect(res.status).toBe(200);
  });

  it("refuses a slot on a calendar outside the caller's class groups", async () => {
    // The sibling's calendar was created by the admin above.
    const list = await request(app)
      .get(
        `/calendar/calendars?academic_year_id=${yearId}&academic_term_id=${termId}&class_group_id=${siblingClassGroupId}`,
      )
      .set("Authorization", `Bearer ${unscopedToken}`);
    const siblingCalendarId = list.body.data[0].calendar_id;

    const res = await request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${classTeacherToken}`)
      .send({
        calendar_id: siblingCalendarId,
        subject_id: subjectId,
        user_id: teacherId,
        day_of_week: 1,
        start_time: "09:00",
        end_time: "09:50",
      });

    expect(res.status).toBe(403);
  });

  it("allows a slot on the caller's own calendar", async () => {
    const list = await request(app)
      .get(
        `/calendar/calendars?academic_year_id=${yearId}&academic_term_id=${termId}&class_group_id=${myClassGroupId}`,
      )
      .set("Authorization", `Bearer ${classTeacherToken}`);
    const myCalendarId = list.body.data[0].calendar_id;

    const res = await request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${classTeacherToken}`)
      .send({
        calendar_id: myCalendarId,
        subject_id: subjectId,
        user_id: teacherId,
        day_of_week: 2,
        start_time: "11:00",
        end_time: "11:50",
      });

    expect(res.status).toBe(201);
  });
});
