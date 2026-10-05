-- 104: Office hours -- weekly invitations.
--
-- Teachers invite students week by week: Ana and Ben this week, Chloe and
-- David next week. 102 could not express that: OfficeHourStudentLock's PK was
-- (term, student, weekday), so one invitation held the student on that
-- weekday for the whole term, and nobody (not even the same teacher) could
-- invite them for a different week.
--
--   OfficeHourStudentDateLock  the no-overlap guarantee per DATE:
--                              PK (student, lock_date). TERM mode locks every
--                              weekday inside the invitation window, WEEKDAY
--                              mode only the schedule's meeting days. A race
--                              between two teachers still ends one way.
--
-- Existing weekday locks are expanded into dates over each ACTIVE assignment's
-- window. OfficeHourStudentLock is left in place, unused, for rollback.
-- Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `OfficeHourStudentDateLock` (
  `student_id` BIGINT NOT NULL,
  `lock_date` DATE NOT NULL,
  `academic_term_id` BIGINT NOT NULL,
  `assignment_id` BIGINT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`student_id`, `lock_date`),
  KEY `idx_oh_date_lock_assignment` (`assignment_id`),
  KEY `idx_oh_date_lock_term` (`academic_term_id`, `student_id`),
  CONSTRAINT `fk_oh_date_lock_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `OfficeHourAssignment` (`assignment_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: every date in [effective_from, effective_to] whose weekday was
-- locked (WEEKDAY() is 0 = Monday, the lock table used 1 = Monday). A term is
-- far shorter than the 1000 days the digit cross-join generates.
INSERT IGNORE INTO `OfficeHourStudentDateLock` (`student_id`, `lock_date`, `academic_term_id`, `assignment_id`)
SELECT l.student_id, DATE_ADD(a.effective_from, INTERVAL n.n DAY), l.academic_term_id, l.assignment_id
FROM `OfficeHourStudentLock` l
JOIN `OfficeHourAssignment` a ON a.assignment_id = l.assignment_id AND a.status = 'ACTIVE'
JOIN (
  SELECT d1.d + d2.d * 10 + d3.d * 100 AS n
  FROM (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d1
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d2
  CROSS JOIN (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d3
) n ON DATE_ADD(a.effective_from, INTERVAL n.n DAY) <= a.effective_to
WHERE WEEKDAY(DATE_ADD(a.effective_from, INTERVAL n.n DAY)) + 1 = l.day_of_week;
