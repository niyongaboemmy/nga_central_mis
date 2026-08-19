import { useMemo } from "react";
import { useUser } from "../contexts/UserContext";

export interface ScopedGrade {
  grade_id: number;
  name: string;
  program_id?: number;
  program_name?: string;
}

export interface ScopedClassGroup {
  class_group_id: number;
  name: string;
  grade_id: number;
  grade_name: string;
}

export interface GradeScope {
  /**
   * False for an unscoped user (an admin with neither assignment) — pages must
   * then apply no grade filter at all. An empty `gradeIds` is NOT the same
   * thing: a program lead over an empty program is scoped to nothing.
   */
  isScoped: boolean;
  /** Which mechanism produced the scope, for copy like "your assigned grades". */
  source: "grades" | "programs" | "none";
  gradeIds: number[];
  classGroupIds: number[];
  grades: ScopedGrade[];
  classGroups: ScopedClassGroup[];
  programIds: number[];
  /** The class group a scoped user should land on by default. */
  defaultClassGroupId: number | null;
}

/**
 * Resolves what slice of the school the signed-in user may see, from the
 * `/users/me` payload:
 *
 *   - `assignedGrades` — class-teacher assignments, each already narrowed to a
 *     specific class group for the current year. Narrowest, so it wins.
 *   - `assignedPrograms` — program-lead assignments, expanded to every grade of
 *     those programs via `allGrades`.
 *   - neither — unscoped.
 *
 * Mirrors `resolveUserScope` on the backend, which is where the rule is actually
 * enforced; this hook only drives defaults and UI affordances.
 */
export const useScopedGrades = (): GradeScope => {
  const { user } = useUser();

  return useMemo(() => {
    const assignedGrades = user?.assignedGrades ?? [];
    const assignedPrograms = user?.assignedPrograms ?? [];
    const allGrades = user?.allGrades ?? [];

    if (assignedGrades.length > 0) {
      const grades = dedupeBy(
        assignedGrades.map((g) => ({
          grade_id: g.grade_id,
          name: g.name,
          program_id: g.program_id,
          program_name: g.program_name,
        })),
        (g) => g.grade_id,
      );
      const classGroups = dedupeBy(
        assignedGrades
          .filter((g) => g.class_group_id)
          .map((g) => ({
            class_group_id: g.class_group_id,
            name: g.class_group_name ?? g.name,
            grade_id: g.grade_id,
            grade_name: g.name,
          })),
        (c) => c.class_group_id,
      );

      return {
        isScoped: true,
        source: "grades",
        gradeIds: grades.map((g) => g.grade_id),
        classGroupIds: classGroups.map((c) => c.class_group_id),
        grades,
        classGroups,
        programIds: dedupe(
          grades
            .map((g) => g.program_id)
            .filter((id): id is number => typeof id === "number"),
        ),
        defaultClassGroupId: classGroups[0]?.class_group_id ?? null,
      };
    }

    if (assignedPrograms.length > 0) {
      const programIds = assignedPrograms.map((p) => p.program_id);
      const grades = allGrades
        .filter((g) => programIds.includes(g.program_id))
        .map((g) => ({
          grade_id: g.grade_id,
          name: g.name,
          program_id: g.program_id,
          program_name: g.program_name,
        }));

      return {
        isScoped: true,
        source: "programs",
        gradeIds: grades.map((g) => g.grade_id),
        // Class groups are not in the /users/me payload for program leads —
        // the server resolves them; the client only needs the grade ids.
        classGroupIds: [],
        grades,
        classGroups: [],
        programIds,
        defaultClassGroupId: null,
      };
    }

    return {
      isScoped: false,
      source: "none",
      gradeIds: [],
      classGroupIds: [],
      grades: [],
      classGroups: [],
      programIds: [],
      defaultClassGroupId: null,
    };
  }, [user?.assignedGrades, user?.assignedPrograms, user?.allGrades]);
};

function dedupe(values: number[]): number[] {
  return Array.from(new Set(values));
}

function dedupeBy<T>(items: T[], key: (item: T) => number): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export default useScopedGrades;
