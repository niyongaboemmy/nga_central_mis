/**
 * The one call after anything that changes what a school's package allows:
 * a package change, an entitlement override added / expired / removed, a
 * catalogue edit (packages B/C/D call this).
 *
 *   onEntitlementsChanged(tid)   one school
 *   onEntitlementsChanged()      every school (a Package / PackageEntitlement edit)
 *
 * It drops the entitlement cache, the tenant registry (TenantCtx.pkg), this
 * process's snapshot cache, re-derives the school's TenantSystem rows from its
 * APP entitlements, and bumps every person's access_version in that school so
 * the apps -- which cache snapshots by version -- refetch at once instead of
 * after their TTL. Never throws: a failure is logged and the TTLs converge.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { UserAccessVersion } from "../../db/accessSchema";
import { clearSnapshotCache } from "../access/snapshotCache";
import { getTenant, invalidateTenants, listTenants } from "../../tenancy/registry";
import { runWithTenant } from "../../vendor/nga-tenancy";
import logger from "../../utils/logger";
import { invalidateEntitlements } from "./entitlements";
import { resetEntitlementFallback } from "./featureGate";
import { deriveTenantSystems } from "./tenantSystems";

export async function onEntitlementsChanged(tid?: number): Promise<void> {
  invalidateEntitlements(tid);
  resetEntitlementFallback(tid);
  invalidateTenants();
  clearSnapshotCache();
  let tids: number[] = [];
  try {
    tids = tid !== undefined ? [tid] : (await listTenants()).map((t) => t.tid);
  } catch (err) {
    logger.warn("[tenantMgmt] entitlement change: tenant list unavailable", { error: (err as any)?.message ?? err });
  }
  for (const id of tids) {
    try {
      await deriveTenantSystems(id);
    } catch (err) {
      logger.warn("[tenantMgmt] TenantSystem derivation failed", { tid: id, error: (err as any)?.message ?? err });
    }
    try {
      const tenant = await getTenant(id);
      if (!tenant) continue;
      await runWithTenant(tenant, () =>
        db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }),
      );
    } catch (err) {
      logger.warn("[tenantMgmt] access_version bump failed", { tid: id, error: (err as any)?.message ?? err });
    }
  }
  clearSnapshotCache();
}
