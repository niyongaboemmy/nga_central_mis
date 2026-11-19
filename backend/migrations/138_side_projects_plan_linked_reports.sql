-- 138: Side projects -- progress reports are written against the implementation plan.
--   SideProjectUpdateWork   one row per plan item / task a report covers: the feature (always set,
--                           derived from the task when a task is chosen), the task (optional),
--                           the hours spent on it and the state it was moved to from the report.
--   SideProjectTaskLog.update_id  task logs created from a report's per-task hours, so task and
--                           teammate hours include reported work without typing it twice; they
--                           are rewritten when the report is edited and removed with it.
-- Idempotent; MySQL 5.7 and 8.
CREATE TABLE IF NOT EXISTS `SideProjectUpdateWork` (
  `work_id` BIGINT NOT NULL AUTO_INCREMENT,
  `update_id` BIGINT NOT NULL,
  `project_id` BIGINT NOT NULL,
  `plan_item_id` BIGINT NOT NULL,
  `task_id` BIGINT NULL,
  `hours` DECIMAL(4,1) NULL,
  `status_to` VARCHAR(16) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`work_id`),
  KEY `idx_sp_uwork_update` (`update_id`),
  KEY `idx_sp_uwork_item` (`project_id`, `plan_item_id`),
  KEY `idx_sp_uwork_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProjectTaskLog' AND COLUMN_NAME = 'update_id') > 0,
  'SELECT 1', 'ALTER TABLE `SideProjectTaskLog` ADD COLUMN `update_id` BIGINT NULL AFTER `note`, ADD KEY `idx_sp_tasklog_update` (`update_id`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
