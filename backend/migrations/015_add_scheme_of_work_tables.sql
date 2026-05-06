-- Migration: Add Scheme of Work tables
-- Created at: 2026-01-28

CREATE TABLE IF NOT EXISTS `SchemeOfWork` (
  `scheme_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) NOT NULL,
  `academic_term_id` bigint(20) NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`scheme_id`),
  KEY `SchemeOfWork_user_id_fk` (`user_id`),
  KEY `SchemeOfWork_subject_id_fk` (`subject_id`),
  KEY `SchemeOfWork_class_group_id_fk` (`class_group_id`),
  KEY `SchemeOfWork_academic_term_id_fk` (`academic_term_id`),
  CONSTRAINT `SchemeOfWork_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `SchemeOfWork_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  CONSTRAINT `SchemeOfWork_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  CONSTRAINT `SchemeOfWork_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `SchemeOfWorkEntry` (
  `entry_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `scheme_id` bigint(20) NOT NULL,
  `week_number` varchar(50) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `topic` text DEFAULT NULL,
  `sub_topic` text DEFAULT NULL,
  `objective` text DEFAULT NULL,
  `methodology` text DEFAULT NULL,
  `resources` text DEFAULT NULL,
  `evaluation` text DEFAULT NULL,
  `is_completed` tinyint(4) DEFAULT 0,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`entry_id`),
  KEY `SchemeOfWorkEntry_scheme_id_fk` (`scheme_id`),
  CONSTRAINT `SchemeOfWorkEntry_scheme_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `SchemeOfWork` (`scheme_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
