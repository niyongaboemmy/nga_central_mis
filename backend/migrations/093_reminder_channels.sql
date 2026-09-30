-- Migration 093: Reminder Hub channels (REMINDERS_SOLUTION_PROPOSAL.md §6.2, §6.4, §8).
--
-- Adds the Telegram bot and "Connect Google Calendar" channels, plus the
-- email escalation of critical reminders and change notices. Additive and
-- idempotent: CREATE TABLE IF NOT EXISTS, guarded ALTERs.

-- Telegram: one linked chat per user; short-lived link codes for /start.
CREATE TABLE IF NOT EXISTS `TelegramLink` (
  `user_id` BIGINT NOT NULL,
  `chat_id` BIGINT NOT NULL,
  `username` VARCHAR(64) NULL,
  `linked_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_telegram_chat` (`chat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `TelegramLinkCode` (
  `code` VARCHAR(64) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`code`),
  KEY `idx_telegram_code_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Google Calendar: the user's own Google account, an app-created calendar
-- ("NGA · My Timetable"); the refresh token is AES-256-GCM encrypted.
CREATE TABLE IF NOT EXISTS `GoogleCalendarLink` (
  `user_id` BIGINT NOT NULL,
  `google_email` VARCHAR(255) NULL,
  `refresh_token_enc` TEXT NOT NULL,
  `calendar_id` VARCHAR(255) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `last_sync_at` DATETIME NULL,
  `last_error` VARCHAR(500) NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GoogleCalendarEvent` (
  `user_id` BIGINT NOT NULL,
  `occurrence_key` VARCHAR(191) NOT NULL,
  `event_id` VARCHAR(255) NOT NULL,
  `content_hash` CHAR(40) NOT NULL,
  `starts_at` DATETIME NOT NULL,
  PRIMARY KEY (`user_id`, `occurrence_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Email escalation: when a critical reminder was escalated by email.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ReminderJob' AND COLUMN_NAME = 'escalated_at') > 0, 'SELECT 1',
  'ALTER TABLE `ReminderJob` ADD COLUMN `escalated_at` DATETIME NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Channel choices per user (JSON: {"telegram":true,"email":true,"googleCalendar":true}).
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ReminderPreference' AND COLUMN_NAME = 'channels') > 0, 'SELECT 1',
  'ALTER TABLE `ReminderPreference` ADD COLUMN `channels` JSON NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Source API: an item can target a subject's enrolled students (resolved by
-- MIS at planning time, so late enrolments are included) as well as explicit
-- users -- Task Mentor quizzes/assignments belong to an MIS subject.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ReminderSource' AND COLUMN_NAME = 'audience_subject_id') > 0, 'SELECT 1',
  'ALTER TABLE `ReminderSource` ADD COLUMN `audience_subject_id` BIGINT NULL, ADD KEY `idx_reminder_source_subject` (`audience_subject_id`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
