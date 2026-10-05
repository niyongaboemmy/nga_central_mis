import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import {
  OfficeHourAttendance,
  OfficeHourAttendanceHistory,
  OfficeHourSession,
  OfficeHourStudentDateLock,
} from "../db/officeHoursSchema";
import { createOfficeHoursWorld, OhWorld, OH_MONDAY, pinClock, resetSettings } from "../test/officeHoursFixtures";
import { setOfficeHoursClock } from "../services/officeHours/common";
import { statsFromMarks } from "../services/officeHours/metrics";
import { autoCloseUnmarked } from "../services/officeHours/admin";
import { recentOfficeHoursEvents, clearOfficeHoursEvents } from "../services/officeHours/events";

// Office hours Phase 3: the register, its history, the edit window, drop-ins,
// substitutes, unmarked registers and the attendance metrics (plan §12, §14.2).
describe("Office hours phase 3: register and attendance", () => {
  let w: OhWorld;
  let scheduleId: number;
  const auth = (who: string) => ({ Authorization: `Bearer ${w.tokens[who]}` });
  const sessionOn = async (ymd: string) => {
    const [s] = await db
      .select()
      .from(OfficeHourSession)
      .where(and(eq(OfficeHourSession.schedule_id, scheduleId), eq(OfficeHourSession.session_date, ymd)));
    return s;
  };
  const open = (sid: number, who = "teacherA") => request(app).get(`/office-hours/sessions/${sid}/register`).set(auth(who));
  const save = (sid: number, body: Record<string, unknown>, who = "teacherA") =>
    request(app).put(`/office-hours/sessions/${sid}/register`).set(auth(who)).send(body);

  beforeAll(async () => {
    await resetSettings();
    pinClock(OH_MONDAY, "09:00");
    w = await createOfficeHoursWorld(5);
    const res = await request(app)
      .post("/office-hours/schedules")
      .set(auth("teacherA"))
      .send({ academic_term_id: w.termId, days: [1, 3], location: "B4", effective_to: "2026-04-30" });
    scheduleId = res.body.data.schedule.schedule_id;
    await request(app).post(`/office-hours/schedules/${scheduleId}/assignments`).set(auth("teacherA")).send({ student_ids: w.students.slice(0, 3) });
  });
  afterAll(async () => {
    setOfficeHoursClock(null);
    await resetSettings();
  });

  it("opens 15 minutes before the start and snapshots the expected roster", async () => {
    const s = await sessionOn(OH_MONDAY);
    // 09:00: a future register shows who is expected but freezes nothing.
    const early = await open(s.session_id);
    expect(early.status).toBe(200);
    expect(early.body.data.window.not_yet).toBe(true);
    expect(early.body.data.can_edit).toBe(false);
    expect(early.body.data.roster).toHaveLength(3);
    expect(await db.select().from(OfficeHourAttendance).where(eq(OfficeHourAttendance.session_id, s.session_id))).toHaveLength(0);
    expect((await save(s.session_id, { records: [{ student_id: w.students[0], status: "PRESENT" }] })).status).toBe(409);

    pinClock(OH_MONDAY, "16:05");
    const opened = await open(s.session_id);
    expect(opened.body.data.can_edit).toBe(true);
    const rows = await db.select().from(OfficeHourAttendance).where(eq(OfficeHourAttendance.session_id, s.session_id));
    expect(rows.map((r) => r.student_id).sort()).toEqual(w.students.slice(0, 3).sort());
    expect(rows.every((r) => r.status === null)).toBe(true);
  });

  it("saves marks with history, turns the session HELD and refuses a stale version", async () => {
    pinClock(OH_MONDAY, "16:30");
    clearOfficeHoursEvents();
    const s = await sessionOn(OH_MONDAY);
    const res = await save(s.session_id, {
      version: s.version,
      topic: "Quadratic equations",
      records: [
        { student_id: w.students[0], status: "PRESENT", outcome: 2 },
        { student_id: w.students[1], status: "LATE", arrived_at: "16:35" },
        { student_id: w.students[2], status: "ABSENT", note: "No word" },
      ],
    });
    expect(res.status).toBe(200);
    const after = await sessionOn(OH_MONDAY);
    expect(after.status).toBe("HELD");
    expect(after.topic).toBe("Quadratic equations");
    expect(after.version).toBe(s.version + 1);
    const byStudent = new Map(res.body.data.roster.map((r: any) => [r.student_id, r]));
    expect((byStudent.get(w.students[1]) as any).arrived_at).toBe("16:35");
    expect(recentOfficeHoursEvents().find((e) => e.type === "register_saved")).toBeTruthy();

    // Same version again: someone saved in between.
    const stale = await save(s.session_id, { version: s.version, records: [{ student_id: w.students[2], status: "EXCUSED" }] });
    expect(stale.status).toBe(409);
    expect(stale.body.errors[0].code).toBe("REGISTER_CHANGED");

    // Correcting a mark adds history.
    const fix = await save(s.session_id, { version: after.version, records: [{ student_id: w.students[2], status: "EXCUSED", excuse_reason: "SICK" }] });
    expect(fix.status).toBe(200);
    const history = await db.select().from(OfficeHourAttendanceHistory).where(and(eq(OfficeHourAttendanceHistory.session_id, s.session_id), eq(OfficeHourAttendanceHistory.student_id, w.students[2])));
    expect(history.map((h) => [h.previous_status, h.new_status])).toEqual([
      [null, "ABSENT"],
      ["ABSENT", "EXCUSED"],
    ]);
    const hist = await request(app).get(`/office-hours/sessions/${s.session_id}/history`).set(auth("teacherA"));
    expect(hist.body.data[0].new_status).toBe("EXCUSED");

    // A held session cannot be cancelled.
    expect((await request(app).post(`/office-hours/sessions/${s.session_id}/cancel`).set(auth("teacherA")).send({ reason: "TEACHER_ABSENT" })).status).toBe(409);
  });

  it("accepts a walk-in as a drop-in without locking them", async () => {
    pinClock(OH_MONDAY, "16:40");
    const s = await sessionOn(OH_MONDAY);
    const walkIn = w.students[4];
    expect((await save(s.session_id, { records: [{ student_id: walkIn, status: "ABSENT" }] })).status).toBe(400);
    const res = await save(s.session_id, { records: [{ student_id: walkIn, status: "PRESENT" }] });
    expect(res.status).toBe(200);
    const row = res.body.data.roster.find((r: any) => r.student_id === walkIn);
    expect(row.is_drop_in).toBe(true);
    expect(await db.select().from(OfficeHourStudentDateLock).where(eq(OfficeHourStudentDateLock.student_id, walkIn))).toHaveLength(0);
    // Searching for a walk-in.
    const search = await request(app).get("/office-hours/students").query({ q: "Test", term_id: w.termId }).set(auth("teacherA"));
    expect(search.status).toBe(200);
  });

  it("lets a substitute take one register and closes editing after the window", async () => {
    pinClock(OH_MONDAY, "18:00");
    const wed = await sessionOn("2026-03-04");
    expect((await request(app).post(`/office-hours/sessions/${wed.session_id}/host`).set(auth("teacherB")).send({ teacher_id: w.teacherB })).status).toBe(403);
    expect((await request(app).post(`/office-hours/sessions/${wed.session_id}/host`).set(auth("teacherA")).send({ teacher_id: w.teacherB })).status).toBe(200);
    pinClock("2026-03-04", "16:25");
    expect((await save(wed.session_id, { records: [{ student_id: w.students[0], status: "PRESENT" }] }, "teacherB")).status).toBe(200);
    // The substitute cannot touch Monday's register.
    const mon = await sessionOn(OH_MONDAY);
    expect((await save(mon.session_id, { records: [{ student_id: w.students[0], status: "ABSENT" }] }, "teacherB")).status).toBe(403);

    // Eight days later the teacher can no longer edit Monday; leadership can.
    pinClock("2026-03-10", "09:00");
    const late = await save(mon.session_id, { records: [{ student_id: w.students[0], status: "ABSENT" }] });
    expect(late.status).toBe(409);
    expect((await open(mon.session_id)).body.data.can_edit).toBe(false);
    expect((await save(mon.session_id, { records: [{ student_id: w.students[0], status: "PRESENT", note: "Corrected" }] }, "leader")).status).toBe(200);
  });

  it("lists registers nobody took and can auto-close them when switched on", async () => {
    // 9 March (Monday) passes with no register.
    pinClock("2026-03-09", "19:00");
    const unmarked = await request(app).get("/office-hours/admin/unmarked").query({ from: "2026-03-01", to: "2026-03-09" }).set(auth("leader"));
    expect(unmarked.status).toBe(200);
    const mar9 = await sessionOn("2026-03-09");
    expect(unmarked.body.data.map((u: any) => u.session_id)).toContain(mar9.session_id);
    expect((await request(app).get("/office-hours/admin/unmarked").set(auth("teacherA"))).status).toBe(403);

    pinClock("2026-03-20", "02:00");
    expect(await autoCloseUnmarked()).toBe(0); // off by default
    await request(app).put("/office-hours/settings").set(auth("leader")).send({ auto_close_unmarked: true }).expect(200);
    expect(await autoCloseUnmarked()).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(OfficeHourAttendance).where(eq(OfficeHourAttendance.session_id, mar9.session_id));
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.status === "ABSENT" && r.source === "AUTO")).toBe(true);
    await request(app).put("/office-hours/settings").set(auth("leader")).send({ auto_close_unmarked: false }).expect(200);
  });

  it("puts each student's attendance on the roster and on their own page", async () => {
    pinClock("2026-03-20", "09:00");
    const detail = await request(app).get(`/office-hours/schedules/${scheduleId}`).set(auth("teacherA"));
    const s0 = detail.body.data.roster.find((r: any) => r.student_id === w.students[0]);
    // Mon 2 PRESENT (corrected), Wed 4 PRESENT, Mon 9 + Wed 11 ABSENT (auto-closed past the
    // 7-day window), Mon 16 still unmarked and therefore ignored.
    expect(s0.stats).toMatchObject({ expected: 4, present: 2, absent: 2, current_absent_streak: 2, rate: 50, band: "CHRONIC" });
    const me = await request(app).get("/office-hours/me").query({ term_id: w.termId }).set(auth("s0"));
    expect(me.body.data.stats.expected).toBe(4);
    expect(me.body.data.history.find((h: any) => h.session_date === OH_MONDAY).status).toBe("PRESENT");
  });

  it("computes rates, streaks and bands from marks", () => {
    const settings = { rate_band_consistent: 90, rate_band_watch: 80, min_sessions_for_rate: 3 };
    const m = (d: string, status: any) => ({ student_id: 1, session_date: d, start_time: "16:20", status });
    expect(statsFromMarks([], settings)).toMatchObject({ expected: 0, rate: null, band: "TOO_FEW" });
    const s = statsFromMarks([m("2026-03-02", "PRESENT"), m("2026-03-04", "LATE"), m("2026-03-09", "EXCUSED"), m("2026-03-11", "ABSENT"), m("2026-03-16", "ABSENT")], settings);
    expect(s).toMatchObject({ expected: 5, present: 1, late: 1, excused: 1, absent: 2, rate: 60, presence_rate: 40, current_absent_streak: 2, longest_attended_streak: 2, band: "CHRONIC", last_attended: "2026-03-04" });
    // EXCUSED neither breaks an attended run nor an absent streak.
    const t = statsFromMarks([m("2026-03-02", "ABSENT"), m("2026-03-04", "EXCUSED"), m("2026-03-09", "ABSENT")], settings);
    expect(t.current_absent_streak).toBe(2);
    const u = statsFromMarks([m("2026-03-02", "PRESENT"), m("2026-03-04", "EXCUSED"), m("2026-03-09", "PRESENT"), m("2026-03-11", "PRESENT"), m("2026-03-16", "PRESENT"), m("2026-03-18", "PRESENT"), m("2026-03-23", "PRESENT"), m("2026-03-25", "PRESENT"), m("2026-03-30", "PRESENT"), m("2026-04-01", "ABSENT")], settings);
    expect(u).toMatchObject({ rate: 90, band: "CONSISTENT", longest_attended_streak: 8 });
  });
});
