-- Migration 033: Remove academic_term_id from TeacherSubjectAssignment
-- Teacher-subject assignments are now year-wide (via ClassGroup.academic_year_id), not term-specific.

-- Step 1: Deduplicate rows — keep the earliest assignment per (user_id, subject_id, class_group_id)
DELETE t1 FROM TeacherSubjectAssignment t1
INNER JOIN TeacherSubjectAssignment t2
ON  t1.user_id       = t2.user_id
AND t1.subject_id    = t2.subject_id
AND t1.class_group_id = t2.class_group_id
AND t1.academic_term_id > t2.academic_term_id;

-- Step 2: Drop old primary key, drop FK on academic_term_id, drop the column, set new PK
ALTER TABLE TeacherSubjectAssignment
  DROP PRIMARY KEY,
  DROP FOREIGN KEY TeacherSubjectAssignment_academic_term_id_AcademicTerm_academic_term_id_fk,
  DROP COLUMN academic_term_id,
  ADD PRIMARY KEY (user_id, subject_id, class_group_id);
