/**
 * Tests that insert a System row directly must also assign it to the school they
 * test with: there is no implicit "the primary has every System" any more
 * (tenancy/systems.ts). Without a control plane the primary keeps every System,
 * so a missing platform database is not an error here.
 */
import { inArray } from "drizzle-orm";
import { primaryDb } from "../db";
import { System } from "../db/schema";
import { controlPool, isControlPlaneMissing } from "../db/platform";
import { PRIMARY_TENANT_ID } from "../vendor/nga-tenancy";

export async function assignTestSystems(clientIds: string | string[], tid: number = PRIMARY_TENANT_ID): Promise<void> {
  const ids = Array.isArray(clientIds) ? clientIds : [clientIds];
  if (!ids.length) return;
  const rows = await primaryDb().select({ id: System.system_id }).from(System).where(inArray(System.client_id, ids));
  try {
    for (const r of rows) {
      await controlPool().query(
        "INSERT INTO TenantSystem (tenant_id, system_id, status, source) VALUES (?, ?, 'ACTIVE', 'OVERRIDE') ON DUPLICATE KEY UPDATE status = 'ACTIVE'",
        [tid, r.id],
      );
    }
  } catch (err) {
    if (!isControlPlaneMissing(err)) throw err;
  }
}
