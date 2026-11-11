/**
 * MIS side of the tenant context (contract: packages/tenancy/CONTRACT.md).
 *
 * The context itself is the shared core's AsyncLocalStorage (vendor/nga-tenancy).
 * This file adds what only the MIS needs:
 *   - the TENANCY_MODE switch (shadow | enforce) deciding what data access does
 *     when no tenant context is set,
 *   - runAsPlatform() for control-plane-only code,
 *   - the env knobs read in one place.
 */
import {
  PRIMARY_TENANT_ID,
  TenantContextMissing,
  TenantCtx,
  currentTenantOrNull,
  runWithTenant,
} from "../vendor/nga-tenancy";

export type TenancyMode = "shadow" | "enforce";

let modeOverride: TenancyMode | null = null;

/**
 * shadow (default): data access without a tenant context logs once per call
 * site and uses the primary tenant, so existing single-school installs, job
 * loops not yet wrapped (Phase 3) and the test fixtures keep working.
 * enforce: data access without a context throws TenantContextMissing.
 */
export function tenancyMode(): TenancyMode {
  if (modeOverride) return modeOverride;
  return String(process.env.TENANCY_MODE || "").toLowerCase() === "enforce" ? "enforce" : "shadow";
}

/** Tests only: force a mode (null restores the env value). */
export function setTenancyMode(mode: TenancyMode | null): void {
  modeOverride = mode;
}

/**
 * TENANCY_LEGACY_DEFAULT_TID: the tenant a token without `tid` belongs to.
 * Default 1; "none" (or "0"/"off") rejects such tokens (401 TENANT_REQUIRED).
 */
export function legacyDefaultTid(): number | null {
  const raw = String(process.env.TENANCY_LEGACY_DEFAULT_TID ?? "").trim().toLowerCase();
  if (raw === "") return PRIMARY_TENANT_ID;
  if (raw === "none" || raw === "off" || raw === "0" || raw === "null") return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : PRIMARY_TENANT_ID;
}

/** TENANCY_REQUIRE_TENANT_HEADER=true: service calls without X-NGA-Tenant get 400. */
export function requireTenantHeader(): boolean {
  return String(process.env.TENANCY_REQUIRE_TENANT_HEADER || "").toLowerCase() === "true";
}

/** Control-plane database name (contract §7). */
export function platformDbName(): string {
  return process.env.PLATFORM_DB_NAME || "amashuri_platform";
}

/** The primary tenant's MIS database (in place: env DB_NAME). */
export function primaryDbName(): string {
  return process.env.DB_NAME || "nga_central_mis";
}

/** Default database name of tenant N when Tenant.mis_db_name is not set. */
export function defaultTenantDbName(tid: number): string {
  return `${primaryDbName()}_t${tid}`;
}

// ---------------------------------------------------------------------------
// Platform context
// ---------------------------------------------------------------------------

/**
 * Sentinel context for code that works on the control plane only (tenant
 * lists, provisioning, fan-out readers). Inside it the tenant-routed `db`
 * refuses to run -- in every mode -- until the code enters a real tenant with
 * runWithTenant(). tid 0 is never a real tenant (the contract's ids are > 0),
 * so tenantKey() inside it yields "t0:..." and can't collide with a school.
 */
export const PLATFORM_CTX: TenantCtx = Object.freeze({
  tid: 0,
  slug: "platform",
  name: "Platform",
  status: "ACTIVE",
  isPrimary: false,
  timezone: "UTC",
  pkg: "platform",
}) as TenantCtx;

export function runAsPlatform<T>(fn: () => T): T {
  return runWithTenant(PLATFORM_CTX, fn);
}

export function isPlatformContext(): boolean {
  return currentTenantOrNull() === PLATFORM_CTX;
}

/** The current real tenant (not the platform sentinel), or null. */
export function currentRealTenantOrNull(): TenantCtx | null {
  const t = currentTenantOrNull();
  return t && t !== PLATFORM_CTX ? t : null;
}

// ---------------------------------------------------------------------------
// The one rule every tenant-routed resource uses
// ---------------------------------------------------------------------------

const warned = new Set<string>();

function callSite(): string {
  const stack = new Error().stack?.split("\n") ?? [];
  // 0 "Error", 1 callSite, 2 resolveDataTid, 3 the router (db proxy / pool), 4+ the caller.
  const frame = stack.slice(4).find((l) => !l.includes("node_modules") && !l.includes("/tenancy/") && !l.includes("/db/index"));
  return (frame ?? stack[4] ?? "unknown").trim();
}

function shadowWarn(what: string): void {
  if (process.env.NODE_ENV === "test" && process.env.TENANCY_WARN !== "1") return;
  const site = callSite();
  if (warned.has(site)) return;
  if (warned.size > 500) return;
  warned.add(site);
  // Lazy import: logger pulls in config, which must not load before env is set.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const logger = require("../utils/logger").default;
  logger.warn(`[tenancy] ${what} without a tenant context; using the primary tenant (TENANCY_MODE=shadow) at ${site}`);
}

/**
 * The tenant id data access should use right now.
 * - inside a tenant context: that tenant;
 * - inside runAsPlatform(): throws (always);
 * - no context: throws in enforce mode, primary tenant in shadow mode.
 */
export function resolveDataTid(what = "database access"): number {
  const t = currentTenantOrNull();
  if (t && t !== PLATFORM_CTX) return t.tid;
  if (t === PLATFORM_CTX) throw new TenantContextMissing(`${what} (inside runAsPlatform)`);
  if (tenancyMode() === "enforce") throw new TenantContextMissing(what);
  shadowWarn(what);
  return PRIMARY_TENANT_ID;
}
