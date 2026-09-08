import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createUserGradeAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// A class teacher's calendar reads are confined to the class groups their
// UserGrade assignment names. Writes have been guarded since 066, but the list
// endpoints were not -- and CLASS_TEACHER holds MANAGE_ACADEMIC_CALENDAR, which
// is enough to pass authorize() -- so asking for a term's slots used to return
// every class group in the school.
describe("Class teacher calendar scope", () => {
  let classTeacherToken: string;
  let adminToken: string;
  let unassignedToken: string;
  let academicYearId: number;
  let academicTermId: number;
  let ownClassGroupId: number;
  let otherClassGroupId: number;
  let ownCalendarId: number;
  let otherCalendarId: number;
  let subjectId: number;
  let teacherId: number;

  const calendarPerms = [
    "MANAGE_ACADEMIC_CALENDAR",
    "VIEW_ACADEMIC_CALENDAR",
    "CREATE_ACADEMIC_CALENDAR",
    "UPDATE_CALENDAR_SLOT",
    "VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE",
  ];

  const createSlot = async (token: string, calendarId: number, day: number) =>
    request(app)
      .post("/calendar/slots")
      .set("Authorization", `Bearer ${token}`)
      .send({
        calendar_id: calendarId,
        subject_id: subjectId,
        user_id: teacherId,
        day_of_week: day,
        start_time: "08:00",
        end_time: "09:40",
      });

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;

    const own = await createProgramGradeClassGroupDetailed();
    ownClassGroupId = own.classGroupId;
    const other = await createProgramGradeClassGroupDetailed();
    otherClassGroupId = other.classGroupId;

    subjectId = await createSubject();
    teacherId = await createUser({ userType: "TEACHER" });

    // Unscoped admin: no UserGrade / UserProgramLead assignment at all.
    const adminId = await createUser({ userType: "ADMIN" });
    const adminRole = await createRoleWithPermissions(
      "cal-admin",
      calendarPerms,
    );
    await assignRole(adminId, adminRole);
    adminToken = signToken(adminId);

    // Class teacher, assigned to exactly one class group for this year.
    const classTeacherId = await createUser({ userType: "TEACHER" });
    const ctRole = await createRoleWithPermissions(
      "cal-class-teacher",
      calendarPerms,
    );
    await assignRole(classTeacherId, ctRole);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: own.gradeId,
      classGroupId: ownClassGroupId,
      academicYearId,
    });
    classTeacherToken = signToken(classTeacherId);

    // Same permissions, but assigned to a class group in a *different* year,
    // so for this year they are scoped to nothing.
    const unassignedId = await createUser({ userType: "TEACHER" });
    await assignRole(unassignedId, ctRole);
    const otherYear = await createAcademicPeriod();
    await createUserGradeAssignment({
      userId: unassignedId,
      gradeId: other.gradeId,
      classGroupId: otherClassGroupId,
      academicYearId: otherYear.academicYearId,
    });
    unassignedToken = signToken(unassignedId);

    // Admin builds both calendars and one slot on each.
    const ownCal = await request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
        class_group_id: ownClassGroupId,
        name: "Own",
      });
    ownCalendarId = ownCal.body.data.calendar_id;

    const otherCal = await request(app)
      .post("/calendar/calendars")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
        class_group_id: otherClassGroupId,
        name: "Other",
      });
    otherCalendarId = otherCal.body.data.calendar_id;

    await createSlot(adminToken, ownCalendarId, 1);
    await createSlot(adminToken, otherCalendarId, 2);
  });

  it("returns only the class teacher's own class group slots", async () => {
    const res = await request(app)
      .get("/calendar/slots")
      .query({ academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    const calendarIds = res.body.data.map((s: any) => s.calendar_id);
    expect(calendarIds).toContain(ownCalendarId);
    expect(calendarIds).not.toContain(otherCalendarId);
  });

  it("does not leak another class group's slots even when asked for by id", async () => {
    const res = await request(app)
      .get("/calendar/slots")
      .query({ calendar_id: otherCalendarId })
      .set("Authorization", `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("lists only the class teacher's own calendars", async () => {
    const res = await request(app)
      .get("/calendar/calendars")
      .query({ academic_year_id: academicYearId, academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((c: any) => c.calendar_id);
    expect(ids).toContain(ownCalendarId);
    expect(ids).not.toContain(otherCalendarId);
  });

  it("leaves an unscoped admin seeing every class group", async () => {
    const res = await request(app)
      .get("/calendar/slots")
      .query({ academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${adminToken}`);

    const calendarIds = res.body.data.map((s: any) => s.calendar_id);
    expect(calendarIds).toContain(ownCalendarId);
    expect(calendarIds).toContain(otherCalendarId);
  });

  it("returns nothing for a scoped user with no assignment this year", async () => {
    const slots = await request(app)
      .get("/calendar/slots")
      .query({ academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${unassignedToken}`);
    expect(slots.status).toBe(200);
    expect(slots.body.data).toHaveLength(0);

    const calendars = await request(app)
      .get("/calendar/calendars")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${unassignedToken}`);
    expect(calendars.body.data).toHaveLength(0);
  });

  it("still refuses to write into a class group outside the scope", async () => {
    const res = await createSlot(classTeacherToken, otherCalendarId, 3);
    expect(res.status).toBe(403);
  });

  it("allows writing into the class teacher's own class group", async () => {
    const res = await createSlot(classTeacherToken, ownCalendarId, 4);
    expect(res.status).toBe(201);
  });
});
