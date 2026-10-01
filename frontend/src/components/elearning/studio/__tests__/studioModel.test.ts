import { describe, it, expect } from "vitest";
import type { Blueprint, Preset, RunDetail, WeekBundle } from "../../../../api/studio";
import {
  autoRetry,
  termReadiness,
  runBanner,
  applyTaskEvent,
  currentWeek,
  formatEstimate,
  matchingPreset,
  patchBlueprint,
  previewBlocks,
  quotaLeftPct,
  runProgress,
  selectWeeks,
  weekIsClean,
  weekStage,
} from "../studioModel";

const bp: Blueprint = {
  version: 1,
  reuse_existing_notes: true,
  sources: { lesson_plans: true, my_notes: true, subject_materials: true, previous_weeks: true },
  extra_asset_ids: [],
  lesson: { enabled: true, length: "STANDARD", interactive_breaks: 2, worked_example: true },
  practical_task: { enabled: false },
  video_slot: { enabled: false },
  knowledge_check: { enabled: true, questions: 6, difficulty: "MIXED" },
  flashcards: { enabled: false, cards: 8 },
  exit_ticket: { enabled: false, questions: 2 },
  style: { language: "en", reading_level: "L4", tone: "FRIENDLY", local_examples: true, kinyarwanda_glossary: false, strict_accuracy: false },
  instructions: "",
};

const week = (id: number, o: Partial<{ topic: string | null; start: string; end: string; live: boolean; gaps: number[]; criteria: number }>): WeekBundle => ({
  entry: { entry_id: id, week_number: `Week ${id}`, start_date: o.start ?? null, end_date: o.end ?? null, topic: o.topic === undefined ? `Topic ${id}` : o.topic, sub_topic: null, objective: null },
  competency: null,
  criteria: Array.from({ length: o.criteria ?? 1 }, (_, i) => ({ criteria_id: i + 1, criteria_number: `1.${i + 1}`, description: "" })),
  lesson_plans: [],
  notes: [],
  materials: [],
  section: { section_id: 100 + id, status: o.live ? "PUBLISHED" : "SCHEDULED", unlock_at: null, items: o.live ? 1 : 0, published_items: o.live ? 1 : 0, pending_review: 0 },
  coverage: { targets: 1, covered: o.gaps?.length ? 0 : 1, gap_criteria_ids: o.gaps ?? [] },
  readiness: { has_topic: o.topic !== null, has_criteria: (o.criteria ?? 1) > 0, has_plan: false, has_note: false, has_items: !!o.live, is_live: !!o.live, state: o.live ? "LIVE" : "TODO" },
});

describe("studioModel", () => {
  it("selects weeks by filter: gaps skips complete live weeks, never picks weeks with no curriculum", () => {
    const weeks = [
      week(1, { live: true }), // live, no gaps → not a gap
      week(2, { live: true, gaps: [2] }), // live but missing a criterion → gap
      week(3, {}), // not live → gap
      week(4, { topic: null, criteria: 0 }), // nothing to generate from
    ];
    expect(selectWeeks(weeks, "gaps")).toEqual([102, 103]);
    expect(selectWeeks(weeks, "all")).toEqual([101, 102, 103]);
  });

  it("from-now keeps weeks that haven't ended", () => {
    const weeks = [week(1, { start: "2026-09-01", end: "2026-09-05" }), week(2, { start: "2026-10-05", end: "2026-10-09" })];
    expect(selectWeeks(weeks, "from_now", new Date("2026-10-01T10:00:00Z"))).toEqual([102]);
  });

  it("finds the current week, else the next one", () => {
    const weeks = [week(1, { start: "2026-09-28", end: "2026-10-02" }), week(2, { start: "2026-10-05", end: "2026-10-09" })];
    expect(currentWeek(weeks, new Date("2026-10-01T10:00:00Z"))?.entry.entry_id).toBe(1);
    expect(currentWeek(weeks, new Date("2026-10-03T10:00:00Z"))?.entry.entry_id).toBe(2);
  });

  it("patches nested recipe fields without losing siblings, and recognises presets", () => {
    const next = patchBlueprint(bp, { lesson: { length: "SHORT" } });
    expect(next.lesson).toEqual({ ...bp.lesson, length: "SHORT" });
    expect(bp.lesson.length).toBe("STANDARD"); // immutable
    const presets: Preset[] = [{ id: "full", name: "Full", description: "", config: bp }];
    expect(matchingPreset({ ...bp, instructions: "anything" }, presets)).toBe("full");
    expect(matchingPreset(next, presets)).toBeNull();
  });

  it("words the estimate for teachers: fits today, or finishes later by itself", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(formatEstimate({ calls: 6, minutes: 2, fits_today: true, expected_finish: now.toISOString() }, now)).toMatchObject({ tone: "ok", detail: expect.stringContaining("today") });
    const later = formatEstimate({ calls: 60, minutes: 12, fits_today: false, expected_finish: "2026-10-02T08:30:00Z" }, now);
    expect(later.tone).toBe("wait");
    expect(later.headline).toContain("tomorrow");
    expect(formatEstimate({ calls: 0, minutes: 0, fits_today: true, expected_finish: now.toISOString() }, now).headline).toBe("No AI needed");
  });

  it("reports quota left, or null when a provider has no daily cap", () => {
    expect(quotaLeftPct([{ provider: "gemini", daily_limit: 20, used_today: 15, remaining: 5, bulk_remaining: 0, resets_at: "" }])).toBe(25);
    expect(quotaLeftPct([{ provider: "glm", daily_limit: null, used_today: 3, remaining: null, bulk_remaining: null, resets_at: "" }])).toBeNull();
  });

  it("derives one stage per week card from its tasks", () => {
    expect(weekStage([{ kind: "CORE_LESSON", status: "RUNNING" }])).toBe("writing");
    expect(weekStage([{ kind: "CORE_LESSON", status: "SUCCEEDED" }, { kind: "ASSESSMENT_PACK", status: "RUNNING" }])).toBe("questions");
    expect(weekStage([{ kind: "CORE_LESSON", status: "SUCCEEDED" }, { kind: "ASSESSMENT_PACK", status: "SKIPPED" }])).toBe("ready");
    expect(weekStage([{ kind: "CORE_LESSON", status: "QUEUED" }], "PAUSED_QUOTA")).toBe("waiting");
    expect(weekStage([{ kind: "CORE_LESSON", status: "FAILED" }])).toBe("failed");
  });

  it("applies a task event to the loaded run and recounts totals", () => {
    const run = {
      run: { totals: { QUEUED: 1, SUCCEEDED: 1 } },
      weeks: [{ section_id: 1, tasks: [{ task_id: 7, kind: "CORE_LESSON", status: "QUEUED" }, { task_id: 8, kind: "REUSE_PLACEMENT", status: "SUCCEEDED" }] }],
    } as unknown as RunDetail;
    const next = applyTaskEvent(run, { task_id: 7, status: "RUNNING" });
    expect(next.weeks[0].tasks[0].status).toBe("RUNNING");
    expect(next.run.totals).toEqual({ RUNNING: 1, SUCCEEDED: 1 });
    expect(applyTaskEvent(run, { task_id: 999, status: "RUNNING" })).toBe(run);
    expect(runProgress({ SUCCEEDED: 2, SKIPPED: 1, QUEUED: 1 })).toBe(75);
  });

  it("a week is 'clean' only when no draft carries a warning", () => {
    expect(weekIsClean([{ review_flags: [{ kind: "UNCITED" }] }, { review_flags: [] }])).toBe(true);
    expect(weekIsClean([{ review_flags: [{ kind: "KEY_CORRECTED" }] }])).toBe(false);
    expect(weekIsClean([])).toBe(false);
  });

  it("previews what the student's phone will show for a recipe", () => {
    const blocks = previewBlocks(patchBlueprint(bp, { video_slot: { enabled: true }, exit_ticket: { enabled: true } }));
    expect(blocks.map((b) => b.key)).toEqual(["lesson", "video", "check", "exit"]);
  });
});

describe("background runs: course-page banner and automatic re-runs", () => {
  const now = new Date("2026-10-01T10:00:00Z");
  const base = { mode: "FULL" as const, not_before: null, section_ids: [1, 2, 3], next_retry_at: null };

  it("a running run shows progress and that it is on the server", () => {
    const b = runBanner({ runs: [{ ...base, run_id: 7, status: "RUNNING", totals: { SUCCEEDED: 3, QUEUED: 4, RUNNING: 1 } }], pending_review: 2 }, now)!;
    expect(b).toMatchObject({ run_id: 7, tone: "working", action: "open" });
    expect(b.title).toMatch(/drafting 3 weeks on the server/);
    expect(b.detail).toMatch(/3 of 8 parts done/);
    expect(b.progress).toBeGreaterThan(0);
  });

  it("says when a failing part re-runs by itself, and when a quota pause carries on", () => {
    const retry = runBanner({ runs: [{ ...base, run_id: 7, status: "RUNNING", next_retry_at: "2026-10-01T11:00:00Z", totals: { SUCCEEDED: 5, QUEUED: 1 } }], pending_review: 0 }, now)!;
    expect(retry.detail).toMatch(/re-runs by itself/);
    const quota = runBanner({ runs: [{ ...base, run_id: 8, status: "PAUSED_QUOTA", not_before: "2026-10-01T10:30:00Z", totals: { QUEUED: 6 } }], pending_review: 0 }, now)!;
    expect(quota).toMatchObject({ tone: "waiting", title: "Waiting for free AI quota" });
    expect(quota.detail).toMatch(/continues by itself in 30 min/);
  });

  it("after the run: failed parts first (re-run), then drafts to review; previews are ignored", () => {
    const failed = runBanner({ runs: [{ ...base, run_id: 9, status: "READY_FOR_REVIEW", totals: { SUCCEEDED: 5, FAILED: 2 } }], pending_review: 5 }, now)!;
    expect(failed).toMatchObject({ action: "retry-failed", title: "2 parts could not be drafted" });
    const review = runBanner({ runs: [{ ...base, run_id: 9, status: "READY_FOR_REVIEW", totals: { SUCCEEDED: 5 } }], pending_review: 5 }, now)!;
    expect(review).toMatchObject({ action: "review", tone: "review" });
    expect(runBanner({ runs: [{ ...base, mode: "PREVIEW", run_id: 1, status: "RUNNING", totals: {} }], pending_review: 0 }, now)).toBeNull();
    expect(runBanner({ runs: [], pending_review: 0 }, now)).toBeNull();
  });

  it("autoRetry counts parts waiting to re-run and the earliest time", () => {
    const r = autoRetry(
      [
        { status: "QUEUED", error: "boom", not_before: "2026-10-01T13:00:00Z" },
        { status: "QUEUED", error: "boom", not_before: "2026-10-01T11:00:00Z" },
        { status: "QUEUED", error: null, not_before: "2026-10-01T12:00:00Z" },
        { status: "FAILED", error: "boom", not_before: null },
      ],
      now,
    );
    expect(r).toEqual({ count: 2, at: "2026-10-01T11:00:00.000Z" });
  });
});

describe("term readiness (week rail header)", () => {
  it("counts live weeks over the weeks that can be planned, and the ready-but-off ones", () => {
    const drafted = { ...week(3, { topic: "C" }), readiness: { ...week(3, { topic: "C" }).readiness, state: "DRAFTED" as const } };
    const r = termReadiness([week(1, { topic: "A", live: true }), week(2, { topic: "B" }), drafted, week(4, { topic: null, criteria: 0 })]);
    expect(r).toEqual({ plannable: 3, live: 1, ready: 1, pct: 33 });
    expect(termReadiness([])).toEqual({ plannable: 0, live: 0, ready: 0, pct: 0 });
  });
});
