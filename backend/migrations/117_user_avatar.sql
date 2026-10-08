-- 117: Central profile picture.
--
--   User.avatar_version   NULL = no picture. Otherwise the unix time (seconds) the
--                         current picture was uploaded. The three renditions live on
--                         the file-server at nga_central_mis/avatars/<user_id>/<v>-<size>.webp
--                         and every app links to them through signed, versioned URLs
--                         (services/avatar/urls.ts), so a new upload busts every cache.
--
-- No new capability: users manage their own picture, MANAGE_USERS manages anyone's.
-- Idempotent; MySQL 5.7 and 8.

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND COLUMN_NAME = 'avatar_version');
SET @sql := IF(@col = 0, 'ALTER TABLE `User` ADD COLUMN `avatar_version` INT UNSIGNED NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
