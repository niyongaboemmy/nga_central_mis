-- ============================================
-- Add VIEW_MY_ASSIGNED_SUBJECTS Permission Migration
-- ============================================

-- Insert the VIEW_MY_ASSIGNED_SUBJECTS permission
INSERT INTO `Permission` (`name`, `description`, `status`) VALUES
('VIEW_MY_ASSIGNED_SUBJECTS', 'Permission for teachers to view their assigned subjects, grades, and enrolled students', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `status` = VALUES(`status`);