import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  Course,
  CourseItem,
  CourseItemProgress,
  CourseSection,
  StudentClassGroup,
  StudentSubjectEnrollment,
} from "../../db/schema";

/**
 * Where a lesson note sits inside a course the student can actually open.
 *
 * A note read through the standalone reader earns nothing: no progress, no
 * completion, no place in the week. The same note placed on a course is the
 * thing the student is meant to work through. Library rows therefore carry
 * their course placement, so "open in e-learning" can be a real link rather
 * than a search the student has to repeat by hand.
 *
 * Two rules make this safe to hand to a student:
 *
 *  - Only published items on published sections count. An unpublished item is
 *    a teacher's draft; linking to it would leak next week's material.
 *  - The student must be a member of the course by the same rule the course
 *    itself uses — in the class group AND enrolled in the subject. A note can
 *    be shared far more widely than a course is, so sharing alone must never
 *    imply a course link.
 */

export interface NotePlacement {
  course_id: number;
  course_title: string;
  item_id: number;
  section_id: number;
  section_title: string;
  /** This student's own progress on the item, so the library can say "Done" or "Continue". */
  progress: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
}

export const resolveNotePlacements = async (
  noteIds: number[],
  studentId: number,
): Promise<Map<number, NotePlacement>> => {
  const found = new Map<number, NotePlacement>();
  if (noteIds.length === 0) return found;

  const rows = await db
    .select({
      note_id: CourseItem.ref_id,
      item_id: CourseItem.item_id,
      section_id: CourseSection.section_id,
      section_title: CourseSection.title,
      course_id: Course.course_id,
      course_title: Course.title,
      class_group_id: Course.class_group_id,
      subject_id: Course.subject_id,
    })
    .from(CourseItem)
    .innerJoin(
      CourseSection,
      eq(CourseItem.section_id, CourseSection.section_id),
    )
    .innerJoin(Course, eq(CourseSection.course_id, Course.course_id))
    .where(
      and(
        eq(CourseItem.item_type, "LESSON_NOTE"),
        inArray(CourseItem.ref_id, noteIds),
        eq(CourseItem.is_published, 1),
        eq(CourseSection.status, "PUBLISHED"),
        eq(Course.status, "PUBLISHED"),
      ),
    );

  if (rows.length === 0) return found;

  // Membership, checked once for every candidate course rather than per note.
  const classGroupIds = [...new Set(rows.map((r) => r.class_group_id))];
  const subjectIds = [...new Set(rows.map((r) => r.subject_id))];

  const [groups, enrolments] = await Promise.all([
    db
      .select({ class_group_id: StudentClassGroup.class_group_id })
      .from(StudentClassGroup)
      .where(
        and(
          eq(StudentClassGroup.user_id, studentId),
          inArray(StudentClassGroup.class_group_id, classGroupIds),
        ),
      ),
    db
      .select({ subject_id: StudentSubjectEnrollment.subject_id })
      .from(StudentSubjectEnrollment)
      .where(
        and(
          eq(StudentSubjectEnrollment.user_id, studentId),
          inArray(StudentSubjectEnrollment.subject_id, subjectIds),
          eq(StudentSubjectEnrollment.status, "ACTIVE"),
        ),
      ),
  ]);

  const myGroups = new Set(groups.map((g) => g.class_group_id));
  const mySubjects = new Set(enrolments.map((e) => e.subject_id));

  for (const row of rows) {
    if (row.note_id === null) continue;
    if (!myGroups.has(row.class_group_id)) continue;
    if (!mySubjects.has(row.subject_id)) continue;
    // A note can legitimately be placed on more than one course; the first
    // the student is a member of is the one they will be working through.
    if (found.has(row.note_id)) continue;
    found.set(row.note_id, {
      course_id: row.course_id,
      course_title: row.course_title,
      item_id: row.item_id,
      section_id: row.section_id,
      section_title: row.section_title,
      progress: "NOT_STARTED",
    });
  }

  if (found.size) {
    const progress = await db
      .select({ item_id: CourseItemProgress.item_id, state: CourseItemProgress.state })
      .from(CourseItemProgress)
      .where(
        and(
          eq(CourseItemProgress.user_id, studentId),
          inArray(CourseItemProgress.item_id, [...found.values()].map((p) => p.item_id)),
        ),
      );
    const byItem = new Map(progress.map((r) => [r.item_id, r.state]));
    for (const p of found.values()) p.progress = byItem.get(p.item_id) ?? "NOT_STARTED";
  }

  return found;
};
