-- 123: "My AI" — users' own AI provider keys and what each one answers
-- (PERSONAL_AI_PROVIDERS_PLAN.md §5.1–5.2).
--
--   AiCredential  one row per key or connected account. The secret is envelope-encrypted
--                 (services/secrets/vault.ts): the ciphertext, its nonce and tag, the data
--                 key wrapped by the key-encryption key, and which KEK version wrapped it.
--                 owner_user_id NULL is reserved for school credentials managed in the UI.
--                 Only key_hint ("sk-…a1F9") is ever shown again.
--   AiRoute       a user's "what answers what" matrix: (app, task) -> credential + model.
--                 '*' means any app / any task; the most specific row wins.
--
-- Deleting a key deletes its routes (FK cascade) and the ciphertext itself (hard delete).
-- Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `AiCredential` (
  `credential_id` BIGINT NOT NULL AUTO_INCREMENT,
  `owner_user_id` BIGINT NULL,
  `provider` VARCHAR(30) NOT NULL,
  `auth_type` VARCHAR(20) NOT NULL DEFAULT 'api_key',
  `label` VARCHAR(80) NOT NULL,
  `base_url` VARCHAR(255) NULL,
  `secret_ct` VARBINARY(2048) NOT NULL,
  `secret_nonce` VARBINARY(16) NOT NULL,
  `secret_tag` VARBINARY(16) NOT NULL,
  `wrapped_dek` VARBINARY(64) NOT NULL,
  `dek_nonce` VARBINARY(16) NOT NULL,
  `dek_tag` VARBINARY(16) NOT NULL,
  `kek_version` SMALLINT NOT NULL,
  `key_hint` VARCHAR(16) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `status_detail` VARCHAR(255) NULL,
  `allowed_apps` JSON NULL,
  `daily_request_cap` INT NULL,
  `free_only` TINYINT NOT NULL DEFAULT 0,
  `models_cache` JSON NULL,
  `balance` JSON NULL,
  `last_validated_at` DATETIME NULL,
  `last_used_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`credential_id`),
  KEY `idx_ai_credential_owner` (`owner_user_id`, `status`),
  KEY `idx_ai_credential_provider` (`provider`)
);

CREATE TABLE IF NOT EXISTS `AiRoute` (
  `route_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `app` VARCHAR(10) NOT NULL,
  `task` VARCHAR(12) NOT NULL,
  `credential_id` BIGINT NOT NULL,
  `model` VARCHAR(120) NOT NULL,
  `fallback` VARCHAR(10) NOT NULL DEFAULT 'school',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`route_id`),
  UNIQUE KEY `uq_ai_route` (`user_id`, `app`, `task`),
  KEY `idx_ai_route_credential` (`credential_id`),
  CONSTRAINT `fk_ai_route_credential` FOREIGN KEY (`credential_id`) REFERENCES `AiCredential` (`credential_id`) ON DELETE CASCADE
);
