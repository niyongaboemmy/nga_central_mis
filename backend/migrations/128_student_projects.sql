-- 128: Student side projects (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md).
--
--   SIDE_PROJECTS_MANAGE_OWN  a student runs their own projects: board, documents, media,
--                             milestones, updates. Legacy-visible (students reach routes
--                             through the legacy STUDENT role while MIS runs in shadow mode).
--   SIDE_PROJECTS_VIEW        see projects in your area: summary = dashboard aggregates only,
--                             detail = open projects and their files. v2-only, scopeable.
--   SIDE_PROJECTS_REVIEW      comment, request changes, verify completion. v2-only, scopeable.
--   SIDE_PROJECTS_MANAGE_ANY  import, register for a student, correct status, archive/delete,
--                             categories, export. v2-only, restricted.
-- Names carry no role keyword (ADMIN/TEACHER/STUDENT...) because spoke apps keyword-match
-- the legacy permission list. FileAsset gains the PROJECT scope so uploads reuse the
-- e-learning store (classifier, quota, dedupe, previews). Holders' access_version is bumped
-- at the end so the new capabilities work at once. Idempotent; MySQL 5.7 and 8.

-- 1) Capabilities --------------------------------------------------------------------------
INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT c.name, c.label, 'ACTIVE', 'mis', c.name, c.label, 'ACADEMICS', c.kind, c.depths, c.restricted, c.scopeable
FROM (
  SELECT 'SIDE_PROJECTS_MANAGE_OWN' AS name, 'Run your own side projects (board, documents, media, progress)' AS label, 'WRITE' AS kind, NULL AS depths, 0 AS restricted, 0 AS scopeable
  UNION ALL SELECT 'SIDE_PROJECTS_VIEW', 'See students'' side projects in your area', 'READ', 'summary,detail', 0, 1
  UNION ALL SELECT 'SIDE_PROJECTS_REVIEW', 'Review side projects (feedback, changes, verify completion)', 'WRITE', NULL, 0, 1
  UNION ALL SELECT 'SIDE_PROJECTS_MANAGE_ANY', 'Manage every side project (import, correct, archive, categories)', 'WRITE', NULL, 1, 0
) c
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = c.name OR p.`name` = c.name));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` IN ('SIDE_PROJECTS_MANAGE_OWN', 'SIDE_PROJECTS_VIEW', 'SIDE_PROJECTS_REVIEW', 'SIDE_PROJECTS_MANAGE_ANY')
  AND (`app` IS NULL OR `app` = 'mis');

-- 2) Role links (presets, and their legacy roles where one exists) ---------------------------
CREATE TEMPORARY TABLE `tmp_128_links` (
  `preset` VARCHAR(60) NOT NULL,
  `legacy` VARCHAR(60) NULL,
  `cap` VARCHAR(64) NOT NULL,
  `depth` VARCHAR(16) NULL,
  PRIMARY KEY (`preset`, `cap`)
);

INSERT IGNORE INTO `tmp_128_links` (`preset`, `legacy`, `cap`, `depth`) VALUES
  ('platform_owner', 'SUPER_ADMIN', 'SIDE_PROJECTS_VIEW', 'detail'),
  ('platform_owner', 'SUPER_ADMIN', 'SIDE_PROJECTS_REVIEW', NULL),
  ('platform_owner', 'SUPER_ADMIN', 'SIDE_PROJECTS_MANAGE_ANY', NULL),
  ('school_owner', NULL, 'SIDE_PROJECTS_VIEW', 'detail'),
  ('school_owner', NULL, 'SIDE_PROJECTS_REVIEW', NULL),
  ('school_owner', NULL, 'SIDE_PROJECTS_MANAGE_ANY', NULL),
  ('head_teacher', 'HEAD_TEACHER', 'SIDE_PROJECTS_VIEW', 'detail'),
  ('head_teacher', 'HEAD_TEACHER', 'SIDE_PROJECTS_REVIEW', NULL),
  ('head_teacher', 'HEAD_TEACHER', 'SIDE_PROJECTS_MANAGE_ANY', NULL),
  ('deputy_head_academics', NULL, 'SIDE_PROJECTS_VIEW', 'detail'),
  ('deputy_head_academics', NULL, 'SIDE_PROJECTS_REVIEW', NULL),
  ('director_of_studies', NULL, 'SIDE_PROJECTS_VIEW', 'detail'),
  ('director_of_studies', NULL, 'SIDE_PROJECTS_REVIEW', NULL),
  ('programme_coordinator', 'PROGRAM_MANAGER', 'SIDE_PROJECTS_VIEW', 'detail'),
  ('programme_coordinator', 'PROGRAM_MANAGER', 'SIDE_PROJECTS_REVIEW', NULL),
  ('class_teacher', 'CLASS_TEACHER', 'SIDE_PROJECTS_VIEW', 'detail'),
  ('class_teacher', 'CLASS_TEACHER', 'SIDE_PROJECTS_REVIEW', NULL),
  ('mentor', NULL, 'SIDE_PROJECTS_VIEW', 'detail'),
  ('academic_insights_viewer', NULL, 'SIDE_PROJECTS_VIEW', 'summary'),
  ('side_projects_lead', NULL, 'SIDE_PROJECTS_VIEW', 'detail'),
  ('side_projects_lead', NULL, 'SIDE_PROJECTS_REVIEW', NULL),
  ('side_projects_lead', NULL, 'SIDE_PROJECTS_MANAGE_ANY', NULL),
  ('student', 'STUDENT', 'SIDE_PROJECTS_MANAGE_OWN', NULL);

CREATE TEMPORARY TABLE `tmp_128_roles` (`role_id` BIGINT NOT NULL, `cap` VARCHAR(64) NOT NULL, `depth` VARCHAR(16) NULL, PRIMARY KEY (`role_id`, `cap`));

-- BINARY: the temporary table's collation may differ from Role's/Permission's (MySQL 8, error 1267).
INSERT IGNORE INTO `tmp_128_roles` (`role_id`, `cap`, `depth`)
SELECT r.`role_id`, l.`cap`, l.`depth`
FROM `tmp_128_links` l
JOIN `Role` r ON (BINARY r.`preset_key` = BINARY l.`preset`
               OR (r.`preset_key` IS NULL AND l.`legacy` IS NOT NULL AND BINARY r.`name` = BINARY l.`legacy`));

-- RolePermission has no primary key on older databases: guard with NOT EXISTS.
INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT t.`role_id`, p.`perm_id`, t.`depth`
FROM `tmp_128_roles` t
JOIN `Permission` p ON p.`app` = 'mis' AND BINARY p.`name` = BINARY t.`cap`
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = t.`role_id` AND x.`perm_id` = p.`perm_id`);

-- 3) Applied preset links, so the boot-time preset sync never re-adds a link an admin removed.
--    (The side_projects_lead role itself is created by the boot preset sync:
--    the legacy Role table has no AUTO_INCREMENT, see insertRoleWithNextId.)
INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT `preset`, `cap` FROM `tmp_128_links`;

-- 4) FileAsset gains the PROJECT scope ------------------------------------------------------
SET @s := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FileAsset' AND COLUMN_NAME = 'scope'
      AND COLUMN_TYPE LIKE '%''PROJECT''%') > 0,
  'SELECT 1',
  'ALTER TABLE `FileAsset` MODIFY `scope` ENUM(''COURSE'',''RUN_REFERENCE'',''SUBJECT'',''SUBMISSION'',''PROJECT'') NOT NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5) Tables ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `SideProjectCategory` (
  `category_id` BIGINT NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(40) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `icon` VARCHAR(32) NOT NULL DEFAULT 'sparkles',
  `color` VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  `sort` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `uq_sp_category_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProject` (
  `project_id` BIGINT NOT NULL AUTO_INCREMENT,
  `owner_user_id` BIGINT NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `title_key` VARCHAR(150) NOT NULL,
  `deleted_marker` BIGINT NOT NULL DEFAULT 0,
  `problem_statement` TEXT NOT NULL,
  `description` TEXT NULL,
  `category_id` BIGINT NULL,
  `tech_tags` TEXT NULL,
  `status` ENUM('IDEA','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'IDEA',
  `board_position` INT NOT NULL DEFAULT 0,
  `progress_mode` ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  `progress_manual` TINYINT NULL,
  `review_state` ENUM('NONE','CHANGES_REQUESTED','AWAITING_VERIFICATION','VERIFIED') NOT NULL DEFAULT 'NONE',
  `github_url` VARCHAR(500) NULL,
  `access_url` VARCHAR(500) NULL,
  `supervisor_user_id` BIGINT NULL,
  `academic_year_id` BIGINT NULL,
  `last_active_year_id` BIGINT NULL,
  `class_group_id` BIGINT NULL,
  `reg_number_snapshot` VARCHAR(20) NULL,
  `student_name_snapshot` VARCHAR(201) NULL,
  `cover_asset_id` BIGINT NULL,
  `concept_pending` TINYINT(1) NOT NULL DEFAULT 0,
  `outcome_summary` TEXT NULL,
  `start_date` DATE NULL,
  `target_date` DATE NULL,
  `started_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `verified_at` DATETIME NULL,
  `verified_by` BIGINT NULL,
  `archived_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  `last_activity_at` DATETIME NOT NULL,
  `created_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`project_id`),
  UNIQUE KEY `uq_sp_owner_title` (`owner_user_id`, `title_key`, `deleted_marker`),
  KEY `idx_sp_owner_board` (`owner_user_id`, `status`, `board_position`),
  KEY `idx_sp_year_status` (`academic_year_id`, `status`),
  KEY `idx_sp_active_year` (`last_active_year_id`, `status`),
  KEY `idx_sp_class_status` (`class_group_id`, `status`),
  KEY `idx_sp_status_activity` (`status`, `last_activity_at`),
  KEY `idx_sp_supervisor` (`supervisor_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectMember` (
  `project_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `status` ENUM('INVITED','ACCEPTED') NOT NULL DEFAULT 'INVITED',
  `invited_by` BIGINT NOT NULL,
  `added_at` DATETIME NOT NULL,
  `responded_at` DATETIME NULL,
  PRIMARY KEY (`project_id`, `user_id`),
  KEY `idx_sp_member_user` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectDocument` (
  `document_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `doc_type` ENUM('CONCEPT','SRS','IMPLEMENTATION_PLAN') NOT NULL,
  `version` INT NOT NULL,
  `asset_id` BIGINT NOT NULL,
  `is_current` TINYINT(1) NOT NULL DEFAULT 1,
  `source` ENUM('UPLOAD','WRITTEN') NOT NULL DEFAULT 'UPLOAD',
  `uploaded_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`document_id`),
  UNIQUE KEY `uq_sp_doc_version` (`project_id`, `doc_type`, `version`),
  KEY `idx_sp_doc_current` (`project_id`, `is_current`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectMedia` (
  `media_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `asset_id` BIGINT NOT NULL,
  `caption` VARCHAR(200) NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `created_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`media_id`),
  KEY `idx_sp_media_project` (`project_id`, `deleted_at`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectLink` (
  `link_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `kind` ENUM('VIDEO','DESIGN','DOCS','STORE','OTHER') NOT NULL DEFAULT 'OTHER',
  `label` VARCHAR(80) NOT NULL,
  `url` VARCHAR(500) NOT NULL,
  `sort` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`link_id`),
  KEY `idx_sp_link_project` (`project_id`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectMilestone` (
  `milestone_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `due_date` DATE NULL,
  `done_at` DATETIME NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`milestone_id`),
  KEY `idx_sp_milestone_project` (`project_id`, `sort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectUpdate` (
  `update_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `author_id` BIGINT NOT NULL,
  `did` TEXT NOT NULL,
  `next_steps` TEXT NULL,
  `blockers` TEXT NULL,
  `mood` TINYINT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`update_id`),
  KEY `idx_sp_update_project` (`project_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectEvent` (
  `event_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `actor_id` BIGINT NULL,
  `type` VARCHAR(24) NOT NULL,
  `from_value` VARCHAR(32) NULL,
  `to_value` VARCHAR(32) NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`event_id`),
  KEY `idx_sp_event_project` (`project_id`, `created_at`),
  KEY `idx_sp_event_type` (`type`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectComment` (
  `comment_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `author_id` BIGINT NOT NULL,
  `kind` ENUM('COMMENT','CHANGES_REQUESTED','VERIFIED') NOT NULL DEFAULT 'COMMENT',
  `body` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`comment_id`),
  KEY `idx_sp_comment_project` (`project_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6) Categories -----------------------------------------------------------------------------
INSERT IGNORE INTO `SideProjectCategory` (`slug`, `name`, `icon`, `color`, `sort`) VALUES
  ('web', 'Web app', 'globe', '#3b82f6', 1),
  ('mobile', 'Mobile app', 'smartphone', '#8b5cf6', 2),
  ('ai', 'AI / ML', 'brain', '#ec4899', 3),
  ('iot', 'IoT / Embedded', 'cpu', '#f59e0b', 4),
  ('robotics', 'Robotics / Hardware', 'bot', '#ef4444', 5),
  ('game', 'Game', 'gamepad', '#10b981', 6),
  ('data', 'Data / Analytics', 'chart', '#06b6d4', 7),
  ('security', 'Cybersecurity', 'shield', '#64748b', 8),
  ('other', 'Other', 'sparkles', '#a855f7', 9);

-- 7) Refresh holders' access snapshots now ---------------------------------------------------
CREATE TEMPORARY TABLE `tmp_128_bump` (`role_id` BIGINT NOT NULL, PRIMARY KEY (`role_id`));
INSERT IGNORE INTO `tmp_128_bump` (`role_id`) SELECT DISTINCT `role_id` FROM `tmp_128_roles`;

-- Two statements: a temporary table can't be opened twice in one query (error 1137).
UPDATE `User` u
JOIN (SELECT DISTINCT ur.`user_id` FROM `UserRole` ur JOIN `tmp_128_bump` t ON t.`role_id` = ur.`role_id`) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id` FROM `AccessGrant` g JOIN `tmp_128_bump` t ON t.`role_id` = g.`role_id` WHERE g.`status` = 'ACTIVE'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

DROP TEMPORARY TABLE IF EXISTS `tmp_128_bump`;
DROP TEMPORARY TABLE IF EXISTS `tmp_128_roles`;
DROP TEMPORARY TABLE IF EXISTS `tmp_128_links`;
