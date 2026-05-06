-- Add granular calendar permissions for creating calendars and updating slots
INSERT IGNORE INTO Permission (name, description, status) VALUES 
('CREATE_ACADEMIC_CALENDAR', 'Can create new academic calendars for a class group', 'ACTIVE'),
('UPDATE_CALENDAR_SLOT', 'Can create and update calendar slot details (subject/teacher/time)', 'ACTIVE');
