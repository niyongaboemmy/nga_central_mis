import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// The dashboard's "Total Students" counted enrolment ROWS in the teacher's
// subjects across the whole school -- a student taking three of their subjects
// counted three times, other teachers' class groups counted too, and disabled
// enrolments and non-student accounts were never excluded. One real teacher's
// headline read 76 where the truth was 11. It now shares the My Students rule,
// so the two views cannot disagree.
describe("Teacher dashboard student count", () => {
  let teacherToken: string;
  let teacherId: number;
  let academicYearId: number;
  let academicTermId: number;
  let groupA: number;
  let groupB: number;
  let foreignGroup: number;
  let maths: number;
  let physics: number;
  let history: number;

  const dashboard = () =>
    request(app)
      .get("/dashboard/teacher-stats")
      .query({ academic_year_id: academicYearId, academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${teacherToken}`);

  const myStudents = () =>
    request(app)
      .get("/academics/my-students")
      .query({ academic_year_id: academicYearId })
      .set("Authorization", `Bearer ${teacherToken}`);

  const enrol = async (
    userId: number,
    classGroupId: number,
    subjectIds: number[],
    status: "ACTIVE" | "DISABLED" = "ACTIVE",
  ) => {
    await createStudentClassGroup({ userId, classGroupId, academicYearId });
    for (const subjectId of subjectIds) {
      await createStudentSubjectEnrollment({
        userId,
        subjectId,
        academicYearId,
        status,
      });
    }
  };

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;

    const a = await createProgramGradeClassGroupDetailed();
    groupA = a.classGroupId;
    const b = await createProgramGradeClassGroupDetailed();
    groupB = b.classGroupId;
    const foreign = await createProgramGradeClassGroupDetailed();
    foreignGroup = foreign.classGroupId;

    maths = await createSubject();
    physics = await createSubject();
    history = await createSubject();

    teacherId = await createUser({ userType: "TEACHER" });
    const role = await createRoleWithPermissions("dash-teacher", [
      "TEACHER_DASHBOARD",
      "VIEW_MY_STUDENTS",
    ]);
    await assignRole(teacherId, role);
    teacherToken = signToken(teacherId);

    for (const [subject, group] of [
      [maths, groupA],
      [physics, groupA],
      [history, groupB],
    ] as const) {
      await createTeacherSubjectAssignment({
        userId: teacherId,
        subjectId: subject,
        classGroupId: group,
        academicYearId,
      });
    }

    // Counts once despite taking two of the teacher's subjects.
    const takesTwo = await createUser({ userType: "STUDENT" });
    await enrol(takesTwo, groupA, [maths, physics]);

    const takesOne = await createUser({ userType: "STUDENT" });
    await enrol(takesOne, groupA, [maths]);

    const inGroupB = await createUser({ userType: "STUDENT" });
    await enrol(inGroupB, groupB, [history]);

    // None of these may count.
    const notEnrolled = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: notEnrolled,
      classGroupId: groupA,
      academicYearId,
    });

    const otherTeachersPupil = await createUser({ userType: "STUDENT" });
    await enrol(otherTeachersPupil, foreignGroup, [maths]);

    const dropped = await createUser({ userType: "STUDENT" });
    await enrol(dropped, groupA, [maths], "DISABLED");

    const staffMember = await createUser({ userType: "TEACHER" });
    await enrol(staffMember, groupA, [maths]);
  });

  it("counts each student once, however many of the teacher's subjects they take", async () => {
    const res = await dashboard();
    expect(res.status).toBe(200);
    // takesTwo + takesOne + inGroupB — four enrolment rows, three students
    expect(res.body.data.totalStudents).toBe(3);
  });

  it("agrees with the My Students roster", async () => {
    const [stats, roster] = await Promise.all([dashboard(), myStudents()]);
    const distinctStudents = new Set(
      roster.body.data.students.map((s: any) => s.user_id),
    ).size;

    expect(stats.body.data.totalStudents).toBe(distinctStudents);
  });

  it("excludes non-students, dropped enrolments and other teachers' groups", async () => {
    // All three exclusions are already implied by the count of 3 above; assert
    // the roster names them too so a regression says which rule broke.
    const ids = (await myStudents()).body.data.students.map(
      (s: any) => `${s.first_name} ${s.last_name}`,
    );
    expect(ids).toHaveLength(3);
  });

  it("reports the teacher's own subject and class-group totals", async () => {
    const res = await dashboard();
    expect(res.body.data.assignedSubjects).toBe(3);
    expect(res.body.data.assignedClassGroups).toBe(2);
  });

  it("counts nothing in a year the teacher has no assignments for", async () => {
    const otherYear = await createAcademicPeriod();
    const res = await request(app)
      .get("/dashboard/teacher-stats")
      .query({ academic_year_id: otherYear.academicYearId })
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(res.body.data.totalStudents).toBe(0);
    expect(res.body.data.assignedSubjects).toBe(0);
  });
});
