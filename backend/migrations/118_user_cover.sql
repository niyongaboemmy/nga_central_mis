-- 118: Profile cover image (3:1 banner), next to the central profile picture (117).
--
--   User.cover_version   NULL = no cover (apps show the system blue). Otherwise the unix
--                        time of the upload; renditions live on the file-server at
--                        nga_central_mis/covers/<user_id>/<v>-<md|lg>.webp and are linked
--                        through signed, versioned URLs (services/avatar/urls.ts).
--
-- Idempotent; MySQL 5.7 and 8. Apply BEFORE deploying the backend that reads it.

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND COLUMN_NAME = 'cover_version');
SET @sql := IF(@col = 0, 'ALTER TABLE `User` ADD COLUMN `cover_version` INT UNSIGNED NULL', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
