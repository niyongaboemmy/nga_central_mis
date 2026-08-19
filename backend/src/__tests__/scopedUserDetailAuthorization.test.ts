import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createStudentClassGroup,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// The read-only profile viewer on Class Users needs full detail (roles,
// permissions, placement) for someone the viewer does not have MANAGE_USERS
// over. GET /users/:id is the wrong door for that — it is the management
// route. This scoped route grants exactly the read, and only for people
// inside the caller's own grades, so it cannot be used to walk the whole
// user table.
describe("GET /users/scope/users/:id — read-only detail, scope-enforced", () => {
  let yearId: number;
  let classTeacherToken: string;
  let inScopeStudentId: number;
  let outOfScopeStudentId: number;
  let unscopedToken: string;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;

    const mine = await createProgramGradeClassGroupDetailed();
    const theirs = await createProgramGradeClassGroupDetailed();

    const viewerRoleId = await createRoleWithPermissions("SCOPE_DETAIL_VIEW", [
      Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE,
    ]);

    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, viewerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: mine.gradeId,
      classGroupId: mine.classGroupId,
      academicYearId: yearId,
    });
    classTeacherToken = signToken(classTeacherId);

    const unscopedId = await createUser({ userType: "ADMIN" });
    await assignRole(unscopedId, viewerRoleId);
    unscopedToken = signToken(unscopedId);

    inScopeStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: inScopeStudentId,
      classGroupId: mine.classGroupId,
      academicYearId: yearId,
    });

    outOfScopeStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: outOfScopeStudentId,
      classGroupId: theirs.classGroupId,
      academicYearId: yearId,
    });
  });

  const detail = (token: string, userId: number) =>
    request(app)
      .get(`/users/scope/users/${userId}?academic_year_id=${yearId}`)
      .set("Authorization", `Bearer ${token}`);

  it("returns full read-only detail for a user inside the caller's grades", async () => {
    const res = await detail(classTeacherToken, inScopeStudentId);
    expect(res.status).toBe(200);
    expect(res.body.data.user.user_id).toBe(inScopeStudentId);
    expect(res.body.data).toHaveProperty("profile");
    expect(res.body.data).toHaveProperty("roles");
    expect(res.body.data).toHaveProperty("classGroups");
    expect(res.body.data).toHaveProperty("subjectsEnrolled");
  });

  it("never returns a credential field", async () => {
    const res = await detail(classTeacherToken, inScopeStudentId);
    expect(res.body.data.user).not.toHaveProperty("password_hash");
  });

  it("refuses a user outside the caller's grades", async () => {
    const res = await detail(classTeacherToken, outOfScopeStudentId);
    expect(res.status).toBe(403);
  });

  it("lets an unscoped caller read anyone", async () => {
    const res = await detail(unscopedToken, outOfScopeStudentId);
    expect(res.status).toBe(200);
  });

  it("404s for a user that does not exist", async () => {
    const res = await detail(unscopedToken, 99_999_999);
    expect(res.status).toBe(404);
  });

  it("rejects a caller without VIEW_USERS_BY_CLASS_TEACHER_GRADE", async () => {
    const outsiderId = await createUser({ userType: "STUDENT" });
    const res = await detail(signToken(outsiderId), inScopeStudentId);
    expect(res.status).toBe(403);
  });
});
