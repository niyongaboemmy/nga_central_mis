-- 114: End the mentor assignments migration 047 inferred from subject teaching,
-- in academic years that have finished.
--
-- 047 seeded an ACTIVE MentorAssignment for every (subject teacher, student) pair
-- of each class group, so in those years every teacher "mentored" all of their
-- students and many students had several mentors. Mentors are now assigned
-- explicitly by an admin, and access only follows assignments in years that
-- have not finished, so these rows no longer grant anything -- this closes them
-- so rosters, counts and reports stop showing them. Rows are ENDED, not deleted:
-- sessions logged against them keep their history.
--
-- Rows in the current (or a future) year are left alone for an admin to review
-- in Admin Reports > Mentor Assignments. After applying in production, run
-- `node dist/access/cli.js sync-rules` so rule-owned MENTEES grants converge.

UPDATE MentorAssignment ma
JOIN AcademicYear ay ON ay.academic_year_id = ma.academic_year_id
SET ma.status = 'ENDED', ma.ended_at = CURRENT_TIMESTAMP
WHERE ma.status = 'ACTIVE'
  AND ma.notes = 'Backfilled from TeacherSubjectAssignment on migration 047'
  AND IFNULL(ay.is_current, 0) = 0
  AND ay.end_date IS NOT NULL
  AND ay.end_date < CURDATE();
