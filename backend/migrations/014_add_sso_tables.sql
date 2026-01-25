-- Migration: Add SSO fields to System table and create SSOCode table
-- Description: Extends the System table with SSO capabilities

-- Add SSO columns to System table
ALTER TABLE `System` 
ADD COLUMN `client_id` VARCHAR(100) UNIQUE AFTER `description`,
ADD COLUMN `client_secret` VARCHAR(255) AFTER `client_id`,
ADD COLUMN `allowed_redirect_uris` TEXT AFTER `client_secret`,
ADD COLUMN `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP AFTER `status`;

-- Create SSOCode table for authorization code flow
CREATE TABLE IF NOT EXISTS `SSOCode` (
  `code_id` BIGINT AUTO_INCREMENT NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `system_id` BIGINT NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `is_used` TINYINT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code_id`),
  UNIQUE KEY `code_unique_idx` (`code`),
  CONSTRAINT `SSOCode_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `SSOCode_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System` (`system_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add MANAGE_SSO_CLIENTS permission
INSERT INTO `Permission` (`name`, `description`, `status`) 
VALUES ('MANAGE_SSO_CLIENTS', 'Manage SSO client applications and their callback URIs', 'ACTIVE')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
