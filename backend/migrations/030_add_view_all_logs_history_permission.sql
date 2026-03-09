-- Add VIEW_ALL_LOGS_HISTORY permission
INSERT INTO `Permission` (`name`, `description`, `status`) VALUES
('VIEW_ALL_LOGS_HISTORY', 'Permission to view all system activity logs history', 'ACTIVE')
ON DUPLICATE KEY UPDATE `description` = 'Permission to view all system activity logs history';
