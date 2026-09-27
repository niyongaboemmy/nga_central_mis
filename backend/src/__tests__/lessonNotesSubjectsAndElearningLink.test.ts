import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  CourseSection,
  LessonNote,
  LessonNoteShare,
  SchemeOfWorkEntry,
  TeacherSubjectAssignment,
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
 * The Lesson Notes page is subject-first (GET /lesson-notes/subjects) and reports, per note,
 * whether students can actually reach it through e-learning — being PUBLISHED only makes a
 * note shareable, it does not put it on the course. These cover both, plus the one-click
 * placement the list offers for an unlinked note.
 */
describe("Lesson notes: subject summary and e-learning linkage", () => {
  let teacherToken: string;
  let teacherId: number;
  let subjectA: number;
  let subjectB: number;
  let classGroupId: number;
  let academicYearId: number;
  let academicTermId: number;
  let schemeId: number;
  let entryIds: number[] = [];
  let courseId: number;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const isoDaysFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    teacherToken = signToken(teacherId);
    await assignRole(
      teacherId,
      await createRoleWithPermissions("ln_link_teacher", [
        "MANAGE_LESSON_NOTES",
        "MANAGE_COURSE_CONTENT",
      ]),
    );

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
    classGroupId = await createProgramGradeClassGroup();
    subjectA = await createSubject();
    subjectB = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: subjectA, classGroupId, academicYearId });
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: subjectB, classGroupId, academicYearId });

    schemeId = await createSchemeOfWork({ userId: teacherId, subjectId: subjectA, classGroupId, academicTermId });
    for (let w = 1; w <= 3; w += 1) {
      const [r] = (await db.insert(SchemeOfWorkEntry).values({
        scheme_id: schemeId,
        week_number: `Week ${w}`,
        topic: `Topic ${w}`,
        start_date: isoDaysFromNow((w - 1) * 7),
        end_date: isoDaysFromNow((w - 1) * 7 + 4),
        entry_status: "PLANNED",
      } as any)) as any;
      entryIds.push(r.insertId as number);
    }

    const course = await request(app)
      .post(`/elearning/courses/from-scheme/${schemeId}`)
      .set(auth(teacherToken));
    courseId = course.body.data.course.course_id;
  });

  const createNote = async (subjectId: number, title: string, schemeEntryId?: number) => {
    const res = await request(app)
      .post("/lesson-notes")
      .set(auth(teacherToken))
      .send({ subject_id: subjectId, class_group_id: classGroupId, title, scheme_entry_id: schemeEntryId });
    expect(res.status).toBe(201);
    return res.body.data.note_id as number;
  };

  let noteWeek2: number;
  let noteNoWeek: number;
  let noteOtherSubject: number;

  it("lists every assigned subject, including one with no notes yet", async () => {
    // A third subject the teacher is assigned to but has never written for: it must still be
    // listed, or there is no way into it from this page.
    const bareSubjectId = await createSubject();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: bareSubjectId,
      classGroupId,
      academicYearId,
    });

    const res = await request(app)
      .get("/lesson-notes/subjects")
      .set(auth(teacherToken))
      .query({ academic_year_id: academicYearId });
    expect(res.status).toBe(200);

    const bare = res.body.data.find((s: any) => s.subject_id === bareSubjectId);
    expect(bare).toBeTruthy();
    expect(bare.note_count).toBe(0);
    expect(bare.is_assigned).toBe(true);
    expect(bare.last_updated).toBeNull();
    // The class group comes from the assignment, not from notes that don't exist.
    expect(bare.class_group_names).toBeTruthy();
  });

  it("summarises notes per subject so the page can ask which subject first", async () => {
    noteWeek2 = await createNote(subjectA, "Flexbox basics", entryIds[1]);
    noteNoWeek = await createNote(subjectA, "Loose revision sheet");
    noteOtherSubject = await createNote(subjectB, "Unrelated subject note");

    const res = await request(app)
      .get("/lesson-notes/subjects")
      .set(auth(teacherToken))
      .query({ academic_year_id: academicYearId });
    expect(res.status).toBe(200);

    const a = res.body.data.find((s: any) => s.subject_id === subjectA);
    const b = res.body.data.find((s: any) => s.subject_id === subjectB);
    expect(a.note_count).toBe(2);
    expect(a.draft_count).toBe(2);
    expect(a.published_count).toBe(0);
    expect(a.on_course_count).toBe(0);
    expect(b.note_count).toBe(1);
  });

  it("reports no placement, but an available course target, for an unlinked note", async () => {
    const res = await request(app)
      .get("/lesson-notes")
      .set(auth(teacherToken))
      .query({ subject_id: subjectA });
    expect(res.status).toBe(200);

    const note = res.body.data.find((n: any) => n.note_id === noteWeek2);
    expect(note.elearning).toBeNull();
    expect(note.course_target).not.toBeNull();
    expect(note.course_target.course_id).toBe(courseId);
  });

  it("places a note into the section seeded from its own scheme week, and shares it with the class", async () => {
    const res = await request(app)
      .post(`/elearning/notes/${noteWeek2}/place`)
      .set(auth(teacherToken))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.already_placed).toBe(false);

    const week2 = (
      await db.select().from(CourseSection).where(eq(CourseSection.scheme_entry_id, entryIds[1]))
    )[0];
    expect(res.body.data.section_id).toBe(week2.section_id);
    expect(res.body.data.section_title).toBe("Week 2 — Topic 2");

    // Placement is what lets a student open the note, so the class-group share comes with it.
    const shares = await db.select().from(LessonNoteShare).where(eq(LessonNoteShare.note_id, noteWeek2));
    expect(shares).toHaveLength(1);
    expect(shares[0].filter_ids).toEqual([classGroupId]);
  });

  it("is idempotent — placing the same note again reports where it already is", async () => {
    const res = await request(app)
      .post(`/elearning/notes/${noteWeek2}/place`)
      .set(auth(teacherToken))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.already_placed).toBe(true);
    expect(res.body.data.section_title).toBe("Week 2 — Topic 2");
  });

  it("falls back to the last section for a note with no scheme week", async () => {
    const res = await request(app)
      .post(`/elearning/notes/${noteNoWeek}/place`)
      .set(auth(teacherToken))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.section_title).toBe("Week 3 — Topic 3");
  });

  it("surfaces the placement on the list and counts it on the subject summary", async () => {
    const list = await request(app)
      .get("/lesson-notes")
      .set(auth(teacherToken))
      .query({ subject_id: subjectA });
    const note = list.body.data.find((n: any) => n.note_id === noteWeek2);
    expect(note.elearning.course_id).toBe(courseId);
    expect(note.elearning.section_title).toBe("Week 2 — Topic 2");
    expect(note.course_target).toBeNull();

    const subjects = await request(app)
      .get("/lesson-notes/subjects")
      .set(auth(teacherToken))
      .query({ academic_year_id: academicYearId });
    const a = subjects.body.data.find((s: any) => s.subject_id === subjectA);
    expect(a.on_course_count).toBe(2);
  });

  it("keeps a subject the teacher no longer teaches, flagged as unassigned", async () => {
    // Write the note while still assigned, then have the assignment taken away — a handover.
    const droppedSubjectId = await createSubject();
    await createTeacherSubjectAssignment({
      userId: teacherId,
      subjectId: droppedSubjectId,
      classGroupId,
      academicYearId,
    });
    const created = await request(app)
      .post("/lesson-notes")
      .set(auth(teacherToken))
      .send({ subject_id: droppedSubjectId, class_group_id: classGroupId, title: "Old handover note" });
    expect(created.status).toBe(201);

    await db
      .delete(TeacherSubjectAssignment)
      .where(
        and(
          eq(TeacherSubjectAssignment.user_id, teacherId),
          eq(TeacherSubjectAssignment.subject_id, droppedSubjectId),
        ),
      );

    const res = await request(app)
      .get("/lesson-notes/subjects")
      .set(auth(teacherToken))
      .query({ academic_year_id: academicYearId });

    const dropped = res.body.data.find((s: any) => s.subject_id === droppedSubjectId);
    expect(dropped).toBeTruthy();
    expect(dropped.is_assigned).toBe(false);
    expect(dropped.note_count).toBe(1);
    // Assigned subjects are listed before the leftovers.
    const firstUnassigned = res.body.data.findIndex((s: any) => !s.is_assigned);
    const lastAssigned = res.body.data.map((s: any) => s.is_assigned).lastIndexOf(true);
    expect(firstUnassigned).toBeGreaterThan(lastAssigned);
  });

  it("refuses to place a note whose subject has no course", async () => {
    const res = await request(app)
      .post(`/elearning/notes/${noteOtherSubject}/place`)
      .set(auth(teacherToken))
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/No e-learning course exists/i);
  });

  it("refuses to place a note that has no class group to resolve a course from", async () => {
    const orphanId = await createNote(subjectA, "No class group note");
    await db.update(LessonNote).set({ class_group_id: null }).where(eq(LessonNote.note_id, orphanId));

    const res = await request(app)
      .post(`/elearning/notes/${orphanId}/place`)
      .set(auth(teacherToken))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/class group/i);
  });
});
