import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  ClassGroup,
  Grade,
  SchemeOfWork,
  SchemeOfWorkEntry,
  Subject,
  TeacherSubjectAssignment,
} from "../db/schema";

/**
 * "The state of my schemes of work" — resolved in one place.
 *
 * Two screens ask this question: the Teacher Dashboard ("what is behind?") and
 * the Scheme of Work list ("where do I pick up?"). They were computing it
 * separately, which is how the dashboard's student count and the My Students
 * roster once came to disagree — so the rule lives here instead.
 *
 * Two details that are easy to get wrong and are fixed here for both callers:
 *
 *  - The list is built from the teacher's *assignments* outward, not from the
 *    SchemeOfWork rows that happen to exist. A missing scheme is the thing the
 *    teacher has to act on, and a query over schemes can't see it.
 *  - The validation verdict lives on the scheme's FIRST entry, not on the
 *    scheme row (see getAllTeachersSchemeOfWork). Reading SchemeOfWork's own
 *    validation_status gives a different, stale answer.
 */

export interface TeacherAssignmentRow {
  subject_id: number;
  class_group_id: number;
  subject_name: string;
  subject_code: string | null;
  subject_color: string | null;
  class_group_name: string;
  grade_name: string | null;
}

export interface TeacherSchemeRow extends TeacherAssignmentRow {
  scheme_id: number | null;
  /** "submitted" once a SchemeOfWork row exists for the assignment. */
  status: "submitted" | "pending";
  /** Weeks actually planned in the scheme. */
  entries_count: number;
  validation_status: "PENDING" | "APPROVED" | "REJECTED";
  validation_comment: string | null;
  updated_at: string | null;
}

/** Every (subject, class group) a teacher teaches in one academic year. */
export const loadTeacherAssignments = async (
  teacherId: number,
  yearId: number | null,
): Promise<TeacherAssignmentRow[]> => {
  if (!yearId) return [];
  return db
    .select({
      subject_id: TeacherSubjectAssignment.subject_id,
      class_group_id: TeacherSubjectAssignment.class_group_id,
      subject_name: Subject.name,
      subject_code: Subject.code,
      subject_color: Subject.color,
      class_group_name: ClassGroup.name,
      grade_name: Grade.name,
    })
    .from(TeacherSubjectAssignment)
    .innerJoin(
      Subject,
      eq(TeacherSubjectAssignment.subject_id, Subject.subject_id),
    )
    .innerJoin(
      ClassGroup,
      eq(TeacherSubjectAssignment.class_group_id, ClassGroup.class_group_id),
    )
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, teacherId),
        eq(TeacherSubjectAssignment.academic_year_id, yearId),
        eq(Subject.status, "ACTIVE"),
      ),
    ) as Promise<TeacherAssignmentRow[]>;
};

/**
 * One scheme row per assignment, for a term. Issues its queries in two
 * batched waves — the API runs on a single-connection pool, so serial awaits
 * here are what turn a page into a timeout.
 */
export const loadSchemeStatus = async (params: {
  teacherId: number;
  termId: number | null;
  assignments: TeacherAssignmentRow[];
}): Promise<TeacherSchemeRow[]> => {
  const { teacherId, termId, assignments } = params;

  const classGroupIds = [
    ...new Set(assignments.map((a) => a.class_group_id)),
  ];

  const schemes =
    termId != null && classGroupIds.length > 0
      ? await db
          .select({
            scheme_id: SchemeOfWork.scheme_id,
            subject_id: SchemeOfWork.subject_id,
            class_group_id: SchemeOfWork.class_group_id,
            updated_at: SchemeOfWork.updated_at,
          })
          .from(SchemeOfWork)
          .where(
            and(
              eq(SchemeOfWork.user_id, teacherId),
              eq(SchemeOfWork.academic_term_id, termId),
              inArray(SchemeOfWork.class_group_id, classGroupIds),
            ),
          )
      : [];

  const schemeIds = schemes.map((s) => s.scheme_id);

  const [entryCounts, entries] = await Promise.all([
    schemeIds.length
      ? db
          .select({
            scheme_id: SchemeOfWorkEntry.scheme_id,
            count: sql<number>`count(*)`,
          })
          .from(SchemeOfWorkEntry)
          .where(inArray(SchemeOfWorkEntry.scheme_id, schemeIds))
          .groupBy(SchemeOfWorkEntry.scheme_id)
      : Promise.resolve([] as any[]),

    schemeIds.length
      ? db
          .select({
            scheme_id: SchemeOfWorkEntry.scheme_id,
            entry_id: SchemeOfWorkEntry.entry_id,
            validation_status: SchemeOfWorkEntry.validation_status,
            validation_comment: SchemeOfWorkEntry.validation_comment,
          })
          .from(SchemeOfWorkEntry)
          .where(inArray(SchemeOfWorkEntry.scheme_id, schemeIds))
          .orderBy(asc(SchemeOfWorkEntry.entry_id))
      : Promise.resolve([] as any[]),
  ]);

  const countByScheme = new Map<number, number>(
    entryCounts.map((r: any) => [r.scheme_id, Number(r.count)]),
  );

  const verdictByScheme = new Map<
    number,
    { status: "PENDING" | "APPROVED" | "REJECTED"; comment: string | null }
  >();
  for (const entry of entries as any[]) {
    if (verdictByScheme.has(entry.scheme_id)) continue; // lowest entry_id wins
    verdictByScheme.set(entry.scheme_id, {
      status: entry.validation_status ?? "PENDING",
      comment: entry.validation_comment ?? null,
    });
  }

  const schemeByKey = new Map(
    schemes.map((s: any) => [`${s.subject_id}:${s.class_group_id}`, s]),
  );

  return assignments.map((a) => {
    const scheme = schemeByKey.get(`${a.subject_id}:${a.class_group_id}`);
    const verdict = scheme ? verdictByScheme.get(scheme.scheme_id) : undefined;
    return {
      ...a,
      scheme_id: scheme?.scheme_id ?? null,
      status: scheme ? "submitted" : "pending",
      entries_count: scheme ? (countByScheme.get(scheme.scheme_id) ?? 0) : 0,
      validation_status: verdict?.status ?? "PENDING",
      validation_comment: verdict?.comment ?? null,
      updated_at: (scheme?.updated_at as any) ?? null,
    };
  });
};
