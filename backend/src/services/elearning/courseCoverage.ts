import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { CourseItem, LessonNote, LessonNoteCriteria } from "../../db/schema";
import { CourseRow } from "./courseMembership";
import { CriterionChip, TreeSection, isItemVisibleToStudents, loadCourseTree } from "./courseTree";
import { loadSubjectCriteria } from "./courseMastery";

/**
 * Curriculum coverage — the instructor-side counterpart of mastery. A week's *targets* are the
 * performance criteria the Scheme of Work says will be taught (SchemeEntryCriteria); its items
 * *cover* a target when an aligned item exists. Gaps drive the "build this week's journey"
 * action and the coverage % on the register, so a course can never quietly drift from the
 * curriculum the scheme was validated against.
 */

export interface SectionCoverage {
  section_id: number;
  title: string;
  status: string;
  element_number: number | null;
  competency_title: string | null;
  targets: CriterionChip[];
  covered: CriterionChip[];
  gaps: CriterionChip[];
  /** Criteria items address that the scheme did not plan for this week — flagged, not wrong. */
  extra: CriterionChip[];
  has_check: boolean;
  items: number;
}

export function coverageOfSection(section: TreeSection): SectionCoverage {
  const items = section.items.filter((i) => i.item_type !== "HEADER");
  const covered = new Map<number, CriterionChip>();
  for (const i of items) for (const c of i.criteria) covered.set(c.criteria_id, c);
  const targetIds = new Set(section.criteria.map((c) => c.criteria_id));
  return {
    section_id: section.section_id,
    title: section.title,
    status: section.status,
    element_number: section.element_number,
    competency_title: section.competency_title,
    targets: section.criteria,
    covered: section.criteria.filter((c) => covered.has(c.criteria_id)),
    gaps: section.criteria.filter((c) => !covered.has(c.criteria_id)),
    extra: [...covered.values()].filter((c) => !targetIds.has(c.criteria_id)),
    has_check: items.some((i) => i.item_type === "KNOWLEDGE_CHECK" || i.item_type === "TASKMENTOR_QUIZ"),
    items: items.length,
  };
}

export async function courseCoverage(course: CourseRow, tree?: TreeSection[]) {
  const sections = tree ?? (await loadCourseTree(course));
  const perSection = sections.filter((s) => s.status !== "HIDDEN").map(coverageOfSection);
  const curriculum = await loadSubjectCriteria(course.subject_id);

  // Course-wide: every curriculum criterion → planned (some week targets it) / covered (some item addresses it).
  const planned = new Set(perSection.flatMap((s) => s.targets.map((c) => c.criteria_id)));
  const coveredIds = new Set(
    sections.flatMap((s) => (s.status === "HIDDEN" ? [] : s.items.filter((i) => i.item_type !== "HEADER").flatMap((i) => i.criteria.map((c) => c.criteria_id)))),
  );
  const publishedCovered = new Set(
    sections.flatMap((s) => (s.status !== "PUBLISHED" ? [] : s.items.filter(isItemVisibleToStudents).flatMap((i) => i.criteria.map((c) => c.criteria_id)))),
  );
  const elements = new Map<number, { competency_id: number; element_number: number; title: string; total: number; planned: number; covered: number; live: number; criteria: { criteria_id: number; criteria_number: string; description: string; planned: boolean; covered: boolean; live: boolean }[] }>();
  for (const c of curriculum) {
    if (!elements.has(c.competency_id)) elements.set(c.competency_id, { competency_id: c.competency_id, element_number: c.element_number, title: c.competency_title, total: 0, planned: 0, covered: 0, live: 0, criteria: [] });
    const e = elements.get(c.competency_id)!;
    const p = planned.has(c.criteria_id);
    const cov = coveredIds.has(c.criteria_id);
    const live = publishedCovered.has(c.criteria_id);
    e.total += 1;
    if (p) e.planned += 1;
    if (cov) e.covered += 1;
    if (live) e.live += 1;
    e.criteria.push({ criteria_id: c.criteria_id, criteria_number: c.criteria_number, description: c.description, planned: p, covered: cov, live });
  }
  const targetsTotal = perSection.reduce((n, s) => n + s.targets.length, 0);
  const targetsCovered = perSection.reduce((n, s) => n + s.covered.length, 0);
  return {
    course_id: course.course_id,
    // Primary KPI: of what the scheme planned, how much has learning content behind it.
    targets_total: targetsTotal,
    targets_covered: targetsCovered,
    coverage_pct: targetsTotal ? Math.round((targetsCovered / targetsTotal) * 100) : 0,
    curriculum_total: curriculum.length,
    curriculum_covered: coveredIds.size ? curriculum.filter((c) => coveredIds.has(c.criteria_id)).length : 0,
    curriculum_pct: curriculum.length ? Math.round((curriculum.filter((c) => coveredIds.has(c.criteria_id)).length / curriculum.length) * 100) : 0,
    weeks_without_check: perSection.filter((s) => s.items > 0 && !s.has_check).length,
    sections: perSection,
    elements: [...elements.values()],
  };
}

/**
 * "Build this week's journey": fills a section's gaps from what the teacher already has —
 * every published/draft note of theirs that covers a gap criterion is placed (VIEW), ordered by
 * criteria number, and a quick-check slot is reported as missing so the drawer can offer AI
 * generation. Idempotent; never removes anything the teacher placed by hand.
 */
export async function buildSectionJourney(course: CourseRow, sectionId: number, userId: number) {
  const tree = await loadCourseTree(course);
  const section = tree.find((s) => s.section_id === sectionId);
  if (!section) return null;
  const before = coverageOfSection(section);
  if (before.gaps.length === 0) return { added: [], still_missing: [], has_check: before.has_check, coverage: before };

  const gapIds = before.gaps.map((c) => c.criteria_id);
  const candidates = await db
    .select({ note_id: LessonNote.note_id, title: LessonNote.title, user_id: LessonNote.user_id, class_group_id: LessonNote.class_group_id, criteria_id: LessonNoteCriteria.criteria_id })
    .from(LessonNoteCriteria)
    .innerJoin(LessonNote, eq(LessonNote.note_id, LessonNoteCriteria.note_id))
    .where(and(inArray(LessonNoteCriteria.criteria_id, gapIds), eq(LessonNote.subject_id, course.subject_id)));
  const placed = new Set(section.items.filter((i) => i.item_type === "LESSON_NOTE").map((i) => i.ref_id));
  const byNote = new Map<number, { title: string; criteria: Set<number> }>();
  for (const c of candidates) {
    if (c.user_id !== userId && c.class_group_id !== course.class_group_id) continue;
    if (placed.has(c.note_id)) continue;
    if (!byNote.has(c.note_id)) byNote.set(c.note_id, { title: c.title, criteria: new Set() });
    byNote.get(c.note_id)!.criteria.add(c.criteria_id);
  }
  // Greedy: notes covering the most open gaps first.
  const open = new Set(gapIds);
  const added: { note_id: number; title: string; criteria_ids: number[] }[] = [];
  let position = section.items.length;
  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${CourseItem.position}), -1)` })
    .from(CourseItem)
    .where(eq(CourseItem.section_id, sectionId));
  position = Number(max) + 1;
  while (open.size > 0) {
    let best: [number, { title: string; criteria: Set<number> }] | null = null;
    let bestGain = 0;
    for (const entry of byNote) {
      const gain = [...entry[1].criteria].filter((c) => open.has(c)).length;
      if (gain > bestGain) {
        bestGain = gain;
        best = entry;
      }
    }
    if (!best) break;
    await db.insert(CourseItem).values({ section_id: sectionId, item_type: "LESSON_NOTE", ref_id: best[0], title: best[1].title, position: position++, completion_rule: "VIEW", created_by: userId });
    const covered = [...best[1].criteria].filter((c) => open.has(c));
    covered.forEach((c) => open.delete(c));
    added.push({ note_id: best[0], title: best[1].title, criteria_ids: covered });
    byNote.delete(best[0]);
  }
  const after = coverageOfSection((await loadCourseTree(course)).find((s) => s.section_id === sectionId)!);
  return { added, still_missing: after.gaps, has_check: after.has_check, coverage: after };
}
