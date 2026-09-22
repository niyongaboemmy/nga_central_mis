import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  CompetencyPerformanceCriteria,
  Course,
  CourseItemProgress,
  KnowledgeCheckAttempt,
  Subject,
  SubjectCompetency,
} from "../../db/schema";
import { CourseRow, listCourseMembers, listMemberCourseIds } from "./courseMembership";
import { loadCourseTree, isItemVisibleToStudents, TreeItem } from "./courseTree";

/**
 * Competency mastery (plan Phase 4) — computed, never stored. The outcome primitive is the
 * performance criterion; an item is *aligned* to a criterion via LessonNoteCriteria (notes)
 * or CourseItemCriteria (everything else). Per student × criterion:
 *   NOT_COVERED   no published aligned item exists
 *   COVERED       an aligned item is completed
 *   DEMONSTRATED  an aligned SUBMIT / MIN_SCORE item is completed, or a knowledge check ≥ 80 %
 */
export type MasteryState = "NOT_COVERED" | "COVERED" | "DEMONSTRATED";

const DEMONSTRATE_PCT = 80;

interface CriterionRow {
  criteria_id: number;
  criteria_number: string;
  description: string;
  competency_id: number;
  element_number: number;
  competency_title: string;
  sort_order: number;
}

export async function loadSubjectCriteria(subjectId: number): Promise<CriterionRow[]> {
  return db
    .select({
      criteria_id: CompetencyPerformanceCriteria.criteria_id,
      criteria_number: CompetencyPerformanceCriteria.criteria_number,
      description: CompetencyPerformanceCriteria.description,
      competency_id: SubjectCompetency.competency_id,
      element_number: SubjectCompetency.element_number,
      competency_title: SubjectCompetency.title,
      sort_order: CompetencyPerformanceCriteria.sort_order,
    })
    .from(CompetencyPerformanceCriteria)
    .innerJoin(SubjectCompetency, eq(SubjectCompetency.competency_id, CompetencyPerformanceCriteria.competency_id))
    .where(eq(SubjectCompetency.subject_id, subjectId))
    .orderBy(asc(SubjectCompetency.sort_order), asc(SubjectCompetency.element_number), asc(CompetencyPerformanceCriteria.sort_order), asc(CompetencyPerformanceCriteria.criteria_id));
}

/** Visible items of a course keyed by the criteria they address. */
export async function alignedItemsByCriterion(course: CourseRow): Promise<Map<number, TreeItem[]>> {
  const tree = await loadCourseTree(course);
  const map = new Map<number, TreeItem[]>();
  for (const s of tree) {
    if (s.status !== "PUBLISHED") continue;
    for (const i of s.items) {
      if (!isItemVisibleToStudents(i) || i.completion_rule === "NONE") continue;
      for (const c of i.criteria) {
        if (!map.has(c.criteria_id)) map.set(c.criteria_id, []);
        map.get(c.criteria_id)!.push(i);
      }
    }
  }
  return map;
}

/** Pure derivation for one student given aligned items and their progress rows. */
export function deriveMastery(
  aligned: TreeItem[] | undefined,
  progress: Map<number, { state: string; best_score_pct: string | number | null }>,
  bestCheckPct: Map<number, number>,
): MasteryState {
  if (!aligned || aligned.length === 0) return "NOT_COVERED";
  let covered = false;
  for (const i of aligned) {
    const p = progress.get(i.item_id);
    if (!p || p.state !== "COMPLETED") continue;
    covered = true;
    if (["SUBMIT", "MIN_SCORE"].includes(i.completion_rule)) return "DEMONSTRATED";
    if (i.item_type === "KNOWLEDGE_CHECK" && (bestCheckPct.get(i.item_id) ?? Number(p.best_score_pct ?? 0)) >= DEMONSTRATE_PCT) return "DEMONSTRATED";
  }
  return covered ? "COVERED" : "NOT_COVERED";
}

async function loadBestChecks(itemIds: number[], userIds: number[]) {
  const map = new Map<string, number>();
  if (itemIds.length === 0 || userIds.length === 0) return map;
  const rows = await db
    .select({ item_id: KnowledgeCheckAttempt.item_id, user_id: KnowledgeCheckAttempt.user_id, score_pct: KnowledgeCheckAttempt.score_pct })
    .from(KnowledgeCheckAttempt)
    .where(and(inArray(KnowledgeCheckAttempt.item_id, itemIds), inArray(KnowledgeCheckAttempt.user_id, userIds)));
  for (const r of rows) {
    const k = `${r.user_id}:${r.item_id}`;
    map.set(k, Math.max(map.get(k) ?? 0, Number(r.score_pct)));
  }
  return map;
}

/**
 * Class × criteria matrix for one course (teacher / admin heat-map). Rows = students, columns =
 * criteria grouped by element; also per-criterion class coverage %.
 */
export async function courseMasteryMatrix(course: CourseRow) {
  const [criteria, aligned, members] = await Promise.all([loadSubjectCriteria(course.subject_id), alignedItemsByCriterion(course), listCourseMembers(course)]);
  const itemIds = [...new Set([...aligned.values()].flat().map((i) => i.item_id))];
  const userIds = members.map((m) => m.user_id);
  const progressRows =
    itemIds.length && userIds.length
      ? await db
          .select()
          .from(CourseItemProgress)
          .where(and(inArray(CourseItemProgress.item_id, itemIds), inArray(CourseItemProgress.user_id, userIds)))
      : [];
  const byUser = new Map<number, Map<number, { state: string; best_score_pct: string | null }>>();
  for (const r of progressRows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map());
    byUser.get(r.user_id)!.set(r.item_id, { state: r.state, best_score_pct: r.best_score_pct });
  }
  const checks = await loadBestChecks(itemIds, userIds);

  const students = members.map((m) => {
    const progress = byUser.get(m.user_id) || new Map();
    const bestChecks = new Map<number, number>();
    for (const id of itemIds) {
      const v = checks.get(`${m.user_id}:${id}`);
      if (v !== undefined) bestChecks.set(id, v);
    }
    const states: Record<number, MasteryState> = {};
    for (const c of criteria) states[c.criteria_id] = deriveMastery(aligned.get(c.criteria_id), progress, bestChecks);
    const values = Object.values(states);
    return {
      user_id: m.user_id,
      name: m.name,
      states,
      covered: values.filter((v) => v !== "NOT_COVERED").length,
      demonstrated: values.filter((v) => v === "DEMONSTRATED").length,
    };
  });

  const elements = new Map<number, { competency_id: number; element_number: number; title: string; criteria: CriterionRow[] }>();
  for (const c of criteria) {
    if (!elements.has(c.competency_id)) elements.set(c.competency_id, { competency_id: c.competency_id, element_number: c.element_number, title: c.competency_title, criteria: [] });
    elements.get(c.competency_id)!.criteria.push(c);
  }
  const total = students.length;
  const columns = criteria.map((c) => ({
    criteria_id: c.criteria_id,
    criteria_number: c.criteria_number,
    description: c.description,
    competency_id: c.competency_id,
    aligned_items: (aligned.get(c.criteria_id) || []).length,
    covered_pct: total ? Math.round((students.filter((s) => s.states[c.criteria_id] !== "NOT_COVERED").length / total) * 100) : 0,
    demonstrated_pct: total ? Math.round((students.filter((s) => s.states[c.criteria_id] === "DEMONSTRATED").length / total) * 100) : 0,
  }));
  return {
    course_id: course.course_id,
    criteria_total: criteria.length,
    unaligned_criteria: columns.filter((c) => c.aligned_items === 0).length,
    elements: [...elements.values()].map((e) => ({ ...e, criteria: e.criteria.map((c) => ({ criteria_id: c.criteria_id, criteria_number: c.criteria_number, description: c.description })) })),
    columns,
    students: students.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** A student's own mastery across every course they're in, grouped by subject → element. */
export async function studentMastery(userId: number) {
  const courseIds = await listMemberCourseIds(userId);
  if (courseIds.length === 0) return [];
  const courses = await db
    .select({ course: Course, subject_name: Subject.name, subject_color: Subject.color })
    .from(Course)
    .innerJoin(Subject, eq(Subject.subject_id, Course.subject_id))
    .where(inArray(Course.course_id, courseIds));

  // Several courses can share a subject (one per term): merge aligned items per criterion.
  const bySubject = new Map<number, { subject_id: number; subject_name: string; color: string | null; aligned: Map<number, TreeItem[]> }>();
  for (const { course, subject_name, subject_color } of courses) {
    if (!bySubject.has(course.subject_id)) bySubject.set(course.subject_id, { subject_id: course.subject_id, subject_name, color: subject_color, aligned: new Map() });
    const target = bySubject.get(course.subject_id)!.aligned;
    const aligned = await alignedItemsByCriterion(course);
    for (const [cid, items] of aligned) target.set(cid, [...(target.get(cid) || []), ...items]);
  }
  const allItemIds = [...new Set([...bySubject.values()].flatMap((s) => [...s.aligned.values()].flat().map((i) => i.item_id)))];
  const progressRows = allItemIds.length
    ? await db.select().from(CourseItemProgress).where(and(eq(CourseItemProgress.user_id, userId), inArray(CourseItemProgress.item_id, allItemIds)))
    : [];
  const progress = new Map(progressRows.map((r) => [r.item_id, { state: r.state, best_score_pct: r.best_score_pct }]));
  const checks = await loadBestChecks(allItemIds, [userId]);
  const bestChecks = new Map<number, number>();
  for (const id of allItemIds) {
    const v = checks.get(`${userId}:${id}`);
    if (v !== undefined) bestChecks.set(id, v);
  }

  const out = [];
  for (const s of bySubject.values()) {
    const criteria = await loadSubjectCriteria(s.subject_id);
    if (criteria.length === 0) continue;
    const elements = new Map<number, { competency_id: number; element_number: number; title: string; criteria: any[]; covered: number; demonstrated: number; total: number }>();
    for (const c of criteria) {
      if (!elements.has(c.competency_id)) elements.set(c.competency_id, { competency_id: c.competency_id, element_number: c.element_number, title: c.competency_title, criteria: [], covered: 0, demonstrated: 0, total: 0 });
      const e = elements.get(c.competency_id)!;
      const state = deriveMastery(s.aligned.get(c.criteria_id), progress, bestChecks);
      e.criteria.push({ criteria_id: c.criteria_id, criteria_number: c.criteria_number, description: c.description, state });
      e.total += 1;
      if (state === "COVERED") e.covered += 1;
      if (state === "DEMONSTRATED") e.demonstrated += 1;
    }
    out.push({ subject_id: s.subject_id, subject_name: s.subject_name, color: s.color, elements: [...elements.values()] });
  }
  return out;
}
