-- Tenant management (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §5): packages and
-- entitlements, self-registration, review, invoicing and manual payments,
-- provisioning runs, subscriptions, usage, support sessions, platform settings.
--
-- Control plane only (PLATFORM_DB_NAME). Idempotent; MySQL 5.7 and 8 (no CHECK
-- constraints, no reserved bare names). Seeds the four packages (prices NULL =
-- not set yet) and puts the primary tenant on Max.

CREATE TABLE IF NOT EXISTS `Package` (
  `code` VARCHAR(30) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `tier` TINYINT NOT NULL DEFAULT 0,
  `tagline` VARCHAR(160) NULL,
  `description` TEXT NULL,
  `accent` VARCHAR(20) NULL,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `price_term_rwf` INT NULL,
  `price_year_rwf` INT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'RWF',
  `updated_by` BIGINT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- value_int NULL = enabled / unlimited (APP, FEATURE, or an unlimited LIMIT).
CREATE TABLE IF NOT EXISTS `PackageEntitlement` (
  `package_code` VARCHAR(30) NOT NULL,
  `ent_key` VARCHAR(80) NOT NULL,
  `kind` ENUM('APP','FEATURE','LIMIT') NOT NULL,
  `value_int` BIGINT NULL,
  PRIMARY KEY (`package_code`, `ent_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TenantEntitlementOverride` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL,
  `ent_key` VARCHAR(80) NOT NULL,
  `value_int` BIGINT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `reason` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NULL,
  `granted_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_override_tenant` (`tenant_id`, `ent_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ApplicantAccount` (
  `account_id` BIGINT NOT NULL AUTO_INCREMENT,
  `email_norm` VARCHAR(191) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(40) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `email_verified_at` DATETIME NULL,
  `otp_hash` CHAR(64) NULL,
  `otp_expires_at` DATETIME NULL,
  `otp_attempts` TINYINT NOT NULL DEFAULT 0,
  `status` ENUM('ACTIVE','LOCKED','CONVERTED') NOT NULL DEFAULT 'ACTIVE',
  `tenant_id` BIGINT NULL,
  `token_version` INT NOT NULL DEFAULT 0,
  `last_login_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uq_applicant_email` (`email_norm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TenantApplication` (
  `application_id` BIGINT NOT NULL AUTO_INCREMENT,
  `ref` VARCHAR(20) NULL,
  `account_id` BIGINT NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  `school_name` VARCHAR(150) NOT NULL,
  `school_type` VARCHAR(20) NULL,
  `country` VARCHAR(2) NULL DEFAULT 'RW',
  `province` VARCHAR(60) NULL,
  `district` VARCHAR(60) NULL,
  `sector` VARCHAR(60) NULL,
  `address` VARCHAR(255) NULL,
  `school_phone` VARCHAR(40) NULL,
  `school_email` VARCHAR(191) NULL,
  `website` VARCHAR(191) NULL,
  `est_students` INT NULL,
  `est_staff` INT NULL,
  `requested_package` VARCHAR(30) NULL,
  `approved_package` VARCHAR(30) NULL,
  `billing_cycle` ENUM('TERM','YEAR') NOT NULL DEFAULT 'TERM',
  `desired_slug` VARCHAR(60) NULL,
  `requested_apps` JSON NULL,
  `notes` TEXT NULL,
  `terms_accepted_at` DATETIME NULL,
  `assigned_to` BIGINT NULL,
  `submitted_at` DATETIME NULL,
  `decided_by` BIGINT NULL,
  `decided_at` DATETIME NULL,
  `decision_reason` TEXT NULL,
  `expires_at` DATETIME NULL,
  `tenant_id` BIGINT NULL,
  `last_activity_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`application_id`),
  UNIQUE KEY `uq_application_ref` (`ref`),
  KEY `idx_application_account` (`account_id`),
  KEY `idx_application_status` (`status`, `submitted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ApplicationEvent` (
  `event_id` BIGINT NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT NOT NULL,
  `from_status` VARCHAR(30) NULL,
  `to_status` VARCHAR(30) NULL,
  `kind` VARCHAR(40) NOT NULL DEFAULT 'STATUS',
  `actor_kind` ENUM('APPLICANT','PLATFORM','SYSTEM') NOT NULL,
  `actor_id` BIGINT NULL,
  `message` TEXT NULL,
  `visible_to_applicant` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `idx_app_event_app` (`application_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- is_internal = 1: a platform-only note (never shown to the applicant).
CREATE TABLE IF NOT EXISTS `ApplicationMessage` (
  `message_id` BIGINT NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT NOT NULL,
  `author_kind` ENUM('APPLICANT','PLATFORM','SYSTEM') NOT NULL,
  `author_id` BIGINT NULL,
  `author_name` VARCHAR(150) NULL,
  `body` TEXT NOT NULL,
  `attachment_file` VARCHAR(255) NULL,
  `is_internal` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` DATETIME NULL,
  PRIMARY KEY (`message_id`),
  KEY `idx_app_message_app` (`application_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ApplicationDocument` (
  `doc_id` BIGINT NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT NOT NULL,
  `kind` ENUM('REGISTRATION_CERT','AUTHORISATION_LETTER','LOGO','OTHER') NOT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NULL,
  `mime` VARCHAR(100) NULL,
  `size_bytes` INT NULL,
  `status` ENUM('PENDING','ACCEPTED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewer_note` VARCHAR(255) NULL,
  `reviewed_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`doc_id`),
  KEY `idx_app_doc_app` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ReviewChecklistItem` (
  `application_id` BIGINT NOT NULL,
  `item_key` VARCHAR(60) NOT NULL,
  `checked_by` BIGINT NULL,
  `checked_at` DATETIME NULL,
  `note` VARCHAR(255) NULL,
  PRIMARY KEY (`application_id`, `item_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Subscription` (
  `subscription_id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL,
  `package_code` VARCHAR(30) NOT NULL,
  `billing_cycle` ENUM('TERM','YEAR') NOT NULL DEFAULT 'TERM',
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `status` ENUM('PENDING','ACTIVE','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `invoice_id` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`subscription_id`),
  KEY `idx_subscription_tenant` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- kind: NEW (from an application), RENEWAL, CHANGE (upgrade / downgrade).
CREATE TABLE IF NOT EXISTS `Invoice` (
  `invoice_id` BIGINT NOT NULL AUTO_INCREMENT,
  `number` VARCHAR(20) NULL,
  `kind` ENUM('NEW','RENEWAL','CHANGE') NOT NULL DEFAULT 'NEW',
  `application_id` BIGINT NULL,
  `tenant_id` BIGINT NULL,
  `package_code` VARCHAR(30) NOT NULL,
  `billing_cycle` ENUM('TERM','YEAR') NOT NULL DEFAULT 'TERM',
  `period_start` DATE NULL,
  `period_end` DATE NULL,
  `amount` INT NOT NULL DEFAULT 0,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'RWF',
  `status` ENUM('DRAFT','ISSUED','PAID','VOID','OVERDUE') NOT NULL DEFAULT 'DRAFT',
  `issued_at` DATETIME NULL,
  `due_at` DATETIME NULL,
  `paid_at` DATETIME NULL,
  `pdf_path` VARCHAR(255) NULL,
  `lines` JSON NULL,
  `notes` TEXT NULL,
  `created_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`invoice_id`),
  UNIQUE KEY `uq_invoice_number` (`number`),
  KEY `idx_invoice_application` (`application_id`),
  KEY `idx_invoice_tenant` (`tenant_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Payment` (
  `payment_id` BIGINT NOT NULL AUTO_INCREMENT,
  `invoice_id` BIGINT NOT NULL,
  `method` ENUM('MOMO','AIRTEL_MONEY','BANK_TRANSFER','CASH','OTHER') NOT NULL,
  `payer_reference` VARCHAR(120) NULL,
  `amount` INT NOT NULL DEFAULT 0,
  `paid_at` DATE NULL,
  `proof_file` VARCHAR(255) NULL,
  `submitted_by_kind` ENUM('APPLICANT','TENANT','PLATFORM') NOT NULL,
  `submitted_by_id` BIGINT NULL,
  `status` ENUM('SUBMITTED','CONFIRMED','REJECTED') NOT NULL DEFAULT 'SUBMITTED',
  `is_waiver` TINYINT(1) NOT NULL DEFAULT 0,
  `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME NULL,
  `review_note` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`),
  KEY `idx_payment_invoice` (`invoice_id`),
  KEY `idx_payment_status` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PaymentInstruction` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `method` ENUM('MOMO','AIRTEL_MONEY','BANK_TRANSFER','CASH','OTHER') NOT NULL,
  `label` VARCHAR(100) NOT NULL,
  `details` VARCHAR(500) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ProvisioningRun` (
  `run_id` BIGINT NOT NULL AUTO_INCREMENT,
  `application_id` BIGINT NULL,
  `tenant_id` BIGINT NULL,
  `status` ENUM('PENDING','RUNNING','DONE','FAILED') NOT NULL DEFAULT 'PENDING',
  `attempt` INT NOT NULL DEFAULT 1,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`run_id`),
  KEY `idx_provision_application` (`application_id`),
  KEY `idx_provision_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ProvisioningStep` (
  `run_id` BIGINT NOT NULL,
  `step_key` VARCHAR(40) NOT NULL,
  `seq` TINYINT NOT NULL DEFAULT 0,
  `status` ENUM('PENDING','RUNNING','DONE','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  `log` TEXT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  PRIMARY KEY (`run_id`, `step_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TenantUsageDaily` (
  `tenant_id` BIGINT NOT NULL,
  `day` DATE NOT NULL,
  `students` INT NOT NULL DEFAULT 0,
  `staff` INT NOT NULL DEFAULT 0,
  `storage_mb` INT NOT NULL DEFAULT 0,
  `ai_requests` INT NOT NULL DEFAULT 0,
  `code_runs` INT NOT NULL DEFAULT 0,
  `meeting_minutes` INT NOT NULL DEFAULT 0,
  `active_users` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`tenant_id`, `day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Live per-day counters for the consumable limits (AI requests, code runs, ...).
CREATE TABLE IF NOT EXISTS `TenantUsageCounter` (
  `tenant_id` BIGINT NOT NULL,
  `ent_key` VARCHAR(80) NOT NULL,
  `period` VARCHAR(10) NOT NULL,
  `used` BIGINT NOT NULL DEFAULT 0,
  `warned_at` DATETIME NULL,
  PRIMARY KEY (`tenant_id`, `ent_key`, `period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `PlatformNotificationPref` (
  `user_id` BIGINT NOT NULL,
  `event_key` VARCHAR(60) NOT NULL,
  `email` TINYINT(1) NOT NULL DEFAULT 1,
  `in_app` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_id`, `event_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tenant-granted support access (§6.9). mode READ / WRITE.
CREATE TABLE IF NOT EXISTS `SupportSession` (
  `session_id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL,
  `granted_by` BIGINT NOT NULL,
  `mode` ENUM('READ','WRITE') NOT NULL DEFAULT 'READ',
  `reason` VARCHAR(255) NULL,
  `starts_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL,
  `opened_by` BIGINT NULL,
  `opened_at` DATETIME NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_support_tenant` (`tenant_id`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Key/value platform settings (§13 windows, auto-issue, separation of duties).
CREATE TABLE IF NOT EXISTS `PlatformSetting` (
  `setting_key` VARCHAR(80) NOT NULL,
  `value_json` JSON NOT NULL,
  `updated_by` BIGINT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Yearly counters behind APP-2026-0001 / INV-2026-0001.
CREATE TABLE IF NOT EXISTS `PlatformSequence` (
  `seq_key` VARCHAR(30) NOT NULL,
  `next_value` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`seq_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tenant columns the management plan needs.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Tenant' AND COLUMN_NAME = 'grace_until');
SET @sql := IF(@col = 0, 'ALTER TABLE `Tenant` ADD COLUMN `grace_until` DATETIME NULL, ADD COLUMN `archived_at` DATETIME NULL, ADD COLUMN `application_id` BIGINT NULL, ADD COLUMN `status_reason` VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed: the four packages (prices are the owner's to set) and their entitlements.
INSERT IGNORE INTO `Package` (`code`, `name`, `tier`, `tagline`, `accent`, `is_public`) VALUES
  ('starter', 'Starter', 1, 'Digital records for a small school', 'sky', 1),
  ('gold', 'Gold', 2, 'The typical secondary / TVET school', 'amber', 1),
  ('premium', 'Premium', 3, 'The full digital school', 'violet', 1),
  ('max', 'Max', 4, 'Large schools and networks', 'emerald', 1);

INSERT IGNORE INTO `PackageEntitlement` (`package_code`, `ent_key`, `kind`, `value_int`) VALUES
  ('starter','app.mis','APP',NULL), ('starter','app.tendo','APP',NULL),
  ('starter','feature.custom_branding.pdf','FEATURE',NULL),
  ('starter','limit.students','LIMIT',300), ('starter','limit.staff','LIMIT',30),
  ('starter','limit.storage_gb','LIMIT',10), ('starter','limit.ai_requests_day','LIMIT',0),
  ('starter','limit.code_runs_day','LIMIT',0), ('starter','limit.tupo_meeting_minutes_month','LIMIT',0),

  ('gold','app.mis','APP',NULL), ('gold','app.tendo','APP',NULL), ('gold','app.taskmentor','APP',NULL),
  ('gold','app.tupo','APP',NULL), ('gold','app.desktop','APP',NULL),
  ('gold','feature.elearning','FEATURE',NULL), ('gold','feature.mentorship','FEATURE',NULL),
  ('gold','feature.reminders.push','FEATURE',NULL), ('gold','feature.custom_branding','FEATURE',NULL),
  ('gold','feature.custom_branding.pdf','FEATURE',NULL),
  ('gold','limit.students','LIMIT',1000), ('gold','limit.staff','LIMIT',80),
  ('gold','limit.storage_gb','LIMIT',30), ('gold','limit.ai_requests_day','LIMIT',200),
  ('gold','limit.code_runs_day','LIMIT',0), ('gold','limit.tupo_meeting_minutes_month','LIMIT',0),

  ('premium','app.mis','APP',NULL), ('premium','app.tendo','APP',NULL), ('premium','app.taskmentor','APP',NULL),
  ('premium','app.tupo','APP',NULL), ('premium','app.desktop','APP',NULL), ('premium','app.tmcode','APP',NULL),
  ('premium','feature.elearning','FEATURE',NULL), ('premium','feature.mentorship','FEATURE',NULL),
  ('premium','feature.ai_lesson_studio','FEATURE',NULL), ('premium','feature.office_hours','FEATURE',NULL),
  ('premium','feature.safeguarding','FEATURE',NULL), ('premium','feature.competency_map','FEATURE',NULL),
  ('premium','feature.reminders.push','FEATURE',NULL), ('premium','feature.reminders.telegram','FEATURE',NULL),
  ('premium','feature.reminders.google_calendar','FEATURE',NULL), ('premium','feature.analytics.advanced','FEATURE',NULL),
  ('premium','feature.tupo.meetings','FEATURE',NULL), ('premium','feature.tupo.feed','FEATURE',NULL),
  ('premium','feature.tm.proctoring','FEATURE',NULL), ('premium','feature.tm.code_runner','FEATURE',NULL),
  ('premium','feature.tm.paper_sheets','FEATURE',NULL), ('premium','feature.custom_branding','FEATURE',NULL),
  ('premium','feature.custom_branding.pdf','FEATURE',NULL), ('premium','feature.tendo.rfid','FEATURE',NULL),
  ('premium','limit.students','LIMIT',2500), ('premium','limit.staff','LIMIT',200),
  ('premium','limit.storage_gb','LIMIT',100), ('premium','limit.ai_requests_day','LIMIT',1000),
  ('premium','limit.code_runs_day','LIMIT',2000), ('premium','limit.tupo_meeting_minutes_month','LIMIT',20000),

  ('max','app.mis','APP',NULL), ('max','app.tendo','APP',NULL), ('max','app.taskmentor','APP',NULL),
  ('max','app.tupo','APP',NULL), ('max','app.desktop','APP',NULL), ('max','app.tmcode','APP',NULL),
  ('max','feature.elearning','FEATURE',NULL), ('max','feature.mentorship','FEATURE',NULL),
  ('max','feature.ai_lesson_studio','FEATURE',NULL), ('max','feature.office_hours','FEATURE',NULL),
  ('max','feature.safeguarding','FEATURE',NULL), ('max','feature.competency_map','FEATURE',NULL),
  ('max','feature.reminders.push','FEATURE',NULL), ('max','feature.reminders.telegram','FEATURE',NULL),
  ('max','feature.reminders.google_calendar','FEATURE',NULL), ('max','feature.analytics.advanced','FEATURE',NULL),
  ('max','feature.tupo.meetings','FEATURE',NULL), ('max','feature.tupo.feed','FEATURE',NULL),
  ('max','feature.tm.proctoring','FEATURE',NULL), ('max','feature.tm.code_runner','FEATURE',NULL),
  ('max','feature.tm.paper_sheets','FEATURE',NULL), ('max','feature.integration_api','FEATURE',NULL),
  ('max','feature.mcp','FEATURE',NULL), ('max','feature.custom_branding','FEATURE',NULL),
  ('max','feature.custom_branding.pdf','FEATURE',NULL), ('max','feature.tendo.rfid','FEATURE',NULL),
  ('max','limit.students','LIMIT',NULL), ('max','limit.staff','LIMIT',NULL),
  ('max','limit.storage_gb','LIMIT',250), ('max','limit.ai_requests_day','LIMIT',3000),
  ('max','limit.code_runs_day','LIMIT',10000), ('max','limit.tupo_meeting_minutes_month','LIMIT',NULL);

UPDATE `Tenant` SET `package_code` = 'max' WHERE `tenant_id` = 1;
