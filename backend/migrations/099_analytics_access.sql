-- 099: Guarantee Usage & Monitoring access to the platform's administrators.
--
-- 095 created the analytics tables but left the capabilities to the boot-time
-- manifest sync, and those only reach a person through an ACTIVE access-control
-- v2 grant. An administrator who still holds the legacy SUPER_ADMIN / ADMIN role
-- but never received the matching grant (backfill not applied, account created
-- later) was refused the live monitor and the person pages. This migration:
--
--   1) creates the seven capabilities if the manifest sync has not run yet;
--   2) links them to the roles that should hold them:
--        SUPER_ADMIN (platform_owner)    everything
--        ADMIN (school_administrator)    view, live, person view, locations, insights
--        IT Support (it_support)         view, live
--   3) gives every ACTIVE holder of the legacy SUPER_ADMIN / ADMIN role the v2
--      grant they are missing (PLATFORM / SCHOOL, source MIGRATION), unless an
--      operator ended or suspended it on purpose;
--   4) bumps access_version for those holders so cached snapshots refresh.
--
-- Idempotent (NOT EXISTS / INSERT IGNORE); MySQL 5.7 and 8.

-- 1) Capabilities ----------------------------------------------------------
INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT c.name, c.label, 'ACTIVE', 'mis', c.name, c.label, c.domain, c.kind, c.depths, 0, c.scopeable
FROM (
  SELECT 'ANALYTICS_VIEW' AS name, 'View platform usage reports (aggregates)' AS label, 'SYSTEM' AS domain, 'READ' AS kind, 'summary,detail' AS depths, 0 AS scopeable
  UNION ALL SELECT 'ANALYTICS_LIVE_VIEW', 'See who is online right now (named)', 'SYSTEM', 'READ', 'detail', 0
  UNION ALL SELECT 'ANALYTICS_USER_VIEW', 'Open a person''s or visitor''s activity, IPs and devices', 'SYSTEM', 'READ', 'detail', 0
  UNION ALL SELECT 'ANALYTICS_LOCATION_VIEW', 'See precise (browser) location fixes', 'SYSTEM', 'READ', 'detail', 0
  UNION ALL SELECT 'ANALYTICS_USER_CONTROL', 'Sign out, suspend, message, watch or block people and devices', 'SYSTEM', 'WRITE', NULL, 0
  UNION ALL SELECT 'ANALYTICS_CONFIGURE', 'Configure analytics, retention, exclusions and data deletion', 'SYSTEM', 'WRITE', NULL, 0
  UNION ALL SELECT 'USAGE_INSIGHTS_VIEW', 'See how much the platform is used in your area (aggregates)', 'REPORTING', 'READ', 'summary', 1
) c
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = c.name OR p.`name` = c.name));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL
WHERE `app` = 'mis' AND `name` IN ('ANALYTICS_VIEW','ANALYTICS_LIVE_VIEW','ANALYTICS_USER_VIEW','ANALYTICS_LOCATION_VIEW','ANALYTICS_USER_CONTROL','ANALYTICS_CONFIGURE','USAGE_INSIGHTS_VIEW');

-- 2) Role links ------------------------------------------------------------
-- RolePermission has no primary key on older databases, so INSERT IGNORE would
-- duplicate links: guard with NOT EXISTS.
INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, l.depth
FROM (
  SELECT 'platform_owner' AS preset, 'SUPER_ADMIN' AS legacy, 'ANALYTICS_VIEW' AS cap, 'detail' AS depth
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'ANALYTICS_LIVE_VIEW', 'detail'
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'ANALYTICS_USER_VIEW', 'detail'
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'ANALYTICS_LOCATION_VIEW', 'detail'
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'ANALYTICS_USER_CONTROL', NULL
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'ANALYTICS_CONFIGURE', NULL
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'USAGE_INSIGHTS_VIEW', 'summary'
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'ANALYTICS_VIEW', 'detail'
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'ANALYTICS_LIVE_VIEW', 'detail'
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'ANALYTICS_USER_VIEW', 'detail'
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'ANALYTICS_LOCATION_VIEW', 'detail'
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'USAGE_INSIGHTS_VIEW', 'summary'
  UNION ALL SELECT 'it_support', NULL, 'ANALYTICS_VIEW', 'detail'
  UNION ALL SELECT 'it_support', NULL, 'ANALYTICS_LIVE_VIEW', 'detail'
) l
JOIN `Role` r ON (r.`preset_key` = l.preset OR (r.`preset_key` IS NULL AND r.`name` = l.legacy))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = l.cap
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

-- Record them as applied so the boot-time preset sync does not re-add a link
-- an operator later removes in Access Studio.
INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT 'platform_owner', n.cap FROM (
  SELECT 'ANALYTICS_VIEW' AS cap UNION ALL SELECT 'ANALYTICS_LIVE_VIEW' UNION ALL SELECT 'ANALYTICS_USER_VIEW'
  UNION ALL SELECT 'ANALYTICS_LOCATION_VIEW' UNION ALL SELECT 'ANALYTICS_USER_CONTROL' UNION ALL SELECT 'ANALYTICS_CONFIGURE'
  UNION ALL SELECT 'USAGE_INSIGHTS_VIEW'
) n
UNION ALL
SELECT 'school_administrator', n.cap FROM (
  SELECT 'ANALYTICS_VIEW' AS cap UNION ALL SELECT 'ANALYTICS_LIVE_VIEW' UNION ALL SELECT 'ANALYTICS_USER_VIEW'
  UNION ALL SELECT 'ANALYTICS_LOCATION_VIEW' UNION ALL SELECT 'USAGE_INSIGHTS_VIEW'
) n
UNION ALL
SELECT 'it_support', n.cap FROM (SELECT 'ANALYTICS_VIEW' AS cap UNION ALL SELECT 'ANALYTICS_LIVE_VIEW') n;

-- 3) Missing grants for legacy role holders ---------------------------------
CREATE TEMPORARY TABLE `tmp_099_grants` (
  `user_id` BIGINT NOT NULL,
  `role_id` BIGINT NOT NULL,
  `scope_type` VARCHAR(20) NOT NULL,
  `title` VARCHAR(150) NULL,
  PRIMARY KEY (`user_id`, `role_id`)
);

INSERT IGNORE INTO `tmp_099_grants` (`user_id`, `role_id`, `scope_type`, `title`)
SELECT ur.`user_id`, r.`role_id`,
       CASE WHEN r.`preset_key` = 'platform_owner' OR r.`name` = 'SUPER_ADMIN' THEN 'PLATFORM' ELSE 'SCHOOL' END,
       r.`name`
FROM `UserRole` ur
JOIN `Role` r ON r.`role_id` = ur.`role_id`
JOIN `User` u ON u.`user_id` = ur.`user_id`
WHERE (r.`preset_key` IN ('platform_owner','school_administrator') OR (r.`preset_key` IS NULL AND r.`name` IN ('SUPER_ADMIN','ADMIN')))
  AND (r.`status` IS NULL OR r.`status` = 'ACTIVE')
  AND u.`status` = 'ACTIVE'
  -- Any earlier grant of this role (even ended or suspended) means an operator
  -- has already decided; never resurrect it here.
  AND NOT EXISTS (SELECT 1 FROM `AccessGrant` g WHERE g.`user_id` = ur.`user_id` AND g.`role_id` = r.`role_id`);

INSERT INTO `AccessGrant` (`user_id`, `role_id`, `school_id`, `scope_type`, `scope_id`, `title`, `justification`, `source`, `source_ref`, `status`)
SELECT t.`user_id`, t.`role_id`,
       COALESCE((SELECT s.`school_id` FROM `School` s WHERE s.`status` = 'ACTIVE' ORDER BY s.`school_id` LIMIT 1), 1),
       t.`scope_type`, NULL, t.`title`, '099: legacy role holder without a v2 grant', 'MIGRATION',
       CONCAT('userrole:', t.`user_id`, ':', t.`role_id`), 'ACTIVE'
FROM `tmp_099_grants` t;

-- 4) Refresh cached snapshots of everyone holding these roles ---------------
UPDATE `User` u
JOIN (
  SELECT DISTINCT ur.`user_id`
  FROM `UserRole` ur JOIN `Role` r ON r.`role_id` = ur.`role_id`
  WHERE r.`preset_key` IN ('platform_owner','school_administrator','it_support') OR r.`name` IN ('SUPER_ADMIN','ADMIN')
  UNION
  SELECT DISTINCT g.`user_id`
  FROM `AccessGrant` g JOIN `Role` r ON r.`role_id` = g.`role_id`
  WHERE g.`status` = 'ACTIVE' AND r.`preset_key` IN ('platform_owner','school_administrator','it_support')
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

DROP TEMPORARY TABLE IF EXISTS `tmp_099_grants`;
