/**
 * Effective entitlements of a tenant (plan §3.1): package entitlements plus
 * live, unexpired TenantEntitlementOverride rows. Cached per tenant (30 s, and
 * dropped by invalidateEntitlements on any package / override change).
 *
 * Without a control plane (single-school install, most of the test suite) a
 * tenant is UNRESTRICTED: every app and feature, no limits -- nothing that worked
 * before multi-tenancy may stop working because a table is missing.
 */
import { RowDataPacket } from "mysql2/promise";
import { controlPool, isControlPlaneMissing } from "../../db/platform";
import { currentTenantOrNull } from "../../vendor/nga-tenancy";
import { APP_KEYS, FEATURES, LIMITS, featureOfCapability, isPlatformCap } from "./catalog";

export interface Entitlements {
  tid: number;
  pkg: string;
  /** true = no control plane: everything allowed, nothing limited. */
  unrestricted: boolean;
  apps: string[];
  features: string[];
  /** limit key -> value (null = unlimited). A limit missing from the map is unlimited. */
  limits: Record<string, number | null>;
}

const TTL_MS = parseInt(process.env.ENTITLEMENTS_TTL_MS || "30000", 10);
const cache = new Map<number, { at: number; ent: Entitlements }>();

export function unrestrictedEntitlements(tid: number, pkg = "max"): Entitlements {
  return {
    tid,
    pkg,
    unrestricted: true,
    apps: Object.keys(APP_KEYS),
    features: Object.keys(FEATURES),
    limits: Object.fromEntries(Object.keys(LIMITS).map((k) => [k, null])),
  };
}

export function invalidateEntitlements(tid?: number): void {
  if (tid === undefined) cache.clear();
  else cache.delete(tid);
}

async function load(tid: number): Promise<Entitlements> {
  let tenantRows: RowDataPacket[];
  try {
    [tenantRows] = await controlPool().query<RowDataPacket[]>("SELECT package_code FROM Tenant WHERE tenant_id = ?", [tid]);
  } catch (err) {
    if (isControlPlaneMissing(err)) return unrestrictedEntitlements(tid);
    throw err;
  }
  const pkg = String(tenantRows[0]?.package_code ?? "max");
  let ents: RowDataPacket[] = [];
  let overrides: RowDataPacket[] = [];
  try {
    [ents] = await controlPool().query<RowDataPacket[]>(
      "SELECT ent_key, kind, value_int FROM PackageEntitlement WHERE package_code = ?",
      [pkg],
    );
    [overrides] = await controlPool().query<RowDataPacket[]>(
      "SELECT ent_key, value_int, enabled FROM TenantEntitlementOverride WHERE tenant_id = ? AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) ORDER BY id",
      [tid],
    );
  } catch (err) {
    // Control plane from before 002 (no Package tables yet): behave as before.
    if (isControlPlaneMissing(err) || (err as any)?.code === "ER_NO_SUCH_TABLE") return unrestrictedEntitlements(tid, pkg);
    throw err;
  }
  if (ents.length === 0 && !tenantRows.length) return unrestrictedEntitlements(tid, pkg);

  const apps = new Set<string>();
  const features = new Set<string>();
  const limits: Record<string, number | null> = {};
  for (const k of Object.keys(LIMITS)) limits[k] = 0; // a package that names no value grants none
  for (const e of ents) {
    const key = String(e.ent_key);
    if (e.kind === "APP") apps.add(key);
    else if (e.kind === "FEATURE") features.add(key);
    else if (e.kind === "LIMIT") limits[key] = e.value_int === null ? null : Number(e.value_int);
  }
  // Overrides apply in id order; the later one wins.
  for (const o of overrides) {
    const key = String(o.ent_key);
    const on = Number(o.enabled) === 1;
    if (key in LIMITS) limits[key] = o.value_int === null ? null : Number(o.value_int);
    else if (key in APP_KEYS) on ? apps.add(key) : apps.delete(key);
    else on ? features.add(key) : features.delete(key);
  }
  return { tid, pkg, unrestricted: false, apps: [...apps].sort(), features: [...features].sort(), limits };
}

/** The tenant's effective entitlements (cached). */
export async function resolveEntitlements(tid: number): Promise<Entitlements> {
  const hit = cache.get(tid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ent;
  const ent = await load(tid);
  cache.set(tid, { at: Date.now(), ent });
  return ent;
}

/** Entitlements of the tenant the current request / job runs in (unrestricted outside one). */
export async function currentEntitlements(): Promise<Entitlements> {
  const t = currentTenantOrNull();
  return t ? resolveEntitlements(t.tid) : unrestrictedEntitlements(0);
}

export const hasFeature = (ent: Entitlements, feature: string) => ent.unrestricted || ent.features.includes(feature);
export const hasApp = (ent: Entitlements, app: string) => ent.unrestricted || ent.apps.includes(app);

/**
 * May a tenant with these entitlements hold capability `cap` of access app `app`?
 * Platform capabilities are a separate rule (primary tenant only): see allowsPlatformCap.
 */
export function allowsCapability(ent: Entitlements, app: string, cap: string, isPrimary: boolean): boolean {
  if (isPlatformCap(cap)) return isPrimary;
  if (ent.unrestricted) return true;
  const appKey = Object.entries(APP_KEYS).find(([, v]) => v.accessApp === app)?.[0];
  if (appKey && !ent.apps.includes(appKey)) return false;
  const feature = featureOfCapability(app, cap);
  return feature === null || ent.features.includes(feature);
}

export interface LimitCheck {
  ok: boolean;
  key: string;
  limit: number | null;
  used: number;
  /** used / limit >= 0.9 after this change */
  warn: boolean;
  message?: string;
}

/**
 * Would `used + delta` stay within limit `key`? Callers pass the current count
 * (students, staff, storage) -- consumable limits use consume() below.
 */
export function checkLimit(ent: Entitlements, key: string, used: number, delta = 1): LimitCheck {
  const limit = ent.unrestricted ? null : key in ent.limits ? ent.limits[key] : null;
  if (limit === null) return { ok: true, key, limit, used, warn: false };
  const next = used + delta;
  const ok = next <= limit;
  const label = LIMITS[key]?.label ?? key;
  return {
    ok,
    key,
    limit,
    used,
    warn: limit > 0 && next / limit >= 0.9,
    message: ok ? undefined : `${label}: your package allows ${limit}. Upgrade to add more.`,
  };
}

function periodOf(key: string, now = new Date()): string {
  const iso = now.toISOString();
  return LIMITS[key]?.consumable === "month" ? iso.slice(0, 7) : iso.slice(0, 10);
}

/**
 * Consume `n` units of a consumable limit (AI requests, code runs, meeting
 * minutes) for tenant `tid`. Refuses -- and records nothing -- when it would go
 * over. Fails open when the control plane is unavailable.
 */
export async function consume(tid: number, key: string, n = 1): Promise<LimitCheck> {
  const ent = await resolveEntitlements(tid);
  const limit = ent.unrestricted ? null : key in ent.limits ? ent.limits[key] : null;
  const period = periodOf(key);
  try {
    if (limit === null) {
      await controlPool().query(
        "INSERT INTO TenantUsageCounter (tenant_id, ent_key, period, used) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE used = used + VALUES(used)",
        [tid, key, period, n],
      );
      return { ok: true, key, limit, used: 0, warn: false };
    }
    await controlPool().query("INSERT IGNORE INTO TenantUsageCounter (tenant_id, ent_key, period, used) VALUES (?, ?, ?, 0)", [tid, key, period]);
    const [r] = await controlPool().query<any>(
      "UPDATE TenantUsageCounter SET used = used + ? WHERE tenant_id = ? AND ent_key = ? AND period = ? AND used + ? <= ?",
      [n, tid, key, period, n, limit],
    );
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT used FROM TenantUsageCounter WHERE tenant_id = ? AND ent_key = ? AND period = ?",
      [tid, key, period],
    );
    const used = Number(rows[0]?.used ?? 0);
    const ok = Number(r?.affectedRows ?? 0) > 0;
    const label = LIMITS[key]?.label ?? key;
    return {
      ok,
      key,
      limit,
      used,
      warn: limit > 0 && used / limit >= 0.9,
      message: ok ? undefined : `${label}: today's allowance (${limit}) is used up.`,
    };
  } catch (err) {
    if (isControlPlaneMissing(err) || (err as any)?.code === "ER_NO_SUCH_TABLE") return { ok: true, key, limit, used: 0, warn: false };
    throw err;
  }
}

/** Current usage of a consumable limit this period. */
export async function usedThisPeriod(tid: number, key: string): Promise<number> {
  try {
    const [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT used FROM TenantUsageCounter WHERE tenant_id = ? AND ent_key = ? AND period = ?",
      [tid, key, periodOf(key)],
    );
    return Number(rows[0]?.used ?? 0);
  } catch {
    return 0;
  }
}

/** Express body for a refused limit (HTTP 402 is reserved; we answer 403 + code). */
export const limitRefusal = (c: LimitCheck) => ({
  success: false,
  code: "PACKAGE_LIMIT",
  limit: c.key,
  max: c.limit,
  used: c.used,
  message: c.message ?? "Your package limit is reached.",
});

export const featureRefusal = (feature: string) => ({
  success: false,
  code: "PACKAGE_FEATURE",
  feature,
  message: `${FEATURES[feature] ?? feature} is not in your package.`,
});
