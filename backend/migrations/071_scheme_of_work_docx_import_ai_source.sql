-- Adds a DOCX_IMPORT_AI value to SchemeOfWork.source, distinguishing schemes imported from a
-- non-standard DOCX (parsed via AI extraction) from ones matching the standard table format
-- (DOCX_IMPORT, parsed via fixed column rules).
ALTER TABLE `SchemeOfWork`
  MODIFY COLUMN `source` ENUM('MANUAL', 'DOCX_IMPORT', 'DOCX_IMPORT_AI', 'AI_GENERATED') DEFAULT 'MANUAL';
