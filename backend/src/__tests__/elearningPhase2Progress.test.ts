import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { ActivityLog, CourseItemProgress, CourseSection, IntegrationToken, LearningEvent, Notification, SchemeOfWorkEntry } from "../db/schema";
import { actionCompletes } from "../services/elearning/courseProgress";
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
} from "../test/fixtures";

/** Phase 2 — progress, completion rules, events, notifications, analytics. */
describe("E-learning Phase 2: completion rules", () => {
  // Table-driven: each completion_rule × action → completes?
  const table: [string, any, number | null, boolean][] = [
    ["NONE", { kind: "VIEW" }, null, false],
    ["NONE", { kind: "MARK_DONE" }, null, false],
    ["VIEW", { kind: "VIEW" }, null, true],
    ["VIEW", { kind: "MARK_DONE" }, null, true],
    ["MARK_DONE", { kind: "VIEW" }, null, false],
    ["MARK_DONE", { kind: "MARK_DONE" }, null, true],
    ["SUBMIT", { kind: "VIEW" }, null, false],
    ["SUBMIT", { kind: "MARK_DONE" }, null, false],
    ["SUBMIT", { kind: "SUBMIT" }, null, true],
    ["SUBMIT", { kind: "SCORE", score_pct: 10 }, null, true],
    ["MIN_SCORE", { kind: "SUBMIT" }, 70, false],
    ["MIN_SCORE", { kind: "SCORE", score_pct: 69 }, 70, false],
    ["MIN_SCORE", { kind: "SCORE", score_pct: 70 }, 70, true],
    ["NONE", { kind: "TEACHER_OVERRIDE" }, null, true],
    ["MIN_SCORE", { kind: "TEACHER_OVERRIDE" }, 90, true],
  ];
  it.each(table)("rule %s × %o (min %s) → %s", (rule, action, min, expected) => {
    expect(actionCompletes(rule as any, action, min)).toBe(expected);
  });
});

describe("E-learning Phase 2: progress endpoints, locks, events, analytics", () => {
  let teacherToken: string;
  let studentToken: string;
  let teacherId: number;
  let studentId: number;
  let otherStudentId: number;
  let subjectId: number;
  let classGroupId: number;
  let academicYearId: number;
  let academicTermId: number;
  let courseId: number;
  let week1: number;
  let week2: number;
  let serviceToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  // The test schema is not wiped between runs and (source_system, idempotency_key) is unique.
  const key1 = `att-1-${Date.now()}`;
  const key2 = `att-2-${Date.now()}`;
  const iso = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const addItem = async (sectionId: number, body: Record<string, unknown>) => {
    const r = await request(app).post(`/elearning/sections/${sectionId}/items`).set(auth(teacherToken)).send(body);
    expect(r.status).toBe(201);
    return r.body.data.item_id as number;
  };

  beforeAll(async () => {
    teacherId = await createUser({ userType: "TEACHER" });
    studentId = await createUser({ userType: "STUDENT" });
    otherStudentId = await createUser({ userType: "STUDENT" });
    teacherToken = signToken(teacherId);
    studentToken = signToken(studentId);
    await assignRole(teacherId, await createRoleWithPermissions("el2_teacher", ["MANAGE_COURSE_CONTENT", "OVERRIDE_COURSE_PROGRESS"]));
    const studentRole = await createRoleWithPermissions("el2_student", ["VIEW_MY_COURSES"]);
    await assignRole(studentId, studentRole);
    await assignRole(otherStudentId, studentRole);

    const period = await createAcademicPeriod();
    academicYearId = period.academicYearId;
    academicTermId = period.academicTermId;
    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId });
    for (const sid of [studentId, otherStudentId]) {
      await createStudentClassGroup({ userId: sid, classGroupId, academicYearId });
      await createStudentSubjectEnrollment({ userId: sid, subjectId, academicYearId });
    }
    const schemeId = await createSchemeOfWork({ userId: teacherId, subjectId, classGroupId, academicTermId });
    for (let w = 1; w <= 2; w += 1) {
      await db.insert(SchemeOfWorkEntry).values({ scheme_id: schemeId, week_number: `Week ${w}`, topic: `T${w}`, start_date: iso((w - 1) * 7 - 3), end_date: iso((w - 1) * 7 + 1) } as any);
    }
    const created = await request(app).post(`/elearning/courses/from-scheme/${schemeId}`).set(auth(teacherToken));
    courseId = created.body.data.course.course_id;
    [week1, week2] = created.body.data.sections.map((s: any) => s.section_id);
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });
    // Week 2 starts in the future — publish it by hand for the tests below.
    await request(app).patch(`/elearning/sections/${week2}`).set(auth(teacherToken)).send({ status: "PUBLISHED" });

    // Integration token with the write scope.
    const raw = `test_${crypto.randomBytes(16).toString("hex")}`;
    await db.insert(IntegrationToken).values({
      name: "TaskMentor test",
      token_hash: crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      token_prefix: raw.slice(0, 8),
      scopes: "sync:read learning-events:write",
    });
    serviceToken = raw;
  });

  let linkA: number;
  let linkB: number;
  let quizItem: number;

  it("ALL vs ONE: a ONE section completes on the first required item, ALL needs every one", async () => {
    linkA = await addItem(week1, { item_type: "LINK", title: "A", url: "https://example.com/a", completion_rule: "MARK_DONE" });
    linkB = await addItem(week1, { item_type: "LINK", title: "B", url: "https://example.com/b", completion_rule: "MARK_DONE" });

    let done = await request(app).post(`/elearning/my/items/${linkA}/done`).set(auth(studentToken));
    expect(done.status).toBe(200);
    expect(done.body.data.just_completed).toBe(true);
    expect(done.body.data.section_just_completed).toBe(false);
    expect(done.body.data.section.state).toBe("started");

    await request(app).patch(`/elearning/sections/${week1}`).set(auth(teacherToken)).send({ requirement_type: "ONE" });
    let course = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(course.body.data.sections.find((s: any) => s.section_id === week1).state).toBe("completed");

    await request(app).patch(`/elearning/sections/${week1}`).set(auth(teacherToken)).send({ requirement_type: "ALL" });
    done = await request(app).post(`/elearning/my/items/${linkB}/done`).set(auth(studentToken));
    expect(done.body.data.section_just_completed).toBe(true);
    course = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(course.body.data.summary.sections_completed).toBe(1);
    expect(course.body.data.summary.percent).toBe(100);

    // Marking done twice is harmless and not "just completed" again.
    const again = await request(app).post(`/elearning/my/items/${linkB}/done`).set(auth(studentToken));
    expect(again.body.data.just_completed).toBe(false);
  });

  it("sequential progress locks the item after the first incomplete one", async () => {
    const c1 = await addItem(week2, { item_type: "LINK", title: "C1", url: "https://example.com/c1", completion_rule: "MARK_DONE" });
    const c2 = await addItem(week2, { item_type: "LINK", title: "C2", url: "https://example.com/c2", completion_rule: "MARK_DONE" });
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ require_sequential_progress: true });

    const course = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    const w2 = course.body.data.sections.find((s: any) => s.section_id === week2);
    expect(w2.items.find((i: any) => i.item_id === c1).locked).toBe(false);
    expect(w2.items.find((i: any) => i.item_id === c2).locked).toBe(true);

    const blocked = await request(app).post(`/elearning/my/items/${c2}/done`).set(auth(studentToken));
    expect(blocked.status).toBe(404);
    const opened = await request(app).get(`/elearning/my/items/${c2}`).set(auth(studentToken));
    expect(opened.body.data.locked).toBe(true);

    await request(app).post(`/elearning/my/items/${c1}/done`).set(auth(studentToken));
    const after = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(after.body.data.sections.find((s: any) => s.section_id === week2).items.find((i: any) => i.item_id === c2).locked).toBe(false);
    await request(app).patch(`/elearning/courses/${courseId}`).set(auth(teacherToken)).send({ require_sequential_progress: false });
  });

  it("prerequisites lock a whole week until the required week is complete", async () => {
    const set = await request(app).put(`/elearning/sections/${week2}/prerequisites`).set(auth(teacherToken)).send({ requires_section_ids: [week1] });
    expect(set.status).toBe(200);
    // otherStudent hasn't finished week 1 → week 2 locked; studentId has → unlocked.
    const other = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(signToken(otherStudentId)));
    const w2other = other.body.data.sections.find((s: any) => s.section_id === week2);
    expect(w2other.state).toBe("locked");
    expect(w2other.lock_reason).toMatch(/Week 1/);
    const mine = await request(app).get(`/elearning/my/courses/${courseId}`).set(auth(studentToken));
    expect(mine.body.data.sections.find((s: any) => s.section_id === week2).state).not.toBe("locked");
    await request(app).put(`/elearning/sections/${week2}/prerequisites`).set(auth(teacherToken)).send({ requires_section_ids: [] });
  });

  it("heartbeats accumulate reading time but are capped at 2× the estimate", async () => {
    const item = await addItem(week2, { item_type: "LINK", title: "Timed", url: "https://example.com/t", estimated_minutes: 1 });
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post(`/elearning/my/items/${item}/heartbeat`).set(auth(studentToken)).send({ seconds: 30, position: { scrollY: i * 100 } });
      expect(r.status).toBe(200);
    }
    const [row] = await db.select().from(CourseItemProgress).where(and(eq(CourseItemProgress.item_id, item), eq(CourseItemProgress.user_id, studentId)));
    expect(row.seconds_spent).toBe(120); // 5 × 30 = 150, capped to 2 × 60
    expect(row.last_position).toEqual({ scrollY: 400 });
    const bad = await request(app).post(`/elearning/my/items/${item}/heartbeat`).set(auth(studentToken)).send({ seconds: -5 });
    expect(bad.status).toBe(400);
  });

  it("SUBMIT items can't be marked done by hand; a partner event completes them idempotently", async () => {
    quizItem = await addItem(week2, {
      item_type: "TASKMENTOR_QUIZ",
      title: "Quiz 1",
      url: "https://tm.example/quiz/77",
      ref_id: 77,
      completion_rule: "MIN_SCORE",
      min_score_pct: 60,
    });
    const refused = await request(app).post(`/elearning/my/items/${quizItem}/done`).set(auth(studentToken));
    expect(refused.status).toBe(400);

    const send = (events: any[]) =>
      request(app).post("/integrations/learning-events").set(auth(serviceToken)).send({ events });

    // Below the bar: recorded, not completed.
    let r = await send([{ actor_user_id: studentId, verb: "SCORED", object_type: "TASKMENTOR_QUIZ", object_id: 77, result: { score_pct: 40 }, idempotency_key: key1 }]);
    expect(r.status).toBe(200);
    expect(r.body.data.accepted).toBe(1);
    expect(r.body.data.results[0].course_item_id).toBe(quizItem);
    let [row] = await db.select().from(CourseItemProgress).where(and(eq(CourseItemProgress.item_id, quizItem), eq(CourseItemProgress.user_id, studentId)));
    expect(row.state).toBe("IN_PROGRESS");
    expect(Number(row.best_score_pct)).toBe(40);

    // Replay of the same key → duplicate, nothing changes.
    r = await send([{ actor_user_id: studentId, verb: "SCORED", object_type: "TASKMENTOR_QUIZ", object_id: 77, result: { score_pct: 95 }, idempotency_key: key1 }]);
    expect(r.body.data.duplicate).toBe(1);
    [row] = await db.select().from(CourseItemProgress).where(and(eq(CourseItemProgress.item_id, quizItem), eq(CourseItemProgress.user_id, studentId)));
    expect(Number(row.best_score_pct)).toBe(40);

    // A passing attempt completes it and notifies the student.
    r = await send([{ actor_user_id: studentId, verb: "SCORED", object_type: "TASKMENTOR_QUIZ", object_id: 77, result: { score_pct: 82 }, idempotency_key: key2 }]);
    expect(r.body.data.accepted).toBe(1);
    [row] = await db.select().from(CourseItemProgress).where(and(eq(CourseItemProgress.item_id, quizItem), eq(CourseItemProgress.user_id, studentId)));
    expect(row.state).toBe("COMPLETED");
    expect(row.completed_via).toBe("EVENT");
    expect(Number(row.best_score_pct)).toBe(82);
    const notif = await db.select().from(Notification).where(and(eq(Notification.user_id, studentId), eq(Notification.kind, "course_result_received")));
    expect(notif.length).toBe(1);

    // Bad rows are rejected individually, the batch still succeeds; wrong scope is 403.
    r = await send([{ actor_user_id: studentId, verb: "DANCED", object_type: "TASKMENTOR_QUIZ", object_id: 77 }]);
    expect(r.body.data.rejected).toBe(1);
    const events = await db.select().from(LearningEvent).where(eq(LearningEvent.course_item_id, quizItem));
    expect(events.map((e) => e.source_system)).toEqual(expect.arrayContaining(["TaskMentortest"]));
    const noScope = await request(app).post("/integrations/learning-events").set(auth("nope")).send({ events: [] });
    expect(noScope.status).toBe(401);
  });

  it("teacher override completes an item for a student and writes an audit row", async () => {
    const item = await addItem(week2, { item_type: "LINK", title: "Override me", url: "https://example.com/o", completion_rule: "MARK_DONE" });
    const r = await request(app)
      .post(`/elearning/items/${item}/progress/${otherStudentId}/complete`)
      .set(auth(teacherToken))
      .send({ reason: "Did it on paper in class" });
    expect(r.status).toBe(200);
    expect(r.body.data.completed_via).toBe("TEACHER");
    const [log] = await db
      .select()
      .from(ActivityLog)
      .where(and(eq(ActivityLog.action_type, "COURSE_PROGRESS_OVERRIDE"), eq(ActivityLog.entity_id, item)));
    expect(log).toBeTruthy();
    expect(log.actor_id).toBe(teacherId);
    expect(log.description).toContain("Did it on paper");
    const stranger = await createUser({ userType: "STUDENT" });
    const notMember = await request(app).post(`/elearning/items/${item}/progress/${stranger}/complete`).set(auth(teacherToken));
    expect(notMember.status).toBe(400);
  });

  it("publishing a section notifies every member once; nudges reach the chosen students", async () => {
    const [w2] = await db.select().from(CourseSection).where(eq(CourseSection.section_id, week2));
    expect(w2.status).toBe("PUBLISHED");
    const published = await db.select().from(Notification).where(and(eq(Notification.kind, "course_section_published"), eq(Notification.subject_id, week2)));
    expect(published.map((n) => n.user_id).sort()).toEqual([studentId, otherStudentId].sort());

    const nudge = await request(app).post(`/elearning/courses/${courseId}/nudge`).set(auth(teacherToken)).send({ student_ids: [otherStudentId], message: "Week 2 has two short notes ready when you are." });
    expect(nudge.status).toBe(200);
    expect(nudge.body.data.sent).toBe(1);
    const nudged = await db.select().from(Notification).where(and(eq(Notification.kind, "course_nudge"), eq(Notification.user_id, otherStudentId)));
    expect(nudged).toHaveLength(1);
    expect(nudged[0].body).toContain("two short notes");
  });

  it("analytics: funnel per week, per-student table, stuck list", async () => {
    const r = await request(app).get(`/elearning/courses/${courseId}/analytics`).set(auth(teacherToken));
    expect(r.status).toBe(200);
    const a = r.body.data;
    expect(a.members).toBe(2);
    expect(a.sections.map((s: any) => s.section_id)).toEqual([week1, week2]);
    const w1 = a.sections.find((s: any) => s.section_id === week1);
    expect(w1.completed).toBe(1); // only studentId finished week 1
    expect(w1.items.find((i: any) => i.item_id === linkA).completed).toBe(1);
    const me = a.students.find((s: any) => s.user_id === studentId);
    expect(me.required_done).toBeGreaterThanOrEqual(4);
    expect(me.seconds_spent).toBe(120);
    const other = a.students.find((s: any) => s.user_id === otherStudentId);
    expect(["behind", "on_track", "not_started"]).toContain(other.status);
    expect(a.stuck.map((s: any) => s.user_id)).not.toContain(studentId);

    const forbidden = await request(app).get(`/elearning/courses/${courseId}/analytics`).set(auth(studentToken));
    expect(forbidden.status).toBe(403);
  });

  it("integrations can list published courses with partner-referenced items and return URLs", async () => {
    const r = await request(app).get("/integrations/sync/courses").set(auth(serviceToken));
    expect(r.status).toBe(200);
    const course = r.body.data.find((c: any) => c.course_id === courseId);
    expect(course).toBeTruthy();
    const quiz = course.items.find((i: any) => i.item_id === quizItem);
    expect(quiz.ref_id).toBe(77);
    expect(quiz.return_url).toBe(`/my-learning/courses/${courseId}/items/${quizItem}`);
  });
});
