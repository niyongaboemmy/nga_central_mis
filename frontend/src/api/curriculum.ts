import api from "../services/api";

export interface SubjectDetail {
  subject_id: number;
  code: string | null;
  name: string;
  description: string | null;
  color: string;
  max_marks: number | null;
  status: string;
  category_name: string | null;
  competency_count: number;
  document_count: number;
  category_count: number;
}

export interface PerformanceCriteria {
  criteria_id: number;
  competency_id: number;
  criteria_number: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CriteriaSchemeUsage {
  entry_id: number;
  week_number: string;
  topic: string;
  scheme_id: number;
  class_group_name: string | null;
  academic_term_name: string | null;
}

export interface SubjectCompetency {
  competency_id: number;
  subject_id: number;
  user_id: number;
  element_number: number;
  learning_hours: number | null;
  title: string;
  description: string | null;
  indicative_content: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  criteria: PerformanceCriteria[];
}

export interface SubjectDocCategory {
  category_id: number;
  subject_id: number;
  user_id: number;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  document_count: number;
  created_at: string;
  updated_at: string;
}

export interface SubjectDoc {
  document_id: number;
  category_id: number;
  subject_id: number;
  user_id: number;
  competency_id: number | null;
  file_name: string;
  original_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  file_extension: string;
  description: string | null;
  created_at: string;
  category_name: string;
  category_color: string;
  first_name: string | null;
  last_name: string | null;
}

export interface MyEnrolledSubject {
  subject_id: number;
  code: string | null;
  name: string;
  description: string | null;
  color: string;
  category_name: string | null;
  enrolled_at: string;
  competency_count: number;
  document_count: number;
}

export const subjectDetailApi = {
  get: (subjectId: number) =>
    api.get<{ data: SubjectDetail }>(`/curriculum/subjects/${subjectId}/detail`),
};

export const myEnrolledSubjectsApi = {
  getAll: (academicYearId?: number) =>
    api.get<{ data: MyEnrolledSubject[] }>("/curriculum/my-enrolled-subjects", {
      params: academicYearId ? { academic_year_id: academicYearId } : undefined,
    }),
};

export const competenciesApi = {
  getAll: (subjectId: number) =>
    api.get<{ data: SubjectCompetency[] }>(
      `/curriculum/subjects/${subjectId}/competencies`,
    ),
  create: (
    subjectId: number,
    data: {
      title: string;
      description?: string;
      element_number?: number;
      sort_order?: number;
      learning_hours?: number | null;
      indicative_content?: string;
    },
  ) => api.post(`/curriculum/subjects/${subjectId}/competencies`, data),
  update: (
    subjectId: number,
    competencyId: number,
    data: {
      title?: string;
      description?: string;
      element_number?: number;
      sort_order?: number;
      learning_hours?: number | null;
      indicative_content?: string;
    },
  ) =>
    api.put(
      `/curriculum/subjects/${subjectId}/competencies/${competencyId}`,
      data,
    ),
  delete: (subjectId: number, competencyId: number) =>
    api.delete(
      `/curriculum/subjects/${subjectId}/competencies/${competencyId}`,
    ),
  reorder: (subjectId: number, order: number[]) =>
    api.put(`/curriculum/subjects/${subjectId}/competencies/reorder`, {
      order,
    }),
};

export const criteriaApi = {
  create: (
    competencyId: number,
    data: { criteria_number: string; description: string; sort_order?: number },
  ) =>
    api.post(`/curriculum/competencies/${competencyId}/criteria`, data),
  update: (
    criteriaId: number,
    data: {
      criteria_number?: string;
      description?: string;
      sort_order?: number;
    },
  ) => api.put(`/curriculum/criteria/${criteriaId}`, data),
  delete: (criteriaId: number) =>
    api.delete(`/curriculum/criteria/${criteriaId}`),
  /** Reverse lookup: which Scheme of Work entries (across all terms/classes of the given
   * academic year) reference this criterion — lets a reviewer confirm it's actually being
   * taught somewhere. Scoped to academicYearId (defaults server-side to the current year). */
  getSchemeUsage: (criteriaId: number, academicYearId?: number) =>
    api.get<{ data: CriteriaSchemeUsage[] }>(
      `/curriculum/criteria/${criteriaId}/scheme-entries`,
      {
        params: academicYearId ? { academic_year_id: academicYearId } : undefined,
      },
    ),
};

export const subjectDocCategoriesApi = {
  getAll: (subjectId: number) =>
    api.get<{ data: SubjectDocCategory[] }>(
      `/curriculum/subjects/${subjectId}/document-categories`,
    ),
  create: (
    subjectId: number,
    data: { name: string; description?: string; color?: string },
  ) =>
    api.post(`/curriculum/subjects/${subjectId}/document-categories`, data),
  update: (
    categoryId: number,
    data: {
      name?: string;
      description?: string;
      color?: string;
      sort_order?: number;
    },
  ) => api.put(`/curriculum/document-categories/${categoryId}`, data),
  delete: (categoryId: number) =>
    api.delete(`/curriculum/document-categories/${categoryId}`),
};

export const subjectDocumentsApi = {
  getAll: (subjectId: number, categoryId?: number) =>
    api.get<{ data: SubjectDoc[] }>(
      `/curriculum/subjects/${subjectId}/documents`,
      { params: categoryId ? { categoryId } : undefined },
    ),
  // Kept in sync with the server-side caps: backend multer limit
  // (curriculum.ts), file-server multer limit, and nginx client_max_body_size.
  MAX_UPLOAD_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
  upload: (
    subjectId: number,
    formData: FormData,
    onUploadProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ) =>
    api.post(
      `/curriculum/subjects/${subjectId}/documents/upload`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        // The shared axios instance defaults to a 10s timeout, which is fine
        // for JSON calls but was silently aborting any document upload that
        // took longer than that -- exactly what happens with a large file
        // or a slow connection. 0 disables the timeout for this request only.
        timeout: 0,
        signal,
        onUploadProgress: onUploadProgress
          ? (evt) => {
              if (evt.total) {
                onUploadProgress(Math.round((evt.loaded / evt.total) * 100));
              }
            }
          : undefined,
      },
    ),
  delete: (documentId: number) =>
    api.delete(`/curriculum/documents/${documentId}`),
  /** Preview manifest (server PDF / text of slides and documents — Lesson Studio §10). */
  previewManifest: (documentId: number) =>
    api.get(`/curriculum/documents/${documentId}/preview`).then((r: any) => r.data.data),
  previewVariant: (documentId: number, variant: "pdf" | "text") =>
    api.get(`/curriculum/documents/${documentId}/download`, { params: { variant }, responseType: "blob", timeout: 120000 }).then((r: any) => r.data as Blob),
  download: (documentId: number) =>
    api.get(`/curriculum/documents/${documentId}/download`, {
      responseType: "blob",
      timeout: 60000,
    }),
};

// ======================
// AI IMPORT FROM CURRICULUM
// ======================

export interface ImportedCriteriaDraft {
  criteria_number: string;
  description: string;
  _selected: boolean;
}

export interface ImportedElementDraft {
  element_number: number;
  title: string;
  description: string;
  learning_hours: number | null;
  indicative_content: string;
  criteria: ImportedCriteriaDraft[];
  _selected: boolean;
}

export interface ExtractedElement {
  element_number: number;
  title: string;
  description: string;
  learning_hours: number | null;
  indicative_content: string;
  criteria: { criteria_number: string; description: string }[];
}

export interface CurriculumImportStatus {
  status: "parsing" | "analyzing" | "structuring" | "done" | "error";
  stepIndex: number;
  totalSteps: number;
  message: string;
  elements?: ExtractedElement[];
  sourceFilename?: string;
  error?: string;
}

export const curriculumImportApi = {
  start: (subjectId: number, formData: FormData) =>
    api.post<{ data: { jobId: string } }>(
      `/curriculum/subjects/${subjectId}/import/ai-generate`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    ),
  getStatus: (subjectId: number, jobId: string) =>
    api.get<{ data: CurriculumImportStatus }>(
      `/curriculum/subjects/${subjectId}/import/ai-generate/${jobId}/status`,
    ),
  confirm: (
    subjectId: number,
    data: {
      elements: ExtractedElement[];
      jobId?: string;
      source_filename?: string;
    },
  ) =>
    api.post<{ data: { competency_ids: number[]; count: number } }>(
      `/curriculum/subjects/${subjectId}/import/confirm`,
      data,
    ),
};
