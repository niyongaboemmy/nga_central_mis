-- 032_change_enrollment_to_year_based.sql
-- Migrate StudentSubjectEnrollment from term-scoped to year-scoped.
-- Students are now enrolled for the whole academic year, not per term.

-- Step 1: Add the new column (nullable initially so existing rows are valid)
ALTER TABLE StudentSubjectEnrollment
  ADD COLUMN academic_year_id BIGINT NULL AFTER academic_term_id;

-- Step 2: Populate academic_year_id by joining through AcademicTerm
UPDATE StudentSubjectEnrollment sse
INNER JOIN AcademicTerm at ON sse.academic_term_id = at.academic_term_id
SET sse.academic_year_id = at.academic_year_id;

-- Step 3: Make the column NOT NULL now that it is populated
ALTER TABLE StudentSubjectEnrollment
  MODIFY COLUMN academic_year_id BIGINT NOT NULL;

-- Step 4: Drop the old composite primary key (includes academic_term_id)
ALTER TABLE StudentSubjectEnrollment
  DROP PRIMARY KEY;

-- Step 5: Drop the foreign key on academic_term_id
ALTER TABLE StudentSubjectEnrollment
  DROP FOREIGN KEY studentsubjectenrollment_ibfk_3;

-- Step 6: Remove the old column
ALTER TABLE StudentSubjectEnrollment
  DROP COLUMN academic_term_id;

-- Step 7: Deduplicate — if a student was enrolled in the same subject in
-- multiple terms of the same year, keep only the row with the latest enrolled_at.
DELETE sse1
FROM StudentSubjectEnrollment sse1
INNER JOIN StudentSubjectEnrollment sse2
  ON  sse1.user_id          = sse2.user_id
  AND sse1.subject_id       = sse2.subject_id
  AND sse1.academic_year_id = sse2.academic_year_id
WHERE sse1.enrolled_at < sse2.enrolled_at;

-- Step 8: Add the new composite primary key
ALTER TABLE StudentSubjectEnrollment
  ADD PRIMARY KEY (user_id, subject_id, academic_year_id);

-- Step 9: Add foreign key referencing AcademicYear
ALTER TABLE StudentSubjectEnrollment
  ADD CONSTRAINT studentsubjectenrollment_academic_year_id_fk
    FOREIGN KEY (academic_year_id) REFERENCES AcademicYear (academic_year_id);
