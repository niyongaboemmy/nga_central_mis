import crypto from "crypto";
import { and, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  OfficeHourAbsenceNotice,
  OfficeHourAssignment,
  OfficeHourAttendance,
  OfficeHourAttendanceHistory,
  OfficeHourEscalation,
  OfficeHourSchedule,
  OfficeHourScheduleDay,
  OfficeHourSession,
} from "../../db/officeHoursSchema";
import { AuthorizationError, ConflictError, ValidationError } from "../../errors/CustomError";
import logger from "../../utils/logger";
import { addDaysYmd, dowOfYmd, parseClock } from "../reminders/time";
import { configuredApps } from "../home/apps";
import { Actor, assertCanManage } from "./access";
import { assignStudents } from "./assignments";
import { clockOrThrow, isDupEntry, isoDowOfYmd, isYmd, loadTerm, maxYmd, now, nowMinutes, overlaps, todayYmd, toInt } from "./common";
import { emitOfficeHoursEvent } from "./events";
import { studentCards, teachableStudentIds } from "./eligibility";
import { loadMarks, statsFromMarks } from "./metrics";
import { publishSession } from "./live";
import { closedDatesBetween, expectedAssignments, loadSession, scheduleDays } from "./sessions";
import { createSchedule, loadSchedule } from "./schedules";
import { getSettings } from "./settings";

/**
 * Phase 6 features (plan §16): rotating-QR self check-in, the student's
 * "I can't attend" notice, explainable suggestions, term rollover, moving one
 * session, and usage-analytics events.
 */

// ---------------------------------------------------------------- analytics
/** Office-hours key events for platform analytics (plan §17.4). Never throws. */
export const trackOfficeHours = (name: "assign" | "register_save" | "checkin" | "schedule_create", userId: number, params: Record<string, unknown> = {}) => {
  if (process.env.NODE_ENV === "test") return;
  import("../activity/ingest")
    .then(({ ingestServerEvent }) => ingestServerEvent({ app: "mis", name: `mis.office_hours.${name}`, userId, params }))
    .catch((error) => logger.warn("[office-hours] analytics event failed", { error: String(error) }));
};

// ---------------------------------------------------------------- QR check-in
const WINDOW_MS = 30_000;
const key = () => crypto.createHash("sha256").update(`office-hours-qr:${process.env.JWT_SECRET ?? "dev"}`).digest();
const sign = (sessionId: number, window: number) => crypto.createHmac("sha256", key()).update(`${sessionId}:${window}`).digest("base64url").slice(0, 22);
const codeOf = (sessionId: number, window: number) => {
  const h = crypto.createHmac("sha256", key()).update(`code:${sessionId}:${window}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, "0");
};
const windowNow = () => Math.floor(now().getTime() / WINDOW_MS);

/** Is the session open for check-in right now (15 min before start until the end)? */
const checkInOpen = (s: { session_date: string; start_time: string; end_time: string; status: string }) =>
  s.status !== "CANCELLED" &&
  s.session_date === todayYmd() &&
  nowMinutes() >= (parseClock(s.start_time) ?? 0) - 15 &&
  nowMinutes() <= (parseClock(s.end_time) ?? 0);

export const checkInToken = async (actor: Actor, sessionId: number) => {
  const settings = await getSettings();
  if (!settings.qr_checkin_enabled) throw new ConflictError("Self check-in is switched off in Office hours settings");
  const { session, schedule } = await loadSession(sessionId);
  assertCanManage(actor, schedule.teacher_id, [session.host_teacher_id]);
  if (!checkInOpen(session)) throw new ConflictError("Check-in opens 15 minutes before the session and closes at its end");
  const w = windowNow();
  const msLeft = (w + 1) * WINDOW_MS - now().getTime();
  return { token: `${sessionId}.${w}.${sign(sessionId, w)}`, code: codeOf(sessionId, w), session_id: sessionId, expires_in: Math.ceil(msLeft / 1000), rotates_every: WINDOW_MS / 1000 };
};

/**
 * A student checks in with the scanned token, or the 6-digit code plus the
 * session id. Accepted for the current and the previous window (≤ 60 s).
 * Records PRESENT, or LATE after late_after_minutes; never overwrites a mark
 * the teacher made. The session stays SCHEDULED until the teacher saves.
 */
export const checkIn = async (studentId: number, body: any) => {
  const settings = await getSettings();
  if (!settings.qr_checkin_enabled) throw new ConflictError("Self check-in is switched off");
  let sessionId: number | null = null;
  let window: number | null = null;
  if (typeof body?.token === "string") {
    const [sid, w, sig] = body.token.split(".");
    sessionId = toInt(sid);
    window = Number(w);
    if (!sessionId || !Number.isInteger(window) || sign(sessionId, window) !== sig) throw new ValidationError("This code is not valid. Scan the one on the screen again.");
  } else {
    sessionId = toInt(body?.session_id);
    const code = String(body?.code ?? "").trim();
    if (!sessionId || !/^\d{6}$/.test(code)) throw new ValidationError("Enter the 6-digit code shown by your teacher");
    const w = windowNow();
    window = [w, w - 1].find((x) => codeOf(sessionId!, x) === code) ?? null;
    if (window === null) throw new ValidationError("That code has expired or is wrong. Use the one on the screen now.");
  }
  const current = windowNow();
  if (window < current - 1 || window > current) throw new ValidationError("This code has expired. Scan the one on the screen now.");
  const { session, schedule } = await loadSession(sessionId);
  if (!checkInOpen(session)) throw new ConflictError("Check-in is closed for this session");
  const expected = await expectedAssignments(session.schedule_id, session.session_date);
  const mine = expected.find((a) => a.student_id === studentId);
  if (!mine) {
    const cards = await studentCards([studentId], schedule.academic_year_id);
    if (!cards.has(studentId)) throw new AuthorizationError("Only students can check in");
  }
  const late = nowMinutes() > (parseClock(session.start_time) ?? 0) + settings.late_after_minutes;
  const hh = String(Math.floor(nowMinutes() / 60)).padStart(2, "0");
  const mm = String(nowMinutes() % 60).padStart(2, "0");
  const status = late ? "LATE" : "PRESENT";
  const [existing] = await db
    .select()
    .from(OfficeHourAttendance)
    .where(and(eq(OfficeHourAttendance.session_id, sessionId), eq(OfficeHourAttendance.student_id, studentId)))
    .limit(1);
  if (existing?.status && existing.source === "TEACHER") {
    return { status: existing.status, already: true, drop_in: existing.is_drop_in === 1 };
  }
  if (existing?.status && existing.source === "QR") return { status: existing.status, already: true, drop_in: existing.is_drop_in === 1 };
  const values = { status: status as "PRESENT" | "LATE", arrived_at: late ? `${hh}:${mm}` : null, source: "QR" as const, marked_by: studentId, marked_at: now() };
  if (existing) {
    await db.update(OfficeHourAttendance).set(values).where(and(eq(OfficeHourAttendance.session_id, sessionId), eq(OfficeHourAttendance.student_id, studentId)));
  } else {
    try {
      await db.insert(OfficeHourAttendance).values({ session_id: sessionId, student_id: studentId, assignment_id: mine?.assignment_id ?? null, is_drop_in: mine ? 0 : 1, ...values });
    } catch (error) {
      if (!isDupEntry(error)) throw error;
    }
  }
  await db.insert(OfficeHourAttendanceHistory).values({ session_id: sessionId, student_id: studentId, previous_status: null, new_status: status, source: "QR", changed_by: studentId, changed_at: now() });
  publishSession(sessionId, "checkin", { student_id: studentId, status, arrived_at: values.arrived_at, drop_in: !mine });
  trackOfficeHours("checkin", studentId, { session_id: sessionId, late });
  return { status, already: false, drop_in: !mine, title: schedule.title };
};

// ---------------------------------------------------------------- "I can't attend"
export const ABSENCE_REASONS = ["SICK", "SCHOOL_ACTIVITY", "FAMILY", "PERMISSION", "OTHER"] as const;

export const sendAbsenceNotice = async (studentId: number, sessionId: number, reason: unknown, note: unknown) => {
  if (!(ABSENCE_REASONS as readonly string[]).includes(String(reason))) throw new ValidationError("Choose a reason", [{ field: "reason", message: ABSENCE_REASONS.join(", ") }]);
  const { session } = await loadSession(sessionId);
  if (session.status === "CANCELLED") throw new ConflictError("This session is cancelled");
  const expected = await expectedAssignments(session.schedule_id, session.session_date);
  if (!expected.some((a) => a.student_id === studentId)) throw new AuthorizationError("You are not expected at this session");
  const today = todayYmd();
  if (session.session_date < today || (session.session_date === today && nowMinutes() >= (parseClock(session.start_time) ?? 0))) {
    throw new ConflictError("Tell your teacher before the session starts");
  }
  const text = typeof note === "string" && note.trim() ? note.trim().slice(0, 255) : null;
  await db
    .insert(OfficeHourAbsenceNotice)
    .values({ session_id: sessionId, student_id: studentId, reason: String(reason), note: text, created_at: now() })
    .onDuplicateKeyUpdate({ set: { reason: String(reason), note: text, created_at: now() } });
  emitOfficeHoursEvent({ type: "absence_notice", sessionId, studentId });
};

export const withdrawAbsenceNotice = async (studentId: number, sessionId: number) => {
  await db.delete(OfficeHourAbsenceNotice).where(and(eq(OfficeHourAbsenceNotice.session_id, sessionId), eq(OfficeHourAbsenceNotice.student_id, studentId)));
};

export const noticesFor = async (studentId: number, sessionIds: number[]) => {
  if (!sessionIds.length) return new Map<number, { reason: string; note: string | null }>();
  const rows = await db.select().from(OfficeHourAbsenceNotice).where(and(eq(OfficeHourAbsenceNotice.student_id, studentId), inArray(OfficeHourAbsenceNotice.session_id, sessionIds)));
  return new Map(rows.map((r) => [r.session_id, { reason: r.reason, note: r.note }]));
};

// ---------------------------------------------------------------- suggestions
export interface Signal {
  source: "taskmentor" | "office_hours";
  label: string;
  weight: number;
}

export interface TaskMentorStanding {
  mis_user_id: number;
  avg_score: number | null;
  graded_count: number;
  missing: number;
  subjects: string[];
  reasons: string[];
  below_pass: boolean;
}

/** Test hook: replace the Task Mentor call. */
let standingFetcher: (token: string) => Promise<{ students: TaskMentorStanding[]; pass_mark: number } | null> = async (token) => {
  const tm = configuredApps().find((a) => a.source === "taskmentor");
  if (!tm || !token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.HOME_APP_TIMEOUT_MS) || 8000);
  try {
    const res = await fetch(`${tm.apiBaseUrl}/api/integration/student-standing`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const data = json?.data;
    if (!data || !Array.isArray(data.students)) return null;
    return { students: data.students, pass_mark: Number(data.pass_mark) || 50 };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
export const setStandingFetcher = (fn: typeof standingFetcher | null) => {
  if (fn) standingFetcher = fn;
};

/**
 * "Suggested" students for a schedule (plan §16.3): transparent evidence only,
 * each shown with its source -- never a composite risk score, never
 * demographics. The teacher always decides.
 */
export const suggestionsFor = async (actor: Actor, scheduleId: number, misToken: string | null) => {
  const schedule = await loadSchedule(scheduleId);
  assertCanManage(actor, schedule.teacher_id);
  const settings = await getSettings();
  const pool = [...(await teachableStudentIds(schedule.teacher_id, schedule.academic_year_id))];
  const signals = new Map<number, Signal[]>();
  const add = (id: number, s: Signal) => signals.set(id, [...(signals.get(id) ?? []), s]);
  let taskMentor: "ok" | "unavailable" = "unavailable";

  const standing = misToken ? await standingFetcher(misToken).catch(() => null) : null;
  if (standing) {
    taskMentor = "ok";
    const inPool = new Set(pool);
    for (const s of standing.students) {
      if (!inPool.has(s.mis_user_id)) continue;
      if (s.below_pass && s.avg_score !== null) add(s.mis_user_id, { source: "taskmentor", label: `Task Mentor average ${Math.round(s.avg_score)}% (pass ${standing.pass_mark}%)`, weight: 3 });
      if (s.missing >= 2) add(s.mis_user_id, { source: "taskmentor", label: `${s.missing} pieces of work missing in Task Mentor`, weight: 2 });
    }
  }
  // Office-hours history this year: low attendance elsewhere, or ended without the goal met.
  const marks = await loadMarks({ studentIds: pool, fromYmd: addDaysYmd(todayYmd(), -365), toYmd: todayYmd() });
  const byStudent = new Map<number, typeof marks>();
  for (const m of marks) byStudent.set(m.student_id, [...(byStudent.get(m.student_id) ?? []), m]);
  for (const [id, list] of byStudent) {
    const st = statsFromMarks(list, settings);
    if (st.band === "CHRONIC") add(id, { source: "office_hours", label: `Office-hours attendance ${Math.round(st.rate ?? 0)}% this year`, weight: 1 });
  }
  const escalated = pool.length
    ? await db.selectDistinct({ id: OfficeHourEscalation.student_id }).from(OfficeHourEscalation).where(inArray(OfficeHourEscalation.student_id, pool))
    : [];
  for (const e of escalated) add(e.id, { source: "office_hours", label: "Escalated for missing office hours before", weight: 1 });

  const ids = [...signals.keys()];
  const cards = await studentCards(ids, schedule.academic_year_id);
  const students = ids
    .filter((id) => cards.has(id))
    .map((id) => ({ ...cards.get(id)!, signals: signals.get(id)!, score: signals.get(id)!.reduce((a, s) => a + s.weight, 0) }))
    .sort((a, b) => b.score - a.score || (a.first_name ?? "").localeCompare(b.first_name ?? ""));
  return { task_mentor: taskMentor, students };
};

// ---------------------------------------------------------------- term rollover
/**
 * Copy a schedule into another term (plan §16.6): days, times, room,
 * capacity, title, subject; dates = the new term. The copy starts as a DRAFT
 * and every student still active is re-checked against the new term's locks
 * and eligibility, reported like a bulk assign.
 */
export const rolloverSchedule = async (actor: Actor, scheduleId: number, toTermId: number) => {
  const source = await loadSchedule(scheduleId);
  assertCanManage(actor, source.teacher_id);
  if (toTermId === source.academic_term_id) throw new ValidationError("Choose a different term");
  const term = await loadTerm(toTermId);
  const days = (await scheduleDays([scheduleId])).get(scheduleId) ?? [];
  const newId = await createSchedule(
    actor,
    {
      academic_term_id: toTermId,
      teacher_id: source.teacher_id,
      title: source.title,
      purpose: source.purpose,
      subject_id: source.subject_id,
      days,
      start_time: source.start_time,
      end_time: source.end_time,
      location: source.location,
      capacity: source.capacity,
      effective_from: maxYmd(term.startYmd, todayYmd() > term.endYmd ? term.startYmd : maxYmd(term.startYmd, todayYmd())),
      effective_to: term.endYmd,
      notes: source.notes,
      status: "DRAFT",
    },
  );
  const students = await db
    .selectDistinct({ id: OfficeHourAssignment.student_id })
    .from(OfficeHourAssignment)
    // NULL (still active) must count: `<> 'GOAL_MET'` alone would drop it.
    .where(and(eq(OfficeHourAssignment.schedule_id, scheduleId), or(isNull(OfficeHourAssignment.end_reason_code), ne(OfficeHourAssignment.end_reason_code, "GOAL_MET"))));
  const carried = students.length ? await assignStudents(actor, newId, students.map((s) => s.id), { reasonCode: "TEACHER_REFERRAL", reasonNote: `Continued from ${source.title}` }) : null;
  return { schedule_id: newId, assignment: carried };
};

// ---------------------------------------------------------------- move one session
/**
 * Move a single session to another date and/or time (plan §16.8). Students
 * expected that day who already have office hours at the new time are
 * reported as conflicts and nothing moves.
 */
export const moveSession = async (actor: Actor, sessionId: number, body: any) => {
  const { session, schedule } = await loadSession(sessionId);
  assertCanManage(actor, schedule.teacher_id, [session.host_teacher_id]);
  if (session.status !== "SCHEDULED") throw new ConflictError("Only an upcoming session can be moved");
  const date = isYmd(body?.date) ? (body.date as string) : session.session_date;
  const start = body?.start_time ? String(body.start_time) : session.start_time;
  const end = body?.end_time ? String(body.end_time) : session.end_time;
  const s = clockOrThrow(start, "start_time");
  const e = clockOrThrow(end, "end_time");
  if (e <= s) throw new ValidationError("The end must be after the start");
  const settings = await getSettings();
  if (s < (parseClock(settings.allowed_window_start) ?? 0) || e > (parseClock(settings.allowed_window_end) ?? 24 * 60)) {
    throw new ValidationError(`Office hours must fall between ${settings.allowed_window_start} and ${settings.allowed_window_end}`);
  }
  const dow = isoDowOfYmd(date);
  const today = todayYmd();
  if (date < today) throw new ValidationError("Choose today or a later date");
  const term = await loadTerm(schedule.academic_term_id);
  if (date < term.startYmd || date > term.endYmd) throw new ValidationError("The new date must be inside the term");
  if ((await closedDatesBetween(date, date)).has(date)) throw new ConflictError("The school is closed that day");
  if (date !== session.session_date) {
    const [clash] = await db.select({ id: OfficeHourSession.session_id }).from(OfficeHourSession).where(and(eq(OfficeHourSession.schedule_id, session.schedule_id), eq(OfficeHourSession.session_date, date))).limit(1);
    if (clash) throw new ConflictError("These office hours already meet that day");
  }
  // Students expected at the original session who have other office hours at the new time.
  const expected = (await expectedAssignments(session.schedule_id, session.session_date)).map((a) => a.student_id);
  const others = expected.length
    ? await db
        .select({ student: OfficeHourAssignment.student_id, schedule: OfficeHourSchedule.schedule_id, title: OfficeHourSchedule.title, st: OfficeHourSchedule.start_time, et: OfficeHourSchedule.end_time })
        .from(OfficeHourAssignment)
        .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
        .innerJoin(OfficeHourScheduleDay, and(eq(OfficeHourScheduleDay.schedule_id, OfficeHourSchedule.schedule_id), eq(OfficeHourScheduleDay.day_of_week, dow)))
        .where(
          and(
            inArray(OfficeHourAssignment.student_id, expected),
            ne(OfficeHourAssignment.schedule_id, session.schedule_id),
            lte(OfficeHourAssignment.effective_from, date),
            gte(OfficeHourAssignment.effective_to, date),
            eq(OfficeHourSchedule.status, "ACTIVE"),
          ),
        )
    : [];
  const conflicts = others.filter((o) => overlaps(s, e, parseClock(o.st) ?? 0, parseClock(o.et) ?? 0));
  if (conflicts.length) {
    throw new ConflictError(`${conflicts.length} student(s) already have office hours at that time`, conflicts.map((c) => ({ code: "STUDENT_BUSY", student_id: c.student, title: c.title })));
  }
  // The original keeps its date (so the weekly pattern never re-creates it) and is
  // cancelled as MOVED; the new one-off session points back at it.
  const location = typeof body?.location === "string" ? body.location.slice(0, 100) || null : session.location;
  const newId = await db.transaction(async (tx) => {
    await tx
      .update(OfficeHourSession)
      .set({ status: "CANCELLED", cancel_reason: "MOVED", cancel_note: `Moved to ${date} ${start}`, cancelled_by: actor.userId, cancelled_at: now(), version: sql`${OfficeHourSession.version} + 1` })
      .where(eq(OfficeHourSession.session_id, sessionId));
    const [res] = (await tx.insert(OfficeHourSession).values({
      schedule_id: session.schedule_id,
      academic_term_id: session.academic_term_id,
      session_date: date,
      start_time: start,
      end_time: end,
      host_teacher_id: session.host_teacher_id,
      location,
      moved_from_session_id: sessionId,
    })) as any;
    await tx.delete(OfficeHourAbsenceNotice).where(eq(OfficeHourAbsenceNotice.session_id, sessionId));
    return res.insertId as number;
  });
  emitOfficeHoursEvent({ type: "session_moved", sessionId: newId, fromSessionId: sessionId, actorId: actor.userId });
  return (await loadSession(newId)).session;
};

