-- Migration 081: Lesson notes from an uploaded PDF.
--
-- A third way to create a lesson note next to "write it myself" and "generate with AI":
-- the teacher uploads a PDF they already prepared elsewhere. Such a note is read-only in
-- the editor (the PDF is the source of truth and is what students read), but it follows
-- the same DRAFT -> PUBLISHED -> share lifecycle as every other note.
--
-- content_html is still populated for these notes, with the text extracted from the PDF
-- on upload, so everything that reads note text keeps working unchanged: the student
-- "Ask AI" tutor grounds itself in it, the library shows an excerpt / reading time, and
-- the combined-notes packet can still include the note.

ALTER TABLE LessonNote
  MODIFY COLUMN source ENUM('MANUAL','AI_GENERATED','AI_ASSISTED','PDF_UPLOAD') NOT NULL DEFAULT 'MANUAL';

ALTER TABLE LessonNote
  ADD COLUMN file_path  VARCHAR(500) NULL AFTER content_html,
  ADD COLUMN file_name  VARCHAR(255) NULL AFTER file_path,
  ADD COLUMN file_size  INT NULL AFTER file_name,
  ADD COLUMN page_count INT NULL AFTER file_size;
