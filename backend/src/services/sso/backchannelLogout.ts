import crypto from "crypto";
import jwt from "jsonwebtoken";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { System } from "../../db/schema";
import logger from "../../utils/logger";
import { loadSigningKey, ssoIssuer } from "./signingKey";

/**
 * Single sign-out: OpenID Connect Back-Channel Logout 1.0
 * (https://openid.net/specs/openid-connect-backchannel-1_0.html).
 *
 * When someone signs out of MIS, every active app with a
 * `backchannel_logout_uri` receives a server-to-server POST
 * (application/x-www-form-urlencoded, `logout_token=<JWT>`). The app verifies
 * the token against /.well-known/jwks.json and ends that user's sessions.
 *
 * Why not front-channel (hidden iframes to each app)? Chrome 115+ partitions
 * storage for third-party iframes, so an iframe can't reach the app's own
 * tokens -- front-channel logout silently fails. Server-to-server is reliable
 * and works even when the other apps aren't open.
 *
 * MIS tokens carry no session id, and signing out of MIS already ends every
 * MIS session of the user (token_version), so the logout_token identifies the
 * user (`sub`) and the apps end all of that user's sessions: one consistent
 * meaning everywhere.
 */

export const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

export const buildLogoutToken = (misUserId: number, clientId: string, now = Date.now()) => {
  const key = loadSigningKey();
  if (!key) return null;
  const iat = Math.floor(now / 1000);
  return jwt.sign(
    {
      iss: ssoIssuer(),
      aud: clientId,
      iat,
      exp: iat + 120, // short-lived: a logout token is used once, immediately
      jti: crypto.randomUUID(),
      sub: String(misUserId),
      events: { [LOGOUT_EVENT]: {} },
    },
    key.privateKey,
    { algorithm: "RS256", keyid: key.kid },
  );
};

export type LogoutPost = (url: string, body: string) => Promise<number>;

const realPost: LogoutPost = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-store" },
    body,
    signal: AbortSignal.timeout(5000),
  });
  return res.status;
};
let post: LogoutPost = realPost;
/** Test hook. */
export const setLogoutTransport = (fn: LogoutPost | null) => {
  post = fn ?? realPost;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LogoutDelivery {
  system: string;
  status: number | null;
  attempts: number;
}

/** Deliver to one app, retrying transient failures (never throws). */
const deliver = async (system: { name: string; client_id: string | null; backchannel_logout_uri: string | null }, misUserId: number, retryDelays: number[]) => {
  const result: LogoutDelivery = { system: system.name, status: null, attempts: 0 };
  for (let i = 0; i <= retryDelays.length; i++) {
    if (i > 0) await sleep(retryDelays[i - 1]);
    result.attempts++;
    // A fresh token per attempt (new jti, fresh iat).
    const token = buildLogoutToken(misUserId, system.client_id!);
    if (!token) return result;
    try {
      result.status = await post(system.backchannel_logout_uri!, new URLSearchParams({ logout_token: token }).toString());
      // 200/204 done; 400 means the app rejected the token -- retrying won't help.
      if (result.status < 500) return result;
    } catch {
      result.status = null;
    }
  }
  return result;
};

/**
 * Tell every connected app that `misUserId` signed out. Runs in the
 * background (the user's logout never waits on another app).
 */
export const notifyLogout = async (misUserId: number, opts: { retryDelays?: number[] } = {}): Promise<LogoutDelivery[]> => {
  if (!loadSigningKey()) return [];
  const systems = await db
    .select({ name: System.name, client_id: System.client_id, backchannel_logout_uri: System.backchannel_logout_uri })
    .from(System)
    .where(and(eq(System.status, "ACTIVE"), isNotNull(System.backchannel_logout_uri), isNotNull(System.client_id)));
  const results = await Promise.all(
    systems.filter((s) => s.backchannel_logout_uri).map((s) => deliver(s, misUserId, opts.retryDelays ?? [1000, 4000])),
  );
  const failed = results.filter((r) => r.status === null || r.status >= 300);
  if (failed.length) {
    logger.warn("[sso] back-channel logout not delivered to some apps", { data: { misUserId, failed } });
  }
  return results;
};

/** Validate a back-channel URI entered by an admin. */
export const validBackchannelUri = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  try {
    const url = new URL(String(value));
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (local && url.protocol === "http:")) return url.toString();
  } catch {
    /* fall through */
  }
  throw new Error("backchannel_logout_uri must be an https:// URL");
};
