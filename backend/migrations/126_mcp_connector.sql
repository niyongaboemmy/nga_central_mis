-- 126: the NGA connector (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3.1, EXTERNAL_AI_CONTRACT.md §2).
-- The MIS is an OAuth 2.1 authorization server for MCP clients (people's own Claude /
-- ChatGPT) and hosts the only MCP endpoint, https://api.amashuri.com/mcp.
--
--   OAuthClient    a registered MCP client. Public clients come from dynamic registration
--                  (RFC 7591) with PKCE; confidential ones (ChatGPT workspaces) are created by
--                  scripts/create-mcp-client.ts. Only the secret's SHA-256 is stored.
--   OAuthAuthCode  one-time authorization codes (10 minutes), bound to user, client,
--                  redirect URI, scopes, resource and the PKCE challenge. Hash only.
--   OAuthToken     access (1 h) and refresh (30 days, rotated) tokens. Hash only. family_id
--                  ties a refresh chain together so a replayed refresh token or a replayed
--                  code revokes the whole chain. token_version is the user's at issue time.
--   McpAuditLog    every tools/call: who, which client, which tool, ok / error code,
--                  duration. Never arguments or results.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS); MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `OAuthClient` (
  `client_id` VARCHAR(64) NOT NULL,
  `client_secret_hash` CHAR(64) NULL,
  `client_name` VARCHAR(120) NOT NULL,
  `client_uri` VARCHAR(255) NULL,
  `redirect_uris` JSON NOT NULL,
  `token_endpoint_auth_method` VARCHAR(30) NOT NULL DEFAULT 'none',
  `registration_type` VARCHAR(10) NOT NULL DEFAULT 'dynamic',
  `created_by` BIGINT NULL,
  `status` VARCHAR(10) NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`),
  KEY `idx_oauth_client_created` (`created_at`)
);

CREATE TABLE IF NOT EXISTS `OAuthAuthCode` (
  `code_hash` CHAR(64) NOT NULL,
  `client_id` VARCHAR(64) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `redirect_uri` VARCHAR(500) NOT NULL,
  `scope` VARCHAR(200) NOT NULL,
  `resource` VARCHAR(255) NOT NULL,
  `code_challenge` VARCHAR(128) NOT NULL,
  `family_id` CHAR(32) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code_hash`),
  KEY `idx_oauth_code_expires` (`expires_at`)
);

CREATE TABLE IF NOT EXISTS `OAuthToken` (
  `token_id` BIGINT NOT NULL AUTO_INCREMENT,
  `token_hash` CHAR(64) NOT NULL,
  `kind` VARCHAR(10) NOT NULL,
  `client_id` VARCHAR(64) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `scope` VARCHAR(200) NOT NULL,
  `resource` VARCHAR(255) NOT NULL,
  `family_id` CHAR(32) NOT NULL,
  `token_version` INT NOT NULL DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL,
  `last_used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `uq_oauth_token_hash` (`token_hash`),
  KEY `idx_oauth_token_user` (`user_id`, `client_id`, `revoked_at`),
  KEY `idx_oauth_token_family` (`family_id`)
);

CREATE TABLE IF NOT EXISTS `McpAuditLog` (
  `audit_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `client_id` VARCHAR(64) NOT NULL,
  `tool_name` VARCHAR(80) NOT NULL,
  `ok` TINYINT NOT NULL,
  `error_code` VARCHAR(40) NULL,
  `duration_ms` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_mcp_audit_user` (`user_id`, `created_at`),
  KEY `idx_mcp_audit_time` (`created_at`)
);
