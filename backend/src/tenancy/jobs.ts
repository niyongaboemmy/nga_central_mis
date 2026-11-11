/**
 * Background jobs per tenant (MIS-A15, MULTI_TENANCY_GAP_FIX_PLAN.md Phase 3 §6).
 *
 * tenantJob(name, body) returns a tick function for setInterval/setTimeout:
 *   - it runs `body` once for every schedulable tenant (ACTIVE + GRACE) inside
 *     that tenant's context (forEachActiveTenant), so `db`, caches and the
 *     timezone all speak for that school;
 *   - one tenant's failure is logged and never stops the others;
 *   - the lock is keyed (job, tid): a slow tick for one school never overlaps
 *     itself, and never blocks another school's tick;
 *   - with more than one tenant, each run waits a small random jitter
 *     (TENANCY_JOB_JITTER_MS, default 250 ms) so 30 schools don't hit the
 *     database in the same millisecond.
 */
import { TenantCtx } from "../vendor/nga-tenancy";
import { listTenants, forEachActiveTenant } from "./registry";
import { isTenantSchedulable } from "../vendor/nga-tenancy";

export interface TenantJobOptions {
  /** Upper bound of the per-tenant random delay; 0 disables it. */
  jitterMs?: number;
  /** Called with each failure (default: logger.error). */
  onError?: (tenant: TenantCtx, err: unknown) => void;
}

export interface TenantJobResult {
  ran: number[];
  failed: number[];
  skipped: number[];
}

const locks = new Set<string>();
const lockKey = (job: string, tid: number) => `${job}:${tid}`;

/** Is (job, tid) running right now? (tests, status pages) */
export function isJobRunning(job: string, tid: number): boolean {
  return locks.has(lockKey(job, tid));
}

const defaultJitter = () => {
  const n = Number(process.env.TENANCY_JOB_JITTER_MS);
  return Number.isFinite(n) && n >= 0 ? n : 250;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref?.());

function logFailure(job: string, tenant: TenantCtx, err: unknown) {
  // Lazy: logger pulls in config.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const logger = require("../utils/logger").default;
  logger.error(`[jobs] ${job} failed for tenant ${tenant.tid} (${tenant.slug})`, { error: err });
}

/** Run `body` once per schedulable tenant now (see the file header). */
export async function runForEachTenant(
  job: string,
  body: (tenant: TenantCtx) => unknown,
  opts: TenantJobOptions = {},
): Promise<TenantJobResult> {
  const result: TenantJobResult = { ran: [], failed: [], skipped: [] };
  const jitter = opts.jitterMs ?? defaultJitter();
  let multi = false;
  try {
    multi = (await listTenants()).filter((t) => isTenantSchedulable(t.status)).length > 1;
  } catch {
    multi = false;
  }
  await forEachActiveTenant(
    async (tenant) => {
      const key = lockKey(job, tenant.tid);
      if (locks.has(key)) {
        result.skipped.push(tenant.tid);
        return;
      }
      locks.add(key);
      try {
        if (multi && jitter > 0) await sleep(Math.floor(Math.random() * jitter));
        await body(tenant);
        result.ran.push(tenant.tid);
      } finally {
        locks.delete(key);
      }
    },
    {
      onError: (tenant, err) => {
        result.failed.push(tenant.tid);
        (opts.onError ?? ((t, e) => logFailure(job, t, e)))(tenant, err);
      },
    },
  );
  return result;
}

/** A tick function for timers: () => runForEachTenant(job, body). Never rejects. */
export function tenantJob(
  job: string,
  body: (tenant: TenantCtx) => unknown,
  opts: TenantJobOptions = {},
): () => Promise<TenantJobResult> {
  return () =>
    runForEachTenant(job, body, opts).catch((err) => {
      // The registry itself failed (it has a fallback, so this is rare).
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../utils/logger").default.error(`[jobs] ${job} tick failed`, { error: err });
      return { ran: [], failed: [], skipped: [] };
    });
}
