import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { StudentSubjectEnrollment } from "../../db/schema";
import { ReminderJob, ReminderSource } from "../../db/reminderSchema";
import { ValidationError } from "../../errors/CustomError";
import logger from "../../utils/logger";
import { loadCurrentTerm } from "./occurrences";
import type { ReminderKind } from "./preferences";
import { expandUsersSoon } from "./expander";
import { addDaysYmd, formatClock, kigaliParts } from "./time";

/**
 * Items other NGA apps register through the Source API (Task Mentor quizzes
 * and assignments, Tupo meetings). See docs/REMINDER_HUB.md.
 *
 * When an item that people were already reminded about moves or is
 * cancelled close to its time, they get a one-off "change notice" (source
 * type `change`) -- otherwise the last thing they heard would be wrong.
 */

export const SOURCE_KINDS = new Set<ReminderKind>(["quiz_open", "quiz_close", "assignment_due", "meeting", "event"]);
const APP_KEY = /^[a-z][a-z0-9_-]{1,29}$/;
export const MAX_AUDIENCE = 5000;
export const MAX_BATCH = 200;
/** Only moves/cancellations this close to the (old or new) time are announced. */
const NOTICE_WINDOW_MS = 48 * 3_600_000;
/** Smaller shifts (clock drift, re-saves) aren't worth a notification. */
const NOTICE_MIN_SHIFT_MS = 60_000;

export interface SourceItem {
  source_app: string;
  source_type: ReminderKind;
  external_id: string;
  title: string;
  body: string | null;
  link: string | null;
  location: string | null;
  starts_at: Date;
  ends_at: Date | null;
  critical: 0 | 1;
  audience_user_ids: number[];
  audience_subject_id: number | null;
}

/** Whole seconds, as a DATETIME column keeps them (so re-sends compare equal). */
const parseInstant = (value: unknown, field: string): Date => {
  const d = new Date(String(value ?? ""));
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${field} must be an ISO date-time`);
  return new Date(Math.floor(d.getTime() / 1000) * 1000);
};

/** Validate one item from a request body. Throws ValidationError. */
export const parseSourceItem = (b: any): SourceItem => {
  b = b ?? {};
  if (!APP_KEY.test(String(b.source_app || ""))) throw new ValidationError("source_app is required (e.g. taskmentor)");
  if (!SOURCE_KINDS.has(b.source_type)) {
    throw new ValidationError(`source_type must be one of ${Array.from(SOURCE_KINDS).join(", ")}`);
  }
  const externalId = String(b.external_id ?? "").trim();
  if (!externalId || externalId.length > 100) throw new ValidationError("external_id is required (max 100 characters)");
  const title = String(b.title ?? "").trim();
  if (!title) throw new ValidationError("title is required");
  const audience: number[] = Array.isArray(b.audience_user_ids)
    ? Array.from(new Set<number>(b.audience_user_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)))
    : [];
  const subjectId = b.audience_subject_id === undefined || b.audience_subject_id === null ? null : Number(b.audience_subject_id);
  if (subjectId !== null && (!Number.isInteger(subjectId) || subjectId <= 0)) {
    throw new ValidationError("audience_subject_id must be an MIS subject id");
  }
  if (audience.length === 0 && subjectId === null) {
    throw new ValidationError("Give audience_user_ids (MIS user ids), audience_subject_id (its enrolled students), or both");
  }
  if (audience.length > MAX_AUDIENCE) throw new ValidationError(`audience_user_ids is limited to ${MAX_AUDIENCE} users per item`);
  return {
    source_app: b.source_app,
    source_type: b.source_type,
    external_id: externalId,
    title: title.slice(0, 255),
    body: typeof b.body === "string" ? b.body.slice(0, 500) : null,
    link: typeof b.link === "string" && b.link.length <= 500 ? b.link : null,
    location: typeof b.location === "string" ? b.location.slice(0, 150) : null,
    starts_at: parseInstant(b.starts_at, "starts_at"),
    ends_at: b.ends_at ? parseInstant(b.ends_at, "ends_at") : null,
    critical: b.critical ? 1 : 0,
    audience_user_ids: audience,
    audience_subject_id: subjectId,
  };
};

/** Students actively enrolled in `subjectId` this academic year. */
export const enrolledStudentIds = async (subjectId: number): Promise<number[]> => {
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

const findSource = async (app: string, type: string, externalId: string) => {
  const [row] = await db
    .select()
    .from(ReminderSource)
    .where(and(eq(ReminderSource.source_app, app), eq(ReminderSource.source_type, type), eq(ReminderSource.external_id, externalId)))
    .limit(1);
  return row ?? null;
};

/** Everyone who holds a reminder (sent, seen or still pending) for a source. */
const reminderHolders = async (sourceId: number, statuses = ["pending", "sending", "sent", "acked"]) => {
  const rows = await db
    .selectDistinct({ user_id: ReminderJob.user_id })
    .from(ReminderJob)
    .where(and(sql`${ReminderJob.dedupe_key} LIKE ${`src:${sourceId}:%`}`, inArray(ReminderJob.status, statuses)));
  return rows.map((r: any) => Number(r.user_id));
};

/** "Tue 14:00" in Kigali time. */
export const describeWhen = (at: Date, now: Date) => {
  const at_ = kigaliParts(at);
  const today = kigaliParts(now).ymd;
  const clock = formatClock(at_.minutes);
  if (at_.ymd === today) return `today at ${clock}`;
  if (at_.ymd === addDaysYmd(today, 1)) return `tomorrow at ${clock}`;
  const day = new Date(`${at_.ymd}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return `${day} at ${clock}`;
};

const NOTICE_LABEL: Record<string, string> = {
  quiz_open: "Quiz",
  quiz_close: "Quiz deadline",
  assignment_due: "Assignment deadline",
  meeting: "Meeting",
  event: "Event",
};

/** Queue an immediate one-off notice for each user (idempotent per user+key). */
const queueNotice = async (
  userIds: number[],
  notice: { key: string; title: string; body: string; link: string | null; eventStart: Date; critical: number },
  now: Date,
) => {
  const unique = Array.from(new Set(userIds));
  for (let i = 0; i < unique.length; i += 500) {
    const rows = unique.slice(i, i + 500).map((user_id) => ({
      user_id,
      dedupe_key: notice.key.slice(0, 191),
      source_type: "change",
      title: notice.title.slice(0, 255),
      body: notice.body.slice(0, 500),
      link: notice.link,
      event_start: notice.eventStart,
      offset_min: 0,
      fire_at: now,
      critical: notice.critical,
      status: "pending",
    }));
    // A notice already queued for this change stays as it is.
    if (rows.length) await db.insert(ReminderJob).values(rows).onDuplicateKeyUpdate({ set: { dedupe_key: sql`dedupe_key` } });
  }
  return unique.length;
};

const withinNoticeWindow = (at: Date, now: Date) => at.getTime() > now.getTime() && at.getTime() - now.getTime() <= NOTICE_WINDOW_MS;

export interface SaveResult {
  source_id: number;
  created: boolean;
  changed: boolean;
  noticed: number;
}

const sameList = (a: unknown, b: number[]) => {
  const parsed = typeof a === "string" ? (() => { try { return JSON.parse(a); } catch { return null; } })() : a;
  const list = Array.isArray(parsed) ? parsed.map(Number) : [];
  return list.length === b.length && list.every((v, i) => v === b[i]);
};

/**
 * Create or replace one item. Idempotent on (app, type, external_id): a
 * re-send with nothing changed does no work, so apps can re-sync freely.
 */
export const saveSource = async (item: SourceItem, now = new Date()): Promise<SaveResult> => {
  const before = await findSource(item.source_app, item.source_type, item.external_id);
  const unchanged =
    before &&
    !before.cancelled_at &&
    before.title === item.title &&
    (before.body ?? null) === item.body &&
    (before.link ?? null) === item.link &&
    (before.location ?? null) === item.location &&
    new Date(before.starts_at as any).getTime() === item.starts_at.getTime() &&
    (before.ends_at ? new Date(before.ends_at as any).getTime() : null) === (item.ends_at ? item.ends_at.getTime() : null) &&
    Number(before.critical) === item.critical &&
    (before.audience_subject_id ?? null) === item.audience_subject_id &&
    sameList(before.audience_user_ids, item.audience_user_ids);
  if (before && unchanged) return { source_id: before.source_id, created: false, changed: false, noticed: 0 };

  const values = { ...item, cancelled_at: null };
  const { source_app: _a, source_type: _t, external_id: _e, ...updatable } = values;
  await db.insert(ReminderSource).values(values).onDuplicateKeyUpdate({ set: updatable });
  const saved = before ?? (await findSource(item.source_app, item.source_type, item.external_id));
  const sourceId = saved!.source_id;

  // Anyone removed from the audience still has pending jobs for this item:
  // re-plan the old audience as well as the new one.
  const holders = before ? await reminderHolders(sourceId, ["pending"]) : [];
  const enrolled = item.audience_subject_id ? await enrolledStudentIds(item.audience_subject_id) : [];

  // Moved close to its time, after people were told about it: tell them.
  let noticed = 0;
  if (before && !before.cancelled_at) {
    const oldStart = new Date(before.starts_at as any);
    const shift = Math.abs(oldStart.getTime() - item.starts_at.getTime());
    if (shift >= NOTICE_MIN_SHIFT_MS && (withinNoticeWindow(oldStart, now) || withinNoticeWindow(item.starts_at, now))) {
      const told = await reminderHolders(sourceId, ["sent", "acked"]);
      const pendingSoon = withinNoticeWindow(oldStart, now) ? await reminderHolders(sourceId, ["pending"]) : [];
      const label = NOTICE_LABEL[item.source_type] ?? "Event";
      noticed = await queueNotice(
        [...told, ...pendingSoon],
        {
          key: `chg:${sourceId}:${item.starts_at.getTime()}`,
          title: `${label} moved: ${item.title}`,
          body: `Now ${describeWhen(item.starts_at, now)} (was ${describeWhen(oldStart, now)})`,
          link: item.link,
          eventStart: item.starts_at > now ? item.starts_at : oldStart,
          critical: item.critical,
        },
        now,
      );
    }
  }

  expandUsersSoon([...item.audience_user_ids, ...enrolled, ...holders]);
  return { source_id: sourceId, created: !before, changed: true, noticed };
};

/** Cancel an item and its pending reminders; announce it if people were told. */
export const cancelSourceItem = async (app: string, type: string, externalId: string, now = new Date()) => {
  const source = await findSource(app, type, externalId);
  if (!source) return null;
  if (source.cancelled_at) return { cancelledJobs: 0, noticed: 0 };
  const start = new Date(source.starts_at as any);
  const told = withinNoticeWindow(start, now) ? await reminderHolders(source.source_id, ["sent", "acked"]) : [];
  const soon = withinNoticeWindow(start, now) ? await reminderHolders(source.source_id, ["pending"]) : [];

  await db.update(ReminderSource).set({ cancelled_at: now }).where(eq(ReminderSource.source_id, source.source_id));
  const [result] = (await db
    .update(ReminderJob)
    .set({ status: "cancelled" })
    .where(and(sql`${ReminderJob.dedupe_key} LIKE ${`src:${source.source_id}:%`}`, eq(ReminderJob.status, "pending")))) as any;

  const label = NOTICE_LABEL[source.source_type] ?? "Event";
  const noticed = await queueNotice(
    [...told, ...soon],
    {
      key: `chg:${source.source_id}:cancelled`,
      title: `${label} cancelled: ${source.title}`,
      body: `It was ${describeWhen(start, now)}.`,
      link: source.link,
      eventStart: start,
      critical: Number(source.critical),
    },
    now,
  );
  return { cancelledJobs: Number(result?.affectedRows ?? 0), noticed };
};

/** Save many items; each succeeds or fails on its own. */
export const saveSources = async (items: unknown[], now = new Date()) => {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError("items must be a non-empty array");
  if (items.length > MAX_BATCH) throw new ValidationError(`At most ${MAX_BATCH} items per batch`);
  const results: Array<{ external_id: string | null; ok: boolean; changed?: boolean; error?: string }> = [];
  for (const raw of items) {
    const externalId = typeof (raw as any)?.external_id === "string" ? (raw as any).external_id : null;
    try {
      const saved = await saveSource(parseSourceItem(raw), now);
      results.push({ external_id: externalId, ok: true, changed: saved.changed });
    } catch (error: any) {
      if (!(error instanceof ValidationError)) logger.error("[reminders] source save failed", { error, data: { externalId } });
      results.push({ external_id: externalId, ok: false, error: error instanceof ValidationError ? error.message : "Could not save this item" });
    }
  }
  return results;
};
