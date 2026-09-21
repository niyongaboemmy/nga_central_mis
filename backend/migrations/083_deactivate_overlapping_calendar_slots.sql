-- Soft-deletes every live calendar slot that starts inside another live slot
-- of the same class group, term and day.
--
-- WHY THIS IS NEEDED
--
-- unique_slot keys on start_time only, and until the overlap guard in
-- createCalendarSlot / updateCalendarSlot (assertNoOverlappingLesson) a
-- lesson could be added or stretched over one that was already there. The
-- class-group grid never drew the later-starting row -- its start row sat
-- under the earlier lesson's rowSpan -- so admins kept curating the timetable
-- they could see, while the covered rows lived on: they blocked their
-- timeslot, and every teacher-scoped read (my-calendar, the dashboard, the
-- attendance sync) showed them as lessons the calendar "didn't have".
--
-- The grid now surfaces such rows instead of hiding them, which is what made
-- the scale of the leftovers visible. This repair applies the rule the old
-- grid used implicitly: walking a day from the earliest start, a live lesson
-- that starts inside an already-visible lesson is stale. Lessons that merely
-- share a boundary (08:00-08:50 then 08:50-09:40) are untouched, as is
-- anything already soft-deleted or on a DISABLED subject.
--
-- Rows are deactivated, not deleted, and their ids are kept in
-- CalendarSlotOverlapRepair (with the slot that covered them) so any wrong
-- call can be undone by hand:
--   UPDATE CalendarSlot SET is_active = 1 WHERE slot_id IN (...);

CREATE TABLE IF NOT EXISTS CalendarSlotOverlapRepair (
  slot_id BIGINT NOT NULL,
  covered_by_slot_id BIGINT NOT NULL,
  repaired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (slot_id)
);

DROP PROCEDURE IF EXISTS deactivate_overlapping_calendar_slots;

DELIMITER $$
CREATE PROCEDURE deactivate_overlapping_calendar_slots()
BEGIN
  DECLARE affected INT DEFAULT 1;

  -- One pass deactivates the rows covered by a lesson that is itself not
  -- covered. A row covered only by a stale row is left for a later pass, by
  -- which time its coverer is inactive and no longer counts -- so the pass is
  -- repeated until nothing changes.
  WHILE affected > 0 DO
    INSERT IGNORE INTO CalendarSlotOverlapRepair (slot_id, covered_by_slot_id)
    SELECT s.slot_id, MIN(k.slot_id)
    FROM CalendarSlot s
    JOIN CalendarSlot k
      ON k.slot_id <> s.slot_id
     AND k.academic_term_id <=> s.academic_term_id
     AND k.class_group_id <=> s.class_group_id
     AND k.day_of_week = s.day_of_week
     AND k.is_active = 1
     AND TIME(k.start_time) < TIME(s.start_time)
     AND TIME(s.start_time) < TIME(k.end_time)
    LEFT JOIN Subject ks ON ks.subject_id = k.subject_id
    LEFT JOIN (
      -- lessons that are themselves covered by an earlier live lesson
      SELECT x.slot_id
      FROM CalendarSlot x
      JOIN CalendarSlot y
        ON y.slot_id <> x.slot_id
       AND y.academic_term_id <=> x.academic_term_id
       AND y.class_group_id <=> x.class_group_id
       AND y.day_of_week = x.day_of_week
       AND y.is_active = 1
       AND TIME(y.start_time) < TIME(x.start_time)
       AND TIME(x.start_time) < TIME(y.end_time)
      LEFT JOIN Subject ys ON ys.subject_id = y.subject_id
      WHERE x.is_active = 1
        AND (ys.status IS NULL OR ys.status <> 'DISABLED')
    ) covered ON covered.slot_id = k.slot_id
    WHERE s.is_active = 1
      AND (ks.status IS NULL OR ks.status <> 'DISABLED')
      AND covered.slot_id IS NULL
    GROUP BY s.slot_id;

    UPDATE CalendarSlot s
    JOIN CalendarSlotOverlapRepair r ON r.slot_id = s.slot_id
    SET s.is_active = 0
    WHERE s.is_active = 1;

    SET affected = ROW_COUNT();
  END WHILE;
END$$
DELIMITER ;

CALL deactivate_overlapping_calendar_slots();
DROP PROCEDURE IF EXISTS deactivate_overlapping_calendar_slots;
