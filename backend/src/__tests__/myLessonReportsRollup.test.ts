import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
} from "../test/fixtures";

// Self-scoped counterpart to GET /reports/admin/lesson-reports/rollup
// (adminLessonReportsRollup.test.ts) — same buildLessonReportRollup grouping,
// restricted to the authenticated instructor's own LessonReport rows via a
// server-set reported_by filter (Reporting Module Dashboard Download plan §3).
describe("GET /reports/lessons/rollup", () => {
  let instructorAToken: string;
  let instructorBToken: string;
  let academicTermId: number;
  let subjectA: number;
  let classGroupA: number;

  beforeAll(async () => {
    const instructorAId = await createUser();
    instructorAToken = signToken(instructorAId);

    const instructorBId = await createUser();
    instructorBToken = signToken(instructorBId);

    const { academicYearId, academicTermId: termId } = await createAcademicPeriod();
    academicTermId = termId;

    classGroupA = await createProgramGradeClassGroup();
    subjectA = await createSubject();

    await createTeacherSubjectAssignment({ userId: instructorAId, subjectId: subjectA, classGroupId: classGroupA, academicYearId });
    await createTeacherSubjectAssignment({ userId: instructorBId, subjectId: subjectA, classGroupId: classGroupA, academicYearId });

    // Instructor A: two reports in range
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${instructorAToken}`)
      .send({ delivery_date: "2026-01-02", subject_id: subjectA, class_group_id: classGroupA, academic_term_id: academicTermId });
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${instructorAToken}`)
      .send({ delivery_date: "2026-01-03", subject_id: subjectA, class_group_id: classGroupA, academic_term_id: academicTermId });

    // Instructor B: one report in the same range/subject/class group
    await request(app)
      .post("/reports/lessons")
      .set("Authorization", `Bearer ${instructorBToken}`)
      .send({ delivery_date: "2026-01-04", subject_id: subjectA, class_group_id: classGroupA, academic_term_id: academicTermId });
  });

  it("requires start_date, end_date, and academic_term_id", async () => {
    const res = await request(app)
      .get("/reports/lessons/rollup")
      .set("Authorization", `Bearer ${instructorAToken}`);
    expect(res.status).toBe(400);
  });

  it("returns only the authenticated instructor's own reports, even when another instructor has rows in the same range/subject/class group", async () => {
    const res = await request(app)
      .get("/reports/lessons/rollup")
      .query({ start_date: "2026-01-01", end_date: "2026-01-31", academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${instructorAToken}`);

    expect(res.status).toBe(200);
    const { subjects } = res.body.data;
    expect(subjects.length).toBe(1);
    const week = subjects[0].class_groups[0].weeks[0];
    expect(week.entries.length).toBe(2);
  });

  it("ignores a reported_by value passed via query string — always scoped to the authenticated user", async () => {
    const res = await request(app)
      .get("/reports/lessons/rollup")
      .query({
        start_date: "2026-01-01",
        end_date: "2026-01-31",
        academic_term_id: academicTermId,
        reported_by: 999999,
      })
      .set("Authorization", `Bearer ${instructorAToken}`);

    expect(res.status).toBe(200);
    const week = res.body.data.subjects[0].class_groups[0].weeks[0];
    expect(week.entries.length).toBe(2);
  });

  it("returns a well-formed empty rollup for an instructor with zero reports in range", async () => {
    const emptyInstructorId = await createUser();
    const emptyToken = signToken(emptyInstructorId);

    const res = await request(app)
      .get("/reports/lessons/rollup")
      .query({ start_date: "2026-01-01", end_date: "2026-01-31", academic_term_id: academicTermId })
      .set("Authorization", `Bearer ${emptyToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subjects).toEqual([]);
  });
});
