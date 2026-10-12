/**
 * Early warning and interventions (nga-desktop docs/NEXT_FEATURES_ANALYSIS.md §3 #1).
 *
 * Each app sends what it knows about a student, as plain counts:
 * - Tendo (attendance and discipline):   absences_14d, absences_prev_14d, lates_14d,
 *                                        incidents_30d, discipline_points_30d
 * - Task Mentor (work and marks):        due_14d, missed_14d, avg_pct_30d,
 *                                        avg_pct_prev_30d, failed_30d
 * MIS adds its own office-hours absences. Clear rules (no machine learning)
 * turn those into a level, "none", "watch" or "at_risk", and a list of reasons
 * a teacher can read. Staff then log what they do about it (interventions).
 *
 * Safeguarding concerns are NOT used here: this list is seen by class
 * teachers, and those concerns are restricted to the safeguarding team.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { getCurrentAcademicYearId } from "../utils/academicYear";
import { notifyUsers } from "../utils/notifications";
import logger from "../utils/logger";
import { kigaliParts, addDaysYmd } from "./reminders/time";

export const CAP = "EARLY_WARNING_VIEW";
export const SOURCES = ["tendo", "taskmentor"] as const;
export type Source = (typeof SOURCES)[number];
export const LEVELS = ["none", "watch", "at_risk"] as const;
export type Level = (typeof LEVELS)[number];
export const ACTIONS = ["talk_student", "call_parent", "extra_support", "counsellor", "mentor", "seat_change", "other"] as const;
/** Signals older than this are ignored (the app stopped sending). */
export const STALE_DAYS = 4;

const METRIC_KEYS: Record<Source, string[]> = {
  tendo: ["absences_14d", "absences_prev_14d", "lates_14d", "incidents_30d", "discipline_points_30d"],
  taskmentor: ["due_14d", "missed_14d", "avg_pct_30d", "avg_pct_prev_30d", "failed_30d"],
};

export type Metrics = Record<string, number | null>;
export interface Reason {
  source: Source | "mis";
  text: string;
  points: number;
}
export interface Risk {
  level: Level;
  score: number;
  reasons: Reason[];
}

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Keep only the known metric keys, as finite numbers (or null). Pure. */
export function cleanMetrics(source: Source, raw: unknown): Metrics {
  const out: Metrics = {};
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const k of METRIC_KEYS[source]) {
    const n = num(obj[k]);
    out[k] = n === null ? null : Math.max(0, Math.min(k.startsWith("avg_pct") ? 100 : 1000, n));
  }
  return out;
}

/**
 * The rules (pure, unit-tested). Points add up; 3+ = watch, 6+ = at risk.
 * Every point comes with a sentence a class teacher can act on.
 */
export function assess(signals: Partial<Record<Source, Metrics>>, ohAbsent30d = 0): Risk {
  const reasons: Reason[] = [];
  const add = (source: Reason["source"], points: number, text: string) => reasons.push({ source, points, text });
  const t = signals.tendo;
  if (t) {
    const abs = t.absences_14d ?? 0;
    if (abs >= 5) add("tendo", 3, `Missed ${abs} lessons in the last 2 weeks`);
    else if (abs >= 3) add("tendo", 2, `Missed ${abs} lessons in the last 2 weeks`);
    if (abs >= 3 && (t.absences_prev_14d ?? 0) < abs / 2) add("tendo", 1, "Absences are rising");
    const late = t.lates_14d ?? 0;
    if (late >= 4) add("tendo", 1, `Late ${late} times in the last 2 weeks`);
    const inc = t.incidents_30d ?? 0;
    if (inc >= 4) add("tendo", 2, `${inc} discipline incidents this month`);
    else if (inc >= 2) add("tendo", 1, `${inc} discipline incidents this month`);
  }
  const m = signals.taskmentor;
  if (m) {
    const missed = m.missed_14d ?? 0;
    if (missed >= 4) add("taskmentor", 3, `${missed} pieces of work missed in the last 2 weeks`);
    else if (missed >= 2) add("taskmentor", 2, `${missed} pieces of work missed in the last 2 weeks`);
    const avg = m.avg_pct_30d;
    if (avg !== null && avg !== undefined) {
      if (avg < 40) add("taskmentor", 3, `Average mark ${Math.round(avg)}% this month`);
      else if (avg < 50) add("taskmentor", 2, `Average mark ${Math.round(avg)}% this month`);
      const prev = m.avg_pct_prev_30d;
      if (prev !== null && prev !== undefined && prev - avg >= 15) add("taskmentor", 2, `Marks dropped from ${Math.round(prev)}% to ${Math.round(avg)}%`);
    }
    const failed = m.failed_30d ?? 0;
    if (failed >= 3) add("taskmentor", 1, `Failed ${failed} quizzes or tests this month`);
  }
  if (ohAbsent30d >= 2) add("mis", 1, `Missed ${ohAbsent30d} office-hours sessions this month`);
  const score = reasons.reduce((a, r) => a + r.points, 0);
  return { level: score >= 6 ? "at_risk" : score >= 3 ? "watch" : "none", score, reasons: reasons.sort((a, b) => b.points - a.points) };
}

// ─── intake ─────────────────────────────────────────────────────────────────

export class EwError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * PUT /early-warning/signals from Tendo or Task Mentor: the latest metrics for
 * up to 1000 students (MIS user ids). Replaces that app's row per student.
 */
export async function ingest(source: Source, body: any, now = new Date()) {
  const list: any[] = Array.isArray(body?.students) ? body.students : [];
  if (!list.length) throw new EwError("Send students: [{ student_id, metrics }]");
  if (list.length > 1000) throw new EwError("At most 1000 students per call");
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.as_of || "")) ? String(body.as_of) : kigaliParts(now).ymd;
  let saved = 0;
  const ids: number[] = [];
  for (const s of list) {
    const id = Math.trunc(Number(s?.student_id));
    if (!(id > 0)) continue;
    const metrics = JSON.stringify(cleanMetrics(source, s?.metrics));
    await db.execute(sql`
      INSERT INTO StudentSignal (student_id, source, metrics, as_of, updated_at)
      VALUES (${id}, ${source}, ${metrics}, ${asOf}, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE metrics = VALUES(metrics), as_of = VALUES(as_of), updated_at = UTC_TIMESTAMP()`);
    ids.push(id);
    saved++;
  }
  // New "at risk" students: tell their class teacher (never blocks the push).
  void refreshStates(ids).catch((error) => logger.error("early warning: state refresh failed", { error }));
  return { saved, skipped: list.length - saved, as_of: asOf };
}

// ─── reading ────────────────────────────────────────────────────────────────

interface StudentRow {
  studentId: number;
  name: string;
  classGroupId: number | null;
  className: string | null;
  gradeId: number | null;
}

/** Active students in a scope (or the given ids), with their current class. */
async function studentsIn(scope: { all?: boolean; class_groups?: number[]; grades?: number[]; programs?: number[]; students?: number[] } | null, onlyIds?: number[]): Promise<StudentRow[]> {
  const yearId = await getCurrentAcademicYearId();
  const conds = [];
  if (onlyIds) {
    if (!onlyIds.length) return [];
    conds.push(sql`u.user_id IN (${sql.join(onlyIds.map((i) => sql`${i}`), sql`, `)})`);
  } else if (!scope) {
    return [];
  } else if (!scope.all) {
    const or = [];
    if (scope.class_groups?.length) or.push(sql`scg.class_group_id IN (${sql.join(scope.class_groups.map((i) => sql`${i}`), sql`, `)})`);
    if (scope.grades?.length) or.push(sql`cg.grade_id IN (${sql.join(scope.grades.map((i) => sql`${i}`), sql`, `)})`);
    if (scope.programs?.length) or.push(sql`g.program_id IN (${sql.join(scope.programs.map((i) => sql`${i}`), sql`, `)})`);
    if (scope.students?.length) or.push(sql`u.user_id IN (${sql.join(scope.students.map((i) => sql`${i}`), sql`, `)})`);
    if (!or.length) return [];
    conds.push(sql`(${sql.join(or, sql` OR `)})`);
  }
  const where = conds.length ? sql`AND ${sql.join(conds, sql` AND `)}` : sql``;
  const r = rows(await db.execute(sql`
    SELECT u.user_id AS studentId,
           TRIM(CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, ''))) AS name,
           scg.class_group_id AS classGroupId, cg.name AS className, cg.grade_id AS gradeId
    FROM User u
    JOIN UserProfile p ON p.user_id = u.user_id AND p.user_type = 'STUDENT'
    LEFT JOIN StudentClassGroup scg ON scg.user_id = u.user_id ${yearId ? sql`AND scg.academic_year_id = ${yearId}` : sql``}
    LEFT JOIN ClassGroup cg ON cg.class_group_id = scg.class_group_id
    LEFT JOIN Grade g ON g.grade_id = cg.grade_id
    WHERE u.status = 'ACTIVE' ${where}`));
  const seen = new Set<number>();
  return r
    .map((x: any) => ({ studentId: Number(x.studentId), name: x.name || `Student ${x.studentId}`, classGroupId: x.classGroupId ? Number(x.classGroupId) : null, className: x.className ?? null, gradeId: x.gradeId ? Number(x.gradeId) : null }))
    .filter((s) => (seen.has(s.studentId) ? false : (seen.add(s.studentId), true)));
}

/** Fresh signals (≤ STALE_DAYS old) and office-hours absences for these students. */
async function inputsFor(ids: number[], now = new Date()) {
  const signals = new Map<number, Partial<Record<Source, Metrics>>>();
  const asOf = new Map<number, Partial<Record<Source, string>>>();
  const oh = new Map<number, number>();
  if (!ids.length) return { signals, asOf, oh };
  const list = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  const cutoff = addDaysYmd(kigaliParts(now).ymd, -STALE_DAYS);
  for (const r of rows(await db.execute(sql`
    SELECT student_id AS id, source, metrics, DATE_FORMAT(as_of, '%Y-%m-%d') AS asOf FROM StudentSignal
    WHERE student_id IN (${list}) AND as_of >= ${cutoff}`))) {
    const id = Number(r.id);
    const src = r.source as Source;
    if (!SOURCES.includes(src)) continue;
    let m: Metrics = {};
    try {
      m = cleanMetrics(src, JSON.parse(r.metrics));
    } catch {
      continue;
    }
    signals.set(id, { ...(signals.get(id) ?? {}), [src]: m });
    asOf.set(id, { ...(asOf.get(id) ?? {}), [src]: r.asOf });
  }
  try {
    const from = addDaysYmd(kigaliParts(now).ymd, -30);
    for (const r of rows(await db.execute(sql`
      SELECT a.student_id AS id, COUNT(*) AS n FROM OfficeHourAttendance a
      JOIN OfficeHourSession s ON s.session_id = a.session_id
      WHERE a.status = 'ABSENT' AND s.session_date >= ${from} AND a.student_id IN (${list})
      GROUP BY a.student_id`))) oh.set(Number(r.id), Number(r.n));
  } catch {
    /* office hours not migrated here: no MIS signal */
  }
  return { signals, asOf, oh };
}

export interface EwStudent extends StudentRow, Risk {
  asOf: Partial<Record<Source, string>>;
  openInterventions: number;
  nextReview: string | null;
}

/** The viewer's students with their risk, worst first. */
export async function listForScope(scope: Parameters<typeof studentsIn>[0], opts: { level?: Level | "any"; classGroupId?: number | null } = {}): Promise<EwStudent[]> {
  let students = await studentsIn(scope);
  if (opts.classGroupId) students = students.filter((s) => s.classGroupId === opts.classGroupId);
  const ids = students.map((s) => s.studentId);
  const { signals, asOf, oh } = await inputsFor(ids);
  const iv = new Map<number, { open: number; next: string | null }>();
  if (ids.length) {
    for (const r of rows(await db.execute(sql`
      SELECT student_id AS id, COUNT(*) AS n, DATE_FORMAT(MIN(review_date), '%Y-%m-%d') AS next FROM EarlyWarningIntervention
      WHERE status = 'open' AND student_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) GROUP BY student_id`))) {
      iv.set(Number(r.id), { open: Number(r.n), next: r.next ?? null });
    }
  }
  const rank: Record<Level, number> = { at_risk: 0, watch: 1, none: 2 };
  return students
    .map((s) => ({
      ...s,
      ...assess(signals.get(s.studentId) ?? {}, oh.get(s.studentId) ?? 0),
      asOf: asOf.get(s.studentId) ?? {},
      openInterventions: iv.get(s.studentId)?.open ?? 0,
      nextReview: iv.get(s.studentId)?.next ?? null,
    }))
    .filter((s) => !opts.level || opts.level === "any" || s.level === opts.level)
    .sort((a, b) => rank[a.level] - rank[b.level] || b.score - a.score || a.name.localeCompare(b.name));
}

/** One student (if inside the scope): risk, raw signals and interventions. */
export async function studentDetail(scope: Parameters<typeof studentsIn>[0], studentId: number) {
  const [inScope] = (await studentsIn(scope)).filter((s) => s.studentId === studentId);
  if (!inScope) return null;
  const { signals, asOf, oh } = await inputsFor([studentId]);
  const interventions = rows(await db.execute(sql`
    SELECT i.intervention_id AS id, i.action, i.notes, i.owner_id AS ownerId,
           TRIM(CONCAT(COALESCE(o.first_name, ''), ' ', COALESCE(o.last_name, ''))) AS owner,
           DATE_FORMAT(i.review_date, '%Y-%m-%d') AS reviewDate, i.status, i.outcome,
           DATE_FORMAT(i.created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt
    FROM EarlyWarningIntervention i LEFT JOIN UserProfile o ON o.user_id = i.owner_id
    WHERE i.student_id = ${studentId} ORDER BY i.status = 'done', i.intervention_id DESC LIMIT 50`));
  return {
    ...inScope,
    ...assess(signals.get(studentId) ?? {}, oh.get(studentId) ?? 0),
    signals: signals.get(studentId) ?? {},
    asOf: asOf.get(studentId) ?? {},
    officeHoursAbsent30d: oh.get(studentId) ?? 0,
    interventions: interventions.map((x: any) => ({ ...x, id: Number(x.id), ownerId: Number(x.ownerId) })),
  };
}

// ─── interventions ──────────────────────────────────────────────────────────

export async function addIntervention(scope: Parameters<typeof studentsIn>[0], by: number, studentId: number, b: any) {
  if (!(await studentsIn(scope)).some((s) => s.studentId === studentId)) throw new EwError("This student isn't in your area", 403);
  const action = String(b?.action || "");
  if (!(ACTIONS as readonly string[]).includes(action)) throw new EwError("Choose what you will do");
  const review = b?.reviewDate && /^\d{4}-\d{2}-\d{2}$/.test(String(b.reviewDate)) ? String(b.reviewDate) : null;
  const owner = b?.ownerId ? Math.trunc(Number(b.ownerId)) : by;
  const res: any = await db.execute(sql`
    INSERT INTO EarlyWarningIntervention (student_id, action, notes, owner_id, created_by, review_date, status, created_at, updated_at)
    VALUES (${studentId}, ${action}, ${b?.notes ? String(b.notes).slice(0, 4000) : null}, ${owner}, ${by}, ${review}, 'open', UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
  return Number((Array.isArray(res) ? res[0] : res)?.insertId);
}

export async function closeIntervention(scope: Parameters<typeof studentsIn>[0], id: number, outcome: string) {
  const [iv] = rows(await db.execute(sql`SELECT student_id AS studentId, status FROM EarlyWarningIntervention WHERE intervention_id = ${id}`));
  if (!iv) throw new EwError("Not found", 404);
  if (!(await studentsIn(scope)).some((s) => s.studentId === Number(iv.studentId))) throw new EwError("This student isn't in your area", 403);
  const text = String(outcome || "").trim();
  if (text.length < 3) throw new EwError("Say how it went");
  await db.execute(sql`UPDATE EarlyWarningIntervention SET status = 'done', outcome = ${text.slice(0, 500)}, updated_at = UTC_TIMESTAMP() WHERE intervention_id = ${id}`);
  return Number(iv.studentId);
}

// ─── notifications ──────────────────────────────────────────────────────────

/**
 * Recomputes the level of these students and tells each new "at risk"
 * student's class teacher (UserGrade for the current year), once per change.
 */
export async function refreshStates(ids: number[]) {
  if (!ids.length) return;
  const students = await studentsIn(null, ids);
  const { signals, oh } = await inputsFor(ids);
  const prev = new Map<number, string>();
  for (const r of rows(await db.execute(sql`SELECT student_id AS id, level FROM StudentRiskState WHERE student_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`))) prev.set(Number(r.id), r.level);
  const yearId = await getCurrentAcademicYearId();
  for (const s of students) {
    const risk = assess(signals.get(s.studentId) ?? {}, oh.get(s.studentId) ?? 0);
    const before = prev.get(s.studentId);
    if (before === risk.level) continue;
    await db.execute(sql`
      INSERT INTO StudentRiskState (student_id, level, score, changed_at) VALUES (${s.studentId}, ${risk.level}, ${risk.score}, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE level = VALUES(level), score = VALUES(score), changed_at = UTC_TIMESTAMP()`);
    if (risk.level !== "at_risk" || !s.classGroupId) continue;
    const teachers = rows(await db.execute(sql`
      SELECT DISTINCT user_id AS id FROM UserGrade WHERE class_group_id = ${s.classGroupId} ${yearId ? sql`AND academic_year_id = ${yearId}` : sql``}`)).map((r: any) => Number(r.id));
    if (!teachers.length) continue;
    await notifyUsers(teachers, {
      kind: "early_warning",
      title: `${s.name} may need support`,
      body: risk.reasons.slice(0, 2).map((r) => r.text).join(" · "),
      link: `/early-warning?student=${s.studentId}`,
      subjectType: "early_warning",
      subjectId: s.studentId,
    });
  }
}
