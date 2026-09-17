-- Re-points every calendar slot's denormalised academic_year_id /
-- academic_term_id / class_group_id at the calendar it belongs to.
--
-- WHY THIS IS NEEDED
--
-- A slot belongs to exactly one AcademicCalendar, and that calendar carries the
-- authoritative year + term + class group. The three columns on CalendarSlot are
-- copies of the calendar's, kept for the reads that filter by term or class
-- group (getMyCalendar, getStudentCalendar).
--
-- The two sides of the feature disagreed on which key identifies "the slots on
-- this calendar":
--
--   * createCalendarSlot's duplicate check keys on calendar_id + day_of_week +
--     start_time, and is term-agnostic;
--   * every read keyed on academic_term_id / class_group_id.
--
-- Earlier builds populated those copies from the request body, and the web
-- client computes that body value with a `|| 1` fallback whenever its calendar
-- list has not loaded yet. Any slot written on that path stored a term it does
-- not belong to (typically 1). The result: the slot is invisible in every grid,
-- yet still occupies its timeslot, so re-adding it returns "A slot already
-- exists at this time for this calendar" against a cell that renders empty.
--
-- createCalendarSlot now derives all three columns from the calendar and
-- updateCalendarSlot never touches them, and a calendar's own year/term/class
-- group are immutable after creation (updateAcademicCalendar only edits name,
-- description and is_active) -- so this repair is one-directional and cannot be
-- re-dirtied afterwards.
--
-- Only rows that actually disagree with their parent are touched; slots with no
-- calendar_id (pre-dating the column) are left alone, as there is nothing to
-- derive their values from.

UPDATE CalendarSlot s
JOIN AcademicCalendar c ON c.calendar_id = s.calendar_id
SET s.academic_year_id = c.academic_year_id,
    s.academic_term_id = c.academic_term_id,
    s.class_group_id = c.class_group_id
WHERE NOT (s.academic_year_id <=> c.academic_year_id)
   OR NOT (s.academic_term_id <=> c.academic_term_id)
   OR NOT (s.class_group_id <=> c.class_group_id);
