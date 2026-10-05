-- 103: NGA Desktop distribution (the /apps download page and in-app updates).
--
--   DesktopDownload  one row per installer download through
--                    GET /desktop/download/:platform (counted before the redirect).
--   DesktopInstall   one row per installed app, from its update checks
--                    (GET /desktop/update/..., random X-NGA-Install id): which
--                    version each install runs and when it was last seen.
--
-- No personal data: IPs are stored only as a salted hash prefix, for
-- telling repeat downloads apart. DATETIME columns hold UTC instants.
-- Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `DesktopDownload` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `platform` VARCHAR(16) NOT NULL,
  `version` VARCHAR(32) NOT NULL,
  `user_id` INT NULL,
  `ip_hash` CHAR(16) NULL,
  `user_agent` VARCHAR(255) NULL,
  `source` VARCHAR(32) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_desktop_download_created` (`created_at`),
  KEY `idx_desktop_download_platform` (`platform`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `DesktopInstall` (
  `install_id` CHAR(32) NOT NULL,
  `platform` VARCHAR(16) NOT NULL,
  `arch` VARCHAR(16) NOT NULL,
  `version` VARCHAR(32) NOT NULL,
  `first_seen` DATETIME NOT NULL,
  `last_seen` DATETIME NOT NULL,
  `checks` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`install_id`),
  KEY `idx_desktop_install_seen` (`last_seen`),
  KEY `idx_desktop_install_version` (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
