-- 133: Side projects -- teams (personal/team, roles, responsibilities, managers), the
-- implementation plan (phases/features with statuses), tasks (states, assignment, work
-- logs, status history) and shared customers (own initiative or for a customer, one customer
-- record reused across projects). See SIDE_PROJECTS_TEAMS_PLAN_TASKS_IMPLEMENTATION_PLAN.md.
-- No new permission: project managers are a per-project right. Idempotent; MySQL 5.7 and 8.

-- 1) Team mode and teammate roles ------------------------------------------------------------------
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'team_mode') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `team_mode` ENUM(''PERSONAL'',''TEAM'') NOT NULL DEFAULT ''PERSONAL'' AFTER `kind`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

UPDATE `SideProject` sp SET sp.`team_mode` = 'TEAM'
WHERE sp.`team_mode` = 'PERSONAL' AND EXISTS (SELECT 1 FROM `SideProjectMember` m WHERE m.`project_id` = sp.`project_id`);

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProjectMember' AND COLUMN_NAME = 'role_key') > 0,
  'SELECT 1', 'ALTER TABLE `SideProjectMember` ADD COLUMN `role_key` VARCHAR(16) NOT NULL DEFAULT ''DEVELOPER'' AFTER `status`, ADD COLUMN `role_title` VARCHAR(60) NULL AFTER `role_key`, ADD COLUMN `responsibilities` VARCHAR(1000) NULL AFTER `role_title`, ADD COLUMN `is_manager` TINYINT(1) NOT NULL DEFAULT 0 AFTER `responsibilities`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Implementation plan ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `SideProjectPlanItem` (
  `item_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `parent_id` BIGINT NULL,
  `kind` ENUM('PHASE','FEATURE') NOT NULL DEFAULT 'FEATURE',
  `title` VARCHAR(150) NOT NULL,
  `description` VARCHAR(2000) NULL,
  `status` ENUM('BACKLOG','PLANNED','IN_PROGRESS','IN_REVIEW','BLOCKED','DONE','CANCELLED') NOT NULL DEFAULT 'PLANNED',
  `status_mode` ENUM('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  `priority` ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `stage` VARCHAR(16) NULL,
  `owner_user_id` BIGINT NULL,
  `start_date` DATE NULL,
  `due_date` DATE NULL,
  `estimate_hours` DECIMAL(6,1) NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `done_at` DATETIME NULL,
  `status_changed_at` DATETIME NULL,
  `created_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`item_id`),
  KEY `idx_sp_plan_project` (`project_id`, `parent_id`, `sort`),
  KEY `idx_sp_plan_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Tasks -------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `SideProjectTask` (
  `task_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `plan_item_id` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` VARCHAR(4000) NULL,
  `status` ENUM('TODO','IN_PROGRESS','IN_REVIEW','BLOCKED','DONE','CANCELLED') NOT NULL DEFAULT 'TODO',
  `priority` ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `assignee_user_id` BIGINT NULL,
  `due_date` DATE NULL,
  `estimate_hours` DECIMAL(6,1) NULL,
  `blocked_reason` VARCHAR(500) NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `started_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `status_changed_at` DATETIME NOT NULL,
  `overdue_nudged_on` DATE NULL,
  `created_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`task_id`),
  KEY `idx_sp_task_project` (`project_id`, `status`),
  KEY `idx_sp_task_item` (`plan_item_id`),
  KEY `idx_sp_task_assignee` (`assignee_user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectTaskEvent` (
  `event_id` BIGINT NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT NOT NULL,
  `from_status` VARCHAR(16) NULL,
  `to_status` VARCHAR(16) NOT NULL,
  `actor_id` BIGINT NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`event_id`),
  KEY `idx_sp_taskevent_task` (`task_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectTaskLog` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `work_date` DATE NOT NULL,
  `hours` DECIMAL(4,1) NOT NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`log_id`),
  KEY `idx_sp_tasklog_task` (`task_id`),
  KEY `idx_sp_tasklog_user` (`user_id`, `work_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Customers (shared across projects) ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `SideProjectCustomer` (
  `customer_id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(120) NOT NULL,
  `name_key` VARCHAR(120) NOT NULL,
  `kind` ENUM('PERSON','COMPANY','SCHOOL','NGO','GOVERNMENT','OTHER') NOT NULL DEFAULT 'COMPANY',
  `contact_name` VARCHAR(120) NULL,
  `email` VARCHAR(160) NULL,
  `phone` VARCHAR(40) NULL,
  `website` VARCHAR(300) NULL,
  `address` VARCHAR(300) NULL,
  `description` VARCHAR(1000) NULL,
  `logo_asset_id` BIGINT NULL,
  `created_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  `archived_at` DATETIME NULL,
  PRIMARY KEY (`customer_id`),
  KEY `idx_sp_customer_name` (`name_key`),
  KEY `idx_sp_customer_archived` (`archived_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'customer_mode') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `customer_mode` ENUM(''OWN'',''CUSTOMER'') NOT NULL DEFAULT ''OWN'' AFTER `team_mode`, ADD COLUMN `customer_id` BIGINT NULL AFTER `customer_mode`, ADD KEY `idx_sp_customer` (`customer_id`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5) Project logo (the cover stays `cover_asset_id`, now also uploadable directly) ---------------------
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'logo_asset_id') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `logo_asset_id` BIGINT NULL AFTER `cover_asset_id`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
