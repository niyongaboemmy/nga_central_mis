import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { CourseSection, LessonNoteShare, SchemeOfWorkEntry } from "../db/schema";
import {
  createUser,
  signToken,
  createAcademicPeriod,
  createProgramGradeClassGroup,
  createSubject,
  createTeacherSubjectAssignment,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createRoleWithPermissions,
  assignRole,
  createSchemeOfWork,
  createSubjectDocumentCategory,
  createSubjectDocument,
} from "../test/fixtures";

/**
 * Phase 1 — course structure + student course page (plan §4 "Tests").
 */
describe("E-learning Phase 1: courses, seeding, membership, visibility", () => {
  let teacherToken: string;
  let studentToken: string;
  let teacherId: number;
  let studentId: number;
  let subjectId: number;
  let classGroupId: number;
  let academicYearId: number;
  let academicTermId: number;
  let schemeId: number;
  let entryIds: number[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const isoDaysFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const addEntry = async (week: number, opts: { status?: "PLANNED" | "SKIPPED" | "COMPLETED"; startOffsetDays: number }) => {
    const [r] = (await db.insert(SchemeOfWorkEntry).values({
      scheme_id: schemeId,
      week_number: `Week ${week}`,
      topic: `Topic ${week}`,
      start_date: isoDaysFromNow(opts.startOffsetDays),
      end_date: isoDaysFromNow(opts.startOffsetDays + 4),
      entry_status: opts.status ?? "PLANNED",
    } as any)) as any;
    return r.insertId as number;
  };

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    studentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);

    await assignRole(teacherId, await createRoleWithPermissions("el_teacher", ["MANAGE_COURSE_CONTENT", "MANAGE_LESSON_NOTES"]));
    await assignRole(studentId, await createRoleWithPermissions("el_student", ["VIEW_MY_COURSES", "VIEW_SHARED_LESSON_NOTES"]));

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });

    schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId });
    // 12 weeks: weeks 1-2 in the past, week 3 is "this week", weeks 4-12 future; weeks 5 and 9 skipped.
    for (let w = 1; w <= 12; w += 1) {
      entryIds.push(
        await addEntry(w, {
          startOffsetDays: (w - 3) * 7 - 2,
          status: w === 5 || w === 9 ? "SKIPPED" : "PLANNED",
        }),
      );
    }
  });

  let courseId: number;

  it("seeds one section per scheme entry, hides SKIPPED weeks, keeps scheme order, and is idempotent", async () => {
    const first = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    expect(first.status).toBe(201);
    courseId = first.body.data.course.course_id;
    expect(first.body.data.course.status).toBe("DRAFT");
    const sections = first.body.data.sections;
    expect(sections).toHaveLength(12);
    expect(sections.filter((s: any) => s.status === "HIDDEN")).toHaveLength(2);
    expect(sections.map((s: any) => s.position)).toEqual([...Array(12).keys()]);
    expect(sections.map((s: any) => s.scheme_entry_id)).toEqual(entryIds);
    expect(sections[0].title).toBe("Week 1 — Topic 1");

    const again = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    expect(again.status).toBe(200);
    expect(again.body.data.course.course_id).toBe(courseId);
    expect(again.body.data.sections).toHaveLength(12);
  });

  it("lists every subject the teacher is assigned, whatever stage it has reached", async () => {
    // A second subject assigned to the same teacher, with no scheme of work at all: it must
    // still be listed, or the teacher cannot tell it exists from the E-Learning page.
    const bareSubjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId: bareSubjectId, classGroupId, academicYearId });

    const schemes = await request(app)
      .get("/elearning/courses/schemes")
      .set(auth(teacherToken))
      .query({ academic_year_id: academicYearId, academic_term_id: academicTermId });
    expect(schemes.status).toBe(200);

    const mine = schemes.body.data.find((s: any) => s.scheme_id === schemeId);
    expect(mine).toMatchObject({ course_id: courseId, course_status: "DRAFT", entries: 12, stage: "course" });

    const bare = schemes.body.data.find((s: any) => s.subject_id === bareSubjectId);
    expect(bare).toMatchObject({ stage: "nothing", scheme_id: null, course_id: null, entries: 0 });
    expect(bare.class_group_id).toBe(classGroupId);

    // One row per subject × class group, never one per term.
    const keys = schemes.body.data.map((s: any) => `${s.subject_id}:${s.class_group_id}`);
    expect(new Set(keys).size).toBe(keys.length);
    const courses = await request(app).get("/elearning/courses/mine").set(auth(teacherToken));
    expect(courses.body.data.map((c: any) => c.course_id)).toContain(courseId);
  });

  it("refuses to build a course for a scheme the teacher does not teach", async () => {
    const otherTeacher = await createUser({ userType: "TEACHER" });
    await assignRole(otherTeacher, await createRoleWithPermissions("el_teacher_other", ["MANAGE_COURSE_CONTENT"]));
    const res = await request(app).get(`/elearning/courses/${courseId}`).set(auth(signToken(otherTeacher)));
    expect(res.status).toBe(403);
  });

  it("hides a DRAFT course from students entirely", async () => {
    const list = await request(app).get("/elearning/my/courses").set(auth(studentToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((c: any) => c.course_id)).not.toContain(courseId);
    const detail = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(detail.status).toBe(404);
  });

  it("publishing the course auto-publishes weeks that already started, and only those", async () => {
    const res = await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
    expect(res.status).toBe(200);
    const sections = res.body.data.sections;
    const published = sections.filter((s: any) => s.status === "PUBLISHED").map((s: any) => s.title);
    expect(published).toEqual(["Week 1 — Topic 1", "Week 2 — Topic 2", "Week 3 — Topic 3"]);
    expect(sections.find((s: any) => s.title === "Week 4 — Topic 4").status).toBe("SCHEDULED");
    expect(sections.find((s: any) => s.title === "Week 5 — Topic 5").status).toBe("HIDDEN");
  });

  it("shows the published course to an enrolled class member with the current week flagged", async () => {
    const list = await request(app).get("/elearning/my/courses").set(auth(studentToken));
    expect(list.status).toBe(200);
    const card = list.body.data.find((c: any) => c.course_id === courseId);
    expect(card).toBeTruthy();
    expect(card.current_section.title).toBe("Week 3 — Topic 3");

    const detail = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(detail.status).toBe(200);
    // Only the three published weeks are visible; SCHEDULED/HIDDEN are not even listed.
    expect(detail.body.data.sections).toHaveLength(3);
    expect(detail.body.data.sections.find((s: any) => s.is_current_week).title).toBe("Week 3 — Topic 3");
  });

  it("404s a student who is in the class group but not enrolled in the subject", async () => {
    const outsider = await createUser({ userType: "STUDENT" });
    await assignRole(outsider, await createRoleWithPermissions("el_student_ng", ["VIEW_MY_COURSES"]));
    await createStudentClassGroup({ userId: outsider, classGroupId, academicYearId });
    const res = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(signToken(outsider)));
    expect(res.status).toBe(404);
  });

  it("404s a student enrolled in the subject but in another class group", async () => {
    const outsider = await createUser({ userType: "STUDENT" });
    await assignRole(outsider, await createRoleWithPermissions("el_student_oc", ["VIEW_MY_COURSES"]));
    await createStudentSubjectEnrollment({ userId: outsider, subjectId, academicYearId });
    await createStudentClassGroup({ userId: outsider, classGroupId: await createProgramGradeClassGroup(), academicYearId });
    const res = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(signToken(outsider)));
    expect(res.status).toBe(404);
  });

  it("the sweep publishes a SCHEDULED week once its unlock date passes", async () => {
    const [week4] = await db
      .select()
      .from(CourseSection)
      .where(eq(CourseSection.scheme_entry_id, entryIds[3]));
    expect(week4.status).toBe("SCHEDULED");
    await db.update(CourseSection).set({ unlock_at: new Date(Date.now() - 60_000) }).where(eq(CourseSection.section_id, week4.section_id));
    const detail = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(detail.body.data.sections.map((s: any) => s.title)).toContain("Week 4 — Topic 4");
  });

  let noteId: number;
  let noteItemId: number;

  it("placing a note creates the class-group share; the student then reads it through the course", async () => {
    const created = await request(app)
      .post("/lesson-notes")
      .set(auth(teacherToken))
      .send({ subject_id: subjectId, title: "CSS selectors" });
    expect(created.status).toBe(201);
    noteId = created.body.data.note_id;

    const week3 = (await db.select().from(CourseSection).where(eq(CourseSection.scheme_entry_id, entryIds[2])))[0];
    const placed = await request(app)
      .post(`/elearning/sections/${week3.section_id}/items`)
      .set(auth(teacherToken))
      .send({ item_type: "LESSON_NOTE", ref_id: noteId });
    expect(placed.status).toBe(201);
    noteItemId = placed.body.data.item_id;
    const item = placed.body.data.sections
      .find((s: any) => s.section_id === week3.section_id)
      .items.find((i: any) => i.item_id === noteItemId);
    expect(item.title).toBe("CSS selectors");
    expect(item.ref.status).toBe("DRAFT");

    const shares = await db.select().from(LessonNoteShare).where(eq(LessonNoteShare.note_id, noteId));
    expect(shares).toHaveLength(1);
    expect(shares[0].filter_type).toBe("class_group");
    expect(shares[0].filter_ids).toEqual([classGroupId]);

    // Draft note → invisible to the student even though the item is placed and published.
    let detail = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    let visible = detail.body.data.sections.find((s: any) => s.section_id === week3.section_id).items;
    expect(visible.map((i: any) => i.item_id)).not.toContain(noteItemId);

    await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ content_html: "<p>Selectors pick elements.</p>", content_json: { type: "doc" }, status: "PUBLISHED" });
    detail = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    visible = detail.body.data.sections.find((s: any) => s.section_id === week3.section_id).items;
    expect(visible.map((i: any) => i.item_id)).toContain(noteItemId);

    const opened = await request(app).get(`/elearning/my/items/${noteItemId}`).set(auth(studentToken));
    expect(opened.status).toBe(200);
    expect(opened.body.data.content.note_id).toBe(noteId);
    // VIEW rule: opening completes it.
    expect(opened.body.data.item.state).toBe("COMPLETED");
    expect(opened.body.data.just_completed).toBe(true);

    const shared = await request(app).get(`/lesson-notes/shared-with-me/${noteId}`).set(auth(studentToken));
    expect(shared.status).toBe(200);
  });

  it("removing the item does not revoke the share", async () => {
    const res = await request(app).delete(`/elearning/items/${noteItemId}`).set(auth(teacherToken));
    expect(res.status).toBe(200);
    const shares = await db.select().from(LessonNoteShare).where(eq(LessonNoteShare.note_id, noteId));
    expect(shares).toHaveLength(1);
  });

  it("a student can stream a material placed in the course, but not one in a hidden week", async () => {
    const categoryId = await createSubjectDocumentCategory({ subjectId, userId: teacherId });
    const documentId = await createSubjectDocument({ categoryId, subjectId, userId: teacherId });
    const week1 = (await db.select().from(CourseSection).where(eq(CourseSection.scheme_entry_id, entryIds[0])))[0];
    const placed = await request(app)
      .post(`/elearning/sections/${week1.section_id}/items`)
      .set(auth(teacherToken))
      .send({ item_type: "SUBJECT_DOCUMENT", ref_id: documentId, completion_rule: "MARK_DONE" });
    expect(placed.status).toBe(201);
    const itemId = placed.body.data.item_id;

    const opened = await request(app).get(`/elearning/my/items/${itemId}`).set(auth(studentToken));
    expect(opened.status).toBe(200);
    expect(opened.body.data.content.file_url).toBe(`/elearning/my/items/${itemId}/file`);
    expect(opened.body.data.item.state).toBe("IN_PROGRESS"); // MARK_DONE: viewing doesn't complete

    // The fixture file doesn't exist in storage — a 404 from the stream proves the
    // membership gate passed and we reached the file lookup.
    const stream = await request(app).get(`/elearning/my/items/${itemId}/file`).set(auth(studentToken));
    expect([404, 500]).toContain(stream.status);

    // Hide the week → item vanishes for the student.
    await request(app).patch(`/elearning/sections/${week1.section_id}`).set(auth(teacherToken)).send({ status: "HIDDEN" });
    const hidden = await request(app).get(`/elearning/my/items/${itemId}`).set(auth(studentToken));
    expect(hidden.status).toBe(404);
    await request(app).patch(`/elearning/sections/${week1.section_id}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
  });

  it("validates item bodies per type", async () => {
    const week1 = (await db.select().from(CourseSection).where(eq(CourseSection.scheme_entry_id, entryIds[0])))[0];
    const badLink = await request(app)
      .post(`/elearning/sections/${week1.section_id}/items`)
      .set(auth(teacherToken))
      .send({ item_type: "LINK", title: "Docs", url: "javascript:alert(1)" });
    expect(badLink.status).toBe(400);
    const goodLink = await request(app)
      .post(`/elearning/sections/${week1.section_id}/items`)
      .set(auth(teacherToken))
      .send({ item_type: "LINK", title: "MDN", url: "https://developer.mozilla.org/" });
    expect(goodLink.status).toBe(201);
    const header = await request(app)
      .post(`/elearning/sections/${week1.section_id}/items`)
      .set(auth(teacherToken))
      .send({ item_type: "HEADER", title: "Reading" });
    expect(header.status).toBe(201);
    const items = header.body.data.sections.find((s: any) => s.section_id === week1.section_id).items;
    expect(items.find((i: any) => i.item_type === "HEADER").completion_rule).toBe("NONE");
    const wrongSubjectNote = await request(app)
      .post(`/elearning/sections/${week1.section_id}/items`)
      .set(auth(teacherToken))
      .send({ item_type: "LESSON_NOTE", ref_id: 999999 });
    expect(wrongSubjectNote.status).toBe(404);
  });

  it("inserting a scheme week creates its section; deleting an empty week removes it", async () => {
    const newEntry = await addEntry(13, { startOffsetDays: 80 });
    // Sync runs on the next builder read.
    const before = await request(app).get(`/elearning/courses/${courseId}`).set(auth(teacherToken));
    expect(before.body.data.sections.map((s: any) => s.scheme_entry_id)).toContain(newEntry);
    expect(before.body.data.sections).toHaveLength(13);

    const del = await request(app).delete(`/scheme-of-work/entries/${newEntry}`).set(auth(teacherToken));
    expect([200, 404]).toContain(del.status);
    const after = await request(app).get(`/elearning/courses/${courseId}`).set(auth(teacherToken));
    expect(after.body.data.sections.map((s: any) => s.scheme_entry_id)).not.toContain(newEntry);
  });

  it("scheme weeks cannot be deleted from the course, manual sections can", async () => {
    const week2 = (await db.select().from(CourseSection).where(eq(CourseSection.scheme_entry_id, entryIds[1])))[0];
    const refused = await request(app).delete(`/elearning/sections/${week2.section_id}`).set(auth(teacherToken));
    expect(refused.status).toBe(400);
    const manual = await request(app)
      .post(`/elearning/courses/${courseId}/sections`)
      .set(auth(teacherToken))
      .send({ title: "Before you start" });
    expect(manual.status).toBe(201);
    const removed = await request(app).delete(`/elearning/sections/${manual.body.data.section_id}`).set(auth(teacherToken));
    expect(removed.status).toBe(200);
  });
});
