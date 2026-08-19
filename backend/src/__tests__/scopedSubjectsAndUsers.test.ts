import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createProgramLead,
  createSubject,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// Class Subjects / Class Users used to issue one request per assigned grade and
// merge client-side. The merge hid two server-side fan-outs:
//   * a teacher assigned to the same subject in two class groups came back as
//     two rows, rendering their chip twice on the subject card;
//   * the user query joined UserRole, so a two-role user produced two rows and
//     the client-side dedupe kept only one — their second role vanished from
//     the role tabs.
// The scoped endpoints answer across every assigned grade in one request and
// collapse both fan-outs server side.
describe("Grade-scoped subjects and users", () => {
  let yearId: number;
  let gradeA: number;
  let gradeB: number;
  let classGroupA1: number;
  let classGroupA2: number;
  let classGroupB: number;
  let outsideGradeId: number;
  let outsideClassGroupId: number;
  let programId: number;

  let classTeacherToken: string;
  let programLeadToken: string;
  let unscopedToken: string;

  let sharedSubjectId: number;
  let outsideSubjectId: number;
  let dualRoleTeacherId: number;
  let studentInScopeId: number;
  let studentOutOfScopeId: number;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;

    // Two grades in one program, plus a third grade in another program that
    // must never leak into a scoped result.
    const a1 = await createProgramGradeClassGroupDetailed();
    programId = a1.programId;
    gradeA = a1.gradeId;
    classGroupA1 = a1.classGroupId;

    // A second class group inside the SAME grade — this is what produced the
    // duplicate teacher chips.
    const a2 = await createProgramGradeClassGroupDetailed({
      programId,
      gradeId: gradeA,
    });
    classGroupA2 = a2.classGroupId;

    const b = await createProgramGradeClassGroupDetailed({ programId });
    gradeB = b.gradeId;
    classGroupB = b.classGroupId;

    const outside = await createProgramGradeClassGroupDetailed();
    outsideGradeId = outside.gradeId;
    outsideClassGroupId = outside.classGroupId;

    const viewerRoleId = await createRoleWithPermissions("CLASS_TEACHER_VIEW", [
      Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE,
      Permissions.VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE,
    ]);

    // Class teacher over both class groups of grade A and over grade B.
    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, viewerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: gradeA,
      classGroupId: classGroupA1,
      academicYearId: yearId,
    });
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: gradeA,
      classGroupId: classGroupA2,
      academicYearId: yearId,
    });
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: gradeB,
      classGroupId: classGroupB,
      academicYearId: yearId,
    });
    classTeacherToken = signToken(classTeacherId);

    // Program lead over the same program — should resolve to grades A and B
    // through the program, never to the outside grade.
    const programLeadId = await createUser({ userType: "ADMIN" });
    await assignRole(programLeadId, viewerRoleId);
    await createProgramLead({
      userId: programLeadId,
      programId,
      academicYearId: yearId,
    });
    programLeadToken = signToken(programLeadId);

    // Neither a class teacher nor a program lead: unscoped, sees everything.
    const unscopedId = await createUser({ userType: "ADMIN" });
    await assignRole(unscopedId, viewerRoleId);
    unscopedToken = signToken(unscopedId);

    // One subject taught by one teacher in BOTH class groups of grade A.
    sharedSubjectId = await createSubject();
    dualRoleTeacherId = await createUser({ userType: "TEACHER" });
    for (const classGroupId of [classGroupA1, classGroupA2]) {
      await createTeacherSubjectAssignment({
        userId: dualRoleTeacherId,
        subjectId: sharedSubjectId,
        classGroupId,
        academicYearId: yearId,
      });
    }

    // The same teacher holds two roles.
    const roleOne = await createRoleWithPermissions("DUAL_ROLE_ONE", []);
    const roleTwo = await createRoleWithPermissions("DUAL_ROLE_TWO", []);
    await assignRole(dualRoleTeacherId, roleOne);
    await assignRole(dualRoleTeacherId, roleTwo);

    // A subject taught only outside the scope.
    outsideSubjectId = await createSubject();
    const outsideTeacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({
      userId: outsideTeacherId,
      subjectId: outsideSubjectId,
      classGroupId: outsideClassGroupId,
      academicYearId: yearId,
    });

    // Students: one inside grade A, one in the outside grade.
    studentInScopeId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: studentInScopeId,
      classGroupId: classGroupA1,
      academicYearId: yearId,
    });
    await createStudentSubjectEnrollment({
      userId: studentInScopeId,
      subjectId: sharedSubjectId,
      academicYearId: yearId,
    });

    studentOutOfScopeId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: studentOutOfScopeId,
      classGroupId: outsideClassGroupId,
      academicYearId: yearId,
    });
  });

  const getSubjects = (token: string, query = "") =>
    request(app)
      .get(`/users/scope/subjects?academic_year_id=${yearId}${query}`)
      .set("Authorization", `Bearer ${token}`);

  const getUsers = (token: string, query = "") =>
    request(app)
      .get(`/users/scope/users?academic_year_id=${yearId}${query}`)
      .set("Authorization", `Bearer ${token}`);

  it("lists a teacher once per subject, not once per class group", async () => {
    const res = await getSubjects(classTeacherToken, "&limit=500");
    expect(res.status).toBe(200);

    const subject = res.body.data.find(
      (s: any) => s.subject_id === sharedSubjectId,
    );
    expect(subject).toBeDefined();
    const occurrences = subject.teachers.filter(
      (t: any) => t.user_id === dualRoleTeacherId,
    );
    expect(occurrences).toHaveLength(1);
    // Both class groups are still reported, just not by duplicating the teacher.
    expect(subject.class_groups.map((c: any) => c.class_group_id).sort()).toEqual(
      [classGroupA1, classGroupA2].sort(),
    );
  });

  it("excludes subjects taught only outside the assigned grades", async () => {
    const res = await getSubjects(classTeacherToken, "&limit=500");
    const ids = res.body.data.map((s: any) => s.subject_id);
    expect(ids).toContain(sharedSubjectId);
    expect(ids).not.toContain(outsideSubjectId);
  });

  it("keeps every role a user holds instead of collapsing to one", async () => {
    const res = await getUsers(classTeacherToken, "&limit=500");
    expect(res.status).toBe(200);

    const teacher = res.body.data.users.find(
      (u: any) => u.user_id === dualRoleTeacherId,
    );
    expect(teacher).toBeDefined();
    expect(teacher.roles.length).toBeGreaterThanOrEqual(2);
    // And they appear exactly once despite two class-group assignments.
    expect(
      res.body.data.users.filter((u: any) => u.user_id === dualRoleTeacherId),
    ).toHaveLength(1);
  });

  it("excludes users who are only in a grade outside the scope", async () => {
    const res = await getUsers(classTeacherToken, "&limit=500");
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids).toContain(studentInScopeId);
    expect(ids).not.toContain(studentOutOfScopeId);
  });

  it("returns role tab counts alongside the users, in the same request", async () => {
    const res = await getUsers(classTeacherToken, "&limit=500");
    expect(Array.isArray(res.body.data.roleGroups)).toBe(true);
    const total = res.body.data.roleGroups.reduce(
      (sum: number, g: any) => sum + g.count,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });

  it("lets a scoped user narrow to one of their grades", async () => {
    const res = await getUsers(
      classTeacherToken,
      `&grade_ids=${gradeB}&limit=500`,
    );
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids).not.toContain(studentInScopeId);
  });

  it("clamps a grade_ids filter that reaches outside the scope", async () => {
    const res = await getUsers(
      classTeacherToken,
      `&grade_ids=${outsideGradeId}&limit=500`,
    );
    expect(res.status).toBe(200);
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids).not.toContain(studentOutOfScopeId);
    // Nothing of the requested grade survives the clamp, so the result is empty
    // rather than silently falling back to every grade.
    expect(ids).toHaveLength(0);
  });

  it("resolves a program lead's scope through their program's grades", async () => {
    const res = await getUsers(programLeadToken, "&limit=500");
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids).toContain(studentInScopeId);
    expect(ids).not.toContain(studentOutOfScopeId);
  });

  it("applies no grade filter for a user with neither assignment", async () => {
    const res = await getUsers(unscopedToken, "&limit=500");
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids).toContain(studentInScopeId);
    expect(ids).toContain(studentOutOfScopeId);
  });

  it("paginates server-side and reports the true total", async () => {
    const res = await getUsers(classTeacherToken, "&limit=1&page=1");
    expect(res.body.data.users).toHaveLength(1);
    expect(Number(res.headers["x-total-count"])).toBeGreaterThan(1);
  });

  it("searches across name, email and role", async () => {
    const res = await getUsers(classTeacherToken, "&search=zzz-no-such-user");
    expect(res.body.data.users).toHaveLength(0);
    expect(res.headers["x-total-count"]).toBe("0");
  });
});
