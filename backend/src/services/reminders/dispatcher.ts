import crypto from "crypto";
import { and, eq, gte, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { PushSubscription, ReminderJob } from "../../db/reminderSchema";
import { notifyUser } from "../../utils/notifications";
import logger from "../../utils/logger";
import {
  apiUrl,
  appUrl,
  sendWebPush,
  signAction,
  topicFor,
  type PushSender,
} from "./webPush";
import { describeLead, formatClock, kigaliInstant, kigaliParts } from "./time";
import { deliverTelegram, escalateUnacked } from "./channels";

/**
 * The once-a-minute dispatcher (REMINDERS_SOLUTION_PROPOSAL.md §4).
 *
 * Claim-then-deliver: a job is moved pending -> sending under a random claim
 * token in one UPDATE, so two API processes (or an overlapping tick) can never
 * deliver the same reminder twice. A claim left behind by a crash is released
 * after STALE_CLAIM_MS.
 */

const STALE_CLAIM_MS = 5 * 60_000;
/** A missed morning briefing is still useful for a couple of hours. */
const BRIEFING_GRACE_MS = 2 * 3_600_000;
/** Keeps Chrome's low-engagement heuristics well away (proposal §7.5). */
export const DAILY_PUSH_CAP = 8;
const SNOOZE_MIN = 5;
const MAX_FAILURES_BEFORE_DROP = 10;

export type JobRow = typeof ReminderJob.$inferSelect;

export interface DispatchDeps {
  now?: Date;
  send?: PushSender;
  batchSize?: number;
}

const LABELS: Record<string, (title: string, lead: string) => string> = {
  lesson: (t, lead) => `${t} ${lead}`,
  activity: (t, lead) => `${t} ${lead}`,
  meeting: (t, lead) => `${t} ${lead}`,
  event: (t, lead) => `${t} ${lead}`,
  quiz_open: (t, lead) => `Quiz opens ${lead}: ${t}`,
  quiz_close: (t, lead) => `Quiz closes ${lead}: ${t}`,
  assignment_due: (t, lead) => `Due ${lead}: ${t}`,
};

/** The notification text, worded at send time so "in 10 min" is true. */
export const describeJob = (job: Pick<JobRow, "source_type" | "title" | "body" | "event_start">, now: Date) => {
  if (job.source_type === "briefing" || job.source_type === "test" || job.source_type === "change") {
    return { title: job.title, body: job.body ?? "" };
  }
  const start = new Date(job.event_start as any);
  const lead = describeLead(start, now);
  const label = LABELS[job.source_type] ?? LABELS.event;
  const clock = formatClock(kigaliParts(start).minutes);
  return {
    title: label(job.title, lead),
    body: [clock, job.body].filter(Boolean).join(" · "),
  };
};

/**
 * One payload understood everywhere: the Declarative Web Push shape
 * (`web_push: 8030`, shown by Safari 18.4+ without running JS) whose
 * `notification.data` carries what our service worker needs for the
 * Got it / Snooze actions on Chromium and Firefox.
 */
export const buildPayload = (job: JobRow, now: Date) => {
  const { title, body } = describeJob(job, now);
  const sig = signAction(job.job_id, job.user_id);
  const url = appUrl(job.link);
  return JSON.stringify({
    web_push: 8030,
    notification: {
      title,
      body,
      navigate: url,
      lang: "en",
      dir: "ltr",
      tag: topicFor(job.dedupe_key.replace(/:\d+$/, "")),
      silent: false,
      data: {
        jobId: job.job_id,
        kind: job.source_type,
        url,
        critical: Number(job.critical) === 1,
        eventStart: new Date(job.event_start as any).toISOString(),
        ackUrl: apiUrl(`/reminders/actions/${job.job_id}/ack?sig=${sig}`),
        snoozeUrl: apiUrl(`/reminders/actions/${job.job_id}/snooze?sig=${sig}`),
      },
    },
  });
};

/** Pushes already sent to `userId` since Kigali midnight. */
const pushesSentToday = async (userId: number, now: Date) => {
  const midnight = kigaliInstant(kigaliParts(now).ymd, 0);
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(ReminderJob)
    .where(
      and(
        eq(ReminderJob.user_id, userId),
        gte(ReminderJob.sent_at, midnight),
        sql`${ReminderJob.channels} LIKE '%push%'`,
        notInArray(ReminderJob.source_type, ["test"]),
      ),
    );
  return Number(row?.n ?? 0);
};

export interface DeliveryReport {
  jobId: number;
  channels: string[];
  pushAttempted: number;
  pushDelivered: number;
  capped: boolean;
  errors: string[];
}

/** Deliver one claimed job on every channel the user has. */
export const deliverJob = async (job: JobRow, deps: DispatchDeps = {}): Promise<DeliveryReport> => {
  const now = deps.now ?? new Date();
  const send = deps.send ?? sendWebPush;
  const report: DeliveryReport = {
    jobId: job.job_id,
    channels: [],
    pushAttempted: 0,
    pushDelivered: 0,
    capped: false,
    errors: [],
  };
  const text = describeJob(job, now);

  // In-app: always, so the bell carries the reminder even with push off.
  if (job.source_type !== "test") {
    await notifyUser({
      userId: job.user_id,
      kind: "reminder",
      title: text.title.slice(0, 255),
      body: text.body.slice(0, 500) || undefined,
      link: job.link ?? "/reminders",
      subjectType: "reminder",
      subjectId: job.job_id,
    });
    report.channels.push("in_app");
  }

  const subscriptions = await db
    .select()
    .from(PushSubscription)
    .where(eq(PushSubscription.user_id, job.user_id));

  if (subscriptions.length > 0) {
    const critical = Number(job.critical) === 1;
    const exempt = critical || job.source_type === "test";
    if (!exempt && (await pushesSentToday(job.user_id, now)) >= DAILY_PUSH_CAP) {
      report.capped = true;
    } else {
      const payload = buildPayload(job, now);
      const eventStart = new Date(job.event_start as any).getTime();
      // Drop the message rather than deliver it after the event began.
      const ttl =
        job.source_type === "briefing"
          ? 3 * 3600
          : Math.max(60, Math.round((eventStart - now.getTime()) / 1000));
      for (const sub of subscriptions) {
        report.pushAttempted += 1;
        const result = await send(sub, payload, {
          ttl,
          urgency: "high",
          topic: topicFor(job.dedupe_key),
        });
        if (result.ok) {
          report.pushDelivered += 1;
          await db
            .update(PushSubscription)
            .set({ last_success_at: now, failure_count: 0 })
            .where(eq(PushSubscription.subscription_id, sub.subscription_id));
        } else if (result.gone || sub.failure_count + 1 >= MAX_FAILURES_BEFORE_DROP) {
          await db.delete(PushSubscription).where(eq(PushSubscription.subscription_id, sub.subscription_id));
          report.errors.push(`subscription ${sub.subscription_id} removed (${result.statusCode ?? "error"})`);
        } else {
          await db
            .update(PushSubscription)
            .set({ failure_count: sub.failure_count + 1 })
            .where(eq(PushSubscription.subscription_id, sub.subscription_id));
          report.errors.push(result.error);
        }
      }
      if (report.pushDelivered > 0) report.channels.push("push");
    }
  }

  // Telegram (when linked): not subject to the push cap -- it's the person's
  // own chat, and they chose it.
  const telegram = await deliverTelegram(job, text);
  report.channels.push(...telegram.channels);
  report.errors.push(...telegram.errors);
  return report;
};

const finish = async (job: JobRow, report: DeliveryReport, now: Date) => {
  await db
    .update(ReminderJob)
    .set({
      status: "sent",
      sent_at: now,
      channels: report.channels.join(",") || null,
      attempts: job.attempts + 1,
      claim_token: null,
      last_error: report.errors.length ? report.errors.join("; ").slice(0, 500) : null,
    })
    .where(eq(ReminderJob.job_id, job.job_id));
};

/** "YYYY-MM-DD HH:MM:SS" in UTC -- how Drizzle stores a Date in a DATETIME. */
export const toDbUtc = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

/** One dispatcher tick. Returns how many reminders went out. */
export const dispatchDue = async (deps: DispatchDeps = {}) => {
  const now = deps.now ?? new Date();
  const batchSize = deps.batchSize ?? 100;

  // Release claims orphaned by a crash mid-delivery.
  await db
    .update(ReminderJob)
    .set({ status: "pending", claim_token: null })
    .where(
      and(eq(ReminderJob.status, "sending"), lt(ReminderJob.claimed_at, new Date(now.getTime() - STALE_CLAIM_MS))),
    );

  // A reminder for something that already started is noise: expire it.
  await db
    .update(ReminderJob)
    .set({ status: "expired" })
    .where(
      and(
        eq(ReminderJob.status, "pending"),
        lte(ReminderJob.event_start, now),
        notInArray(ReminderJob.source_type, ["briefing", "test"]),
      ),
    );
  await db
    .update(ReminderJob)
    .set({ status: "expired" })
    .where(
      and(
        eq(ReminderJob.status, "pending"),
        eq(ReminderJob.source_type, "briefing"),
        lt(ReminderJob.fire_at, new Date(now.getTime() - BRIEFING_GRACE_MS)),
      ),
    );

  const token = crypto.randomUUID();
  // Raw SQL (UPDATE ... ORDER BY ... LIMIT has no builder form), so the
  // instant is bound as the same UTC text Drizzle writes for DATETIME columns.
  // A bare Date here would be formatted by mysql2 in the *host's* zone and, on
  // a UTC+2 machine, claim reminders two hours early.
  const nowUtc = toDbUtc(now);
  await db.execute(sql`
    UPDATE ${ReminderJob}
       SET status = 'sending', claim_token = ${token}, claimed_at = ${nowUtc}
     WHERE status = 'pending' AND fire_at <= ${nowUtc}
     ORDER BY fire_at
     LIMIT ${batchSize}
  `);
  const claimed = await db.select().from(ReminderJob).where(eq(ReminderJob.claim_token, token));

  let sent = 0;
  for (const job of claimed) {
    try {
      const report = await deliverJob(job, { ...deps, now });
      await finish(job, report, now);
      sent += 1;
    } catch (error: any) {
      logger.error("[reminders] delivery failed", { error, data: { jobId: job.job_id } });
      await db
        .update(ReminderJob)
        .set({
          status: job.attempts + 1 >= 3 ? "failed" : "pending",
          attempts: job.attempts + 1,
          claim_token: null,
          last_error: String(error?.message || error).slice(0, 500),
        })
        .where(eq(ReminderJob.job_id, job.job_id));
    }
  }
  // Important reminders nobody opened: one email, for those who opted in.
  const escalated = await escalateUnacked(describeJob, now).catch((error) => {
    logger.error("[reminders] escalation tick failed", { error });
    return 0;
  });
  return { claimed: claimed.length, sent, escalated };
};

/** "Got it": the user saw it. */
export const ackJob = async (jobId: number, userId: number, now = new Date()) => {
  const [result] = (await db
    .update(ReminderJob)
    .set({ acked_at: now, status: sql`IF(${ReminderJob.status} = 'sent', 'acked', ${ReminderJob.status})` })
    .where(and(eq(ReminderJob.job_id, jobId), eq(ReminderJob.user_id, userId)))) as any;
  return Number(result?.affectedRows ?? 0) > 0;
};

/**
 * "Snooze 5 min": a fresh one-off copy, only while there is still time
 * before the event (a snooze past the start would just be late).
 */
export const snoozeJob = async (jobId: number, userId: number, now = new Date()) => {
  const [job] = await db
    .select()
    .from(ReminderJob)
    .where(and(eq(ReminderJob.job_id, jobId), eq(ReminderJob.user_id, userId)))
    .limit(1);
  if (!job) return { ok: false as const, reason: "not_found" };
  const fireAt = new Date(now.getTime() + SNOOZE_MIN * 60_000);
  const eventStart = new Date(job.event_start as any);
  if (job.source_type !== "briefing" && fireAt.getTime() >= eventStart.getTime()) {
    return { ok: false as const, reason: "too_late" };
  }
  await ackJob(jobId, userId, now);
  await db.insert(ReminderJob).values({
    user_id: userId,
    dedupe_key: `${job.dedupe_key.slice(0, 150)}:snooze:${now.getTime()}`,
    source_type: job.source_type,
    source_ref: job.source_ref,
    title: job.title,
    body: job.body,
    link: job.link,
    location: job.location,
    event_start: job.source_type === "briefing" ? fireAt : eventStart,
    event_end: job.event_end,
    offset_min: 0,
    fire_at: fireAt,
    critical: job.critical,
    status: "pending",
  });
  return { ok: true as const, fireAt };
};

/** "Send a test notification": delivered immediately through the real pipeline. */
export const sendTestReminder = async (userId: number, deps: DispatchDeps = {}) => {
  const now = deps.now ?? new Date();
  const [insert] = (await db.insert(ReminderJob).values({
    user_id: userId,
    dedupe_key: `test:${now.getTime()}:${crypto.randomUUID().slice(0, 8)}`,
    source_type: "test",
    title: "Reminders are working 🎉",
    body: "This is how NGA will remind you before lessons, quizzes and deadlines.",
    link: "/reminders",
    event_start: new Date(now.getTime() + 10 * 60_000),
    offset_min: 0,
    fire_at: now,
    status: "sending",
    claimed_at: now,
  })) as any;
  const [job] = await db.select().from(ReminderJob).where(eq(ReminderJob.job_id, insert.insertId)).limit(1);
  const report = await deliverJob(job, { ...deps, now });
  await finish(job, report, now);
  return report;
};

/** Upcoming and recent reminders for the settings page. */
export const listUserJobs = async (userId: number, now = new Date()) => {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  return db
    .select({
      job_id: ReminderJob.job_id,
      source_type: ReminderJob.source_type,
      title: ReminderJob.title,
      body: ReminderJob.body,
      link: ReminderJob.link,
      event_start: ReminderJob.event_start,
      fire_at: ReminderJob.fire_at,
      offset_min: ReminderJob.offset_min,
      status: ReminderJob.status,
      channels: ReminderJob.channels,
      critical: ReminderJob.critical,
      sent_at: ReminderJob.sent_at,
      acked_at: ReminderJob.acked_at,
    })
    .from(ReminderJob)
    .where(
      and(
        eq(ReminderJob.user_id, userId),
        gte(ReminderJob.fire_at, since),
        inArray(ReminderJob.status, ["pending", "sending", "sent", "acked"]),
        notInArray(ReminderJob.source_type, ["test"]),
      ),
    )
    .orderBy(ReminderJob.fire_at)
    .limit(60);
};
