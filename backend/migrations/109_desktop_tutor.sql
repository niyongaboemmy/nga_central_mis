-- 109: NGA Desktop — the student AI tutor's conversation log (TOOLS_HUB plan §5.7).
--
--   DesktopTutorMessage  every student question and tutor reply: provider, model,
--                        the answer/safety check's verdict, and flags (safeguarding
--                        words, a failed check, or the student's own report).
--                        Reviewed by school leaders on MIS → Desktop tools.
-- Tutor settings live in DesktopToolSetting (key "tutor").
-- Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `DesktopTutorMessage` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `conversation_id` VARCHAR(40) NOT NULL,
  `role` VARCHAR(8) NOT NULL,
  `text` MEDIUMTEXT NOT NULL,
  `provider` VARCHAR(32) NULL,
  `model` VARCHAR(100) NULL,
  `verdict` VARCHAR(400) NULL,
  `flagged` TINYINT(1) NOT NULL DEFAULT 0,
  `flag_reason` VARCHAR(120) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_desktop_tutor_user_time` (`user_id`, `created_at`),
  KEY `idx_desktop_tutor_conv` (`conversation_id`),
  KEY `idx_desktop_tutor_flag` (`flagged`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
