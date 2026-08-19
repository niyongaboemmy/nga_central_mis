-- Give CLASS_TEACHER everything TEACHER can do, without taking anything away.
--
-- A class teacher is a teacher who additionally owns a section, but the two
-- roles had drifted into near-disjoint sets: of 14 permissions each, only 5
-- overlapped. CLASS_TEACHER was missing day-to-day teaching rights it plainly
-- needs (ENTER_MARKS, MARK_ATTENDANCE, VIEW_RESULTS, TEACHER_DASHBOARD, ...)
-- while holding 9 of its own that TEACHER does not have
-- (VIEW_USERS_BY_CLASS_TEACHER_GRADE, MANAGE_ACADEMICS, calendar rights, ...).
--
-- This is a UNION, not a replace: every TEACHER permission missing from
-- CLASS_TEACHER is added, and the CLASS_TEACHER-only permissions are left
-- untouched. Nothing is ever deleted, so the migration is safe to re-run --
-- the NOT EXISTS guard makes it idempotent.
--
-- Roles are resolved by name rather than by hard-coded id so this behaves the
-- same on dev and production, where the ids differ.
--
-- No code deploy is needed: the auth middleware reads a user's permissions
-- per request, so this takes effect immediately without anyone re-logging in.

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT ct.`role_id`, rp.`perm_id`
FROM `RolePermission` rp
JOIN `Role` t  ON t.`role_id` = rp.`role_id` AND t.`name` = 'TEACHER'
JOIN `Role` ct ON ct.`name` = 'CLASS_TEACHER'
WHERE NOT EXISTS (
  SELECT 1
  FROM `RolePermission` existing
  WHERE existing.`role_id` = ct.`role_id`
    AND existing.`perm_id` = rp.`perm_id`
);

-- Result: what CLASS_TEACHER now holds, and where each permission came from.
SELECT
  p.`perm_id`,
  p.`name`,
  CASE
    WHEN EXISTS (SELECT 1 FROM `RolePermission` r JOIN `Role` t ON t.`role_id` = r.`role_id`
                 WHERE t.`name` = 'TEACHER' AND r.`perm_id` = p.`perm_id`)
    THEN 'shared with TEACHER'
    ELSE 'CLASS_TEACHER only (kept)'
  END AS `source`
FROM `Permission` p
JOIN `RolePermission` rp ON rp.`perm_id` = p.`perm_id`
JOIN `Role` ct ON ct.`role_id` = rp.`role_id` AND ct.`name` = 'CLASS_TEACHER'
ORDER BY `source`, p.`name`;
