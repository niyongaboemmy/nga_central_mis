import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  OfficeHourAssignment,
  OfficeHourSchedule,
  OfficeHourStudentDateLock,
  OfficeHourTransferRequest,
} from "../../db/officeHoursSchema";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "../../errors/CustomError";
import { loadClassGroupActivities } from "../../controllers/calendarController";
import { addDaysYmd, dowOfYmd, parseClock } from "../reminders/time";
import { Actor, assertCanManage, readScopeOf } from "./access";
import { datesOnDays, dayLabel, isDupEntry, isYmd, maxYmd, minYmd, now, nowMinutes, overlaps, todayYmd, withDeadlockRetry } from "./common";
import { emitOfficeHoursEvent } from "./events";
import { searchStudents, studentCards, teachableClassGroupIds, teachableStudentIds, userNames, StudentCard } from "./eligibility";
import { endDateFor, loadSchedule, Schedule } from "./schedules";
import { scheduleDays, nextMeetingDate } from "./sessions";
import { getSettings } from "./settings";
import { activeWindows, DateWindow, lockDatesFor, peakOver } from "./seats";

/**
 * Student assignments (plan §5.3) -- invitations over a date window: one
 * week, a few weeks or the rest of the term (migration 104), so a teacher can
 * invite a different group every week. The no-overlap rule is the PRIMARY KEY
 * of OfficeHourStudentDateLock (student, date): TERM mode locks every weekday
 * of the window, WEEKDAY mode its meeting days. Two teachers racing for the
 * same student can therefore only end one way, whatever the connection pool does.
 */
export const REASON_CODES = [
  "BELOW_STANDARD",
  "MISSED_WORK",
  "ASSESSMENT_RECOVERY",
  "TEACHER_REFERRAL",
  "CLASS_TEACHER_REFERRAL",
  "STUDENT_REQUEST",
  "ENRICHMENT",
  "OTHER",
] as const;
export const END_REASON_CODES = ["GOAL_MET", "TRANSFERRED", "LEFT_CLASS", "TEACHER_REQUEST", "ADMIN_OVERRIDE", "SCHEDULE_ENDED", "OTHER"] as const;

export interface Holder {
  assignment_id: number;
  schedule_id: number;
  title: string;
  teacher_id: number;
  teacher_name: string | null;
  days: number[];
  days_label: string;
  /** The holder's invitation window: a single week, or longer. */
  from: string;
  to: string;
}

/**
 * Holders of each student's locks in `window` (default: from today on), with
 * the days each holder meets and the window of their invitation.
 */
export const holdersOf = async (studentIds: number[], window?: DateWindow): Promise<Map<number, Holder[]>> => {
  const out = new Map<number, Holder[]>();
  if (!studentIds.length) return out;
  const conds = [inArray(OfficeHourStudentDateLock.student_id, studentIds), gte(OfficeHourStudentDateLock.lock_date, window?.from ?? todayYmd())];
  if (window) conds.push(lte(OfficeHourStudentDateLock.lock_date, window.to));
  const rows = await db
    .selectDistinct({
      student_id: OfficeHourStudentDateLock.student_id,
      assignment_id: OfficeHourStudentDateLock.assignment_id,
      schedule_id: OfficeHourSchedule.schedule_id,
      title: OfficeHourSchedule.title,
      teacher_id: OfficeHourSchedule.teacher_id,
      from: OfficeHourAssignment.effective_from,
      to: OfficeHourAssignment.effective_to,
    })
    .from(OfficeHourStudentDateLock)
    .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourStudentDateLock.assignment_id))
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(...conds));
  const days = await scheduleDays([...new Set(rows.map((r) => r.schedule_id))]);
  const names = await userNames(rows.map((r) => r.teacher_id));
  for (const r of rows) {
    const d = days.get(r.schedule_id) ?? [];
    const holder: Holder = {
      assignment_id: r.assignment_id,
      schedule_id: r.schedule_id,
      title: r.title,
      teacher_id: r.teacher_id,
      teacher_name: names.get(r.teacher_id) ?? null,
      days: d,
      days_label: dayLabel(d),
      from: String(r.from).slice(0, 10),
      to: String(r.to).slice(0, 10),
    };
    out.set(r.student_id, [...(out.get(r.student_id) ?? []), holder]);
  }
  return out;
};

export type Availability =
  | { status: "FREE" }
  | { status: "WITH_YOU"; assignment_id: number }
  | { status: "HELD_BY_OTHER"; holders: Holder[] };

/**
 * The window an invitation would really cover: from the first meeting on or
 * after `from` (and after today's roster cut-off) to `to`, both clamped to the
 * schedule. Null when no session is left in it (e.g. a week of closures).
 */
export const invitationWindow = async (schedule: Schedule, days: number[], from?: string | null, to?: string | null): Promise<DateWindow | null> => {
  const start = await startDateFor(schedule, days, from ?? null);
  const end = minYmd(to ?? schedule.effective_to, schedule.effective_to);
  if (!start || start > end) return null;
  return { from: start, to: end };
};

/** Can each student join `schedule` over `window` (given the lock mode)? */
export const availabilityFor = async (schedule: Schedule, studentIds: number[], window: DateWindow): Promise<Map<number, Availability>> => {
  const settings = await getSettings();
  const days = (await scheduleDays([schedule.schedule_id])).get(schedule.schedule_id) ?? [];
  const need = new Set(lockDatesFor(settings.student_lock_mode, days, window.from, window.to));
  const out = new Map<number, Availability>();
  if (!studentIds.length) return out;
  const [mine, locks, holders] = await Promise.all([
    db
      .select({ id: OfficeHourAssignment.assignment_id, student_id: OfficeHourAssignment.student_id })
      .from(OfficeHourAssignment)
      .where(
        and(
          eq(OfficeHourAssignment.schedule_id, schedule.schedule_id),
          eq(OfficeHourAssignment.status, "ACTIVE"),
          inArray(OfficeHourAssignment.student_id, studentIds),
          lte(OfficeHourAssignment.effective_from, window.to),
          gte(OfficeHourAssignment.effective_to, window.from),
        ),
      ),
    db
      .select({ student_id: OfficeHourStudentDateLock.student_id, lock_date: OfficeHourStudentDateLock.lock_date, assignment_id: OfficeHourStudentDateLock.assignment_id })
      .from(OfficeHourStudentDateLock)
      .where(
        and(
          inArray(OfficeHourStudentDateLock.student_id, studentIds),
          gte(OfficeHourStudentDateLock.lock_date, window.from),
          lte(OfficeHourStudentDateLock.lock_date, window.to),
        ),
      ),
    holdersOf(studentIds, window),
  ]);
  const mineOf = new Map(mine.map((m) => [m.student_id, m.id]));
  const blockingOf = new Map<number, Set<number>>();
  for (const l of locks) {
    if (!need.has(String(l.lock_date).slice(0, 10))) continue;
    const set = blockingOf.get(l.student_id) ?? new Set<number>();
    set.add(l.assignment_id);
    blockingOf.set(l.student_id, set);
  }
  for (const id of studentIds) {
    const own = mineOf.get(id);
    if (own) {
      out.set(id, { status: "WITH_YOU", assignment_id: own });
      continue;
    }
    const blocking = blockingOf.get(id);
    if (!blocking?.size) {
      out.set(id, { status: "FREE" });
      continue;
    }
    out.set(id, { status: "HELD_BY_OTHER", holders: (holders.get(id) ?? []).filter((h) => blocking.has(h.assignment_id)) });
  }
  return out;
};

/** Soft clash warnings (plan §5.5): class-group activities overlapping the schedule's days and time. */
const clashNotes = async (schedule: Schedule, days: number[], cards: Map<number, StudentCard>) => {
  const groups = [...new Set([...cards.values()].map((c) => c.class_group_id).filter((x): x is number => !!x))];
  const out = new Map<number, string>();
  if (!groups.length) return out;
  const activities = (await loadClassGroupActivities({ termId: schedule.academic_term_id, classGroupIds: groups })) as any[];
  const s = parseClock(schedule.start_time)!;
  const e = parseClock(schedule.end_time)!;
  for (const [studentId, card] of cards) {
    const hit = activities.find(
      (a) =>
        a.day_of_week !== null &&
        days.includes(Number(a.day_of_week)) &&
        (a.class_group_id === null || a.class_group_id === card.class_group_id) &&
        overlaps(s, e, parseClock(a.start_time) ?? 0, parseClock(a.end_time) ?? 0),
    );
    if (hit) out.set(studentId, `${hit.activity_name} on ${dayLabel([Number(hit.day_of_week)])} ${hit.start_time}-${hit.end_time}`.slice(0, 255));
  }
  return out;
};

/** When a new assignment starts: the next meeting date, honouring the same-day roster cut-off (D10). */
const startDateFor = async (schedule: Schedule, days: number[], requested: string | null) => {
  const settings = await getSettings();
  const today = todayYmd();
  let from = maxYmd(today, schedule.effective_from);
  if (from === today && days.includes(dowOfYmd(today))) {
    const cutoff = parseClock(settings.roster_cutoff_time) ?? 0;
    if (nowMinutes() >= cutoff) from = addDaysYmd(today, 1);
  }
  if (requested) from = maxYmd(from, requested);
  return nextMeetingDate(schedule, days, from);
};

export interface AssignResult {
  assigned: Array<{ student_id: number; assignment_id: number; effective_from: string; clash_note: string | null }>;
  conflicts: Array<{ student_id: number; holders: Holder[] }>;
  already_assigned: number[];
  ineligible: Array<{ student_id: number; reason: "NOT_ENROLLED" | "NOT_YOUR_STUDENT" | "OUT_OF_SCOPE" }>;
  over_capacity: number[];
  no_remaining_sessions: boolean;
}

export const assignStudents = async (
  actor: Actor,
  scheduleId: number,
  studentIds: number[],
  opts: { reasonCode?: unknown; reasonNote?: unknown; effectiveFrom?: unknown; effectiveTo?: unknown } = {},
): Promise<AssignResult> => {
  const schedule = await loadSchedule(scheduleId);
  assertCanManage(actor, schedule.teacher_id);
  if (schedule.status !== "ACTIVE" && schedule.status !== "DRAFT") throw new ConflictError("This schedule has ended");
  if (opts.reasonCode !== undefined && opts.reasonCode !== null && !(REASON_CODES as readonly string[]).includes(String(opts.reasonCode))) {
    throw new ValidationError("Unknown reason", [{ field: "reason_code", message: REASON_CODES.join(", ") }]);
  }
  if (opts.effectiveFrom !== undefined && opts.effectiveFrom !== null && !isYmd(opts.effectiveFrom)) {
    throw new ValidationError("effective_from must look like 2026-10-06");
  }
  if (opts.effectiveTo !== undefined && opts.effectiveTo !== null && !isYmd(opts.effectiveTo)) {
    throw new ValidationError("effective_to must look like 2026-10-09");
  }
  if (isYmd(opts.effectiveFrom) && isYmd(opts.effectiveTo) && opts.effectiveTo < opts.effectiveFrom) {
    throw new ValidationError("effective_to must be on or after effective_from");
  }
  const settings = await getSettings();
  const days = (await scheduleDays([scheduleId])).get(scheduleId) ?? [];
  const result: AssignResult = { assigned: [], conflicts: [], already_assigned: [], ineligible: [], over_capacity: [], no_remaining_sessions: false };

  const cards = await studentCards(studentIds, schedule.academic_year_id);
  let allowed: Set<number> | null = null;
  if (!actor.manageAny && !settings.allow_any_student) allowed = await teachableStudentIds(schedule.teacher_id, schedule.academic_year_id);
  // Leadership limited to an area (programme lead, class teacher) may only reach students there.
  let scopeGroups: Set<number> | null = null;
  if (actor.manageAny) {
    const scope = await readScopeOf(actor, schedule.academic_year_id);
    if (scope.kind === "classGroups") scopeGroups = new Set(scope.classGroupIds);
  }
  const candidates: number[] = [];
  for (const id of studentIds) {
    const card = cards.get(id);
    if (!card) result.ineligible.push({ student_id: id, reason: "NOT_ENROLLED" });
    else if (allowed && !allowed.has(id)) {
      result.ineligible.push({ student_id: id, reason: "NOT_YOUR_STUDENT" });
    } else if (scopeGroups && schedule.teacher_id !== actor.userId && !scopeGroups.has(card.class_group_id ?? 0)) {
      result.ineligible.push({ student_id: id, reason: "OUT_OF_SCOPE" });
    } else candidates.push(id);
  }
  if (!candidates.length) return result;

  const window = await invitationWindow(schedule, days, (opts.effectiveFrom as string) ?? null, (opts.effectiveTo as string) ?? null);
  if (!window) {
    result.no_remaining_sessions = true;
    return result;
  }
  const startYmd = window.from;
  const clashes = await clashNotes(schedule, days, new Map(candidates.map((id) => [id, cards.get(id)!])));
  const lockDates = lockDatesFor(settings.student_lock_mode, days, window.from, window.to);
  const meetings = datesOnDays(window.from, window.to, days);
  const created: number[] = [];

  for (const studentId of candidates) {
    try {
      const outcome = await withDeadlockRetry(() => db.transaction(async (tx) => {
        // Serialise capacity per schedule.
        await tx.execute(sql`SELECT schedule_id FROM OfficeHourSchedule WHERE schedule_id = ${scheduleId} FOR UPDATE`);
        // Capacity and "already invited" are per session date: weekly groups share the seats.
        const windows = await activeWindows(tx, scheduleId, window.from, window.to);
        if (windows.some((w) => w.student_id === studentId)) return { kind: "already" as const };
        if (peakOver(windows, meetings) >= schedule.capacity) return { kind: "full" as const };
        const [res] = (await tx.insert(OfficeHourAssignment).values({
          schedule_id: scheduleId,
          academic_term_id: schedule.academic_term_id,
          student_id: studentId,
          status: "ACTIVE",
          effective_from: startYmd,
          effective_to: window.to,
          reason_code: (opts.reasonCode as string) ?? null,
          reason_note: typeof opts.reasonNote === "string" ? opts.reasonNote.slice(0, 500) : null,
          clash_note: clashes.get(studentId) ?? null,
          assigned_by: actor.userId,
          assigned_at: now(),
        })) as any;
        const assignmentId = res.insertId as number;
        if (lockDates.length) {
          await tx.insert(OfficeHourStudentDateLock).values(
            lockDates.map((d) => ({ student_id: studentId, lock_date: d, academic_term_id: schedule.academic_term_id, assignment_id: assignmentId })),
          );
        }
        return { kind: "ok" as const, assignmentId };
      }));
      if (outcome.kind === "already") result.already_assigned.push(studentId);
      else if (outcome.kind === "full") result.over_capacity.push(studentId);
      else {
        created.push(outcome.assignmentId);
        result.assigned.push({ student_id: studentId, assignment_id: outcome.assignmentId, effective_from: startYmd, clash_note: clashes.get(studentId) ?? null });
      }
    } catch (error) {
      if (!isDupEntry(error)) throw error;
      result.conflicts.push({ student_id: studentId, holders: [] });
    }
  }
  if (result.conflicts.length) {
    const holders = await holdersOf(result.conflicts.map((c) => c.student_id), window);
    for (const c of result.conflicts) c.holders = holders.get(c.student_id) ?? [];
  }
  if (created.length && schedule.status === "ACTIVE") {
    emitOfficeHoursEvent({ type: "assigned", scheduleId, assignmentIds: created, actorId: actor.userId });
  }
  return result;
};

export const loadAssignment = async (assignmentId: number) => {
  const [row] = await db
    .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(eq(OfficeHourAssignment.assignment_id, assignmentId))
    .limit(1);
  if (!row) throw new NotFoundError("Assignment not found");
  return row;
};

/** End one assignment inside a transaction: status, window, locks. */
const endInTx = async (tx: any, assignmentId: number, endYmd: string, reason: string, note: string | null, actorId: number | null) => {
  await tx
    .update(OfficeHourAssignment)
    .set({ status: "ENDED", end_reason_code: reason, end_note: note, ended_by: actorId, ended_at: now() })
    .where(eq(OfficeHourAssignment.assignment_id, assignmentId));
  await tx
    .update(OfficeHourAssignment)
    .set({ effective_to: endYmd })
    .where(and(eq(OfficeHourAssignment.assignment_id, assignmentId), gte(OfficeHourAssignment.effective_to, addDaysYmd(endYmd, 1))));
  await tx.delete(OfficeHourStudentDateLock).where(eq(OfficeHourStudentDateLock.assignment_id, assignmentId));
  // A pending transfer of this student out of here is moot once they leave.
  await tx
    .update(OfficeHourTransferRequest)
    .set({ status: "CANCELLED", decided_at: now() })
    .where(and(eq(OfficeHourTransferRequest.from_assignment_id, assignmentId), eq(OfficeHourTransferRequest.status, "PENDING")));
};

/**
 * End an invitation. `fromYmd` ("remove from the week of ...") keeps the
 * sessions before it; an invitation that has not started yet then simply
 * never runs. Without it the student leaves from the next session on.
 */
export const endAssignment = async (actor: Actor, assignmentId: number, reasonCode: unknown, note: unknown, fromYmd?: unknown) => {
  const { a, s } = await loadAssignment(assignmentId);
  assertCanManage(actor, s.teacher_id);
  if (!(END_REASON_CODES as readonly string[]).includes(String(reasonCode)) || reasonCode === "SCHEDULE_ENDED") {
    throw new ValidationError("Choose why the student is leaving", [{ field: "end_reason_code", message: END_REASON_CODES.join(", ") }]);
  }
  if (reasonCode === "ADMIN_OVERRIDE" && !actor.manageAny) throw new AuthorizationError("Only leadership can override");
  if (fromYmd !== undefined && fromYmd !== null && !isYmd(fromYmd)) throw new ValidationError("from must look like 2026-10-12");
  if (a.status === "ENDED") return a;
  const earliest = await endDateFor(s.schedule_id);
  const endYmd = isYmd(fromYmd) ? maxYmd(earliest, addDaysYmd(fromYmd, -1)) : earliest;
  await db.transaction((tx) => endInTx(tx, assignmentId, endYmd, String(reasonCode), typeof note === "string" ? note.slice(0, 500) : null, actor.userId));
  emitOfficeHoursEvent({ type: "removed", assignmentId, actorId: actor.userId, reason: String(reasonCode) });
  return (await loadAssignment(assignmentId)).a;
};

/**
 * Leadership override (plan §5.3): end whatever blocks the student and assign
 * them to `toScheduleId`, atomically. Also used to accept a transfer request.
 */
export const moveStudent = async (
  actor: Actor,
  studentId: number,
  toScheduleId: number,
  reason: "ADMIN_OVERRIDE" | "TRANSFERRED",
  note: string | null,
) => {
  const schedule = await loadSchedule(toScheduleId);
  if (schedule.status !== "ACTIVE") throw new ConflictError("The target schedule is not active");
  const settings = await getSettings();
  const days = (await scheduleDays([toScheduleId])).get(toScheduleId) ?? [];
  const cards = await studentCards([studentId], schedule.academic_year_id);
  if (!cards.has(studentId)) throw new ValidationError("This student is not active in a class this year");
  const startYmd = await startDateFor(schedule, days, null);
  if (!startYmd) throw new ConflictError("No sessions remain in the target schedule");
  const lockDates = lockDatesFor(settings.student_lock_mode, days, startYmd, schedule.effective_to);
  const meetings = datesOnDays(startYmd, schedule.effective_to, days);

  const { assignmentId, ended } = await withDeadlockRetry(() => db.transaction(async (tx) => {
    await tx.execute(sql`SELECT schedule_id FROM OfficeHourSchedule WHERE schedule_id = ${toScheduleId} FOR UPDATE`);
    const blocking = lockDates.length
      ? await tx
          .select({ id: OfficeHourStudentDateLock.assignment_id, scheduleId: OfficeHourAssignment.schedule_id })
          .from(OfficeHourStudentDateLock)
          .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourStudentDateLock.assignment_id))
          .where(and(eq(OfficeHourStudentDateLock.student_id, studentId), inArray(OfficeHourStudentDateLock.lock_date, lockDates)))
      : [];
    const endedIds = [...new Set(blocking.map((b) => b.id))];
    if (blocking.some((b) => b.scheduleId === toScheduleId)) throw new ConflictError("The student is already in these office hours");
    for (const id of endedIds) {
      const [row] = await tx.select({ scheduleId: OfficeHourAssignment.schedule_id }).from(OfficeHourAssignment).where(eq(OfficeHourAssignment.assignment_id, id));
      const endYmd = await endDateFor(row.scheduleId);
      await endInTx(tx, id, endYmd, reason, note, actor.userId);
    }
    if (peakOver(await activeWindows(tx, toScheduleId, startYmd, schedule.effective_to), meetings) >= schedule.capacity) {
      throw new ConflictError("The target office hours are full");
    }
    const [res] = (await tx.insert(OfficeHourAssignment).values({
      schedule_id: toScheduleId,
      academic_term_id: schedule.academic_term_id,
      student_id: studentId,
      status: "ACTIVE",
      effective_from: startYmd,
      effective_to: schedule.effective_to,
      reason_code: reason === "TRANSFERRED" ? "TEACHER_REFERRAL" : "OTHER",
      reason_note: note,
      assigned_by: actor.userId,
      assigned_at: now(),
    })) as any;
    const id = res.insertId as number;
    if (lockDates.length) {
      await tx.insert(OfficeHourStudentDateLock).values(
        lockDates.map((d) => ({ student_id: studentId, lock_date: d, academic_term_id: schedule.academic_term_id, assignment_id: id })),
      );
    }
    return { assignmentId: id, ended: endedIds };
  }));
  emitOfficeHoursEvent({ type: "override", assignmentId, endedAssignmentIds: ended, actorId: actor.userId });
  return { assignment_id: assignmentId, ended_assignment_ids: ended, effective_from: startYmd };
};

export const overrideAssignment = async (actor: Actor, studentId: number, toScheduleId: number, note: unknown) => {
  if (!actor.manageAny) throw new AuthorizationError("Only leadership can override an office-hours assignment");
  const reason = typeof note === "string" ? note.trim().slice(0, 500) : "";
  if (!reason) throw new ValidationError("Give a reason for the override", [{ field: "reason", message: "Required" }]);
  const schedule = await loadSchedule(toScheduleId);
  const scope = await readScopeOf(actor, schedule.academic_year_id);
  if (scope.kind === "classGroups") {
    const card = (await studentCards([studentId], schedule.academic_year_id)).get(studentId);
    if (!card || !scope.classGroupIds.includes(card.class_group_id ?? 0)) throw new AuthorizationError("This student is outside your area");
  }
  return moveStudent(actor, studentId, toScheduleId, "ADMIN_OVERRIDE", reason);
};

/**
 * Students for the picker (plan §9.3), each with availability for `schedule`,
 * eligibility and a soft clash note. Sources: a class group, a search, or by
 * default every student the schedule's teacher teaches.
 */
export const candidatesFor = async (
  actor: Actor,
  schedule: Schedule,
  params: { classGroupId?: number | null; q?: string | null; onlyFree?: boolean; from?: string | null; to?: string | null },
) => {
  assertCanManage(actor, schedule.teacher_id);
  if ((params.from && !isYmd(params.from)) || (params.to && !isYmd(params.to))) throw new ValidationError("from/to must look like 2026-10-12");
  const settings = await getSettings();
  const yearId = schedule.academic_year_id;
  const teachable = await teachableStudentIds(schedule.teacher_id, yearId);
  const teachableGroups = await teachableClassGroupIds(schedule.teacher_id, yearId);
  const canReachAny = actor.manageAny || settings.allow_any_student === 1;
  let list: StudentCard[];
  if (params.classGroupId) {
    if (!canReachAny && !teachableGroups.includes(params.classGroupId)) {
      throw new AuthorizationError("You do not teach this class");
    }
    list = await searchStudents({ yearId, classGroupIds: [params.classGroupId], q: params.q });
  } else if (params.q && params.q.trim().length >= 2) {
    list = await searchStudents({ yearId, q: params.q, studentIds: canReachAny ? null : [...teachable], limit: 100 });
  } else {
    list = await searchStudents({ yearId, studentIds: [...teachable] });
  }
  const ids = list.map((c) => c.student_id);
  const days = (await scheduleDays([schedule.schedule_id])).get(schedule.schedule_id) ?? [];
  // The invitation window the picker is filling: one week, several, or the rest of the term.
  const window = await invitationWindow(schedule, days, params.from, params.to);
  const probe = window ?? { from: maxYmd(params.from ?? todayYmd(), schedule.effective_from), to: minYmd(params.to ?? schedule.effective_to, schedule.effective_to) };
  const meetings = window ? datesOnDays(window.from, window.to, days) : [];
  // Who came the week before: "invite last week's group again" is the common move.
  const prevFrom = addDaysYmd(probe.from, -7 - ((dowOfYmd(probe.from) + 6) % 7));
  const [avail, clashes, current, previous] = await Promise.all([
    availabilityFor(schedule, ids, probe),
    clashNotes(schedule, days, new Map(list.map((c) => [c.student_id, c]))),
    window ? activeWindows(db, schedule.schedule_id, window.from, window.to) : Promise.resolve([]),
    db
      .selectDistinct({ student_id: OfficeHourAssignment.student_id })
      .from(OfficeHourAssignment)
      .where(
        and(
          eq(OfficeHourAssignment.schedule_id, schedule.schedule_id),
          lte(OfficeHourAssignment.effective_from, addDaysYmd(prevFrom, 6)),
          gte(OfficeHourAssignment.effective_to, prevFrom),
          sql`(${OfficeHourAssignment.end_reason_code} IS NULL OR ${OfficeHourAssignment.end_reason_code} IN ('COMPLETED', 'SCHEDULE_ENDED'))`,
        ),
      ),
  ]);
  const rows = list.map((c) => ({
    ...c,
    availability: avail.get(c.student_id) ?? { status: "FREE" },
    eligible: canReachAny || teachable.has(c.student_id),
    not_your_student: !teachable.has(c.student_id),
    clash_note: clashes.get(c.student_id) ?? null,
  }));
  return {
    students: params.onlyFree ? rows.filter((r) => r.availability.status === "FREE") : rows,
    class_groups: teachableGroups,
    capacity: schedule.capacity,
    // Seats taken at the busiest session of the window.
    assigned_count: peakOver(current, meetings),
    lock_mode: settings.student_lock_mode,
    window,
    meeting_dates: meetings,
    previous_week: { from: prevFrom, student_ids: previous.map((p) => p.student_id) },
  };
};

/** Roster of a schedule: active (and optionally ended) assignments with student cards. */
export const rosterOf = async (schedule: Schedule, includeEnded = true) => {
  const rows = await db
    .select()
    .from(OfficeHourAssignment)
    .where(
      and(
        eq(OfficeHourAssignment.schedule_id, schedule.schedule_id),
        includeEnded ? sql`1=1` : eq(OfficeHourAssignment.status, "ACTIVE"),
      ),
    )
    .orderBy(OfficeHourAssignment.status, OfficeHourAssignment.assigned_at);
  const cards = await studentCards(rows.map((r) => r.student_id), schedule.academic_year_id);
  const missing = rows.filter((r) => !cards.has(r.student_id)).map((r) => r.student_id);
  const names = await userNames(missing);
  return rows.map((r) => ({
    ...r,
    student: cards.get(r.student_id) ?? { student_id: r.student_id, first_name: names.get(r.student_id) ?? null, last_name: null, registration_number: null, class_group_id: null, class_group_name: null },
  }));
};

/** A student's assignments in a term (for /me and leadership views). */
export const assignmentsOfStudent = async (studentId: number, termId: number, activeOnly = false) =>
  db
    .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(
      and(
        eq(OfficeHourAssignment.student_id, studentId),
        eq(OfficeHourAssignment.academic_term_id, termId),
        activeOnly ? eq(OfficeHourAssignment.status, "ACTIVE") : sql`1=1`,
      ),
    )
    .orderBy(OfficeHourAssignment.status, OfficeHourAssignment.effective_from);

/** Students of `studentIds` with an active assignment covering `ymd` (for coverage views). */
export const activeOn = async (termId: number, ymd: string) =>
  db
    .select({ student_id: OfficeHourAssignment.student_id, schedule_id: OfficeHourAssignment.schedule_id })
    .from(OfficeHourAssignment)
    .where(
      and(
        eq(OfficeHourAssignment.academic_term_id, termId),
        eq(OfficeHourAssignment.status, "ACTIVE"),
        lte(OfficeHourAssignment.effective_from, ymd),
        gte(OfficeHourAssignment.effective_to, ymd),
      ),
    );

