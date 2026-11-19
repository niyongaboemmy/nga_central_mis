-- 139: Side projects -- Git-driven reporting (GIT_AUTOMATED_REPORTING_ANALYSIS.md).
--   SideProject.task_key            2-5 capital letters; task references are KEY-<task_id> (FOP-27).
--   SideProjectUpdate.source        MANUAL | GIT (a submitted Git draft) | GIT_AUTO (auto-submitted).
--   SideProjectUpdateWork.evidence  {commits:[sha], prs:[number]} behind a work line;
--   SideProjectUpdateWork.hours_source  TYPED | GIT_ESTIMATE | EDITOR.
--   GitInstallation     the NGA Projects GitHub App installed on a (personal) account.
--   GitRepoLink         a repository connected to a project (optional path prefix for monorepos).
--   GitIdentity         a person's GitHub account (Connect GitHub, user OAuth).
--   GitAuthorMap        an unclaimed commit author mapped to a person, or ignored.
--   GitEvent            webhook deliveries (idempotent by delivery id), processed in the background.
--   GitCommit / GitBranch / GitPullRequest  activity linked to tasks.
--   GitEditorActivity   active editing minutes reported by TMCode.
--   SideProjectReportDraft  the living report draft per person and project (one open at a time).
-- Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'task_key') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `task_key` VARCHAR(5) NULL AFTER `title_key`, ADD UNIQUE KEY `uq_sp_task_key` (`task_key`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProjectUpdate' AND COLUMN_NAME = 'source') > 0,
  'SELECT 1', 'ALTER TABLE `SideProjectUpdate` ADD COLUMN `source` VARCHAR(12) NOT NULL DEFAULT ''MANUAL'' AFTER `stage`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProjectUpdateWork' AND COLUMN_NAME = 'evidence') > 0,
  'SELECT 1', 'ALTER TABLE `SideProjectUpdateWork` ADD COLUMN `evidence` TEXT NULL AFTER `status_to`, ADD COLUMN `hours_source` VARCHAR(12) NULL AFTER `evidence`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

CREATE TABLE IF NOT EXISTS `GitInstallation` (
  `installation_id` BIGINT NOT NULL,
  `account_id` BIGINT NULL,
  `account_login` VARCHAR(100) NOT NULL,
  `account_type` VARCHAR(20) NOT NULL DEFAULT 'User',
  `installed_by` BIGINT NULL,
  `suspended_at` DATETIME NULL,
  `removed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`installation_id`),
  KEY `idx_git_inst_user` (`installed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitRepoLink` (
  `link_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `provider` VARCHAR(12) NOT NULL DEFAULT 'github',
  `repo_id` BIGINT NOT NULL,
  `full_name` VARCHAR(200) NOT NULL,
  `html_url` VARCHAR(300) NOT NULL,
  `installation_id` BIGINT NULL,
  `default_branch` VARCHAR(255) NOT NULL DEFAULT 'main',
  `path_prefix` VARCHAR(255) NULL,
  `settings` TEXT NULL,
  `status` VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
  `connected_by` BIGINT NULL,
  `last_event_at` DATETIME NULL,
  `reconciled_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`link_id`),
  UNIQUE KEY `uq_git_link_project` (`project_id`),
  KEY `idx_git_link_repo` (`repo_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitIdentity` (
  `user_id` BIGINT NOT NULL,
  `github_user_id` BIGINT NOT NULL,
  `login` VARCHAR(100) NOT NULL,
  `name` VARCHAR(150) NULL,
  `avatar_url` VARCHAR(300) NULL,
  `emails` TEXT NULL,
  `prefs` TEXT NULL,
  `verified_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_git_identity_gh` (`github_user_id`),
  KEY `idx_git_identity_login` (`login`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitAuthorMap` (
  `map_id` BIGINT NOT NULL AUTO_INCREMENT,
  `key_type` VARCHAR(8) NOT NULL,
  `key_value` VARCHAR(190) NOT NULL,
  `user_id` BIGINT NULL,
  `ignored` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`map_id`),
  UNIQUE KEY `uq_git_author_map` (`key_type`, `key_value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitEvent` (
  `event_id` BIGINT NOT NULL AUTO_INCREMENT,
  `delivery_id` VARCHAR(64) NOT NULL,
  `event` VARCHAR(40) NOT NULL,
  `action` VARCHAR(40) NULL,
  `installation_id` BIGINT NULL,
  `repo_id` BIGINT NULL,
  `payload` MEDIUMTEXT NULL,
  `received_at` DATETIME NOT NULL,
  `processed_at` DATETIME NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `error` VARCHAR(500) NULL,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `uq_git_event_delivery` (`delivery_id`),
  KEY `idx_git_event_pending` (`processed_at`, `attempts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitCommit` (
  `commit_id` BIGINT NOT NULL AUTO_INCREMENT,
  `repo_id` BIGINT NOT NULL,
  `sha` CHAR(40) NOT NULL,
  `project_id` BIGINT NOT NULL,
  `author_user_id` BIGINT NULL,
  `coauthor_ids` VARCHAR(500) NULL,
  `author_login` VARCHAR(100) NULL,
  `author_email` VARCHAR(190) NULL,
  `author_name` VARCHAR(150) NULL,
  `authored_at` DATETIME NOT NULL,
  `pushed_at` DATETIME NOT NULL,
  `branch` VARCHAR(255) NULL,
  `title` VARCHAR(300) NOT NULL,
  `files_changed` INT NOT NULL DEFAULT 0,
  `task_id` BIGINT NULL,
  `pr_number` INT NULL,
  `is_merge` TINYINT(1) NOT NULL DEFAULT 0,
  `counted` TINYINT(1) NOT NULL DEFAULT 1,
  `time_hint` DECIMAL(4,1) NULL,
  `url` VARCHAR(300) NULL,
  PRIMARY KEY (`commit_id`),
  UNIQUE KEY `uq_git_commit` (`repo_id`, `sha`),
  KEY `idx_git_commit_author` (`project_id`, `author_user_id`, `authored_at`),
  KEY `idx_git_commit_task` (`task_id`),
  KEY `idx_git_commit_unclaimed` (`project_id`, `author_user_id`, `counted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitBranch` (
  `branch_id` BIGINT NOT NULL AUTO_INCREMENT,
  `repo_id` BIGINT NOT NULL,
  `project_id` BIGINT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `task_id` BIGINT NULL,
  `user_id` BIGINT NULL,
  `created_at` DATETIME NOT NULL,
  `last_commit_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`branch_id`),
  UNIQUE KEY `uq_git_branch` (`repo_id`, `name`),
  KEY `idx_git_branch_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitPullRequest` (
  `pr_id` BIGINT NOT NULL AUTO_INCREMENT,
  `repo_id` BIGINT NOT NULL,
  `project_id` BIGINT NOT NULL,
  `number` INT NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `url` VARCHAR(300) NOT NULL,
  `task_ids` VARCHAR(500) NULL,
  `author_user_id` BIGINT NULL,
  `author_login` VARCHAR(100) NULL,
  `state` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
  `draft` TINYINT(1) NOT NULL DEFAULT 0,
  `review_state` VARCHAR(20) NULL,
  `head_ref` VARCHAR(255) NULL,
  `base_ref` VARCHAR(255) NULL,
  `opened_at` DATETIME NOT NULL,
  `merged_at` DATETIME NULL,
  `closed_at` DATETIME NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`pr_id`),
  UNIQUE KEY `uq_git_pr` (`repo_id`, `number`),
  KEY `idx_git_pr_project` (`project_id`, `state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `GitEditorActivity` (
  `activity_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `project_id` BIGINT NOT NULL,
  `task_id` BIGINT NULL,
  `branch` VARCHAR(255) NOT NULL DEFAULT '',
  `work_date` DATE NOT NULL,
  `minutes` INT NOT NULL DEFAULT 0,
  `source` VARCHAR(12) NOT NULL DEFAULT 'TMCODE',
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`activity_id`),
  UNIQUE KEY `uq_git_editor` (`user_id`, `project_id`, `branch`, `work_date`, `source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `SideProjectReportDraft` (
  `draft_id` BIGINT NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `open_key` VARCHAR(40) NULL,
  `window_from` DATETIME NOT NULL,
  `window_to` DATETIME NOT NULL,
  `did` TEXT NULL,
  `next_steps` TEXT NULL,
  `blockers` TEXT NULL,
  `work_lines` TEXT NULL,
  `hours` DECIMAL(5,1) NULL,
  `commit_count` INT NOT NULL DEFAULT 0,
  `edited` TINYINT(1) NOT NULL DEFAULT 0,
  `ai_polished` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(12) NOT NULL DEFAULT 'OPEN',
  `update_id` BIGINT NULL,
  `notified_at` DATETIME NULL,
  `auto_submitted` TINYINT(1) NOT NULL DEFAULT 0,
  `refreshed_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  `submitted_at` DATETIME NULL,
  PRIMARY KEY (`draft_id`),
  UNIQUE KEY `uq_sp_draft_open` (`open_key`),
  KEY `idx_sp_draft_user` (`user_id`, `status`),
  KEY `idx_sp_draft_project` (`project_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
