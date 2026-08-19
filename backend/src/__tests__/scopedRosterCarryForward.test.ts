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

// Class Users came back with teachers but zero students: StudentClassGroup rows
// are stamped with the year they were written, and a school does not re-stamp
// its rosters the moment a new academic year opens. A strict
// `academic_year_id = currentYear` filter therefore emptied every class list
// while teacher assignments (already rolled forward) still matched.
//
// Rosters now carry forward -- the most recent placement at or before the
// selected year wins -- so a student who has genuinely moved class group still
// appears in exactly one place.
describe("Scoped rosters carry forward across academic years", () => {
  let priorYearId: number;
  let currentYearId: number;
  let classTeacherToken: string;
  let stayingStudentId: number;
  let movedStudentId: number;
  let oldClassGroupId: number;
  let newClassGroupId: number;
  let gradeId: number;

  beforeAll(async () => {
    const prior = await createAcademicPeriod();
    priorYearId = prior.academicYearId;
    const current = await createAcademicPeriod();
    currentYearId = current.academicYearId;

    const base = await createProgramGradeClassGroupDetailed();
    gradeId = base.gradeId;
    oldClassGroupId = base.classGroupId;
    const second = await createProgramGradeClassGroupDetailed({
      programId: base.programId,
      gradeId: base.gradeId,
    });
    newClassGroupId = second.classGroupId;

    const viewerRoleId = await createRoleWithPermissions("ROSTER_VIEWER", [
      Permissions.VIEW_USERS_BY_CLASS_TEACHER_GRADE,
    ]);
    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, viewerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId,
      classGroupId: oldClassGroupId,
      academicYearId: currentYearId,
    });
    classTeacherToken = signToken(classTeacherId);

    // Placed last year, never re-stamped for this year.
    stayingStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: stayingStudentId,
      classGroupId: oldClassGroupId,
      academicYearId: priorYearId,
    });

    // Placed last year, moved to another class group this year.
    movedStudentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: movedStudentId,
      classGroupId: oldClassGroupId,
      academicYearId: priorYearId,
    });
    await createStudentClassGroup({
      userId: movedStudentId,
      classGroupId: newClassGroupId,
      academicYearId: currentYearId,
    });
  });

  const users = (query = "") =>
    request(app)
      .get(
        `/users/scope/users?academic_year_id=${currentYearId}&limit=500${query}`,
      )
      .set("Authorization", `Bearer ${classTeacherToken}`);

  it("still lists a student whose placement was never re-stamped this year", async () => {
    const res = await users();
    expect(res.status).toBe(200);
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids).toContain(stayingStudentId);
  });

  it("shows a student who moved only in their new class group", async () => {
    const res = await users();
    const moved = res.body.data.users.find(
      (u: any) => u.user_id === movedStudentId,
    );
    expect(moved).toBeDefined();
    const groupIds = moved.class_groups.map((c: any) => c.class_group_id);
    expect(groupIds).toContain(newClassGroupId);
    // The stale prior-year placement must not resurface alongside it.
    expect(groupIds).not.toContain(oldClassGroupId);
  });

  it("lists each carried-forward student exactly once", async () => {
    const res = await users();
    const ids = res.body.data.users.map((u: any) => u.user_id);
    expect(ids.filter((id: number) => id === stayingStudentId)).toHaveLength(1);
    expect(ids.filter((id: number) => id === movedStudentId)).toHaveLength(1);
  });

  it("opens the profile of a carried-forward student rather than 403ing", async () => {
    // The roster and the profile must agree on who is in scope -- listing
    // someone you then cannot open is the bug this pins down.
    const res = await request(app)
      .get(
        `/users/scope/users/${stayingStudentId}?academic_year_id=${currentYearId}`,
      )
      .set("Authorization", `Bearer ${classTeacherToken}`);
    expect(res.status).toBe(200);
  });
});
