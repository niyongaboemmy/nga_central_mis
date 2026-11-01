-- 122: AI usage log knows which app asked and whose key answered
-- (PERSONAL_AI_PROVIDERS_PLAN.md §5.3, Phase 0).
--
--   app            which app's feature made the call (mis, desktop, tm, tupo, da)
--   route          'school' (the school's env keys) or 'personal' (a user's own key)
--   credential_id  the user's AiCredential row, for personal calls (table comes later)
--
-- Existing rows are all school calls, so route defaults to 'school'. The school daily
-- quotas count only school rows from here on (limiter.ts), so a teacher's own key never
-- uses up the school's free quota.
--
-- The code tolerates this migration not being applied yet (usageLog.ts / limiter.ts fall
-- back to the old columns), but apply it before deploying anyway.
--
-- Idempotent; MySQL 5.7 and 8.

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AIUsageLog' AND COLUMN_NAME = 'app');
SET @sql := IF(@col = 0, 'ALTER TABLE `AIUsageLog` ADD COLUMN `app` VARCHAR(10) NULL AFTER `feature`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AIUsageLog' AND COLUMN_NAME = 'route');
SET @sql := IF(@col = 0, 'ALTER TABLE `AIUsageLog` ADD COLUMN `route` VARCHAR(10) NOT NULL DEFAULT ''school'' AFTER `provider`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AIUsageLog' AND COLUMN_NAME = 'credential_id');
SET @sql := IF(@col = 0, 'ALTER TABLE `AIUsageLog` ADD COLUMN `credential_id` BIGINT NULL AFTER `route`', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AIUsageLog' AND INDEX_NAME = 'idx_ai_usage_credential');
SET @sql := IF(@idx = 0, 'ALTER TABLE `AIUsageLog` ADD INDEX `idx_ai_usage_credential` (`credential_id`, `occurred_at`)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
