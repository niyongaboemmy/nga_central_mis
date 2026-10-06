-- 107: NGA Desktop games — teacher "Class game time" and per-student exceptions
-- (nga-desktop TOOLS_HUB plan §6.7.5 layers 6 and 8).
--
--   DesktopClassGameTime  a teacher opens chosen games for one of their classes for
--                         5–30 minutes, even during their own lesson. Ended early by
--                         moving ends_at to now. Doesn't count towards budgets.
--   DesktopGameOverride   block (behaviour, parent request) or extend (extra daily
--                         minutes, e.g. special needs) for one student, with a reason
--                         and an end date. Revoked, never deleted (audit).
--
-- Times are UTC. Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `DesktopClassGameTime` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `class_group_id` BIGINT NOT NULL,
  `games` JSON NOT NULL,
  `starts_at` DATETIME NOT NULL,
  `ends_at` DATETIME NOT NULL,
  `created_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_desktop_cgt_class_end` (`class_group_id`, `ends_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `DesktopGameOverride` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `kind` VARCHAR(10) NOT NULL,
  `extra_min` SMALLINT UNSIGNED NULL,
  `reason` VARCHAR(300) NOT NULL,
  `ends_at` DATETIME NOT NULL,
  `created_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` DATETIME NULL,
  `revoked_by` BIGINT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_desktop_override_user_end` (`user_id`, `ends_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
