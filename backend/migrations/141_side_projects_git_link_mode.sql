-- 141: Side projects -- connect a GitHub repository with its link (no GitHub App needed).
--
--   GitRepoLink.access_mode   APP (the NGA Projects app, webhooks) | LINK (polled with the GitHub
--                             API: public repositories as they are, private ones with a read-only
--                             fine-grained token).
--   GitRepoLink.token_sealed  the private repository's token, sealed by the key vault (JSON), never
--                             returned to the browser; token_hint shows its last characters.
--   GitRepoLink.sync_state    what the last poll saw (branch heads, ETags, pull request times);
--   GitRepoLink.synced_at / sync_error  when it last synced and why it couldn't.
--   GitIdentity.source        OAUTH (Connect GitHub) | CLAIM (the person typed their username).
-- Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitRepoLink' AND COLUMN_NAME = 'access_mode') > 0,
  'SELECT 1', 'ALTER TABLE `GitRepoLink` ADD COLUMN `access_mode` VARCHAR(8) NOT NULL DEFAULT ''APP'' AFTER `installation_id`, ADD COLUMN `token_sealed` TEXT NULL AFTER `access_mode`, ADD COLUMN `token_hint` VARCHAR(20) NULL AFTER `token_sealed`, ADD COLUMN `sync_state` MEDIUMTEXT NULL AFTER `reconciled_at`, ADD COLUMN `synced_at` DATETIME NULL AFTER `sync_state`, ADD COLUMN `sync_error` VARCHAR(300) NULL AFTER `synced_at`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitRepoLink' AND INDEX_NAME = 'idx_git_link_sync') > 0,
  'SELECT 1', 'ALTER TABLE `GitRepoLink` ADD KEY `idx_git_link_sync` (`status`, `access_mode`, `synced_at`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitIdentity' AND COLUMN_NAME = 'source') > 0,
  'SELECT 1', 'ALTER TABLE `GitIdentity` ADD COLUMN `source` VARCHAR(8) NOT NULL DEFAULT ''OAUTH'' AFTER `prefs`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
