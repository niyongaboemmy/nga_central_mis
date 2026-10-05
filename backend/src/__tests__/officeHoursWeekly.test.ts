import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { OfficeHourAssignment, OfficeHourStudentDateLock } from "../db/officeHoursSchema";
import { createOfficeHoursWorld, OhWorld, OH_MONDAY, pinClock, resetSettings } from "../test/officeHoursFixtures";
import { setOfficeHoursClock } from "../services/officeHours/common";
import { clearOfficeHoursEvents } from "../services/officeHours/events";

// Weekly invitations (migration 104): a teacher invites one group this week
// and another next week. Locks and capacity are per date, not per term.
describe("Office hours: weekly invitations", () => {
  let w: OhWorld;
  const auth = (who: string) => ({ Authorization: `Bearer ${w.tokens[who]}` });
  const WEEK1 = { effective_from: "2026-03-02", effective_to: "2026-03-06" };
  const WEEK2 = { effective_from: "2026-03-09", effective_to: "2026-03-13" };
  const WEEK3 = { effective_from: "2026-03-16", effective_to: "2026-03-20" };
  const created: Array<[string, number]> = [];

  const createSchedule = async (who: string, body: Record<string, unknown>) => {
    const res = await request(app).post("/office-hours/schedules").set(auth(who)).send({ academic_term_id: w.termId, ...body });
    expect(res.status).toBe(201);
    created.push([who, res.body.data.schedule.schedule_id]);
    return res.body.data.schedule;
  };
  const invite = (who: string, scheduleId: number, studentIds: number[], window: Record<string, string>) =>
    request(app).post(`/office-hours/schedules/${scheduleId}/assignments`).set(auth(who)).send({ student_ids: studentIds, ...window });
  const expectedOn = async (who: string, scheduleId: number, ymd: string) => {
    const res = await request(app).get(`/office-hours/schedules/${scheduleId}`).set(auth(who));
    return res.body.data.sessions.find((s: any) => s.session_date === ymd)?.expected;
  };

  beforeAll(async () => {
    await resetSettings();
    w = await createOfficeHoursWorld(6);
  });
  beforeEach(() => {
    pinClock(OH_MONDAY, "09:00");
    clearOfficeHoursEvents();
  });
  afterAll(async () => {
    for (const [who, id] of created) await request(app).post(`/office-hours/schedules/${id}/end`).set(auth(who));
    setOfficeHoursClock(null);
    await resetSettings();
  });

  it("invites a different group each week, with capacity counted per session", async () => {
    const a = await createSchedule("teacherA", { days: [3], capacity: 2, effective_to: "2026-04-30" });
    const [s0, s1, s2] = w.students;

    const wk1 = await invite("teacherA", a.schedule_id, [s0, s1], WEEK1);
    expect(wk1.status).toBe(201);
    // The window starts at the first meeting (Wednesday) and ends with the week.
    expect(wk1.body.data.assigned.map((x: any) => x.effective_from)).toEqual(["2026-03-04", "2026-03-04"]);
    const rows = await db.select().from(OfficeHourAssignment).where(inArray(OfficeHourAssignment.assignment_id, wk1.body.data.assigned.map((x: any) => x.assignment_id)));
    expect(rows.map((r) => String(r.effective_to))).toEqual(["2026-03-06", "2026-03-06"]);

    // Week 1 is full; week 2 has its own two seats, and s0 may come again.
    expect((await invite("teacherA", a.schedule_id, [s2], WEEK1)).body.data.over_capacity).toEqual([s2]);
    const wk2 = await invite("teacherA", a.schedule_id, [s2, s0], WEEK2);
    expect(wk2.body.data.assigned.map((x: any) => x.student_id).sort()).toEqual([s0, s2].sort());
    expect((await invite("teacherA", a.schedule_id, [s0], WEEK1)).body.data.already_assigned).toEqual([s0]);

    expect(await expectedOn("teacherA", a.schedule_id, "2026-03-04")).toBe(2);
    expect(await expectedOn("teacherA", a.schedule_id, "2026-03-11")).toBe(2);

    // The list shows the busiest session, and everyone invited across weeks.
    const list = await request(app).get(`/office-hours/schedules/${a.schedule_id}`).set(auth("teacherA"));
    expect(list.body.data.schedule.assigned_count).toBe(2);
    expect(list.body.data.schedule.invited_count).toBe(3);

    // Capacity is per session: 1 is below week 1's two students.
    const lower = await request(app).patch(`/office-hours/schedules/${a.schedule_id}`).set(auth("teacherA")).send({ capacity: 1, version: list.body.data.schedule.version });
    expect(lower.status).toBe(409);
  });

  it("locks a student only for the weeks they are invited", async () => {
    const a = await createSchedule("teacherA", { days: [2], effective_to: "2026-04-30" });
    const b = await createSchedule("teacherB", { days: [4], effective_to: "2026-04-30" });
    const s = w.students[3];
    expect((await invite("teacherA", a.schedule_id, [s], WEEK1)).body.data.assigned).toHaveLength(1);

    // TERM mode: busy with A in week 1, so B cannot have them that week ...
    const clash = await invite("teacherB", b.schedule_id, [s], WEEK1);
    expect(clash.body.data.conflicts[0].holders[0]).toMatchObject({ teacher_id: w.teacherA, from: "2026-03-03", to: "2026-03-06" });
    // ... but can in week 2.
    expect((await invite("teacherB", b.schedule_id, [s], WEEK2)).body.data.assigned).toHaveLength(1);
    const locks = await db.select().from(OfficeHourStudentDateLock).where(eq(OfficeHourStudentDateLock.student_id, s));
    expect(locks.map((l) => String(l.lock_date)).sort()).toEqual([
      "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06",
      "2026-03-12", "2026-03-13",
    ]);

    // The picker for week 2 sees B's hold; for week 3 the student is free.
    const wk2 = await request(app).get(`/office-hours/schedules/${a.schedule_id}/candidates`).query({ from: WEEK2.effective_from, to: WEEK2.effective_to }).set(auth("teacherA"));
    expect(wk2.body.data.students.find((x: any) => x.student_id === s).availability.status).toBe("HELD_BY_OTHER");
    expect(wk2.body.data.window).toEqual({ from: "2026-03-10", to: "2026-03-13" });
    const wk3 = await request(app).get(`/office-hours/schedules/${a.schedule_id}/candidates`).query({ from: WEEK3.effective_from, to: WEEK3.effective_to }).set(auth("teacherA"));
    expect(wk3.body.data.students.find((x: any) => x.student_id === s).availability.status).toBe("FREE");
    expect(wk3.body.data.assigned_count).toBe(0);
    // Week 1 is "last week" seen from week 2.
    expect(wk2.body.data.previous_week).toEqual({ from: "2026-03-02", student_ids: [s] });
  });

  it("removes a student from a future week without touching the weeks before", async () => {
    const a = await createSchedule("teacherA", { days: [5], effective_to: "2026-04-30" });
    const s = w.students[4];
    const res = await invite("teacherA", a.schedule_id, [s], { effective_from: WEEK1.effective_from, effective_to: WEEK3.effective_to });
    const id = res.body.data.assigned[0].assignment_id;
    expect(await expectedOn("teacherA", a.schedule_id, "2026-03-13")).toBe(1);

    const out = await request(app).delete(`/office-hours/assignments/${id}`).set(auth("teacherA")).send({ end_reason_code: "TEACHER_REQUEST", from: WEEK2.effective_from });
    expect(out.status).toBe(200);
    const [row] = await db.select().from(OfficeHourAssignment).where(eq(OfficeHourAssignment.assignment_id, id));
    expect(row.status).toBe("ENDED");
    expect(String(row.effective_to)).toBe("2026-03-08");
    expect(await expectedOn("teacherA", a.schedule_id, "2026-03-06")).toBe(1);
    expect(await expectedOn("teacherA", a.schedule_id, "2026-03-13")).toBe(0);
    expect(await db.select().from(OfficeHourStudentDateLock).where(and(eq(OfficeHourStudentDateLock.student_id, s), eq(OfficeHourStudentDateLock.assignment_id, id)))).toHaveLength(0);
  });

  it("rejects malformed windows", async () => {
    const a = await createSchedule("teacherA", { days: [1], effective_to: "2026-04-30" });
    expect((await invite("teacherA", a.schedule_id, [w.students[5]], { effective_from: "2026-03-13", effective_to: "2026-03-09" })).status).toBe(400);
    expect((await invite("teacherA", a.schedule_id, [w.students[5]], { effective_from: "next week" } as any)).status).toBe(400);
    // A week after the schedule's end has no session to invite to.
    expect((await invite("teacherA", a.schedule_id, [w.students[5]], { effective_from: "2026-05-04", effective_to: "2026-05-08" })).body.data.no_remaining_sessions).toBe(true);
  });
});
