-- 120: CODE_PLAYGROUND_USE — write and run code in the Code Playground (the
-- sidebar page /code-playground and "Run" on code in lessons and exercises).
--
-- Every user may use it: the permission is granted to EVERY existing role (legacy
-- and Access Studio presets alike), so whoever holds any role has it. The persona
-- baselines (teaching_staff, support_staff, student, parent) carry it in
-- access/presets.ts too, and the preset links are recorded so the registry never
-- re-adds it to a role whose access was deliberately narrowed in Access Studio.
-- Idempotent; MySQL 5.7 and 8.

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'CODE_PLAYGROUND_USE', 'Write and run code in the Code Playground', 'ACTIVE', 'mis', 'CODE_PLAYGROUND_USE', 'Write and run code in the Code Playground', 'CURRICULUM', 'WRITE', NULL, 0, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'CODE_PLAYGROUND_USE' OR p.`name` = 'CODE_PLAYGROUND_USE'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'CODE_PLAYGROUND_USE' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM `Role` r
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'CODE_PLAYGROUND_USE'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT DISTINCT r.`preset_key`, 'CODE_PLAYGROUND_USE'
FROM `Role` r
WHERE r.`preset_key` IS NOT NULL;
