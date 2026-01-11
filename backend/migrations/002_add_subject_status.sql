-- ============================================
-- Add Status Field to Subject Table Migration
-- ============================================

-- Add status column to Subject table
ALTER TABLE `Subject` ADD COLUMN `status` ENUM('ACTIVE', 'DISABLED') DEFAULT 'ACTIVE' AFTER `description`;