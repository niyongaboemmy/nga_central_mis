-- Migration 047: Mentorship module — explicit mentor-mentee assignment +
-- student-facing check-ins. Follow-on to the Reporting Module Restructure
-- (which explicitly scoped MentorshipSession out) — see
-- MENTORSHIP_MODULE_IMPLEMENTATION_PLAN.md Phase 1/2.
--
-- MentorAssignment makes "who mentors whom, this academic year" a real,
-- admin-controlled relationship, decoupled from TeacherSubjectAssignment
-- (a mentor may span multiple class groups/years, per the reviewed Rwanda
-- Coding Academy reference report). MenteeCheckIn is the first
-- student-authored surface in the reporting module.

CREATE TABLE IF NOT EXISTS MentorAssignment (
  assignment_id    BIGINT PRIMARY KEY AUTO_INCREMENT,
  mentor_id        BIGINT NOT NULL,
  student_id       BIGINT NOT NULL,
  academic_year_id BIGINT NOT NULL,
  status           ENUM('ACTIVE','ENDED') NOT NULL DEFAULT 'ACTIVE',
  assigned_by      BIGINT NOT NULL,
  assigned_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at         DATETIME NULL,
  notes            TEXT NULL,
  CONSTRAINT fk_ma_mentor FOREIGN KEY (mentor_id) REFERENCES `User`(user_id),
  CONSTRAINT fk_ma_student FOREIGN KEY (student_id) REFERENCES `User`(user_id),
  CONSTRAINT fk_ma_year FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id),
  CONSTRAINT fk_ma_assigned_by FOREIGN KEY (assigned_by) REFERENCES `User`(user_id)
);

CREATE INDEX idx_ma_mentor ON MentorAssignment(mentor_id, academic_year_id);
CREATE INDEX idx_ma_student ON MentorAssignment(student_id, academic_year_id);
-- "One active mentor per student per year" is enforced at the application
-- layer (check-then-insert), not a DB constraint — this MySQL version has no
-- filtered/partial unique index, and the alternative (a generated column
-- keyed on status) adds more risk than the low-frequency admin-only write
-- path here warrants.

CREATE TABLE IF NOT EXISTS MenteeCheckIn (
  checkin_id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id        BIGINT NOT NULL,
  mentor_id         BIGINT NOT NULL,
  academic_year_id  BIGINT NOT NULL,
  submitted_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category          ENUM('APPRECIATION','CONCERN','REQUEST_MEETING','GENERAL') NOT NULL DEFAULT 'GENERAL',
  message           TEXT NOT NULL,
  linked_session_id BIGINT NULL,
  status            ENUM('NEW','ACKNOWLEDGED','ADDRESSED') NOT NULL DEFAULT 'NEW',
  mentor_response   TEXT NULL,
  responded_at      DATETIME NULL,
  CONSTRAINT fk_mci_student FOREIGN KEY (student_id) REFERENCES `User`(user_id),
  CONSTRAINT fk_mci_mentor FOREIGN KEY (mentor_id) REFERENCES `User`(user_id),
  CONSTRAINT fk_mci_year FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id),
  CONSTRAINT fk_mci_session FOREIGN KEY (linked_session_id) REFERENCES MentorshipSession(mentorship_id)
);

CREATE INDEX idx_mci_mentor ON MenteeCheckIn(mentor_id, status);
CREATE INDEX idx_mci_student ON MenteeCheckIn(student_id, academic_year_id);

-- New permissions. Not auto-granted to any role (mirrors migration 022's
-- pattern for VIEW_STUDENT_CALENDAR) — an admin grants MANAGE_MENTOR_ASSIGNMENTS
-- to whichever admin role should manage rosters, and SUBMIT_MENTEE_CHECKIN to
-- the Student role, via the existing Permissions management UI.
INSERT INTO Permission (name, description, status)
SELECT 'MANAGE_MENTOR_ASSIGNMENTS', 'Assign/reassign/end mentor-student relationships per academic year', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'MANAGE_MENTOR_ASSIGNMENTS');

INSERT INTO Permission (name, description, status)
SELECT 'SUBMIT_MENTEE_CHECKIN', 'Student can submit a check-in/comment to their assigned mentor', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'SUBMIT_MENTEE_CHECKIN');

-- Backfill: seed an ACTIVE MentorAssignment for every mentor-student pair
-- inferable from today's implicit model (TeacherSubjectAssignment -> ClassGroup
-- -> StudentClassGroup), scoped to each ClassGroup's own academic year, so no
-- mentor loses access to a mentee's existing session history on cutover.
-- assigned_by is set to the mentor themself since no explicit admin action
-- created this historical relationship — it is a data-migration artifact,
-- not a real assignment event.
INSERT INTO MentorAssignment (mentor_id, student_id, academic_year_id, status, assigned_by, notes)
SELECT DISTINCT
  tsa.user_id AS mentor_id,
  scg.user_id AS student_id,
  cg.academic_year_id,
  'ACTIVE',
  tsa.user_id,
  'Backfilled from TeacherSubjectAssignment on migration 047'
FROM TeacherSubjectAssignment tsa
JOIN ClassGroup cg ON cg.class_group_id = tsa.class_group_id
JOIN StudentClassGroup scg ON scg.class_group_id = cg.class_group_id AND scg.status = 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM MentorAssignment ma
  WHERE ma.mentor_id = tsa.user_id
    AND ma.student_id = scg.user_id
    AND ma.academic_year_id = cg.academic_year_id
);
