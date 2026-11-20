-- 145: Grade.rqf_level -- the RQF level of a grade's learners. TVET report cards print
-- "QUALIFICATION TITLE: Level <n>" from the learner's class grade. Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Grade' AND COLUMN_NAME = 'rqf_level') > 0,
  'SELECT 1', 'ALTER TABLE `Grade` ADD COLUMN `rqf_level` TINYINT UNSIGNED NULL AFTER `level_order`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
