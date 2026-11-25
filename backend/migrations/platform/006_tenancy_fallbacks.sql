-- Automatic strict tenancy mode (TENANT_SWITCHING_PLAN.md Appendix A.6).
--
-- Control plane only (PLATFORM_DB_NAME). Each app (mis, taskmentor, tendo, tupo)
-- reports, per UTC day, how often it ran something as school 1 only because
-- nothing named a school. kind '_heartbeat' marks "the app reported that day"
-- (count always 0). Counts are cumulative for the day: the highest report wins.
-- Idempotent; MySQL 5.7 and 8.
CREATE TABLE IF NOT EXISTS `TenancyFallbackDaily` (
  `app` VARCHAR(20) NOT NULL,
  `day` DATE NOT NULL,
  `kind` VARCHAR(20) NOT NULL,
  `count` INT NOT NULL DEFAULT 0,
  `sites` JSON NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`app`, `day`, `kind`),
  KEY `idx_tfd_day` (`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
