-- 124: "My AI" capabilities (PERSONAL_AI_PROVIDERS_PLAN.md §4.3).
--
--   AI_PERSONAL_PROVIDERS          add and use your own AI provider keys (staff)
--   AI_PERSONAL_PROVIDERS_STUDENT  the same for students — granted to nobody; the super
--                                  admin grants it per role once students are allowed
--   AI_PROVIDERS_MANAGE            see AI provider health and usage across the school
--                                  (restricted; platform owner)
--
-- AI_PERSONAL_PROVIDERS goes to every role that already holds AI_USE, so whoever may use
-- AI may bring their own key. My AI itself stays off until the super admin turns it on in
-- Settings -> AI (policy field personal.enabled, default false).
--
-- Idempotent (NOT EXISTS / INSERT IGNORE); MySQL 5.7 and 8.

-- 1) Capabilities --------------------------------------------------------------
INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT c.name, c.label, 'ACTIVE', 'mis', c.name, c.label, 'SYSTEM', 'WRITE', NULL, c.restricted, 0
FROM (
  SELECT 'AI_PERSONAL_PROVIDERS' AS name, 'Use your own AI provider keys (My AI)' AS label, 0 AS restricted
  UNION ALL SELECT 'AI_PERSONAL_PROVIDERS_STUDENT', 'Students: use your own AI provider keys (My AI)', 0
  UNION ALL SELECT 'AI_PROVIDERS_MANAGE', 'See AI provider health and usage for the school', 1
) c
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = c.name OR p.`name` = c.name));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` IN ('AI_PERSONAL_PROVIDERS', 'AI_PERSONAL_PROVIDERS_STUDENT', 'AI_PROVIDERS_MANAGE') AND (`app` IS NULL OR `app` = 'mis');

-- 2) Role links ----------------------------------------------------------------
CREATE TEMPORARY TABLE `tmp_124_roles` (`role_id` BIGINT NOT NULL, `cap` VARCHAR(64) NOT NULL, PRIMARY KEY (`role_id`, `cap`));

INSERT IGNORE INTO `tmp_124_roles` (`role_id`, `cap`)
SELECT DISTINCT rp.`role_id`, 'AI_PERSONAL_PROVIDERS'
FROM `RolePermission` rp
JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`app` = 'mis' AND p.`name` = 'AI_USE';

INSERT IGNORE INTO `tmp_124_roles` (`role_id`, `cap`)
SELECT r.`role_id`, 'AI_PROVIDERS_MANAGE'
FROM `Role` r
WHERE r.`preset_key` = 'platform_owner' OR (r.`preset_key` IS NULL AND r.`name` = 'SUPER_ADMIN');

-- RolePermission has no primary key on older databases: guard with NOT EXISTS.
-- BINARY: the temporary table's collation may differ from Permission's (MySQL 8, error 1267).
INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT t.`role_id`, p.`perm_id`, NULL
FROM `tmp_124_roles` t
JOIN `Permission` p ON p.`app` = 'mis' AND BINARY p.`name` = BINARY t.`cap`
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = t.`role_id` AND x.`perm_id` = p.`perm_id`);

-- 3) Applied preset links (so the boot-time preset sync never re-adds a removed link) ----
INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT DISTINCT l.`preset_key`, 'AI_PERSONAL_PROVIDERS' FROM `AccessPresetLink` l WHERE l.`perm_name` = 'AI_USE';
INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`) VALUES ('platform_owner', 'AI_PROVIDERS_MANAGE');

-- 4) Refresh cached snapshots of everyone holding these roles ---------------------
CREATE TEMPORARY TABLE `tmp_124_bump` (`role_id` BIGINT NOT NULL, PRIMARY KEY (`role_id`));
INSERT IGNORE INTO `tmp_124_bump` (`role_id`) SELECT `role_id` FROM `tmp_124_roles`;

UPDATE `User` u
JOIN (SELECT DISTINCT ur.`user_id` FROM `UserRole` ur JOIN `tmp_124_bump` t ON t.`role_id` = ur.`role_id`) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id` FROM `AccessGrant` g JOIN `tmp_124_bump` t ON t.`role_id` = g.`role_id` WHERE g.`status` = 'ACTIVE'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

DROP TEMPORARY TABLE IF EXISTS `tmp_124_bump`;
DROP TEMPORARY TABLE IF EXISTS `tmp_124_roles`;
