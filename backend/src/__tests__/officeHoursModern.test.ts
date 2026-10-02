import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AcademicTerm, Notification } from "../db/schema";
import { OfficeHourAttendance, OfficeHourSession, OfficeHourSchedule, OfficeHourAssignment } from "../db/officeHoursSchema";
import { createOfficeHoursWorld, OhWorld, OH_MONDAY, pinClock, resetSettings } from "../test/officeHoursFixtures";
import { setOfficeHoursClock } from "../services/officeHours/common";
import { ensureSessions, rematerialiseSchedule } from "../services/officeHours/sessions";
import { flushOfficeHoursEvents } from "../services/officeHours/events";
import { publishSession, subscribeSession } from "../services/officeHours/live";
import { setStandingFetcher } from "../services/officeHours/modern";

// Office hours Phase 6: QR check-in and the live register, the student's
// "can't attend" notice, suggestions, rollover and moving one session
// (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §16).
describe("Office hours phase 6: modern features", () => {
  let w: OhWorld;
  let sched: number;
  const tok = (who: string) => ({ Authorization: `Bearer ${w.tokens[who]}` });
  const session = async (ymd: string, scheduleId = sched) => {
    await ensureSessions(scheduleId);
    return (await db.select().from(OfficeHourSession).where(and(eq(OfficeHourSession.schedule_id, scheduleId), eq(OfficeHourSession.session_date, ymd))))[0];
  };

  beforeAll(async () => {
    await resetSettings();
    pinClock(OH_MONDAY, "09:00");
    w = await createOfficeHoursWorld(5);
    sched = (await request(app).post("/office-hours/schedules").set(tok("teacherA")).send({ academic_term_id: w.termId, days: [1, 3], subject_id: w.subjectA, location: "B4", effective_to: "2026-04-30" })).body.data.schedule.schedule_id;
    await request(app).post(`/office-hours/schedules/${sched}/assignments`).set(tok("teacherA")).send({ student_ids: [w.students[0], w.students[1], w.students[2]] });
  });
  afterAll(async () => {
    setOfficeHoursClock(null);
    await resetSettings();
  });

  it("refuses check-in until the school switches it on, then rotates a code the student can use", async () => {
    const mon = await session(OH_MONDAY);
    pinClock(OH_MONDAY, "16:15");
    expect((await request(app).post(`/office-hours/sessions/${mon.session_id}/checkin-token`).set(tok("teacherA"))).status).toBe(409);
    await request(app).put("/office-hours/settings").set(tok("leader")).send({ qr_checkin_enabled: true }).expect(200);
    expect((await request(app).post(`/office-hours/sessions/${mon.session_id}/checkin-token`).set(tok("teacherB"))).status).toBe(403);
    const t = await request(app).post(`/office-hours/sessions/${mon.session_id}/checkin-token`).set(tok("teacherA"));
    expect(t.status).toBe(200);
    expect(t.body.data.code).toMatch(/^\d{6}$/);

    // A fake live subscriber sees the check-in.
    const writes: string[] = [];
    const fakeRes: any = { setHeader() {}, flushHeaders() {}, write: (s: string) => writes.push(s), on() {} };
    subscribeSession(mon.session_id, fakeRes);

    const ok = await request(app).post("/office-hours/checkin").set(tok("s0")).send({ token: t.body.data.token });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: "PRESENT", already: false, drop_in: false });
    expect(writes.some((x) => x.startsWith("event: checkin"))).toBe(true);
    // Twice is harmless.
    expect((await request(app).post("/office-hours/checkin").set(tok("s0")).send({ token: t.body.data.token })).body.data.already).toBe(true);

    // The 6-digit code works too; after the late threshold it records LATE.
    pinClock(OH_MONDAY, "16:35");
    const t2 = await request(app).post(`/office-hours/sessions/${mon.session_id}/checkin-token`).set(tok("teacherA"));
    const late = await request(app).post("/office-hours/checkin").set(tok("s1")).send({ session_id: mon.session_id, code: t2.body.data.code });
    expect(late.body.data.status).toBe("LATE");
    // A code from two minutes ago has expired.
    pinClock(OH_MONDAY, "16:38");
    expect((await request(app).post("/office-hours/checkin").set(tok("s2")).send({ token: t2.body.data.token })).status).toBe(400);
    // Someone who is not on the roster comes in as a drop-in.
    const t3 = await request(app).post(`/office-hours/sessions/${mon.session_id}/checkin-token`).set(tok("teacherA"));
    expect((await request(app).post("/office-hours/checkin").set(tok("s4")).send({ token: t3.body.data.token })).body.data.drop_in).toBe(true);

    // Check-ins never mark the session held, and never overwrite the teacher.
    expect((await session(OH_MONDAY)).status).toBe("SCHEDULED");
    await request(app).put(`/office-hours/sessions/${mon.session_id}/register`).set(tok("teacherA")).send({ records: [{ student_id: w.students[2], status: "ABSENT" }] }).expect(200);
    const t4 = await request(app).post(`/office-hours/sessions/${mon.session_id}/checkin-token`).set(tok("teacherA"));
    const after = await request(app).post("/office-hours/checkin").set(tok("s2")).send({ token: t4.body.data.token });
    expect(after.body.data).toMatchObject({ status: "ABSENT", already: true });
    const rows = await db.select().from(OfficeHourAttendance).where(eq(OfficeHourAttendance.session_id, mon.session_id));
    expect(rows.find((r) => r.student_id === w.students[0])?.source).toBe("QR");
    expect(publishSession(999999999, "x", {})).toBe(0);
  });

  it("lets a student tell the teacher they can't come, before the session only", async () => {
    pinClock(OH_MONDAY, "18:00");
    const wed = await session("2026-03-04");
    expect((await request(app).post(`/office-hours/sessions/${wed.session_id}/absence-notice`).set(tok("s1")).send({ reason: "NAP" })).status).toBe(400);
    expect((await request(app).post(`/office-hours/sessions/${wed.session_id}/absence-notice`).set(tok("s3")).send({ reason: "SICK" })).status).toBe(403);
    expect((await request(app).post(`/office-hours/sessions/${wed.session_id}/absence-notice`).set(tok("s1")).send({ reason: "SCHOOL_ACTIVITY", note: "Football match" })).status).toBe(201);
    await flushOfficeHoursEvents();
    const host = await db.select().from(Notification).where(and(eq(Notification.user_id, w.teacherA), eq(Notification.kind, "office_hours_changed")));
    expect(host.some((n) => /can't come/.test(n.title))).toBe(true);
    const me = await request(app).get("/office-hours/me").query({ term_id: w.termId }).set(tok("s1"));
    expect(me.body.data.upcoming.find((u: any) => u.session_id === wed.session_id).notice).toMatchObject({ reason: "SCHOOL_ACTIVITY" });
    pinClock("2026-03-04", "16:10");
    const reg = await request(app).get(`/office-hours/sessions/${wed.session_id}/register`).set(tok("teacherA"));
    expect(reg.body.data.roster.find((r: any) => r.student_id === w.students[1]).notice).toMatchObject({ reason: "SCHOOL_ACTIVITY", note: "Football match" });
    pinClock("2026-03-04", "16:30");
    expect((await request(app).post(`/office-hours/sessions/${wed.session_id}/absence-notice`).set(tok("s0")).send({ reason: "SICK" })).status).toBe(409);
  });

  it("suggests students with transparent evidence, only from the teacher's own students", async () => {
    setStandingFetcher(async () => ({
      pass_mark: 50,
      students: [
        { mis_user_id: w.students[3], avg_score: 38, graded_count: 4, missing: 3, subjects: ["Maths"], reasons: [], below_pass: true },
        { mis_user_id: w.students[4], avg_score: 72, graded_count: 4, missing: 0, subjects: ["Maths"], reasons: [], below_pass: false },
        { mis_user_id: w.otherStudents[0], avg_score: 10, graded_count: 2, missing: 5, subjects: ["Maths"], reasons: [], below_pass: true },
      ],
    }));
    const res = await request(app).get(`/office-hours/schedules/${sched}/suggestions`).set(tok("teacherA"));
    expect(res.status).toBe(200);
    expect(res.body.data.task_mentor).toBe("ok");
    const ids = res.body.data.students.map((s: any) => s.student_id);
    expect(ids[0]).toBe(w.students[3]);
    expect(ids).not.toContain(w.students[4]);
    expect(ids).not.toContain(w.otherStudents[0]); // not taught by this teacher
    expect(res.body.data.students[0].signals.map((s: any) => s.label)).toEqual(["Task Mentor average 38% (pass 50%)", "3 pieces of work missing in Task Mentor"]);
    expect((await request(app).get(`/office-hours/schedules/${sched}/suggestions`).set(tok("teacherB"))).status).toBe(403);
  });

  it("moves one session without the weekly pattern re-creating it, and counts no cancellation", async () => {
    pinClock("2026-03-05", "09:00");
    const mon9 = await session("2026-03-09");
    const moved = await request(app).post(`/office-hours/sessions/${mon9.session_id}/move`).set(tok("teacherA")).send({ date: "2026-03-10", start_time: "16:30", end_time: "17:20" });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ session_date: "2026-03-10", start_time: "16:30", moved_from_session_id: mon9.session_id });
    const original = await session("2026-03-09");
    expect(original).toMatchObject({ status: "CANCELLED", cancel_reason: "MOVED" });
    await ensureSessions(sched);
    await rematerialiseSchedule(sched, w.teacherA);
    const all = await db.select().from(OfficeHourSession).where(eq(OfficeHourSession.schedule_id, sched));
    expect(all.filter((s) => s.session_date === "2026-03-09")).toHaveLength(1);
    expect(all.find((s) => s.session_date === "2026-03-10")?.status).toBe("SCHEDULED");
    const report = await request(app).get("/office-hours/reports/summary").query({ period: "custom", from: "2026-03-09", to: "2026-03-10", term_id: w.termId }).set(tok("leader"));
    expect(report.body.data.kpis.cancelled).toBe(0);
    await flushOfficeHoursEvents();
    const notes = await db.select().from(Notification).where(and(eq(Notification.user_id, w.students[0]), eq(Notification.kind, "office_hours_changed")));
    expect(notes.some((n) => /moved/.test(n.title))).toBe(true);

    // A student busy at the new time blocks the move. Per-weekday locks let
    // student 3 hold A on Mon/Wed and B on Thursday.
    await request(app).put("/office-hours/settings").set(tok("leader")).send({ student_lock_mode: "WEEKDAY" }).expect(200);
    await request(app).post(`/office-hours/schedules/${sched}/assignments`).set(tok("teacherA")).send({ student_ids: [w.students[3]] }).expect(201);
    const b = (await request(app).post("/office-hours/schedules").set(tok("teacherB")).send({ academic_term_id: w.termId, days: [4], effective_to: "2026-04-30" })).body.data.schedule.schedule_id;
    expect((await request(app).post(`/office-hours/schedules/${b}/assignments`).set(tok("teacherB")).send({ student_ids: [w.students[3]] })).body.data.assigned).toHaveLength(1);
    const wed11 = await session("2026-03-11");
    const blocked = await request(app).post(`/office-hours/sessions/${wed11.session_id}/move`).set(tok("teacherA")).send({ date: "2026-03-12" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.errors[0]).toMatchObject({ code: "STUDENT_BUSY", student_id: w.students[3] });
    await request(app).put("/office-hours/settings").set(tok("leader")).send({ student_lock_mode: "TERM" }).expect(200);
    await request(app).post(`/office-hours/schedules/${b}/end`).set(tok("teacherB"));
  });

  it("rolls office hours over into the next term, re-checking every student", async () => {
    const [t2] = (await db.insert(AcademicTerm).values({ academic_year_id: w.yearId, name: "OH Term 2", start_date: "2026-07-06", end_date: "2026-11-27", is_current: 0 } as any)) as any;
    // One student met their goal: they are not carried over.
    const [a1] = await db.select().from(OfficeHourAssignment).where(and(eq(OfficeHourAssignment.schedule_id, sched), eq(OfficeHourAssignment.student_id, w.students[1])));
    await request(app).delete(`/office-hours/assignments/${a1.assignment_id}`).set(tok("teacherA")).send({ end_reason_code: "GOAL_MET" }).expect(200);
    const res = await request(app).post(`/office-hours/schedules/${sched}/rollover`).set(tok("teacherA")).send({ to_term_id: t2.insertId });
    expect(res.status).toBe(201);
    const [copy] = await db.select().from(OfficeHourSchedule).where(eq(OfficeHourSchedule.schedule_id, res.body.data.schedule_id));
    expect(copy).toMatchObject({ status: "DRAFT", academic_term_id: t2.insertId, effective_from: "2026-07-06", effective_to: "2026-11-27", location: "B4", start_time: "16:20" });
    const carried = res.body.data.assignment.assigned.map((x: any) => x.student_id).sort((a: number, b: number) => a - b);
    expect(carried).toEqual([w.students[0], w.students[2], w.students[3]].sort((a, b) => a - b));
    expect((await request(app).post(`/office-hours/schedules/${sched}/rollover`).set(tok("teacherA")).send({ to_term_id: w.termId })).status).toBe(400);
    setStandingFetcher(null);
  });
});
