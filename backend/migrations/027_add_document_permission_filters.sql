-- Add filter fields to DocumentPermission and FolderPermission tables for granular role-based sharing
-- This allows sharing documents to specific subjects, programs, grades, or enrollments
-- filter_ids stores JSON array of IDs

ALTER TABLE DocumentPermission 
ADD COLUMN filter_type ENUM(
  'subject_assigned', 
  'subject_enrolled', 
  'program_assigned', 
  'grade_assigned'
) NULL,
ADD COLUMN filter_ids JSON NULL,
ADD COLUMN academic_term_id BIGINT UNSIGNED NULL,
ADD INDEX idx_document_permission_filter (filter_type),
ADD INDEX idx_document_permission_term (academic_term_id);

ALTER TABLE FolderPermission 
ADD COLUMN filter_type ENUM(
  'subject_assigned', 
  'subject_enrolled', 
  'program_assigned', 
  'grade_assigned'
) NULL,
ADD COLUMN filter_ids JSON NULL,
ADD COLUMN academic_term_id BIGINT UNSIGNED NULL,
ADD INDEX idx_folder_permission_filter (filter_type),
ADD INDEX idx_folder_permission_term (academic_term_id);
