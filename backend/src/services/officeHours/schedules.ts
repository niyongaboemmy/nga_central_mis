import { and, eq, gte, inArray, lte, ne, sql, desc } from "drizzle-orm";
import { db } from "../../db";
import { Subject, TeacherSubjectAssignment, User } from "../../db/schema";
import {
  OfficeHourAssignment,
  OfficeHourSchedule,
  OfficeHourScheduleDay,
  OfficeHourSession,
  OfficeHourStudentDateLock,
} from "../../db/officeHoursSchema";
import { ConflictError, NotFoundError, ValidationError, AuthorizationError } from "../../errors/CustomError";
import { loadTeacherLessons } from "../../controllers/calendarController";
import { addDaysYmd, parseClock } from "../reminders/time";
import { Actor, assertCanManage } from "./access";
import {
  clockOrThrow,
  dayLabel,
  datesOverlap,
  intList,
  isYmd,
  loadTerm,
  maxYmd,
  minYmd,
  now,
  nowMinutes,
  overlaps,
  resolveTermId,
  TermInfo,
  todayYmd,
  toInt,
  WEEKDAYS,
  isDupEntry,
} from "./common";
import { emitOfficeHoursEvent } from "./events";
import { userNames } from "./eligibility";
import { getSettings, OfficeHourSettings } from "./settings";
import { ensureSessions, rematerialiseSchedule, scheduleDays, sessionState } from "./sessions";
import { lockDatesFor, seatSummary, seatsUsed } from "./seats";

/**
 * Office-hours schedules (plan §5.2): a teacher's recurring office hours on
 * one or more weekdays inside one term.
 */
export const PURPOSES = ["ACADEMIC_SUPPORT", "CATCH_UP", "ASSESSMENT_PREP", "RETAKE", "ENRICHMENT", "PROJECT", "OTHER"] as const;
export type Schedule = typeof OfficeHourSchedule.$inferSelect;

export const loadSchedule = async (scheduleId: number): Promise<Schedule> => {
  const [row] = await db.select().from(OfficeHourSchedule).where(eq(OfficeHourSchedule.schedule_id, scheduleId)).limit(1);
  if (!row) throw new NotFoundError("Office hours not found");
  return row;
};

interface ScheduleFields {
  teacherId: number;
  term: TermInfo;
  title: string;
  purpose: string;
  subjectId: number | null;
  days: number[];
  startTime: string;
  endTime: string;
  location: string | null;
  capacity: number;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string | null;
}

const parseDays = (raw: unknown): number[] => {
  const days = intList(raw, "days", 5).sort();
  if (!days.length || days.some((d) => !(WEEKDAYS as readonly number[]).includes(d))) {
    throw new ValidationError("Choose one or more weekdays (Monday to Friday)", [{ field: "days", message: "Use 1 (Mon) to 5 (Fri)" }]);
  }
  return days;
};

const checkTimes = (start: string, end: string, settings: OfficeHourSettings) => {
  const s = clockOrThrow(start, "start_time");
  const e = clockOrThrow(end, "end_time");
  if (e <= s) throw new ValidationError("The end time must be after the start time", [{ field: "end_time", message: "End before start" }]);
  const ws = parseClock(settings.allowed_window_start)!;
  const we = parseClock(settings.allowed_window_end)!;
  if (s < ws || e > we) {
    throw new ValidationError(
      `Office hours must fall between ${settings.allowed_window_start} and ${settings.allowed_window_end}`,
      [{ field: "start_time", message: "Outside the allowed window" }],
    );
  }
};

const checkWindow = (from: string, to: string, term: TermInfo) => {
  if (!isYmd(from) || !isYmd(to)) throw new ValidationError("Dates must look like 2026-10-06");
  if (from > to) throw new ValidationError("The start date must be on or before the end date", [{ field: "effective_to", message: "Before start" }]);
  if (from < term.startYmd || to > term.endYmd) {
    throw new ValidationError(`Dates must fall inside the term (${term.startYmd} to ${term.endYmd})`, [
      { field: "effective_from", message: "Outside the term" },
    ]);
  }
};

const assertTeachesSubject = async (actor: Actor, teacherId: number, subjectId: number, yearId: number) => {
  const [subject] = await db.select({ id: Subject.subject_id }).from(Subject).where(eq(Subject.subject_id, subjectId)).limit(1);
  if (!subject) throw new ValidationError("Subject not found", [{ field: "subject_id", message: "Unknown subject" }]);
  if (actor.manageAny) return;
  const [row] = await db
    .select({ id: TeacherSubjectAssignment.subject_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, teacherId),
        eq(TeacherSubjectAssignment.subject_id, subjectId),
        eq(TeacherSubjectAssignment.academic_year_id, yearId),
      ),
    )
    .limit(1);
  if (!row) throw new AuthorizationError("You can only run office hours for subjects you teach this year");
};

/**
 * A teacher cannot host two schedules that share a weekday, overlap in dates
 * and overlap in time, nor hold office hours during one of their own lessons.
 * Runs inside the caller's transaction, after the teacher's User row is locked.
 */
const assertNoTeacherOverlap = async (tx: any, f: ScheduleFields, excludeId: number | null) => {
  const others = await tx
    .select({ s: OfficeHourSchedule, day: OfficeHourScheduleDay.day_of_week })
    .from(OfficeHourSchedule)
    .innerJoin(OfficeHourScheduleDay, eq(OfficeHourScheduleDay.schedule_id, OfficeHourSchedule.schedule_id))
    .where(
      and(
        eq(OfficeHourSchedule.teacher_id, f.teacherId),
        eq(OfficeHourSchedule.academic_term_id, f.term.termId),
        inArray(OfficeHourSchedule.status, ["ACTIVE", "DRAFT"]),
        inArray(OfficeHourScheduleDay.day_of_week, f.days),
        excludeId ? ne(OfficeHourSchedule.schedule_id, excludeId) : sql`1=1`,
      ),
    );
  const s = parseClock(f.startTime)!;
  const e = parseClock(f.endTime)!;
  const clash = others.find(
    (o: any) =>
      datesOverlap(f.effectiveFrom, f.effectiveTo, o.s.effective_from, o.s.effective_to) &&
      overlaps(s, e, parseClock(o.s.start_time)!, parseClock(o.s.end_time)!),
  );
  if (clash) {
    throw new ConflictError(`This overlaps your office hours "${clash.s.title}" on ${dayLabel([clash.day])}`, [
      { code: "TEACHER_OVERLAP", schedule_id: clash.s.schedule_id },
    ]);
  }
};

const assertNoLessonClash = async (f: ScheduleFields) => {
  const lessons = await loadTeacherLessons({ userId: f.teacherId, termId: f.term.termId, yearId: f.term.yearId });
  const s = parseClock(f.startTime)!;
  const e = parseClock(f.endTime)!;
  const clash = (lessons as any[]).find(
    (l) => f.days.includes(Number(l.day_of_week)) && overlaps(s, e, parseClock(l.start_time) ?? 0, parseClock(l.end_time) ?? 0),
  );
  if (clash) {
    throw new ConflictError(
      `You teach ${clash.subject_name ?? "a lesson"} (${clash.class_group_name ?? ""}) at ${clash.start_time} on ${dayLabel([Number(clash.day_of_week)])}`,
      [{ code: "LESSON_CLASH", slot_id: clash.slot_id }],
    );
  }
};

const lockTeacherRow = (tx: any, teacherId: number) =>
  tx.execute(sql`SELECT ${User.user_id} FROM ${User} WHERE ${User.user_id} = ${teacherId} FOR UPDATE`);

/** Build validated fields from a create payload (defaults from the band and the term). */
const fieldsFromCreate = async (actor: Actor, input: any): Promise<ScheduleFields> => {
  const settings = await getSettings();
  const term = await loadTerm(await resolveTermId(input.academic_term_id));
  let teacherId = actor.userId;
  if (input.teacher_id !== undefined && input.teacher_id !== null && Number(input.teacher_id) !== actor.userId) {
    if (!actor.manageAny) throw new AuthorizationError("Only leadership can create office hours for another teacher");
    teacherId = toInt(input.teacher_id) ?? 0;
    const [t] = await db.select({ id: User.user_id }).from(User).where(eq(User.user_id, teacherId)).limit(1);
    if (!t) throw new ValidationError("Teacher not found", [{ field: "teacher_id", message: "Unknown user" }]);
  }
  const days = parseDays(input.days);
  const startTime = input.start_time || settings.band_start;
  const endTime = input.end_time || settings.band_end;
  checkTimes(startTime, endTime, settings);
  const today = todayYmd();
  const effectiveFrom = input.effective_from || maxYmd(today, term.startYmd);
  const effectiveTo = input.effective_to || term.endYmd;
  checkWindow(effectiveFrom, effectiveTo, term);
  if (effectiveTo < today) throw new ValidationError("Office hours must run on or after today", [{ field: "effective_to", message: "In the past" }]);
  const capacity = input.capacity === undefined || input.capacity === null || input.capacity === "" ? settings.default_capacity : Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > settings.max_capacity) {
    throw new ValidationError(`Capacity must be from 1 to ${settings.max_capacity}`, [{ field: "capacity", message: "Out of range" }]);
  }
  const subjectId = toInt(input.subject_id);
  if (subjectId) await assertTeachesSubject(actor, teacherId, subjectId, term.yearId);
  const purpose = input.purpose ? String(input.purpose) : "ACADEMIC_SUPPORT";
  if (!(PURPOSES as readonly string[]).includes(purpose)) throw new ValidationError("Unknown purpose", [{ field: "purpose", message: PURPOSES.join(", ") }]);
  let title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title && subjectId) {
    const [s] = await db.select({ name: Subject.name }).from(Subject).where(eq(Subject.subject_id, subjectId)).limit(1);
    title = s ? `${s.name} support` : "";
  }
  if (!title) title = "Office hours";
  if (title.length > 150) throw new ValidationError("The title is too long (150 characters at most)");
  const location = typeof input.location === "string" && input.location.trim() ? input.location.trim().slice(0, 100) : null;
  const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 5000) : null;
  return { teacherId, term, title, purpose, subjectId, days, startTime, endTime, location, capacity, effectiveFrom, effectiveTo, notes };
};

export const createSchedule = async (actor: Actor, input: any) => {
  const f = await fieldsFromCreate(actor, input);
  await assertNoLessonClash(f);
  const status = input.status === "DRAFT" ? "DRAFT" : "ACTIVE";
  const scheduleId = await db.transaction(async (tx) => {
    await lockTeacherRow(tx, f.teacherId);
    await assertNoTeacherOverlap(tx, f, null);
    const [res] = (await tx.insert(OfficeHourSchedule).values({
      academic_year_id: f.term.yearId,
      academic_term_id: f.term.termId,
      teacher_id: f.teacherId,
      subject_id: f.subjectId,
      title: f.title,
      purpose: f.purpose,
      start_time: f.startTime,
      end_time: f.endTime,
      location: f.location,
      capacity: f.capacity,
      effective_from: f.effectiveFrom,
      effective_to: f.effectiveTo,
      status,
      notes: f.notes,
      created_by: actor.userId,
      updated_by: actor.userId,
    })) as any;
    const id = res.insertId as number;
    await tx.insert(OfficeHourScheduleDay).values(f.days.map((d) => ({ schedule_id: id, day_of_week: d })));
    return id;
  });
  if (status === "ACTIVE") {
    await ensureSessions(scheduleId);
    emitOfficeHoursEvent({ type: "schedule_published", scheduleId, actorId: actor.userId });
  }
  return scheduleId;
};

const EDITABLE = ["title", "purpose", "subject_id", "days", "start_time", "end_time", "location", "capacity", "effective_from", "effective_to", "notes", "status"];

export const updateSchedule = async (actor: Actor, scheduleId: number, input: any) => {
  const schedule = await loadSchedule(scheduleId);
  assertCanManage(actor, schedule.teacher_id);
  if (schedule.status === "ENDED" || schedule.status === "CANCELLED") throw new ConflictError("This schedule has ended and can no longer be edited");
  if (input.version !== undefined && Number(input.version) !== schedule.version) {
    throw new ConflictError("Someone else changed these office hours. Reload and try again.", [{ code: "SCHEDULE_CHANGED", version: schedule.version }]);
  }
  const settings = await getSettings();
  const term = await loadTerm(schedule.academic_term_id);
  const currentDays = (await scheduleDays([scheduleId])).get(scheduleId) ?? [];
  const changed = EDITABLE.filter((k) => input[k] !== undefined);
  if (!changed.length) return schedule;

  const f: ScheduleFields = {
    teacherId: schedule.teacher_id,
    term,
    title: schedule.title,
    purpose: schedule.purpose,
    subjectId: schedule.subject_id,
    days: currentDays,
    startTime: schedule.start_time,
    endTime: schedule.end_time,
    location: schedule.location,
    capacity: schedule.capacity,
    effectiveFrom: schedule.effective_from,
    effectiveTo: schedule.effective_to,
    notes: schedule.notes,
  };
  if (input.title !== undefined) {
    const t = String(input.title ?? "").trim();
    if (!t || t.length > 150) throw new ValidationError("A title of 1 to 150 characters is required", [{ field: "title", message: "Required" }]);
    f.title = t;
  }
  if (input.purpose !== undefined) {
    if (!(PURPOSES as readonly string[]).includes(String(input.purpose))) throw new ValidationError("Unknown purpose");
    f.purpose = String(input.purpose);
  }
  if (input.subject_id !== undefined) {
    f.subjectId = toInt(input.subject_id);
    if (f.subjectId) await assertTeachesSubject(actor, f.teacherId, f.subjectId, term.yearId);
  }
  if (input.days !== undefined) f.days = parseDays(input.days);
  if (input.start_time !== undefined) f.startTime = String(input.start_time);
  if (input.end_time !== undefined) f.endTime = String(input.end_time);
  checkTimes(f.startTime, f.endTime, settings);
  if (input.location !== undefined) f.location = typeof input.location === "string" && input.location.trim() ? input.location.trim().slice(0, 100) : null;
  if (input.notes !== undefined) f.notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 5000) : null;

  const [{ held = 0, firstHeld = null } = {}] = (await db
    .select({ held: sql<number>`COUNT(*)`, firstHeld: sql<string | null>`MIN(${OfficeHourSession.session_date})` })
    .from(OfficeHourSession)
    .where(and(eq(OfficeHourSession.schedule_id, scheduleId), eq(OfficeHourSession.status, "HELD")))) as any[];
  if (input.effective_from !== undefined) f.effectiveFrom = String(input.effective_from);
  if (input.effective_to !== undefined) f.effectiveTo = String(input.effective_to);
  checkWindow(f.effectiveFrom, f.effectiveTo, term);
  const firstHeldYmd = firstHeld ? String(firstHeld).slice(0, 10) : null;
  if (firstHeldYmd && f.effectiveFrom > firstHeldYmd) {
    throw new ConflictError(`Sessions were already held from ${firstHeldYmd}; the start date cannot move past them`);
  }
  const today = todayYmd();
  if (input.effective_to !== undefined && f.effectiveTo < today) {
    throw new ValidationError("To stop office hours early, end the schedule instead", [{ field: "effective_to", message: "In the past" }]);
  }

  if (input.capacity !== undefined) {
    const c = Number(input.capacity);
    if (!Number.isInteger(c) || c < 1 || c > settings.max_capacity) throw new ValidationError(`Capacity must be from 1 to ${settings.max_capacity}`);
    // Capacity is per session: weekly groups are checked at their busiest upcoming session.
    const busiest = await seatsUsed(db, scheduleId, currentDays, maxYmd(todayYmd(), schedule.effective_from), schedule.effective_to);
    if (c < busiest) throw new ConflictError(`${busiest} students are invited to one session; remove some before lowering the capacity to ${c}`);
    f.capacity = c;
  }
  let publish = false;
  if (input.status !== undefined) {
    if (input.status === "ACTIVE" && schedule.status === "DRAFT") publish = true;
    else if (input.status !== schedule.status) throw new ValidationError("Use publish (status ACTIVE) on a draft, or end the schedule");
  }
  const timeOrDaysChanged = f.startTime !== schedule.start_time || f.endTime !== schedule.end_time || f.days.join() !== currentDays.join();
  if (timeOrDaysChanged) await assertNoLessonClash(f);
  const daysChanged = f.days.join() !== currentDays.join();

  await db.transaction(async (tx) => {
    await lockTeacherRow(tx, f.teacherId);
    await assertNoTeacherOverlap(tx, f, scheduleId);
    await tx
      .update(OfficeHourSchedule)
      .set({
        title: f.title,
        purpose: f.purpose,
        subject_id: f.subjectId,
        start_time: f.startTime,
        end_time: f.endTime,
        location: f.location,
        capacity: f.capacity,
        effective_from: f.effectiveFrom,
        effective_to: f.effectiveTo,
        notes: f.notes,
        status: publish ? "ACTIVE" : schedule.status,
        updated_by: actor.userId,
        version: sql`${OfficeHourSchedule.version} + 1`,
      })
      .where(eq(OfficeHourSchedule.schedule_id, scheduleId));
    if (daysChanged) {
      await tx.delete(OfficeHourScheduleDay).where(eq(OfficeHourScheduleDay.schedule_id, scheduleId));
      await tx.insert(OfficeHourScheduleDay).values(f.days.map((d) => ({ schedule_id: scheduleId, day_of_week: d })));
    }
    // Assignment windows follow a shortened schedule window.
    if (f.effectiveTo < schedule.effective_to) {
      await tx
        .update(OfficeHourAssignment)
        .set({ effective_to: f.effectiveTo })
        .where(and(eq(OfficeHourAssignment.schedule_id, scheduleId), gte(OfficeHourAssignment.effective_to, addDaysYmd(f.effectiveTo, 1))));
      await tx.execute(sql`
        DELETE l FROM OfficeHourStudentDateLock l
        JOIN OfficeHourAssignment a ON a.assignment_id = l.assignment_id
        WHERE a.schedule_id = ${scheduleId} AND l.lock_date > ${f.effectiveTo}`);
    }
    // WEEKDAY mode locks only the meeting dates, so they follow a days change.
    if (daysChanged && settings.student_lock_mode === "WEEKDAY") {
      const active = await tx
        .select({ id: OfficeHourAssignment.assignment_id, student: OfficeHourAssignment.student_id, from: OfficeHourAssignment.effective_from, to: OfficeHourAssignment.effective_to })
        .from(OfficeHourAssignment)
        .where(and(eq(OfficeHourAssignment.schedule_id, scheduleId), eq(OfficeHourAssignment.status, "ACTIVE")));
      const today = todayYmd();
      for (const a of active) {
        await tx.delete(OfficeHourStudentDateLock).where(and(eq(OfficeHourStudentDateLock.assignment_id, a.id), gte(OfficeHourStudentDateLock.lock_date, today)));
        const dates = lockDatesFor("WEEKDAY", f.days, maxYmd(today, String(a.from).slice(0, 10)), minYmd(String(a.to).slice(0, 10), f.effectiveTo));
        if (!dates.length) continue;
        try {
          await tx.insert(OfficeHourStudentDateLock).values(
            dates.map((d) => ({ student_id: a.student, lock_date: d, academic_term_id: schedule.academic_term_id, assignment_id: a.id })),
          );
        } catch (error) {
          if (isDupEntry(error)) {
            throw new ConflictError("Some assigned students already have office hours on the new days. Remove them first.", [
              { code: "LOCK_CONFLICT", student_id: a.student },
            ]);
          }
          throw error;
        }
      }
    }
  });

  const remat = await rematerialiseSchedule(scheduleId, actor.userId);
  if (publish) emitOfficeHoursEvent({ type: "schedule_published", scheduleId, actorId: actor.userId });
  else if (schedule.status === "ACTIVE") {
    const visible = changed.filter((k) => ["days", "start_time", "end_time", "location", "effective_from", "effective_to", "title"].includes(k));
    if (visible.length) emitOfficeHoursEvent({ type: "schedule_changed", scheduleId, actorId: actor.userId, fields: visible });
    if (remat.cancelled.length) {
      emitOfficeHoursEvent({ type: "sessions_cancelled", sessionIds: remat.cancelled, actorId: actor.userId, reason: "SCHEDULE_CHANGED" });
    }
  }
  return loadSchedule(scheduleId);
};

export const countActive = async (scheduleId: number) => {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(OfficeHourAssignment)
    .where(and(eq(OfficeHourAssignment.schedule_id, scheduleId), eq(OfficeHourAssignment.status, "ACTIVE")));
  return Number(row?.n ?? 0);
};

/**
 * The last date an ending assignment still covers: today when today's session
 * already has a register (or has started), otherwise yesterday.
 */
export const endDateFor = async (scheduleId: number): Promise<string> => {
  const today = todayYmd();
  const [s] = await db
    .select()
    .from(OfficeHourSession)
    .where(and(eq(OfficeHourSession.schedule_id, scheduleId), eq(OfficeHourSession.session_date, today)))
    .limit(1);
  if (s && (s.status === "HELD" || (parseClock(s.start_time) ?? 0) <= nowMinutes())) return today;
  return addDaysYmd(today, -1);
};

export const endSchedule = async (actor: Actor, scheduleId: number) => {
  const schedule = await loadSchedule(scheduleId);
  assertCanManage(actor, schedule.teacher_id);
  if (schedule.status === "ENDED" || schedule.status === "CANCELLED") return schedule;
  if (schedule.status === "DRAFT") {
    await db.update(OfficeHourSchedule).set({ status: "CANCELLED", ended_at: now(), updated_by: actor.userId }).where(eq(OfficeHourSchedule.schedule_id, scheduleId));
    return loadSchedule(scheduleId);
  }
  const endYmd = maxYmd(minYmd(await endDateFor(scheduleId), schedule.effective_to), addDaysYmd(schedule.effective_from, -1));
  await db.transaction(async (tx) => {
    const active = await tx
      .select({ id: OfficeHourAssignment.assignment_id })
      .from(OfficeHourAssignment)
      .where(and(eq(OfficeHourAssignment.schedule_id, scheduleId), eq(OfficeHourAssignment.status, "ACTIVE")));
    const ids = active.map((a) => a.id);
    if (ids.length) {
      await tx
        .update(OfficeHourAssignment)
        .set({ status: "ENDED", end_reason_code: "SCHEDULE_ENDED", ended_by: actor.userId, ended_at: now() })
        .where(inArray(OfficeHourAssignment.assignment_id, ids));
      await tx
        .update(OfficeHourAssignment)
        .set({ effective_to: endYmd })
        .where(and(inArray(OfficeHourAssignment.assignment_id, ids), gte(OfficeHourAssignment.effective_to, addDaysYmd(endYmd, 1))));
      await tx.delete(OfficeHourStudentDateLock).where(inArray(OfficeHourStudentDateLock.assignment_id, ids));
    }
    await tx
      .update(OfficeHourSchedule)
      .set({ status: "ENDED", effective_to: endYmd < schedule.effective_from ? schedule.effective_from : endYmd, ended_at: now(), updated_by: actor.userId, version: sql`${OfficeHourSchedule.version} + 1` })
      .where(eq(OfficeHourSchedule.schedule_id, scheduleId));
  });
  const future = await db
    .select({ id: OfficeHourSession.session_id })
    .from(OfficeHourSession)
    .where(and(eq(OfficeHourSession.schedule_id, scheduleId), gte(OfficeHourSession.session_date, addDaysYmd(endYmd, 1)), eq(OfficeHourSession.status, "SCHEDULED")));
  const ids = future.map((f) => f.id);
  if (ids.length) {
    await db
      .update(OfficeHourSession)
      .set({ status: "CANCELLED", cancel_reason: "SCHEDULE_ENDED", cancelled_by: actor.userId, cancelled_at: now() })
      .where(inArray(OfficeHourSession.session_id, ids));
  }
  emitOfficeHoursEvent({ type: "schedule_ended", scheduleId, actorId: actor.userId });
  return loadSchedule(scheduleId);
};

export const deleteSchedule = async (actor: Actor, scheduleId: number) => {
  const schedule = await loadSchedule(scheduleId);
  assertCanManage(actor, schedule.teacher_id);
  const [held] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(OfficeHourSession)
    .where(and(eq(OfficeHourSession.schedule_id, scheduleId), eq(OfficeHourSession.status, "HELD")));
  if (Number(held?.n ?? 0) > 0) throw new ConflictError("Sessions were already held; end the schedule instead so the records stay");
  if (schedule.status === "ACTIVE" && (await countActive(scheduleId)) > 0) {
    throw new ConflictError("Students are assigned; end the schedule instead so they are told");
  }
  await db.delete(OfficeHourSchedule).where(eq(OfficeHourSchedule.schedule_id, scheduleId));
};

/** API shape of a schedule. */
export const serializeSchedules = async (rows: Schedule[]) => {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.schedule_id);
  const [days, names, subjects] = await Promise.all([
    scheduleDays(ids),
    userNames(rows.map((r) => r.teacher_id)),
    db.select({ id: Subject.subject_id, name: Subject.name, color: Subject.color }).from(Subject).where(inArray(Subject.subject_id, [...new Set(rows.map((r) => r.subject_id ?? 0))])),
  ]);
  const seats = await seatSummary(rows, days);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  return rows.map((r) => ({
    ...r,
    days: days.get(r.schedule_id) ?? [],
    days_label: dayLabel(days.get(r.schedule_id) ?? []),
    teacher_name: names.get(r.teacher_id) ?? null,
    subject_name: r.subject_id ? subjectById.get(r.subject_id)?.name ?? null : null,
    subject_color: r.subject_id ? subjectById.get(r.subject_id)?.color ?? null : null,
    // Busiest upcoming session (what capacity is about) and everyone invited across weeks.
    assigned_count: seats.get(r.schedule_id)?.peak ?? 0,
    invited_count: seats.get(r.schedule_id)?.invited ?? 0,
  }));
};

export const listSchedules = async (filter: {
  termId: number;
  teacherId?: number | null;
  subjectId?: number | null;
  status?: string | null;
  scheduleIds?: number[] | null;
}) => {
  const conds = [eq(OfficeHourSchedule.academic_term_id, filter.termId)];
  if (filter.teacherId) conds.push(eq(OfficeHourSchedule.teacher_id, filter.teacherId));
  if (filter.subjectId) conds.push(eq(OfficeHourSchedule.subject_id, filter.subjectId));
  if (filter.status) conds.push(eq(OfficeHourSchedule.status, filter.status as any));
  if (filter.scheduleIds) {
    if (!filter.scheduleIds.length) return [];
    conds.push(inArray(OfficeHourSchedule.schedule_id, filter.scheduleIds));
  }
  const rows = await db.select().from(OfficeHourSchedule).where(and(...conds)).orderBy(desc(OfficeHourSchedule.status), OfficeHourSchedule.title);
  return serializeSchedules(rows);
};

/** Sessions of the given schedules in [from, to], with expected/marked counts and derived state. */
export const sessionsBetween = async (params: { scheduleIds?: number[]; hostId?: number; fromYmd: string; toYmd: string }) => {
  const conds = [gte(OfficeHourSession.session_date, params.fromYmd), lte(OfficeHourSession.session_date, params.toYmd)];
  if (params.scheduleIds) {
    if (!params.scheduleIds.length) return [];
    conds.push(inArray(OfficeHourSession.schedule_id, params.scheduleIds));
  }
  if (params.hostId) conds.push(eq(OfficeHourSession.host_teacher_id, params.hostId));
  const rows = await db
    .select({ s: OfficeHourSession, title: OfficeHourSchedule.title, teacher_id: OfficeHourSchedule.teacher_id, subject_id: OfficeHourSchedule.subject_id })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(and(...conds))
    .orderBy(OfficeHourSession.session_date, OfficeHourSession.start_time);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.s.session_id);
  const counts = (await db.execute(sql`
    SELECT s.session_id,
      (SELECT COUNT(*) FROM OfficeHourAssignment a
        WHERE a.schedule_id = s.schedule_id AND a.effective_from <= s.session_date AND a.effective_to >= s.session_date) AS expected,
      (SELECT COUNT(*) FROM OfficeHourAttendance t WHERE t.session_id = s.session_id AND t.status IS NOT NULL AND t.is_drop_in = 0) AS marked,
      (SELECT COUNT(*) FROM OfficeHourAttendance t WHERE t.session_id = s.session_id AND t.status IN ('PRESENT','LATE','EXCUSED')) AS attended
    FROM OfficeHourSession s WHERE s.session_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
  `)) as any;
  const byId = new Map<number, any>((counts[0] as any[]).map((c) => [Number(c.session_id), c]));
  const hosts = await userNames(rows.map((r) => r.s.host_teacher_id));
  return rows.map((r) => ({
    ...r.s,
    title: r.title,
    teacher_id: r.teacher_id,
    subject_id: r.subject_id,
    host_name: hosts.get(r.s.host_teacher_id) ?? null,
    state: sessionState(r.s),
    expected: Number(byId.get(r.s.session_id)?.expected ?? 0),
    marked: Number(byId.get(r.s.session_id)?.marked ?? 0),
    attended: Number(byId.get(r.s.session_id)?.attended ?? 0),
  }));
};
