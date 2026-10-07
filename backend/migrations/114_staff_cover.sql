-- 114: Staff absence and cover (nga-desktop NEXT_FEATURES_ANALYSIS §3 #9).
--
--   STAFF_COVER_MANAGE  approve staff absences and assign cover teachers.
--                       Super admin, head teacher, deputy head (academics), DOS.
--   StaffAbsence        a teacher's absence (dates, reason), pending → approved/declined.
--   CoverLesson         each timetabled lesson the absence leaves uncovered, and who
--                       covers it (open → assigned), one row per slot and date.
--
-- Holders' access_version is bumped at the end (snapshot cache). Idempotent; MySQL 5.7 and 8.

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'STAFF_COVER_MANAGE', 'Approve staff absences and assign cover', 'ACTIVE', 'mis', 'STAFF_COVER_MANAGE', 'Approve staff absences and assign cover', 'ACADEMICS', 'WRITE', NULL, 0, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'STAFF_COVER_MANAGE' OR p.`name` = 'STAFF_COVER_MANAGE'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'STAFF_COVER_MANAGE' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM (
  SELECT 'platform_owner' AS preset, 'SUPER_ADMIN' AS legacy
  UNION ALL SELECT 'head_teacher', 'HEAD_TEACHER'
  UNION ALL SELECT 'deputy_head_academics', 'DEPUTY_HEAD_ACADEMICS'
  UNION ALL SELECT 'director_of_studies', 'DIRECTOR_OF_STUDIES'
) l
JOIN `Role` r ON (r.`preset_key` = l.preset OR (r.`preset_key` IS NULL AND r.`name` = l.legacy))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'STAFF_COVER_MANAGE'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT 'platform_owner', 'STAFF_COVER_MANAGE'
UNION ALL SELECT 'head_teacher', 'STAFF_COVER_MANAGE'
UNION ALL SELECT 'deputy_head_academics', 'STAFF_COVER_MANAGE'
UNION ALL SELECT 'director_of_studies', 'STAFF_COVER_MANAGE';

CREATE TABLE IF NOT EXISTS `StaffAbsence` (
  `absence_id` BIGINT NOT NULL AUTO_INCREMENT,
  `teacher_id` BIGINT NOT NULL,
  `from_date` DATE NOT NULL,
  `to_date` DATE NOT NULL,
  `reason` VARCHAR(16) NOT NULL,
  `note` VARCHAR(500) NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
  `reported_by` BIGINT NOT NULL,
  `decided_by` BIGINT NULL,
  `decided_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`absence_id`),
  KEY `idx_staff_absence_teacher` (`teacher_id`, `from_date`),
  KEY `idx_staff_absence_status` (`status`, `from_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `CoverLesson` (
  `cover_id` BIGINT NOT NULL AUTO_INCREMENT,
  `absence_id` BIGINT NOT NULL,
  `slot_id` BIGINT NOT NULL,
  `lesson_date` DATE NOT NULL,
  `start_time` VARCHAR(5) NOT NULL,
  `end_time` VARCHAR(5) NULL,
  `subject_id` BIGINT NULL,
  `subject_name` VARCHAR(120) NULL,
  `class_group_id` BIGINT NULL,
  `class_name` VARCHAR(60) NULL,
  `location` VARCHAR(120) NULL,
  `cover_teacher_id` BIGINT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'open',
  `note` VARCHAR(500) NULL,
  `assigned_by` BIGINT NULL,
  `assigned_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`cover_id`),
  UNIQUE KEY `uq_cover_slot_date` (`slot_id`, `lesson_date`),
  KEY `idx_cover_date` (`lesson_date`, `status`),
  KEY `idx_cover_teacher` (`cover_teacher_id`, `lesson_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id` FROM `AccessGrant` g
  JOIN `RolePermission` rp ON rp.`role_id` = g.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'STAFF_COVER_MANAGE'
  UNION
  SELECT DISTINCT ur.`user_id` FROM `UserRole` ur
  JOIN `RolePermission` rp ON rp.`role_id` = ur.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'STAFF_COVER_MANAGE'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;
