/**
 * Kigali wall-clock helpers for the Reminder Hub.
 *
 * Africa/Kigali is UTC+2 all year (no daylight saving), so a fixed offset is
 * exact -- no tz database needed, and the server's own TZ never matters: every
 * function here works on UTC instants and derives the Kigali calendar from
 * them. Timetable slots store "HH:MM" strings and a JS-style day_of_week
 * (0 = Sunday), so this is the one place those become real instants.
 */

export const KIGALI_OFFSET_MIN = 120;
const OFFSET_MS = KIGALI_OFFSET_MIN * 60_000;
const DAY_MS = 86_400_000;

export interface KigaliParts {
  /** YYYY-MM-DD in Kigali. */
  ymd: string;
  /** 0 = Sunday ... 6 = Saturday, same convention as CalendarSlot.day_of_week. */
  dow: number;
  /** Minutes since Kigali midnight. */
  minutes: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const kigaliParts = (at: Date): KigaliParts => {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  return {
    ymd: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    dow: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
};

/** "08:00" / "08:00:00" / "8:5" -> minutes since midnight, or null when unparseable. */
export const parseClock = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/.exec(String(value).trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

export const formatClock = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

/** The UTC instant of a Kigali date + wall-clock time. */
export const kigaliInstant = (ymd: string, minutes: number): Date => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + minutes * 60_000 - OFFSET_MS);
};

export const addDaysYmd = (ymd: string, days: number): string => {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

export const dowOfYmd = (ymd: string): number => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Every Kigali date touched by [from, to], inclusive. */
export const kigaliDatesBetween = (from: Date, to: Date): string[] => {
  const out: string[] = [];
  const last = kigaliParts(to).ymd;
  let cursor = kigaliParts(from).ymd;
  for (let guard = 0; guard < 400 && cursor <= last; guard++) {
    out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
};

/**
 * A DATE column as YYYY-MM-DD. mysql2 hands DATEs back as a Date at *local*
 * midnight (or a string when dateStrings is on), so read it with local getters.
 */
export const dbDateToYmd = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return null;
};

/**
 * Is `minutes` inside the quiet window? The window may wrap midnight
 * (21:00 -> 06:00). Equal start/end means "no quiet hours".
 */
export const inQuietWindow = (minutes: number, start: number, end: number): boolean => {
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
};

/**
 * Move a fire time that lands in quiet hours to the end of that quiet window.
 * Returns null when the moved time would no longer be before the event -- a
 * reminder after the fact is noise, so it is dropped instead.
 */
export const shiftOutOfQuiet = (
  fireAt: Date,
  eventStart: Date,
  quietStart: number,
  quietEnd: number,
): Date | null => {
  const parts = kigaliParts(fireAt);
  if (!inQuietWindow(parts.minutes, quietStart, quietEnd)) return fireAt;
  // The quiet window ends today if we're before its end, otherwise tomorrow.
  const endYmd = parts.minutes < quietEnd ? parts.ymd : addDaysYmd(parts.ymd, 1);
  const moved = kigaliInstant(endYmd, quietEnd);
  return moved.getTime() < eventStart.getTime() ? moved : null;
};

/** Human "in 12 min" / "in 2 h 5 min" / "tomorrow at 08:00" relative to now. */
export const describeLead = (eventStart: Date, now: Date): string => {
  const mins = Math.round((eventStart.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const today = kigaliParts(now).ymd;
  const eventParts = kigaliParts(eventStart);
  if (eventParts.ymd === today) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `in ${h} h ${m} min` : `in ${h} h`;
  }
  if (eventParts.ymd === addDaysYmd(today, 1)) return `tomorrow at ${formatClock(eventParts.minutes)}`;
  return `on ${eventParts.ymd} at ${formatClock(eventParts.minutes)}`;
};
