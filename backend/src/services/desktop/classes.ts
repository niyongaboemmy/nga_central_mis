import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { AcademicYear, ClassGroup, Grade, StudentClassGroup, TeacherSubjectAssignment, User, UserGrade, UserProfile } from "../../db/schema";

/**
 * The class lists NGA Desktop's classroom tools use (name picker, group maker):
 * only the classes this person teaches (subject assignments) or is class teacher
 * of, this academic year. Students: first name and last-name initial only,
 * because the picker is shown on a projector.
 */
export interface ToolClass {
  classGroupId: number;
  name: string;
  grade: string | null;
  students: Array<{ id: number; name: string }>;
}

/** "Aline Uwase" → "Aline U."; empty parts are skipped. Pure. */
export const shortName = (first: string | null, last: string | null): string => {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f) return l ? `${l.charAt(0).toUpperCase()}.` : "?";
  return l ? `${f} ${l.charAt(0).toUpperCase()}.` : f;
};

export async function loadTeacherClasses(userId: number): Promise<ToolClass[]> {
  // The newest year flagged current (should be one; never trust that blindly).
  const [year] = await db
    .select({ id: AcademicYear.academic_year_id })
    .from(AcademicYear)
    .where(eq(AcademicYear.is_current, 1))
    .orderBy(desc(AcademicYear.academic_year_id))
    .limit(1);
  if (!year) return [];
  const taught = await db
    .selectDistinct({ id: TeacherSubjectAssignment.class_group_id })
    .from(TeacherSubjectAssignment)
    .where(and(eq(TeacherSubjectAssignment.user_id, userId), eq(TeacherSubjectAssignment.academic_year_id, year.id)));
  const classTeacher = await db
    .selectDistinct({ id: UserGrade.class_group_id })
    .from(UserGrade)
    .where(and(eq(UserGrade.user_id, userId), eq(UserGrade.academic_year_id, year.id)));
  const ids = [...new Set([...taught, ...classTeacher].map((r) => Number(r.id)).filter((n) => n > 0))];
  if (!ids.length) return [];

  const groups = await db
    .select({ id: ClassGroup.class_group_id, name: ClassGroup.name, grade: Grade.name, level: Grade.level_order })
    .from(ClassGroup)
    .leftJoin(Grade, eq(ClassGroup.grade_id, Grade.grade_id))
    .where(inArray(ClassGroup.class_group_id, ids))
    .orderBy(asc(Grade.level_order), asc(ClassGroup.name));

  const rows = await db
    .select({ cg: StudentClassGroup.class_group_id, id: User.user_id, first: UserProfile.first_name, last: UserProfile.last_name })
    .from(StudentClassGroup)
    .innerJoin(User, eq(User.user_id, StudentClassGroup.user_id))
    .leftJoin(UserProfile, eq(UserProfile.user_id, StudentClassGroup.user_id))
    .where(
      and(
        inArray(StudentClassGroup.class_group_id, ids),
        eq(StudentClassGroup.academic_year_id, year.id),
        eq(StudentClassGroup.status, "ACTIVE"),
        eq(User.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(UserProfile.first_name), asc(UserProfile.last_name));

  return groups.map((g) => ({
    classGroupId: Number(g.id),
    name: g.name,
    grade: g.grade ?? null,
    students: rows.filter((r) => Number(r.cg) === Number(g.id)).map((r) => ({ id: Number(r.id), name: shortName(r.first, r.last) })),
  }));
}
