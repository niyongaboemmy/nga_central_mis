-- 105: NGA Desktop tools — settings and game play time.
--
--   DesktopToolSetting  one JSON value per key (e.g. "games": the on/off switches,
--                       budgets and quiet hours; see services/desktop/games.ts).
--   DesktopGameUsage    seconds played per person, Kigali day, game and device.
--                       The desktop sends cumulative totals; the server keeps the
--                       largest it has seen per device (retries never double count)
--                       and adds devices together.
--
-- Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `DesktopToolSetting` (
  `setting_key` VARCHAR(64) NOT NULL,
  `value` JSON NOT NULL,
  `updated_by` BIGINT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `DesktopGameUsage` (
  `user_id` BIGINT NOT NULL,
  `day` DATE NOT NULL,
  `game_id` VARCHAR(32) NOT NULL,
  `device_id` CHAR(16) NOT NULL,
  `seconds` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `day`, `game_id`, `device_id`),
  KEY `idx_desktop_game_usage_day` (`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
