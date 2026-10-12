-- 119: Students can reach their mentor.
--
-- Migration 047 created SUBMIT_MENTEE_CHECKIN but granted it to nobody, leaving
-- it to an admin. Where that never happened, the "My Mentor" page was hidden
-- from every student and /mentorship/my-mentor answered 403, so a student with
-- a real mentor could not see who it was or how to contact them.
--
-- The routes now also admit any student with an ACTIVE assignment, so this
-- grant is belt-and-braces for the sidebar and for students whose mentor has
-- not been assigned yet (they see the "no mentor yet" state, not nothing).
-- Granted to the legacy STUDENT role only. Idempotent; MySQL 5.7 and 8.

INSERT INTO Permission (name, description, status)
SELECT 'SUBMIT_MENTEE_CHECKIN', 'Student can submit a check-in/comment to their assigned mentor', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'SUBMIT_MENTEE_CHECKIN');

INSERT INTO RolePermission (role_id, perm_id)
SELECT r.role_id, p.perm_id
  FROM Role r
  JOIN Permission p ON p.name = 'SUBMIT_MENTEE_CHECKIN'
 WHERE r.name = 'STUDENT'
   AND NOT EXISTS (
     SELECT 1 FROM RolePermission rp WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
   );
