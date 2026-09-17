-- Migration 049: Admin approval workflow for Lesson Reports and Mentorship
-- Session logs, mirroring the validation_status/validation_comment convention
-- introduced for MenteeCheckIn in migration 048. Unlike MenteeCheckIn, neither
-- table has an existing free-text "response" column to double as the rejection
-- comment, so validation_comment is added new on both.

ALTER TABLE LessonReport
  ADD COLUMN validation_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' AFTER schedule_flag,
  ADD COLUMN validation_comment TEXT NULL AFTER validation_status,
  ADD COLUMN validated_by BIGINT NULL AFTER validation_comment,
  ADD COLUMN validated_at DATETIME NULL AFTER validated_by;

CREATE INDEX idx_lr_validation_status ON LessonReport(validation_status);

ALTER TABLE MentorshipSession
  ADD COLUMN validation_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' AFTER session_status,
  ADD COLUMN validation_comment TEXT NULL AFTER validation_status,
  ADD COLUMN validated_by BIGINT NULL AFTER validation_comment,
  ADD COLUMN validated_at DATETIME NULL AFTER validated_by;

CREATE INDEX idx_ms_validation_status ON MentorshipSession(validation_status);
