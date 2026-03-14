-- Migration: Add validation fields to SchemeOfWorkEntry
-- Created at: 2026-03-13

ALTER TABLE `SchemeOfWorkEntry`
ADD COLUMN `validation_status` enum('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING' AFTER `is_completed`,
ADD COLUMN `validation_comment` text AFTER `validation_status`;
