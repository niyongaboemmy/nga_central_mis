import api from "../services/api";

// Types
export interface AcademicYear {
  academic_year_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: number;
}

export interface AcademicTerm {
  academic_term_id: number;
  academic_year_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: number;
}

export interface Program {
  program_id: number;
  name: string;
  description: string | null;
}

export interface Grade {
  grade_id: number;
  program_id: number;
  name: string;
  level_order: number;
  program_name?: string;
}

export interface Subject {
  subject_id: number;
  code: string | null;
  name: string;
  description: string | null;
  course_category_id: number | null;
  category_name?: string;
  max_marks: number | null;
  color?: string;
  grades?: Array<{
    grade_id: number;
    grade_name: string;
    program_id: number;
    program_name: string;
  }>;
}

export interface CourseCategory {
  category_id: number;
  name: string;
  description: string | null;
  status: string;
}

export interface ClassGroup {
  class_group_id: number;
  grade_id: number;
  name: string;
  grade_name?: string;
  program_name?: string;
}

export interface StudentClassGroup {
  class_group_id: number;
  class_group_name: string;
  grade_id: number;
  grade_name: string;
  program_id: number;
  program_name: string;
  academic_year_id: number;
  academic_year_name: string;
  assigned_at: string;
}

// Academic Years API
export const academicYearsApi = {
  getAll: () =>
    api.get<
      | { success: boolean; message: string; data: AcademicYear[] }
      | { data: AcademicYear[] }
    >("/academics/years"),
  getById: (id: number) => api.get<AcademicYear>(`/academics/years/${id}`),
  create: (data: Omit<AcademicYear, "academic_year_id">) =>
    api.post<AcademicYear>("/academics/years", data),
  update: (id: number, data: Partial<Omit<AcademicYear, "academic_year_id">>) =>
    api.put<AcademicYear>(`/academics/years/${id}`, data),
  delete: (id: number) => api.delete(`/academics/years/${id}`),
};

// Academic Terms API
export const academicTermsApi = {
  getAll: (academicYearId?: number) =>
    api.get<
      | { success: boolean; message: string; data: AcademicTerm[] }
      | { data: AcademicTerm[] }
    >("/academics/terms", {
      params: academicYearId ? { academic_year_id: academicYearId } : undefined,
    }),
  getById: (id: number) => api.get<AcademicTerm>(`/academics/terms/${id}`),
  create: (data: Omit<AcademicTerm, "academic_term_id">) =>
    api.post<AcademicTerm>("/academics/terms", data),
  update: (id: number, data: Partial<Omit<AcademicTerm, "academic_term_id">>) =>
    api.put<AcademicTerm>(`/academics/terms/${id}`, data),
  delete: (id: number) => api.delete(`/academics/terms/${id}`),
};

// Programs API
export const programsApi = {
  getAll: () => api.get<{ data: Program[] }>("/academics/programs"),
  getById: (id: number) => api.get<Program>(`/academics/programs/${id}`),
  create: (data: Omit<Program, "program_id">) =>
    api.post<Program>("/academics/programs", data),
  update: (id: number, data: Partial<Omit<Program, "program_id">>) =>
    api.put<Program>(`/academics/programs/${id}`, data),
  delete: (id: number) => api.delete(`/academics/programs/${id}`),
};

// Grades API
export const gradesApi = {
  getAll: (programId?: number) =>
    api.get<{ data: Grade[] }>("/academics/grades", {
      params: programId ? { program_id: programId } : undefined,
    }),
  getById: (id: number) => api.get<Grade>(`/academics/grades/${id}`),
  create: (data: Omit<Grade, "grade_id">) =>
    api.post<Grade>("/academics/grades", data),
  update: (id: number, data: Partial<Omit<Grade, "grade_id">>) =>
    api.put<Grade>(`/academics/grades/${id}`, data),
  delete: (id: number) => api.delete(`/academics/grades/${id}`),
};

// Subjects API
export const subjectsApi = {
  getAll: () => api.get<{ data: Subject[] }>("/academics/subjects"),
  getById: (id: number) => api.get<Subject>(`/academics/subjects/${id}`),
  create: (data: Omit<Subject, "subject_id">) =>
    api.post<{ data: Subject }>("/academics/subjects", data),
  update: (id: number, data: Partial<Omit<Subject, "subject_id">>) =>
    api.put<Subject>(`/academics/subjects/${id}`, data),
  delete: (id: number) => api.delete(`/academics/subjects/${id}`),
};

// Course Categories API
export const courseCategoriesApi = {
  getAll: () =>
    api.get<{ data: CourseCategory[] }>("/academics/course-categories"),
  getById: (id: number) =>
    api.get<CourseCategory>(`/academics/course-categories/${id}`),
  create: (data: Omit<CourseCategory, "category_id" | "status">) =>
    api.post<CourseCategory>("/academics/course-categories", data),
  update: (
    id: number,
    data: Partial<Omit<CourseCategory, "category_id" | "status">>,
  ) => api.put<CourseCategory>(`/academics/course-categories/${id}`, data),
  delete: (id: number) => api.delete(`/academics/course-categories/${id}`),
};

// Class Groups API -- ClassGroup is a permanent label per grade, not
// year-scoped, so there's no "copy class groups to a new year" action.
export const classGroupsApi = {
  getAll: (gradeId?: number) =>
    api.get<{ data: ClassGroup[] }>("/academics/class-groups", {
      params: {
        ...(gradeId && { grade_id: gradeId }),
      },
    }),
  getById: (id: number) => api.get<ClassGroup>(`/academics/class-groups/${id}`),
  create: (data: Omit<ClassGroup, "class_group_id">) =>
    api.post<ClassGroup>("/academics/class-groups", data),
  update: (id: number, data: Partial<Omit<ClassGroup, "class_group_id">>) =>
    api.put<ClassGroup>(`/academics/class-groups/${id}`, data),
  delete: (id: number) => api.delete(`/academics/class-groups/${id}`),
};

// Grade-Subject Assignment API
export interface GradeSubject {
  grade_subject_id: string;
  grade_id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  subject_description: string | null;
}

export const gradeSubjectsApi = {
  getByGrade: (gradeId: number) =>
    api.get<{ data: GradeSubject[] }>(`/academics/grades/${gradeId}/subjects`),
  assign: (data: { grade_id: number; subject_id: number }) =>
    api.post("/academics/grades/assign-subject", data),
  remove: (gradeId: number, subjectId: number) =>
    api.delete(`/academics/grades/${gradeId}/subjects/${subjectId}`),
};

// Teacher-Subject Assignment API
export interface TeacherSubjectAssignment {
  assignment_id: string;
  user_id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  class_group_id: number;
  class_group_name: string;
  grade_name: string;
  program_name: string;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
  assigned_at: string;
}

export interface SubjectTeacherAssignment {
  assignment_id: string;
  user_id: number;
  teacher_name: string;
  teacher_username: string;
  subject_id: number;
  class_group_id: number;
  class_group_name: string;
  grade_name: string;
  program_name: string;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
  assigned_at: string;
}

export interface AllTeacherSubjectAssignment {
  assignment_id: string;
  user_id: number;
  teacher_name: string;
  teacher_username: string;
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  class_group_id: number;
  class_group_name: string;
  grade_name: string;
  program_name: string;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
  assigned_at: string;
}

export const teacherSubjectAssignmentsApi = {
  getByTeacher: (teacherId: number) =>
    api.get<{ data: TeacherSubjectAssignment[] }>(
      `/academics/teachers/${teacherId}/subjects`,
    ),
  getBySubject: (subjectId: number) =>
    api.get<{ data: SubjectTeacherAssignment[] }>(
      `/academics/subjects/${subjectId}/teachers`,
    ),
  getAll: (academicYearId?: number) =>
    api.get<{ data: AllTeacherSubjectAssignment[] }>(
      "/academics/teacher-assignments",
      {
        params: academicYearId
          ? { academic_year_id: academicYearId }
          : undefined,
      },
    ),
  assign: (data: {
    user_id: number;
    subject_id: number;
    class_group_id: number;
    academic_year_id?: number;
  }) => api.post("/academics/teachers/assign-subject", data),
  remove: (
    teacherId: number,
    subjectId: number,
    classGroupId: number,
    academicYearId: number,
  ) =>
    api.delete(
      `/academics/teachers/${teacherId}/subjects/${subjectId}/class-groups/${classGroupId}/years/${academicYearId}`,
    ),
  copy: (data: {
    source_academic_year_id: number;
    target_academic_year_id: number;
  }) =>
    api.post<{
      data: {
        copied: number;
        skipped: number;
      };
    }>("/academics/teachers/copy-assignments", data),
};

// My Assigned Subjects API (for teachers)
export interface MyAssignedSubject {
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  grades: Array<{
    grade_id: number;
    grade_name: string;
    program_id: number;
    program_name: string;
    class_group_id: number;
    class_group_name: string;
    academic_year_id: number;
    academic_year_name: string;
    assigned_at: string;
    validation_status: "PENDING" | "APPROVED" | "REJECTED";
    validation_comment: string | null;
    scheme_id: number | null;
  }>;
}

export interface EnrolledStudent {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  class_group_name: string | null;
  grade_name: string | null;
  program_name: string | null;
  enrolled_at: string;
}

export const myAssignedSubjectsApi = {
  getAll: (academicTermId?: number) =>
    api.get<{ data: MyAssignedSubject[] }>("/academics/my-assigned-subjects", {
      params: academicTermId ? { academic_term_id: academicTermId } : undefined,
    }),
  getEnrolledStudents: (subjectId: number, academicYearId: number) =>
    api.get<{ data: EnrolledStudent[] }>(
      `/academics/subjects/${subjectId}/years/${academicYearId}/students`,
    ),
};

// Student Subject Enrollment API
export interface StudentEnrolledSubject {
  enrollment_id: string;
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  subject_description: string | null;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
  enrolled_at: string;
}

export interface AvailableSubject {
  subject_id: number;
  code: string | null;
  name: string;
  description: string | null;
  in_grade_curriculum?: boolean;
  grades?: Array<{
    grade_id: number;
    grade_name: string;
    program_id: number;
    program_name: string;
  }>;
}

export const studentEnrollmentApi = {
  getEnrolledSubjects: (studentId: number, academicYearId?: number) =>
    api.get<{ data: StudentEnrolledSubject[] }>(
      `/academics/students/${studentId}/enrolled-subjects`,
      {
        params: academicYearId
          ? { academic_year_id: academicYearId }
          : undefined,
      },
    ),
  getAvailableSubjects: (studentId: number, academicYearId: number) =>
    api.get<{ data: AvailableSubject[] }>(
      `/academics/students/${studentId}/available-subjects`,
      { params: { academic_year_id: academicYearId } },
    ),
  enroll: (data: {
    user_id: number;
    subject_id: number;
    academic_year_id: number;
  }) => api.post("/academics/students/enroll-subject", data),
  unenroll: (studentId: number, subjectId: number, academicYearId: number) =>
    api.delete(
      `/academics/students/${studentId}/subjects/${subjectId}/years/${academicYearId}`,
    ),
};

// Student Class Group Assignment API
export const studentClassGroupApi = {
  getByStudent: (studentId: number) =>
    api.get<{ data: StudentClassGroup | null }>(
      `/academics/students/${studentId}/class-group`,
    ),
  assign: (data: {
    user_id: number;
    class_group_id: number;
    academic_year_id?: number;
  }) => api.post("/academics/students/assign-class-group", data),
  remove: (studentId: number, classGroupId: number, academicYearId: number) =>
    api.delete(
      `/academics/students/${studentId}/class-groups/${classGroupId}/years/${academicYearId}`,
    ),
  /** Bulk-move every active student from one class group into another (e.g.
   * promoting a whole class to next year's grade), rather than moving
   * students one at a time. The source class group's students keep their
   * prior enrollment as history -- they aren't removed from it. */
  promote: (data: {
    source_class_group_id: number;
    source_academic_year_id: number;
    target_class_group_id: number;
    target_academic_year_id: number;
  }) =>
    api.post<{
      data: { promoted: number; skipped: number; total: number };
    }>("/academics/students/promote-class", data),
};

export interface PromotionGradePlan {
  source_grade_id: number;
  source_grade_name: string;
  program_id: number;
  program_name: string;
  student_count: number;
  target_grade_id: number | null;
  target_grade_name: string | null;
  target_class_group_id: number | null;
  target_class_group_name: string | null;
  status: "ready" | "no_next_grade" | "no_class_group" | "ambiguous";
}

export interface PromotionResult {
  totalPromoted: number;
  totalSkippedExisting: number;
  promotedGrades: {
    source_grade_name: string;
    target_class_group_name: string;
    promoted: number;
    skipped: number;
  }[];
  skippedGrades: {
    source_grade_name: string;
    reason: string;
    student_count: number;
  }[];
}

export const promotionApi = {
  /** Preview an automatic whole-year promotion (every grade's active
   * students moved into the next grade's class group) before running it --
   * each grade's suggested target can be reviewed/overridden client-side. */
  getPreview: (sourceAcademicYearId: number, targetAcademicYearId: number) =>
    api.get<{ data: PromotionGradePlan[] }>(
      "/academics/students/promotion-preview",
      {
        params: {
          source_academic_year_id: sourceAcademicYearId,
          target_academic_year_id: targetAcademicYearId,
        },
      },
    ),
  execute: (data: {
    source_academic_year_id: number;
    target_academic_year_id: number;
    grade_overrides?: Record<string, number>;
    excluded_grade_ids?: number[];
  }) =>
    api.post<{ data: PromotionResult }>(
      "/academics/students/promote-year",
      data,
    ),
};

// Program Users API
export interface ProgramUser {
  user_id: number;
  username: string;
  email: string;
  phone_number?: string;
  status: string;
  first_name?: string;
  last_name?: string;
  user_type?: string;
  grade_name?: string;
  class_group_name?: string;
}

export const programUsersApi = {
  getByProgram: (
    programId: number,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    },
  ) =>
    api.get<{ data: ProgramUser[] }>(`/academics/programs/${programId}/users`, {
      params,
    }),
};

// Program Leads API
export interface AllProgramLead {
  lead_id: string;
  user_id: number;
  user_name: string;
  username: string;
  program_id: number;
  program_name: string;
  academic_year_id: number;
  academic_year_name: string;
  academic_year_is_current: number;
  assigned_at: string;
}

export const programLeadsApi = {
  getAll: (academicYearId?: number) =>
    api.get<{ data: AllProgramLead[] }>("/academics/program-leads", {
      params: academicYearId ? { academic_year_id: academicYearId } : undefined,
    }),
  assign: (data: {
    user_id: number;
    program_id: number;
    academic_year_id: number;
  }) => api.post("/academics/programs/assign-lead", data),
  remove: (programId: number, userId: number, academicYearId: number) =>
    api.delete(
      `/academics/programs/${programId}/leads/${userId}/years/${academicYearId}`,
    ),
  copy: (data: {
    source_academic_year_id: number;
    target_academic_year_id: number;
  }) =>
    api.post<{ data: { copied: number; skipped: number; total: number } }>(
      "/academics/programs/copy-leads",
      data,
    ),
};
