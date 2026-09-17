-- Add academic_year_id and academic_term_id to LessonReport and
-- MentorshipSession so reporting can be filtered by the globally selected
-- academic year and term. Both tables previously had no reliable period
-- linkage: LessonReport's FK chain (lesson_id/entry_id) is optional, and
-- MentorshipSession.report_id is always null in the decoupled reporting flow
-- (see migration 035).

ALTER TABLE LessonReport
ADD COLUMN academic_year_id BIGINT NULL AFTER reported_by,
ADD COLUMN academic_term_id BIGINT NULL AFTER academic_year_id,
ADD FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id),
ADD FOREIGN KEY (academic_term_id) REFERENCES AcademicTerm(academic_term_id),
ADD INDEX idx_lesson_report_academic_year (academic_year_id),
ADD INDEX idx_lesson_report_academic_term (academic_term_id);

ALTER TABLE MentorshipSession
ADD COLUMN academic_year_id BIGINT NULL AFTER topic,
ADD COLUMN academic_term_id BIGINT NULL AFTER academic_year_id,
ADD FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id),
ADD FOREIGN KEY (academic_term_id) REFERENCES AcademicTerm(academic_term_id),
ADD INDEX idx_mentorship_academic_year (academic_year_id),
ADD INDEX idx_mentorship_academic_term (academic_term_id);

-- Backfill existing rows: match each row's date against the AcademicTerm
-- whose range covers it, and derive the year from that term.
UPDATE LessonReport lr
JOIN AcademicTerm at
  ON lr.delivery_date >= at.start_date AND lr.delivery_date <= at.end_date
SET lr.academic_term_id = at.academic_term_id,
    lr.academic_year_id = at.academic_year_id
WHERE lr.academic_term_id IS NULL;

UPDATE MentorshipSession ms
JOIN AcademicTerm at
  ON ms.session_date >= at.start_date AND ms.session_date <= at.end_date
SET ms.academic_term_id = at.academic_term_id,
    ms.academic_year_id = at.academic_year_id
WHERE ms.academic_term_id IS NULL;
