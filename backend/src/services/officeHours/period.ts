import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db";
import { AcademicTerm, AcademicYear } from "../../db/schema";
import { ValidationError } from "../../errors/CustomError";
import { addDaysYmd, dbDateToYmd, dowOfYmd } from "../reminders/time";
import { isYmd, todayYmd } from "./common";

/**
 * Report periods (plan §14.1), all Kigali dates:
 *   day     the anchor date
 *   week    Monday-Friday of the anchor's week
 *   month   the calendar month
 *   term    the AcademicTerm containing the anchor (or term_id)
 *   year    the AcademicYear containing the anchor (or year_id)
 *   custom  from..to, at most 400 days
 * Each also returns the previous period of the same type, for deltas.
 */
export type PeriodKind = "day" | "week" | "month" | "term" | "year" | "custom";
export interface ResolvedPeriod {
  period: PeriodKind;
  from: string;
  to: string;
  label: string;
  previous: { from: string; to: string; label: string } | null;
  bucket: "day" | "week" | "month";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
};
const monday = (ymd: string) => {
  const dow = dowOfYmd(ymd);
  return addDaysYmd(ymd, dow === 0 ? -6 : 1 - dow);
};
const monthBounds = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from: first, to: addDaysYmd(next, -1), label: `${MONTHS[m - 1]} ${y}` };
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

const termContaining = async (ymd: string) => {
  const rows = await db.select().from(AcademicTerm).where(and(lte(AcademicTerm.start_date, ymd as any), gte(AcademicTerm.end_date, ymd as any)));
  return rows.sort((a, b) => Number(b.is_current) - Number(a.is_current))[0] ?? null;
};
const yearContaining = async (ymd: string) => {
  const rows = await db.select().from(AcademicYear).where(and(lte(AcademicYear.start_date, ymd as any), gte(AcademicYear.end_date, ymd as any)));
  return rows.sort((a, b) => Number(b.is_current) - Number(a.is_current))[0] ?? null;
};

export const resolvePeriod = async (q: { period?: unknown; anchor?: unknown; from?: unknown; to?: unknown; term_id?: unknown; year_id?: unknown }): Promise<ResolvedPeriod> => {
  const period = (["day", "week", "month", "term", "year", "custom"].includes(String(q.period)) ? q.period : "week") as PeriodKind;
  const anchor = isYmd(q.anchor) ? (q.anchor as string) : todayYmd();
  if (period === "day") {
    const prev = addDaysYmd(anchor, dowOfYmd(anchor) === 1 ? -3 : -1);
    return { period, from: anchor, to: anchor, label: fmt(anchor), previous: { from: prev, to: prev, label: fmt(prev) }, bucket: "day" };
  }
  if (period === "week") {
    const from = monday(anchor);
    const to = addDaysYmd(from, 4);
    const pf = addDaysYmd(from, -7);
    return { period, from, to, label: `Week of ${fmt(from)}`, previous: { from: pf, to: addDaysYmd(pf, 4), label: `Week of ${fmt(pf)}` }, bucket: "day" };
  }
  if (period === "month") {
    const cur = monthBounds(anchor);
    const prev = monthBounds(addDaysYmd(cur.from, -1));
    return { period, ...cur, previous: prev, bucket: "day" };
  }
  if (period === "term") {
    const termId = Number(q.term_id);
    const [term] = Number.isInteger(termId) && termId > 0 ? await db.select().from(AcademicTerm).where(eq(AcademicTerm.academic_term_id, termId)) : [await termContaining(anchor)];
    if (!term) throw new ValidationError("No term contains that date");
    const from = dbDateToYmd(term.start_date)!;
    const to = dbDateToYmd(term.end_date)!;
    const prevTerm = await termContaining(addDaysYmd(from, -1));
    const prev = prevTerm ? { from: dbDateToYmd(prevTerm.start_date)!, to: dbDateToYmd(prevTerm.end_date)!, label: prevTerm.name ?? "Previous term" } : null;
    return { period, from, to, label: term.name ?? "Term", previous: prev, bucket: "week" };
  }
  if (period === "year") {
    const yearId = Number(q.year_id);
    const [year] = Number.isInteger(yearId) && yearId > 0 ? await db.select().from(AcademicYear).where(eq(AcademicYear.academic_year_id, yearId)) : [await yearContaining(anchor)];
    if (!year) throw new ValidationError("No academic year contains that date");
    const from = dbDateToYmd(year.start_date)!;
    const to = dbDateToYmd(year.end_date)!;
    const prevYear = await yearContaining(addDaysYmd(from, -1));
    const prev = prevYear ? { from: dbDateToYmd(prevYear.start_date)!, to: dbDateToYmd(prevYear.end_date)!, label: prevYear.name ?? "Previous year" } : null;
    return { period, from, to, label: year.name ?? "Year", previous: prev, bucket: "month" };
  }
  if (!isYmd(q.from) || !isYmd(q.to)) throw new ValidationError("Choose a start and an end date");
  const from = q.from as string;
  const to = q.to as string;
  if (from > to) throw new ValidationError("The start must be on or before the end");
  const span = daysBetween(from, to);
  if (span > 400) throw new ValidationError("Choose at most 400 days");
  const pt = addDaysYmd(from, -1);
  return { period, from, to, label: `${fmt(from)} – ${fmt(to)}`, previous: { from: addDaysYmd(pt, -span), to: pt, label: "Previous period" }, bucket: span > 120 ? "month" : span > 31 ? "week" : "day" };
};

/** The bucket a date falls in, as a sortable key and a label. */
export const bucketOf = (ymd: string, bucket: "day" | "week" | "month") => {
  if (bucket === "day") return { key: ymd, label: fmt(ymd).replace(/ \d{4}$/, "") };
  if (bucket === "week") {
    const m = monday(ymd);
    return { key: m, label: `Wk ${fmt(m).replace(/ \d{4}$/, "")}` };
  }
  const { from, label } = monthBounds(ymd);
  return { key: from, label: label.slice(0, 3) + label.slice(-5) };
};
