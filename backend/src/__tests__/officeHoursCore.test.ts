import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { CalendarSlot, StudentClassGroup } from "../db/schema";
import {
  OfficeHourAssignment,
  OfficeHourSession,
  OfficeHourStudentLock,
} from "../db/officeHoursSchema";
import { createCalendarSlot } from "../test/fixtures";
import { createOfficeHoursWorld, OhWorld, OH_MONDAY, pinClock, resetSettings } from "../test/officeHoursFixtures";
import { setOfficeHoursClock } from "../services/officeHours/common";
import { clearOfficeHoursEvents, recentOfficeHoursEvents } from "../services/officeHours/events";
import { reconcileOfficeHours } from "../services/officeHours/reconcile";

// Office hours Phase 1: schedules, the no-overlap lock, sessions, closures,
// transfers, overrides and the nightly reconcile (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §5).
describe("Office hours phase 1: core scheduling and assignment", () => {
  let w: OhWorld;
  let firstScheduleId = 0;
  const auth = (who: string) => ({ Authorization: `Bearer ${w.tokens[who]}` });

  const createSchedule = async (who: string, body: Record<string, unknown>) =>
    request(app).post("/office-hours/schedules").set(auth(who)).send({ academic_term_id: w.termId, ...body });

  const sessionsOf = (scheduleId: number) =>
    db.select().from(OfficeHourSession).where(eq(OfficeHourSession.schedule_id, scheduleId)).orderBy(OfficeHourSession.session_date);

  beforeAll(async () => {
    await resetSettings();
    w = await createOfficeHoursWorld(8);
  });
  beforeEach(() => {
    pinClock(OH_MONDAY, "09:00");
    clearOfficeHoursEvents();
  });
  afterAll(async () => {
    setOfficeHoursClock(null);
    await resetSettings();
  });

  it("creates Monday/Wednesday office hours on the band and materialises the next two weeks", async () => {
    const res = await createSchedule("teacherA", { days: [1, 3], subject_id: w.subjectA, location: "B4" });
    expect(res.status).toBe(201);
    const s = res.body.data.schedule;
    expect(s.start_time).toBe("16:20");
    expect(s.end_time).toBe("17:20");
    expect(s.effective_from).toBe(OH_MONDAY);
    expect(s.effective_to).toBe("2026-06-26");
    expect(s.days).toEqual([1, 3]);
    expect(s.title).toMatch(/support$/);
    const sessions = await sessionsOf(s.schedule_id);
    // 2 Mar .. 16 Mar inclusive: Mon 2, Wed 4, Mon 9, Wed 11, Mon 16.
    expect(sessions.map((x) => x.session_date)).toEqual(["2026-03-02", "2026-03-04", "2026-03-09", "2026-03-11", "2026-03-16"]);
    expect(sessions.every((x) => x.host_teacher_id === w.teacherA && x.location === "B4")).toBe(true);
    expect(recentOfficeHoursEvents().map((e) => e.type)).toContain("schedule_published");
    // Kept until the overlap test below has used it.
    firstScheduleId = s.schedule_id;
  });

  it("validates days, times, windows, subjects and teacher overlaps", async () => {
    expect((await createSchedule("teacherA", { days: [6] })).status).toBe(400);
    expect((await createSchedule("teacherA", { days: [] })).status).toBe(400);
    expect((await createSchedule("teacherA", { days: [2], start_time: "15:00", end_time: "16:00" })).status).toBe(400);
    expect((await createSchedule("teacherA", { days: [2], start_time: "17:00", end_time: "16:30" })).status).toBe(400);
    expect((await createSchedule("teacherA", { days: [2], effective_from: "2026-08-01", effective_to: "2026-08-30" })).status).toBe(400);
    // Teacher A does not teach subject B.
    expect((await createSchedule("teacherA", { days: [2], subject_id: w.subjectB })).status).toBe(403);
    // Overlaps A's own Monday/Wednesday office hours.
    const clash = await createSchedule("teacherA", { days: [3, 5] });
    expect(clash.status).toBe(409);
    expect(clash.body.errors[0].code).toBe("TEACHER_OVERLAP");
    await request(app).post(`/office-hours/schedules/${firstScheduleId}/end`).set(auth("teacherA")).expect(200);
  });

  it("refuses office hours during one of the teacher's own lessons", async () => {
    const slotId = await createCalendarSlot({ userId: w.teacherB, subjectId: w.subjectB, classGroupId: w.classGroupId, academicTermId: w.termId, dayOfWeek: 2, startTime: "15:30", endTime: "16:30" });
    const res = await createSchedule("teacherB", { days: [2], start_time: "16:00", end_time: "17:00" });
    expect(res.status).toBe(409);
    expect(res.body.errors[0].code).toBe("LESSON_CLASH");
    // Starting after the lesson ends is fine.
    const ok = await createSchedule("teacherB", { days: [2], start_time: "16:30", end_time: "17:20" });
    expect(ok.status).toBe(201);
    await request(app).post(`/office-hours/schedules/${ok.body.data.schedule.schedule_id}/end`).set(auth("teacherB"));
    await db.update(CalendarSlot).set({ is_active: 0 }).where(eq(CalendarSlot.slot_id, slotId));
  });

  it("assigns with partial success and explains every refusal", async () => {
    const a = (await createSchedule("teacherA", { days: [1], start_time: "17:20", end_time: "18:00", effective_to: "2026-03-31", capacity: 3 })).body.data.schedule;
    const res = await request(app)
      .post(`/office-hours/schedules/${a.schedule_id}/assignments`)
      .set(auth("teacherA"))
      .send({ student_ids: [w.students[0], w.students[1], w.otherStudents[0], 999999999], reason_code: "BELOW_STANDARD" });
    expect(res.status).toBe(201);
    expect(res.body.data.assigned.map((x: any) => x.student_id)).toEqual([w.students[0], w.students[1]]);
    expect(res.body.data.ineligible).toEqual(
      expect.arrayContaining([
        { student_id: w.otherStudents[0], reason: "NOT_YOUR_STUDENT" },
        { student_id: 999999999, reason: "NOT_ENROLLED" },
      ]),
    );
    // Monday before the 14:00 cut-off: today's session counts.
    expect(res.body.data.assigned[0].effective_from).toBe(OH_MONDAY);
    // Capacity 3: one more fits, the next does not.
    const more = await request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [w.students[2], w.students[3]] });
    expect(more.body.data.assigned.map((x: any) => x.student_id)).toEqual([w.students[2]]);
    expect(more.body.data.over_capacity).toEqual([w.students[3]]);
    // TERM mode: every weekday is locked for an assigned student.
    const locks = await db.select().from(OfficeHourStudentLock).where(and(eq(OfficeHourStudentLock.student_id, w.students[0]), eq(OfficeHourStudentLock.academic_term_id, w.termId)));
    expect(locks.map((l) => l.day_of_week).sort()).toEqual([1, 2, 3, 4, 5]);
    // Clean up for the following tests.
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
  });

  it("lets exactly one of two racing teachers take the same student", async () => {
    const a = (await createSchedule("teacherA", { days: [2], effective_to: "2026-04-30" })).body.data.schedule;
    const b = (await createSchedule("teacherB", { days: [4], effective_to: "2026-04-30" })).body.data.schedule;
    const student = w.students[4];
    const [ra, rb] = await Promise.all([
      request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [student] }),
      request(app).post(`/office-hours/schedules/${b.schedule_id}/assignments`).set(auth("teacherB")).send({ student_ids: [student] }),
    ]);
    const wins = [ra, rb].filter((r) => r.body.data.assigned.length === 1);
    const losses = [ra, rb].filter((r) => r.body.data.conflicts.length === 1);
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    const winnerTeacher = wins[0] === ra ? w.teacherA : w.teacherB;
    expect(losses[0].body.data.conflicts[0].holders[0].teacher_id).toBe(winnerTeacher);
    const active = await db.select().from(OfficeHourAssignment).where(and(eq(OfficeHourAssignment.student_id, student), eq(OfficeHourAssignment.status, "ACTIVE")));
    expect(active).toHaveLength(1);
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
    await request(app).post(`/office-hours/schedules/${b.schedule_id}/end`).set(auth("teacherB"));
  });

  it("WEEKDAY mode allows another weekday but still blocks a shared one", async () => {
    await request(app).put("/office-hours/settings").set(auth("leader")).send({ student_lock_mode: "WEEKDAY" }).expect(200);
    const a = (await createSchedule("teacherA", { days: [2], effective_to: "2026-05-15" })).body.data.schedule;
    const b = (await createSchedule("teacherB", { days: [2, 4], effective_to: "2026-05-15" })).body.data.schedule;
    const c = (await createSchedule("teacherB", { days: [5], effective_to: "2026-05-15" })).body.data.schedule;
    const s = w.students[5];
    expect((await request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [s] })).body.data.assigned).toHaveLength(1);
    // Tuesday is taken by A.
    const blocked = await request(app).post(`/office-hours/schedules/${b.schedule_id}/assignments`).set(auth("teacherB")).send({ student_ids: [s] });
    expect(blocked.body.data.conflicts[0].holders[0].teacher_id).toBe(w.teacherA);
    // Friday is free in WEEKDAY mode.
    expect((await request(app).post(`/office-hours/schedules/${c.schedule_id}/assignments`).set(auth("teacherB")).send({ student_ids: [s] })).body.data.assigned).toHaveLength(1);
    // The picker shows the same picture.
    const cand = await request(app).get(`/office-hours/schedules/${b.schedule_id}/candidates`).set(auth("teacherB"));
    const row = cand.body.data.students.find((x: any) => x.student_id === s);
    expect(row.availability.status).toBe("HELD_BY_OTHER");
    for (const id of [a.schedule_id]) await request(app).post(`/office-hours/schedules/${id}/end`).set(auth("teacherA"));
    for (const id of [b.schedule_id, c.schedule_id]) await request(app).post(`/office-hours/schedules/${id}/end`).set(auth("teacherB"));
    await request(app).put("/office-hours/settings").set(auth("leader")).send({ student_lock_mode: "TERM" }).expect(200);
  });

  it("starts a same-day assignment at the next meeting after the roster cut-off", async () => {
    pinClock(OH_MONDAY, "15:00");
    const a = (await createSchedule("teacherA", { days: [1, 3], start_time: "17:20", end_time: "18:00", effective_to: "2026-03-20" })).body.data.schedule;
    const res = await request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [w.students[6]] });
    expect(res.body.data.assigned[0].effective_from).toBe("2026-03-04");
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
  });

  it("frees the lock when a student is removed, and refuses removal without a reason", async () => {
    const a = (await createSchedule("teacherA", { days: [2], effective_to: "2026-05-29" })).body.data.schedule;
    const b = (await createSchedule("teacherB", { days: [4], effective_to: "2026-05-29" })).body.data.schedule;
    const s = w.students[7];
    const assigned = (await request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [s] })).body.data.assigned[0];
    expect((await request(app).delete(`/office-hours/assignments/${assigned.assignment_id}`).set(auth("teacherA")).send({})).status).toBe(400);
    // Teacher B cannot remove A's student.
    expect((await request(app).delete(`/office-hours/assignments/${assigned.assignment_id}`).set(auth("teacherB")).send({ end_reason_code: "OTHER" })).status).toBe(403);
    const removed = await request(app).delete(`/office-hours/assignments/${assigned.assignment_id}`).set(auth("teacherA")).send({ end_reason_code: "GOAL_MET" });
    expect(removed.status).toBe(200);
    expect(removed.body.data.status).toBe("ENDED");
    // Ended before today's (not yet started) session: never expected today.
    expect(removed.body.data.effective_to < OH_MONDAY).toBe(true);
    expect((await request(app).post(`/office-hours/schedules/${b.schedule_id}/assignments`).set(auth("teacherB")).send({ student_ids: [s] })).body.data.assigned).toHaveLength(1);
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
    await request(app).post(`/office-hours/schedules/${b.schedule_id}/end`).set(auth("teacherB"));
  });

  it("transfers a student when the holder accepts, and lets leadership override", async () => {
    const a = (await createSchedule("teacherA", { days: [2], effective_to: "2026-06-12" })).body.data.schedule;
    const b = (await createSchedule("teacherB", { days: [4], effective_to: "2026-06-12" })).body.data.schedule;
    const s = w.students[0];
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [s] });

    const req1 = await request(app).post("/office-hours/transfer-requests").set(auth("teacherB")).send({ student_id: s, to_schedule_id: b.schedule_id, message: "Needs subject B support" });
    expect(req1.status).toBe(201);
    // Only the holder (or leadership) decides.
    expect((await request(app).post(`/office-hours/transfer-requests/${req1.body.data.request_id}/accept`).set(auth("teacherB"))).status).toBe(403);
    const incoming = await request(app).get("/office-hours/transfer-requests").set(auth("teacherA"));
    expect(incoming.body.data.incoming.map((r: any) => r.request_id)).toContain(req1.body.data.request_id);
    expect((await request(app).post(`/office-hours/transfer-requests/${req1.body.data.request_id}/accept`).set(auth("teacherA"))).status).toBe(200);
    let active = await db.select().from(OfficeHourAssignment).where(and(eq(OfficeHourAssignment.student_id, s), eq(OfficeHourAssignment.status, "ACTIVE")));
    expect(active.map((x) => x.schedule_id)).toEqual([b.schedule_id]);

    // A teacher cannot override; leadership can, with a reason.
    expect((await request(app).post("/office-hours/admin/assignments/override").set(auth("teacherA")).send({ student_id: s, to_schedule_id: a.schedule_id, reason: "x" })).status).toBe(403);
    expect((await request(app).post("/office-hours/admin/assignments/override").set(auth("leader")).send({ student_id: s, to_schedule_id: a.schedule_id })).status).toBe(400);
    const ov = await request(app).post("/office-hours/admin/assignments/override").set(auth("leader")).send({ student_id: s, to_schedule_id: a.schedule_id, reason: "Exam recovery priority" });
    expect(ov.status).toBe(201);
    active = await db.select().from(OfficeHourAssignment).where(and(eq(OfficeHourAssignment.student_id, s), eq(OfficeHourAssignment.status, "ACTIVE")));
    expect(active.map((x) => x.schedule_id)).toEqual([a.schedule_id]);
    const [ended] = await db.select().from(OfficeHourAssignment).where(and(eq(OfficeHourAssignment.student_id, s), eq(OfficeHourAssignment.schedule_id, b.schedule_id)));
    expect(ended.end_reason_code).toBe("ADMIN_OVERRIDE");
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
    await request(app).post(`/office-hours/schedules/${b.schedule_id}/end`).set(auth("teacherB"));
  });

  it("cancels sessions for a closure and restores them when it is removed", async () => {
    const a = (await createSchedule("teacherA", { days: [3], effective_to: "2026-03-25" })).body.data.schedule;
    const preview = await request(app).get("/office-hours/closures/preview").query({ start_date: "2026-03-11", end_date: "2026-03-11" }).set(auth("leader"));
    expect(preview.body.data.sessions_affected).toBeGreaterThanOrEqual(1);
    expect((await request(app).post("/office-hours/closures").set(auth("teacherA")).send({ start_date: "2026-03-11", reason: "x" })).status).toBe(403);
    const created = await request(app).post("/office-hours/closures").set(auth("leader")).send({ start_date: "2026-03-11", reason: "Sports day" });
    expect(created.status).toBe(201);
    let [s11] = (await sessionsOf(a.schedule_id)).filter((s) => s.session_date === "2026-03-11");
    expect(s11.status).toBe("CANCELLED");
    expect(s11.cancel_reason).toBe("CLOSURE");
    expect(recentOfficeHoursEvents().some((e) => e.type === "sessions_cancelled" && e.reason === "CLOSURE")).toBe(true);
    await request(app).delete(`/office-hours/closures/${created.body.data.closure_id}`).set(auth("leader")).expect(200);
    [s11] = (await sessionsOf(a.schedule_id)).filter((s) => s.session_date === "2026-03-11");
    expect(s11.status).toBe("SCHEDULED");
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
  });

  it("re-materialises future sessions when the days change, and ends cleanly", async () => {
    const a = (await createSchedule("teacherA", { days: [3], effective_to: "2026-03-27" })).body.data.schedule;
    const s = w.students[1];
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [s] });
    // Stale version is refused.
    expect((await request(app).patch(`/office-hours/schedules/${a.schedule_id}`).set(auth("teacherA")).send({ days: [4], version: a.version + 5 })).status).toBe(409);
    const upd = await request(app).patch(`/office-hours/schedules/${a.schedule_id}`).set(auth("teacherA")).send({ days: [4], location: "Lab 2", version: a.version });
    expect(upd.status).toBe(200);
    const sessions = await sessionsOf(a.schedule_id);
    expect(sessions.map((x) => x.session_date)).toEqual(["2026-03-05", "2026-03-12"]);
    expect(sessions.every((x) => x.location === "Lab 2")).toBe(true);
    expect(recentOfficeHoursEvents().some((e) => e.type === "schedule_changed")).toBe(true);

    const ended = await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
    expect(ended.body.data.status).toBe("ENDED");
    const after = await sessionsOf(a.schedule_id);
    expect(after.every((x) => x.status === "CANCELLED" && x.cancel_reason === "SCHEDULE_ENDED")).toBe(true);
    const locks = await db.select().from(OfficeHourStudentLock).where(eq(OfficeHourStudentLock.student_id, s));
    expect(locks).toHaveLength(0);
  });

  it("reconcile ends assignments of students who left their class and removes orphan locks", async () => {
    const a = (await createSchedule("teacherA", { days: [5], effective_to: "2026-04-24" })).body.data.schedule;
    const s = w.students[2];
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/assignments`).set(auth("teacherA")).send({ student_ids: [s] });
    await db.update(StudentClassGroup).set({ status: "DISABLED" }).where(and(eq(StudentClassGroup.user_id, s), eq(StudentClassGroup.academic_year_id, w.yearId)));
    const out = await reconcileOfficeHours();
    expect(out.leftClass).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(OfficeHourAssignment).where(and(eq(OfficeHourAssignment.student_id, s), eq(OfficeHourAssignment.schedule_id, a.schedule_id)));
    expect(row.status).toBe("ENDED");
    expect(row.end_reason_code).toBe("LEFT_CLASS");
    expect(await db.select().from(OfficeHourStudentLock).where(eq(OfficeHourStudentLock.student_id, s))).toHaveLength(0);
    await db.update(StudentClassGroup).set({ status: "ACTIVE" }).where(and(eq(StudentClassGroup.user_id, s), eq(StudentClassGroup.academic_year_id, w.yearId)));
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
  });

  it("guards every route by permission and ownership", async () => {
    const a = (await createSchedule("teacherA", { days: [5], effective_to: "2026-04-24" })).body.data.schedule;
    expect((await request(app).get("/office-hours/my").set(auth("s0"))).status).toBe(403);
    expect((await request(app).post("/office-hours/schedules").set(auth("s0")).send({ days: [1] })).status).toBe(403);
    expect((await request(app).put("/office-hours/settings").set(auth("teacherA")).send({ student_lock_mode: "WEEKDAY" })).status).toBe(403);
    expect((await request(app).patch(`/office-hours/schedules/${a.schedule_id}`).set(auth("teacherB")).send({ title: "Mine" })).status).toBe(403);
    expect((await request(app).get(`/office-hours/schedules/${a.schedule_id}`).set(auth("teacherB"))).status).toBe(403);
    expect((await request(app).get(`/office-hours/schedules/${a.schedule_id}`).set(auth("leader"))).status).toBe(200);
    // Settings validation.
    expect((await request(app).put("/office-hours/settings").set(auth("leader")).send({ band_start: "18:30" })).status).toBe(400);
    const cfg = await request(app).get("/office-hours/config").set(auth("s0"));
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.band_start).toBe("16:20");
    expect(cfg.body.data.capabilities.view_self).toBe(true);
    const my = await request(app).get("/office-hours/my").query({ term_id: w.termId }).set(auth("teacherA"));
    expect(my.status).toBe(200);
    expect(my.body.data.schedules.some((x: any) => x.schedule_id === a.schedule_id)).toBe(true);
    await request(app).post(`/office-hours/schedules/${a.schedule_id}/end`).set(auth("teacherA"));
  });
});
