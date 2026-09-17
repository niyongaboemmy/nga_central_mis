import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { TeacherSubjectAssignment, AcademicTerm } from "../db/schema";
import { AuthorizationError, ValidationError } from "../errors/CustomError";

/**
 * Confirms that a teacher is actually assigned to teach `subjectId` for `classGroupId` in the
 * academic year that `academicTermId` belongs to — this must hold before any SchemeOfWork row is
 * created or edited. Without it, a stale/hand-edited academic_term_id or class_group_id (e.g. left
 * over after switching the globally-selected academic year) can produce a SchemeOfWork row that
 * doesn't match the teacher's real assignment for that year, which then surfaces as
 * duplicate-looking rows in the "my assigned subjects" list.
 *
 * ClassGroup is not year-scoped (the same row is reused every year) and TeacherSubjectAssignment's
 * primary key includes academic_year_id, so one teacher legitimately holds several rows for the
 * same (subject, class group) across years. The term's year therefore has to be resolved first and
 * used to select the assignment: looking the assignment up on (user, subject, class group) alone
 * and then comparing years picks an arbitrary row, so a teacher who taught the same subject and
 * class group in an earlier year gets a permanent, unfixable "the selected academic term does not
 * belong to this assignment's academic year" for the current year's term.
 */
export const assertTeacherOwnsScheme = async (
  userId: number,
  subjectId: number,
  classGroupId: number,
  academicTermId: number,
): Promise<void> => {
  const term = await db
    .select({ academic_year_id: AcademicTerm.academic_year_id })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academicTermId))
    .limit(1);

  if (term.length === 0) {
    throw new ValidationError("The selected academic term does not exist.");
  }

  const termAcademicYearId = term[0].academic_year_id;

  const assignmentForTermYear = await db
    .select({ academic_year_id: TeacherSubjectAssignment.academic_year_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, subjectId),
        eq(TeacherSubjectAssignment.class_group_id, classGroupId),
        eq(TeacherSubjectAssignment.academic_year_id, termAcademicYearId),
      ),
    )
    .limit(1);

  if (assignmentForTermYear.length > 0) return;

  // No assignment in the term's year. Distinguish "you never teach this subject/class group" from
  // "you teach it, but in a different academic year than the term you selected" so the message
  // tells the teacher what to actually change.
  const anyAssignment = await db
    .select({ academic_year_id: TeacherSubjectAssignment.academic_year_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, subjectId),
        eq(TeacherSubjectAssignment.class_group_id, classGroupId),
      ),
    )
    .limit(1);

  if (anyAssignment.length === 0) {
    throw new AuthorizationError(
      "You are not assigned to teach this subject for this class group.",
    );
  }

  throw new ValidationError(
    "The selected academic term belongs to an academic year you are not assigned to teach this subject for. Switch the academic year/term selector to the year of this assignment.",
  );
};
