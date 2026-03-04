-- Academic Calendar Restructuring
-- This migration creates an AcademicCalendar table to associate a calendar with a specific
-- academic year, term, and class group. Class group is removed from individual slots.

-- Create AcademicCalendar table to store calendar-level class group association
CREATE TABLE IF NOT EXISTS AcademicCalendar (
  calendar_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  academic_year_id BIGINT NOT NULL,
  academic_term_id BIGINT NOT NULL,
  class_group_id BIGINT NOT NULL,
  name VARCHAR(150) COMMENT 'Optional name for the calendar',
  description TEXT,
  is_active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (academic_year_id) REFERENCES AcademicYear(academic_year_id),
  FOREIGN KEY (academic_term_id) REFERENCES AcademicTerm(academic_term_id),
  FOREIGN KEY (class_group_id) REFERENCES ClassGroup(class_group_id),
  UNIQUE KEY unique_calendar (academic_year_id, academic_term_id, class_group_id)
);

-- Add indexes for better performance
CREATE INDEX idx_academic_calendar_year ON AcademicCalendar(academic_year_id);
CREATE INDEX idx_academic_calendar_term ON AcademicCalendar(academic_term_id);
CREATE INDEX idx_academic_calendar_class ON AcademicCalendar(class_group_id);

-- Add calendar_id to CalendarSlot (nullable for backward compatibility)
ALTER TABLE CalendarSlot ADD COLUMN calendar_id BIGINT;
ALTER TABLE CalendarSlot ADD FOREIGN KEY (calendar_id) REFERENCES AcademicCalendar(calendar_id);
CREATE INDEX idx_calendar_slot_calendar ON CalendarSlot(calendar_id);

-- Make class_group_id nullable in CalendarSlot (will be deprecated)
ALTER TABLE CalendarSlot MODIFY COLUMN class_group_id BIGINT NULL;

-- Make academic_term_id nullable in CalendarSlot (will be managed through calendar)
ALTER TABLE CalendarSlot MODIFY COLUMN academic_term_id BIGINT NULL;
