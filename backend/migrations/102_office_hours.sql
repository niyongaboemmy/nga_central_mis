-- 102: Mandatory office hours (OFFICE_HOURS_IMPLEMENTATION_PLAN.md §6).
--
-- The bell schedule reserves 16:20-17:20 every weekday for office hours, but
-- nothing could be stored there: teachers could not name the students who must
-- come, nothing stopped two teachers summoning the same student, and nobody
-- recorded who came. This migration adds:
--
--   OfficeHourSetting          one row of school-wide policy (lock mode, band, thresholds)
--   OfficeHourSchedule (+Day)  a teacher's recurring office hours inside one term
--   OfficeHourAssignment       student <-> schedule, soft-closed, never deleted
--   OfficeHourStudentLock      the no-overlap guarantee: PK (term, student, weekday).
--                              TERM mode locks days 1-5, WEEKDAY mode the meeting days,
--                              so a race between two teachers can only end one way.
--   OfficeHourSession          a dated occurrence (attendance, cancellation, substitute)
--   OfficeHourAttendance (+History)  the register
--   OfficeHourEscalation       repeated-absence ladder, idempotent per trigger session
--   OfficeHourTransferRequest  teacher B asks teacher A to release a student
--   OfficeHourAbsenceNotice    a student's "I can't attend" note before a session
--   SchoolClosure              dates with no office hours (holidays, exams, events)
--
-- plus the OFFICE_HOURS_* permissions linked to the roles that need them.
-- Legacy roles that already have holders are linked here explicitly: the boot
-- preset sync withholds non-v2-only capabilities from held roles on purpose.
--
-- day_of_week uses the timetable's encoding (CalendarSlot): 1 = Monday ... 5 = Friday.
-- DATETIME columns hold UTC instants; DATE columns hold Kigali dates.
-- Idempotent (IF NOT EXISTS / NOT EXISTS / INSERT IGNORE); MySQL 5.7 and 8.

CREATE TABLE IF NOT EXISTS `OfficeHourSetting` (
  `id` TINYINT NOT NULL,
  `student_lock_mode` ENUM('TERM','WEEKDAY') NOT NULL DEFAULT 'TERM',
  `allow_any_student` TINYINT(1) NOT NULL DEFAULT 0,
  `band_start` VARCHAR(5) NOT NULL DEFAULT '16:20',
  `band_end` VARCHAR(5) NOT NULL DEFAULT '17:20',
  `allowed_window_start` VARCHAR(5) NOT NULL DEFAULT '16:00',
  `allowed_window_end` VARCHAR(5) NOT NULL DEFAULT '18:00',
  `default_capacity` SMALLINT NOT NULL DEFAULT 15,
  `max_capacity` SMALLINT NOT NULL DEFAULT 40,
  `roster_cutoff_time` VARCHAR(5) NOT NULL DEFAULT '14:00',
  `late_after_minutes` SMALLINT NOT NULL DEFAULT 10,
  `register_edit_days` SMALLINT NOT NULL DEFAULT 7,
  `auto_close_unmarked` TINYINT(1) NOT NULL DEFAULT 0,
  `escalation_consecutive_l1` SMALLINT NOT NULL DEFAULT 2,
  `escalation_month_l1` SMALLINT NOT NULL DEFAULT 2,
  `escalation_consecutive_l2` SMALLINT NOT NULL DEFAULT 3,
  `rate_band_consistent` SMALLINT NOT NULL DEFAULT 90,
  `rate_band_watch` SMALLINT NOT NULL DEFAULT 80,
  `min_sessions_for_rate` SMALLINT NOT NULL DEFAULT 3,
  `parent_notifications` ENUM('OFF','ESCALATIONS','WEEKLY') NOT NULL DEFAULT 'ESCALATIONS',
  `qr_checkin_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_by` BIGINT NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `OfficeHourSetting` (`id`) VALUES (1);

CREATE TABLE IF NOT EXISTS `OfficeHourSchedule` (
  `schedule_id` BIGINT NOT NULL AUTO_INCREMENT,
  `academic_year_id` BIGINT NOT NULL,
  `academic_term_id` BIGINT NOT NULL,
  `teacher_id` BIGINT NOT NULL,
  `subject_id` BIGINT NULL,
  `title` VARCHAR(150) NOT NULL,
  `purpose` VARCHAR(30) NOT NULL DEFAULT 'ACADEMIC_SUPPORT',
  `start_time` VARCHAR(5) NOT NULL,
  `end_time` VARCHAR(5) NOT NULL,
  `location` VARCHAR(100) NULL,
  `capacity` SMALLINT NOT NULL DEFAULT 15,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NOT NULL,
  `status` ENUM('DRAFT','ACTIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  `notes` TEXT NULL,
  `created_by` BIGINT NULL,
  `updated_by` BIGINT NULL,
  `ended_at` DATETIME NULL,
  `version` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`),
  KEY `idx_oh_schedule_teacher` (`academic_term_id`, `teacher_id`, `status`),
  KEY `idx_oh_schedule_subject` (`academic_term_id`, `subject_id`),
  CONSTRAINT `fk_oh_schedule_teacher` FOREIGN KEY (`teacher_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `fk_oh_schedule_term` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  CONSTRAINT `fk_oh_schedule_year` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  CONSTRAINT `fk_oh_schedule_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourScheduleDay` (
  `schedule_id` BIGINT NOT NULL,
  `day_of_week` TINYINT NOT NULL,
  PRIMARY KEY (`schedule_id`, `day_of_week`),
  KEY `idx_oh_day` (`day_of_week`, `schedule_id`),
  CONSTRAINT `fk_oh_day_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `OfficeHourSchedule` (`schedule_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourAssignment` (
  `assignment_id` BIGINT NOT NULL AUTO_INCREMENT,
  `schedule_id` BIGINT NOT NULL,
  `academic_term_id` BIGINT NOT NULL,
  `student_id` BIGINT NOT NULL,
  `status` ENUM('ACTIVE','ENDED') NOT NULL DEFAULT 'ACTIVE',
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NOT NULL,
  `reason_code` VARCHAR(30) NULL,
  `reason_note` VARCHAR(500) NULL,
  `clash_note` VARCHAR(255) NULL,
  `end_reason_code` VARCHAR(30) NULL,
  `end_note` VARCHAR(500) NULL,
  `assigned_by` BIGINT NULL,
  `ended_by` BIGINT NULL,
  `assigned_at` DATETIME NULL,
  `ended_at` DATETIME NULL,
  PRIMARY KEY (`assignment_id`),
  KEY `idx_oh_assignment_student` (`student_id`, `academic_term_id`, `status`),
  KEY `idx_oh_assignment_schedule` (`schedule_id`, `status`),
  CONSTRAINT `fk_oh_assignment_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `OfficeHourSchedule` (`schedule_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oh_assignment_student` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourStudentLock` (
  `academic_term_id` BIGINT NOT NULL,
  `student_id` BIGINT NOT NULL,
  `day_of_week` TINYINT NOT NULL,
  `assignment_id` BIGINT NOT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`academic_term_id`, `student_id`, `day_of_week`),
  KEY `idx_oh_lock_assignment` (`assignment_id`),
  CONSTRAINT `fk_oh_lock_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `OfficeHourAssignment` (`assignment_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourSession` (
  `session_id` BIGINT NOT NULL AUTO_INCREMENT,
  `schedule_id` BIGINT NOT NULL,
  `academic_term_id` BIGINT NOT NULL,
  `session_date` DATE NOT NULL,
  `start_time` VARCHAR(5) NOT NULL,
  `end_time` VARCHAR(5) NOT NULL,
  `host_teacher_id` BIGINT NOT NULL,
  `location` VARCHAR(100) NULL,
  `status` ENUM('SCHEDULED','HELD','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  `cancel_reason` VARCHAR(30) NULL,
  `cancel_note` VARCHAR(255) NULL,
  `cancelled_by` BIGINT NULL,
  `cancelled_at` DATETIME NULL,
  `topic` VARCHAR(255) NULL,
  `moved_from_session_id` BIGINT NULL,
  `register_first_saved_at` DATETIME NULL,
  `register_last_saved_at` DATETIME NULL,
  `register_saved_by` BIGINT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `uq_oh_session_date` (`schedule_id`, `session_date`),
  KEY `idx_oh_session_date` (`session_date`, `status`),
  KEY `idx_oh_session_host` (`host_teacher_id`, `session_date`),
  KEY `idx_oh_session_term` (`academic_term_id`, `session_date`),
  CONSTRAINT `fk_oh_session_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `OfficeHourSchedule` (`schedule_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourAttendance` (
  `session_id` BIGINT NOT NULL,
  `student_id` BIGINT NOT NULL,
  `assignment_id` BIGINT NULL,
  `is_drop_in` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('PRESENT','LATE','ABSENT','EXCUSED') NULL,
  `excuse_reason` VARCHAR(30) NULL,
  `arrived_at` VARCHAR(5) NULL,
  `note` VARCHAR(255) NULL,
  `outcome` TINYINT NULL,
  `follow_up` TINYINT(1) NOT NULL DEFAULT 0,
  `source` ENUM('TEACHER','QR','AUTO','IMPORT') NOT NULL DEFAULT 'TEACHER',
  `marked_by` BIGINT NULL,
  `marked_at` DATETIME NULL,
  PRIMARY KEY (`session_id`, `student_id`),
  KEY `idx_oh_att_student` (`student_id`, `status`),
  KEY `idx_oh_att_assignment` (`assignment_id`),
  CONSTRAINT `fk_oh_att_session` FOREIGN KEY (`session_id`) REFERENCES `OfficeHourSession` (`session_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourAttendanceHistory` (
  `history_id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT NOT NULL,
  `student_id` BIGINT NOT NULL,
  `previous_status` VARCHAR(10) NULL,
  `new_status` VARCHAR(10) NULL,
  `previous_note` VARCHAR(255) NULL,
  `new_note` VARCHAR(255) NULL,
  `source` VARCHAR(10) NOT NULL DEFAULT 'TEACHER',
  `changed_by` BIGINT NULL,
  `changed_at` DATETIME NOT NULL,
  PRIMARY KEY (`history_id`),
  KEY `idx_oh_hist_session` (`session_id`, `student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourEscalation` (
  `escalation_id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT NOT NULL,
  `assignment_id` BIGINT NOT NULL,
  `academic_term_id` BIGINT NOT NULL,
  `level` TINYINT NOT NULL,
  `trigger_code` VARCHAR(20) NOT NULL,
  `trigger_session_id` BIGINT NOT NULL,
  `notified_user_ids` TEXT NULL,
  `created_at` DATETIME NOT NULL,
  `acknowledged_by` BIGINT NULL,
  `acknowledged_at` DATETIME NULL,
  `resolution_note` VARCHAR(500) NULL,
  PRIMARY KEY (`escalation_id`),
  UNIQUE KEY `uq_oh_escalation` (`assignment_id`, `level`, `trigger_session_id`),
  KEY `idx_oh_escalation_open` (`acknowledged_at`, `academic_term_id`),
  CONSTRAINT `fk_oh_escalation_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `OfficeHourAssignment` (`assignment_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourTransferRequest` (
  `request_id` BIGINT NOT NULL AUTO_INCREMENT,
  `student_id` BIGINT NOT NULL,
  `from_assignment_id` BIGINT NOT NULL,
  `to_schedule_id` BIGINT NOT NULL,
  `requested_by` BIGINT NOT NULL,
  `message` VARCHAR(500) NULL,
  `status` ENUM('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `decided_by` BIGINT NULL,
  `decided_at` DATETIME NULL,
  `decision_note` VARCHAR(500) NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`request_id`),
  KEY `idx_oh_transfer_status` (`status`, `expires_at`),
  KEY `idx_oh_transfer_from` (`from_assignment_id`),
  CONSTRAINT `fk_oh_transfer_from` FOREIGN KEY (`from_assignment_id`) REFERENCES `OfficeHourAssignment` (`assignment_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oh_transfer_to` FOREIGN KEY (`to_schedule_id`) REFERENCES `OfficeHourSchedule` (`schedule_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OfficeHourAbsenceNotice` (
  `notice_id` BIGINT NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT NOT NULL,
  `student_id` BIGINT NOT NULL,
  `reason` VARCHAR(30) NOT NULL,
  `note` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`notice_id`),
  UNIQUE KEY `uq_oh_notice` (`session_id`, `student_id`),
  CONSTRAINT `fk_oh_notice_session` FOREIGN KEY (`session_id`) REFERENCES `OfficeHourSession` (`session_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SchoolClosure` (
  `closure_id` BIGINT NOT NULL AUTO_INCREMENT,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `reason` VARCHAR(150) NOT NULL,
  `scope` ENUM('ALL','OFFICE_HOURS') NOT NULL DEFAULT 'ALL',
  `created_by` BIGINT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`closure_id`),
  KEY `idx_closure_dates` (`start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Permissions --------------------------------------------------------------
INSERT INTO `Permission` (`name`, `description`, `status`, `app`, `cap_key`, `label`, `domain`, `kind`, `depths`, `restricted`, `scopeable`)
SELECT c.name, c.label, 'ACTIVE', 'mis', c.name, c.label, c.domain, c.kind, c.depths, 0, c.scopeable
FROM (
  SELECT 'OFFICE_HOURS_MANAGE_OWN' AS name, 'Run your own office hours (schedule, assign students, take the register)' AS label, 'ACADEMICS' AS domain, 'WRITE' AS kind, NULL AS depths, 0 AS scopeable
  UNION ALL SELECT 'OFFICE_HOURS_MANAGE_ANY', 'Manage anyone''s office hours (override, substitute, closures)', 'ACADEMICS', 'WRITE', NULL, 1
  UNION ALL SELECT 'OFFICE_HOURS_VIEW', 'See office-hours attendance and reports in your area', 'ATTENDANCE', 'READ', 'summary,detail', 1
  UNION ALL SELECT 'OFFICE_HOURS_VIEW_SELF', 'See your own (or your children''s) office hours', 'ATTENDANCE', 'READ', 'detail', 1
  UNION ALL SELECT 'OFFICE_HOURS_CONFIGURE', 'Configure office-hours policy', 'SYSTEM', 'WRITE', NULL, 0
) c
WHERE NOT EXISTS (SELECT 1 FROM `Permission` p WHERE p.`app` = 'mis' AND (p.`cap_key` = c.name OR p.`name` = c.name));

-- Older databases created by the test fixtures may hold a bare row (no app)
-- with the same name: adopt it instead of duplicating.
UPDATE `Permission` SET `status` = 'ACTIVE', `deprecated_at` = NULL, `app` = 'mis', `cap_key` = `name`
WHERE `name` IN ('OFFICE_HOURS_MANAGE_OWN','OFFICE_HOURS_MANAGE_ANY','OFFICE_HOURS_VIEW','OFFICE_HOURS_VIEW_SELF','OFFICE_HOURS_CONFIGURE')
  AND (`app` IS NULL OR `app` = 'mis');

INSERT INTO `RolePermission` (`role_id`, `perm_id`, `depth`)
SELECT r.`role_id`, p.`perm_id`, l.depth
FROM (
  SELECT 'platform_owner' AS preset, 'SUPER_ADMIN' AS legacy, 'OFFICE_HOURS_MANAGE_ANY' AS cap, NULL AS depth
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'platform_owner', 'SUPER_ADMIN', 'OFFICE_HOURS_CONFIGURE', NULL
  UNION ALL SELECT 'head_teacher', 'HEAD_TEACHER', 'OFFICE_HOURS_MANAGE_ANY', NULL
  UNION ALL SELECT 'head_teacher', 'HEAD_TEACHER', 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'head_teacher', 'HEAD_TEACHER', 'OFFICE_HOURS_CONFIGURE', NULL
  UNION ALL SELECT 'deputy_head_academics', NULL, 'OFFICE_HOURS_MANAGE_ANY', NULL
  UNION ALL SELECT 'deputy_head_academics', NULL, 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'deputy_head_discipline', NULL, 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'director_of_studies', NULL, 'OFFICE_HOURS_MANAGE_ANY', NULL
  UNION ALL SELECT 'director_of_studies', NULL, 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'programme_coordinator', 'PROGRAM_MANAGER', 'OFFICE_HOURS_MANAGE_ANY', NULL
  UNION ALL SELECT 'programme_coordinator', 'PROGRAM_MANAGER', 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'grade_coordinator', NULL, 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'OFFICE_HOURS_MANAGE_ANY', NULL
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'OFFICE_HOURS_VIEW', 'summary'
  UNION ALL SELECT 'school_administrator', 'ADMIN', 'OFFICE_HOURS_CONFIGURE', NULL
  UNION ALL SELECT 'class_teacher', 'CLASS_TEACHER', 'OFFICE_HOURS_MANAGE_OWN', NULL
  UNION ALL SELECT 'class_teacher', 'CLASS_TEACHER', 'OFFICE_HOURS_VIEW', 'detail'
  UNION ALL SELECT 'subject_teacher', NULL, 'OFFICE_HOURS_MANAGE_OWN', NULL
  UNION ALL SELECT 'teaching_staff', 'TEACHER', 'OFFICE_HOURS_MANAGE_OWN', NULL
  UNION ALL SELECT 'mentor', NULL, 'OFFICE_HOURS_MANAGE_OWN', NULL
  UNION ALL SELECT 'student', 'STUDENT', 'OFFICE_HOURS_VIEW_SELF', 'detail'
  UNION ALL SELECT 'parent', 'PARENT', 'OFFICE_HOURS_VIEW_SELF', 'detail'
) l
JOIN `Role` r ON (r.`preset_key` = l.preset OR (r.`preset_key` IS NULL AND l.legacy IS NOT NULL AND r.`name` = l.legacy))
JOIN `Permission` p ON p.`app` = 'mis' AND p.`name` = l.cap
WHERE NOT EXISTS (SELECT 1 FROM `RolePermission` x WHERE x.`role_id` = r.`role_id` AND x.`perm_id` = p.`perm_id`);

INSERT IGNORE INTO `AccessPresetLink` (`preset_key`, `perm_name`)
SELECT l.preset, l.cap FROM (
  SELECT 'platform_owner' AS preset, 'OFFICE_HOURS_MANAGE_ANY' AS cap
  UNION ALL SELECT 'platform_owner', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'platform_owner', 'OFFICE_HOURS_CONFIGURE'
  UNION ALL SELECT 'head_teacher', 'OFFICE_HOURS_MANAGE_ANY'
  UNION ALL SELECT 'head_teacher', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'head_teacher', 'OFFICE_HOURS_CONFIGURE'
  UNION ALL SELECT 'deputy_head_academics', 'OFFICE_HOURS_MANAGE_ANY'
  UNION ALL SELECT 'deputy_head_academics', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'deputy_head_discipline', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'director_of_studies', 'OFFICE_HOURS_MANAGE_ANY'
  UNION ALL SELECT 'director_of_studies', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'programme_coordinator', 'OFFICE_HOURS_MANAGE_ANY'
  UNION ALL SELECT 'programme_coordinator', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'grade_coordinator', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'school_administrator', 'OFFICE_HOURS_MANAGE_ANY'
  UNION ALL SELECT 'school_administrator', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'school_administrator', 'OFFICE_HOURS_CONFIGURE'
  UNION ALL SELECT 'class_teacher', 'OFFICE_HOURS_MANAGE_OWN'
  UNION ALL SELECT 'class_teacher', 'OFFICE_HOURS_VIEW'
  UNION ALL SELECT 'subject_teacher', 'OFFICE_HOURS_MANAGE_OWN'
  UNION ALL SELECT 'teaching_staff', 'OFFICE_HOURS_MANAGE_OWN'
  UNION ALL SELECT 'mentor', 'OFFICE_HOURS_MANAGE_OWN'
  UNION ALL SELECT 'student', 'OFFICE_HOURS_VIEW_SELF'
  UNION ALL SELECT 'parent', 'OFFICE_HOURS_VIEW_SELF'
) l;

-- Refresh cached access snapshots of everyone holding a role that just changed.
UPDATE `User` u
JOIN (
  SELECT DISTINCT ur.`user_id`
  FROM `UserRole` ur JOIN `Role` r ON r.`role_id` = ur.`role_id`
  JOIN `RolePermission` rp ON rp.`role_id` = r.`role_id`
  JOIN `Permission` p ON p.`perm_id` = rp.`perm_id`
  WHERE p.`name` LIKE 'OFFICE\_HOURS\_%'
) h ON h.`user_id` = u.`user_id`
SET u.`access_version` = u.`access_version` + 1;
