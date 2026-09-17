import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  ClassGroup,
  Grade,
  Program,
  Role,
  StudentClassGroup,
  StudentSubjectEnrollment,
  Subject,
  TeacherSubjectAssignment,
  User,
  UserProfile,
  UserRole,
} from "../db/schema";

/**
 * "The students I teach" — resolved in one place.
 *
 * A teaching assignment is a (subject, class group) pair, so a student counts
 * only when they are BOTH in one of the teacher's class groups AND enrolled in
 * the subject the teacher teaches to that group. Anything looser answers a
 * different question: the class group's whole membership sweeps in students the
 * teacher never teaches, while "everyone enrolled in my subjects" sweeps in
 * other teachers' groups.
 *
 * The dashboard's headline count and the My Students roster were each deriving
 * this independently and disagreed (76 vs 11 for the same teacher), which is
 * why it lives here rather than in either controller.
 */

export interface TeacherAssignment {
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  class_group_id: number;
  class_group_name: string;
  grade_id: number;
  grade_name: string;
  program_id: number;
  program_name: string;
}

export interface TeacherRosterRow {
  user_id: number;
  username: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  registration_number: string | null;
  class_group_id: number;
  class_group_name: string;
  grade_name: string;
  program_name: string;
  subject_id: number;
}

/** Every (subject, class group) a teacher is assigned for one academic year. */
export const getTeacherAssignments = async (
  teacherId: number,
  academicYearId: number,
): Promise<TeacherAssignment[]> =>
  db
    .select({
      subject_id: TeacherSubjectAssignment.subject_id,
      subject_name: Subject.name,
      subject_code: Subject.code,
      class_group_id: TeacherSubjectAssignment.class_group_id,
      class_group_name: ClassGroup.name,
      grade_id: Grade.grade_id,
      grade_name: Grade.name,
      program_id: Program.program_id,
      program_name: Program.name,
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
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, teacherId),
        eq(TeacherSubjectAssignment.academic_year_id, academicYearId),
      ),
    );

/**
 * One row per (student, class group, subject the teacher teaches them there).
 * Callers fold it into whatever shape they need — a roster with subject badges,
 * or a distinct-student count.
 */
export const getTeacherRosterRows = async (
  assignments: TeacherAssignment[],
  academicYearId: number,
): Promise<TeacherRosterRow[]> => {
  if (assignments.length === 0) return [];

  const classGroupIds = Array.from(
    new Set(assignments.map((a) => a.class_group_id)),
  );
  const subjectIds = Array.from(new Set(assignments.map((a) => a.subject_id)));
  const pairs = new Set(
    assignments.map((a) => `${a.class_group_id}-${a.subject_id}`),
  );

  const rows = await db
    .select({
      user_id: User.user_id,
      username: User.username,
      email: User.email,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
      gender: UserProfile.gender,
      registration_number: UserProfile.registration_number,
      class_group_id: StudentClassGroup.class_group_id,
      class_group_name: ClassGroup.name,
      grade_name: Grade.name,
      program_name: Program.name,
      subject_id: StudentSubjectEnrollment.subject_id,
    })
    .from(StudentClassGroup)
    .innerJoin(User, eq(StudentClassGroup.user_id, User.user_id))
    .innerJoin(UserProfile, eq(User.user_id, UserProfile.user_id))
    .innerJoin(
      ClassGroup,
      eq(StudentClassGroup.class_group_id, ClassGroup.class_group_id),
    )
    .innerJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .innerJoin(Program, eq(Grade.program_id, Program.program_id))
    .innerJoin(
      StudentSubjectEnrollment,
      and(
        eq(StudentSubjectEnrollment.user_id, StudentClassGroup.user_id),
        eq(StudentSubjectEnrollment.academic_year_id, academicYearId),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
        inArray(StudentSubjectEnrollment.subject_id, subjectIds),
      )!,
    )
    .where(
      and(
        inArray(StudentClassGroup.class_group_id, classGroupIds),
        eq(StudentClassGroup.academic_year_id, academicYearId),
        eq(StudentClassGroup.status, "ACTIVE"),
        // Only real students. A staff account that picked up a class-group or
        // enrolment row must never land in a student roster or count.
        or(
          eq(UserProfile.user_type, "STUDENT"),
          sql`EXISTS (SELECT 1 FROM ${UserRole} ur JOIN ${Role} r ON r.role_id = ur.role_id
                      WHERE ur.user_id = ${User.user_id} AND r.name = 'STUDENT')`,
        )!,
      ),
    )
    .orderBy(UserProfile.first_name, UserProfile.last_name);

  // Enrolled in a subject the teacher teaches, but not in the class group the
  // teacher teaches it to — someone else's pupil for that subject.
  return rows.filter((r) =>
    pairs.has(`${r.class_group_id}-${r.subject_id}`),
  ) as TeacherRosterRow[];
};

/** Distinct students a teacher teaches — the dashboard's headline figure. */
export const countTeacherStudents = async (
  teacherId: number,
  academicYearId: number,
): Promise<number> => {
  const assignments = await getTeacherAssignments(teacherId, academicYearId);
  const rows = await getTeacherRosterRows(assignments, academicYearId);
  return new Set(rows.map((r) => r.user_id)).size;
};
