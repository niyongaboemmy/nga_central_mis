-- Tenant operations (MULTI_TENANCY_TENANT_MANAGEMENT_PLAN.md §6.6-§6.8, work package D).
--
-- Control plane only (PLATFORM_DB_NAME). Idempotent; MySQL 5.7 and 8.
--
--   SubscriptionChange  an upgrade / downgrade a school asked for: the CHANGE
--                       invoice that pays for it and when it takes effect (NOW =
--                       once that invoice is paid, NEXT_PERIOD = at the next
--                       renewal). Drives TenantAccount.pendingChange.
--   TenantSetupState    the school's first-run checklist card was dismissed.

CREATE TABLE IF NOT EXISTS `SubscriptionChange` (
  `change_id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL,
  `invoice_id` BIGINT NULL,
  `from_package` VARCHAR(30) NOT NULL,
  `to_package` VARCHAR(30) NOT NULL,
  `billing_cycle` ENUM('TERM','YEAR') NOT NULL DEFAULT 'TERM',
  `effective` ENUM('NOW','NEXT_PERIOD') NOT NULL DEFAULT 'NOW',
  `status` ENUM('PENDING','SCHEDULED','APPLIED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `amount` INT NOT NULL DEFAULT 0,
  `created_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `applied_at` DATETIME NULL,
  PRIMARY KEY (`change_id`),
  KEY `idx_subchange_tenant` (`tenant_id`, `status`),
  KEY `idx_subchange_invoice` (`invoice_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `TenantSetupState` (
  `tenant_id` BIGINT NOT NULL,
  `dismissed_at` DATETIME NULL,
  `dismissed_by` BIGINT NULL,
  PRIMARY KEY (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
