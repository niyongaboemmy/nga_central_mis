-- Migration 054: Add learning hours + indicative content to SubjectCompetency
--
-- RTB curriculum documents budget hours per "Learning Outcome" (which maps 1:1 to an
-- "Element of Competency" in this system) and list bullet "Indicative content" under it.
-- Neither was captured before; both are needed so "Import from Curriculum" (AI extraction from
-- an uploaded RTB PDF) has somewhere to store what it reads, and so the info is visible/editable
-- for curriculum entered by hand too.

ALTER TABLE SubjectCompetency
  ADD COLUMN learning_hours INT NULL AFTER element_number,
  ADD COLUMN indicative_content TEXT NULL AFTER description;
