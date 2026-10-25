-- 121: AI usage control (AI_USAGE_CONTROL_PLAN.md §3, §4).
--
--   1) PlatformSetting, a generic key/value settings table, with the school-wide
--      AI policy row 'ai_policy'. Seeded with the master switch OFF: no AI runs
--      anywhere until the super admin turns it on in Settings -> AI.
--   2) Capabilities:
--        AI_USE            may use AI tools outside a quiz or assignment
--        AI_POLICY_MANAGE  may change the school-wide AI policy (restricted,
--                          platform owner / SUPER_ADMIN only)
--      Both are legacy-visible (not v2-only): the MIS still authorises through
--      req.user.permissions in shadow mode, and spokes read the SSO list.
--   3) AI_USE for the teaching, academic leadership, administration, mentor and
--      counsellor roles (plan §3.2). Students, parents and support staff get none.
--   4) AccessPresetLink rows so the boot-time preset sync never re-adds a link an
--      operator later removes in Access Studio.
--   5) access_version bump for every holder of an affected role, so cached access
--      snapshots refresh at once instead of 403-ing for five minutes.
--
-- Idempotent (NOT EXISTS / INSERT IGNORE); MySQL 5.7 and 8.

-- 1) Settings ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `PlatformSetting` (
  `setting_key` VARCHAR(64) NOT NULL,
  `value` JSON NOT NULL,
  `updated_by` INT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
);

INSERT IGNORE INTO `PlatformSetting` (`setting_key`, `value`) VALUES
  -- One JSON literal: MySQL 5.7's JSON_OBJECT turns some `false` arguments into 0.
  ('ai_policy', CAST('{"v": 1, "enabled": false, "apps": {"mis": true, "tm": true, "tmcode": true, "desktop": true, "tupo": true, "da": true}, "features": {"grading": false}, "assessments": "teacher", "thirdPartyExtensions": false}' AS JSON));

-- 2) Capabilities --------------------------------------------------------------
INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT c.name, c.label, 'ACTIVE', 'mis', c.name, c.label, 'SYSTEM', 'WRITE', NULL, c.restricted, 0
FROM (
  SELECT 'AI_USE' AS name, 'Use AI tools (outside quizzes and assignments)' AS label, 0 AS restricted
  UNION ALL SELECT 'AI_POLICY_MANAGE', 'Turn AI on or off for the school and its apps', 1
) c
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = c.name OR p.`name` = c.name));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` IN ('AI_USE', 'AI_POLICY_MANAGE') AND (`app` IS NULL OR `app` = 'mis');

-- 3) Role links ----------------------------------------------------------------
-- RolePermission has no primary key on older databases: guard with NOT EXISTS.
CREATE TEMPORARY TABLE `tmp_121_links` (
  `preset` VARCHAR(64) NOT NULL,
  `legacy` VARCHAR(64) NULL,
  `cap` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`preset`, `cap`)
);

INSERT IGNORE INTO `tmp_121_links` (`preset`, `legacy`, `cap`) VALUES
  ('platform_owner', 'SUPER_ADMIN', 'AI_USE'),
  ('platform_owner', 'SUPER_ADMIN', 'AI_POLICY_MANAGE'),
  ('head_teacher', 'HEAD_TEACHER', 'AI_USE'),
  ('deputy_head_academics', NULL, 'AI_USE'),
  ('director_of_studies', NULL, 'AI_USE'),
  ('programme_coordinator', 'PROGRAM_MANAGER', 'AI_USE'),
  ('teaching_staff', 'TEACHER', 'AI_USE'),
  ('class_teacher', 'CLASS_TEACHER', 'AI_USE'),
  ('subject_teacher', NULL, 'AI_USE'),
  ('head_of_department', NULL, 'AI_USE'),
  ('grade_coordinator', NULL, 'AI_USE'),
  ('mentor', NULL, 'AI_USE'),
  ('counsellor', NULL, 'AI_USE'),
  ('school_administrator', 'ADMIN', 'AI_USE');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM `tmp_121_links` l
JOIN `Role` r ON (r.`preset_key` = l.`preset` OR (r.`preset_key` IS NULL AND l.`legacy` IS NOT NULL AND r.`name` = l.`legacy`))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = l.`cap`
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

-- 4) Applied preset links --------------------------------------------------------
INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT l.`preset`, l.`cap` FROM `tmp_121_links` l;

-- 5) Refresh cached snapshots of everyone holding these roles ---------------------
-- A temporary table cannot be opened twice in one statement (MySQL 5.7), so the
-- affected roles are collected first and the two kinds of holder bumped apart.
CREATE TEMPORARY TABLE `tmp_121_roles` (`role_id` BIGINT NOT NULL, PRIMARY KEY (`role_id`));

INSERT IGNORE INTO `tmp_121_roles` (`role_id`)
SELECT r.`role_id`
FROM `tmp_121_links` l
JOIN `Role` r ON (r.`preset_key` = l.`preset` OR (r.`preset_key` IS NULL AND l.`legacy` IS NOT NULL AND r.`name` = l.`legacy`));

UPDATE `User` u
JOIN (
  SELECT DISTINCT ur.`user_id`
  FROM `UserRole` ur
  JOIN `tmp_121_roles` t ON t.`role_id` = ur.`role_id`
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id`
  FROM `AccessGrant` g
  JOIN `tmp_121_roles` t ON t.`role_id` = g.`role_id`
  WHERE g.`status` = 'ACTIVE'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

DROP TEMPORARY TABLE IF EXISTS `tmp_121_roles`;
DROP TEMPORARY TABLE IF EXISTS `tmp_121_links`;
