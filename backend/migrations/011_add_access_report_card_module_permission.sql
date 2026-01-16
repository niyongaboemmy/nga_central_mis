-- ============================================
-- Add ACCESS_REPORT_CARD_MODULE Permission Migration
-- ============================================

-- Insert the ACCESS_REPORT_CARD_MODULE permission
INSERT INTO `Permission` (`name`, `description`, `status`) VALUES
('ACCESS_REPORT_CARD_MODULE', 'Permission to access the report card module', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `status` = VALUES(`status`);