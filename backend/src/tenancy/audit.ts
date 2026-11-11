/** PlatformAudit: actions taken on tenants (control plane). Best-effort. */
import { controlDb } from "../db/platform";
import { PlatformAudit } from "../db/platformSchema";
import { currentRealTenantOrNull } from "./context";

export async function platformAudit(entry: {
  action: string;
  targetTid?: number | null;
  actorUserId?: number | null;
  payload?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    await controlDb.insert(PlatformAudit).values({
      actor_tid: currentRealTenantOrNull()?.tid ?? null,
      actor_user_id: entry.actorUserId ?? null,
      action: entry.action.slice(0, 80),
      target_tid: entry.targetTid ?? null,
      payload: (entry.payload ?? null) as any,
      ip: entry.ip ?? null,
    });
  } catch {
    /* auditing never fails the operation */
  }
}
