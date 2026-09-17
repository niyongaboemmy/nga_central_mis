-- ============================================
-- Document sharing fixes + generic notifications
-- ============================================
-- 1. FolderPermission was missing DOWNLOAD from its enum even though the
--    Share modal offers "Download" identically for files and folders.
-- 2. DocumentShareLink backs a real (authenticated-only) "anyone with the
--    link" flow for the modal's Links tab, replacing the previous
--    client-only constructed URL that had no server-side row at all.
-- 3. Notification is a generic inbox table (not just for documents) so a
--    share produces a visible, dismissible alert for the recipient.

ALTER TABLE `FolderPermission`
  MODIFY COLUMN `permission_type` ENUM('VIEW', 'EDIT', 'DOWNLOAD', 'SHARE') DEFAULT 'VIEW';

CREATE TABLE IF NOT EXISTS `DocumentShareLink` (
  `link_id` BIGINT NOT NULL AUTO_INCREMENT,
  `document_id` BIGINT DEFAULT NULL,
  `folder_id` BIGINT DEFAULT NULL,
  `token` VARCHAR(64) NOT NULL,
  `permission_type` ENUM('VIEW', 'DOWNLOAD') DEFAULT 'VIEW',
  `created_by` BIGINT NOT NULL,
  `expires_at` DATETIME DEFAULT NULL,
  `revoked_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`link_id`),
  UNIQUE KEY `uq_document_share_link_token` (`token`),
  KEY `fk_share_link_document` (`document_id`),
  KEY `fk_share_link_folder` (`folder_id`),
  KEY `fk_share_link_created_by` (`created_by`),
  CONSTRAINT `fk_share_link_document` FOREIGN KEY (`document_id`) REFERENCES `Document` (`document_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_share_link_folder` FOREIGN KEY (`folder_id`) REFERENCES `DocumentFolder` (`folder_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_share_link_created_by` FOREIGN KEY (`created_by`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_share_link_target` CHECK (
    (`document_id` IS NOT NULL AND `folder_id` IS NULL) OR
    (`document_id` IS NULL AND `folder_id` IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Notification` (
  `notification_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `kind` VARCHAR(50) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `body` VARCHAR(500) DEFAULT NULL,
  `link` VARCHAR(500) DEFAULT NULL,
  `subject_type` VARCHAR(50) DEFAULT NULL,
  `subject_id` BIGINT DEFAULT NULL,
  `actor_id` BIGINT DEFAULT NULL,
  `read_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  KEY `fk_notification_user` (`user_id`),
  KEY `fk_notification_actor` (`actor_id`),
  KEY `idx_notification_user_created` (`user_id`, `created_at`),
  CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notification_actor` FOREIGN KEY (`actor_id`) REFERENCES `User` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dedupe key: re-sharing the same item with the same person bumps the
-- existing row (via upsert in application code) instead of stacking
-- duplicate unread notifications.
ALTER TABLE `Notification`
  ADD UNIQUE KEY `uq_notification_dedupe` (`user_id`, `kind`, `subject_type`, `subject_id`);
