-- 136: Side projects -- abstract.
--   SideProject.abstract  A brief summary (40-400 characters) that opens the project, before the
--                         problem statement. Required when a project is created in the app;
--                         optional for imported rows and for projects created before this
--                         migration, whose teams are prompted to add one.
-- Idempotent; MySQL 5.7 and 8.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'abstract') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `abstract` VARCHAR(400) NULL AFTER `title_key`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
