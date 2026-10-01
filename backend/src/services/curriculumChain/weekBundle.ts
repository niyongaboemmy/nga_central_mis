import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "../../db";
import {
  CompetencyPerformanceCriteria,
  Course,
  LessonNote,
  LessonNoteCriteria,
  SchemeEntryCriteria,
  SchemeOfWork,
  SchemeOfWorkEntry,
  SubjectCompetency,
  SubjectDocument,
} from "../../db/schema";
import { toDateOnly } from "../elearning/dates";
import { loadCourseTree } from "../elearning/courseTree";
import { coverageOfSection } from "../elearning/courseCoverage";
import { loadLessonPlansForEntries } from "./lessonPlans";

/**
 * One week of a scheme of work with everything planned or written for it (LESSON_STUDIO
 * plan §5.1): the entry, its Learning Outcome and target criteria, lesson plans, notes,
 * subject materials, and the e-learning section with its coverage. Lesson Notes, Scheme of
 * Work, E-Learning and the Lesson Studio all read this, so they agree on a week's state.
 */
export interface WeekBundle {
  entry: {
    entry_id: number;
    scheme_id: number;
    week_number: string | null;
    start_date: string | null;
    end_date: string | null;
    topic: string | null;
    sub_topic: string | null;
    objective: string | null;
    entry_status: string | null;
  };
  competency: { competency_id: number; element_number: number | null; title: string } | null;
  criteria: { criteria_id: number; criteria_number: string; description: string }[];
  lesson_plans: { lesson_id: number; session_code: string | null; lesson_date: string | null; big_question: string | null; outcomes: number; sections: number }[];
  notes: { note_id: number; title: string; status: string; source: string; is_pdf: boolean; criteria_ids: number[]; placed_item_id: number | null }[];
  materials: { document_id: number; original_name: string; mime_type: string | null; file_size: number | null }[];
  section: { section_id: number; status: string; unlock_at: string | null; items: number; published_items: number; pending_review: number } | null;
  coverage: { targets: number; covered: number; gap_criteria_ids: number[] } | null;
  readiness: {
    has_topic: boolean;
    has_criteria: boolean;
    has_plan: boolean;
    has_note: boolean;
    has_items: boolean;
    is_live: boolean;
    /** Single word for the UI chip: EMPTY (no topic) → TODO → DRAFTED → LIVE. */
    state: "EMPTY" | "TODO" | "DRAFTED" | "LIVE";
  };
}

type SchemeRow = typeof SchemeOfWork.$inferSelect;

export async function loadWeekBundles(scheme: SchemeRow): Promise<{ course_id: number | null; weeks: WeekBundle[] }> {
  const entries = await db
    .select()
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.scheme_id, scheme.scheme_id))
    .orderBy(asc(SchemeOfWorkEntry.start_date), asc(SchemeOfWorkEntry.entry_id));
  if (entries.length === 0) return { course_id: null, weeks: [] };
  const entryIds = entries.map((e) => e.entry_id);
  const competencyIds = [...new Set(entries.map((e) => e.competency_id).filter((x): x is number => !!x))];

  const [competencies, criteriaRows, plansByEntry, [course]] = await Promise.all([
    competencyIds.length
      ? db
          .select({ competency_id: SubjectCompetency.competency_id, element_number: SubjectCompetency.element_number, title: SubjectCompetency.title })
          .from(SubjectCompetency)
          .where(inArray(SubjectCompetency.competency_id, competencyIds))
      : Promise.resolve([]),
    db
      .select({
        entry_id: SchemeEntryCriteria.entry_id,
        criteria_id: CompetencyPerformanceCriteria.criteria_id,
        criteria_number: CompetencyPerformanceCriteria.criteria_number,
        description: CompetencyPerformanceCriteria.description,
      })
      .from(SchemeEntryCriteria)
      .innerJoin(CompetencyPerformanceCriteria, eq(CompetencyPerformanceCriteria.criteria_id, SchemeEntryCriteria.criteria_id))
      .where(inArray(SchemeEntryCriteria.entry_id, entryIds)),
    loadLessonPlansForEntries(entryIds),
    db.select().from(Course).where(eq(Course.scheme_id, scheme.scheme_id)).limit(1),
  ]);

  // Notes for this subject that this class can use (the owner's, or written for the class
  // group), anchored to a week or aligned to any planned criterion.
  const noteRows = await db
    .select({
      note_id: LessonNote.note_id,
      title: LessonNote.title,
      status: LessonNote.status,
      source: LessonNote.source,
      file_path: LessonNote.file_path,
      scheme_entry_id: LessonNote.scheme_entry_id,
      user_id: LessonNote.user_id,
      class_group_id: LessonNote.class_group_id,
    })
    .from(LessonNote)
    .where(
      and(
        eq(LessonNote.subject_id, scheme.subject_id),
        or(eq(LessonNote.user_id, scheme.user_id), eq(LessonNote.class_group_id, scheme.class_group_id)),
      ),
    );
  const noteIds = noteRows.map((n) => n.note_id);
  const noteCriteria = noteIds.length
    ? await db.select().from(LessonNoteCriteria).where(inArray(LessonNoteCriteria.note_id, noteIds))
    : [];
  const criteriaByNote = new Map<number, number[]>();
  for (const nc of noteCriteria) {
    const list = criteriaByNote.get(nc.note_id) ?? [];
    list.push(nc.criteria_id);
    criteriaByNote.set(nc.note_id, list);
  }

  const materials = competencyIds.length
    ? await db
        .select({
          document_id: SubjectDocument.document_id,
          original_name: SubjectDocument.original_name,
          mime_type: SubjectDocument.mime_type,
          file_size: SubjectDocument.file_size,
          competency_id: SubjectDocument.competency_id,
        })
        .from(SubjectDocument)
        .where(and(eq(SubjectDocument.subject_id, scheme.subject_id), inArray(SubjectDocument.competency_id, competencyIds)))
    : [];

  // The e-learning side, if a course exists: the same tree the builder shows.
  const tree = course ? await loadCourseTree(course) : [];
  const sectionByEntry = new Map(tree.filter((s) => s.scheme_entry_id).map((s) => [s.scheme_entry_id as number, s]));
  const placedNoteItem = new Map<number, number>();
  for (const s of tree) for (const i of s.items) if (i.item_type === "LESSON_NOTE" && i.ref_id) placedNoteItem.set(i.ref_id, i.item_id);

  const weeks = entries.map((entry): WeekBundle => {
    const criteria = criteriaRows.filter((c) => c.entry_id === entry.entry_id).map(({ entry_id: _e, ...c }) => c);
    const targetIds = new Set(criteria.map((c) => c.criteria_id));
    const competency = competencies.find((c) => c.competency_id === entry.competency_id) ?? null;
    const plans = plansByEntry.get(entry.entry_id) ?? [];
    const notes = noteRows
      .filter((n) => n.scheme_entry_id === entry.entry_id || (criteriaByNote.get(n.note_id) ?? []).some((id) => targetIds.has(id)))
      .map((n) => ({
        note_id: n.note_id,
        title: n.title,
        status: n.status ?? "DRAFT",
        source: n.source ?? "MANUAL",
        is_pdf: !!n.file_path,
        criteria_ids: criteriaByNote.get(n.note_id) ?? [],
        placed_item_id: placedNoteItem.get(n.note_id) ?? null,
      }));
    const section = sectionByEntry.get(entry.entry_id);
    const realItems = section ? section.items.filter((i) => i.item_type !== "HEADER") : [];
    const cov = section ? coverageOfSection(section) : null;
    const hasTopic = !!(entry.topic && entry.topic.trim());
    const isLive = !!section && section.status !== "HIDDEN" && realItems.some((i) => i.is_published && i.review_state !== "PENDING_REVIEW");
    const hasItems = realItems.length > 0;
    return {
      entry: {
        entry_id: entry.entry_id,
        scheme_id: entry.scheme_id,
        week_number: entry.week_number,
        start_date: toDateOnly(entry.start_date as any),
        end_date: toDateOnly(entry.end_date as any),
        topic: entry.topic,
        sub_topic: entry.sub_topic,
        objective: entry.objective,
        entry_status: entry.entry_status,
      },
      competency,
      criteria,
      lesson_plans: plans.map((p: any) => ({
        lesson_id: p.id,
        session_code: p.session_code ?? null,
        lesson_date: toDateOnly(p.lesson_date as any),
        big_question: p.big_question ?? null,
        outcomes: p.outcomes.length,
        sections: p.sections.length,
      })),
      notes,
      materials: materials.filter((m) => m.competency_id === entry.competency_id).map(({ competency_id: _c, ...m }) => m),
      section: section
        ? {
            section_id: section.section_id,
            status: section.status,
            unlock_at: section.unlock_at ? new Date(section.unlock_at as any).toISOString() : null,
            items: realItems.length,
            published_items: realItems.filter((i) => i.is_published).length,
            pending_review: realItems.filter((i) => i.review_state === "PENDING_REVIEW").length,
          }
        : null,
      coverage: cov ? { targets: cov.targets.length, covered: cov.covered.length, gap_criteria_ids: cov.gaps.map((g) => g.criteria_id) } : null,
      readiness: {
        has_topic: hasTopic,
        has_criteria: criteria.length > 0,
        has_plan: plans.length > 0,
        has_note: notes.length > 0,
        has_items: hasItems,
        is_live: isLive,
        state: isLive ? "LIVE" : hasItems || notes.length > 0 ? "DRAFTED" : hasTopic || criteria.length > 0 ? "TODO" : "EMPTY",
      },
    };
  });
  return { course_id: course?.course_id ?? null, weeks };
}
