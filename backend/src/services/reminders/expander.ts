import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { syncGoogleSoon } from "./channels";
import { db } from "../../db";
import { ReminderJob, ReminderPreference } from "../../db/reminderSchema";
import logger from "../../utils/logger";
import { collectOccurrences, type Occurrence } from "./occurrences";
import { getPreferences, MAX_OFFSET_MIN, type ReminderPreferences } from "./preferences";
import {
  addDaysYmd,
  formatClock,
  kigaliDatesBetween,
  kigaliInstant,
  kigaliParts,
  parseClock,
  shiftOutOfQuiet,
} from "./time";

/**
 * Turns a user's upcoming occurrences into ReminderJob rows.
 *
 * Idempotent: every job has a dedupe key (occurrence + offset), so re-running
 * only refreshes still-pending rows and never re-arms a reminder that was
 * already sent. Pending rows whose occurrence disappeared (lesson moved,
 * subject disabled, quiz cancelled, preference turned off) are cancelled.
 */

/** How far ahead jobs are materialised. The scheduler re-runs well within it. */
export const HORIZON_HOURS = 36;
/** A reminder whose time has passed is still worth sending this long after. */
const LATE_GRACE_MS = 2 * 60_000;
export const BRIEFING_MINUTES = 6 * 60 + 30;

export interface PlannedJob {
  dedupeKey: string;
  sourceType: string;
  sourceRef: string | null;
  title: string;
  body: string | null;
  link: string | null;
  location: string | null;
  eventStart: Date;
  eventEnd: Date | null;
  offsetMin: number;
  fireAt: Date;
  critical: boolean;
}

/** Teachers get a slightly longer default lead for their own lessons. */
const lessonOffsets = (occ: Occurrence, prefs: ReminderPreferences, explicit: boolean) => {
  const offsets = prefs.settings.lesson.offsets;
  if (!explicit && occ.role === "teaching" && offsets.length === 1 && offsets[0] === 10) return [15];
  return offsets;
};

/**
 * Pure planning step: occurrences + preferences -> the jobs that should
 * exist. Separated from the DB writes so the rules are unit-testable.
 */
export const planJobs = (
  occurrences: Occurrence[],
  prefs: ReminderPreferences,
  now: Date,
  horizonEnd: Date,
  options: { explicitLessonOffsets?: boolean } = {},
): PlannedJob[] => {
  const quietStart = parseClock(prefs.quietStart) ?? 0;
  const quietEnd = parseClock(prefs.quietEnd) ?? 0;
  const jobs: PlannedJob[] = [];

  for (const occ of occurrences) {
    const setting = prefs.settings[occ.kind];
    if (!setting || !setting.enabled) continue;
    const offsets =
      occ.kind === "lesson" ? lessonOffsets(occ, prefs, Boolean(options.explicitLessonOffsets)) : setting.offsets;

    for (const offset of offsets) {
      let fireAt: Date | null = new Date(occ.start.getTime() - offset * 60_000);
      if (!occ.critical) fireAt = shiftOutOfQuiet(fireAt, occ.start, quietStart, quietEnd);
      if (!fireAt) continue;
      if (fireAt.getTime() < now.getTime() - LATE_GRACE_MS) continue;
      if (fireAt.getTime() > horizonEnd.getTime()) continue;
      if (occ.start.getTime() <= now.getTime()) continue;
      jobs.push({
        dedupeKey: `${occ.key}:${offset}`,
        sourceType: occ.kind,
        sourceRef: occ.sourceRef,
        title: occ.title,
        body: occ.detail,
        link: occ.link,
        location: occ.location,
        eventStart: occ.start,
        eventEnd: occ.end,
        offsetMin: offset,
        fireAt,
        critical: occ.critical,
      });
    }
  }

  // Morning briefing: one calm summary instead of a burst of pings.
  if (prefs.morningBriefing) {
    for (const ymd of kigaliDatesBetween(now, horizonEnd)) {
      const fireAt = kigaliInstant(ymd, BRIEFING_MINUTES);
      if (fireAt.getTime() < now.getTime() - LATE_GRACE_MS || fireAt.getTime() > horizonEnd.getTime()) continue;
      const dayEnd = kigaliInstant(addDaysYmd(ymd, 1), 0);
      const today = occurrences.filter(
        (o) => o.start.getTime() >= fireAt.getTime() && o.start.getTime() < dayEnd.getTime(),
      );
      if (today.length === 0) continue;
      const lessons = today.filter((o) => o.kind === "lesson").length;
      const deadlines = today.filter((o) => ["assignment_due", "quiz_close"].includes(o.kind)).length;
      const others = today.length - lessons - deadlines;
      const counts = [
        lessons ? `${lessons} lesson${lessons === 1 ? "" : "s"}` : null,
        deadlines ? `${deadlines} deadline${deadlines === 1 ? "" : "s"}` : null,
        others ? `${others} other` : null,
      ].filter(Boolean);
      const first = today[0];
      jobs.push({
        dedupeKey: `briefing:${ymd}`,
        sourceType: "briefing",
        sourceRef: null,
        title: `Your day: ${counts.join(" · ")}`,
        body: `First up: ${first.title} at ${formatClock(kigaliParts(first.start).minutes)}`,
        link: "/reminders",
        location: null,
        eventStart: fireAt,
        eventEnd: null,
        offsetMin: 0,
        fireAt,
        critical: false,
      });
    }
  }
  return jobs;
};

/** Cancel every still-pending future job for a user (reminders switched off). */
export const cancelPendingJobs = async (userId: number, now = new Date()) => {
  await db
    .update(ReminderJob)
    .set({ status: "cancelled" })
    .where(and(eq(ReminderJob.user_id, userId), eq(ReminderJob.status, "pending"), gte(ReminderJob.fire_at, now)));
};

/**
 * Plans for one user never overlap: a plan that started before a newer
 * change (a source saved a moment later) would otherwise see a stale world
 * and cancel the reminder the newer plan just made. Calls queue per user;
 * each runs on the database as it is when its turn comes.
 */
const planning = new Map<number, Promise<unknown>>();
export const expandForUser = (userId: number, now?: Date): Promise<{ planned: number; cancelled: number }> => {
  const previous = planning.get(userId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(() => planForUser(userId, now ?? new Date()));
  planning.set(userId, run);
  run
    .finally(() => {
      if (planning.get(userId) === run) planning.delete(userId);
    })
    .catch(() => undefined);
  return run;
};

const planForUser = async (
  userId: number,
  now: Date,
): Promise<{ planned: number; cancelled: number }> => {
  const prefs = await getPreferences(userId);
  if (!prefs.enabled) {
    await cancelPendingJobs(userId, now);
    return { planned: 0, cancelled: 0 };
  }

  const horizonEnd = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);
  // An occurrence up to MAX_OFFSET_MIN after the horizon can still need a job
  // inside it (e.g. the "24 h before" reminder of a deadline).
  const maxOffset = Math.min(
    MAX_OFFSET_MIN,
    Math.max(0, ...Object.values(prefs.settings).flatMap((s) => s.offsets)),
  );
  const occurrences = await collectOccurrences(
    userId,
    now,
    new Date(horizonEnd.getTime() + maxOffset * 60_000),
  );
  const jobs = planJobs(occurrences, prefs, now, horizonEnd, {
    explicitLessonOffsets: Boolean(prefs.lessonCustomized),
  });

  for (const job of jobs) {
    // Refresh a pending row in place (time moved, title changed), and bring
    // back one the planner itself set aside as "cancelled" (reminders
    // switched off and on again, a kind re-enabled): the plan wants it, so
    // it's due again. Rows that went out (sent/acked), expired, or were
    // "withdrawn" because their item was cancelled are left alone.
    const pending = sql`${ReminderJob.status} IN ('pending', 'cancelled')`;
    await db
      .insert(ReminderJob)
      .values({
        user_id: userId,
        dedupe_key: job.dedupeKey,
        source_type: job.sourceType,
        source_ref: job.sourceRef,
        title: job.title.slice(0, 255),
        body: job.body?.slice(0, 500) ?? null,
        link: job.link,
        location: job.location?.slice(0, 150) ?? null,
        event_start: job.eventStart,
        event_end: job.eventEnd,
        offset_min: job.offsetMin,
        fire_at: job.fireAt,
        critical: job.critical ? 1 : 0,
        status: "pending",
      })
      .onDuplicateKeyUpdate({
        set: {
          title: sql`IF(${pending}, VALUES(${ReminderJob.title}), ${ReminderJob.title})`,
          body: sql`IF(${pending}, VALUES(${ReminderJob.body}), ${ReminderJob.body})`,
          link: sql`IF(${pending}, VALUES(${ReminderJob.link}), ${ReminderJob.link})`,
          location: sql`IF(${pending}, VALUES(${ReminderJob.location}), ${ReminderJob.location})`,
          event_start: sql`IF(${pending}, VALUES(${ReminderJob.event_start}), ${ReminderJob.event_start})`,
          event_end: sql`IF(${pending}, VALUES(${ReminderJob.event_end}), ${ReminderJob.event_end})`,
          fire_at: sql`IF(${pending}, VALUES(${ReminderJob.fire_at}), ${ReminderJob.fire_at})`,
          critical: sql`IF(${pending}, VALUES(${ReminderJob.critical}), ${ReminderJob.critical})`,
          // Last, so the conditions above still see the old status.
          status: sql`IF(${pending}, 'pending', ${ReminderJob.status})`,
        },
      });
  }

  // Anything still pending in the window that the plan no longer contains is stale.
  const keep = jobs.map((j) => j.dedupeKey);
  const staleFilters = [
    eq(ReminderJob.user_id, userId),
    eq(ReminderJob.status, "pending"),
    gte(ReminderJob.fire_at, new Date(now.getTime() - LATE_GRACE_MS)),
    // Snoozed copies and test pings are not part of the plan -- never touch them.
    notInArray(ReminderJob.source_type, ["test", "change"]),
    sql`${ReminderJob.dedupe_key} NOT LIKE '%:snooze:%'`,
  ];
  if (keep.length > 0) staleFilters.push(notInArray(ReminderJob.dedupe_key, keep));
  const [result] = (await db.update(ReminderJob).set({ status: "cancelled" }).where(and(...staleFilters))) as any;

  return { planned: jobs.length, cancelled: Number(result?.affectedRows ?? 0) };
};

/** Re-plan every user who has reminders switched on. Errors are per user. */
export const expandAll = async (now: Date = new Date()) => {
  const users = await db
    .select({ user_id: ReminderPreference.user_id })
    .from(ReminderPreference)
    .where(eq(ReminderPreference.enabled, 1));
  let planned = 0;
  for (const { user_id } of users) {
    try {
      planned += (await expandForUser(user_id, now)).planned;
    } catch (error) {
      logger.error("[reminders] expand failed", { error, data: { userId: user_id } });
    }
    // Yield between users: the API runs on a 1-connection pool, so let
    // queued user requests interleave with a long expansion.
    await new Promise((resolve) => setImmediate(resolve));
  }
  return { users: users.length, planned };
};

let soonHook: ((userIds: number[]) => void) | null = null;
/**
 * Test hook: record who would be re-planned instead of planning in the
 * background (the suite shares one module registry, so vi.mock can't).
 */
export const setExpandSoonHook = (fn: ((userIds: number[]) => void) | null) => {
  soonHook = fn;
};

/** Re-plan a set of users in the background (e.g. after a Source API write). */
export const expandUsersSoon = (userIds: number[]) => {
  const unique = Array.from(new Set(userIds)).filter((id) => Number.isInteger(id) && id > 0);
  if (unique.length === 0) return;
  if (soonHook) return soonHook(unique);
  // Connected Google calendars mirror the plan (independent of push opt-in).
  syncGoogleSoon(unique);
  setImmediate(async () => {
    try {
      const enabled = await db
        .select({ user_id: ReminderPreference.user_id })
        .from(ReminderPreference)
        .where(and(eq(ReminderPreference.enabled, 1), inArray(ReminderPreference.user_id, unique)));
      for (const { user_id } of enabled) {
        await expandForUser(user_id).catch((error) =>
          logger.error("[reminders] expand failed", { error, data: { userId: user_id } }),
        );
      }
    } catch (error) {
      logger.error("[reminders] background expand failed", { error });
    }
  });
};
