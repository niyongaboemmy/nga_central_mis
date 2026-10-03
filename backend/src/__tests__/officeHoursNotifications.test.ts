import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { Notification, Parenting, User } from "../db/schema";
import { OfficeHourEscalation, OfficeHourSession } from "../db/officeHoursSchema";
import { assignRole, createRoleWithPermissions, createUser, createUserGradeAssignment, signToken } from "../test/fixtures";
import { createOfficeHoursWorld, OhWorld, OH_MONDAY, pinClock, resetSettings } from "../test/officeHoursFixtures";
import { setOfficeHoursClock } from "../services/officeHours/common";
import { flushOfficeHoursEvents } from "../services/officeHours/events";
import { setOfficeHoursEmailSender } from "../services/officeHours/notify";
import { morningDigest, registerReminders, resetRegisterReminders, weeklyDigests, setDigestEmailSender } from "../services/officeHours/digests";
import { collectOccurrences } from "../services/reminders/occurrences";
import { normalizeSettings } from "../services/reminders/preferences";
import { kigaliInstant } from "../services/reminders/time";
import { ensureSessions } from "../services/officeHours/sessions";

// Office hours Phase 4: notifications, escalations, digests and the Reminder Hub
// (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §13).
describe("Office hours phase 4: notifications and reminders", () => {
  let w: OhWorld;
  let scheduleId: number;
  let classTeacher: number;
  let parent: number;
  const emails: Array<{ to: string; subject: string }> = [];
  const auth = (who: string) => ({ Authorization: `Bearer ${w.tokens[who]}` });
  const notes = async (userId: number, kind?: string) => {
    await flushOfficeHoursEvents();
    const rows = await db.select().from(Notification).where(eq(Notification.user_id, userId));
    return kind ? rows.filter((r) => r.kind === kind) : rows;
  };
  // The scheduler keeps sessions materialised two weeks ahead; tests jump the
  // clock, so do what the sweep would before looking a session up.
  const sessionOn = async (ymd: string) => {
    await ensureSessions(scheduleId);
    return (await db.select().from(OfficeHourSession).where(and(eq(OfficeHourSession.schedule_id, scheduleId), eq(OfficeHourSession.session_date, ymd))))[0];
  };
  const mark = async (ymd: string, status: string, student = w.students[0]) => {
    pinClock(ymd, "16:30");
    const s = await sessionOn(ymd);
    const res = await request(app).put(`/office-hours/sessions/${s.session_id}/register`).set(auth("teacherA")).send({ records: [{ student_id: student, status }] });
    expect(res.status).toBe(200);
    await flushOfficeHoursEvents();
    return s;
  };

  beforeAll(async () => {
    await resetSettings();
    setOfficeHoursEmailSender(async (to, subject) => {
      emails.push({ to, subject });
      return true;
    });
    setDigestEmailSender(async (to, subject) => {
      emails.push({ to, subject });
      return true;
    });
    pinClock(OH_MONDAY, "09:00");
    w = await createOfficeHoursWorld(4);
    classTeacher = await createUser({ userType: "TEACHER" });
    await createUserGradeAssignment({ userId: classTeacher, gradeId: w.gradeId, classGroupId: w.classGroupId, academicYearId: w.yearId });
    parent = await createUser();
    await db.update(User).set({ email: `parent_${Date.now()}@nga-family.rw` }).where(eq(User.user_id, parent));
    await db.insert(Parenting).values({ parent_id: parent, student_id: w.students[0] } as any);
  });
  beforeEach(() => resetRegisterReminders());
  afterAll(async () => {
    setOfficeHoursClock(null);
    setOfficeHoursEmailSender(null);
    await resetSettings();
  });

  it("tells students they are assigned when office hours are published, with reminders off", async () => {
    const created = await request(app)
      .post("/office-hours/schedules")
      .set(auth("teacherA"))
      .send({ academic_term_id: w.termId, days: [1, 3], location: "B4", status: "DRAFT", effective_to: "2026-05-29" });
    scheduleId = created.body.data.schedule.schedule_id;
    await request(app).post(`/office-hours/schedules/${scheduleId}/assignments`).set(auth("teacherA")).send({ student_ids: [w.students[0], w.students[1]], reason_code: "BELOW_STANDARD" });
    // A draft tells nobody.
    expect(await notes(w.students[0], "office_hours_assigned")).toHaveLength(0);
    await request(app).post(`/office-hours/schedules/${scheduleId}/publish`).set(auth("teacherA")).expect(200);
    const [n] = await notes(w.students[0], "office_hours_assigned");
    expect(n.title).toMatch(/^Office hours with /);
    expect(n.body).toContain("Mon, Wed, 16:20–17:20, B4");
    expect(n.body).not.toMatch(/below/i);
    expect(n.link).toBe("/my-office-hours");
  });

  it("feeds sessions to the Reminder Hub for the host and the student", async () => {
    const from = kigaliInstant(OH_MONDAY, 0);
    const to = kigaliInstant("2026-03-04", 23 * 60);
    const student = (await collectOccurrences(w.students[0], from, to)).filter((o) => o.kind === "office_hours");
    expect(student.map((o) => [o.role, o.start.toISOString()])).toEqual([
      ["attending", kigaliInstant(OH_MONDAY, 16 * 60 + 20).toISOString()],
      ["attending", kigaliInstant("2026-03-04", 16 * 60 + 20).toISOString()],
    ]);
    const host = (await collectOccurrences(w.teacherA, from, to)).filter((o) => o.kind === "office_hours");
    expect(host.every((o) => o.role === "teaching" && o.link === `/office-hours/schedules/${scheduleId}`)).toBe(true);
    // Somebody else gets nothing.
    expect((await collectOccurrences(w.students[3], from, to)).filter((o) => o.kind === "office_hours")).toHaveLength(0);
    expect(normalizeSettings({}).office_hours).toEqual({ enabled: true, offsets: [15] });
  });

  it("announces a cancellation to students but not to the teacher who cancelled", async () => {
    const wed = await sessionOn("2026-03-04");
    await request(app).post(`/office-hours/sessions/${wed.session_id}/cancel`).set(auth("teacherA")).send({ reason: "TEACHER_ABSENT", note: "Workshop" }).expect(200);
    const [n] = await notes(w.students[1], "office_hours_cancelled");
    expect(n.body).toContain("your teacher is away");
    expect(n.body).toContain("Workshop");
    expect(await notes(w.teacherA, "office_hours_cancelled")).toHaveLength(0);
    // Cancelled sessions leave the Hub.
    const occ = await collectOccurrences(w.students[1], kigaliInstant("2026-03-04", 0), kigaliInstant("2026-03-04", 23 * 60));
    expect(occ.filter((o) => o.kind === "office_hours")).toHaveLength(0);
    await request(app).post(`/office-hours/sessions/${wed.session_id}/restore`).set(auth("teacherA")).expect(200);
    const [back] = await notes(w.students[1], "office_hours_cancelled");
    expect(back.title).toMatch(/back on/);
  });

  it("reminds the host to take the register, then that it is missing", async () => {
    pinClock(OH_MONDAY, "16:26");
    const due = await registerReminders();
    const mon = await sessionOn(OH_MONDAY);
    expect(due).toContainEqual({ sessionId: mon.session_id, stage: "due" });
    expect((await notes(w.teacherA, "office_hours_register_due"))[0].title).toMatch(/^Take the register/);
    expect(await registerReminders()).toEqual([]); // once per stage
    pinClock(OH_MONDAY, "17:31");
    expect(await registerReminders()).toContainEqual({ sessionId: mon.session_id, stage: "missing" });
    expect((await notes(w.teacherA, "office_hours_register_due"))[0].title).toMatch(/^Register still missing/);
  });

  it("tells a student they were absent, and withdraws it when corrected", async () => {
    const s = await mark(OH_MONDAY, "ABSENT", w.students[1]);
    expect(await notes(w.students[1], "office_hours_absent")).toHaveLength(1);
    await request(app).put(`/office-hours/sessions/${s.session_id}/register`).set(auth("teacherA")).send({ records: [{ student_id: w.students[1], status: "PRESENT" }] }).expect(200);
    expect(await notes(w.students[1], "office_hours_absent")).toHaveLength(0);
  });

  it("escalates repeated absence: L1 to the class teacher, L2 to the programme lead and family", async () => {
    await mark(OH_MONDAY, "ABSENT");
    await mark("2026-03-04", "ABSENT");
    let rows = await db.select().from(OfficeHourEscalation).where(eq(OfficeHourEscalation.student_id, w.students[0]));
    expect(rows.map((r) => [r.level, r.trigger_code])).toEqual([[1, "CONSECUTIVE_L1"]]);
    expect(await notes(classTeacher, "office_hours_escalation")).toHaveLength(1);
    expect(await notes(w.teacherA, "office_hours_escalation")).toHaveLength(1);
    const [studentNote] = await notes(w.students[0], "office_hours_escalation");
    expect(studentNote.title).toMatch(/^Please come to office hours/);
    expect(await notes(parent, "office_hours_escalation")).toHaveLength(0);

    await mark("2026-03-09", "ABSENT");
    rows = await db.select().from(OfficeHourEscalation).where(eq(OfficeHourEscalation.student_id, w.students[0]));
    expect(rows.map((r) => r.level).sort()).toEqual([1, 2]);
    expect(await notes(parent, "office_hours_escalation")).toHaveLength(1);
    expect(emails.some((e) => e.subject.includes("office hours attendance"))).toBe(true);
    const l2 = rows.find((r) => r.level === 2)!;
    expect(JSON.parse(l2.notified_user_ids!)).toEqual(expect.arrayContaining([w.students[0], w.teacherA, classTeacher, parent]));

    // Saving the same register again does not escalate twice.
    await mark("2026-03-09", "ABSENT");
    expect(await db.select().from(OfficeHourEscalation).where(eq(OfficeHourEscalation.student_id, w.students[0]))).toHaveLength(2);
  });

  it("re-arms after two sessions attended in a row", async () => {
    await mark("2026-03-11", "PRESENT");
    await mark("2026-03-16", "PRESENT");
    await mark("2026-03-18", "ABSENT");
    await mark("2026-03-23", "ABSENT");
    // 7 held, 2 attended: the rate (29%) is below the watch band, so the re-armed
    // ladder fires level 2 again (RATE_BELOW) rather than level 1.
    const rows = await db.select().from(OfficeHourEscalation).where(eq(OfficeHourEscalation.student_id, w.students[0]));
    expect(rows.map((r) => [r.level, r.trigger_code])).toEqual([
      [1, "CONSECUTIVE_L1"],
      [2, "CONSECUTIVE_L2"],
      [2, "RATE_BELOW"],
    ]);
  });

  it("lists escalations by scope and lets them be acknowledged", async () => {
    const leader = await request(app).get("/office-hours/escalations").query({ term_id: w.termId }).set(auth("leader"));
    expect(leader.status).toBe(200);
    const mine = leader.body.data.filter((e: any) => e.student_id === w.students[0]);
    expect(mine.length).toBeGreaterThanOrEqual(3);
    expect(mine[0].student.first_name).toBe("Test");
    // An unrelated teacher sees none of them.
    const outsider = await request(app).get("/office-hours/escalations").query({ term_id: w.termId }).set(auth("outsider"));
    expect(outsider.body.data.filter((e: any) => e.student_id === w.students[0])).toHaveLength(0);
    const id = mine[0].escalation_id;
    expect((await request(app).post(`/office-hours/escalations/${id}/ack`).set(auth("outsider")).send({})).status).toBe(404);
    await request(app).post(`/office-hours/escalations/${id}/ack`).set(auth("leader")).send({ note: "Spoke to the student" }).expect(200);
    const open = await request(app).get("/office-hours/escalations").query({ term_id: w.termId }).set(auth("leader"));
    expect(open.body.data.some((e: any) => e.escalation_id === id)).toBe(false);
  });

  it("sends the morning roster, the leadership nudge and the weekly digests", async () => {
    pinClock("2026-03-25", "06:35");
    await sessionOn("2026-03-25");
    expect(await morningDigest()).toBeGreaterThanOrEqual(1);
    const [digest] = await notes(w.teacherA, "office_hours_digest");
    expect(digest.body).toMatch(/16:20 .* · 2 students · B4/);

    pinClock("2026-03-25", "18:00");
    const wed = await sessionOn("2026-03-25");
    expect((await request(app).post("/office-hours/admin/unmarked/nudge").set(auth("teacherA")).send({ session_ids: [wed.session_id] })).status).toBe(403);
    const nudged = await request(app).post("/office-hours/admin/unmarked/nudge").set(auth("leader")).send({ session_ids: [wed.session_id] });
    expect(nudged.body.data.notified).toBe(1);

    pinClock("2026-03-27", "17:40"); // Friday
    const r = await weeklyDigests();
    expect(r.teachers).toBeGreaterThanOrEqual(1);
    expect(r.leaders).toBeGreaterThanOrEqual(1);
    const leaderDigest = (await notes(w.leader, "office_hours_digest"))[0];
    expect(leaderDigest.body).toMatch(/sessions held with a register/);
  });

  it("keeps every office-hours notice in its own kinds", async () => {
    const all = await db.select().from(Notification).where(inArray(Notification.user_id, [w.students[0], w.teacherA]));
    expect(all.filter((n) => n.kind.startsWith("office_hours_")).length).toBeGreaterThan(5);
    void signToken;
    void assignRole;
    void createRoleWithPermissions;
  });
});
