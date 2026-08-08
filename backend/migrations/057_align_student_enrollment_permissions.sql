-- Align student-enrollment / student-class-group permissions with the
-- teacher-assignment equivalent (MANAGE_ACADEMICS), which is granted to
-- ADMIN, HEAD_TEACHER, and SUPER_ADMIN. MANAGE_STUDENT_ENROLLMENTS and
-- ASSIGN_STUDENT_CLASS_GROUPS were previously granted to SUPER_ADMIN only,
-- while the underlying routes were gated on the much broader MANAGE_USERS
-- (granted to ADMIN + SUPER_ADMIN) -- a mismatch between what the UI
-- checked and what the API actually enforced. This grants the two finer
-- permissions to ADMIN and HEAD_TEACHER so the routes can be switched to
-- require them directly.

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name IN ('MANAGE_STUDENT_ENROLLMENTS', 'ASSIGN_STUDENT_CLASS_GROUPS')
WHERE r.name IN ('ADMIN', 'HEAD_TEACHER')
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp
    WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );
