import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  ClassGroup,
  StudentClassGroup,
  TeacherSubjectAssignment,
  UserGrade,
  CalendarSlot,
  AcademicCalendar,
} from "../db/schema";
import {
  createUser,
  createRoleWithPermissions,
  assignRole,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createProgramGradeClassGroupDetailed,
  createStudentClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createUserGradeAssignment,
  createCalendarSlot,
  createSchemeOfWork,
  createInstructorReport,
  signToken,
} from "../test/fixtures";

// DELETE /academics/class-groups/:id used to be a bare DELETE against
// ClassGroup. Every referencing table (timetables, schemes, reports, the
// class-teacher junction) is RESTRICT, so deleting anything in use failed on
// a foreign key and surfaced as a bare 500 -- the delete looked like it did
// nothing. It now reports what is in the way and clears the links a class
// group's deletion makes meaningless.
describe("DELETE /academics/class-groups/:id", () => {
  let token: string;
  let adminId: number;
  let academicYearId: number;
  let academicTermId: number;

  beforeAll(async () => {
    adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("academics-admin", [
      "MANAGE_ACADEMICS",
    ]);
    await assignRole(adminId, roleId);
    token = signToken(adminId);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
  });

  const rowsFor = async (classGroupId: number) =>
    db
      .select()
      .from(ClassGroup)
      .where(eq(ClassGroup.class_group_id, classGroupId));

  it("deletes a class group that nothing references", async () => {
    const classGroupId = await createProgramGradeClassGroup();

    const response = await request(app)
      .delete(`/academics/class-groups/${classGroupId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await rowsFor(classGroupId)).toHaveLength(0);
  });

  it("refuses to delete a class group that has a scheme of work", async () => {
    const classGroupId = await createProgramGradeClassGroup();
    const subjectId = await createSubject();
    await createSchemeOfWork({
      userId: adminId,
      subjectId,
      classGroupId,
      academicTermId,
    });

    const response = await request(app)
      .delete(`/academics/class-groups/${classGroupId}?force=true`)
      .set("Authorization", `Bearer ${token}`);

    // Authored academic records block the delete even when forced.
    expect(response.status).toBe(409);
    expect(response.body.message).toContain("scheme(s) of work");
    expect(response.body.errors).toEqual([
      expect.objectContaining({ key: "schemes_of_work", count: 1 }),
    ]);
    expect(await rowsFor(classGroupId)).toHaveLength(1);
  });

  it("refuses to delete a class group that has an instructor report", async () => {
    const classGroupId = await createProgramGradeClassGroup();
    await createInstructorReport({ userId: adminId, classGroupId });

    const response = await request(app)
      .delete(`/academics/class-groups/${classGroupId}?force=true`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("instructor report(s)");
    expect(await rowsFor(classGroupId)).toHaveLength(1);
  });

  it("asks for confirmation before clearing roster and timetable links", async () => {
    const { gradeId, classGroupId } =
      await createProgramGradeClassGroupDetailed();
    const studentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: studentId,
      classGroupId,
      academicYearId,
    });

    const response = await request(app)
      .delete(`/academics/class-groups/${classGroupId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.message).toContain("student assignment(s)");
    expect(await rowsFor(classGroupId)).toHaveLength(1);
    expect(gradeId).toBeTruthy();
  });

  it("clears roster, teacher, class-teacher and timetable links when forced", async () => {
    const { gradeId, classGroupId } =
      await createProgramGradeClassGroupDetailed();
    const subjectId = await createSubject();

    const studentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: studentId,
      classGroupId,
      academicYearId,
    });

    const teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicYearId,
    });
    await createUserGradeAssignment({
      userId: teacherId,
      gradeId,
      classGroupId,
      academicYearId,
    });
    await createCalendarSlot({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId,
      dayOfWeek: 1,
    });
    const [calendarResult] = (await db.insert(AcademicCalendar).values({
      academic_year_id: academicYearId,
      academic_term_id: academicTermId,
      class_group_id: classGroupId,
      name: "Timetable under test",
    })) as any;
    const calendarId = calendarResult.insertId as number;
    await db.insert(CalendarSlot).values({
      calendar_id: calendarId,
      academic_term_id: academicTermId,
      class_group_id: null,
      subject_id: subjectId,
      user_id: teacherId,
      day_of_week: 2,
      start_time: "10:00",
      end_time: "11:00",
    });

    const response = await request(app)
      .delete(`/academics/class-groups/${classGroupId}?force=true`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await rowsFor(classGroupId)).toHaveLength(0);

    expect(
      await db
        .select()
        .from(StudentClassGroup)
        .where(eq(StudentClassGroup.class_group_id, classGroupId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(TeacherSubjectAssignment)
        .where(eq(TeacherSubjectAssignment.class_group_id, classGroupId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(UserGrade)
        .where(eq(UserGrade.class_group_id, classGroupId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(CalendarSlot)
        .where(eq(CalendarSlot.class_group_id, classGroupId)),
    ).toHaveLength(0);
    // The calendar's own slots go too -- CalendarSlot -> AcademicCalendar is
    // RESTRICT, so a leftover slot would have blocked the calendar delete.
    expect(
      await db
        .select()
        .from(CalendarSlot)
        .where(eq(CalendarSlot.calendar_id, calendarId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(AcademicCalendar)
        .where(eq(AcademicCalendar.calendar_id, calendarId)),
    ).toHaveLength(0);
  });

  it("leaves other class groups' assignments untouched", async () => {
    const doomedId = await createProgramGradeClassGroup();
    const survivorId = await createProgramGradeClassGroup();
    const studentId = await createUser({ userType: "STUDENT" });

    await createStudentClassGroup({
      userId: studentId,
      classGroupId: doomedId,
      academicYearId,
    });
    await createStudentClassGroup({
      userId: studentId,
      classGroupId: survivorId,
      academicYearId,
    });

    const response = await request(app)
      .delete(`/academics/class-groups/${doomedId}?force=true`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(await rowsFor(survivorId)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(StudentClassGroup)
        .where(eq(StudentClassGroup.class_group_id, survivorId)),
    ).toHaveLength(1);
  });

  it("returns 404 for a class group that does not exist", async () => {
    const response = await request(app)
      .delete("/academics/class-groups/99999999")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});

describe("GET /academics/class-groups/:id/dependencies", () => {
  let token: string;
  let adminId: number;
  let academicYearId: number;
  let academicTermId: number;

  beforeAll(async () => {
    adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("academics-admin-deps", [
      "MANAGE_ACADEMICS",
    ]);
    await assignRole(adminId, roleId);
    token = signToken(adminId);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
  });

  it("reports an unreferenced class group as deletable with no confirmation", async () => {
    const classGroupId = await createProgramGradeClassGroup();

    const response = await request(app)
      .get(`/academics/class-groups/${classGroupId}/dependencies`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.can_delete).toBe(true);
    expect(response.body.data.requires_confirmation).toBe(false);
    expect(response.body.data.blocking).toEqual([]);
    expect(response.body.data.detachable).toEqual([]);
  });

  it("splits blocking records from links the delete would clear", async () => {
    const classGroupId = await createProgramGradeClassGroup();
    const subjectId = await createSubject();
    const studentId = await createUser({ userType: "STUDENT" });

    await createStudentClassGroup({
      userId: studentId,
      classGroupId,
      academicYearId,
    });
    await createSchemeOfWork({
      userId: adminId,
      subjectId,
      classGroupId,
      academicTermId,
    });

    const response = await request(app)
      .get(`/academics/class-groups/${classGroupId}/dependencies`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.can_delete).toBe(false);
    expect(response.body.data.requires_confirmation).toBe(true);
    expect(response.body.data.blocking).toEqual([
      expect.objectContaining({ key: "schemes_of_work", count: 1 }),
    ]);
    expect(response.body.data.detachable).toEqual([
      expect.objectContaining({ key: "students", count: 1 }),
    ]);
  });
});
