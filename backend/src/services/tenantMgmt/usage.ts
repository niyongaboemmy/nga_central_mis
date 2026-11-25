/**
 * Tenant usage (plan §6.7, M6): live counts for the limit meters, the nightly
 * TenantUsageDaily fan-out, and the serialised `TenantUsage` / `UsageMeter`
 * shapes of frontend/src/api/tenantMgmt.ts.
 *
 * Aggregates only (§6.9 / §10): counts and sums, never a person's data.
 * Every tenant-DB read goes through that tenant's own pool (poolFor), so the
 * fan-out never depends on the request's context.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { poolFor } from "../../db/pools";
import { forEachActiveTenant, getTenant } from "../../tenancy/registry";
import logger from "../../utils/logger";
import { LIMITS } from "./catalog";
import { Entitlements, resolveEntitlements, usedThisPeriod } from "./entitlements";
import { dateOnly } from "./subscription";

export interface UsageMeter {
  key: string;
  label: string;
  unit: string;
  used: number;
  limit: number | null;
  ratio: number | null;
}

export interface TenantUsage {
  meters: UsageMeter[];
  daily: Array<{ day: string; activeUsers: number; aiRequests: number; codeRuns: number; storageMb: number }>;
}

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const dateStr = (v: any): string => dateOnly(v);

async function scalar(tid: number, q: string, params: unknown[] = []): Promise<number> {
  try {
    const [rows] = await poolFor(tid).query<RowDataPacket[]>(q, params);
    return Number(rows[0]?.n ?? 0) || 0;
  } catch {
    return 0; // table missing in an older tenant DB: count nothing
  }
}

/** ACTIVE students and staff (teachers, admins, staff) of tenant `tid`. */
export async function liveCounts(tid: number): Promise<{ students: number; staff: number }> {
  const students = await scalar(
    tid,
    "SELECT COUNT(DISTINCT u.user_id) AS n FROM `User` u JOIN UserProfile p ON p.user_id = u.user_id WHERE u.status = 'ACTIVE' AND p.user_type = 'STUDENT'",
  );
  const staff = await scalar(
    tid,
    "SELECT COUNT(DISTINCT u.user_id) AS n FROM `User` u JOIN UserProfile p ON p.user_id = u.user_id WHERE u.status = 'ACTIVE' AND p.user_type IN ('TEACHER','ADMIN','STAFF')",
  );
  return { students, staff };
}

/** Stored bytes the school's records point at (documents + file assets), in MB. */
export async function measureStorageMb(tid: number): Promise<number> {
  const docs = await scalar(tid, "SELECT COALESCE(SUM(file_size), 0) AS n FROM Document");
  const assets = await scalar(tid, "SELECT COALESCE(SUM(size_bytes), 0) AS n FROM FileAsset WHERE deleted_at IS NULL");
  return Math.round((docs + assets) / (1024 * 1024));
}

/**
 * Distinct people active during the last `days` days: anyone who used an app (an
 * AnalyticsSession with activity in the window, bots excluded) or signed in (AuthEvent).
 * Sign-ins alone undercount: a person who stays signed in for a week never signs in again.
 * A tenant DB without the analytics tables falls back to sign-ins.
 */
export async function activeUsers(tid: number, days = 7, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - days * 86_400_000);
  try {
    const [rows] = await poolFor(tid).query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT user_id) AS n FROM (
         SELECT user_id FROM AnalyticsSession WHERE user_id IS NOT NULL AND is_bot = 0 AND last_activity_at >= ?
         UNION
         SELECT user_id FROM AuthEvent WHERE outcome = 'success' AND user_id IS NOT NULL AND occurred_at >= ?
       ) x`,
      [since, since],
    );
    return Number(rows[0]?.n ?? 0) || 0;
  } catch {
    return scalar(tid, "SELECT COUNT(DISTINCT user_id) AS n FROM AuthEvent WHERE outcome = 'success' AND user_id IS NOT NULL AND occurred_at >= ?", [since]);
  }
}

/** Distinct active people per calendar day (UTC) for the last `days` days, same rule as activeUsers. */
async function activePerDay(tid: number, days: number, now: Date): Promise<Map<string, number>> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000);
  const run = async (q: string, params: unknown[]) => {
    const [rows] = await poolFor(tid).query<RowDataPacket[]>(q, params);
    return new Map(rows.map((r) => [String(r.d), Number(r.n) || 0]));
  };
  try {
    return await run(
      `SELECT d, COUNT(DISTINCT user_id) AS n FROM (
         SELECT DATE_FORMAT(started_at, '%Y-%m-%d') AS d, user_id FROM AnalyticsSession
          WHERE user_id IS NOT NULL AND is_bot = 0 AND last_activity_at >= ?
         UNION
         SELECT DATE_FORMAT(last_activity_at, '%Y-%m-%d') AS d, user_id FROM AnalyticsSession
          WHERE user_id IS NOT NULL AND is_bot = 0 AND last_activity_at >= ?
         UNION
         SELECT DATE_FORMAT(occurred_at, '%Y-%m-%d') AS d, user_id FROM AuthEvent
          WHERE outcome = 'success' AND user_id IS NOT NULL AND occurred_at >= ?
       ) x GROUP BY d`,
      [since, since, since],
    );
  } catch {
    try {
      return await run(
        `SELECT DATE_FORMAT(occurred_at, '%Y-%m-%d') AS d, COUNT(DISTINCT user_id) AS n
           FROM AuthEvent WHERE outcome = 'success' AND user_id IS NOT NULL AND occurred_at >= ? GROUP BY d`,
        [since],
      );
    } catch {
      return new Map();
    }
  }
}

export interface LiveUsage {
  students: number;
  staff: number;
  storageMb: number;
  activeUsers7d: number;
  /** latest app activity or sign-in of anyone in the school */
  lastActivityAt: string | null;
  at: string;
}

async function lastActivity(tid: number): Promise<string | null> {
  const one = async (q: string) => {
    try {
      const [rows] = await poolFor(tid).query<RowDataPacket[]>(q);
      const v = rows[0]?.t;
      return v ? new Date(v) : null;
    } catch {
      return null;
    }
  };
  const [a, b] = await Promise.all([
    one("SELECT MAX(last_activity_at) AS t FROM AnalyticsSession WHERE user_id IS NOT NULL AND is_bot = 0"),
    one("SELECT MAX(occurred_at) AS t FROM AuthEvent WHERE outcome = 'success' AND user_id IS NOT NULL"),
  ]);
  const best = [a, b].filter((d): d is Date => !!d && !Number.isNaN(d.getTime())).sort((x, y) => y.getTime() - x.getTime())[0];
  return best ? best.toISOString() : null;
}

const LIVE_TTL_MS = 60_000;
const liveCache = new Map<number, { at: number; value: Promise<LiveUsage> }>();

/**
 * Current usage of a school, read from its own database (cached for a minute). Lists and
 * dashboards use this instead of the nightly TenantUsageDaily row, which can be up to a day
 * old and is missing for a school the job has not reached yet.
 */
export function liveUsage(tid: number, now = new Date()): Promise<LiveUsage> {
  const hit = liveCache.get(tid);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
  const value = (async () => {
    const [{ students, staff }, storageMb, active, last] = await Promise.all([liveCounts(tid), measureStorageMb(tid), activeUsers(tid, 7, now), lastActivity(tid)]);
    return { students, staff, storageMb, activeUsers7d: active, lastActivityAt: last, at: now.toISOString() };
  })();
  liveCache.set(tid, { at: Date.now(), value });
  value.catch(() => liveCache.delete(tid));
  return value;
}

/** Drop the cached live usage (tests; after a big import). */
export const forgetLiveUsage = (tid?: number) => (tid === undefined ? liveCache.clear() : liveCache.delete(tid));

/** The latest TenantUsageDaily row of a tenant (or null). */
export async function latestDaily(tid: number): Promise<RowDataPacket | null> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM TenantUsageDaily WHERE tenant_id = ? ORDER BY day DESC LIMIT 1", [tid]);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

async function counterFor(tid: number, key: string, period: string): Promise<number> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT used FROM TenantUsageCounter WHERE tenant_id = ? AND ent_key = ? AND period = ?",
      [tid, key, period],
    );
    return Number(rows[0]?.used ?? 0);
  } catch {
    return 0;
  }
}

/** Write (or refresh) tenant `tid`'s TenantUsageDaily row for `now`'s day. */
export async function snapshotUsage(tid: number, now = new Date()): Promise<void> {
  const day = dayOf(now);
  const { students, staff } = await liveCounts(tid);
  const storage = await measureStorageMb(tid);
  const ai = await counterFor(tid, "limit.ai_requests_day", day);
  const runs = await counterFor(tid, "limit.code_runs_day", day);
  const minutes = await counterFor(tid, "limit.tupo_meeting_minutes_month", day.slice(0, 7));
  const active = await activeUsers(tid, 7, now);
  await controlPool().query(
    `INSERT INTO TenantUsageDaily (tenant_id, day, students, staff, storage_mb, ai_requests, code_runs, meeting_minutes, active_users)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE students = VALUES(students), staff = VALUES(staff), storage_mb = VALUES(storage_mb),
       ai_requests = VALUES(ai_requests), code_runs = VALUES(code_runs), meeting_minutes = VALUES(meeting_minutes), active_users = VALUES(active_users)`,
    [tid, day, students, staff, storage, ai, runs, minutes, active],
  );
}

/** Nightly fan-out: one TenantUsageDaily row per schedulable tenant (ACTIVE + GRACE). */
export async function runUsageFanout(now = new Date()): Promise<{ tenants: number; failed: number }> {
  let tenants = 0;
  let failed = 0;
  await forEachActiveTenant(
    async (t) => {
      await snapshotUsage(t.tid, now);
      tenants++;
    },
    {
      onError: (t, err) => {
        failed++;
        logger.error("[tenantMgmt] usage snapshot failed", { tid: t.tid, error: err });
      },
    },
  );
  return { tenants, failed };
}

const meter = (key: string, used: number, ent: Entitlements): UsageMeter => {
  const def = LIMITS[key];
  const limit = ent.unrestricted ? null : key in ent.limits ? ent.limits[key] : null;
  return {
    key,
    label: def?.label ?? key,
    unit: def?.unit ?? "",
    used,
    limit,
    ratio: limit === null ? null : limit === 0 ? (used > 0 ? 1 : 0) : Math.min(1, Math.round((used / limit) * 1000) / 1000),
  };
};

/** Every limit meter of a tenant: live people counts, storage, today's consumables. */
export async function usageMeters(tid: number, ent?: Entitlements): Promise<UsageMeter[]> {
  const e = ent ?? (await resolveEntitlements(tid));
  const { students, staff } = await liveCounts(tid);
  const latest = await latestDaily(tid);
  const storageGb = Math.round((Number(latest?.storage_mb ?? 0) / 1024) * 100) / 100;
  return [
    meter("limit.students", students, e),
    meter("limit.staff", staff, e),
    meter("limit.storage_gb", storageGb, e),
    meter("limit.ai_requests_day", await usedThisPeriod(tid, "limit.ai_requests_day"), e),
    meter("limit.code_runs_day", await usedThisPeriod(tid, "limit.code_runs_day"), e),
    meter("limit.tupo_meeting_minutes_month", await usedThisPeriod(tid, "limit.tupo_meeting_minutes_month"), e),
  ];
}

/** Meters at 90 % or more (banner warnings). */
export const nearLimit = (meters: UsageMeter[]) => meters.filter((m) => m.ratio !== null && m.limit !== null && m.limit > 0 && m.ratio >= 0.9);

/**
 * `TenantUsage`: meters + the last 30 days, one entry per calendar day (oldest first):
 * people active that day (activePerDay), that day's AI requests and code runs from the
 * usage counters (the full day, not the moment the nightly snapshot ran), and storage
 * from the snapshot of that day when there is one (carried forward otherwise).
 */
export async function tenantUsage(tid: number, ent?: Entitlements, now = new Date()): Promise<TenantUsage> {
  const DAYS = 30;
  const meters = await usageMeters(tid, ent);
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (DAYS - 1) * 86_400_000);
  const days = Array.from({ length: DAYS }, (_, i) => dayOf(new Date(first.getTime() + i * 86_400_000)));
  const active = await activePerDay(tid, DAYS, now);
  const counters = new Map<string, number>();
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT ent_key, period, used FROM TenantUsageCounter WHERE tenant_id = ? AND ent_key IN ('limit.ai_requests_day','limit.code_runs_day') AND period >= ?",
      [tid, days[0]],
    );
    for (const r of rows) counters.set(`${r.ent_key}|${String(r.period)}`, Number(r.used) || 0);
  } catch {
    /* no counters table: zeros */
  }
  const storage = new Map<string, number>();
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT day, storage_mb FROM TenantUsageDaily WHERE tenant_id = ? AND day >= ?", [tid, days[0]]);
    for (const r of rows) storage.set(dateStr(r.day), Number(r.storage_mb) || 0);
  } catch {
    /* no snapshots */
  }
  let lastStorage = Number((await latestDaily(tid))?.storage_mb ?? 0);
  const firstKnown = days.find((d) => storage.has(d));
  if (firstKnown) lastStorage = storage.get(firstKnown)!;
  const daily = days.map((day) => {
    if (storage.has(day)) lastStorage = storage.get(day)!;
    return {
      day,
      activeUsers: active.get(day) ?? 0,
      aiRequests: counters.get(`limit.ai_requests_day|${day}`) ?? 0,
      codeRuns: counters.get(`limit.code_runs_day|${day}`) ?? 0,
      storageMb: lastStorage,
    };
  });
  return { meters, daily };
}

/** Is tenant `tid` known (and its DB name resolvable by poolFor)? */
export async function ensureTenantKnown(tid: number): Promise<boolean> {
  return Boolean(await getTenant(tid).catch(() => null));
}
