import { apiService } from "../services/api";

export interface SchemeEntry {
  entry_id: number;
  scheme_id: number;
  week_number: string;
  start_date: string;
  end_date: string;
  topic: string;
  sub_topic: string;
  objective: string;
  methodology: string;
  duration?: string;
  learning_place?: string;
  observation?: string;
  resources: string;
  evaluation: string;
  is_completed: boolean | number;
  validation_status: "PENDING" | "APPROVED" | "REJECTED";
  validation_comment: string | null;
  created_at: string;
}

export interface TeacherSchemeRecord {
  subject_id: number;
  subject_name: string;
  subject_code: string | null;
  subject_color: string | null;
  class_group_id: number;
  class_group_name: string;
  academic_term_id: number;
  academic_term_name: string;
  academic_year_name: string;
  scheme_id: number | null;
  status: "submitted" | "pending";
  entries_count: number;
  validation_status: "PENDING" | "APPROVED" | "REJECTED";
  validation_comment: string | null;
  submitted_at: string | null;
  updated_at: string | null;
}

export interface TeacherWithSchemes {
  user_id: number;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  user_type: string | null;
  full_name: string;
  schemes: TeacherSchemeRecord[];
  total_subjects: number;
  submitted_count: number;
  pending_count: number;
  overall_status: "submitted" | "partial" | "pending";
}

export const schemeOfWorkApi = {
  upload: (formData: FormData) =>
    apiService.post("/scheme-of-work/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getEntries: (
    subjectId: number,
    classGroupId: number,
    academicTermId: number,
  ) =>
    apiService.get("/scheme-of-work/entries", {
      params: {
        subject_id: subjectId,
        class_group_id: classGroupId,
        academic_term_id: academicTermId,
      },
    }),

  addEntry: (
    data: Partial<SchemeEntry> & {
      subject_id: number;
      class_group_id: number;
      academic_term_id: number;
    },
  ) => apiService.post("/scheme-of-work/entries", data),

  updateEntry: (id: number, data: Partial<SchemeEntry>) =>
    apiService.patch(`/scheme-of-work/entries/${id}`, data),

  deleteEntry: (id: number) =>
    apiService.delete(`/scheme-of-work/entries/${id}`),

  getAllTeachers: (params: {
    academic_year_id: number;
    academic_term_id: number;
    program_id: number;
    grade_id: number;
    role?: string;
  }) =>
    apiService.get<{ success: boolean; data: TeacherWithSchemes[] }>(
      "/scheme-of-work/all-teachers",
      { params },
    ),
  validateScheme: (entry_ids: number[], status: "APPROVED" | "REJECTED", comment?: string) =>
    apiService.post("/scheme-of-work/validate", {
      entry_ids,
      status,
      comment,
    }),
};
