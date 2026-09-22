import type { TeacherOverview, TeacherSchemeRow } from "../../api/dashboard";
import type { StatusKey } from "./chartTheme";

// ─── Chart data shaping ─────────────────────────────────────────────────────
// Kept pure and out of the components: the interesting part of an analytical
// chart is the derivation, and it should be testable without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoverageRow {
  key: string;
  subject: string;
  classGroup: string;
  /**
   * The category a chart axis bands on. Must be unique per row: two rows can
   * share a subject name (the same subject taught to two class groups), and a
   * repeated category collapses both bars onto one band.
   */
  axisLabel: string;
  /** Weeks actually planned in the scheme. */
  planned: number;
  /** Weeks that should be planned by now — the term's current week. */
  target: number;
  status: StatusKey;
  statusLabel: string;
  submitted: boolean;
}

/**
 * Scheme coverage against the calendar, worst first.
 *
 * This is the one genuinely analytical question on the page: a teacher can see
 * their own scheme, but not at a glance which of four classes has fallen
 * behind the term. Planned weeks vs the week the term is actually in answers
 * it in one row each.
 *
 * With no term start date on record there is no target to judge against, so
 * every submitted scheme is reported neutrally rather than being accused of
 * being behind.
 */
export const coverageRows = (
  rows: TeacherSchemeRow[],
  week: number | null,
): CoverageRow[] => {
  const target = week ?? 0;

  return rows
    .map((row) => {
      const planned = row.status === "submitted" ? row.entries_count : 0;
      let status: StatusKey;
      let statusLabel: string;

      if (row.status === "pending") {
        status = "critical";
        statusLabel = "Not submitted";
      } else if (row.validation_status === "REJECTED") {
        status = "critical";
        statusLabel = "Sent back";
      } else if (target > 0 && planned < target) {
        status = "warning";
        statusLabel = `${target - planned} ${target - planned === 1 ? "week" : "weeks"} behind`;
      } else {
        status = "good";
        statusLabel = "On track";
      }

      return {
        key: `${row.subject_id}-${row.class_group_id}`,
        subject: row.subject_name,
        classGroup: row.class_group_name,
        // Disambiguated below, once every subject name has been seen.
        axisLabel: row.subject_name,
        planned,
        target,
        status,
        statusLabel,
        submitted: row.status === "submitted",
      };
    })
    .sort((a, b) => {
      const rank: Record<StatusKey, number> = {
        critical: 0,
        warning: 1,
        good: 2,
      };
      if (rank[a.status] !== rank[b.status])
        return rank[a.status] - rank[b.status];
      return a.planned - b.planned;
    })
    .map((row, _i, all) => {
      const repeated =
        all.filter((other) => other.subject === row.subject).length > 1;
      return repeated
        ? { ...row, axisLabel: `${row.subject} · ${row.classGroup}` }
        : row;
    });
};

/** Axis ticks truncate; the full name stays in the tooltip and table view. */
export const truncateTick = (value: string, max = 22): string =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

export interface LoadPoint {
  day: number;
  label: string;
  periods: number;
  minutes: number;
  isToday: boolean;
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Periods per weekday. Mon–Fri always appear so the shape of a normal week is
 * stable; a weekend day joins only when something is actually timetabled on
 * it, so a Saturday period can never be counted in the weekly total yet
 * missing from the chart that explains it.
 */
export const weeklyLoad = (
  weekLoad: TeacherOverview["schedule"]["week_load"],
  todayDow: number,
): LoadPoint[] =>
  weekLoad
    .filter((d) => (d.day_of_week >= 1 && d.day_of_week <= 5) || d.periods > 0)
    .map((d) => ({
      day: d.day_of_week,
      label: DAY_SHORT[d.day_of_week],
      periods: d.periods,
      minutes: 0,
      isToday: d.day_of_week === todayDow,
    }));

export interface SubjectLoadPoint {
  label: string;
  subject: string;
  classGroup: string;
  periods: number;
}

/**
 * Where the teaching week actually goes, heaviest first. Capped at eight rows
 * with the tail folded into "Other" rather than shrinking every bar — past
 * that a bar chart stops being readable and the table view carries the detail.
 */
export const subjectLoad = (
  classes: TeacherOverview["classes"],
  cap = 8,
): SubjectLoadPoint[] => {
  const points = classes
    .filter((c) => c.periods_per_week > 0)
    .map((c) => ({
      label: `${c.subject_name} · ${c.class_group_name}`,
      subject: c.subject_name,
      classGroup: c.class_group_name,
      periods: c.periods_per_week,
    }))
    .sort((a, b) => b.periods - a.periods);

  if (points.length <= cap) return points;

  const head = points.slice(0, cap - 1);
  const tail = points.slice(cap - 1);
  return [
    ...head,
    {
      label: `Other (${tail.length})`,
      subject: "Other",
      classGroup: "",
      periods: tail.reduce((total, p) => total + p.periods, 0),
    },
  ];
};
