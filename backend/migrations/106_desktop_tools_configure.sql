-- 106: DESKTOP_TOOLS_CONFIGURE — who changes NGA Desktop's game settings
-- (switches, budgets, quiet hours). Granted to the super admin, head teacher and
-- school administrator presets. Igisoro's approval is checked separately: super
-- admin only. Idempotent; MySQL 5.7 and 8.

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'DESKTOP_TOOLS_CONFIGURE', 'Configure NGA Desktop tools and games', 'ACTIVE', 'mis', 'DESKTOP_TOOLS_CONFIGURE', 'Configure NGA Desktop tools and games', 'SYSTEM', 'WRITE', NULL, 0, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'DESKTOP_TOOLS_CONFIGURE' OR p.`name` = 'DESKTOP_TOOLS_CONFIGURE'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'DESKTOP_TOOLS_CONFIGURE' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM (
  SELECT 'platform_owner' AS preset, 'SUPER_ADMIN' AS legacy
  UNION ALL SELECT 'head_teacher', 'HEAD_TEACHER'
  UNION ALL SELECT 'school_administrator', 'ADMIN'
) l
JOIN `Role` r ON (r.`preset_key` = l.preset OR (r.`preset_key` IS NULL AND r.`name` = l.legacy))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'DESKTOP_TOOLS_CONFIGURE'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT 'platform_owner', 'DESKTOP_TOOLS_CONFIGURE'
UNION ALL SELECT 'head_teacher', 'DESKTOP_TOOLS_CONFIGURE'
UNION ALL SELECT 'school_administrator', 'DESKTOP_TOOLS_CONFIGURE';
