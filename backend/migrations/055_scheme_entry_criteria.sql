-- Migration 055: Scheme of Work entry <-> Curriculum Performance Criteria linkage
--
-- Many-to-many: one scheme entry (a taught week) can address several performance criteria, and one
-- criterion can be covered across several weeks. Populated primarily by AI matching (either at
-- Scheme-of-Work AI-generation time, or via a "Suggest Criteria" call for manually-authored
-- entries), with manual add/remove as a correction layer — see
-- CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md and
-- CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md for the full rationale.

CREATE TABLE SchemeEntryCriteria (
  entry_id     BIGINT   NOT NULL,
  criteria_id  BIGINT   NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_id, criteria_id),
  INDEX idx_sec_criteria (criteria_id),
  CONSTRAINT fk_sec_entry
    FOREIGN KEY (entry_id) REFERENCES SchemeOfWorkEntry(entry_id) ON DELETE CASCADE,
  CONSTRAINT fk_sec_criteria
    FOREIGN KEY (criteria_id) REFERENCES CompetencyPerformanceCriteria(criteria_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
