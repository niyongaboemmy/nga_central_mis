// Day names - the school week runs Monday to Friday, so the calendar only ever
// shows those five days (weekend columns were noise: never any lessons in them).
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const DAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

// Daily schedule — the institution's official daily bell schedule.
//
// Eight 50-minute periods (P1-P8) from 08:00, with 20-minute breaks after P2
// and P7, an hour for lunch after P5, and office hours closing the day. The
// 07:30 devotion block runs before the first bell.
//
// `label` names the block the way the bell schedule does, so the grid can show
// "P3" next to 10:00-10:50 instead of leaving the reader to count rows.
export const SCHEDULE_SLOTS = [
  { start: "07:30", end: "08:00", label: "Devotion", type: "break" },
  { start: "08:00", end: "08:50", label: "P1", type: "course" },
  { start: "08:50", end: "09:40", label: "P2", type: "course" },
  { start: "09:40", end: "10:00", label: "Short Break", type: "break" },
  { start: "10:00", end: "10:50", label: "P3", type: "course" },
  { start: "10:50", end: "11:40", label: "P4", type: "course" },
  { start: "11:40", end: "12:30", label: "P5", type: "course" },
  { start: "12:30", end: "13:30", label: "Lunch Break", type: "lunch" },
  { start: "13:30", end: "14:20", label: "P6", type: "course" },
  { start: "14:20", end: "15:10", label: "P7", type: "course" },
  { start: "15:10", end: "15:30", label: "Short Break", type: "break" },
  { start: "15:30", end: "16:20", label: "P8", type: "course" },
  { start: "16:20", end: "17:20", label: "Office Hours", type: "office" },
] as const;

/**
 * Whether lessons can be scheduled on a row.
 *
 * Everything else — breaks, lunch, office hours — is a band drawn across the
 * whole week rather than a set of per-day cells.
 */
export const isTeachingRow = (row: { type: string }): boolean =>
  row.type === "course";

// Helper function to convert time string (HH:MM) to minutes since midnight
export const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

export interface ScheduleRow {
  start: string;
  end: string;
  label: string;
  type: string;
}

/**
 * The rows a calendar grid should draw for a given set of slots.
 *
 * SCHEDULE_SLOTS is this institution's standard timetable, but slots are
 * stored with whatever start/end time they were created with, and the grid
 * only ever draws a slot on a row whose `start` matches it exactly. A period
 * that isn't in the standard timetable — a school running 08:00-09:40, say —
 * therefore matched no row at all and vanished from the grid entirely, while
 * still occupying its time as far as the server was concerned (an empty cell
 * that answers "a slot already exists at this time").
 *
 * So the standard timetable is a starting point, not the whole truth: any
 * start time present in the data that it doesn't cover gets its own row,
 * placed chronologically.
 */
export const buildScheduleRows = (
  slots: { start_time: string; end_time: string }[],
): ScheduleRow[] => {
  const rows: ScheduleRow[] = SCHEDULE_SLOTS.map((s) => ({ ...s }));
  const knownStarts = new Set(rows.map((r) => r.start));

  for (const slot of slots) {
    if (!slot?.start_time || knownStarts.has(slot.start_time)) continue;
    knownStarts.add(slot.start_time);
    rows.push({
      start: slot.start_time,
      end: slot.end_time || slot.start_time,
      // No bell-schedule name: this period isn't on the official schedule.
      label: "",
      type: "course",
    });
  }

  return rows.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
};

/**
 * How many rows a course occupies, counting from its own row forward.
 *
 * Counting every overlapping row (rather than only the ones at or after the
 * course's own) would over-count as soon as the rows aren't a clean partition
 * of the day — which is exactly what happens once a non-standard period is
 * spliced in next to a standard one that overlaps it.
 *
 * The count also stops at the first break, lunch or office-hours band. A slot
 * recorded as running through lunch would otherwise draw a cell over a row the
 * grid renders as a single week-wide band, and the two would fight for the
 * same space.
 */
export const countScheduleSlots = (
  courseStart: string,
  courseEnd: string,
  rows: readonly ScheduleRow[] = SCHEDULE_SLOTS,
  startIndex = 0,
): number => {
  const courseStartMin = timeToMinutes(courseStart);
  const courseEndMin = timeToMinutes(courseEnd);
  let count = 0;

  for (let i = startIndex; i < rows.length; i++) {
    if (i > startIndex && !isTeachingRow(rows[i])) break;
    const rowStart = timeToMinutes(rows[i].start);
    const rowEnd = timeToMinutes(rows[i].end);
    if (rowStart >= courseEndMin) break;
    if (rowStart < courseEndMin && rowEnd > courseStartMin) count++;
  }

  return Math.max(1, count);
};

// Helper function to convert display day index to backend day of week
// Display: 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun
// Backend: 0=Sun, 1=Mon, ..., 6=Sat
export const displayDayToBackend = (displayDay: number): number => {
  return (displayDay + 1) % 7;
};

// Helper function to convert backend day of week to display day index
// Backend: 0=Sun, 1=Mon, ..., 6=Sat
// Display: 0=Mon, 1=Tue, ..., 5=Sat, 6=Sun
export const backendDayToDisplay = (backendDay: number): number => {
  return (backendDay + 6) % 7;
};

// Format date as "MMM DD"
export const formatDateShort = (date: Date) => {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
};

// Get the start of the current week (Monday) normalized to midnight
export const getStartOfWeek = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const dayOfWeek = result.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  result.setDate(result.getDate() - daysFromMonday);
  return result;
};

// Get dates for the school week: Monday (index 0) to Friday (index 4)
export const getWeekDates = (currentWeekStart: Date): Date[] => {
  const dates: Date[] = [];
  const start = new Date(currentWeekStart);
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i < 5; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Get date range string for the current week
export const getDateRangeString = (weekDates: Date[]): string => {
  if (weekDates.length === 0) return "";
  const start = weekDates[0];
  const end = weekDates[weekDates.length - 1];
  return `${formatDateShort(start)} - ${formatDateShort(end)}, ${end.getFullYear()}`;
};

// Convert minutes since midnight back to a "HH:MM" string
export const minutesToTime = (mins: number): string => {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// Minutes since midnight for a Date (defaults to now)
export const dateToMinutes = (date: Date = new Date()): number =>
  date.getHours() * 60 + date.getMinutes();

/**
 * Index of the row that `nowMinutes` falls inside, or -1 when the school day
 * hasn't started, has ended, or the rows leave a gap over that minute.
 *
 * Rows are half-open ([start, end)) so a minute that is the end of one row and
 * the start of the next belongs to the next — otherwise two rows would both
 * claim to be "in session" at 09:40.
 */
export const findCurrentRowIndex = (
  rows: readonly ScheduleRow[],
  nowMinutes: number,
): number =>
  rows.findIndex(
    (r) =>
      nowMinutes >= timeToMinutes(r.start) && nowMinutes < timeToMinutes(r.end),
  );

/** How far through a row we are, 0-1. Returns null when outside the row. */
export const rowProgress = (
  row: ScheduleRow,
  nowMinutes: number,
): number | null => {
  const start = timeToMinutes(row.start);
  const end = timeToMinutes(row.end);
  if (end <= start || nowMinutes < start || nowMinutes >= end) return null;
  return (nowMinutes - start) / (end - start);
};
