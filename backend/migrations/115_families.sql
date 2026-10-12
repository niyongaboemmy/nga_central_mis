-- 115: Families (nga-desktop NEXT_FEATURES_ANALYSIS §3 #2, free channels only).
--
--   FamilyPreference   a parent's choices for the weekly family summary.
--   FamilyDigestLog    one row per parent and week once the summary went out
--                      (so a restart never sends it twice).
-- Parents are ordinary MIS users (UserProfile.user_type = 'PARENT') linked to
-- their children in Parenting. Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `FamilyPreference` (
  `parent_id` BIGINT NOT NULL,
  `weekly_digest` TINYINT(1) NOT NULL DEFAULT 1,
  `digest_email` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `FamilyDigestLog` (
  `parent_id` BIGINT NOT NULL,
  `week_start` DATE NOT NULL,
  `channels` VARCHAR(64) NOT NULL,
  `sent_at` DATETIME NOT NULL,
  PRIMARY KEY (`parent_id`, `week_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
