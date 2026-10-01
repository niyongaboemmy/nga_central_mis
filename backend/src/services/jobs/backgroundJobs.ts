import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import { BackgroundJob } from "../../db/schema";
import logger from "../../utils/logger";

/**
 * A small durable job queue (LESSON_STUDIO plan §10.3) for work that must run out of the
 * request — today, file previews. Jobs live in MySQL, so a restart resumes them; claims are
 * an atomic UPDATE (MySQL 5.7, no SKIP LOCKED). It runs ONE job at a time on purpose: on a
 * host shared by four apps, office conversion must never run in parallel.
 */

export type JobHandler = (payload: any) => Promise<void>;
const handlers = new Map<string, JobHandler>();
const MAX_ATTEMPTS = 2;
const STALE_MS = 10 * 60 * 1000;

export function registerJobHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export async function enqueueJob(kind: string, payload: Record<string, unknown>, notBefore?: Date): Promise<number> {
  const [ins] = (await db.insert(BackgroundJob).values({ kind, payload, not_before: notBefore ?? new Date() })) as any;
  if (process.env.NODE_ENV !== "test") setImmediate(() => void runJobsOnce().catch(() => undefined));
  return ins.insertId as number;
}

let running = false;
let timer: NodeJS.Timeout | null = null;

/** Runs ready jobs one after another until none is ready. Returns how many ran. */
export async function runJobsOnce(now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  let ran = 0;
  try {
    // Restart recovery: a job left RUNNING by a dead process goes back to the queue.
    await db
      .update(BackgroundJob)
      .set({ status: "QUEUED", claimed_at: null })
      .where(and(eq(BackgroundJob.status, "RUNNING"), lte(BackgroundJob.heartbeat_at, new Date(now.getTime() - STALE_MS))));
    for (;;) {
      // +1 s: MySQL 5.7 rounds fractional seconds when storing "now" (see generation worker).
      const [job] = await db
        .select()
        .from(BackgroundJob)
        .where(and(eq(BackgroundJob.status, "QUEUED"), lte(BackgroundJob.not_before, new Date(now.getTime() + 1000))))
        .orderBy(BackgroundJob.job_id)
        .limit(1);
      if (!job) break;
      const [claimed] = (await db
        .update(BackgroundJob)
        .set({ status: "RUNNING", attempts: sql`${BackgroundJob.attempts} + 1`, claimed_at: new Date(), heartbeat_at: new Date() })
        .where(and(eq(BackgroundJob.job_id, job.job_id), eq(BackgroundJob.status, "QUEUED")))) as any;
      if ((claimed?.affectedRows ?? 0) !== 1) continue;
      ran += 1;
      const handler = handlers.get(job.kind);
      const beat = setInterval(() => {
        void db.update(BackgroundJob).set({ heartbeat_at: new Date() }).where(eq(BackgroundJob.job_id, job.job_id)).catch(() => undefined);
      }, 30_000);
      try {
        if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
        await handler(job.payload);
        await db.update(BackgroundJob).set({ status: "SUCCEEDED", finished_at: new Date(), last_error: null }).where(eq(BackgroundJob.job_id, job.job_id));
      } catch (error: any) {
        const attempts = job.attempts + 1;
        logger.warn("[jobs] job failed", { job_id: job.job_id, kind: job.kind, attempts, error: error?.message });
        await db
          .update(BackgroundJob)
          .set(
            attempts >= MAX_ATTEMPTS || error?.permanent
              ? { status: "FAILED", finished_at: new Date(), last_error: String(error?.message || error).slice(0, 1000) }
              : { status: "QUEUED", not_before: new Date(Date.now() + 60_000), last_error: String(error?.message || error).slice(0, 1000) },
          )
          .where(eq(BackgroundJob.job_id, job.job_id));
      } finally {
        clearInterval(beat);
      }
    }
  } finally {
    running = false;
  }
  return ran;
}

export function startJobWorker(): void {
  if (timer) return;
  timer = setInterval(() => void runJobsOnce().catch((error) => logger.error("[jobs] tick failed", { error })), 15_000);
  timer.unref();
  setTimeout(() => void runJobsOnce().catch(() => undefined), 8000).unref();
}

/** Tests: is anything still queued for these kinds? */
export async function pendingJobs(kinds: string[]): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(BackgroundJob)
    .where(and(inArray(BackgroundJob.kind, kinds), inArray(BackgroundJob.status, ["QUEUED", "RUNNING"])));
  return Number(row?.n ?? 0);
}
