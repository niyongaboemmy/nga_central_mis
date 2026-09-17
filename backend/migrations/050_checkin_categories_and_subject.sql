-- Migration 050: Expand MenteeCheckIn categories + optional subject link.
--
-- The student-facing "My Mentor" report form (MENTORSHIP_MODULE_IMPLEMENTATION_PLAN.md
-- Phase 2) only offered 4 categories and had no way to tie a report to a
-- specific enrolled subject. This widens the category set to cover the
-- realistic range of student reports and adds a nullable subject_id so a
-- report can optionally reference one of the student's enrolled subjects
-- (StudentSubjectEnrollment), without requiring one for reports that aren't
-- subject-specific (e.g. wellbeing, behavioral, meeting requests).

ALTER TABLE MenteeCheckIn
  MODIFY COLUMN category ENUM(
    'GENERAL',
    'APPRECIATION',
    'ACADEMIC',
    'BEHAVIORAL',
    'ATTENDANCE',
    'WELLBEING',
    'CONCERN',
    'REQUEST_MEETING',
    'OTHER'
  ) NOT NULL DEFAULT 'GENERAL';

ALTER TABLE MenteeCheckIn
  ADD COLUMN subject_id BIGINT NULL AFTER title,
  ADD CONSTRAINT fk_mci_subject FOREIGN KEY (subject_id) REFERENCES Subject(subject_id);

CREATE INDEX idx_mci_subject ON MenteeCheckIn(subject_id);
