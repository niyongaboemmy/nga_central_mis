-- Add DATABASE_MANAGEMENT permission and grant it to SUPER_ADMIN
INSERT INTO `Permission` (`name`, `description`, `status`) VALUES
('DATABASE_MANAGEMENT', 'Permission to access the Database Management tool (browse/edit tables, run SQL queries)', 'ACTIVE')
ON DUPLICATE KEY UPDATE `description` = 'Permission to access the Database Management tool (browse/edit tables, run SQL queries)';

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.`role_id`, p.`perm_id`
FROM `Role` r
JOIN `Permission` p ON p.`name` = 'DATABASE_MANAGEMENT'
WHERE r.`name` = 'SUPER_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp
    WHERE rp.`role_id` = r.`role_id` AND rp.`perm_id` = p.`perm_id`
  );
