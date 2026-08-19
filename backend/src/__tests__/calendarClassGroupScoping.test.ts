import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createUserGradeAssignment,
  createSubject,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";
import { Permissions } from "../utils/permissions";

// The Academic Calendar's class-group picker used to list every class group in
// the year and filter them in the browser by matching `grade_name` strings.
//
// The clamp is on class_group_id, NOT grade_id: a class-teacher assignment
// names one section (L3 Class A), and the teacher of L3 Class B is a different
// person. Filtering by grade offered both, which is what these tests pin down.
// Rows also carry grade_id so the client can pre-select without string matching.
describe("GET /calendar/calendars/class-groups — scoped to the caller's grades", () => {
  let yearId: number;
  let myClassGroupId: number;
  let myGradeId: number;
  let siblingClassGroupId: number;
  let otherClassGroupId: number;
  let classTeacherToken: string;
  let unscopedToken: string;

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    yearId = period.academicYearId;

    const mine = await createProgramGradeClassGroupDetailed();
    myClassGroupId = mine.classGroupId;
    myGradeId = mine.gradeId;

    // A second section of the SAME grade, led by someone else.
    const sibling = await createProgramGradeClassGroupDetailed({
      programId: mine.programId,
      gradeId: mine.gradeId,
    });
    siblingClassGroupId = sibling.classGroupId;

    const theirs = await createProgramGradeClassGroupDetailed();
    otherClassGroupId = theirs.classGroupId;

    const viewerRoleId = await createRoleWithPermissions("CAL_VIEWER", [
      Permissions.VIEW_ACADEMIC_CALENDAR,
    ]);

    // A class group only counts as "in this year" if it has a teacher
    // assignment for the year — seed one for each.
    const subjectId = await createSubject();
    for (const classGroupId of [
      myClassGroupId,
      siblingClassGroupId,
      otherClassGroupId,
    ]) {
      const teacherId = await createUser({ userType: "TEACHER" });
      await createTeacherSubjectAssignment({
        userId: teacherId,
        subjectId,
        classGroupId,
        academicYearId: yearId,
      });
    }

    const classTeacherId = await createUser({ userType: "TEACHER" });
    await assignRole(classTeacherId, viewerRoleId);
    await createUserGradeAssignment({
      userId: classTeacherId,
      gradeId: myGradeId,
      classGroupId: myClassGroupId,
      academicYearId: yearId,
    });
    classTeacherToken = signToken(classTeacherId);

    const unscopedId = await createUser({ userType: "ADMIN" });
    await assignRole(unscopedId, viewerRoleId);
    unscopedToken = signToken(unscopedId);
  });

  const classGroups = (token: string) =>
    request(app)
      .get(`/calendar/calendars/class-groups?academic_year_id=${yearId}`)
      .set("Authorization", `Bearer ${token}`);

  it("offers a class teacher only the class groups named in their assignments", async () => {
    const res = await classGroups(classTeacherToken);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((g: any) => g.class_group_id);
    expect(ids).toContain(myClassGroupId);
    expect(ids).not.toContain(otherClassGroupId);
  });

  it("does not offer a sibling section of the same grade", async () => {
    const res = await classGroups(classTeacherToken);
    const ids = res.body.data.map((g: any) => g.class_group_id);
    // Same grade, different section, different class teacher — a grade-level
    // filter would have let this through.
    expect(ids).not.toContain(siblingClassGroupId);
    expect(ids).toEqual([myClassGroupId]);
  });

  it("carries grade_id so the client can pre-select without name matching", async () => {
    const res = await classGroups(classTeacherToken);
    const mine = res.body.data.find(
      (g: any) => g.class_group_id === myClassGroupId,
    );
    expect(mine.grade_id).toBe(myGradeId);
  });

  it("still offers every class group to an unscoped user", async () => {
    const res = await classGroups(unscopedToken);
    const ids = res.body.data.map((g: any) => g.class_group_id);
    expect(ids).toContain(myClassGroupId);
    expect(ids).toContain(siblingClassGroupId);
    expect(ids).toContain(otherClassGroupId);
  });
});
