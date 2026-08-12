-- Make ClassGroup a permanent label (like Grade/Subject/Program), not a
-- per-academic-year row. Previously a new "G1" row was created every year
-- with a new class_group_id, which meant every year-rollover feature had to
-- re-match class groups across years by (grade_id, name) instead of just
-- reusing the same row. TeacherSubjectAssignment and StudentClassGroup gain
-- their own direct academic_year_id column (matching the pattern already
-- used by StudentSubjectEnrollment/UserProgramLead/UserGrade) so "which
-- year is this assignment for" no longer depends on ClassGroup at all.
--
-- Six tables reference ClassGroup.class_group_id: TeacherSubjectAssignment,
-- StudentClassGroup, SchemeOfWork, AcademicCalendar, CalendarSlot,
-- CalendarActivity, InstructorReport, LessonReport. Duplicate per-year
-- ClassGroup rows (same grade_id + name) are merged into one canonical row
-- (the lowest class_group_id) and every foreign key above is remapped to
-- point at it before the duplicates are deleted.

SET FOREIGN_KEY_CHECKS=0;

-- ── Step 1: add academic_year_id to TeacherSubjectAssignment, backfill ──
ALTER TABLE `TeacherSubjectAssignment`
  ADD COLUMN `academic_year_id` BIGINT(20) NULL AFTER `class_group_id`;

UPDATE `TeacherSubjectAssignment` tsa
JOIN `ClassGroup` cg ON tsa.class_group_id = cg.class_group_id
SET tsa.academic_year_id = cg.academic_year_id
WHERE tsa.academic_year_id IS NULL;

-- ── Step 2: add academic_year_id to StudentClassGroup, backfill ──
ALTER TABLE `StudentClassGroup`
  ADD COLUMN `academic_year_id` BIGINT(20) NULL AFTER `class_group_id`;

UPDATE `StudentClassGroup` scg
JOIN `ClassGroup` cg ON scg.class_group_id = cg.class_group_id
SET scg.academic_year_id = cg.academic_year_id
WHERE scg.academic_year_id IS NULL;

-- ── Step 2b: widen TeacherSubjectAssignment's primary key to include
-- academic_year_id *before* remapping class_group_id below -- otherwise two
-- rows that only differ by year (e.g. the same teacher/subject assigned to
-- "N1" in both 2025-2026 and 2026-2027, which are separate class_group_id
-- values pre-migration) would collide on the old 3-column primary key the
-- moment their class_group_id values get merged to the same canonical id.
ALTER TABLE `TeacherSubjectAssignment`
  MODIFY `academic_year_id` BIGINT(20) NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`user_id`, `subject_id`, `class_group_id`, `academic_year_id`);

-- ── Step 3: build the canonical (grade_id, name) -> class_group_id map ──
CREATE TEMPORARY TABLE `_ClassGroupCanonical` AS
SELECT grade_id, name, MIN(class_group_id) AS canonical_id
FROM `ClassGroup`
GROUP BY grade_id, name;

CREATE TEMPORARY TABLE `_ClassGroupRemap` AS
SELECT cg.class_group_id AS old_id, canon.canonical_id AS new_id
FROM `ClassGroup` cg
JOIN `_ClassGroupCanonical` canon
  ON cg.grade_id = canon.grade_id AND cg.name = canon.name
WHERE cg.class_group_id <> canon.canonical_id;

-- ── Step 4: remap class_group_id everywhere it's referenced ──
UPDATE `TeacherSubjectAssignment` tsa
JOIN `_ClassGroupRemap` r ON tsa.class_group_id = r.old_id
SET tsa.class_group_id = r.new_id;

UPDATE `StudentClassGroup` scg
JOIN `_ClassGroupRemap` r ON scg.class_group_id = r.old_id
SET scg.class_group_id = r.new_id;

UPDATE `SchemeOfWork` sow
JOIN `_ClassGroupRemap` r ON sow.class_group_id = r.old_id
SET sow.class_group_id = r.new_id;

UPDATE `AcademicCalendar` ac
JOIN `_ClassGroupRemap` r ON ac.class_group_id = r.old_id
SET ac.class_group_id = r.new_id;

UPDATE `CalendarSlot` cs
JOIN `_ClassGroupRemap` r ON cs.class_group_id = r.old_id
SET cs.class_group_id = r.new_id;

UPDATE `CalendarActivity` ca
JOIN `_ClassGroupRemap` r ON ca.class_group_id = r.old_id
SET ca.class_group_id = r.new_id;

UPDATE `InstructorReport` ir
JOIN `_ClassGroupRemap` r ON ir.class_group_id = r.old_id
SET ir.class_group_id = r.new_id;

UPDATE `LessonReport` lr
JOIN `_ClassGroupRemap` r ON lr.class_group_id = r.old_id
SET lr.class_group_id = r.new_id;

-- ── Step 5: dedupe TeacherSubjectAssignment rows that collided after remap
-- (only happens if the same teacher+subject+year was already assigned to
-- what are now-merged duplicate class groups -- a genuine duplicate) ──
CREATE TEMPORARY TABLE `_TSA_Dedup` AS
SELECT user_id, subject_id, class_group_id, academic_year_id, MIN(assigned_at) AS assigned_at
FROM `TeacherSubjectAssignment`
GROUP BY user_id, subject_id, class_group_id, academic_year_id;

DELETE FROM `TeacherSubjectAssignment`;

INSERT INTO `TeacherSubjectAssignment`
  (user_id, subject_id, class_group_id, academic_year_id, assigned_at)
SELECT user_id, subject_id, class_group_id, academic_year_id, assigned_at
FROM `_TSA_Dedup`;

-- ── Step 6: dedupe StudentClassGroup rows the same way (StudentClassGroup
-- had no primary key/unique constraint at all before this migration --
-- adding one below, so any pre-existing silent duplicates must be resolved
-- first; prefer an ACTIVE status and the earliest assignment date) ──
CREATE TEMPORARY TABLE `_SCG_Dedup` AS
SELECT
  user_id, class_group_id, academic_year_id,
  MIN(assigned_at) AS assigned_at,
  IF(SUM(status = 'ACTIVE') > 0, 'ACTIVE', 'DISABLED') AS status
FROM `StudentClassGroup`
GROUP BY user_id, class_group_id, academic_year_id;

DELETE FROM `StudentClassGroup`;

INSERT INTO `StudentClassGroup`
  (user_id, class_group_id, academic_year_id, assigned_at, status)
SELECT user_id, class_group_id, academic_year_id, assigned_at, status
FROM `_SCG_Dedup`;

-- ── Step 7: delete the now-superseded duplicate ClassGroup rows ──
DELETE cg FROM `ClassGroup` cg
JOIN `_ClassGroupRemap` r ON cg.class_group_id = r.old_id;

-- ── Step 8: finalize TeacherSubjectAssignment (PK already widened in step
-- 2b; just add the FK constraint now that every row has a valid year) ──
ALTER TABLE `TeacherSubjectAssignment`
  ADD CONSTRAINT `tsa_academic_year_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`);

-- ── Step 9: finalize StudentClassGroup (NOT NULL, FK, new PK) -- some
-- environments already have a (user_id, class_group_id) primary key on this
-- table from earlier ad-hoc fixes, so drop it before adding the wider one ──
ALTER TABLE `StudentClassGroup`
  MODIFY `academic_year_id` BIGINT(20) NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`user_id`, `class_group_id`, `academic_year_id`),
  ADD CONSTRAINT `scg_academic_year_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`);

-- ── Step 10: drop ClassGroup.academic_year_id, replace the unique key --
-- the FK constraint on this column must be dropped explicitly first (InnoDB
-- refuses to drop a column that's part of an FK, independent of
-- FOREIGN_KEY_CHECKS, which only governs DML enforcement, not DDL) ──
ALTER TABLE `ClassGroup`
  DROP FOREIGN KEY `classgroup_ibfk_1`,
  DROP INDEX `academic_year_id`,
  DROP COLUMN `academic_year_id`,
  ADD UNIQUE KEY `uq_class_group_grade_name` (`grade_id`, `name`);

SET FOREIGN_KEY_CHECKS=1;
