import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  ClassGroup,
  MentorAssignment,
  StudentClassGroup,
  TeacherSubjectAssignment,
  User,
  UserGrade,
  UserProfile,
} from "../../db/schema";

/**
 * Which students a teacher may assign (plan §5.3, decision D2): students in a
 * class group they teach a subject to, lead as class teacher, or mentor --
 * all for the term's academic year. Students are User.user_id everywhere.
 */
export interface StudentCard {
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  registration_number: string | null;
  class_group_id: number | null;
  class_group_name: string | null;
}

/** Class groups the teacher teaches or leads this year. */
export const teachableClassGroupIds = async (teacherId: number, yearId: number): Promise<number[]> => {
  const [taught, led] = await Promise.all([
    db
      .selectDistinct({ id: TeacherSubjectAssignment.class_group_id })
      .from(TeacherSubjectAssignment)
      .where(and(eq(TeacherSubjectAssignment.user_id, teacherId), eq(TeacherSubjectAssignment.academic_year_id, yearId))),
    db
      .selectDistinct({ id: UserGrade.class_group_id })
      .from(UserGrade)
      .where(and(eq(UserGrade.user_id, teacherId), eq(UserGrade.academic_year_id, yearId))),
  ]);
  return [...new Set([...taught, ...led].map((r) => Number(r.id)).filter(Boolean))];
};

export const menteeIds = async (teacherId: number, yearId: number): Promise<number[]> => {
  const rows = await db
    .select({ id: MentorAssignment.student_id })
    .from(MentorAssignment)
    .where(
      and(
        eq(MentorAssignment.mentor_id, teacherId),
        eq(MentorAssignment.academic_year_id, yearId),
        eq(MentorAssignment.status, "ACTIVE"),
      ),
    );
  return rows.map((r) => Number(r.id));
};

/** Every student the teacher may assign this year. */
export const teachableStudentIds = async (teacherId: number, yearId: number): Promise<Set<number>> => {
  const [groups, mentees] = await Promise.all([teachableClassGroupIds(teacherId, yearId), menteeIds(teacherId, yearId)]);
  const out = new Set<number>(mentees);
  if (groups.length) {
    const rows = await db
      .select({ id: StudentClassGroup.user_id })
      .from(StudentClassGroup)
      .where(
        and(
          inArray(StudentClassGroup.class_group_id, groups),
          eq(StudentClassGroup.academic_year_id, yearId),
          eq(StudentClassGroup.status, "ACTIVE"),
        ),
      );
    for (const r of rows) out.add(Number(r.id));
  }
  return out;
};

const CARD_COLUMNS = {
  student_id: StudentClassGroup.user_id,
  first_name: UserProfile.first_name,
  last_name: UserProfile.last_name,
  registration_number: UserProfile.registration_number,
  class_group_id: StudentClassGroup.class_group_id,
  class_group_name: ClassGroup.name,
};

/** Name, registration number and class group of each ACTIVE student this year. */
export const studentCards = async (studentIds: number[], yearId: number): Promise<Map<number, StudentCard>> => {
  const out = new Map<number, StudentCard>();
  if (studentIds.length === 0) return out;
  const rows = await db
    .select(CARD_COLUMNS)
    .from(StudentClassGroup)
    .innerJoin(User, and(eq(User.user_id, StudentClassGroup.user_id), eq(User.status, "ACTIVE")))
    .leftJoin(UserProfile, eq(UserProfile.user_id, StudentClassGroup.user_id))
    .leftJoin(ClassGroup, eq(ClassGroup.class_group_id, StudentClassGroup.class_group_id))
    .where(
      and(
        inArray(StudentClassGroup.user_id, studentIds),
        eq(StudentClassGroup.academic_year_id, yearId),
        eq(StudentClassGroup.status, "ACTIVE"),
      ),
    );
  for (const r of rows) out.set(Number(r.student_id), { ...r, student_id: Number(r.student_id) });
  return out;
};

/** Students to offer in the picker: a class group, a name search, or an explicit list. */
export const searchStudents = async (params: {
  yearId: number;
  classGroupIds?: number[] | null;
  studentIds?: number[] | null;
  q?: string | null;
  limit?: number;
}): Promise<StudentCard[]> => {
  const conds = [eq(StudentClassGroup.academic_year_id, params.yearId), eq(StudentClassGroup.status, "ACTIVE")];
  if (params.classGroupIds) {
    if (params.classGroupIds.length === 0) return [];
    conds.push(inArray(StudentClassGroup.class_group_id, params.classGroupIds));
  }
  if (params.studentIds) {
    if (params.studentIds.length === 0) return [];
    conds.push(inArray(StudentClassGroup.user_id, params.studentIds));
  }
  const q = (params.q ?? "").trim();
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    conds.push(
      or(
        like(UserProfile.first_name, pattern),
        like(UserProfile.last_name, pattern),
        like(UserProfile.registration_number, pattern),
        sql`CONCAT(${UserProfile.first_name}, ' ', ${UserProfile.last_name}) LIKE ${pattern}`,
      )!,
    );
  }
  const rows = await db
    .select(CARD_COLUMNS)
    .from(StudentClassGroup)
    .innerJoin(User, and(eq(User.user_id, StudentClassGroup.user_id), eq(User.status, "ACTIVE")))
    .leftJoin(UserProfile, eq(UserProfile.user_id, StudentClassGroup.user_id))
    .leftJoin(ClassGroup, eq(ClassGroup.class_group_id, StudentClassGroup.class_group_id))
    .where(and(...conds))
    .orderBy(ClassGroup.name, UserProfile.first_name, UserProfile.last_name)
    .limit(Math.min(params.limit ?? 300, 1000));
  return rows.map((r) => ({ ...r, student_id: Number(r.student_id) }));
};

export const displayName = (p: { first_name?: string | null; last_name?: string | null } | null | undefined, fallback = "Student") => {
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  return name || fallback;
};

/** Display names for any users (teachers or students). */
export const userNames = async (ids: number[]): Promise<Map<number, string>> => {
  const out = new Map<number, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  const rows = await db
    .select({ id: User.user_id, username: User.username, first_name: UserProfile.first_name, last_name: UserProfile.last_name })
    .from(User)
    .leftJoin(UserProfile, eq(UserProfile.user_id, User.user_id))
    .where(inArray(User.user_id, unique));
  for (const r of rows) out.set(Number(r.id), displayName(r, r.username ?? "User"));
  return out;
};
