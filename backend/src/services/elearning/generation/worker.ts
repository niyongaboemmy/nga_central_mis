import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../../db";
import { CourseGenerationRun, CourseGenerationTask, CourseSection } from "../../../db/schema";
import logger from "../../../utils/logger";
import { notifyUsers } from "../../../utils/notifications";
import { AIQuotaExhaustedError, friendlyAIErrorMessage, nextQuotaReset, limitsFor, orderedProviders } from "../../aiProviders";
import { ARTIFACT_ORDER, executeTask, GenerationOutputError, RunRow, TaskRow } from "./execute";
import { emitRunEvent } from "./events";

/**
 * The durable generation worker (LESSON_STUDIO plan §8.5). All state is in MySQL, so a
 * restart (deploy, pm2 memory restart) resumes where it stopped: RUNNING tasks whose
 * heartbeat went stale go back to QUEUED. Claims are an atomic UPDATE … WHERE status =
 * 'QUEUED' checked on affectedRows (MySQL 5.7 has no SKIP LOCKED).
 */

const FAST_ATTEMPTS = 3;
// Background runs (nobody is watching) don't give up after the quick retries: a failing part is
// re-run in slow rounds — an outage or a flaky free model usually recovers within hours.
const SLOW_RETRY_MIN = [60, 180, 360];
const BACKGROUND_MODES = new Set(["FULL", "SINGLE_WEEK"]);
export const maxAttempts = (mode: string) => FAST_ATTEMPTS + (BACKGROUND_MODES.has(mode) ? SLOW_RETRY_MIN.length : 0);
const STALE_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 15 * 1000;
const QUOTA_RETRY_MS = 30 * 60 * 1000;
const concurrency = () => Math.max(1, Math.min(8, Number(process.env.ELEARNING_AI_CONCURRENCY) || 3));

const running = new Map<number, Promise<void>>();
let timer: NodeJS.Timeout | null = null;
let ticking = false;

const MODE_PRIORITY: Record<string, number> = { PREVIEW: 0, REGENERATE_ITEM: 0, SINGLE_WEEK: 1, FULL: 2 };
const TERMINAL_OK = new Set(["SUCCEEDED", "SKIPPED"]);
const TERMINAL_BAD = new Set(["FAILED", "CANCELLED", "DISMISSED"]);

export function startGenerationWorker(): void {
  if (timer) return;
  timer = setInterval(() => void tick().catch((error) => logger.error("[studio] worker tick failed", { error })), 2000);
  timer.unref();
  setTimeout(() => void tick().catch(() => undefined), 5000).unref();
}

/** Nudge the worker now (a run was just created / resumed) instead of waiting for the timer. */
export function wakeWorker(): void {
  // Only when this process runs the worker: ELEARNING_STUDIO_WORKER=false must mean no AI calls here.
  if (process.env.NODE_ENV === "test" || !timer) return;
  setImmediate(() => void tick().catch(() => undefined));
}

async function promoteRuns(now: Date) {
  // "Tonight" runs whose time has come, and quota-paused runs due for another try.
  const due = await db
    .select({ run_id: CourseGenerationRun.run_id, status: CourseGenerationRun.status })
    .from(CourseGenerationRun)
    .where(and(inArray(CourseGenerationRun.status, ["PLANNED", "PAUSED_QUOTA"]), lte(CourseGenerationRun.not_before, now)));
  for (const r of due) {
    await db
      .update(CourseGenerationRun)
      .set({ status: "RUNNING", paused_reason: null, started_at: sql`COALESCE(${CourseGenerationRun.started_at}, NOW())` })
      .where(and(eq(CourseGenerationRun.run_id, r.run_id), eq(CourseGenerationRun.status, r.status)));
    emitRunEvent({ type: "run", run_id: r.run_id, status: "RUNNING" });
  }
}

async function recoverStale(now: Date) {
  const cutoff = new Date(now.getTime() - STALE_MS);
  const stale = await db
    .select({ task_id: CourseGenerationTask.task_id })
    .from(CourseGenerationTask)
    .where(and(eq(CourseGenerationTask.status, "RUNNING"), lte(CourseGenerationTask.heartbeat_at, cutoff)));
  const ids = stale.map((s) => s.task_id).filter((id) => !running.has(id));
  if (ids.length) {
    await db.update(CourseGenerationTask).set({ status: "QUEUED", claimed_at: null }).where(and(inArray(CourseGenerationTask.task_id, ids), eq(CourseGenerationTask.status, "RUNNING")));
    logger.info(`[studio] recovered ${ids.length} stale task(s)`);
  }
}

/** Ready tasks, one per run in turn (fair share between teachers), previews first. */
async function readyTasks(now: Date, limit: number): Promise<TaskRow[]> {
  const rows = await db
    .select({ task: CourseGenerationTask, mode: CourseGenerationRun.mode, run_created: CourseGenerationRun.created_at, position: CourseSection.position })
    .from(CourseGenerationTask)
    .innerJoin(CourseGenerationRun, eq(CourseGenerationRun.run_id, CourseGenerationTask.run_id))
    .innerJoin(CourseSection, eq(CourseSection.section_id, CourseGenerationTask.section_id))
    .where(and(eq(CourseGenerationTask.status, "QUEUED"), lte(CourseGenerationTask.not_before, now), eq(CourseGenerationRun.status, "RUNNING")))
    .limit(500);
  if (rows.length === 0) return [];

  const depIds = [...new Set(rows.flatMap((r) => ((r.task.depends_on as number[]) || [])))];
  const depStatus = new Map<number, string>();
  if (depIds.length) {
    const deps = await db.select({ task_id: CourseGenerationTask.task_id, status: CourseGenerationTask.status }).from(CourseGenerationTask).where(inArray(CourseGenerationTask.task_id, depIds));
    for (const d of deps) depStatus.set(d.task_id, d.status);
  }
  const byRun = new Map<number, { prio: number; created: number; tasks: { task: TaskRow; position: number }[] }>();
  for (const r of rows) {
    const deps = (r.task.depends_on as number[]) || [];
    if (deps.some((d) => TERMINAL_BAD.has(depStatus.get(d) ?? ""))) {
      await finishTask(r.task, { status: "SKIPPED", skip_reason: "DEPENDENCY_FAILED" });
      continue;
    }
    if (!deps.every((d) => TERMINAL_OK.has(depStatus.get(d) ?? ""))) continue;
    const entry = byRun.get(r.task.run_id) ?? { prio: MODE_PRIORITY[r.mode] ?? 2, created: new Date(r.run_created as any).getTime(), tasks: [] };
    entry.tasks.push({ task: r.task, position: r.position });
    byRun.set(r.task.run_id, entry);
  }
  const runs = [...byRun.values()].sort((a, b) => a.prio - b.prio || a.created - b.created);
  for (const run of runs) run.tasks.sort((a, b) => a.position - b.position || ARTIFACT_ORDER.indexOf(a.task.kind as any) - ARTIFACT_ORDER.indexOf(b.task.kind as any));
  const out: TaskRow[] = [];
  // Previews/regenerations (a person is waiting) take all they can first; full runs share the rest round-robin.
  for (let round = 0; out.length < limit; round++) {
    let added = false;
    for (const run of runs) {
      if (round < run.tasks.length && out.length < limit) {
        out.push(run.tasks[round].task);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

/** Atomic claim: only one caller wins a QUEUED task (exported for tests). */
export async function claim(task: Pick<TaskRow, "task_id">): Promise<boolean> {
  const [res] = (await db
    .update(CourseGenerationTask)
    .set({ status: "RUNNING", claimed_at: new Date(), heartbeat_at: new Date(), attempts: sql`${CourseGenerationTask.attempts} + 1` })
    .where(and(eq(CourseGenerationTask.task_id, task.task_id), eq(CourseGenerationTask.status, "QUEUED")))) as any;
  return (res?.affectedRows ?? 0) === 1;
}

/** One worker pass. Returns how many tasks it started. */
export async function tick(at = new Date()): Promise<number> {
  if (ticking) return 0;
  ticking = true;
  // MySQL DATETIME has whole seconds and 5.7 *rounds* the fraction, so a not_before written
  // as "now" can be stored up to a second ahead. Compare against now + 1 s.
  const now = new Date(at.getTime() + 1000);
  try {
    await promoteRuns(now);
    await recoverStale(at);
    const capacity = concurrency() - running.size;
    if (capacity <= 0) return 0;
    const ready = await readyTasks(now, capacity);
    let started = 0;
    for (const task of ready) {
      if (!(await claim(task))) continue;
      started += 1;
      const p = runTask(task.task_id).finally(() => running.delete(task.task_id));
      running.set(task.task_id, p);
    }
    return started;
  } finally {
    ticking = false;
  }
}

async function runTask(taskId: number): Promise<void> {
  const [task] = await db.select().from(CourseGenerationTask).where(eq(CourseGenerationTask.task_id, taskId)).limit(1);
  const [run] = task ? await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.run_id, task.run_id)).limit(1) : [];
  if (!task || !run) return;
  emitRunEvent({ type: "task", run_id: run.run_id, task_id: task.task_id, section_id: task.section_id, kind: task.kind, status: "RUNNING" });
  const beat = setInterval(() => {
    void db.update(CourseGenerationTask).set({ heartbeat_at: new Date() }).where(eq(CourseGenerationTask.task_id, taskId)).catch(() => undefined);
  }, HEARTBEAT_MS);
  try {
    const outcome = await executeTask(task, run);
    await finishTask(task, outcome);
  } catch (error: any) {
    await failTask(task, run, error);
  } finally {
    clearInterval(beat);
    await refreshRunStatus(task.run_id);
  }
}

async function finishTask(task: TaskRow, outcome: Awaited<ReturnType<typeof executeTask>>) {
  await db
    .update(CourseGenerationTask)
    .set({
      status: outcome.status,
      skip_reason: outcome.skip_reason ?? null,
      provider_used: outcome.provider_used ?? null,
      model: outcome.model ?? null,
      input_hash: outcome.input_hash ?? null,
      output_ref: outcome.output_ref ?? null,
      output_digest: outcome.output_digest ?? null,
      error: null,
      finished_at: new Date(),
    })
    .where(eq(CourseGenerationTask.task_id, task.task_id));
  emitRunEvent({
    type: "task",
    run_id: task.run_id,
    task_id: task.task_id,
    section_id: task.section_id,
    kind: task.kind,
    status: outcome.status,
    detail: { skip_reason: outcome.skip_reason ?? null, provider_used: outcome.provider_used ?? null, digest: outcome.output_digest ?? null },
  });
}

/** When the first provider's free quota comes back. */
function earliestReset(): Date {
  const names = orderedProviders().filter((p) => p.isConfigured()).map((p) => p.name);
  const resets = names.map((n) => nextQuotaReset(limitsFor(n).resetHourUtc).getTime());
  const soonest = resets.length ? Math.min(...resets) : Date.now() + QUOTA_RETRY_MS;
  return new Date(Math.min(soonest, Date.now() + QUOTA_RETRY_MS));
}

async function failTask(task: TaskRow, run: RunRow, error: any) {
  const [current] = await db.select({ attempts: CourseGenerationTask.attempts }).from(CourseGenerationTask).where(eq(CourseGenerationTask.task_id, task.task_id)).limit(1);
  const attempts = current?.attempts ?? 1;

  if (error instanceof AIQuotaExhaustedError) {
    // Not the task's fault: give the attempt back and pause the whole run until quota returns.
    const resumeAt = earliestReset();
    await db
      .update(CourseGenerationTask)
      .set({ status: "QUEUED", attempts: Math.max(0, attempts - 1), not_before: resumeAt, claimed_at: null })
      .where(eq(CourseGenerationTask.task_id, task.task_id));
    await db
      .update(CourseGenerationRun)
      .set({ status: "PAUSED_QUOTA", not_before: resumeAt, paused_reason: "Today's free AI quota is used up. The run continues automatically." })
      .where(and(eq(CourseGenerationRun.run_id, run.run_id), eq(CourseGenerationRun.status, "RUNNING")));
    emitRunEvent({ type: "run", run_id: run.run_id, status: "PAUSED_QUOTA", detail: { resume_at: resumeAt.toISOString() } });
    emitRunEvent({ type: "task", run_id: run.run_id, task_id: task.task_id, section_id: task.section_id, kind: task.kind, status: "QUEUED" });
    return;
  }

  const message = error instanceof GenerationOutputError ? error.message : friendlyAIErrorMessage(error);
  logger.warn("[studio] task failed", { task_id: task.task_id, kind: task.kind, attempts, error: error?.message });
  if (attempts < maxAttempts(run.mode)) {
    const backoff =
      attempts < FAST_ATTEMPTS
        ? 30_000 * 2 ** (attempts - 1) + Math.floor(Math.random() * 5000)
        : SLOW_RETRY_MIN[attempts - FAST_ATTEMPTS] * 60_000;
    const retryAt = new Date(Date.now() + backoff);
    await db
      .update(CourseGenerationTask)
      .set({ status: "QUEUED", not_before: retryAt, claimed_at: null, error: message.slice(0, 1000) })
      .where(eq(CourseGenerationTask.task_id, task.task_id));
    emitRunEvent({ type: "task", run_id: run.run_id, task_id: task.task_id, section_id: task.section_id, kind: task.kind, status: "QUEUED", detail: { retrying: true, retry_at: retryAt.toISOString(), error: message } });
    return;
  }
  await db.update(CourseGenerationTask).set({ status: "FAILED", error: message.slice(0, 1000), finished_at: new Date() }).where(eq(CourseGenerationTask.task_id, task.task_id));
  emitRunEvent({ type: "task", run_id: run.run_id, task_id: task.task_id, section_id: task.section_id, kind: task.kind, status: "FAILED", detail: { error: message } });
}

/** Moves a run to READY_FOR_REVIEW / COMPLETED / FAILED once nothing is left to do. */
export async function refreshRunStatus(runId: number) {
  const [run] = await db.select().from(CourseGenerationRun).where(eq(CourseGenerationRun.run_id, runId)).limit(1);
  if (!run || !["RUNNING", "PAUSED_QUOTA"].includes(run.status)) return;
  const counts = await db
    .select({ status: CourseGenerationTask.status, n: sql<number>`COUNT(*)` })
    .from(CourseGenerationTask)
    .where(eq(CourseGenerationTask.run_id, runId))
    .groupBy(CourseGenerationTask.status);
  const c = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)])) as Record<string, number>;
  if ((c.QUEUED ?? 0) + (c.RUNNING ?? 0) > 0) return;
  const next = (c.SUCCEEDED ?? 0) > 0 ? "READY_FOR_REVIEW" : (c.FAILED ?? 0) > 0 ? "FAILED" : "COMPLETED";
  const [res] = (await db
    .update(CourseGenerationRun)
    .set({ status: next, finished_at: new Date(), paused_reason: null })
    .where(and(eq(CourseGenerationRun.run_id, runId), inArray(CourseGenerationRun.status, ["RUNNING", "PAUSED_QUOTA"])))) as any;
  if ((res?.affectedRows ?? 0) !== 1) return;
  emitRunEvent({ type: "run", run_id: runId, status: next });
  // Background runs report back: the teacher started it and left.
  if (BACKGROUND_MODES.has(run.mode) && next !== "COMPLETED") {
    const failed = c.FAILED ?? 0;
    const failedNote = failed ? ` ${failed} part(s) could not be drafted — open the run and choose "Re-run failed".` : "";
    await notifyUsers([run.created_by], {
      kind: "course_studio_ready",
      title: next === "READY_FOR_REVIEW" ? "Your AI-drafted weeks are ready to review" : "Your AI drafting run could not finish",
      body: next === "READY_FOR_REVIEW" ? `${c.SUCCEEDED} part(s) were drafted. Nothing is visible to students until you approve it.${failedNote}` : `None of the parts could be drafted after several tries.${failedNote}`,
      link: `/elearning/courses/${run.course_id}/studio?run=${runId}`,
      subjectType: "course",
      subjectId: run.course_id,
    }).catch((error) => logger.warn("[studio] run notification failed", { error }));
  }
}

/**
 * Tests only: runs the worker until nothing is claimable, awaiting every task (the timer
 * never runs under NODE_ENV=test).
 */
export async function drainWorker(maxTicks = 50, now?: () => Date): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    const started = await tick(now ? now() : new Date());
    if (running.size) await Promise.all([...running.values()]);
    if (started === 0 && running.size === 0) return;
  }
}
