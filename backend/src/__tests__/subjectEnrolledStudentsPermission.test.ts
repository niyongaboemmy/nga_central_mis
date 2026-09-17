import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createSubject,
  createRoleWithPermissions,
  assignRole,
  createStudentSubjectEnrollment,
} from "../test/fixtures";

// GET /academics/subjects/:id/years/:year/students (the "Students" tab
// roster) previously had `authenticate` only — no permission gate at all.
// With students now able to reach the same /subjects/:subjectId page via
// the My Subjects feature, that endpoint needed a dedicated
// VIEW_SUBJECT_ENROLLED_STUDENTS permission so only instructors, not
// students, can pull a subject's class roster.
describe("GET /academics/subjects/:id/years/:year/students — permission gate", () => {
  let instructorToken: string;
  let studentToken: string;
  let subjectId: number;
  let academicYearId: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    subjectId = await createSubject();

    const instructorRoleId = await createRoleWithPermissions("instructor", [
      "VIEW_SUBJECT_ENROLLED_STUDENTS",
    ]);
    const instructorId = await createUser({ userType: "TEACHER" });
    instructorToken = signToken(instructorId);
    await assignRole(instructorId, instructorRoleId);

    const studentRoleId = await createRoleWithPermissions(
      "student-no-roster-perm",
      ["VIEW_MY_ENROLLED_SUBJECTS"],
    );
    const studentId = await createUser({ userType: "STUDENT" });
    studentToken = signToken(studentId);
    await assignRole(studentId, studentRoleId);
    await createStudentSubjectEnrollment({
      userId: studentId,
      subjectId,
      academicYearId,
    });
  });

  it("lets a holder of VIEW_SUBJECT_ENROLLED_STUDENTS view the roster", async () => {
    const res = await request(app)
      .get(`/academics/subjects/${subjectId}/years/${academicYearId}/students`)
      .set("Authorization", `Bearer ${instructorToken}`);
    expect(res.status).toBe(200);
  });

  it("blocks a student (even one enrolled in the subject) from viewing the roster", async () => {
    const res = await request(app)
      .get(`/academics/subjects/${subjectId}/years/${academicYearId}/students`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });
});
