-- 135: "All projects" (SIDE_PROJECTS_VIEW) and reviewing (SIDE_PROJECTS_REVIEW) are for leadership
-- and explicit grants only.
--
-- The Class Teacher and Mentor presets used to carry SIDE_PROJECTS_VIEW (scoped to their class or
-- mentees), and Class Teacher also carried SIDE_PROJECTS_REVIEW. That opened the school-wide
-- "All projects" page to every class teacher. They now follow the projects they supervise or help
-- build under "Assigned projects". A supervisor still reviews their own projects through the
-- per-project rule, not this permission.
--
-- The roles keep their AccessPresetLink rows, so preset seeding (insert-only, once per link) never
-- re-adds the grants. Leadership can still grant either permission to anyone in Access Studio.
-- Idempotent: a second run deletes nothing and bumps nobody. MySQL 5.7 and 8.

-- Holders whose access changes, captured before the delete so their snapshots refresh.
DROP TEMPORARY TABLE IF EXISTS `tmp_sp135_holders`;
CREATE TEMPORARY TABLE `tmp_sp135_holders` (`user_id` BIGINT NOT NULL PRIMARY KEY);

INSERT IGNORE INTO `tmp_sp135_holders` (`user_id`)
SELECT DISTINCT ur.`user_id`
FROM `UserRole` ur
JOIN `Role` r ON r.`role_id` = ur.`role_id`
JOIN `RolePermission` rp ON rp.`role_id` = r.`role_id`
JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` IN ('SIDE_PROJECTS_VIEW', 'SIDE_PROJECTS_REVIEW')
WHERE r.`preset_key` IN ('class_teacher', 'mentor') OR r.`name` IN ('CLASS_TEACHER', 'Mentor');

INSERT IGNORE INTO `tmp_sp135_holders` (`user_id`)
SELECT DISTINCT g.`user_id`
FROM `AccessGrant` g
JOIN `Role` r ON r.`role_id` = g.`role_id`
JOIN `RolePermission` rp ON rp.`role_id` = r.`role_id`
JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` IN ('SIDE_PROJECTS_VIEW', 'SIDE_PROJECTS_REVIEW')
WHERE g.`status` = 'ACTIVE' AND (r.`preset_key` IN ('class_teacher', 'mentor') OR r.`name` IN ('CLASS_TEACHER', 'Mentor'));

DELETE rp
FROM `RolePermission` rp
JOIN `Role` r ON r.`role_id` = rp.`role_id`
JOIN `Permission` p ON p.`perm_id` = rp.`perm_id`
WHERE p.`name` IN ('SIDE_PROJECTS_VIEW', 'SIDE_PROJECTS_REVIEW')
  AND (r.`preset_key` IN ('class_teacher', 'mentor') OR r.`name` IN ('CLASS_TEACHER', 'Mentor'));

-- Mark the links as applied (they normally are already), so seeding never brings the grants back.
INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
VALUES ('class_teacher', 'SIDE_PROJECTS_VIEW'), ('class_teacher', 'SIDE_PROJECTS_REVIEW'), ('mentor', 'SIDE_PROJECTS_VIEW');

UPDATE `User` u
JOIN `tmp_sp135_holders` h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

DROP TEMPORARY TABLE IF EXISTS `tmp_sp135_holders`;
