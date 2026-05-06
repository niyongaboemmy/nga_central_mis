-- Migration 036: Mentorship Hub Enhancements
-- Adds action_items + session_status to MentorshipSession
-- and creates missing indexes for hub query performance.

ALTER TABLE MentorshipSession
  ADD COLUMN action_items   TEXT NULL AFTER next_steps,
  ADD COLUMN session_status ENUM('OPEN','IN_PROGRESS','RESOLVED')
               NOT NULL DEFAULT 'OPEN' AFTER follow_up_required;

CREATE INDEX idx_ms_user_id      ON MentorshipSession(user_id);
CREATE INDEX idx_ms_student_id   ON MentorshipSession(student_id);
CREATE INDEX idx_ms_session_date ON MentorshipSession(session_date);
