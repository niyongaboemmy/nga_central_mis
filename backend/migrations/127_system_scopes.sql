-- 127: System.scopes -- what a System's Basic client credentials may do
-- (MULTI_TENANCY_GAP_FIX_PLAN.md Phase 0 item 5, [MIS-A11]).
-- @tenant: generic
--
-- Until now a System's client id + secret was granted every service scope it
-- asked for. NULL keeps that legacy meaning; a comma list is enforced by
-- middleware/serviceAuth.ts. Every existing System is backfilled to the full
-- list of scopes the code uses today (src/tenancy/systemScopes.ts
-- KNOWN_SERVICE_SCOPES), so nothing changes until an operator narrows a list.
--
-- Idempotent; MySQL 5.7 and 8 (guarded ADD COLUMN via information_schema).

SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'System' AND COLUMN_NAME = 'scopes');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE `System` ADD COLUMN `scopes` VARCHAR(500) NULL DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `System`
SET `scopes` = 'access:publish,access:read,activity:write,ai-gateway:invoke,ai-policy:read,competency:write,early-warning:write,learning-events:write,mentorship:read,profiles:read,reminders:write,sync:read,tenants:read'
WHERE `scopes` IS NULL;
