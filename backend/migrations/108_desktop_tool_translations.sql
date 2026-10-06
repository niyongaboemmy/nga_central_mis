-- 108: NGA Desktop tools — translation workspace (nga-desktop TOOLS_HUB plan §6.3.1).
--
--   DesktopToolTranslation         one edited string per language and key: text,
--                                  status (draft | ai_draft | approved) and the hash
--                                  of the English text it translates (so a changed
--                                  English source makes it "outdated").
--   DesktopToolTranslationRelease  each Publish: a numbered snapshot of the approved
--                                  strings of one language. Desktops apply the latest.
--   + capability TOOLS_TRANSLATIONS_MANAGE (super admin and school administrator
--     presets by default; grantable to any role or person through Access Studio).
--
-- Idempotent; MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `DesktopToolTranslation` (
  `lang` VARCHAR(8) NOT NULL,
  `string_key` VARCHAR(128) NOT NULL,
  `text` TEXT NOT NULL,
  `status` VARCHAR(10) NOT NULL,
  `source_hash` CHAR(8) NOT NULL,
  `updated_by` BIGINT NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approved_by` BIGINT NULL,
  `approved_at` DATETIME NULL,
  PRIMARY KEY (`lang`, `string_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `DesktopToolTranslationRelease` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lang` VARCHAR(8) NOT NULL,
  `strings` LONGTEXT NOT NULL,
  `count` INT UNSIGNED NOT NULL,
  `note` VARCHAR(200) NULL,
  `published_by` BIGINT NOT NULL,
  `published_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_desktop_tr_release_lang` (`lang`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT 'TOOLS_TRANSLATIONS_MANAGE', 'Review and publish NGA Desktop tool translations', 'ACTIVE', 'mis', 'TOOLS_TRANSLATIONS_MANAGE', 'Review and publish NGA Desktop tool translations', 'SYSTEM', 'WRITE', NULL, 0, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = 'TOOLS_TRANSLATIONS_MANAGE' OR p.`name` = 'TOOLS_TRANSLATIONS_MANAGE'));

UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` = 'TOOLS_TRANSLATIONS_MANAGE' AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, NULL
FROM (
  SELECT 'platform_owner' AS preset, 'SUPER_ADMIN' AS legacy
  UNION ALL SELECT 'school_administrator', 'ADMIN'
) l
JOIN `Role` r ON (r.`preset_key` = l.preset OR (r.`preset_key` IS NULL AND r.`name` = l.legacy))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = 'TOOLS_TRANSLATIONS_MANAGE'
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT 'platform_owner', 'TOOLS_TRANSLATIONS_MANAGE'
UNION ALL SELECT 'school_administrator', 'TOOLS_TRANSLATIONS_MANAGE';
