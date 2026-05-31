-- Migration 037: Mentorship Topic Field + Student FK Cascade
-- Adds a topic/subject-line to MentorshipSession and ensures student_id
-- deletes cascade so history is never orphaned on student removal.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add topic column (after student_name, before session_date)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE MentorshipSession
  ADD COLUMN topic VARCHAR(255) NULL
  AFTER student_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix student_id FK to CASCADE on delete
--    (drop the implicit/old FK, re-add with CASCADE)
-- ─────────────────────────────────────────────────────────────────────────────
SET @fk_ms_student = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'MentorshipSession'
    AND COLUMN_NAME  = 'student_id'
    AND REFERENCED_TABLE_NAME = 'User'
  LIMIT 1
);

SET @sql_drop_student_fk = IF(
  @fk_ms_student IS NOT NULL,
  CONCAT('ALTER TABLE MentorshipSession DROP FOREIGN KEY ', @fk_ms_student),
  'SELECT 1'
);
PREPARE stmt FROM @sql_drop_student_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE MentorshipSession
  ADD CONSTRAINT fk_ms_student_id
    FOREIGN KEY (student_id) REFERENCES User(user_id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Index to support admin student-timeline queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_ms_student_date
  ON MentorshipSession(student_id, session_date);
