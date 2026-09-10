import api from "../services/api";

/**
 * Endpoints backing the Class Groups Management workspace
 * (components/classgroups). They answer aggregate questions the workspace
 * would otherwise have to assemble from one request per class group, so they
 * live apart from the per-entity CRUD in api/academics.ts.
 */

export interface ClassGroupOverviewRow {
  class_group_id: number;
  class_group_name: string;
  grade_id: number;
  grade_name: string;
  level_order: number;
  program_id: number;
  program_name: string;
  /** Active students in this class group for the requested year. */
  student_count: number;
  /** Subjects in the parent grade's curriculum. */
  curriculum_subject_count: number;
  /** Curriculum subjects that have at least one teacher for this class group. */
  taught_subject_count: number;
  class_teacher: {
    user_id: number;
    first_name: string | null;
    last_name: string | null;
  } | null;
  /** Students holding every subject in the curriculum. */
  fully_enrolled_student_count: number;
}

export interface UnassignedStudent {
  user_id: number;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
}

export interface UnassignedStudentsResponse {
  students: UnassignedStudent[];
  total: number;
  page: number;
  totalPages: number;
  academic_year_id: number;
}

export const classGroupsWorkspaceApi = {
  /** Per-class-group readiness counts for one year — one request for the
   * whole navigator and setup checklist. */
  overview: (academicYearId?: number, programId?: number) =>
    api.get<{ data: ClassGroupOverviewRow[] }>(
      "/academics/class-groups/overview",
      {
        params: {
          ...(academicYearId && { academic_year_id: academicYearId }),
          ...(programId && { program_id: programId }),
        },
      },
    ),

  /** Students with no class group for the year — the pool a roster draws from. */
  unassignedStudents: (params: {
    academic_year_id?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    api.get<{ data: UnassignedStudentsResponse }>(
      "/academics/students/unassigned",
      { params },
    ),

  /** Assign one teacher to many of a class group's subjects at once. */
  bulkAssignTeacherSubjects: (data: {
    user_id: number;
    subject_ids: number[];
    class_group_id: number;
    academic_year_id?: number;
  }) =>
    api.post<{
      data: { assigned: number; skipped: number; total: number };
    }>("/academics/teachers/bulk-assign-subjects", data),

  /** Mirror of studentEnrollmentApi.bulkEnroll, so the enrollment matrix can
   * commit a staged diff in one round trip per direction. */
  bulkUnenrollStudents: (data: {
    user_ids: number[];
    subject_ids: number[];
    academic_year_id?: number;
  }) =>
    api.post<{
      data: { unenrolled: number; skipped: number; total: number };
    }>("/academics/students/bulk-unenroll-subjects", data),
};
