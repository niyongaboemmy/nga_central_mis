-- Migration 089: Access control v2, Phase 0 -- permission hygiene.
-- (ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md §11 Phase 0.1)
--
-- 1. Seed the administrative permissions that route guards / menus check but
--    that were never inserted, so they can be granted to a role at all:
--      VIEW_USERS          GET /users/stats
--      MANAGE_PERMISSIONS  /permissions/permissions* CRUD, Permissions screen
--      VIEW_ACADEMICS      GET /academics/class-groups/overview
--      MANAGE_SETTINGS     Settings menu entry
-- 2. Grant them, plus the two administrative permissions no role held
--    (MANAGE_SSO_CLIENTS, VIEW_SUBJECT_ENROLLED_STUDENTS), to SUPER_ADMIN.
--    The API already let SUPER_ADMIN through via the code catalog; these rows
--    make GET /users/me menus and the SSO token say the same thing.
--
-- Deliberately NOT granted to SUPER_ADMIN: the personal "my ..." permissions
-- (TEACHER_DASHBOARD, VIEW_MY_ASSIGNED_SUBJECTS, ...). Granting them would put
-- teacher pages and the teacher dashboard in front of every super admin.
--
-- Idempotent.

INSERT INTO `Permission` (`name`, `description`, `status`)
SELECT v.name, v.description, 'ACTIVE'
FROM (
  SELECT 'VIEW_USERS' AS name, 'View user statistics across the school' AS description
  UNION ALL SELECT 'MANAGE_PERMISSIONS', 'Create, edit and delete permissions'
  UNION ALL SELECT 'VIEW_ACADEMICS', 'View the academic structure overview (class groups, grades, programmes)'
  UNION ALL SELECT 'MANAGE_SETTINGS', 'Manage system settings'
) v
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.name = v.name);

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name IN (
  'VIEW_USERS',
  'MANAGE_PERMISSIONS',
  'VIEW_ACADEMICS',
  'MANAGE_SETTINGS',
  'MANAGE_SSO_CLIENTS',
  'VIEW_SUBJECT_ENROLLED_STUDENTS'
)
WHERE r.name = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );
