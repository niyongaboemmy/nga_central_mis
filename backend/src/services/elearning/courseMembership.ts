import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  AcademicTerm,
  Course,
  StudentClassGroup,
  StudentSubjectEnrollment,
  TeacherSubjectAssignment,
  UserProfile,
} from "../../db/schema";
import { AuthorizationError, NotFoundError } from "../../errors/CustomError";

/**
 * Course membership is *derived*, never stored (plan §2.3): a student is a member of a
 * course iff they are in its class group AND enrolled in its subject for the course's
 * academic year — the same rule services/teacherRoster.ts uses for "the students I
 * teach", so a teacher's analytics table and a student's My Learning always agree.
 */

export type CourseRow = typeof Course.$inferSelect;

export async function loadCourse(courseId: number): Promise<CourseRow> {
  const [course] = await db.select().from(Course).where(eq(Course.course_id, courseId)).limit(1);
  if (!course) throw new NotFoundError("Course not found");
  return course;
}

export async function academicYearOfTerm(academicTermId: number): Promise<number> {
  const [term] = await db
    .select({ academic_year_id: AcademicTerm.academic_year_id })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.academic_term_id, academicTermId))
    .limit(1);
  if (!term) throw new NotFoundError("Academic term not found");
  return term.academic_year_id;
}

export async function isCourseMember(course: CourseRow, studentUserId: number): Promise<boolean> {
  const yearId = await academicYearOfTerm(course.academic_term_id);
  const [inGroup] = await db
    .select({ user_id: StudentClassGroup.user_id })
    .from(StudentClassGroup)
    .where(
      and(
        eq(StudentClassGroup.user_id, studentUserId),
        eq(StudentClassGroup.class_group_id, course.class_group_id),
        eq(StudentClassGroup.academic_year_id, yearId),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!inGroup) return false;
  const [enrolled] = await db
    .select({ user_id: StudentSubjectEnrollment.user_id })
    .from(StudentSubjectEnrollment)
    .where(
      and(
        eq(StudentSubjectEnrollment.user_id, studentUserId),
        eq(StudentSubjectEnrollment.subject_id, course.subject_id),
        eq(StudentSubjectEnrollment.academic_year_id, yearId),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
      ),
    )
    .limit(1);
  return !!enrolled;
}

/** Loads a course the student is a member of, or 404 (never 403 — a non-member must not learn the course exists). */
export async function loadMemberCourse(courseId: number, studentUserId: number): Promise<CourseRow> {
  const course = await loadCourse(courseId);
  if (!(await isCourseMember(course, studentUserId))) throw new NotFoundError("Course not found");
  return course;
}

/** Every member of a course, with names — the teacher analytics roster. */
export async function listCourseMembers(course: CourseRow) {
  const yearId = await academicYearOfTerm(course.academic_term_id);
  const rows = await db
    .select({
      user_id: StudentClassGroup.user_id,
      first_name: UserProfile.first_name,
      last_name: UserProfile.last_name,
    })
    .from(StudentClassGroup)
    .innerJoin(
      StudentSubjectEnrollment,
      and(
        eq(StudentSubjectEnrollment.user_id, StudentClassGroup.user_id),
        eq(StudentSubjectEnrollment.subject_id, course.subject_id),
        eq(StudentSubjectEnrollment.academic_year_id, yearId),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
      ),
    )
    .leftJoin(UserProfile, eq(UserProfile.user_id, StudentClassGroup.user_id))
    .where(
      and(
        eq(StudentClassGroup.class_group_id, course.class_group_id),
        eq(StudentClassGroup.academic_year_id, yearId),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );
  const seen = new Set<number>();
  return rows
    .filter((r) => (seen.has(r.user_id) ? false : (seen.add(r.user_id), true)))
    .map((r) => ({
      user_id: r.user_id,
      name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || `Student #${r.user_id}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Courses a student can see at all: every PUBLISHED course whose class group they are in
 * and whose subject they are enrolled in, in that class group's academic year.
 */
export async function listMemberCourseIds(studentUserId: number): Promise<number[]> {
  const groups = await db
    .select({
      class_group_id: StudentClassGroup.class_group_id,
      academic_year_id: StudentClassGroup.academic_year_id,
    })
    .from(StudentClassGroup)
    .where(and(eq(StudentClassGroup.user_id, studentUserId), eq(StudentClassGroup.status, "ACTIVE")));
  if (groups.length === 0) return [];
  const enrollments = await db
    .select({
      subject_id: StudentSubjectEnrollment.subject_id,
      academic_year_id: StudentSubjectEnrollment.academic_year_id,
    })
    .from(StudentSubjectEnrollment)
    .where(
      and(eq(StudentSubjectEnrollment.user_id, studentUserId), eq(StudentSubjectEnrollment.status, "ACTIVE")),
    );
  if (enrollments.length === 0) return [];

  const courses = await db
    .select({
      course_id: Course.course_id,
      subject_id: Course.subject_id,
      class_group_id: Course.class_group_id,
      academic_year_id: AcademicTerm.academic_year_id,
    })
    .from(Course)
    .innerJoin(AcademicTerm, eq(AcademicTerm.academic_term_id, Course.academic_term_id))
    .where(
      and(
        eq(Course.status, "PUBLISHED"),
        inArray(
          Course.class_group_id,
          groups.map((g) => g.class_group_id),
        ),
      ),
    );

  return courses
    .filter(
      (c) =>
        groups.some((g) => g.class_group_id === c.class_group_id && g.academic_year_id === c.academic_year_id) &&
        enrollments.some((e) => e.subject_id === c.subject_id && e.academic_year_id === c.academic_year_id),
    )
    .map((c) => c.course_id);
}

/**
 * Builder access: the course owner, or any teacher assigned to its subject + class group in
 * the course's year. Mirrors utils/schemeAuthorization.assertTeacherOwnsScheme.
 */
export async function assertCanBuildCourse(course: CourseRow, userId: number): Promise<void> {
  if (course.owner_user_id === userId) return;
  const yearId = await academicYearOfTerm(course.academic_term_id);
  const [assignment] = await db
    .select({ user_id: TeacherSubjectAssignment.user_id })
    .from(TeacherSubjectAssignment)
    .where(
      and(
        eq(TeacherSubjectAssignment.user_id, userId),
        eq(TeacherSubjectAssignment.subject_id, course.subject_id),
        eq(TeacherSubjectAssignment.class_group_id, course.class_group_id),
        eq(TeacherSubjectAssignment.academic_year_id, yearId),
      ),
    )
    .limit(1);
  if (!assignment) throw new AuthorizationError("You are not assigned to teach this subject for this class group");
}
