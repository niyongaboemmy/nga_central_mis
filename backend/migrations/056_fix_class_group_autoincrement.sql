-- Fix ClassGroup table to add AUTO_INCREMENT on class_group_id.
-- The table was missing this constraint (same drift as AcademicYear,
-- see migration 040), which caused every INSERT to fail with
-- "Field 'class_group_id' doesn't have a default value" once no
-- explicit id was supplied. Foreign key checks must be disabled
-- temporarily because other tables (e.g. TeacherSubjectAssignment,
-- StudentClassGroup) reference this column.

SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE `ClassGroup`
  MODIFY `class_group_id` BIGINT(20) NOT NULL AUTO_INCREMENT;

SET FOREIGN_KEY_CHECKS=1;
