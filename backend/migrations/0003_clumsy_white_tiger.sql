CREATE TABLE `InstructorReport` (
	`report_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`academic_term_id` bigint,
	`class_group_id` bigint,
	`week_number` int,
	`start_date` date,
	`end_date` date,
	`submission_date` datetime DEFAULT CURRENT_TIMESTAMP,
	`progress_status` enum('ON_TRACK','SLIGHTLY_BEHIND','AHEAD') DEFAULT 'ON_TRACK',
	`key_highlights` text,
	`challenges_encountered` text,
	`lessons_delivered_count` int DEFAULT 0,
	`mentorship_sessions_count` int DEFAULT 0,
	`active_students_count` int DEFAULT 0,
	`struggling_students_count` int DEFAULT 0,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `InstructorReport_report_id` PRIMARY KEY(`report_id`)
);

CREATE TABLE `MentorshipSession` (
	`mentorship_id` bigint AUTO_INCREMENT NOT NULL,
	`report_id` bigint,
	`user_id` bigint NOT NULL,
	`student_id` bigint,
	`student_name` varchar(255),
	`session_date` date,
	`duration_minutes` int,
	`assignment_completion` varchar(255),
	`punctuality_attendance` varchar(255),
	`academic_planning` text,
	`next_steps` text,
	`challenges_identified` text,
	`wellbeing_status` text,
	`follow_up_required` tinyint DEFAULT 0,
	`notes` text,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `MentorshipSession_mentorship_id` PRIMARY KEY(`mentorship_id`)
);

CREATE TABLE `ReportLesson` (
	`lesson_report_id` bigint AUTO_INCREMENT NOT NULL,
	`report_id` bigint NOT NULL,
	`lesson_title` varchar(255),
	`planned` tinyint DEFAULT 1,
	`delivered` tinyint DEFAULT 1,
	`notes` text,
	CONSTRAINT `ReportLesson_lesson_report_id` PRIMARY KEY(`lesson_report_id`)
);

CREATE TABLE `ReportProjectUpdate` (
	`project_update_id` bigint AUTO_INCREMENT NOT NULL,
	`report_id` bigint NOT NULL,
	`project_name` varchar(255),
	`role` varchar(100),
	`work_completed` text,
	`status` enum('ON_TRACK','AT_RISK') DEFAULT 'ON_TRACK',
	`key_outputs` text,
	`challenges` text,
	CONSTRAINT `ReportProjectUpdate_project_update_id` PRIMARY KEY(`project_update_id`)
);

CREATE TABLE `ReportReflection` (
	`reflection_id` bigint AUTO_INCREMENT NOT NULL,
	`report_id` bigint NOT NULL,
	`what_worked_well` text,
	`improvement_areas` text,
	`academic_support_needed` text,
	`technical_support_needed` text,
	`infrastructure_support_needed` text,
	`coordination_support_needed` text,
	CONSTRAINT `ReportReflection_reflection_id` PRIMARY KEY(`reflection_id`)
);

CREATE TABLE `ReportTopic` (
	`topic_report_id` bigint AUTO_INCREMENT NOT NULL,
	`report_id` bigint NOT NULL,
	`topic_name` text,
	`is_planned_for_next_week` tinyint DEFAULT 0,
	CONSTRAINT `ReportTopic_topic_report_id` PRIMARY KEY(`topic_report_id`)
);

ALTER TABLE `InstructorReport` ADD CONSTRAINT `IR_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;

ALTER TABLE `InstructorReport` ADD CONSTRAINT `IR_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm`(`academic_term_id`) ON DELETE no action ON UPDATE no action;

ALTER TABLE `InstructorReport` ADD CONSTRAINT `IR_class_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup`(`class_group_id`) ON DELETE no action ON UPDATE no action;

ALTER TABLE `MentorshipSession` ADD CONSTRAINT `MS_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport`(`report_id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `MentorshipSession` ADD CONSTRAINT `MS_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;

ALTER TABLE `MentorshipSession` ADD CONSTRAINT `MS_student_id_fk` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;

ALTER TABLE `ReportLesson` ADD CONSTRAINT `RL_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport`(`report_id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `ReportProjectUpdate` ADD CONSTRAINT `RPU_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport`(`report_id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `ReportReflection` ADD CONSTRAINT `RR_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport`(`report_id`) ON DELETE cascade ON UPDATE no action;

ALTER TABLE `ReportTopic` ADD CONSTRAINT `RT_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport`(`report_id`) ON DELETE cascade ON UPDATE no action;