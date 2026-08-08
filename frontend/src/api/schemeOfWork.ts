import { apiService } from "../services/api";
import { ExtractedElement } from "./curriculum";

export interface LinkedCriteria {
  criteria_id: number;
  criteria_number: string;
  description: string;
}

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
  /** Curriculum Performance Criteria this entry has been linked to (AI-suggested or manual). */
  criteria?: LinkedCriteria[];
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

export interface AIGenerationStatus {
  status:
    | "parsing"
    | "extracting_curriculum"
    | "analyzing"
    | "structuring"
    | "saving"
    | "done"
    | "error";
  stepIndex: number;
  totalSteps: number;
  message: string;
  schemeId?: number;
  entriesCount?: number;
  error?: string;
  /** Set when curriculum generation was requested and ran (subject had none) — the caller must
   * show the review/confirm step (CurriculumExtractionPreview) before it's saved. */
  proposedCurriculum?: ExtractedElement[];
  curriculumSubjectHadNone?: boolean;
  /** Criteria numbers the AI attached to each generated week, keyed by week_number — only present
   * alongside proposedCurriculum; resolve via schemeOfWorkApi.linkCriteria once confirmed. */
  entryCriteriaNumbers?: Record<string, string[]>;
  /** Set when the subject already had Curriculum — criteria links were resolved & saved already. */
  autoTaggedCriteriaCount?: number;
}

export interface DetectedContentItem {
  index: number;
  text: string;
}

export interface DetectedLearningOutcome {
  loNumber: number;
  title: string;
  hours: number | null;
  contentItems: DetectedContentItem[];
}

export interface CurriculumStructurePreview {
  hasStructure: boolean;
  los: DetectedLearningOutcome[];
  autoSelectedLoNumbers: number[];
  termOrdinal: number | null;
  totalTermsInYear: number | null;
}

export interface EntryAISuggestion {
  topic: string;
  sub_topic?: string;
  objective: string;
  methodology: string;
  resources: string;
  evaluation: string;
  learning_place?: string;
  observation?: string;
  duration?: string;
}

export const DEFAULT_ENTRY_PROMPT_TEMPLATE =
  "Act as an experienced teacher of this subject. Generate a professional scheme of work entry for this week " +
  "covering: [describe the topic/focus for this week here].\n\n" +
  "Make sure to cover: the indicative content, a clear learning objective, the teaching methodology/activities, " +
  "resources needed, and how you'll evaluate understanding.";

export const schemeOfWorkApi = {
  upload: (formData: FormData) =>
    apiService.post("/scheme-of-work/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  startAIGenerate: (formData: FormData) =>
    apiService.post<{ success: boolean; data: { jobId: string } }>(
      "/scheme-of-work/ai-generate",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    ),

  getAIGenerateStatus: (jobId: string) =>
    apiService.get<{ success: boolean; data: AIGenerationStatus }>(
      `/scheme-of-work/ai-generate/${jobId}/status`,
    ),

  getCurriculumStructure: (formData: FormData) =>
    apiService.post<{ success: boolean; data: CurriculumStructurePreview }>(
      "/scheme-of-work/ai-generate/structure",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    ),

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

  insertEntry: (
    data: Partial<SchemeEntry> & {
      subject_id: number;
      class_group_id: number;
      academic_term_id: number;
      after_entry_id?: number | null;
    },
  ) =>
    apiService.post<{
      success: boolean;
      data: { entry_id: number; entries_count: number };
    }>("/scheme-of-work/entries/insert", data),

  suggestEntryContent: (data: {
    subject_name?: string;
    week_label?: string;
    prompt: string;
  }) =>
    apiService.post<{ success: boolean; data: EntryAISuggestion }>(
      "/scheme-of-work/entries/ai-suggest",
      data,
    ),

  updateEntry: (id: number, data: Partial<SchemeEntry>) =>
    apiService.patch(`/scheme-of-work/entries/${id}`, data),

  deleteEntry: (id: number) =>
    apiService.delete(`/scheme-of-work/entries/${id}`),

  /** AI-powered matching (stateless) between an entry's free-text content and the subject's
   * Curriculum Performance Criteria — see CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md §4. */
  suggestEntryCriteria: (data: {
    subject_id: number;
    topic?: string;
    sub_topic?: string;
    objective?: string;
    methodology?: string;
  }) =>
    apiService.post<{ success: boolean; data: { criteria: LinkedCriteria[] } }>(
      "/scheme-of-work/entries/suggest-criteria",
      data,
    ),

  /** Replaces the full set of Performance Criteria linked to an entry (manual save/correction). */
  updateEntryCriteria: (entryId: number, criteriaIds: number[]) =>
    apiService.put<{ success: boolean; data: { criteria_ids: number[] } }>(
      `/scheme-of-work/entries/${entryId}/criteria`,
      { criteria_ids: criteriaIds },
    ),

  /** Resolves criteria_numbers proposed at AI-generation time into real links, once the subject's
   * Curriculum has been confirmed/saved after being proposed alongside generation. */
  linkCriteria: (
    schemeId: number,
    data: { subjectId: number; entryCriteriaNumbers: Record<string, string[]> },
  ) =>
    apiService.post<{ success: boolean; data: { linkedCount: number } }>(
      `/scheme-of-work/schemes/${schemeId}/link-criteria`,
      data,
    ),

  /** On-demand bulk AI matching for an already-existing scheme — one Gemini call covers every
   * (by default, untagged) entry. Pass overwrite:true to re-match entries that already have links. */
  bulkSuggestCriteria: (schemeId: number, overwrite?: boolean) =>
    apiService.post<{
      success: boolean;
      data: { taggedCount: number; entriesProcessed: number };
    }>(`/scheme-of-work/schemes/${schemeId}/bulk-suggest-criteria`, { overwrite }),

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
