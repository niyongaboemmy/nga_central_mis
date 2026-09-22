-- Migration 088: E-Learning — give the ADMIN role oversight of every course (reports), like
-- programme managers and head teachers already have. SUPER_ADMIN needs nothing (all perms).
INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name = 'VIEW_ALL_COURSES'
WHERE r.name = 'ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );
