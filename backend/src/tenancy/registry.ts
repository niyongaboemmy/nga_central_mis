/**
 * The MIS tenant registry: a cached view of the control plane's Tenant table.
 *
 * If the control plane is not provisioned on this server (no PLATFORM_DB_NAME
 * database, or no Tenant table), or holds no tenants yet, the registry answers
 * [primaryTenantCtx()] -- an existing single-school install and the test suite
 * keep working unchanged.
 */
import {
  PRIMARY_TENANT_ID,
  TenantCtx,
  TenantRegistry,
  TenantStatus,
  TENANT_STATUSES,
  ForEachTenantOptions,
  forEachActiveTenant as coreForEachActiveTenant,
  normalizeTenant,
  primaryTenantCtx,
} from "../vendor/nga-tenancy";
import { controlPool, isControlPlaneMissing } from "../db/platform";
import { setTenantDbNames } from "./dbNames";

export interface TenantRecord {
  ctx: TenantCtx;
  misDbName: string | null;
  tmDbName: string | null;
  tendoDbPath: string | null;
}

let records = new Map<number, TenantRecord>();
let controlPlaneProvisioned: boolean | null = null;

function rowToRecord(row: any): TenantRecord | null {
  const status = String(row.status ?? "PENDING").toUpperCase() as TenantStatus;
  const ctx = normalizeTenant({
    tid: row.tenant_id,
    slug: row.slug,
    name: row.display_name,
    status: TENANT_STATUSES.includes(status) ? status : "PENDING",
    isPrimary: Number(row.tenant_id) === PRIMARY_TENANT_ID || Number(row.is_primary) === 1,
    timezone: row.timezone,
    pkg: row.package_code,
  });
  if (!ctx) return null;
  // Contract: tenant 1 is the primary tenant; nothing else may claim it.
  ctx.isPrimary = ctx.tid === PRIMARY_TENANT_ID;
  return { ctx, misDbName: row.mis_db_name ?? null, tmDbName: row.tm_db_name ?? null, tendoDbPath: row.tendo_db_path ?? null };
}

async function loadTenants(): Promise<TenantCtx[]> {
  let rows: any[] = [];
  try {
    const [result] = await controlPool().query(
      "SELECT tenant_id, slug, display_name, status, is_primary, package_code, timezone, mis_db_name, tm_db_name, tendo_db_path FROM Tenant ORDER BY tenant_id",
    );
    rows = result as any[];
    controlPlaneProvisioned = true;
  } catch (err) {
    if (!isControlPlaneMissing(err)) throw err;
    controlPlaneProvisioned = false;
    rows = [];
  }
  const next = new Map<number, TenantRecord>();
  for (const row of rows) {
    const rec = rowToRecord(row);
    if (rec) next.set(rec.ctx.tid, rec);
  }
  if (!next.has(PRIMARY_TENANT_ID)) {
    next.set(PRIMARY_TENANT_ID, { ctx: primaryTenantCtx(), misDbName: null, tmDbName: null, tendoDbPath: null });
  }
  records = next;
  setTenantDbNames(Array.from(next.values()).map((r) => [r.ctx.tid, r.misDbName] as [number, string | null]));
  return Array.from(next.values()).map((r) => r.ctx);
}

export const tenantRegistry = new TenantRegistry({
  load: loadTenants,
  ttlMs: parseInt(process.env.TENANCY_REGISTRY_TTL_MS || "30000", 10),
  fallback: [primaryTenantCtx()],
});

/** A tenant by id (null = unknown). */
export const getTenant = (tid: number): Promise<TenantCtx | null> => tenantRegistry.get(tid);

/** Every tenant, every status, ordered by id (GET /platform/tenants/active). */
export const listTenants = (): Promise<TenantCtx[]> => tenantRegistry.list();

export async function getTenantBySlug(slug: string): Promise<TenantCtx | null> {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  return (await listTenants()).find((t) => t.slug.toLowerCase() === s) ?? null;
}

/** "7", 7 or "gs-kicukiro" -> tenant. */
export async function findTenant(ref: unknown): Promise<TenantCtx | null> {
  if (ref === null || ref === undefined || ref === "") return null;
  const n = Number(ref);
  if (Number.isSafeInteger(n) && n > 0) return getTenant(n);
  return getTenantBySlug(String(ref));
}

/** The registry's record (db names) for a tenant; call after a get()/list(). */
export function tenantRecord(tid: number): TenantRecord | null {
  return records.get(tid) ?? null;
}

/** true/false once the registry has tried the control plane; null before. */
export const isControlPlaneProvisioned = () => controlPlaneProvisioned;

/** Drop the cache (after provisioning / status changes, and in tests). */
export function invalidateTenants(): void {
  tenantRegistry.invalidate();
}

/**
 * Run `fn` once per schedulable tenant (ACTIVE + GRACE) inside its context;
 * one tenant's failure never stops the others (Phase 3: wrap job loops).
 */
export function forEachActiveTenant(
  fn: (tenant: TenantCtx) => Promise<void> | void,
  opts?: ForEachTenantOptions,
): Promise<TenantCtx[]> {
  return coreForEachActiveTenant(tenantRegistry, fn, opts);
}
