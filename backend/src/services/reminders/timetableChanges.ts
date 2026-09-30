import { and, eq, gt, inArray, like, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  CalendarActivity,
  CalendarActivityAssignee,
  CalendarSlot,
  StudentClassGroup,
  StudentSubjectEnrollment,
  Subject,
} from "../../db/schema";
import { ReminderJob } from "../../db/reminderSchema";
import logger from "../../utils/logger";
import { loadCurrentTerm } from "./occurrences";
import { expandUsersSoon } from "./expander";
import { describeWhen } from "./sources";

/**
 * Timetable edits in MIS -> reminders and Google Calendar within a minute,
 * instead of waiting for the 30-min re-plan / 2-h Google pass.
 *
 * When an admin moves, removes or re-rooms a lesson (or an activity):
 * 1. reminders already *delivered* for the old time are set aside, so the
 *    new time gets its own reminder (same dedupe key otherwise = never sent);
 * 2. people who were told, or were about to be, get one change notice when
 *    the old time is within 48 h;
 * 3. everyone affected is re-planned and their Google calendar re-synced.
 * All of it runs after the HTTP response; a failure here only logs.
 */

const NOTICE_WINDOW_MS = 48 * 3_600_000;
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

type SlotRow = typeof CalendarSlot.$inferSelect;
type ActivityRow = typeof CalendarActivity.$inferSelect;

const hhmm = (t: string | null | undefined) => String(t ?? "").slice(0, 5);

/**
 * Delivered reminders (sent/acked) for future occurrences under `keyPrefix`
 * get a retired key, freeing the original for the re-plan. History is kept.
 */
export const releaseDeliveredJobs = async (keyPrefix: string, now = new Date()) => {
  const [result] = (await db
    .update(ReminderJob)
    .set({ dedupe_key: sql`CONCAT(LEFT(${ReminderJob.dedupe_key}, 160), ':was', ${String(now.getTime())})` })
    .where(
      and(
        like(ReminderJob.dedupe_key, `${keyPrefix}%`),
        sql`${ReminderJob.dedupe_key} NOT LIKE '%:was%'`,
        inArray(ReminderJob.status, ["sent", "acked"]),
        gt(ReminderJob.event_start, now),
      ),
    )) as any;
  return Number(result?.affectedRows ?? 0);
};

/** People holding a reminder under `keyPrefix` for an occurrence in the next 48 h, with its time. */
const upcomingHolders = async (keyPrefix: string, now: Date) => {
  const rows = await db
    .select({ user_id: ReminderJob.user_id, event_start: ReminderJob.event_start })
    .from(ReminderJob)
    .where(
      and(
        like(ReminderJob.dedupe_key, `${keyPrefix}%`),
        inArray(ReminderJob.status, ["pending", "sending", "sent", "acked"]),
        gt(ReminderJob.event_start, now),
        lte(ReminderJob.event_start, new Date(now.getTime() + NOTICE_WINDOW_MS)),
      ),
    );
  const earliest = new Map<number, Date>();
  for (const r of rows) {
    const at = new Date(r.event_start as any);
    const prev = earliest.get(Number(r.user_id));
    if (!prev || at < prev) earliest.set(Number(r.user_id), at);
  }
  return earliest;
};

/** One immediate notice per person (dedupe key per change, so re-saves don't repeat it). */
const queueNotices = async (
  holders: Map<number, Date>,
  notice: { key: string; title: string; body: (oldStart: Date) => string; link: string },
  now: Date,
) => {
  for (const [user_id, oldStart] of holders) {
    await db
      .insert(ReminderJob)
      .values({
        user_id,
        dedupe_key: notice.key.slice(0, 191),
        source_type: "change",
        title: notice.title.slice(0, 255),
        body: notice.body(oldStart).slice(0, 500),
        link: notice.link,
        event_start: oldStart,
        offset_min: 0,
        fire_at: now,
        status: "pending",
      })
      .onDuplicateKeyUpdate({ set: { dedupe_key: sql`${ReminderJob.dedupe_key}` } });
  }
  return holders.size;
};

/** Students in a class group this academic year (optionally only those taking `subjectId`). */
const classStudents = async (classGroupId: number | null | undefined, subjectId?: number | null) => {
  if (!classGroupId) return [];
  const term = await loadCurrentTerm();
  if (!term) return [];
  const members = await db
    .select({ user_id: StudentClassGroup.user_id })
    .from(StudentClassGroup)
    .where(and(eq(StudentClassGroup.class_group_id, classGroupId), eq(StudentClassGroup.academic_year_id, term.yearId)));
  const ids = members.map((m: any) => Number(m.user_id));
  if (!subjectId || ids.length === 0) return ids;
  const enrolled = await db
    .select({ user_id: StudentSubjectEnrollment.user_id })
    .from(StudentSubjectEnrollment)
    .where(
      and(
        eq(StudentSubjectEnrollment.subject_id, subjectId),
        eq(StudentSubjectEnrollment.academic_year_id, term.yearId),
        eq(StudentSubjectEnrollment.status, "ACTIVE"),
        inArray(StudentSubjectEnrollment.user_id, ids),
      ),
    );
  return enrolled.map((e: any) => Number(e.user_id));
};

const subjectName = async (subjectId: number | null | undefined) => {
  if (!subjectId) return "Lesson";
  const [row] = await db.select({ name: Subject.name }).from(Subject).where(eq(Subject.subject_id, subjectId)).limit(1);
  return row?.name || "Lesson";
};

const live = (s: { is_active?: number | null } | null | undefined) => Boolean(s) && Number(s!.is_active ?? 1) === 1;

export interface ChangeResult {
  audience: number;
  released: number;
  noticed: number;
}

/**
 * A timetable slot was created, edited or removed. `before` is the row as it
 * was (null for a new slot); the current row is read here.
 */
export const onSlotChanged = async (slotId: number, before: SlotRow | null, now = new Date()): Promise<ChangeResult> => {
  const [after] = await db.select().from(CalendarSlot).where(eq(CalendarSlot.slot_id, slotId)).limit(1);
  const prefix = `lesson:${slotId}:`;
  const wasLive = live(before);
  const isLive = live(after);

  const whenChanged =
    wasLive &&
    isLive &&
    (before!.day_of_week !== after!.day_of_week || hhmm(before!.start_time) !== hhmm(after!.start_time) || hhmm(before!.end_time) !== hhmm(after!.end_time));
  const removed = wasLive && !isLive;
  const roomChanged = wasLive && isLive && !whenChanged && (before!.location ?? "") !== (after!.location ?? "") && Boolean(after!.location);
  const teacherChanged = wasLive && isLive && Number(before!.user_id) !== Number(after!.user_id);
  const subjectChanged = wasLive && isLive && Number(before!.subject_id) !== Number(after!.subject_id);

  let noticed = 0;
  let released = 0;
  if (whenChanged || removed || roomChanged || subjectChanged) {
    const holders = await upcomingHolders(prefix, now);
    const name = await subjectName(before?.subject_id);
    const stamp = `${hhmm(after?.start_time)}-${after?.day_of_week ?? "x"}-${after?.location ?? ""}-${after?.subject_id ?? ""}`;
    if (holders.size) {
      if (removed || subjectChanged) {
        noticed = await queueNotices(
          holders,
          {
            key: `chg:lesson:${slotId}:off:${stamp}`,
            title: `Lesson cancelled: ${name}`,
            body: (old) => `It's no longer on the timetable (was ${describeWhen(old, now)}).`,
            link: "/reminders",
          },
          now,
        );
      } else if (whenChanged) {
        const day = DAYS[Number(after!.day_of_week)] ?? "";
        noticed = await queueNotices(
          holders,
          {
            key: `chg:lesson:${slotId}:${stamp}`,
            title: `Lesson moved: ${name}`,
            body: (old) => `Now ${day} ${hhmm(after!.start_time)}–${hhmm(after!.end_time)} (was ${describeWhen(old, now)}).`,
            link: "/reminders",
          },
          now,
        );
      } else if (roomChanged) {
        noticed = await queueNotices(
          holders,
          {
            key: `chg:lesson:${slotId}:room:${stamp}`,
            title: `Room changed: ${name}`,
            body: (old) => `Now in ${after!.location} (${describeWhen(old, now)}).`,
            link: "/reminders",
          },
          now,
        );
      }
    }
    // Only a new time needs the old delivered reminders out of the way.
    if (whenChanged) released = await releaseDeliveredJobs(prefix, now);
  }

  const people = new Set<number>();
  for (const row of [before, after]) {
    if (!row) continue;
    if (row.user_id) people.add(Number(row.user_id));
    for (const id of await classStudents(row.class_group_id, row.subject_id)) people.add(id);
  }
  if (teacherChanged && before?.user_id) people.add(Number(before.user_id));
  expandUsersSoon(Array.from(people));
  return { audience: people.size, released, noticed };
};

/** Everyone an activity concerns: its assignees, else its class group's students. */
export const activityPeople = async (row: ActivityRow | null | undefined) => {
  if (!row) return [];
  const assignees = await db
    .select({ user_id: CalendarActivityAssignee.user_id })
    .from(CalendarActivityAssignee)
    .where(eq(CalendarActivityAssignee.activity_id, row.activity_id));
  const ids = assignees.map((a: any) => Number(a.user_id));
  return [...ids, ...(await classStudents(row.class_group_id))];
};

/** A calendar activity was created, edited or removed. */
export const onActivityChanged = async (
  activityId: number,
  before: ActivityRow | null,
  beforePeople: number[] = [],
  now = new Date(),
): Promise<ChangeResult> => {
  const [after] = await db.select().from(CalendarActivity).where(eq(CalendarActivity.activity_id, activityId)).limit(1);
  const prefix = `activity:${activityId}:`;
  const wasLive = live(before);
  const isLive = live(after);
  const whenChanged =
    wasLive &&
    isLive &&
    (before!.day_of_week !== after!.day_of_week ||
      String(before!.start_date ?? "") !== String(after!.start_date ?? "") ||
      hhmm(before!.start_time) !== hhmm(after!.start_time) ||
      hhmm(before!.end_time) !== hhmm(after!.end_time));
  const removed = wasLive && !isLive;

  let noticed = 0;
  let released = 0;
  if (whenChanged || removed) {
    const holders = await upcomingHolders(prefix, now);
    const title = before?.activity_name || "Activity";
    const stamp = `${after?.day_of_week ?? "x"}-${after?.start_date ?? ""}-${hhmm(after?.start_time)}`;
    if (holders.size) {
      noticed = await queueNotices(
        holders,
        removed
          ? {
              key: `chg:activity:${activityId}:off`,
              title: `Cancelled: ${title}`,
              body: (old) => `It was ${describeWhen(old, now)}.`,
              link: "/reminders",
            }
          : {
              key: `chg:activity:${activityId}:${stamp}`,
              title: `Moved: ${title}`,
              body: (old) => `Now ${hhmm(after!.start_time)}–${hhmm(after!.end_time)} (was ${describeWhen(old, now)}).`,
              link: "/reminders",
            },
        now,
      );
    }
    if (whenChanged) released = await releaseDeliveredJobs(prefix, now);
  }

  const people = new Set<number>([...beforePeople, ...(await activityPeople(after ?? before))]);
  expandUsersSoon(Array.from(people));
  return { audience: people.size, released, noticed };
};

/** A subject was disabled or re-enabled: its teachers and students re-plan. */
export const onSubjectStatusChanged = async (subjectId: number) => {
  const term = await loadCurrentTerm();
  const teachers = await db
    .select({ user_id: CalendarSlot.user_id })
    .from(CalendarSlot)
    .where(and(eq(CalendarSlot.subject_id, subjectId), eq(CalendarSlot.is_active, 1)));
  const students = term
    ? await db
        .select({ user_id: StudentSubjectEnrollment.user_id })
        .from(StudentSubjectEnrollment)
        .where(and(eq(StudentSubjectEnrollment.subject_id, subjectId), eq(StudentSubjectEnrollment.academic_year_id, term.yearId)))
    : [];
  const people = Array.from(new Set([...teachers, ...students].map((r: any) => Number(r.user_id))));
  expandUsersSoon(people);
  return { audience: people.length };
};

// Under test, the timetable suites edit slots constantly; background
// re-plans outliving a test would race the next one on the shared test DB.
// Suites about this feature switch it on explicitly.
let enabledInTests = false;
/** Test hook. */
export const setTimetableSyncInTests = (on: boolean) => {
  enabledInTests = on;
};

/** Fire-and-forget wrapper for controllers: never delays or fails the request. */
export const afterResponse = (label: string, task: () => Promise<unknown>) => {
  if (process.env.NODE_ENV === "test" && !enabledInTests) return;
  setImmediate(() => {
    task().catch((error) => logger.error(`[reminders] ${label} failed`, { error }));
  });
};
