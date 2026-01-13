-- Add granular permissions for UserDetails Modal actions

-- Insert new permissions for user management actions
INSERT INTO Permission (name, description, status) VALUES
('ENABLE_DISABLE_USERS', 'Can enable or disable user accounts', 'ACTIVE'),
('CHANGE_USER_ROLES', 'Can change user roles and assign roles to users', 'ACTIVE'),
('MANAGE_PROGRAM_LEADS', 'Can assign and remove program leads', 'ACTIVE'),
('ASSIGN_TEACHER_SUBJECTS', 'Can assign and remove subjects from teachers', 'ACTIVE'),
('MANAGE_STUDENT_ENROLLMENTS', 'Can enroll and unenroll students from subjects', 'ACTIVE'),
('ASSIGN_STUDENT_CLASS_GROUPS', 'Can assign and remove students from class groups', 'ACTIVE');