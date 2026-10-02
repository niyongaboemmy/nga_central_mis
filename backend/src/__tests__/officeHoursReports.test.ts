import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { OfficeHourSession, OfficeHourAttendance } from "../db/officeHoursSchema";
import { AccessRolePermission } from "../db/accessSchema";
import { Permission } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, createUserGradeAssignment, signToken } from "../test/fixtures";
import { createOfficeHoursWorld, OhWorld, OH_MONDAY, pinClock, resetSettings } from "../test/officeHoursFixtures";
import { setOfficeHoursClock } from "../services/officeHours/common";
import { ensureSessions } from "../services/officeHours/sessions";
import { flushOfficeHoursEvents } from "../services/officeHours/events";
import { resolvePeriod } from "../services/officeHours/period";
import { clearHomeCache } from "../services/home/buildHomeOverview";

// Office hours Phase 5: periods, the report engine and its scoping, the 360s,
// coverage, overview and Home tiles (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §14).
describe("Office hours phase 5: reports", () => {
  let w: OhWorld;
  let schedA: number;
  let schedB: number;
  let classTeacherToken: string;
  let summaryToken: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const tok = (who: string) => auth(w.tokens[who]);

  const register = async (scheduleId: number, ymd: string, marks: Record<number, string>, who: string) => {
    pinClock(ymd, "16:40");
    await ensureSessions(scheduleId);
    const [s] = await db.select().from(OfficeHourSession).where(and(eq(OfficeHourSession.schedule_id, scheduleId), eq(OfficeHourSession.session_date, ymd)));
    const res = await request(app)
      .put(`/office-hours/sessions/${s.session_id}/register`)
      .set(tok(who))
      .send({ records: Object.entries(marks).map(([id, status]) => ({ student_id: Number(id), status })) });
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    await resetSettings();
    pinClock(OH_MONDAY, "09:00");
    w = await createOfficeHoursWorld(4);
    const [s0, s1, s2, s3] = w.students;
    // Teacher A: Mon/Wed with s0, s1. Teacher B: Tue with s2, s3 (TERM lock keeps them apart).
    schedA = (await request(app).post("/office-hours/schedules").set(tok("teacherA")).send({ academic_term_id: w.termId, days: [1, 3], subject_id: w.subjectA, effective_to: "2026-04-30" })).body.data.schedule.schedule_id;
    schedB = (await request(app).post("/office-hours/schedules").set(tok("teacherB")).send({ academic_term_id: w.termId, days: [2], subject_id: w.subjectB, effective_to: "2026-04-30" })).body.data.schedule.schedule_id;
    await request(app).post(`/office-hours/schedules/${schedA}/assignments`).set(tok("teacherA")).send({ student_ids: [s0, s1] });
    await request(app).post(`/office-hours/schedules/${schedB}/assignments`).set(tok("teacherB")).send({ student_ids: [s2, s3] });
    // Week 1 (2-6 March): A on Mon + Wed, B on Tue.
    await register(schedA, "2026-03-02", { [s0]: "PRESENT", [s1]: "ABSENT" }, "teacherA");
    await register(schedB, "2026-03-03", { [s2]: "PRESENT", [s3]: "LATE" }, "teacherB");
    await register(schedA, "2026-03-04", { [s0]: "PRESENT", [s1]: "ABSENT" }, "teacherA");
    // Week 2: A Monday held, B Tuesday cancelled, A Wednesday left unmarked.
    await register(schedA, "2026-03-09", { [s0]: "LATE", [s1]: "EXCUSED" }, "teacherA");
    pinClock("2026-03-09", "18:00");
    await ensureSessions(schedB);
    const [tue] = await db.select().from(OfficeHourSession).where(and(eq(OfficeHourSession.schedule_id, schedB), eq(OfficeHourSession.session_date, "2026-03-10")));
    await request(app).post(`/office-hours/sessions/${tue.session_id}/cancel`).set(tok("teacherB")).send({ reason: "TEACHER_ABSENT" }).expect(200);
    await flushOfficeHoursEvents();

    const ct = await createUser({ userType: "TEACHER" });
    const ctRole = await createRoleWithPermissions("OH_REPORT_CT", ["OFFICE_HOURS_VIEW", "OFFICE_HOURS_MANAGE_OWN"]);
    await assignRole(ct, ctRole);
    await createUserGradeAssignment({ userId: ct, gradeId: w.gradeId, classGroupId: w.classGroupId, academicYearId: w.yearId });
    classTeacherToken = signToken(ct);

    // An aggregates-only viewer (VIEW at summary depth, nothing else).
    const viewer = await createUser({ userType: "ADMIN" });
    const viewerRole = await createRoleWithPermissions("OH_SUMMARY_VIEW", ["OFFICE_HOURS_VIEW"]);
    const [perm] = await db.select().from(Permission).where(eq(Permission.name, "OFFICE_HOURS_VIEW")).limit(1);
    await db.update(AccessRolePermission).set({ depth: "summary" }).where(and(eq(AccessRolePermission.role_id, viewerRole), eq(AccessRolePermission.perm_id, perm.perm_id)));
    await assignRole(viewer, viewerRole);
    summaryToken = signToken(viewer);
    pinClock("2026-03-13", "09:00");
  });
  afterAll(async () => {
    setOfficeHoursClock(null);
    await resetSettings();
  });

  it("resolves day, week, month, term and custom periods in Kigali dates", async () => {
    const week = await resolvePeriod({ period: "week", anchor: "2026-03-04" });
    expect([week.from, week.to, week.previous?.from]).toEqual(["2026-03-02", "2026-03-06", "2026-02-23"]);
    const day = await resolvePeriod({ period: "day", anchor: "2026-03-02" });
    expect(day.previous?.from).toBe("2026-02-27"); // Monday compares with Friday
    const month = await resolvePeriod({ period: "month", anchor: "2026-02-10" });
    expect([month.from, month.to, month.label]).toEqual(["2026-02-01", "2026-02-28", "February 2026"]);
    const term = await resolvePeriod({ period: "term", term_id: w.termId });
    expect([term.from, term.to, term.bucket]).toEqual(["2026-01-05", "2026-06-26", "week"]);
    await expect(resolvePeriod({ period: "custom", from: "2026-01-01", to: "2027-06-01" })).rejects.toThrow(/400 days/);
  });

  it("reconciles the term summary with the session rows", async () => {
    const res = await request(app).get("/office-hours/reports/summary").query({ period: "custom", from: "2026-03-02", to: "2026-03-11", term_id: w.termId }).set(tok("leader"));
    expect(res.status).toBe(200);
    const k = res.body.data.kpis;
    // Sessions: A 2,4,9,11 (11 unmarked) + B 3 held, 10 cancelled.
    expect(k).toMatchObject({ planned: 5, held: 4, unmarked: 1, cancelled: 1, delivery_rate: 80 });
    // Marks: s0 P,P,L · s1 A,A,E · s2 P · s3 L -> 8 expected, 6 attended.
    expect(k).toMatchObject({ expected_attendances: 8, present: 3, late: 2, absent: 2, excused: 1, attendance_rate: 75, presence_rate: 62.5 });
    expect(k.bands).toMatchObject({ CONSISTENT: 1, CHRONIC: 1, TOO_FEW: 2 });
    expect(res.body.data.series.map((s: any) => s.key)).toEqual(["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-09", "2026-03-10", "2026-03-11"]);
    expect(res.body.data.utilisation).toMatchObject({ assigned: 4 });
  });

  it("breaks down by teacher, weekday and class group", async () => {
    const q = { period: "custom", from: "2026-03-02", to: "2026-03-11", term_id: w.termId };
    const byTeacher = await request(app).get("/office-hours/reports/breakdown").query({ ...q, group_by: "teacher" }).set(tok("leader"));
    const rows = Object.fromEntries(byTeacher.body.data.rows.map((r: any) => [r.key, r]));
    expect(rows[`t${w.teacherA}`]).toMatchObject({ planned: 4, held: 3, unmarked: 1, expected_attendances: 6, students: 2 });
    expect(rows[`t${w.teacherB}`]).toMatchObject({ planned: 1, held: 1, cancelled: 1, attendance_rate: 100 });
    const byDay = await request(app).get("/office-hours/reports/breakdown").query({ ...q, group_by: "weekday" }).set(tok("leader"));
    expect(byDay.body.data.rows.map((r: any) => r.label).sort()).toEqual(["Mon", "Tue", "Wed"]);
    const byClass = await request(app).get("/office-hours/reports/breakdown").query({ ...q, group_by: "class_group" }).set(tok("leader"));
    expect(byClass.body.data.rows).toHaveLength(1);
    expect(byClass.body.data.rows[0]).toMatchObject({ expected_attendances: 8, students: 4 });
    expect((await request(app).get("/office-hours/reports/breakdown").query({ ...q, group_by: "colour" }).set(tok("leader"))).status).toBe(400);
  });

  it("lists who is consistent and who is chronic", async () => {
    const res = await request(app).get("/office-hours/reports/consistency").query({ period: "custom", from: "2026-03-02", to: "2026-03-11", term_id: w.termId }).set(tok("leader"));
    expect(res.body.data.consistent.map((r: any) => r.student_id)).toEqual([w.students[0]]);
    expect(res.body.data.chronic.map((r: any) => r.student_id)).toEqual([w.students[1]]);
    expect(res.body.data.chronic[0]).toMatchObject({ rate: 33.3, absent: 2, excused: 1 });
    expect(res.body.data.chronic[0].office_hours[0]).toMatch(/support/);
  });

  it("scopes every report to the viewer", async () => {
    const q = { period: "custom", from: "2026-03-02", to: "2026-03-11", term_id: w.termId };
    const a = await request(app).get("/office-hours/reports/summary").query(q).set(tok("teacherA"));
    expect(a.body.data.scope).toBe("own");
    expect(a.body.data.kpis).toMatchObject({ planned: 4, expected_attendances: 6 });
    const outsider = await request(app).get("/office-hours/reports/summary").query(q).set(tok("outsider"));
    expect(outsider.body.data.kpis).toMatchObject({ planned: 0, expected_attendances: 0 });
    const ct = await request(app).get("/office-hours/reports/summary").query(q).set(auth(classTeacherToken));
    expect(ct.body.data.scope).toBe("classGroups");
    expect(ct.body.data.kpis.expected_attendances).toBe(8);
    // Aggregates-only viewers get totals but never names.
    expect((await request(app).get("/office-hours/reports/summary").query(q).set(auth(summaryToken))).status).toBe(200);
    expect((await request(app).get("/office-hours/reports/consistency").query(q).set(auth(summaryToken))).status).toBe(403);
    expect((await request(app).get("/office-hours/reports/daily").query({ date: "2026-03-02" }).set(auth(summaryToken))).status).toBe(403);
    // Students have no report access.
    expect((await request(app).get("/office-hours/reports/summary").query(q).set(tok("s0"))).status).toBe(403);
  });

  it("serves the student and teacher 360s to the right people", async () => {
    const me = await request(app).get(`/office-hours/reports/students/${w.students[1]}`).query({ period: "term", term_id: w.termId }).set(tok("s1"));
    expect(me.status).toBe(200);
    expect(me.body.data.stats).toMatchObject({ expected: 3, absent: 2 });
    expect(me.body.data.escalations).toEqual([]);
    expect((await request(app).get(`/office-hours/reports/students/${w.students[1]}`).set(tok("s0"))).status).toBe(403);
    const staff = await request(app).get(`/office-hours/reports/students/${w.students[1]}`).query({ period: "term", term_id: w.termId }).set(tok("teacherA"));
    expect(staff.status).toBe(200);
    expect(staff.body.data.timeline.length).toBeGreaterThanOrEqual(3);

    const t = await request(app).get(`/office-hours/reports/teachers/${w.teacherA}`).query({ period: "custom", from: "2026-03-02", to: "2026-03-11", term_id: w.termId }).set(tok("teacherA"));
    expect(t.body.data).toMatchObject({ planned: 4, held: 3, unmarked: 1, on_time_registers: 100, average_roster: 2 });
    expect((await request(app).get(`/office-hours/reports/teachers/${w.teacherA}`).set(tok("teacherB"))).status).toBe(403);
    expect((await request(app).get(`/office-hours/reports/teachers/${w.teacherA}`).set(tok("leader"))).status).toBe(200);
  });

  it("prints a daily sheet and shows coverage and today's overview", async () => {
    const sheet = await request(app).get("/office-hours/reports/daily").query({ date: "2026-03-02", term_id: w.termId }).set(tok("leader"));
    expect(sheet.body.data.sessions).toHaveLength(1);
    expect(sheet.body.data.sessions[0].roster.map((r: any) => r.status).sort()).toEqual(["ABSENT", "PRESENT"]);

    const cov = await request(app).get("/office-hours/admin/coverage").query({ term_id: w.termId, class_group_id: w.classGroupId }).set(tok("leader"));
    const mine = cov.body.data.class_groups.find((g: any) => g.class_group_id === w.classGroupId);
    expect(mine).toMatchObject({ students: 4, covered: 4, coverage_rate: 100 });
    expect(mine.days).toMatchObject({ 1: 2, 2: 2, 3: 2 });
    expect(cov.body.data.students_without).toEqual([]);
    const other = cov.body.data.class_groups.find((g: any) => g.class_group_id === w.otherClassGroupId);
    expect(other).toMatchObject({ students: 2, covered: 0 });
    expect((await request(app).get("/office-hours/admin/coverage").query({ term_id: w.termId }).set(tok("teacherA"))).status).toBe(403);

    pinClock("2026-03-16", "17:30");
    await ensureSessions(schedA);
    const ov = await request(app).get("/office-hours/admin/overview").query({ term_id: w.termId }).set(tok("leader"));
    expect(ov.body.data.today).toMatchObject({ sessions: 1, expected: 2, marked: 0, missing: 1 });
  });

  it("shows office hours on Home for the student and the teacher", async () => {
    pinClock("2026-03-16", "09:00");
    clearHomeCache();
    const student = await request(app).get("/home/overview").query({ refresh: 1 }).set(tok("s1"));
    expect(student.status).toBe(200);
    const tile = student.body.data?.tiles?.find?.((t: any) => t.id === "mis:office-hours:next") ?? student.body.tiles?.find?.((t: any) => t.id === "mis:office-hours:next");
    expect(tile).toBeTruthy();
    const teacher = await request(app).get("/home/overview").query({ refresh: 1 }).set(tok("teacherA"));
    const items = teacher.body.data?.items ?? teacher.body.items ?? [];
    expect(items.some((i: any) => i.kind === "OH-T1")).toBe(true);
    void OfficeHourAttendance;
  });
});
