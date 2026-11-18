-- 137: Side projects -- the owner's position on their own project.
--   Teammates keep their position on SideProjectMember (role_key, role_title, responsibilities);
--   the owner has no member row, so their custom position lives on the project.
--   SideProject.owner_role_title        e.g. "Project manager"; NULL shows "Team lead"
--   SideProject.owner_responsibilities  what the owner looks after
-- Idempotent; MySQL 5.7 and 8.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'owner_role_title') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `owner_role_title` VARCHAR(60) NULL AFTER `team_mode`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'owner_responsibilities') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `owner_responsibilities` VARCHAR(1000) NULL AFTER `owner_role_title`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
