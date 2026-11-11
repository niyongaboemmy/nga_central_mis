/**
 * Which Systems (SSO apps) a tenant may open (plan Phase 2 task 6, [MIS-A7/A9]).
 *
 * System rows are global (they still live in the primary tenant's database --
 * read them with primaryDb()). TenantSystem in the control plane assigns them
 * to tenants -- every tenant, the primary included: there is no implicit "all".
 * (A System assigned only to school B must never read NGA, and a call without
 * X-NGA-Tenant defaults to tenant 1 only for Systems explicitly assigned to it.)
 * The platform bootstrap writes tenant 1's rows for the Systems that existed
 * before multi-tenancy (bootstrap.ts, once); createSystem assigns new ones.
 *
 * Without a control plane at all (a single-school install that never ran the
 * bootstrap) there is only one school, so the primary keeps every System.
 */
import { and, eq } from "drizzle-orm";
import { TenantCtx } from "../vendor/nga-tenancy";
import { controlDb, isControlPlaneMissing } from "../db/platform";
import { TenantSystem } from "../db/platformSchema";
import { responseTenant } from "./claims";

/** The ACTIVE TenantSystem ids ("all" only for the primary of an install without a control plane). */
export async function assignedSystemIds(tenant: TenantCtx = responseTenant()): Promise<"all" | Set<number>> {
  try {
    const rows = await controlDb
      .select({ id: TenantSystem.system_id })
      .from(TenantSystem)
      .where(and(eq(TenantSystem.tenant_id, tenant.tid), eq(TenantSystem.status, "ACTIVE")));
    return new Set(rows.map((r) => r.id));
  } catch (err) {
    if (isControlPlaneMissing(err)) return tenant.isPrimary ? "all" : new Set();
    throw err;
  }
}

export async function isSystemAssigned(systemId: number, tenant: TenantCtx = responseTenant()): Promise<boolean> {
  const ids = await assignedSystemIds(tenant);
  return ids === "all" || ids.has(systemId);
}

/** Keep only the systems the tenant may open. */
export async function filterAssignedSystems<T extends { system_id: number }>(
  systems: T[],
  tenant: TenantCtx = responseTenant(),
): Promise<T[]> {
  const ids = await assignedSystemIds(tenant);
  return ids === "all" ? systems : systems.filter((s) => ids.has(s.system_id));
}

/** Assign (or re-activate) a System for a tenant -- provisioning / the primary console. */
export async function assignSystem(tid: number, systemId: number, source: "PACKAGE" | "OVERRIDE" = "OVERRIDE"): Promise<void> {
  await controlDb
    .insert(TenantSystem)
    .values({ tenant_id: tid, system_id: systemId, status: "ACTIVE", source })
    .onDuplicateKeyUpdate({ set: { status: "ACTIVE", source } });
}

export async function unassignSystem(tid: number, systemId: number): Promise<void> {
  await controlDb
    .update(TenantSystem)
    .set({ status: "DISABLED" })
    .where(and(eq(TenantSystem.tenant_id, tid), eq(TenantSystem.system_id, systemId)));
}
