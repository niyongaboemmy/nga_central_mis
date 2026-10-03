import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  ATTENDANCE_STATUSES,
  OfficeHourAbsenceNotice,
  OfficeHourAttendance,
  OfficeHourAttendanceHistory,
  OfficeHourSession,
  OfficeHourAttendanceStatus,
} from "../../db/officeHoursSchema";
import { AuthorizationError, ConflictError, ValidationError } from "../../errors/CustomError";
import { addDaysYmd, formatClock, parseClock } from "../reminders/time";
import { Actor } from "./access";
import { now, nowMinutes, todayYmd, withDeadlockRetry } from "./common";
import { emitOfficeHoursEvent } from "./events";
import { studentCards, userNames } from "./eligibility";
import { expectedAssignments, loadSession, sessionState } from "./sessions";
import { getSettings } from "./settings";

/**
 * The register (plan §12). Opening a past or current register snapshots the
 * expected roster into attendance rows (status NULL = not marked yet), so a
 * later roster change never rewrites history. Saving is versioned, keeps a
 * history row per change, and turns the session HELD.
 */
export const EXCUSE_REASONS = ["SICK", "SCHOOL_ACTIVITY", "FAMILY", "PERMISSION", "OTHER"] as const;
export const OPEN_BEFORE_MIN = 15;

const canMark = (actor: Actor, ownerId: number, hostId: number) =>
  actor.manageAny || (actor.manageOwn && (actor.userId === ownerId || actor.userId === hostId));

/** When may this session's register be written? */
const window = async (session: typeof OfficeHourSession.$inferSelect) => {
  const settings = await getSettings();
  const today = todayYmd();
  const opensEarly = (parseClock(session.start_time) ?? 0) - OPEN_BEFORE_MIN;
  const notYet = session.session_date > today || (session.session_date === today && nowMinutes() < opensEarly);
  const lastEditDay = addDaysYmd(session.session_date, settings.register_edit_days);
  const closed = today > lastEditDay;
  return { notYet, closed, lastEditDay, opensAt: formatClock(Math.max(0, opensEarly)) };
};

/** Insert NULL rows for expected students who have none yet (past/current sessions only). */
const snapshotRoster = async (session: typeof OfficeHourSession.$inferSelect) => {
  const expected = await expectedAssignments(session.schedule_id, session.session_date);
  if (!expected.length) return;
  const have = await db
    .select({ id: OfficeHourAttendance.student_id })
    .from(OfficeHourAttendance)
    .where(eq(OfficeHourAttendance.session_id, session.session_id));
  const known = new Set(have.map((h) => h.id));
  const missing = expected.filter((a) => !known.has(a.student_id));
  if (!missing.length) return;
  await db
    .insert(OfficeHourAttendance)
    .values(missing.map((a) => ({ session_id: session.session_id, student_id: a.student_id, assignment_id: a.assignment_id })))
    .onDuplicateKeyUpdate({ set: { session_id: sql`session_id` } });
};

export const openRegister = async (actor: Actor, sessionId: number) => {
  const { session, schedule } = await loadSession(sessionId);
  const readable = canMark(actor, schedule.teacher_id, session.host_teacher_id) || actor.view;
  if (!readable) throw new AuthorizationError("You can only open registers for office hours you run");
  const w = await window(session);
  if (!w.notYet && session.status !== "CANCELLED") await snapshotRoster(session);

  const rows = await db.select().from(OfficeHourAttendance).where(eq(OfficeHourAttendance.session_id, sessionId));
  // A future register shows who is expected without freezing anything.
  const expected = w.notYet ? await expectedAssignments(session.schedule_id, session.session_date) : [];
  const studentIds = [...new Set([...rows.map((r) => r.student_id), ...expected.map((e) => e.student_id)])];
  const [cards, notices, names] = await Promise.all([
    studentCards(studentIds, schedule.academic_year_id),
    studentIds.length
      ? db.select().from(OfficeHourAbsenceNotice).where(and(eq(OfficeHourAbsenceNotice.session_id, sessionId), inArray(OfficeHourAbsenceNotice.student_id, studentIds)))
      : Promise.resolve([] as Array<typeof OfficeHourAbsenceNotice.$inferSelect>),
    userNames([session.register_saved_by ?? 0, session.host_teacher_id, ...studentIds]),
  ]);
  const noticeBy = new Map(notices.map((n) => [n.student_id, n]));
  const base = rows.length ? rows : expected.map((e) => ({ session_id: sessionId, student_id: e.student_id, assignment_id: e.assignment_id, is_drop_in: 0, status: null, excuse_reason: null, arrived_at: null, note: null, outcome: null, follow_up: 0, source: "TEACHER" as const, marked_by: null, marked_at: null }));
  const roster = base
    .map((r) => {
      const card = cards.get(r.student_id);
      return {
        student_id: r.student_id,
        assignment_id: r.assignment_id,
        is_drop_in: r.is_drop_in === 1,
        status: r.status,
        excuse_reason: r.excuse_reason,
        arrived_at: r.arrived_at,
        note: r.note,
        outcome: r.outcome,
        follow_up: r.follow_up === 1,
        source: r.source,
        marked_at: r.marked_at,
        first_name: card?.first_name ?? names.get(r.student_id) ?? null,
        last_name: card?.last_name ?? null,
        registration_number: card?.registration_number ?? null,
        class_group_name: card?.class_group_name ?? null,
        notice: noticeBy.get(r.student_id) ? { reason: noticeBy.get(r.student_id)!.reason, note: noticeBy.get(r.student_id)!.note } : null,
      };
    })
    .sort((a, b) => Number(a.is_drop_in) - Number(b.is_drop_in) || `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  const writable = canMark(actor, schedule.teacher_id, session.host_teacher_id) && session.status !== "CANCELLED" && !w.notYet && (!w.closed || actor.manageAny);
  return {
    session: {
      ...session,
      title: schedule.title,
      teacher_id: schedule.teacher_id,
      host_name: names.get(session.host_teacher_id) ?? null,
      state: sessionState(session),
      register_saved_by_name: session.register_saved_by ? names.get(session.register_saved_by) ?? null : null,
    },
    roster,
    can_edit: writable,
    window: {
      opens_at: w.opensAt,
      not_yet: w.notYet,
      closed: w.closed,
      last_edit_day: w.lastEditDay,
    },
    late_after_minutes: (await getSettings()).late_after_minutes,
    qr_enabled: (await getSettings()).qr_checkin_enabled === 1,
  };
};

interface RecordInput {
  student_id: number;
  status: OfficeHourAttendanceStatus | null;
  excuse_reason?: string | null;
  arrived_at?: string | null;
  note?: string | null;
  outcome?: number | null;
  follow_up?: boolean;
}

const parseRecords = (raw: unknown): RecordInput[] => {
  if (!Array.isArray(raw) || raw.length === 0) throw new ValidationError("Send at least one student's mark");
  if (raw.length > 300) throw new ValidationError("Too many records");
  return raw.map((r: any, i) => {
    const studentId = Number(r?.student_id);
    if (!Number.isInteger(studentId) || studentId <= 0) throw new ValidationError(`Record ${i + 1}: invalid student`);
    const status = r?.status === null || r?.status === undefined || r?.status === "" ? null : String(r.status);
    if (status !== null && !(ATTENDANCE_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError(`Record ${i + 1}: status must be PRESENT, LATE, ABSENT or EXCUSED`);
    }
    if (r?.excuse_reason && !(EXCUSE_REASONS as readonly string[]).includes(String(r.excuse_reason))) {
      throw new ValidationError(`Record ${i + 1}: unknown excuse reason`);
    }
    if (r?.arrived_at && (typeof r.arrived_at !== "string" || parseClock(r.arrived_at) === null)) {
      throw new ValidationError(`Record ${i + 1}: arrival time must look like 16:35`);
    }
    const outcome = r?.outcome === null || r?.outcome === undefined || r?.outcome === "" ? null : Number(r.outcome);
    if (outcome !== null && ![1, 2, 3].includes(outcome)) throw new ValidationError(`Record ${i + 1}: outcome must be 1, 2 or 3`);
    return {
      student_id: studentId,
      status: status as OfficeHourAttendanceStatus | null,
      excuse_reason: status === "EXCUSED" ? (r?.excuse_reason ? String(r.excuse_reason) : "OTHER") : null,
      arrived_at: status === "LATE" ? (r?.arrived_at ? String(r.arrived_at).slice(0, 5) : null) : null,
      note: typeof r?.note === "string" && r.note.trim() ? r.note.trim().slice(0, 255) : null,
      outcome,
      follow_up: Boolean(r?.follow_up),
    };
  });
};

export const saveRegister = async (actor: Actor, sessionId: number, body: any, source: "TEACHER" | "QR" | "AUTO" = "TEACHER") => {
  const { session, schedule } = await loadSession(sessionId);
  if (source === "TEACHER" && !canMark(actor, schedule.teacher_id, session.host_teacher_id)) {
    throw new AuthorizationError("Only the host teacher (or leadership) can take this register");
  }
  if (session.status === "CANCELLED") throw new ConflictError("This session was cancelled");
  const w = await window(session);
  if (w.notYet) throw new ConflictError(`The register opens at ${w.opensAt} on the day`);
  if (w.closed && !actor.manageAny && source === "TEACHER") {
    throw new ConflictError(`Registers can be changed for ${(await getSettings()).register_edit_days} days; ask leadership to correct this one`);
  }
  if (body?.version !== undefined && Number(body.version) !== session.version) {
    throw new ConflictError("Someone else saved this register. Reload to see their marks.", [{ code: "REGISTER_CHANGED", version: session.version }]);
  }
  const records = parseRecords(body?.records);
  const topic = body?.topic === undefined ? undefined : typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 255) : null;
  await snapshotRoster(session);

  const existing = await db.select().from(OfficeHourAttendance).where(eq(OfficeHourAttendance.session_id, sessionId));
  const byStudent = new Map(existing.map((e) => [e.student_id, e]));
  // Students who are not on the roster may only come in as drop-ins.
  const outsiders = records.filter((r) => !byStudent.has(r.student_id)).map((r) => r.student_id);
  if (outsiders.length) {
    const cards = await studentCards(outsiders, schedule.academic_year_id);
    const bad = outsiders.filter((id) => !cards.has(id));
    if (bad.length) throw new ValidationError("Some students are not active in a class this year", [{ code: "UNKNOWN_STUDENT", student_ids: bad }]);
    const wrong = records.filter((r) => outsiders.includes(r.student_id) && r.status !== "PRESENT" && r.status !== "LATE");
    if (wrong.length) throw new ValidationError("A drop-in student can only be marked present or late");
  }

  const at = now();
  const changed: number[] = [];
  await withDeadlockRetry(() =>
    db.transaction(async (tx) => {
      const [locked] = (await tx.execute(sql`SELECT version FROM OfficeHourSession WHERE session_id = ${sessionId} FOR UPDATE`)) as any;
      const currentVersion = Number(locked?.[0]?.version ?? session.version);
      if (body?.version !== undefined && Number(body.version) !== currentVersion) {
        throw new ConflictError("Someone else saved this register. Reload to see their marks.", [{ code: "REGISTER_CHANGED", version: currentVersion }]);
      }
      for (const r of records) {
        const prev = byStudent.get(r.student_id);
        const values = {
          status: r.status,
          excuse_reason: r.excuse_reason ?? null,
          arrived_at: r.arrived_at ?? null,
          note: r.note ?? null,
          outcome: r.outcome ?? null,
          follow_up: r.follow_up ? 1 : 0,
          source,
          marked_by: actor.userId || null,
          marked_at: at,
        };
        if (!prev) {
          await tx.insert(OfficeHourAttendance).values({ session_id: sessionId, student_id: r.student_id, assignment_id: null, is_drop_in: 1, ...values });
          changed.push(r.student_id);
          await tx.insert(OfficeHourAttendanceHistory).values({ session_id: sessionId, student_id: r.student_id, previous_status: null, new_status: r.status, previous_note: null, new_note: r.note ?? null, source, changed_by: actor.userId || null, changed_at: at });
          continue;
        }
        const statusChanged = (prev.status ?? null) !== (r.status ?? null);
        const noteChanged = (prev.note ?? null) !== (r.note ?? null);
        const otherChanged =
          (prev.excuse_reason ?? null) !== (values.excuse_reason ?? null) ||
          (prev.arrived_at ?? null) !== (values.arrived_at ?? null) ||
          (prev.outcome ?? null) !== (values.outcome ?? null) ||
          prev.follow_up !== values.follow_up;
        if (!statusChanged && !noteChanged && !otherChanged) continue;
        await tx
          .update(OfficeHourAttendance)
          .set(statusChanged ? values : { ...values, marked_at: prev.marked_at ?? at, marked_by: prev.marked_by ?? values.marked_by })
          .where(and(eq(OfficeHourAttendance.session_id, sessionId), eq(OfficeHourAttendance.student_id, r.student_id)));
        if (statusChanged || noteChanged) {
          changed.push(r.student_id);
          await tx.insert(OfficeHourAttendanceHistory).values({
            session_id: sessionId,
            student_id: r.student_id,
            previous_status: prev.status ?? null,
            new_status: r.status,
            previous_note: prev.note ?? null,
            new_note: r.note ?? null,
            source,
            changed_by: actor.userId || null,
            changed_at: at,
          });
        }
      }
      await tx
        .update(OfficeHourSession)
        .set({
          status: "HELD",
          register_first_saved_at: session.register_first_saved_at ?? at,
          register_last_saved_at: at,
          register_saved_by: actor.userId || null,
          ...(topic !== undefined ? { topic } : {}),
          version: sql`${OfficeHourSession.version} + 1`,
        })
        .where(eq(OfficeHourSession.session_id, sessionId));
    }),
  );
  emitOfficeHoursEvent({ type: "register_saved", sessionId, actorId: actor.userId, changedStudentIds: changed });
  return openRegister({ ...actor, manageAny: actor.manageAny || source !== "TEACHER" }, sessionId);
};

/** History of a session's register, newest first (who changed what). */
export const registerHistory = async (sessionId: number) => {
  const rows = await db
    .select()
    .from(OfficeHourAttendanceHistory)
    .where(eq(OfficeHourAttendanceHistory.session_id, sessionId))
    .orderBy(sql`${OfficeHourAttendanceHistory.history_id} DESC`)
    .limit(500);
  const names = await userNames([...rows.map((r) => r.changed_by ?? 0), ...rows.map((r) => r.student_id)]);
  return rows.map((r) => ({ ...r, changed_by_name: r.changed_by ? names.get(r.changed_by) ?? null : "System", student_name: names.get(r.student_id) ?? null }));
};
