-- ============================================
-- User Documents Management Migration Script
-- For cPanel MySQL Database
-- ============================================

-- DocumentFolder table - for user folders
CREATE TABLE IF NOT EXISTS `DocumentFolder` (
  `folder_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `parent_folder_id` BIGINT DEFAULT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` VARCHAR(500) DEFAULT NULL,
  `color` VARCHAR(7) DEFAULT '#008d3b',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`folder_id`),
  KEY `fk_document_folder_user` (`user_id`),
  KEY `fk_document_folder_parent` (`parent_folder_id`),
  CONSTRAINT `fk_document_folder_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_document_folder_parent` FOREIGN KEY (`parent_folder_id`) REFERENCES `DocumentFolder` (`folder_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Document table - for file storage
CREATE TABLE IF NOT EXISTS `Document` (
  `document_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `folder_id` BIGINT DEFAULT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `file_extension` VARCHAR(20) NOT NULL,
  `is_public` TINYINT DEFAULT 0,
  `description` VARCHAR(500) DEFAULT NULL,
  `tags` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  KEY `fk_document_user` (`user_id`),
  KEY `fk_document_folder` (`folder_id`),
  CONSTRAINT `fk_document_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_document_folder` FOREIGN KEY (`folder_id`) REFERENCES `DocumentFolder` (`folder_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DocumentVersion table - for version control
CREATE TABLE IF NOT EXISTS `DocumentVersion` (
  `version_id` BIGINT NOT NULL AUTO_INCREMENT,
  `document_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `version_number` INT NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `change_description` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version_id`),
  KEY `fk_version_document` (`document_id`),
  KEY `fk_version_user` (`user_id`),
  CONSTRAINT `fk_version_document` FOREIGN KEY (`document_id`) REFERENCES `Document` (`document_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_version_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DocumentPermission table - for sharing documents
CREATE TABLE IF NOT EXISTS `DocumentPermission` (
  `permission_id` BIGINT NOT NULL AUTO_INCREMENT,
  `document_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `permission_type` ENUM('VIEW', 'EDIT', 'DOWNLOAD', 'SHARE') DEFAULT 'VIEW',
  `shared_by` BIGINT NOT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`permission_id`),
  KEY `fk_perm_document` (`document_id`),
  KEY `fk_perm_user` (`user_id`),
  KEY `fk_perm_shared_by` (`shared_by`),
  CONSTRAINT `fk_perm_document` FOREIGN KEY (`document_id`) REFERENCES `Document` (`document_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_perm_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_perm_shared_by` FOREIGN KEY (`shared_by`) REFERENCES `User` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add shared_with column to DocumentPermission if not exists
ALTER TABLE `DocumentPermission` ADD COLUMN `shared_with` ENUM('user', 'role') DEFAULT 'user' AFTER `shared_by`;

-- FolderPermission table - for sharing folders
CREATE TABLE IF NOT EXISTS `FolderPermission` (
  `permission_id` BIGINT NOT NULL AUTO_INCREMENT,
  `folder_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `permission_type` ENUM('VIEW', 'EDIT', 'SHARE') DEFAULT 'VIEW',
  `shared_by` BIGINT NOT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`permission_id`),
  KEY `fk_folder_perm_folder` (`folder_id`),
  KEY `fk_folder_perm_user` (`user_id`),
  KEY `fk_folder_perm_shared_by` (`shared_by`),
  CONSTRAINT `fk_folder_perm_folder` FOREIGN KEY (`folder_id`) REFERENCES `DocumentFolder` (`folder_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_folder_perm_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_folder_perm_shared_by` FOREIGN KEY (`shared_by`) REFERENCES `User` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Sample Queries for Testing
-- ============================================

-- Get all folders for a user
-- SELECT * FROM DocumentFolder WHERE user_id = 1 ORDER BY name ASC;

-- Get all documents for a user
-- SELECT * FROM Document WHERE user_id = 1 ORDER BY created_at DESC;

-- Get documents in a specific folder
-- SELECT * FROM Document WHERE folder_id = 1 ORDER BY created_at DESC;

-- Get document versions
-- SELECT * FROM DocumentVersion WHERE document_id = 1 ORDER BY version_number DESC;

-- Get shared documents for a user
-- SELECT d.*, dp.permission_type FROM Document d
-- INNER JOIN DocumentPermission dp ON d.document_id = dp.document_id
-- WHERE dp.user_id = 1 AND (dp.expires_at IS NULL OR dp.expires_at > NOW());
