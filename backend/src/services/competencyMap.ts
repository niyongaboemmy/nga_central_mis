import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { Course, CourseItemProgress, TeacherSubjectAssignment, Subject, ClassGroup } from "../db/schema";
import { alignedItemsByCriterion, deriveMastery, loadBestChecks, loadSubjectCriteria, type MasteryState } from "./elearning/courseMastery";
import type { TreeItem } from "./elearning/courseTree";
import { getTeacherRosterRows, type TeacherAssignment } from "./teacherRoster";

/**
 * Competency map (nga-desktop NEXT_FEATURES_ANALYSIS §3 #7, migration 116).
 *
 * The outcome primitive is the curriculum's performance criterion
 * (CompetencyPerformanceCriteria, grouped by learning outcome = SubjectCompetency).
 * Two kinds of evidence are merged per student × criterion:
 *   - e-learning: derived live from course items aligned to the criterion
 *     (courseMastery.deriveMastery — completed = COVERED, passed check = DEMONSTRATED);
 *   - other apps: CompetencyEvidence rows. Today Task Mentor quizzes and assignments
 *     the teacher tagged with learning outcomes; a score of at least
 *     COMPETENT_PCT (the TVET "competent" mark) demonstrates the criterion, a lower
 *     score shows it was assessed and the student is still working towards it.
 * The stronger state wins. Nothing here is stored except the evidence rows.
 */

export const COMPETENT_PCT = 70;
export const SOURCES = ["taskmentor"] as const;
export type Source = (typeof SOURCES)[number];
const SOURCE_TYPES = new Set(["quiz", "assignment"]);
const RANK: Record<MasteryState, number> = { NOT_COVERED: 0, COVERED: 1, DEMONSTRATED: 2 };

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const list = (ids: number[]) => sql.join(ids.map((i) => sql`${i}`), sql`, `);

export class CompetencyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Best score on a criterion from app evidence → state (pure). */
export function evidenceState(bestPct: number | null | undefined): MasteryState {
  if (bestPct === null || bestPct === undefined || !Number.isFinite(Number(bestPct))) return "NOT_COVERED";
  return Number(bestPct) >= COMPETENT_PCT ? "DEMONSTRATED" : "COVERED";
}

export const stronger = (a: MasteryState, b: MasteryState): MasteryState => (RANK[b] > RANK[a] ? b : a);

/** Learning outcomes with their criteria, for tagging pickers (no student data). */
export async function curriculumFor(subjectId: number) {
  const criteria = await loadSubjectCriteria(subjectId);
  const outcomes = new Map<number, { competency_id: number; element_number: number; title: string; criteria: { criteria_id: number; criteria_number: string; description: string }[] }>();
  for (const c of criteria) {
    if (!outcomes.has(c.competency_id)) outcomes.set(c.competency_id, { competency_id: c.competency_id, element_number: c.element_number, title: c.competency_title, criteria: [] });
    outcomes.get(c.competency_id)!.criteria.push({ criteria_id: c.criteria_id, criteria_number: c.criteria_number, description: c.description });
  }
  return [...outcomes.values()];
}

// ── Ingest ───────────────────────────────────────────────────────────────

export interface EvidenceTask {
  source_type: string;
  source_ref: number;
  subject_id: number;
  title: string;
  criteria_ids: number[];
  results: { student_id: number; score_pct: number; assessed_at?: string }[];
}

const MAX_TASKS = 100;
const MAX_RESULTS = 3000;

/**
 * Replaces each task's evidence with what the app sent: results × the task's criteria.
 * Criteria that don't belong to the task's subject are ignored, so a stale tag can't
 * leak into another subject's map. An empty criteria list (or results) clears the task.
 */
export async function ingestEvidence(source: Source, body: any, now = new Date()) {
  const tasks: any[] = Array.isArray(body?.tasks) ? body.tasks : [];
  if (!tasks.length) throw new CompetencyError("tasks[] is required");
  if (tasks.length > MAX_TASKS) throw new CompetencyError(`At most ${MAX_TASKS} tasks per call`);
  let written = 0;
  let ignoredCriteria = 0;
  for (const t of tasks) {
    const type = String(t?.source_type || "");
    const ref = Math.trunc(Number(t?.source_ref));
    const subjectId = Math.trunc(Number(t?.subject_id));
    if (!SOURCE_TYPES.has(type) || !(ref > 0) || !(subjectId > 0)) throw new CompetencyError("Each task needs source_type (quiz|assignment), source_ref and subject_id");
    const results: any[] = Array.isArray(t.results) ? t.results : [];
    if (results.length > MAX_RESULTS) throw new CompetencyError(`At most ${MAX_RESULTS} results per task`);
    const asked = [...new Set((Array.isArray(t.criteria_ids) ? t.criteria_ids : []).map((x: unknown) => Math.trunc(Number(x))).filter((x: number) => x > 0))] as number[];
    const valid = asked.length
      ? new Set(rows(await db.execute(sql`
          SELECT c.criteria_id AS id FROM CompetencyPerformanceCriteria c
          JOIN SubjectCompetency s ON s.competency_id = c.competency_id
          WHERE s.subject_id = ${subjectId} AND c.criteria_id IN (${list(asked)})`)).map((r) => Number(r.id)))
      : new Set<number>();
    ignoredCriteria += asked.length - valid.size;
    const title = String(t.title || `${type} ${ref}`).slice(0, 255);
    const values: ReturnType<typeof sql>[] = [];
    const seen = new Set<number>();
    for (const r of results) {
      const student = Math.trunc(Number(r?.student_id));
      const pct = Number(r?.score_pct);
      if (!(student > 0) || !Number.isFinite(pct) || seen.has(student)) continue;
      seen.add(student);
      const when = r.assessed_at ? new Date(r.assessed_at) : now;
      const at = Number.isNaN(when.getTime()) ? now : when;
      const score = Math.max(0, Math.min(100, Math.round(pct * 100) / 100));
      for (const c of valid) values.push(sql`(${student}, ${c}, ${subjectId}, ${source}, ${type}, ${ref}, ${title}, ${score}, ${at}, ${now})`);
    }
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM CompetencyEvidence WHERE source = ${source} AND source_type = ${type} AND source_ref = ${ref}`);
      for (let i = 0; i < values.length; i += 500) {
        await tx.execute(sql`
          INSERT INTO CompetencyEvidence (student_id, criteria_id, subject_id, source, source_type, source_ref, title, score_pct, assessed_at, updated_at)
          VALUES ${sql.join(values.slice(i, i + 500), sql`, `)}`);
      }
    });
    written += values.length;
  }
  return { tasks: tasks.length, rows: written, ignored_criteria: ignoredCriteria };
}

// ── Who may see what ─────────────────────────────────────────────────────

/** Subject × class pairs the viewer can open: the ones they teach, or every taught pair for oversight. */
export async function mapOptions(userId: number, oversight: boolean, yearId: number | null) {
  if (!yearId) return [];
  const pairs = rows(await db.execute(sql`
    SELECT DISTINCT t.subject_id, s.name AS subject_name, s.code AS subject_code, t.class_group_id, cg.name AS class_name,
           (SELECT COUNT(*) FROM CompetencyPerformanceCriteria c JOIN SubjectCompetency sc ON sc.competency_id = c.competency_id WHERE sc.subject_id = t.subject_id) AS criteria
    FROM TeacherSubjectAssignment t
    JOIN Subject s ON s.subject_id = t.subject_id
    JOIN ClassGroup cg ON cg.class_group_id = t.class_group_id
    WHERE t.academic_year_id = ${yearId} ${oversight ? sql`` : sql`AND t.user_id = ${userId}`}
    ORDER BY s.name, cg.name`));
  const bySubject = new Map<number, { subject_id: number; name: string; code: string | null; criteria: number; classes: { class_group_id: number; name: string }[] }>();
  for (const p of pairs) {
    const id = Number(p.subject_id);
    if (!bySubject.has(id)) bySubject.set(id, { subject_id: id, name: p.subject_name, code: p.subject_code ?? null, criteria: Number(p.criteria), classes: [] });
    bySubject.get(id)!.classes.push({ class_group_id: Number(p.class_group_id), name: p.class_name });
  }
  return [...bySubject.values()];
}

export async function teaches(userId: number, subjectId: number, classGroupId: number, yearId: number | null) {
  if (!yearId) return false;
  const [hit] = await db
    .select({ user_id: TeacherSubjectAssignment.user_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, subjectId),
        eq(TeacherSubjectAssignment.class_group_id, classGroupId),
        eq(TeacherSubjectAssignment.academic_year_id, yearId),
      ),
    )
    .limit(1);
  return !!hit;
}

// ── The map ──────────────────────────────────────────────────────────────

/** Students of the class who take the subject (the same rule as "the students I teach"). */
async function classRoster(subjectId: number, classGroupId: number, yearId: number) {
  const rosterRows = await getTeacherRosterRows([{ subject_id: subjectId, class_group_id: classGroupId } as TeacherAssignment], yearId);
  const seen = new Set<number>();
  return rosterRows
    .filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)))
    .map((r) => ({ user_id: r.user_id, name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.username || `Student ${r.user_id}` }));
}

/** Published e-learning courses of this subject for this class, aligned items merged per criterion. */
async function elearningAligned(subjectId: number, classGroupId: number | null) {
  const courses = await db
    .select()
    .from(Course)
    .where(and(eq(Course.subject_id, subjectId), eq(Course.status, "PUBLISHED"), ...(classGroupId ? [eq(Course.class_group_id, classGroupId)] : [])));
  const merged = new Map<number, TreeItem[]>();
  for (const c of courses) {
    for (const [cid, items] of await alignedItemsByCriterion(c)) merged.set(cid, [...(merged.get(cid) || []), ...items]);
  }
  return merged;
}

/** Per student × criterion e-learning states. */
async function elearningStates(aligned: Map<number, TreeItem[]>, criteriaIds: number[], userIds: number[]) {
  const out = new Map<number, Map<number, MasteryState>>();
  const itemIds = [...new Set([...aligned.values()].flat().map((i) => i.item_id))];
  if (!itemIds.length || !userIds.length) return out;
  const progressRows = await db
    .select()
    .from(CourseItemProgress)
    .where(and(inArray(CourseItemProgress.item_id, itemIds), inArray(CourseItemProgress.user_id, userIds)));
  const byUser = new Map<number, Map<number, { state: string; best_score_pct: string | null }>>();
  for (const r of progressRows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map());
    byUser.get(r.user_id)!.set(r.item_id, { state: r.state, best_score_pct: r.best_score_pct });
  }
  const checks = await loadBestChecks(itemIds, userIds);
  for (const u of userIds) {
    const best = new Map<number, number>();
    for (const id of itemIds) {
      const v = checks.get(`${u}:${id}`);
      if (v !== undefined) best.set(id, v);
    }
    const states = new Map<number, MasteryState>();
    for (const c of criteriaIds) states.set(c, deriveMastery(aligned.get(c), byUser.get(u) || new Map(), best));
    out.set(u, states);
  }
  return out;
}

/** Best app score per student × criterion, and how many pieces of work it came from. */
async function evidenceBest(subjectId: number, userIds: number[]) {
  const out = new Map<string, { best: number; count: number }>();
  if (!userIds.length) return out;
  for (const r of rows(await db.execute(sql`
    SELECT student_id, criteria_id, MAX(score_pct) AS best, COUNT(*) AS n FROM CompetencyEvidence
    WHERE subject_id = ${subjectId} AND student_id IN (${list(userIds)}) GROUP BY student_id, criteria_id`))) {
    out.set(`${r.student_id}:${r.criteria_id}`, { best: Number(r.best), count: Number(r.n) });
  }
  return out;
}

/** Class × criteria map for one subject and class group. */
export async function classMap(subjectId: number, classGroupId: number, yearId: number) {
  const [subject] = await db.select({ name: Subject.name, code: Subject.code }).from(Subject).where(eq(Subject.subject_id, subjectId)).limit(1);
  if (!subject) throw new CompetencyError("Subject not found", 404);
  const [klass] = await db.select({ name: ClassGroup.name }).from(ClassGroup).where(eq(ClassGroup.class_group_id, classGroupId)).limit(1);
  if (!klass) throw new CompetencyError("Class not found", 404);

  const [outcomes, roster, aligned] = await Promise.all([curriculumFor(subjectId), classRoster(subjectId, classGroupId, yearId), elearningAligned(subjectId, classGroupId)]);
  const criteriaIds = outcomes.flatMap((o) => o.criteria.map((c) => c.criteria_id));
  const userIds = roster.map((s) => s.user_id);
  const [el, ev] = await Promise.all([elearningStates(aligned, criteriaIds, userIds), evidenceBest(subjectId, userIds)]);
  const tagged = rows(await db.execute(sql`
    SELECT criteria_id, COUNT(DISTINCT source, source_type, source_ref) AS n FROM CompetencyEvidence
    WHERE subject_id = ${subjectId} ${userIds.length ? sql`AND student_id IN (${list(userIds)})` : sql`AND 1 = 0`} GROUP BY criteria_id`));
  const tasksFor = new Map(tagged.map((r) => [Number(r.criteria_id), Number(r.n)]));

  const students = roster.map((s) => {
    const states: Record<number, MasteryState> = {};
    const best: Record<number, number | null> = {};
    for (const c of criteriaIds) {
      const e = ev.get(`${s.user_id}:${c}`);
      best[c] = e ? e.best : null;
      states[c] = stronger(el.get(s.user_id)?.get(c) ?? "NOT_COVERED", evidenceState(e?.best));
    }
    const outcomeSummary: Record<number, { demonstrated: number; assessed: number; total: number }> = {};
    for (const o of outcomes) {
      const st = o.criteria.map((c) => states[c.criteria_id]);
      outcomeSummary[o.competency_id] = { demonstrated: st.filter((x) => x === "DEMONSTRATED").length, assessed: st.filter((x) => x !== "NOT_COVERED").length, total: st.length };
    }
    const all = Object.values(states);
    return { user_id: s.user_id, name: s.name, states, best, outcomes: outcomeSummary, demonstrated: all.filter((x) => x === "DEMONSTRATED").length, assessed: all.filter((x) => x !== "NOT_COVERED").length };
  });

  const n = students.length;
  const pct = (k: number) => (n ? Math.round((k / n) * 100) : 0);
  return {
    subject: { subject_id: subjectId, name: subject.name, code: subject.code ?? null },
    class_group: { class_group_id: classGroupId, name: klass.name },
    competent_pct: COMPETENT_PCT,
    outcomes: outcomes.map((o) => ({
      ...o,
      criteria: o.criteria.map((c) => ({
        ...c,
        elearning_items: (aligned.get(c.criteria_id) || []).length,
        tasks: tasksFor.get(c.criteria_id) ?? 0,
        assessed_pct: pct(students.filter((s) => s.states[c.criteria_id] !== "NOT_COVERED").length),
        demonstrated_pct: pct(students.filter((s) => s.states[c.criteria_id] === "DEMONSTRATED").length),
      })),
    })),
    criteria_total: criteriaIds.length,
    criteria_without_evidence: criteriaIds.filter((c) => !(aligned.get(c) || []).length && !tasksFor.get(c)).length,
    students: students.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** One student's evidence in one subject, per criterion (drill-down; also the student's own view). */
export async function studentEvidence(studentId: number, subjectId: number, classGroupId: number | null) {
  const [outcomes, aligned] = await Promise.all([curriculumFor(subjectId), elearningAligned(subjectId, classGroupId)]);
  const criteriaIds = outcomes.flatMap((o) => o.criteria.map((c) => c.criteria_id));
  const el = await elearningStates(aligned, criteriaIds, [studentId]);
  const appRows = rows(await db.execute(sql`
    SELECT criteria_id, source, source_type, source_ref, title, score_pct, DATE_FORMAT(assessed_at, '%Y-%m-%dT%H:%i:%sZ') AS assessed_at
    FROM CompetencyEvidence WHERE subject_id = ${subjectId} AND student_id = ${studentId} ORDER BY assessed_at DESC`));
  const itemIds = [...new Set([...aligned.values()].flat().map((i) => i.item_id))];
  const progress = itemIds.length
    ? await db.select().from(CourseItemProgress).where(and(eq(CourseItemProgress.user_id, studentId), inArray(CourseItemProgress.item_id, itemIds)))
    : [];
  const done = new Map(progress.filter((p) => p.state === "COMPLETED").map((p) => [p.item_id, p]));
  return outcomes.map((o) => ({
    competency_id: o.competency_id,
    element_number: o.element_number,
    title: o.title,
    criteria: o.criteria.map((c) => {
      const app = appRows.filter((r) => Number(r.criteria_id) === c.criteria_id);
      const best = app.length ? Math.max(...app.map((r) => Number(r.score_pct))) : null;
      return {
        ...c,
        state: stronger(el.get(studentId)?.get(c.criteria_id) ?? "NOT_COVERED", evidenceState(best)),
        evidence: [
          ...app.map((r) => ({ kind: r.source_type as string, source: r.source as string, ref: Number(r.source_ref), title: r.title as string, score_pct: Number(r.score_pct), at: r.assessed_at as string })),
          ...(aligned.get(c.criteria_id) || [])
            .filter((i) => done.has(i.item_id))
            .map((i) => ({
              kind: "elearning",
              source: "mis",
              ref: i.item_id,
              title: i.title,
              score_pct: done.get(i.item_id)!.best_score_pct === null ? null : Number(done.get(i.item_id)!.best_score_pct),
              at: done.get(i.item_id)!.completed_at ? new Date(done.get(i.item_id)!.completed_at as any).toISOString() : null,
            })),
        ],
      };
    }),
  }));
}

/**
 * A student's own map: every subject they take this year that has learning
 * outcomes, with each criterion's state and evidence (also used for parents).
 */
export async function studentMap(studentId: number, yearId: number | null) {
  if (!yearId) return { competent_pct: COMPETENT_PCT, subjects: [] };
  const subjects = rows(await db.execute(sql`
    SELECT e.subject_id, s.name, s.code, s.color,
           (SELECT scg.class_group_id FROM StudentClassGroup scg
             WHERE scg.user_id = e.user_id AND scg.academic_year_id = ${yearId} AND scg.status = 'ACTIVE' LIMIT 1) AS class_group_id
    FROM StudentSubjectEnrollment e
    JOIN Subject s ON s.subject_id = e.subject_id
    WHERE e.user_id = ${studentId} AND e.academic_year_id = ${yearId} AND e.status = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM SubjectCompetency sc JOIN CompetencyPerformanceCriteria c ON c.competency_id = sc.competency_id WHERE sc.subject_id = e.subject_id)
    ORDER BY s.name`));
  const out = [];
  for (const s of subjects) {
    const outcomes = await studentEvidence(studentId, Number(s.subject_id), s.class_group_id ? Number(s.class_group_id) : null);
    const states = outcomes.flatMap((o) => o.criteria.map((c) => c.state));
    out.push({
      subject_id: Number(s.subject_id),
      name: s.name as string,
      code: (s.code ?? null) as string | null,
      color: (s.color ?? null) as string | null,
      total: states.length,
      demonstrated: states.filter((x) => x === "DEMONSTRATED").length,
      assessed: states.filter((x) => x !== "NOT_COVERED").length,
      outcomes,
    });
  }
  return { competent_pct: COMPETENT_PCT, subjects: out };
}
