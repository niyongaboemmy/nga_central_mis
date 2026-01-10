-- ============================================
-- Add SUPER_ADMIN_DASHBOARD Permission Migration
-- ============================================

-- Remove the old role if it exists (in case it was created as a role)
DELETE FROM `Role` WHERE `name` = 'SUPER_ADMIN_DASHBOARD';

-- Insert the SUPER_ADMIN_DASHBOARD permission
INSERT INTO `Permission` (`name`, `description`, `status`) VALUES
('SUPER_ADMIN_DASHBOARD', 'Permission for super admin dashboard access with overall system overview', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  `description` = VALUES(`description`),
  `status` = VALUES(`status`);