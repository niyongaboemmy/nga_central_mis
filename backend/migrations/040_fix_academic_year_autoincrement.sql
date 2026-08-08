-- Fix AcademicYear table to add AUTO_INCREMENT on academic_year_id
-- The table was missing this constraint. Foreign key checks must be
-- disabled temporarily because other tables (e.g. AcademicCalendar)
-- reference this column.

SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE `AcademicYear`
  MODIFY `academic_year_id` BIGINT(20) NOT NULL AUTO_INCREMENT;

SET FOREIGN_KEY_CHECKS=1;
