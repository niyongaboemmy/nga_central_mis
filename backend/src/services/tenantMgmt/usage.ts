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

/** Distinct people who signed in during the last `days` days (AuthEvent). */
export async function activeUsers(tid: number, days = 7, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - days * 86_400_000);
  return scalar(tid, "SELECT COUNT(DISTINCT user_id) AS n FROM AuthEvent WHERE outcome = 'success' AND user_id IS NOT NULL AND occurred_at >= ?", [since]);
}

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

/** `TenantUsage`: meters + the last 30 days of TenantUsageDaily. */
export async function tenantUsage(tid: number, ent?: Entitlements): Promise<TenantUsage> {
  const meters = await usageMeters(tid, ent);
  let rows: RowDataPacket[] = [];
  try {
    [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT day, active_users, ai_requests, code_runs, storage_mb FROM TenantUsageDaily WHERE tenant_id = ? ORDER BY day DESC LIMIT 30",
      [tid],
    );
  } catch {
    rows = [];
  }
  return {
    meters,
    daily: rows
      .map((r) => ({
        day: dateStr(r.day),
        activeUsers: Number(r.active_users),
        aiRequests: Number(r.ai_requests),
        codeRuns: Number(r.code_runs),
        storageMb: Number(r.storage_mb),
      }))
      .reverse(),
  };
}

/** Is tenant `tid` known (and its DB name resolvable by poolFor)? */
export async function ensureTenantKnown(tid: number): Promise<boolean> {
  return Boolean(await getTenant(tid).catch(() => null));
}
