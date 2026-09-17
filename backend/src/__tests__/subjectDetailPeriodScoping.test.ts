import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { db } from "../db";
import { AcademicTerm } from "../db/schema";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createSubject,
  createTeacherSubjectAssignment,
  createCalendarSlot,
  createSchemeOfWork,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// The subject panel's Schedule tab listed every slot the subject had ever had,
// stacking Term 1 and Term 2 periods on the same weekday. A timetable only
// means anything inside one year+term, so the panel now sends the period
// selected in the top bar and the query honours it.
describe("Subject detail — schedule and scheme follow the selected year/term", () => {
  let yearId: number;
  let termOneId: number;
  let termTwoId: number;
  let classTeacherToken: string;
  let subjectId: number;
  let classGroupId: number;
  let teacherId: number;
  let priorYearId: number;
  let formerTeacherId: number;
  let currentStudentId: number;
  let futureStudentId: number;
  let staleEnrolmentStudentId: number;

  beforeAll(async () => {
    const prior = await createAcademicPeriod();
    priorYearId = prior.academicYearId;
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    termOneId = period.academicTermId;

    // A second term in the SAME year — this is what used to bleed through.
    const [termTwo] = (await db.insert(AcademicTerm).values({
      academic_year_id: yearId,
      name: "Term 2",
      start_date: "2026-07-01",
      end_date: "2026-12-31",
      is_current: 0,
    } as any)) as any;
    termTwoId = termTwo.insertId as number;

    const base = await createProgramGradeClassGroupDetailed();
    classGroupId = base.classGroupId;

    const viewerRoleId = await createRoleWithPermissions("SUBJECT_PERIOD_VIEW", [
      Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
    ]);
    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, viewerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: base.gradeId,
      classGroupId,
      academicYearId: yearId,
    });
    classTeacherToken = signToken(classTeacherId);

    subjectId = await createSubject();
    teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicYearId: yearId,
    });

    // One period in each term, on different days so they are distinguishable.
    await createCalendarSlot({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termOneId,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "09:50",
    });
    await createCalendarSlot({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termTwoId,
      dayOfWeek: 3,
      startTime: "14:00",
      endTime: "14:50",
    });

    // Taught this class group last year, handed it over since.
    formerTeacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: formerTeacherId,
      subjectId,
      classGroupId,
      academicYearId: priorYearId,
    });

    // Enrolled and placed for the selected year.
    currentStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: currentStudentId,
      classGroupId,
      academicYearId: yearId,
    });
    await createStudentSubjectEnrollment({
      userId: currentStudentId,
      subjectId,
      academicYearId: yearId,
    });

    // Enrolled, but only placed in this class group in a LATER year — they
    // have not moved in yet and must not appear on this year's roster.
    const laterYear = await createAcademicPeriod();
    futureStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: futureStudentId,
      classGroupId,
      academicYearId: laterYear.academicYearId,
    });
    await createStudentSubjectEnrollment({
      userId: futureStudentId,
      subjectId,
      academicYearId: laterYear.academicYearId,
    });

    // Enrolled LAST year only, but still placed in the class group. The
    // placement carries forward; the enrolment must not.
    staleEnrolmentStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: staleEnrolmentStudentId,
      classGroupId,
      academicYearId: priorYearId,
    });
    await createStudentSubjectEnrollment({
      userId: staleEnrolmentStudentId,
      subjectId,
      academicYearId: priorYearId,
    });

    await createSchemeOfWork({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termOneId,
    });
    await createSchemeOfWork({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termTwoId,
    });
  });

  const detail = (query: string) =>
    request(app)
      .get(`/users/scope/subjects/${subjectId}?${query}`)
      .set("Authorization", `Bearer ${classTeacherToken}`);

  it("returns only the selected term's periods", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.schedule).toHaveLength(1);
    expect(res.body.data.schedule[0].day_of_week).toBe(1);
    expect(res.body.data.schedule[0].start_time).toBe("09:00");
  });

  it("switches with the term", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termTwoId}`,
    );
    expect(res.body.data.schedule).toHaveLength(1);
    expect(res.body.data.schedule[0].day_of_week).toBe(3);
  });

  it("returns only the selected term's scheme of work", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    expect(res.body.data.schemes).toHaveLength(1);
    expect(res.body.data.schemes[0].academic_term_id).toBe(termOneId);
  });

  it("falls back to the whole year when no term is given", async () => {
    const res = await detail(`academic_year_id=${yearId}`);
    expect(res.body.data.schedule).toHaveLength(2);
  });

  it("lists the current year's teacher, not last year's", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    const ids = res.body.data.teachers.map((t: any) => t.user_id);
    expect(ids).toContain(teacherId);
    expect(ids).not.toContain(formerTeacherId);
  });

  it("keeps a student placed for the selected year", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    const ids = res.body.data.students.map((s: any) => s.user_id);
    expect(ids).toContain(currentStudentId);
  });

  it("excludes a student whose enrolment belongs to a previous year", async () => {
    // Enrolment is an explicit per-year record, so it matches the selected
    // year exactly -- unlike the class-group placement, which carries forward
    // because schools do not re-stamp rosters the day a new year opens.
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    const ids = res.body.data.students.map((s: any) => s.user_id);
    expect(ids).not.toContain(staleEnrolmentStudentId);
    expect(ids).toContain(currentStudentId);
  });

  it("still names the section from a placement that carried forward", async () => {
    // The student IS enrolled this year but was placed last year and never
    // re-stamped -- they must keep their class group, not lose it.
    const carriedId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: carriedId,
      classGroupId,
      academicYearId: priorYearId,
    });
    await createStudentSubjectEnrollment({
      userId: carriedId,
      subjectId,
      academicYearId: yearId,
    });

    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    const row = res.body.data.students.find(
      (s: any) => s.user_id === carriedId,
    );
    expect(row).toBeDefined();
    expect(row.class_group_id).toBe(classGroupId);
  });

  it("excludes a student only placed in a later year", async () => {
    const res = await detail(
      `academic_year_id=${yearId}&academic_term_id=${termOneId}`,
    );
    const ids = res.body.data.students.map((s: any) => s.user_id);
    expect(ids).not.toContain(futureStudentId);
  });
});
