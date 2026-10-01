import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { AIUsageLog, COURSE_ITEM_TYPES, CourseBlueprint, CourseGenerationRun, CourseGenerationTask, CourseItem, SchemeOfWork } from "../db/schema";
import { asyncHandler } from "../middleware/asyncHandler";
import { successResponse } from "../utils/response";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { assertCanBuildCourse, loadCourse, CourseRow } from "../services/elearning/courseMembership";
import { loadCourseHeader, loadCourseTree, loadItemWithCourse, loadSectionWithCourse } from "../services/elearning/courseTree";
import { coverageOfSection } from "../services/elearning/courseCoverage";
import { loadWeekBundles } from "../services/curriculumChain/weekBundle";
import { BUILTIN_PRESETS, normaliseBlueprint } from "../services/elearning/generation/blueprint";
import { buildWeekContextPack, describePack } from "../services/elearning/generation/contextPack";
import { activeRunsFor, createRun, estimateRun, RunMode } from "../services/elearning/generation/planner";
import { approveSectionDrafts, dismissDraft, regenerateItem } from "../services/elearning/generation/review";
import { onRunEvent } from "../services/elearning/generation/events";
import { refreshRunStatus, wakeWorker } from "../services/elearning/generation/worker";
import { orderedProviders, quotaSnapshot, roleOrder } from "../services/aiProviders";
import { recordActivity } from "../utils/activityLogger";

/**
 * Lesson Studio API (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §13). Every endpoint is
 * behind MANAGE_COURSE_CONTENT at the router and re-checks that the caller may build this
 * particular course (owner or a teacher assigned to its subject + class group).
 */

const parseId = (raw: unknown, label = "id"): number => {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) throw new ValidationError(`Invalid ${label}`);
  return n;
};

async function buildableCourse(courseId: number, userId: number): Promise<CourseRow> {
  const course = await loadCourse(courseId);
  await assertCanBuildCourse(course, userId);
  return course;
}

async function buildableRun(runId: number, userId: number) {
  const [run] = await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.run_id, runId)).limit(1);
  if (!run) throw new NotFoundError("Run not found");
  const course = await buildableCourse(run.course_id, userId);
  return { run, course };
}

/** Providers the role orders actually use (decision D2: OpenAI only if someone lists it), and that have a key. */
const configuredProviders = () => {
  const used = [...new Set((["draft", "assess", "verify", "repair"] as const).flatMap((r) => roleOrder(r) ?? []))];
  return orderedProviders(used).filter((p) => p.isConfigured()).map((p) => p.name);
};

// ------------------------------------------------------------------ presets & blueprints

async function visibleBlueprints(userId: number) {
  return db
    .select()
    .from(CourseBlueprint)
    .where(or(eq(CourseBlueprint.owner_user_id, userId), inArray(CourseBlueprint.visibility, ["SCHOOL", "DEPARTMENT"])))
    .orderBy(desc(CourseBlueprint.updated_at))
    .limit(50);
}

export const listStudioPresets = asyncHandler(async (req: any, res: any) => {
  successResponse(res, "Presets", { presets: BUILTIN_PRESETS, blueprints: await visibleBlueprints(req.user.userId) });
});

export const saveBlueprint = asyncHandler(async (req: any, res: any) => {
  const name = String(req.body?.name || "").trim().slice(0, 120);
  if (!name) throw new ValidationError("Give the preset a name");
  const config = normaliseBlueprint(req.body?.config);
  const visibility = ["PRIVATE", "DEPARTMENT", "SCHOOL"].includes(req.body?.visibility) ? req.body.visibility : "PRIVATE";
  const subjectId = req.body?.subject_id ? parseId(req.body.subject_id, "subject id") : null;
  if (req.params.id) {
    const id = parseId(req.params.id, "preset id");
    const [bp] = await db.select().from(CourseBlueprint).where(eq(CourseBlueprint.blueprint_id, id)).limit(1);
    if (!bp || bp.owner_user_id !== req.user.userId) throw new NotFoundError("Preset not found");
    await db.update(CourseBlueprint).set({ name, config, visibility, subject_id: subjectId }).where(eq(CourseBlueprint.blueprint_id, id));
    return successResponse(res, "Preset saved", { blueprint_id: id });
  }
  const [ins] = (await db.insert(CourseBlueprint).values({ owner_user_id: req.user.userId, name, config, visibility, subject_id: subjectId })) as any;
  successResponse(res, "Preset saved", { blueprint_id: ins.insertId }, 201);
});

export const deleteBlueprint = asyncHandler(async (req: any, res: any) => {
  const id = parseId(req.params.id, "preset id");
  const [bp] = await db.select().from(CourseBlueprint).where(eq(CourseBlueprint.blueprint_id, id)).limit(1);
  if (!bp || bp.owner_user_id !== req.user.userId) throw new NotFoundError("Preset not found");
  await db.delete(CourseBlueprint).where(eq(CourseBlueprint.blueprint_id, id));
  successResponse(res, "Preset deleted", { blueprint_id: id });
});

// ------------------------------------------------------------------ studio boot

/** `GET /courses/:id/studio` — everything the Studio needs in one call. */
export const getStudio = asyncHandler(async (req: any, res: any) => {
  const course = await buildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const [scheme] = await db.select().from(SchemeOfWork).where(eq(SchemeOfWork.scheme_id, course.scheme_id)).limit(1);
  const [header, bundles, active, recent, quota, blueprints] = await Promise.all([
    loadCourseHeader(course),
    scheme ? loadWeekBundles(scheme) : Promise.resolve({ course_id: course.course_id, weeks: [] }),
    activeRunsFor(course.course_id),
    db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.course_id, course.course_id)).orderBy(desc(CourseGenerationRun.created_at)).limit(8),
    quotaSnapshot(configuredProviders()),
    visibleBlueprints(req.user.userId),
  ]);
  successResponse(res, "Studio", {
    ...header,
    weeks: bundles.weeks,
    active_runs: active.map((r) => r.run_id),
    recent_runs: recent.map(({ blueprint: _b, ...r }) => r),
    quota,
    ai_configured: configuredProviders().length > 0,
    // Blocks whose item types ship in a later phase are shown as "coming soon" until they exist.
    features: {
      flashcards: (COURSE_ITEM_TYPES as readonly string[]).includes("FLASHCARDS"),
      exit_ticket: (COURSE_ITEM_TYPES as readonly string[]).includes("EXIT_TICKET"),
    },
    presets: BUILTIN_PRESETS,
    blueprints,
  });
});

/** `GET /sections/:id/context-pack` — what the AI will read for this week (no text bodies). */
export const getContextPack = asyncHandler(async (req: any, res: any) => {
  const row = await loadSectionWithCourse(parseId(req.params.id, "section id"));
  if (!row) throw new NotFoundError("Week not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const flag = (v: unknown) => v === undefined || !["0", "false"].includes(String(v));
  const pack = await buildWeekContextPack(row.section.section_id, {
    sources: { lesson_plans: flag(req.query.lesson_plans), my_notes: flag(req.query.my_notes), subject_materials: flag(req.query.subject_materials), previous_weeks: flag(req.query.previous_weeks) },
    extraAssetIds: String(req.query.asset_ids || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0),
    teacherUserId: req.user.userId,
    subjectId: row.course.subject_id,
    classGroupId: row.course.class_group_id,
  });
  if (!pack) throw new NotFoundError("Week not found");
  successResponse(res, "Context pack", describePack(pack));
});

// ------------------------------------------------------------------ runs

const readSectionIds = (raw: unknown): number[] => {
  if (!Array.isArray(raw)) throw new ValidationError("section_ids must be a list");
  return [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
};

export const estimateGeneration = asyncHandler(async (req: any, res: any) => {
  const course = await buildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const blueprint = normaliseBlueprint(req.body?.blueprint);
  const mode: RunMode = ["PREVIEW", "SINGLE_WEEK"].includes(req.body?.mode) ? req.body.mode : "FULL";
  const { planned, ...estimate } = await estimateRun(course, blueprint, readSectionIds(req.body?.section_ids), mode);
  successResponse(res, "Estimate", { ...estimate, weeks_planned: planned.map((w) => ({ section_id: w.section_id, title: w.title, calls: w.calls, notes: w.notes })) });
});

export const startGeneration = asyncHandler(async (req: any, res: any) => {
  const course = await buildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const blueprint = normaliseBlueprint(req.body?.blueprint);
  const mode: RunMode = ["PREVIEW", "SINGLE_WEEK", "FULL"].includes(req.body?.mode) ? req.body.mode : "FULL";
  const result = await createRun({
    course,
    userId: req.user.userId,
    blueprint,
    sectionIds: readSectionIds(req.body?.section_ids),
    mode,
    start: req.body?.start === "tonight" ? "tonight" : "now",
  });
  await recordActivity(req.user.userId, "ELEARNING_STUDIO_RUN", `Started a Lesson Studio ${mode.toLowerCase()} run`, "Course", course.course_id, { run_id: result.run_id, calls: result.estimate.calls });
  wakeWorker();
  successResponse(res, "Generation started", result, 202);
});

/** A run with its tasks grouped per week, plus each week's drafts and coverage now. */
async function runPayload(run: typeof CourseGenerationRun.$inferSelect, course: CourseRow) {
  const tasks = await db.select().from(CourseGenerationTask).where(eq(CourseGenerationTask.run_id, run.run_id));
  const sectionIds = (run.section_ids as number[]) || [];
  const tree = await loadCourseTree(course, { includeContent: true });
  const totals: Record<string, number> = {};
  for (const t of tasks) totals[t.status] = (totals[t.status] ?? 0) + 1;
  const weeks = sectionIds
    .map((id) => tree.find((s) => s.section_id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((section) => {
      const cov = coverageOfSection(section);
      const drafts = section.items.filter((i) => i.review_state === "PENDING_REVIEW" || i.review_state === "EDITED");
      return {
        section_id: section.section_id,
        title: section.title,
        week_number: section.week_number,
        start_date: section.start_date,
        status: section.status,
        criteria: section.criteria,
        coverage: { targets: cov.targets.length, covered: cov.covered.length, gaps: cov.gaps.map((g) => g.criteria_number) },
        tasks: tasks
          .filter((t) => t.section_id === section.section_id)
          .map((t) => ({
            task_id: t.task_id,
            kind: t.kind,
            status: t.status,
            skip_reason: t.skip_reason,
            attempts: t.attempts,
            provider_used: t.provider_used,
            output_digest: t.output_digest,
            error: t.error,
            not_before: t.not_before,
          })),
        drafts: drafts.map((i) => ({
          item_id: i.item_id,
          item_type: i.item_type,
          title: i.title,
          ai_origin: i.ai_origin,
          review_state: i.review_state,
          review_flags: i.review_flags ?? [],
          source_refs: i.source_refs ?? null,
          ref_id: i.ref_id,
          external_url: i.external_url,
          content_json: i.content_json ?? null,
          criteria: i.criteria,
        })),
        pending_review: drafts.length,
      };
    });
  // Practical tasks are PAGE items; the tree leaves page HTML out, so fetch it for review.
  const pageIds = weeks.flatMap((w) => w.drafts.filter((d) => d.item_type === "PAGE" || d.item_type === "PRACTICAL_TASK").map((d) => d.item_id));
  if (pageIds.length) {
    const pages = await db.select({ item_id: CourseItem.item_id, content_html: CourseItem.content_html }).from(CourseItem).where(inArray(CourseItem.item_id, pageIds));
    const html = new Map(pages.map((p) => [p.item_id, p.content_html]));
    for (const w of weeks) for (const d of w.drafts as any[]) if (html.has(d.item_id)) d.content_html = html.get(d.item_id);
  }
  const { blueprint, ...rest } = run;
  return { run: { ...rest, blueprint, totals }, weeks };
}

export const getRun = asyncHandler(async (req: any, res: any) => {
  const { run, course } = await buildableRun(parseId(req.params.id, "run id"), req.user.userId);
  successResponse(res, "Run", await runPayload(run, course));
});

export const listRuns = asyncHandler(async (req: any, res: any) => {
  const course = await buildableCourse(parseId(req.params.id, "course id"), req.user.userId);
  const runs = await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.course_id, course.course_id)).orderBy(desc(CourseGenerationRun.created_at)).limit(20);
  successResponse(res, "Runs", runs.map(({ blueprint: _b, ...r }) => r));
});

/** SSE: run/task events as they happen. Token rides as ?token= (EventSource can't send headers). */
export const streamRun = asyncHandler(async (req: any, res: any) => {
  const { run } = await buildableRun(parseId(req.params.id, "run id"), req.user.userId);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 5000\n\n");
  res.write(`data: ${JSON.stringify({ type: "hello", run_id: run.run_id, status: run.status })}\n\n`);
  const off = onRunEvent(run.run_id, (e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => {
    off();
    clearInterval(keepAlive);
    res.end();
  });
});

export const controlRun = asyncHandler(async (req: any, res: any) => {
  const { run, course } = await buildableRun(parseId(req.params.id, "run id"), req.user.userId);
  const action = String(req.params.action);
  if (action === "pause") {
    if (!["RUNNING", "PAUSED_QUOTA", "PLANNED"].includes(run.status)) throw new ValidationError("This run is not running");
    await db.update(CourseGenerationRun).set({ status: "PAUSED", paused_reason: "Paused by the teacher" }).where(eq(CourseGenerationRun.run_id, run.run_id));
  } else if (action === "resume") {
    if (!["PAUSED", "PAUSED_QUOTA", "PLANNED"].includes(run.status)) throw new ValidationError("This run is not paused");
    await db.update(CourseGenerationRun).set({ status: "RUNNING", paused_reason: null, not_before: null, started_at: sql`COALESCE(${CourseGenerationRun.started_at}, NOW())` }).where(eq(CourseGenerationRun.run_id, run.run_id));
    // Quota-delayed tasks become ready now (the limiter still skips exhausted providers).
    await db.update(CourseGenerationTask).set({ not_before: new Date() }).where(and(eq(CourseGenerationTask.run_id, run.run_id), eq(CourseGenerationTask.status, "QUEUED")));
  } else if (action === "cancel") {
    await db.update(CourseGenerationTask).set({ status: "CANCELLED", finished_at: new Date() }).where(and(eq(CourseGenerationTask.run_id, run.run_id), eq(CourseGenerationTask.status, "QUEUED")));
    await db.update(CourseGenerationRun).set({ status: "CANCELLED", finished_at: new Date(), paused_reason: null }).where(eq(CourseGenerationRun.run_id, run.run_id));
  } else if (action === "retry-failed") {
    const [res2] = (await db
      .update(CourseGenerationTask)
      .set({ status: "QUEUED", attempts: 0, error: null, not_before: new Date(), finished_at: null })
      .where(and(eq(CourseGenerationTask.run_id, run.run_id), inArray(CourseGenerationTask.status, ["FAILED"])))) as any;
    // Their dependents were skipped because of the failure: queue those again too.
    await db
      .update(CourseGenerationTask)
      .set({ status: "QUEUED", skip_reason: null, not_before: new Date(), finished_at: null })
      .where(and(eq(CourseGenerationTask.run_id, run.run_id), eq(CourseGenerationTask.status, "SKIPPED"), eq(CourseGenerationTask.skip_reason, "DEPENDENCY_FAILED")));
    if ((res2?.affectedRows ?? 0) === 0) throw new ValidationError("Nothing failed in this run");
    await db.update(CourseGenerationRun).set({ status: "RUNNING", finished_at: null, paused_reason: null }).where(eq(CourseGenerationRun.run_id, run.run_id));
  } else throw new ValidationError("Unknown action");
  await refreshRunStatus(run.run_id);
  wakeWorker();
  const [fresh] = await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.run_id, run.run_id)).limit(1);
  successResponse(res, "Run updated", await runPayload(fresh, course));
});

// ------------------------------------------------------------------ review

export const approveDrafts = asyncHandler(async (req: any, res: any) => {
  const row = await loadSectionWithCourse(parseId(req.params.id, "section id"));
  if (!row) throw new NotFoundError("Week not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const itemIds = Array.isArray(req.body?.item_ids) ? req.body.item_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : undefined;
  const result = await approveSectionDrafts(row.course, row.section.section_id, req.user.userId, { itemIds, publishSection: req.body?.publish_section === true });
  successResponse(res, result.approved.length ? "Approved" : "Nothing to approve", result);
});

export const dismissDraftHandler = asyncHandler(async (req: any, res: any) => {
  const row = await loadItemWithCourse(parseId(req.params.id, "item id"));
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  await dismissDraft(row.course, row.item.item_id, req.user.userId);
  successResponse(res, "Draft dismissed", { item_id: row.item.item_id });
});

export const regenerateDraft = asyncHandler(async (req: any, res: any) => {
  const row = await loadItemWithCourse(parseId(req.params.id, "item id"));
  if (!row) throw new NotFoundError("Item not found");
  await assertCanBuildCourse(row.course, req.user.userId);
  const result = await regenerateItem(row.course, row.item.item_id, req.user.userId, String(req.body?.instruction || ""));
  wakeWorker();
  successResponse(res, "Regenerating", result, 202);
});

// ------------------------------------------------------------------ admin: AI usage (§15)

export const getAIUsage = asyncHandler(async (req: any, res: any) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days) || 14));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [byDay, byFeature, funnel, quota] = await Promise.all([
    db
      .select({
        day: sql<string>`DATE(${AIUsageLog.occurred_at})`,
        provider: AIUsageLog.provider,
        calls: sql<number>`COUNT(*)`,
        failures: sql<number>`SUM(CASE WHEN ${AIUsageLog.ok} = 0 THEN 1 ELSE 0 END)`,
        tokens: sql<number>`COALESCE(SUM(${AIUsageLog.input_tokens}), 0) + COALESCE(SUM(${AIUsageLog.output_tokens}), 0)`,
      })
      .from(AIUsageLog)
      .where(gte(AIUsageLog.occurred_at, since))
      .groupBy(sql`DATE(${AIUsageLog.occurred_at})`, AIUsageLog.provider)
      .orderBy(sql`DATE(${AIUsageLog.occurred_at})`),
    db
      .select({
        feature: AIUsageLog.feature,
        calls: sql<number>`COUNT(*)`,
        failures: sql<number>`SUM(CASE WHEN ${AIUsageLog.ok} = 0 THEN 1 ELSE 0 END)`,
        avg_latency_ms: sql<number>`ROUND(AVG(${AIUsageLog.latency_ms}))`,
      })
      .from(AIUsageLog)
      .where(gte(AIUsageLog.occurred_at, since))
      .groupBy(AIUsageLog.feature)
      .orderBy(desc(sql`COUNT(*)`)),
    db
      .select({ item_type: CourseItem.item_type, review_state: CourseItem.review_state, n: sql<number>`COUNT(*)` })
      .from(CourseItem)
      .where(eq(CourseItem.ai_origin, "AI_GENERATED"))
      .groupBy(CourseItem.item_type, CourseItem.review_state),
    quotaSnapshot(configuredProviders()),
  ]);
  successResponse(res, "AI usage", {
    days,
    by_day: byDay.map((r) => ({ ...r, calls: Number(r.calls), failures: Number(r.failures), tokens: Number(r.tokens) })),
    by_feature: byFeature.map((r) => ({ ...r, calls: Number(r.calls), failures: Number(r.failures), avg_latency_ms: Number(r.avg_latency_ms) })),
    review_funnel: funnel.map((r) => ({ ...r, n: Number(r.n) })),
    quota,
  });
});
