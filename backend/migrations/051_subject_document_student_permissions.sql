-- Adds the two permissions introduced for student access to subject
-- materials (SubjectDocumentCategory / SubjectDocument). Previously the
-- read endpoints (GET .../document-categories, GET .../documents,
-- GET .../documents/:id/download) had no per-subject authorization at all —
-- any authenticated user could list/download any subject's documents.
-- curriculumController.ts now requires the caller to be either a teacher
-- assigned to the subject, a MANAGE_CURRICULUM / UPLOAD_SUBJECT_DOCUMENTS
-- holder (unchanged, unrestricted access), or a student who both holds one
-- of these permissions AND has an ACTIVE StudentSubjectEnrollment row for
-- that specific subject.
--
-- This migration only seeds the Permission rows; assigning them to the
-- STUDENT role is done via the Assign Permissions admin UI.

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_SUBJECT_DOCUMENTS', 'View subject material categories and documents for subjects the user teaches or is enrolled in', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_SUBJECT_DOCUMENTS');

INSERT INTO Permission (name, description, status)
SELECT 'DOWNLOAD_SUBJECT_DOCUMENTS', 'Download a specific subject material attachment for subjects the user teaches or is enrolled in', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'DOWNLOAD_SUBJECT_DOCUMENTS');
