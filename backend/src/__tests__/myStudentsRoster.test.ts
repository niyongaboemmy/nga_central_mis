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

// "My Students" is the roster of everyone the signed-in teacher actually
// teaches: a student must be in one of the teacher's class groups AND enrolled
// in the subject the teacher teaches to that group. Listing the class group's
// whole membership instead swept in students the teacher never teaches and
// badged all of them with every subject of that group.
describe("GET /academics/my-students", () => {
  let teacherToken: string;
  let teacherId: number;
  let academicYearId: number;
  let academicTermId: number;

  let groupA: number; // teacher teaches maths + physics here
  let groupB: number; // teacher teaches history here
  let foreignGroup: number; // teacher teaches nothing here

  let maths: number;
  let physics: number;
  let history: number;
  let art: number; // nobody's assignment -- must never pull a student in

  let takesBoth: number; // in A, enrolled in maths + physics
  let takesMathsOnly: number; // in A, enrolled in maths only
  let takesNothing: number; // in A, enrolled in neither
  let inGroupB: number; // in B, enrolled in history
  let outsider: number; // in foreignGroup, enrolled in maths
  let wrongGroupSameSubject: number; // in foreignGroup, enrolled in maths

  const get = (query: Record<string, unknown> = {}, token = teacherToken) =>
    request(app)
      .get("/academics/my-students")
      .query({ academic_year_id: academicYearId, ...query })
      .set("Authorization", `Bearer ${token}`);

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
    art = await createSubject();

    teacherId = await createUser({ userType: "TEACHER" });
    const role = await createRoleWithPermissions("my-students-teacher", [
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

    const enrol = async (
      userId: number,
      classGroupId: number,
      subjectIds: number[],
    ) => {
      await createStudentClassGroup({ userId, classGroupId, academicYearId });
      for (const subjectId of subjectIds) {
        await createStudentSubjectEnrollment({
          userId,
          subjectId,
          academicYearId,
        });
      }
    };

    takesBoth = await createUser({ userType: "STUDENT" });
    await enrol(takesBoth, groupA, [maths, physics]);

    takesMathsOnly = await createUser({ userType: "STUDENT" });
    await enrol(takesMathsOnly, groupA, [maths, art]);

    takesNothing = await createUser({ userType: "STUDENT" });
    await enrol(takesNothing, groupA, [art]);

    inGroupB = await createUser({ userType: "STUDENT" });
    await enrol(inGroupB, groupB, [history]);

    outsider = await createUser({ userType: "STUDENT" });
    await enrol(outsider, foreignGroup, [art]);

    wrongGroupSameSubject = await createUser({ userType: "STUDENT" });
    await enrol(wrongGroupSameSubject, foreignGroup, [maths]);
  });

  it("returns students across every assigned subject and class group", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const ids = res.body.data.students.map((s: any) => s.user_id);

    expect(ids).toContain(takesBoth);
    expect(ids).toContain(takesMathsOnly);
    expect(ids).toContain(inGroupB); // the second class group is included too
    expect(res.body.data.total).toBe(3);
  });

  it("excludes a class group member who takes none of the teacher's subjects", async () => {
    const res = await get();
    const ids = res.body.data.students.map((s: any) => s.user_id);
    expect(ids).not.toContain(takesNothing);
  });

  it("excludes students of class groups the teacher is not assigned to", async () => {
    const res = await get();
    const ids = res.body.data.students.map((s: any) => s.user_id);
    expect(ids).not.toContain(outsider);
    // enrolled in maths, but not in the group the teacher teaches maths to
    expect(ids).not.toContain(wrongGroupSameSubject);
  });

  it("badges each student with only the subjects they take with this teacher", async () => {
    const res = await get();
    const byId = Object.fromEntries(
      res.body.data.students.map((s: any) => [s.user_id, s]),
    );

    expect(
      byId[takesBoth].subjects.map((s: any) => s.subject_id).sort(),
    ).toEqual([maths, physics].sort());
    // maths only -- art is not this teacher's subject
    expect(byId[takesMathsOnly].subjects.map((s: any) => s.subject_id)).toEqual([
      maths,
    ]);
  });

  it("narrows to one subject without losing the other filter options", async () => {
    const res = await get({ subject_id: physics });
    const ids = res.body.data.students.map((s: any) => s.user_id);

    expect(ids).toEqual([takesBoth]);
    // the dropdowns still offer everything the teacher teaches
    expect(res.body.data.filters.subjects).toHaveLength(3);
    expect(res.body.data.filters.class_groups).toHaveLength(2);
  });

  it("narrows to one class group", async () => {
    const res = await get({ class_group_id: groupB });
    const ids = res.body.data.students.map((s: any) => s.user_id);
    expect(ids).toEqual([inGroupB]);
  });

  it("returns nothing for a class group the teacher does not teach", async () => {
    const res = await get({ class_group_id: foreignGroup });
    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(0);
  });

  it("rejects a malformed filter rather than reporting an empty roster", async () => {
    expect((await get({ subject_id: "abc" })).status).toBe(400);
    expect((await get({ class_group_id: "-1" })).status).toBe(400);
  });

  it("ignores enrolments and memberships from another academic year", async () => {
    const otherYear = await createAcademicPeriod();
    const ghost = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: ghost,
      classGroupId: groupA,
      academicYearId: otherYear.academicYearId,
    });
    await createStudentSubjectEnrollment({
      userId: ghost,
      subjectId: maths,
      academicYearId: otherYear.academicYearId,
    });

    const ids = (await get()).body.data.students.map((s: any) => s.user_id);
    expect(ids).not.toContain(ghost);
  });

  it("skips a disabled enrolment", async () => {
    const dropped = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({
      userId: dropped,
      classGroupId: groupA,
      academicYearId,
    });
    await createStudentSubjectEnrollment({
      userId: dropped,
      subjectId: maths,
      academicYearId,
      status: "DISABLED",
    });

    const ids = (await get()).body.data.students.map((s: any) => s.user_id);
    expect(ids).not.toContain(dropped);
  });

  it("403s without the VIEW_MY_STUDENTS permission", async () => {
    const strangerId = await createUser({ userType: "TEACHER" });
    const res = await get({}, signToken(strangerId));
    expect(res.status).toBe(403);
  });
});
