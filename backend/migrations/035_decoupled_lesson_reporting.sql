-- Migration 035: Decoupled Lesson Reporting
-- Creates LessonReport table and decouples ReportProjectUpdate + MentorshipSession
-- from the monolithic InstructorReport weekly batch form.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New LessonReport table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE LessonReport (
  lesson_report_id  BIGINT        NOT NULL AUTO_INCREMENT,
  lesson_id         INT           NULL,
  entry_id          BIGINT        NULL,
  reported_by       BIGINT        NOT NULL,
  delivery_date     DATE          NOT NULL,
  status            ENUM('DELIVERED','PARTIAL','MISSED') NOT NULL DEFAULT 'DELIVERED',
  attendance_count  INT           NULL,
  completion_rate   INT           NULL COMMENT '0-100',
  reflection_notes  TEXT          NULL,
  evidence_url      VARCHAR(500)  NULL,
  schedule_flag     ENUM('ON_TIME','AHEAD','BEHIND') NOT NULL DEFAULT 'ON_TIME',
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (lesson_report_id),
  INDEX idx_lr_reported_by   (reported_by),
  INDEX idx_lr_lesson_id     (lesson_id),
  INDEX idx_lr_delivery_date (delivery_date),

  CONSTRAINT fk_lr_lesson
    FOREIGN KEY (lesson_id) REFERENCES LO_Lesson(id) ON DELETE SET NULL,
  CONSTRAINT fk_lr_entry
    FOREIGN KEY (entry_id) REFERENCES SchemeOfWorkEntry(entry_id) ON DELETE SET NULL,
  CONSTRAINT fk_lr_reported_by
    FOREIGN KEY (reported_by) REFERENCES User(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Decouple ReportProjectUpdate — make report_id nullable, add user_id
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the existing FK constraint (name is auto-generated; discovered via information_schema)
SET @fk_rpu = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'ReportProjectUpdate'
    AND COLUMN_NAME  = 'report_id'
    AND REFERENCED_TABLE_NAME = 'InstructorReport'
  LIMIT 1
);

SET @sql_rpu = CONCAT('ALTER TABLE ReportProjectUpdate DROP FOREIGN KEY ', @fk_rpu);
PREPARE stmt FROM @sql_rpu;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Make report_id nullable and add standalone user_id
ALTER TABLE ReportProjectUpdate
  MODIFY COLUMN report_id BIGINT NULL,
  ADD COLUMN user_id BIGINT NULL AFTER report_id,
  ADD CONSTRAINT fk_rpu_user
    FOREIGN KEY (user_id) REFERENCES User(user_id) ON DELETE CASCADE;

-- Back-fill user_id from the parent InstructorReport for existing rows
UPDATE ReportProjectUpdate rpu
  JOIN InstructorReport ir ON rpu.report_id = ir.report_id
  SET rpu.user_id = ir.user_id
  WHERE rpu.report_id IS NOT NULL;

CREATE INDEX idx_rpu_user_id ON ReportProjectUpdate(user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Confirm MentorshipSession report_id is nullable
--    (schema already defines it nullable; this drops any NOT NULL enforcement
--     that may exist at the DB level from a prior migration)
-- ─────────────────────────────────────────────────────────────────────────────
SET @fk_ms = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'MentorshipSession'
    AND COLUMN_NAME  = 'report_id'
    AND REFERENCED_TABLE_NAME = 'InstructorReport'
  LIMIT 1
);

-- Only execute the DROP + MODIFY if a FK was found
SET @sql_ms_drop = IF(
  @fk_ms IS NOT NULL,
  CONCAT('ALTER TABLE MentorshipSession DROP FOREIGN KEY ', @fk_ms),
  'SELECT 1'
);
PREPARE stmt FROM @sql_ms_drop;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE MentorshipSession
  MODIFY COLUMN report_id BIGINT NULL;
