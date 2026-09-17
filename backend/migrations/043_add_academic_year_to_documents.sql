-- Add academic_year_id to DocumentFolder and Document so documents can be
-- grouped and filtered by the globally selected academic year

ALTER TABLE DocumentFolder
ADD COLUMN academic_year_id BIGINT NULL AFTER parent_folder_id,
ADD FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id),
ADD INDEX idx_document_folder_academic_year (academic_year_id);

ALTER TABLE Document
ADD COLUMN academic_year_id BIGINT NULL AFTER folder_id,
ADD FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id),
ADD INDEX idx_document_academic_year (academic_year_id);

-- Backfill existing rows: assign each folder/document to the academic year
-- whose date range covers its created_at, so year filtering is meaningful
-- for data that predates this column instead of leaving it unfiltered.
UPDATE DocumentFolder df
JOIN AcademicYear ay
  ON df.created_at >= ay.start_date AND df.created_at <= ay.end_date
SET df.academic_year_id = ay.academic_year_id
WHERE df.academic_year_id IS NULL;

UPDATE Document d
JOIN AcademicYear ay
  ON d.created_at >= ay.start_date AND d.created_at <= ay.end_date
SET d.academic_year_id = ay.academic_year_id
WHERE d.academic_year_id IS NULL;
