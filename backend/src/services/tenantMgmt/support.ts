/**
 * Support access (plan §6.9) -- WORK PACKAGE D.
 *
 * A school's billing owner grants a time-boxed session (1..support.max_hours,
 * READ or WRITE). A platform_support user of the primary tenant opens it and
 * gets an MIS session token for that school, shaped like the login token of the
 * granting school user plus:
 *
 *   act:     { sub: <platform user id>, tid: 1 }   (the impersonation claim)
 *   support: { sid, mode }
 *   exp:     the session's expiry
 *
 * authenticate() checks the SupportSession on every request (cached 15 s;
 * revoke drops the cache entry at once): expired / revoked -> 401
 * SUPPORT_SESSION_ENDED, a non-GET in READ mode -> 403 SUPPORT_READ_ONLY. Opening
 * and every write are audited twice: the tenant's AccessAudit and PlatformAudit.
 */
import jwt from "jsonwebtoken";
import { RowDataPacket } from "mysql2/promise";
import { controlPool } from "../../db/platform";
import { poolFor } from "../../db/pools";
import { NotFoundError, ValidationError } from "../../errors/CustomError";
import { PRIMARY_TENANT_ID } from "../../vendor/nga-tenancy";
import { getTenant } from "../../tenancy/registry";
import { tenantClaims } from "../../tenancy/claims";
import { tenantRefusal } from "../../tenancy/express";
import { platformAudit } from "../../tenancy/audit";
import logger from "../../utils/logger";
import { getPlatformSetting } from "./settings";
import { TenantActionError } from "./lifecycle";

const iso = (d: any): string | null => (d ? new Date(d).toISOString() : null);

async function userName(tid: number, userId: number | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const [rows] = await poolFor(tid).query<RowDataPacket[]>(
      "SELECT u.username, p.first_name, p.last_name FROM `User` u LEFT JOIN UserProfile p ON p.user_id = u.user_id WHERE u.user_id = ? LIMIT 1",
      [userId],
    );
    const r = rows[0];
    if (!r) return null;
    return [r.first_name, r.last_name].filter(Boolean).join(" ") || String(r.username);
  } catch {
    return null;
  }
}

export function serializeSession(r: RowDataPacket, openedBy: string | null = null, now = new Date()) {
  const active = !r.revoked_at && new Date(r.expires_at).getTime() > now.getTime() && new Date(r.starts_at).getTime() <= now.getTime() + 1000;
  return {
    id: Number(r.session_id),
    mode: r.mode as "READ" | "WRITE",
    reason: r.reason ?? null,
    startsAt: iso(r.starts_at)!,
    expiresAt: iso(r.expires_at)!,
    revokedAt: iso(r.revoked_at),
    openedBy,
    openedAt: iso(r.opened_at),
    active,
  };
}

// The platform user's name lives in the primary tenant's DB.
const platformName = (userId: number | null) => userName(PRIMARY_TENANT_ID, userId);

export async function listTenantSessions(tid: number) {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT * FROM SupportSession WHERE tenant_id = ? ORDER BY session_id DESC LIMIT 100",
    [tid],
  );
  const out = [];
  for (const r of rows) out.push(serializeSession(r, await platformName(r.opened_by === null ? null : Number(r.opened_by))));
  return out;
}

export async function grantSession(tid: number, userId: number, body: { hours?: unknown; mode?: unknown; reason?: unknown }) {
  const max = Number(await getPlatformSetting("support.max_hours")) || 24;
  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours < 1 || hours > max) throw new ValidationError(`Hours must be between 1 and ${max}.`);
  const mode = body.mode === "WRITE" ? "WRITE" : body.mode === "READ" || body.mode === undefined ? "READ" : null;
  if (!mode) throw new ValidationError("mode must be READ or WRITE.");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 255) || null : null;
  const [res]: any = await controlPool().query(
    "INSERT INTO SupportSession (tenant_id, granted_by, mode, reason, starts_at, expires_at) VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))",
    [tid, userId, mode, reason, Math.round(hours * 60)],
  );
  await tenantAudit(tid, userId, "support.grant", { sessionId: res.insertId, mode, hours });
  await platformAudit({ action: "support.grant", targetTid: tid, payload: { sessionId: res.insertId, mode, hours, grantedBy: userId } });
  const [[row]] = await controlPool().query<RowDataPacket[]>("SELECT * FROM SupportSession WHERE session_id = ?", [res.insertId]);
  return serializeSession(row);
}

export async function revokeSession(tid: number, userId: number, sessionId: number) {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM SupportSession WHERE session_id = ? AND tenant_id = ?", [sessionId, tid]);
  if (!rows[0]) throw new NotFoundError("Support session not found");
  if (!rows[0].revoked_at) {
    await controlPool().query("UPDATE SupportSession SET revoked_at = NOW() WHERE session_id = ?", [sessionId]);
    await tenantAudit(tid, userId, "support.revoke", { sessionId });
    await platformAudit({ action: "support.revoke", targetTid: tid, payload: { sessionId, revokedBy: userId } });
  }
  cache.delete(sessionId);
  const [[row]] = await controlPool().query<RowDataPacket[]>("SELECT * FROM SupportSession WHERE session_id = ?", [sessionId]);
  return serializeSession(row, await platformName(row.opened_by === null ? null : Number(row.opened_by)));
}

/** Active grants across every school (aggregate fields only: no school data). */
export async function listActiveSessions() {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    `SELECT s.*, t.display_name FROM SupportSession s JOIN Tenant t ON t.tenant_id = s.tenant_id
      WHERE s.revoked_at IS NULL AND s.expires_at > NOW() ORDER BY s.expires_at`,
  );
  const out = [];
  for (const r of rows) {
    out.push({ ...serializeSession(r, await platformName(r.opened_by === null ? null : Number(r.opened_by))), tid: Number(r.tenant_id), schoolName: String(r.display_name) });
  }
  return out;
}

/** Mint the support token for session `sessionId` (platform user `platformUserId`). */
export async function openSession(sessionId: number, platformUserId: number, ip: string | null) {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM SupportSession WHERE session_id = ?", [sessionId]);
  const s = rows[0];
  if (!s) throw new NotFoundError("Support session not found");
  if (s.revoked_at || new Date(s.expires_at).getTime() <= Date.now()) {
    throw new TenantActionError(410, "SUPPORT_SESSION_ENDED", "This support session has ended.");
  }
  const tid = Number(s.tenant_id);
  const tenant = await getTenant(tid);
  const refusal = tenantRefusal(tenant);
  if (!tenant || refusal) throw new TenantActionError(409, refusal?.code ?? "TENANT_UNKNOWN", refusal?.message ?? "This school is not available.");
  const grantedBy = Number(s.granted_by);
  const [users] = await poolFor(tid).query<RowDataPacket[]>(
    "SELECT user_id, username, token_version, preferred_theme, status FROM `User` WHERE user_id = ?",
    [grantedBy],
  );
  const u = users[0];
  if (!u || u.status !== "ACTIVE") throw new TenantActionError(409, "SUPPORT_GRANTOR_INACTIVE", "The school user who granted this session is no longer active.");
  const [roles] = await poolFor(tid).query<RowDataPacket[]>(
    "SELECT r.role_id, r.name FROM UserRole ur JOIN `Role` r ON r.role_id = ur.role_id WHERE ur.user_id = ? ORDER BY r.role_id LIMIT 1",
    [grantedBy],
  );
  const exp = Math.floor(new Date(s.expires_at).getTime() / 1000);
  const mode = String(s.mode) as "READ" | "WRITE";
  const token = jwt.sign(
    {
      userId: grantedBy,
      username: u.username,
      role_id: roles[0]?.role_id ?? "",
      role_name: roles[0]?.name ?? "",
      preferred_theme: u.preferred_theme ?? null,
      tokenVersion: Number(u.token_version ?? 0),
      ...tenantClaims(tenant),
      act: { sub: String(platformUserId), tid: PRIMARY_TENANT_ID },
      support: { sid: sessionId, mode },
      exp,
    },
    process.env.JWT_SECRET!,
  );
  await controlPool().query("UPDATE SupportSession SET opened_by = ?, opened_at = NOW() WHERE session_id = ?", [platformUserId, sessionId]);
  cache.delete(sessionId);
  await tenantAudit(tid, grantedBy, "support.open", { sessionId, platformUserId, mode });
  await platformAudit({ action: "support.open", actorUserId: platformUserId, ip, targetTid: tid, payload: { sessionId, mode } });
  return { token, tid, expiresAt: iso(s.expires_at)! };
}

// ---------------------------------------------------------------------------
// Request gate (middleware/auth.ts)
// ---------------------------------------------------------------------------

const CACHE_MS = 15_000;
const cache = new Map<number, { at: number; row: RowDataPacket | null }>();

export interface SupportClaim {
  sid: number;
  mode: "READ" | "WRITE";
}

export const supportClaimOf = (decoded: any): SupportClaim | null => {
  const s = decoded?.support;
  if (!s || typeof s !== "object") return null;
  const sid = Number(s.sid);
  return Number.isSafeInteger(sid) && sid > 0 ? { sid, mode: s.mode === "WRITE" ? "WRITE" : "READ" } : null;
};

/**
 * Why a support token may not be used for this request (null = it may).
 * Writes in WRITE mode are audited here, before the handler runs.
 */
export async function supportRefusal(
  claim: SupportClaim,
  req: { method: string; originalUrl?: string; url?: string; ip?: string },
  tid: number,
  actor: { platformUserId: number | null; userId: number },
): Promise<{ status: number; code: string; message: string } | null> {
  let hit = cache.get(claim.sid);
  if (!hit || Date.now() - hit.at > CACHE_MS) {
    const [rows] = await controlPool().query<RowDataPacket[]>("SELECT * FROM SupportSession WHERE session_id = ?", [claim.sid]);
    hit = { at: Date.now(), row: rows[0] ?? null };
    cache.set(claim.sid, hit);
  }
  const s = hit.row;
  if (!s || Number(s.tenant_id) !== tid || s.revoked_at || new Date(s.expires_at).getTime() <= Date.now()) {
    return { status: 401, code: "SUPPORT_SESSION_ENDED", message: "This support session has ended." };
  }
  const safe = ["GET", "HEAD", "OPTIONS"].includes(String(req.method).toUpperCase());
  if (safe) return null;
  if (String(s.mode) !== "WRITE") return { status: 403, code: "SUPPORT_READ_ONLY", message: "This support session is read-only." };
  const route = String(req.originalUrl ?? req.url ?? "").split("?")[0].slice(0, 200);
  void tenantAudit(tid, actor.userId, "support.write", { sessionId: claim.sid, method: req.method, route, platformUserId: actor.platformUserId });
  void platformAudit({ action: "support.write", actorUserId: actor.platformUserId, ip: req.ip ?? null, targetTid: tid, payload: { sessionId: claim.sid, method: req.method, route } });
  return null;
}

/** AccessAudit row in the school's own database (best-effort). */
async function tenantAudit(tid: number, userId: number | null, action: string, after: unknown): Promise<void> {
  try {
    await poolFor(tid).query("INSERT INTO AccessAudit (actor_id, subject_user_id, action, target, after_json, reason) VALUES (?, ?, ?, ?, ?, ?)", [
      userId,
      userId,
      action,
      JSON.stringify({ kind: "support_session" }),
      JSON.stringify(after),
      "Platform support access (consented by the school)",
    ]);
  } catch (err) {
    logger.warn(`[tenantMgmt] AccessAudit (t${tid}) failed: ${(err as Error)?.message ?? err}`);
  }
}

/** Tests. */
export const clearSupportCache = () => cache.clear();
