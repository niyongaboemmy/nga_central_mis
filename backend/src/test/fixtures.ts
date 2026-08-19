import jwt from "jsonwebtoken";
import { db } from "../db";
import {
  User,
  UserProfile,
  Role,
  Permission,
  RolePermission,
  UserRole,
  Program,
  Grade,
  ClassGroup,
  AcademicYear,
  AcademicTerm,
  Subject,
  CalendarSlot,
  SchemeOfWork,
  SchemeOfWorkEntry,
  LO_Lesson,
  InstructorReport,
  LessonReport,
  TeacherSubjectAssignment,
  StudentSubjectEnrollment,
  StudentClassGroup,
  SubjectDocumentCategory,
  SubjectDocument,
  UserGrade,
  UserProgramLead,
} from "../db/schema";
import { eq, sql } from "drizzle-orm";

let seq = 0;
const unique = (prefix: string) => `${prefix}_${Date.now()}_${seq++}`;

// A handful of legacy tables (Role, Program, ClassGroup) were never given
// AUTO_INCREMENT on their PK in the real database, despite the Drizzle
// schema declaring it — a pre-existing inconsistency, out of scope for this
// restructure. Fixtures compute the next PK manually for those tables only.
async function nextId(tableName: string, idColumn: string): Promise<number> {
  const rows = await db.execute(
    sql.raw(`SELECT COALESCE(MAX(\`${idColumn}\`), 0) + 1 AS next_id FROM \`${tableName}\``),
  );
  return (rows as any)[0][0].next_id as number;
}

export async function createUser(
  overrides: { userType?: "TEACHER" | "ADMIN" | "STUDENT" } = {},
) {
  const username = unique("user");
  const [result] = (await db.insert(User).values({
    username,
    email: `${username}@example.com`,
    status: "ACTIVE",
  })) as any;
  const userId = result.insertId as number;

  await db.insert(UserProfile).values({
    user_id: userId,
    first_name: "Test",
    last_name: username,
    user_type: overrides.userType ?? "TEACHER",
  });

  return userId;
}

export async function createStudentClassGroup(params: {
  userId: number;
  classGroupId: number;
  academicYearId: number;
}) {
  await db.insert(StudentClassGroup).values({
    user_id: params.userId,
    class_group_id: params.classGroupId,
    academic_year_id: params.academicYearId,
    status: "ACTIVE",
  });
}

export async function createRoleWithPermissions(
  roleName: string,
  permissionNames: string[],
): Promise<number> {
  const roleId = await nextId("Role", "role_id");
  await db.insert(Role).values({
    role_id: roleId,
    name: unique(roleName),
    status: "ACTIVE",
  });

  for (const permName of permissionNames) {
    let permRows = await db
      .select({ perm_id: Permission.perm_id })
      .from(Permission)
      .where(eq(Permission.name, permName))
      .limit(1);

    let permId: number;
    if (permRows.length === 0) {
      const [permResult] = (await db.insert(Permission).values({
        name: permName,
        status: "ACTIVE",
      })) as any;
      permId = permResult.insertId as number;
    } else {
      permId = permRows[0].perm_id;
    }

    await db.insert(RolePermission).values({ role_id: roleId, perm_id: permId });
  }

  return roleId;
}

export async function assignRole(userId: number, roleId: number) {
  await db.insert(UserRole).values({ user_id: userId, role_id: roleId });
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "1h" });
}

export async function createAcademicPeriod() {
  const [yearResult] = (await db.insert(AcademicYear).values({
    name: unique("Year"),
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    is_current: 1,
  } as any)) as any;
  const academicYearId = yearResult.insertId as number;

  const [termResult] = (await db.insert(AcademicTerm).values({
    academic_year_id: academicYearId,
    name: unique("Term"),
    start_date: "2026-01-01",
    end_date: "2026-06-30",
    is_current: 1,
  } as any)) as any;

  return { academicYearId, academicTermId: termResult.insertId as number };
}

export async function createProgramGradeClassGroup() {
  const programId = await nextId("Program", "program_id");
  await db.insert(Program).values({ program_id: programId, name: unique("Program") });

  const [gradeResult] = (await db.insert(Grade).values({
    program_id: programId,
    name: unique("Grade"),
    level_order: 1,
  })) as any;

  const classGroupId = await nextId("ClassGroup", "class_group_id");
  await db.insert(ClassGroup).values({
    class_group_id: classGroupId,
    grade_id: gradeResult.insertId,
    name: unique("ClassGroup"),
  });

  return classGroupId;
}

/**
 * Same as createProgramGradeClassGroup, but hands back the whole chain --
 * scope tests need the grade and program ids, not just the leaf class group.
 */
export async function createProgramGradeClassGroupDetailed(params: {
  programId?: number;
  gradeId?: number;
} = {}) {
  let programId = params.programId;
  if (!programId) {
    programId = await nextId("Program", "program_id");
    await db
      .insert(Program)
      .values({ program_id: programId, name: unique("Program") });
  }

  let gradeId = params.gradeId;
  if (!gradeId) {
    const [gradeResult] = (await db.insert(Grade).values({
      program_id: programId,
      name: unique("Grade"),
      level_order: 1,
    })) as any;
    gradeId = gradeResult.insertId as number;
  }

  const classGroupId = await nextId("ClassGroup", "class_group_id");
  await db.insert(ClassGroup).values({
    class_group_id: classGroupId,
    grade_id: gradeId,
    name: unique("ClassGroup"),
  });

  return { programId, gradeId: gradeId as number, classGroupId };
}

/** Class-teacher assignment: one user leads one class group of one grade. */
export async function createUserGradeAssignment(params: {
  userId: number;
  gradeId: number;
  classGroupId: number;
  academicYearId: number;
}) {
  await db.insert(UserGrade).values({
    user_id: params.userId,
    grade_id: params.gradeId,
    class_group_id: params.classGroupId,
    academic_year_id: params.academicYearId,
  });
}

/** Program-lead assignment. */
export async function createProgramLead(params: {
  userId: number;
  programId: number;
  academicYearId: number;
}) {
  await db.insert(UserProgramLead).values({
    user_id: params.userId,
    program_id: params.programId,
    academic_year_id: params.academicYearId,
  });
}

export async function createSubject() {
  const code = unique("SUBJ").slice(0, 20);
  const [result] = (await db.insert(Subject).values({
    code,
    name: unique("Subject"),
  })) as any;
  return result.insertId as number;
}

export async function createTeacherSubjectAssignment(params: {
  userId: number;
  subjectId: number;
  classGroupId: number;
  academicYearId: number;
}) {
  await db.insert(TeacherSubjectAssignment).values({
    user_id: params.userId,
    subject_id: params.subjectId,
    class_group_id: params.classGroupId,
    academic_year_id: params.academicYearId,
  });
}

export async function createStudentSubjectEnrollment(params: {
  userId: number;
  subjectId: number;
  academicYearId: number;
  status?: "ACTIVE" | "DISABLED";
}) {
  await db.insert(StudentSubjectEnrollment).values({
    user_id: params.userId,
    subject_id: params.subjectId,
    academic_year_id: params.academicYearId,
    status: params.status ?? "ACTIVE",
  });
}

export async function createSubjectDocumentCategory(params: {
  subjectId: number;
  userId: number;
}) {
  const [result] = (await db.insert(SubjectDocumentCategory).values({
    subject_id: params.subjectId,
    user_id: params.userId,
    name: unique("Category"),
  })) as any;
  return result.insertId as number;
}

export async function createSubjectDocument(params: {
  categoryId: number;
  subjectId: number;
  userId: number;
}) {
  const [result] = (await db.insert(SubjectDocument).values({
    category_id: params.categoryId,
    subject_id: params.subjectId,
    user_id: params.userId,
    file_name: unique("file") + ".pdf",
    original_name: "Notes.pdf",
    file_path: `subjects/${params.subjectId}/${unique("file")}.pdf`,
    file_size: 1024,
    mime_type: "application/pdf",
    file_extension: "pdf",
  })) as any;
  return result.insertId as number;
}

export async function createCalendarSlot(params: {
  userId: number;
  subjectId: number;
  classGroupId: number;
  academicTermId: number;
  dayOfWeek: number;
  startTime?: string;
  endTime?: string;
}) {
  const [result] = (await db.insert(CalendarSlot).values({
    academic_term_id: params.academicTermId,
    class_group_id: params.classGroupId,
    subject_id: params.subjectId,
    user_id: params.userId,
    day_of_week: params.dayOfWeek,
    start_time: params.startTime ?? "08:00",
    end_time: params.endTime ?? "09:00",
    is_active: 1,
  })) as any;
  return result.insertId as number;
}

export async function createSchemeOfWork(params: {
  userId: number;
  subjectId: number;
  classGroupId: number;
  academicTermId: number;
}) {
  const [result] = (await db.insert(SchemeOfWork).values({
    user_id: params.userId,
    subject_id: params.subjectId,
    class_group_id: params.classGroupId,
    academic_term_id: params.academicTermId,
  })) as any;
  return result.insertId as number;
}

export async function createSchemeOfWorkEntry(schemeId: number) {
  const [result] = (await db.insert(SchemeOfWorkEntry).values({
    scheme_id: schemeId,
    week_number: "Week 1",
    topic: "Test topic",
  })) as any;
  return result.insertId as number;
}

export async function createLoLesson(params: {
  userId: number;
  entryId?: number | null;
  lessonDate: string;
  moduleName?: string;
  startTime?: string;
}) {
  const [result] = (await db.insert(LO_Lesson).values({
    entry_id: params.entryId ?? null,
    user_id: params.userId,
    module_name: params.moduleName ?? "Test Lesson",
    lesson_date: params.lessonDate,
    start_time: params.startTime ?? null,
  } as any)) as any;
  return result.insertId as number;
}

export async function createInstructorReport(params: {
  userId: number;
  classGroupId?: number;
}) {
  const [result] = (await db.insert(InstructorReport).values({
    user_id: params.userId,
    class_group_id: params.classGroupId ?? null,
    start_date: "2026-01-05",
    end_date: "2026-01-09",
    key_highlights: "Highlights",
    challenges_encountered: "Challenges",
  } as any)) as any;
  return result.insertId as number;
}

export async function createLessonReport(params: {
  userId: number;
  deliveryDate: string;
  lessonId?: number | null;
  subjectId?: number | null;
  classGroupId?: number | null;
  status?: "DELIVERED" | "PARTIAL" | "MISSED";
}) {
  const [result] = (await db.insert(LessonReport).values({
    reported_by: params.userId,
    lesson_id: params.lessonId ?? null,
    subject_id: params.subjectId ?? null,
    class_group_id: params.classGroupId ?? null,
    delivery_date: params.deliveryDate,
    status: params.status ?? "DELIVERED",
  } as any)) as any;
  return result.insertId as number;
}
