-- 140: Side projects -- "Set up with AI" when creating a project.
--
--   SIDE_PROJECTS_AI_SETUP  upload every document about a project you are about to create, add an
--                      extra prompt, and let AI read them and fill in the whole project (idea,
--                      concept note, dates, plan, tasks, document slots). Every role except the
--                      students' (the service also refuses student accounts). Legacy-visible like
--                      SIDE_PROJECTS_MANAGE_OWN; no role keyword in the name. The school AI switch
--                      still applies (AI_USAGE_CONTROL_PLAN.md).
-- No tables: drafts live in memory until the project is created. Idempotent; MySQL 5.7 and 8.

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'SIDE_PROJECTS_AI_SETUP', 'Set up a new project from its documents with AI', 'ACTIVE', 'mis', 'SIDE_PROJECTS_AI_SETUP',
       'Set up a new project from its documents with AI', 'ACADEMICS', 'WRITE', NULL, 0, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'SIDE_PROJECTS_AI_SETUP' OR p.`name` = 'SIDE_PROJECTS_AI_SETUP'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'SIDE_PROJECTS_AI_SETUP' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM `Role` r
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'SIDE_PROJECTS_AI_SETUP'
WHERE r.`name` <> 'STUDENT'
  AND (r.`preset_key` IS NULL OR r.`preset_key` <> 'student')
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT DISTINCT r.`preset_key`, 'SIDE_PROJECTS_AI_SETUP'
FROM `Role` r
WHERE r.`preset_key` IS NOT NULL AND r.`preset_key` <> 'student';

UPDATE `User` u
JOIN (
  SELECT DISTINCT ur.`user_id` FROM `UserRole` ur
  JOIN `RolePermission` rp ON rp.`role_id` = ur.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'SIDE_PROJECTS_AI_SETUP'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id` FROM `AccessGrant` g
  JOIN `RolePermission` rp ON rp.`role_id` = g.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'SIDE_PROJECTS_AI_SETUP'
  WHERE g.`status` = 'ACTIVE'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;
