import type { Blueprint, Estimate, Preset, QuotaRow, RunDetail, RunStatus, RunTask, TaskStatus, WeekBundle } from "../../../api/studio";

/**
 * Pure Lesson Studio logic (no React, no network) — unit-tested in __tests__/studioModel.test.ts.
 */

export type StepId = "weeks" | "sources" | "recipe" | "try" | "generate" | "review";
export const STEPS: { id: StepId; label: string; short: string }[] = [
  { id: "weeks", label: "Choose weeks", short: "Weeks" },
  { id: "sources", label: "Sources", short: "Sources" },
  { id: "recipe", label: "Lesson recipe", short: "Recipe" },
  { id: "try", label: "Try one week", short: "Try" },
  { id: "generate", label: "Generate", short: "Generate" },
  { id: "review", label: "Review & approve", short: "Review" },
];

export const cloneBlueprint = (b: Blueprint): Blueprint => JSON.parse(JSON.stringify(b));

/** Deep-ish merge for nested blueprint patches from the recipe controls. */
export function patchBlueprint(b: Blueprint, patch: DeepPartial<Blueprint>): Blueprint {
  const out: any = cloneBlueprint(b);
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = { ...out[k], ...v };
    else out[k] = v;
  }
  return out;
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends any[] ? T[K] : Partial<T[K]>) : T[K] };

/** Which preset (if any) the current recipe still matches — the menu shows it as selected. */
export function matchingPreset(b: Blueprint, presets: Preset[]): string | null {
  const strip = (x: Blueprint) => JSON.stringify({ ...x, instructions: "", extra_asset_ids: [], sources: null });
  return presets.find((p) => strip(p.config) === strip(b))?.id ?? null;
}

// ---------------------------------------------------------------- weeks

export type WeekFilter = "gaps" | "all" | "from_now" | "custom";

export const weekSelectable = (w: WeekBundle) => !!w.section && (w.readiness.has_topic || w.readiness.has_criteria);

/** A week "has a gap" when it is selectable and not live, or live with uncovered criteria. */
export const weekHasGap = (w: WeekBundle) =>
  weekSelectable(w) && (!w.readiness.is_live || (w.coverage?.gap_criteria_ids.length ?? 0) > 0);

export function selectWeeks(weeks: WeekBundle[], filter: WeekFilter, today = new Date()): number[] {
  const todayIso = today.toISOString().slice(0, 10);
  return weeks
    .filter((w) => {
      if (!weekSelectable(w)) return false;
      if (filter === "all") return true;
      if (filter === "gaps") return weekHasGap(w);
      if (filter === "from_now") return !w.entry.end_date || w.entry.end_date >= todayIso;
      return false;
    })
    .map((w) => w.section!.section_id);
}

/** The week marked "Now" (today falls inside it), else the next one, else the last one. */
export function currentWeek(weeks: WeekBundle[], today = new Date()): WeekBundle | null {
  const t = today.toISOString().slice(0, 10);
  const usable = weeks.filter(weekSelectable);
  return (
    usable.find((w) => w.entry.start_date && w.entry.end_date && w.entry.start_date <= t && t <= w.entry.end_date) ??
    usable.find((w) => w.entry.start_date && w.entry.start_date > t) ??
    usable[usable.length - 1] ??
    null
  );
}

export const WEEK_STATE_LABEL: Record<WeekBundle["readiness"]["state"], string> = {
  EMPTY: "No topic yet",
  TODO: "Needs content",
  DRAFTED: "Has material",
  LIVE: "Live",
};

// ---------------------------------------------------------------- estimate & quota

export function formatEstimate(e: Pick<Estimate, "calls" | "minutes" | "fits_today" | "expected_finish">, now = new Date()): { headline: string; detail: string; tone: "ok" | "wait" } {
  const calls = `${e.calls} AI call${e.calls === 1 ? "" : "s"}`;
  if (e.calls === 0) return { headline: "No AI needed", detail: "Everything is already covered by your own notes.", tone: "ok" };
  if (e.fits_today) return { headline: `${calls} · about ${e.minutes} min`, detail: "Fits in today's free AI quota.", tone: "ok" };
  return { headline: `${calls} · finishes ${relativeTime(e.expected_finish, now)}`, detail: "More than today's free AI quota — it pauses and carries on by itself.", tone: "wait" };
}

export function relativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const mins = Math.round((d.getTime() - now.getTime()) / 60000);
  if (mins <= 1) return "in a minute";
  if (mins < 60) return `in ${mins} min`;
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `today at ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + ` at ${time}`;
}

/** Share of today's free quota left across providers (null = at least one has no daily cap). */
export function quotaLeftPct(quota: QuotaRow[]): number | null {
  if (quota.length === 0) return 0;
  if (quota.some((q) => q.daily_limit === null)) return null;
  const limit = quota.reduce((n, q) => n + (q.daily_limit ?? 0), 0);
  const left = quota.reduce((n, q) => n + (q.remaining ?? 0), 0);
  return limit ? Math.round((left / limit) * 100) : 0;
}

// ---------------------------------------------------------------- run board

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  PLANNED: "Scheduled",
  RUNNING: "Generating",
  PAUSED: "Paused",
  PAUSED_QUOTA: "Waiting for free AI quota",
  READY_FOR_REVIEW: "Ready to review",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

export const isRunActive = (s: RunStatus) => s === "PLANNED" || s === "RUNNING" || s === "PAUSED" || s === "PAUSED_QUOTA";

const KIND_LABEL: Record<string, string> = {
  REUSE_PLACEMENT: "Your notes",
  CORE_LESSON: "Lesson",
  ASSESSMENT_PACK: "Questions",
};
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

const SKIP_LABEL: Record<string, string> = {
  COVERED_BY_EXISTING: "Your notes already cover it",
  UNCHANGED: "Unchanged — kept the draft",
  NO_CURRICULUM: "No topic or criteria",
  NOTHING_TO_PLACE: "No matching notes",
  NO_GAPS: "Nothing missing",
  REUSE_OFF: "Off",
  NOT_IN_RECIPE: "Not in the recipe",
  DEPENDENCY_FAILED: "Skipped (an earlier step failed)",
};
export const skipLabel = (r: string | null) => (r ? SKIP_LABEL[r] ?? r : "Skipped");

/** One stage label per week card, from its tasks: what a teacher would say. */
export type WeekStage = "queued" | "reading" | "writing" | "questions" | "ready" | "failed" | "skipped" | "waiting";
export function weekStage(tasks: Pick<RunTask, "kind" | "status">[], runStatus?: RunStatus): WeekStage {
  if (tasks.length === 0) return "skipped";
  if (tasks.some((t) => t.status === "FAILED")) return "failed";
  const running = tasks.find((t) => t.status === "RUNNING");
  if (running) return running.kind === "REUSE_PLACEMENT" ? "reading" : running.kind === "CORE_LESSON" ? "writing" : "questions";
  if (tasks.every((t) => t.status === "SUCCEEDED" || t.status === "SKIPPED" || t.status === "CANCELLED" || t.status === "DISMISSED")) {
    return tasks.some((t) => t.status === "SUCCEEDED") ? "ready" : "skipped";
  }
  if (runStatus === "PAUSED_QUOTA") return "waiting";
  return "queued";
}

export const STAGE_LABEL: Record<WeekStage, string> = {
  queued: "Queued",
  reading: "Reading your sources",
  writing: "Writing the lesson",
  questions: "Writing & checking questions",
  ready: "Ready to review",
  failed: "Needs a retry",
  skipped: "Nothing to do",
  waiting: "Waiting for free quota",
};

/** Progress of a run, 0–100, counting finished tasks. */
export function runProgress(totals: Partial<Record<TaskStatus, number>>): number {
  const all = Object.values(totals).reduce((n, v) => n + (v ?? 0), 0);
  if (!all) return 0;
  const done = (totals.SUCCEEDED ?? 0) + (totals.SKIPPED ?? 0) + (totals.FAILED ?? 0) + (totals.CANCELLED ?? 0) + (totals.DISMISSED ?? 0);
  return Math.round((done / all) * 100);
}

/** Applies an SSE task event to a loaded run without refetching (status only). */
export function applyTaskEvent(run: RunDetail, e: { task_id?: number; status: string }): RunDetail {
  if (!e.task_id) return run;
  let changed = false;
  const weeks = run.weeks.map((w) => {
    if (!w.tasks.some((t) => t.task_id === e.task_id)) return w;
    changed = true;
    return { ...w, tasks: w.tasks.map((t) => (t.task_id === e.task_id ? { ...t, status: e.status as TaskStatus } : t)) };
  });
  if (!changed) return run;
  const totals: Partial<Record<TaskStatus, number>> = {};
  for (const w of weeks) for (const t of w.tasks) totals[t.status] = (totals[t.status] ?? 0) + 1;
  return { ...run, weeks, run: { ...run.run, totals } };
}

// ---------------------------------------------------------------- review

const FLAG_TONE: Record<string, "warn" | "info"> = {
  KEY_CORRECTED: "warn",
  WRONG_KEY: "warn",
  AMBIGUOUS: "warn",
  UNSUPPORTED_BY_SOURCE: "warn",
  OFF_CRITERIA: "warn",
  NEEDS_LINK: "warn",
  EMPTY: "warn",
  UNCITED: "info",
  NOT_CROSS_CHECKED: "info",
  DROPPED_INVALID: "info",
  DROPPED_AMBIGUOUS: "info",
};
export const flagTone = (kind: string) => FLAG_TONE[kind] ?? "info";

/** A week can be approved in one tap when no draft carries a warning. */
export const weekIsClean = (drafts: { review_flags: { kind: string }[] }[]) =>
  drafts.length > 0 && drafts.every((d) => (d.review_flags || []).every((f) => flagTone(f.kind) !== "warn"));

/** Review keyboard map (§9.2 step 6). */
export const REVIEW_KEYS: Record<string, "next" | "prev" | "approve" | "edit" | "regenerate"> = {
  j: "next",
  ArrowDown: "next",
  k: "prev",
  ArrowUp: "prev",
  a: "approve",
  e: "edit",
  r: "regenerate",
};

/** What the student's phone will show for a recipe, before any AI call (the live preview). */
export function previewBlocks(
  b: Blueprint,
  features: { flashcards: boolean; exit_ticket: boolean } = { flashcards: true, exit_ticket: true },
): { key: string; label: string; detail: string }[] {
  const out: { key: string; label: string; detail: string }[] = [];
  if (b.lesson.enabled) {
    const words = b.lesson.length === "SHORT" ? "≈ 5 min read" : b.lesson.length === "STANDARD" ? "≈ 10 min read" : "≈ 20 min read";
    out.push({ key: "lesson", label: "Lesson", detail: `${words}${b.lesson.interactive_breaks ? ` · ${b.lesson.interactive_breaks} interactive break${b.lesson.interactive_breaks > 1 ? "s" : ""}` : ""}${b.lesson.worked_example ? " · worked example" : ""}` });
  }
  if (b.practical_task.enabled) out.push({ key: "practical", label: "Practical task", detail: "Steps, safety, success checklist" });
  if (b.video_slot.enabled) out.push({ key: "video", label: "Video", detail: "Your YouTube link + “watch for” prompts" });
  if (b.flashcards.enabled && features.flashcards) out.push({ key: "cards", label: "Flashcards", detail: `${b.flashcards.cards} key terms` });
  if (b.knowledge_check.enabled) out.push({ key: "check", label: "Knowledge check", detail: `${b.knowledge_check.questions} questions · ${b.knowledge_check.difficulty.toLowerCase()}` });
  if (b.exit_ticket.enabled && features.exit_ticket) out.push({ key: "exit", label: "Exit ticket", detail: `${b.exit_ticket.questions} question${b.exit_ticket.questions > 1 ? "s" : ""} + confidence` });
  return out;
}
