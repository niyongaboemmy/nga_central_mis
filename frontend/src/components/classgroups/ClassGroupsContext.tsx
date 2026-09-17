import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  academicYearsApi,
  programsApi,
  gradesApi,
  classGroupsApi,
  subjectsApi,
  AcademicYear,
  Program,
  Grade,
  ClassGroup,
  Subject,
} from "../../api/academics";
import {
  classGroupsWorkspaceApi,
  ClassGroupOverviewRow,
} from "../../api/classGroups";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";

export type Lens =
  | "students"
  | "teachers"
  | "subjects"
  | "structure"
  | "enrollments";

/**
 * Which slice of server state a write invalidated. Lenses keep their own
 * fetched data (rosters, curricula, assignment lists) and re-fetch when the
 * version of a scope they depend on changes -- one shared invalidation bus
 * instead of every lens refetching everything after every write.
 */
export type InvalidationScope =
  | "structure"
  | "overview"
  | "roster"
  | "curriculum"
  | "assignments";

const STORAGE_KEY = "nga.classgroups.context";

interface PersistedSelection {
  academicYearId: number | null;
  programId: number | null;
  gradeId: number | null;
  classGroupId: number | null;
  activeLens: Lens;
}

interface ClassGroupsContextValue {
  // Reference data, fetched once per tab session.
  academicYears: AcademicYear[];
  programs: Program[];
  grades: Grade[];
  classGroups: ClassGroup[];
  subjects: Subject[];
  referenceLoading: boolean;

  // Selection -- global to the tab. Switching lenses never resets it.
  academicYearId: number | null;
  programId: number | null;
  gradeId: number | null;
  classGroupId: number | null;
  activeLens: Lens;
  setAcademicYearId: (id: number | null) => void;
  setProgramId: (id: number | null) => void;
  setGradeId: (id: number | null) => void;
  setClassGroupId: (id: number | null) => void;
  setActiveLens: (lens: Lens) => void;
  /** Jump straight to a class group (and its grade/program) in one action --
   * used by the navigator and the setup checklist's deep links. */
  focusClassGroup: (row: ClassGroupOverviewRow, lens?: Lens) => void;

  // Derived selection
  gradesForProgram: Grade[];
  classGroupsForGrade: ClassGroup[];
  selectedGrade: Grade | null;
  selectedClassGroup: ClassGroup | null;
  selectedOverview: ClassGroupOverviewRow | null;

  // Aggregate readiness data
  overview: ClassGroupOverviewRow[];
  overviewLoading: boolean;

  // Invalidation bus
  versions: Record<InvalidationScope, number>;
  invalidate: (scopes: InvalidationScope[]) => void;

  // Permissions
  can: {
    manageAcademics: boolean;
    assignClassGroups: boolean;
    manageEnrollments: boolean;
    assignClassTeacher: boolean;
  };
}

const ClassGroupsContext = createContext<ClassGroupsContextValue | undefined>(
  undefined,
);

export const useClassGroups = (): ClassGroupsContextValue => {
  const ctx = useContext(ClassGroupsContext);
  if (!ctx) {
    throw new Error(
      "useClassGroups must be used inside a ClassGroupsProvider",
    );
  }
  return ctx;
};

const readPersisted = (): Partial<PersistedSelection> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const INITIAL_VERSIONS: Record<InvalidationScope, number> = {
  structure: 0,
  overview: 0,
  roster: 0,
  curriculum: 0,
  assignments: 0,
};

export const ClassGroupsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { hasPermission } = usePermissions();

  const persisted = useRef(readPersisted()).current;

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(true);

  const [academicYearId, setAcademicYearIdState] = useState<number | null>(
    persisted.academicYearId ?? null,
  );
  const [programId, setProgramIdState] = useState<number | null>(
    persisted.programId ?? null,
  );
  const [gradeId, setGradeIdState] = useState<number | null>(
    persisted.gradeId ?? null,
  );
  const [classGroupId, setClassGroupIdState] = useState<number | null>(
    persisted.classGroupId ?? null,
  );
  const [activeLens, setActiveLens] = useState<Lens>(
    persisted.activeLens ?? "students",
  );

  const [overview, setOverview] = useState<ClassGroupOverviewRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [versions, setVersions] =
    useState<Record<InvalidationScope, number>>(INITIAL_VERSIONS);

  const invalidate = useCallback((scopes: InvalidationScope[]) => {
    setVersions((prev) => {
      const next = { ...prev };
      for (const scope of scopes) next[scope] = next[scope] + 1;
      return next;
    });
  }, []);

  // ── Reference data ────────────────────────────────────────────────────
  const structureVersion = versions.structure;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReferenceLoading(true);
      try {
        const [yearsRes, programsRes, gradesRes, classGroupsRes, subjectsRes] =
          await Promise.all([
            academicYearsApi.getAll(),
            programsApi.getAll(),
            gradesApi.getAll(),
            classGroupsApi.getAll(),
            subjectsApi.getAll(),
          ]);
        if (cancelled) return;

        const years = ((yearsRes.data as any).data ?? []) as AcademicYear[];
        setAcademicYears(years);
        setPrograms(((programsRes.data as any).data ?? []) as Program[]);
        setGrades(((gradesRes.data as any).data ?? []) as Grade[]);
        setClassGroups(
          ((classGroupsRes.data as any).data ?? []) as ClassGroup[],
        );
        setSubjects(((subjectsRes.data as any).data ?? []) as Subject[]);

        // Default the year to the current one rather than leaving the whole
        // workspace inert until the admin picks a year manually.
        setAcademicYearIdState((current) => {
          if (current && years.some((y) => y.academic_year_id === current)) {
            return current;
          }
          const currentYear = years.find((y) => y.is_current === 1);
          return currentYear?.academic_year_id ?? years[0]?.academic_year_id ?? null;
        });
      } catch {
        if (!cancelled) {
          setAcademicYears([]);
          setPrograms([]);
          setGrades([]);
          setClassGroups([]);
          setSubjects([]);
        }
      } finally {
        if (!cancelled) setReferenceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [structureVersion]);

  // ── Overview ──────────────────────────────────────────────────────────
  const overviewVersion = versions.overview;
  useEffect(() => {
    if (!academicYearId) {
      setOverview([]);
      setOverviewLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setOverviewLoading(true);
      try {
        // Deliberately unfiltered by program: the setup checklist audits the
        // whole year, and the navigator filters client-side.
        const res = await classGroupsWorkspaceApi.overview(academicYearId);
        if (!cancelled) setOverview(res.data.data ?? []);
      } catch {
        if (!cancelled) setOverview([]);
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academicYearId, overviewVersion, structureVersion]);

  // ── Selection cascade ─────────────────────────────────────────────────
  const gradesForProgram = useMemo(
    () =>
      (programId ? grades.filter((g) => g.program_id === programId) : grades)
        .slice()
        .sort((a, b) => a.level_order - b.level_order),
    [grades, programId],
  );

  const classGroupsForGrade = useMemo(
    () =>
      (gradeId ? classGroups.filter((c) => c.grade_id === gradeId) : [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [classGroups, gradeId],
  );

  const setProgramId = useCallback(
    (id: number | null) => {
      setProgramIdState(id);
      // A grade belongs to exactly one program, so a program change that
      // orphans the selected grade must clear it and the class group under it.
      setGradeIdState((currentGrade) => {
        if (currentGrade === null) return null;
        const grade = grades.find((g) => g.grade_id === currentGrade);
        if (!grade) return null;
        if (id !== null && grade.program_id !== id) {
          setClassGroupIdState(null);
          return null;
        }
        return currentGrade;
      });
    },
    [grades],
  );

  const setGradeId = useCallback(
    (id: number | null) => {
      setGradeIdState(id);
      setClassGroupIdState((currentClassGroup) => {
        if (currentClassGroup === null) return null;
        const cg = classGroups.find(
          (c) => c.class_group_id === currentClassGroup,
        );
        if (!cg || cg.grade_id !== id) return null;
        return currentClassGroup;
      });
    },
    [classGroups],
  );

  const setAcademicYearId = useCallback((id: number | null) => {
    // Class groups are permanent labels reused across years, so the structural
    // selection survives a year change -- only the year-scoped data refetches.
    setAcademicYearIdState(id);
  }, []);

  const setClassGroupId = useCallback(
    (id: number | null) => {
      setClassGroupIdState(id);
      if (id === null) return;
      // Selecting a class group directly (navigator, search) implies its grade
      // and program, so keep the upstream selectors in step.
      const cg = classGroups.find((c) => c.class_group_id === id);
      if (!cg) return;
      setGradeIdState(cg.grade_id);
      const grade = grades.find((g) => g.grade_id === cg.grade_id);
      if (grade) setProgramIdState(grade.program_id);
    },
    [classGroups, grades],
  );

  const focusClassGroup = useCallback(
    (row: ClassGroupOverviewRow, lens?: Lens) => {
      setProgramIdState(row.program_id);
      setGradeIdState(row.grade_id);
      setClassGroupIdState(row.class_group_id);
      if (lens) setActiveLens(lens);
    },
    [],
  );

  // Drop a persisted selection that no longer exists (deleted class group,
  // renamed program) once reference data has arrived.
  useEffect(() => {
    if (referenceLoading) return;
    if (
      classGroupId !== null &&
      !classGroups.some((c) => c.class_group_id === classGroupId)
    ) {
      setClassGroupIdState(null);
    }
    if (gradeId !== null && !grades.some((g) => g.grade_id === gradeId)) {
      setGradeIdState(null);
    }
    if (
      programId !== null &&
      !programs.some((p) => p.program_id === programId)
    ) {
      setProgramIdState(null);
    }
  }, [
    referenceLoading,
    classGroups,
    grades,
    programs,
    classGroupId,
    gradeId,
    programId,
  ]);

  // ── Persistence ───────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          academicYearId,
          programId,
          gradeId,
          classGroupId,
          activeLens,
        } satisfies PersistedSelection),
      );
    } catch {
      // A browser with storage disabled just loses the restore-on-reload
      // convenience; the workspace itself still works.
    }
  }, [academicYearId, programId, gradeId, classGroupId, activeLens]);

  const selectedGrade = useMemo(
    () => grades.find((g) => g.grade_id === gradeId) ?? null,
    [grades, gradeId],
  );

  const selectedClassGroup = useMemo(
    () => classGroups.find((c) => c.class_group_id === classGroupId) ?? null,
    [classGroups, classGroupId],
  );

  const selectedOverview = useMemo(
    () => overview.find((o) => o.class_group_id === classGroupId) ?? null,
    [overview, classGroupId],
  );

  const can = useMemo(
    () => ({
      manageAcademics: hasPermission(Permissions.MANAGE_ACADEMICS),
      assignClassGroups: hasPermission(Permissions.ASSIGN_STUDENT_CLASS_GROUPS),
      manageEnrollments: hasPermission(Permissions.MANAGE_STUDENT_ENROLLMENTS),
      assignClassTeacher: hasPermission(
        Permissions.ASSIGN_GRADE_TO_CLASS_TEACHER,
      ),
    }),
    [hasPermission],
  );

  const value: ClassGroupsContextValue = {
    academicYears,
    programs,
    grades,
    classGroups,
    subjects,
    referenceLoading,
    academicYearId,
    programId,
    gradeId,
    classGroupId,
    activeLens,
    setAcademicYearId,
    setProgramId,
    setGradeId,
    setClassGroupId,
    setActiveLens,
    focusClassGroup,
    gradesForProgram,
    classGroupsForGrade,
    selectedGrade,
    selectedClassGroup,
    selectedOverview,
    overview,
    overviewLoading,
    versions,
    invalidate,
    can,
  };

  return (
    <ClassGroupsContext.Provider value={value}>
      {children}
    </ClassGroupsContext.Provider>
  );
};
