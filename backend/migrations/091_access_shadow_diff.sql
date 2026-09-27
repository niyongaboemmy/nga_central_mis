-- Migration 091: Access control v2, Phase 2 -- shadow-mode decision log.
-- (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §13)
--
-- While ACCESS_V2_MIS_MODE=shadow, the legacy permission check still decides
-- every request; the v2 engine decides too, and every (user, capability,
-- route) where the two disagree is counted here, so leadership can review
-- each difference before enforcement is switched on. One row per distinct
-- disagreement, with a hit counter -- it does not grow per request.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS `AccessShadowDiff` (
  `diff_id`        BIGINT NOT NULL AUTO_INCREMENT,
  `app`            VARCHAR(30) NOT NULL DEFAULT 'mis',
  `user_id`        BIGINT NOT NULL,
  `capability`     VARCHAR(150) NOT NULL,
  `route`          VARCHAR(200) NOT NULL,
  `legacy_allowed` TINYINT(1) NOT NULL,
  `v2_allowed`     TINYINT(1) NOT NULL,
  `v2_depth`       VARCHAR(10) NULL,
  `sample_target`  VARCHAR(500) NULL,
  `hits`           INT NOT NULL DEFAULT 1,
  `first_seen`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at`    DATETIME NULL,
  `reviewed_by`    BIGINT NULL,
  `review_note`    VARCHAR(255) NULL,
  PRIMARY KEY (`diff_id`),
  UNIQUE KEY `uq_shadow_diff` (`app`, `user_id`, `capability`, `route`, `legacy_allowed`, `v2_allowed`),
  KEY `ix_shadow_last_seen` (`last_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
