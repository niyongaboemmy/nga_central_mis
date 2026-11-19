-- GitHub App installations -> tenant (GIT_AUTOMATED_REPORTING_ANALYSIS.md §9.2).
--
-- Control plane only (PLATFORM_DB_NAME). GitHub knows nothing of tenants: the one webhook
-- endpoint looks the installation up here, then works in that tenant's database. An
-- installation belongs to exactly one tenant. Idempotent; MySQL 5.7 and 8.
CREATE TABLE IF NOT EXISTS `GitHubInstallationRoute` (
  `installation_id` BIGINT NOT NULL,
  `tenant_id` INT NOT NULL,
  `account_login` VARCHAR(100) NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`installation_id`),
  KEY `idx_gh_route_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
