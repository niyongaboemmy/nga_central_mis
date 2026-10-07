-- 111: NGA Desktop update outcomes (nga-desktop NEXT_FEATURES_ANALYSIS §2.1).
--
--   DesktopInstall.last_update_*  what happened to the last update this install
--                                 tried: downloaded / installed / failed (+ why),
--                                 so stuck lab PCs show up on the /apps page.
-- Idempotent; MySQL 5.7 and 8.

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'DesktopInstall' AND COLUMN_NAME = 'last_update_outcome');
SET @sql := IF(@col = 0, 'ALTER TABLE `DesktopInstall` ADD COLUMN `last_update_to` VARCHAR(32) NULL, ADD COLUMN `last_update_outcome` VARCHAR(16) NULL, ADD COLUMN `last_update_error` VARCHAR(255) NULL, ADD COLUMN `last_update_at` DATETIME NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
