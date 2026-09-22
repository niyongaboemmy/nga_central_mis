import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "../db";
import { SchemeOfWorkEntry } from "../db/schema";
import { listRecent, listWatchers, __resetLive } from "../services/elearning/livePresence";
import {
  createUser, signToken, createAcademicPeriod, createProgramGradeClassGroup, createSubject,
  createTeacherSubjectAssignment, createStudentClassGroup, createStudentSubjectEnrollment,
  createRoleWithPermissions, assignRole, createSchemeOfWork,
} from "../test/fixtures";

/** A completed item must show up immediately in every place progress is reported. */
describe("E-learning: progress propagates the moment an item completes", () => {
  let teacherToken: string, studentToken: string, courseId: number, sectionId: number, noteItem: number, checkItem: number;
  let classGroupId: number, subjectId: number, academicYearId: number;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const teacherId = await createUser({ userType: "TEACHER" });
    const studentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);
    await assignRole(teacherId, await createRoleWithPermissions("sync_teacher", ["MANAGE_COURSE_CONTENT"]));
    await assignRole(studentId, await createRoleWithPermissions("sync_student", ["VIEW_MY_COURSES"]));
    const period = await createAcademicPeriod();
    const academicTermId = period.academicTermId;
    academicYearId = period.academicYearId;
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId });
    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId });
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, week_number: "Week 1", topic: "T", start_date: today, end_date: today } as any);
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = created.body.data.course.course_id;
    sectionId = created.body.data.sections[0].section_id;
    noteItem = (await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken))
      .send({ item_type: "LINK", title: "Read this", url: "https://example.com/a" })).body.data.item_id;
    checkItem = (await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send({
      item_type: "KNOWLEDGE_CHECK", title: "Check", completion_rule: "SUBMIT",
      content_json: { questions: [{ id: "q1", type: "TRUE_FALSE", prompt: "True?", correct_index: 0 }] },
    })).body.data.item_id;
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
  });

  it("the course card, the course page and the teacher's analytics all agree after each step", async () => {
    const card = async () => (await request(app).get("/elearning/my/courses").set(auth(studentToken))).body.data.find((c: any) => c.course_id === courseId);
    expect(await card()).toMatchObject({ percent: 0, required_done: 0, required_total: 2 });

    // Opening a VIEW item completes it — the card must move on the very next read.
    await request(app).get(`/elearning/my/items/${noteItem}`).set(auth(studentToken));
    expect(await card()).toMatchObject({ percent: 50, required_done: 1 });
    const page = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(page.body.data.summary).toMatchObject({ percent: 50, required_done: 1 });

    // Passing the check finishes the week.
    await request(app).post(`/elearning/my/items/${checkItem}/knowledge-check`).set(auth(studentToken)).send({ answers: { q1: 0 } });
    expect(await card()).toMatchObject({ percent: 100, required_done: 2 });

    // The teacher sees the same numbers without anything being recomputed by hand.
    const analytics = await request(app).get(`/elearning/courses/${courseId}/analytics`).set(auth(teacherToken));
    const row = analytics.body.data.students[0];
    expect(row).toMatchObject({ percent: 100, required_done: 2, status: "done" });
  });

  it("the teacher sees who is learning right now, and what they just finished", async () => {
    __resetLive();
    // A student who hasn't touched the course yet, so this is a genuine first open.
    const freshId = await createUser({ userType: "STUDENT" });
    const fresh = signToken(freshId);
    await assignRole(freshId, await createRoleWithPermissions("sync_student_live", ["VIEW_MY_COURSES"]));
    await createStudentClassGroup({ userId: freshId, classGroupId, academicYearId });
    await createStudentSubjectEnrollment({ userId: freshId, subjectId, academicYearId });

    // Nobody is on the course until someone opens something.
    expect(listWatchers(courseId)).toEqual([]);
    const snapshotBefore = await request(app).get(`/elearning/courses/${courseId}/live/snapshot`).set(auth(teacherToken));
    expect(snapshotBefore.status).toBe(200);
    expect(snapshotBefore.body.data.watchers).toEqual([]);

    await request(app).get(`/elearning/my/items/${noteItem}`).set(auth(fresh));
    const watchers = listWatchers(courseId);
    expect(watchers).toHaveLength(1);
    expect(watchers[0]).toMatchObject({ item_id: noteItem, item_title: "Read this", section_id: sectionId });
    expect(watchers[0].name).toBeTruthy();
    // A VIEW item completes on open, so both verbs land.
    expect(listRecent(courseId).map((r) => r.verb)).toEqual(expect.arrayContaining(["started", "completed"]));

    // A heartbeat keeps them present and carries the time spent.
    await request(app).post(`/elearning/my/items/${noteItem}/heartbeat`).set(auth(fresh)).send({ seconds: 30 });
    expect(listWatchers(courseId)[0].seconds_spent).toBe(30);

    // The snapshot the teacher polls reports the same thing the stream pushes.
    const snapshot = await request(app).get(`/elearning/courses/${courseId}/live/snapshot`).set(auth(teacherToken));
    expect(snapshot.body.data.watchers[0]).toMatchObject({ item_id: noteItem });
    expect(snapshot.body.data.recent[0]).toMatchObject({ item_id: noteItem });

    // Students must never see the class's live activity.
    expect((await request(app).get(`/elearning/courses/${courseId}/live/snapshot`).set(auth(studentToken))).status).toBe(403);
    __resetLive();
  });
});
