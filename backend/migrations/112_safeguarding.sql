-- 112: Safeguarding and wellbeing (nga-desktop NEXT_FEATURES_ANALYSIS §3 #5).
--
--   SAFEGUARDING_MANAGE   see and act on safeguarding concerns (restricted, audited).
--                         Granted to the super admin, head teacher, safeguarding lead
--                         and counsellor presets; they are alerted to new concerns.
--   SafeguardingConcern   one worry about one student, from the AI Tutor (worrying
--                         words), the weekly check-in, the student's own report, or staff.
--   SafeguardingNote      what was done: notes, status changes, assignment.
--   WellbeingCheckIn      a student's weekly check-in (mood, feeling safe, wants to talk).
-- Idempotent; MySQL 5.7 and 8.

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'SAFEGUARDING_MANAGE', 'See and act on safeguarding concerns', 'ACTIVE', 'mis', 'SAFEGUARDING_MANAGE', 'See and act on safeguarding concerns', 'WELFARE', 'WRITE', NULL, 1, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'SAFEGUARDING_MANAGE' OR p.`name` = 'SAFEGUARDING_MANAGE'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'SAFEGUARDING_MANAGE' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM (
  SELECT 'platform_owner' AS preset, 'SUPER_ADMIN' AS legacy
  UNION ALL SELECT 'head_teacher', 'HEAD_TEACHER'
  UNION ALL SELECT 'safeguarding_lead', 'SAFEGUARDING_LEAD'
  UNION ALL SELECT 'counsellor', 'COUNSELLOR'
) l
JOIN `Role` r ON (r.`preset_key` = l.preset OR (r.`preset_key` IS NULL AND r.`name` = l.legacy))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'SAFEGUARDING_MANAGE'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT 'platform_owner', 'SAFEGUARDING_MANAGE'
UNION ALL SELECT 'head_teacher', 'SAFEGUARDING_MANAGE'
UNION ALL SELECT 'safeguarding_lead', 'SAFEGUARDING_MANAGE'
UNION ALL SELECT 'counsellor', 'SAFEGUARDING_MANAGE';

CREATE TABLE IF NOT EXISTS `SafeguardingConcern` (
  `concern_id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT NOT NULL,
  `source` VARCHAR(16) NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `severity` VARCHAR(8) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'new',
  `summary` VARCHAR(255) NOT NULL,
  `detail` TEXT NULL,
  `ref` VARCHAR(64) NULL,
  `reported_by` BIGINT NULL,
  `assigned_to` BIGINT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `closed_at` DATETIME NULL,
  PRIMARY KEY (`concern_id`),
  KEY `idx_sg_concern_status` (`status`, `created_at`),
  KEY `idx_sg_concern_student` (`student_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SafeguardingNote` (
  `note_id` BIGINT NOT NULL AUTO_INCREMENT,
  `concern_id` BIGINT NOT NULL,
  `author_id` BIGINT NULL,
  `action` VARCHAR(16) NOT NULL,
  `text` TEXT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`note_id`),
  KEY `idx_sg_note_concern` (`concern_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `WellbeingCheckIn` (
  `check_in_id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT NOT NULL,
  `week_start` DATE NOT NULL,
  `mood` TINYINT NOT NULL,
  `safe` TINYINT NOT NULL,
  `wants_talk` TINYINT(1) NOT NULL DEFAULT 0,
  `comment` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`check_in_id`),
  UNIQUE KEY `uq_wellbeing_week` (`student_id`, `week_start`),
  KEY `idx_wellbeing_week` (`week_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
