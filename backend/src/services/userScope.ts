import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  ClassGroup,
  Grade,
  UserGrade,
  UserProgramLead,
} from "../db/schema";
import { getCurrentAcademicYearId } from "../utils/academicYear";

/**
 * The set of grades / class groups a user is allowed to see.
 *
 * Two assignment mechanisms feed this:
 *   - UserGrade      -- class teacher, assigned to a *specific class group*
 *                       within a grade for one academic year (see migration 066).
 *   - UserProgramLead -- program lead, responsible for a whole program, which
 *                       expands to every grade (and class group) under it.
 *
 * `assignedGrades` is the narrower of the two, so it wins when present. A user
 * with neither is unscoped (an admin) and every scoped query passes through
 * unfiltered for them -- `scoped: false` is the signal for that, NOT an empty
 * id list, which would otherwise be indistinguishable from "assigned to nothing".
 */
export interface UserScope {
  scoped: boolean;
  gradeIds: number[];
  classGroupIds: number[];
  programIds: number[];
  academicYearId: number | null;
}

const UNSCOPED = (academicYearId: number | null): UserScope => ({
  scoped: false,
  gradeIds: [],
  classGroupIds: [],
  programIds: [],
  academicYearId,
});

export const resolveUserScope = async (
  userId: number,
  academicYearId?: number | null,
): Promise<UserScope> => {
  const yearId = academicYearId ?? (await getCurrentAcademicYearId());

  if (!userId || !yearId) {
    return UNSCOPED(yearId ?? null);
  }

  // 1. Class-teacher assignments -- grade + class group, for this year only.
  const gradeAssignments = await db
    .select({
      grade_id: UserGrade.grade_id,
      class_group_id: UserGrade.class_group_id,
      program_id: Grade.program_id,
    })
    .from(UserGrade)
    .innerJoin(Grade, eq(UserGrade.grade_id, Grade.grade_id))
    .where(
      and(
        eq(UserGrade.user_id, userId),
        eq(UserGrade.academic_year_id, yearId),
      ),
    );

  if (gradeAssignments.length > 0) {
    return {
      scoped: true,
      gradeIds: unique(gradeAssignments.map((a) => a.grade_id)),
      classGroupIds: unique(gradeAssignments.map((a) => a.class_group_id)),
      programIds: unique(
        gradeAssignments
          .map((a) => a.program_id)
          .filter((id): id is number => typeof id === "number"),
      ),
      academicYearId: yearId,
    };
  }

  // 2. Program-lead assignments -- widen to every grade under the program.
  const programAssignments = await db
    .select({ program_id: UserProgramLead.program_id })
    .from(UserProgramLead)
    .where(
      and(
        eq(UserProgramLead.user_id, userId),
        eq(UserProgramLead.academic_year_id, yearId),
      ),
    );

  const programIds = unique(programAssignments.map((p) => p.program_id));
  if (programIds.length === 0) {
    return UNSCOPED(yearId);
  }

  const grades = await db
    .select({ grade_id: Grade.grade_id })
    .from(Grade)
    .where(inArray(Grade.program_id, programIds));

  const gradeIds = unique(grades.map((g) => g.grade_id));

  // A program with no grades yet still scopes the user -- they must see
  // nothing, not everything, so keep `scoped: true` with empty id lists.
  const classGroups =
    gradeIds.length > 0
      ? await db
          .select({ class_group_id: ClassGroup.class_group_id })
          .from(ClassGroup)
          .where(inArray(ClassGroup.grade_id, gradeIds))
      : [];

  return {
    scoped: true,
    gradeIds,
    classGroupIds: unique(classGroups.map((c) => c.class_group_id)),
    programIds,
    academicYearId: yearId,
  };
};

/**
 * Clamp a caller-supplied `grade_ids` filter to what the scope actually allows.
 * A scoped user may narrow their view but never widen it; an unscoped user gets
 * whatever they asked for (or everything, when they asked for nothing).
 */
export const resolveRequestedGradeIds = (
  requested: number[] | null,
  scope: UserScope,
): { gradeIds: number[]; unrestricted: boolean } => {
  if (!scope.scoped) {
    return requested && requested.length > 0
      ? { gradeIds: requested, unrestricted: false }
      : { gradeIds: [], unrestricted: true };
  }
  if (!requested || requested.length === 0) {
    return { gradeIds: scope.gradeIds, unrestricted: false };
  }
  return {
    gradeIds: requested.filter((id) => scope.gradeIds.includes(id)),
    unrestricted: false,
  };
};

/**
 * Guard for anything keyed by a single class group (a calendar, a timetable
 * slot). A class-teacher assignment names one *class group*, not a whole grade
 * -- two teachers can lead L3 Class A and L3 Class B independently -- so grade
 * membership is not enough to authorise a write.
 */
export const isClassGroupInScope = (
  classGroupId: number,
  scope: UserScope,
): boolean => {
  if (!scope.scoped) return true;
  return scope.classGroupIds.includes(classGroupId);
};

/** Parse a `1,2,3` query-string list into distinct positive integers. */
export const parseIdList = (raw: unknown): number[] | null => {
  if (raw === undefined || raw === null || raw === "") return null;
  const values = Array.isArray(raw) ? raw : String(raw).split(",");
  const ids = values
    .map((v) => parseInt(String(v).trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? unique(ids) : null;
};

function unique(values: number[]): number[] {
  return Array.from(new Set(values));
}
