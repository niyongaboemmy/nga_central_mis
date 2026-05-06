-- Migration 038: NGA Session Log Structured Fields
-- Adds the five document-aligned note columns, a numeric wellbeing score,
-- and an is_completed flag to MentorshipSession.

ALTER TABLE MentorshipSession
  ADD COLUMN wellbeing_score      TINYINT       NULL        COMMENT '1=Struggling 2=Concerned 3=Neutral 4=Good 5=Excellent' AFTER wellbeing_status,
  ADD COLUMN wellbeing_notes      TEXT          NULL        AFTER wellbeing_score,
  ADD COLUMN assignment_notes     TEXT          NULL        AFTER assignment_completion,
  ADD COLUMN discipline_notes     TEXT          NULL        AFTER punctuality_attendance,
  ADD COLUMN academic_personal_notes TEXT       NULL        AFTER academic_planning,
  ADD COLUMN guidance_notes       TEXT          NULL        AFTER challenges_identified,
  ADD COLUMN is_completed         TINYINT(1)    NOT NULL    DEFAULT 0 AFTER follow_up_required;
