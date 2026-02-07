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
  resources: string;
  evaluation: string;
  is_completed: boolean;
  created_at: string;
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
};
