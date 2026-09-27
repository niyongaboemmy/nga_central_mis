import { eq } from "drizzle-orm";
import { db } from "../db";
import { AcademicTerm, AcademicYear } from "../db/schema";

/**
 * The (year, term) a request is looking at, honouring the top-nav period
 * switcher (explicit ids) and otherwise falling back to the current term and
 * its year. Shared by every aggregate page (Teacher Dashboard, Home) so they
 * can never disagree about "this term".
 */
export const resolvePeriod = async (queryYearId?: number, queryTermId?: number) => {
  const [term] = queryTermId
    ? await db
        .select()
        .from(AcademicTerm)
        .where(eq(AcademicTerm.academic_term_id, queryTermId))
        .limit(1)
    : await db
        .select()
        .from(AcademicTerm)
        .where(eq(AcademicTerm.is_current, 1))
        .limit(1);

  let yearId = queryYearId ?? term?.academic_year_id ?? undefined;
  if (!yearId) {
    const [currentYear] = await db
      .select({ academic_year_id: AcademicYear.academic_year_id })
      .from(AcademicYear)
      .where(eq(AcademicYear.is_current, 1))
      .limit(1);
    yearId = currentYear?.academic_year_id;
  }

  const [year] = yearId
    ? await db
        .select()
        .from(AcademicYear)
        .where(eq(AcademicYear.academic_year_id, yearId))
        .limit(1)
    : [];

  return { term: term ?? null, year: year ?? null };
};

/** A DB DATE (mysql2 returns JS Date or string) as "yyyy-MM-dd", or null. */
export const toIsoDate = (d: unknown): string | null => {
  if (!d) return null;
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
};

/** Local calendar date as "yyyy-MM-dd". */
export const localIsoDate = (d: Date = new Date()): string => toIsoDate(d)!;

/**
 * Which week of the term `today` falls in, 1-based. null when the term has no
 * start date or hasn't started -- every rule that needs the week then stands
 * down rather than inventing urgency from a guess. Mirrors the frontend
 * `weekOfTerm` in components/teacher/urgency.ts.
 */
export const weekOfTerm = (termStart: unknown, today: Date = new Date()): number | null => {
  const iso = toIsoDate(termStart);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - start.getTime()) / 86_400_000);
  if (days < 0) return null;
  return Math.floor(days / 7) + 1;
};

/** Number of weeks the term spans (ceil), or null without both dates. */
export const weeksInTerm = (termStart: unknown, termEnd: unknown): number | null => {
  const s = toIsoDate(termStart);
  const e = toIsoDate(termEnd);
  if (!s || !e) return null;
  const ms = new Date(e).getTime() - new Date(s).getTime();
  if (ms < 0) return null;
  return Math.max(1, Math.ceil((ms / 86_400_000 + 1) / 7));
};
