import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { OfficeHourAttendance, OfficeHourSchedule, OfficeHourSession } from "../../db/officeHoursSchema";
import { addDaysYmd, parseClock } from "../reminders/time";
import { now, nowMinutes, todayYmd } from "./common";
import { emitOfficeHoursEvent } from "./events";
import { userNames } from "./eligibility";
import { expectedAssignments } from "./sessions";
import { getSettings } from "./settings";

/**
 * Leadership helpers (plan §11): registers nobody took, and the optional
 * auto-close that marks still-unmarked students ABSENT once the edit window
 * has passed (off by default -- unmarked stays unmarked).
 */
export const listUnmarked = async (fromYmd: string, toYmd: string) => {
  const today = todayYmd();
  const rows = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title, teacher_id: OfficeHourSchedule.teacher_id })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(and(eq(OfficeHourSession.status, "SCHEDULED"), gte(OfficeHourSession.session_date, fromYmd), lte(OfficeHourSession.session_date, toYmd <= today ? toYmd : today)))
    .orderBy(OfficeHourSession.session_date);
  const past = rows.filter((r) => r.s.session_date < today || (parseClock(r.s.end_time) ?? 0) <= nowMinutes());
  const withRoster: typeof past = [];
  const expectedCount = new Map<number, number>();
  for (const r of past) {
    const n = (await expectedAssignments(r.s.schedule_id, r.s.session_date)).length;
    if (n === 0) continue; // nobody was expected: nothing to mark
    expectedCount.set(r.s.session_id, n);
    withRoster.push(r);
  }
  const names = await userNames(withRoster.flatMap((r) => [r.s.host_teacher_id, r.teacher_id]));
  return withRoster.map((r) => ({
    session_id: r.s.session_id,
    schedule_id: r.s.schedule_id,
    session_date: r.s.session_date,
    start_time: r.s.start_time,
    end_time: r.s.end_time,
    title: r.title,
    host_teacher_id: r.s.host_teacher_id,
    host_name: names.get(r.s.host_teacher_id) ?? null,
    expected: expectedCount.get(r.s.session_id) ?? 0,
    days_overdue: Math.max(0, Math.round((Date.parse(today) - Date.parse(r.s.session_date)) / 86_400_000)),
  }));
};

/** When enabled, mark NULL rows ABSENT (source AUTO) after the edit window. Returns sessions closed. */
export const autoCloseUnmarked = async () => {
  const settings = await getSettings();
  if (!settings.auto_close_unmarked) return 0;
  const cutoff = addDaysYmd(todayYmd(), -settings.register_edit_days - 1);
  const sessions = await db
    .select({ id: OfficeHourSession.session_id, schedule: OfficeHourSession.schedule_id, date: OfficeHourSession.session_date, status: OfficeHourSession.status })
    .from(OfficeHourSession)
    .where(and(inArray(OfficeHourSession.status, ["SCHEDULED", "HELD"]), lte(OfficeHourSession.session_date, cutoff), gte(OfficeHourSession.session_date, addDaysYmd(cutoff, -30))));
  let closed = 0;
  for (const s of sessions) {
    const expected = await expectedAssignments(s.schedule, s.date);
    if (!expected.length) continue;
    await db
      .insert(OfficeHourAttendance)
      .values(expected.map((a) => ({ session_id: s.id, student_id: a.student_id, assignment_id: a.assignment_id })))
      .onDuplicateKeyUpdate({ set: { session_id: sql`session_id` } });
    const res = (await db
      .update(OfficeHourAttendance)
      .set({ status: "ABSENT", source: "AUTO", marked_at: now() })
      .where(and(eq(OfficeHourAttendance.session_id, s.id), isNull(OfficeHourAttendance.status), eq(OfficeHourAttendance.is_drop_in, 0)))) as any;
    if (Number(res?.[0]?.affectedRows ?? 0) > 0 || s.status === "SCHEDULED") {
      await db.update(OfficeHourSession).set({ status: "HELD", register_last_saved_at: now() }).where(eq(OfficeHourSession.session_id, s.id));
      emitOfficeHoursEvent({ type: "register_saved", sessionId: s.id, actorId: 0, changedStudentIds: [] });
      closed++;
    }
  }
  return closed;
};
