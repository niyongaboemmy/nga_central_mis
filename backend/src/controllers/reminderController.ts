import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { PushSubscription, ReminderJob, ReminderPreference, ReminderSource } from "../db/reminderSchema";
import { asyncHandler } from "../middleware/asyncHandler";
import { NotFoundError, ValidationError } from "../errors/CustomError";
import { successResponse } from "../utils/response";
import logger from "../utils/logger";
import { collectOccurrences, loadCurrentTerm } from "../services/reminders/occurrences";
import { StudentSubjectEnrollment } from "../db/schema";
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
  apiUrl,
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
  successResponse(res, "Reminder configuration", {
    push: { enabled: Boolean(keys), publicKey: keys?.publicKey ?? null },
    dailyPushCap: DAILY_PUSH_CAP,
    kinds: REMINDER_KINDS,
  });
});

export const getMyReminders = asyncHandler(async (req: any, res: any) => {
  const userId = userIdOf(req);
  const [preferences, devices, jobs, token] = await Promise.all([
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
  ]);
  successResponse(res, "Reminder settings", {
    preferences,
    devices,
    jobs,
    feed: token ? feedUrls(token) : null,
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
  successResponse(res, "Reminder preferences saved", preferences);
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

/** Students actively enrolled in `subjectId` this academic year. */
const enrolledStudentIds = async (subjectId: number): Promise<number[]> => {
  const term = await loadCurrentTerm();
  if (!term) return [];
  const rows = await db
    .select({ user_id: StudentSubjectEnrollment.user_id })
    .from(StudentSubjectEnrollment)
    .where(
      and(
        eq(StudentSubjectEnrollment.subject_id, subjectId),
        eq(StudentSubjectEnrollment.academic_year_id, term.yearId),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
      ),
    );
  return rows.map((r: any) => Number(r.user_id));
};

const SOURCE_KINDS = new Set<ReminderKind>(["quiz_open", "quiz_close", "assignment_due", "meeting", "event"]);
const APP_KEY = /^[a-z][a-z0-9_-]{1,29}$/;

const parseInstant = (value: unknown, field: string): Date => {
  const d = new Date(String(value ?? ""));
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} must be an ISO date-time`);
  return d;
};

/**
 * PUT /reminders/sources -- create or replace one item, e.g. a quiz closing
 * time, for a list of MIS user ids. Idempotent on (app, type, external_id).
 */
export const upsertSource = asyncHandler(async (req: any, res: any) => {
  const b = req.body ?? {};
  if (!APP_KEY.test(String(b.source_app || ""))) throw new ValidationError("source_app is required (e.g. taskmentor)");
  if (!SOURCE_KINDS.has(b.source_type)) {
    throw new ValidationError(`source_type must be one of ${Array.from(SOURCE_KINDS).join(", ")}`);
  }
  const externalId = String(b.external_id ?? "").trim();
  if (!externalId || externalId.length > 100) throw new ValidationError("external_id is required");
  const title = String(b.title ?? "").trim();
  if (!title) throw new ValidationError("title is required");
  const startsAt = parseInstant(b.starts_at, "starts_at");
  const endsAt = b.ends_at ? parseInstant(b.ends_at, "ends_at") : null;
  const audience: number[] = Array.isArray(b.audience_user_ids)
    ? Array.from(new Set(b.audience_user_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];
  const subjectId = b.audience_subject_id === undefined || b.audience_subject_id === null ? null : Number(b.audience_subject_id);
  if (subjectId !== null && (!Number.isInteger(subjectId) || subjectId <= 0)) {
    throw new ValidationError("audience_subject_id must be an MIS subject id");
  }
  if (audience.length === 0 && subjectId === null) {
    throw new ValidationError("Give audience_user_ids (MIS user ids), audience_subject_id (its enrolled students), or both");
  }
  if (audience.length > 5000) throw new ValidationError("audience_user_ids is limited to 5000 users per item");
  const link = typeof b.link === "string" && b.link.length <= 500 ? b.link : null;

  const values = {
    source_app: b.source_app,
    source_type: b.source_type,
    external_id: externalId,
    title: title.slice(0, 255),
    body: typeof b.body === "string" ? b.body.slice(0, 500) : null,
    link,
    location: typeof b.location === "string" ? b.location.slice(0, 150) : null,
    starts_at: startsAt,
    ends_at: endsAt,
    critical: b.critical ? 1 : 0,
    audience_user_ids: audience,
    audience_subject_id: subjectId,
    cancelled_at: null,
  };
  await db
    .insert(ReminderSource)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        title: values.title,
        body: values.body,
        link: values.link,
        location: values.location,
        starts_at: values.starts_at,
        ends_at: values.ends_at,
        critical: values.critical,
        audience_user_ids: values.audience_user_ids,
        audience_subject_id: values.audience_subject_id,
        cancelled_at: null,
      },
    });
  // Anyone removed from the audience still has pending jobs for this item:
  // re-plan the old audience as well as the new one.
  const [existing] = await db
    .select({ source_id: ReminderSource.source_id })
    .from(ReminderSource)
    .where(
      and(
        eq(ReminderSource.source_app, values.source_app),
        eq(ReminderSource.source_type, values.source_type),
        eq(ReminderSource.external_id, externalId),
      ),
    )
    .limit(1);
  const holders = existing
    ? await db
        .selectDistinct({ user_id: ReminderJob.user_id })
        .from(ReminderJob)
        .where(and(sql`${ReminderJob.dedupe_key} LIKE ${`src:${existing.source_id}:%`}`, eq(ReminderJob.status, "pending")))
    : [];
  const enrolled = subjectId ? await enrolledStudentIds(subjectId) : [];
  expandUsersSoon([...audience, ...enrolled, ...holders.map((h: any) => h.user_id)]);
  successResponse(res, "Reminder source saved", { source_id: existing?.source_id ?? null, audience: audience.length });
});

export const cancelSource = asyncHandler(async (req: any, res: any) => {
  const { app, type, externalId } = req.params;
  const [source] = await db
    .select()
    .from(ReminderSource)
    .where(
      and(eq(ReminderSource.source_app, app), eq(ReminderSource.source_type, type), eq(ReminderSource.external_id, externalId)),
    )
    .limit(1);
  if (!source) throw new NotFoundError("Reminder source not found");
  await db.update(ReminderSource).set({ cancelled_at: new Date() }).where(eq(ReminderSource.source_id, source.source_id));
  const [result] = (await db
    .update(ReminderJob)
    .set({ status: "cancelled" })
    .where(and(sql`${ReminderJob.dedupe_key} LIKE ${`src:${source.source_id}:%`}`, eq(ReminderJob.status, "pending")))) as any;
  successResponse(res, "Reminder source cancelled", { cancelledJobs: Number(result?.affectedRows ?? 0) });
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
