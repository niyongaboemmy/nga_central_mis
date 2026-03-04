-- Calendar Academic Year Support and Student View Enhancement
-- This migration adds:
-- 1. academic_year_id to CalendarSlot for better filtering
-- 2. Permissions for students to view their calendar
-- 3. Additional indexes for better performance

-- Add academic_year_id to CalendarSlot table
ALTER TABLE CalendarSlot 
ADD COLUMN academic_year_id BIGINT,
ADD FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id);

-- Add academic_year_id to CalendarActivity table
ALTER TABLE CalendarActivity 
ADD COLUMN academic_year_id BIGINT,
ADD FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id);

-- Add student calendar permissions
INSERT IGNORE INTO Permission (name, description, status) VALUES 
('VIEW_STUDENT_CALENDAR', 'Student can view their enrolled subjects calendar', 'ACTIVE');

-- Update existing CalendarSlot rows with academic_year_id from AcademicTerm
UPDATE CalendarSlot cs
INNER JOIN AcademicTerm at ON cs.academic_term_id = at.academic_term_id
SET cs.academic_year_id = at.academic_year_id;

-- Update existing CalendarActivity rows with academic_year_id from AcademicTerm
UPDATE CalendarActivity ca
INNER JOIN AcademicTerm at ON ca.academic_term_id = at.academic_term_id
SET ca.academic_year_id = at.academic_year_id;

-- Add indexes for better performance
CREATE INDEX idx_calendar_slot_year ON CalendarSlot(academic_year_id);
CREATE INDEX idx_calendar_activity_year ON CalendarActivity(academic_year_id);
