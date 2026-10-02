import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db";
import { Parenting, StudentClassGroup, Subject } from "../../db/schema";
import {
  OfficeHourAssignment,
  OfficeHourAttendance,
  OfficeHourSchedule,
  OfficeHourSession,
} from "../../db/officeHoursSchema";
import { AuthorizationError } from "../../errors/CustomError";
import { addDaysYmd } from "../reminders/time";
import { Actor, readScopeOf } from "./access";
import { dayLabel, loadTerm, todayYmd } from "./common";
import { userNames } from "./eligibility";
import { ensureSessions, scheduleDays, sessionState } from "./sessions";

/**
 * Read models for students, parents and the timetable band (plan §8, §10).
 * Student-facing shapes never carry reason codes, staff notes or other
 * students: office hours read as "Office hours with Ms A -- Mathematics".
 */

/** May `actor` see `studentId`'s office hours? Self, a linked parent, or staff with area view. */
export const assertCanSeeStudent = async (actor: Actor, studentId: number, yearId: number) => {
  if (studentId === actor.userId) return;
  const [link] = await db
    .select({ id: Parenting.parent_id })
    .from(Parenting)
    .where(and(eq(Parenting.parent_id, actor.userId), eq(Parenting.student_id, studentId)))
    .limit(1);
  if (link) return;
  const scope = await readScopeOf(actor, yearId);
  if (scope.kind === "school") return;
  if (scope.kind === "classGroups") {
    const [row] = await db
      .select({ g: StudentClassGroup.class_group_id })
      .from(StudentClassGroup)
      .where(and(eq(StudentClassGroup.user_id, studentId), eq(StudentClassGroup.academic_year_id, yearId), inArray(StudentClassGroup.class_group_id, scope.classGroupIds.length ? scope.classGroupIds : [0])))
      .limit(1);
    if (row) return;
  }
  // A teacher may always see a student they hold in their own office hours.
  const [mine] = await db
    .select({ id: OfficeHourAssignment.assignment_id })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(eq(OfficeHourAssignment.student_id, studentId), eq(OfficeHourSchedule.teacher_id, actor.userId)))
    .limit(1);
  if (mine) return;
  throw new AuthorizationError("You cannot see this student's office hours");
};

/** Children linked to a parent (for the parent card). */
export const childrenOf = async (parentId: number) => {
  const rows = await db.select({ id: Parenting.student_id }).from(Parenting).where(eq(Parenting.parent_id, parentId));
  return rows.map((r) => r.id);
};

/** A student's office hours this term: assignments, the next sessions and their session history. */
export const studentOverview = async (studentId: number, termId: number) => {
  const term = await loadTerm(termId);
  const rows = await db
    .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(eq(OfficeHourAssignment.student_id, studentId), eq(OfficeHourAssignment.academic_term_id, termId)))
    .orderBy(OfficeHourAssignment.effective_from);
  const scheduleIds = [...new Set(rows.map((r) => r.s.schedule_id))];
  for (const r of rows) if (r.s.status === "ACTIVE" && r.a.status === "ACTIVE") await ensureSessions(r.s.schedule_id);
  const [days, teachers, subjects] = await Promise.all([
    scheduleDays(scheduleIds),
    userNames(rows.map((r) => r.s.teacher_id)),
    db.select({ id: Subject.subject_id, name: Subject.name, color: Subject.color }).from(Subject).where(inArray(Subject.subject_id, rows.map((r) => r.s.subject_id ?? 0).concat([0]))),
  ]);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const assignments = rows.map(({ a, s }) => ({
    assignment_id: a.assignment_id,
    schedule_id: s.schedule_id,
    status: a.status,
    effective_from: a.effective_from,
    effective_to: a.effective_to,
    title: s.title,
    teacher_id: s.teacher_id,
    teacher_name: teachers.get(s.teacher_id) ?? null,
    subject_name: s.subject_id ? subjectById.get(s.subject_id)?.name ?? null : null,
    subject_color: s.subject_id ? subjectById.get(s.subject_id)?.color ?? null : null,
    days: days.get(s.schedule_id) ?? [],
    days_label: dayLabel(days.get(s.schedule_id) ?? []),
    start_time: s.start_time,
    end_time: s.end_time,
    location: s.location,
  }));

  // Every session the student was (or is) expected at, with their mark.
  const sessions = scheduleIds.length
    ? await db
        .select({ s: OfficeHourSession, att: OfficeHourAttendance })
        .from(OfficeHourSession)
        .leftJoin(
          OfficeHourAttendance,
          and(eq(OfficeHourAttendance.session_id, OfficeHourSession.session_id), eq(OfficeHourAttendance.student_id, studentId)),
        )
        .where(and(inArray(OfficeHourSession.schedule_id, scheduleIds), gte(OfficeHourSession.session_date, term.startYmd), lte(OfficeHourSession.session_date, term.endYmd)))
        .orderBy(OfficeHourSession.session_date)
    : [];
  const byAssignment = new Map(assignments.map((a) => [a.schedule_id, assignments.filter((x) => x.schedule_id === a.schedule_id)]));
  const covered = (scheduleId: number, ymd: string) =>
    (byAssignment.get(scheduleId) ?? []).some((a) => a.effective_from <= ymd && ymd <= a.effective_to);
  const assignmentBySchedule = new Map(assignments.map((a) => [a.schedule_id, a]));
  const timeline = sessions
    .filter((x) => covered(x.s.schedule_id, x.s.session_date) || x.att)
    .map((x) => ({
      session_id: x.s.session_id,
      schedule_id: x.s.schedule_id,
      session_date: x.s.session_date,
      start_time: x.s.start_time,
      end_time: x.s.end_time,
      location: x.s.location,
      title: assignmentBySchedule.get(x.s.schedule_id)?.title ?? null,
      teacher_name: assignmentBySchedule.get(x.s.schedule_id)?.teacher_name ?? null,
      state: sessionState(x.s),
      cancel_reason: x.s.status === "CANCELLED" ? x.s.cancel_reason : null,
      status: x.att?.status ?? null,
      arrived_at: x.att?.arrived_at ?? null,
    }));
  const today = todayYmd();
  const horizon = addDaysYmd(today, 14);
  return {
    term: { academic_term_id: term.termId, name: term.name, start_date: term.startYmd, end_date: term.endYmd },
    assignments,
    upcoming: timeline.filter((t) => t.session_date >= today && t.session_date <= horizon && t.state !== "cancelled" && t.state !== "held").slice(0, 10),
    history: timeline.filter((t) => t.session_date <= today).reverse(),
  };
};

export interface BandEntry {
  day_of_week: number;
  schedule_id: number | null;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  color: string | null;
  role: "hosting" | "attending" | "summary";
  teacher_name: string | null;
  count: number;
}

const activeSchedulesWithDays = async (conds: any[]) => {
  const rows = await db.select().from(OfficeHourSchedule).where(and(eq(OfficeHourSchedule.status, "ACTIVE"), ...conds));
  const days = await scheduleDays(rows.map((r) => r.schedule_id));
  return { rows, days };
};

/**
 * What the 16:20 band shows the viewer (plan §8): a teacher's own office hours,
 * a student's assigned ones, or -- on a class-group grid -- per-day counts with
 * teacher names and no student names.
 */
export const bandFor = async (actor: Actor, termId: number, opts: { classGroupId?: number | null; asOf?: string }) => {
  const today = opts.asOf ?? todayYmd();
  const entries: BandEntry[] = [];

  if (opts.classGroupId) {
    const term = await loadTerm(termId);
    const scope = await readScopeOf(actor, term.yearId);
    const allowed = scope.kind === "school" || (scope.kind === "classGroups" && scope.classGroupIds.includes(opts.classGroupId));
    if (!allowed) return { entries, mode: "none" as const };
    const rows = await db
      .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
      .from(OfficeHourAssignment)
      .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
      .innerJoin(
        StudentClassGroup,
        and(
          eq(StudentClassGroup.user_id, OfficeHourAssignment.student_id),
          eq(StudentClassGroup.academic_year_id, OfficeHourSchedule.academic_year_id),
          eq(StudentClassGroup.class_group_id, opts.classGroupId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      )
      .where(and(eq(OfficeHourAssignment.academic_term_id, termId), eq(OfficeHourAssignment.status, "ACTIVE"), eq(OfficeHourSchedule.status, "ACTIVE")));
    const days = await scheduleDays([...new Set(rows.map((r) => r.s.schedule_id))]);
    const teachers = await userNames(rows.map((r) => r.s.teacher_id));
    const byDay = new Map<number, { count: number; teachers: Set<string> }>();
    for (const r of rows) {
      for (const d of days.get(r.s.schedule_id) ?? []) {
        const cur = byDay.get(d) ?? { count: 0, teachers: new Set<string>() };
        cur.count++;
        cur.teachers.add(teachers.get(r.s.teacher_id) ?? "Teacher");
        byDay.set(d, cur);
      }
    }
    for (const [d, v] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
      entries.push({
        day_of_week: d,
        schedule_id: null,
        title: `${v.count} student${v.count === 1 ? "" : "s"} in office hours`,
        start_time: "",
        end_time: "",
        location: null,
        color: null,
        role: "summary",
        teacher_name: [...v.teachers].join(", "),
        count: v.count,
      });
    }
    return { entries, mode: "class_group" as const };
  }

  const subjectsOf = async (ids: number[]) => {
    const rows = await db.select({ id: Subject.subject_id, color: Subject.color }).from(Subject).where(inArray(Subject.subject_id, ids.concat([0])));
    return new Map(rows.map((r) => [r.id, r.color]));
  };

  if (actor.manageOwn || actor.manageAny) {
    const { rows, days } = await activeSchedulesWithDays([eq(OfficeHourSchedule.teacher_id, actor.userId), eq(OfficeHourSchedule.academic_term_id, termId), gte(OfficeHourSchedule.effective_to, today)]);
    const colors = await subjectsOf(rows.map((r) => r.subject_id ?? 0));
    const counts = rows.length
      ? await db
          .select({ id: OfficeHourAssignment.schedule_id })
          .from(OfficeHourAssignment)
          .where(and(inArray(OfficeHourAssignment.schedule_id, rows.map((r) => r.schedule_id)), eq(OfficeHourAssignment.status, "ACTIVE")))
      : [];
    for (const r of rows) {
      for (const d of days.get(r.schedule_id) ?? []) {
        entries.push({
          day_of_week: d,
          schedule_id: r.schedule_id,
          title: r.title,
          start_time: r.start_time,
          end_time: r.end_time,
          location: r.location,
          color: r.subject_id ? colors.get(r.subject_id) ?? null : null,
          role: "hosting",
          teacher_name: null,
          count: counts.filter((c) => c.id === r.schedule_id).length,
        });
      }
    }
  }

  const mine = await db
    .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(eq(OfficeHourAssignment.student_id, actor.userId), eq(OfficeHourAssignment.academic_term_id, termId), eq(OfficeHourAssignment.status, "ACTIVE"), eq(OfficeHourSchedule.status, "ACTIVE")));
  if (mine.length) {
    const days = await scheduleDays(mine.map((m) => m.s.schedule_id));
    const teachers = await userNames(mine.map((m) => m.s.teacher_id));
    const colors = await subjectsOf(mine.map((m) => m.s.subject_id ?? 0));
    for (const { s } of mine) {
      for (const d of days.get(s.schedule_id) ?? []) {
        entries.push({
          day_of_week: d,
          schedule_id: s.schedule_id,
          title: s.title,
          start_time: s.start_time,
          end_time: s.end_time,
          location: s.location,
          color: s.subject_id ? colors.get(s.subject_id) ?? null : null,
          role: "attending",
          teacher_name: teachers.get(s.teacher_id) ?? null,
          count: 0,
        });
      }
    }
  }
  entries.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  return { entries, mode: "personal" as const };
};

