-- 129: Side projects for everyone, not only students.
--
-- SIDE_PROJECTS_MANAGE_OWN (migration 128 granted it to students only) now goes to EVERY
-- existing role, legacy and Access Studio presets alike, so whoever holds any role can run
-- their own projects on /my-projects. The persona baselines (teaching_staff, support_staff,
-- student, parent) carry it in access/presets.ts too, and the preset links are recorded so
-- the registry never re-adds it to a role whose access was deliberately narrowed in Access
-- Studio. Holders' access_version is bumped so it works at once. Same pattern as 120.
-- Idempotent; MySQL 5.7 and 8.

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM `Role` r
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'SIDE_PROJECTS_MANAGE_OWN'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT DISTINCT r.`preset_key`, 'SIDE_PROJECTS_MANAGE_OWN'
FROM `Role` r
WHERE r.`preset_key` IS NOT NULL;

-- Refresh cached access snapshots of everyone who holds a role (two statements: one per source).
UPDATE `User` u
JOIN (SELECT DISTINCT `user_id` FROM `UserRole`) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (SELECT DISTINCT `user_id` FROM `AccessGrant` WHERE `status` = 'ACTIVE') h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

-- No violet/purple in the NGA palette (primary is blue): re-colour the two seeded categories
-- that used it, only where nobody has changed them since migration 128.
UPDATE `SideProjectCategory` SET `color` = '#14b8a6' WHERE `slug` = 'mobile' AND `color` = '#8b5cf6';
UPDATE `SideProjectCategory` SET `color` = '#0284c7' WHERE `slug` = 'other' AND `color` = '#a855f7';
