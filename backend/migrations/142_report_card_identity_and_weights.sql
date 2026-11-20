-- 142: What report cards print about the school and weigh each module by.
--
--   School.district            e.g. "Gasabo" (printed as DISTRICT: on TVET report cards)
--   School.head_teacher_name   the head of school's name, printed above the signature
--   Subject.module_weight      the module's weight on TVET report cards (learning hours,
--                              credits x 10: e.g. 30, 60, 80, 100, 120). learning_hours is
--                              a free-text weekly note ("5 per week"), not this.
--
-- sector / trade / qualification_title / contact_email / contact_phone already exist
-- (migration 079). Spokes read the block from GET /schools/profile. Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'School' AND COLUMN_NAME = 'district') > 0,
  'SELECT 1', 'ALTER TABLE `School` ADD COLUMN `district` VARCHAR(100) NULL AFTER `address`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'School' AND COLUMN_NAME = 'head_teacher_name') > 0,
  'SELECT 1', 'ALTER TABLE `School` ADD COLUMN `head_teacher_name` VARCHAR(150) NULL AFTER `qualification_title`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Subject' AND COLUMN_NAME = 'module_weight') > 0,
  'SELECT 1', 'ALTER TABLE `Subject` ADD COLUMN `module_weight` SMALLINT UNSIGNED NULL AFTER `learning_hours`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
