-- Add new permissions for Multi-Tenancy
INSERT INTO `Permission` (`name`, `description`, `status`) VALUES 
('MANAGE_SCHOOLS', 'Permission to manage schools/tenants', 'ACTIVE'),
('MANAGE_SYSTEMS', 'Permission to manage systems/modules', 'ACTIVE'),
('ASSIGN_SCHOOL_SYSTEMS', 'Permission to assign systems to schools and roles', 'ACTIVE');

-- Assign these permissions to the ADMIN role (assuming role_id 1 is ADMIN or finding it by name)
-- Using subqueries to be safe
INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name IN ('MANAGE_SCHOOLS', 'MANAGE_SYSTEMS', 'ASSIGN_SCHOOL_SYSTEMS')
WHERE r.name = 'ADMIN';

-- Also assign to SUPER_ADMIN if it exists (optional but good practice)
INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name IN ('MANAGE_SCHOOLS', 'MANAGE_SYSTEMS', 'ASSIGN_SCHOOL_SYSTEMS')
WHERE r.name = 'SUPER_ADMIN';
