-- Migration 039: Mentorship Intelligence Layer
-- Adds subject context, chain-of-support chain, discipline-progress toggle,
-- and alert flags to MentorshipSession.
-- Introduces AssessmentScore table for automatic grade pull-in.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend MentorshipSession with intelligence-layer fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE MentorshipSession
  ADD COLUMN subject_id           BIGINT          NULL
      COMMENT 'Optional subject context for this session'
      AFTER topic,
  ADD COLUMN previous_session_id  BIGINT          NULL
      COMMENT 'Chain-of-support link to the preceding session'
      AFTER subject_id,
  ADD COLUMN discipline_progress  ENUM('IMPROVED','CONSISTENT','DECLINED') NULL
      AFTER discipline_notes,
  ADD COLUMN dishonesty_flagged   TINYINT(1)      NOT NULL DEFAULT 0
      AFTER academic_personal_notes,
  ADD COLUMN stress_flag          TINYINT(1)      NOT NULL DEFAULT 0
      AFTER dishonesty_flagged,

  ADD CONSTRAINT fk_ms_subject
    FOREIGN KEY (subject_id)
    REFERENCES Subject(subject_id) ON DELETE SET NULL,

  ADD CONSTRAINT fk_ms_prev_session
    FOREIGN KEY (previous_session_id)
    REFERENCES MentorshipSession(mentorship_id) ON DELETE SET NULL;

CREATE INDEX idx_ms_subject_id ON MentorshipSession(subject_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AssessmentScore — student grade records pulled into mentorship context
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE AssessmentScore (
  score_id          BIGINT          NOT NULL AUTO_INCREMENT,
  student_id        BIGINT          NOT NULL,
  subject_id        BIGINT          NOT NULL,
  academic_year_id  INT             NULL,
  term              VARCHAR(20)     NULL     COMMENT 'e.g. TERM1, TERM2, TERM3',
  assessment_type   VARCHAR(50)     NOT NULL DEFAULT 'EXAM'
                    COMMENT 'EXAM, CAT, ASSIGNMENT, PROJECT',
  title             VARCHAR(150)    NULL,
  score             DECIMAL(5,2)    NOT NULL,
  max_score         DECIMAL(5,2)    NOT NULL DEFAULT 100,
  assessed_at       DATE            NOT NULL,
  recorded_by       BIGINT          NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (score_id),
  INDEX idx_ascore_student      (student_id),
  INDEX idx_ascore_subject      (subject_id),
  INDEX idx_ascore_student_date (student_id, assessed_at),

  CONSTRAINT fk_ascore_student
    FOREIGN KEY (student_id)  REFERENCES User(user_id)    ON DELETE CASCADE,
  CONSTRAINT fk_ascore_subject
    FOREIGN KEY (subject_id)  REFERENCES Subject(subject_id) ON DELETE CASCADE,
  CONSTRAINT fk_ascore_recorder
    FOREIGN KEY (recorded_by) REFERENCES User(user_id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
