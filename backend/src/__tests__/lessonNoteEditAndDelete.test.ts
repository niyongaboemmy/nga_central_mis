import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  CompetencyPerformanceCriteria,
  CourseItem,
  LessonNote,
  LessonNoteCriteria,
  SchemeOfWorkEntry,
  SubjectCompetency,
} from "../db/schema";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createRoleWithPermissions,
  assignRole,
  createSchemeOfWork,
} from "../test/fixtures";

/**
 * "Edit details" on a lesson note uses the same fields as creating one — subject, class,
 * curriculum coverage, title — through PATCH /lesson-notes/:id. Delete removes the note
 * and, with it, every e-learning course item that pointed at it.
 */
describe("Lesson notes: edit details and delete", () => {
  let teacherToken: string;
  let teacherId: number;
  let otherTeacherToken: string;
  let subjectA: number;
  let subjectB: number;
  let unassignedSubject: number;
  let classA: number;
  let classB: number;
  let academicYearId: number;
  let academicTermId: number;
  let critA: number[] = [];
  let critB: number[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const addCriteria = async (subjectId: number, n: number) => {
    const [res] = (await db.insert(SubjectCompetency).values({
      subject_id: subjectId,
      user_id: teacherId,
      element_number: 1,
      title: `Outcome of ${subjectId}`,
    } as any)) as any;
    const ids: number[] = [];
    for (let i = 1; i <= n; i++) {
      const [c] = (await db.insert(CompetencyPerformanceCriteria).values({
        competency_id: res.insertId,
        criteria_number: `1.${i}`,
        description: `Criterion ${i}`,
        sort_order: i,
      } as any)) as any;
      ids.push(c.insertId as number);
    }
    return ids;
  };

  const createNote = async (body: Record<string, unknown>) => {
    const res = await request(app).post("/lesson-notes").set(auth(teacherToken)).send(body);
    expect(res.status).toBe(201);
    return res.body.data.note_id as number;
  };

  const noteRow = async (noteId: number) =>
    (await db.select().from(LessonNote).where(eq(LessonNote.note_id, noteId)).limit(1))[0];

  const noteCriteria = async (noteId: number) =>
    (
      await db
        .select({ id: LessonNoteCriteria.criteria_id })
        .from(LessonNoteCriteria)
        .where(eq(LessonNoteCriteria.note_id, noteId))
    )
      .map((r) => r.id)
      .sort((a, b) => a - b);

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    teacherToken = signToken(teacherId);
    const role = await createRoleWithPermissions("ln_edit_teacher", ["MANAGE_LESSON_NOTES", "MANAGE_COURSE_CONTENT"]);
    await assignRole(teacherId, role);

    const otherTeacherId = await createUser({ userType: "TEACHER" });
    otherTeacherToken = signToken(otherTeacherId);
    await assignRole(otherTeacherId, role);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
    classA = await createProgramGradeClassGroup();
    classB = await createProgramGradeClassGroup();
    subjectA = await createSubject();
    subjectB = await createSubject();
    unassignedSubject = await createSubject();
    for (const subjectId of [subjectA, subjectB]) {
      await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId: classA, academicYearId });
    }
    critA = await addCriteria(subjectA, 3);
    critB = await addCriteria(subjectB, 2);
  });

  it("returns subject/class names and placement on the detail, for the edit form", async () => {
    const noteId = await createNote({ subject_id: subjectA, class_group_id: classA, title: "Detail" });
    const res = await request(app).get(`/lesson-notes/${noteId}`).set(auth(teacherToken));
    expect(res.status).toBe(200);
    expect(res.body.data.subject_name).toEqual(expect.any(String));
    expect(res.body.data.class_group_name).toEqual(expect.any(String));
    expect(res.body.data.elearning).toBeNull();
  });

  it("edits title, class and coverage together", async () => {
    const noteId = await createNote({ subject_id: subjectA, class_group_id: classA, title: "Before", criteria_ids: [critA[0]] });
    const res = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ title: "  After  ", class_group_id: classB, criteria_ids: [critA[1], critA[2]] });
    expect(res.status).toBe(200);

    const row = await noteRow(noteId);
    expect(row.title).toBe("After");
    expect(row.class_group_id).toBe(classB);
    expect(row.subject_id).toBe(subjectA);
    expect(await noteCriteria(noteId)).toEqual([critA[1], critA[2]].sort((a, b) => a - b));
  });

  it("can clear the class", async () => {
    const noteId = await createNote({ subject_id: subjectA, class_group_id: classA, title: "No class" });
    const res = await request(app).patch(`/lesson-notes/${noteId}`).set(auth(teacherToken)).send({ class_group_id: null });
    expect(res.status).toBe(200);
    expect((await noteRow(noteId)).class_group_id).toBeNull();
  });

  it("moves a note to another subject, validating coverage against the new subject", async () => {
    const noteId = await createNote({ subject_id: subjectA, class_group_id: classA, title: "Move", criteria_ids: critA });

    // The old subject's criteria are not the new subject's curriculum.
    const bad = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ subject_id: subjectB, criteria_ids: critA });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/curriculum/i);
    // ...and a rejected edit changes nothing.
    expect((await noteRow(noteId)).subject_id).toBe(subjectA);
    expect(await noteCriteria(noteId)).toEqual([...critA].sort((a, b) => a - b));

    const ok = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ subject_id: subjectB, criteria_ids: [critB[0]] });
    expect(ok.status).toBe(200);
    expect((await noteRow(noteId)).subject_id).toBe(subjectB);
    expect(await noteCriteria(noteId)).toEqual([critB[0]]);
  });

  it("clears coverage when the subject changes without new criteria", async () => {
    const noteId = await createNote({ subject_id: subjectA, title: "Move bare", criteria_ids: [critA[0]] });
    const res = await request(app).patch(`/lesson-notes/${noteId}`).set(auth(teacherToken)).send({ subject_id: subjectB });
    expect(res.status).toBe(200);
    expect(await noteCriteria(noteId)).toEqual([]);
  });

  it("refuses a subject the teacher isn't assigned to", async () => {
    const noteId = await createNote({ subject_id: subjectA, title: "Not mine" });
    const res = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ subject_id: unassignedSubject });
    expect(res.status).toBe(403);
    expect((await noteRow(noteId)).subject_id).toBe(subjectA);
  });

  it("refuses an empty title and an unknown class", async () => {
    const noteId = await createNote({ subject_id: subjectA, title: "Keep me" });
    const blank = await request(app).patch(`/lesson-notes/${noteId}`).set(auth(teacherToken)).send({ title: "   " });
    expect(blank.status).toBe(400);
    const ghost = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ class_group_id: 999999999 });
    expect(ghost.status).toBe(400);
    expect((await noteRow(noteId)).title).toBe("Keep me");
  });

  it("does not save coverage when the same request is rejected later", async () => {
    const noteId = await createNote({ subject_id: subjectA, title: "Atomic", criteria_ids: [critA[0]] });
    const res = await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ criteria_ids: [critA[1]], status: "PUBLISHED" }); // empty note can't be published
    expect(res.status).toBe(400);
    expect(await noteCriteria(noteId)).toEqual([critA[0]]);
  });

  it("is owner-only", async () => {
    const noteId = await createNote({ subject_id: subjectA, title: "Private" });
    const edit = await request(app).patch(`/lesson-notes/${noteId}`).set(auth(otherTeacherToken)).send({ title: "Hijack" });
    expect(edit.status).toBe(403);
    const del = await request(app).delete(`/lesson-notes/${noteId}`).set(auth(otherTeacherToken));
    expect(del.status).toBe(403);
    expect((await noteRow(noteId)).title).toBe("Private");
  });

  describe("with an e-learning course", () => {
    let placedNoteId: number;

    beforeAll(async () => {
      const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId: subjectA, classGroupId: classA, academicTermId });
      await db.insert(SchemeOfWorkEntry).values({
        scheme_id: schemeId,
        week_number: "Week 1",
        topic: "Topic 1",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        entry_status: "PLANNED",
      } as any);
      const course = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
      expect(course.status).toBeLessThan(300);

      placedNoteId = await createNote({ subject_id: subjectA, class_group_id: classA, title: "On the course" });
      const placed = await request(app).post(`/elearning/notes/${placedNoteId}/place`).set(auth(teacherToken));
      expect(placed.status).toBeLessThan(300);
    });

    it("reports the placement on the detail", async () => {
      const res = await request(app).get(`/lesson-notes/${placedNoteId}`).set(auth(teacherToken));
      expect(res.body.data.elearning).toMatchObject({ course_id: expect.any(Number), section_title: expect.any(String) });
    });

    it("refuses to move a placed note to another class or subject, but still allows a rename", async () => {
      const moveClass = await request(app)
        .patch(`/lesson-notes/${placedNoteId}`)
        .set(auth(teacherToken))
        .send({ class_group_id: classB });
      expect(moveClass.status).toBe(409);
      expect(moveClass.body.message).toMatch(/remove it from that course/i);

      const moveSubject = await request(app)
        .patch(`/lesson-notes/${placedNoteId}`)
        .set(auth(teacherToken))
        .send({ subject_id: subjectB });
      expect(moveSubject.status).toBe(409);

      // Sending the unchanged subject/class (as the edit form does) is not a move.
      const rename = await request(app)
        .patch(`/lesson-notes/${placedNoteId}`)
        .set(auth(teacherToken))
        .send({ title: "Renamed on course", subject_id: subjectA, class_group_id: classA });
      expect(rename.status).toBe(200);
      const row = await noteRow(placedNoteId);
      expect(row).toMatchObject({ title: "Renamed on course", subject_id: subjectA, class_group_id: classA });
    });

    it("deletes the note and removes it from the course", async () => {
      const before = await db
        .select({ item_id: CourseItem.item_id })
        .from(CourseItem)
        .where(and(eq(CourseItem.item_type, "LESSON_NOTE"), eq(CourseItem.ref_id, placedNoteId)));
      expect(before.length).toBeGreaterThan(0);

      const res = await request(app).delete(`/lesson-notes/${placedNoteId}`).set(auth(teacherToken));
      expect(res.status).toBe(200);
      expect(res.body.data.removed_course_items).toBe(before.length);

      expect(await noteRow(placedNoteId)).toBeUndefined();
      const after = await db
        .select({ item_id: CourseItem.item_id })
        .from(CourseItem)
        .where(and(eq(CourseItem.item_type, "LESSON_NOTE"), eq(CourseItem.ref_id, placedNoteId)));
      expect(after).toHaveLength(0);

      const again = await request(app).get(`/lesson-notes/${placedNoteId}`).set(auth(teacherToken));
      expect(again.status).toBe(404);
    });
  });
});
