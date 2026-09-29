-- Migration 092: Reminder Hub (REMINDERS_SOLUTION_PROPOSAL.md §4-§7).
--
-- One server-side engine turns lessons, custom activities and items pushed by
-- the other NGA apps (quizzes, assignments, meetings) into dated reminders and
-- delivers them in-app and by Web Push to the installable NGA app.
--
-- Additive and idempotent: CREATE TABLE IF NOT EXISTS only; nothing existing
-- is altered. The legacy CalendarNotification table is left untouched -- the
-- per-user settings now live in ReminderPreference.
--
-- Scheduling DATETIMEs (fire_at, event_start, sent_at, ...) hold UTC instants
-- written by the app, never NOW(), so the host's time zone never shifts a
-- reminder. created_at/updated_at are bookkeeping and keep their defaults.

CREATE TABLE IF NOT EXISTS `ReminderPreference` (
  `user_id` BIGINT NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  -- {"lesson":{"enabled":true,"offsets":[10]}, "quiz_open":{...}, ...}
  `settings` JSON NULL,
  `quiet_start` VARCHAR(5) NOT NULL DEFAULT '21:00',
  `quiet_end` VARCHAR(5) NOT NULL DEFAULT '06:00',
  `morning_briefing` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `PushSubscription` (
  `subscription_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  -- sha256 of the endpoint: the endpoint itself can exceed an indexable length.
  `endpoint_hash` CHAR(64) NOT NULL,
  `endpoint` TEXT NOT NULL,
  `p256dh` VARCHAR(255) NOT NULL,
  `auth` VARCHAR(255) NOT NULL,
  `user_agent` VARCHAR(300) NULL,
  `platform` VARCHAR(30) NULL,
  `browser` VARCHAR(30) NULL,
  `installed` TINYINT(1) NOT NULL DEFAULT 0,
  `failure_count` INT NOT NULL DEFAULT 0,
  `last_success_at` DATETIME NULL,
  `last_seen_at` DATETIME NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`subscription_id`),
  UNIQUE KEY `uq_push_endpoint` (`endpoint_hash`),
  KEY `idx_push_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ReminderSource` (
  `source_id` BIGINT NOT NULL AUTO_INCREMENT,
  `source_app` VARCHAR(30) NOT NULL,
  `source_type` VARCHAR(30) NOT NULL,
  `external_id` VARCHAR(100) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` VARCHAR(500) NULL,
  `link` VARCHAR(500) NULL,
  `location` VARCHAR(150) NULL,
  `starts_at` DATETIME NOT NULL,
  `ends_at` DATETIME NULL,
  `critical` TINYINT(1) NOT NULL DEFAULT 0,
  `audience_user_ids` JSON NOT NULL,
  `cancelled_at` DATETIME NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`source_id`),
  UNIQUE KEY `uq_reminder_source` (`source_app`, `source_type`, `external_id`),
  KEY `idx_reminder_source_start` (`starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ReminderJob` (
  `job_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  -- e.g. lesson:412:2026-09-30:10 -- one row per (user, occurrence, offset).
  `dedupe_key` VARCHAR(191) NOT NULL,
  `source_type` VARCHAR(30) NOT NULL,
  `source_ref` VARCHAR(100) NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` VARCHAR(500) NULL,
  `link` VARCHAR(500) NULL,
  `location` VARCHAR(150) NULL,
  `event_start` DATETIME NOT NULL,
  `event_end` DATETIME NULL,
  `offset_min` INT NOT NULL DEFAULT 0,
  `fire_at` DATETIME NOT NULL,
  `critical` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
  `channels` VARCHAR(100) NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `claim_token` VARCHAR(36) NULL,
  `claimed_at` DATETIME NULL,
  `sent_at` DATETIME NULL,
  `acked_at` DATETIME NULL,
  `last_error` VARCHAR(500) NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_id`),
  UNIQUE KEY `uq_reminder_job` (`user_id`, `dedupe_key`),
  KEY `idx_reminder_due` (`status`, `fire_at`),
  KEY `idx_reminder_user_start` (`user_id`, `event_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `CalendarFeedToken` (
  `user_id` BIGINT NOT NULL,
  `token` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `last_fetched_at` DATETIME NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_calendar_feed_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
