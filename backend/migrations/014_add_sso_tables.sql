-- Migration: Add SSO tables for cross-domain authentication
-- Description: Creates SSOClient and SSOCode tables

CREATE TABLE IF NOT EXISTS `SSOClient` (
  `client_id` VARCHAR(100) NOT NULL,
  `client_secret` VARCHAR(255) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `allowed_redirect_uris` TEXT NOT NULL,
  `status` ENUM('ACTIVE', 'DISABLED') DEFAULT 'ACTIVE',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SSOCode` (
  `code_id` BIGINT AUTO_INCREMENT NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `client_id` VARCHAR(100) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `is_used` TINYINT DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code_id`),
  UNIQUE KEY `code_unique_idx` (`code`),
  CONSTRAINT `SSOCode_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `SSOCode_client_id_fk` FOREIGN KEY (`client_id`) REFERENCES `SSOClient` (`client_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
