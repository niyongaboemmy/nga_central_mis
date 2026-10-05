import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { ClassGroup, Grade, Permission, Program, Role, StudentClassGroup, Subject, UserRole } from "../../db/schema";
import { AccessRolePermission } from "../../db/accessSchema";
import {
  OfficeHourAssignment,
  OfficeHourAttendance,
  OfficeHourEscalation,
  OfficeHourSchedule,
  OfficeHourSession,
} from "../../db/officeHoursSchema";
import { AuthorizationError, ValidationError } from "../../errors/CustomError";
import { dowOfYmd, kigaliParts, parseClock } from "../reminders/time";
import { Actor, readScopeOf } from "./access";
import { DAY_NAMES, isoDowOfYmd, todayYmd, nowMinutes, loadTerm } from "./common";
import { userNames } from "./eligibility";
import { Band, Mark, statsFromMarks, StudentStats } from "./metrics";
import { bucketOf, ResolvedPeriod } from "./period";
import { getSettings } from "./settings";
import { assertCanSeeStudent } from "./views";

/**
 * Office-hours reports (plan §14). One dataset per request -- sessions in the
 * period, who was expected at each, the marks and the students' placements --
 * scoped to the viewer (own office hours, their class groups / programme, or
 * the school), then every view is derived from it with the shared formulas in
 * metrics.ts. Volumes are small (~70k marks a year), so this stays in memory.
 */

type SessionRow = typeof OfficeHourSession.$inferSelect;
type ScheduleRow = typeof OfficeHourSchedule.$inferSelect;

interface Placement {
  class_group_id: number;
  class_group_name: string | null;
  grade_id: number | null;
  grade_name: string | null;
  program_id: number | null;
  program_name: string | null;
}

interface Dataset {
  sessions: Array<{ s: SessionRow; sch: ScheduleRow }>;
  expected: Map<number, number[]>; // session -> student ids (in scope)
  marks: Array<Mark & { session_id: number; schedule_id: number; is_drop_in: number; assignment_id: number | null }>;
  placements: Map<string, Placement>; // `${student}:${year}`
  subjects: Map<number, { name: string; color: string | null }>;
  inScope: (studentId: number, yearId: number) => boolean;
  scopeKind: "school" | "classGroups" | "own";
}

/** Summary-depth viewers (aggregates only) never see student names. */
export const namesAllowed = async (actor: Actor) => {
  if (actor.manageAny || actor.manageOwn) return true;
  if (!actor.view) return false;
  const rows = await db
    .select({ depth: AccessRolePermission.depth })
    .from(UserRole)
    .innerJoin(Role, and(eq(Role.role_id, UserRole.role_id), eq(Role.status, "ACTIVE")))
    .innerJoin(AccessRolePermission, eq(AccessRolePermission.role_id, Role.role_id))
    .innerJoin(Permission, and(eq(Permission.perm_id, AccessRolePermission.perm_id), eq(Permission.name, "OFFICE_HOURS_VIEW")))
    .where(eq(UserRole.user_id, actor.userId));
  return rows.length === 0 || rows.some((r) => r.depth !== "summary");
};

const sessionEnded = (s: Pick<SessionRow, "session_date" | "end_time">) => {
  const today = todayYmd();
  return s.session_date < today || (s.session_date === today && nowMinutes() >= (parseClock(s.end_time) ?? 0));
};

export interface ReportFilter {
  termId?: number | null;
  teacherId?: number | null;
  subjectId?: number | null;
  classGroupId?: number | null;
  scheduleId?: number | null;
}

export const loadDataset = async (actor: Actor, from: string, to: string, filter: ReportFilter = {}): Promise<Dataset> => {
  // The viewer's area is resolved for the filtered term's year (else the current year).
  const yearId = filter.termId ? (await loadTerm(filter.termId)).yearId : null;
  const scope = await readScopeOf(actor, yearId);
  const conds = [gte(OfficeHourSession.session_date, from), lte(OfficeHourSession.session_date, to)];
  if (filter.termId) conds.push(eq(OfficeHourSession.academic_term_id, filter.termId));
  if (scope.kind === "own") conds.push(or(eq(OfficeHourSchedule.teacher_id, actor.userId), eq(OfficeHourSession.host_teacher_id, actor.userId))!);
  if (filter.teacherId) conds.push(eq(OfficeHourSchedule.teacher_id, filter.teacherId));
  if (filter.subjectId) conds.push(eq(OfficeHourSchedule.subject_id, filter.subjectId));
  if (filter.scheduleId) conds.push(eq(OfficeHourSchedule.schedule_id, filter.scheduleId));
  const sessions = await db
    .select({ s: OfficeHourSession, sch: OfficeHourSchedule })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .where(and(...conds));
  const scheduleIds = [...new Set(sessions.map((x) => x.s.schedule_id))];
  const assignments = scheduleIds.length
    ? await db.select().from(OfficeHourAssignment).where(inArray(OfficeHourAssignment.schedule_id, scheduleIds))
    : [];
  const sessionIds = sessions.map((x) => x.s.session_id);
  const rawMarks = sessionIds.length
    ? await db
        .select({
          student_id: OfficeHourAttendance.student_id,
          session_id: OfficeHourAttendance.session_id,
          status: OfficeHourAttendance.status,
          is_drop_in: OfficeHourAttendance.is_drop_in,
          assignment_id: OfficeHourAttendance.assignment_id,
        })
        .from(OfficeHourAttendance)
        .where(and(inArray(OfficeHourAttendance.session_id, sessionIds), sql`${OfficeHourAttendance.status} IS NOT NULL`))
    : [];

  // Placements of every student involved, per academic year.
  const studentIds = [...new Set([...assignments.map((a) => a.student_id), ...rawMarks.map((m) => m.student_id)])];
  const years = [...new Set(sessions.map((x) => x.sch.academic_year_id))];
  const placements = new Map<string, Placement>();
  if (studentIds.length && years.length) {
    const rows = await db
      .select({
        user_id: StudentClassGroup.user_id,
        year: StudentClassGroup.academic_year_id,
        class_group_id: StudentClassGroup.class_group_id,
        class_group_name: ClassGroup.name,
        grade_id: Grade.grade_id,
        grade_name: Grade.name,
        program_id: Program.program_id,
        program_name: Program.name,
      })
      .from(StudentClassGroup)
      .leftJoin(ClassGroup, eq(ClassGroup.class_group_id, StudentClassGroup.class_group_id))
      .leftJoin(Grade, eq(Grade.grade_id, ClassGroup.grade_id))
      .leftJoin(Program, eq(Program.program_id, Grade.program_id))
      .where(and(inArray(StudentClassGroup.user_id, studentIds), inArray(StudentClassGroup.academic_year_id, years)));
    for (const r of rows) placements.set(`${r.user_id}:${r.year}`, r as Placement);
  }
  const allowedGroups = scope.kind === "classGroups" ? new Set(scope.classGroupIds) : null;
  const inScope = (studentId: number, yearId: number) => {
    const p = placements.get(`${studentId}:${yearId}`);
    if (filter.classGroupId && p?.class_group_id !== filter.classGroupId) return false;
    if (!allowedGroups) return true;
    return Boolean(p && allowedGroups.has(p.class_group_id));
  };

  const expected = new Map<number, number[]>();
  const yearOfSchedule = new Map(sessions.map((x) => [x.sch.schedule_id, x.sch.academic_year_id]));
  for (const { s, sch } of sessions) {
    const ids = assignments
      .filter((a) => a.schedule_id === s.schedule_id && a.effective_from <= s.session_date && a.effective_to >= s.session_date)
      .map((a) => a.student_id)
      .filter((id) => inScope(id, sch.academic_year_id));
    expected.set(s.session_id, ids);
  }
  const sessionById = new Map(sessions.map((x) => [x.s.session_id, x]));
  const marks = rawMarks
    .filter((m) => {
      const x = sessionById.get(m.session_id);
      return x && x.s.status === "HELD" && inScope(m.student_id, yearOfSchedule.get(x.s.schedule_id) ?? 0);
    })
    .map((m) => {
      const x = sessionById.get(m.session_id)!;
      return { ...m, status: m.status!, session_date: x.s.session_date, start_time: x.s.start_time, schedule_id: x.s.schedule_id };
    });
  const subjectIds = [...new Set(sessions.map((x) => x.sch.subject_id ?? 0))];
  const subjects = new Map(
    (await db.select({ id: Subject.subject_id, name: Subject.name, color: Subject.color }).from(Subject).where(inArray(Subject.subject_id, subjectIds.concat([0])))).map((r) => [r.id, { name: r.name, color: r.color }]),
  );
  // Sessions with nobody (in scope) expected say nothing; drop them.
  const relevant = sessions.filter((x) => (expected.get(x.s.session_id)?.length ?? 0) > 0 || marks.some((m) => m.session_id === x.s.session_id));
  return { sessions: relevant, expected, marks, placements, subjects, inScope, scopeKind: scope.kind };
};

const sessionKpis = (ds: Dataset, sessions = ds.sessions) => {
  const live = sessions.filter((x) => x.s.status !== "CANCELLED");
  const past = live.filter((x) => sessionEnded(x.s));
  const held = live.filter((x) => x.s.status === "HELD");
  const unmarked = past.filter((x) => x.s.status === "SCHEDULED");
  // A session moved to another date is not a cancellation: the new one counts instead.
  const cancelled = sessions.filter((x) => x.s.status === "CANCELLED" && x.s.cancel_reason !== "MOVED");
  const cancelledBy: Record<string, number> = {};
  for (const c of cancelled) cancelledBy[c.s.cancel_reason ?? "OTHER"] = (cancelledBy[c.s.cancel_reason ?? "OTHER"] ?? 0) + 1;
  return {
    planned: live.length,
    due: past.length,
    held: held.length,
    unmarked: unmarked.length,
    cancelled: cancelled.length,
    cancelled_by_reason: cancelledBy,
    delivery_rate: past.length ? Math.round((held.filter((h) => sessionEnded(h.s)).length / past.length) * 1000) / 10 : null,
  };
};

const studentStatsMap = (ds: Dataset, settings: Awaited<ReturnType<typeof getSettings>>, marks = ds.marks) => {
  const byStudent = new Map<number, Mark[]>();
  for (const m of marks) if (!m.is_drop_in) byStudent.set(m.student_id, [...(byStudent.get(m.student_id) ?? []), m]);
  const out = new Map<number, StudentStats>();
  for (const [id, list] of byStudent) out.set(id, statsFromMarks(list, settings));
  return out;
};

const bandCounts = (stats: Map<number, StudentStats>) => {
  const counts: Record<Band, number> = { CONSISTENT: 0, WATCH: 0, CHRONIC: 0, TOO_FEW: 0 };
  for (const s of stats.values()) counts[s.band]++;
  return counts;
};

const kpisOf = async (ds: Dataset) => {
  const settings = await getSettings();
  const counted = ds.marks.filter((m) => !m.is_drop_in);
  const overall = statsFromMarks(counted, settings);
  const stats = studentStatsMap(ds, settings);
  return {
    ...sessionKpis(ds),
    expected_attendances: overall.expected,
    present: overall.present,
    late: overall.late,
    absent: overall.absent,
    excused: overall.excused,
    attendance_rate: overall.rate,
    presence_rate: overall.presence_rate,
    punctuality: overall.present + overall.late ? Math.round((overall.present / (overall.present + overall.late)) * 1000) / 10 : null,
    drop_ins: ds.marks.filter((m) => m.is_drop_in).length,
    students: stats.size,
    bands: bandCounts(stats),
  };
};

export const summaryReport = async (actor: Actor, period: ResolvedPeriod, filter: ReportFilter = {}) => {
  const ds = await loadDataset(actor, period.from, period.to, filter);
  const kpis = await kpisOf(ds);
  const previous = period.previous ? await kpisOf(await loadDataset(actor, period.previous.from, period.previous.to, filter)) : null;
  const settings = await getSettings();
  // Time series.
  const buckets = new Map<string, { label: string; planned: number; held: number; marks: Mark[] }>();
  for (const x of ds.sessions) {
    const b = bucketOf(x.s.session_date, period.bucket);
    const cur = buckets.get(b.key) ?? { label: b.label, planned: 0, held: 0, marks: [] };
    if (x.s.status !== "CANCELLED") cur.planned++;
    if (x.s.status === "HELD") cur.held++;
    buckets.set(b.key, cur);
  }
  for (const m of ds.marks) {
    if (m.is_drop_in) continue;
    const b = bucketOf(m.session_date, period.bucket);
    const cur = buckets.get(b.key);
    if (cur) cur.marks.push(m);
  }
  const series = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({ key, label: v.label, planned: v.planned, held: v.held, attendance_rate: statsFromMarks(v.marks, settings).rate }));
  // Utilisation and coverage (leadership views only).
  const utilisation = await utilisationOf(ds, period);
  return { period, scope: ds.scopeKind, kpis, previous, series, utilisation };
};

const utilisationOf = async (ds: Dataset, period: ResolvedPeriod) => {
  const scheduleIds = [...new Set(ds.sessions.map((x) => x.sch.schedule_id))];
  if (!scheduleIds.length) return null;
  const capacity = [...new Map(ds.sessions.map((x) => [x.sch.schedule_id, x.sch.capacity])).values()].reduce((a, b) => a + b, 0);
  const assigned = (
    await db
      .select({ n: sql<number>`COUNT(DISTINCT ${OfficeHourAssignment.assignment_id})` })
      .from(OfficeHourAssignment)
      .where(and(inArray(OfficeHourAssignment.schedule_id, scheduleIds), lte(OfficeHourAssignment.effective_from, period.to), gte(OfficeHourAssignment.effective_to, period.from)))
  )[0];
  const n = Number(assigned?.n ?? 0);
  return { assigned: n, capacity, rate: capacity ? Math.round((n / capacity) * 1000) / 10 : null };
};

export type GroupBy = "teacher" | "subject" | "class_group" | "grade" | "program" | "weekday" | "purpose";
export const GROUP_BYS: GroupBy[] = ["teacher", "subject", "class_group", "grade", "program", "weekday", "purpose"];

export const breakdownReport = async (actor: Actor, period: ResolvedPeriod, groupBy: GroupBy, filter: ReportFilter = {}) => {
  if (!GROUP_BYS.includes(groupBy)) throw new ValidationError(`group_by must be one of ${GROUP_BYS.join(", ")}`);
  const ds = await loadDataset(actor, period.from, period.to, filter);
  const settings = await getSettings();
  const teacherNames = await userNames(ds.sessions.map((x) => x.sch.teacher_id));
  const sessionById = new Map(ds.sessions.map((x) => [x.s.session_id, x]));
  const placementOf = (studentId: number, sessionId: number) => {
    const x = sessionById.get(sessionId);
    return x ? ds.placements.get(`${studentId}:${x.sch.academic_year_id}`) : undefined;
  };
  // Session-level keys (teacher, subject, weekday, purpose) vs student-level keys (placement).
  const sessionKey = (x: Dataset["sessions"][number]): [string, string] => {
    if (groupBy === "teacher") return [`t${x.sch.teacher_id}`, teacherNames.get(x.sch.teacher_id) ?? "Teacher"];
    if (groupBy === "subject") return [`s${x.sch.subject_id ?? 0}`, x.sch.subject_id ? ds.subjects.get(x.sch.subject_id)?.name ?? "Subject" : "No subject"];
    if (groupBy === "weekday") {
      const d = isoDowOfYmd(x.s.session_date);
      return [`d${d}`, DAY_NAMES[d]];
    }
    return [`p${x.sch.purpose}`, x.sch.purpose];
  };
  const studentKey = (p: Placement | undefined): [string, string] => {
    if (!p) return ["none", "Not placed"];
    if (groupBy === "class_group") return [`c${p.class_group_id}`, p.class_group_name ?? "Class"];
    if (groupBy === "grade") return [`g${p.grade_id}`, p.grade_name ?? "Grade"];
    return [`r${p.program_id}`, p.program_name ?? "Programme"];
  };
  const perStudentLevel = groupBy === "class_group" || groupBy === "grade" || groupBy === "program";
  const groups = new Map<string, { label: string; sessions: Set<number>; marks: typeof ds.marks; students: Set<number> }>();
  const touch = (key: string, label: string) => {
    const g = groups.get(key) ?? { label, sessions: new Set<number>(), marks: [], students: new Set<number>() };
    groups.set(key, g);
    return g;
  };
  for (const x of ds.sessions) {
    if (perStudentLevel) {
      for (const id of ds.expected.get(x.s.session_id) ?? []) {
        const [k, l] = studentKey(ds.placements.get(`${id}:${x.sch.academic_year_id}`));
        touch(k, l).sessions.add(x.s.session_id);
      }
    } else {
      const [k, l] = sessionKey(x);
      touch(k, l).sessions.add(x.s.session_id);
    }
  }
  for (const m of ds.marks) {
    if (m.is_drop_in) continue;
    const [k, l] = perStudentLevel ? studentKey(placementOf(m.student_id, m.session_id)) : sessionKey(sessionById.get(m.session_id)!);
    const g = touch(k, l);
    g.marks.push(m);
    g.students.add(m.student_id);
  }
  const rows = [...groups.entries()].map(([key, g]) => {
    const sessions = ds.sessions.filter((x) => g.sessions.has(x.s.session_id));
    const k = sessionKpis(ds, sessions);
    const overall = statsFromMarks(g.marks, settings);
    const byStudent = new Map<number, Mark[]>();
    for (const m of g.marks) byStudent.set(m.student_id, [...(byStudent.get(m.student_id) ?? []), m]);
    const bands = { CONSISTENT: 0, WATCH: 0, CHRONIC: 0, TOO_FEW: 0 } as Record<Band, number>;
    for (const list of byStudent.values()) bands[statsFromMarks(list, settings).band]++;
    return {
      key,
      label: g.label,
      planned: k.planned,
      held: k.held,
      unmarked: k.unmarked,
      cancelled: k.cancelled,
      delivery_rate: k.delivery_rate,
      expected_attendances: overall.expected,
      attended: overall.present + overall.late + overall.excused,
      absent: overall.absent,
      attendance_rate: overall.rate,
      presence_rate: overall.presence_rate,
      students: g.students.size,
      bands,
    };
  });
  rows.sort((a, b) => a.label.localeCompare(b.label));
  return { period, group_by: groupBy, rows };
};

/** Who is consistently coming and who is not (plan §14.3). */
export const consistencyReport = async (actor: Actor, period: ResolvedPeriod, filter: ReportFilter = {}) => {
  if (!(await namesAllowed(actor))) throw new AuthorizationError("Your access shows totals only, not individual students");
  const ds = await loadDataset(actor, period.from, period.to, filter);
  const settings = await getSettings();
  const stats = studentStatsMap(ds, settings);
  const sessionById = new Map(ds.sessions.map((x) => [x.s.session_id, x]));
  const teachers = await userNames(ds.sessions.map((x) => x.sch.teacher_id));
  const names = await userNames([...stats.keys()]);
  const rows = [...stats.entries()].map(([id, s]) => {
    const mine = ds.marks.filter((m) => m.student_id === id);
    const x = sessionById.get(mine[mine.length - 1]?.session_id ?? 0);
    const placement = x ? ds.placements.get(`${id}:${x.sch.academic_year_id}`) : undefined;
    const office = [...new Set(mine.map((m) => sessionById.get(m.session_id)).filter(Boolean).map((v) => `${v!.sch.title} (${teachers.get(v!.sch.teacher_id) ?? "teacher"})`))];
    return { student_id: id, name: names.get(id) ?? "Student", class_group_name: placement?.class_group_name ?? null, office_hours: office, ...s };
  });
  const sortByRate = (a: (typeof rows)[number], b: (typeof rows)[number]) => (a.rate ?? 101) - (b.rate ?? 101) || b.current_absent_streak - a.current_absent_streak;
  return {
    period,
    thresholds: { consistent: settings.rate_band_consistent, watch: settings.rate_band_watch, min_sessions: settings.min_sessions_for_rate },
    consistent: rows.filter((r) => r.band === "CONSISTENT").sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)),
    watch: rows.filter((r) => r.band === "WATCH").sort(sortByRate),
    chronic: rows.filter((r) => r.band === "CHRONIC").sort(sortByRate),
    too_few: rows.filter((r) => r.band === "TOO_FEW").sort(sortByRate),
  };
};

/** Everything about one student's office hours (plan §14.3 Student 360). */
export const studentReport = async (actor: Actor, studentId: number, period: ResolvedPeriod) => {
  const probe = await db.select({ y: StudentClassGroup.academic_year_id }).from(StudentClassGroup).where(eq(StudentClassGroup.user_id, studentId)).orderBy(sql`${StudentClassGroup.academic_year_id} DESC`).limit(1);
  await assertCanSeeStudent(actor, studentId, probe[0]?.y ?? 0);
  if (studentId !== actor.userId && !(await namesAllowed(actor))) throw new AuthorizationError("Your access shows totals only");
  const settings = await getSettings();
  const assignments = await db
    .select({ a: OfficeHourAssignment, s: OfficeHourSchedule })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(eq(OfficeHourAssignment.student_id, studentId), lte(OfficeHourAssignment.effective_from, period.to), gte(OfficeHourAssignment.effective_to, period.from)));
  const scheduleIds = [...new Set(assignments.map((x) => x.s.schedule_id))];
  const sessions = scheduleIds.length
    ? await db
        .select({ s: OfficeHourSession, att: OfficeHourAttendance })
        .from(OfficeHourSession)
        .leftJoin(OfficeHourAttendance, and(eq(OfficeHourAttendance.session_id, OfficeHourSession.session_id), eq(OfficeHourAttendance.student_id, studentId)))
        .where(and(inArray(OfficeHourSession.schedule_id, scheduleIds), gte(OfficeHourSession.session_date, period.from), lte(OfficeHourSession.session_date, period.to)))
        .orderBy(OfficeHourSession.session_date)
    : [];
  const covered = (scheduleId: number, ymd: string) => assignments.some((x) => x.s.schedule_id === scheduleId && x.a.effective_from <= ymd && ymd <= x.a.effective_to);
  const timeline = sessions
    .filter((x) => covered(x.s.schedule_id, x.s.session_date) || x.att)
    .map((x) => ({
      session_id: x.s.session_id,
      schedule_id: x.s.schedule_id,
      session_date: x.s.session_date,
      session_status: x.s.status,
      cancel_reason: x.s.cancel_reason,
      status: x.att?.status ?? null,
      note: actor.userId === studentId ? null : x.att?.note ?? null,
      outcome: x.att?.outcome ?? null,
      title: assignments.find((a) => a.s.schedule_id === x.s.schedule_id)?.s.title ?? null,
    }));
  const marks: Mark[] = sessions
    .filter((x) => x.s.status === "HELD" && x.att?.status && !x.att.is_drop_in)
    .map((x) => ({ student_id: studentId, session_date: x.s.session_date, start_time: x.s.start_time, status: x.att!.status! }));
  const escalations = await db.select().from(OfficeHourEscalation).where(eq(OfficeHourEscalation.student_id, studentId)).orderBy(sql`${OfficeHourEscalation.created_at} DESC`);
  const teachers = await userNames(assignments.map((x) => x.s.teacher_id));
  const staffView = actor.userId !== studentId;
  return {
    period,
    student_id: studentId,
    name: (await userNames([studentId])).get(studentId) ?? "Student",
    stats: statsFromMarks(marks, settings),
    assignments: assignments.map(({ a, s }) => ({
      assignment_id: a.assignment_id,
      schedule_id: s.schedule_id,
      title: s.title,
      teacher_name: teachers.get(s.teacher_id) ?? null,
      status: a.status,
      effective_from: a.effective_from,
      effective_to: a.effective_to,
      reason_code: staffView ? a.reason_code : null,
      end_reason_code: a.end_reason_code,
    })),
    timeline,
    escalations: staffView ? escalations : [],
  };
};

/** One teacher's delivery (plan §14.3 Teacher 360). */
export const teacherReport = async (actor: Actor, teacherId: number, period: ResolvedPeriod, filter: ReportFilter = {}) => {
  if (teacherId !== actor.userId && !actor.manageAny) {
    const scope = await readScopeOf(actor, null);
    if (scope.kind !== "school") throw new AuthorizationError("You can only see your own delivery");
  }
  const ds = await loadDataset({ ...actor, userId: teacherId, view: false, manageAny: false }, period.from, period.to, { teacherId, termId: filter.termId });
  const k = sessionKpis(ds);
  const settings = await getSettings();
  const onTime = ds.sessions.filter((x) => x.s.status === "HELD" && x.s.register_first_saved_at && kigaliParts(new Date(x.s.register_first_saved_at as any)).ymd <= x.s.session_date).length;
  const rosterSizes = ds.sessions.filter((x) => x.s.status !== "CANCELLED").map((x) => ds.expected.get(x.s.session_id)?.length ?? 0);
  const overall = statsFromMarks(ds.marks.filter((m) => !m.is_drop_in), settings);
  const schedules = [...new Map(ds.sessions.map((x) => [x.sch.schedule_id, x.sch])).values()].map((s) => ({ schedule_id: s.schedule_id, title: s.title, status: s.status }));
  return {
    period,
    teacher_id: teacherId,
    name: (await userNames([teacherId])).get(teacherId) ?? "Teacher",
    ...k,
    on_time_registers: k.held ? Math.round((onTime / k.held) * 1000) / 10 : null,
    average_roster: rosterSizes.length ? Math.round((rosterSizes.reduce((a, b) => a + b, 0) / rosterSizes.length) * 10) / 10 : 0,
    attendance_rate: overall.rate,
    presence_rate: overall.presence_rate,
    schedules,
  };
};

/** Printable register sheet for one date (plan §14.3). */
export const dailySheet = async (actor: Actor, ymd: string, filter: ReportFilter = {}) => {
  if (!(await namesAllowed(actor))) throw new AuthorizationError("Your access shows totals only");
  const ds = await loadDataset(actor, ymd, ymd, filter);
  const studentIds = [...new Set(ds.sessions.flatMap((x) => ds.expected.get(x.s.session_id) ?? []).concat(ds.marks.map((m) => m.student_id)))];
  const names = await userNames([...studentIds, ...ds.sessions.map((x) => x.s.host_teacher_id)]);
  return {
    date: ymd,
    sessions: ds.sessions
      .sort((a, b) => a.s.start_time.localeCompare(b.s.start_time) || a.sch.title.localeCompare(b.sch.title))
      .map((x) => {
        const ids = [...new Set([...(ds.expected.get(x.s.session_id) ?? []), ...ds.marks.filter((m) => m.session_id === x.s.session_id).map((m) => m.student_id)])];
        return {
          session_id: x.s.session_id,
          title: x.sch.title,
          start_time: x.s.start_time,
          end_time: x.s.end_time,
          location: x.s.location,
          host_name: names.get(x.s.host_teacher_id) ?? null,
          status: x.s.status,
          roster: ids
            .map((id) => {
              const m = ds.marks.find((mm) => mm.session_id === x.s.session_id && mm.student_id === id);
              const p = ds.placements.get(`${id}:${x.sch.academic_year_id}`);
              return { student_id: id, name: names.get(id) ?? "Student", class_group_name: p?.class_group_name ?? null, status: m?.status ?? null, drop_in: Boolean(m?.is_drop_in) };
            })
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
  };
};

/**
 * Coverage (plan §11): per class group in scope, how many students have
 * office hours on each weekday this term, and who has none at all.
 */
export const coverageReport = async (actor: Actor, termId: number, classGroupId: number | null) => {
  const term = await loadTerm(termId);
  const scope = await readScopeOf(actor, term.yearId);
  if (scope.kind === "own") throw new AuthorizationError("Coverage is for leadership and class teachers");
  const groups = await db
    .select({ class_group_id: StudentClassGroup.class_group_id, name: ClassGroup.name, user_id: StudentClassGroup.user_id })
    .from(StudentClassGroup)
    .innerJoin(ClassGroup, eq(ClassGroup.class_group_id, StudentClassGroup.class_group_id))
    .where(and(eq(StudentClassGroup.academic_year_id, term.yearId), eq(StudentClassGroup.status, "ACTIVE"), scope.kind === "classGroups" ? inArray(StudentClassGroup.class_group_id, scope.classGroupIds.length ? scope.classGroupIds : [0]) : sql`1=1`));
  const active = await db
    .select({ student: OfficeHourAssignment.student_id, schedule: OfficeHourAssignment.schedule_id })
    .from(OfficeHourAssignment)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourAssignment.schedule_id))
    .where(and(eq(OfficeHourAssignment.academic_term_id, termId), eq(OfficeHourAssignment.status, "ACTIVE"), eq(OfficeHourSchedule.status, "ACTIVE")));
  const { scheduleDays } = await import("./sessions");
  const days = await scheduleDays([...new Set(active.map((a) => a.schedule))]);
  const daysOf = new Map<number, Set<number>>();
  for (const a of active) {
    const set = daysOf.get(a.student) ?? new Set<number>();
    for (const d of days.get(a.schedule) ?? []) set.add(d);
    daysOf.set(a.student, set);
  }
  const byGroup = new Map<number, { name: string; students: number; covered: number; days: Record<number, number> }>();
  for (const g of groups) {
    const cur = byGroup.get(g.class_group_id) ?? { name: g.name, students: 0, covered: 0, days: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 } };
    cur.students++;
    const d = daysOf.get(g.user_id);
    if (d && d.size) {
      cur.covered++;
      for (const day of d) cur.days[day]++;
    }
    byGroup.set(g.class_group_id, cur);
  }
  let without: Array<{ student_id: number; name: string }> = [];
  if (classGroupId && (await namesAllowed(actor))) {
    const ids = groups.filter((g) => g.class_group_id === classGroupId && !daysOf.get(g.user_id)?.size).map((g) => g.user_id);
    const names = await userNames(ids);
    without = ids.map((id) => ({ student_id: id, name: names.get(id) ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
  }
  return {
    term_id: termId,
    class_groups: [...byGroup.entries()].map(([id, v]) => ({ class_group_id: id, ...v, coverage_rate: v.students ? Math.round((v.covered / v.students) * 1000) / 10 : null })).sort((a, b) => a.name.localeCompare(b.name)),
    students_without: without,
  };
};

/** Leadership landing (plan §11 Overview): today live, open escalations. */
export const overviewReport = async (actor: Actor, termId: number) => {
  const today = todayYmd();
  const ds = await loadDataset(actor, today, today, { termId });
  const todayRows = ds.sessions
    .filter((x) => x.s.status !== "CANCELLED")
    .map((x) => ({ session_id: x.s.session_id, held: x.s.status === "HELD", ended: sessionEnded(x.s), expected: ds.expected.get(x.s.session_id)?.length ?? 0 }));
  const term = await loadTerm(termId);
  const { listEscalations } = await import("./escalation");
  const open = await listEscalations(actor, termId, term.yearId, "open");
  return {
    today: {
      date: today,
      sessions: todayRows.length,
      expected: todayRows.reduce((a, r) => a + r.expected, 0),
      marked: todayRows.filter((r) => r.held).length,
      missing: todayRows.filter((r) => r.ended && !r.held).length,
    },
    open_escalations: open.length,
    names_allowed: await namesAllowed(actor),
  };
};

