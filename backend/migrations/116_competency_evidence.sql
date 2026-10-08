-- 116: Competency map evidence (nga-desktop NEXT_FEATURES_ANALYSIS §3 #7).
--
--   CompetencyEvidence   one row per student × performance criterion × assessed
--                        piece of work from another app (today: Task Mentor quizzes
--                        and assignments the teacher tagged with the subject's
--                        learning outcomes). The app sends a task's whole result
--                        set each time (PUT /competency/evidence), which replaces
--                        that task's rows, so regrades and untagging are reflected.
--
-- E-learning evidence is not copied here: it is derived live from CourseItemProgress
-- (services/elearning/courseMastery.ts) and merged with these rows when the map is
-- read. No new capability: subject teachers see the classes they teach, e-learning
-- oversight (VIEW_ALL_COURSES) sees every class. Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `CompetencyEvidence` (
  `evidence_id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT NOT NULL,
  `criteria_id` BIGINT NOT NULL,
  `subject_id` BIGINT NOT NULL,
  `source` VARCHAR(16) NOT NULL,
  `source_type` VARCHAR(16) NOT NULL,
  `source_ref` BIGINT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `score_pct` DECIMAL(5,2) NOT NULL,
  `assessed_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`evidence_id`),
  UNIQUE KEY `uq_competency_evidence` (`source`, `source_type`, `source_ref`, `student_id`, `criteria_id`),
  KEY `idx_competency_evidence_subject` (`subject_id`, `student_id`),
  KEY `idx_competency_evidence_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
