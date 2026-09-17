import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createSubject,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// Class Subjects for a Year 1 class teacher listed Year 2 subjects (Advanced
// Database, Data Structures, Fundamentals of OOP…), all unstaffed.
//
// The cause was the ORDER of two operations. Enrolments were matched to a
// student's class group by joining on the student and then filtering the
// joined class group by the caller's grades. A student who did Year 1 last
// year and has moved up to Year 2 still has a Year 1 placement row, so that
// filter matched — and every one of their Year 2 enrolments was attributed to
// the Year 1 class group they had left.
//
// The placement must be collapsed to the student's current one FIRST, and the
// grade filter applied to that.
describe("A promoted student does not drag their new grade's subjects back", () => {
  let priorYearId: number;
  let currentYearId: number;
  let yearOneGradeId: number;
  let yearOneClassGroupId: number;
  let yearTwoClassGroupId: number;
  let yearOneToken: string;
  let yearOneSubjectId: number;
  let yearTwoSubjectId: number;
  let promotedStudentId: number;
  let stayingStudentId: number;

  beforeAll(async () => {
    const prior = await createAcademicPeriod();
    priorYearId = prior.academicYearId;
    const current = await createAcademicPeriod();
    currentYearId = current.academicYearId;

    const yearOne = await createProgramGradeClassGroupDetailed();
    yearOneGradeId = yearOne.gradeId;
    yearOneClassGroupId = yearOne.classGroupId;

    // A different grade in the same program — "Year 2".
    const yearTwo = await createProgramGradeClassGroupDetailed({
      programId: yearOne.programId,
    });
    yearTwoClassGroupId = yearTwo.classGroupId;

    const viewerRoleId = await createRoleWithPermissions("PROMOTION_VIEW", [
      Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
      Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE,
    ]);
    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, viewerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: yearOneGradeId,
      classGroupId: yearOneClassGroupId,
      academicYearId: currentYearId,
    });
    yearOneToken = signToken(classTeacherId);

    yearOneSubjectId = await createSubject();
    yearTwoSubjectId = await createSubject();

    // Promoted: Year 1 last year, Year 2 this year, enrolled in a Year 2
    // subject this year. Neither subject has a teacher assigned, so both can
    // only reach the list through the enrolment path.
    promotedStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: promotedStudentId,
      classGroupId: yearOneClassGroupId,
      academicYearId: priorYearId,
    });
    await createStudentClassGroup({
      userId: promotedStudentId,
      classGroupId: yearTwoClassGroupId,
      academicYearId: currentYearId,
    });
    await createStudentSubjectEnrollment({
      userId: promotedStudentId,
      subjectId: yearTwoSubjectId,
      academicYearId: currentYearId,
    });

    // Still in Year 1, enrolled in the Year 1 subject.
    stayingStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: stayingStudentId,
      classGroupId: yearOneClassGroupId,
      academicYearId: currentYearId,
    });
    await createStudentSubjectEnrollment({
      userId: stayingStudentId,
      subjectId: yearOneSubjectId,
      academicYearId: currentYearId,
    });
  });

  const subjects = () =>
    request(app)
      .get(
        `/users/scope/subjects?academic_year_id=${currentYearId}&limit=500`,
      )
      .set("Authorization", `Bearer ${yearOneToken}`);

  const users = () =>
    request(app)
      .get(`/users/scope/users?academic_year_id=${currentYearId}&limit=500`)
      .set("Authorization", `Bearer ${yearOneToken}`);

  it("keeps the promoted student's new-grade subject off the Year 1 list", async () => {
    const res = await subjects();
    expect(res.status).toBe(200);
    const ids = res.body.data.subjects.map((s: any) => s.subject_id);
    expect(ids).not.toContain(yearTwoSubjectId);
  });

  it("still lists the subject of a student who stayed", async () => {
    const res = await subjects();
    const ids = res.body.data.subjects.map((s: any) => s.subject_id);
    expect(ids).toContain(yearOneSubjectId);
  });

  it("drops the promoted student from the Year 1 roster", async () => {
    const res = await users();
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids).not.toContain(promotedStudentId);
    expect(ids).toContain(stayingStudentId);
  });

  it("keeps the promoted student off the Year 1 subject's detail roster", async () => {
    const res = await request(app)
      .get(
        `/users/scope/subjects/${yearOneSubjectId}?academic_year_id=${currentYearId}`,
      )
      .set("Authorization", `Bearer ${yearOneToken}`);

    const ids = res.body.data.students.map((s: any) => s.user_id);
    expect(ids).toContain(stayingStudentId);
    expect(ids).not.toContain(promotedStudentId);
  });

  it("names the class group the student actually sits in", async () => {
    const res = await users();
    const staying = res.body.data.users.find(
      (u: any) => u.user_id === stayingStudentId,
    );
    expect(staying.class_groups.map((c: any) => c.class_group_id)).toEqual([
      yearOneClassGroupId,
    ]);
  });
});
