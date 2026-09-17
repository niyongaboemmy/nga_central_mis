-- The subject's "Students" tab (class roster) had no permission gate at all
-- on GET /academics/subjects/:id/years/:year/students or the term-scoped
-- variant — any authenticated user could pull the enrolled-student roster
-- for any subject by ID. Now that students can reach the same
-- /subjects/:subjectId page (via the new My Subjects feature), this needs a
-- dedicated permission so only instructors — not students — can view it.

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_SUBJECT_ENROLLED_STUDENTS', 'View the roster of students enrolled in a subject (Students tab on the subject page)', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_SUBJECT_ENROLLED_STUDENTS');
