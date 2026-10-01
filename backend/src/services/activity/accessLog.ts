import logger from "../../utils/logger";
import { exec } from "./db";
import { ipToBuffer, normalizeIp } from "./ip";
import { clock } from "./runtime";

/**
 * Append-only accountability log for monitoring (plan §10.1, §13). Every per-person view,
 * export and control writes one row. There is deliberately no update or delete path.
 */
export interface AccessLogEntry {
  viewerId: number;
  action: string;
  targetUserId?: number | null;
  targetDeviceId?: string | null;
  targetIp?: string | null;
  reason?: string | null;
  detail?: Record<string, unknown> | null;
  viewerIp?: string | null;
}

export const logMonitorAccess = async (e: AccessLogEntry) => {
  try {
    await exec(
      `INSERT INTO MonitorAccessLog (at, viewer_id, action, target_user_id, target_device_id, target_ip, reason, detail, viewer_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
      [
        new Date(clock.now()),
        e.viewerId,
        e.action.slice(0, 40),
        e.targetUserId ?? null,
        e.targetDeviceId ?? null,
        ipToBuffer(e.targetIp ?? null),
        e.reason ? e.reason.slice(0, 2000) : null,
        e.detail ? JSON.stringify(e.detail) : null,
        ipToBuffer(normalizeIp(e.viewerIp ?? "")),
      ],
    );
  } catch (error: any) {
    // Accountability matters, but a failed log write must not hide data the viewer
    // is entitled to. It is logged loudly instead.
    logger.error("[activity] monitor access log write failed", { error: error?.message, entry: e.action });
  }
};

/** Express helper: log a per-person access for the current request. */
export const logFromReq = (req: any, action: string, target: Omit<AccessLogEntry, "viewerId" | "action" | "viewerIp"> = {}) =>
  logMonitorAccess({ viewerId: req.user.userId, action, viewerIp: req.ip, ...target });
