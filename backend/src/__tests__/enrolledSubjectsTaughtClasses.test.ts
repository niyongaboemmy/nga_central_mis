import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// A student's subjects are the ACTIVE enrollments in subjects taught to the
// class they sit in this year (or not taught to anyone yet). A stale
// enrollment from before a class move must not list the old subject -- Task
// Mentor shows a student the assignments of exactly these subjects
// (2026-11-22: Year 2 students kept a Year 1 subject and saw its assignment).
describe("Student enrolled subjects — only subjects taught to the student's class", () => {
  let studentId: number;
  let studentToken: string;
  let yearId: number;
  let mySubject: number;
  let oldClassSubject: number;
  let untaughtSubject: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    const myClass = await createProgramGradeClassGroup();
    const oldClass = await createProgramGradeClassGroup();
    const teacherId = await createUser({ userType: "TEACHER" });

    mySubject = await createSubject();
    oldClassSubject = await createSubject();
    untaughtSubject = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: mySubject, classGroupId: myClass, academicYearId: yearId });
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: oldClassSubject, classGroupId: oldClass, academicYearId: yearId });

    studentId = await createUser({ userType: "STUDENT" });
    const roleId = await createRoleWithPermissions("ENROLLED_TAUGHT_STUDENT", [
      Permissions.VIEW_MY_ENROLLED_SUBJECTS,
    ]);
    await assignRole(studentId, roleId);
    studentToken = signToken(studentId);
    await createStudentClassGroup({ userId: studentId, classGroupId: myClass, academicYearId: yearId });
    for (const subjectId of [mySubject, oldClassSubject, untaughtSubject]) {
      await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId: yearId });
    }
  });

  const subjectIds = (res: any) => res.body.data.map((r: any) => r.subject_id);

  it("enrolled-subjects (used by Task Mentor) leaves out a subject taught only to another class", async () => {
    const res = await request(app)
      .get(`/academics/students/${studentId}/enrolled-subjects?academic_year_id=${yearId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(subjectIds(res)).toContain(mySubject);
    expect(subjectIds(res)).toContain(untaughtSubject);
    expect(subjectIds(res)).not.toContain(oldClassSubject);
  });

  it("my-enrolled-subjects applies the same rule", async () => {
    const res = await request(app)
      .get(`/curriculum/my-enrolled-subjects?academic_year_id=${yearId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(subjectIds(res)).toContain(mySubject);
    expect(subjectIds(res)).not.toContain(oldClassSubject);
  });
});
