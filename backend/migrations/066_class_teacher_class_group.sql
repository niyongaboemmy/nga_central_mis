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
-- grade has NO class group at all nothing can be mapped, so those rows are
-- dropped (see below) rather than left to trip the NOT NULL step.
--
-- Where the real split was known it is pinned explicitly below instead of
-- being left to the backfill -- the whole point of this change is that the
-- right teacher shows against the right section, and a guess would defeat it.

SET FOREIGN_KEY_CHECKS=0;

ALTER TABLE `UserGrade`
  ADD COLUMN `class_group_id` BIGINT(20) NULL AFTER `grade_id`;

-- A class teacher of a grade that has no class groups at all cannot be
-- represented once the column is required. There is no section to point at
-- and no basis for inventing one, so the assignment is dropped. On the
-- production database this matches exactly one row: user 17 on grade 9
-- ("primary"), academic year 3 -- a legacy grade, in a past year.
DELETE ug FROM `UserGrade` ug
WHERE NOT EXISTS (
  SELECT 1 FROM `ClassGroup` cg WHERE cg.`grade_id` = ug.`grade_id`
);

-- Known assignments, pinned by class group name so the statement is a no-op
-- on any database where the pairing does not exist. Grade 25 ("Year 1") runs
-- two sections and had two class teachers, which the lowest-id backfill would
-- have collapsed onto the same one.
UPDATE `UserGrade` ug
JOIN `ClassGroup` cg
  ON cg.`grade_id` = ug.`grade_id` AND cg.`name` = 'L3. Class A'
SET ug.`class_group_id` = cg.`class_group_id`
WHERE ug.`user_id` = 16 AND ug.`grade_id` = 25;

UPDATE `UserGrade` ug
JOIN `ClassGroup` cg
  ON cg.`grade_id` = ug.`grade_id` AND cg.`name` = 'L3. Class B'
SET ug.`class_group_id` = cg.`class_group_id`
WHERE ug.`user_id` = 15 AND ug.`grade_id` = 25;

-- Everything still unmapped goes to the lowest-id class group of its grade.
-- Exact where the grade runs a single section; an arbitrary pick where it
-- runs several, which the review query at the bottom lists for follow-up.
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
