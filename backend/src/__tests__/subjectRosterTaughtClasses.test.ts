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

// A subject's roster is the students with an ACTIVE enrollment who sit in a
// class group the subject is taught to. A stale enrollment left behind when a
// student moved class (2026-11-22: Year 2 students kept a Year 1 subject) must
// not put them on the roster. A subject nobody teaches yet keeps the plain
// enrollment roster.
describe("Subject roster — only students in a class the subject is taught to", () => {
  let token: string;
  let yearId: number;
  let termId: number;
  let taughtSubjectId: number;
  let untaughtSubjectId: number;
  let inClassStudent: number;
  let movedStudent: number;

  beforeAll(async () => {
    const viewerId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("ROSTER_TAUGHT_VIEWER", [
      Permissions.VIEW_SUBJECT_ENROLLED_STUDENTS,
    ]);
    await assignRole(viewerId, roleId);
    token = signToken(viewerId);

    const period = await createAcademicPeriod();
    yearId = period.academicYearId;
    termId = period.academicTermId;

    const taughtClass = await createProgramGradeClassGroup();
    const otherClass = await createProgramGradeClassGroup();

    inClassStudent = await createUser({ userType: "STUDENT" });
    movedStudent = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({ userId: inClassStudent, classGroupId: taughtClass, academicYearId: yearId });
    await createStudentClassGroup({ userId: movedStudent, classGroupId: otherClass, academicYearId: yearId });

    const teacherId = await createUser({ userType: "TEACHER" });
    taughtSubjectId = await createSubject();
    untaughtSubjectId = await createSubject();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: taughtSubjectId,
      classGroupId: taughtClass,
      academicYearId: yearId,
    });

    for (const subjectId of [taughtSubjectId, untaughtSubjectId]) {
      for (const userId of [inClassStudent, movedStudent]) {
        await createStudentSubjectEnrollment({ userId, subjectId, academicYearId: yearId });
      }
    }
  });

  const ids = (res: any) => res.body.data.map((r: any) => r.user_id);

  it("term roster leaves out a student enrolled but placed in another class", async () => {
    const res = await request(app)
      .get(`/academics/subjects/${taughtSubjectId}/terms/${termId}/students`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(inClassStudent);
    expect(ids(res)).not.toContain(movedStudent);
  });

  it("year roster applies the same rule", async () => {
    const res = await request(app)
      .get(`/academics/subjects/${taughtSubjectId}/years/${yearId}/students`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(inClassStudent);
    expect(ids(res)).not.toContain(movedStudent);
  });

  it("a subject with no teaching assignment keeps every enrolled student", async () => {
    const res = await request(app)
      .get(`/academics/subjects/${untaughtSubjectId}/terms/${termId}/students`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(expect.arrayContaining([inClassStudent, movedStudent]));
  });
});
