-- Adds the permission that lets a student view their own enrolled subjects
-- list (GET /curriculum/my-enrolled-subjects) plus a subject's
-- overview/curriculum tabs (getSubjectDetail, getSubjectCompetencies) for a
-- subject they're actively enrolled in. Companion to
-- 051_subject_document_student_permissions.sql, which covers the Materials
-- tab specifically (VIEW_SUBJECT_DOCUMENTS / DOWNLOAD_SUBJECT_DOCUMENTS).

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_MY_ENROLLED_SUBJECTS', 'View the list of subjects the student is enrolled in, plus each subject''s overview and curriculum', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_MY_ENROLLED_SUBJECTS');
