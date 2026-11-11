/**
 * TenantSystem derivation from APP entitlements (plan §3.1, fix plan 2.6) -- OWNED
 * BY WORK PACKAGE A. Signature is the seam provisioning and package changes call.
 *
 * Only Systems that ARE an app of the catalogue (APP_KEYS[...].client: Task
 * Mentor, Tendo, Tupo) are derived; any other SSO client a school has is the
 * operator's business (OVERRIDE) and left alone. System rows are global and
 * live in the primary tenant's database.
 */
import { inArray } from "drizzle-orm";
import { RowDataPacket } from "mysql2/promise";
import { primaryDb } from "../../db";
import { System } from "../../db/schema";
import { controlPool, isControlPlaneMissing } from "../../db/platform";
import { APP_KEY_BY_CLIENT, assignSystem } from "../../tenancy/systems";
import { clearSnapshotCache } from "../access/snapshotCache";
import { invalidateEntitlements, resolveEntitlements } from "./entitlements";

export { APP_KEY_BY_CLIENT };

/**
 * Make tenant `tid`'s PACKAGE-sourced TenantSystem rows match its APP entitlements:
 * entitled apps' Systems ACTIVE, no-longer-entitled PACKAGE rows DISABLED. OVERRIDE
 * rows are the operator's and are never touched. Invalidates caches.
 */
export async function deriveTenantSystems(tid: number): Promise<{ assigned: number; disabled: number }> {
  invalidateEntitlements(tid);
  const ent = await resolveEntitlements(tid);
  // No control plane: nothing to derive (every app is open, tenancy/systems.ts).
  if (ent.unrestricted) return { assigned: 0, disabled: 0 };

  const clients = Object.keys(APP_KEY_BY_CLIENT);
  const systems = clients.length
    ? await primaryDb()
        .select({ system_id: System.system_id, client_id: System.client_id })
        .from(System)
        .where(inArray(System.client_id, clients))
    : [];
  const entitled = new Set(
    systems.filter((s) => ent.apps.includes(APP_KEY_BY_CLIENT[String(s.client_id)])).map((s) => s.system_id),
  );
  const appSystems = new Set(systems.map((s) => s.system_id));

  let rows: RowDataPacket[];
  try {
    [rows] = await controlPool().query<RowDataPacket[]>(
      "SELECT system_id, status, source FROM TenantSystem WHERE tenant_id = ?",
      [tid],
    );
  } catch (err) {
    if (isControlPlaneMissing(err)) return { assigned: 0, disabled: 0 };
    throw err;
  }
  const existing = new Map(rows.map((r) => [Number(r.system_id), { status: String(r.status), source: String(r.source) }]));

  let assigned = 0;
  let disabled = 0;
  for (const id of entitled) {
    const row = existing.get(id);
    if (row?.source === "OVERRIDE") continue;
    if (row?.status === "ACTIVE") continue;
    await assignSystem(tid, id, "PACKAGE");
    assigned++;
  }
  for (const [id, row] of existing) {
    if (row.source !== "PACKAGE" || row.status !== "ACTIVE") continue;
    if (!appSystems.has(id) || entitled.has(id)) continue;
    await controlPool().query(
      "UPDATE TenantSystem SET status = 'DISABLED' WHERE tenant_id = ? AND system_id = ? AND source = 'PACKAGE'",
      [tid, id],
    );
    disabled++;
  }
  if (assigned || disabled) clearSnapshotCache();
  return { assigned, disabled };
}
