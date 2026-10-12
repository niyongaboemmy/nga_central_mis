import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { CourseItemProgress, SchemeOfWorkEntry } from "../db/schema";
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
  createStudentClassGroup,
  createStudentSubjectEnrollment,
} from "../test/fixtures";

/**
 * The note-side e-learning panel: a teacher puts one note in front of students from the
 * Lesson Notes page or the editor — pick (or accept the suggested) week, move it, take it
 * off, see whether students can actually open it, and how many have read it. Students get
 * their own progress on library rows and a way back to the course from the reader.
 */
describe("Lesson note e-learning panel", () => {
  let teacherToken: string;
  let otherTeacherToken: string;
  let studentToken: string;
  let studentId: number;
  let subjectId: number;
  let classGroupId: number;
  let academicYearId: number;
  let entryIds: number[] = [];
  let courseId: number;
  let noteId: number;
  let sections: any[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    teacherToken = signToken(teacherId);
    const role = await createRoleWithPermissions("ln_panel_teacher", ["MANAGE_LESSON_NOTES", "MANAGE_COURSE_CONTENT"]);
    await assignRole(teacherId, role);
    const otherId = await createUser({ userType: "TEACHER" });
    otherTeacherToken = signToken(otherId);
    await assignRole(otherId, role);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });

    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId: period.academicTermId });
    // Week 1 ran last week, week 2 is this week, week 3 is next week.
    for (let w = 1; w <= 3; w += 1) {
      const [r] = (await db.insert(SchemeOfWorkEntry).values({
        scheme_id: schemeId,
        week_number: `Week ${w}`,
        topic: `Topic ${w}`,
        start_date: day((w - 2) * 7 - 1),
        end_date: day((w - 2) * 7 + 5),
        entry_status: "PLANNED",
      } as any)) as any;
      entryIds.push(r.insertId as number);
    }
    const course = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = course.body.data.course.course_id;

    studentId = await createUser({ userType: "STUDENT" });
    studentToken = signToken(studentId);
    await assignRole(studentId, await createRoleWithPermissions("ln_panel_student", ["VIEW_MY_COURSES", "VIEW_SHARED_LESSON_NOTES"]));
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });

    const created = await request(app)
      .post("/lesson-notes")
      .set(auth(teacherToken))
      .send({ subject_id: subjectId, class_group_id: classGroupId, title: "Grid layout", scheme_entry_id: entryIds[2] });
    noteId = created.body.data.note_id;
  });

  it("suggests the week the note was written for, and lists every week", async () => {
    const res = await request(app).get(`/elearning/notes/${noteId}/elearning`).set(auth(teacherToken));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.course.course_id).toBe(courseId);
    expect(d.placement).toBeNull();
    expect(d.reach.state).toBe("OFF_COURSE");
    sections = d.sections;
    expect(sections).toHaveLength(3);
    const suggested = sections.filter((s: any) => s.suggested);
    expect(suggested).toHaveLength(1);
    expect(suggested[0].section_id).toBe(sections[2].section_id);
    expect(suggested[0].reason).toMatch(/written for this week/);
    // the week running today is flagged so the picker can mark it
    expect(sections[1].is_current).toBe(true);
  });

  it("places the note in a chosen week, then moves it", async () => {
    const place = await request(app)
      .put(`/elearning/notes/${noteId}/placement`)
      .set(auth(teacherToken))
      .send({ section_id: sections[0].section_id });
    expect(place.status).toBe(200);
    expect(place.body.message).toMatch(/^Added to/);
    expect(place.body.data.placement.section_id).toBe(sections[0].section_id);
    // a draft note on a hidden week of a draft course is placed but not reaching anyone
    expect(place.body.data.reach.state).toBe("BLOCKED");
    expect(place.body.data.students.members).toBe(1);

    const move = await request(app)
      .put(`/elearning/notes/${noteId}/placement`)
      .set(auth(teacherToken))
      .send({ section_id: sections[2].section_id });
    expect(move.body.message).toMatch(/^Moved to/);
    expect(move.body.data.placement.section_id).toBe(sections[2].section_id);

    const again = await request(app)
      .put(`/elearning/notes/${noteId}/placement`)
      .set(auth(teacherToken))
      .send({ section_id: sections[2].section_id });
    expect(again.body.message).toMatch(/^Already in/);
  });

  it("refuses a week from another course", async () => {
    const res = await request(app)
      .put(`/elearning/notes/${noteId}/placement`)
      .set(auth(teacherToken))
      .send({ section_id: 999999999 });
    expect(res.status).toBe(400);
  });

  it("reports LIVE on the list once note, item, week and course are all open", async () => {
    await request(app)
      .patch(`/lesson-notes/${noteId}`)
      .set(auth(teacherToken))
      .send({ content_html: "<p>Grid is two-dimensional.</p>", content_json: { type: "doc" }, status: "PUBLISHED" });
    const panel = await request(app).get(`/elearning/notes/${noteId}/elearning`).set(auth(teacherToken));
    const { placement } = panel.body.data;
    await request(app).patch(`/elearning/items/${placement.item_id}`).set(auth(teacherToken)).send({ is_published: true });
    await request(app).patch(`/elearning/sections/${placement.section_id}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });

    const list = await request(app).get("/lesson-notes").set(auth(teacherToken)).query({ subject_id: subjectId });
    const row = list.body.data.find((n: any) => n.note_id === noteId);
    expect(row.reach.state).toBe("LIVE");
    expect(row.elearning.section_status).toBe("PUBLISHED");

    const subjects = await request(app)
      .get("/lesson-notes/subjects")
      .set(auth(teacherToken))
      .query({ academic_year_id: academicYearId });
    const s = subjects.body.data.find((x: any) => x.subject_id === subjectId);
    expect(s.on_course_count).toBe(1);
    expect(s.live_count).toBe(1);
  });

  it("gives the student their own progress, on the library and in the reader", async () => {
    let lib = await request(app).get("/lesson-notes/shared-with-me").set(auth(studentToken));
    let row = lib.body.data.find((n: any) => n.note_id === noteId);
    expect(row.placement.progress).toBe("NOT_STARTED");
    expect(row.placement.course_id).toBe(courseId);
    expect(row.placement.course_title).toBeTruthy();

    const panel = await request(app).get(`/elearning/notes/${noteId}/elearning`).set(auth(teacherToken));
    await db.insert(CourseItemProgress).values({
      item_id: panel.body.data.placement.item_id,
      user_id: studentId,
      state: "COMPLETED",
      completed_at: new Date(),
    } as any);

    lib = await request(app).get("/lesson-notes/shared-with-me").set(auth(studentToken));
    row = lib.body.data.find((n: any) => n.note_id === noteId);
    expect(row.placement.progress).toBe("COMPLETED");

    const reader = await request(app).get(`/lesson-notes/shared-with-me/${noteId}`).set(auth(studentToken));
    expect(reader.status).toBe(200);
    expect(reader.body.data.placement.section_id).toBe(panel.body.data.placement.section_id);

    // and the teacher sees it counted
    const after = await request(app).get(`/elearning/notes/${noteId}/elearning`).set(auth(teacherToken));
    expect(after.body.data.students).toEqual({ members: 1, started: 1, completed: 1 });
  });

  it("takes the note off the course without deleting it", async () => {
    const res = await request(app).delete(`/elearning/notes/${noteId}/placement`).set(auth(teacherToken));
    expect(res.status).toBe(200);
    expect(res.body.data.placement).toBeNull();
    expect(res.body.data.reach.state).toBe("OFF_COURSE");
    const note = await request(app).get(`/lesson-notes/${noteId}`).set(auth(teacherToken));
    expect(note.status).toBe(200);
    // progress for the removed item goes with it
    const left = await db.select().from(CourseItemProgress).where(eq(CourseItemProgress.user_id, studentId));
    expect(left).toHaveLength(0);
  });

  it("is closed to a teacher who can't build the course", async () => {
    const res = await request(app).get(`/elearning/notes/${noteId}/elearning`).set(auth(otherTeacherToken));
    expect([403, 404]).toContain(res.status);
  });

  it("is closed to students", async () => {
    const res = await request(app).get(`/elearning/notes/${noteId}/elearning`).set(auth(studentToken));
    expect(res.status).toBe(403);
  });
});
