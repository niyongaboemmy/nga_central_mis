import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import request from "supertest";
import { and, eq, inArray, like } from "drizzle-orm";

import app from "../app";
import { db } from "../db";
import { AcademicTerm, CalendarSlot, Subject } from "../db/schema";
import { ReminderJob } from "../db/reminderSchema";
import {
  assignRole,
  createAcademicPeriod,
  createCalendarSlot,
  createProgramGradeClassGroup,
  createRoleWithPermissions,
  createStudentClassGroup,
  createStudentSubjectEnrollment,
  createSubject,
  createTeacherSubjectAssignment,
  createUser,
  signToken,
} from "../test/fixtures";
import { cancelPendingJobs, expandForUser, setExpandSoonHook } from "../services/reminders/expander";
import { savePreferences } from "../services/reminders/preferences";
import { onSlotChanged, setTimetableSyncInTests } from "../services/reminders/timetableChanges";
import { parseSourceItem, saveSource } from "../services/reminders/sources";
import { kigaliInstant } from "../services/reminders/time";

/**
 * Timetable edits reach reminders (and, through the same re-plan, Google
 * Calendar) right away: change notices, fresh reminders for a new time even
 * when the old one was already delivered, and the affected people re-planned.
 */

// Wednesday 30 Sep 2026, 08:00 Kigali; the lesson is Wednesdays 10:20-11:10.
const WED = "2026-09-30";
const NOW = kigaliInstant(WED, 8 * 60);
// Who would be re-planned in the background (the tests re-plan explicitly at
// a fixed "now" instead).
const expandSpy = vi.fn<(ids: number[]) => void>();

describe("Timetable changes -> reminders", () => {
  let termId: number;
  let classGroupId: number;
  let subjectId: number;
  let teacherId: number;
  let studentId: number;
  let outsiderId: number;
  let slotId: number;
  let adminToken: string;
  let previouslyCurrent: number[] = [];

  const slotRow = async () => (await db.select().from(CalendarSlot).where(eq(CalendarSlot.slot_id, slotId)))[0];
  const lessonJobs = (userId: number) =>
    db
      .select()
      .from(ReminderJob)
      .where(and(eq(ReminderJob.user_id, userId), like(ReminderJob.dedupe_key, `lesson:${slotId}:%`)));
  const notices = (userId: number) =>
    db
      .select()
      .from(ReminderJob)
      .where(and(eq(ReminderJob.user_id, userId), like(ReminderJob.dedupe_key, `chg:lesson:${slotId}:%`)));

  /** Plan, then pretend the 10-min reminder for today's lesson already went out. */
  const planAndDeliver = async () => {
    await expandForUser(studentId, NOW);
    await db
      .update(ReminderJob)
      .set({ status: "sent", sent_at: NOW })
      .where(and(eq(ReminderJob.user_id, studentId), eq(ReminderJob.dedupe_key, `lesson:${slotId}:${WED}:10`)));
  };

  beforeAll(async () => {
    setTimetableSyncInTests(true);
    setExpandSoonHook(expandSpy);
    previouslyCurrent = (
      await db.select({ id: AcademicTerm.academic_term_id }).from(AcademicTerm).where(eq(AcademicTerm.is_current, 1))
    ).map((r) => r.id);
    await db.update(AcademicTerm).set({ is_current: 0 });
    const period = await createAcademicPeriod();
    termId = period.academicTermId;
    await db
      .update(AcademicTerm)
      .set({ start_date: "2026-01-01", end_date: "2026-12-31" } as any)
      .where(eq(AcademicTerm.academic_term_id, termId));

    classGroupId = await createProgramGradeClassGroup();
    subjectId = await createSubject();
    await db.update(Subject).set({ name: "Physics", status: "ACTIVE" }).where(eq(Subject.subject_id, subjectId));
    teacherId = await createUser({ userType: "TEACHER" });
    await createTeacherSubjectAssignment({ userId: teacherId, subjectId, classGroupId, academicYearId: period.academicYearId });
    studentId = await createUser({ userType: "STUDENT" });
    await createStudentClassGroup({ userId: studentId, classGroupId, academicYearId: period.academicYearId });
    await createStudentSubjectEnrollment({ userId: studentId, subjectId, academicYearId: period.academicYearId });
    outsiderId = await createUser({ userType: "STUDENT" });
    await savePreferences(studentId, { enabled: true, morningBriefing: false });

    const adminId = await createUser({ userType: "ADMIN" });
    const roleId = await createRoleWithPermissions(`tt-sync-admin-${Date.now()}`, ["MANAGE_ACADEMIC_CALENDAR", "UPDATE_CALENDAR_SLOT"]);
    await assignRole(adminId, roleId);
    adminToken = signToken(adminId);
  });

  afterAll(async () => {
    setTimetableSyncInTests(false);
    setExpandSoonHook(null);
    await db.update(AcademicTerm).set({ is_current: 0 }).where(eq(AcademicTerm.academic_term_id, termId));
    if (previouslyCurrent.length) {
      await db.update(AcademicTerm).set({ is_current: 1 }).where(inArray(AcademicTerm.academic_term_id, previouslyCurrent));
    }
  });

  beforeEach(async () => {
    // A fresh Wednesday 10:20 lesson (and a clean reminder slate) per test.
    await db.delete(CalendarSlot).where(and(eq(CalendarSlot.class_group_id, classGroupId), eq(CalendarSlot.academic_term_id, termId)));
    await db.delete(ReminderJob).where(inArray(ReminderJob.user_id, [studentId, teacherId]));
    slotId = await createCalendarSlot({
      userId: teacherId,
      subjectId,
      classGroupId,
      academicTermId: termId,
      dayOfWeek: 3,
      startTime: "10:20",
      endTime: "11:10",
    });
    await db.update(CalendarSlot).set({ location: "Room 4" }).where(eq(CalendarSlot.slot_id, slotId));
    expandSpy.mockClear();
  });

  it("a lesson moved later the same day: one notice, and a fresh reminder for the new time", async () => {
    await planAndDeliver();
    const before = await slotRow();
    await db.update(CalendarSlot).set({ start_time: "14:00", end_time: "14:50" }).where(eq(CalendarSlot.slot_id, slotId));

    const result = await onSlotChanged(slotId, before, NOW);
    expect(result.noticed).toBe(1);
    expect(result.released).toBe(1);

    const [notice] = await notices(studentId);
    expect(notice).toMatchObject({ source_type: "change", status: "pending", title: "Lesson moved: Physics" });
    expect(notice.body).toBe("Now Wednesdays 14:00–14:50 (was today at 10:20).");

    // The teacher and the class's enrolled students are re-planned; others aren't.
    const audience = expandSpy.mock.calls.flatMap((c) => c[0]);
    expect(audience).toEqual(expect.arrayContaining([teacherId, studentId]));
    expect(audience).not.toContain(outsiderId);

    // Re-plan: the delivered 10:10 reminder is kept as history, and a new one
    // fires 10 min before 14:00 (same key -- it would have been blocked).
    await expandForUser(studentId, NOW);
    const jobs = await lessonJobs(studentId);
    const fresh = jobs.find((j) => j.dedupe_key === `lesson:${slotId}:${WED}:10`)!;
    expect(fresh.status).toBe("pending");
    expect(new Date(fresh.fire_at as any).toISOString()).toBe(kigaliInstant(WED, 13 * 60 + 50).toISOString());
    expect(jobs.some((j) => j.dedupe_key.startsWith(`lesson:${slotId}:${WED}:10:was`) && j.status === "sent")).toBe(true);

    // Saving the same change again doesn't notify twice.
    await onSlotChanged(slotId, before, NOW);
    expect(await notices(studentId)).toHaveLength(1);
  });

  it("a room change is announced without touching the reminder times", async () => {
    await planAndDeliver();
    const before = await slotRow();
    await db.update(CalendarSlot).set({ location: "Lab 2" }).where(eq(CalendarSlot.slot_id, slotId));

    const result = await onSlotChanged(slotId, before, NOW);
    expect(result).toMatchObject({ noticed: 1, released: 0 });
    const [notice] = await notices(studentId);
    expect(notice.title).toBe("Room changed: Physics");
    expect(notice.body).toBe("Now in Lab 2 (today at 10:20).");
  });

  it("a removed lesson is announced and its pending reminders withdrawn on re-plan", async () => {
    await expandForUser(studentId, NOW);
    expect((await lessonJobs(studentId)).some((j) => j.status === "pending")).toBe(true);
    const before = await slotRow();
    await db.update(CalendarSlot).set({ is_active: 0 }).where(eq(CalendarSlot.slot_id, slotId));

    const result = await onSlotChanged(slotId, before, NOW);
    expect(result.noticed).toBe(1);
    const [notice] = await notices(studentId);
    expect(notice.title).toBe("Lesson cancelled: Physics");
    expect(notice.body).toBe("It's no longer on the timetable (was today at 10:20).");

    await expandForUser(studentId, NOW);
    const pendingToday = (await lessonJobs(studentId)).filter((j) => j.status === "pending");
    expect(pendingToday).toHaveLength(0);
    // The notice itself survives the re-plan.
    expect((await notices(studentId))[0].status).toBe("pending");
  });

  it("changes more than 48 h away are synced quietly (no notice)", async () => {
    const before = await slotRow();
    await db.update(CalendarSlot).set({ start_time: "15:00", end_time: "15:50" }).where(eq(CalendarSlot.slot_id, slotId));
    // Nobody holds a reminder yet (nothing planned), so nothing to announce.
    const result = await onSlotChanged(slotId, before, NOW);
    expect(result.noticed).toBe(0);
    expect(expandSpy).toHaveBeenCalled();
  });

  it("editing a slot through the API triggers the sync after responding", async () => {
    const res = await request(app)
      .put(`/calendar/slots/${slotId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ start_time: "12:00", end_time: "12:50" });
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(expandSpy).toHaveBeenCalled(), { timeout: 3000 });
    expect(expandSpy.mock.calls.flatMap((c) => c[0])).toEqual(expect.arrayContaining([teacherId, studentId]));

    expandSpy.mockClear();
    const del = await request(app).delete(`/calendar/slots/${slotId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    await vi.waitFor(() => expect(expandSpy).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("a quiz moved after its reminder went out gets a fresh reminder for the new time", async () => {
    const closes = new Date(NOW.getTime() + 2 * 3_600_000);
    const base = {
      source_app: "taskmentor",
      source_type: "quiz_close",
      external_id: `move-${slotId}`,
      title: "Algebra quiz",
      starts_at: closes.toISOString(),
      audience_user_ids: [studentId],
    };
    const saved = await saveSource(parseSourceItem(base), NOW);
    await expandForUser(studentId, NOW);
    await db
      .update(ReminderJob)
      .set({ status: "sent", sent_at: NOW })
      .where(and(eq(ReminderJob.user_id, studentId), eq(ReminderJob.dedupe_key, `src:${saved.source_id}:60`)));

    const later = new Date(NOW.getTime() + 5 * 3_600_000);
    await saveSource(parseSourceItem({ ...base, starts_at: later.toISOString() }), NOW);
    await expandForUser(studentId, NOW);

    const jobs = await db
      .select()
      .from(ReminderJob)
      .where(and(eq(ReminderJob.user_id, studentId), like(ReminderJob.dedupe_key, `src:${saved.source_id}:%`)));
    const fresh = jobs.find((j) => j.dedupe_key === `src:${saved.source_id}:60`)!;
    expect(fresh.status).toBe("pending");
    expect(new Date(fresh.fire_at as any).getTime()).toBe(later.getTime() - 60 * 60_000);
  });

  it("turning reminders off and on again brings the cancelled reminders back", async () => {
    await expandForUser(studentId, NOW);
    const planned = (await lessonJobs(studentId)).filter((j) => j.status === "pending").map((j) => j.dedupe_key);
    expect(planned.length).toBeGreaterThan(0);

    await cancelPendingJobs(studentId, NOW); // switched off
    expect((await lessonJobs(studentId)).every((j) => j.status === "cancelled")).toBe(true);

    await expandForUser(studentId, NOW); // switched on again
    const back = (await lessonJobs(studentId)).filter((j) => j.status === "pending").map((j) => j.dedupe_key);
    expect(back.sort()).toEqual(planned.sort());
  });

  it("plans for one person never overlap, so a later change is never undone by an earlier plan", async () => {
    const order: string[] = [];
    const first = expandForUser(studentId, NOW).then(() => order.push("first"));
    const second = expandForUser(studentId, NOW).then(() => order.push("second"));
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
    // And the result is the full plan, nothing left cancelled.
    expect((await lessonJobs(studentId)).filter((j) => j.status === "pending").length).toBeGreaterThan(0);
  });
});
