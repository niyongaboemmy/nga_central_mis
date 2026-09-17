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
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// Regression test for a left-join fan-out: a student's StudentClassGroup
// history spans multiple academic years (one row per year they were ever
// assigned a class group), but the enrolled-students roster only cares
// about their *current* year's class group. Joining without scoping to
// that year used to produce one duplicate result row per historical match.
describe("Subject enrolled students — no duplicate rows from cross-year class group history", () => {
  let viewerToken: string;
  let subjectId: number;
  let currentYearId: number;
  let currentTermId: number;
  let studentUserId: number;

  beforeAll(async () => {
    const viewerId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions("VIEWER_ROLE", [
      Permissions.VIEW_SUBJECT_ENROLLED_STUDENTS,
    ]);
    await assignRole(viewerId, roleId);
    viewerToken = signToken(viewerId);

    const priorYear = await createAcademicPeriod();
    const current = await createAcademicPeriod();
    currentYearId = current.academicYearId;
    currentTermId = current.academicTermId;

    const priorClassGroupId = await createProgramGradeClassGroup();
    const currentClassGroupId = await createProgramGradeClassGroup();

    studentUserId = await createUser({ userType: "STUDENT" });

    // Class-group history across two different years -- this is what used
    // to fan out into duplicate roster rows.
    await createStudentClassGroup({
      userId: studentUserId,
      classGroupId: priorClassGroupId,
      academicYearId: priorYear.academicYearId,
    });
    await createStudentClassGroup({
      userId: studentUserId,
      classGroupId: currentClassGroupId,
      academicYearId: currentYearId,
    });

    subjectId = await createSubject();
    await createStudentSubjectEnrollment({
      userId: studentUserId,
      subjectId,
      academicYearId: currentYearId,
    });
  });

  it("returns exactly one row per student via the year-based endpoint", async () => {
    const res = await request(app)
      .get(`/academics/subjects/${subjectId}/years/${currentYearId}/students`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const rows = res.body.data.filter(
      (r: any) => r.user_id === studentUserId,
    );
    expect(rows).toHaveLength(1);
  });

  it("returns exactly one row per student via the term-based endpoint", async () => {
    const res = await request(app)
      .get(`/academics/subjects/${subjectId}/terms/${currentTermId}/students`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    const rows = res.body.data.filter(
      (r: any) => r.user_id === studentUserId,
    );
    expect(rows).toHaveLength(1);
  });
});
