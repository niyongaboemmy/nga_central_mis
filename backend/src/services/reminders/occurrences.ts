import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { AcademicTerm, StudentSubjectEnrollment } from "../../db/schema";
import { ReminderSource } from "../../db/reminderSchema";
import {
  loadAssignedActivities,
  loadStudentLessons,
  loadTeacherLessons,
} from "../../controllers/calendarController";
import type { ReminderKind } from "./preferences";
import { loadOfficeHourOccurrences } from "../officeHours/reminders";
import {
  dbDateToYmd,
  dowOfYmd,
  kigaliDatesBetween,
  kigaliInstant,
  parseClock,
} from "./time";

/**
 * One dated thing a user may be reminded about.
 *
 * Lessons and activities are expanded from the weekly timetable through the
 * SAME loaders the timetable pages use (loadTeacherLessons /
 * loadStudentLessons, i.e. liveLessonFilters): a disabled subject, a
 * tombstoned slot or a reassigned teacher can never produce a reminder the
 * timetable doesn't show.
 */
export interface Occurrence {
  /** Stable per occurrence, e.g. lesson:412:2026-09-30. */
  key: string;
  kind: ReminderKind;
  sourceRef: string;
  title: string;
  /** Short context line, e.g. "S4 MPC · Room B2". */
  detail: string | null;
  link: string | null;
  location: string | null;
  start: Date;
  end: Date | null;
  critical: boolean;
  /** Timetable colour, for the agenda UI. */
  color: string | null;
  role: "teaching" | "attending" | "other";
}

interface CurrentTerm {
  termId: number;
  yearId: number;
  startYmd: string | null;
  endYmd: string | null;
}

export const loadCurrentTerm = async (): Promise<CurrentTerm | null> => {
  const [term] = await db
    .select({
      academic_term_id: AcademicTerm.academic_term_id,
      academic_year_id: AcademicTerm.academic_year_id,
      start_date: AcademicTerm.start_date,
      end_date: AcademicTerm.end_date,
    })
    .from(AcademicTerm)
    .where(eq(AcademicTerm.is_current, 1))
    .limit(1);
  if (!term) return null;
  return {
    termId: term.academic_term_id,
    yearId: term.academic_year_id,
    startYmd: dbDateToYmd(term.start_date),
    endYmd: dbDateToYmd(term.end_date),
  };
};

/** Term dates bound the timetable: no lesson reminders in the holidays. */
const inTerm = (ymd: string, term: CurrentTerm) =>
  (!term.startYmd || ymd >= term.startYmd) && (!term.endYmd || ymd <= term.endYmd);

const joinDetail = (...parts: Array<string | null | undefined>) => {
  const text = parts.filter((p) => p && String(p).trim()).join(" · ");
  return text || null;
};

const activityOccursOn = (activity: any, ymd: string, dow: number): boolean => {
  const startYmd = dbDateToYmd(activity.start_date);
  const endYmd = dbDateToYmd(activity.end_date);
  if (activity.day_of_week !== null && activity.day_of_week !== undefined) {
    if (Number(activity.day_of_week) !== dow) return false;
    if (startYmd && ymd < startYmd) return false;
    if (endYmd && ymd > endYmd) return false;
    return true;
  }
  // A dated activity with no weekday: a one-off on its start date.
  return Boolean(startYmd) && startYmd === ymd;
};

/**
 * Everything `userId` has between `from` and `to` (by start time), from the
 * timetable and from items other apps registered for them.
 */
export const collectOccurrences = async (
  userId: number,
  from: Date,
  to: Date,
): Promise<Occurrence[]> => {
  const out: Occurrence[] = [];
  const term = await loadCurrentTerm();

  if (term) {
    const [teaching, student, assignedActivities] = await Promise.all([
      loadTeacherLessons({ userId, termId: term.termId, yearId: term.yearId }),
      loadStudentLessons({ userId, termId: term.termId, yearId: term.yearId }),
      loadAssignedActivities({ userId, termId: term.termId, classGroupId: null }),
    ]);

    const lessons: Array<{ slot: any; role: "teaching" | "attending" }> = [
      ...teaching.map((slot: any) => ({ slot, role: "teaching" as const })),
      ...student.slots.map((slot: any) => ({ slot, role: "attending" as const })),
    ];

    const activities = new Map<number, any>();
    for (const a of [...assignedActivities, ...student.activities]) {
      activities.set(Number(a.activity_id), a);
    }

    for (const ymd of kigaliDatesBetween(from, to)) {
      if (!inTerm(ymd, term)) continue;
      const dow = dowOfYmd(ymd);

      for (const { slot, role } of lessons) {
        if (Number(slot.day_of_week) !== dow) continue;
        const startMin = parseClock(slot.start_time);
        if (startMin === null) continue;
        const endMin = parseClock(slot.end_time);
        const teacherName = [slot.instructor_name, slot.instructor_lastname].filter(Boolean).join(" ");
        out.push({
          key: `lesson:${slot.slot_id}:${ymd}`,
          kind: "lesson",
          sourceRef: `slot:${slot.slot_id}`,
          title: slot.subject_name || "Lesson",
          detail:
            role === "teaching"
              ? joinDetail(slot.class_group_name, slot.location)
              : joinDetail(teacherName || null, slot.location),
          link: "/dashboard",
          location: slot.location ?? null,
          start: kigaliInstant(ymd, startMin),
          end: endMin === null ? null : kigaliInstant(ymd, endMin),
          critical: false,
          color: slot.color ?? null,
          role,
        });
      }

      for (const activity of activities.values()) {
        if (!activityOccursOn(activity, ymd, dow)) continue;
        const startMin = parseClock(activity.start_time);
        if (startMin === null) continue;
        const endMin = parseClock(activity.end_time);
        out.push({
          key: `activity:${activity.activity_id}:${ymd}`,
          kind: "activity",
          sourceRef: `activity:${activity.activity_id}`,
          title: activity.activity_name || "Activity",
          detail: joinDetail(activity.activity_type, activity.class_group_name, activity.location),
          link: "/dashboard",
          location: activity.location ?? null,
          start: kigaliInstant(ymd, startMin),
          end: endMin === null ? null : kigaliInstant(ymd, endMin),
          critical: false,
          color: activity.color ?? null,
          role: "other",
        });
      }
    }
  }

  // Office hours the user hosts or must attend (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §13.3).
  out.push(...(await loadOfficeHourOccurrences(userId, from, to)));

  // Items the other apps registered through the Source API: addressed to
  // this user directly, or to a subject they're actively enrolled in.
  const enrolledSubjectIds = term
    ? (
        await db
          .select({ subject_id: StudentSubjectEnrollment.subject_id })
          .from(StudentSubjectEnrollment)
          .where(
            and(
              eq(StudentSubjectEnrollment.user_id, userId),
              eq(StudentSubjectEnrollment.academic_year_id, term.yearId),
              eq(StudentSubjectEnrollment.status, "ACTIVE"),
            ),
          )
      ).map((r: any) => Number(r.subject_id))
    : [];
  const addressedToMe = sql`JSON_CONTAINS(${ReminderSource.audience_user_ids}, CAST(${String(userId)} AS JSON))`;
  const external = await db
    .select()
    .from(ReminderSource)
    .where(
      and(
        isNull(ReminderSource.cancelled_at),
        gte(ReminderSource.starts_at, from),
        lte(ReminderSource.starts_at, to),
        enrolledSubjectIds.length
          ? or(addressedToMe, inArray(ReminderSource.audience_subject_id, enrolledSubjectIds))!
          : addressedToMe,
      ),
    );
  for (const source of external) {
    out.push({
      key: `src:${source.source_id}`,
      kind: source.source_type as ReminderKind,
      sourceRef: `${source.source_app}:${source.source_type}:${source.external_id}`,
      title: source.title,
      detail: source.body ?? null,
      link: source.link ?? null,
      location: source.location ?? null,
      start: new Date(source.starts_at as any),
      end: source.ends_at ? new Date(source.ends_at as any) : null,
      critical: Number(source.critical) === 1,
      color: null,
      role: "other",
    });
  }

  return out
    .filter((o) => o.start.getTime() >= from.getTime() && o.start.getTime() <= to.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
};
