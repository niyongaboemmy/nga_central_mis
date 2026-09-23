import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  createAcademicPeriod,
  createProgramGradeClassGroupDetailed,
  createSubject,
  createTeacherSubjectAssignment,
  createSchemeOfWork,
  createSchemeOfWorkEntry,
  createRoleWithPermissions,
  assignRole,
  signToken,
} from "../test/fixtures";

// The Scheme of Work list's coverage bars and the Teacher Dashboard's coverage
// chart are fed by the same service (loadSchemeStatus), so this asserts the
// rule they share: a row per assignment — including the assignment with no
// scheme at all, which is the one the teacher has to act on.
describe("GET /scheme-of-work/my-progress", () => {
  let token: string;
  let teacherId: number;
  let academicYearId: number;
  let academicTermId: number;
  let classGroupId: number;
  let planned: number;
  let started: number;
  let missing: number;

  const progress = () =>
    request(app)
      .get("/scheme-of-work/my-progress")
      .query({
        academic_year_id: academicYearId,
        academic_term_id: academicTermId,
      })
      .set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;

    const group = await createProgramGradeClassGroupDetailed();
    classGroupId = group.classGroupId;

    planned = await createSubject();
    started = await createSubject();
    missing = await createSubject();

    teacherId = await createUser({ userType: "TEACHER" });
    const role = await createRoleWithPermissions("sow-progress-teacher", [
      "VIEW_MY_ASSIGNED_SUBJECTS",
    ]);
    await assignRole(teacherId, role);
    token = signToken(teacherId);

    for (const subjectId of [planned, started, missing]) {
      await createTeacherSubjectAssignment({
        userId: teacherId,
        subjectId,
        classGroupId,
        academicYearId,
      });
    }

    // Three weeks planned.
    const fullScheme = await createSchemeOfWork({
      userId: teacherId,
      subjectId: planned,
      classGroupId,
      academicTermId,
    });
    for (let i = 0; i < 3; i++) await createSchemeOfWorkEntry(fullScheme);

    // A scheme row exists but nothing has been planned into it yet.
    await createSchemeOfWork({
      userId: teacherId,
      subjectId: started,
      classGroupId,
      academicTermId,
    });

    // `missing` deliberately gets no scheme at all.
  });

  it("returns one row per assignment, including the one with no scheme", async () => {
    const res = await progress();
    expect(res.status).toBe(200);

    const rows = res.body.data.rows;
    expect(rows).toHaveLength(3);

    const bySubject = (id: number) =>
      rows.find((r: any) => r.subject_id === id);

    expect(bySubject(planned)).toMatchObject({
      status: "submitted",
      entries_count: 3,
    });
    expect(bySubject(started)).toMatchObject({
      status: "submitted",
      entries_count: 0,
    });
    expect(bySubject(missing)).toMatchObject({
      status: "pending",
      scheme_id: null,
      entries_count: 0,
    });
  });

  it("carries the term calendar the client needs to judge 'behind'", async () => {
    const res = await progress();
    const period = res.body.data.period;
    expect(period.academic_term_id).toBe(academicTermId);
    // Without these the client cannot work out which week the term is in, and
    // deliberately reports nothing as behind rather than guessing.
    expect(period.term_start_date).toBeTruthy();
    expect(period.term_end_date).toBeTruthy();
  });

  it("names the class group and grade so rows can be told apart", async () => {
    const res = await progress();
    const row = res.body.data.rows[0];
    expect(row.class_group_id).toBe(classGroupId);
    expect(row.class_group_name).toBeTruthy();
    expect(row).toHaveProperty("subject_name");
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/scheme-of-work/my-progress");
    expect(res.status).toBe(401);
  });
});
