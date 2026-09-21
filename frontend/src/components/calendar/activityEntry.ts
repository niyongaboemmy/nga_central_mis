import type { CalendarSlot, CalendarActivity } from "../../api/calendar";

/**
 * A custom activity rendered on a weekly grid.
 *
 * Activities aren't tied to a subject or instructor, but they occupy a
 * day + time range exactly like a lesson does, so they're mapped onto the
 * same `CalendarSlot` shape the layout engine already understands (negative
 * `slot_id` keeps them from colliding with real slot ids) and tagged with
 * `__activity` so clicks route to the activity view instead of the lesson one.
 */
export type GridEntry = CalendarSlot & { __activity?: CalendarActivity };

export const activityToEntry = (
  a: CalendarActivity,
  calendarId?: number,
): GridEntry => ({
  slot_id: -Math.abs(a.activity_id),
  calendar_id: calendarId,
  academic_term_id: a.academic_term_id,
  class_group_id: a.class_group_id,
  subject_id: 0,
  user_id: 0,
  day_of_week: Number(a.day_of_week ?? 0),
  start_time: a.start_time,
  end_time: a.end_time,
  location: a.location,
  color: a.color || "#10B981",
  notes: a.description,
  subject_name: a.activity_name,
  class_group_name: a.activity_type,
  __activity: a,
});

/** Only weekly (recurring day-of-week) activities are drawn on a week grid;
 *  one-off dated ones have no day column to sit in. */
export const weeklyActivityEntries = (
  activities: CalendarActivity[] | undefined,
  calendarId?: number,
): GridEntry[] =>
  (activities ?? [])
    .filter(
      (a) =>
        a.start_time &&
        a.end_time &&
        a.day_of_week !== null &&
        a.day_of_week !== undefined,
    )
    .map((a) => activityToEntry(a, calendarId));

/** "Jane Doe, John Smith" for an activity's assignees, or "" when unassigned. */
export const assigneeNames = (a: CalendarActivity): string =>
  (a.assignees ?? [])
    .map((u) => `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim())
    .filter(Boolean)
    .join(", ");
