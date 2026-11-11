-- Control plane (MULTI_TENANCY_GAP_FIX_PLAN.md Phase 1). Runs against the
-- PLATFORM_DB_NAME database (default `amashuri_platform`), never a tenant DB.
--
--   Tenant            one row per school. Tenant 1 = NGA = the primary tenant, whose
--                     existing database (env DB_NAME, prod `ngarw_mis`) is used in place.
--   AccountDirectory  email/username -> (tenant, user) so sign-in can find the school.
--   TenantSystem      which System (SSO client, still stored in the primary tenant DB:
--                     System.system_id) a tenant may open. The primary tenant is
--                     implicitly assigned every System.
--   TenantMigration   per-tenant ledger of backend/migrations/*.sql files.
--   PlatformAudit     actions taken on tenants by platform operators.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS); MySQL 5.7 and 8 (no CHECK constraints).

CREATE TABLE IF NOT EXISTS `Tenant` (
  `tenant_id` BIGINT NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(60) NOT NULL,
  `display_name` VARCHAR(150) NOT NULL,
  `legal_name` VARCHAR(200) NULL,
  `status` ENUM('PENDING','ACTIVE','GRACE','SUSPENDED','ARCHIVED') NOT NULL DEFAULT 'PENDING',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `package_code` VARCHAR(30) NOT NULL DEFAULT 'starter',
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Africa/Kigali',
  `country` VARCHAR(2) NULL,
  `mis_db_name` VARCHAR(64) NULL,
  `tm_db_name` VARCHAR(64) NULL,
  `tendo_db_path` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `activated_at` DATETIME NULL,
  `suspended_at` DATETIME NULL,
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `uq_tenant_slug` (`slug`),
  UNIQUE KEY `uq_tenant_mis_db` (`mis_db_name`),
  KEY `idx_tenant_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AccountDirectory` (
  `entry_id` BIGINT NOT NULL AUTO_INCREMENT,
  `email_norm` VARCHAR(191) NULL,
  `username_norm` VARCHAR(191) NULL,
  `tenant_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `kind` ENUM('STAFF','STUDENT','PARENT') NOT NULL DEFAULT 'STAFF',
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`entry_id`),
  UNIQUE KEY `uq_directory_tenant_user` (`tenant_id`, `user_id`),
  UNIQUE KEY `uq_directory_email_tenant` (`email_norm`, `tenant_id`),
  KEY `idx_directory_username` (`username_norm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TenantSystem` (
  `tenant_id` BIGINT NOT NULL,
  `system_id` BIGINT NOT NULL,
  `status` ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `source` ENUM('PACKAGE','OVERRIDE') NOT NULL DEFAULT 'OVERRIDE',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `system_id`),
  KEY `idx_tenant_system_system` (`system_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TenantMigration` (
  `tenant_id` BIGINT NOT NULL,
  `app` VARCHAR(20) NOT NULL,
  `file` VARCHAR(191) NOT NULL,
  `checksum` CHAR(64) NOT NULL,
  `outcome` ENUM('APPLIED','SKIPPED','BASELINED') NOT NULL DEFAULT 'APPLIED',
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `app`, `file`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PlatformAudit` (
  `audit_id` BIGINT NOT NULL AUTO_INCREMENT,
  `actor_tid` BIGINT NULL,
  `actor_user_id` BIGINT NULL,
  `action` VARCHAR(80) NOT NULL,
  `target_tid` BIGINT NULL,
  `payload` JSON NULL,
  `ip` VARCHAR(64) NULL,
  `at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_platform_audit_target` (`target_tid`, `at`),
  KEY `idx_platform_audit_action` (`action`, `at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ledger of the files in this folder (the bootstrap records each one it runs).
CREATE TABLE IF NOT EXISTS `PlatformMigration` (
  `file` VARCHAR(191) NOT NULL,
  `checksum` CHAR(64) NOT NULL,
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`file`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
