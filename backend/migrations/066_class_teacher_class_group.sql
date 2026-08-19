-- Scope class-teacher assignments (UserGrade) to a single ClassGroup.
--
-- Until now a class teacher was assigned to a whole Grade, so two teachers
-- who actually lead different sections of the same grade were indist-
-- inguishable in the admin "Class Teachers" list -- both rendered as
-- "Year 1 - Coding Academy". ClassGroup is the cohort label that already
-- carries that distinction for students (StudentClassGroup) and for subject
-- teaching (TeacherSubjectAssignment); this makes class teachers use it too.
--
-- ClassGroup is NOT year-scoped (see 059) -- the same row is reused each
-- academic year -- so class_group_id joins the primary key alongside the
-- existing academic_year_id rather than replacing it.
--
-- BACKFILL: existing rows carry no section information, so each is mapped to
-- the lowest-id ClassGroup belonging to its grade. Where a grade has several
-- class groups that choice is arbitrary and admins must review it afterwards
-- (the query at the bottom of this file lists the affected rows). Where a
-- grade has NO class group at all nothing can be mapped, and the
-- `MODIFY ... NOT NULL` below aborts the migration under MySQL strict mode
-- rather than silently coercing the value to 0 -- create the missing class
-- groups first, then re-run.

SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE `UserGrade`
  ADD COLUMN `class_group_id` BIGINT(20) NULL AFTER `grade_id`;

UPDATE `UserGrade` ug
SET ug.`class_group_id` = (
  SELECT MIN(cg.`class_group_id`)
  FROM `ClassGroup` cg
  WHERE cg.`grade_id` = ug.`grade_id`
)
WHERE ug.`class_group_id` IS NULL;

ALTER TABLE `UserGrade`
  MODIFY `class_group_id` BIGINT(20) NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`user_id`, `grade_id`, `class_group_id`, `academic_year_id`),
  ADD CONSTRAINT `usergrade_ibfk_class_group` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`);

SET FOREIGN_KEY_CHECKS=1;

-- Review list: class-teacher rows whose grade has more than one class group,
-- i.e. the ones where the backfill above made an arbitrary pick.
SELECT
  ug.`user_id`,
  CONCAT(up.`first_name`, ' ', up.`last_name`) AS `teacher`,
  g.`name` AS `grade`,
  cg.`name` AS `assigned_class_group`,
  ay.`name` AS `academic_year`,
  (SELECT COUNT(*) FROM `ClassGroup` c WHERE c.`grade_id` = ug.`grade_id`) AS `class_groups_in_grade`
FROM `UserGrade` ug
JOIN `UserProfile` up ON up.`user_id` = ug.`user_id`
JOIN `Grade` g ON g.`grade_id` = ug.`grade_id`
JOIN `ClassGroup` cg ON cg.`class_group_id` = ug.`class_group_id`
JOIN `AcademicYear` ay ON ay.`academic_year_id` = ug.`academic_year_id`
WHERE (SELECT COUNT(*) FROM `ClassGroup` c WHERE c.`grade_id` = ug.`grade_id`) > 1
ORDER BY ay.`academic_year_id` DESC, g.`name`, `teacher`;
