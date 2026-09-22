import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { SubjectCompetency, CompetencyPerformanceCriteria } from "../db/schema";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
} from "../test/fixtures";

// Lesson notes anchor to curriculum performance criteria (a whole Learning Outcome, a
// subset, or criteria across several outcomes) rather than to one Scheme of Work week.
describe("Lesson note curriculum coverage", () => {
  let teacherToken: string;
  let teacherId: number;
  let subjectId: number;
  let otherSubjectId: number;
  let classGroupId: number;
  let lo1: number[] = [];
  let lo2: number[] = [];
  let foreignCriterion: number;

  const addOutcome = async (subject: number, element: number, title: string, n: number) => {
    const [res] = (await db.insert(SubjectCompetency).values({
      subject_id: subject,
      user_id: teacherId,
      element_number: element,
      title,
    } as any)) as any;
    const competencyId = res.insertId as number;
    const ids: number[] = [];
    for (let i = 1; i <= n; i++) {
      const [c] = (await db.insert(CompetencyPerformanceCriteria).values({
        competency_id: competencyId,
        criteria_number: `${element}.${i}`,
        description: `${title} criterion ${i}`,
        sort_order: i,
      } as any)) as any;
      ids.push(c.insertId as number);
    }
    return ids;
  };

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    teacherToken = signToken(teacherId);
    const role = await createRoleWithPermissions("cov_teacher", ["MANAGE_LESSON_NOTES"]);
    await assignRole(teacherId, role);
    const { academicYearId } = await createAcademicPeriod();
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    otherSubjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });

    lo1 = await addOutcome(subjectId, 1, "Design a web page", 3);
    lo2 = await addOutcome(subjectId, 2, "Style with CSS", 2);
    [foreignCriterion] = await addOutcome(otherSubjectId, 1, "Other subject", 1);
  });

  it("stores a mixed selection (whole outcome + part of another) and reports it grouped", async () => {
    const created = await request(app)
      .post("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ subject_id: subjectId, class_group_id: classGroupId, title: "Coverage", criteria_ids: [...lo1, lo2[0]] });
    expect(created.status).toBe(201);
    const noteId = created.body.data.note_id;

    const detail = await request(app).get(`/lesson-notes/${noteId}`).set("Authorization", `Bearer ${teacherToken}`);
    const ctx = detail.body.data.curriculum_context;
    expect(ctx.criteria_ids).toHaveLength(4);
    expect(ctx.outcomes).toHaveLength(2);
    expect(ctx.outcomes[0]).toMatchObject({ element_number: 1, total_criteria: 3 });
    expect(ctx.outcomes[0].criteria).toHaveLength(3);
    expect(ctx.outcomes[1]).toMatchObject({ element_number: 2, total_criteria: 2 });
    expect(ctx.outcomes[1].criteria).toHaveLength(1);

    const list = await request(app).get("/lesson-notes").set("Authorization", `Bearer ${teacherToken}`);
    const row = list.body.data.find((n: any) => n.note_id === noteId);
    expect(row.criteria_ids.sort()).toEqual([...lo1, lo2[0]].sort());
  });

  it("rejects criteria from another subject's curriculum", async () => {
    const res = await request(app)
      .post("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ subject_id: subjectId, title: "Bad", criteria_ids: [lo1[0], foreignCriterion] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/curriculum/i);
  });

  it("lets coverage be re-pointed later via PATCH", async () => {
    const created = await request(app)
      .post("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ subject_id: subjectId, title: "Repoint", criteria_ids: [lo1[0]] });
    const noteId = created.body.data.note_id;
    const patched = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ criteria_ids: lo2 });
    expect(patched.status).toBe(200);
    const detail = await request(app).get(`/lesson-notes/${noteId}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(detail.body.data.curriculum_context.criteria_ids.sort()).toEqual([...lo2].sort());
  });

  it("accepts criteria_ids as a JSON string (multipart form shape)", async () => {
    const res = await request(app)
      .post("/lesson-notes")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ subject_id: subjectId, title: "String ids", criteria_ids: JSON.stringify(lo2) });
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/lesson-notes/${res.body.data.note_id}`).set("Authorization", `Bearer ${teacherToken}`);
    expect(detail.body.data.curriculum_context.outcomes[0].criteria).toHaveLength(2);
  });
});
