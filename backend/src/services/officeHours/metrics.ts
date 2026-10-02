import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../../db";
import { OfficeHourAttendance, OfficeHourSession } from "../../db/officeHoursSchema";
import { getSettings, OfficeHourSettings } from "./settings";

/**
 * The one place the attendance formulas live (plan §14.2). Shown in the UI
 * under "How is this calculated?".
 *
 *   expected       marked rows on held sessions, drop-ins excluded
 *   rate           (PRESENT + LATE + EXCUSED) / expected   -- Tendo's attendancePolicy (D3)
 *   presence_rate  (PRESENT + LATE) / expected
 *   current_absent_streak    consecutive ABSENT marks at the end (EXCUSED skipped)
 *   longest_attended_streak  longest run of PRESENT/LATE (EXCUSED skipped, ABSENT breaks)
 *   band           CONSISTENT >= consistent%, WATCH >= watch%, else CHRONIC;
 *                  TOO_FEW below min_sessions_for_rate
 * Cancelled and unmarked sessions never count: they say nothing about the student.
 */
export type Band = "CONSISTENT" | "WATCH" | "CHRONIC" | "TOO_FEW";

export interface StudentStats {
  expected: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
  presence_rate: number | null;
  current_absent_streak: number;
  longest_attended_streak: number;
  band: Band;
  last_attended: string | null;
}

export interface Mark {
  student_id: number;
  session_date: string;
  start_time: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const bandOf = (rate: number | null, expected: number, s: Pick<OfficeHourSettings, "rate_band_consistent" | "rate_band_watch" | "min_sessions_for_rate">): Band => {
  if (rate === null || expected < s.min_sessions_for_rate) return "TOO_FEW";
  if (rate >= s.rate_band_consistent) return "CONSISTENT";
  if (rate >= s.rate_band_watch) return "WATCH";
  return "CHRONIC";
};

/** Stats from one student's marks, in any order. */
export const statsFromMarks = (marks: Mark[], settings: Pick<OfficeHourSettings, "rate_band_consistent" | "rate_band_watch" | "min_sessions_for_rate">): StudentStats => {
  const ordered = [...marks].sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time));
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  let run = 0;
  let longest = 0;
  let lastAttended: string | null = null;
  for (const m of ordered) {
    if (m.status === "PRESENT") present++;
    else if (m.status === "LATE") late++;
    else if (m.status === "ABSENT") absent++;
    else excused++;
    if (m.status === "PRESENT" || m.status === "LATE") {
      run++;
      longest = Math.max(longest, run);
      lastAttended = m.session_date;
    } else if (m.status === "ABSENT") run = 0;
  }
  let streak = 0;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const s = ordered[i].status;
    if (s === "EXCUSED") continue;
    if (s === "ABSENT") streak++;
    else break;
  }
  const expected = ordered.length;
  const rate = expected ? round1(((present + late + excused) / expected) * 100) : null;
  const presence = expected ? round1(((present + late) / expected) * 100) : null;
  return {
    expected,
    present,
    late,
    absent,
    excused,
    rate,
    presence_rate: presence,
    current_absent_streak: streak,
    longest_attended_streak: longest,
    band: bandOf(rate, expected, settings),
    last_attended: lastAttended,
  };
};

/** Marks of the given students on held sessions, optionally limited to schedules and a date range. */
export const loadMarks = async (params: { studentIds?: number[]; scheduleIds?: number[]; fromYmd?: string; toYmd?: string; assignmentIds?: number[] }) => {
  const conds = [eq(OfficeHourSession.status, "HELD"), isNotNull(OfficeHourAttendance.status), eq(OfficeHourAttendance.is_drop_in, 0)];
  if (params.studentIds) {
    if (!params.studentIds.length) return [];
    conds.push(inArray(OfficeHourAttendance.student_id, params.studentIds));
  }
  if (params.scheduleIds) {
    if (!params.scheduleIds.length) return [];
    conds.push(inArray(OfficeHourSession.schedule_id, params.scheduleIds));
  }
  if (params.assignmentIds) {
    if (!params.assignmentIds.length) return [];
    conds.push(inArray(OfficeHourAttendance.assignment_id, params.assignmentIds));
  }
  if (params.fromYmd) conds.push(gte(OfficeHourSession.session_date, params.fromYmd));
  if (params.toYmd) conds.push(lte(OfficeHourSession.session_date, params.toYmd));
  const rows = await db
    .select({
      student_id: OfficeHourAttendance.student_id,
      assignment_id: OfficeHourAttendance.assignment_id,
      schedule_id: OfficeHourSession.schedule_id,
      session_id: OfficeHourSession.session_id,
      session_date: OfficeHourSession.session_date,
      start_time: OfficeHourSession.start_time,
      status: OfficeHourAttendance.status,
    })
    .from(OfficeHourAttendance)
    .innerJoin(OfficeHourSession, eq(OfficeHourSession.session_id, OfficeHourAttendance.session_id))
    .where(and(...conds));
  return rows as Array<Mark & { assignment_id: number | null; schedule_id: number; session_id: number }>;
};

/** Stats per student. */
export const statsByStudent = async (params: Parameters<typeof loadMarks>[0]): Promise<Map<number, StudentStats>> => {
  const settings = await getSettings();
  const marks = await loadMarks(params);
  const grouped = new Map<number, Mark[]>();
  for (const m of marks) grouped.set(m.student_id, [...(grouped.get(m.student_id) ?? []), m]);
  const out = new Map<number, StudentStats>();
  for (const id of params.studentIds ?? [...grouped.keys()]) out.set(id, statsFromMarks(grouped.get(id) ?? [], settings));
  return out;
};

/** Stats per assignment (a student's record with one teacher). */
export const statsByAssignment = async (assignmentIds: number[]): Promise<Map<number, StudentStats>> => {
  const settings = await getSettings();
  const marks = await loadMarks({ assignmentIds });
  const grouped = new Map<number, Mark[]>();
  for (const m of marks) if (m.assignment_id) grouped.set(m.assignment_id, [...(grouped.get(m.assignment_id) ?? []), m]);
  const out = new Map<number, StudentStats>();
  for (const id of assignmentIds) out.set(id, statsFromMarks(grouped.get(id) ?? [], settings));
  return out;
};
