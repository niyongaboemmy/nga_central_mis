import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { CourseGenerationRun, CourseGenerationTask, CourseSection, SchemeOfWorkEntry } from "../../../db/schema";
import { ConflictError, ValidationError } from "../../../errors/CustomError";
import { orderedProviders, quotaSnapshot, roleOrder } from "../../aiProviders";
import { CourseRow } from "../courseMembership";
import { loadCourseTree, TreeSection } from "../courseTree";
import { coverageOfSection } from "../courseCoverage";
import { Blueprint, needsAssessmentPack, needsCoreLesson } from "./blueprint";
import { ArtifactKind } from "./execute";
import { emitRunEvent } from "./events";

/**
 * Turns a recipe + chosen weeks into tasks, and estimates what that costs in free AI quota
 * (LESSON_STUDIO plan §8.4, §7.3). Planning is fast and makes no AI call.
 */

export type RunMode = "PREVIEW" | "FULL" | "SINGLE_WEEK" | "REGENERATE_ITEM";
export const ACTIVE_RUN_STATUSES = ["PLANNED", "RUNNING", "PAUSED", "PAUSED_QUOTA"] as const;

interface PlannedWeek {
  section_id: number;
  title: string;
  kinds: ArtifactKind[];
  /** Why a week (or its lesson) needs no AI. */
  notes: string[];
  calls: number;
}

export interface RunEstimate {
  weeks: number;
  calls: number;
  calls_by_role: { draft: number; assess: number; verify: number };
  minutes: number;
  fits_today: boolean;
  expected_finish: string;
  skipped: { section_id: number; title: string; reason: string }[];
  quota: Awaited<ReturnType<typeof quotaSnapshot>>;
}

async function topicsBySection(sections: TreeSection[]) {
  const entryIds = sections.map((s) => s.scheme_entry_id).filter((x): x is number => !!x);
  const rows = entryIds.length
    ? await db.select({ entry_id: SchemeOfWorkEntry.entry_id, topic: SchemeOfWorkEntry.topic }).from(SchemeOfWorkEntry).where(inArray(SchemeOfWorkEntry.entry_id, entryIds))
    : [];
  const topic = new Map(rows.map((r) => [r.entry_id, r.topic]));
  return new Map(sections.map((s) => [s.section_id, s.scheme_entry_id ? topic.get(s.scheme_entry_id) ?? null : null]));
}

export async function planWeeks(course: CourseRow, bp: Blueprint, sectionIds: number[]) {
  if (sectionIds.length === 0) throw new ValidationError("Pick at least one week");
  if (sectionIds.length > 60) throw new ValidationError("A run can cover at most 60 weeks");
  const tree = await loadCourseTree(course);
  const byId = new Map(tree.map((s) => [s.section_id, s]));
  const unknown = sectionIds.filter((id) => !byId.has(id));
  if (unknown.length) throw new ValidationError("Every week must belong to this course");
  const topics = await topicsBySection(tree);

  const planned: PlannedWeek[] = [];
  const skipped: RunEstimate["skipped"] = [];
  // Keep course order, whatever order the client sent.
  const ordered = tree.filter((s) => sectionIds.includes(s.section_id));
  for (const section of ordered) {
    const topic = (topics.get(section.section_id) || "").trim();
    if (!topic && section.criteria.length === 0) {
      skipped.push({ section_id: section.section_id, title: section.title, reason: "NO_CURRICULUM" });
      continue;
    }
    const cov = coverageOfSection(section);
    const kinds: ArtifactKind[] = [];
    const notes: string[] = [];
    let calls = 0;
    if (bp.reuse_existing_notes) kinds.push("REUSE_PLACEMENT");
    if (needsCoreLesson(bp)) {
      const teacherLesson = section.items.some((i) => i.item_type === "LESSON_NOTE" && i.ai_origin === "NONE");
      const covered = cov.targets.length > 0 && cov.gaps.length === 0 && teacherLesson;
      kinds.push("CORE_LESSON");
      if (covered && bp.reuse_existing_notes && !bp.practical_task.enabled) notes.push("COVERED_BY_EXISTING");
      else calls += 1;
    }
    if (needsAssessmentPack(bp)) {
      kinds.push("ASSESSMENT_PACK");
      calls += 1 + (bp.knowledge_check.enabled || bp.exit_ticket.enabled ? 1 : 0);
    }
    planned.push({ section_id: section.section_id, title: section.title, kinds, notes, calls });
  }
  return { planned, skipped };
}

/** Next 19:00 in Kigali (UTC+2, no daylight saving) — when "Tonight" runs start. */
export function nextEveningKigali(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(17, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

const SECONDS_PER_CALL = 35;

export async function estimateRun(course: CourseRow, bp: Blueprint, sectionIds: number[], mode: RunMode = "FULL"): Promise<RunEstimate & { planned: PlannedWeek[] }> {
  const { planned, skipped } = await planWeeks(course, bp, sectionIds);
  const calls = planned.reduce((n, w) => n + w.calls, 0);
  const lessons = planned.filter((w) => w.kinds.includes("CORE_LESSON") && !w.notes.includes("COVERED_BY_EXISTING")).length;
  const assess = planned.filter((w) => w.kinds.includes("ASSESSMENT_PACK")).length;
  const verify = bp.knowledge_check.enabled || bp.exit_ticket.enabled ? assess : 0;

  const configured = [...new Set([...(roleOrder("draft") ?? []), ...(roleOrder("assess") ?? [])])].filter((name) =>
    orderedProviders([name]).some((p) => p.name === name && p.isConfigured()),
  );
  const quota = await quotaSnapshot(configured);
  const bulk = mode === "FULL";
  const unlimited = quota.some((q) => q.daily_limit === null);
  const remaining = quota.reduce((n, q) => n + ((bulk ? q.bulk_remaining : q.remaining) ?? 0), 0);
  const fits = unlimited || remaining >= calls;
  const concurrency = Math.max(1, Math.min(3, configured.length || 1));
  const minutes = Math.max(1, Math.ceil((calls * SECONDS_PER_CALL) / concurrency / 60));
  let finish = new Date(Date.now() + minutes * 60_000);
  if (!fits) {
    const resets = configured.map((p) => new Date(quota.find((q) => q.provider === p)?.resets_at ?? Date.now()).getTime());
    finish = new Date(Math.min(...resets) + minutes * 60_000);
  }
  return {
    planned,
    weeks: planned.length,
    calls,
    calls_by_role: { draft: lessons, assess, verify },
    minutes,
    fits_today: fits,
    expected_finish: finish.toISOString(),
    skipped,
    quota,
  };
}

const INTERACTIVE_MODES: RunMode[] = ["PREVIEW", "SINGLE_WEEK", "REGENERATE_ITEM"];

/**
 * One active full run per course, and one active interactive run (preview / one week /
 * redo) per course; the two may overlap — a teacher reviewing while a long run waits for
 * tomorrow's quota can still redo a draft — but never on the same week.
 */
export async function activeRunFor(courseId: number, mode: RunMode = "FULL") {
  const modes = mode === "FULL" ? (["FULL"] as RunMode[]) : INTERACTIVE_MODES;
  const [run] = await db
    .select()
    .from(CourseGenerationRun)
    .where(
      and(
        eq(CourseGenerationRun.course_id, courseId),
        inArray(CourseGenerationRun.status, [...ACTIVE_RUN_STATUSES]),
        inArray(CourseGenerationRun.mode, modes),
      ),
    )
    .limit(1);
  return run ?? null;
}

/** All active runs of a course (the Studio shows them). */
export async function activeRunsFor(courseId: number) {
  return db
    .select()
    .from(CourseGenerationRun)
    .where(and(eq(CourseGenerationRun.course_id, courseId), inArray(CourseGenerationRun.status, [...ACTIVE_RUN_STATUSES])));
}

/** An interactive run may not touch a week that an active run still has to write. */
export async function assertWeeksNotBusy(courseId: number, sectionIds: number[]) {
  const busy = await db
    .select({ section_id: CourseGenerationTask.section_id })
    .from(CourseGenerationTask)
    .innerJoin(CourseGenerationRun, eq(CourseGenerationRun.run_id, CourseGenerationTask.run_id))
    .where(
      and(
        eq(CourseGenerationRun.course_id, courseId),
        inArray(CourseGenerationRun.status, [...ACTIVE_RUN_STATUSES]),
        inArray(CourseGenerationTask.status, ["QUEUED", "RUNNING"]),
        inArray(CourseGenerationTask.section_id, sectionIds),
      ),
    )
    .limit(1);
  if (busy.length) throw new ConflictError("This week is still being generated — wait for it to finish, or cancel the run.");
}

/**
 * Creates a run and its tasks (§8.4). One active run per course (409 otherwise). Tasks of a
 * week depend on each other in artifact order: placement → lesson → assessment.
 */
export async function createRun(input: {
  course: CourseRow;
  userId: number;
  blueprint: Blueprint;
  sectionIds: number[];
  mode: RunMode;
  start?: "now" | "tonight";
  parentRunId?: number | null;
  /** Limit the run to these artifacts (a redo of one draft). */
  onlyKinds?: ArtifactKind[];
}) {
  const active = await activeRunFor(input.course.course_id, input.mode);
  if (active) throw new ConflictError("A generation run is already in progress for this course", [{ run_id: active.run_id }]);
  if (input.mode !== "FULL") await assertWeeksNotBusy(input.course.course_id, input.sectionIds);
  if (input.mode === "PREVIEW" && input.sectionIds.length !== 1) throw new ValidationError("Try one week at a time");
  const estimate = await estimateRun(input.course, input.blueprint, input.sectionIds, input.mode);
  if (estimate.planned.length === 0) throw new ValidationError("None of the chosen weeks has a topic or criteria yet — add them in the scheme of work first.");

  const tonight = input.start === "tonight" && input.mode === "FULL";
  const { planned: _p, ...estimateSummary } = estimate;
  const [ins] = (await db.insert(CourseGenerationRun).values({
    course_id: input.course.course_id,
    created_by: input.userId,
    parent_run_id: input.parentRunId ?? null,
    mode: input.mode,
    status: tonight ? "PLANNED" : "RUNNING",
    blueprint: input.blueprint,
    section_ids: estimate.planned.map((w) => w.section_id),
    estimate: { ...estimateSummary, quota: undefined },
    not_before: tonight ? nextEveningKigali() : null,
    started_at: tonight ? null : new Date(),
  })) as any;
  const runId = ins.insertId as number;

  for (const week of estimate.planned) {
    let previous: number | null = null;
    for (const kind of week.kinds.filter((k) => !input.onlyKinds || input.onlyKinds.includes(k))) {
      const [t] = (await db.insert(CourseGenerationTask).values({
        run_id: runId,
        section_id: week.section_id,
        kind,
        depends_on: previous ? [previous] : [],
        not_before: new Date(),
      })) as any;
      previous = t.insertId as number;
    }
  }
  emitRunEvent({ type: "run", run_id: runId, status: tonight ? "PLANNED" : "RUNNING" });
  return { run_id: runId, estimate: estimateSummary };
}

/** Section ids of a course in course order (helper for "all weeks" / "only gaps"). */
export async function courseSectionIds(courseId: number) {
  return (await db.select({ section_id: CourseSection.section_id }).from(CourseSection).where(eq(CourseSection.course_id, courseId))).map((s) => s.section_id);
}
