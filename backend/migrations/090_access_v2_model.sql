-- Migration 090: Access control v2, Phase 1 -- data model.
-- (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §4)
--
-- Additive only: existing Role / Permission / RolePermission / UserRole keep
-- working exactly as before. Nothing reads the new columns/tables until the
-- access engine (services/access) is switched on.
--
-- Idempotent: every ALTER is guarded through information_schema (the same
-- SET/PREPARE pattern as 065, which works both through `npm run migrate` and
-- piped into the mysql client on the server), every CREATE uses IF NOT EXISTS.

-- 1) Capability registry: Permission rows gain app + metadata.
--    MIS rows keep their existing names (app = 'mis'); satellite capabilities
--    are registered as '<app>:<KEY>' when each app publishes its manifest.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'app') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `app` VARCHAR(30) NOT NULL DEFAULT ''mis''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'cap_key') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `cap_key` VARCHAR(100) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'label') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `label` VARCHAR(150) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'domain') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `domain` VARCHAR(40) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'kind') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `kind` ENUM(''READ'',''WRITE'') NOT NULL DEFAULT ''WRITE''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'depths') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `depths` VARCHAR(40) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'restricted') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `restricted` TINYINT(1) NOT NULL DEFAULT 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'scopeable') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `scopeable` TINYINT(1) NOT NULL DEFAULT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND COLUMN_NAME = 'deprecated_at') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD COLUMN `deprecated_at` DATETIME NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
UPDATE `Permission` SET `cap_key` = `name` WHERE `cap_key` IS NULL AND `app` = 'mis';
SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Permission' AND INDEX_NAME = 'uq_perm_app_key') > 0, 'SELECT 1',
  'ALTER TABLE `Permission` ADD UNIQUE KEY `uq_perm_app_key` (`app`, `cap_key`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2) Roles become editable templates.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'preset_key') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `preset_key` VARCHAR(60) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'school_id') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `school_id` BIGINT NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'category') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `category` VARCHAR(40) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'allowed_scope_types') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `allowed_scope_types` VARCHAR(200) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'max_holders') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `max_holders` INT NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'platform_only') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `platform_only` TINYINT(1) NOT NULL DEFAULT 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'is_preset') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `is_preset` TINYINT(1) NOT NULL DEFAULT 0');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'version') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `version` INT NOT NULL DEFAULT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND COLUMN_NAME = 'updated_at') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD COLUMN `updated_at` DATETIME NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Role' AND INDEX_NAME = 'uq_role_preset_key') > 0, 'SELECT 1',
  'ALTER TABLE `Role` ADD UNIQUE KEY `uq_role_preset_key` (`preset_key`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) Depth per role capability (NULL for WRITE capabilities).
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'RolePermission' AND COLUMN_NAME = 'depth') > 0, 'SELECT 1',
  'ALTER TABLE `RolePermission` ADD COLUMN `depth` ENUM(''summary'',''detail'',''sensitive'') NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 4) Freshness: bumped on every change that alters a user's effective access.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND COLUMN_NAME = 'access_version') > 0, 'SELECT 1',
  'ALTER TABLE `User` ADD COLUMN `access_version` INT NOT NULL DEFAULT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5) Grants: user x role x hierarchy node x validity.
CREATE TABLE IF NOT EXISTS `AccessGrant` (
  `grant_id`          BIGINT NOT NULL AUTO_INCREMENT,
  `user_id`           BIGINT NOT NULL,
  `role_id`           BIGINT NOT NULL,
  `school_id`         BIGINT NOT NULL DEFAULT 1,
  `scope_type`        ENUM('PLATFORM','SCHOOL','PROGRAM','DEPARTMENT','GRADE','CLASS_GROUP',
                           'SUBJECT_CLASS','MENTEES','CHILDREN','SELF') NOT NULL,
  `scope_id`          BIGINT NULL,
  `scope_id2`         BIGINT NULL,
  `academic_year_id`  BIGINT NULL,
  `valid_from`        DATE NULL,
  `valid_until`       DATE NULL,
  `title`             VARCHAR(150) NULL,
  `justification`     VARCHAR(500) NULL,
  `source`            ENUM('MANUAL','RULE','MIGRATION') NOT NULL,
  `rule_id`           BIGINT NULL,
  `source_ref`        VARCHAR(120) NULL,
  `status`            ENUM('ACTIVE','SUSPENDED','ENDED') NOT NULL DEFAULT 'ACTIVE',
  `granted_by`        BIGINT NULL,
  `granted_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_by`          BIGINT NULL,
  `ended_at`          DATETIME NULL,
  `end_reason`        VARCHAR(255) NULL,
  `last_certified_at` DATETIME NULL,
  `certified_by`      BIGINT NULL,
  PRIMARY KEY (`grant_id`),
  KEY `ix_grant_user` (`user_id`, `status`),
  KEY `ix_grant_scope` (`scope_type`, `scope_id`),
  KEY `ix_grant_role` (`role_id`),
  UNIQUE KEY `uq_grant_rule_source` (`rule_id`, `source_ref`),
  CONSTRAINT `fk_grant_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6) Auto-assignment rules: placement -> role at the placement's node.
CREATE TABLE IF NOT EXISTS `AccessRule` (
  `rule_id`        BIGINT NOT NULL AUTO_INCREMENT,
  `rule_key`       VARCHAR(60) NULL,
  `school_id`      BIGINT NOT NULL DEFAULT 1,
  `name`           VARCHAR(150) NOT NULL,
  `trigger_type`   ENUM('PERSONA','CLASS_TEACHER','SUBJECT_TEACHER','PROGRAM_LEAD',
                        'MENTOR','PARENT') NOT NULL,
  `trigger_filter` TEXT NULL,
  `role_id`        BIGINT NOT NULL,
  `status`         ENUM('ACTIVE','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  `created_by`     BIGINT NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NULL,
  PRIMARY KEY (`rule_id`),
  UNIQUE KEY `uq_rule_key` (`rule_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7) Departments (Head-of-Department scope).
CREATE TABLE IF NOT EXISTS `Department` (
  `department_id` BIGINT NOT NULL AUTO_INCREMENT,
  `school_id`     BIGINT NOT NULL DEFAULT 1,
  `code`          VARCHAR(40) NOT NULL,
  `name`          VARCHAR(150) NOT NULL,
  `status`        ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `uq_department_school_code` (`school_id`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `DepartmentSubject` (
  `department_id` BIGINT NOT NULL,
  `subject_id`    BIGINT NOT NULL,
  PRIMARY KEY (`department_id`, `subject_id`),
  UNIQUE KEY `uq_department_subject_one` (`subject_id`),
  CONSTRAINT `fk_deptsubj_department` FOREIGN KEY (`department_id`) REFERENCES `Department` (`department_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_deptsubj_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8) Audit of every access change and of restricted reads reported by apps.
CREATE TABLE IF NOT EXISTS `AccessAudit` (
  `audit_id`        BIGINT NOT NULL AUTO_INCREMENT,
  `actor_id`        BIGINT NULL,
  `subject_user_id` BIGINT NULL,
  `action`          VARCHAR(60) NOT NULL,
  `target`          TEXT NULL,
  `before_json`     TEXT NULL,
  `after_json`      TEXT NULL,
  `reason`          VARCHAR(500) NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `ix_audit_subject` (`subject_user_id`),
  KEY `ix_audit_action` (`action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9) Latest capability manifest published by each app.
CREATE TABLE IF NOT EXISTS `AccessManifest` (
  `app`          VARCHAR(30) NOT NULL,
  `version`      VARCHAR(40) NULL,
  `checksum`     CHAR(64) NOT NULL,
  `manifest`     MEDIUMTEXT NOT NULL,
  `published_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`app`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10) Each preset (role, capability) link is applied at most once, so a link
--     leadership later removes in Access Studio is never silently re-added.
CREATE TABLE IF NOT EXISTS `AccessPresetLink` (
  `preset_key`  VARCHAR(60) NOT NULL,
  `perm_name`   VARCHAR(150) NOT NULL,
  `applied_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`preset_key`, `perm_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

