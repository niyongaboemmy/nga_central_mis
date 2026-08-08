-- Phase 1 of the Reporting Module Restructure (see
-- REPORTING_MODULE_RESTRUCTURE_IMPLEMENTATION_PLAN.md, Phase 1).
--
-- Adds subject_id/class_group_id directly to LessonReport (denormalized at
-- write time so subject/class-group context survives even if the source
-- lesson/entry is later deleted), backfills them for existing rows, adds the
-- UNPLANNED status value needed for ad-hoc reporting (Phase 2), adds a
-- uniqueness constraint to prevent duplicate scheduled submissions, and adds
-- the SupportRequestCategory/ChallengeCategory lookup + join tables needed
-- for categorized "Support Needed"/"Challenges" ranking (Phase 4).

-- 1. New columns on LessonReport
ALTER TABLE LessonReport
  ADD COLUMN subject_id BIGINT NULL AFTER academic_term_id,
  ADD COLUMN class_group_id BIGINT NULL AFTER subject_id,
  ADD CONSTRAINT fk_lesson_report_subject FOREIGN KEY (subject_id) REFERENCES Subject(subject_id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_lesson_report_class_group FOREIGN KEY (class_group_id) REFERENCES ClassGroup(class_group_id) ON DELETE SET NULL,
  ADD INDEX idx_lesson_report_subject (subject_id),
  ADD INDEX idx_lesson_report_class_group (class_group_id);

-- 2. Backfill from the existing lesson_id -> LO_Lesson -> SchemeOfWorkEntry
-- -> SchemeOfWork chain, which already carries both subject_id and
-- class_group_id for every scheme-linked lesson. Rows with no lesson_id, or
-- whose lesson has no entry_id / linked scheme, stay NULL (genuinely
-- orphaned/ad-hoc-shaped historical data — not fabricated).
UPDATE LessonReport lr
JOIN LO_Lesson ll ON lr.lesson_id = ll.id
JOIN SchemeOfWorkEntry swe ON ll.entry_id = swe.entry_id
JOIN SchemeOfWork sow ON swe.scheme_id = sow.scheme_id
SET lr.subject_id = sow.subject_id,
    lr.class_group_id = sow.class_group_id
WHERE lr.subject_id IS NULL OR lr.class_group_id IS NULL;

-- 3. Add UNPLANNED to the status enum (ad-hoc/no-scheme activity, distinct
-- from MISSED, which means a planned lesson was not delivered).
ALTER TABLE LessonReport
  MODIFY COLUMN status ENUM('DELIVERED', 'PARTIAL', 'MISSED', 'UNPLANNED') NOT NULL DEFAULT 'DELIVERED';

-- 4. Prevent duplicate submissions for the same reporter/lesson/date. NULL
-- lesson_id (ad-hoc reports) are not considered equal to each other by
-- MySQL's unique index semantics, so ad-hoc reports may still repeat freely.
ALTER TABLE LessonReport
  ADD CONSTRAINT uq_lesson_report_reporter_lesson_date UNIQUE (reported_by, lesson_id, delivery_date);

-- 5. Lookup tables for categorized Support Needed / Challenges
CREATE TABLE SupportRequestCategory (
  category_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(150) NOT NULL UNIQUE,
  is_active TINYINT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ChallengeCategory (
  category_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(150) NOT NULL UNIQUE,
  is_active TINYINT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO SupportRequestCategory (label) VALUES
  ('Academic / Curriculum Clarification'),
  ('Technical / IT Support'),
  ('Infrastructure / Facilities'),
  ('Coordination / Scheduling'),
  ('Training / Professional Development'),
  ('Other');

INSERT INTO ChallengeCategory (label) VALUES
  ('Electricity / Power'),
  ('Equipment / Lab Issues'),
  ('Connectivity'),
  ('Student Engagement'),
  ('Curriculum Pacing'),
  ('Attendance'),
  ('Facility / Space'),
  ('Other');

-- 6. Join tables, scoped to LessonReport only (single entity type in play)
CREATE TABLE LessonReportSupportRequest (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lesson_report_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  note TEXT,
  CONSTRAINT fk_lrsr_lesson_report FOREIGN KEY (lesson_report_id) REFERENCES LessonReport(lesson_report_id) ON DELETE CASCADE,
  CONSTRAINT fk_lrsr_category FOREIGN KEY (category_id) REFERENCES SupportRequestCategory(category_id),
  INDEX idx_lrsr_lesson_report (lesson_report_id),
  INDEX idx_lrsr_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE LessonReportChallengeTag (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lesson_report_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  CONSTRAINT fk_lrct_lesson_report FOREIGN KEY (lesson_report_id) REFERENCES LessonReport(lesson_report_id) ON DELETE CASCADE,
  CONSTRAINT fk_lrct_category FOREIGN KEY (category_id) REFERENCES ChallengeCategory(category_id),
  INDEX idx_lrct_lesson_report (lesson_report_id),
  INDEX idx_lrct_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
