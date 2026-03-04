-- Add new lesson plan permissions
INSERT INTO `Permission` (`name`, `description`, `group`) VALUES 
('VIEW_CALENDAR_SUBJECT_LESSON_PLAN', 'View full details of a course lesson plan from the academic calendar', 'calendar'),
('STUDENT_VIEW_LESSON_PLAN_SUMMARY', 'View a summary (title and big question) of a course lesson plan', 'calendar')
ON DUPLICATE KEY UPDATE `group` = 'calendar';
