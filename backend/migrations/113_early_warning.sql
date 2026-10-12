-- 113: Early warning and interventions (nga-desktop NEXT_FEATURES_ANALYSIS §3 #1).
--
--   EARLY_WARNING_VIEW     see students' risk signals and log interventions, within
--                          your scope (class teacher: their class; leaders: school).
--   StudentSignal          the latest metrics each app sends for a student
--                          (Tendo: attendance/discipline, Task Mentor: work/marks),
--                          replaced on every push (PUT /early-warning/signals).
--   StudentRiskState       the last computed level per student, so the class
--                          teacher is told once when a student becomes "at risk".
--   EarlyWarningIntervention  what is being done: owner, action, review date, outcome.
--
-- Holders' access_version is bumped at the end so the new capability works at
-- once (the access snapshot cache is keyed by it). Idempotent; MySQL 5.7 and 8.

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'EARLY_WARNING_VIEW', 'See early-warning signals and log interventions', 'ACTIVE', 'mis', 'EARLY_WARNING_VIEW', 'See early-warning signals and log interventions', 'WELFARE', 'READ', 'detail', 0, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'EARLY_WARNING_VIEW' OR p.`name` = 'EARLY_WARNING_VIEW'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'EARLY_WARNING_VIEW' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM (
  SELECT 'platform_owner' AS preset, 'SUPER_ADMIN' AS legacy
  UNION ALL SELECT 'head_teacher', 'HEAD_TEACHER'
  UNION ALL SELECT 'deputy_head_academics', 'DEPUTY_HEAD_ACADEMICS'
  UNION ALL SELECT 'deputy_head_discipline', 'DEPUTY_HEAD_DISCIPLINE'
  UNION ALL SELECT 'director_of_studies', 'DIRECTOR_OF_STUDIES'
  UNION ALL SELECT 'programme_coordinator', 'PROGRAMME_COORDINATOR'
  UNION ALL SELECT 'grade_coordinator', 'GRADE_COORDINATOR'
  UNION ALL SELECT 'class_teacher', 'CLASS_TEACHER'
  UNION ALL SELECT 'counsellor', 'COUNSELLOR'
) l
JOIN `Role` r ON (r.`preset_key` = l.preset OR (r.`preset_key` IS NULL AND r.`name` = l.legacy))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'EARLY_WARNING_VIEW'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT 'platform_owner', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'head_teacher', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'deputy_head_academics', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'deputy_head_discipline', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'director_of_studies', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'programme_coordinator', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'grade_coordinator', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'class_teacher', 'EARLY_WARNING_VIEW'
UNION ALL SELECT 'counsellor', 'EARLY_WARNING_VIEW';

CREATE TABLE IF NOT EXISTS `StudentSignal` (
  `student_id` BIGINT NOT NULL,
  `source` VARCHAR(16) NOT NULL,
  `metrics` TEXT NOT NULL,
  `as_of` DATE NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`student_id`, `source`),
  KEY `idx_student_signal_source` (`source`, `as_of`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `StudentRiskState` (
  `student_id` BIGINT NOT NULL,
  `level` VARCHAR(8) NOT NULL,
  `score` INT NOT NULL,
  `changed_at` DATETIME NOT NULL,
  PRIMARY KEY (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `EarlyWarningIntervention` (
  `intervention_id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `notes` TEXT NULL,
  `owner_id` BIGINT NOT NULL,
  `created_by` BIGINT NOT NULL,
  `review_date` DATE NULL,
  `status` VARCHAR(8) NOT NULL DEFAULT 'open',
  `outcome` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`intervention_id`),
  KEY `idx_ew_intervention_student` (`student_id`, `status`),
  KEY `idx_ew_intervention_review` (`status`, `review_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Refresh holders' access snapshots now (see header).
UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id` FROM `AccessGrant` g
  JOIN `RolePermission` rp ON rp.`role_id` = g.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'EARLY_WARNING_VIEW'
  UNION
  SELECT DISTINCT ur.`user_id` FROM `UserRole` ur
  JOIN `RolePermission` rp ON rp.`role_id` = ur.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'EARLY_WARNING_VIEW'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;
