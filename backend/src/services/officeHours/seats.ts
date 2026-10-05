import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db";
import { OfficeHourAssignment } from "../../db/officeHoursSchema";
import { ALL_DAYS, datesOnDays, maxYmd, todayYmd } from "./common";

/**
 * Weekly invitations (migration 104). An assignment is an invitation over a
 * date window -- one week, a few weeks, or the rest of the term -- so both the
 * no-overlap lock and the capacity are per DATE, never per term.
 */

export interface DateWindow {
  from: string;
  to: string;
}

/**
 * The dates an invitation over [from, to] locks: TERM mode ("one teacher at a
 * time") every day in the window, weekends included; WEEKDAY mode only the
 * meeting days.
 */
export const lockDatesFor = (mode: "TERM" | "WEEKDAY", days: number[], from: string, to: string) =>
  datesOnDays(from, to, mode === "TERM" ? [...ALL_DAYS] : days);

type Window = { from: string; to: string };

/** Busiest of `dates`: how many invitations cover it. */
export const peakOver = (windows: Window[], dates: string[]) => {
  let peak = 0;
  for (const d of dates) {
    let n = 0;
    for (const w of windows) if (w.from <= d && d <= w.to) n++;
    if (n > peak) peak = n;
  }
  return peak;
};

/** ACTIVE invitation windows of a schedule that touch [from, to]. */
export const activeWindows = async (exec: any, scheduleId: number, from: string, to: string): Promise<Array<Window & { student_id: number }>> => {
  const rows = await exec
    .select({ from: OfficeHourAssignment.effective_from, to: OfficeHourAssignment.effective_to, student_id: OfficeHourAssignment.student_id })
    .from(OfficeHourAssignment)
    .where(
      and(
        eq(OfficeHourAssignment.schedule_id, scheduleId),
        eq(OfficeHourAssignment.status, "ACTIVE"),
        lte(OfficeHourAssignment.effective_from, to),
        gte(OfficeHourAssignment.effective_to, from),
      ),
    );
  return rows.map((r: any) => ({ from: String(r.from).slice(0, 10), to: String(r.to).slice(0, 10), student_id: Number(r.student_id) }));
};

/** Seats taken at the busiest meeting date of [from, to]. */
export const seatsUsed = async (exec: any, scheduleId: number, days: number[], from: string, to: string) => {
  const dates = datesOnDays(from, to, days);
  if (!dates.length) return 0;
  return peakOver(await activeWindows(exec, scheduleId, dates[0], dates[dates.length - 1]), dates);
};

/**
 * Per schedule, from today to its end: the busiest session's seat count
 * (what capacity is checked against) and how many different students are
 * invited at all (several weekly groups add up).
 */
export const seatSummary = async (
  schedules: Array<{ schedule_id: number; effective_from: string; effective_to: string }>,
  daysOf: Map<number, number[]>,
) => {
  const out = new Map<number, { peak: number; invited: number }>();
  if (!schedules.length) return out;
  const today = todayYmd();
  const rows = await db
    .select({
      schedule_id: OfficeHourAssignment.schedule_id,
      student_id: OfficeHourAssignment.student_id,
      from: OfficeHourAssignment.effective_from,
      to: OfficeHourAssignment.effective_to,
    })
    .from(OfficeHourAssignment)
    .where(
      and(
        inArray(OfficeHourAssignment.schedule_id, schedules.map((s) => s.schedule_id)),
        eq(OfficeHourAssignment.status, "ACTIVE"),
        gte(OfficeHourAssignment.effective_to, today),
      ),
    );
  const bySchedule = new Map<number, Array<Window & { student_id: number }>>();
  for (const r of rows) {
    const list = bySchedule.get(r.schedule_id) ?? [];
    list.push({ from: String(r.from).slice(0, 10), to: String(r.to).slice(0, 10), student_id: r.student_id });
    bySchedule.set(r.schedule_id, list);
  }
  for (const s of schedules) {
    const windows = bySchedule.get(s.schedule_id) ?? [];
    const dates = windows.length ? datesOnDays(maxYmd(today, String(s.effective_from).slice(0, 10)), String(s.effective_to).slice(0, 10), daysOf.get(s.schedule_id) ?? []) : [];
    out.set(s.schedule_id, { peak: peakOver(windows, dates), invited: new Set(windows.map((w) => w.student_id)).size });
  }
  return out;
};
