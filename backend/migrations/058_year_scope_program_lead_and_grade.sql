-- Make UserProgramLead (program leadership) and UserGrade (class-teacher of
-- a grade) year-scoped, matching how Subjects/TeacherSubjectAssignment is
-- already scoped to an academic year. Previously these were indefinite
-- assignments with no year dimension at all.
--
-- Existing rows are backfilled to the current academic year (is_current=1),
-- treating "already assigned" as "assigned for the current year" going
-- forward -- these tables only had 1 row each in dev, so this is a safe
-- default; on a database with more historical data this backfill choice
-- should be reviewed before running.

SET FOREIGN_KEY_CHECKS=0;

-- UserProgramLead
ALTER TABLE `UserProgramLead`
  ADD COLUMN `academic_year_id` BIGINT(20) NULL AFTER `program_id`;

UPDATE `UserProgramLead`
SET `academic_year_id` = (SELECT `academic_year_id` FROM `AcademicYear` WHERE `is_current` = 1 LIMIT 1)
WHERE `academic_year_id` IS NULL;

ALTER TABLE `UserProgramLead`
  MODIFY `academic_year_id` BIGINT(20) NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`user_id`, `program_id`, `academic_year_id`),
  ADD CONSTRAINT `userprogramlead_ibfk_year` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`);

-- UserGrade
ALTER TABLE `UserGrade`
  ADD COLUMN `academic_year_id` BIGINT(20) NULL AFTER `grade_id`;

UPDATE `UserGrade`
SET `academic_year_id` = (SELECT `academic_year_id` FROM `AcademicYear` WHERE `is_current` = 1 LIMIT 1)
WHERE `academic_year_id` IS NULL;

ALTER TABLE `UserGrade`
  MODIFY `academic_year_id` BIGINT(20) NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`user_id`, `grade_id`, `academic_year_id`),
  ADD CONSTRAINT `usergrade_ibfk_year` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`);

SET FOREIGN_KEY_CHECKS=1;
