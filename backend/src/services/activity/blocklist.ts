import { exec, q } from "./db";
import { cidrContains, ipToBuffer, parseCidr } from "./ip";
import { clock } from "./runtime";

/**
 * Device / IP / CIDR blocks (plan §10.3). A blocked device or IP is refused on
 * /auth/login and on anonymous activity ingest. Every block has an expiry.
 */
interface ActiveBlock {
  id: number;
  kind: "device" | "ip" | "cidr";
  value: string;
  expires: number;
  m?: { buf: Buffer; bits: number } | null;
}
let blocks: ActiveBlock[] = [];
let loadedAt = 0;

export const refreshBlocks = async (force = false) => {
  if (!force && clock.now() - loadedAt < 30_000) return blocks;
  try {
    const rows = await q<any>(
      `SELECT id, kind, value, expires_at FROM AnalyticsBlock WHERE revoked_at IS NULL AND expires_at > ?`,
      [new Date(clock.now())],
    );
    blocks = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      value: r.value,
      expires: new Date(r.expires_at).getTime(),
      m: r.kind === "device" ? null : parseCidr(r.value),
    }));
  } catch {
    blocks = [];
  }
  loadedAt = clock.now();
  return blocks;
};

/** Synchronous check against the cached list (refreshed every 30 s by callers). */
export const isBlocked = (deviceId: string | null, ip: string | null): ActiveBlock | null => {
  const now = clock.now();
  const buf = ip ? ipToBuffer(ip) : null;
  for (const b of blocks) {
    if (b.expires <= now) continue;
    if (b.kind === "device" && deviceId && b.value === deviceId) return b;
    if (b.kind !== "device" && b.m && buf && cidrContains(b.m, buf)) return b;
  }
  return null;
};

export const checkBlocked = async (deviceId: string | null, ip: string | null) => {
  await refreshBlocks();
  return isBlocked(deviceId, ip);
};

export const addBlock = async (input: { kind: "device" | "ip" | "cidr"; value: string; reason: string; days: number; actorId: number }) => {
  if (input.kind !== "device" && !parseCidr(input.value)) throw new Error("Invalid IP or CIDR");
  const days = Math.min(90, Math.max(1, Math.round(input.days || 7)));
  const res = await exec(
    `INSERT INTO AnalyticsBlock (kind, value, reason, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [input.kind, input.value.trim().slice(0, 50), input.reason.slice(0, 2000), input.actorId, new Date(clock.now()), new Date(clock.now() + days * 86_400_000)],
  );
  await refreshBlocks(true);
  return res.insertId;
};

export const revokeBlock = async (id: number) => {
  await exec(`UPDATE AnalyticsBlock SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, [new Date(clock.now()), id]);
  await refreshBlocks(true);
};

export const listBlocks = async () =>
  q<any>(
    `SELECT b.*, CONCAT_WS(' ', p.first_name, p.last_name) AS created_by_name FROM AnalyticsBlock b
       LEFT JOIN UserProfile p ON p.user_id = b.created_by
      ORDER BY (b.revoked_at IS NULL AND b.expires_at > UTC_TIMESTAMP()) DESC, b.created_at DESC LIMIT 500`,
  );
