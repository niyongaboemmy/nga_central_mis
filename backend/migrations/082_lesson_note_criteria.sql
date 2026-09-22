-- Migration 082: anchor lesson notes to the Curriculum instead of a Scheme of Work week.
--
-- A note now covers a set of performance criteria -- a whole Learning Outcome (every
-- criterion under it), a hand-picked subset, or criteria spanning several outcomes -- so
-- the teacher picks from the curriculum tree when creating a note (typed, AI-generated or
-- uploaded PDF alike) and the AI is grounded in exactly those criteria. scheme_entry_id
-- stays for notes created before this change.

CREATE TABLE IF NOT EXISTS LessonNoteCriteria (
  note_id     BIGINT NOT NULL,
  criteria_id BIGINT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (note_id, criteria_id),
  CONSTRAINT fk_lnc_note FOREIGN KEY (note_id) REFERENCES LessonNote(note_id) ON DELETE CASCADE,
  CONSTRAINT fk_lnc_criteria FOREIGN KEY (criteria_id) REFERENCES CompetencyPerformanceCriteria(criteria_id) ON DELETE CASCADE
);

CREATE INDEX idx_lnc_criteria ON LessonNoteCriteria(criteria_id);
