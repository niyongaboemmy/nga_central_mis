import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { Grade, ClassGroup, Parenting, StudentClassGroup, UserGrade, UserProgramLead, User } from "../../db/schema";
import { OfficeHourAssignment, OfficeHourEscalation, OfficeHourSchedule, OfficeHourSession } from "../../db/officeHoursSchema";
import { NotFoundError } from "../../errors/CustomError";
import { addDaysYmd } from "../reminders/time";
import { Actor, readScopeOf } from "./access";
import { isDupEntry, now, todayYmd } from "./common";
import { studentCards, userNames } from "./eligibility";
import { loadMarks, statsFromMarks } from "./metrics";
import { getSettings } from "./settings";

/**
 * Repeated-absence ladder (plan §13.4), per ACTIVE assignment:
 *   L1  consecutive ABSENT >= escalation_consecutive_l1, or ABSENT in the last
 *       30 days >= escalation_month_l1        -> student, host, class teacher
 *   L2  consecutive ABSENT >= escalation_consecutive_l2, or rate < watch once
 *       min_sessions_for_rate are held         -> + programme lead, parents (D4)
 * Only ABSENT counts (EXCUSED/LATE never escalate). Idempotent per
 * (assignment, level, trigger session). A level re-arms after the student
 * attends two sessions in a row.
 */
export type Trigger = "CONSECUTIVE_L1" | "MONTH_L1" | "CONSECUTIVE_L2" | "RATE_BELOW";

export interface NewEscalation {
  escalationId: number;
  assignmentId: number;
  studentId: number;
  scheduleId: number;
  teacherId: number;
  level: 1 | 2;
  trigger: Trigger;
  streak: number;
  rate: number | null;
}

/** Class teachers, programme leads and parents of a student this year. */
export const guardiansOf = async (studentId: number, yearId: number) => {
  const [placement] = await db
    .select({ class_group_id: StudentClassGroup.class_group_id, program_id: Grade.program_id })
    .from(StudentClassGroup)
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, StudentClassGroup.class_group_id))
    .innerJoin(Grade, eq(Grade.grade_id, ClassGroup.grade_id))
    .where(and(eq(StudentClassGroup.user_id, studentId), eq(StudentClassGroup.academic_year_id, yearId), eq(StudentClassGroup.status, "ACTIVE")))
    .limit(1);
  const classTeachers = placement
    ? (await db.select({ id: UserGrade.user_id }).from(UserGrade).where(and(eq(UserGrade.class_group_id, placement.class_group_id), eq(UserGrade.academic_year_id, yearId)))).map((r) => r.id)
    : [];
  const programLeads = placement?.program_id
    ? (await db.select({ id: UserProgramLead.user_id }).from(UserProgramLead).where(and(eq(UserProgramLead.program_id, placement.program_id), eq(UserProgramLead.academic_year_id, yearId)))).map((r) => r.id)
    : [];
  const parents = (
    await db
      .select({ id: Parenting.parent_id })
      .from(Parenting)
      .innerJoin(User, and(eq(User.user_id, Parenting.parent_id), eq(User.status, "ACTIVE")))
      .where(eq(Parenting.student_id, studentId))
  ).map((r) => r.id);
  return { classTeachers, programLeads, parents };
};

/** Date of the second of the latest two consecutive attended marks (PRESENT/LATE), or null. */
const rearmDate = (marks: Array<{ session_date: string; start_time: string; status: string }>) => {
  const ordered = [...marks].sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time));
  let run = 0;
  let last: string | null = null;
  for (const m of ordered) {
    if (m.status === "PRESENT" || m.status === "LATE") {
      run++;
      if (run >= 2) last = m.session_date;
    } else if (m.status === "ABSENT") run = 0;
  }
  return last;
};

/**
 * Evaluate the ladder for the given students' (or all) active assignments and
 * record new escalations. Returns what was created, for the notifier.
 */
export const evaluateEscalations = async (params: { studentIds?: number[]; assignmentIds?: number[] } = {}): Promise<NewEscalation[]> => {
  const settings = await getSettings();
  const conds = [eq(OfficeHourAssignment.status, "ACTIVE")];
  if (params.studentIds) {
    if (!params.studentIds.length) return [];
    conds.push(inArray(OfficeHourAssignment.student_id, params.studentIds));
  }
  if (params.assignmentIds) {
    if (!params.assignmentIds.length) return [];
    conds.push(inArray(OfficeHourAssignment.assignment_id, params.assignmentIds));
  }
  const assignments = await db
    .select({ a: OfficeHourAssignment, teacherId: OfficeHourSchedule.teacher_id })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(...conds));
  if (!assignments.length) return [];
  const marks = await loadMarks({ assignmentIds: assignments.map((x) => x.a.assignment_id) });
  const byAssignment = new Map<number, typeof marks>();
  for (const m of marks) if (m.assignment_id) byAssignment.set(m.assignment_id, [...(byAssignment.get(m.assignment_id) ?? []), m]);
  const previous = await db
    .select({ assignment_id: OfficeHourEscalation.assignment_id, level: OfficeHourEscalation.level, date: OfficeHourSession.session_date })
    .from(OfficeHourEscalation)
    .innerJoin(OfficeHourSession, eq(OfficeHourSession.session_id, OfficeHourEscalation.trigger_session_id))
    .where(inArray(OfficeHourEscalation.assignment_id, assignments.map((x) => x.a.assignment_id)));

  const monthStart = addDaysYmd(todayYmd(), -30);
  const created: NewEscalation[] = [];
  for (const { a, teacherId } of assignments) {
    const list = byAssignment.get(a.assignment_id) ?? [];
    if (!list.length) continue;
    const ordered = [...list].sort((x, y) => (x.session_date + x.start_time).localeCompare(y.session_date + y.start_time));
    const latestAbsent = [...ordered].reverse().find((m) => m.status === "ABSENT");
    if (!latestAbsent) continue;
    // Only act when the most recent mark is an absence: an escalation is about now.
    const latest = ordered[ordered.length - 1];
    if (latest.status !== "ABSENT") continue;
    const stats = statsFromMarks(ordered, settings);
    const monthAbsences = ordered.filter((m) => m.status === "ABSENT" && m.session_date >= monthStart).length;
    let level: 1 | 2 | 0 = 0;
    let trigger: Trigger | null = null;
    if (stats.current_absent_streak >= settings.escalation_consecutive_l2) {
      level = 2;
      trigger = "CONSECUTIVE_L2";
    } else if (stats.expected >= settings.min_sessions_for_rate && stats.rate !== null && stats.rate < settings.rate_band_watch) {
      level = 2;
      trigger = "RATE_BELOW";
    } else if (stats.current_absent_streak >= settings.escalation_consecutive_l1) {
      level = 1;
      trigger = "CONSECUTIVE_L1";
    } else if (monthAbsences >= settings.escalation_month_l1) {
      level = 1;
      trigger = "MONTH_L1";
    }
    if (!level || !trigger) continue;
    const rearm = rearmDate(ordered);
    const prior = previous.filter((p) => p.assignment_id === a.assignment_id && p.level === level);
    if (prior.some((p) => !rearm || p.date >= rearm)) continue;
    try {
      const [res] = (await db.insert(OfficeHourEscalation).values({
        student_id: a.student_id,
        assignment_id: a.assignment_id,
        academic_term_id: a.academic_term_id,
        level,
        trigger_code: trigger,
        trigger_session_id: latestAbsent.session_id,
        created_at: now(),
      })) as any;
      created.push({
        escalationId: res.insertId as number,
        assignmentId: a.assignment_id,
        studentId: a.student_id,
        scheduleId: a.schedule_id,
        teacherId,
        level,
        trigger,
        streak: stats.current_absent_streak,
        rate: stats.rate,
      });
    } catch (error) {
      if (!isDupEntry(error)) throw error;
    }
  }
  return created;
};

export const recordNotified = async (escalationId: number, userIds: number[]) => {
  await db.update(OfficeHourEscalation).set({ notified_user_ids: JSON.stringify([...new Set(userIds)]) }).where(eq(OfficeHourEscalation.escalation_id, escalationId));
};

/** Open (or all) escalations the actor may see, newest first. */
export const listEscalations = async (actor: Actor, termId: number, yearId: number, status: "open" | "all") => {
  const scope = await readScopeOf(actor, yearId);
  const conds = [eq(OfficeHourEscalation.academic_term_id, termId)];
  if (status === "open") conds.push(isNull(OfficeHourEscalation.acknowledged_at));
  const rows = await db
    .select({ e: OfficeHourEscalation, title: OfficeHourSchedule.title, teacher_id: OfficeHourSchedule.teacher_id, session_date: OfficeHourSession.session_date })
    .from(OfficeHourEscalation)
    .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourEscalation.assignment_id))
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .innerJoin(OfficeHourSession, eq(OfficeHourSession.session_id, OfficeHourEscalation.trigger_session_id))
    .where(and(...conds))
    .orderBy(desc(OfficeHourEscalation.created_at))
    .limit(500);
  const cards = await studentCards(rows.map((r) => r.e.student_id), yearId);
  const names = await userNames([...rows.map((r) => r.teacher_id), ...rows.map((r) => r.e.acknowledged_by ?? 0)]);
  return rows
    .filter((r) => {
      if (scope.kind === "school") return true;
      if (scope.kind === "classGroups") return scope.classGroupIds.includes(cards.get(r.e.student_id)?.class_group_id ?? 0) || r.teacher_id === actor.userId;
      return r.teacher_id === actor.userId;
    })
    .map((r) => ({
      ...r.e,
      student: cards.get(r.e.student_id) ?? null,
      title: r.title,
      teacher_id: r.teacher_id,
      teacher_name: names.get(r.teacher_id) ?? null,
      last_missed: r.session_date,
      acknowledged_by_name: r.e.acknowledged_by ? names.get(r.e.acknowledged_by) ?? null : null,
    }));
};

export const acknowledgeEscalation = async (actor: Actor, escalationId: number, note: unknown) => {
  const [row] = await db
    .select({ e: OfficeHourEscalation, teacher_id: OfficeHourSchedule.teacher_id, year: OfficeHourSchedule.academic_year_id })
    .from(OfficeHourEscalation)
    .innerJoin(OfficeHourAssignment, eq(OfficeHourAssignment.assignment_id, OfficeHourEscalation.assignment_id))
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(eq(OfficeHourEscalation.escalation_id, escalationId))
    .limit(1);
  if (!row) throw new NotFoundError("Escalation not found");
  const visible = await listEscalations(actor, row.e.academic_term_id, row.year, "all");
  if (!visible.some((v) => v.escalation_id === escalationId)) throw new NotFoundError("Escalation not found");
  await db
    .update(OfficeHourEscalation)
    .set({ acknowledged_by: actor.userId, acknowledged_at: now(), resolution_note: typeof note === "string" ? note.trim().slice(0, 500) || null : null })
    .where(and(eq(OfficeHourEscalation.escalation_id, escalationId), sql`${OfficeHourEscalation.acknowledged_at} IS NULL`));
};
