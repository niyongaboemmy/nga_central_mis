-- Migration 048: Approval workflow for mentee check-ins/reports.
-- Follow-on to migration 047 (MentorAssignment + MenteeCheckIn). Per the
-- feature decision, the mentee-submitted check-in becomes a lightweight
-- "report" (a structured title + free-text message) that the mentor
-- approves or rejects with a comment — reusing this codebase's existing
-- validation_status/validation_comment convention (see SchemeOfWork,
-- SchemeOfWorkEntry) rather than inventing new enum semantics.
--
-- validation_comment is intentionally NOT a new column: the existing
-- mentor_response/responded_at pair already captures "what the mentor said
-- back," and doubles as the approval comment when validation_status is set.

ALTER TABLE MenteeCheckIn
  ADD COLUMN title VARCHAR(150) NULL AFTER category,
  ADD COLUMN validation_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' AFTER status;

CREATE INDEX idx_mci_validation_status ON MenteeCheckIn(validation_status);
