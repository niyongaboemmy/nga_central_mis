/**
 * Platform console: KPIs (frontend `PlatformOverview`), platform staff,
 * platform settings and the platform audit log. Aggregates only -- no school data.
 */
import { RowDataPacket } from "mysql2/promise";
import { sql } from "drizzle-orm";
import { controlPool } from "../../db/platform";
import { primaryDb } from "../../db";
import { ValidationError } from "../../errors/CustomError";
import { platformAudit } from "../../tenancy/audit";
import { PRIMARY_TENANT_ID } from "../../vendor/nga-tenancy";
import { APPLICATION_STATUSES, TENANT_LIFECYCLE } from "./stateMachine";
import { PLATFORM_CAP_LIST } from "./catalog";
import { PLATFORM_SETTING_DEFAULTS, PlatformSettingKey, getPlatformSettings, setPlatformSetting } from "./settings";
import { staffNames } from "./review";
import { coded } from "./billing";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week holding `d`. */
function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

export async function overview(callerCaps: string[]) {
  const pool = controlPool();
  const applications = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  const [appRows] = await pool.query<RowDataPacket[]>("SELECT status, COUNT(*) AS n FROM TenantApplication GROUP BY status");
  for (const r of appRows) if (String(r.status) in applications) applications[String(r.status)] = Number(r.n);

  const tenants = Object.fromEntries(TENANT_LIFECYCLE.map((s) => [s, 0])) as Record<string, number>;
  const [tRows] = await pool.query<RowDataPacket[]>("SELECT status, COUNT(*) AS n FROM Tenant GROUP BY status");
  for (const r of tRows) if (String(r.status) in tenants) tenants[String(r.status)] = Number(r.n);

  const [[awaiting]] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM Invoice WHERE status IN ('ISSUED','OVERDUE')");
  const [[toConfirm]] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM Payment WHERE status = 'SUBMITTED'");
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * DAY_MS);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const [[expiring]] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT tenant_id) AS n FROM Subscription WHERE status = 'ACTIVE' AND period_end >= ? AND period_end <= ?",
    [ymd(now), ymd(in30)],
  );
  const fourMonthsAgo = new Date(now);
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
  const [[revenue]] = await pool.query<RowDataPacket[]>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM Payment WHERE status = 'CONFIRMED' AND is_waiver = 0 AND reviewed_at >= ?",
    [fourMonthsAgo],
  );

  const first = weekStart(new Date(now.getTime() - 11 * 7 * DAY_MS));
  const trend = Array.from({ length: 12 }, (_, i) => ({ week: ymd(new Date(first.getTime() + i * 7 * DAY_MS)), submitted: 0, activated: 0 }));
  const bucket = (d: any) => {
    const i = Math.floor((weekStart(new Date(d)).getTime() - first.getTime()) / (7 * DAY_MS));
    return i >= 0 && i < 12 ? trend[i] : null;
  };
  const [sub] = await pool.query<RowDataPacket[]>("SELECT submitted_at FROM TenantApplication WHERE submitted_at >= ?", [first]);
  for (const r of sub) {
    const b = bucket(r.submitted_at);
    if (b) b.submitted++;
  }
  const [act] = await pool.query<RowDataPacket[]>("SELECT activated_at FROM Tenant WHERE activated_at >= ? AND is_primary = 0", [first]);
  for (const r of act) {
    const b = bucket(r.activated_at);
    if (b) b.activated++;
  }

  return {
    applications,
    awaitingPayment: Number(awaiting.n),
    paymentsToConfirm: Number(toConfirm.n),
    provisioningFailures: applications.PROVISIONING_FAILED ?? 0,
    tenants,
    expiringIn30Days: Number(expiring.n),
    revenueThisTerm: Number(revenue.total),
    currency: "RWF",
    trend,
    caps: callerCaps,
  };
}

/** Primary-tenant users holding any PLATFORM_* capability, with which ones. */
export async function platformStaff(): Promise<Array<{ id: number; name: string; caps: string[] }>> {
  const rows = (await primaryDb().execute(sql`
    SELECT DISTINCT g.user_id AS id, p.name AS cap
      FROM AccessGrant g
      JOIN RolePermission rp ON rp.role_id = g.role_id
      JOIN Permission p ON p.perm_id = rp.perm_id
      JOIN \`User\` u ON u.user_id = g.user_id
     WHERE g.status = 'ACTIVE' AND u.status = 'ACTIVE'
       AND (g.valid_until IS NULL OR g.valid_until >= CURRENT_DATE())
       AND p.name IN (${sql.join(PLATFORM_CAP_LIST.map((c) => sql`${c}`), sql`, `)})`)) as any;
  const caps = new Map<number, Set<string>>();
  for (const r of rows[0] as RowDataPacket[]) {
    const id = Number(r.id);
    if (!caps.has(id)) caps.set(id, new Set());
    caps.get(id)!.add(String(r.cap));
  }
  const names = await staffNames([...caps.keys()]);
  return [...caps.entries()]
    .map(([id, c]) => ({ id, name: names.get(id) ?? `User ${id}`, caps: [...c].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Settings ------------------------------------------------------------------

export async function readSettings() {
  return getPlatformSettings();
}

/** Patch platform settings: only known keys, each with the type of its default. */
export async function saveSettings(patch: Record<string, unknown>, actorId: number | null) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw coded(new ValidationError("Send an object of settings."), "INVALID_SETTINGS");
  const clean: Array<[PlatformSettingKey, any]> = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in PLATFORM_SETTING_DEFAULTS)) throw coded(new ValidationError(`Unknown setting: ${key}`), "UNKNOWN_SETTING");
    const def = (PLATFORM_SETTING_DEFAULTS as any)[key];
    const bad = () => coded(new ValidationError(`Invalid value for ${key}.`), "INVALID_SETTING");
    if (typeof def === "number") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 3650) throw bad();
      clean.push([key as PlatformSettingKey, n]);
    } else if (typeof def === "boolean") {
      if (typeof value !== "boolean") throw bad();
      clean.push([key as PlatformSettingKey, value]);
    } else if (Array.isArray(def)) {
      if (!Array.isArray(value)) throw bad();
      const sample = def[0];
      const arr = value.map((v) => (typeof sample === "number" ? Number(v) : String(v)));
      if (typeof sample === "number" && arr.some((v) => !Number.isInteger(v) || (v as number) < 0)) throw bad();
      clean.push([key as PlatformSettingKey, arr]);
    } else {
      throw bad();
    }
  }
  for (const [k, v] of clean) await setPlatformSetting(k, v, actorId ?? undefined);
  void platformAudit({ action: "settings.update", actorUserId: actorId, payload: Object.fromEntries(clean) });
  return getPlatformSettings();
}

// Audit ---------------------------------------------------------------------

export async function auditLog(filters: { tid?: number; action?: string; before?: number; limit?: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filters.tid) {
    where.push("target_tid = ?");
    args.push(filters.tid);
  }
  if (filters.action) {
    where.push("action LIKE ?");
    args.push(`${String(filters.action).replace(/[%_]/g, "\\$&")}%`);
  }
  if (filters.before) {
    where.push("audit_id < ?");
    args.push(filters.before);
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT * FROM PlatformAudit${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY audit_id DESC LIMIT ${limit}`,
    args,
  );
  const names = await staffNames(
    rows.filter((r) => r.actor_tid === null || Number(r.actor_tid) === PRIMARY_TENANT_ID).map((r) => (r.actor_user_id === null ? null : Number(r.actor_user_id))),
  );
  return rows.map((r) => ({
    id: Number(r.audit_id),
    at: new Date(r.at).toISOString(),
    action: String(r.action),
    actor:
      r.actor_user_id === null
        ? null
        : r.actor_tid === null || Number(r.actor_tid) === PRIMARY_TENANT_ID
          ? names.get(Number(r.actor_user_id)) ?? `User ${r.actor_user_id}`
          : `Tenant ${r.actor_tid} · user ${r.actor_user_id}`,
    targetTid: r.target_tid === null ? null : Number(r.target_tid),
    payload: typeof r.payload === "string" ? safeJson(r.payload) : r.payload ?? null,
  }));
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};
