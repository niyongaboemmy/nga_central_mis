-- Staff assigned to a custom calendar activity (non-subject event).
--
-- An activity such as "Physical Education" or "Student Led clubs" is pinned to
-- a class group and a time slot, but nothing said which staff member runs it,
-- so it never appeared on anyone's own teaching schedule. This join table lets
-- an admin optionally assign any number of users to an activity; the teacher
-- dashboard (GET /calendar/my-calendar) then returns the activities assigned
-- to the caller alongside their lessons.
--
-- Assignment is optional: an activity with no rows here is still a valid
-- school-wide / class-group event, exactly as before.

CREATE TABLE IF NOT EXISTS CalendarActivityAssignee (
  activity_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (activity_id, user_id),
  KEY idx_calendar_activity_assignee_user (user_id),
  CONSTRAINT fk_calendar_activity_assignee_activity
    FOREIGN KEY (activity_id) REFERENCES CalendarActivity (activity_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_calendar_activity_assignee_user
    FOREIGN KEY (user_id) REFERENCES User (user_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
