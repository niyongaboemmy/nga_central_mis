import { apiService, API_BASE_URL } from "../services/api";
import type { CourseHeader, CriterionChip, CourseItemType } from "./elearning";

/**
 * Lesson Studio API (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §13). Long work is a
 * run on the server: endpoints answer at once (202) and progress arrives over SSE, with
 * polling as the fallback — never a long-held request.
 */

type Data<T> = { success: boolean; message: string; data: T };

export type LessonLength = "SHORT" | "STANDARD" | "FULL";
export type Difficulty = "EASY" | "MIXED" | "CHALLENGING";

export interface Blueprint {
  version: 1;
  reuse_existing_notes: boolean;
  sources: { lesson_plans: boolean; my_notes: boolean; subject_materials: boolean; previous_weeks: boolean };
  extra_asset_ids: number[];
  lesson: { enabled: boolean; length: LessonLength; interactive_breaks: number; worked_example: boolean };
  practical_task: { enabled: boolean };
  video_slot: { enabled: boolean };
  knowledge_check: { enabled: boolean; questions: number; difficulty: Difficulty };
  flashcards: { enabled: boolean; cards: number };
  exit_ticket: { enabled: boolean; questions: number };
  style: {
    language: "en" | "fr";
    reading_level: "L3" | "L4" | "L5";
    tone: "FRIENDLY" | "FORMAL";
    local_examples: boolean;
    kinyarwanda_glossary: boolean;
    strict_accuracy: boolean;
  };
  instructions: string;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  config: Blueprint;
}

export interface SavedBlueprint {
  blueprint_id: number;
  owner_user_id: number;
  name: string;
  visibility: "PRIVATE" | "DEPARTMENT" | "SCHOOL";
  config: Blueprint;
  updated_at: string;
}

export type WeekState = "EMPTY" | "TODO" | "DRAFTED" | "LIVE";

export interface WeekBundle {
  entry: { entry_id: number; week_number: string | null; start_date: string | null; end_date: string | null; topic: string | null; sub_topic: string | null; objective: string | null };
  competency: { competency_id: number; element_number: number | null; title: string } | null;
  criteria: { criteria_id: number; criteria_number: string; description: string }[];
  lesson_plans: { lesson_id: number; session_code: string | null; lesson_date: string | null; big_question: string | null }[];
  notes: { note_id: number; title: string; status: string; source: string; is_pdf: boolean; placed_item_id: number | null }[];
  materials: { document_id: number; original_name: string }[];
  section: { section_id: number; status: string; unlock_at: string | null; items: number; published_items: number; pending_review: number } | null;
  coverage: { targets: number; covered: number; gap_criteria_ids: number[] } | null;
  readiness: { has_topic: boolean; has_criteria: boolean; has_plan: boolean; has_note: boolean; has_items: boolean; is_live: boolean; state: WeekState };
}

export interface QuotaRow {
  provider: string;
  daily_limit: number | null;
  used_today: number;
  remaining: number | null;
  bulk_remaining: number | null;
  resets_at: string;
}

export type RunStatus = "PLANNED" | "RUNNING" | "PAUSED" | "PAUSED_QUOTA" | "READY_FOR_REVIEW" | "COMPLETED" | "CANCELLED" | "FAILED";
export type RunMode = "PREVIEW" | "FULL" | "SINGLE_WEEK" | "REGENERATE_ITEM";
export type TaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED" | "CANCELLED" | "DISMISSED";
export type ArtifactKind = "REUSE_PLACEMENT" | "CORE_LESSON" | "ASSESSMENT_PACK";

export interface RunSummary {
  run_id: number;
  course_id: number;
  mode: RunMode;
  status: RunStatus;
  section_ids: number[];
  estimate: Partial<Estimate> | null;
  not_before: string | null;
  paused_reason: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

/** A run as the course page lists it: progress counts and the next automatic re-run, no detail. */
export interface RunListItem extends RunSummary {
  totals: Partial<Record<TaskStatus, number>>;
  next_retry_at: string | null;
}
export interface RunList {
  runs: RunListItem[];
  /** AI drafts in the whole course still waiting for the teacher. */
  pending_review: number;
}

export interface StudioData extends CourseHeader {
  weeks: WeekBundle[];
  active_runs: number[];
  recent_runs: RunSummary[];
  quota: QuotaRow[];
  ai_configured: boolean;
  features: { flashcards: boolean; exit_ticket: boolean };
  presets: Preset[];
  blueprints: SavedBlueprint[];
}

export interface Estimate {
  weeks: number;
  calls: number;
  calls_by_role: { draft: number; assess: number; verify: number };
  minutes: number;
  fits_today: boolean;
  expected_finish: string;
  skipped: { section_id: number; title: string; reason: string }[];
  quota: QuotaRow[];
  weeks_planned: { section_id: number; title: string; calls: number; notes: string[] }[];
}

export interface ContextPackInfo {
  hash: string;
  approx_tokens: number;
  truncated: boolean;
  criteria: { criteria_id: number; criteria_number: string; description: string }[];
  sources: { ref: string; kind: string; id: number | null; title: string; tokens: number; truncated: boolean }[];
}

export interface ReviewFlag {
  kind: string;
  note: string;
  target_id?: string;
}

export interface DraftItem {
  item_id: number;
  item_type: CourseItemType;
  title: string;
  ai_origin: "NONE" | "AI_GENERATED" | "AI_ASSISTED";
  review_state: "PENDING_REVIEW" | "EDITED";
  review_flags: ReviewFlag[];
  source_refs: {
    sources?: { ref: string; kind: string; id: number | null; title: string }[];
    sections?: { heading: string; refs: string[] }[];
    key_terms?: { term: string; definition: string; gloss_rw?: string }[];
    questions?: Record<string, { refs: string[]; criteria: string | null }>;
    verified_by?: string | null;
  } | null;
  ref_id: number | null;
  external_url: string | null;
  content_json: any;
  criteria: CriterionChip[];
}

export interface RunTask {
  task_id: number;
  kind: ArtifactKind;
  status: TaskStatus;
  skip_reason: string | null;
  attempts: number;
  provider_used: string | null;
  output_digest: Record<string, any> | null;
  error: string | null;
  not_before: string | null;
}

export interface RunWeek {
  section_id: number;
  title: string;
  week_number: string | null;
  start_date: string | null;
  status: string;
  criteria: CriterionChip[];
  coverage: { targets: number; covered: number; gaps: string[] };
  tasks: RunTask[];
  drafts: DraftItem[];
  pending_review: number;
}

export interface RunDetail {
  run: RunSummary & { blueprint: Blueprint; totals: Partial<Record<TaskStatus, number>> };
  weeks: RunWeek[];
}

export interface RunEvent {
  type: "hello" | "task" | "run";
  run_id: number;
  task_id?: number;
  section_id?: number;
  kind?: string;
  status: string;
  detail?: Record<string, any> | null;
}

export const studioApi = {
  studio: (courseId: number) => apiService.get<Data<StudioData>>(`/elearning/courses/${courseId}/studio`),
  presets: () => apiService.get<Data<{ presets: Preset[]; blueprints: SavedBlueprint[] }>>("/elearning/studio/presets"),
  saveBlueprint: (body: { name: string; config: Blueprint; visibility?: SavedBlueprint["visibility"]; subject_id?: number }, id?: number) =>
    id ? apiService.patch<Data<{ blueprint_id: number }>>(`/elearning/blueprints/${id}`, body) : apiService.post<Data<{ blueprint_id: number }>>("/elearning/blueprints", body),
  deleteBlueprint: (id: number) => apiService.delete(`/elearning/blueprints/${id}`),
  contextPack: (sectionId: number, sources: Blueprint["sources"], assetIds: number[] = []) =>
    apiService.get<Data<ContextPackInfo>>(`/elearning/sections/${sectionId}/context-pack`, {
      params: { ...Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v ? 1 : 0])), asset_ids: assetIds.join(",") || undefined },
    }),
  estimate: (courseId: number, body: { blueprint: Blueprint; section_ids: number[]; mode?: RunMode }) =>
    apiService.post<Data<Estimate>>(`/elearning/courses/${courseId}/generation/estimate`, body),
  start: (courseId: number, body: { blueprint: Blueprint; section_ids: number[]; mode: RunMode; start?: "now" | "tonight" }) =>
    apiService.post<Data<{ run_id: number; estimate: Omit<Estimate, "weeks_planned"> }>>(`/elearning/courses/${courseId}/generation/runs`, body),
  run: (runId: number) => apiService.get<Data<RunDetail>>(`/elearning/generation/runs/${runId}`),
  runs: (courseId: number) => apiService.get<Data<RunList>>(`/elearning/courses/${courseId}/generation/runs`),
  control: (runId: number, action: "pause" | "resume" | "cancel" | "retry-failed") =>
    apiService.post<Data<RunDetail>>(`/elearning/generation/runs/${runId}/${action}`),
  approve: (sectionId: number, body: { item_ids?: number[]; publish_section?: boolean }) =>
    apiService.post<Data<{ approved: number[]; needs_attention: { item_id: number; title: string; reason: string }[]; section_status: string }>>(
      `/elearning/sections/${sectionId}/drafts/approve`,
      body,
    ),
  dismiss: (itemId: number) => apiService.post(`/elearning/items/${itemId}/dismiss-draft`),
  regenerate: (itemId: number, instruction: string) =>
    apiService.post<Data<{ run_id: number }>>(`/elearning/items/${itemId}/regenerate`, { instruction }),
  streamUrl: (runId: number, token: string) => `${API_BASE_URL}/elearning/generation/runs/${runId}/stream?token=${encodeURIComponent(token)}`,
  /** Reference files the AI reads for a run (not shown to students). */
  uploadReferenceFiles: (courseId: number, files: File[], onProgress?: (pct: number) => void) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return apiService.post<Data<{ assets: { asset_id: number; name: string; kind: string; size: number; preview_status: string }[]; rejected: { name: string; reason: string }[] }>>(
      `/elearning/courses/${courseId}/reference-files`,
      form,
      { timeout: 0, headers: { "Content-Type": "multipart/form-data" }, onUploadProgress: (e: any) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0), validateStatus: (s: number) => s < 500 },
    );
  },
  fileManifest: (assetId: number) => apiService.get<Data<{ asset_id: number; preview_status: string; variants: { text: boolean }; page_count: number | null }>>(`/elearning/files/${assetId}`),
  aiUsage: (days = 14) => apiService.get<Data<any>>("/elearning/admin/ai-usage", { params: { days } }),
};

export const studioRoutes = {
  studio: (courseId: number, opts: { run?: number; week?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.run) q.set("run", String(opts.run));
    if (opts.week) q.set("week", String(opts.week));
    const s = q.toString();
    return `/elearning/courses/${courseId}/studio${s ? `?${s}` : ""}`;
  },
};
