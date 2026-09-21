import { apiService, API_BASE_URL } from "../services/api";

export type LessonNoteSource = "MANUAL" | "AI_GENERATED" | "AI_ASSISTED" | "PDF_UPLOAD";

/** A note is PDF-backed when it was created from an upload OR simply has a stored file —
 *  the file is the authoritative signal, so a note whose PDF exists never falls back to
 *  the rich editor / HTML reader showing its extracted text as if it were the note. */
export const isPdfBackedNote = (note: {
  source?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  page_count?: number | null;
}): boolean => note.source === "PDF_UPLOAD" || !!note.file_path || !!note.file_name || !!note.page_count;

export interface LessonNoteSummary {
  note_id: number;
  subject_id: number;
  subject_name: string;
  class_group_id: number | null;
  class_group_name: string | null;
  scheme_entry_id: number | null;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  source: LessonNoteSource;
  /** PDF_UPLOAD notes only. */
  file_name: string | null;
  page_count: number | null;
  /** Active (unexpired) shares. 0 means no student can see this note, published or not. */
  share_count: number;
  created_at: string;
  updated_at: string;
}

export interface LessonNoteDetail {
  note_id: number;
  user_id: number;
  subject_id: number;
  class_group_id: number | null;
  scheme_entry_id: number | null;
  academic_term_id: number | null;
  title: string;
  content_json: any;
  content_html: string | null;
  status: "DRAFT" | "PUBLISHED";
  source: LessonNoteSource;
  /** PDF_UPLOAD notes only — the stored file's display metadata. content_html then holds
   *  the text extracted from it (feeds the student AI tutor), not editable HTML. */
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
  /** Active (unexpired) shares. 0 means no student can see this note, published or not. */
  share_count: number;
  scheme_context: {
    entry: {
      entry_id: number;
      week_number: string;
      topic: string;
      sub_topic: string;
      objective: string;
    };
    criteria: { criteria_id: number; criteria_number: string; description: string }[];
  } | null;
}

export interface LessonNoteVersion {
  version_id: number;
  created_by: "USER" | "AI";
  prompt_text: string | null;
  created_at: string;
}

export interface LessonNoteShare {
  share_id: number;
  note_id: number;
  filter_type: "class_group" | "subject_enrolled" | "specific_students";
  filter_ids: number[];
  permission: "VIEW";
  expires_at: string | null;
  created_at: string;
}

export interface AINoteGenerationStatus {
  status: "loading" | "analyzing" | "structuring" | "saving" | "done" | "error";
  stepIndex: number;
  totalSteps: number;
  message: string;
  noteId?: number;
  error?: string;
  /** Which AI provider answered (gemini/groq/glm) — informational, no UI surfaces this yet. */
  providerUsed?: string;
}

export interface PromptPreset {
  preset_id: number;
  label: string;
  prompt_text: string;
  created_at: string;
}

export interface SharedNoteSummary {
  note_id: number;
  title: string;
  subject_name: string;
  teacher_name: string;
  updated_at: string;
  source: LessonNoteSource;
  page_count: number | null;
  /** Plain-text preview of the note body, computed server-side so the list stays light. */
  excerpt: string;
  word_count: number;
  reading_minutes: number;
}

export interface NoteAskAnswer {
  answer_html: string;
  key_points: string[];
  follow_ups: string[];
  /** false when the note itself doesn't cover the question — the UI flags this to the student. */
  grounded: boolean;
  provider_used: string;
}

export interface SharedNoteDetail {
  note_id: number;
  title: string;
  content_html: string;
  status: "PUBLISHED";
  source: LessonNoteSource;
  file_name: string | null;
  page_count: number | null;
  subject_id: number;
  subject_name: string;
  updated_at: string;
}

export const lessonNotesApi = {
  list: (filters?: { subject_id?: number; class_group_id?: number; academic_term_id?: number; status?: string }) =>
    apiService.get<{ data: LessonNoteSummary[] }>("/lesson-notes", { params: filters }),

  create: (data: {
    subject_id: number;
    class_group_id?: number;
    scheme_entry_id?: number;
    academic_term_id?: number;
    title: string;
  }) => apiService.post<{ data: { note_id: number } }>("/lesson-notes", data),

  /** Third creation path: a PDF prepared elsewhere becomes a read-only DRAFT note. */
  createFromPdf: (
    data: {
      subject_id: number;
      class_group_id?: number;
      scheme_entry_id?: number;
      academic_term_id?: number;
      title: string;
    },
    file: File,
    onProgress?: (fraction: number) => void,
  ) => {
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
    });
    form.append("file", file);
    return apiService.post<{ data: { note_id: number; page_count: number; is_textless: boolean } }>(
      "/lesson-notes/upload-pdf",
      form,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e: { loaded: number; total?: number }) => onProgress?.(e.total ? e.loaded / e.total : 0),
      },
    );
  },

  replacePdf: (id: number, file: File, onProgress?: (fraction: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return apiService.post<{ data: { page_count: number; is_textless: boolean } }>(
      `/lesson-notes/${id}/pdf`,
      form,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e: { loaded: number; total?: number }) => onProgress?.(e.total ? e.loaded / e.total : 0),
      },
    );
  },

  /** The stored PDF itself — works for the owning teacher and for students the note reaches. */
  getPdfBlob: (id: number) =>
    apiService.get<Blob>(`/lesson-notes/${id}/pdf/raw`, { responseType: "blob" }),

  get: (id: number) => apiService.get<{ data: LessonNoteDetail }>(`/lesson-notes/${id}`),

  update: (
    id: number,
    data: Partial<{
      title: string;
      content_json: any;
      content_html: string;
      status: "DRAFT" | "PUBLISHED";
      snapshot_prompt: string;
    }>,
  ) => apiService.patch(`/lesson-notes/${id}`, data),

  remove: (id: number) => apiService.delete(`/lesson-notes/${id}`),

  uploadImage: (id: number, file: File) => {
    const form = new FormData();
    form.append("image", file);
    return apiService.post<{ data: { image_id: number; url: string } }>(
      `/lesson-notes/${id}/images`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  },

  startAIGenerate: (data: {
    entry_id?: number;
    competency_id?: number;
    criteria_ids?: number[];
    class_group_id?: number;
    academic_term_id?: number;
    extra_instructions?: string;
  }) =>
    apiService.post<{ data: { jobId: string } }>("/lesson-notes/ai-generate", data),

  getAIGenerateStatus: (jobId: string) =>
    apiService.get<{ data: AINoteGenerationStatus }>(`/lesson-notes/ai-generate/${jobId}/status`),

  proposeAIEdit: (id: number, data: { instruction: string; selection_html?: string; whole_note_html?: string }) =>
    apiService.post<{ data: { html: string } }>(`/lesson-notes/${id}/ai-edit`, data),

  listVersions: (id: number) => apiService.get<{ data: LessonNoteVersion[] }>(`/lesson-notes/${id}/versions`),

  restoreVersion: (id: number, versionId: number) =>
    apiService.post<{ data: { content_json: any } }>(`/lesson-notes/${id}/versions/${versionId}/restore`),

  share: (id: number, data: { filter_type: string; filter_ids: number[]; expires_at?: string | null }) =>
    apiService.post<{ data: { share_id: number } }>(`/lesson-notes/${id}/share`, data),

  listShares: (id: number) => apiService.get<{ data: LessonNoteShare[] }>(`/lesson-notes/${id}/share`),

  revokeShare: (id: number, shareId: number) =>
    apiService.delete(`/lesson-notes/${id}/share/${shareId}`),

  sharedWithMe: () => apiService.get<{ data: SharedNoteSummary[] }>("/lesson-notes/shared-with-me"),

  getShared: (id: number) => apiService.get<{ data: SharedNoteDetail }>(`/lesson-notes/shared-with-me/${id}`),

  askAboutShared: (
    id: number,
    data: {
      question: string;
      selection_text?: string;
      mode?: "explain" | "simplify" | "example" | "define" | "quiz";
      history?: { role: "user" | "assistant"; content: string }[];
    },
  ) => apiService.post<{ data: NoteAskAnswer }>(`/lesson-notes/shared-with-me/${id}/ask`, data),

  exportPdf: (id: number) =>
    apiService.get<Blob>(`/lesson-notes/${id}/export-pdf`, { responseType: "blob" }),

  listPromptPresets: () => apiService.get<{ data: PromptPreset[] }>("/lesson-notes/prompt-presets"),

  savePromptPreset: (data: { label: string; prompt_text: string }) =>
    apiService.post<{ data: PromptPreset }>("/lesson-notes/prompt-presets", data),

  deletePromptPreset: (presetId: number) =>
    apiService.delete(`/lesson-notes/prompt-presets/${presetId}`),
};

/** Images are rendered via plain <img> tags, which can't carry an Authorization
 * header or a cross-site cookie — the backend accepts the same JWT as a query
 * param on this one GET endpoint instead (see backend middleware/auth.ts). */
export const lessonNoteImageUrl = (imageId: number) => {
  const token = localStorage.getItem("token");
  return `${API_BASE_URL}/lesson-notes/images/${imageId}/raw${token ? `?token=${encodeURIComponent(token)}` : ""}`;
};
