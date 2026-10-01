import jwt from "jsonwebtoken";
import { q } from "../services/activity/db";

/**
 * Light authentication for the activity collector (plan §5.3).
 *
 * `authenticate` does two DB reads on every request (token_version plus the effective
 * permission set). Heartbeats arrive every 30 s from every open tab, so the collector
 * does only what identity needs: verify the JWT signature and expiry, and check
 * token_version against a 30 s per-user cache. A logout is therefore honoured here
 * within 30 s.
 *
 * Never rejects: a missing or invalid token simply means "anonymous".
 */
const versions = new Map<number, { v: number | null; at: number }>();
const TTL_MS = 30_000;

const currentVersion = async (userId: number): Promise<number | null> => {
  const hit = versions.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const rows = await q<{ token_version: number; status: string }>(
    "SELECT token_version, status FROM User WHERE user_id = ? LIMIT 1",
    [userId],
  );
  const v = rows[0] && rows[0].status === "ACTIVE" ? Number(rows[0].token_version ?? 0) : null;
  versions.set(userId, { v, at: Date.now() });
  if (versions.size > 20_000) versions.delete(versions.keys().next().value as number);
  return v;
};

/** Forget a cached version (logout / sign-out everywhere act immediately in-process). */
export const invalidateActivityAuth = (userId: number) => versions.delete(userId);

export const tokenFromRequest = (req: any): string | null => {
  const h = req.get?.("Authorization");
  if (typeof h === "string" && h.startsWith("Bearer ")) return h.slice(7).trim() || null;
  return req.cookies?.nga_auth_token ?? null;
};

/** Resolve the signed-in MIS user behind a request, or null. */
export const resolveActivityUser = async (req: any): Promise<number | null> => {
  const token = tokenFromRequest(req);
  if (!token) return null;
  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);
    if (decoded?.requiresOTP || decoded?.dbAccess) return null; // half-finished login, step-up token
    const userId = Number(decoded?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    const v = await currentVersion(userId);
    if (v === null || (decoded.tokenVersion ?? 0) !== v) return null;
    return userId;
  } catch {
    return null;
  }
};
