import { and, eq, gte, inArray, lte, sql, isNotNull, ne } from "drizzle-orm";
import { db } from "../../db";
import {
  OfficeHourAssignment,
  OfficeHourAttendance,
  OfficeHourSchedule,
  OfficeHourScheduleDay,
  OfficeHourSession,
  SchoolClosure,
} from "../../db/officeHoursSchema";
import { NotFoundError, ValidationError, ConflictError } from "../../errors/CustomError";
import { addDaysYmd, parseClock } from "../reminders/time";
import { Actor, assertCanManage } from "./access";
import { datesOnDays, loadTerm, maxYmd, minYmd, now, nowMinutes, todayYmd, TermInfo } from "./common";
import { emitOfficeHoursEvent } from "./events";

/**
 * Dated sessions (plan §5.6). The weekly pattern is a plan; a session row is
 * the fact attendance, cancellations and substitutes attach to. Sessions are
 * materialised from the schedule's first date up to today + HORIZON_DAYS (so
 * a server outage never leaves a gap), by the sweep, on every schedule change
 * and lazily on read.
 */
export const HORIZON_DAYS = 14;
export const CANCEL_REASONS = ["TEACHER_ABSENT", "CLOSURE", "SCHEDULE_CHANGED", "SCHEDULE_ENDED", "EVENT", "MOVED", "OTHER"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

type Schedule = typeof OfficeHourSchedule.$inferSelect;
type Session = typeof OfficeHourSession.$inferSelect;

export const scheduleDays = async (scheduleIds: number[]): Promise<Map<number, number[]>> => {
  const out = new Map<number, number[]>();
  if (!scheduleIds.length) return out;
  const rows = await db.select().from(OfficeHourScheduleDay).where(inArray(OfficeHourScheduleDay.schedule_id, scheduleIds));
  for (const r of rows) out.set(r.schedule_id, [...(out.get(r.schedule_id) ?? []), r.day_of_week].sort());
  return out;
};

/** Kigali dates closed for office hours between from and to (inclusive). */
export const closedDatesBetween = async (fromYmd: string, toYmd: string): Promise<Set<string>> => {
  const rows = await db
    .select()
    .from(SchoolClosure)
    .where(and(lte(SchoolClosure.start_date, toYmd), gte(SchoolClosure.end_date, fromYmd)));
  const out = new Set<string>();
  for (const r of rows) {
    let cursor = maxYmd(r.start_date, fromYmd);
    const last = minYmd(r.end_date, toYmd);
    for (let guard = 0; guard < 800 && cursor <= last; guard++) {
      out.add(cursor);
      cursor = addDaysYmd(cursor, 1);
    }
  }
  return out;
};

/** The dates a schedule meets inside [fromYmd, toYmd], bounded by its window and term, minus closures. */
export const meetingDates = (
  schedule: Pick<Schedule, "effective_from" | "effective_to">,
  days: number[],
  term: Pick<TermInfo, "startYmd" | "endYmd">,
  closed: Set<string>,
  fromYmd: string,
  toYmd: string,
): string[] => {
  const from = maxYmd(fromYmd, schedule.effective_from, term.startYmd);
  const to = minYmd(toYmd, schedule.effective_to, term.endYmd);
  if (from > to) return [];
  return datesOnDays(from, to, days).filter((d) => !closed.has(d));
};

/** The first meeting date on or after `fromYmd`, or null when none remains. */
export const nextMeetingDate = async (schedule: Schedule, days: number[], fromYmd: string): Promise<string | null> => {
  const term = await loadTerm(schedule.academic_term_id);
  const to = minYmd(schedule.effective_to, term.endYmd);
  if (fromYmd > to) return null;
  const closed = await closedDatesBetween(fromYmd, to);
  return meetingDates(schedule, days, term, closed, fromYmd, to)[0] ?? null;
};

/** Insert any missing sessions for an ACTIVE schedule up to `uptoYmd` (default today + horizon). */
export const ensureSessions = async (scheduleId: number, uptoYmd?: string): Promise<number> => {
  const [schedule] = await db.select().from(OfficeHourSchedule).where(eq(OfficeHourSchedule.schedule_id, scheduleId)).limit(1);
  if (!schedule || schedule.status !== "ACTIVE") return 0;
  const days = (await scheduleDays([scheduleId])).get(scheduleId) ?? [];
  if (!days.length) return 0;
  const term = await loadTerm(schedule.academic_term_id);
  const upto = uptoYmd ?? addDaysYmd(todayYmd(), HORIZON_DAYS);
  const from = maxYmd(schedule.effective_from, term.startYmd);
  const to = minYmd(upto, schedule.effective_to, term.endYmd);
  if (from > to) return 0;
  const closed = await closedDatesBetween(from, to);
  const dates = meetingDates(schedule, days, term, closed, from, to);
  if (!dates.length) return 0;

  const existing = await db
    .select({ d: OfficeHourSession.session_date })
    .from(OfficeHourSession)
    .where(and(eq(OfficeHourSession.schedule_id, scheduleId), inArray(OfficeHourSession.session_date, dates)));
  const have = new Set(existing.map((e) => e.d));
  const missing = dates.filter((d) => !have.has(d));
  if (!missing.length) return 0;
  await db
    .insert(OfficeHourSession)
    .values(
      missing.map((d) => ({
        schedule_id: scheduleId,
        academic_term_id: schedule.academic_term_id,
        session_date: d,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        host_teacher_id: schedule.teacher_id,
        location: schedule.location,
      })),
    )
    // A concurrent sweep may have inserted the same date: keep the existing row.
    .onDuplicateKeyUpdate({ set: { schedule_id: sql`schedule_id` } });
  return missing.length;
};

/** Materialise every ACTIVE schedule (the sweep). */
export const ensureAllSessions = async (uptoYmd?: string): Promise<number> => {
  const rows = await db.select({ id: OfficeHourSchedule.schedule_id }).from(OfficeHourSchedule).where(eq(OfficeHourSchedule.status, "ACTIVE"));
  let created = 0;
  for (const r of rows) created += await ensureSessions(r.id, uptoYmd);
  return created;
};

/** Has any student on this session been marked? */
const markedSessionIds = async (sessionIds: number[]): Promise<Set<number>> => {
  if (!sessionIds.length) return new Set();
  const rows = await db
    .selectDistinct({ id: OfficeHourAttendance.session_id })
    .from(OfficeHourAttendance)
    .where(and(inArray(OfficeHourAttendance.session_id, sessionIds), isNotNull(OfficeHourAttendance.status)));
  return new Set(rows.map((r) => r.id));
};

/**
 * Bring future sessions back in line with the schedule after an edit or a
 * closure change: dates that no longer match are deleted (never marked) or
 * cancelled (SCHEDULE_CHANGED); closure-cancelled dates that are open again
 * are restored; times and room follow the schedule; missing dates are added.
 */
export const rematerialiseSchedule = async (scheduleId: number, actorId: number | null) => {
  const [schedule] = await db.select().from(OfficeHourSchedule).where(eq(OfficeHourSchedule.schedule_id, scheduleId)).limit(1);
  if (!schedule) return { deleted: 0, cancelled: [] as number[], restored: [] as number[] };
  const today = todayYmd();
  const days = (await scheduleDays([scheduleId])).get(scheduleId) ?? [];
  const term = await loadTerm(schedule.academic_term_id);
  const horizon = addDaysYmd(today, HORIZON_DAYS);
  const future = await db
    .select()
    .from(OfficeHourSession)
    .where(and(eq(OfficeHourSession.schedule_id, scheduleId), gte(OfficeHourSession.session_date, today)));
  const lastFuture = future.reduce((m, s) => (s.session_date > m ? s.session_date : m), horizon);
  const closed = await closedDatesBetween(today, lastFuture);
  const valid = new Set(
    schedule.status === "ACTIVE" ? meetingDates(schedule, days, term, closed, today, lastFuture) : [],
  );
  const startedToday = (s: Session) => s.session_date === today && (parseClock(s.start_time) ?? 0) <= nowMinutes();

  // One-off moved sessions are not part of the weekly pattern: leave them alone.
  const stale = future.filter((s) => s.status === "SCHEDULED" && !s.moved_from_session_id && !valid.has(s.session_date) && !startedToday(s));
  const marked = await markedSessionIds(stale.map((s) => s.session_id));
  const toDelete = stale.filter((s) => !marked.has(s.session_id)).map((s) => s.session_id);
  const toCancel = stale.filter((s) => marked.has(s.session_id)).map((s) => s.session_id);
  if (toDelete.length) await db.delete(OfficeHourSession).where(inArray(OfficeHourSession.session_id, toDelete));
  if (toCancel.length) {
    await db
      .update(OfficeHourSession)
      .set({ status: "CANCELLED", cancel_reason: "SCHEDULE_CHANGED", cancelled_by: actorId, cancelled_at: now() })
      .where(inArray(OfficeHourSession.session_id, toCancel));
  }

  const restore = future
    .filter((s) => s.status === "CANCELLED" && s.cancel_reason === "CLOSURE" && valid.has(s.session_date))
    .map((s) => s.session_id);
  if (restore.length) {
    await db
      .update(OfficeHourSession)
      .set({ status: "SCHEDULED", cancel_reason: null, cancel_note: null, cancelled_by: null, cancelled_at: null })
      .where(inArray(OfficeHourSession.session_id, restore));
  }

  // Times and room follow the schedule for sessions that have not started.
  const follow = future
    .filter((s) => s.status === "SCHEDULED" && !s.moved_from_session_id && valid.has(s.session_date) && !startedToday(s))
    .filter((s) => s.start_time !== schedule.start_time || s.end_time !== schedule.end_time || s.location !== schedule.location)
    .map((s) => s.session_id);
  if (follow.length) {
    await db
      .update(OfficeHourSession)
      .set({ start_time: schedule.start_time, end_time: schedule.end_time, location: schedule.location })
      .where(inArray(OfficeHourSession.session_id, follow));
  }
  await ensureSessions(scheduleId);
  // Deleted sessions were never marked; the schedule-change notice covers them.
  return { deleted: toDelete.length, cancelled: toCancel, restored: restore };
};

export const loadSession = async (sessionId: number) => {
  const [row] = await db
    .select({ session: OfficeHourSession, schedule: OfficeHourSchedule })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(eq(OfficeHourSession.session_id, sessionId))
    .limit(1);
  if (!row) throw new NotFoundError("Session not found");
  return row;
};

/** Derived state used everywhere: a SCHEDULED session whose end time has passed is unmarked. */
export const sessionState = (s: Pick<Session, "status" | "session_date" | "start_time" | "end_time">) => {
  if (s.status === "CANCELLED") return "cancelled" as const;
  if (s.status === "HELD") return "held" as const;
  const today = todayYmd();
  if (s.session_date < today) return "unmarked" as const;
  if (s.session_date > today) return "upcoming" as const;
  const m = nowMinutes();
  if (m >= (parseClock(s.end_time) ?? 0)) return "unmarked" as const;
  if (m >= (parseClock(s.start_time) ?? 0)) return "running" as const;
  return "upcoming" as const;
};

/** Students expected at a session: assignments whose window contains its date. */
export const expectedAssignments = async (scheduleId: number, sessionDate: string) =>
  db
    .select()
    .from(OfficeHourAssignment)
    .where(
      and(
        eq(OfficeHourAssignment.schedule_id, scheduleId),
        lte(OfficeHourAssignment.effective_from, sessionDate),
        gte(OfficeHourAssignment.effective_to, sessionDate),
      ),
    );

export const cancelSession = async (actor: Actor, sessionId: number, reason: unknown, note: unknown) => {
  if (!CANCEL_REASONS.includes(reason as CancelReason) || reason === "MOVED") {
    throw new ValidationError("Choose a reason for cancelling", [{ field: "reason", message: `One of ${CANCEL_REASONS.join(", ")}` }]);
  }
  const { session, schedule } = await loadSession(sessionId);
  assertCanManage(actor, schedule.teacher_id, [session.host_teacher_id]);
  if (session.status === "HELD") {
    throw new ConflictError("This session already has a register. Correct the register instead of cancelling.");
  }
  if (session.status === "CANCELLED") return session;
  await db
    .update(OfficeHourSession)
    .set({
      status: "CANCELLED",
      cancel_reason: reason as string,
      cancel_note: typeof note === "string" ? note.slice(0, 255) : null,
      cancelled_by: actor.userId,
      cancelled_at: now(),
      version: sql`${OfficeHourSession.version} + 1`,
    })
    .where(eq(OfficeHourSession.session_id, sessionId));
  emitOfficeHoursEvent({ type: "sessions_cancelled", sessionIds: [sessionId], actorId: actor.userId, reason: reason as string });
  return (await loadSession(sessionId)).session;
};

/** Undo a cancellation (not for closures -- remove the closure instead). */
export const restoreSession = async (actor: Actor, sessionId: number) => {
  const { session, schedule } = await loadSession(sessionId);
  assertCanManage(actor, schedule.teacher_id, [session.host_teacher_id]);
  if (session.status !== "CANCELLED") return session;
  if (session.cancel_reason === "CLOSURE") throw new ConflictError("This date is a school closure; remove the closure to restore it");
  if (schedule.status !== "ACTIVE") throw new ConflictError("This schedule has ended");
  await db
    .update(OfficeHourSession)
    .set({ status: "SCHEDULED", cancel_reason: null, cancel_note: null, cancelled_by: null, cancelled_at: null, version: sql`${OfficeHourSession.version} + 1` })
    .where(eq(OfficeHourSession.session_id, sessionId));
  emitOfficeHoursEvent({ type: "sessions_restored", sessionIds: [sessionId], actorId: actor.userId });
  return (await loadSession(sessionId)).session;
};

/** Substitute host for one date. */
export const setSessionHost = async (actor: Actor, sessionId: number, teacherId: number) => {
  const { session, schedule } = await loadSession(sessionId);
  assertCanManage(actor, schedule.teacher_id);
  if (session.status === "CANCELLED") throw new ConflictError("This session is cancelled");
  const previousHostId = session.host_teacher_id;
  if (previousHostId === teacherId) return session;
  await db
    .update(OfficeHourSession)
    .set({ host_teacher_id: teacherId, version: sql`${OfficeHourSession.version} + 1` })
    .where(eq(OfficeHourSession.session_id, sessionId));
  emitOfficeHoursEvent({ type: "host_changed", sessionId, previousHostId, actorId: actor.userId });
  return (await loadSession(sessionId)).session;
};

/** Cancel every not-yet-held session inside [from, to] for a closure. */
export const cancelForClosure = async (fromYmd: string, toYmd: string, actorId: number) => {
  const rows = await db
    .select({ id: OfficeHourSession.session_id })
    .from(OfficeHourSession)
    .where(
      and(
        gte(OfficeHourSession.session_date, fromYmd),
        lte(OfficeHourSession.session_date, toYmd),
        eq(OfficeHourSession.status, "SCHEDULED"),
      ),
    );
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await db
      .update(OfficeHourSession)
      .set({ status: "CANCELLED", cancel_reason: "CLOSURE", cancelled_by: actorId, cancelled_at: now(), version: sql`${OfficeHourSession.version} + 1` })
      .where(inArray(OfficeHourSession.session_id, ids));
    emitOfficeHoursEvent({ type: "sessions_cancelled", sessionIds: ids, actorId, reason: "CLOSURE" });
  }
  return ids;
};

/** Schedules with sessions or meeting dates touching [from, to] -- re-checked after a closure is removed. */
export const schedulesTouching = async (fromYmd: string, toYmd: string) => {
  const rows = await db
    .select({ id: OfficeHourSchedule.schedule_id })
    .from(OfficeHourSchedule)
    .where(
      and(
        ne(OfficeHourSchedule.status, "CANCELLED"),
        lte(OfficeHourSchedule.effective_from, toYmd),
        gte(OfficeHourSchedule.effective_to, fromYmd),
      ),
    );
  return rows.map((r) => r.id);
};
