-- 125: AI_EXTERNAL_CONNECT -- use your own Claude / ChatGPT with NGA
-- (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3): the NGA connector (MCP) and "Open in Claude /
-- ChatGPT" + "Paste the answer". Staff only: it goes to every role that holds AI_USE
-- (students and parents hold none). Both features stay off until the super admin turns
-- them on in Settings -> AI (policy fields external.connector / external.handoff).
--
-- Idempotent (NOT EXISTS / INSERT IGNORE); MySQL 5.7 and 8.

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'AI_EXTERNAL_CONNECT', 'Use your own Claude/ChatGPT with NGA (connector, open-in)', 'ACTIVE', 'mis', 'AI_EXTERNAL_CONNECT',
       'Use your own Claude/ChatGPT with NGA (connector, open-in)', 'SYSTEM', 'WRITE', NULL, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'AI_EXTERNAL_CONNECT' OR p.`name` = 'AI_EXTERNAL_CONNECT'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'AI_EXTERNAL_CONNECT' AND (`app` IS NULL OR `app` = 'mis');

CREATE TEMPORARY TABLE `tmp_125_roles` (`role_id` BIGINT NOT NULL, PRIMARY KEY (`role_id`));
INSERT IGNORE INTO `tmp_125_roles` (`role_id`)
SELECT DISTINCT rp.`role_id`
FROM `RolePermission` rp
JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`app` = 'mis' AND p.`name` = 'AI_USE';

-- RolePermission has no primary key on older databases: guard with NOT EXISTS.
INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT t.`role_id`, p.`perm_id`, NULL
FROM `tmp_125_roles` t
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'AI_EXTERNAL_CONNECT'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = t.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT DISTINCT l.`preset_key`, 'AI_EXTERNAL_CONNECT' FROM `AccessPresetLink` l WHERE l.`perm_name` = 'AI_USE';

UPDATE `User` u
JOIN (SELECT DISTINCT ur.`user_id` FROM `UserRole` ur JOIN `tmp_125_roles` t ON t.`role_id` = ur.`role_id`) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (SELECT DISTINCT g.`user_id` FROM `AccessGrant` g JOIN `tmp_125_roles` t ON t.`role_id` = g.`role_id` WHERE g.`status` = 'ACTIVE') h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

DROP TEMPORARY TABLE IF EXISTS `tmp_125_roles`;
