-- 131: Side projects -- stages and period management, richer progress reports, Assigned projects.
--
--   Stages     IDEA -> PLANNING -> IN_PROGRESS ("Building") -> TESTING -> COMPLETED, plus ON_HOLD
--              (a pause that remembers the stage it came from in paused_from).
--   Periods    SideProjectStage = the planned window of each working stage (start/end dates);
--              SideProjectStageLog = every actual stay in a stage (entered_at / left_at), so the
--              app can show days spent, days left and overruns, and admins can find bottlenecks.
--              Existing projects get one open log for their current stage (entered = last status
--              change, else started_at, else created_at); earlier history is rebuilt on read from
--              the STATUS events.
--   Reports    SideProjectUpdate gains work_date, hours, stage and edited_at; PDF attachments live
--              in SideProjectUpdateFile (FileAsset scope PROJECT).
--   Assigned   SIDE_PROJECTS_ASSIGNED -- the "Assigned projects" page (projects you supervise or
--              are on the team of). Every role except students' and parents'. Legacy-visible like
--              SIDE_PROJECTS_MANAGE_OWN; no role keyword in the name.
-- Idempotent; MySQL 5.7 and 8.

-- 1) Stages -----------------------------------------------------------------------------------
ALTER TABLE `SideProject`
  MODIFY `status` ENUM('IDEA','PLANNING','IN_PROGRESS','TESTING','COMPLETED','ON_HOLD') NOT NULL DEFAULT 'IDEA';

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'paused_from') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `paused_from` VARCHAR(16) NULL AFTER `status`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'stage_entered_at') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `stage_entered_at` DATETIME NULL AFTER `paused_from`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS `SideProjectStage` (
  `project_id` BIGINT NOT NULL,
  `stage` VARCHAR(16) NOT NULL,
  `planned_start` DATE NOT NULL,
  `planned_end` DATE NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`project_id`, `stage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectStageLog` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `stage` VARCHAR(16) NOT NULL,
  `entered_at` DATETIME NOT NULL,
  `left_at` DATETIME NULL,
  PRIMARY KEY (`log_id`),
  KEY `idx_sp_stagelog_project` (`project_id`, `entered_at`),
  KEY `idx_sp_stagelog_open` (`left_at`, `stage`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Current stage start for existing projects.
UPDATE `SideProject` sp
SET sp.`stage_entered_at` = COALESCE(
  (SELECT MAX(e.`created_at`) FROM `SideProjectEvent` e
    WHERE e.`project_id` = sp.`project_id` AND e.`type` IN ('STATUS', 'CORRECTION') AND e.`to_value` = sp.`status`),
  CASE WHEN sp.`status` = 'IDEA' THEN sp.`created_at` ELSE COALESCE(sp.`started_at`, sp.`created_at`) END)
WHERE sp.`stage_entered_at` IS NULL;

-- 2) Progress reports ---------------------------------------------------------------------------
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProjectUpdate' AND COLUMN_NAME = 'work_date') > 0,
  'SELECT 1', 'ALTER TABLE `SideProjectUpdate` ADD COLUMN `work_date` DATE NULL AFTER `mood`, ADD COLUMN `hours` DECIMAL(4,1) NULL AFTER `work_date`, ADD COLUMN `stage` VARCHAR(16) NULL AFTER `hours`, ADD COLUMN `edited_at` DATETIME NULL AFTER `created_at`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE `SideProjectUpdate` SET `work_date` = DATE(`created_at`) WHERE `work_date` IS NULL;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProjectUpdate' AND INDEX_NAME = 'idx_sp_update_workdate') > 0,
  'SELECT 1', 'ALTER TABLE `SideProjectUpdate` ADD KEY `idx_sp_update_workdate` (`project_id`, `work_date`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS `SideProjectUpdateFile` (
  `update_id` BIGINT NOT NULL,
  `asset_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`update_id`, `asset_id`),
  KEY `idx_sp_updatefile_asset` (`asset_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Assigned projects permission ------------------------------------------------------------------
INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'SIDE_PROJECTS_ASSIGNED', 'See and follow the projects assigned to you', 'ACTIVE', 'mis', 'SIDE_PROJECTS_ASSIGNED', 'See and follow the projects assigned to you', 'ACADEMICS', 'READ', 'detail', 0, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'SIDE_PROJECTS_ASSIGNED' OR p.`name` = 'SIDE_PROJECTS_ASSIGNED'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'SIDE_PROJECTS_ASSIGNED' AND (`app` IS NULL OR `app` = 'mis');

-- Every role except the students' and parents' (legacy names and preset keys).
INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, 'detail'
FROM `Role` r
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'SIDE_PROJECTS_ASSIGNED'
WHERE r.`name` NOT IN ('STUDENT', 'PARENT')
  AND (r.`preset_key` IS NULL OR r.`preset_key` NOT IN ('student', 'parent'))
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT DISTINCT r.`preset_key`, 'SIDE_PROJECTS_ASSIGNED'
FROM `Role` r
WHERE r.`preset_key` IS NOT NULL AND r.`preset_key` NOT IN ('student', 'parent');

-- Refresh cached access snapshots of the holders (two statements: one per source).
UPDATE `User` u
JOIN (
  SELECT DISTINCT ur.`user_id` FROM `UserRole` ur
  JOIN `RolePermission` rp ON rp.`role_id` = ur.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'SIDE_PROJECTS_ASSIGNED'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id` FROM `AccessGrant` g
  JOIN `RolePermission` rp ON rp.`role_id` = g.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'SIDE_PROJECTS_ASSIGNED'
  WHERE g.`status` = 'ACTIVE'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;
