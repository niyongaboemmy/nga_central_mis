import { eq } from "drizzle-orm";
import { db } from "../../db";
import { AcademicTerm } from "../../db/schema";
import { ValidationError, NotFoundError } from "../../errors/CustomError";
import { addDaysYmd, dbDateToYmd, dowOfYmd, kigaliParts, parseClock } from "../reminders/time";

/**
 * Shared helpers for the office-hours module (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §4):
 * an injectable clock (tests pin "now"), Kigali dates, clock validation and terms.
 *
 * day_of_week is the timetable's encoding, which is also JavaScript's getDay():
 * 1 = Monday ... 5 = Friday, so dowOfYmd() compares directly.
 */

const realClock = (): (() => Date) => {
  // End-to-end runs pin the server clock (e.g. inside a session) with
  // OFFICE_HOURS_FAKE_NOW=<ISO instant>. Never honoured in production.
  const fake = process.env.OFFICE_HOURS_FAKE_NOW;
  if (fake && process.env.NODE_ENV !== "production" && !Number.isNaN(Date.parse(fake))) {
    const offset = Date.parse(fake) - Date.now();
    return () => new Date(Date.now() + offset);
  }
  return () => new Date();
};
let clock: () => Date = realClock();
/** Test hook: pin the module's notion of "now". Pass null to restore. */
export const setOfficeHoursClock = (fn: (() => Date) | null) => {
  clock = fn ?? realClock();
};
export const now = () => clock();
export const todayYmd = () => kigaliParts(now()).ymd;
export const nowMinutes = () => kigaliParts(now()).minutes;

export const WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const dayLabel = (days: number[]) =>
  [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ");

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isYmd = (v: unknown): v is string => typeof v === "string" && YMD_RE.test(v) && !Number.isNaN(Date.parse(v));

/** "HH:MM" -> minutes, or a ValidationError naming the field. */
export const clockOrThrow = (value: unknown, field: string): number => {
  const m = typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? parseClock(value) : null;
  if (m === null) throw new ValidationError(`${field} must be a time like 16:20`, [{ field, message: "Invalid time" }]);
  return m;
};

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;
export const datesOverlap = (aFrom: string, aTo: string, bFrom: string, bTo: string) => aFrom <= bTo && bFrom <= aTo;

export const minYmd = (...v: string[]) => v.reduce((a, b) => (a < b ? a : b));
export const maxYmd = (...v: string[]) => v.reduce((a, b) => (a > b ? a : b));

/** Every date in [from, to] (inclusive) whose weekday is in `days`. */
export const datesOnDays = (fromYmd: string, toYmd: string, days: number[]): string[] => {
  const out: string[] = [];
  const want = new Set(days);
  let cursor = fromYmd;
  for (let guard = 0; guard < 800 && cursor <= toYmd; guard++) {
    if (want.has(dowOfYmd(cursor))) out.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
};

export interface TermInfo {
  termId: number;
  yearId: number;
  name: string | null;
  startYmd: string;
  endYmd: string;
}

export const loadTerm = async (termId: number): Promise<TermInfo> => {
  const [t] = await db.select().from(AcademicTerm).where(eq(AcademicTerm.academic_term_id, termId)).limit(1);
  if (!t) throw new NotFoundError("Academic term not found");
  const startYmd = dbDateToYmd(t.start_date);
  const endYmd = dbDateToYmd(t.end_date);
  if (!startYmd || !endYmd) throw new ValidationError("This term has no start/end dates yet; set them in Academics first");
  return { termId: t.academic_term_id, yearId: t.academic_year_id, name: t.name, startYmd, endYmd };
};

/**
 * The term office hours default to: the current term containing today, else
 * the first current term (matches loadCurrentTerm in the Reminder Hub).
 */
export const currentTermId = async (): Promise<number | null> => {
  const rows = await db
    .select({ id: AcademicTerm.academic_term_id, start: AcademicTerm.start_date, end: AcademicTerm.end_date })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.is_current, 1));
  if (rows.length === 0) return null;
  const today = todayYmd();
  const containing = rows.find((r) => {
    const s = dbDateToYmd(r.start);
    const e = dbDateToYmd(r.end);
    return s && e && s <= today && today <= e;
  });
  return (containing ?? rows[0]).id;
};

export const resolveTermId = async (raw: unknown): Promise<number> => {
  const n = Number(raw);
  if (raw !== undefined && raw !== null && raw !== "" && Number.isInteger(n) && n > 0) return n;
  const id = await currentTermId();
  if (!id) throw new ValidationError("No current academic term is set");
  return id;
};

export const toInt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const intList = (v: unknown, field: string, max = 500): number[] => {
  const arr = Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : [];
  const out = [...new Set(arr.map(Number))];
  if (out.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new ValidationError(`${field} must be a list of ids`, [{ field, message: "Invalid id" }]);
  }
  if (out.length > max) throw new ValidationError(`${field}: at most ${max} at a time`);
  return out;
};

export const isDupEntry = (error: any) =>
  error?.code === "ER_DUP_ENTRY" || error?.cause?.code === "ER_DUP_ENTRY" || /Duplicate entry/.test(String(error?.message ?? ""));

const isRetryable = (error: any) => {
  const code = error?.code ?? error?.cause?.code;
  return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT" || /Deadlock found/.test(String(error?.message ?? ""));
};

/**
 * Run a transaction, retrying when InnoDB picks it as a deadlock victim. Two
 * teachers inserting the same lock key can surface as a deadlock rather than a
 * duplicate entry; the retry then sees the committed row and reports a clean
 * conflict instead of a 500.
 */
export const withDeadlockRetry = async <T>(fn: () => Promise<T>, attempts = 4): Promise<T> => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts || !isRetryable(error)) throw error;
      await new Promise((r) => setTimeout(r, 15 * i + Math.floor(Math.random() * 20)));
    }
  }
};
