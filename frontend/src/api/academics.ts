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
  grades?: Array<{
    grade_id: number;
    grade_name: string;
    program_id: number;
    program_name: string;
  }>;
}

export interface ClassGroup {
  class_group_id: number;
  academic_year_id: number;
  grade_id: number;
  name: string;
}

// Academic Years API
export const academicYearsApi = {
  getAll: () => api.get<{ data: AcademicYear[] }>("/academics/years"),
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
    api.get<{ data: AcademicTerm[] }>("/academics/terms", {
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
    api.post<Subject>("/academics/subjects", data),
  update: (id: number, data: Partial<Omit<Subject, "subject_id">>) =>
    api.put<Subject>(`/academics/subjects/${id}`, data),
  delete: (id: number) => api.delete(`/academics/subjects/${id}`),
};

// Class Groups API
export const classGroupsApi = {
  getAll: (academicYearId?: number, gradeId?: number) =>
    api.get<{ data: ClassGroup[] }>("/academics/class-groups", {
      params: {
        ...(academicYearId && { academic_year_id: academicYearId }),
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
