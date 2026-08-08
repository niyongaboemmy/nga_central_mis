import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { TeacherSubjectAssignment, AcademicTerm } from "../db/schema";
import { AuthorizationError, ValidationError } from "../errors/CustomError";

/**
 * Confirms that a teacher is actually assigned to teach `subjectId` for `classGroupId`, and that
 * `academicTermId` belongs to that class group's own academic year — both must hold before any
 * SchemeOfWork row is created or edited. Without this, a stale/hand-edited academic_term_id or
 * class_group_id (e.g. left over after switching the globally-selected academic year) can produce
 * a SchemeOfWork row that doesn't match the teacher's real assignment for that year, which then
 * surfaces as duplicate-looking rows in the "my assigned subjects" list.
 */
export const assertTeacherOwnsScheme = async (
  userId: number,
  subjectId: number,
  classGroupId: number,
  academicTermId: number,
): Promise<void> => {
  const assignment = await db
    .select({
      user_id: TeacherSubjectAssignment.user_id,
      academic_year_id: TeacherSubjectAssignment.academic_year_id,
    })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, subjectId),
        eq(TeacherSubjectAssignment.class_group_id, classGroupId),
      ),
    )
    .limit(1);

  if (assignment.length === 0) {
    throw new AuthorizationError(
      "You are not assigned to teach this subject for this class group.",
    );
  }

  const term = await db
    .select({ academic_year_id: AcademicTerm.academic_year_id })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academicTermId))
    .limit(1);

  if (term.length === 0) {
    throw new ValidationError("The selected academic term does not exist.");
  }

  if (assignment[0].academic_year_id !== term[0].academic_year_id) {
    throw new ValidationError(
      "The selected academic term does not belong to this assignment's academic year.",
    );
  }
};
