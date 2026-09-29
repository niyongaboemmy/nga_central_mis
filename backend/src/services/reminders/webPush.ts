import crypto from "crypto";
import fs from "fs";
import path from "path";
import webpush from "web-push";
import logger from "../../utils/logger";

/**
 * Web Push transport (VAPID, RFC 8030/8291/8292) -- free, no vendor account.
 * Browsers' push services (FCM for Chrome/Edge/Samsung, Mozilla autopush,
 * Apple's web push) accept a standard VAPID-signed request.
 *
 * Keys:
 * - Production MUST set REMINDERS_VAPID_PUBLIC_KEY / REMINDERS_VAPID_PRIVATE_KEY
 *   (generate once: `npm run reminders:vapid`). Without them push is reported
 *   as disabled; nothing is generated, because a new key pair silently
 *   orphans every existing subscription.
 * - Development generates a pair once and keeps it in .reminders-vapid.json
 *   (git-ignored) so subscriptions survive restarts.
 */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cached: VapidKeys | null | undefined;

const DEV_KEY_FILE = path.resolve(__dirname, "../../../.reminders-vapid.json");

export const loadVapidKeys = (): VapidKeys | null => {
  if (cached !== undefined) return cached;
  const subject = process.env.REMINDERS_VAPID_SUBJECT || "mailto:it@nga.ac.rw";
  const publicKey = process.env.REMINDERS_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.REMINDERS_VAPID_PRIVATE_KEY?.trim();
  if (publicKey && privateKey) {
    cached = { publicKey, privateKey, subject };
  } else if (process.env.NODE_ENV === "production") {
    logger.warn("[reminders] REMINDERS_VAPID_* not set -- Web Push is disabled");
    cached = null;
  } else if (process.env.NODE_ENV === "test") {
    cached = { ...webpush.generateVAPIDKeys(), subject };
  } else {
    try {
      if (fs.existsSync(DEV_KEY_FILE)) {
        cached = { ...JSON.parse(fs.readFileSync(DEV_KEY_FILE, "utf8")), subject };
      } else {
        const keys = webpush.generateVAPIDKeys();
        fs.writeFileSync(DEV_KEY_FILE, JSON.stringify(keys, null, 2));
        logger.info(`[reminders] generated development VAPID keys in ${DEV_KEY_FILE}`);
        cached = { ...keys, subject };
      }
    } catch (error) {
      logger.error("[reminders] could not load development VAPID keys", { error });
      cached = null;
    }
  }
  if (cached) webpush.setVapidDetails(cached.subject, cached.publicKey, cached.privateKey);
  return cached ?? null;
};

/** Test hook: forget cached keys so the next call re-reads the environment. */
export const resetVapidKeysForTests = () => {
  cached = undefined;
};

export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushOptions {
  /** Seconds the push service may hold an undelivered message. */
  ttl: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Collapses an undelivered older message with the same topic. */
  topic?: string;
}

export type PushResult =
  | { ok: true; statusCode: number }
  | { ok: false; gone: boolean; statusCode: number | null; error: string };

export type PushSender = (
  subscription: StoredSubscription,
  payload: string,
  options: PushOptions,
) => Promise<PushResult>;

/** The real sender. Tests inject a fake through the dispatcher's deps. */
export const sendWebPush: PushSender = async (subscription, payload, options) => {
  if (!loadVapidKeys()) return { ok: false, gone: false, statusCode: null, error: "push disabled" };
  try {
    const res = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      payload,
      { TTL: Math.max(0, Math.round(options.ttl)), urgency: options.urgency ?? "high", topic: options.topic, timeout: 10_000 },
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (error: any) {
    const statusCode = typeof error?.statusCode === "number" ? error.statusCode : null;
    return {
      ok: false,
      // 404/410: the browser unsubscribed or the subscription expired.
      gone: statusCode === 404 || statusCode === 410,
      statusCode,
      error: String(error?.body || error?.message || error).slice(0, 300),
    };
  }
};

/** A push "topic" must be <= 32 URL-safe base64 characters. */
export const topicFor = (key: string) =>
  crypto.createHash("sha256").update(key).digest("base64url").slice(0, 32);

export const endpointHash = (endpoint: string) =>
  crypto.createHash("sha256").update(endpoint, "utf8").digest("hex");

/**
 * Notification actions (Got it / Snooze) are handled by the service worker,
 * which has no access to the user's session token. Each push therefore
 * carries a signature bound to (job, user): it authorises exactly those two
 * actions on exactly that reminder, nothing else.
 */
const actionSecret = () => process.env.REMINDERS_ACTION_SECRET || process.env.JWT_SECRET || "nga-reminders-dev";

export const signAction = (jobId: number, userId: number) =>
  crypto.createHmac("sha256", actionSecret()).update(`${jobId}.${userId}`).digest("base64url").slice(0, 32);

export const verifyAction = (jobId: number, userId: number, signature: string) => {
  const expected = Buffer.from(signAction(jobId, userId));
  const given = Buffer.from(String(signature || ""));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

/** Public URLs the push payload links to. */
export const appUrl = (pathOrUrl: string | null | undefined) => {
  const base = (process.env.REMINDERS_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
  if (!pathOrUrl) return `${base}/reminders`;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
};

export const apiUrl = (p: string) => {
  const base = (process.env.REMINDERS_API_URL || `http://localhost:${process.env.PORT || 5001}`).replace(/\/$/, "");
  return `${base}${p}`;
};
