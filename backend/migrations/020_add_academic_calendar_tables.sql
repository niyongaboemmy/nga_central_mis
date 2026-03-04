-- Academic Calendar Module
-- This migration adds support for weekly calendar with subject assignments

-- CalendarSlot table: Stores individual time slots for subjects in the weekly calendar
CREATE TABLE IF NOT EXISTS CalendarSlot (
  slot_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  academic_term_id BIGINT NOT NULL,
  class_group_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL COMMENT 'Instructor assigned to this slot',
  day_of_week TINYINT NOT NULL COMMENT '0=Sunday, 1=Monday, ..., 6=Saturday',
  start_time VARCHAR(10) NOT NULL COMMENT 'HH:MM format',
  end_time VARCHAR(10) NOT NULL COMMENT 'HH:MM format',
  location VARCHAR(100) COMMENT 'Room or location',
  color VARCHAR(7) DEFAULT '#3B82F6' COMMENT 'Calendar event color',
  notes TEXT,
  is_active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (academic_term_id) REFERENCES AcademicTerm(academic_term_id),
  FOREIGN KEY (class_group_id) REFERENCES ClassGroup(class_group_id),
  FOREIGN KEY (subject_id) REFERENCES Subject(subject_id),
  FOREIGN KEY (user_id) REFERENCES User(user_id),
  UNIQUE KEY unique_slot (academic_term_id, class_group_id, day_of_week, start_time)
);

-- CalendarNotification table: Stores notification preferences for instructors
CREATE TABLE IF NOT EXISTS CalendarNotification (
  notification_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  notification_type VARCHAR(50) NOT NULL DEFAULT 'LESSON_STARTING' COMMENT 'LESSON_STARTING, REMINDER',
  minutes_before INT NOT NULL DEFAULT 30 COMMENT 'Minutes before lesson starts to send notification',
  is_enabled TINYINT DEFAULT 1,
  notification_method VARCHAR(20) DEFAULT 'IN_APP' COMMENT 'IN_APP, EMAIL, SMS',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES User(user_id),
  UNIQUE KEY unique_user_notification (user_id, notification_type, minutes_before)
);

-- CalendarActivity table: Stores non-subject activities (assemblies, breaks, etc.)
CREATE TABLE IF NOT EXISTS CalendarActivity (
  activity_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  academic_term_id BIGINT NOT NULL,
  class_group_id BIGINT,
  activity_name VARCHAR(150) NOT NULL,
  activity_type VARCHAR(50) NOT NULL COMMENT 'BREAK, ASSEMBLY, EXAM, EVENT, OTHER',
  day_of_week TINYINT COMMENT 'For recurring activities, NULL for one-time',
  start_date DATE COMMENT 'For one-time activities',
  end_date DATE COMMENT 'For one-time activities',
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  location VARCHAR(100),
  description TEXT,
  color VARCHAR(7) DEFAULT '#10B981',
  is_recurring TINYINT DEFAULT 1 COMMENT '1=weekly recurring, 0=one-time event',
  is_active TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (academic_term_id) REFERENCES AcademicTerm(academic_term_id),
  FOREIGN KEY (class_group_id) REFERENCES ClassGroup(class_group_id)
);

-- Add indexes for better performance
CREATE INDEX idx_calendar_slot_term ON CalendarSlot(academic_term_id);
CREATE INDEX idx_calendar_slot_class ON CalendarSlot(class_group_id);
CREATE INDEX idx_calendar_slot_instructor ON CalendarSlot(user_id);
CREATE INDEX idx_calendar_slot_day ON CalendarSlot(day_of_week);
CREATE INDEX idx_calendar_activity_term ON CalendarActivity(academic_term_id);
CREATE INDEX idx_calendar_notification_user ON CalendarNotification(user_id);
