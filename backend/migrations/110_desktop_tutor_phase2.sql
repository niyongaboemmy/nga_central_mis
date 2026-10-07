-- 110: NGA Desktop AI Tutor, phase 2 (TOOLS_HUB plan §5.7.4–5.7.6).
--
--   DesktopTutorMessage.counted  0 for replies that don't use a daily question
--                                (answers from the cache).
--   DesktopTutorCache            concept answers ("what is photosynthesis?") kept
--                                7 days per normalised question and language.
--   DesktopTutorEval             provider tests: how often each provider's drafts
--                                give answers away; a provider that fails is left
--                                out of student drafts.
--   DesktopTutorConsent          a parent's yes/no for each child (used when the
--                                school requires consent).
-- Idempotent; MySQL 5.7 and 8.

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DesktopTutorMessage' AND COLUMN_NAME = 'counted');
SET @sql := IF(@col = 0, 'ALTER TABLE `DesktopTutorMessage` ADD COLUMN `counted` TINYINT(1) NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS `DesktopTutorCache` (
  `cache_key` CHAR(40) NOT NULL,
  `lang` VARCHAR(8) NOT NULL,
  `question` VARCHAR(500) NOT NULL,
  `reply` TEXT NOT NULL,
  `provider` VARCHAR(32) NULL,
  `hits` INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`cache_key`),
  KEY `idx_desktop_tutor_cache_exp` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `DesktopTutorEval` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(32) NOT NULL,
  `model` VARCHAR(100) NULL,
  `prompts` INT UNSIGNED NOT NULL,
  `answered` INT UNSIGNED NOT NULL,
  `leaked` INT UNSIGNED NOT NULL,
  `no_leak_pct` DECIMAL(5,1) NOT NULL,
  `passed` TINYINT(1) NOT NULL,
  `details` MEDIUMTEXT NULL,
  `run_by` BIGINT NULL,
  `run_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_desktop_tutor_eval_provider` (`provider`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `DesktopTutorConsent` (
  `student_id` BIGINT NOT NULL,
  `parent_id` BIGINT NOT NULL,
  `granted` TINYINT(1) NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
