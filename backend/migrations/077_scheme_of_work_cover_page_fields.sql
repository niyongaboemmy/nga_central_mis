-- ============================================
-- Scheme of Work: cover-page fields for the printed/PDF report
-- ============================================
-- The correct Scheme of Work template's cover page needs several fields
-- that vary per subject/programme offering (sector, trade, qualification,
-- RQF level, module code, learning hours/week, number of classes, the
-- document date, and the approver's name/title). These don't already
-- exist on Subject/ClassGroup/School, and they're per-offering rather
-- than per-school, so they belong on SchemeOfWork itself.
--
-- Trainer name, class name, school year and term are already derivable
-- via existing FKs (user_id, class_group_id, academic_term_id) and are
-- joined at render time rather than duplicated here.
--
-- All columns are nullable/defaulted -- existing schemes render "N/A" /
-- blank for these on the PDF until a teacher/admin fills them in via the
-- new cover-page editor; no backfill of old hardcoded report literals.

ALTER TABLE `SchemeOfWork`
  ADD COLUMN `sector` VARCHAR(100) DEFAULT NULL,
  ADD COLUMN `trade` VARCHAR(150) DEFAULT NULL,
  ADD COLUMN `qualification_title` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN `rqf_level` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `module_code` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `learning_hours_per_week` INT DEFAULT NULL,
  ADD COLUMN `number_of_classes` INT DEFAULT NULL,
  ADD COLUMN `scheme_date` DATE DEFAULT NULL,
  ADD COLUMN `approver_name` VARCHAR(150) DEFAULT NULL,
  ADD COLUMN `approver_title` VARCHAR(150) DEFAULT NULL,
  ADD COLUMN `trainer_signed` TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN `approver_signed` TINYINT NOT NULL DEFAULT 0;
