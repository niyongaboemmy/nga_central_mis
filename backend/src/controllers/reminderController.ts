import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { PushSubscription, ReminderJob, ReminderPreference, ReminderSource } from "../db/reminderSchema";
import { asyncHandler } from "../middleware/asyncHandler";
import { AuthorizationError, NotFoundError, ValidationError } from "../errors/CustomError";
import { successResponse } from "../utils/response";
import logger from "../utils/logger";
import { collectOccurrences } from "../services/reminders/occurrences";
import { cancelSourceItem, parseSourceItem, saveSource, saveSources } from "../services/reminders/sources";
import {
  getPreferences,
  REMINDER_KINDS,
  savePreferences,
  type ReminderKind,
} from "../services/reminders/preferences";
import { cancelPendingJobs, expandForUser, expandUsersSoon } from "../services/reminders/expander";
import {
  ackJob,
  DAILY_PUSH_CAP,
  listUserJobs,
  sendTestReminder,
  snoozeJob,
} from "../services/reminders/dispatcher";
import {
  createLinkCode,
  getTelegramLink,
  handleTelegramUpdate,
  telegramConfig,
  unlinkTelegram,
  verifyWebhookSecret,
} from "../services/reminders/telegram";
import {
  buildAuthUrl,
  completeConnect,
  disconnectGoogle,
  getGoogleLink,
  googleConfig,
  syncGoogleCalendar,
} from "../services/reminders/googleCalendar";
import { ESCALATE_AFTER_MS } from "../services/reminders/channels";
import {
  apiUrl,
  appUrl,
  endpointHash,
  loadVapidKeys,
  verifyAction,
} from "../services/reminders/webPush";
import {
  buildFeedForUser,
  getFeedToken,
  issueFeedToken,
  revokeFeedToken,
  userForFeedToken,
} from "../services/reminders/calendarFeed";
import { addDaysYmd, kigaliInstant, kigaliParts } from "../services/reminders/time";

const userIdOf = (req: any): number => Number(req.user?.userId);

/** Re-plan after a change, without making the request wait on it. */
const replanSoon = (userId: number) => {
  setImmediate(() => {
    expandForUser(userId).catch((error) =>
      logger.error("[reminders] replan failed", { error, data: { userId } }),
    );
  });
};

// ─── Push endpoint allow-list ────────────────────────────────────────────────
//
// The server POSTs to whatever endpoint a browser hands us, so an
// unrestricted endpoint would let any signed-in user make the API call
// arbitrary URLs (SSRF). Only the browsers' real push services are accepted.
const DEFAULT_PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge (Android), Samsung Internet, Opera, Brave
  "push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  "web.push.apple.com", // Safari / iOS home-screen web apps
  "notify.windows.com", // Edge on Windows (WNS)
  "push.apple.com",
];

export const isAllowedPushEndpoint = (endpoint: string): boolean => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const extra = (process.env.REMINDERS_PUSH_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const host = url.hostname.toLowerCase();
  return [...DEFAULT_PUSH_HOSTS, ...extra].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
};

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

// ─── Configuration & overview ────────────────────────────────────────────────

export const getReminderConfig = asyncHandler(async (_req: any, res: any) => {
  const keys = loadVapidKeys();
  const telegram = telegramConfig();
  successResponse(res, "Reminder configuration", {
    push: { enabled: Boolean(keys), publicKey: keys?.publicKey ?? null },
    telegram: { enabled: Boolean(telegram), bot: telegram?.username ?? null },
    googleCalendar: { enabled: Boolean(googleConfig()) },
    email: { enabled: true, escalateAfterMinutes: ESCALATE_AFTER_MS / 60_000 },
    dailyPushCap: DAILY_PUSH_CAP,
    kinds: REMINDER_KINDS,
  });
});

export const getMyReminders = asyncHandler(async (req: any, res: any) => {
  const userId = userIdOf(req);
  const [preferences, devices, jobs, token, telegram, google] = await Promise.all([
    getPreferences(userId),
    db
      .select({
        subscription_id: PushSubscription.subscription_id,
        platform: PushSubscription.platform,
        browser: PushSubscription.browser,
        installed: PushSubscription.installed,
        created_at: PushSubscription.created_at,
        last_seen_at: PushSubscription.last_seen_at,
        last_success_at: PushSubscription.last_success_at,
        failure_count: PushSubscription.failure_count,
        endpoint_hash: PushSubscription.endpoint_hash,
      })
      .from(PushSubscription)
      .where(eq(PushSubscription.user_id, userId))
      .orderBy(desc(PushSubscription.created_at)),
    listUserJobs(userId),
    getFeedToken(userId),
    getTelegramLink(userId),
    getGoogleLink(userId),
  ]);
  successResponse(res, "Reminder settings", {
    preferences,
    devices,
    jobs,
    feed: token ? feedUrls(token) : null,
    connections: {
      telegram: telegram ? { username: telegram.username, linked_at: telegram.linked_at } : null,
      googleCalendar: google
        ? { email: google.google_email, status: google.status, last_sync_at: google.last_sync_at, last_error: google.last_error }
        : null,
    },
  });
});

export const updatePreferences = asyncHandler(async (req: any, res: any) => {
  const userId = userIdOf(req);
  const body = req.body ?? {};
  const preferences = await savePreferences(userId, {
    enabled: body.enabled,
    channels: body.channels,
    settings: body.settings,
    quietStart: body.quietStart,
    quietEnd: body.quietEnd,
    morningBriefing: body.morningBriefing,
  });
  if (preferences.enabled) replanSoon(userId);
  else await cancelPendingJobs(userId);
  if (body.channels !== undefined || body.settings !== undefined) void syncGoogleCalendar(userId);
  successResponse(res, "Reminder preferences saved", preferences);
});

// ─── Telegram ────────────────────────────────────────────────────────────────

/** POST /reminders/telegram/link -- a one-time t.me deep link (15 min). */
export const createTelegramLink = asyncHandler(async (req: any, res: any) => {
  const link = await createLinkCode(userIdOf(req));
  if (!link) return res.status(503).json({ success: false, message: "Telegram reminders aren't set up on this server yet." });
  successResponse(res, "Open this link in Telegram", { url: link.url, expiresAt: link.expiresAt }, 201);
});

export const deleteTelegramLink = asyncHandler(async (req: any, res: any) => {
  const removed = await unlinkTelegram(userIdOf(req));
  successResponse(res, removed ? "Telegram disconnected" : "Telegram wasn't connected", { removed });
});

/**
 * POST /reminders/telegram/webhook -- updates from Telegram, authenticated by
 * the secret Telegram echoes in X-Telegram-Bot-Api-Secret-Token. Always 200
 * for a genuine call (Telegram retries anything else).
 */
export const telegramWebhook = async (req: any, res: any) => {
  if (!verifyWebhookSecret(req.header("X-Telegram-Bot-Api-Secret-Token"))) return res.status(401).end();
  await handleTelegramUpdate(req.body, { ack: ackJob, snooze: snoozeJob });
  res.status(200).json({ ok: true });
};

// ─── Google Calendar ─────────────────────────────────────────────────────────

/** GET /reminders/google/connect -- the Google consent URL for this user. */
export const googleConnectUrl = asyncHandler(async (req: any, res: any) => {
  const url = buildAuthUrl(userIdOf(req));
  if (!url) return res.status(503).json({ success: false, message: "Google Calendar isn't set up on this server yet." });
  successResponse(res, "Continue with Google", { url });
});

/**
 * GET /reminders/google/callback -- Google redirects the browser here; the
 * signed `state` names the user (no session on this hop). Back to /reminders.
 */
export const googleCallback = async (req: any, res: any) => {
  const back = (result: string) => res.redirect(302, appUrl(`/reminders?google=${result}`));
  if (req.query?.error) return back(req.query.error === "access_denied" ? "denied" : "error");
  try {
    await completeConnect(String(req.query?.code || ""), String(req.query?.state || ""));
    return back("connected");
  } catch (error: any) {
    logger.warn("[reminders] google connect failed", { data: { error: String(error?.message || error) } });
    return back("error");
  }
};

export const googleDisconnect = asyncHandler(async (req: any, res: any) => {
  const removed = await disconnectGoogle(userIdOf(req));
  successResponse(res, removed ? "Google Calendar disconnected" : "Google Calendar wasn't connected", { removed });
});

export const googleSyncNow = asyncHandler(async (req: any, res: any) => {
  const result = await syncGoogleCalendar(userIdOf(req));
  const link = await getGoogleLink(userIdOf(req));
  if (!link) throw new NotFoundError("Google Calendar isn't connected");
  successResponse(res, result ? "Google Calendar is up to date" : "Couldn't sync Google Calendar", {
    result,
    status: link.status,
    last_sync_at: link.last_sync_at,
    last_error: link.last_error,
  });
});

// ─── Push subscriptions ──────────────────────────────────────────────────────

const PLATFORMS = new Set(["android", "ios", "ipados", "windows", "macos", "linux", "chromeos", "other"]);
const BROWSERS = new Set(["chrome", "edge", "samsung", "opera", "firefox", "safari", "brave", "other"]);

export const subscribePush = asyncHandler(async (req: any, res: any) => {
  const userId = userIdOf(req);
  const sub = req.body?.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint.trim() : "";
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || endpoint.length > 2000) throw new ValidationError("A push subscription endpoint is required");
  if (!isAllowedPushEndpoint(endpoint)) throw new ValidationError("This push service is not supported");
  if (typeof p256dh !== "string" || !B64URL.test(p256dh) || p256dh.length > 255) {
    throw new ValidationError("Invalid subscription key (p256dh)");
  }
  if (typeof auth !== "string" || !B64URL.test(auth) || auth.length > 255) {
    throw new ValidationError("Invalid subscription key (auth)");
  }
  const platform = PLATFORMS.has(req.body?.platform) ? req.body.platform : "other";
  const browser = BROWSERS.has(req.body?.browser) ? req.body.browser : "other";
  const installed = req.body?.installed ? 1 : 0;
  const now = new Date();
  const values = {
    user_id: userId,
    endpoint_hash: endpointHash(endpoint),
    endpoint,
    p256dh,
    auth,
    user_agent: String(req.get("user-agent") || "").slice(0, 300) || null,
    platform,
    browser,
    installed,
    failure_count: 0,
    last_seen_at: now,
  };
  // An endpoint belongs to one browser profile; if someone else signs in on
  // that browser the subscription follows the new user.
  await db
    .insert(PushSubscription)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        user_id: userId,
        p256dh,
        auth,
        user_agent: values.user_agent,
        platform,
        browser,
        installed,
        failure_count: 0,
        last_seen_at: now,
      },
    });
  // Subscribing is the "turn on reminders" moment.
  const current = await getPreferences(userId);
  if (!current.enabled) await savePreferences(userId, { enabled: true });
  replanSoon(userId);
  successResponse(res, "This device will receive reminders", { endpoint_hash: values.endpoint_hash }, 201);
});

export const unsubscribePush = asyncHandler(async (req: any, res: any) => {
  const userId = userIdOf(req);
  const endpoint = req.body?.endpoint;
  const id = Number(req.params?.id);
  let filter;
  if (Number.isInteger(id) && id > 0) filter = eq(PushSubscription.subscription_id, id);
  else if (typeof endpoint === "string" && endpoint) filter = eq(PushSubscription.endpoint_hash, endpointHash(endpoint));
  else throw new ValidationError("Say which device to remove");
  const [result] = (await db
    .delete(PushSubscription)
    .where(and(filter, eq(PushSubscription.user_id, userId)))) as any;
  successResponse(res, "Device removed", { removed: Number(result?.affectedRows ?? 0) });
});

/**
 * Called on every app open (permission health check, proposal §7.5). Tells
 * the client whether the server still knows this subscription -- if not
 * (expired, removed after failures) the client silently re-subscribes.
 */
export const pushHeartbeat = asyncHandler(async (req: any, res: any) => {
  const userId = userIdOf(req);
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint) throw new ValidationError("endpoint is required");
  const [result] = (await db
    .update(PushSubscription)
    .set({ last_seen_at: new Date(), installed: req.body?.installed ? 1 : 0 })
    .where(and(eq(PushSubscription.endpoint_hash, endpointHash(endpoint)), eq(PushSubscription.user_id, userId)))) as any;
  successResponse(res, "Heartbeat", { known: Number(result?.affectedRows ?? 0) > 0 });
});

export const sendTest = asyncHandler(async (req: any, res: any) => {
  const report = await sendTestReminder(userIdOf(req));
  successResponse(res, report.pushDelivered > 0 ? "Test notification sent" : "No device received the test", report);
});

// ─── Agenda ("Now & Next") and jobs ─────────────────────────────────────────

export const getAgenda = asyncHandler(async (req: any, res: any) => {
  const userId = userIdOf(req);
  const days = Math.min(7, Math.max(1, Number(req.query?.days) || 2));
  const now = new Date();
  const today = kigaliParts(now).ymd;
  const from = kigaliInstant(today, 0);
  const to = kigaliInstant(addDaysYmd(today, days), 0);
  const occurrences = await collectOccurrences(userId, from, to);
  successResponse(res, "Agenda", {
    now: now.toISOString(),
    today,
    items: occurrences.map((o) => ({
      key: o.key,
      kind: o.kind,
      title: o.title,
      detail: o.detail,
      location: o.location,
      link: o.link,
      color: o.color,
      role: o.role,
      critical: o.critical,
      start: o.start.toISOString(),
      end: o.end ? o.end.toISOString() : null,
    })),
  });
});

const jobIdParam = (req: any) => {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid reminder id");
  return id;
};

export const ackMyJob = asyncHandler(async (req: any, res: any) => {
  const ok = await ackJob(jobIdParam(req), userIdOf(req));
  if (!ok) throw new NotFoundError("Reminder not found");
  successResponse(res, "Marked as seen", { ok });
});

export const snoozeMyJob = asyncHandler(async (req: any, res: any) => {
  const result = await snoozeJob(jobIdParam(req), userIdOf(req));
  if (!result.ok && result.reason === "not_found") throw new NotFoundError("Reminder not found");
  if (!result.ok) throw new ValidationError("Too late to snooze -- it is about to start");
  successResponse(res, "Snoozed for 5 minutes", result);
});

/**
 * Notification buttons, called by the service worker without a session.
 * The `sig` binds the call to this one job and its owner (webPush.signAction).
 */
export const notificationAction = asyncHandler(async (req: any, res: any) => {
  const jobId = jobIdParam(req);
  const action = req.params?.action;
  if (action !== "ack" && action !== "snooze") throw new ValidationError("Unknown action");
  const [job] = await db
    .select({ user_id: ReminderJob.user_id })
    .from(ReminderJob)
    .where(eq(ReminderJob.job_id, jobId))
    .limit(1);
  if (!job || !verifyAction(jobId, job.user_id, String(req.query?.sig || ""))) {
    return res.status(403).json({ success: false, message: "Invalid or expired action link" });
  }
  if (action === "ack") {
    await ackJob(jobId, job.user_id);
    return successResponse(res, "Marked as seen", { ok: true });
  }
  const result = await snoozeJob(jobId, job.user_id);
  successResponse(res, result.ok ? "Snoozed for 5 minutes" : "Too late to snooze", result);
});

// ─── Calendar feed ───────────────────────────────────────────────────────────

const feedUrls = (token: string) => {
  const https = apiUrl(`/reminders/feed/${token}.ics`);
  return { https, webcal: https.replace(/^https?:\/\//, "webcal://") };
};

export const createFeed = asyncHandler(async (req: any, res: any) => {
  const token = await issueFeedToken(userIdOf(req));
  successResponse(res, "Calendar link ready", feedUrls(token), 201);
});

export const deleteFeed = asyncHandler(async (req: any, res: any) => {
  await revokeFeedToken(userIdOf(req));
  successResponse(res, "Calendar link turned off", { ok: true });
});

export const serveFeed = asyncHandler(async (req: any, res: any) => {
  const token = String(req.params?.token || "").replace(/\.ics$/, "");
  const userId = await userForFeedToken(token);
  if (!userId) return res.status(404).type("text/plain").send("Calendar not found");
  const ics = await buildFeedForUser(userId);
  res.set({
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="nga-timetable.ics"',
    "Cache-Control": "private, max-age=900",
  });
  res.send(ics);
});

// ─── Source API (other NGA apps) ────────────────────────────────────────────

/**
 * Reminders reach people's phones, so writing them is narrower than reading
 * the roster: a System authenticating with its client credentials must be
 * one of the NGA apps (REMINDERS_SOURCE_CLIENTS). An external partner needs
 * a deliberately minted IntegrationToken with `reminders:write`.
 */
const SOURCE_CLIENTS = () =>
  new Set(
    (process.env.REMINDERS_SOURCE_CLIENTS || "taskmentor_app,tupo,discipline_attendance")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
const assertSourceWriter = (req: any) => {
  const clientId = req.service?.clientId;
  if (clientId && !SOURCE_CLIENTS().has(clientId)) {
    throw new AuthorizationError("This system may not send reminders. Ask an administrator for a reminders:write token.");
  }
};

/**
 * PUT /reminders/sources -- create or replace one item, e.g. a quiz closing
 * time, for MIS user ids and/or a subject's enrolled students. Idempotent on
 * (app, type, external_id). Logic lives in services/reminders/sources.ts.
 */
export const upsertSource = asyncHandler(async (req: any, res: any) => {
  assertSourceWriter(req);
  const saved = await saveSource(parseSourceItem(req.body));
  successResponse(res, "Reminder source saved", saved);
});

/** PUT /reminders/sources/batch -- up to 200 items; each succeeds or fails on its own. */
export const upsertSourcesBatch = asyncHandler(async (req: any, res: any) => {
  assertSourceWriter(req);
  const results = await saveSources(req.body?.items);
  successResponse(res, "Reminder sources saved", {
    results,
    saved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
});

export const cancelSource = asyncHandler(async (req: any, res: any) => {
  assertSourceWriter(req);
  const { app, type, externalId } = req.params;
  const result = await cancelSourceItem(app, type, externalId);
  if (!result) throw new NotFoundError("Reminder source not found");
  successResponse(res, "Reminder source cancelled", result);
});

// ─── Admin delivery dashboard ────────────────────────────────────────────────

export const getAdminOverview = asyncHandler(async (_req: any, res: any) => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [byStatus, byChannel, devices, optedIn, latency] = await Promise.all([
    db
      .select({ status: ReminderJob.status, n: sql<number>`COUNT(*)` })
      .from(ReminderJob)
      .where(gte(ReminderJob.fire_at, since))
      .groupBy(ReminderJob.status),
    db
      .select({ channels: ReminderJob.channels, n: sql<number>`COUNT(*)` })
      .from(ReminderJob)
      .where(and(gte(ReminderJob.fire_at, since), sql`${ReminderJob.sent_at} IS NOT NULL`))
      .groupBy(ReminderJob.channels),
    db
      .select({
        platform: PushSubscription.platform,
        browser: PushSubscription.browser,
        installed: PushSubscription.installed,
        n: sql<number>`COUNT(*)`,
      })
      .from(PushSubscription)
      .groupBy(PushSubscription.platform, PushSubscription.browser, PushSubscription.installed),
    db.select({ n: sql<number>`COUNT(*)` }).from(ReminderPreference).where(eq(ReminderPreference.enabled, 1)),
    db
      .select({
        within60: sql<number>`SUM(CASE WHEN TIMESTAMPDIFF(SECOND, ${ReminderJob.fire_at}, ${ReminderJob.sent_at}) <= 60 THEN 1 ELSE 0 END)`,
        total: sql<number>`COUNT(*)`,
        acked: sql<number>`SUM(CASE WHEN ${ReminderJob.acked_at} IS NOT NULL THEN 1 ELSE 0 END)`,
      })
      .from(ReminderJob)
      .where(and(gte(ReminderJob.fire_at, since), sql`${ReminderJob.sent_at} IS NOT NULL`)),
  ]);
  const l = latency[0] ?? { within60: 0, total: 0, acked: 0 };
  successResponse(res, "Reminder delivery overview", {
    since: since.toISOString(),
    optedInUsers: Number(optedIn[0]?.n ?? 0),
    byStatus: byStatus.map((r: any) => ({ status: r.status, count: Number(r.n) })),
    byChannel: byChannel.map((r: any) => ({ channels: r.channels || "none", count: Number(r.n) })),
    devices: devices.map((r: any) => ({
      platform: r.platform,
      browser: r.browser,
      installed: Number(r.installed) === 1,
      count: Number(r.n),
    })),
    onTimeRate: Number(l.total) ? Number(l.within60) / Number(l.total) : null,
    ackRate: Number(l.total) ? Number(l.acked) / Number(l.total) : null,
    push: { enabled: Boolean(loadVapidKeys()) },
  });
});
