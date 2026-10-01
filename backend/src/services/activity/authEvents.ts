import logger from "../../utils/logger";
import { APP_CODE, AppKey } from "./apps";
import { activityTablesPresent, exec } from "./db";
import { resolveGeo, resolveUa } from "./dims";
import { ingestServerEvent } from "./ingest";
import { ipToBuffer, normalizeIp } from "./ip";
import { activityBus, clock } from "./runtime";
import { DEVICE_ID_RE } from "./tokens";
import { queueIp } from "./writer";

/**
 * Sign-in, sign-out and account events written by the MIS itself (plan §5.5). They
 * never need a browser tracker, which is why "who accessed the platform" works even for
 * apps that are not instrumented yet.
 *
 * Every function here is fire-and-forget safe: it never throws into the auth flow.
 */
export type AuthKind =
  | "login" | "otp" | "google" | "password_reset" | "app_launch" | "logout"
  | "suspend" | "reactivate" | "password_change" | "scheme_verify" | "notice_ack";

export interface AuthEventInput {
  kind: AuthKind;
  outcome: "success" | "failure" | "info";
  reason?: string | null;
  method?: string | null;
  userId?: number | null;
  usernameAttempted?: string | null;
  app?: AppKey | null;
  initiator?: "user" | "admin" | "expiry" | "backchannel" | null;
  actorId?: number | null;
}

/** The device id a request carries: the shared cookie, or the SDK's header (dev / cross-site). */
export const deviceIdOf = (req: any): string | null => {
  const fromHeader = req?.get?.("X-NGA-Device") ?? req?.headers?.["x-nga-device"];
  const fromCookie = req?.cookies?.nga_did;
  for (const v of [fromHeader, fromCookie]) if (typeof v === "string" && DEVICE_ID_RE.test(v)) return v;
  return null;
};

export const clientIpOf = (req: any): string | null => normalizeIp(req?.ip ?? req?.socket?.remoteAddress ?? null);

const EVENT_NAME: Partial<Record<AuthKind, Record<string, string>>> = {
  login: { success: "login_success", failure: "login_failed" },
  otp: { failure: "login_failed", info: "otp_sent" },
  google: { success: "login_success", failure: "login_failed" },
  password_reset: { info: "password_reset_requested", success: "password_reset" },
  app_launch: { success: "app_launch" },
  logout: { info: "logout", success: "logout" },
  suspend: { info: "account_suspended" },
  reactivate: { info: "account_reactivated" },
  password_change: { success: "password_changed" },
  scheme_verify: { success: "scheme_verify", failure: "scheme_verify" },
};

export const recordAuthEvent = async (req: any, input: AuthEventInput): Promise<void> => {
  try {
    if (!(await activityTablesPresent())) return;
    const now = clock.now();
    const ip = clientIpOf(req);
    const ipBuf = ipToBuffer(ip);
    const deviceId = deviceIdOf(req);
    const ua = typeof req?.get === "function" ? req.get("User-Agent") ?? null : null;
    const [{ id: geoId }, { id: uaId }] = await Promise.all([resolveGeo(ip), resolveUa(ua)]);
    const username = input.usernameAttempted ? String(input.usernameAttempted).trim().slice(0, 120) : null;

    await exec(
      `INSERT INTO AuthEvent (occurred_at, kind, outcome, reason, method, user_id, username_attempted, app, initiator, actor_id, device_id, ip, geo_id, ua_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        new Date(now), input.kind, input.outcome, input.reason ?? null, input.method ?? null, input.userId ?? null,
        username, input.app ? APP_CODE[input.app] : null, input.initiator ?? null, input.actorId ?? null,
        deviceId, ipBuf, geoId, uaId,
      ],
    );

    if (input.userId && (input.kind === "login" || input.kind === "google") && input.outcome === "success") {
      await exec(
        `INSERT INTO AnalyticsUserState (user_id, last_login_at, last_login_method) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE last_login_at = VALUES(last_login_at), last_login_method = VALUES(last_login_method)`,
        [input.userId, new Date(now), input.method ?? input.kind],
      );
    }
    const failed = input.outcome === "failure" && ["login", "otp", "google"].includes(input.kind);
    if (ipBuf && failed) queueIp(ipBuf, geoId, null, new Date(now), 1);

    const name = EVENT_NAME[input.kind]?.[input.outcome];
    if (name) {
      await ingestServerEvent({
        app: input.app && input.kind !== "app_launch" ? input.app : "mis",
        name,
        at: now,
        userId: input.userId ?? null,
        deviceId,
        ip,
        ua,
        params: {
          ...(input.method ? { method: input.method } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.kind === "app_launch" && input.app ? { target_app: input.app } : {}),
          ...(input.initiator ? { initiator: input.initiator } : {}),
          ...(failed && username ? { username_attempted: username } : {}),
        },
      });
    }

    activityBus.emitSignal({
      type: "auth",
      kind: input.kind,
      outcome: input.outcome,
      userId: input.userId ?? null,
      usernameAttempted: username,
      deviceId,
      ip,
      at: now,
      reason: input.reason ?? null,
    });
  } catch (error: any) {
    logger.error("[activity] auth event failed", { error: error?.message ?? error });
  }
};

/** Non-blocking wrapper for controllers. */
export const trackAuth = (req: any, input: AuthEventInput) => {
  void recordAuthEvent(req, input);
};
