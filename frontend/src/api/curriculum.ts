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

export interface SubjectCompetency {
  competency_id: number;
  subject_id: number;
  user_id: number;
  element_number: number;
  title: string;
  description: string | null;
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

export const subjectDetailApi = {
  get: (subjectId: number) =>
    api.get<{ data: SubjectDetail }>(`/curriculum/subjects/${subjectId}/detail`),
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
  upload: (subjectId: number, formData: FormData) =>
    api.post(
      `/curriculum/subjects/${subjectId}/documents/upload`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    ),
  delete: (documentId: number) =>
    api.delete(`/curriculum/documents/${documentId}`),
  download: (documentId: number) =>
    api.get(`/curriculum/documents/${documentId}/download`, {
      responseType: "blob",
      timeout: 60000,
    }),
};
