-- 132: Side projects -- classification (Student project / NGA Delivery Studio project / Individual project).
--
--   SideProject.kind   STUDENT | DELIVERY_STUDIO | INDIVIDUAL. Students' projects are always
--                      STUDENT; the others choose (default INDIVIDUAL). Existing rows are classified
--                      from the owner's account type.
--   SIDE_PROJECTS_CLASSIFY  choose or change a project's classification. Every role except the
--                      students' and parents' (and the service also refuses student accounts).
--                      Legacy-visible like SIDE_PROJECTS_MANAGE_OWN; no role keyword in the name.
-- Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND COLUMN_NAME = 'kind') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD COLUMN `kind` ENUM(''STUDENT'',''DELIVERY_STUDIO'',''INDIVIDUAL'') NOT NULL DEFAULT ''INDIVIDUAL'' AFTER `status`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SideProject' AND INDEX_NAME = 'idx_sp_kind') > 0,
  'SELECT 1', 'ALTER TABLE `SideProject` ADD KEY `idx_sp_kind` (`kind`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Students' projects are Student projects.
UPDATE `SideProject` sp
JOIN `UserProfile` p ON p.`user_id` = sp.`owner_user_id`
SET sp.`kind` = 'STUDENT'
WHERE UPPER(p.`user_type`) = 'STUDENT' AND sp.`kind` <> 'STUDENT';

-- Permission ------------------------------------------------------------------------------------
INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'SIDE_PROJECTS_CLASSIFY', 'Choose a project''s classification (student, Delivery Studio, individual)', 'ACTIVE', 'mis', 'SIDE_PROJECTS_CLASSIFY',
       'Choose a project''s classification (student, Delivery Studio, individual)', 'ACADEMICS', 'WRITE', NULL, 0, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'SIDE_PROJECTS_CLASSIFY' OR p.`name` = 'SIDE_PROJECTS_CLASSIFY'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'SIDE_PROJECTS_CLASSIFY' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM `Role` r
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'SIDE_PROJECTS_CLASSIFY'
WHERE r.`name` NOT IN ('STUDENT', 'PARENT')
  AND (r.`preset_key` IS NULL OR r.`preset_key` NOT IN ('student', 'parent'))
  AND NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT DISTINCT r.`preset_key`, 'SIDE_PROJECTS_CLASSIFY'
FROM `Role` r
WHERE r.`preset_key` IS NOT NULL AND r.`preset_key` NOT IN ('student', 'parent');

UPDATE `User` u
JOIN (
  SELECT DISTINCT ur.`user_id` FROM `UserRole` ur
  JOIN `RolePermission` rp ON rp.`role_id` = ur.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'SIDE_PROJECTS_CLASSIFY'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;

UPDATE `User` u
JOIN (
  SELECT DISTINCT g.`user_id` FROM `AccessGrant` g
  JOIN `RolePermission` rp ON rp.`role_id` = g.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id` AND p.`name` = 'SIDE_PROJECTS_CLASSIFY'
  WHERE g.`status` = 'ACTIVE'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;
