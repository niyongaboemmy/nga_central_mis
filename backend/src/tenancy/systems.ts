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
import { APP_KEYS } from "../services/tenantMgmt/catalog";
import { hasApp } from "../services/tenantMgmt/entitlements";
import { safeEntitlements } from "../services/tenantMgmt/featureGate";

/** SSO client id -> APP entitlement key, for the catalogue apps that are SSO clients. */
export const APP_KEY_BY_CLIENT: Record<string, string> = Object.fromEntries(
  Object.entries(APP_KEYS)
    .filter(([, v]) => v.client)
    .map(([k, v]) => [v.client as string, k]),
);

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

/**
 * Is a catalogue app (Task Mentor, Tendo, Tupo -- by its SSO client id) in the
 * tenant's package (APP entitlement, plan §3.1)? Any other client is not a
 * package matter: true. Unrestricted without a control plane.
 */
export async function isClientEntitled(clientId: string | null | undefined, tenant: TenantCtx = responseTenant()): Promise<boolean> {
  const appKey = clientId ? APP_KEY_BY_CLIENT[clientId] : undefined;
  if (!appKey) return true;
  return hasApp(await safeEntitlements(tenant.tid), appKey);
}

/**
 * Why the tenant may not open this System, or null when it may: assigned
 * (TenantSystem ACTIVE) AND, for a catalogue app, in the package. The SSO
 * authorize / token exchange refuse on either.
 */
export async function systemRefusal(
  system: { system_id: number; client_id?: string | null },
  tenant: TenantCtx = responseTenant(),
): Promise<"SYSTEM_NOT_ASSIGNED" | "APP_NOT_IN_PACKAGE" | null> {
  if (!(await isSystemAssigned(system.system_id, tenant))) return "SYSTEM_NOT_ASSIGNED";
  if (!(await isClientEntitled(system.client_id, tenant))) return "APP_NOT_IN_PACKAGE";
  return null;
}

/** Keep only the systems the tenant may open (assigned, and in the package when the row says its client). */
export async function filterAssignedSystems<T extends { system_id: number; client_id?: string | null }>(
  systems: T[],
  tenant: TenantCtx = responseTenant(),
): Promise<T[]> {
  const ids = await assignedSystemIds(tenant);
  const assigned = ids === "all" ? systems : systems.filter((s) => ids.has(s.system_id));
  const ent = await safeEntitlements(tenant.tid);
  if (ent.unrestricted) return assigned;
  return assigned.filter((s) => {
    const appKey = s.client_id ? APP_KEY_BY_CLIENT[s.client_id] : undefined;
    return !appKey || hasApp(ent, appKey);
  });
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
