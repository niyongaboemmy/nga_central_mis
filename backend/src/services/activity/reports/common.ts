import { APP_CODE, AppKey, isAppKey } from "../apps";
import { clock, kigaliDay } from "../runtime";
import { addDays, dayBounds } from "../rollup";

/**
 * Shared report plumbing (plan §14 toolbar): date range in Kigali days, granularity,
 * comparison period, app filter, audience and segment filters.
 */
export type Gran = "day" | "week" | "month";

export interface Segment {
  types?: string[];
  roles?: string[];
  programIds?: number[];
  gradeIds?: number[];
  classGroupIds?: number[];
}

export interface ReportQuery {
  from: string;
  to: string;
  days: number;
  gran: Gran;
  apps: number[];
  appKeys: AppKey[];
  aud: "user" | "visitor" | "both";
  compare: "prev" | "yoy" | null;
  seg: Segment;
  /** Kigali day bounds as UTC instants. */
  fromAt: Date;
  toAt: Date;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const list = (v: unknown) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const ids = (v: unknown) => list(v).map(Number).filter((n) => Number.isInteger(n) && n > 0);

export const parseQuery = (qs: Record<string, any>, defaultDays = 28): ReportQuery => {
  const today = kigaliDay(clock.now());
  let to = DAY_RE.test(qs.to) ? qs.to : today;
  let from = DAY_RE.test(qs.from) ? qs.from : addDays(to, -(defaultDays - 1));
  if (from > to) [from, to] = [to, from];
  // Hard cap: 400 days per query keeps every report bounded.
  if ((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 > 400) from = addDays(to, -400);
  const appKeys = list(qs.app).filter(isAppKey) as AppKey[];
  const aud = qs.aud === "user" || qs.aud === "visitor" ? qs.aud : "both";
  const gran: Gran = qs.gran === "week" || qs.gran === "month" ? qs.gran : "day";
  const compare = qs.compare === "prev" || qs.compare === "yoy" ? qs.compare : null;
  return {
    from,
    to,
    days: Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1,
    gran,
    apps: appKeys.map((a) => APP_CODE[a]),
    appKeys,
    aud,
    compare,
    seg: {
      types: list(qs.type).map((t) => t.toUpperCase()).filter((t) => /^[A-Z_]{2,20}$/.test(t)),
      roles: list(qs.role).filter((r) => /^[A-Za-z0-9_ -]{1,60}$/.test(r)),
      programIds: ids(qs.program),
      gradeIds: ids(qs.grade),
      classGroupIds: ids(qs.classGroup),
    },
    fromAt: dayBounds(from)[0],
    toAt: dayBounds(to)[1],
  };
};

/** The comparison window for `q` (same length immediately before, or the same dates a year earlier). */
export const comparisonOf = (q: ReportQuery): ReportQuery | null => {
  if (!q.compare) return null;
  const shift = q.compare === "prev" ? -q.days : -364; // 52 weeks keeps weekdays aligned
  const from = addDays(q.from, shift);
  const to = addDays(q.to, shift);
  return { ...q, from, to, compare: null, fromAt: dayBounds(from)[0], toAt: dayBounds(to)[1] };
};

export const hasSegment = (s: Segment) =>
  !!(s.types?.length || s.roles?.length || s.programIds?.length || s.gradeIds?.length || s.classGroupIds?.length);

/**
 * SQL fragment restricting `col` (a user id column) to the segment, joined live against
 * MIS data: user type, roles, and current placements (students by class group, class
 * teachers by grade/class, subject teachers by class, programme leads by programme).
 */
export const segmentSql = (col: string, s: Segment): { sql: string; params: any[] } => {
  const parts: string[] = [];
  const params: any[] = [];
  if (s.types?.length) {
    parts.push(`${col} IN (SELECT user_id FROM UserProfile WHERE user_type IN (?))`);
    params.push(s.types);
  }
  if (s.roles?.length) {
    parts.push(`${col} IN (SELECT ur.user_id FROM UserRole ur JOIN Role r ON r.role_id = ur.role_id WHERE r.name IN (?))`);
    params.push(s.roles);
  }
  const place = placementSql(s);
  if (place) {
    parts.push(`${col} IN (${place.sql})`);
    params.push(...place.params);
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", params };
};

const CURRENT = "JOIN AcademicYear ay ON ay.academic_year_id = x.academic_year_id AND ay.is_current = 1";
const placementSql = (s: Segment): { sql: string; params: any[] } | null => {
  if (!s.programIds?.length && !s.gradeIds?.length && !s.classGroupIds?.length) return null;
  // Resolve the requested nodes down to class groups and grades.
  const cgSel: string[] = [];
  const cgParams: any[] = [];
  if (s.classGroupIds?.length) {
    cgSel.push("SELECT class_group_id FROM ClassGroup WHERE class_group_id IN (?)");
    cgParams.push(s.classGroupIds);
  }
  if (s.gradeIds?.length) {
    cgSel.push("SELECT class_group_id FROM ClassGroup WHERE grade_id IN (?)");
    cgParams.push(s.gradeIds);
  }
  if (s.programIds?.length) {
    cgSel.push("SELECT cg.class_group_id FROM ClassGroup cg JOIN Grade g ON g.grade_id = cg.grade_id WHERE g.program_id IN (?)");
    cgParams.push(s.programIds);
  }
  const cg = cgSel.join(" UNION ");
  const members = [
    `SELECT x.user_id FROM StudentClassGroup x ${CURRENT} WHERE x.status = 'ACTIVE' AND x.class_group_id IN (${cg})`,
    `SELECT x.user_id FROM UserGrade x ${CURRENT} WHERE x.class_group_id IN (${cg})`,
    `SELECT x.user_id FROM TeacherSubjectAssignment x ${CURRENT} WHERE x.class_group_id IN (${cg})`,
  ];
  const params: any[] = [...cgParams, ...cgParams, ...cgParams];
  if (s.gradeIds?.length) {
    members.push(`SELECT x.user_id FROM UserGrade x ${CURRENT} WHERE x.grade_id IN (?)`);
    params.push(s.gradeIds);
  }
  if (s.programIds?.length) {
    members.push(`SELECT x.user_id FROM UserProgramLead x ${CURRENT} WHERE x.program_id IN (?)`);
    params.push(s.programIds);
  }
  return { sql: members.join(" UNION "), params };
};

export const appSql = (col: string, q: ReportQuery) =>
  q.apps.length ? { sql: ` AND ${col} IN (?)`, params: [q.apps] } : { sql: "", params: [] as any[] };

export const EXCLUDED = "(SELECT user_id FROM AnalyticsUserState WHERE excluded = 1)";

/** Bucket key for a Kigali day at the requested granularity (weeks start Monday). */
export const bucketOf = (day: string, gran: Gran) => {
  if (gran === "day") return day;
  if (gran === "month") return `${day.slice(0, 7)}-01`;
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
};

export const bucketsIn = (q: ReportQuery) => {
  const out: string[] = [];
  for (let d = q.from; d <= q.to; d = addDays(d, 1)) {
    const b = bucketOf(d, q.gran);
    if (out[out.length - 1] !== b) out.push(b);
  }
  return out;
};

export const daysIn = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
export const delta = (cur: number | null, prev: number | null | undefined) =>
  cur === null || prev === null || prev === undefined ? null : prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / prev) * 1000) / 10;

/** Small-cohort suppression for viewers without per-person access (plan §9.3). */
export const MIN_COHORT = 5;
export const suppress = (n: number, on: boolean) => (on && n > 0 && n < MIN_COHORT ? null : n);

export const toDay = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
