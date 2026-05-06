-- ============================================
-- Add TEACHER_DASHBOARD Permission Migration
-- ============================================

-- Insert the TEACHER_DASHBOARD permission
INSERT INTO `Permission` (`name`, `description`, `status`) VALUES
('TEACHER_DASHBOARD', 'Permission for teachers to access their personalized dashboard with relevant information and summaries', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `status` = VALUES(`status`);