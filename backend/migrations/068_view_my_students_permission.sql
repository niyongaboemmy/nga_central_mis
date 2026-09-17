-- Adds the permission that lets a teacher view "My Students" — the roster
-- of every student enrolled in any class group where the teacher has a
-- subject assignment for the currently selected academic year
-- (GET /academics/my-students). Companion to VIEW_MY_ASSIGNED_SUBJECTS,
-- which lists the subjects/class-groups themselves.
--
-- Granted to TEACHER directly; CLASS_TEACHER picks it up automatically via
-- 067_copy_teacher_perms_to_class_teacher.sql's ongoing TEACHER-union
-- behavior only if that migration is re-run, so it's granted explicitly
-- here too rather than relying on that.

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_MY_STUDENTS', 'View the roster of students across all of a teacher''s assigned subjects and class groups', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_MY_STUDENTS');

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name = 'VIEW_MY_STUDENTS'
WHERE r.name IN ('TEACHER', 'CLASS_TEACHER')
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp
    WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );
