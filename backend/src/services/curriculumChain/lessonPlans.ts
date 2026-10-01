import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  AcademicTerm,
  LO_IndicativeContent,
  LO_LearningOutcome,
  LO_LearningOutcomeActivity,
  LO_LearningOutcomeResource,
  LO_Lesson,
  LO_LessonAssignment,
  LO_LessonEvaluation,
  LO_LessonSection,
  SchemeOfWork,
  SchemeOfWorkEntry,
  TeacherSubjectAssignment,
} from "../../db/schema";
import { Permissions } from "../../utils/permissions";

/**
 * Lesson plans (LO_Lesson + children) for many scheme entries in a fixed number of queries,
 * instead of the old per-lesson / per-outcome N+1. The returned shape is exactly what
 * `GET /lesson-plans/entry/:id` always returned, so the frontend and Task Mentor (which
 * reads this endpoint) see no change.
 */
export async function loadLessonPlansForEntries(entryIds: number[]) {
  const byEntry = new Map<number, any[]>();
  if (entryIds.length === 0) return byEntry;

  const lessons = await db.select().from(LO_Lesson).where(inArray(LO_Lesson.entry_id, entryIds));
  if (lessons.length === 0) return byEntry;
  const lessonIds = lessons.map((l) => l.id);

  const [outcomes, sections, indicative, assignments, evaluations] = await Promise.all([
    db.select().from(LO_LearningOutcome).where(inArray(LO_LearningOutcome.lesson_id, lessonIds)),
    db.select().from(LO_LessonSection).where(inArray(LO_LessonSection.lesson_id, lessonIds)),
    db.select().from(LO_IndicativeContent).where(inArray(LO_IndicativeContent.lesson_id, lessonIds)),
    db.select().from(LO_LessonAssignment).where(inArray(LO_LessonAssignment.lesson_id, lessonIds)),
    db.select().from(LO_LessonEvaluation).where(inArray(LO_LessonEvaluation.lesson_id, lessonIds)),
  ]);
  const outcomeIds = outcomes.map((o) => o.id);
  const [activities, resources] = outcomeIds.length
    ? await Promise.all([
        db.select().from(LO_LearningOutcomeActivity).where(inArray(LO_LearningOutcomeActivity.learning_outcome_id, outcomeIds)),
        db.select().from(LO_LearningOutcomeResource).where(inArray(LO_LearningOutcomeResource.learning_outcome_id, outcomeIds)),
      ])
    : [[], []];

  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) {
      const k = key(r);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const activitiesBy = group(activities, (a) => a.learning_outcome_id);
  const resourcesBy = group(resources, (r) => r.learning_outcome_id);
  const outcomesBy = group(outcomes, (o) => o.lesson_id);
  const sectionsBy = group(sections, (s) => s.lesson_id);
  const indicativeBy = group(indicative, (i) => i.lesson_id);
  const assignmentsBy = group(assignments, (a) => a.lesson_id);
  const evaluationBy = group(evaluations, (e) => e.lesson_id);

  for (const lesson of lessons) {
    const full = {
      ...lesson,
      outcomes: (outcomesBy.get(lesson.id) ?? []).map((o) => ({
        ...o,
        activities: activitiesBy.get(o.id) ?? [],
        resources: resourcesBy.get(o.id) ?? [],
      })),
      sections: sectionsBy.get(lesson.id) ?? [],
      indicativeContent: indicativeBy.get(lesson.id) ?? [],
      assignments: assignmentsBy.get(lesson.id) ?? [],
      evaluation: (evaluationBy.get(lesson.id) ?? [])[0] ?? null,
    };
    const entryId = lesson.entry_id as number;
    const list = byEntry.get(entryId);
    if (list) list.push(full);
    else byEntry.set(entryId, [full]);
  }
  return byEntry;
}

export type FullLessonPlan = Awaited<ReturnType<typeof loadLessonPlansForEntries>> extends Map<number, (infer T)[]> ? T : never;

const SCHEME_OVERSIGHT_PERMISSIONS = [
  Permissions.VALIDATE_SCHEME_OF_WORK,
  Permissions.VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST,
];

/**
 * Who may read a scheme's planning artifacts (lesson plans, week bundles): the scheme's
 * owner, a teacher assigned to the same subject + class group in that year (co-teachers
 * build the same e-learning course), or someone who validates schemes. Returns the
 * scheme row, or null when the caller may not see it (callers answer 404, never 403, so
 * ids can't be probed).
 */
export async function loadReadableScheme(schemeId: number, userId: number, permissions: string[] = []) {
  const [scheme] = await db.select().from(SchemeOfWork).where(eq(SchemeOfWork.scheme_id, schemeId)).limit(1);
  if (!scheme) return null;
  if (scheme.user_id === userId) return scheme;
  if (SCHEME_OVERSIGHT_PERMISSIONS.some((p) => permissions.includes(p))) return scheme;
  const [term] = await db
    .select({ academic_year_id: AcademicTerm.academic_year_id })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, scheme.academic_term_id))
    .limit(1);
  if (!term) return null;
  const [assignment] = await db
    .select({ user_id: TeacherSubjectAssignment.user_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, scheme.subject_id),
        eq(TeacherSubjectAssignment.class_group_id, scheme.class_group_id),
        eq(TeacherSubjectAssignment.academic_year_id, term.academic_year_id),
      ),
    )
    .limit(1);
  return assignment ? scheme : null;
}

/** The scheme an entry belongs to, if the caller may read it. */
export async function loadReadableSchemeForEntry(entryId: number, userId: number, permissions: string[] = []) {
  const [entry] = await db
    .select({ scheme_id: SchemeOfWorkEntry.scheme_id })
    .from(SchemeOfWorkEntry)
    .where(eq(SchemeOfWorkEntry.entry_id, entryId))
    .limit(1);
  if (!entry) return null;
  return loadReadableScheme(entry.scheme_id, userId, permissions);
}
