-- Insert calendar module permissions
INSERT IGNORE INTO Permission (name, description, status) VALUES 
('MANAGE_ACADEMIC_CALENDAR', 'Can create, update, and delete calendar slots and activities', 'ACTIVE'),
('VIEW_ACADEMIC_CALENDAR', 'Can view the academic calendar', 'ACTIVE'),
('MANAGE_CALENDAR_NOTIFICATIONS', 'Can manage notification preferences for calendar', 'ACTIVE'),
('VIEW_CALENDAR_NOTIFICATIONS', 'Can view notification preferences', 'ACTIVE'),
('VIEW_MY_CALENDAR', 'Can view personal calendar with assigned subjects', 'ACTIVE'),
('VIEW_LESSON_PLANS', 'Can view lesson plans from calendar', 'ACTIVE');
