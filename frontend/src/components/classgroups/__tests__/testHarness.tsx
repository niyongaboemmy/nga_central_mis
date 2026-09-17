import { vi } from "vitest";
import {
  AcademicYear,
  Program,
  Grade,
  ClassGroup,
  Subject,
} from "../../../api/academics";
import { ClassGroupOverviewRow } from "../../../api/classGroups";

/**
 * Shared fixtures + api mocks for the Class Groups Management lenses. One
 * two-grade program with three class groups, deliberately uneven so readiness
 * assertions have something to fail on.
 */

export const YEARS: AcademicYear[] = [
  {
    academic_year_id: 1,
    name: "2026",
    start_date: null,
    end_date: null,
    is_current: 1,
  },
  {
    academic_year_id: 2,
    name: "2025",
    start_date: null,
    end_date: null,
    is_current: 0,
  },
];

export const PROGRAMS: Program[] = [
  { program_id: 10, name: "Primary", description: null },
  { program_id: 20, name: "Secondary", description: null },
];

export const GRADES: Grade[] = [
  { grade_id: 100, program_id: 10, name: "P1", level_order: 1 },
  // A second grade in the same program, deliberately absent from OVERVIEW --
  // it exists for the structure lens and for cascade assertions.
  { grade_id: 101, program_id: 10, name: "P2", level_order: 2 },
  { grade_id: 200, program_id: 20, name: "S1", level_order: 1 },
];

export const CLASS_GROUPS: ClassGroup[] = [
  { class_group_id: 1000, grade_id: 100, name: "P1A" },
  { class_group_id: 1001, grade_id: 100, name: "P1B" },
  { class_group_id: 1002, grade_id: 101, name: "P2A" },
  { class_group_id: 2000, grade_id: 200, name: "S1A" },
];

export const SUBJECTS: Subject[] = [
  {
    subject_id: 1,
    code: "MATH",
    name: "Mathematics",
    description: null,
    course_category_id: null,
    max_marks: 100,
  },
  {
    subject_id: 2,
    code: "ENG",
    name: "English",
    description: null,
    course_category_id: null,
    max_marks: 100,
  },
  {
    subject_id: 3,
    code: "SCI",
    name: "Science",
    description: null,
    course_category_id: null,
    max_marks: 100,
  },
];

export const OVERVIEW: ClassGroupOverviewRow[] = [
  {
    // Fully set up.
    class_group_id: 1000,
    class_group_name: "P1A",
    grade_id: 100,
    grade_name: "P1",
    level_order: 1,
    program_id: 10,
    program_name: "Primary",
    student_count: 2,
    curriculum_subject_count: 2,
    taught_subject_count: 2,
    class_teacher: { user_id: 900, first_name: "Ada", last_name: "Uwase" },
    fully_enrolled_student_count: 2,
  },
  {
    // No students, no teacher, half staffed.
    class_group_id: 1001,
    class_group_name: "P1B",
    grade_id: 100,
    grade_name: "P1",
    level_order: 1,
    program_id: 10,
    program_name: "Primary",
    student_count: 0,
    curriculum_subject_count: 2,
    taught_subject_count: 1,
    class_teacher: null,
    fully_enrolled_student_count: 0,
  },
  {
    // Different program — used to prove the program filter bites.
    class_group_id: 2000,
    class_group_name: "S1A",
    grade_id: 200,
    grade_name: "S1",
    level_order: 1,
    program_id: 20,
    program_name: "Secondary",
    student_count: 1,
    curriculum_subject_count: 0,
    taught_subject_count: 0,
    class_teacher: null,
    fully_enrolled_student_count: 0,
  },
];

// Deliberately `any`: every mock below is re-pointed at differently shaped
// fixtures per test, and a precisely inferred first shape would reject them.
export const wrapped = (data: unknown): Promise<any> =>
  Promise.resolve({ data: { data } });

/** Every academics API call the workspace makes, mocked and inspectable. */
export const academicsMocks = {
  academicYearsApi: { getAll: vi.fn(() => wrapped(YEARS)) },
  programsApi: {
    getAll: vi.fn(() => wrapped(PROGRAMS)),
    create: vi.fn(() => wrapped({})),
  },
  gradesApi: {
    getAll: vi.fn(() => wrapped(GRADES)),
    create: vi.fn(() => wrapped({})),
    update: vi.fn(() => wrapped({})),
    delete: vi.fn(() => wrapped({})),
  },
  classGroupsApi: {
    getAll: vi.fn(() => wrapped(CLASS_GROUPS)),
    students: vi.fn(() => wrapped([])),
    create: vi.fn(() => wrapped({})),
    update: vi.fn(() => wrapped({})),
    dependencies: vi.fn(() =>
      wrapped({
        class_group_id: 1001,
        name: "P1B",
        requires_confirmation: false,
        deletes: [],
        unlinks: [],
      }),
    ),
    delete: vi.fn(() => wrapped({})),
  },
  subjectsApi: {
    getAll: vi.fn(() => wrapped(SUBJECTS)),
    create: vi.fn(() => wrapped(SUBJECTS[0])),
  },
  gradeSubjectsApi: {
    getByGrade: vi.fn(() => wrapped([])),
    assign: vi.fn(() => wrapped({})),
    remove: vi.fn(() => wrapped({})),
  },
  teacherSubjectAssignmentsApi: {
    getAll: vi.fn(() => wrapped([])),
    assign: vi.fn(() => wrapped({})),
    update: vi.fn(() => wrapped({})),
    remove: vi.fn(() => wrapped({})),
    copy: vi.fn(() => wrapped({ copied: 0, skipped: 0 })),
  },
  studentEnrollmentApi: {
    enroll: vi.fn(() => wrapped({})),
    unenroll: vi.fn(() => wrapped({})),
    bulkEnroll: vi.fn(() => wrapped({ enrolled: 0, skipped: 0, total: 0 })),
  },
  studentClassGroupApi: {
    assign: vi.fn(() => wrapped({})),
    remove: vi.fn(() => wrapped({})),
    bulkAssign: vi.fn(() =>
      wrapped({
        assigned: 0,
        reactivated: 0,
        already_active: 0,
        subjects_enrolled: 0,
        total: 0,
      }),
    ),
  },
  enrollmentRosterApi: { get: vi.fn(() => wrapped(null)) },
};

export const classGroupsWorkspaceMocks = {
  overview: vi.fn(() => wrapped(OVERVIEW)),
  unassignedStudents: vi.fn(() =>
    wrapped({
      students: [],
      total: 0,
      page: 1,
      totalPages: 1,
      academic_year_id: 1,
    }),
  ),
  bulkAssignTeacherSubjects: vi.fn(() =>
    wrapped({ assigned: 0, skipped: 0, total: 0 }),
  ),
  bulkUnenrollStudents: vi.fn(() =>
    wrapped({ unenrolled: 0, skipped: 0, total: 0 }),
  ),
};

export const showToastMock = vi.fn();

/** Reset every mock to its default resolved value between tests. */
export const resetWorkspaceMocks = () => {
  vi.clearAllMocks();
  academicsMocks.academicYearsApi.getAll.mockImplementation(() => wrapped(YEARS));
  academicsMocks.programsApi.getAll.mockImplementation(() => wrapped(PROGRAMS));
  academicsMocks.gradesApi.getAll.mockImplementation(() => wrapped(GRADES));
  academicsMocks.classGroupsApi.getAll.mockImplementation(() =>
    wrapped(CLASS_GROUPS),
  );
  academicsMocks.subjectsApi.getAll.mockImplementation(() => wrapped(SUBJECTS));
  classGroupsWorkspaceMocks.overview.mockImplementation(() => wrapped(OVERVIEW));
  localStorage.clear();
};

/** All permissions granted unless a test narrows it. */
export let grantedPermissions: string[] = ["*"];
export const setPermissions = (perms: string[]) => {
  grantedPermissions = perms;
};
export const hasPermissionMock = (perm?: string) =>
  !perm || grantedPermissions.includes("*") || grantedPermissions.includes(perm);
