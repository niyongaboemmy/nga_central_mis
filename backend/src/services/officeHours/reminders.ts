import { and, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { OfficeHourAssignment, OfficeHourSchedule, OfficeHourSession } from "../../db/officeHoursSchema";
import { Subject } from "../../db/schema";
import { kigaliInstant, kigaliParts, parseClock } from "../reminders/time";
import { officeHoursReady } from "./common";

/**
 * Office hours in the Reminder Hub (plan §13.3). Sessions the user hosts or is
 * expected at become occurrences (key office_hours:<session_id>), so the
 * Hub's push, Telegram, Google Calendar mirror and webcal feed carry them for
 * everyone who switched reminders on. Mandatory notices (assigned, cancelled)
 * do not rely on this -- notify.ts sends those to everyone.
 */
export interface OfficeHourOccurrence {
  key: string;
  kind: "office_hours";
  sourceRef: string;
  title: string;
  detail: string | null;
  link: string;
  location: string | null;
  start: Date;
  end: Date | null;
  critical: boolean;
  color: string | null;
  role: "teaching" | "attending";
}

export const loadOfficeHourOccurrences = async (userId: number, from: Date, to: Date): Promise<OfficeHourOccurrence[]> => {
  if (!(await officeHoursReady())) return [];
  const fromYmd = kigaliParts(from).ymd;
  const toYmd = kigaliParts(to).ymd;
  const rows = await db
    .select({
      s: OfficeHourSession,
      title: OfficeHourSchedule.title,
      color: Subject.color,
      // Expected = an assignment of this user covering the date.
      attending: sql<number>`EXISTS (
        SELECT 1 FROM OfficeHourAssignment a
        WHERE a.schedule_id = ${OfficeHourSession.schedule_id} AND a.student_id = ${userId}
          AND a.effective_from <= ${OfficeHourSession.session_date} AND a.effective_to >= ${OfficeHourSession.session_date}
      )`,
    })
    .from(OfficeHourSession)
    .innerJoin(OfficeHourSchedule, eq(OfficeHourSchedule.schedule_id, OfficeHourSession.schedule_id))
    .leftJoin(Subject, eq(Subject.subject_id, OfficeHourSchedule.subject_id))
    .where(
      and(
        gte(OfficeHourSession.session_date, fromYmd),
        lte(OfficeHourSession.session_date, toYmd),
        ne(OfficeHourSession.status, "CANCELLED"),
        eq(OfficeHourSchedule.status, "ACTIVE"),
        or(
          eq(OfficeHourSession.host_teacher_id, userId),
          sql`EXISTS (SELECT 1 FROM OfficeHourAssignment a2 WHERE a2.schedule_id = ${OfficeHourSession.schedule_id} AND a2.student_id = ${userId})`,
        ),
      ),
    );
  const out: OfficeHourOccurrence[] = [];
  for (const r of rows) {
    const hosting = r.s.host_teacher_id === userId;
    if (!hosting && Number(r.attending) !== 1) continue;
    const startMin = parseClock(r.s.start_time);
    if (startMin === null) continue;
    const endMin = parseClock(r.s.end_time);
    out.push({
      key: `office_hours:${r.s.session_id}`,
      kind: "office_hours",
      sourceRef: `office_hours:${r.s.schedule_id}`,
      title: r.title,
      detail: r.s.location ?? null,
      link: hosting ? `/office-hours/schedules/${r.s.schedule_id}` : "/my-office-hours",
      location: r.s.location ?? null,
      start: kigaliInstant(r.s.session_date, startMin),
      end: endMin === null ? null : kigaliInstant(r.s.session_date, endMin),
      critical: false,
      color: r.color ?? null,
      role: hosting ? "teaching" : "attending",
    });
  }
  return out;
};

/** Everyone a set of sessions concerns: hosts and expected students. */
export const peopleOfSessions = async (sessionIds: number[]): Promise<number[]> => {
  if (!sessionIds.length) return [];
  const sessions = await db.select().from(OfficeHourSession).where(inArray(OfficeHourSession.session_id, sessionIds));
  const people = new Set<number>(sessions.map((s) => s.host_teacher_id));
  for (const s of sessions) {
    const rows = await db
      .select({ id: OfficeHourAssignment.student_id })
      .from(OfficeHourAssignment)
      .where(and(eq(OfficeHourAssignment.schedule_id, s.schedule_id), lte(OfficeHourAssignment.effective_from, s.session_date), gte(OfficeHourAssignment.effective_to, s.session_date)));
    for (const r of rows) people.add(r.id);
  }
  return [...people];
};

/**
 * After a change, re-plan the people concerned so their Hub reminders,
 * Google Calendar and feed follow within a minute. When times moved,
 * reminders already delivered for the old time are set aside first so the new
 * time gets its own reminder.
 */
let hubSyncInTests = false;
/** Test hook (like setTimetableSyncInTests): background re-plans outliving a test race the next file. */
export const setOfficeHoursHubSyncInTests = (on: boolean) => {
  hubSyncInTests = on;
};

export const refreshReminderHub = async (userIds: number[], movedSessionIds: number[] = []) => {
  if (process.env.NODE_ENV === "test" && !hubSyncInTests) return;
  const { releaseDeliveredJobs } = await import("../reminders/timetableChanges");
  for (const id of movedSessionIds) await releaseDeliveredJobs(`office_hours:${id}:`);
  if (!userIds.length) return;
  const { expandUsersSoon } = await import("../reminders/expander");
  expandUsersSoon([...new Set(userIds)]);
};
