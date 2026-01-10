-- ============================================
-- Add force_password_change to AuthCredential Migration
-- ============================================

-- Add force_password_change column to AuthCredential table
ALTER TABLE `AuthCredential` ADD COLUMN `force_password_change` TINYINT(1) DEFAULT 0 AFTER `password_hash`;