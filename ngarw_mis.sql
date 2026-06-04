-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 10.123.0.150:3306
-- Generation Time: Jun 04, 2026 at 12:56 PM
-- Server version: 8.4.7
-- PHP Version: 8.2.31

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `ngarw_mis`
--

DELIMITER $$
--
-- Procedures
--
CREATE DEFINER=`ngarw_mis`@`%` PROCEDURE `MigrateEnrollmentData` ()   BEGIN
    -- Only run if the old column still exists
    IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'StudentSubjectEnrollment' 
        AND COLUMN_NAME = 'academic_term_id'
    ) THEN
        -- A. Fill academic_year_id based on the term
        UPDATE StudentSubjectEnrollment sse
        INNER JOIN AcademicTerm at ON sse.academic_term_id = at.academic_term_id
        SET sse.academic_year_id = at.academic_year_id
        WHERE sse.academic_year_id IS NULL;

        -- B. Make it NOT NULL
        ALTER TABLE StudentSubjectEnrollment MODIFY COLUMN academic_year_id BIGINT NOT NULL;

        -- C. Drop ALL existing Foreign Keys on this table to prevent the #1553 error
        -- These names match the ones in your 0000_solid_lake.sql
        SET @s = (SELECT IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME='StudentSubjectEnrollment_user_id_User_user_id_fk' AND TABLE_NAME='StudentSubjectEnrollment'),
            'ALTER TABLE StudentSubjectEnrollment DROP FOREIGN KEY StudentSubjectEnrollment_user_id_User_user_id_fk', 'SELECT 1'));
        PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

        SET @s = (SELECT IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME='StudentSubjectEnrollment_subject_id_Subject_subject_id_fk' AND TABLE_NAME='StudentSubjectEnrollment'),
            'ALTER TABLE StudentSubjectEnrollment DROP FOREIGN KEY StudentSubjectEnrollment_subject_id_Subject_subject_id_fk', 'SELECT 1'));
        PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

        SET @s = (SELECT IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_NAME='StudentSubjectEnrollment_academic_term_id_AcademicTerm_academic_term_id_fk' AND TABLE_NAME='StudentSubjectEnrollment'),
            'ALTER TABLE StudentSubjectEnrollment DROP FOREIGN KEY StudentSubjectEnrollment_academic_term_id_AcademicTerm_academic_term_id_fk', 'SELECT 1'));
        PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

        -- D. Drop the Primary Key
        SET @has_pk = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'StudentSubjectEnrollment' AND CONSTRAINT_TYPE = 'PRIMARY KEY');
        IF @has_pk > 0 THEN
            ALTER TABLE StudentSubjectEnrollment DROP PRIMARY KEY;
        END IF;

        -- E. Drop the old column
        ALTER TABLE StudentSubjectEnrollment DROP COLUMN academic_term_id;
    END IF;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `AcademicCalendar`
--

CREATE TABLE `AcademicCalendar` (
  `calendar_id` bigint NOT NULL,
  `academic_year_id` bigint NOT NULL,
  `academic_term_id` bigint NOT NULL,
  `class_group_id` bigint NOT NULL,
  `name` varchar(150) DEFAULT NULL COMMENT 'Optional name for the calendar',
  `description` text,
  `is_active` tinyint DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `AcademicCalendar`
--

INSERT INTO `AcademicCalendar` (`calendar_id`, `academic_year_id`, `academic_term_id`, `class_group_id`, `name`, `description`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 3, 4, 9, 'Coding Academy', NULL, 1, '2026-03-04 22:34:39', '2026-03-04 22:34:39'),
(2, 3, 5, 9, 'Coding - Year 1', NULL, 1, '2026-05-11 06:42:35', '2026-05-11 06:42:35');

-- --------------------------------------------------------

--
-- Table structure for table `AcademicTerm`
--

CREATE TABLE `AcademicTerm` (
  `academic_term_id` bigint NOT NULL,
  `academic_year_id` bigint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `AcademicTerm`
--

INSERT INTO `AcademicTerm` (`academic_term_id`, `academic_year_id`, `name`, `start_date`, `end_date`, `is_current`) VALUES
(4, 3, 'Term 2', '2026-01-05', '2026-04-03', 0),
(5, 3, 'Term 3', '2026-04-29', '2026-08-30', 1);

-- --------------------------------------------------------

--
-- Table structure for table `AcademicYear`
--

CREATE TABLE `AcademicYear` (
  `academic_year_id` bigint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `AcademicYear`
--

INSERT INTO `AcademicYear` (`academic_year_id`, `name`, `start_date`, `end_date`, `is_current`) VALUES
(3, '2025-2026', '2025-07-01', '2026-07-30', 1);

-- --------------------------------------------------------

--
-- Table structure for table `ActivityLog`
--

CREATE TABLE `ActivityLog` (
  `activity_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `actor_id` bigint DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `description` varchar(500) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` bigint DEFAULT NULL,
  `metadata` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `ActivityLog`
--

INSERT INTO `ActivityLog` (`activity_id`, `user_id`, `actor_id`, `action_type`, `description`, `entity_type`, `entity_id`, `metadata`, `created_at`) VALUES
(1, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-19T22:34:40.083Z\"}', '2026-01-19 22:34:40'),
(2, 1, 1, 'COURSE_CATEGORY_CREATE', 'Created course category: Specific Module', 'CourseCategory', NULL, '{\"name\":\"Specific Module\",\"description\":\"Specific Module\"}', '2026-01-19 22:35:31'),
(3, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Computer Basics', 'Subject', 12, '{\"code\":\"SFPCB302\",\"name\":\"Computer Basics\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}', '2026-01-19 22:36:02'),
(4, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Development of Web User Interface', 'Subject', 9, '{\"code\":\"SPEWI302\",\"name\":\"Development of Web User Interface\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}', '2026-01-19 22:36:25'),
(5, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Graphic User Interface Design', 'Subject', 8, '{\"code\":\"SPEGI302\",\"name\":\"Graphic User Interface Design\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}', '2026-01-19 22:36:43'),
(6, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Programming Fundamentals Using C', 'Subject', 11, '{\"code\":\"SPEPE301\",\"name\":\"Programming Fundamentals Using C\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}', '2026-01-19 22:37:02'),
(7, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Web Application Development Using JavaScript', 'Subject', 10, '{\"code\":\"SPEWJ302\",\"name\":\"Web Application Development Using JavaScript\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}', '2026-01-19 22:37:16'),
(8, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Computer Basics', 'Subject', 12, '{\"code\":\"SFPCB302\",\"name\":\"Computer Basics\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}', '2026-01-19 22:37:26'),
(9, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28]}', '2026-01-19 22:50:17'),
(10, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: CLASS_TEACHER', 'Role', 11, '{\"permissionIds\":[14,25,26,27,28]}', '2026-01-19 22:50:41'),
(11, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-20T09:16:07.774Z\"}', '2026-01-20 09:16:07'),
(12, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-20T09:19:14.513Z\"}', '2026-01-20 09:19:14'),
(13, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T21:13:50.597Z\"}', '2026-01-21 21:13:50'),
(14, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T21:14:24.387Z\"}', '2026-01-21 21:14:24'),
(15, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T21:17:21.186Z\"}', '2026-01-21 21:17:21'),
(16, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T21:19:32.847Z\"}', '2026-01-21 21:19:32'),
(17, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T21:36:15.464Z\"}', '2026-01-21 21:36:15'),
(18, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T21:48:35.650Z\"}', '2026-01-21 21:48:35'),
(19, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T22:38:56.370Z\"}', '2026-01-21 22:38:56'),
(20, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-21T22:39:37.052Z\"}', '2026-01-21 22:39:37'),
(21, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-22T04:14:24.238Z\"}', '2026-01-22 04:14:24'),
(22, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-22T12:07:07.937Z\"}', '2026-01-22 12:07:07'),
(23, 1, 1, 'SUBJECT_CREATE', 'Created subject: Develop Web Application Using PHP', 'Subject', NULL, '{\"name\":\"Develop Web Application Using PHP\",\"description\":null,\"code\":\"SFPWP301\"}', '2026-01-22 12:08:47'),
(24, 1, 1, 'SUBJECT_CREATE', 'Created subject: Apply Basic Database Development', 'Subject', NULL, '{\"name\":\"Apply Basic Database Development\",\"description\":null,\"code\":\"SPEDD302\"}', '2026-01-22 12:09:40'),
(25, 14, 1, 'SUBJECT_ASSIGN', 'You have been assigned to subject ID: 14', 'TeacherSubjectAssignment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"assigning_user_id\":1}', '2026-01-22 12:10:29'),
(26, 1, 1, 'SUBJECT_ASSIGN_ADMIN', 'Assigned teacher ID: 14 to subject ID: 14', 'TeacherSubjectAssignment', NULL, '{\"teacherId\":14,\"subjectId\":14,\"academic_term_id\":4}', '2026-01-22 12:10:29'),
(27, 14, 1, 'SUBJECT_ASSIGN', 'You have been assigned to subject ID: 13', 'TeacherSubjectAssignment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"assigning_user_id\":1}', '2026-01-22 12:10:47'),
(28, 1, 1, 'SUBJECT_ASSIGN_ADMIN', 'Assigned teacher ID: 14 to subject ID: 13', 'TeacherSubjectAssignment', NULL, '{\"teacherId\":14,\"subjectId\":13,\"academic_term_id\":4}', '2026-01-22 12:10:48'),
(29, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-22T12:12:03.898Z\"}', '2026-01-22 12:12:03'),
(30, 19, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-01-22 12:19:32'),
(31, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 19 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":19,\"subjectId\":14,\"academic_term_id\":4}', '2026-01-22 12:19:32'),
(32, 19, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-01-22 12:19:44'),
(33, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 19 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":19,\"subjectId\":13,\"academic_term_id\":4}', '2026-01-22 12:19:44'),
(34, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-23T08:25:43.480Z\"}', '2026-01-23 08:25:43'),
(35, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T12:06:08.833Z\"}', '2026-01-25 12:06:08'),
(36, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T12:18:36.567Z\"}', '2026-01-25 12:18:36'),
(37, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T12:38:36.230Z\"}', '2026-01-25 12:38:36'),
(38, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T12:57:23.082Z\"}', '2026-01-25 12:57:23'),
(39, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T14:26:25.940Z\"}', '2026-01-25 14:26:25'),
(40, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T15:13:49.120Z\"}', '2026-01-25 15:13:49'),
(41, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T09:33:06.693Z\"}', '2026-01-26 09:33:06'),
(42, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T10:13:46.755Z\"}', '2026-01-26 10:13:46'),
(43, 13, 13, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 13, NULL, '2026-01-26 15:58:23'),
(44, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T15:59:07.858Z\"}', '2026-01-26 15:59:07'),
(45, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T16:05:46.913Z\"}', '2026-01-26 16:05:46'),
(46, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T16:12:21.416Z\"}', '2026-01-26 16:12:21'),
(47, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T16:16:48.342Z\"}', '2026-01-26 16:16:48'),
(48, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T16:18:52.971Z\"}', '2026-01-26 16:18:53'),
(49, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T16:36:01.882Z\"}', '2026-01-26 16:36:01'),
(50, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T19:30:31.475Z\"}', '2026-01-26 19:30:31'),
(51, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-27T09:29:23.998Z\"}', '2026-01-27 09:29:24'),
(52, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-27T09:34:45.248Z\"}', '2026-01-27 09:34:45'),
(53, 18, 18, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 18, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-28T08:45:24.745Z\"}', '2026-01-28 08:45:24'),
(54, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-07T20:29:54.296Z\"}', '2026-02-07 20:29:54'),
(55, 15, 15, 'PROFILE_UPDATE', 'User updated their personal profile information', 'UserProfile', 15, '{\"first_name\":\"Niyongabo\",\"last_name\":\"Emmanuel\",\"gender\":\"MALE\",\"date_of_birth\":\"1996-01-01T00:00:00.000Z\",\"address\":\"Kigali Rwanda\",\"external_id\":null}', '2026-02-07 20:33:12'),
(56, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-19T13:45:07.451Z\"}', '2026-02-19 13:45:07'),
(57, 15, 15, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 15, NULL, '2026-02-19 13:47:24'),
(58, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-19T13:47:49.694Z\"}', '2026-02-19 13:47:49'),
(59, 15, 15, 'SCHEME_UPLOAD', 'Uploaded scheme of work for subject ID 8', 'SchemeOfWork', 1, '{\"subject_id\":\"8\",\"entries_count\":13}', '2026-02-19 13:49:26'),
(60, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T12:38:44.124Z\"}', '2026-02-23 12:38:44'),
(61, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T12:42:02.922Z\"}', '2026-02-23 12:42:02'),
(62, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-26T07:56:41.411Z\"}', '2026-02-26 07:56:41'),
(63, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-26T08:59:34.620Z\"}', '2026-02-26 08:59:34'),
(64, 20, 1, 'USER_CREATE', 'Created user: jeandedieu', 'User', 20, '{\"username\":\"jeandedieu\",\"email\":\"jeandedieunshimiyimana@gmail.com\",\"roles\":[4]}', '2026-02-26 09:00:41'),
(65, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-26T16:09:55.564Z\"}', '2026-02-26 16:09:55'),
(66, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-26T16:13:08.201Z\"}', '2026-02-26 16:13:08'),
(67, 19, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-02-26 16:13:36'),
(68, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 19 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":19,\"subjectId\":12,\"academic_term_id\":4}', '2026-02-26 16:13:36'),
(69, 19, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-02-26 16:14:54'),
(70, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 19 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":19,\"subjectId\":11,\"academic_term_id\":4}', '2026-02-26 16:14:54'),
(71, 19, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-02-26 16:15:06'),
(72, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 19 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":19,\"subjectId\":10,\"academic_term_id\":4}', '2026-02-26 16:15:06'),
(73, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-26T16:25:58.584Z\"}', '2026-02-26 16:25:58'),
(74, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-27T12:15:30.421Z\"}', '2026-02-27 12:15:30'),
(75, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-01T14:02:28.922Z\"}', '2026-03-01 14:02:28'),
(76, 15, 15, 'SCHEME_UPLOAD', 'Uploaded scheme of work for subject ID 9', 'SchemeOfWork', 2, '{\"subject_id\":\"9\",\"entries_count\":13}', '2026-03-01 14:03:48'),
(77, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-02T18:47:41.812Z\"}', '2026-03-02 18:47:41'),
(78, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T16:51:36.726Z\"}', '2026-03-03 16:51:36'),
(79, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T18:56:24.092Z\"}', '2026-03-03 18:56:24'),
(80, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T22:28:37.179Z\"}', '2026-03-04 22:28:37'),
(81, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33]}', '2026-03-04 22:29:34'),
(82, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: ADMIN', 'Role', 2, '{\"permissionIds\":[1,2,3,4,9,10,11,12,27,29,30,31,33]}', '2026-03-04 22:29:46'),
(83, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: CLASS_TEACHER', 'Role', 11, '{\"permissionIds\":[14,25,26,27,28,33]}', '2026-03-04 22:29:59'),
(84, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: TEACHER', 'Role', 4, '{\"permissionIds\":[5,6,7,8,14,27,37,15]}', '2026-03-04 22:30:24'),
(85, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: PROGRAM_MANAGER', 'Role', 12, '{\"permissionIds\":[16,17,27,34]}', '2026-03-04 22:30:43'),
(86, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: STUDENT', 'Role', 6, '{\"permissionIds\":[6,8,39]}', '2026-03-04 22:31:01'),
(87, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T22:31:51.057Z\"}', '2026-03-04 22:31:51'),
(88, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34]}', '2026-03-04 22:33:58'),
(89, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Graphic User Interface Design', 'Subject', 8, '{\"code\":\"SPEGI302\",\"name\":\"Graphic User Interface Design\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#1fd63d\"}', '2026-03-04 22:37:10'),
(90, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Develop Web Application Using PHP', 'Subject', 13, '{\"code\":\"SFPWP301\",\"name\":\"Develop Web Application Using PHP\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#c310c6\"}', '2026-03-04 22:37:37'),
(91, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Computer Basics', 'Subject', 12, '{\"code\":\"SFPCB302\",\"name\":\"Computer Basics\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#b2b517\"}', '2026-03-04 22:38:10'),
(92, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Web Application Development Using JavaScript', 'Subject', 10, '{\"code\":\"SPEWJ302\",\"name\":\"Web Application Development Using JavaScript\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#0ea5d8\"}', '2026-03-04 22:38:40'),
(93, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Web Application Development Using JavaScript', 'Subject', 10, '{\"code\":\"SPEWJ302\",\"name\":\"Web Application Development Using JavaScript\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#00ccf5\"}', '2026-03-04 22:39:11'),
(94, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Development of Web User Interface', 'Subject', 9, '{\"code\":\"SPEWI302\",\"name\":\"Development of Web User Interface\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#3c2eff\"}', '2026-03-04 22:39:38'),
(95, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Web Application Development Using JavaScript', 'Subject', 10, '{\"code\":\"SPEWJ302\",\"name\":\"Web Application Development Using JavaScript\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#0e98b4\"}', '2026-03-04 22:42:32'),
(96, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Web Application Development Using JavaScript', 'Subject', 10, '{\"code\":\"SPEWJ302\",\"name\":\"Web Application Development Using JavaScript\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#b45e0e\"}', '2026-03-04 22:43:14'),
(97, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: CLASS_TEACHER', 'Role', 11, '{\"permissionIds\":[14,25,26,27,28,33,34]}', '2026-03-04 22:43:57'),
(98, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: HEAD_TEACHER', 'Role', 3, '{\"permissionIds\":[3,4,6,8,11,34]}', '2026-03-04 22:44:15'),
(99, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T22:44:58.100Z\"}', '2026-03-04 22:44:58'),
(100, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: TEACHER', 'Role', 4, '{\"permissionIds\":[5,6,7,8,14,15,27,37,40,38]}', '2026-03-04 22:55:35'),
(101, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T22:55:47.440Z\"}', '2026-03-04 22:55:47'),
(102, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: CLASS_TEACHER', 'Role', 11, '{\"permissionIds\":[14,25,26,27,28,33,34,40,38]}', '2026-03-04 22:56:43'),
(103, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: ADMIN', 'Role', 2, '{\"permissionIds\":[1,2,3,4,9,10,11,12,27,29,30,31,33,40,38]}', '2026-03-04 22:57:02'),
(104, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: PROGRAM_MANAGER', 'Role', 12, '{\"permissionIds\":[16,17,27,34,40,38]}', '2026-03-04 22:57:16'),
(105, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: STUDENT', 'Role', 6, '{\"permissionIds\":[6,8,39,41]}', '2026-03-04 22:57:34'),
(106, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: STUDENT', 'Role', 6, '{\"permissionIds\":[6,8,39,41]}', '2026-03-04 22:58:25'),
(107, 18, 18, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 18, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-05T09:04:14.889Z\"}', '2026-03-05 09:04:14'),
(108, 17, 17, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 17, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-05T09:08:13.043Z\"}', '2026-03-05 09:08:13'),
(109, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: CLASS_TEACHER', 'Role', 11, '{\"permissionIds\":[14,25,26,27,28,33,34,38,40,37,35,3]}', '2026-03-05 09:10:18'),
(110, 17, 18, 'SUBJECT_ASSIGN', 'You have been assigned to subject ID: 11', 'TeacherSubjectAssignment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"assigning_user_id\":18}', '2026-03-05 09:12:21'),
(111, 18, 18, 'SUBJECT_ASSIGN_ADMIN', 'Assigned teacher ID: 17 to subject ID: 11', 'TeacherSubjectAssignment', NULL, '{\"teacherId\":17,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-05 09:12:21'),
(112, 21, 18, 'USER_CREATE', 'Created user: JeanWilly', 'User', 21, '{\"username\":\"JeanWilly\",\"email\":\"jeanwillyh@nga.ac.rw\",\"roles\":[4]}', '2026-03-05 11:45:27'),
(113, 22, 18, 'USER_CREATE', 'Created user: christine', 'User', 22, '{\"username\":\"christine\",\"email\":\"ingachrina@nga.ac.rw\",\"roles\":[4]}', '2026-03-05 11:46:28'),
(114, 23, 18, 'USER_CREATE', 'Created user: leonntabomvura', 'User', 23, '{\"username\":\"leonntabomvura\",\"email\":\"leonntabomvura@nga.ac.rw\",\"roles\":[4]}', '2026-03-05 11:47:29'),
(115, 24, 18, 'USER_CREATE', 'Created user: Josephine', 'User', 24, '{\"username\":\"Josephine\",\"email\":\"josephine@nga.ac.rw\",\"roles\":[12]}', '2026-03-05 11:48:26'),
(116, 25, 18, 'USER_CREATE', 'Created user: kheillavera', 'User', 25, '{\"username\":\"kheillavera\",\"email\":\"irakozegwizakheillavera@gmail.com\",\"roles\":[6]}', '2026-03-05 11:51:49'),
(117, 18, 18, 'USER_BULK_CREATE', 'Bulk created 8 users via Excel upload', 'User', NULL, '{\"successCount\":8,\"failedCount\":2,\"totalRows\":10,\"roleId\":\"6\"}', '2026-03-05 11:58:54'),
(118, 18, 18, 'SUBJECT_CREATE', 'Created subject: Networking Fundamentals', 'Subject', NULL, '{\"name\":\"Networking Fundamentals\",\"description\":\"This module aims to teach and validate fundamental technology concepts. It will cover the fundamentals of local area networking, defining networks with the OSI Model and understanding wired and wireless networks. In addition it includes understanding Internet Protocol, implementing TCP/IP and working with networking services. Students will better understand wide area networks along with defining network infrastructures and network security.\",\"code\":\"SFPNF301\",\"color\":\"#3B82F6\"}', '2026-03-05 12:04:19'),
(119, 18, 18, 'COURSE_CATEGORY_CREATE', 'Created course category: General&#x2F;Complementary Modules', 'CourseCategory', NULL, '{\"name\":\"General&#x2F;Complementary Modules\",\"description\":null}', '2026-03-05 12:05:15'),
(120, 18, 18, 'COURSE_CATEGORY_UPDATE', 'Updated course category: General Modules', 'CourseCategory', 2, '{\"name\":\"General Modules\"}', '2026-03-05 12:05:42'),
(121, 18, 18, 'CLASS_GROUP_UPDATE', 'Updated class group: Year 1', 'ClassGroup', 9, '{\"academic_year_id\":3,\"grade_id\":9,\"name\":\"Year 1\"}', '2026-03-05 12:06:26'),
(122, 18, 18, 'SUBJECT_UPDATE', 'Updated subject: Networking Fundamentals', 'Subject', 15, '{\"code\":\"SFPNF301\",\"name\":\"Networking Fundamentals\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#3B82F6\"}', '2026-03-05 12:07:29'),
(123, 18, 18, 'GRADE_UPDATE', 'Updated grade ID: 9', 'Grade', 9, '{\"name\":\"Coding Academy - Year 1\",\"program_id\":8,\"level_order\":1}', '2026-03-05 12:10:22'),
(124, 18, 18, 'SUBJECT_UPDATE', 'Updated subject: Networking Fundamentals', 'Subject', 15, '{\"code\":\"SFPNF301\",\"name\":\"Networking Fundamentals\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#3B82F6\"}', '2026-03-05 12:12:00'),
(125, 18, 18, 'PROGRAM_UPDATE', 'Updated program: Coding Academy', 'Program', 8, '{\"name\":\"Coding Academy\"}', '2026-03-05 12:13:56'),
(126, 18, 18, 'CLASS_GROUP_UPDATE', 'Updated class group: Year 1', 'ClassGroup', 9, '{\"academic_year_id\":3,\"grade_id\":9,\"name\":\"Year 1\"}', '2026-03-05 12:15:06'),
(127, 18, 18, 'SUBJECT_DELETE', 'Disabled subject ID: 15', 'Subject', 15, NULL, '2026-03-05 12:20:01'),
(128, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: CLASS_TEACHER', 'Role', 11, '{\"permissionIds\":[3,14,25,26,27,28,33,34,35,37,38,40,43]}', '2026-03-05 13:07:40'),
(129, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,43]}', '2026-03-05 13:12:21'),
(130, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34]}', '2026-03-05 13:13:13'),
(131, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,40]}', '2026-03-05 13:14:56'),
(132, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,40,42]}', '2026-03-05 13:15:46'),
(133, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,40,42,43]}', '2026-03-05 13:16:28'),
(134, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-05T14:25:07.462Z\"}', '2026-03-05 14:25:07'),
(135, 32, 32, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 32, NULL, '2026-03-05 14:25:41'),
(136, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-05T14:32:21.461Z\"}', '2026-03-05 14:32:21'),
(137, 26, 26, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 26, NULL, '2026-03-05 14:32:54'),
(138, 26, 26, 'PROFILE_UPDATE', 'User updated their personal profile information', 'UserProfile', 26, '{\"first_name\":\"KENY KELVIN\",\"last_name\":\"Ishimwe\",\"gender\":\"MALE\",\"date_of_birth\":null,\"address\":null,\"external_id\":null}', '2026-03-05 14:33:11'),
(139, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-05T14:43:29.325Z\"}', '2026-03-05 14:43:29'),
(140, 31, 31, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 31, NULL, '2026-03-05 14:44:02'),
(141, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-06T16:02:12.148Z\"}', '2026-03-06 16:02:12'),
(142, 14, 14, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 14, NULL, '2026-03-07 18:47:08'),
(143, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T18:51:31.476Z\"}', '2026-03-07 18:51:31'),
(144, 14, 14, 'PROFILE_UPDATE', 'User updated their personal profile information', 'UserProfile', 14, '{\"first_name\":\"Niyitegeka\",\"last_name\":\"Faustin\",\"gender\":\"MALE\",\"date_of_birth\":null,\"address\":null,\"external_id\":null}', '2026-03-07 18:59:29'),
(145, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T19:14:09.267Z\"}', '2026-03-07 19:14:09'),
(146, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T19:20:18.147Z\"}', '2026-03-07 19:20:18'),
(147, 1, 1, 'FOLDER_CREATE', 'Folder created: Testing Documents', 'DocumentFolder', 26, '{\"name\":\"Testing Documents\"}', '2026-03-07 19:20:38'),
(148, 1, 1, 'DOCUMENT_UPLOAD', 'Document uploaded: Final Updated - NGA MIS Integrated Platform Guide.pdf', 'Document', 18, '{\"file_name\":\"1772911249805-a1hbehzliod.pdf\",\"original_name\":\"Final Updated - NGA MIS Integrated Platform Guide.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":492791}', '2026-03-07 19:20:51'),
(149, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T19:29:51.803Z\"}', '2026-03-07 19:29:51'),
(150, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T19:31:41.840Z\"}', '2026-03-07 19:31:41'),
(151, 25, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:32:24'),
(152, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 25 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":25,\"classGroupId\":9}', '2026-03-07 19:32:24'),
(153, 25, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:32:31'),
(154, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 25 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":25,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:32:31'),
(155, 25, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:32:49'),
(156, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 25 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":25,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:32:49'),
(157, 25, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:33:00'),
(158, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 25 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":25,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:33:01'),
(159, 25, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:33:06'),
(160, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 25 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":25,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:33:06'),
(161, 25, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:33:12'),
(162, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 25 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":25,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:33:13'),
(163, 25, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:33:17'),
(164, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 25 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":25,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:33:17'),
(165, 25, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:33:24'),
(166, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 25 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":25,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:33:24'),
(167, 27, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:33:45'),
(168, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 27 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":27,\"classGroupId\":9}', '2026-03-07 19:33:45'),
(169, 27, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:33:52'),
(170, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 27 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":27,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:33:53'),
(171, 27, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:33:58'),
(172, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 27 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":27,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:33:58'),
(173, 27, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:34:04'),
(174, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 27 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":27,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:34:05'),
(175, 27, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:34:10'),
(176, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 27 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":27,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:34:10'),
(177, 27, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:34:16'),
(178, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 27 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":27,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:34:16'),
(179, 27, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:34:21'),
(180, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 27 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":27,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:34:21'),
(181, 27, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:34:26'),
(182, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 27 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":27,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:34:26'),
(183, 26, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:34:48'),
(184, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 26 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":26,\"classGroupId\":9}', '2026-03-07 19:34:48'),
(185, 26, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:34:58'),
(186, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 26 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":26,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:34:58'),
(187, 26, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:35:04'),
(188, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 26 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":26,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:35:04'),
(189, 26, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:35:10'),
(190, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 26 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":26,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:35:10'),
(191, 26, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:35:16'),
(192, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 26 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":26,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:35:16'),
(193, 26, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:35:22'),
(194, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 26 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":26,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:35:22'),
(195, 26, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:35:27'),
(196, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 26 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":26,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:35:27'),
(197, 26, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:35:32'),
(198, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 26 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":26,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:35:32'),
(199, 28, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:36:01'),
(200, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 28 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":28,\"classGroupId\":9}', '2026-03-07 19:36:02'),
(201, 28, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:36:11'),
(202, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 28 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":28,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:36:12'),
(203, 28, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:36:18'),
(204, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 28 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":28,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:36:18'),
(205, 28, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:36:22'),
(206, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 28 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":28,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:36:23'),
(207, 28, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:36:28'),
(208, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 28 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":28,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:36:28'),
(209, 28, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:36:33'),
(210, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 28 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":28,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:36:34'),
(211, 28, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:36:40'),
(212, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 28 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":28,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:36:40'),
(213, 28, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:36:44'),
(214, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 28 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":28,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:36:44'),
(215, 29, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:37:08'),
(216, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 29 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":29,\"classGroupId\":9}', '2026-03-07 19:37:08'),
(217, 29, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:37:15'),
(218, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 29 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":29,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:37:15'),
(219, 29, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:37:21'),
(220, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 29 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":29,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:37:22'),
(221, 29, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:37:27'),
(222, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 29 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":29,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:37:27'),
(223, 29, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:37:41'),
(224, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 29 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":29,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:37:41'),
(225, 29, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:37:46'),
(226, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 29 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":29,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:37:46'),
(227, 29, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:37:52'),
(228, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 29 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":29,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:37:52'),
(229, 29, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:37:56'),
(230, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 29 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":29,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:37:56'),
(231, 30, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:38:10'),
(232, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 30 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":30,\"classGroupId\":9}', '2026-03-07 19:38:10'),
(233, 30, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:38:17'),
(234, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 30 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":30,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:38:17'),
(235, 30, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:38:22'),
(236, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 30 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":30,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:38:23'),
(237, 30, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:38:27'),
(238, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 30 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":30,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:38:27'),
(239, 30, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:38:32'),
(240, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 30 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":30,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:38:32'),
(241, 30, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:38:37'),
(242, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 30 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":30,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:38:37'),
(243, 30, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:38:44'),
(244, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 30 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":30,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:38:45'),
(245, 30, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:38:51'),
(246, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 30 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":30,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:38:51'),
(247, 31, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:39:14'),
(248, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 31 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":31,\"classGroupId\":9}', '2026-03-07 19:39:14'),
(249, 31, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:39:27'),
(250, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 31 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":31,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:39:27'),
(251, 31, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:39:33'),
(252, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 31 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":31,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:39:33'),
(253, 31, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:39:39'),
(254, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 31 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":31,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:39:39'),
(255, 31, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:39:44'),
(256, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 31 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":31,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:39:44');
INSERT INTO `ActivityLog` (`activity_id`, `user_id`, `actor_id`, `action_type`, `description`, `entity_type`, `entity_id`, `metadata`, `created_at`) VALUES
(257, 31, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:39:49'),
(258, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 31 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":31,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:39:49'),
(259, 31, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:39:55'),
(260, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 31 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":31,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:39:55'),
(261, 31, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:39:58'),
(262, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 31 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":31,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:39:59'),
(263, 32, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:40:15'),
(264, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 32 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":32,\"classGroupId\":9}', '2026-03-07 19:40:15'),
(265, 32, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:40:23'),
(266, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 32 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":32,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:40:23'),
(267, 32, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:40:29'),
(268, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 32 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":32,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:40:29'),
(269, 32, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:40:35'),
(270, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 32 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":32,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:40:35'),
(271, 32, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:40:41'),
(272, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 32 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":32,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:40:41'),
(273, 32, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:40:46'),
(274, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 32 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":32,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:40:46'),
(275, 32, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:40:52'),
(276, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 32 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":32,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:40:52'),
(277, 32, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:40:58'),
(278, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 32 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":32,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:40:58'),
(279, 33, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-03-07 19:41:11'),
(280, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 33 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":33,\"classGroupId\":9}', '2026-03-07 19:41:11'),
(281, 33, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:41:28'),
(282, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 33 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":33,\"subjectId\":14,\"academic_term_id\":4}', '2026-03-07 19:41:28'),
(283, 33, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:41:39'),
(284, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 33 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":33,\"subjectId\":12,\"academic_term_id\":4}', '2026-03-07 19:41:39'),
(285, 33, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:41:46'),
(286, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 33 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":33,\"subjectId\":13,\"academic_term_id\":4}', '2026-03-07 19:41:46'),
(287, 33, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:41:52'),
(288, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 33 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":33,\"subjectId\":9,\"academic_term_id\":4}', '2026-03-07 19:41:52'),
(289, 33, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:41:59'),
(290, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 33 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":33,\"subjectId\":8,\"academic_term_id\":4}', '2026-03-07 19:41:59'),
(291, 33, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:42:10'),
(292, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 33 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":33,\"subjectId\":11,\"academic_term_id\":4}', '2026-03-07 19:42:10'),
(293, 33, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-03-07 19:42:34'),
(294, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 33 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":33,\"subjectId\":10,\"academic_term_id\":4}', '2026-03-07 19:42:34'),
(295, 1, 1, 'FOLDER_DELETE', 'Folder deleted: Testing Documents', 'DocumentFolder', 26, NULL, '2026-03-07 19:43:55'),
(296, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T19:57:40.679Z\"}', '2026-03-07 19:57:40'),
(297, 14, 14, 'FOLDER_CREATE', 'Folder created: Notes', 'DocumentFolder', 27, '{\"name\":\"Notes\"}', '2026-03-07 19:58:28'),
(298, 14, 14, 'FOLDER_CREATE', 'Folder created: Php', 'DocumentFolder', 28, '{\"name\":\"Php\",\"parentFolderId\":27}', '2026-03-07 19:58:48'),
(299, 14, 14, 'FOLDER_CREATE', 'Folder created: Database', 'DocumentFolder', 29, '{\"name\":\"Database\",\"parentFolderId\":27}', '2026-03-07 19:59:09'),
(300, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: EXERCISES OF DATABASE.docx', 'Document', 19, '{\"file_name\":\"1772913810689-hcvzngk9iy6.docx\",\"original_name\":\"EXERCISES OF DATABASE.docx\",\"mime_type\":\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\",\"file_size\":15619}', '2026-03-07 20:03:32'),
(301, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: DEBUGGING  EXERCISES OF DATABASE.docx', 'Document', 20, '{\"file_name\":\"1772913810736-f7qagc3easj.docx\",\"original_name\":\"DEBUGGING  EXERCISES OF DATABASE.docx\",\"mime_type\":\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\",\"file_size\":18867}', '2026-03-07 20:03:32'),
(302, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: ANSWER OF EXERCISES OF DATABASE.docx', 'Document', 21, '{\"file_name\":\"1772913810886-nwrkr596m5.docx\",\"original_name\":\"ANSWER OF EXERCISES OF DATABASE.docx\",\"mime_type\":\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\",\"file_size\":20754}', '2026-03-07 20:03:32'),
(303, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T21:01:54.456Z\"}', '2026-03-07 21:01:54'),
(304, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-08T05:33:21.760Z\"}', '2026-03-08 05:33:21'),
(305, 27, 27, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 27, NULL, '2026-03-08 05:33:54'),
(306, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T05:51:22.892Z\"}', '2026-03-09 05:51:22'),
(307, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T08:50:55.679Z\"}', '2026-03-09 08:50:55'),
(308, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T09:02:44.610Z\"}', '2026-03-09 09:02:44'),
(309, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T09:04:58.754Z\"}', '2026-03-09 09:04:58'),
(310, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T09:09:57.405Z\"}', '2026-03-09 09:09:57'),
(311, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T12:14:41.060Z\"}', '2026-03-09 12:14:41'),
(312, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,40,42,43,44]}', '2026-03-09 12:14:59'),
(313, 1, 1, 'FOLDER_CREATE', 'Folder created: Notes', 'DocumentFolder', 30, '{\"name\":\"Notes\"}', '2026-03-09 15:06:03'),
(314, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T15:11:42.261Z\"}', '2026-03-09 15:11:42'),
(315, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T15:14:28.497Z\"}', '2026-03-09 15:14:28'),
(316, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T15:15:27.911Z\"}', '2026-03-09 15:15:27'),
(317, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T06:07:42.473Z\"}', '2026-03-10 06:07:42'),
(318, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:10:40.911Z\"}', '2026-03-10 09:10:40'),
(319, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:12:25.108Z\"}', '2026-03-10 09:12:25'),
(320, 19, 19, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 19, NULL, '2026-03-10 09:13:02'),
(321, 28, 28, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 28, NULL, '2026-03-10 09:13:08'),
(322, 30, 30, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 30, NULL, '2026-03-10 09:13:15'),
(323, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:13:20.386Z\"}', '2026-03-10 09:13:20'),
(324, 25, 25, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 25, NULL, '2026-03-10 09:13:49'),
(325, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:13:53.556Z\"}', '2026-03-10 09:13:53'),
(326, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:14:07.623Z\"}', '2026-03-10 09:14:07'),
(327, 28, 28, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 28, NULL, '2026-03-10 09:14:08'),
(328, 29, 29, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 29, NULL, '2026-03-10 09:14:11'),
(329, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:14:28.456Z\"}', '2026-03-10 09:14:28'),
(330, 30, 30, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 30, NULL, '2026-03-10 09:14:28'),
(331, 25, 25, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 25, NULL, '2026-03-10 09:14:53'),
(332, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:14:56.034Z\"}', '2026-03-10 09:14:56'),
(333, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:15:36.190Z\"}', '2026-03-10 09:15:36'),
(334, 29, 29, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 29, NULL, '2026-03-10 09:15:51'),
(335, 33, 33, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 33, NULL, '2026-03-10 09:18:54'),
(336, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T09:19:18.181Z\"}', '2026-03-10 09:19:18'),
(337, 33, 33, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 33, NULL, '2026-03-10 09:19:48'),
(338, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T11:30:57.912Z\"}', '2026-03-10 11:30:57'),
(339, 1, 1, 'SUBJECT_CREATE', 'Created subject: English', 'Subject', NULL, '{\"name\":\"English\",\"description\":null,\"code\":\"101\",\"color\":\"#3B82F6\"}', '2026-03-10 11:32:21'),
(340, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: English', 'Subject', 16, '{\"code\":\"101\",\"name\":\"English\",\"description\":null,\"course_category_id\":2,\"max_marks\":null,\"color\":\"#3B82F6\"}', '2026-03-10 11:33:01'),
(341, 1, 1, 'GRADE_SUBJECT_ASSIGN', 'Assigned subject ID 16 to grade ID 9', 'GradeSubject', NULL, '{\"grade_id\":9,\"subject_id\":16}', '2026-03-10 11:33:02'),
(342, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: English', 'Subject', 16, '{\"code\":\"101\",\"name\":\"English\",\"description\":null,\"course_category_id\":2,\"max_marks\":100,\"color\":\"#3B82F6\"}', '2026-03-10 11:36:16'),
(343, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: English', 'Subject', 16, '{\"code\":\"101\",\"name\":\"English\",\"description\":null,\"course_category_id\":2,\"max_marks\":100,\"color\":\"#3B82F6\"}', '2026-03-10 11:36:47'),
(344, 1, 1, 'GRADE_SUBJECT_ASSIGN', 'Assigned subject ID 16 to grade ID 10', 'GradeSubject', NULL, '{\"grade_id\":10,\"subject_id\":16}', '2026-03-10 11:36:48'),
(345, 1, 1, 'GRADE_SUBJECT_ASSIGN', 'Assigned subject ID 16 to grade ID 11', 'GradeSubject', NULL, '{\"grade_id\":11,\"subject_id\":16}', '2026-03-10 11:36:48'),
(346, 1, 1, 'GRADE_SUBJECT_ASSIGN', 'Assigned subject ID 16 to grade ID 24', 'GradeSubject', NULL, '{\"grade_id\":24,\"subject_id\":16}', '2026-03-10 11:36:48'),
(347, 24, 24, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 24, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T11:52:04.521Z\"}', '2026-03-10 11:52:04'),
(348, 24, 24, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 24, NULL, '2026-03-10 11:53:08'),
(349, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T14:25:34.786Z\"}', '2026-03-10 14:25:34'),
(350, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T18:31:56.352Z\"}', '2026-03-10 18:31:56'),
(351, 31, 31, 'PROFILE_UPDATE', 'User updated their personal profile information', 'UserProfile', 31, '{\"first_name\":\"TUNGA\",\"last_name\":\"Tiana\",\"gender\":\"FEMALE\",\"date_of_birth\":null,\"address\":null,\"external_id\":null}', '2026-03-10 19:44:52'),
(352, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-11T10:10:45.920Z\"}', '2026-03-11 10:10:45'),
(353, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-12T12:56:39.229Z\"}', '2026-03-12 12:56:39'),
(354, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-13T12:40:33.881Z\"}', '2026-03-13 12:40:33'),
(355, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,40,42,43,44,45]}', '2026-03-13 12:41:00'),
(356, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: PROGRAM_MANAGER', 'Role', 12, '{\"permissionIds\":[16,17,27,34,38,40,45]}', '2026-03-13 12:41:35'),
(357, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,40,42,43,44,45,46]}', '2026-03-13 12:42:11'),
(358, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: PROGRAM_MANAGER', 'Role', 12, '{\"permissionIds\":[16,17,27,34,38,40,45,46]}', '2026-03-13 12:42:21'),
(359, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T19:56:40.895Z\"}', '2026-03-14 19:56:40'),
(360, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: SUPER_ADMIN', 'Role', 1, '{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,40,42,43,44,45,46,48]}', '2026-03-14 20:00:02'),
(361, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: TEACHER', 'Role', 4, '{\"permissionIds\":[5,6,7,8,14,15,27,37,38,40,47]}', '2026-03-14 20:00:14'),
(362, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: PROGRAM_MANAGER', 'Role', 12, '{\"permissionIds\":[16,17,27,34,38,40,45,46,48]}', '2026-03-14 20:00:53'),
(363, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: CLASS_TEACHER', 'Role', 11, '{\"permissionIds\":[3,14,25,26,27,28,33,34,35,37,38,40,43,46]}', '2026-03-14 20:01:25'),
(364, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T20:05:10.713Z\"}', '2026-03-14 20:05:10'),
(365, 15, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-14 to 2026-03-14', 'InstructorReport', 1, NULL, '2026-03-14 20:51:57'),
(366, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T20:52:36.920Z\"}', '2026-03-14 20:52:36'),
(367, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T20:56:32.507Z\"}', '2026-03-14 20:56:32'),
(368, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T21:08:42.335Z\"}', '2026-03-14 21:08:42'),
(369, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T21:10:32.321Z\"}', '2026-03-14 21:10:32'),
(370, 13, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-14 to 2026-03-14', 'InstructorReport', 2, NULL, '2026-03-14 21:13:20'),
(371, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-15T16:17:38.839Z\"}', '2026-03-15 16:17:38'),
(372, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-15T19:42:35.848Z\"}', '2026-03-15 19:42:35'),
(373, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-15T19:51:56.491Z\"}', '2026-03-15 19:51:56'),
(374, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-16T12:20:36.787Z\"}', '2026-03-16 12:20:36'),
(375, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-16T18:05:37.078Z\"}', '2026-03-16 18:05:37'),
(376, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-16T18:06:46.155Z\"}', '2026-03-16 18:06:46'),
(377, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-16T18:44:10.783Z\"}', '2026-03-16 18:44:10'),
(378, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-16T19:29:27.882Z\"}', '2026-03-16 19:29:27'),
(379, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-16T20:09:50.157Z\"}', '2026-03-16 20:09:50'),
(380, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-17T01:28:21.645Z\"}', '2026-03-17 01:28:21'),
(381, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-17T03:32:44.822Z\"}', '2026-03-17 03:32:44'),
(382, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-17T05:49:04.947Z\"}', '2026-03-17 05:49:04'),
(383, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-17T05:58:29.887Z\"}', '2026-03-17 05:58:29'),
(384, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-17T05:58:44.030Z\"}', '2026-03-17 05:58:44'),
(385, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-17T14:34:40.518Z\"}', '2026-03-17 14:34:40'),
(386, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-18T09:38:56.651Z\"}', '2026-03-18 09:38:56'),
(387, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-19T10:19:02.099Z\"}', '2026-03-19 10:19:02'),
(388, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-19T10:29:12.986Z\"}', '2026-03-19 10:29:13'),
(389, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-19T12:15:34.160Z\"}', '2026-03-19 12:15:34'),
(390, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-19T12:18:46.501Z\"}', '2026-03-19 12:18:46'),
(391, 15, NULL, 'REPORT_UPDATE', 'Updated instructor report for period 2026-03-14 to 2026-03-14', 'InstructorReport', 1, NULL, '2026-03-19 14:08:05'),
(392, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-19T14:24:57.579Z\"}', '2026-03-19 14:24:57'),
(393, 16, 1, 'PROFILE_UPDATE', 'Administrator updated the user profile', 'UserProfile', 16, '{\"first_name\":\"Ndazivunnye\",\"last_name\":\"Felix\",\"gender\":\"MALE\",\"date_of_birth\":\"\",\"address\":\"Kigali Gatenga\",\"external_id\":\"\",\"phone_number\":\"0783409722\",\"updatedBy\":1}', '2026-03-19 16:03:08'),
(394, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-21T07:07:48.913Z\"}', '2026-03-21 07:07:48'),
(395, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-21T08:06:37.768Z\"}', '2026-03-21 08:06:37'),
(396, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-23T05:31:38.552Z\"}', '2026-03-23 05:31:38'),
(397, 24, 24, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 24, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-23T07:17:26.721Z\"}', '2026-03-23 07:17:26'),
(398, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-24T17:55:22.203Z\"}', '2026-03-24 17:55:22'),
(399, 21, 21, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 21, NULL, '2026-03-24 17:56:34'),
(400, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-27T08:18:40.037Z\"}', '2026-03-27 08:18:40'),
(401, 24, 24, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 24, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-27T08:19:15.974Z\"}', '2026-03-27 08:19:16'),
(402, 14, 14, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 14, NULL, '2026-03-27 08:19:58'),
(403, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-27T08:21:03.330Z\"}', '2026-03-27 08:21:03'),
(404, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: PROGRAM_MANAGER', 'Role', 12, '{\"permissionIds\":[16,17,27,34,38,40,45,46,48,33,35,36]}', '2026-03-27 08:22:10'),
(405, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-26 to 2026-03-26', 'InstructorReport', 3, NULL, '2026-03-27 08:41:26'),
(406, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-27T08:47:10.551Z\"}', '2026-03-27 08:47:10'),
(407, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-27 to 2026-03-27', 'InstructorReport', 4, NULL, '2026-03-27 08:48:25'),
(408, 15, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-26 to 2026-03-26', 'InstructorReport', 5, NULL, '2026-03-27 08:50:08'),
(409, 15, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-22 to 2026-03-22', 'InstructorReport', 6, NULL, '2026-03-27 08:58:55'),
(410, 15, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-23 to 2026-03-23', 'InstructorReport', 7, NULL, '2026-03-27 09:00:44'),
(411, 15, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-24 to 2026-03-24', 'InstructorReport', 8, NULL, '2026-03-27 09:02:29'),
(412, 15, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-25 to 2026-03-25', 'InstructorReport', 9, NULL, '2026-03-27 09:04:06'),
(413, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-24 to 2026-03-24', 'InstructorReport', 10, NULL, '2026-03-27 09:05:03'),
(414, 15, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-27 to 2026-03-27', 'InstructorReport', 11, NULL, '2026-03-27 09:06:14'),
(415, 14, NULL, 'REPORT_UPDATE', 'Updated instructor report for period 2026-03-27 to 2026-03-27', 'InstructorReport', 4, NULL, '2026-03-27 09:08:01'),
(416, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-27T09:16:18.908Z\"}', '2026-03-27 09:16:18'),
(417, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-30T07:41:42.447Z\"}', '2026-03-30 07:41:42'),
(418, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-30T07:53:29.350Z\"}', '2026-03-30 07:53:29'),
(419, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-30T17:53:26.419Z\"}', '2026-03-30 17:53:26'),
(420, 23, 23, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 23, NULL, '2026-03-30 18:11:54'),
(421, 23, 23, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 23, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-30T18:13:01.968Z\"}', '2026-03-30 18:13:02'),
(422, 23, 23, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 23, NULL, '2026-03-30 18:13:42'),
(423, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-31T08:26:26.327Z\"}', '2026-03-31 08:26:26'),
(424, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-31T09:17:13.149Z\"}', '2026-03-31 09:17:13'),
(425, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-31T09:21:38.817Z\"}', '2026-03-31 09:21:38'),
(426, 13, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-30 to 2026-03-30', 'InstructorReport', 12, NULL, '2026-03-31 09:28:18'),
(427, 13, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-25 to 2026-03-25', 'InstructorReport', 13, NULL, '2026-03-31 09:38:22'),
(428, 20, 20, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 20, NULL, '2026-04-01 06:28:01'),
(429, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-01T19:23:58.555Z\"}', '2026-04-01 19:23:58'),
(430, 21, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-03-21 to 2026-03-21', 'InstructorReport', 25, NULL, '2026-04-01 20:05:45'),
(431, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-03T08:49:57.078Z\"}', '2026-04-03 08:49:57'),
(432, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-09T07:18:20.008Z\"}', '2026-04-09 07:18:20'),
(433, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-13T08:16:30.774Z\"}', '2026-04-13 08:16:30'),
(434, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-14T07:59:15.610Z\"}', '2026-04-14 07:59:15'),
(435, 23, 23, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 23, NULL, '2026-04-20 05:24:51'),
(436, 23, 23, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 23, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-20T05:25:54.240Z\"}', '2026-04-20 05:25:54'),
(437, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-23T16:42:11.286Z\"}', '2026-04-23 16:42:11'),
(438, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-23T16:43:47.989Z\"}', '2026-04-23 16:43:48'),
(439, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-27T12:54:24.331Z\"}', '2026-04-27 12:54:24'),
(440, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-27T13:17:27.414Z\"}', '2026-04-27 13:17:27'),
(441, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-27T13:20:25.210Z\"}', '2026-04-27 13:20:25'),
(442, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-27T13:20:34.924Z\"}', '2026-04-27 13:20:34'),
(443, 33, 33, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 33, NULL, '2026-04-27 13:24:50'),
(444, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-27T13:25:32.929Z\"}', '2026-04-27 13:25:32'),
(445, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-27T17:48:37.936Z\"}', '2026-04-27 17:48:37'),
(446, 28, 28, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 28, NULL, '2026-04-27 18:07:01'),
(447, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-27T18:14:44.799Z\"}', '2026-04-27 18:14:44'),
(448, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-28T05:48:38.537Z\"}', '2026-04-28 05:48:38'),
(449, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-28T08:51:47.939Z\"}', '2026-04-28 08:51:48'),
(450, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-28T08:53:19.585Z\"}', '2026-04-28 08:53:19'),
(451, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-28T09:38:40.711Z\"}', '2026-04-28 09:38:40'),
(452, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-28T17:58:41.195Z\"}', '2026-04-28 17:58:41'),
(453, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-28T21:16:18.990Z\"}', '2026-04-28 21:16:19'),
(454, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T03:10:03.993Z\"}', '2026-04-29 03:10:04'),
(455, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T10:09:43.172Z\"}', '2026-04-29 10:09:43'),
(456, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T11:21:47.163Z\"}', '2026-04-29 11:21:47'),
(457, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T12:07:52.626Z\"}', '2026-04-29 12:07:52'),
(458, 25, 25, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 25, NULL, '2026-04-29 12:29:38'),
(459, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T12:30:32.365Z\"}', '2026-04-29 12:30:32'),
(460, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T19:02:59.992Z\"}', '2026-04-29 19:03:00'),
(461, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T19:51:26.037Z\"}', '2026-04-29 19:51:26'),
(462, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T05:46:57.340Z\"}', '2026-04-30 05:46:57'),
(463, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T07:00:02.995Z\"}', '2026-04-30 07:00:03'),
(464, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T07:41:51.954Z\"}', '2026-04-30 07:41:51'),
(465, 1, 1, 'ACADEMIC_TERM_CREATE', 'Created academic term: Term 3', 'AcademicTerm', 5, '{\"name\":\"Term 3\",\"academic_year_id\":3,\"start_date\":\"2026-04-29\",\"end_date\":\"2026-08-30\",\"is_current\":1}', '2026-04-30 07:42:44'),
(466, 34, 1, 'USER_CREATE', 'Created user: TestUser', 'User', 34, '{\"username\":\"TestUser\",\"email\":\"universalbridgeltd@gmail.com\",\"roles\":[6]}', '2026-04-30 07:43:34'),
(467, 34, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-04-30 07:54:18'),
(468, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 34 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":34,\"classGroupId\":9}', '2026-04-30 07:54:18'),
(469, 34, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-04-30 07:54:47'),
(470, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 34 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":34,\"subjectId\":9,\"academic_term_id\":4}', '2026-04-30 07:54:47'),
(471, 34, 34, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 34, NULL, '2026-04-30 07:56:16'),
(472, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T07:56:46.470Z\"}', '2026-04-30 07:56:46'),
(473, 34, 34, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 34, NULL, '2026-04-30 07:57:05'),
(474, 34, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}', '2026-04-30 10:09:13'),
(475, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 34 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":34,\"subjectId\":8,\"academic_term_id\":4}', '2026-04-30 10:09:13'),
(476, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T11:09:07.082Z\"}', '2026-04-30 11:09:07'),
(477, 29, 29, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 29, NULL, '2026-04-30 11:53:14'),
(478, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T11:54:16.332Z\"}', '2026-04-30 11:54:16'),
(479, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T12:39:11.639Z\"}', '2026-04-30 12:39:11'),
(480, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-30T12:47:58.512Z\"}', '2026-04-30 12:47:58'),
(481, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-01T04:13:20.593Z\"}', '2026-05-01 04:13:20'),
(482, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-01T17:46:26.225Z\"}', '2026-05-01 17:46:26'),
(483, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-01T18:34:31.649Z\"}', '2026-05-01 18:34:31'),
(484, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-01T23:13:18.380Z\"}', '2026-05-01 23:13:18'),
(485, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-02T08:53:58.037Z\"}', '2026-05-02 08:53:58'),
(486, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-02T09:11:36.360Z\"}', '2026-05-02 09:11:36'),
(487, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-03T07:22:48.682Z\"}', '2026-05-03 07:22:48'),
(488, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-03T09:54:45.527Z\"}', '2026-05-03 09:54:45'),
(489, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-03T13:57:06.238Z\"}', '2026-05-03 13:57:06'),
(490, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-03T15:01:25.340Z\"}', '2026-05-03 15:01:25'),
(491, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T05:46:52.680Z\"}', '2026-05-04 05:46:52'),
(492, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T11:28:35.734Z\"}', '2026-05-04 11:28:35'),
(493, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T15:34:10.446Z\"}', '2026-05-04 15:34:10'),
(494, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T15:44:52.014Z\"}', '2026-05-04 15:44:52'),
(495, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T16:47:15.847Z\"}', '2026-05-04 16:47:15'),
(496, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T16:55:10.469Z\"}', '2026-05-04 16:55:10'),
(497, 29, 29, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 29, NULL, '2026-05-04 17:18:38'),
(498, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T17:19:35.961Z\"}', '2026-05-04 17:19:36'),
(499, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T19:57:48.988Z\"}', '2026-05-04 19:57:49'),
(500, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T19:57:55.903Z\"}', '2026-05-04 19:57:55'),
(501, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-04T21:57:42.349Z\"}', '2026-05-04 21:57:42'),
(502, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-05T04:41:30.341Z\"}', '2026-05-05 04:41:30'),
(503, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-05T04:43:03.318Z\"}', '2026-05-05 04:43:03'),
(504, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-05T05:44:23.395Z\"}', '2026-05-05 05:44:23'),
(505, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-05T06:38:50.411Z\"}', '2026-05-05 06:38:50'),
(506, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-06T17:19:51.607Z\"}', '2026-05-06 17:19:51'),
(507, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-06T17:22:21.353Z\"}', '2026-05-06 17:22:21'),
(508, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-07T08:00:48.507Z\"}', '2026-05-07 08:00:48'),
(509, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-07T11:06:44.394Z\"}', '2026-05-07 11:06:44'),
(510, 21, 21, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 21, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-07T11:07:16.993Z\"}', '2026-05-07 11:07:17'),
(511, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-08T11:04:19.477Z\"}', '2026-05-08 11:04:19'),
(512, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-10T16:39:16.689Z\"}', '2026-05-10 16:39:16'),
(513, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T06:41:52.330Z\"}', '2026-05-11 06:41:52'),
(514, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:13:20.971Z\"}', '2026-05-11 07:13:21'),
(515, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:17:22.951Z\"}', '2026-05-11 07:17:22'),
(516, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:18:17.552Z\"}', '2026-05-11 07:18:17'),
(517, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:18:19.729Z\"}', '2026-05-11 07:18:19'),
(518, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:20:54.266Z\"}', '2026-05-11 07:20:54'),
(519, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:22:30.390Z\"}', '2026-05-11 07:22:30'),
(520, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:33:57.708Z\"}', '2026-05-11 07:33:57'),
(521, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:38:40.534Z\"}', '2026-05-11 07:38:40'),
(522, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:42:06.860Z\"}', '2026-05-11 07:42:06'),
(523, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:44:54.881Z\"}', '2026-05-11 07:44:54'),
(524, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T09:07:27.817Z\"}', '2026-05-11 09:07:27'),
(525, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T09:10:03.285Z\"}', '2026-05-11 09:10:03'),
(526, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-12T10:20:18.657Z\"}', '2026-05-12 10:20:18'),
(527, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-12T10:21:16.678Z\"}', '2026-05-12 10:21:16'),
(528, 23, 23, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 23, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-13T06:47:47.433Z\"}', '2026-05-13 06:47:47'),
(529, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-13T09:17:06.243Z\"}', '2026-05-13 09:17:06'),
(530, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-14T03:07:55.782Z\"}', '2026-05-14 03:07:55'),
(531, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-14T03:12:20.274Z\"}', '2026-05-14 03:12:20'),
(532, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-15T06:54:03.007Z\"}', '2026-05-15 06:54:03'),
(533, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-16T07:01:53.016Z\"}', '2026-05-16 07:01:53'),
(534, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-17T15:02:23.142Z\"}', '2026-05-17 15:02:23'),
(535, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-17T17:47:56.651Z\"}', '2026-05-17 17:47:56'),
(536, 23, 23, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 23, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-20T06:40:54.987Z\"}', '2026-05-20 06:40:55'),
(537, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-21T10:02:24.334Z\"}', '2026-05-21 10:02:24');
INSERT INTO `ActivityLog` (`activity_id`, `user_id`, `actor_id`, `action_type`, `description`, `entity_type`, `entity_id`, `metadata`, `created_at`) VALUES
(538, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T08:30:45.871Z\"}', '2026-05-26 08:30:45'),
(539, 19, 19, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 19, NULL, '2026-05-26 09:11:22'),
(540, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:11:42.277Z\"}', '2026-05-26 09:11:42'),
(541, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:20:25.394Z\"}', '2026-05-26 09:20:25'),
(542, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:43:28.587Z\"}', '2026-05-26 09:43:28'),
(543, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:47:59.908Z\"}', '2026-05-26 09:47:59'),
(544, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:51:26.098Z\"}', '2026-05-26 09:51:26'),
(545, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:52:35.790Z\"}', '2026-05-26 09:52:35'),
(546, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:55:01.383Z\"}', '2026-05-26 09:55:01'),
(547, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T09:58:18.415Z\"}', '2026-05-26 09:58:18'),
(548, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-26T10:04:52.070Z\"}', '2026-05-26 10:04:52'),
(549, 19, 19, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 19, NULL, '2026-05-28 09:39:49'),
(550, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T09:40:06.524Z\"}', '2026-05-28 09:40:06'),
(551, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T09:40:17.241Z\"}', '2026-05-28 09:40:17'),
(552, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T09:57:00.278Z\"}', '2026-05-28 09:57:00'),
(553, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T14:56:38.294Z\"}', '2026-05-28 14:56:38'),
(554, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T15:03:56.258Z\"}', '2026-05-28 15:03:56'),
(555, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T15:05:50.420Z\"}', '2026-05-28 15:05:50'),
(556, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T15:08:00.153Z\"}', '2026-05-28 15:08:00'),
(557, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T15:17:22.012Z\"}', '2026-05-28 15:17:22'),
(558, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-28T15:18:09.642Z\"}', '2026-05-28 15:18:09'),
(559, 14, 14, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 14, NULL, '2026-05-29 11:36:31'),
(560, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-29T11:37:06.228Z\"}', '2026-05-29 11:37:06'),
(561, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-29T11:46:14.708Z\"}', '2026-05-29 11:46:14'),
(562, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP SCHEME OF WORK TERM1.pdf', 'Document', 22, '{\"file_name\":\"1780055213532-k08q67pltq.pdf\",\"original_name\":\"PHP SCHEME OF WORK TERM1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":367750}', '2026-05-29 11:46:55'),
(563, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP SCHEME OF WORK TERM3.pdf', 'Document', 23, '{\"file_name\":\"1780055213552-f3ettos2e8e.pdf\",\"original_name\":\"PHP SCHEME OF WORK TERM3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":376320}', '2026-05-29 11:46:55'),
(564, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP SCHEME OF WORK TERM2.pdf', 'Document', 24, '{\"file_name\":\"1780055213925-521xju82nut.pdf\",\"original_name\":\"PHP SCHEME OF WORK TERM2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":404710}', '2026-05-29 11:46:55'),
(565, 14, 14, 'FOLDER_DELETE', 'Folder deleted: DATABASE', 'DocumentFolder', 18, NULL, '2026-05-29 11:48:01'),
(566, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP SCHEME OF WORK TERM1.pdf', 'Document', 25, '{\"file_name\":\"1780055297545-hgqb73vj5gf.pdf\",\"original_name\":\"PHP SCHEME OF WORK TERM1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":367750}', '2026-05-29 11:48:19'),
(567, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP SCHEME OF WORK TERM3.pdf', 'Document', 26, '{\"file_name\":\"1780055297750-ijl2stm1iye.pdf\",\"original_name\":\"PHP SCHEME OF WORK TERM3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":376320}', '2026-05-29 11:48:19'),
(568, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP SCHEME OF WORK TERM2.pdf', 'Document', 27, '{\"file_name\":\"1780055298018-c78ve2y867k.pdf\",\"original_name\":\"PHP SCHEME OF WORK TERM2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":404710}', '2026-05-29 11:48:20'),
(569, 14, 14, 'FOLDER_CREATE', 'Folder created: DATABASE', 'DocumentFolder', 31, '{\"name\":\"DATABASE\",\"parentFolderId\":16}', '2026-05-29 11:48:37'),
(570, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: Term1.pdf', 'Document', 28, '{\"file_name\":\"1780055342474-lm8cjzkvbha.pdf\",\"original_name\":\"Term1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":283681}', '2026-05-29 11:49:04'),
(571, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: Term2.pdf', 'Document', 29, '{\"file_name\":\"1780055342799-8rhyxmjej8i.pdf\",\"original_name\":\"Term2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":292349}', '2026-05-29 11:49:04'),
(572, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: Term3.pdf', 'Document', 30, '{\"file_name\":\"1780055343233-5a1zie50n3c.pdf\",\"original_name\":\"Term3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":262315}', '2026-05-29 11:49:05'),
(573, 14, 14, 'FOLDER_CREATE', 'Folder created: LESSON PLANS', 'DocumentFolder', 32, '{\"name\":\"LESSON PLANS\"}', '2026-05-29 11:49:26'),
(574, 14, 14, 'FOLDER_CREATE', 'Folder created: DATABSE', 'DocumentFolder', 33, '{\"name\":\"DATABSE\",\"parentFolderId\":32}', '2026-05-29 11:49:42'),
(575, 14, 14, 'FOLDER_CREATE', 'Folder created: PHP', 'DocumentFolder', 34, '{\"name\":\"PHP\",\"parentFolderId\":32}', '2026-05-29 11:49:51'),
(576, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: TERM3.zip', 'Document', 31, '{\"file_name\":\"1780055483077-yuk00518dpi.zip\",\"original_name\":\"TERM3.zip\",\"mime_type\":\"application/x-zip-compressed\",\"file_size\":774418}', '2026-05-29 11:51:25'),
(577, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: TERM2.zip', 'Document', 32, '{\"file_name\":\"1780055483365-gkhzuntax4q.zip\",\"original_name\":\"TERM2.zip\",\"mime_type\":\"application/x-zip-compressed\",\"file_size\":1393864}', '2026-05-29 11:51:25'),
(578, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: TERM1.zip', 'Document', 33, '{\"file_name\":\"1780055484844-t91wjhmaxfs.zip\",\"original_name\":\"TERM1.zip\",\"mime_type\":\"application/x-zip-compressed\",\"file_size\":4010211}', '2026-05-29 11:51:27'),
(579, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: TERM3.zip', 'Document', 34, '{\"file_name\":\"1780055534529-tu49rbcvbsg.zip\",\"original_name\":\"TERM3.zip\",\"mime_type\":\"application/x-zip-compressed\",\"file_size\":1274996}', '2026-05-29 11:52:16'),
(580, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: TERM2.zip', 'Document', 35, '{\"file_name\":\"1780055534747-b5p7mvwd2cd.zip\",\"original_name\":\"TERM2.zip\",\"mime_type\":\"application/x-zip-compressed\",\"file_size\":1610545}', '2026-05-29 11:52:16'),
(581, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: TERM1.zip', 'Document', 36, '{\"file_name\":\"1780055535105-dflrga7lc9.zip\",\"original_name\":\"TERM1.zip\",\"mime_type\":\"application/x-zip-compressed\",\"file_size\":2128547}', '2026-05-29 11:52:17'),
(582, 14, 14, 'FOLDER_CREATE', 'Folder created: TERM1', 'DocumentFolder', 35, '{\"name\":\"TERM1\",\"parentFolderId\":34}', '2026-05-29 11:52:29'),
(583, 14, 14, 'FOLDER_CREATE', 'Folder created: TERM2', 'DocumentFolder', 36, '{\"name\":\"TERM2\",\"parentFolderId\":34}', '2026-05-29 11:52:40'),
(584, 14, 14, 'FOLDER_CREATE', 'Folder created: TERM3', 'DocumentFolder', 37, '{\"name\":\"TERM3\",\"parentFolderId\":34}', '2026-05-29 11:52:48'),
(585, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK1.pdf', 'Document', 37, '{\"file_name\":\"1780055584082-usrexbu14k.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":158025}', '2026-05-29 11:53:06'),
(586, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK8.pdf', 'Document', 38, '{\"file_name\":\"1780055584341-k0winlkcym.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK8.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139051}', '2026-05-29 11:53:06'),
(587, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK2.pdf', 'Document', 39, '{\"file_name\":\"1780055584378-bo0qrfl3im.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":159760}', '2026-05-29 11:53:06'),
(588, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK3.pdf', 'Document', 40, '{\"file_name\":\"1780055584542-zs6al7ccay.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":158790}', '2026-05-29 11:53:06'),
(589, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK6.pdf', 'Document', 41, '{\"file_name\":\"1780055584644-31tc0cr04k4.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK6.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":183001}', '2026-05-29 11:53:06'),
(590, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK4.pdf', 'Document', 42, '{\"file_name\":\"1780055584655-qckbc0igze.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":339456}', '2026-05-29 11:53:06'),
(591, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK10.pdf', 'Document', 43, '{\"file_name\":\"1780055584627-po67pjsbvv.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK10.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":233320}', '2026-05-29 11:53:06'),
(592, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK9.pdf', 'Document', 44, '{\"file_name\":\"1780055584795-koz8oimxvg.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK9.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140926}', '2026-05-29 11:53:06'),
(593, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK7.pdf', 'Document', 45, '{\"file_name\":\"1780055584820-b4ip4q8xss.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK7.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":230554}', '2026-05-29 11:53:06'),
(594, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK2.pdf', 'Document', 46, '{\"file_name\":\"1780055596079-36fxvbtckmm.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":159760}', '2026-05-29 11:53:18'),
(595, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK3.pdf', 'Document', 47, '{\"file_name\":\"1780055596330-dhd29wp4je.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":158790}', '2026-05-29 11:53:18'),
(596, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK4.pdf', 'Document', 48, '{\"file_name\":\"1780055596390-cocta7hm8dw.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":339456}', '2026-05-29 11:53:18'),
(597, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK1.pdf', 'Document', 49, '{\"file_name\":\"1780055596421-l1tmuebyos.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":158025}', '2026-05-29 11:53:18'),
(598, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK6.pdf', 'Document', 50, '{\"file_name\":\"1780055596616-ogkwg2oy9v.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK6.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":183001}', '2026-05-29 11:53:18'),
(599, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK9.pdf', 'Document', 51, '{\"file_name\":\"1780055596745-12ircv1layrr.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK9.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140926}', '2026-05-29 11:53:18'),
(600, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK8.pdf', 'Document', 52, '{\"file_name\":\"1780055596785-6nvcbl17iqe.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK8.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139051}', '2026-05-29 11:53:18'),
(601, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK7.pdf', 'Document', 53, '{\"file_name\":\"1780055596652-90y4sp2ozxo.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK7.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":230554}', '2026-05-29 11:53:18'),
(602, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK5.pdf', 'Document', 54, '{\"file_name\":\"1780055596788-og64diqnner.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK5.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":180917}', '2026-05-29 11:53:18'),
(603, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM1_WEEK10.pdf', 'Document', 55, '{\"file_name\":\"1780055596992-wliw90se379.pdf\",\"original_name\":\"PHP_LP_TERM1_WEEK10.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":233320}', '2026-05-29 11:53:19'),
(604, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK9.pdf', 'Document', 56, '{\"file_name\":\"1780055623026-if0h581qwd.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK9.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":141656}', '2026-05-29 11:53:45'),
(605, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK11.pdf', 'Document', 57, '{\"file_name\":\"1780055623027-uon05ksodn.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK11.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140942}', '2026-05-29 11:53:45'),
(606, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK1.pdf', 'Document', 58, '{\"file_name\":\"1780055623024-0to30z0bt579.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140879}', '2026-05-29 11:53:45'),
(607, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-29T11:54:24.668Z\"}', '2026-05-29 11:54:24'),
(608, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK1.pdf', 'Document', 59, '{\"file_name\":\"1780055690608-atc0bjhj26.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140879}', '2026-05-29 11:54:52'),
(609, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK9.pdf', 'Document', 60, '{\"file_name\":\"1780055690601-rmdvzvrh5ui.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK9.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":141656}', '2026-05-29 11:54:52'),
(610, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK5.pdf', 'Document', 61, '{\"file_name\":\"1780055690894-2v6wcot4wul.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK5.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139091}', '2026-05-29 11:54:52'),
(611, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK3.pdf', 'Document', 62, '{\"file_name\":\"1780055690732-sj0when5x6.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":138879}', '2026-05-29 11:54:52'),
(612, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK10.pdf', 'Document', 63, '{\"file_name\":\"1780055690934-aqiy406xddr.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK10.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":141880}', '2026-05-29 11:54:52'),
(613, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK4.pdf', 'Document', 64, '{\"file_name\":\"1780055690781-jp19rygmgbt.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139878}', '2026-05-29 11:54:52'),
(614, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK8.pdf', 'Document', 65, '{\"file_name\":\"1780055690968-6q0o24mk31f.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK8.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":183827}', '2026-05-29 11:54:52'),
(615, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK6.pdf', 'Document', 66, '{\"file_name\":\"1780055690804-btevlforebk.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK6.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":232823}', '2026-05-29 11:54:52'),
(616, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK2.pdf', 'Document', 67, '{\"file_name\":\"1780055690997-c6ew2zq519n.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139681}', '2026-05-29 11:54:52'),
(617, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM2_WEEK11.pdf', 'Document', 68, '{\"file_name\":\"1780055691005-tw9oqyk4a2p.pdf\",\"original_name\":\"PHP_LP_TERM2_WEEK11.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140942}', '2026-05-29 11:54:52'),
(618, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK6.pdf', 'Document', 69, '{\"file_name\":\"1780055717383-1xcc28jfffd.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK6.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":143398}', '2026-05-29 11:55:19'),
(619, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK1.pdf', 'Document', 70, '{\"file_name\":\"1780055717228-tksmnuevn5.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":141531}', '2026-05-29 11:55:19'),
(620, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK7.pdf', 'Document', 71, '{\"file_name\":\"1780055717434-cslvl57u50f.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK7.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140398}', '2026-05-29 11:55:19'),
(621, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK8.pdf', 'Document', 72, '{\"file_name\":\"1780055717600-7gxf1jxha0l.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK8.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":142616}', '2026-05-29 11:55:19'),
(622, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK5.pdf', 'Document', 73, '{\"file_name\":\"1780055717584-qkome9i5zns.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK5.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":138704}', '2026-05-29 11:55:19'),
(623, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK3.pdf', 'Document', 74, '{\"file_name\":\"1780055717689-bi3xuxgodwh.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139071}', '2026-05-29 11:55:19'),
(624, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK2.pdf', 'Document', 75, '{\"file_name\":\"1780055717841-phds6t4pzxk.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":233106}', '2026-05-29 11:55:19'),
(625, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: PHP_LP_TERM3_WEEK4.pdf', 'Document', 76, '{\"file_name\":\"1780055718164-gautia5tsa.pdf\",\"original_name\":\"PHP_LP_TERM3_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139762}', '2026-05-29 11:55:20'),
(626, 14, 14, 'FOLDER_CREATE', 'Folder created: TERM1', 'DocumentFolder', 38, '{\"name\":\"TERM1\",\"parentFolderId\":33}', '2026-05-29 11:55:42'),
(627, 14, 14, 'FOLDER_CREATE', 'Folder created: TERM2', 'DocumentFolder', 39, '{\"name\":\"TERM2\",\"parentFolderId\":33}', '2026-05-29 11:55:51'),
(628, 14, 14, 'FOLDER_CREATE', 'Folder created: TERM3', 'DocumentFolder', 40, '{\"name\":\"TERM3\",\"parentFolderId\":33}', '2026-05-29 11:55:58'),
(629, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK1.pdf', 'Document', 77, '{\"file_name\":\"1780055786708-wmn7ptrp6h.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":134878}', '2026-05-29 11:56:28'),
(630, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK2.pdf', 'Document', 78, '{\"file_name\":\"1780055786793-r58j25qyko.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":135935}', '2026-05-29 11:56:28'),
(631, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK4.pdf', 'Document', 79, '{\"file_name\":\"1780055786816-fwc3o2qkxgk.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":137692}', '2026-05-29 11:56:28'),
(632, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK5.pdf', 'Document', 80, '{\"file_name\":\"1780055786894-fwtyvjs06rb.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK5.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":135552}', '2026-05-29 11:56:28'),
(633, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK10.pdf', 'Document', 81, '{\"file_name\":\"1780055787027-0t7e3eywrbks.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK10.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139673}', '2026-05-29 11:56:28'),
(634, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK6.pdf', 'Document', 82, '{\"file_name\":\"1780055787056-4570rjli5u2.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK6.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":229423}', '2026-05-29 11:56:28'),
(635, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK3.pdf', 'Document', 83, '{\"file_name\":\"1780055787058-yagcwlkkzh.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":227410}', '2026-05-29 11:56:29'),
(636, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK9.pdf', 'Document', 84, '{\"file_name\":\"1780055787090-rm0ydap2cs.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK9.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":320267}', '2026-05-29 11:56:29'),
(637, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK7.pdf', 'Document', 85, '{\"file_name\":\"1780055787153-2667u1s2v2t.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK7.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":136477}', '2026-05-29 11:56:29'),
(638, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM1_WEEK8.pdf', 'Document', 86, '{\"file_name\":\"1780055787332-9cu5ms59ejm.pdf\",\"original_name\":\"NGA_LP_TERM1_WEEK8.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":181140}', '2026-05-29 11:56:29'),
(639, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK8.pdf', 'Document', 87, '{\"file_name\":\"1780055807309-ie584ttchmr.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK8.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":138699}', '2026-05-29 11:56:49'),
(640, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK1.pdf', 'Document', 88, '{\"file_name\":\"1780055807453-wvzqoyz4n4a.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":135526}', '2026-05-29 11:56:49'),
(641, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK3.pdf', 'Document', 89, '{\"file_name\":\"1780055807534-l9sgqmlhlkn.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":134798}', '2026-05-29 11:56:49'),
(642, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK2.pdf', 'Document', 90, '{\"file_name\":\"1780055807458-45bz54v04i6.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":136864}', '2026-05-29 11:56:49'),
(643, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK4.pdf', 'Document', 91, '{\"file_name\":\"1780055807579-o9cgz2nomlj.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":138753}', '2026-05-29 11:56:49'),
(644, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK5.pdf', 'Document', 92, '{\"file_name\":\"1780055807527-bxpkqngg0fj.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK5.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":137939}', '2026-05-29 11:56:49'),
(645, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK10.pdf', 'Document', 93, '{\"file_name\":\"1780055807654-lwgozx7cxh.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK10.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140155}', '2026-05-29 11:56:49'),
(646, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK6.pdf', 'Document', 94, '{\"file_name\":\"1780055807878-6w09dp1gamb.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK6.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139155}', '2026-05-29 11:56:49'),
(647, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-29T11:57:22.746Z\"}', '2026-05-29 11:57:22'),
(648, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK8.pdf', 'Document', 95, '{\"file_name\":\"1780055858729-xyhc5gjcyod.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK8.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":138699}', '2026-05-29 11:57:40'),
(649, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK4.pdf', 'Document', 96, '{\"file_name\":\"1780055858708-kwelj9ken8.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":138753}', '2026-05-29 11:57:40'),
(650, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK2.pdf', 'Document', 97, '{\"file_name\":\"1780055858753-5pcvfr1oru6.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":136864}', '2026-05-29 11:57:40'),
(651, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK10.pdf', 'Document', 98, '{\"file_name\":\"1780055859042-pvegho28yhq.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK10.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":140155}', '2026-05-29 11:57:40'),
(652, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK6.pdf', 'Document', 99, '{\"file_name\":\"1780055859006-dk3v7xo6dag.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK6.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139155}', '2026-05-29 11:57:40'),
(653, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK3.pdf', 'Document', 100, '{\"file_name\":\"1780055859140-st0igv9y5el.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":134798}', '2026-05-29 11:57:40'),
(654, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK9.pdf', 'Document', 101, '{\"file_name\":\"1780055858976-zf0sk966jd.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK9.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":231740}', '2026-05-29 11:57:40'),
(655, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK5.pdf', 'Document', 102, '{\"file_name\":\"1780055859130-lzzhqlwrc5q.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK5.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":137939}', '2026-05-29 11:57:41'),
(656, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM2_WEEK1.pdf', 'Document', 103, '{\"file_name\":\"1780055859174-wvkfpbc23t.pdf\",\"original_name\":\"NGA_LP_TERM2_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":135526}', '2026-05-29 11:57:41'),
(657, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM3_WEEK2.pdf', 'Document', 104, '{\"file_name\":\"1780055881535-p4dn0jp3ro.pdf\",\"original_name\":\"NGA_LP_TERM3_WEEK2.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139630}', '2026-05-29 11:58:03'),
(658, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM3_WEEK3.pdf', 'Document', 105, '{\"file_name\":\"1780055881938-ahgrjyfj0u8.pdf\",\"original_name\":\"NGA_LP_TERM3_WEEK3.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":139585}', '2026-05-29 11:58:03'),
(659, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM3_WEEK1.pdf', 'Document', 106, '{\"file_name\":\"1780055881904-z9azvt4ar2j.pdf\",\"original_name\":\"NGA_LP_TERM3_WEEK1.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":232438}', '2026-05-29 11:58:03'),
(660, 14, 14, 'DOCUMENT_UPLOAD', 'Document uploaded: NGA_LP_TERM3_WEEK4.pdf', 'Document', 107, '{\"file_name\":\"1780055882182-gb35ik4u305.pdf\",\"original_name\":\"NGA_LP_TERM3_WEEK4.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":237072}', '2026-05-29 11:58:04'),
(661, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-04 to 2026-05-04', 'InstructorReport', 29, NULL, '2026-05-29 12:01:42'),
(662, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-05 to 2026-05-05', 'InstructorReport', 30, NULL, '2026-05-29 12:03:40'),
(663, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-06 to 2026-05-06', 'InstructorReport', 31, NULL, '2026-05-29 12:04:30'),
(664, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-12 to 2026-05-12', 'InstructorReport', 32, NULL, '2026-05-29 12:05:09'),
(665, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-13 to 2026-05-13', 'InstructorReport', 33, NULL, '2026-05-29 12:06:28'),
(666, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-29T12:06:59.878Z\"}', '2026-05-29 12:06:59'),
(667, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-19 to 2026-05-19', 'InstructorReport', 34, NULL, '2026-05-29 12:07:12'),
(668, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-20 to 2026-05-20', 'InstructorReport', 35, NULL, '2026-05-29 12:07:39'),
(669, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-26 to 2026-05-26', 'InstructorReport', 36, NULL, '2026-05-29 12:09:00'),
(670, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-04-21 to 2026-04-21', 'InstructorReport', 37, NULL, '2026-05-29 12:19:12'),
(671, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-04-22 to 2026-04-22', 'InstructorReport', 38, NULL, '2026-05-29 12:19:55'),
(672, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-04-28 to 2026-04-28', 'InstructorReport', 39, NULL, '2026-05-29 12:20:44'),
(673, 14, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-04-29 to 2026-04-29', 'InstructorReport', 40, NULL, '2026-05-29 12:21:08'),
(674, 16, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-28 to 2026-05-28', 'InstructorReport', 41, NULL, '2026-05-29 12:28:13'),
(675, 16, NULL, 'REPORT_UPDATE', 'Updated instructor report for period 2026-05-28 to 2026-05-28', 'InstructorReport', 41, NULL, '2026-05-29 12:36:39'),
(676, 16, NULL, 'REPORT_UPDATE', 'Updated instructor report for period 2026-05-28 to 2026-05-28', 'InstructorReport', 41, NULL, '2026-05-29 12:39:07'),
(677, 13, 13, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 13, NULL, '2026-05-29 15:40:38'),
(678, 13, 13, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 13, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-29T15:41:18.352Z\"}', '2026-05-29 15:41:18'),
(679, 13, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-29 to 2026-05-29', 'InstructorReport', 42, NULL, '2026-05-29 15:42:40'),
(680, 20, 20, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 20, NULL, '2026-05-30 06:26:49'),
(681, 20, 20, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 20, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-30T06:29:14.731Z\"}', '2026-05-30 06:29:14'),
(682, 20, 20, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 20, NULL, '2026-05-30 06:29:51'),
(683, 20, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-28 to 2026-05-28', 'InstructorReport', 43, NULL, '2026-05-30 06:35:48'),
(684, 20, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-21 to 2026-05-21', 'InstructorReport', 44, NULL, '2026-05-30 06:37:21'),
(685, 20, NULL, 'REPORT_SUBMISSION', 'Submitted instructor report for period 2026-05-23 to 2026-05-23', 'InstructorReport', 45, NULL, '2026-05-30 06:51:47'),
(686, 20, 20, 'FOLDER_CREATE', 'Folder created: Mentorship', 'DocumentFolder', 41, '{\"name\":\"Mentorship\"}', '2026-05-30 06:54:18'),
(687, 20, 20, 'DOCUMENT_UPLOAD', 'Document uploaded: JeandeDieu_Mentorship Tracking Template_Feb2026.xls', 'Document', 108, '{\"file_name\":\"1780124075523-6tdgyh69kzl.xls\",\"original_name\":\"JeandeDieu_Mentorship Tracking Template_Feb2026.xls\",\"mime_type\":\"application/vnd.ms-excel\",\"file_size\":24064}', '2026-05-30 06:54:37'),
(688, 20, 20, 'FOLDER_CREATE', 'Folder created: Exams', 'DocumentFolder', 42, '{\"name\":\"Exams\"}', '2026-05-30 06:55:09'),
(689, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-30T10:12:16.880Z\"}', '2026-05-30 10:12:16'),
(690, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-30T13:01:17.724Z\"}', '2026-05-30 13:01:17'),
(691, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-30T13:01:56.039Z\"}', '2026-05-30 13:01:56'),
(692, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-30T14:26:51.209Z\"}', '2026-05-30 14:26:51'),
(693, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T12:44:12.952Z\"}', '2026-05-31 12:44:12'),
(694, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Maintain Professional Conversation', 'Subject', 16, '{\"code\":\"GENEG302\",\"name\":\"Maintain Professional Conversation\",\"description\":\"Maintain Professional Conversation in Upper Intermediate Technical English in SPES\",\"course_category_id\":2,\"max_marks\":100,\"color\":\"#3B82F6\"}', '2026-05-31 12:48:46'),
(695, 35, 1, 'USER_CREATE', 'Created user: ingabire', 'User', 35, '{\"username\":\"ingabire\",\"email\":\"charlieingabire1@gmail.com\",\"roles\":[4]}', '2026-05-31 12:50:32'),
(696, 22, 1, 'ACCOUNT_DISABLE', 'User account was disabled by administrator', 'User', 22, '{\"disabled_by\":1}', '2026-05-31 12:51:19'),
(697, 35, 1, 'SUBJECT_ASSIGN', 'You have been assigned to subject ID: 16', 'TeacherSubjectAssignment', NULL, '{\"subject_id\":16,\"assigning_user_id\":1}', '2026-05-31 12:53:40'),
(698, 1, 1, 'SUBJECT_ASSIGN_ADMIN', 'Assigned teacher ID: 35 to subject ID: 16', 'TeacherSubjectAssignment', NULL, '{\"teacherId\":35,\"subjectId\":16}', '2026-05-31 12:53:40'),
(699, 35, 35, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 35, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T12:58:09.125Z\"}', '2026-05-31 12:58:09'),
(700, 35, 35, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 35, NULL, '2026-05-31 12:58:35'),
(701, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T13:03:57.860Z\"}', '2026-05-31 13:03:57'),
(702, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T21:50:23.754Z\"}', '2026-05-31 21:50:23'),
(703, 14, 14, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 14, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T21:53:37.244Z\"}', '2026-05-31 21:53:37'),
(704, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T21:57:21.761Z\"}', '2026-05-31 21:57:21'),
(705, 36, 1, 'USER_CREATE', 'Created user: Faustin', 'User', 36, '{\"username\":\"Faustin\",\"email\":\"faustinganzasheila@gmail.com\",\"roles\":[6]}', '2026-05-31 21:59:04'),
(706, 36, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-05-31 21:59:32'),
(707, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 36 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":36,\"classGroupId\":9}', '2026-05-31 21:59:32'),
(708, 1, 1, 'SUBJECT_UPDATE', 'Updated subject: Graphic User Interface Design', 'Subject', 8, '{\"code\":\"SPEGI302\",\"name\":\"Graphic User Interface Design\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#1fd63d\"}', '2026-05-31 22:01:11'),
(709, 36, 36, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 36, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T22:04:06.363Z\"}', '2026-05-31 22:04:06'),
(710, 36, 36, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 36, NULL, '2026-05-31 22:04:30'),
(711, 36, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-05-31 22:06:59'),
(712, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 36 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":36,\"subjectId\":8,\"academic_year_id\":3}', '2026-05-31 22:06:59'),
(713, 37, 1, 'USER_CREATE', 'Created user: Felixx', 'User', 37, '{\"username\":\"Felixx\",\"email\":\"ndazivunnyefelix@nga.ac.rw\",\"roles\":[6]}', '2026-05-31 22:25:49'),
(714, 37, 1, 'CLASS_GROUP_ASSIGN', 'You have been assigned to class group ID: 9', 'StudentClassGroup', NULL, '{\"class_group_id\":9,\"assigning_user_id\":1}', '2026-05-31 22:26:18'),
(715, 1, 1, 'CLASS_GROUP_ASSIGN_ADMIN', 'Assigned student ID: 37 to class group ID: 9', 'StudentClassGroup', NULL, '{\"studentId\":37,\"classGroupId\":9}', '2026-05-31 22:26:18'),
(716, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":8,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-05-31 22:26:30'),
(717, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 8', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":8,\"academic_year_id\":3}', '2026-05-31 22:26:30'),
(718, 37, 37, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 37, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T22:28:41.035Z\"}', '2026-05-31 22:28:41'),
(719, 37, 37, 'PASSWORD_CHANGE', 'User successfully changed their password', 'AuthCredential', 37, NULL, '2026-05-31 22:29:05'),
(720, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T22:31:36.904Z\"}', '2026-05-31 22:31:36'),
(721, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T22:50:40.599Z\"}', '2026-05-31 22:50:40'),
(722, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T22:58:12.537Z\"}', '2026-05-31 22:58:12'),
(723, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: TEACHER', 'Role', 4, '{\"permissionIds\":[5,6,7,8,14,15,27,37,38,40,47,49]}', '2026-05-31 22:58:44'),
(724, 1, 1, 'ROLE_PERMISSIONS_ASSIGN', 'Permissions assigned to role: TEACHER', 'Role', 4, '{\"permissionIds\":[5,6,7,8,14,15,27,37,38,40,47,49,50]}', '2026-05-31 22:59:03'),
(725, 37, 37, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 37, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T23:01:08.132Z\"}', '2026-05-31 23:01:08'),
(726, 23, 23, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 23, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T04:07:34.576Z\"}', '2026-06-01 04:07:34'),
(727, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T07:14:06.421Z\"}', '2026-06-01 07:14:06'),
(728, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T09:46:17.209Z\"}', '2026-06-01 09:46:17'),
(729, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T13:07:01.367Z\"}', '2026-06-01 13:07:01'),
(730, 36, 36, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 36, NULL, '2026-06-01 16:40:01'),
(731, 36, 36, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 36, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T16:40:51.660Z\"}', '2026-06-01 16:40:51'),
(732, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T16:44:26.982Z\"}', '2026-06-01 16:44:27'),
(733, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T16:51:50.974Z\"}', '2026-06-01 16:51:51'),
(734, 35, 35, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 35, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-01T19:14:39.704Z\"}', '2026-06-01 19:14:39'),
(735, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T07:04:10.278Z\"}', '2026-06-02 07:04:10'),
(736, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T07:11:04.662Z\"}', '2026-06-02 07:11:04'),
(737, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T08:10:37.167Z\"}', '2026-06-02 08:10:37'),
(738, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T08:15:37.644Z\"}', '2026-06-02 08:15:37'),
(739, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:15:41.701Z\"}', '2026-06-02 09:15:41'),
(740, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:16:45.713Z\"}', '2026-06-02 09:16:45'),
(741, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:18:34.059Z\"}', '2026-06-02 09:18:34'),
(742, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:38:11.624Z\"}', '2026-06-02 09:38:11'),
(743, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:40:33.426Z\"}', '2026-06-02 09:40:33'),
(744, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:41:52.422Z\"}', '2026-06-02 09:41:52'),
(745, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:48:26.756Z\"}', '2026-06-02 09:48:26'),
(746, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T09:53:22.999Z\"}', '2026-06-02 09:53:23'),
(747, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T10:13:21.573Z\"}', '2026-06-02 10:13:21'),
(748, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T10:13:34.521Z\"}', '2026-06-02 10:13:34'),
(749, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T10:15:35.792Z\"}', '2026-06-02 10:15:35'),
(750, 33, 33, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 33, NULL, '2026-06-02 10:15:41'),
(751, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T10:16:16.435Z\"}', '2026-06-02 10:16:16'),
(752, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T10:20:36.563Z\"}', '2026-06-02 10:20:36'),
(753, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T10:25:56.021Z\"}', '2026-06-02 10:25:56'),
(754, 35, 35, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 35, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T12:56:17.211Z\"}', '2026-06-02 12:56:17'),
(755, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T17:32:50.571Z\"}', '2026-06-02 17:32:50'),
(756, 37, 37, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 37, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T22:29:43.652Z\"}', '2026-06-02 22:29:43'),
(757, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T22:30:24.951Z\"}', '2026-06-02 22:30:24'),
(758, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":12,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-06-02 22:31:15'),
(759, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 12', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":12,\"academic_year_id\":3}', '2026-06-02 22:31:15'),
(760, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":11,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-06-02 22:31:24'),
(761, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 11', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":11,\"academic_year_id\":3}', '2026-06-02 22:31:24'),
(762, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":10,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-06-02 22:31:36'),
(763, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 10', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":10,\"academic_year_id\":3}', '2026-06-02 22:31:36'),
(764, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":14,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-06-02 22:31:48'),
(765, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 14', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":14,\"academic_year_id\":3}', '2026-06-02 22:31:48'),
(766, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":13,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-06-02 22:31:54'),
(767, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 13', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":13,\"academic_year_id\":3}', '2026-06-02 22:31:54'),
(768, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":9,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-06-02 22:32:00'),
(769, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 9', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":9,\"academic_year_id\":3}', '2026-06-02 22:32:00'),
(770, 37, 1, 'SUBJECT_ENROLL', 'You have been enrolled in subject ID: 16', 'StudentSubjectEnrollment', NULL, '{\"subject_id\":16,\"academic_year_id\":3,\"enrolling_user_id\":1}', '2026-06-02 22:32:07'),
(771, 1, 1, 'SUBJECT_ENROLL_ADMIN', 'Enrolled student ID: 37 in subject ID: 16', 'StudentSubjectEnrollment', NULL, '{\"studentId\":37,\"subjectId\":16,\"academic_year_id\":3}', '2026-06-02 22:32:07'),
(772, 37, 37, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 37, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T22:34:07.899Z\"}', '2026-06-02 22:34:07'),
(773, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T22:35:49.084Z\"}', '2026-06-02 22:35:49'),
(774, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-02T23:08:46.436Z\"}', '2026-06-02 23:08:46'),
(775, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T07:17:40.087Z\"}', '2026-06-03 07:17:40'),
(776, 30, 30, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 30, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T10:22:16.144Z\"}', '2026-06-03 10:22:16'),
(777, 27, 27, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 27, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:01:20.641Z\"}', '2026-06-03 12:01:20'),
(778, 26, 26, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 26, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:01:46.632Z\"}', '2026-06-03 12:01:46');
INSERT INTO `ActivityLog` (`activity_id`, `user_id`, `actor_id`, `action_type`, `description`, `entity_type`, `entity_id`, `metadata`, `created_at`) VALUES
(779, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:13:12.242Z\"}', '2026-06-03 12:13:12'),
(780, 15, 1, 'SUBJECT_ASSIGN', 'You have been assigned to subject ID: 12', 'TeacherSubjectAssignment', NULL, '{\"subject_id\":12,\"assigning_user_id\":1}', '2026-06-03 12:13:54'),
(781, 1, 1, 'SUBJECT_ASSIGN_ADMIN', 'Assigned teacher ID: 15 to subject ID: 12', 'TeacherSubjectAssignment', NULL, '{\"teacherId\":15,\"subjectId\":12}', '2026-06-03 12:13:54'),
(782, 15, 15, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 15, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:14:20.392Z\"}', '2026-06-03 12:14:20'),
(783, 16, 16, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 16, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:18:49.977Z\"}', '2026-06-03 12:18:50'),
(784, 32, 32, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 32, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:32:45.420Z\"}', '2026-06-03 12:32:45'),
(785, 25, 25, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 25, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:33:03.698Z\"}', '2026-06-03 12:33:03'),
(786, 34, 34, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 34, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T12:54:41.702Z\"}', '2026-06-03 12:54:41'),
(787, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T13:00:20.450Z\"}', '2026-06-03 13:00:20'),
(788, 19, 19, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 19, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T13:00:48.989Z\"}', '2026-06-03 13:00:49'),
(789, 31, 31, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 31, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T13:24:37.142Z\"}', '2026-06-03 13:24:37'),
(790, 28, 28, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 28, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T13:40:59.764Z\"}', '2026-06-03 13:40:59'),
(791, 33, 33, 'PASSWORD_RESET', 'User successfully reset their password', 'AuthCredential', 33, NULL, '2026-06-03 16:12:33'),
(792, 33, 33, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 33, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-03T16:14:08.539Z\"}', '2026-06-03 16:14:08'),
(793, 23, 23, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 23, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-04T07:04:34.883Z\"}', '2026-06-04 07:04:34'),
(794, 23, 23, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 23, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-04T07:06:02.506Z\"}', '2026-06-04 07:06:02'),
(795, 29, 29, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 29, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-04T09:14:56.153Z\"}', '2026-06-04 09:14:56'),
(796, 1, 1, 'LOGIN_SUCCESS', 'User successfully logged in via 2FA', 'User', 1, '{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-06-04T10:54:47.859Z\"}', '2026-06-04 10:54:47'),
(797, 1, 1, 'SUBJECT_CREATE', 'Created subject: Networking fundamentals', 'Subject', NULL, '{\"name\":\"Networking fundamentals\",\"description\":\"Networking fundamentals\",\"code\":\"NET0001\",\"color\":\"#6da800\"}', '2026-06-04 10:56:05'),
(798, 23, 1, 'SUBJECT_ASSIGN', 'You have been assigned to subject ID: 17', 'TeacherSubjectAssignment', NULL, '{\"subject_id\":17,\"assigning_user_id\":1}', '2026-06-04 10:59:55'),
(799, 1, 1, 'SUBJECT_ASSIGN_ADMIN', 'Assigned teacher ID: 23 to subject ID: 17', 'TeacherSubjectAssignment', NULL, '{\"teacherId\":23,\"subjectId\":17}', '2026-06-04 10:59:55');

-- --------------------------------------------------------

--
-- Table structure for table `AssessmentScore`
--

CREATE TABLE `AssessmentScore` (
  `score_id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `academic_year_id` int DEFAULT NULL,
  `term` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. TERM1, TERM2, TERM3',
  `assessment_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXAM' COMMENT 'EXAM, CAT, ASSIGNMENT, PROJECT',
  `title` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `score` decimal(5,2) NOT NULL,
  `max_score` decimal(5,2) NOT NULL DEFAULT '100.00',
  `assessed_at` date NOT NULL,
  `recorded_by` bigint DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `AuthCredential`
--

CREATE TABLE `AuthCredential` (
  `auth_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `force_password_change` tinyint(1) DEFAULT '0',
  `mfa_enabled` tinyint(1) DEFAULT '0',
  `failed_attempts` int DEFAULT '0',
  `locked_until` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `AuthCredential`
--

INSERT INTO `AuthCredential` (`auth_id`, `user_id`, `password_hash`, `force_password_change`, `mfa_enabled`, `failed_attempts`, `locked_until`) VALUES
(1, 1, '$2a$12$xwSNYM7WNwFbW1twd.Qqo.CA1YCBB3QLzCYHEOPsGhVYVDr0LbJL.', 0, 0, 0, NULL),
(2, 13, '$2a$12$VMTORuBeCpn/hdZSoukDBeFxIRwijCNQx..zGwLAOGaJTiB8D0OIa', 0, 0, 0, NULL),
(3, 14, '$2a$12$nAuGaFoeEjYPL/v5l8vRX.Gn2HM0HZSn1bcaouFWOZ1vArt4uOLT6', 0, 0, 0, NULL),
(4, 15, '$2a$12$fKkiM0DH3d9DzpMNQVeMkOP31RMQp0Q42Cx.aQMSrkqxD4vh2XmyC', 0, 0, 0, NULL),
(5, 16, '$2a$12$oWHiawDg370yBWApio3MbuG2EuqvSdtpj.ML57Thwm1XJSJjKRgl2', 0, 0, 0, NULL),
(6, 17, '$2a$12$i.h0ZZMjRjyiPw6QEpV0pOddjvf6B7SF1NAKbnKm2ovFzNKQAhncC', 0, 0, 0, NULL),
(7, 18, '$2a$12$0BU/im3fOwTDO6PDeTinvelAYqMnINHOQpV9V45B.4oUYR9RHnHwi', 0, 0, 0, NULL),
(8, 19, '$2a$12$NNqzBcD8.PqtuPSJx6Nx1uqQoFH/RWkrwyn5lf/fB.OEtXgCLireC', 0, 0, 0, NULL),
(9, 20, '$2a$12$csTGocSydYxfz3jERXPLa.NAFZiHduDofMjS7e6NZtgMxqZRa/3d2', 0, 0, 0, NULL),
(10, 21, '$2a$12$RL1IOz/9ctqjVMM3sDpfbuCV36QfktfMPJe1AZKv0QASovLN118xK', 0, 0, 0, NULL),
(11, 22, '$2a$12$OmwWx2EGDHtHtOUUrUJcJ.Bl/9Wr./JhVHSemKto3mX5FNSGvPpK2', 1, 0, 0, NULL),
(12, 23, '$2a$12$35M883zm/CaR0J05ezJ7pO5OQkexjAR66YK3rIFM68QqvrS9pS8S.', 0, 0, 0, NULL),
(13, 24, '$2a$12$HzD.SA1E1JcOSQy5UBXqVO9KDDiiOQmWWpzXM4ECosYOAP3f8APvC', 0, 0, 0, NULL),
(14, 25, '$2a$12$EPLeYslgq1gFjoauEhcsUO0uf1a8Dui1RyYj9hIX1swOC5.DQoozy', 0, 0, 0, NULL),
(15, 26, '$2a$12$lS/buvBPRWbPJ4RHduTPcu2DmwOPFs5vlbNRe9QutoYsQtUnetSb2', 0, 0, 0, NULL),
(16, 27, '$2a$12$dCVve1S9uz.oWw7jxkSfpOv58hAOZUk7l7SvRK.llyRRJhIDLfBXm', 0, 0, 0, NULL),
(17, 28, '$2a$12$wVYp00A5VmqIpqlRYdIBte8r1gyHqBZjq3.nMuO8jUBFiFuIUwyli', 0, 0, 0, NULL),
(18, 29, '$2a$12$xE8MOhHu1xrpg0QCvghCO.FExo3bjChaKM.Rbmp8T8ofCbiS5CXZq', 0, 0, 0, NULL),
(19, 30, '$2a$12$32P/5DLxKKkcshEr9XYasu5HktZhdDJ8ncHYtUDEr.w1nkgZx50i2', 0, 0, 0, NULL),
(20, 31, '$2a$12$OXNLGAz3fkc1Ehsn/C8ynetx4JWj6mJR12.EsKM8FTa/B.yNGknu2', 0, 0, 0, NULL),
(21, 32, '$2a$12$VMiwNSFeBqx.xmkub3wHpu7GPPVBILTtnJg0Lb/xzHc3Otfbg/KW6', 0, 0, 0, NULL),
(22, 33, '$2a$12$3ECAQBUDglZH.3eaJSuPfuHskoMjT0ebaJh/GtnDUyasvrGXJ0FkC', 0, 0, 0, NULL),
(23, 34, '$2a$12$SwGrlUs2lq4IIiZlId1uBOOTXrVZ9PaUFHiZgGU1rmPNELQMzO2ra', 0, 0, 0, NULL),
(24, 35, '$2a$12$KJIfkR2rGMzWGn8Iis4jxeFhUMnEKky12lgeALEL9SOIn6l9HQ11W', 0, 0, 0, NULL),
(25, 36, '$2a$12$XSxQg5.oGE9HBzgX732avOHaqRvSMXb.NUR4NPUezpDaeE/lo6tpq', 0, 0, 0, NULL),
(26, 37, '$2a$12$EYv8x2VdG6sMB2v5clhU7eb5IyA058HD8tJGxUg/A/ZGyxKyxgmsC', 0, 0, 0, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `CalendarActivity`
--

CREATE TABLE `CalendarActivity` (
  `activity_id` bigint NOT NULL,
  `academic_term_id` bigint NOT NULL,
  `class_group_id` bigint DEFAULT NULL,
  `activity_name` varchar(150) NOT NULL,
  `activity_type` varchar(50) NOT NULL COMMENT 'BREAK, ASSEMBLY, EXAM, EVENT, OTHER',
  `day_of_week` tinyint DEFAULT NULL COMMENT 'For recurring activities, NULL for one-time',
  `start_date` date DEFAULT NULL COMMENT 'For one-time activities',
  `end_date` date DEFAULT NULL COMMENT 'For one-time activities',
  `start_time` varchar(10) NOT NULL,
  `end_time` varchar(10) NOT NULL,
  `location` varchar(100) DEFAULT NULL,
  `description` text,
  `color` varchar(7) DEFAULT '#10B981',
  `is_recurring` tinyint DEFAULT '1' COMMENT '1=weekly recurring, 0=one-time event',
  `is_active` tinyint DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `academic_year_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `CalendarNotification`
--

CREATE TABLE `CalendarNotification` (
  `notification_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `notification_type` varchar(50) NOT NULL DEFAULT 'LESSON_STARTING' COMMENT 'LESSON_STARTING, REMINDER',
  `minutes_before` int NOT NULL DEFAULT '30' COMMENT 'Minutes before lesson starts to send notification',
  `is_enabled` tinyint DEFAULT '1',
  `notification_method` varchar(20) DEFAULT 'IN_APP' COMMENT 'IN_APP, EMAIL, SMS',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `CalendarSlot`
--

CREATE TABLE `CalendarSlot` (
  `slot_id` bigint NOT NULL,
  `academic_term_id` bigint DEFAULT NULL,
  `class_group_id` bigint DEFAULT NULL,
  `subject_id` bigint NOT NULL,
  `user_id` bigint NOT NULL COMMENT 'Instructor assigned to this slot',
  `day_of_week` tinyint NOT NULL COMMENT '0=Sunday, 1=Monday, ..., 6=Saturday',
  `start_time` varchar(10) NOT NULL COMMENT 'HH:MM format',
  `end_time` varchar(10) NOT NULL COMMENT 'HH:MM format',
  `location` varchar(100) DEFAULT NULL COMMENT 'Room or location',
  `color` varchar(7) DEFAULT '#3B82F6' COMMENT 'Calendar event color',
  `notes` text,
  `is_active` tinyint DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `academic_year_id` bigint DEFAULT NULL,
  `calendar_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `CalendarSlot`
--

INSERT INTO `CalendarSlot` (`slot_id`, `academic_term_id`, `class_group_id`, `subject_id`, `user_id`, `day_of_week`, `start_time`, `end_time`, `location`, `color`, `notes`, `is_active`, `created_at`, `updated_at`, `academic_year_id`, `calendar_id`) VALUES
(1, 4, 9, 8, 15, 2, '15:40', '17:20', 'room 1', '#3B82F6', NULL, 1, '2026-03-04 22:35:13', '2026-03-04 22:35:13', NULL, 1),
(2, 4, 9, 10, 13, 3, '11:00', '12:40', 'room 1', '#3B82F6', NULL, 1, '2026-03-04 22:35:39', '2026-03-04 22:35:39', NULL, 1),
(3, 4, 9, 10, 13, 3, '13:40', '14:30', 'room 1', '#3B82F6', NULL, 1, '2026-03-04 22:35:49', '2026-03-04 22:35:49', NULL, 1),
(4, 4, 9, 9, 15, 4, '11:00', '12:40', 'room 1', '#3B82F6', NULL, 1, '2026-03-04 22:36:10', '2026-03-04 22:36:10', NULL, 1),
(5, 4, 9, 9, 15, 4, '13:40', '14:30', 'room 1', '#3B82F6', NULL, 1, '2026-03-04 22:36:21', '2026-03-04 22:36:21', NULL, 1),
(6, 4, 9, 11, 16, 3, '09:00', '10:40', 'room 1', '#3B82F6', NULL, 1, '2026-03-05 09:07:04', '2026-03-05 09:07:04', NULL, 1),
(7, 4, 9, 13, 14, 2, '09:00', '10:40', 'room 1', '#3B82F6', NULL, 1, '2026-03-07 19:22:18', '2026-03-07 19:22:18', NULL, 1),
(8, 5, 9, 11, 16, 1, '11:50', '12:40', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:43:47', '2026-05-11 06:43:47', NULL, 2),
(9, 5, 9, 10, 13, 1, '13:40', '15:20', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:44:29', '2026-05-11 06:44:29', NULL, 2),
(10, 5, 9, 13, 14, 2, '09:00', '10:40', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:45:03', '2026-05-11 06:45:03', NULL, 2),
(11, 5, 9, 8, 15, 2, '11:00', '12:40', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:45:24', '2026-05-11 06:45:24', NULL, 2),
(12, 5, 9, 11, 17, 3, '09:00', '10:40', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:46:47', '2026-05-11 06:46:47', NULL, 2),
(13, 5, 9, 14, 14, 3, '11:00', '12:40', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:47:29', '2026-05-11 06:47:29', NULL, 2),
(14, 5, 9, 9, 15, 4, '11:00', '12:40', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:48:15', '2026-05-11 06:48:15', NULL, 2),
(15, 5, 9, 10, 13, 4, '13:40', '15:20', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:48:38', '2026-05-11 06:50:39', NULL, 2),
(16, 5, 9, 10, 13, 4, '14:30', '15:20', 'room 1', '#3B82F6', NULL, 0, '2026-05-11 06:49:04', '2026-05-11 06:50:26', NULL, 2),
(17, 5, 9, 11, 17, 4, '15:40', '17:20', 'room 1', '#3B82F6', NULL, 1, '2026-05-11 06:49:55', '2026-05-11 06:49:55', NULL, 2);

-- --------------------------------------------------------

--
-- Table structure for table `ClassGroup`
--

CREATE TABLE `ClassGroup` (
  `class_group_id` bigint NOT NULL,
  `academic_year_id` bigint NOT NULL,
  `grade_id` bigint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `ClassGroup`
--

INSERT INTO `ClassGroup` (`class_group_id`, `academic_year_id`, `grade_id`, `name`) VALUES
(13, 3, 8, 'G1'),
(9, 3, 9, 'Year 1'),
(10, 3, 10, 'N1'),
(11, 3, 11, 'N2'),
(14, 3, 12, 'G2'),
(15, 3, 13, 'G3'),
(16, 3, 14, 'G4'),
(17, 3, 15, 'G5'),
(18, 3, 16, 'G6'),
(12, 3, 17, 'N3'),
(19, 3, 18, 'G7'),
(20, 3, 19, 'G8'),
(21, 3, 20, 'G9'),
(22, 3, 21, 'G10'),
(23, 3, 22, 'G11'),
(24, 3, 23, 'G12');

-- --------------------------------------------------------

--
-- Table structure for table `CompetencyPerformanceCriteria`
--

CREATE TABLE `CompetencyPerformanceCriteria` (
  `criteria_id` bigint NOT NULL,
  `competency_id` bigint NOT NULL,
  `criteria_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `CourseCategory`
--

CREATE TABLE `CourseCategory` (
  `category_id` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `CourseCategory`
--

INSERT INTO `CourseCategory` (`category_id`, `name`, `description`, `status`) VALUES
(1, 'Specific Module', 'Specific Module', 'ACTIVE'),
(2, 'General Modules', NULL, 'ACTIVE');

-- --------------------------------------------------------

--
-- Table structure for table `Document`
--

CREATE TABLE `Document` (
  `document_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `folder_id` bigint DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_extension` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_public` tinyint DEFAULT '0',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tags` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Document`
--

INSERT INTO `Document` (`document_id`, `user_id`, `folder_id`, `file_name`, `original_name`, `file_path`, `file_size`, `mime_type`, `file_extension`, `is_public`, `description`, `tags`, `created_at`, `updated_at`) VALUES
(17, 17, 19, '1768456611920-eki3injjg.pdf', 'SESSION PLAN # 5_ LEVEL 3.pdf', '17/1768456611920-eki3injjg.pdf', 111586, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-01-15 05:56:53', '2026-01-15 05:56:53'),
(19, 14, 29, '1772913810689-hcvzngk9iy6.docx', 'EXERCISES OF DATABASE.docx', '14/1772913810689-hcvzngk9iy6.docx', 15619, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 0, NULL, NULL, '2026-03-07 20:03:32', '2026-03-07 20:03:32'),
(20, 14, 29, '1772913810736-f7qagc3easj.docx', 'DEBUGGING  EXERCISES OF DATABASE.docx', '14/1772913810736-f7qagc3easj.docx', 18867, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 0, NULL, NULL, '2026-03-07 20:03:32', '2026-03-07 20:03:32'),
(21, 14, 29, '1772913810886-nwrkr596m5.docx', 'ANSWER OF EXERCISES OF DATABASE.docx', '14/1772913810886-nwrkr596m5.docx', 20754, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 0, NULL, NULL, '2026-03-07 20:03:32', '2026-03-07 20:03:32'),
(25, 14, 17, '1780055297545-hgqb73vj5gf.pdf', 'PHP SCHEME OF WORK TERM1.pdf', '14/1780055297545-hgqb73vj5gf.pdf', 367750, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:48:19', '2026-05-29 11:48:19'),
(26, 14, 17, '1780055297750-ijl2stm1iye.pdf', 'PHP SCHEME OF WORK TERM3.pdf', '14/1780055297750-ijl2stm1iye.pdf', 376320, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:48:19', '2026-05-29 11:48:19'),
(27, 14, 17, '1780055298018-c78ve2y867k.pdf', 'PHP SCHEME OF WORK TERM2.pdf', '14/1780055298018-c78ve2y867k.pdf', 404710, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:48:19', '2026-05-29 11:48:19'),
(28, 14, 31, '1780055342474-lm8cjzkvbha.pdf', 'Term1.pdf', '14/1780055342474-lm8cjzkvbha.pdf', 283681, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:49:04', '2026-05-29 11:49:04'),
(29, 14, 31, '1780055342799-8rhyxmjej8i.pdf', 'Term2.pdf', '14/1780055342799-8rhyxmjej8i.pdf', 292349, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:49:04', '2026-05-29 11:49:04'),
(30, 14, 31, '1780055343233-5a1zie50n3c.pdf', 'Term3.pdf', '14/1780055343233-5a1zie50n3c.pdf', 262315, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:49:05', '2026-05-29 11:49:05'),
(31, 14, 33, '1780055483077-yuk00518dpi.zip', 'TERM3.zip', '14/1780055483077-yuk00518dpi.zip', 774418, 'application/x-zip-compressed', 'zip', 0, NULL, NULL, '2026-05-29 11:51:25', '2026-05-29 11:51:25'),
(32, 14, 33, '1780055483365-gkhzuntax4q.zip', 'TERM2.zip', '14/1780055483365-gkhzuntax4q.zip', 1393864, 'application/x-zip-compressed', 'zip', 0, NULL, NULL, '2026-05-29 11:51:25', '2026-05-29 11:51:25'),
(33, 14, 33, '1780055484844-t91wjhmaxfs.zip', 'TERM1.zip', '14/1780055484844-t91wjhmaxfs.zip', 4010211, 'application/x-zip-compressed', 'zip', 0, NULL, NULL, '2026-05-29 11:51:27', '2026-05-29 11:51:27'),
(34, 14, 34, '1780055534529-tu49rbcvbsg.zip', 'TERM3.zip', '14/1780055534529-tu49rbcvbsg.zip', 1274996, 'application/x-zip-compressed', 'zip', 0, NULL, NULL, '2026-05-29 11:52:16', '2026-05-29 11:52:16'),
(35, 14, 34, '1780055534747-b5p7mvwd2cd.zip', 'TERM2.zip', '14/1780055534747-b5p7mvwd2cd.zip', 1610545, 'application/x-zip-compressed', 'zip', 0, NULL, NULL, '2026-05-29 11:52:16', '2026-05-29 11:52:16'),
(36, 14, 34, '1780055535105-dflrga7lc9.zip', 'TERM1.zip', '14/1780055535105-dflrga7lc9.zip', 2128547, 'application/x-zip-compressed', 'zip', 0, NULL, NULL, '2026-05-29 11:52:17', '2026-05-29 11:52:17'),
(37, 14, 35, '1780055584082-usrexbu14k.pdf', 'PHP_LP_TERM1_WEEK1.pdf', '14/1780055584082-usrexbu14k.pdf', 158025, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(38, 14, 35, '1780055584341-k0winlkcym.pdf', 'PHP_LP_TERM1_WEEK8.pdf', '14/1780055584341-k0winlkcym.pdf', 139051, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(39, 14, 35, '1780055584378-bo0qrfl3im.pdf', 'PHP_LP_TERM1_WEEK2.pdf', '14/1780055584378-bo0qrfl3im.pdf', 159760, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(40, 14, 35, '1780055584542-zs6al7ccay.pdf', 'PHP_LP_TERM1_WEEK3.pdf', '14/1780055584542-zs6al7ccay.pdf', 158790, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(41, 14, 35, '1780055584644-31tc0cr04k4.pdf', 'PHP_LP_TERM1_WEEK6.pdf', '14/1780055584644-31tc0cr04k4.pdf', 183001, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(42, 14, 35, '1780055584655-qckbc0igze.pdf', 'PHP_LP_TERM1_WEEK4.pdf', '14/1780055584655-qckbc0igze.pdf', 339456, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(43, 14, 35, '1780055584627-po67pjsbvv.pdf', 'PHP_LP_TERM1_WEEK10.pdf', '14/1780055584627-po67pjsbvv.pdf', 233320, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(44, 14, 35, '1780055584795-koz8oimxvg.pdf', 'PHP_LP_TERM1_WEEK9.pdf', '14/1780055584795-koz8oimxvg.pdf', 140926, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(45, 14, 35, '1780055584820-b4ip4q8xss.pdf', 'PHP_LP_TERM1_WEEK7.pdf', '14/1780055584820-b4ip4q8xss.pdf', 230554, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:06', '2026-05-29 11:53:06'),
(46, 14, 35, '1780055596079-36fxvbtckmm.pdf', 'PHP_LP_TERM1_WEEK2.pdf', '14/1780055596079-36fxvbtckmm.pdf', 159760, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:17', '2026-05-29 11:53:17'),
(47, 14, 35, '1780055596330-dhd29wp4je.pdf', 'PHP_LP_TERM1_WEEK3.pdf', '14/1780055596330-dhd29wp4je.pdf', 158790, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(48, 14, 35, '1780055596390-cocta7hm8dw.pdf', 'PHP_LP_TERM1_WEEK4.pdf', '14/1780055596390-cocta7hm8dw.pdf', 339456, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(49, 14, 35, '1780055596421-l1tmuebyos.pdf', 'PHP_LP_TERM1_WEEK1.pdf', '14/1780055596421-l1tmuebyos.pdf', 158025, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(50, 14, 35, '1780055596616-ogkwg2oy9v.pdf', 'PHP_LP_TERM1_WEEK6.pdf', '14/1780055596616-ogkwg2oy9v.pdf', 183001, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(51, 14, 35, '1780055596745-12ircv1layrr.pdf', 'PHP_LP_TERM1_WEEK9.pdf', '14/1780055596745-12ircv1layrr.pdf', 140926, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(52, 14, 35, '1780055596785-6nvcbl17iqe.pdf', 'PHP_LP_TERM1_WEEK8.pdf', '14/1780055596785-6nvcbl17iqe.pdf', 139051, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(53, 14, 35, '1780055596652-90y4sp2ozxo.pdf', 'PHP_LP_TERM1_WEEK7.pdf', '14/1780055596652-90y4sp2ozxo.pdf', 230554, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(54, 14, 35, '1780055596788-og64diqnner.pdf', 'PHP_LP_TERM1_WEEK5.pdf', '14/1780055596788-og64diqnner.pdf', 180917, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(55, 14, 35, '1780055596992-wliw90se379.pdf', 'PHP_LP_TERM1_WEEK10.pdf', '14/1780055596992-wliw90se379.pdf', 233320, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:18', '2026-05-29 11:53:18'),
(56, 14, 36, '1780055623026-if0h581qwd.pdf', 'PHP_LP_TERM2_WEEK9.pdf', '14/1780055623026-if0h581qwd.pdf', 141656, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:44', '2026-05-29 11:53:44'),
(57, 14, 36, '1780055623027-uon05ksodn.pdf', 'PHP_LP_TERM2_WEEK11.pdf', '14/1780055623027-uon05ksodn.pdf', 140942, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:44', '2026-05-29 11:53:44'),
(58, 14, 36, '1780055623024-0to30z0bt579.pdf', 'PHP_LP_TERM2_WEEK1.pdf', '14/1780055623024-0to30z0bt579.pdf', 140879, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:53:44', '2026-05-29 11:53:44'),
(59, 14, 36, '1780055690608-atc0bjhj26.pdf', 'PHP_LP_TERM2_WEEK1.pdf', '14/1780055690608-atc0bjhj26.pdf', 140879, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(60, 14, 36, '1780055690601-rmdvzvrh5ui.pdf', 'PHP_LP_TERM2_WEEK9.pdf', '14/1780055690601-rmdvzvrh5ui.pdf', 141656, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(61, 14, 36, '1780055690894-2v6wcot4wul.pdf', 'PHP_LP_TERM2_WEEK5.pdf', '14/1780055690894-2v6wcot4wul.pdf', 139091, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(62, 14, 36, '1780055690732-sj0when5x6.pdf', 'PHP_LP_TERM2_WEEK3.pdf', '14/1780055690732-sj0when5x6.pdf', 138879, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(63, 14, 36, '1780055690934-aqiy406xddr.pdf', 'PHP_LP_TERM2_WEEK10.pdf', '14/1780055690934-aqiy406xddr.pdf', 141880, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(64, 14, 36, '1780055690781-jp19rygmgbt.pdf', 'PHP_LP_TERM2_WEEK4.pdf', '14/1780055690781-jp19rygmgbt.pdf', 139878, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(65, 14, 36, '1780055690968-6q0o24mk31f.pdf', 'PHP_LP_TERM2_WEEK8.pdf', '14/1780055690968-6q0o24mk31f.pdf', 183827, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(66, 14, 36, '1780055690804-btevlforebk.pdf', 'PHP_LP_TERM2_WEEK6.pdf', '14/1780055690804-btevlforebk.pdf', 232823, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(67, 14, 36, '1780055690997-c6ew2zq519n.pdf', 'PHP_LP_TERM2_WEEK2.pdf', '14/1780055690997-c6ew2zq519n.pdf', 139681, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(68, 14, 36, '1780055691005-tw9oqyk4a2p.pdf', 'PHP_LP_TERM2_WEEK11.pdf', '14/1780055691005-tw9oqyk4a2p.pdf', 140942, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:54:52', '2026-05-29 11:54:52'),
(69, 14, 37, '1780055717383-1xcc28jfffd.pdf', 'PHP_LP_TERM3_WEEK6.pdf', '14/1780055717383-1xcc28jfffd.pdf', 143398, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(70, 14, 37, '1780055717228-tksmnuevn5.pdf', 'PHP_LP_TERM3_WEEK1.pdf', '14/1780055717228-tksmnuevn5.pdf', 141531, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(71, 14, 37, '1780055717434-cslvl57u50f.pdf', 'PHP_LP_TERM3_WEEK7.pdf', '14/1780055717434-cslvl57u50f.pdf', 140398, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(72, 14, 37, '1780055717600-7gxf1jxha0l.pdf', 'PHP_LP_TERM3_WEEK8.pdf', '14/1780055717600-7gxf1jxha0l.pdf', 142616, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(73, 14, 37, '1780055717584-qkome9i5zns.pdf', 'PHP_LP_TERM3_WEEK5.pdf', '14/1780055717584-qkome9i5zns.pdf', 138704, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(74, 14, 37, '1780055717689-bi3xuxgodwh.pdf', 'PHP_LP_TERM3_WEEK3.pdf', '14/1780055717689-bi3xuxgodwh.pdf', 139071, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(75, 14, 37, '1780055717841-phds6t4pzxk.pdf', 'PHP_LP_TERM3_WEEK2.pdf', '14/1780055717841-phds6t4pzxk.pdf', 233106, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(76, 14, 37, '1780055718164-gautia5tsa.pdf', 'PHP_LP_TERM3_WEEK4.pdf', '14/1780055718164-gautia5tsa.pdf', 139762, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:55:19', '2026-05-29 11:55:19'),
(77, 14, 38, '1780055786708-wmn7ptrp6h.pdf', 'NGA_LP_TERM1_WEEK1.pdf', '14/1780055786708-wmn7ptrp6h.pdf', 134878, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(78, 14, 38, '1780055786793-r58j25qyko.pdf', 'NGA_LP_TERM1_WEEK2.pdf', '14/1780055786793-r58j25qyko.pdf', 135935, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(79, 14, 38, '1780055786816-fwc3o2qkxgk.pdf', 'NGA_LP_TERM1_WEEK4.pdf', '14/1780055786816-fwc3o2qkxgk.pdf', 137692, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(80, 14, 38, '1780055786894-fwtyvjs06rb.pdf', 'NGA_LP_TERM1_WEEK5.pdf', '14/1780055786894-fwtyvjs06rb.pdf', 135552, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(81, 14, 38, '1780055787027-0t7e3eywrbks.pdf', 'NGA_LP_TERM1_WEEK10.pdf', '14/1780055787027-0t7e3eywrbks.pdf', 139673, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(82, 14, 38, '1780055787056-4570rjli5u2.pdf', 'NGA_LP_TERM1_WEEK6.pdf', '14/1780055787056-4570rjli5u2.pdf', 229423, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(83, 14, 38, '1780055787058-yagcwlkkzh.pdf', 'NGA_LP_TERM1_WEEK3.pdf', '14/1780055787058-yagcwlkkzh.pdf', 227410, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(84, 14, 38, '1780055787090-rm0ydap2cs.pdf', 'NGA_LP_TERM1_WEEK9.pdf', '14/1780055787090-rm0ydap2cs.pdf', 320267, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(85, 14, 38, '1780055787153-2667u1s2v2t.pdf', 'NGA_LP_TERM1_WEEK7.pdf', '14/1780055787153-2667u1s2v2t.pdf', 136477, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:28', '2026-05-29 11:56:28'),
(86, 14, 38, '1780055787332-9cu5ms59ejm.pdf', 'NGA_LP_TERM1_WEEK8.pdf', '14/1780055787332-9cu5ms59ejm.pdf', 181140, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:29', '2026-05-29 11:56:29'),
(87, 14, 39, '1780055807309-ie584ttchmr.pdf', 'NGA_LP_TERM2_WEEK8.pdf', '14/1780055807309-ie584ttchmr.pdf', 138699, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(88, 14, 39, '1780055807453-wvzqoyz4n4a.pdf', 'NGA_LP_TERM2_WEEK1.pdf', '14/1780055807453-wvzqoyz4n4a.pdf', 135526, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(89, 14, 39, '1780055807534-l9sgqmlhlkn.pdf', 'NGA_LP_TERM2_WEEK3.pdf', '14/1780055807534-l9sgqmlhlkn.pdf', 134798, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(90, 14, 39, '1780055807458-45bz54v04i6.pdf', 'NGA_LP_TERM2_WEEK2.pdf', '14/1780055807458-45bz54v04i6.pdf', 136864, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(91, 14, 39, '1780055807579-o9cgz2nomlj.pdf', 'NGA_LP_TERM2_WEEK4.pdf', '14/1780055807579-o9cgz2nomlj.pdf', 138753, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(92, 14, 39, '1780055807527-bxpkqngg0fj.pdf', 'NGA_LP_TERM2_WEEK5.pdf', '14/1780055807527-bxpkqngg0fj.pdf', 137939, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(93, 14, 39, '1780055807654-lwgozx7cxh.pdf', 'NGA_LP_TERM2_WEEK10.pdf', '14/1780055807654-lwgozx7cxh.pdf', 140155, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(94, 14, 39, '1780055807878-6w09dp1gamb.pdf', 'NGA_LP_TERM2_WEEK6.pdf', '14/1780055807878-6w09dp1gamb.pdf', 139155, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:56:49', '2026-05-29 11:56:49'),
(95, 14, 39, '1780055858729-xyhc5gjcyod.pdf', 'NGA_LP_TERM2_WEEK8.pdf', '14/1780055858729-xyhc5gjcyod.pdf', 138699, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(96, 14, 39, '1780055858708-kwelj9ken8.pdf', 'NGA_LP_TERM2_WEEK4.pdf', '14/1780055858708-kwelj9ken8.pdf', 138753, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(97, 14, 39, '1780055858753-5pcvfr1oru6.pdf', 'NGA_LP_TERM2_WEEK2.pdf', '14/1780055858753-5pcvfr1oru6.pdf', 136864, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(98, 14, 39, '1780055859042-pvegho28yhq.pdf', 'NGA_LP_TERM2_WEEK10.pdf', '14/1780055859042-pvegho28yhq.pdf', 140155, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(99, 14, 39, '1780055859006-dk3v7xo6dag.pdf', 'NGA_LP_TERM2_WEEK6.pdf', '14/1780055859006-dk3v7xo6dag.pdf', 139155, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(100, 14, 39, '1780055859140-st0igv9y5el.pdf', 'NGA_LP_TERM2_WEEK3.pdf', '14/1780055859140-st0igv9y5el.pdf', 134798, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(101, 14, 39, '1780055858976-zf0sk966jd.pdf', 'NGA_LP_TERM2_WEEK9.pdf', '14/1780055858976-zf0sk966jd.pdf', 231740, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(102, 14, 39, '1780055859130-lzzhqlwrc5q.pdf', 'NGA_LP_TERM2_WEEK5.pdf', '14/1780055859130-lzzhqlwrc5q.pdf', 137939, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(103, 14, 39, '1780055859174-wvkfpbc23t.pdf', 'NGA_LP_TERM2_WEEK1.pdf', '14/1780055859174-wvkfpbc23t.pdf', 135526, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:57:40', '2026-05-29 11:57:40'),
(104, 14, 40, '1780055881535-p4dn0jp3ro.pdf', 'NGA_LP_TERM3_WEEK2.pdf', '14/1780055881535-p4dn0jp3ro.pdf', 139630, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:58:03', '2026-05-29 11:58:03'),
(105, 14, 40, '1780055881938-ahgrjyfj0u8.pdf', 'NGA_LP_TERM3_WEEK3.pdf', '14/1780055881938-ahgrjyfj0u8.pdf', 139585, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:58:03', '2026-05-29 11:58:03'),
(106, 14, 40, '1780055881904-z9azvt4ar2j.pdf', 'NGA_LP_TERM3_WEEK1.pdf', '14/1780055881904-z9azvt4ar2j.pdf', 232438, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:58:03', '2026-05-29 11:58:03'),
(107, 14, 40, '1780055882182-gb35ik4u305.pdf', 'NGA_LP_TERM3_WEEK4.pdf', '14/1780055882182-gb35ik4u305.pdf', 237072, 'application/pdf', 'pdf', 0, NULL, NULL, '2026-05-29 11:58:03', '2026-05-29 11:58:03'),
(108, 20, 41, '1780124075523-6tdgyh69kzl.xls', 'JeandeDieu_Mentorship Tracking Template_Feb2026.xls', '20/1780124075523-6tdgyh69kzl.xls', 24064, 'application/vnd.ms-excel', 'xls', 0, NULL, NULL, '2026-05-30 06:54:37', '2026-05-30 06:54:37');

-- --------------------------------------------------------

--
-- Table structure for table `DocumentFolder`
--

CREATE TABLE `DocumentFolder` (
  `folder_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `parent_folder_id` bigint DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#6366f1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `DocumentFolder`
--

INSERT INTO `DocumentFolder` (`folder_id`, `user_id`, `parent_folder_id`, `name`, `description`, `color`, `created_at`, `updated_at`) VALUES
(16, 14, NULL, 'Scheme of work', NULL, '#008d3b', '2026-01-13 18:54:43', '2026-01-13 18:54:43'),
(17, 14, 16, 'PHP', NULL, '#008d3b', '2026-01-13 18:54:57', '2026-01-13 18:54:57'),
(19, 17, NULL, 'Notes', NULL, '#008d3b', '2026-01-15 05:56:02', '2026-01-15 05:56:02'),
(20, 17, NULL, 'Past papers', NULL, '#008d3b', '2026-01-15 05:56:19', '2026-01-15 05:56:19'),
(22, 17, NULL, 'Scheme of work', NULL, '#008d3b', '2026-01-15 05:58:00', '2026-01-15 05:58:00'),
(23, 18, NULL, 'notes', NULL, '#008d3b', '2026-01-15 08:55:32', '2026-01-15 08:55:32'),
(24, 18, NULL, 'scheme of work', NULL, '#008d3b', '2026-01-15 08:55:48', '2026-01-15 08:55:48'),
(25, 18, NULL, 'lesson plans', NULL, '#008d3b', '2026-01-15 08:55:55', '2026-01-15 08:55:55'),
(27, 14, NULL, 'Notes', NULL, '#008d3b', '2026-03-07 19:58:27', '2026-03-07 19:58:27'),
(28, 14, 27, 'Php', NULL, '#008d3b', '2026-03-07 19:58:48', '2026-03-07 19:58:48'),
(29, 14, 27, 'Database', NULL, '#008d3b', '2026-03-07 19:59:09', '2026-03-07 19:59:09'),
(30, 1, NULL, 'Notes', NULL, '#008d3b', '2026-03-09 15:06:02', '2026-03-09 15:06:02'),
(31, 14, 16, 'DATABASE', NULL, '#008d3b', '2026-05-29 11:48:36', '2026-05-29 11:48:36'),
(32, 14, NULL, 'LESSON PLANS', NULL, '#008d3b', '2026-05-29 11:49:26', '2026-05-29 11:49:26'),
(33, 14, 32, 'DATABSE', NULL, '#008d3b', '2026-05-29 11:49:42', '2026-05-29 11:49:42'),
(34, 14, 32, 'PHP', NULL, '#008d3b', '2026-05-29 11:49:51', '2026-05-29 11:49:51'),
(35, 14, 34, 'TERM1', NULL, '#008d3b', '2026-05-29 11:52:29', '2026-05-29 11:52:29'),
(36, 14, 34, 'TERM2', NULL, '#008d3b', '2026-05-29 11:52:40', '2026-05-29 11:52:40'),
(37, 14, 34, 'TERM3', NULL, '#008d3b', '2026-05-29 11:52:48', '2026-05-29 11:52:48'),
(38, 14, 33, 'TERM1', NULL, '#008d3b', '2026-05-29 11:55:42', '2026-05-29 11:55:42'),
(39, 14, 33, 'TERM2', NULL, '#008d3b', '2026-05-29 11:55:51', '2026-05-29 11:55:51'),
(40, 14, 33, 'TERM3', NULL, '#008d3b', '2026-05-29 11:55:58', '2026-05-29 11:55:58'),
(41, 20, NULL, 'Mentorship', NULL, '#008d3b', '2026-05-30 06:54:18', '2026-05-30 06:54:18'),
(42, 20, NULL, 'Exams', NULL, '#008d3b', '2026-05-30 06:55:08', '2026-05-30 06:55:08');

-- --------------------------------------------------------

--
-- Table structure for table `DocumentPermission`
--

CREATE TABLE `DocumentPermission` (
  `permission_id` bigint NOT NULL,
  `document_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `permission_type` enum('VIEW','EDIT','DOWNLOAD','SHARE') COLLATE utf8mb4_unicode_ci DEFAULT 'VIEW',
  `shared_by` bigint NOT NULL,
  `shared_with` enum('user','role') COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `filter_type` enum('subject_assigned','subject_enrolled','program_assigned','grade_assigned') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `filter_id` bigint UNSIGNED DEFAULT NULL,
  `academic_term_id` bigint UNSIGNED DEFAULT NULL,
  `filter_ids` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `DocumentVersion`
--

CREATE TABLE `DocumentVersion` (
  `version_id` bigint NOT NULL,
  `document_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `version_number` int NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NOT NULL,
  `change_description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `FolderPermission`
--

CREATE TABLE `FolderPermission` (
  `permission_id` bigint NOT NULL,
  `folder_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `permission_type` enum('VIEW','EDIT','SHARE') COLLATE utf8mb4_unicode_ci DEFAULT 'VIEW',
  `shared_by` bigint NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `filter_type` enum('subject_assigned','subject_enrolled','program_assigned','grade_assigned') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `filter_id` bigint UNSIGNED DEFAULT NULL,
  `academic_term_id` bigint UNSIGNED DEFAULT NULL,
  `filter_ids` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `FolderPermission`
--

INSERT INTO `FolderPermission` (`permission_id`, `folder_id`, `user_id`, `permission_type`, `shared_by`, `expires_at`, `created_at`, `filter_type`, `filter_id`, `academic_term_id`, `filter_ids`) VALUES
(3, 25, 17, 'VIEW', 18, NULL, '2026-01-15 08:56:26', NULL, NULL, NULL, NULL),
(4, 27, 19, 'SHARE', 14, NULL, '2026-03-07 20:07:15', NULL, NULL, NULL, NULL),
(5, 27, 25, 'SHARE', 14, NULL, '2026-03-07 20:07:15', NULL, NULL, NULL, NULL),
(6, 27, 26, 'SHARE', 14, NULL, '2026-03-07 20:07:15', NULL, NULL, NULL, NULL),
(7, 27, 27, 'SHARE', 14, NULL, '2026-03-07 20:07:15', NULL, NULL, NULL, NULL),
(8, 27, 28, 'SHARE', 14, NULL, '2026-03-07 20:07:16', NULL, NULL, NULL, NULL),
(9, 27, 29, 'SHARE', 14, NULL, '2026-03-07 20:07:16', NULL, NULL, NULL, NULL),
(10, 27, 30, 'SHARE', 14, NULL, '2026-03-07 20:07:16', NULL, NULL, NULL, NULL),
(11, 27, 31, 'SHARE', 14, NULL, '2026-03-07 20:07:16', NULL, NULL, NULL, NULL),
(12, 27, 32, 'SHARE', 14, NULL, '2026-03-07 20:07:17', NULL, NULL, NULL, NULL),
(13, 27, 33, 'SHARE', 14, NULL, '2026-03-07 20:07:17', NULL, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `Grade`
--

CREATE TABLE `Grade` (
  `grade_id` bigint NOT NULL,
  `program_id` bigint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_order` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Grade`
--

INSERT INTO `Grade` (`grade_id`, `program_id`, `name`, `level_order`) VALUES
(8, 6, 'Grade 1', 4),
(9, 8, 'Coding Academy - Year 1', 1),
(10, 5, 'Nursery 1', 1),
(11, 5, 'Nursery 2', 2),
(12, 6, 'Grade 2', 5),
(13, 6, 'Grade 3', 6),
(14, 6, 'Grade 4', 7),
(15, 6, 'Grade 5', 8),
(16, 6, 'Grade 6', 9),
(17, 5, 'Nursery 3', 3),
(18, 7, 'Grade 7', 10),
(19, 7, 'Grade 8', 11),
(20, 9, 'Grade 9', 12),
(21, 9, 'Grade 10', 13),
(22, 11, 'Grade 11', 14),
(23, 10, 'Grade 12', 15),
(24, 8, 'Coding Academy Year 2', 1);

-- --------------------------------------------------------

--
-- Table structure for table `GradeSubject`
--

CREATE TABLE `GradeSubject` (
  `grade_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `GradeSubject`
--

INSERT INTO `GradeSubject` (`grade_id`, `subject_id`) VALUES
(9, 16),
(10, 16),
(11, 16),
(24, 16);

-- --------------------------------------------------------

--
-- Table structure for table `InstructorReport`
--

CREATE TABLE `InstructorReport` (
  `report_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `academic_term_id` bigint DEFAULT NULL,
  `class_group_id` bigint DEFAULT NULL,
  `week_number` int DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `submission_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `progress_status` enum('ON_TRACK','SLIGHTLY_BEHIND','AHEAD') DEFAULT 'ON_TRACK',
  `key_highlights` text,
  `challenges_encountered` text,
  `lessons_delivered_count` int DEFAULT '0',
  `mentorship_sessions_count` int DEFAULT '0',
  `active_students_count` int DEFAULT '0',
  `struggling_students_count` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `InstructorReport`
--

INSERT INTO `InstructorReport` (`report_id`, `user_id`, `academic_term_id`, `class_group_id`, `week_number`, `start_date`, `end_date`, `submission_date`, `progress_status`, `key_highlights`, `challenges_encountered`, `lessons_delivered_count`, `mentorship_sessions_count`, `active_students_count`, `struggling_students_count`, `created_at`, `updated_at`) VALUES
(1, 15, 4, 9, NULL, '2026-03-14', '2026-03-14', '2026-03-14 20:51:57', 'ON_TRACK', 'Development activities focused on the reporting and monitoring features of the Management Information System (MIS), encompassing instructor-facing submission tools, coordinator dashboards, scheme of work management, and validation workflows.', 'N/A', 0, 0, 0, 0, '2026-03-14 20:51:57', '2026-03-14 20:51:57'),
(2, 13, 4, 9, NULL, '2026-03-14', '2026-03-14', '2026-03-14 21:13:19', 'ON_TRACK', 'This report presents a comprehensive account of all technical activities carried out by the Information Technology\nDepartment on Saturday, March 14, 2026. Work was conducted across four primary domains: web infrastructure\nmigration, the Management Information System (MIS) reporting module, AWS cloud infrastructure provisioning, and\nthe MBANIRA business management project. The majority of planned tasks were completed successfully, with two\nactivities carried forward as ongoing work.', '', 0, 0, 0, 0, '2026-03-14 21:13:19', '2026-03-14 21:13:19'),
(3, 14, 4, 9, NULL, '2026-03-26', '2026-03-26', '2026-03-27 08:41:25', 'ON_TRACK', 'RTB geodata information system developmenet', 'None', 0, 1, 0, 0, '2026-03-27 08:41:25', '2026-03-27 08:41:25'),
(4, 14, 4, 9, NULL, '2026-03-27', '2026-03-27', '2026-03-27 08:48:25', 'ON_TRACK', 'Marking copies and meeting with developper to check progress on RTB GIS and revision of reporting system', 'None', 0, 0, 0, 0, '2026-03-27 08:48:25', '2026-03-27 09:08:01'),
(5, 15, 4, 9, NULL, '2026-03-26', '2026-03-26', '2026-03-27 08:50:07', 'ON_TRACK', 'Re-analysis and development of RTB GIS management system', 'None', 0, 0, 0, 0, '2026-03-27 08:50:07', '2026-03-27 08:50:07'),
(6, 15, 4, 9, NULL, '2026-03-22', '2026-03-22', '2026-03-27 08:58:55', 'ON_TRACK', 'Worked with Olivier to initiate the RTB GIS project', 'N/A', 0, 0, 0, 0, '2026-03-27 08:58:55', '2026-03-27 08:58:55'),
(7, 15, 4, 9, NULL, '2026-03-23', '2026-03-23', '2026-03-27 09:00:44', 'ON_TRACK', 'Worked with the team on the RTB GIS project', 'N/A', 0, 0, 0, 0, '2026-03-27 09:00:44', '2026-03-27 09:00:44'),
(8, 15, 4, 9, NULL, '2026-03-24', '2026-03-24', '2026-03-27 09:02:29', 'ON_TRACK', 'Presentation of RTB GIS Project, and worked on feedback collection and analysis', 'N/A', 0, 0, 0, 0, '2026-03-27 09:02:29', '2026-03-27 09:02:29'),
(9, 15, 4, 9, NULL, '2026-03-25', '2026-03-25', '2026-03-27 09:04:06', 'ON_TRACK', 'Analyis of new proposed RTB GIS Project architecture based on previous presentation', 'N/A', 0, 0, 0, 0, '2026-03-27 09:04:06', '2026-03-27 09:04:06'),
(10, 14, 4, 9, NULL, '2026-03-24', '2026-03-24', '2026-03-27 09:05:03', 'ON_TRACK', 'Supervisor Exam of Fundamaentl of C Programming ', 'None', 0, 0, 0, 0, '2026-03-27 09:05:03', '2026-03-27 09:05:03'),
(11, 15, 4, 9, NULL, '2026-03-27', '2026-03-27', '2026-03-27 09:06:14', 'ON_TRACK', 'Meeting with the team about analysis based on MIS Reporting form and revealed that it should be categorized based on nature of job done', 'N/A', 0, 0, 0, 0, '2026-03-27 09:06:14', '2026-03-27 09:06:14'),
(12, 13, 4, 9, NULL, '2026-03-30', '2026-03-30', '2026-03-31 09:28:18', 'ON_TRACK', 'Focused on integrating 3D map capabilities into the RTB GIS system to enhance spatial visualization and user interaction with geospatial data.', 'None', 0, 0, 0, 0, '2026-03-31 09:28:18', '2026-03-31 09:28:18'),
(13, 13, 4, 9, NULL, '2026-03-25', '2026-03-25', '2026-03-31 09:38:21', 'ON_TRACK', 'Summary:\nWorked on multiple technical and academic responsibilities, including GIS system enhancement, project development, and examination supervision.\n\nKey Activities:\n\nContinued integration of 3D maps into the RTB GIS system, improving spatial visualization and interaction.\nContributed to the Mbanira Project, focusing on ongoing development tasks and system improvements.\nInvigilated the Networking exam, ensuring a smooth and fair examination process.', '', 0, 0, 0, 0, '2026-03-31 09:38:21', '2026-03-31 09:38:21'),
(14, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:53:56', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:53:56', '2026-04-01 19:53:56'),
(15, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:54:20', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:54:20', '2026-04-01 19:54:20'),
(16, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:54:36', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:54:36', '2026-04-01 19:54:36'),
(17, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:54:45', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:54:45', '2026-04-01 19:54:45'),
(18, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:54:47', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:54:47', '2026-04-01 19:54:47'),
(19, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:54:56', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:54:56', '2026-04-01 19:54:56'),
(20, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:55:32', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:55:32', '2026-04-01 19:55:32'),
(21, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:55:35', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:55:35', '2026-04-01 19:55:35'),
(22, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:56:18', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:56:18', '2026-04-01 19:56:18'),
(23, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:56:20', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:56:20', '2026-04-01 19:56:20'),
(24, 21, 4, 9, NULL, '2026-03-16', '2026-03-16', '2026-04-01 19:56:26', 'SLIGHTLY_BEHIND', 'Successfully completed the classroom course on topics: Digital Logic AND Memory towards the Learning outcome 3.', 'The tools and equipment needed were not yet procured. We plan to revisit the topics in Lab sessions', 1, 1, 10, 2, '2026-04-01 19:56:26', '2026-04-01 19:56:26'),
(25, 21, 4, NULL, NULL, '2026-03-21', '2026-03-21', '2026-04-01 20:05:44', 'SLIGHTLY_BEHIND', 'Successfully completed Exam preparation review exercises', 'Previous day was a holiday. The time for Saturday was not enough. The review was not systematic', 0, 0, 9, 0, '2026-04-01 20:05:44', '2026-04-01 20:05:44'),
(26, 21, 4, NULL, NULL, '2026-03-27', '2026-03-27', '2026-04-01 20:13:17', 'ON_TRACK', 'Successfully got feedback on the TERM II exam from students. ', '', 0, 1, 9, 0, '2026-04-01 20:13:17', '2026-04-01 20:13:17'),
(27, 21, 4, NULL, NULL, '2026-03-27', '2026-03-27', '2026-04-01 20:13:25', 'ON_TRACK', 'Successfully got feedback on the TERM II exam from students. ', '', 0, 1, 9, 0, '2026-04-01 20:13:25', '2026-04-01 20:13:25'),
(28, 21, 4, NULL, NULL, '2026-03-27', '2026-03-27', '2026-04-01 20:13:44', 'ON_TRACK', 'Successfully got feedback on the TERM II exam from students. ', '', 0, 1, 9, 0, '2026-04-01 20:13:44', '2026-04-01 20:13:44'),
(29, 14, 5, 9, NULL, '2026-05-04', '2026-05-04', '2026-05-29 12:01:42', 'ON_TRACK', 'mentorship ', 'Some courses are difficult to students', 0, 0, 0, 0, '2026-05-29 12:01:42', '2026-05-29 12:01:42'),
(30, 14, 5, 9, NULL, '2026-05-05', '2026-05-05', '2026-05-29 12:03:40', 'ON_TRACK', 'Succes completed Laralavel frame work as Final chaptor in php', 'Student are doing Projects using laravel', 0, 0, 0, 0, '2026-05-29 12:03:40', '2026-05-29 12:03:40'),
(31, 14, 5, 9, NULL, '2026-05-06', '2026-05-06', '2026-05-29 12:04:30', 'ON_TRACK', 'Exercises of DATABASE to prepare term3 exams', 'Ok', 0, 0, 0, 0, '2026-05-29 12:04:30', '2026-05-29 12:04:30'),
(32, 14, 5, 9, NULL, '2026-05-12', '2026-05-12', '2026-05-29 12:05:09', 'ON_TRACK', 'Mid term quiz of php', '', 0, 0, 0, 0, '2026-05-29 12:05:09', '2026-05-29 12:05:09'),
(33, 14, 5, 9, NULL, '2026-05-13', '2026-05-13', '2026-05-29 12:06:28', 'ON_TRACK', 'Exercies of Database & Php', '', 0, 0, 0, 0, '2026-05-29 12:06:28', '2026-05-29 12:06:28'),
(34, 14, 5, 9, NULL, '2026-05-19', '2026-05-19', '2026-05-29 12:07:12', 'ON_TRACK', 'Solving some questions about PHP ', '', 0, 0, 0, 0, '2026-05-29 12:07:12', '2026-05-29 12:07:12'),
(35, 14, 5, 9, NULL, '2026-05-20', '2026-05-20', '2026-05-29 12:07:39', 'ON_TRACK', 'Solving questions about DATABASE ', '', 0, 0, 0, 0, '2026-05-29 12:07:39', '2026-05-29 12:07:39'),
(36, 14, 5, 9, NULL, '2026-05-26', '2026-05-26', '2026-05-29 12:09:00', 'ON_TRACK', 'Preparation of Online platform to be used in Horidays for Preparation of second year and exercises to prepare end of term3 ', '', 0, 0, 0, 0, '2026-05-29 12:09:00', '2026-05-29 12:09:00'),
(37, 14, 5, 9, NULL, '2026-04-21', '2026-04-21', '2026-05-29 12:19:12', 'ON_TRACK', 'Questions about holday and remembiring OOP in php', '', 0, 0, 0, 0, '2026-05-29 12:19:12', '2026-05-29 12:19:12'),
(38, 14, 5, 9, NULL, '2026-04-22', '2026-04-22', '2026-05-29 12:19:55', 'ON_TRACK', 'Because database has ended we continue oop in php ', '', 0, 0, 0, 0, '2026-05-29 12:19:55', '2026-05-29 12:19:55'),
(39, 14, 5, 9, NULL, '2026-04-28', '2026-04-28', '2026-05-29 12:20:44', 'ON_TRACK', 'Finishing OOP and intoduction to PHP Frame works', '', 1, 0, 0, 0, '2026-05-29 12:20:44', '2026-05-29 12:20:44'),
(40, 14, 5, 9, NULL, '2026-04-29', '2026-04-29', '2026-05-29 12:21:08', 'ON_TRACK', 'Finishing OOP and intoduction to PHP Frame works', '', 1, 0, 0, 0, '2026-05-29 12:21:08', '2026-05-29 12:21:08'),
(41, 16, 5, 9, NULL, '2026-05-28', '2026-05-28', '2026-05-29 12:28:13', 'ON_TRACK', '', 'The Wednesday holiday affected the Computer Basics Mid-Term Exam, as it had been scheduled to take place on that day.', 1, 0, 0, 0, '2026-05-29 12:28:13', '2026-05-29 12:39:06'),
(42, 13, 5, 9, NULL, '2026-05-29', '2026-05-29', '2026-05-29 15:42:40', 'ON_TRACK', 'I worked on mbanira project to finalize the project', '', 0, 0, 0, 0, '2026-05-29 15:42:40', '2026-05-29 15:42:40'),
(43, 20, 5, 9, NULL, '2026-05-28', '2026-05-28', '2026-05-30 06:35:48', 'ON_TRACK', 'A lesson was delivered  ', '', 0, 0, 0, 0, '2026-05-30 06:35:48', '2026-05-30 06:35:48'),
(44, 20, 5, 9, NULL, '2026-05-21', '2026-05-21', '2026-05-30 06:37:21', 'ON_TRACK', 'A MID Term exam was delivered', '', 0, 0, 0, 0, '2026-05-30 06:37:21', '2026-05-30 06:37:21'),
(45, 20, 5, 9, NULL, '2026-05-23', '2026-05-23', '2026-05-30 06:51:47', 'ON_TRACK', 'A revision for the upcoming exam was covered where I recalled key theoretical concepts and practicals together with solving exercises and also provided a sample simulated exam for enhancing the performance', '', 0, 0, 0, 0, '2026-05-30 06:51:47', '2026-05-30 06:51:47');

-- --------------------------------------------------------

--
-- Table structure for table `LessonReport`
--

CREATE TABLE `LessonReport` (
  `lesson_report_id` bigint NOT NULL,
  `lesson_id` int DEFAULT NULL,
  `entry_id` bigint DEFAULT NULL,
  `reported_by` bigint NOT NULL,
  `delivery_date` date NOT NULL,
  `status` enum('DELIVERED','PARTIAL','MISSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DELIVERED',
  `attendance_count` int DEFAULT NULL,
  `completion_rate` int DEFAULT NULL COMMENT '0-100',
  `reflection_notes` text COLLATE utf8mb4_unicode_ci,
  `evidence_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `schedule_flag` enum('ON_TIME','AHEAD','BEHIND') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ON_TIME',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `LO_IndicativeContent`
--

CREATE TABLE `LO_IndicativeContent` (
  `id` int NOT NULL,
  `lesson_id` int NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `content` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `LO_IndicativeContent`
--

INSERT INTO `LO_IndicativeContent` (`id`, `lesson_id`, `category`, `content`) VALUES
(1, 2, 'General', 'a. Optimize a web page for search engines'),
(2, 2, 'General', 'b. Ways to optimize the website'),
(3, 2, 'General', 'Sitemap creation and management'),
(4, 2, 'General', 'Keyword research and placement'),
(5, 2, 'General', 'Meta tags and descriptions'),
(6, 2, 'General', 'c. HTML Elements for SEO'),
(7, 2, 'General', 'Title tags'),
(8, 2, 'General', 'Meta descriptions'),
(9, 2, 'General', 'Header tags (H1, H2, H3)'),
(10, 2, 'General', 'd. Webmaster tools'),
(11, 2, 'General', 'Google Search Console'),
(12, 2, 'General', 'Bing Webmaster Tools'),
(13, 2, 'General', 'e. Page structure optimization'),
(14, 2, 'General', 'URL structure'),
(15, 2, 'General', 'Internal linking'),
(16, 2, 'General', 'Mobile responsiveness'),
(17, 2, 'General', 'f. Google site verification');

-- --------------------------------------------------------

--
-- Table structure for table `LO_LearningOutcome`
--

CREATE TABLE `LO_LearningOutcome` (
  `id` int NOT NULL,
  `lesson_id` int NOT NULL,
  `code` varchar(10) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` text,
  `duration_minutes` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `LO_LearningOutcome`
--

INSERT INTO `LO_LearningOutcome` (`id`, `lesson_id`, `code`, `title`, `description`, `duration_minutes`) VALUES
(1, 2, 'LO1', 'Optimize websites for search engines', 'Optimize websites for search engines', 0),
(2, 2, 'LO2', 'Implement SEO best practices', 'Implement SEO best practices', 0),
(3, 2, 'LO3', 'Create and manage sitemaps', 'Create and manage sitemaps', 0),
(4, 2, 'LO4', 'Use proper metadata and keywords', 'Use proper metadata and keywords', 0),
(5, 2, 'LO5', 'Understand search ranking factors', 'Understand search ranking factors', 0);

-- --------------------------------------------------------

--
-- Table structure for table `LO_LearningOutcomeActivity`
--

CREATE TABLE `LO_LearningOutcomeActivity` (
  `id` int NOT NULL,
  `learning_outcome_id` int NOT NULL,
  `trainer_activities` text,
  `learner_activities` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `LO_LearningOutcomeResource`
--

CREATE TABLE `LO_LearningOutcomeResource` (
  `id` int NOT NULL,
  `learning_outcome_id` int NOT NULL,
  `resource_name` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `LO_Lesson`
--

CREATE TABLE `LO_Lesson` (
  `id` int NOT NULL,
  `entry_id` bigint DEFAULT NULL,
  `user_id` bigint NOT NULL,
  `session_code` varchar(50) DEFAULT NULL,
  `sector` varchar(100) DEFAULT NULL,
  `trade` varchar(100) DEFAULT NULL,
  `level` varchar(50) DEFAULT NULL,
  `module_code` varchar(50) DEFAULT NULL,
  `module_name` varchar(255) DEFAULT NULL,
  `week` int DEFAULT NULL,
  `term` varchar(20) DEFAULT NULL,
  `school_year` varchar(20) DEFAULT NULL,
  `class_name` varchar(100) DEFAULT NULL,
  `number_of_trainees` int DEFAULT NULL,
  `lesson_date` date DEFAULT NULL,
  `start_time` varchar(50) DEFAULT NULL,
  `end_time` varchar(50) DEFAULT NULL,
  `instructor_name` varchar(255) DEFAULT NULL,
  `big_question` text,
  `total_duration_minutes` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `LO_Lesson`
--

INSERT INTO `LO_Lesson` (`id`, `entry_id`, `user_id`, `session_code`, `sector`, `trade`, `level`, `module_code`, `module_name`, `week`, `term`, `school_year`, `class_name`, `number_of_trainees`, `lesson_date`, `start_time`, `end_time`, `instructor_name`, `big_question`, `total_duration_minutes`, `created_at`) VALUES
(1, 1, 15, NULL, 'ICT', 'SPEs', '3', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-08', NULL, NULL, NULL, 'Learning Outcomes At the end of the lesson, trainees will be able to: Design responsive web pages. Apply viewport settings and box-sizing. Use media queries and breakpoints. Implement mobile-first design. Understand and use CSS frameworks. Build layouts with Bootstrap grid system, containers, rows, and columns. Apply Bootstrap components: Jumbotron, Tabs, and Carousel.', NULL, '2026-02-19 13:51:03'),
(2, 22, 15, NULL, 'ICT', 'SPEs', '3', NULL, 'SPEWI302, Development of Web User Interface', 9, 'II', '2025-26', 'Year 1', 10, '2026-03-05', '11:00', '14:30', 'NIYONGABO Emmanuel', 'How can we optimize our websites to rank better in search engines and increase visibility?', 150, '2026-03-04 22:53:58');

-- --------------------------------------------------------

--
-- Table structure for table `LO_LessonAssignment`
--

CREATE TABLE `LO_LessonAssignment` (
  `id` int NOT NULL,
  `lesson_id` int NOT NULL,
  `description` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `LO_LessonAssignment`
--

INSERT INTO `LO_LessonAssignment` (`id`, `lesson_id`, `description`) VALUES
(1, 2, 'Assignment/Homework Perform SEO audit of assigned website: - Analyze current content - Check meta tags and titles - Review URL structure Implement SEO improvements: - Add/optimize meta descriptions - Improve keyword placement - Create XML sitemap - Set up Google Search Console Document findings: - Current SEO status report - Improvements implemented - Optimization recommendations SEO audit report and optimized website with improved metadata');

-- --------------------------------------------------------

--
-- Table structure for table `LO_LessonEvaluation`
--

CREATE TABLE `LO_LessonEvaluation` (
  `id` int NOT NULL,
  `lesson_id` int NOT NULL,
  `teacher_notes` text,
  `references` text,
  `prepared_by` varchar(255) DEFAULT NULL,
  `verified_by` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `LO_LessonEvaluation`
--

INSERT INTO `LO_LessonEvaluation` (`id`, `lesson_id`, `teacher_notes`, `references`, `prepared_by`, `verified_by`) VALUES
(1, 1, '', '', '', ''),
(2, 2, 'Evaluation of the session and Teacher\'s notes: ….…………………………………………………………………………… ….………………………………………………… ….…………………………… Did trainees understand SEO principles? ☐ Yes ☐ Partially ☐ No Can trainees identify optimization opportunities? ☐ Yes ☐ Partially ☐ No Can trainees use SEO tools? ☐ Yes ☐ Partially ☐ No Observations: ….……………………………………………………………………………', '', 'NIYONGABO Emmanuel', '………………………………………');

-- --------------------------------------------------------

--
-- Table structure for table `LO_LessonSection`
--

CREATE TABLE `LO_LessonSection` (
  `id` int NOT NULL,
  `lesson_id` int NOT NULL,
  `section_type` enum('Introduction','Development','Conclusion') DEFAULT NULL,
  `trainer_activities` text,
  `learner_activities` text,
  `resources` text,
  `duration_minutes` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `LO_LessonSection`
--

INSERT INTO `LO_LessonSection` (`id`, `lesson_id`, `section_type`, `trainer_activities`, `learner_activities`, `resources`, `duration_minutes`) VALUES
(1, 2, 'Introduction', 'Review previous deployment lessons Explain importance of SEO in web presence Present search engine basics Discuss ranking factors Show real SEO examples', '', 'Resources SEO tools (Google Analytics, Search Console) Keyword research tools Text editor Web browser with SEO extensions Projector Sample websites Reference guides Internet connection', 20),
(2, 2, 'Development', 'Explain SEO fundamentals Show keyword research process Demonstrate meta tag optimization Explain sitemap creation Show Google Search Console Discuss content optimization Review site structure best practices', 'Take notes on SEO principles Research keywords for sample sites Optimize sample webpage content Create XML sitemap Set up Google Search Console Analyze existing websites Practice optimization techniques', 'SEO tools and platforms Keyword research tools Website analyzer tools Projector Laptops Text editor Google Search Console Reference documentation', 100),
(3, 2, 'Conclusion', 'Summarize SEO best practices Recap optimization techniques Discuss measurement and analytics Answer questions about SEO', 'Reflect on SEO learning Review key optimization strategies Discuss implementation challenges Ask clarifying questions', 'SEO audit report and optimized website with improved metadata', 15);

-- --------------------------------------------------------

--
-- Table structure for table `MentorshipSession`
--

CREATE TABLE `MentorshipSession` (
  `mentorship_id` bigint NOT NULL,
  `report_id` bigint DEFAULT NULL,
  `user_id` bigint NOT NULL,
  `student_id` bigint DEFAULT NULL,
  `student_name` varchar(255) DEFAULT NULL,
  `topic` varchar(255) DEFAULT NULL,
  `subject_id` bigint DEFAULT NULL COMMENT 'Optional subject context for this session',
  `previous_session_id` bigint DEFAULT NULL COMMENT 'Chain-of-support link to the preceding session',
  `session_date` date DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `assignment_completion` varchar(255) DEFAULT NULL,
  `assignment_notes` text,
  `punctuality_attendance` varchar(255) DEFAULT NULL,
  `discipline_notes` text,
  `discipline_progress` enum('IMPROVED','CONSISTENT','DECLINED') DEFAULT NULL,
  `academic_planning` text,
  `academic_personal_notes` text,
  `dishonesty_flagged` tinyint(1) NOT NULL DEFAULT '0',
  `stress_flag` tinyint(1) NOT NULL DEFAULT '0',
  `next_steps` text,
  `action_items` text,
  `challenges_identified` text,
  `guidance_notes` text,
  `wellbeing_status` text,
  `wellbeing_score` tinyint DEFAULT NULL COMMENT '1=Struggling 2=Concerned 3=Neutral 4=Good 5=Excellent',
  `wellbeing_notes` text,
  `follow_up_required` tinyint DEFAULT '0',
  `is_completed` tinyint(1) NOT NULL DEFAULT '0',
  `session_status` enum('OPEN','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'OPEN',
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `MentorshipSession`
--

INSERT INTO `MentorshipSession` (`mentorship_id`, `report_id`, `user_id`, `student_id`, `student_name`, `topic`, `subject_id`, `previous_session_id`, `session_date`, `duration_minutes`, `assignment_completion`, `assignment_notes`, `punctuality_attendance`, `discipline_notes`, `discipline_progress`, `academic_planning`, `academic_personal_notes`, `dishonesty_flagged`, `stress_flag`, `next_steps`, `action_items`, `challenges_identified`, `guidance_notes`, `wellbeing_status`, `wellbeing_score`, `wellbeing_notes`, `follow_up_required`, `is_completed`, `session_status`, `notes`, `created_at`) VALUES
(1, 3, 14, NULL, 'Irakoze Gwiza Kheila', NULL, NULL, NULL, '2026-03-26', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 'OPEN', 'Uko abana biteguye ibizamini n\'uburyo biri gukorwa', '2026-03-27 08:41:25'),
(16, NULL, 14, 25, NULL, NULL, NULL, NULL, '2026-03-13', 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 0, 'OPEN', NULL, '2026-05-29 12:11:04'),
(17, NULL, 14, 25, NULL, 'It was to know how she is doing and how the term has treated her simce the beginning', 13, 16, '2026-02-06', 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, 1, NULL, NULL, NULL, NULL, 'NEUTRAL', 3, NULL, 0, 0, 'OPEN', NULL, '2026-05-29 12:13:46'),
(18, NULL, 14, 25, NULL, 'It was mainly focused on understanding what is making the others not pass like I am.', 14, 16, '2026-03-03', 27, 'GOOD', NULL, NULL, NULL, NULL, NULL, NULL, 0, 1, NULL, NULL, NULL, NULL, 'CONCERNED', 2, NULL, 0, 0, 'OPEN', NULL, '2026-05-29 12:15:18');

-- --------------------------------------------------------

--
-- Table structure for table `OTP`
--

CREATE TABLE `OTP` (
  `otp_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `otp_code` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_type` enum('LOGIN_2FA','PASSWORD_RESET','EMAIL_VERIFICATION') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'LOGIN_2FA',
  `expires_at` datetime NOT NULL,
  `is_used` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `OTP`
--

INSERT INTO `OTP` (`otp_id`, `user_id`, `otp_code`, `otp_type`, `expires_at`, `is_used`, `created_at`) VALUES
(1, 1, '346584', 'PASSWORD_RESET', '2026-01-13 17:36:11', 1, '2026-01-13 17:26:11'),
(2, 1, '587552', 'LOGIN_2FA', '2026-01-13 17:36:53', 1, '2026-01-13 17:26:53'),
(3, 13, '952838', 'LOGIN_2FA', '2026-01-13 18:28:04', 1, '2026-01-13 18:18:03'),
(4, 1, '050194', 'LOGIN_2FA', '2026-01-13 18:38:39', 1, '2026-01-13 18:28:39'),
(5, 1, '049617', 'LOGIN_2FA', '2026-01-13 18:39:35', 1, '2026-01-13 18:29:35'),
(6, 14, '678070', 'LOGIN_2FA', '2026-01-13 19:02:33', 1, '2026-01-13 18:52:33'),
(7, 1, '890646', 'LOGIN_2FA', '2026-01-13 19:45:16', 1, '2026-01-13 19:35:15'),
(8, 1, '567717', 'LOGIN_2FA', '2026-01-13 21:28:51', 1, '2026-01-13 21:18:51'),
(9, 1, '796354', 'LOGIN_2FA', '2026-01-13 22:48:11', 1, '2026-01-13 22:38:10'),
(10, 1, '140943', 'LOGIN_2FA', '2026-01-14 08:56:05', 1, '2026-01-14 08:46:04'),
(11, 1, '775613', 'LOGIN_2FA', '2026-01-14 11:52:11', 0, '2026-01-14 11:42:11'),
(12, 1, '024567', 'LOGIN_2FA', '2026-01-14 11:54:54', 1, '2026-01-14 11:44:54'),
(13, 1, '663013', 'LOGIN_2FA', '2026-01-14 17:25:50', 0, '2026-01-14 17:15:50'),
(14, 1, '494951', 'LOGIN_2FA', '2026-01-14 17:35:47', 0, '2026-01-14 17:25:47'),
(15, 1, '126585', 'LOGIN_2FA', '2026-01-14 17:39:05', 1, '2026-01-14 17:29:04'),
(16, 1, '734792', 'LOGIN_2FA', '2026-01-14 17:40:57', 1, '2026-01-14 17:30:56'),
(17, 1, '119227', 'LOGIN_2FA', '2026-01-14 17:41:33', 1, '2026-01-14 17:31:33'),
(18, 1, '116392', 'LOGIN_2FA', '2026-01-14 17:44:35', 1, '2026-01-14 17:34:34'),
(19, 1, '336538', 'LOGIN_2FA', '2026-01-14 17:50:29', 0, '2026-01-14 17:40:28'),
(20, 1, '822884', 'LOGIN_2FA', '2026-01-14 17:50:40', 0, '2026-01-14 17:40:39'),
(21, 1, '189229', 'LOGIN_2FA', '2026-01-14 17:51:07', 0, '2026-01-14 17:41:07'),
(22, 1, '550761', 'LOGIN_2FA', '2026-01-14 17:51:42', 0, '2026-01-14 17:41:41'),
(23, 1, '117701', 'LOGIN_2FA', '2026-01-14 17:52:38', 0, '2026-01-14 17:42:38'),
(24, 1, '479302', 'LOGIN_2FA', '2026-01-14 17:53:14', 1, '2026-01-14 17:43:13'),
(25, 1, '292538', 'LOGIN_2FA', '2026-01-14 17:54:40', 1, '2026-01-14 17:44:40'),
(26, 1, '206283', 'LOGIN_2FA', '2026-01-14 17:58:51', 1, '2026-01-14 17:48:50'),
(27, 1, '996151', 'LOGIN_2FA', '2026-01-14 18:02:50', 1, '2026-01-14 17:52:49'),
(28, 1, '181505', 'LOGIN_2FA', '2026-01-14 18:03:38', 1, '2026-01-14 17:53:37'),
(29, 1, '051130', 'LOGIN_2FA', '2026-01-14 18:07:12', 1, '2026-01-14 17:57:12'),
(30, 1, '263408', 'LOGIN_2FA', '2026-01-14 18:11:28', 1, '2026-01-14 18:01:28'),
(31, 1, '205058', 'LOGIN_2FA', '2026-01-14 18:27:52', 1, '2026-01-14 18:17:52'),
(32, 1, '812234', 'LOGIN_2FA', '2026-01-14 18:45:19', 1, '2026-01-14 18:35:19'),
(33, 1, '922763', 'LOGIN_2FA', '2026-01-14 18:49:20', 1, '2026-01-14 18:39:19'),
(34, 1, '507358', 'LOGIN_2FA', '2026-01-14 18:55:11', 1, '2026-01-14 18:45:10'),
(35, 1, '451928', 'LOGIN_2FA', '2026-01-14 18:59:20', 1, '2026-01-14 18:49:20'),
(36, 1, '157620', 'LOGIN_2FA', '2026-01-14 19:03:42', 1, '2026-01-14 18:53:42'),
(37, 1, '602594', 'LOGIN_2FA', '2026-01-14 19:07:13', 1, '2026-01-14 18:57:12'),
(38, 1, '695641', 'LOGIN_2FA', '2026-01-14 19:10:11', 1, '2026-01-14 19:00:11'),
(39, 1, '680151', 'LOGIN_2FA', '2026-01-14 19:13:50', 1, '2026-01-14 19:03:49'),
(40, 1, '693178', 'LOGIN_2FA', '2026-01-14 19:17:03', 1, '2026-01-14 19:07:02'),
(41, 1, '415140', 'LOGIN_2FA', '2026-01-14 19:29:26', 1, '2026-01-14 19:19:26'),
(42, 1, '004390', 'LOGIN_2FA', '2026-01-14 19:32:18', 1, '2026-01-14 19:22:17'),
(43, 1, '757208', 'LOGIN_2FA', '2026-01-14 19:45:08', 1, '2026-01-14 19:35:08'),
(44, 1, '456610', 'LOGIN_2FA', '2026-01-14 20:03:05', 1, '2026-01-14 19:53:05'),
(45, 1, '181405', 'LOGIN_2FA', '2026-01-14 20:07:03', 1, '2026-01-14 19:57:02'),
(46, 1, '302123', 'LOGIN_2FA', '2026-01-14 20:09:27', 1, '2026-01-14 19:59:26'),
(47, 1, '846820', 'LOGIN_2FA', '2026-01-14 20:15:25', 1, '2026-01-14 20:05:25'),
(48, 1, '991352', 'LOGIN_2FA', '2026-01-14 20:23:20', 1, '2026-01-14 20:13:19'),
(49, 1, '948139', 'LOGIN_2FA', '2026-01-14 20:24:29', 1, '2026-01-14 20:14:29'),
(50, 1, '554237', 'LOGIN_2FA', '2026-01-14 20:30:28', 1, '2026-01-14 20:20:28'),
(51, 1, '920103', 'LOGIN_2FA', '2026-01-14 20:34:16', 1, '2026-01-14 20:24:15'),
(52, 1, '632657', 'LOGIN_2FA', '2026-01-14 20:35:28', 1, '2026-01-14 20:25:27'),
(53, 1, '266019', 'LOGIN_2FA', '2026-01-14 20:37:27', 1, '2026-01-14 20:27:27'),
(54, 1, '896175', 'LOGIN_2FA', '2026-01-14 20:41:09', 1, '2026-01-14 20:31:09'),
(55, 1, '373634', 'LOGIN_2FA', '2026-01-14 20:41:59', 1, '2026-01-14 20:31:58'),
(56, 1, '073853', 'LOGIN_2FA', '2026-01-14 20:43:40', 1, '2026-01-14 20:33:39'),
(57, 1, '353999', 'LOGIN_2FA', '2026-01-14 20:45:56', 1, '2026-01-14 20:35:55'),
(58, 1, '798331', 'LOGIN_2FA', '2026-01-14 20:53:36', 1, '2026-01-14 20:43:35'),
(59, 1, '841371', 'LOGIN_2FA', '2026-01-14 20:54:31', 1, '2026-01-14 20:44:31'),
(60, 1, '894344', 'LOGIN_2FA', '2026-01-14 20:56:01', 1, '2026-01-14 20:46:00'),
(61, 1, '402225', 'LOGIN_2FA', '2026-01-14 20:57:56', 1, '2026-01-14 20:47:55'),
(62, 1, '893618', 'LOGIN_2FA', '2026-01-14 21:01:04', 1, '2026-01-14 20:51:03'),
(63, 1, '011770', 'LOGIN_2FA', '2026-01-14 21:02:15', 1, '2026-01-14 20:52:14'),
(64, 1, '501546', 'LOGIN_2FA', '2026-01-14 21:04:35', 1, '2026-01-14 20:54:34'),
(65, 1, '433568', 'LOGIN_2FA', '2026-01-14 21:05:40', 1, '2026-01-14 20:55:39'),
(66, 15, '170156', 'LOGIN_2FA', '2026-01-14 21:24:43', 1, '2026-01-14 21:14:43'),
(67, 15, '550493', 'LOGIN_2FA', '2026-01-14 22:22:45', 1, '2026-01-14 22:12:45'),
(68, 15, '318069', 'LOGIN_2FA', '2026-01-14 23:24:24', 0, '2026-01-14 23:14:24'),
(69, 15, '226002', 'LOGIN_2FA', '2026-01-14 23:24:44', 1, '2026-01-14 23:14:43'),
(70, 1, '815678', 'LOGIN_2FA', '2026-01-14 23:35:23', 0, '2026-01-14 23:25:23'),
(71, 15, '430633', 'LOGIN_2FA', '2026-01-14 23:36:14', 0, '2026-01-14 23:26:13'),
(72, 15, '061577', 'LOGIN_2FA', '2026-01-14 23:36:37', 1, '2026-01-14 23:26:37'),
(73, 17, '331059', 'LOGIN_2FA', '2026-01-15 05:54:07', 1, '2026-01-15 05:44:07'),
(74, 15, '122126', 'LOGIN_2FA', '2026-01-15 07:42:04', 1, '2026-01-15 07:32:04'),
(75, 14, '048244', 'PASSWORD_RESET', '2026-01-15 07:46:38', 1, '2026-01-15 07:36:38'),
(76, 14, '412852', 'LOGIN_2FA', '2026-01-15 07:47:35', 1, '2026-01-15 07:37:34'),
(77, 14, '664942', 'LOGIN_2FA', '2026-01-15 07:54:39', 1, '2026-01-15 07:44:38'),
(78, 1, '623895', 'LOGIN_2FA', '2026-01-15 08:11:28', 0, '2026-01-15 08:01:27'),
(79, 1, '170618', 'LOGIN_2FA', '2026-01-15 08:12:51', 1, '2026-01-15 08:02:50'),
(80, 17, '101109', 'PASSWORD_RESET', '2026-01-15 08:30:03', 1, '2026-01-15 08:20:03'),
(81, 17, '104650', 'LOGIN_2FA', '2026-01-15 08:30:49', 1, '2026-01-15 08:20:49'),
(82, 17, '007435', 'LOGIN_2FA', '2026-01-15 08:31:35', 1, '2026-01-15 08:21:35'),
(83, 17, '339648', 'LOGIN_2FA', '2026-01-15 08:32:15', 1, '2026-01-15 08:22:15'),
(84, 17, '215062', 'LOGIN_2FA', '2026-01-15 08:33:07', 1, '2026-01-15 08:23:07'),
(85, 18, '012420', 'LOGIN_2FA', '2026-01-15 08:35:22', 1, '2026-01-15 08:25:21'),
(86, 17, '265833', 'LOGIN_2FA', '2026-01-15 08:37:44', 1, '2026-01-15 08:27:44'),
(87, 17, '480867', 'LOGIN_2FA', '2026-01-15 08:41:51', 1, '2026-01-15 08:31:51'),
(88, 17, '791723', 'LOGIN_2FA', '2026-01-15 09:07:10', 0, '2026-01-15 08:57:10'),
(89, 17, '150626', 'LOGIN_2FA', '2026-01-15 09:08:23', 1, '2026-01-15 08:58:23'),
(90, 14, '457720', 'LOGIN_2FA', '2026-01-15 09:35:03', 1, '2026-01-15 09:25:02'),
(91, 18, '883667', 'LOGIN_2FA', '2026-01-15 10:00:21', 1, '2026-01-15 09:50:20'),
(92, 17, '106258', 'LOGIN_2FA', '2026-01-15 11:21:21', 1, '2026-01-15 11:11:21'),
(93, 18, '136892', 'LOGIN_2FA', '2026-01-15 11:28:29', 1, '2026-01-15 11:18:29'),
(94, 16, '687348', 'LOGIN_2FA', '2026-01-15 12:30:03', 1, '2026-01-15 12:20:02'),
(95, 14, '856164', 'LOGIN_2FA', '2026-01-15 14:06:01', 0, '2026-01-15 13:56:00'),
(96, 14, '597846', 'LOGIN_2FA', '2026-01-15 14:08:50', 1, '2026-01-15 13:58:49'),
(97, 1, '464591', 'LOGIN_2FA', '2026-01-16 08:15:04', 1, '2026-01-16 08:05:03'),
(98, 15, '487584', 'LOGIN_2FA', '2026-01-16 08:16:08', 1, '2026-01-16 08:06:08'),
(99, 1, '132561', 'LOGIN_2FA', '2026-01-16 08:31:18', 1, '2026-01-16 08:21:18'),
(100, 15, '099778', 'LOGIN_2FA', '2026-01-16 08:32:45', 1, '2026-01-16 08:22:44'),
(101, 1, '880083', 'LOGIN_2FA', '2026-01-16 09:46:19', 0, '2026-01-16 09:36:19'),
(102, 15, '120692', 'LOGIN_2FA', '2026-01-16 09:46:47', 1, '2026-01-16 09:36:47'),
(103, 14, '139024', 'LOGIN_2FA', '2026-01-16 11:56:04', 1, '2026-01-16 11:46:04'),
(104, 14, '210312', 'LOGIN_2FA', '2026-01-16 12:17:06', 1, '2026-01-16 12:07:06'),
(105, 14, '481857', 'LOGIN_2FA', '2026-01-16 12:17:40', 0, '2026-01-16 12:07:40'),
(106, 15, '507817', 'LOGIN_2FA', '2026-01-16 13:09:20', 1, '2026-01-16 12:59:20'),
(107, 14, '720026', 'LOGIN_2FA', '2026-01-16 13:29:43', 1, '2026-01-16 13:19:42'),
(108, 1, '896474', 'LOGIN_2FA', '2026-01-16 15:07:20', 1, '2026-01-16 14:57:19'),
(109, 15, '047721', 'LOGIN_2FA', '2026-01-16 15:09:15', 1, '2026-01-16 14:59:14'),
(110, 13, '867846', 'LOGIN_2FA', '2026-01-16 15:10:12', 1, '2026-01-16 15:00:11'),
(111, 14, '272411', 'LOGIN_2FA', '2026-01-16 15:24:48', 1, '2026-01-16 15:14:47'),
(112, 1, '421676', 'LOGIN_2FA', '2026-01-17 13:40:38', 1, '2026-01-17 13:30:38'),
(113, 1, '177787', 'LOGIN_2FA', '2026-01-17 15:18:58', 1, '2026-01-17 15:08:58'),
(114, 1, '357698', 'LOGIN_2FA', '2026-01-17 16:18:56', 1, '2026-01-17 16:08:56'),
(115, 1, '723032', 'LOGIN_2FA', '2026-01-17 16:22:04', 1, '2026-01-17 16:12:03'),
(116, 1, '791689', 'LOGIN_2FA', '2026-01-17 17:15:50', 0, '2026-01-17 17:05:50'),
(117, 15, '963293', 'LOGIN_2FA', '2026-01-17 17:43:25', 0, '2026-01-17 17:33:24'),
(118, 15, '555759', 'LOGIN_2FA', '2026-01-17 17:43:41', 1, '2026-01-17 17:33:40'),
(119, 15, '717760', 'LOGIN_2FA', '2026-01-17 17:46:34', 1, '2026-01-17 17:36:34'),
(120, 14, '867840', 'LOGIN_2FA', '2026-01-18 08:00:16', 1, '2026-01-18 07:50:16'),
(121, 14, '609080', 'LOGIN_2FA', '2026-01-18 09:03:15', 1, '2026-01-18 08:53:14'),
(122, 1, '510674', 'LOGIN_2FA', '2026-01-18 17:00:33', 1, '2026-01-18 16:50:32'),
(123, 15, '558495', 'LOGIN_2FA', '2026-01-18 17:56:05', 1, '2026-01-18 17:46:04'),
(124, 1, '081321', 'LOGIN_2FA', '2026-01-18 18:05:23', 1, '2026-01-18 17:55:22'),
(125, 1, '609764', 'LOGIN_2FA', '2026-01-18 18:23:05', 0, '2026-01-18 18:13:05'),
(126, 15, '889913', 'LOGIN_2FA', '2026-01-18 18:23:20', 0, '2026-01-18 18:13:19'),
(127, 15, '969098', 'LOGIN_2FA', '2026-01-18 18:23:52', 0, '2026-01-18 18:13:51'),
(128, 1, '573261', 'LOGIN_2FA', '2026-01-18 18:24:02', 1, '2026-01-18 18:14:01'),
(129, 19, '489255', 'LOGIN_2FA', '2026-01-18 18:32:36', 1, '2026-01-18 18:22:36'),
(130, 1, '745855', 'LOGIN_2FA', '2026-01-18 18:52:23', 1, '2026-01-18 18:42:23'),
(131, 1, '487080', 'LOGIN_2FA', '2026-01-18 19:14:31', 0, '2026-01-18 19:04:31'),
(132, 1, '228837', 'LOGIN_2FA', '2026-01-18 19:15:05', 1, '2026-01-18 19:05:04'),
(133, 15, '101979', 'LOGIN_2FA', '2026-01-18 21:12:33', 1, '2026-01-18 21:02:32'),
(134, 15, '521128', 'LOGIN_2FA', '2026-01-18 21:13:38', 1, '2026-01-18 21:03:37'),
(135, 15, '575026', 'LOGIN_2FA', '2026-01-19 00:08:16', 1, '2026-01-18 23:58:15'),
(136, 17, '068107', 'LOGIN_2FA', '2026-01-19 08:50:12', 1, '2026-01-19 08:40:12'),
(137, 18, '199419', 'LOGIN_2FA', '2026-01-19 09:37:32', 1, '2026-01-19 09:27:31'),
(138, 17, '838847', 'LOGIN_2FA', '2026-01-19 14:54:19', 1, '2026-01-19 14:44:19'),
(139, 15, '005098', 'LOGIN_2FA', '2026-01-19 16:39:47', 1, '2026-01-19 16:29:46'),
(140, 1, '452053', 'LOGIN_2FA', '2026-01-19 22:44:21', 1, '2026-01-19 22:34:20'),
(141, 14, '390703', 'LOGIN_2FA', '2026-01-20 09:25:45', 1, '2026-01-20 09:15:45'),
(142, 14, '754319', 'LOGIN_2FA', '2026-01-20 09:28:52', 1, '2026-01-20 09:18:52'),
(143, 1, '665302', 'LOGIN_2FA', '2026-01-21 21:23:27', 1, '2026-01-21 21:13:27'),
(144, 1, '343183', 'LOGIN_2FA', '2026-01-21 21:24:11', 1, '2026-01-21 21:14:11'),
(145, 1, '374605', 'LOGIN_2FA', '2026-01-21 21:27:05', 1, '2026-01-21 21:17:04'),
(146, 1, '432405', 'LOGIN_2FA', '2026-01-21 21:29:21', 1, '2026-01-21 21:19:20'),
(147, 1, '027152', 'LOGIN_2FA', '2026-01-21 21:34:21', 0, '2026-01-21 21:24:20'),
(148, 1, '821908', 'LOGIN_2FA', '2026-01-21 21:42:35', 0, '2026-01-21 21:32:34'),
(149, 1, '739405', 'LOGIN_2FA', '2026-01-21 21:43:46', 0, '2026-01-21 21:33:45'),
(150, 1, '298661', 'LOGIN_2FA', '2026-01-21 21:45:57', 1, '2026-01-21 21:35:57'),
(151, 15, '571844', 'LOGIN_2FA', '2026-01-21 21:57:59', 1, '2026-01-21 21:47:59'),
(152, 1, '726139', 'LOGIN_2FA', '2026-01-21 22:48:39', 1, '2026-01-21 22:38:39'),
(153, 15, '048590', 'LOGIN_2FA', '2026-01-21 22:49:20', 1, '2026-01-21 22:39:20'),
(154, 14, '890271', 'LOGIN_2FA', '2026-01-22 04:23:38', 1, '2026-01-22 04:13:37'),
(155, 1, '820407', 'LOGIN_2FA', '2026-01-22 12:16:48', 1, '2026-01-22 12:06:47'),
(156, 14, '730214', 'LOGIN_2FA', '2026-01-22 12:21:27', 1, '2026-01-22 12:11:26'),
(157, 15, '627495', 'LOGIN_2FA', '2026-01-23 08:33:29', 0, '2026-01-23 08:23:28'),
(158, 15, '252580', 'LOGIN_2FA', '2026-01-23 08:34:42', 0, '2026-01-23 08:24:42'),
(159, 15, '094973', 'LOGIN_2FA', '2026-01-23 08:35:05', 1, '2026-01-23 08:25:04'),
(160, 15, '283933', 'LOGIN_2FA', '2026-01-25 12:15:19', 0, '2026-01-25 12:05:18'),
(161, 1, '855891', 'LOGIN_2FA', '2026-01-25 12:15:50', 1, '2026-01-25 12:05:49'),
(162, 1, '412523', 'LOGIN_2FA', '2026-01-25 12:28:14', 1, '2026-01-25 12:18:13'),
(163, 1, '956390', 'LOGIN_2FA', '2026-01-25 12:48:22', 1, '2026-01-25 12:38:22'),
(164, 15, '149752', 'LOGIN_2FA', '2026-01-25 13:06:07', 1, '2026-01-25 12:56:06'),
(165, 15, '520609', 'LOGIN_2FA', '2026-01-25 14:36:05', 1, '2026-01-25 14:26:04'),
(166, 1, '479356', 'LOGIN_2FA', '2026-01-25 15:23:23', 1, '2026-01-25 15:13:23'),
(167, 1, '332406', 'LOGIN_2FA', '2026-01-26 09:42:47', 1, '2026-01-26 09:32:47'),
(168, 1, '726637', 'LOGIN_2FA', '2026-01-26 10:23:34', 1, '2026-01-26 10:13:33'),
(169, 13, '844498', 'PASSWORD_RESET', '2026-01-26 16:06:55', 0, '2026-01-26 15:56:54'),
(170, 13, '288830', 'PASSWORD_RESET', '2026-01-26 16:07:44', 1, '2026-01-26 15:57:43'),
(171, 13, '207977', 'LOGIN_2FA', '2026-01-26 16:08:51', 1, '2026-01-26 15:58:51'),
(172, 13, '716689', 'LOGIN_2FA', '2026-01-26 16:15:23', 1, '2026-01-26 16:05:22'),
(173, 1, '757319', 'LOGIN_2FA', '2026-01-26 16:22:01', 1, '2026-01-26 16:12:01'),
(174, 1, '879408', 'LOGIN_2FA', '2026-01-26 16:26:32', 1, '2026-01-26 16:16:32'),
(175, 1, '539695', 'LOGIN_2FA', '2026-01-26 16:28:35', 1, '2026-01-26 16:18:34'),
(176, 13, '088919', 'LOGIN_2FA', '2026-01-26 16:45:37', 1, '2026-01-26 16:35:37'),
(177, 15, '227393', 'LOGIN_2FA', '2026-01-26 19:39:38', 1, '2026-01-26 19:29:38'),
(178, 1, '633245', 'LOGIN_2FA', '2026-01-27 09:39:03', 1, '2026-01-27 09:29:02'),
(179, 15, '509160', 'LOGIN_2FA', '2026-01-27 09:44:00', 1, '2026-01-27 09:33:59'),
(180, 18, '620267', 'LOGIN_2FA', '2026-01-28 08:55:02', 1, '2026-01-28 08:45:01'),
(181, 15, '410178', 'LOGIN_2FA', '2026-02-07 20:39:30', 1, '2026-02-07 20:29:30'),
(182, 1, '076092', 'LOGIN_2FA', '2026-02-19 13:54:47', 1, '2026-02-19 13:44:47'),
(183, 15, '769796', 'PASSWORD_RESET', '2026-02-19 13:56:54', 1, '2026-02-19 13:46:53'),
(184, 15, '738815', 'LOGIN_2FA', '2026-02-19 13:57:34', 1, '2026-02-19 13:47:33'),
(185, 15, '366598', 'LOGIN_2FA', '2026-02-21 19:57:03', 0, '2026-02-21 19:47:03'),
(186, 15, '531120', 'LOGIN_2FA', '2026-02-21 19:57:08', 0, '2026-02-21 19:47:07'),
(187, 15, '632736', 'LOGIN_2FA', '2026-02-21 19:57:20', 0, '2026-02-21 19:47:20'),
(188, 1, '076332', 'LOGIN_2FA', '2026-02-23 12:32:45', 0, '2026-02-23 12:22:44'),
(189, 1, '761519', 'LOGIN_2FA', '2026-02-23 12:42:24', 0, '2026-02-23 12:32:24'),
(190, 1, '829041', 'LOGIN_2FA', '2026-02-23 12:48:25', 1, '2026-02-23 12:38:24'),
(191, 15, '676420', 'LOGIN_2FA', '2026-02-23 12:51:33', 1, '2026-02-23 12:41:33'),
(192, 15, '354485', 'LOGIN_2FA', '2026-02-26 08:06:15', 1, '2026-02-26 07:56:15'),
(193, 1, '253296', 'LOGIN_2FA', '2026-02-26 09:09:07', 1, '2026-02-26 08:59:07'),
(194, 1, '503268', 'LOGIN_2FA', '2026-02-26 10:00:31', 0, '2026-02-26 09:50:31'),
(195, 1, '336109', 'LOGIN_2FA', '2026-02-26 10:00:39', 0, '2026-02-26 09:50:38'),
(196, 1, '585593', 'LOGIN_2FA', '2026-02-26 10:00:58', 0, '2026-02-26 09:50:57'),
(197, 1, '241570', 'LOGIN_2FA', '2026-02-26 12:16:13', 0, '2026-02-26 12:06:12'),
(198, 16, '212922', 'LOGIN_2FA', '2026-02-26 16:19:26', 1, '2026-02-26 16:09:26'),
(199, 1, '808799', 'LOGIN_2FA', '2026-02-26 16:22:51', 1, '2026-02-26 16:12:51'),
(200, 15, '466748', 'LOGIN_2FA', '2026-02-26 16:35:38', 1, '2026-02-26 16:25:37'),
(201, 15, '294798', 'LOGIN_2FA', '2026-02-26 16:37:54', 0, '2026-02-26 16:27:54'),
(202, 15, '500412', 'LOGIN_2FA', '2026-02-27 12:25:03', 1, '2026-02-27 12:15:02'),
(203, 15, '192837', 'LOGIN_2FA', '2026-03-01 14:12:02', 1, '2026-03-01 14:02:02'),
(204, 1, '889276', 'LOGIN_2FA', '2026-03-02 18:47:26', 0, '2026-03-02 18:37:25'),
(205, 1, '811307', 'LOGIN_2FA', '2026-03-02 18:47:29', 0, '2026-03-02 18:37:28'),
(206, 1, '200239', 'LOGIN_2FA', '2026-03-02 18:48:08', 0, '2026-03-02 18:38:07'),
(207, 1, '613325', 'LOGIN_2FA', '2026-03-02 18:48:10', 0, '2026-03-02 18:38:09'),
(208, 1, '780742', 'LOGIN_2FA', '2026-03-02 18:49:03', 0, '2026-03-02 18:39:02'),
(209, 1, '227662', 'LOGIN_2FA', '2026-03-02 18:49:30', 0, '2026-03-02 18:39:30'),
(210, 1, '346529', 'LOGIN_2FA', '2026-03-02 18:51:02', 0, '2026-03-02 18:41:01'),
(211, 1, '418649', 'LOGIN_2FA', '2026-03-02 18:51:31', 0, '2026-03-02 18:41:31'),
(212, 1, '790757', 'LOGIN_2FA', '2026-03-02 18:57:01', 0, '2026-03-02 18:47:01'),
(213, 15, '473647', 'LOGIN_2FA', '2026-03-02 18:57:19', 1, '2026-03-02 18:47:19'),
(214, 13, '225922', 'LOGIN_2FA', '2026-03-03 16:59:51', 1, '2026-03-03 16:49:50'),
(215, 1, '315390', 'LOGIN_2FA', '2026-03-03 19:05:12', 1, '2026-03-03 18:55:12'),
(216, 1, '824436', 'LOGIN_2FA', '2026-03-04 22:38:09', 1, '2026-03-04 22:28:09'),
(217, 1, '472874', 'LOGIN_2FA', '2026-03-04 22:41:38', 1, '2026-03-04 22:31:37'),
(218, 15, '190457', 'LOGIN_2FA', '2026-03-04 22:54:36', 1, '2026-03-04 22:44:36'),
(219, 15, '411700', 'LOGIN_2FA', '2026-03-04 23:04:15', 1, '2026-03-04 22:54:15'),
(220, 18, '979898', 'LOGIN_2FA', '2026-03-05 09:13:11', 1, '2026-03-05 09:03:10'),
(221, 17, '322109', 'LOGIN_2FA', '2026-03-05 09:17:54', 1, '2026-03-05 09:07:53'),
(222, 32, '785394', 'LOGIN_2FA', '2026-03-05 14:34:52', 1, '2026-03-05 14:24:52'),
(223, 26, '641547', 'LOGIN_2FA', '2026-03-05 14:42:01', 1, '2026-03-05 14:32:01'),
(224, 31, '329290', 'LOGIN_2FA', '2026-03-05 14:52:38', 1, '2026-03-05 14:42:38'),
(225, 1, '110692', 'LOGIN_2FA', '2026-03-06 16:11:53', 1, '2026-03-06 16:01:53'),
(226, 14, '500041', 'PASSWORD_RESET', '2026-03-07 18:54:54', 1, '2026-03-07 18:44:53'),
(227, 14, '559336', 'LOGIN_2FA', '2026-03-07 19:01:15', 1, '2026-03-07 18:51:14'),
(228, 1, '635638', 'LOGIN_2FA', '2026-03-07 19:23:54', 1, '2026-03-07 19:13:53'),
(229, 1, '792533', 'LOGIN_2FA', '2026-03-07 19:30:06', 1, '2026-03-07 19:20:05'),
(230, 14, '447608', 'LOGIN_2FA', '2026-03-07 19:37:53', 1, '2026-03-07 19:27:52'),
(231, 1, '714390', 'LOGIN_2FA', '2026-03-07 19:39:33', 1, '2026-03-07 19:29:33'),
(232, 14, '517822', 'LOGIN_2FA', '2026-03-07 19:41:12', 0, '2026-03-07 19:31:11'),
(233, 14, '677304', 'LOGIN_2FA', '2026-03-07 20:05:45', 1, '2026-03-07 19:55:44'),
(234, 15, '468123', 'LOGIN_2FA', '2026-03-07 21:10:43', 1, '2026-03-07 21:00:43'),
(235, 27, '388258', 'LOGIN_2FA', '2026-03-08 05:43:06', 1, '2026-03-08 05:33:05'),
(236, 32, '977558', 'LOGIN_2FA', '2026-03-09 06:00:43', 0, '2026-03-09 05:50:43'),
(237, 32, '350007', 'LOGIN_2FA', '2026-03-09 06:01:04', 1, '2026-03-09 05:51:03'),
(238, 1, '226828', 'LOGIN_2FA', '2026-03-09 09:00:34', 1, '2026-03-09 08:50:33'),
(239, 1, '495343', 'LOGIN_2FA', '2026-03-09 09:12:18', 1, '2026-03-09 09:02:17'),
(240, 15, '810919', 'LOGIN_2FA', '2026-03-09 09:14:39', 1, '2026-03-09 09:04:39'),
(241, 15, '762956', 'LOGIN_2FA', '2026-03-09 09:19:32', 1, '2026-03-09 09:09:32'),
(242, 1, '061503', 'LOGIN_2FA', '2026-03-09 12:24:27', 1, '2026-03-09 12:14:27'),
(243, 15, '427113', 'LOGIN_2FA', '2026-03-09 15:21:05', 1, '2026-03-09 15:11:05'),
(244, 15, '261208', 'LOGIN_2FA', '2026-03-09 15:24:12', 1, '2026-03-09 15:14:11'),
(245, 15, '212140', 'LOGIN_2FA', '2026-03-09 15:25:05', 1, '2026-03-09 15:15:04'),
(246, 32, '366361', 'LOGIN_2FA', '2026-03-10 06:17:22', 1, '2026-03-10 06:07:22'),
(247, 27, '150952', 'LOGIN_2FA', '2026-03-10 09:20:23', 1, '2026-03-10 09:10:22'),
(248, 31, '973210', 'LOGIN_2FA', '2026-03-10 09:22:03', 1, '2026-03-10 09:12:02'),
(249, 28, '045928', 'PASSWORD_RESET', '2026-03-10 09:22:18', 1, '2026-03-10 09:12:17'),
(250, 30, '341260', 'PASSWORD_RESET', '2026-03-10 09:22:31', 1, '2026-03-10 09:12:31'),
(251, 19, '464105', 'PASSWORD_RESET', '2026-03-10 09:22:42', 1, '2026-03-10 09:12:42'),
(252, 29, '384390', 'PASSWORD_RESET', '2026-03-10 09:22:42', 1, '2026-03-10 09:12:42'),
(253, 19, '988492', 'LOGIN_2FA', '2026-03-10 09:23:11', 1, '2026-03-10 09:13:11'),
(254, 25, '145679', 'PASSWORD_RESET', '2026-03-10 09:23:16', 1, '2026-03-10 09:13:15'),
(255, 28, '358031', 'LOGIN_2FA', '2026-03-10 09:23:28', 1, '2026-03-10 09:13:27'),
(256, 28, '453258', 'LOGIN_2FA', '2026-03-10 09:23:38', 0, '2026-03-10 09:13:37'),
(257, 30, '394266', 'LOGIN_2FA', '2026-03-10 09:23:46', 1, '2026-03-10 09:13:45'),
(258, 25, '913699', 'LOGIN_2FA', '2026-03-10 09:24:06', 1, '2026-03-10 09:14:06'),
(259, 29, '758326', 'LOGIN_2FA', '2026-03-10 09:24:30', 1, '2026-03-10 09:14:29'),
(260, 26, '337038', 'LOGIN_2FA', '2026-03-10 09:24:55', 1, '2026-03-10 09:14:54'),
(261, 33, '517913', 'PASSWORD_RESET', '2026-03-10 09:28:18', 1, '2026-03-10 09:18:18'),
(262, 33, '206619', 'LOGIN_2FA', '2026-03-10 09:29:05', 1, '2026-03-10 09:19:05'),
(263, 1, '668791', 'LOGIN_2FA', '2026-03-10 11:40:41', 1, '2026-03-10 11:30:40'),
(264, 24, '383440', 'LOGIN_2FA', '2026-03-10 12:01:22', 1, '2026-03-10 11:51:22'),
(265, 15, '029115', 'LOGIN_2FA', '2026-03-10 14:32:53', 1, '2026-03-10 14:22:52'),
(266, 15, '036669', 'LOGIN_2FA', '2026-03-10 18:41:00', 1, '2026-03-10 18:31:00'),
(267, 32, '515523', 'LOGIN_2FA', '2026-03-11 10:20:32', 1, '2026-03-11 10:10:32'),
(268, 32, '898625', 'LOGIN_2FA', '2026-03-12 13:05:55', 0, '2026-03-12 12:55:54'),
(269, 32, '313012', 'LOGIN_2FA', '2026-03-12 13:06:16', 1, '2026-03-12 12:56:15'),
(270, 1, '335692', 'LOGIN_2FA', '2026-03-13 12:50:16', 1, '2026-03-13 12:40:15'),
(271, 1, '369154', 'LOGIN_2FA', '2026-03-14 20:06:10', 1, '2026-03-14 19:56:10'),
(272, 15, '871621', 'LOGIN_2FA', '2026-03-14 20:14:48', 1, '2026-03-14 20:04:48'),
(273, 1, '032742', 'LOGIN_2FA', '2026-03-14 21:02:22', 1, '2026-03-14 20:52:21'),
(274, 15, '264514', 'LOGIN_2FA', '2026-03-14 21:06:06', 1, '2026-03-14 20:56:06'),
(275, 13, '822183', 'LOGIN_2FA', '2026-03-14 21:18:20', 1, '2026-03-14 21:08:20'),
(276, 16, '121449', 'LOGIN_2FA', '2026-03-14 21:20:12', 1, '2026-03-14 21:10:11'),
(277, 15, '884623', 'LOGIN_2FA', '2026-03-15 16:26:53', 1, '2026-03-15 16:16:53'),
(278, 1, '792789', 'LOGIN_2FA', '2026-03-15 19:51:57', 0, '2026-03-15 19:41:57'),
(279, 1, '190286', 'LOGIN_2FA', '2026-03-15 19:52:10', 1, '2026-03-15 19:42:10'),
(280, 1, '535582', 'LOGIN_2FA', '2026-03-15 20:01:22', 0, '2026-03-15 19:51:22'),
(281, 1, '219312', 'LOGIN_2FA', '2026-03-15 20:01:45', 1, '2026-03-15 19:51:44'),
(282, 27, '753660', 'LOGIN_2FA', '2026-03-16 12:30:18', 1, '2026-03-16 12:20:18'),
(283, 19, '163998', 'LOGIN_2FA', '2026-03-16 18:15:21', 1, '2026-03-16 18:05:20'),
(284, 32, '258842', 'LOGIN_2FA', '2026-03-16 18:16:21', 1, '2026-03-16 18:06:21'),
(285, 30, '915517', 'LOGIN_2FA', '2026-03-16 18:53:50', 1, '2026-03-16 18:43:49'),
(286, 25, '486014', 'LOGIN_2FA', '2026-03-16 19:38:46', 1, '2026-03-16 19:28:45'),
(287, 26, '591560', 'LOGIN_2FA', '2026-03-16 20:19:24', 1, '2026-03-16 20:09:23'),
(288, 33, '100960', 'LOGIN_2FA', '2026-03-17 01:37:15', 1, '2026-03-17 01:27:14'),
(289, 25, '134482', 'LOGIN_2FA', '2026-03-17 03:41:29', 1, '2026-03-17 03:31:29'),
(290, 28, '252287', 'LOGIN_2FA', '2026-03-17 05:58:47', 1, '2026-03-17 05:48:47'),
(291, 31, '167304', 'LOGIN_2FA', '2026-03-17 06:07:58', 1, '2026-03-17 05:57:57'),
(292, 29, '472054', 'LOGIN_2FA', '2026-03-17 06:08:19', 1, '2026-03-17 05:58:19'),
(293, 27, '331243', 'LOGIN_2FA', '2026-03-17 14:42:55', 1, '2026-03-17 14:32:54'),
(294, 15, '728688', 'LOGIN_2FA', '2026-03-18 09:48:20', 1, '2026-03-18 09:38:20'),
(295, 15, '210096', 'LOGIN_2FA', '2026-03-19 10:27:24', 1, '2026-03-19 10:17:23'),
(296, 15, '836245', 'LOGIN_2FA', '2026-03-19 10:38:47', 1, '2026-03-19 10:28:47'),
(297, 31, '556866', 'LOGIN_2FA', '2026-03-19 12:24:58', 1, '2026-03-19 12:14:57'),
(298, 29, '532297', 'LOGIN_2FA', '2026-03-19 12:28:21', 1, '2026-03-19 12:18:21'),
(299, 1, '778266', 'LOGIN_2FA', '2026-03-19 14:34:08', 1, '2026-03-19 14:24:07'),
(300, 31, '380519', 'LOGIN_2FA', '2026-03-21 07:17:28', 1, '2026-03-21 07:07:28'),
(301, 27, '561874', 'LOGIN_2FA', '2026-03-21 08:16:11', 1, '2026-03-21 08:06:11'),
(302, 27, '462700', 'LOGIN_2FA', '2026-03-23 05:41:09', 1, '2026-03-23 05:31:09'),
(303, 24, '398245', 'LOGIN_2FA', '2026-03-23 07:26:40', 1, '2026-03-23 07:16:39'),
(304, 21, '782559', 'LOGIN_2FA', '2026-03-24 18:04:25', 1, '2026-03-24 17:54:24'),
(305, 1, '497551', 'LOGIN_2FA', '2026-03-27 08:28:18', 1, '2026-03-27 08:18:18'),
(306, 24, '821275', 'LOGIN_2FA', '2026-03-27 08:28:32', 1, '2026-03-27 08:18:31'),
(307, 14, '183057', 'PASSWORD_RESET', '2026-03-27 08:29:16', 1, '2026-03-27 08:19:15'),
(308, 14, '378284', 'LOGIN_2FA', '2026-03-27 08:30:43', 1, '2026-03-27 08:20:42'),
(309, 15, '802510', 'LOGIN_2FA', '2026-03-27 08:56:33', 1, '2026-03-27 08:46:32'),
(310, 1, '698284', 'LOGIN_2FA', '2026-03-27 09:25:52', 1, '2026-03-27 09:15:51'),
(311, 21, '205077', 'LOGIN_2FA', '2026-03-30 07:50:59', 1, '2026-03-30 07:40:59'),
(312, 21, '978066', 'LOGIN_2FA', '2026-03-30 08:03:02', 1, '2026-03-30 07:53:01'),
(313, 1, '543549', 'LOGIN_2FA', '2026-03-30 18:03:00', 1, '2026-03-30 17:52:59'),
(314, 23, '029282', 'PASSWORD_RESET', '2026-03-30 18:21:15', 1, '2026-03-30 18:11:15'),
(315, 23, '339712', 'LOGIN_2FA', '2026-03-30 18:22:30', 1, '2026-03-30 18:12:30'),
(316, 32, '729611', 'LOGIN_2FA', '2026-03-31 08:35:53', 1, '2026-03-31 08:25:52'),
(317, 13, '024326', 'LOGIN_2FA', '2026-03-31 09:26:45', 1, '2026-03-31 09:16:45'),
(318, 1, '105282', 'LOGIN_2FA', '2026-03-31 09:31:16', 1, '2026-03-31 09:21:15'),
(319, 20, '190523', 'PASSWORD_RESET', '2026-04-01 06:34:33', 1, '2026-04-01 06:24:33'),
(320, 20, '070578', 'LOGIN_2FA', '2026-04-01 06:39:43', 0, '2026-04-01 06:29:42'),
(321, 21, '320675', 'LOGIN_2FA', '2026-04-01 19:32:58', 1, '2026-04-01 19:22:57'),
(322, 15, '105118', 'LOGIN_2FA', '2026-04-03 08:59:38', 1, '2026-04-03 08:49:37'),
(323, 21, '475061', 'LOGIN_2FA', '2026-04-09 07:27:01', 1, '2026-04-09 07:17:00'),
(324, 21, '972402', 'LOGIN_2FA', '2026-04-13 08:25:53', 1, '2026-04-13 08:15:53'),
(325, 21, '786308', 'LOGIN_2FA', '2026-04-14 08:08:36', 1, '2026-04-14 07:58:35'),
(326, 23, '813095', 'PASSWORD_RESET', '2026-04-20 05:33:56', 1, '2026-04-20 05:23:56'),
(327, 23, '427471', 'LOGIN_2FA', '2026-04-20 05:35:17', 1, '2026-04-20 05:25:17'),
(328, 23, '044291', 'LOGIN_2FA', '2026-04-20 06:10:27', 0, '2026-04-20 06:00:27'),
(329, 23, '129921', 'LOGIN_2FA', '2026-04-20 06:10:57', 0, '2026-04-20 06:00:56'),
(330, 32, '312497', 'LOGIN_2FA', '2026-04-23 16:51:36', 1, '2026-04-23 16:41:35'),
(331, 32, '162871', 'LOGIN_2FA', '2026-04-23 16:53:32', 1, '2026-04-23 16:43:31'),
(332, 13, '556173', 'PASSWORD_RESET', '2026-04-27 13:02:18', 0, '2026-04-27 12:52:17'),
(333, 13, '960538', 'LOGIN_2FA', '2026-04-27 13:03:47', 1, '2026-04-27 12:53:46'),
(334, 27, '245747', 'LOGIN_2FA', '2026-04-27 13:27:09', 1, '2026-04-27 13:17:08'),
(335, 26, '201596', 'LOGIN_2FA', '2026-04-27 13:30:06', 1, '2026-04-27 13:20:06'),
(336, 19, '847071', 'LOGIN_2FA', '2026-04-27 13:30:10', 1, '2026-04-27 13:20:09'),
(337, 33, '677130', 'LOGIN_2FA', '2026-04-27 13:33:44', 0, '2026-04-27 13:23:43'),
(338, 33, '831246', 'PASSWORD_RESET', '2026-04-27 13:34:10', 1, '2026-04-27 13:24:09'),
(339, 33, '245714', 'LOGIN_2FA', '2026-04-27 13:35:17', 1, '2026-04-27 13:25:17'),
(340, 19, '094611', 'LOGIN_2FA', '2026-04-27 17:58:07', 0, '2026-04-27 17:48:06'),
(341, 19, '588334', 'LOGIN_2FA', '2026-04-27 17:58:27', 1, '2026-04-27 17:48:26'),
(342, 28, '861359', 'PASSWORD_RESET', '2026-04-27 18:16:04', 1, '2026-04-27 18:06:04'),
(343, 28, '533455', 'LOGIN_2FA', '2026-04-27 18:18:07', 0, '2026-04-27 18:08:06'),
(344, 28, '659613', 'LOGIN_2FA', '2026-04-27 18:18:21', 0, '2026-04-27 18:08:20'),
(345, 28, '447917', 'LOGIN_2FA', '2026-04-27 18:24:06', 1, '2026-04-27 18:14:05'),
(346, 30, '948789', 'LOGIN_2FA', '2026-04-28 05:57:33', 1, '2026-04-28 05:47:32'),
(347, 1, '522656', 'LOGIN_2FA', '2026-04-28 09:01:19', 0, '2026-04-28 08:51:19'),
(348, 1, '512432', 'LOGIN_2FA', '2026-04-28 09:01:30', 1, '2026-04-28 08:51:30'),
(349, 15, '979149', 'LOGIN_2FA', '2026-04-28 09:02:45', 1, '2026-04-28 08:52:44'),
(350, 32, '670535', 'LOGIN_2FA', '2026-04-28 09:48:27', 1, '2026-04-28 09:38:27'),
(351, 27, '639167', 'LOGIN_2FA', '2026-04-28 18:08:17', 1, '2026-04-28 17:58:16'),
(352, 19, '130488', 'LOGIN_2FA', '2026-04-28 21:25:13', 1, '2026-04-28 21:15:13'),
(353, 33, '112846', 'LOGIN_2FA', '2026-04-29 03:19:32', 1, '2026-04-29 03:09:32'),
(354, 30, '353472', 'LOGIN_2FA', '2026-04-29 10:18:54', 1, '2026-04-29 10:08:53'),
(355, 13, '092315', 'LOGIN_2FA', '2026-04-29 11:30:52', 1, '2026-04-29 11:20:52'),
(356, 13, '060304', 'LOGIN_2FA', '2026-04-29 11:31:19', 0, '2026-04-29 11:21:19'),
(357, 15, '258386', 'LOGIN_2FA', '2026-04-29 12:17:34', 1, '2026-04-29 12:07:34'),
(358, 25, '278224', 'PASSWORD_RESET', '2026-04-29 12:38:41', 0, '2026-04-29 12:28:40'),
(359, 25, '555358', 'PASSWORD_RESET', '2026-04-29 12:38:55', 1, '2026-04-29 12:28:54'),
(360, 25, '235189', 'LOGIN_2FA', '2026-04-29 12:40:10', 1, '2026-04-29 12:30:10'),
(361, 28, '241589', 'LOGIN_2FA', '2026-04-29 19:12:34', 1, '2026-04-29 19:02:34'),
(362, 15, '508300', 'LOGIN_2FA', '2026-04-29 19:57:40', 0, '2026-04-29 19:47:40'),
(363, 32, '543868', 'LOGIN_2FA', '2026-04-29 20:01:01', 1, '2026-04-29 19:51:00'),
(364, 31, '829782', 'LOGIN_2FA', '2026-04-30 05:56:13', 1, '2026-04-30 05:46:12'),
(365, 15, '919312', 'LOGIN_2FA', '2026-04-30 07:09:45', 1, '2026-04-30 06:59:45'),
(366, 1, '764998', 'LOGIN_2FA', '2026-04-30 07:18:03', 0, '2026-04-30 07:08:02'),
(367, 1, '305432', 'LOGIN_2FA', '2026-04-30 07:51:28', 1, '2026-04-30 07:41:28'),
(368, 34, '720556', 'PASSWORD_RESET', '2026-04-30 08:03:34', 1, '2026-04-30 07:53:34'),
(369, 34, '458307', 'LOGIN_2FA', '2026-04-30 08:06:30', 1, '2026-04-30 07:56:30'),
(370, 19, '434347', 'LOGIN_2FA', '2026-04-30 11:17:26', 1, '2026-04-30 11:07:26'),
(371, 29, '489155', 'PASSWORD_RESET', '2026-04-30 12:00:31', 1, '2026-04-30 11:50:30'),
(372, 29, '842451', 'LOGIN_2FA', '2026-04-30 12:03:53', 1, '2026-04-30 11:53:53'),
(373, 30, '782381', 'LOGIN_2FA', '2026-04-30 12:46:31', 1, '2026-04-30 12:36:31'),
(374, 33, '348782', 'LOGIN_2FA', '2026-04-30 12:57:33', 1, '2026-04-30 12:47:32'),
(375, 27, '622880', 'LOGIN_2FA', '2026-05-01 04:22:47', 1, '2026-05-01 04:12:46'),
(376, 19, '597623', 'LOGIN_2FA', '2026-05-01 14:52:17', 0, '2026-05-01 14:42:17'),
(377, 29, '806370', 'LOGIN_2FA', '2026-05-01 17:55:45', 1, '2026-05-01 17:45:44'),
(378, 30, '735307', 'LOGIN_2FA', '2026-05-01 18:44:05', 1, '2026-05-01 18:34:05'),
(379, 26, '443305', 'LOGIN_2FA', '2026-05-01 23:22:57', 1, '2026-05-01 23:12:57'),
(380, 33, '235791', 'LOGIN_2FA', '2026-05-02 09:01:43', 1, '2026-05-02 08:51:43'),
(381, 33, '865930', 'PASSWORD_RESET', '2026-05-02 09:02:00', 0, '2026-05-02 08:52:00'),
(382, 33, '492280', 'LOGIN_2FA', '2026-05-02 09:03:43', 0, '2026-05-02 08:53:43'),
(383, 27, '389660', 'LOGIN_2FA', '2026-05-02 09:21:07', 1, '2026-05-02 09:11:06'),
(384, 27, '664840', 'LOGIN_2FA', '2026-05-02 09:21:18', 0, '2026-05-02 09:11:17'),
(385, 32, '497139', 'LOGIN_2FA', '2026-05-03 07:31:50', 1, '2026-05-03 07:21:49'),
(386, 19, '398298', 'LOGIN_2FA', '2026-05-03 10:04:26', 1, '2026-05-03 09:54:25'),
(387, 31, '804355', 'LOGIN_2FA', '2026-05-03 14:06:06', 1, '2026-05-03 13:56:05'),
(388, 25, '828536', 'LOGIN_2FA', '2026-05-03 15:09:59', 1, '2026-05-03 14:59:59'),
(389, 27, '730302', 'LOGIN_2FA', '2026-05-04 05:56:31', 1, '2026-05-04 05:46:31'),
(390, 33, '367545', 'LOGIN_2FA', '2026-05-04 11:38:18', 1, '2026-05-04 11:28:18'),
(391, 15, '352979', 'LOGIN_2FA', '2026-05-04 15:43:07', 0, '2026-05-04 15:33:07'),
(392, 15, '103507', 'LOGIN_2FA', '2026-05-04 15:43:40', 1, '2026-05-04 15:33:40'),
(393, 34, '226245', 'LOGIN_2FA', '2026-05-04 15:53:47', 1, '2026-05-04 15:43:46'),
(394, 32, '867299', 'LOGIN_2FA', '2026-05-04 16:56:27', 0, '2026-05-04 16:46:27'),
(395, 32, '523651', 'LOGIN_2FA', '2026-05-04 16:57:00', 1, '2026-05-04 16:46:59'),
(396, 28, '174312', 'LOGIN_2FA', '2026-05-04 17:04:48', 1, '2026-05-04 16:54:47'),
(397, 29, '180476', 'PASSWORD_RESET', '2026-05-04 17:27:28', 1, '2026-05-04 17:17:28'),
(398, 29, '891816', 'LOGIN_2FA', '2026-05-04 17:28:55', 1, '2026-05-04 17:18:55'),
(399, 25, '832386', 'LOGIN_2FA', '2026-05-04 20:05:09', 1, '2026-05-04 19:55:09'),
(400, 31, '227858', 'LOGIN_2FA', '2026-05-04 20:07:28', 1, '2026-05-04 19:57:27'),
(401, 26, '967268', 'LOGIN_2FA', '2026-05-04 22:07:15', 1, '2026-05-04 21:57:15'),
(402, 33, '819506', 'LOGIN_2FA', '2026-05-05 03:26:46', 0, '2026-05-05 03:16:46'),
(403, 32, '597046', 'LOGIN_2FA', '2026-05-05 04:51:11', 1, '2026-05-05 04:41:10'),
(404, 32, '614746', 'LOGIN_2FA', '2026-05-05 04:52:49', 1, '2026-05-05 04:42:49'),
(405, 27, '343467', 'LOGIN_2FA', '2026-05-05 05:54:06', 1, '2026-05-05 05:44:05'),
(406, 33, '114594', 'LOGIN_2FA', '2026-05-05 06:48:05', 0, '2026-05-05 06:38:04'),
(407, 33, '994512', 'LOGIN_2FA', '2026-05-05 06:48:32', 1, '2026-05-05 06:38:32'),
(408, 15, '149631', 'LOGIN_2FA', '2026-05-06 17:29:12', 0, '2026-05-06 17:19:12'),
(409, 15, '553550', 'LOGIN_2FA', '2026-05-06 17:29:23', 1, '2026-05-06 17:19:23'),
(410, 34, '353909', 'LOGIN_2FA', '2026-05-06 17:32:03', 1, '2026-05-06 17:22:02'),
(411, 1, '006171', 'LOGIN_2FA', '2026-05-07 08:09:59', 0, '2026-05-07 07:59:58'),
(412, 15, '245684', 'LOGIN_2FA', '2026-05-07 08:10:15', 1, '2026-05-07 08:00:15'),
(413, 21, '358497', 'LOGIN_2FA', '2026-05-07 11:14:06', 1, '2026-05-07 11:04:05'),
(414, 21, '763654', 'LOGIN_2FA', '2026-05-07 11:14:08', 1, '2026-05-07 11:04:08'),
(415, 15, '532676', 'LOGIN_2FA', '2026-05-08 11:14:03', 1, '2026-05-08 11:04:03'),
(416, 27, '631188', 'LOGIN_2FA', '2026-05-10 16:49:00', 1, '2026-05-10 16:39:00'),
(417, 1, '444433', 'LOGIN_2FA', '2026-05-11 06:51:40', 1, '2026-05-11 06:41:39'),
(418, 28, '146239', 'LOGIN_2FA', '2026-05-11 07:22:48', 1, '2026-05-11 07:12:48'),
(419, 15, '264759', 'LOGIN_2FA', '2026-05-11 07:27:09', 1, '2026-05-11 07:17:09'),
(420, 13, '283941', 'LOGIN_2FA', '2026-05-11 07:27:49', 1, '2026-05-11 07:17:48'),
(421, 26, '146853', 'LOGIN_2FA', '2026-05-11 07:28:04', 1, '2026-05-11 07:18:04'),
(422, 19, '067035', 'LOGIN_2FA', '2026-05-11 07:30:42', 1, '2026-05-11 07:20:41'),
(423, 31, '836174', 'LOGIN_2FA', '2026-05-11 07:32:00', 1, '2026-05-11 07:21:59'),
(424, 30, '240431', 'LOGIN_2FA', '2026-05-11 07:40:05', 0, '2026-05-11 07:30:05'),
(425, 34, '692890', 'LOGIN_2FA', '2026-05-11 07:43:32', 1, '2026-05-11 07:33:31'),
(426, 1, '643006', 'LOGIN_2FA', '2026-05-11 07:48:15', 1, '2026-05-11 07:38:15'),
(427, 19, '737606', 'LOGIN_2FA', '2026-05-11 07:51:23', 1, '2026-05-11 07:41:23'),
(428, 19, '922213', 'LOGIN_2FA', '2026-05-11 07:54:36', 1, '2026-05-11 07:44:35'),
(429, 33, '289398', 'LOGIN_2FA', '2026-05-11 09:17:01', 1, '2026-05-11 09:07:01'),
(430, 30, '624945', 'LOGIN_2FA', '2026-05-11 09:19:17', 1, '2026-05-11 09:09:16'),
(431, 19, '954608', 'LOGIN_2FA', '2026-05-12 10:30:04', 1, '2026-05-12 10:20:04'),
(432, 33, '581996', 'LOGIN_2FA', '2026-05-12 10:31:00', 1, '2026-05-12 10:21:00'),
(433, 23, '027735', 'LOGIN_2FA', '2026-05-13 06:57:16', 1, '2026-05-13 06:47:15'),
(434, 27, '667389', 'LOGIN_2FA', '2026-05-13 09:26:23', 1, '2026-05-13 09:16:23'),
(435, 25, '245687', 'LOGIN_2FA', '2026-05-14 03:16:47', 1, '2026-05-14 03:06:47'),
(436, 26, '617730', 'LOGIN_2FA', '2026-05-14 03:21:18', 1, '2026-05-14 03:11:18'),
(437, 25, '994494', 'LOGIN_2FA', '2026-05-15 06:59:12', 1, '2026-05-15 06:49:12'),
(438, 26, '693679', 'LOGIN_2FA', '2026-05-16 07:11:11', 1, '2026-05-16 07:01:11'),
(439, 27, '519048', 'LOGIN_2FA', '2026-05-17 15:12:03', 1, '2026-05-17 15:02:03'),
(440, 33, '119837', 'LOGIN_2FA', '2026-05-17 17:57:25', 1, '2026-05-17 17:47:25'),
(441, 23, '391332', 'LOGIN_2FA', '2026-05-20 06:49:49', 1, '2026-05-20 06:39:49'),
(442, 15, '173542', 'LOGIN_2FA', '2026-05-21 10:11:33', 1, '2026-05-21 10:01:32'),
(443, 15, '428149', 'LOGIN_2FA', '2026-05-26 08:40:23', 1, '2026-05-26 08:30:22'),
(444, 19, '582146', 'LOGIN_2FA', '2026-05-26 09:19:54', 1, '2026-05-26 09:09:54'),
(445, 19, '510842', 'PASSWORD_RESET', '2026-05-26 09:19:57', 1, '2026-05-26 09:09:57'),
(446, 19, '974880', 'LOGIN_2FA', '2026-05-26 09:21:32', 0, '2026-05-26 09:11:32'),
(447, 33, '242582', 'LOGIN_2FA', '2026-05-26 09:29:54', 1, '2026-05-26 09:19:53'),
(448, 26, '711451', 'LOGIN_2FA', '2026-05-26 09:47:33', 0, '2026-05-26 09:37:32'),
(449, 29, '692058', 'LOGIN_2FA', '2026-05-26 09:53:02', 1, '2026-05-26 09:43:01'),
(450, 26, '017084', 'LOGIN_2FA', '2026-05-26 09:56:09', 1, '2026-05-26 09:46:08'),
(451, 25, '719980', 'LOGIN_2FA', '2026-05-26 10:00:30', 0, '2026-05-26 09:50:30'),
(452, 25, '741351', 'LOGIN_2FA', '2026-05-26 10:01:07', 1, '2026-05-26 09:51:07'),
(453, 32, '283997', 'LOGIN_2FA', '2026-05-26 10:01:46', 1, '2026-05-26 09:51:46'),
(454, 27, '478045', 'LOGIN_2FA', '2026-05-26 10:03:46', 1, '2026-05-26 09:53:45'),
(455, 31, '798328', 'LOGIN_2FA', '2026-05-26 10:07:58', 1, '2026-05-26 09:57:58'),
(456, 28, '172761', 'LOGIN_2FA', '2026-05-26 10:14:22', 1, '2026-05-26 10:04:22'),
(457, 15, '487740', 'LOGIN_2FA', '2026-05-28 09:49:16', 1, '2026-05-28 09:39:16'),
(458, 19, '498526', 'PASSWORD_RESET', '2026-05-28 09:49:22', 1, '2026-05-28 09:39:21'),
(459, 19, '460825', 'LOGIN_2FA', '2026-05-28 09:50:03', 1, '2026-05-28 09:40:02'),
(460, 27, '372352', 'LOGIN_2FA', '2026-05-28 10:06:37', 1, '2026-05-28 09:56:37'),
(461, 32, '365782', 'LOGIN_2FA', '2026-05-28 15:06:23', 1, '2026-05-28 14:56:22'),
(462, 25, '580382', 'LOGIN_2FA', '2026-05-28 15:12:57', 1, '2026-05-28 15:02:56'),
(463, 29, '899284', 'LOGIN_2FA', '2026-05-28 15:15:21', 1, '2026-05-28 15:05:21'),
(464, 33, '331860', 'LOGIN_2FA', '2026-05-28 15:17:16', 1, '2026-05-28 15:07:16'),
(465, 31, '887058', 'LOGIN_2FA', '2026-05-28 15:26:59', 1, '2026-05-28 15:16:58'),
(466, 26, '806816', 'LOGIN_2FA', '2026-05-28 15:27:36', 1, '2026-05-28 15:17:35'),
(467, 28, '294190', 'LOGIN_2FA', '2026-05-28 15:27:43', 0, '2026-05-28 15:17:43'),
(468, 28, '380730', 'LOGIN_2FA', '2026-05-28 15:27:47', 0, '2026-05-28 15:17:46'),
(469, 14, '513558', 'PASSWORD_RESET', '2026-05-29 11:45:41', 1, '2026-05-29 11:35:41'),
(470, 14, '100346', 'LOGIN_2FA', '2026-05-29 11:46:53', 1, '2026-05-29 11:36:52'),
(471, 16, '183745', 'LOGIN_2FA', '2026-05-29 11:55:35', 1, '2026-05-29 11:45:35'),
(472, 14, '950350', 'LOGIN_2FA', '2026-05-29 12:04:05', 1, '2026-05-29 11:54:05'),
(473, 14, '328984', 'LOGIN_2FA', '2026-05-29 12:07:07', 1, '2026-05-29 11:57:07'),
(474, 16, '589384', 'LOGIN_2FA', '2026-05-29 12:15:41', 1, '2026-05-29 12:05:40'),
(475, 13, '306327', 'LOGIN_2FA', '2026-05-29 15:45:17', 0, '2026-05-29 15:35:16'),
(476, 13, '699079', 'PASSWORD_RESET', '2026-05-29 15:45:35', 0, '2026-05-29 15:35:35'),
(477, 13, '733825', 'PASSWORD_RESET', '2026-05-29 15:49:05', 1, '2026-05-29 15:39:05'),
(478, 13, '623076', 'LOGIN_2FA', '2026-05-29 15:50:57', 1, '2026-05-29 15:40:57'),
(479, 20, '232755', 'PASSWORD_RESET', '2026-05-30 06:33:17', 1, '2026-05-30 06:23:17'),
(480, 20, '857122', 'LOGIN_2FA', '2026-05-30 06:37:22', 1, '2026-05-30 06:27:21'),
(481, 19, '943890', 'LOGIN_2FA', '2026-05-30 10:21:45', 1, '2026-05-30 10:11:44'),
(482, 15, '637496', 'LOGIN_2FA', '2026-05-30 13:10:29', 1, '2026-05-30 13:00:29'),
(483, 15, '862322', 'LOGIN_2FA', '2026-05-30 13:11:05', 0, '2026-05-30 13:01:05'),
(484, 1, '222283', 'LOGIN_2FA', '2026-05-30 13:11:37', 1, '2026-05-30 13:01:37'),
(485, 19, '264661', 'LOGIN_2FA', '2026-05-30 14:36:15', 1, '2026-05-30 14:26:15'),
(486, 1, '587982', 'LOGIN_2FA', '2026-05-31 12:53:41', 1, '2026-05-31 12:43:41'),
(487, 35, '836249', 'LOGIN_2FA', '2026-05-31 13:07:45', 1, '2026-05-31 12:57:45'),
(488, 15, '205845', 'LOGIN_2FA', '2026-05-31 13:13:29', 1, '2026-05-31 13:03:29'),
(489, 16, '405087', 'LOGIN_2FA', '2026-05-31 21:59:53', 1, '2026-05-31 21:49:52'),
(490, 14, '957754', 'LOGIN_2FA', '2026-05-31 22:03:04', 1, '2026-05-31 21:53:03'),
(491, 1, '498749', 'LOGIN_2FA', '2026-05-31 22:06:55', 1, '2026-05-31 21:56:54'),
(492, 36, '753015', 'LOGIN_2FA', '2026-05-31 22:13:43', 1, '2026-05-31 22:03:43'),
(493, 37, '732828', 'LOGIN_2FA', '2026-05-31 22:38:05', 1, '2026-05-31 22:28:05'),
(494, 15, '149969', 'LOGIN_2FA', '2026-05-31 22:40:58', 1, '2026-05-31 22:30:57'),
(495, 16, '231454', 'LOGIN_2FA', '2026-05-31 22:57:55', 0, '2026-05-31 22:47:55'),
(496, 16, '980019', 'LOGIN_2FA', '2026-05-31 22:58:53', 1, '2026-05-31 22:48:53'),
(497, 1, '233477', 'LOGIN_2FA', '2026-05-31 23:07:49', 1, '2026-05-31 22:57:49'),
(498, 37, '416761', 'LOGIN_2FA', '2026-05-31 23:10:40', 1, '2026-05-31 23:00:39'),
(499, 23, '637134', 'LOGIN_2FA', '2026-06-01 04:10:09', 0, '2026-06-01 04:00:09'),
(500, 23, '266649', 'LOGIN_2FA', '2026-06-01 04:17:02', 1, '2026-06-01 04:07:02'),
(501, 15, '222458', 'LOGIN_2FA', '2026-06-01 07:23:38', 1, '2026-06-01 07:13:38'),
(502, 29, '734390', 'LOGIN_2FA', '2026-06-01 09:55:57', 1, '2026-06-01 09:45:57'),
(503, 34, '350179', 'LOGIN_2FA', '2026-06-01 13:16:11', 1, '2026-06-01 13:06:10'),
(504, 36, '687756', 'PASSWORD_RESET', '2026-06-01 16:49:28', 1, '2026-06-01 16:39:28'),
(505, 36, '562370', 'LOGIN_2FA', '2026-06-01 16:50:32', 1, '2026-06-01 16:40:32'),
(506, 15, '299196', 'LOGIN_2FA', '2026-06-01 16:50:48', 0, '2026-06-01 16:40:48'),
(507, 15, '897057', 'LOGIN_2FA', '2026-06-01 16:52:20', 0, '2026-06-01 16:42:19'),
(508, 15, '341671', 'LOGIN_2FA', '2026-06-01 16:54:02', 1, '2026-06-01 16:44:02'),
(509, 16, '288801', 'LOGIN_2FA', '2026-06-01 17:00:57', 1, '2026-06-01 16:50:56'),
(510, 35, '477264', 'LOGIN_2FA', '2026-06-01 19:23:44', 0, '2026-06-01 19:13:44'),
(511, 35, '731279', 'LOGIN_2FA', '2026-06-01 19:24:17', 1, '2026-06-01 19:14:16'),
(512, 34, '255147', 'LOGIN_2FA', '2026-06-02 07:13:52', 1, '2026-06-02 07:03:52'),
(513, 15, '117813', 'LOGIN_2FA', '2026-06-02 07:19:59', 1, '2026-06-02 07:09:58'),
(514, 30, '334262', 'LOGIN_2FA', '2026-06-02 08:19:41', 1, '2026-06-02 08:09:40'),
(515, 30, '448937', 'LOGIN_2FA', '2026-06-02 08:20:21', 0, '2026-06-02 08:10:21'),
(516, 26, '621760', 'LOGIN_2FA', '2026-06-02 08:25:06', 1, '2026-06-02 08:15:05'),
(517, 34, '527460', 'LOGIN_2FA', '2026-06-02 09:25:24', 1, '2026-06-02 09:15:24'),
(518, 15, '201143', 'LOGIN_2FA', '2026-06-02 09:26:29', 1, '2026-06-02 09:16:29'),
(519, 34, '443790', 'LOGIN_2FA', '2026-06-02 09:28:02', 1, '2026-06-02 09:18:01'),
(520, 27, '525313', 'LOGIN_2FA', '2026-06-02 09:47:51', 1, '2026-06-02 09:37:51'),
(521, 15, '385988', 'LOGIN_2FA', '2026-06-02 09:50:16', 1, '2026-06-02 09:40:15'),
(522, 34, '500906', 'LOGIN_2FA', '2026-06-02 09:51:30', 1, '2026-06-02 09:41:29'),
(523, 29, '121379', 'LOGIN_2FA', '2026-06-02 09:58:04', 1, '2026-06-02 09:48:04'),
(524, 19, '108218', 'LOGIN_2FA', '2026-06-02 10:03:12', 1, '2026-06-02 09:53:12'),
(525, 25, '577903', 'LOGIN_2FA', '2026-06-02 10:22:31', 1, '2026-06-02 10:12:31'),
(526, 31, '876894', 'LOGIN_2FA', '2026-06-02 10:23:02', 1, '2026-06-02 10:13:01'),
(527, 15, '631306', 'LOGIN_2FA', '2026-06-02 10:23:28', 1, '2026-06-02 10:13:27'),
(528, 33, '930959', 'PASSWORD_RESET', '2026-06-02 10:25:01', 1, '2026-06-02 10:15:01'),
(529, 33, '072177', 'LOGIN_2FA', '2026-06-02 10:26:02', 1, '2026-06-02 10:16:01'),
(530, 28, '883859', 'LOGIN_2FA', '2026-06-02 10:30:00', 1, '2026-06-02 10:20:00'),
(531, 32, '939333', 'LOGIN_2FA', '2026-06-02 10:35:24', 1, '2026-06-02 10:25:23'),
(532, 35, '860633', 'LOGIN_2FA', '2026-06-02 13:05:53', 1, '2026-06-02 12:55:52'),
(533, 16, '702330', 'LOGIN_2FA', '2026-06-02 17:41:34', 1, '2026-06-02 17:31:33'),
(534, 37, '093608', 'LOGIN_2FA', '2026-06-02 22:38:28', 1, '2026-06-02 22:28:27'),
(535, 1, '159517', 'LOGIN_2FA', '2026-06-02 22:40:10', 1, '2026-06-02 22:30:10'),
(536, 37, '592339', 'LOGIN_2FA', '2026-06-02 22:43:25', 1, '2026-06-02 22:33:25'),
(537, 16, '685589', 'LOGIN_2FA', '2026-06-02 22:45:19', 1, '2026-06-02 22:35:18'),
(538, 16, '058765', 'LOGIN_2FA', '2026-06-02 23:17:59', 1, '2026-06-02 23:07:58'),
(539, 15, '754652', 'LOGIN_2FA', '2026-06-03 07:26:34', 1, '2026-06-03 07:16:34'),
(540, 30, '104458', 'LOGIN_2FA', '2026-06-03 10:31:46', 1, '2026-06-03 10:21:45'),
(541, 27, '684412', 'LOGIN_2FA', '2026-06-03 12:10:39', 1, '2026-06-03 12:00:38'),
(542, 26, '096597', 'LOGIN_2FA', '2026-06-03 12:11:13', 1, '2026-06-03 12:01:12'),
(543, 1, '698236', 'LOGIN_2FA', '2026-06-03 12:22:58', 1, '2026-06-03 12:12:57'),
(544, 15, '578813', 'LOGIN_2FA', '2026-06-03 12:24:07', 1, '2026-06-03 12:14:06'),
(545, 16, '924313', 'LOGIN_2FA', '2026-06-03 12:28:10', 1, '2026-06-03 12:18:09'),
(546, 32, '437714', 'LOGIN_2FA', '2026-06-03 12:42:30', 1, '2026-06-03 12:32:30'),
(547, 25, '718135', 'LOGIN_2FA', '2026-06-03 12:42:32', 1, '2026-06-03 12:32:32'),
(548, 34, '753869', 'LOGIN_2FA', '2026-06-03 13:04:29', 1, '2026-06-03 12:54:28'),
(549, 19, '871864', 'LOGIN_2FA', '2026-06-03 13:10:05', 1, '2026-06-03 13:00:05'),
(550, 19, '976737', 'LOGIN_2FA', '2026-06-03 13:10:37', 1, '2026-06-03 13:00:37'),
(551, 31, '246522', 'LOGIN_2FA', '2026-06-03 13:33:44', 0, '2026-06-03 13:23:44'),
(552, 31, '321469', 'LOGIN_2FA', '2026-06-03 13:33:58', 1, '2026-06-03 13:23:57'),
(553, 28, '689777', 'LOGIN_2FA', '2026-06-03 13:49:48', 1, '2026-06-03 13:39:48'),
(554, 33, '517095', 'PASSWORD_RESET', '2026-06-03 16:21:44', 1, '2026-06-03 16:11:44'),
(555, 33, '572907', 'LOGIN_2FA', '2026-06-03 16:22:51', 1, '2026-06-03 16:12:51'),
(556, 23, '022959', 'LOGIN_2FA', '2026-06-04 07:13:36', 1, '2026-06-04 07:03:36'),
(557, 23, '462226', 'LOGIN_2FA', '2026-06-04 07:15:29', 1, '2026-06-04 07:05:28'),
(558, 29, '703630', 'LOGIN_2FA', '2026-06-04 09:23:59', 1, '2026-06-04 09:13:59'),
(559, 1, '938404', 'LOGIN_2FA', '2026-06-04 11:04:30', 1, '2026-06-04 10:54:30');

-- --------------------------------------------------------

--
-- Table structure for table `Parenting`
--

CREATE TABLE `Parenting` (
  `parenting_id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `parent_id` bigint NOT NULL,
  `relationship` varchar(50) DEFAULT 'PARENT',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Permission`
--

CREATE TABLE `Permission` (
  `perm_id` bigint NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Permission`
--

INSERT INTO `Permission` (`perm_id`, `name`, `description`, `status`) VALUES
(1, 'MANAGE_USERS', 'Create, update, deactivate users', 'ACTIVE'),
(2, 'MANAGE_ROLES', 'Manage roles and permissions', 'ACTIVE'),
(3, 'MANAGE_ACADEMICS', 'Manage academic structures', 'ACTIVE'),
(4, 'MANAGE_CLASSES', 'Manage classes and groups', 'ACTIVE'),
(5, 'MARK_ATTENDANCE', 'Mark student attendance', 'ACTIVE'),
(6, 'VIEW_ATTENDANCE', 'View attendance', 'ACTIVE'),
(7, 'ENTER_MARKS', 'Enter assessment marks', 'ACTIVE'),
(8, 'VIEW_RESULTS', 'View exam results', 'ACTIVE'),
(9, 'MANAGE_FEES', 'Manage fee structures and payments', 'ACTIVE'),
(10, 'VIEW_FINANCE', 'View finance reports', 'ACTIVE'),
(11, 'SEND_ANNOUNCEMENTS', 'Publish announcements', 'ACTIVE'),
(12, 'UPLOAD_DOCUMENTS', 'Upload documents', 'ACTIVE'),
(13, 'SUPER_ADMIN_DASHBOARD', 'Permission for super admin dashboard access with overall system overview', 'ACTIVE'),
(14, 'VIEW_MY_ASSIGNED_SUBJECTS', 'Permission for teachers to view their assigned subjects, grades, and enrolled students', 'ACTIVE'),
(15, 'TEACHER_DASHBOARD', 'Permission for teachers to access their personalized dashboard with relevant information and summaries', 'ACTIVE'),
(16, 'VIEW_PROGRAM_USERS', 'Can view users assigned to programs they lead', 'ACTIVE'),
(17, 'VIEW_PROGRAM_ACADEMICS', 'Can view academic details for programs they are assigned to', 'ACTIVE'),
(18, 'ENABLE_DISABLE_USERS', 'Can enable or disable user accounts', 'ACTIVE'),
(19, 'CHANGE_USER_ROLES', 'Can change user roles and assign roles to users', 'ACTIVE'),
(20, 'MANAGE_PROGRAM_LEADS', 'Can assign and remove program leads', 'ACTIVE'),
(21, 'ASSIGN_TEACHER_SUBJECTS', 'Can assign and remove subjects from teachers', 'ACTIVE'),
(22, 'MANAGE_STUDENT_ENROLLMENTS', 'Can enroll and unenroll students from subjects', 'ACTIVE'),
(23, 'ASSIGN_STUDENT_CLASS_GROUPS', 'Can assign and remove students from class groups', 'ACTIVE'),
(24, 'ASSIGN_GRADE_TO_CLASS_TEACHER', 'Can assign and remove grades from class teachers', 'ACTIVE'),
(25, 'VIEW_USERS_BY_CLASS_TEACHER_GRADE', 'Can view users assigned to grades that the logged user is assigned to', 'ACTIVE'),
(26, 'VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE', 'Can view subjects in grades that the logged user is assigned to', 'ACTIVE'),
(27, 'ACCESS_REPORT_CARD_MODULE', 'Permission to access the report card module', 'ACTIVE'),
(28, 'UPDATE_USER_PROFILE_INFO', 'Update User Profile Information', 'ACTIVE'),
(29, 'MANAGE_SCHOOLS', 'Permission to manage schools/tenants', 'ACTIVE'),
(30, 'MANAGE_SYSTEMS', 'Permission to manage systems/modules', 'ACTIVE'),
(31, 'ASSIGN_SCHOOL_SYSTEMS', 'Permission to assign systems to schools and roles', 'ACTIVE'),
(32, 'MANAGE_SSO_CLIENTS', 'Manage SSO client applications and their callback URIs', 'ACTIVE'),
(33, 'MANAGE_ACADEMIC_CALENDAR', 'Can create, update, and delete calendar slots and activities', 'ACTIVE'),
(34, 'VIEW_ACADEMIC_CALENDAR', 'Can view the academic calendar', 'ACTIVE'),
(35, 'MANAGE_CALENDAR_NOTIFICATIONS', 'Can manage notification preferences for calendar', 'ACTIVE'),
(36, 'VIEW_CALENDAR_NOTIFICATIONS', 'Can view notification preferences', 'ACTIVE'),
(37, 'VIEW_MY_CALENDAR', 'Can view personal calendar with assigned subjects', 'ACTIVE'),
(38, 'VIEW_LESSON_PLANS', 'Can view lesson plans from calendar', 'ACTIVE'),
(39, 'VIEW_STUDENT_CALENDAR', 'Student can view their enrolled subjects calendar', 'ACTIVE'),
(40, 'VIEW_CALENDAR_SUBJECT_LESSON_PLAN', 'View full details of a course lesson plan from the academic calendar', 'ACTIVE'),
(41, 'STUDENT_VIEW_LESSON_PLAN_SUMMARY', 'View a summary (title and big question) of a course lesson plan', 'ACTIVE'),
(42, 'CREATE_ACADEMIC_CALENDAR', 'Can create new academic calendars for a class group', 'ACTIVE'),
(43, 'UPDATE_CALENDAR_SLOT', 'Can create and update calendar slot details (subject/teacher/time)', 'ACTIVE'),
(44, 'VIEW_ALL_LOGS_HISTORY', 'Permission to view all system activity logs history', 'ACTIVE'),
(45, 'VALIDATE_SCHEME_OF_WORK', 'Allows users to approve or reject schemes of work', 'ACTIVE'),
(46, 'VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST', 'VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST', 'ACTIVE'),
(47, 'SUBMIT_REPORTING', 'SUBMIT_REPORTING', 'ACTIVE'),
(48, 'ALL_SUBMITTED_REPORTS', 'ALL_SUBMITTED_REPORTS', 'ACTIVE'),
(49, 'MANAGE_CURRICULUM', 'Create/edit/delete competencies, criteria, and document categories', 'ACTIVE'),
(50, 'UPLOAD_SUBJECT_DOCUMENTS', 'Upload/delete documents in subject material categories', 'ACTIVE');

-- --------------------------------------------------------

--
-- Table structure for table `Program`
--

CREATE TABLE `Program` (
  `program_id` bigint NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Program`
--

INSERT INTO `Program` (`program_id`, `name`, `description`) VALUES
(5, 'Nursery Program', NULL),
(6, 'Primary Program', NULL),
(7, 'Lower Secondary Program', NULL),
(8, 'Coding Academy', NULL),
(9, 'IGCSE', 'International General Certificate of Secondary Education'),
(10, 'Advanced Level', NULL),
(11, 'O Level', 'Advanced Subsidiary');

-- --------------------------------------------------------

--
-- Table structure for table `ReportLesson`
--

CREATE TABLE `ReportLesson` (
  `lesson_report_id` bigint NOT NULL,
  `report_id` bigint NOT NULL,
  `lesson_title` varchar(255) DEFAULT NULL,
  `planned` tinyint DEFAULT '1',
  `delivered` tinyint DEFAULT '1',
  `notes` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `ReportLesson`
--

INSERT INTO `ReportLesson` (`lesson_report_id`, `report_id`, `lesson_title`, `planned`, `delivered`, `notes`) VALUES
(1, 39, '', 1, 1, 'Good'),
(2, 40, '', 1, 1, 'Good'),
(5, 41, 'Mid term exam preparation ', 1, 1, '');

-- --------------------------------------------------------

--
-- Table structure for table `ReportProjectUpdate`
--

CREATE TABLE `ReportProjectUpdate` (
  `project_update_id` bigint NOT NULL,
  `report_id` bigint DEFAULT NULL,
  `user_id` bigint DEFAULT NULL,
  `project_name` varchar(255) DEFAULT NULL,
  `role` varchar(100) DEFAULT NULL,
  `work_completed` text,
  `status` enum('ON_TRACK','AT_RISK','DELAYED','COMPLETE') DEFAULT 'ON_TRACK',
  `key_outputs` text,
  `challenges` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `ReportProjectUpdate`
--

INSERT INTO `ReportProjectUpdate` (`project_update_id`, `report_id`, `user_id`, `project_name`, `role`, `work_completed`, `status`, `key_outputs`, `challenges`) VALUES
(2, 2, 13, 'Mbanira Project', '', 'Store management and catalog', 'ON_TRACK', NULL, NULL),
(3, 1, 15, 'NGA MIS', '', 'Development activities focused on the reporting and monitoring features of the Management Information System (MIS), encompassing instructor-facing submission tools, coordinator dashboards, scheme of work management, and validation workflows.', 'ON_TRACK', NULL, NULL),
(4, 3, 14, 'RTB GIS', '', 'Files Management on AWS, RTB colors adjustement, Photo working load Handling, Interface Proffessinal Looking', 'ON_TRACK', NULL, NULL),
(5, 5, 15, 'RTB GIS Project', '', 'Re-analysis and development of RTB GIS management system', 'ON_TRACK', NULL, NULL),
(6, 6, 15, 'RTB GIS Project', '', 'Initiated RTB GIS Project, analysis, and design', 'ON_TRACK', NULL, NULL),
(7, 7, 15, 'RTB GIS Project', '', 'Worked with the team on the RTB GIS project to integrate school geolocation', 'ON_TRACK', NULL, NULL),
(8, 8, 15, 'RTB GIS Project', '', 'Presentation of RTB GIS Project, and worked on feedback collection and analysis', 'ON_TRACK', NULL, NULL),
(9, 9, 15, 'RTB GIS Project', '', 'Analyis of new proposed RTB GIS Project architecture based on previous presentation', 'ON_TRACK', NULL, NULL),
(10, 11, 15, 'MGA MIS', '', 'Meeting with the team about analysis based on MIS Reporting form and revealed that it should be categorized based on nature of job done', 'ON_TRACK', NULL, NULL),
(11, 13, 13, 'Mbanira Project', '', 'Fixed comments provided on the Mbanira Project, specifically on the dashboard and translations.', 'ON_TRACK', NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `ReportReflection`
--

CREATE TABLE `ReportReflection` (
  `reflection_id` bigint NOT NULL,
  `report_id` bigint NOT NULL,
  `what_worked_well` text,
  `improvement_areas` text,
  `academic_support_needed` text,
  `technical_support_needed` text,
  `infrastructure_support_needed` text,
  `coordination_support_needed` text
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `ReportReflection`
--

INSERT INTO `ReportReflection` (`reflection_id`, `report_id`, `what_worked_well`, `improvement_areas`, `academic_support_needed`, `technical_support_needed`, `infrastructure_support_needed`, `coordination_support_needed`) VALUES
(2, 2, '', '', '', '', '', ''),
(3, 1, 'n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a'),
(4, 3, 'all', '', '', '', '', ''),
(6, 5, 'Successfully developed final database and new architecture of the system - RTB GIS', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'),
(7, 6, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'),
(8, 7, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'),
(9, 8, 'N/A', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'),
(10, 9, 'Analyis of new proposed RTB GIS Project architecture based on previous presentation', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'),
(11, 10, 'Supervisor of exams', '', '', '', '', ''),
(12, 11, 'Meeting with the team about analysis based on MIS Reporting form and revealed that it should be categorized based on nature of job done', 'N/A', 'N/A', 'N/A', 'N/A', 'N/A'),
(13, 4, '', '', '', '', '', ''),
(14, 12, '', '', '', '', '', ''),
(15, 13, '', '', '', '', '', ''),
(16, 25, 'The students\' focus was high.', '', '', '', '', ''),
(17, 29, 'Discussion', '', '', '', '', ''),
(18, 30, '', '', '', '', '', ''),
(19, 31, '', '', '', '', '', ''),
(20, 32, '', '', '', '', '', ''),
(21, 33, '', '', '', '', '', ''),
(22, 34, '', '', '', '', '', ''),
(23, 35, '', '', '', '', '', ''),
(24, 36, '', '', '', '', '', ''),
(25, 37, '', '', '', '', '', ''),
(26, 38, '', '', '', '', '', ''),
(27, 39, '', '', '', '', '', ''),
(28, 40, '', '', '', '', '', ''),
(31, 41, 'The students were well prepared and ready, which resulted in positive outcomes, and the day ended successfully as planned.', 'Students need to organize the classroom and learning materials properly. In addition, having a dedicated printer instead of a shared one would improve overall progress, as sharing sometimes causes delays and affects workflow efficiency.', 'Due to the Wednesday holiday, the Computer Basics Mid-Term Exam was affected. Therefore, an alternative arrangement is needed so that the exam can be conducted next week. Otherwise, all other activities went well as planned.', 'every thing was quite good', 'Quite good', 'Quite good'),
(32, 42, '', '', '', '', '', ''),
(33, 43, 'The lesson was delivered and the objectives were achieved', '', '', '', '', ''),
(34, 44, 'The exam was done according to the planned time', '', '', '', '', ''),
(35, 45, 'a summary of the course was given and students recorded it in their books, exercises solved, and a simulated sample exam was provided ', '', '', '', '', '');

-- --------------------------------------------------------

--
-- Table structure for table `ReportTopic`
--

CREATE TABLE `ReportTopic` (
  `topic_report_id` bigint NOT NULL,
  `report_id` bigint NOT NULL,
  `topic_name` text,
  `is_planned_for_next_week` tinyint DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `ReportTopic`
--

INSERT INTO `ReportTopic` (`topic_report_id`, `report_id`, `topic_name`, `is_planned_for_next_week`) VALUES
(1, 14, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(2, 15, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(3, 16, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(4, 17, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(5, 18, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(6, 19, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(7, 20, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(8, 21, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(9, 22, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(10, 23, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(11, 24, 'EMBEDDED SYSTEM HARDWARE DESIGN/ Digital Logic AND Memory', 0),
(12, 25, 'Review exercise', 0),
(13, 26, 'Cheating Issue!', 0),
(14, 27, 'Cheating Issue!', 0),
(15, 28, 'Cheating Issue!', 0),
(22, 41, 'Prepare exam recap for both computer basics and fundementals of C languages ', 0),
(23, 41, 'Done with Mid Term exam with fundementals of C ', 0),
(24, 41, 'work on final configuration of AWS via payment method ', 0),
(25, 43, 'Applied Physics I/ Electromagnetic induction', 0),
(26, 45, 'Applied Physics I/ Magnetic effects(Magnetism, magnetic field lines, magnetic force on moving charge, magnetic force on current, magnetic field created by current, applications of magnetic force, faraday\'s law)', 0);

-- --------------------------------------------------------

--
-- Table structure for table `Role`
--

CREATE TABLE `Role` (
  `role_id` bigint NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Role`
--

INSERT INTO `Role` (`role_id`, `name`, `description`, `status`) VALUES
(1, 'SUPER_ADMIN', 'Full system control', 'ACTIVE'),
(2, 'ADMIN', 'School management', 'ACTIVE'),
(3, 'HEAD_TEACHER', 'Academic oversight', 'ACTIVE'),
(4, 'TEACHER', 'Teaching staff', 'ACTIVE'),
(5, 'ACCOUNTANT', 'Finance management', 'ACTIVE'),
(6, 'STUDENT', 'Learner', 'ACTIVE'),
(7, 'PARENT', 'Parent/Guardian', 'ACTIVE'),
(8, 'STAFF', 'Support staff', 'ACTIVE'),
(11, 'CLASS_TEACHER', 'Someone who is leading a class', 'ACTIVE'),
(12, 'PROGRAM_MANAGER', 'Program Project Manager', 'ACTIVE');

-- --------------------------------------------------------

--
-- Table structure for table `RolePermission`
--

CREATE TABLE `RolePermission` (
  `role_id` bigint NOT NULL,
  `perm_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `RolePermission`
--

INSERT INTO `RolePermission` (`role_id`, `perm_id`) VALUES
(1, 1),
(2, 1),
(1, 2),
(2, 2),
(1, 3),
(2, 3),
(3, 3),
(11, 3),
(1, 4),
(2, 4),
(3, 4),
(1, 5),
(4, 5),
(1, 6),
(3, 6),
(4, 6),
(6, 6),
(7, 6),
(8, 6),
(1, 7),
(4, 7),
(1, 8),
(3, 8),
(4, 8),
(6, 8),
(7, 8),
(1, 9),
(2, 9),
(5, 9),
(1, 10),
(2, 10),
(5, 10),
(1, 11),
(2, 11),
(3, 11),
(1, 12),
(2, 12),
(1, 13),
(4, 14),
(11, 14),
(4, 15),
(12, 16),
(12, 17),
(1, 18),
(1, 19),
(1, 20),
(1, 21),
(1, 22),
(1, 23),
(1, 24),
(11, 25),
(11, 26),
(1, 27),
(2, 27),
(4, 27),
(11, 27),
(12, 27),
(1, 28),
(11, 28),
(1, 29),
(2, 29),
(1, 30),
(2, 30),
(1, 31),
(2, 31),
(1, 33),
(2, 33),
(11, 33),
(12, 33),
(1, 34),
(3, 34),
(11, 34),
(12, 34),
(11, 35),
(12, 35),
(12, 36),
(4, 37),
(11, 37),
(2, 38),
(4, 38),
(11, 38),
(12, 38),
(6, 39),
(1, 40),
(2, 40),
(4, 40),
(11, 40),
(12, 40),
(6, 41),
(1, 42),
(1, 43),
(11, 43),
(1, 44),
(1, 45),
(12, 45),
(1, 46),
(11, 46),
(12, 46),
(4, 47),
(1, 48),
(12, 48),
(1, 49),
(4, 49),
(1, 50),
(4, 50);

-- --------------------------------------------------------

--
-- Table structure for table `RoleSystemFragment`
--

CREATE TABLE `RoleSystemFragment` (
  `fragment_id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `role_id` bigint NOT NULL,
  `system_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `RoleSystemFragment`
--

INSERT INTO `RoleSystemFragment` (`fragment_id`, `school_id`, `role_id`, `system_id`, `assigned_at`) VALUES
(1, 1, 1, 1, '2026-01-26 10:17:48'),
(2, 1, 4, 1, '2026-01-27 09:33:06'),
(3, 1, 6, 1, '2026-01-27 09:33:20'),
(4, 1, 1, 3, '2026-05-30 13:07:37'),
(5, 1, 4, 3, '2026-05-30 13:07:51'),
(6, 1, 6, 3, '2026-05-30 13:07:59'),
(7, 1, 11, 3, '2026-05-30 13:08:08'),
(8, 1, 12, 3, '2026-05-30 13:08:18');

-- --------------------------------------------------------

--
-- Table structure for table `SchemeOfWork`
--

CREATE TABLE `SchemeOfWork` (
  `scheme_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `class_group_id` bigint NOT NULL,
  `academic_term_id` bigint NOT NULL,
  `validation_status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `validation_comment` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `SchemeOfWork`
--

INSERT INTO `SchemeOfWork` (`scheme_id`, `user_id`, `subject_id`, `class_group_id`, `academic_term_id`, `validation_status`, `validation_comment`, `created_at`, `updated_at`) VALUES
(1, 15, 8, 9, 4, 'PENDING', NULL, '2026-02-19 13:49:24', '2026-02-19 13:49:24'),
(2, 15, 9, 9, 4, 'PENDING', NULL, '2026-03-01 14:03:47', '2026-03-01 14:03:47');

-- --------------------------------------------------------

--
-- Table structure for table `SchemeOfWorkEntry`
--

CREATE TABLE `SchemeOfWorkEntry` (
  `entry_id` bigint NOT NULL,
  `scheme_id` bigint NOT NULL,
  `week_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `topic` text COLLATE utf8mb4_unicode_ci,
  `sub_topic` text COLLATE utf8mb4_unicode_ci,
  `objective` text COLLATE utf8mb4_unicode_ci,
  `methodology` text COLLATE utf8mb4_unicode_ci,
  `resources` text COLLATE utf8mb4_unicode_ci,
  `evaluation` text COLLATE utf8mb4_unicode_ci,
  `duration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `learning_place` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observation` text COLLATE utf8mb4_unicode_ci,
  `is_completed` tinyint DEFAULT '0',
  `validation_status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `validation_comment` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `SchemeOfWorkEntry`
--

INSERT INTO `SchemeOfWorkEntry` (`entry_id`, `scheme_id`, `week_number`, `start_date`, `end_date`, `topic`, `sub_topic`, `objective`, `methodology`, `resources`, `evaluation`, `duration`, `learning_place`, `observation`, `is_completed`, `validation_status`, `validation_comment`, `created_at`) VALUES
(1, 1, 'Week 1', '2026-01-05', '2026-01-09', 'a. Responsive design Viewport Box-sizing Media Query Breaking point Mobile first design b. Description of CSS Frameworks c. Use the Bootstrap framework. Bootstrap Grid system Containers Columns Rows Bootstrap Layout Jumbotron Tabs Carousel', '', 'Learning outcome 2: Implement responsive design and use CSS frameworks', 'Individual and Trainer guided', 'Black/white board, Computer, projector', 'Back to School Quiz: Quiz 1 on the 8th', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(2, 1, 'Week 2', '2026-01-12', '2026-01-16', 'Navbar Scrollspy Font awesome icons Bootstrap Forms Styling Form validation Progress Bootstrap utilities Styling borders Colors Display Context classes Spacing with Margins and padding Floating Flexbox Position', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Group Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(3, 1, 'Week 3', '2026-01-19', '2026-01-23', 'Progress Bootstrap utilities Text alignment and transformation Sizing with width and height Lists Table', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Quiz', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(4, 1, 'Week 4', '2026-01-26', '2026-01-30', 'Use Tailwind CSS Responsive design Breakpoints and media queries Container Typography Backgrounds Borders Columns Box sizing Display Position Use Tailwind CSS Floats Flexbox &amp; Grid Spacing Sizing Table Forms', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(5, 1, 'Week 5', '2026-02-02', '2026-02-06', 'Gather and organize the website contents Defining web contents Define the website mock-up Define types of contents Creating directories Create directories Create sub directories Differentiate Contents according to their types Images Videos Music Types of web pages (News, Entertainment, Business, etc) Create / Develop Contents', '', 'Learning outcome 3: Design a website', 'Group work and Group discussion', 'Black/white board, Computer, projector, Reference books', 'Group Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(6, 1, 'Week 6', '2026-02-09', '2026-02-13', 'Implement web links Creating Links Relative Link Absolute Link HTML Multimedia mp3 mpg mp4 avi webm QuickTime Flash Embedding media Files Videos Music', '', '', 'Individual work, and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Quiz', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(7, 1, 'Week 7', '2026-02-16', '2026-02-20', 'Midterm / Holidays', '', 'Midterm', '', '', '', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(8, 1, 'Week 8', '2026-02-23', '2026-02-27', 'Manage a website Deploy a developed website HTTP Protocol Introduction to http protocol Understanding HTTP Basics Introduction to webserver What is a webserver How webserver works Different type of webservers Install Apache2 Deploy the web content Move content to root folder Accessing the website.', '', '', 'Group work, Trainer guided, and Group discussion', 'Black/white board, Computer, projector, Reference books', 'Individual Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(9, 1, 'Week 9', '2026-03-02', '2026-03-06', 'Optimize a web page for search engines, Ways to optimize the website Sitemap Key works (HTML element) Webmaster Description Page structure Google site verification', '', '', 'Individual work, and Trainer guided', 'Individual Quiz', '', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(10, 1, 'Week 10', '2026-03-09', '2026-03-13', 'Maintain a website Website update Update website Content Feature Addition Maintenance tasks Backup a website Monitor a website Link Check Software update', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Quiz', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(11, 1, 'Week 11', '2026-03-16', '2026-03-20', 'Review', '', '', 'Individual and group work, Trainer guided, Group discussion', 'Projector, Computer, Notebook, Whiteboard, Markers, Printed Exam papers', 'Mock Exam', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(12, 1, 'Week 12', '2026-03-23', '2026-03-27', 'Finals week', '', '', '', 'Exam papers, Scratch papers, Markers, clock', 'End of term II exam', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(13, 1, 'Week 13', '2026-03-30', '2026-04-03', 'Grading and packing', '', '', '', '', '', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-02-19 13:49:25'),
(14, 2, 'Week 1', '2026-01-05', '2026-01-09', 'a. Responsive design Viewport Box-sizing Media Query Breaking point Mobile first design b. Description of CSS Frameworks c. Use the Bootstrap framework. Bootstrap Grid system Containers Columns Rows Bootstrap Layout Jumbotron Tabs Carousel', '', 'Learning outcome 2: Implement responsive design and use CSS frameworks', 'Individual and Trainer guided', 'Black/white board, Computer, projector', 'Back to School Quiz: Quiz 1 on the 8th', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(15, 2, 'Week 2', '2026-01-12', '2026-01-16', 'Navbar Scrollspy Font awesome icons Bootstrap Forms Styling Form validation Progress Bootstrap utilities Styling borders Colors Display Context classes Spacing with Margins and padding Floating Flexbox Position', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Group Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(16, 2, 'Week 3', '2026-01-19', '2026-01-23', 'Progress Bootstrap utilities Text alignment and transformation Sizing with width and height Lists Table', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Quiz', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(17, 2, 'Week 4', '2026-01-26', '2026-01-30', 'Use Tailwind CSS Responsive design Breakpoints and media queries Container Typography Backgrounds Borders Columns Box sizing Display Position Use Tailwind CSS Floats Flexbox &amp; Grid Spacing Sizing Table Forms', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(18, 2, 'Week 5', '2026-02-02', '2026-02-06', 'Gather and organize the website contents Defining web contents Define the website mock-up Define types of contents Creating directories Create directories Create sub directories Differentiate Contents according to their types Images Videos Music Types of web pages (News, Entertainment, Business, etc) Create / Develop Contents', '', 'Learning outcome 3: Design a website', 'Group work and Group discussion', 'Black/white board, Computer, projector, Reference books', 'Group Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(19, 2, 'Week 6', '2026-02-09', '2026-02-13', 'Implement web links Creating Links Relative Link Absolute Link HTML Multimedia mp3 mpg mp4 avi webm QuickTime Flash Embedding media Files Videos Music', '', '', 'Individual work, and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Quiz', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(20, 2, 'Week 7', '2026-02-16', '2026-02-20', 'Midterm / Holidays', '', 'Midterm', '', '', '', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(21, 2, 'Week 8', '2026-02-23', '2026-02-27', 'Manage a website Deploy a developed website HTTP Protocol Introduction to http protocol Understanding HTTP Basics Introduction to webserver What is a webserver How webserver works Different type of webservers Install Apache2 Deploy the web content Move content to root folder Accessing the website.', '', '', 'Group work, Trainer guided, and Group discussion', 'Black/white board, Computer, projector, Reference books', 'Individual Homework', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:47'),
(22, 2, 'Week 9', '2026-03-02', '2026-03-06', 'Optimize a web page for search engines, Ways to optimize the website Sitemap Key works (HTML element) Webmaster Description Page structure Google site verification', '', '', 'Individual work, and Trainer guided', 'Individual Quiz', '', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:48'),
(23, 2, 'Week 10', '2026-03-09', '2026-03-13', 'Maintain a website Website update Update website Content Feature Addition Maintenance tasks Backup a website Monitor a website Link Check Software update', '', '', 'Individual and Trainer guided', 'Black/white board, Computer, projector, Reference books', 'Individual Quiz', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:48'),
(24, 2, 'Week 11', '2026-03-16', '2026-03-20', 'Review', '', '', 'Individual and group work, Trainer guided, Group discussion', 'Projector, Computer, Notebook, Whiteboard, Markers, Printed Exam papers', 'Mock Exam', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:48'),
(25, 2, 'Week 12', '2026-03-23', '2026-03-27', 'Finals week', '', '', '', 'Exam papers, Scratch papers, Markers, clock', 'End of term II exam', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:48'),
(26, 2, 'Week 13', '2026-03-30', '2026-04-03', 'Grading and packing', '', '', '', '', '', NULL, NULL, NULL, 0, 'PENDING', NULL, '2026-03-01 14:03:48');

-- --------------------------------------------------------

--
-- Table structure for table `School`
--

CREATE TABLE `School` (
  `school_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `contact_email` varchar(150) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `logo` varchar(500) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','SUSPENDED') DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `School`
--

INSERT INTO `School` (`school_id`, `name`, `address`, `contact_email`, `contact_phone`, `logo`, `status`, `created_at`, `updated_at`) VALUES
(1, 'New Generation Academy', 'Kimihurura', 'info@nga.ac.rw', '+250782634364', 'https://nga.ac.rw/mis/assets/logo-CS5kgjNA.png', 'ACTIVE', '2026-01-26 10:17:25', '2026-01-26 10:17:25');

-- --------------------------------------------------------

--
-- Table structure for table `SchoolSystemAssignment`
--

CREATE TABLE `SchoolSystemAssignment` (
  `school_id` bigint NOT NULL,
  `system_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `SchoolSystemAssignment`
--

INSERT INTO `SchoolSystemAssignment` (`school_id`, `system_id`, `assigned_at`, `status`) VALUES
(1, 1, '2026-01-26 10:17:37', 'ACTIVE'),
(1, 2, '2026-05-30 13:06:54', 'ACTIVE'),
(1, 3, '2026-05-30 13:06:51', 'ACTIVE');

-- --------------------------------------------------------

--
-- Table structure for table `SSOCode`
--

CREATE TABLE `SSOCode` (
  `code_id` bigint NOT NULL,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint NOT NULL,
  `system_id` bigint NOT NULL,
  `expires_at` datetime NOT NULL,
  `is_used` tinyint DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `SSOCode`
--

INSERT INTO `SSOCode` (`code_id`, `code`, `user_id`, `system_id`, `expires_at`, `is_used`, `created_at`) VALUES
(1, 'ddb62d6b2c575addc03c8afe9002286df4ef39460a81928da6ee5b1eb6261188', 1, 1, '2026-01-25 12:19:40', 0, '2026-01-25 12:18:39'),
(2, 'cf2479377ebe34efed2e6f50ce938c32022eb5fcb35e4c81304ebfa9f258ee4d', 1, 1, '2026-01-25 12:39:39', 0, '2026-01-25 12:38:39'),
(3, '19ae7ef49c6afc6a1374b678dd503f593081bb407ea3dd4e8bd6ab73f2b573bb', 1, 1, '2026-01-25 12:43:39', 1, '2026-01-25 12:42:38'),
(4, 'd6f1462899ec892726cd2f45144706b26c124b904b863dad0b311722e79eacc7', 1, 1, '2026-01-25 12:55:02', 1, '2026-01-25 12:54:01'),
(5, 'aca23d7169a332229e9625303f1562c2ceed97d51966b1d5a9a854b2200c1e16', 15, 1, '2026-01-25 12:58:26', 1, '2026-01-25 12:57:26'),
(6, '99ff7e83d66d7f89e4ccf6367ac099b7f67e1c120c4f4249deb80d5978d9f3a9', 15, 1, '2026-01-25 13:06:32', 1, '2026-01-25 13:05:32'),
(7, '122dd2dee983bc0c53ee0ce0832181a5e2e72c0c7cce4426278396e11cf63331', 15, 1, '2026-01-25 13:07:08', 1, '2026-01-25 13:06:07'),
(8, 'b7b4911f4c6590f0cc60b04e12ef9814e0324f449ff00335be306c610c281f73', 15, 1, '2026-01-25 14:19:01', 1, '2026-01-25 14:18:00'),
(9, '6b191f403a4a340c8993a5481fd38e1dbabbf99f06d5685246e91ff1ea461cd8', 15, 1, '2026-01-25 14:19:27', 1, '2026-01-25 14:18:27'),
(10, '8920f1a1913b95843bcb29f694998fb06822a737848f47697b653bdf55e5c03e', 15, 1, '2026-01-25 14:24:49', 1, '2026-01-25 14:23:49'),
(11, '723d5e292e5415010d85f2b0e7364698ab6f6e3966437feb4a0f7e395bf2cb79', 15, 1, '2026-01-25 14:27:29', 1, '2026-01-25 14:26:29'),
(12, 'a4ce91b1211021d1c111dc5258038054c1f8516a51cb7592bf4451f7009dc7b2', 15, 1, '2026-01-25 14:30:12', 1, '2026-01-25 14:29:11'),
(13, '86c75efd3c36d15a4f6b238a4816a0677cb0063975c115d438e683fe53885be7', 15, 1, '2026-01-25 14:34:32', 1, '2026-01-25 14:33:31'),
(14, '9d1a302cd1d016a8e08e4f324d11f2915dfe9806356a3c435799fbdf379a474a', 15, 1, '2026-01-25 14:36:40', 1, '2026-01-25 14:35:39'),
(15, 'bb360ea9705c758db5c5509dd48af214af1bf3df74de1ca9ba5e53792ffd5a2b', 15, 1, '2026-01-25 14:38:31', 1, '2026-01-25 14:37:31'),
(16, '502800704105d93e43f1668db1c44863b34d9cd59f755ab6676ccb837561fc1d', 15, 1, '2026-01-25 14:40:44', 1, '2026-01-25 14:39:44'),
(17, 'e82e3765ab21aba29ed91e6f49ba363e867b089cc195a98b6080990560caded8', 1, 1, '2026-01-25 15:15:28', 1, '2026-01-25 15:14:28'),
(18, '0821cd1d939eccd61acc73dca035c2af8bb1c4191dbaf11b4c049b5b9cedd235', 15, 1, '2026-01-26 09:59:44', 1, '2026-01-26 09:58:43'),
(19, '30afaf444e02b24ea440a2c5ccd5c0b2f4b451aa01ac92c1e5db76df8981c21a', 1, 1, '2026-01-26 10:32:32', 1, '2026-01-26 10:31:31'),
(20, 'cdc0a88a7ad37e6f4be754a4bc4cc168c290f4a9eea81495404b4436d1d38a89', 1, 1, '2026-01-26 10:33:33', 1, '2026-01-26 10:32:32'),
(21, '6387a2f9234b5d9f3aed70754be79a7390380fc5e10b175b2ab0fdc67ffbad2a', 15, 1, '2026-01-26 11:40:09', 1, '2026-01-26 11:39:08'),
(22, 'c69b2feed0c6d202953b22af488a2bb6433bfa04035ae9aaaf9219fc7e8fcd11', 15, 1, '2026-01-26 11:46:41', 1, '2026-01-26 11:45:40'),
(23, 'd936ec3ed2f6b8e003b79995ac2b187e6f29db80e6b30ae6658152b369c5f15b', 13, 1, '2026-01-26 16:00:30', 1, '2026-01-26 15:59:29'),
(24, 'ea6c166c86f9f0d326f7116270b184b6e45c8260ea02fe0542c5575e045369bf', 13, 1, '2026-01-26 16:05:04', 1, '2026-01-26 16:04:03'),
(25, '0d29df3e1e52fb8631b43472c5a8cbc0b060213fb0ed8b771015c43c1f30f87d', 1, 1, '2026-01-26 16:17:51', 1, '2026-01-26 16:16:51'),
(26, 'df5d4c26158cc0f410ecd22ab9e82f6a10a2e001c86e5bd455225c00e9ae7d14', 13, 1, '2026-01-26 16:35:03', 1, '2026-01-26 16:34:03'),
(27, '718581eb9c3ff01f0aa2c31bb9a0b14afde587dfccdb0d43ff02966b71ab1f77', 13, 1, '2026-01-26 16:37:05', 1, '2026-01-26 16:36:04'),
(28, 'bde68eceadb2c550231e0e997572114bb267c45d93f1e48fc14979c336d26481', 1, 1, '2026-01-26 16:43:56', 1, '2026-01-26 16:42:56'),
(29, 'f1b29d97976109ec15a978116cc838356e1a346267335677bc295296f9a2ba74', 1, 1, '2026-01-26 16:44:15', 1, '2026-01-26 16:43:14'),
(30, '2ef8d087909eb6d9c56b23277cf4ad93e9274a3e564f290ac25822cedb784232', 1, 1, '2026-01-26 16:44:45', 1, '2026-01-26 16:43:45'),
(31, '62d6734cd96b33981d5aa2d3281115bf9f5ad72e71c447437d34d503a6fe9566', 1, 1, '2026-01-26 17:01:24', 1, '2026-01-26 17:00:24'),
(32, 'c0dab6d640f2f49c742ea5c8ee4eaba65628ca23b03809f3f20f9c1af932f9d8', 1, 1, '2026-01-26 18:32:32', 1, '2026-01-26 18:31:32'),
(33, '22be84bcab591b5fad4c40cd6b0b3b959c8ebe2d776c560f0151ca13e07db7ed', 1, 1, '2026-01-26 19:28:49', 1, '2026-01-26 19:27:49'),
(34, 'bb5ce05c0cb0c0adcf0609b402c939e747860069a0c0fe20df36c4be1364da88', 15, 1, '2026-01-26 19:32:26', 1, '2026-01-26 19:31:26'),
(35, 'abb8b7069dcdff081cb1f2b394eec4b665181b0c87f9d4350eb9d7347a95ecce', 1, 1, '2026-01-26 19:38:37', 1, '2026-01-26 19:37:37'),
(36, 'c26c88a8d64d1884872115a9f0ec6409ffbd50400a50cf45b9d9d7dfea943c13', 1, 1, '2026-01-27 09:30:27', 1, '2026-01-27 09:29:26'),
(37, 'c431f2c390ccf36d52980ca3a59683a8d07bf832bcde8c81b598f15ebcb341ba', 1, 1, '2026-01-27 09:31:22', 1, '2026-01-27 09:30:22'),
(38, 'd2493a7973af81bdafc75f0eadf6b8c1a5b0cb72f184d9f7b8925d2b2fe647fc', 1, 1, '2026-01-27 09:32:10', 1, '2026-01-27 09:31:10'),
(39, '9dc83524cfb7b457177606e29ec04536a949a9c2a739595b1ba1696eac81841e', 1, 1, '2026-01-27 09:32:51', 1, '2026-01-27 09:31:50'),
(40, '85af1dceb08ccfb0aacbda141a4ad628ba577e601648b220d653eb6022388dfb', 15, 1, '2026-01-27 09:36:01', 1, '2026-01-27 09:35:01'),
(41, 'd545f715ab8bc95141d0610c46d75894946b4726393a107c18338d078c2af373', 15, 1, '2026-02-07 20:34:54', 1, '2026-02-07 20:33:53'),
(42, '17d26f4ae8c5ace3a0e67df49ea60744f5acb6d5baf05251c40772dbf7538628', 15, 1, '2026-02-08 08:04:43', 0, '2026-02-08 08:03:42'),
(43, '0ac604bf77104d19f68490e7a6f0f2625e6522e052adfa26605e34df6fed0496', 15, 1, '2026-02-08 08:05:41', 0, '2026-02-08 08:04:41'),
(44, '54eb9d3901e8b43d2f02feffd99ec12cf164ae0e0c653597eba1b93f3db75b1a', 15, 1, '2026-02-08 11:02:22', 1, '2026-02-08 11:01:21'),
(45, '24624a25a82c7939fa47fb74b93208926db2d15a0f4769d9ebc0a3e6aaae85ec', 1, 1, '2026-02-19 13:46:28', 1, '2026-02-19 13:45:28'),
(46, 'b4b58e3d2d409d82e16d2c6353c2ae6bd98401646bbedb8609a657b38440a7ad', 15, 1, '2026-02-19 13:53:45', 1, '2026-02-19 13:52:45'),
(47, '307ed919695ea4b0a00ddd3d7c480664b66ac031f4b1f1bd95ded53d250cb636', 15, 1, '2026-02-23 15:52:18', 1, '2026-02-23 15:51:17'),
(48, '60e94a189f8299bf4efd2bd8fff0a23f4642ca9a5777e56e5bc1caf583d84eae', 15, 1, '2026-02-26 07:57:44', 1, '2026-02-26 07:56:44'),
(49, 'c0010c22de9be56a7644aba6df66b7af85ad7624bd922457763c48c473466f8b', 16, 1, '2026-02-26 16:11:11', 1, '2026-02-26 16:10:11'),
(50, '2352e51929aa0c162af9ff0247831f6ad1ac6a637ecd033acc40ec0016b38f40', 15, 1, '2026-02-26 16:27:10', 1, '2026-02-26 16:26:10'),
(51, '6bbd7df0fda60715c8a1433fabcb7876ed7b28e045b964dd01bcd4e5c507206a', 15, 1, '2026-02-27 12:18:12', 1, '2026-02-27 12:17:12'),
(52, '8f1f993a07f09fe17275699b1c9f8090b35c02f960959b6e2ff25f386df59190', 15, 1, '2026-02-27 12:23:40', 1, '2026-02-27 12:22:40'),
(53, 'ef2f3d09407b0b02867cfb16c3e4d81b60192ea14b8568f00ccf5665d0f4a2c8', 15, 1, '2026-03-02 18:48:45', 0, '2026-03-02 18:47:45'),
(54, '7dda88c516acdbc41620f55e682eaf15702931f1f721b95e17659353fbde8c4b', 15, 1, '2026-03-02 18:49:37', 1, '2026-03-02 18:48:36'),
(55, '49a66f00e89f2a16b0d34d7d814173243aae6da8bbbbb42fc1c52bb41b9fc3f7', 15, 1, '2026-03-02 18:51:09', 1, '2026-03-02 18:50:08'),
(56, '17eabf88c92c39ca16b95ebfeb04fa8e00e307a2adbff56c4e1cce1f1f278fb0', 15, 1, '2026-03-02 18:58:26', 1, '2026-03-02 18:57:26'),
(57, 'd7e61c713cece3909ccf6e3148d63dcd3db0b5aa70b588f17d3dc32d2676b888', 15, 1, '2026-03-02 18:59:25', 1, '2026-03-02 18:58:24'),
(58, '3b38941e377821389c33aa955e6ce2f490609ae2058e32930646e4ee9fb16e16', 15, 1, '2026-03-02 19:03:58', 1, '2026-03-02 19:02:58'),
(59, '1ab2b9543fda9f65c5e782577acc28c7e26070e175db09abd2fc9af994332d5f', 15, 1, '2026-03-02 19:12:43', 1, '2026-03-02 19:11:42'),
(60, '9eefac5ad994a1f6ca13aa0c04dbe3e87fc1aa60aa1961a9fe4fac9b708d0b89', 15, 1, '2026-03-02 19:13:08', 1, '2026-03-02 19:12:07'),
(61, '64dd278fc512efcc135754d0acca0bc308ebf5f5e75398b0b23b16b99a92ad5c', 15, 1, '2026-03-02 19:14:28', 1, '2026-03-02 19:13:27'),
(62, 'b6945295c28271d22c37934ea42e50fee94f537474b1922009cb309d5f2d7565', 15, 1, '2026-03-02 19:23:42', 1, '2026-03-02 19:22:41'),
(63, '97103344f42550f4263f274f1caf5de2420b18fe6577887c91b19b0457fda76b', 15, 1, '2026-03-02 19:24:08', 1, '2026-03-02 19:23:08'),
(64, '89e52bdb0418b42cc9748a173b840a8d3222f83c5f612cbb91519cf9760cfc8e', 15, 1, '2026-03-02 19:28:28', 1, '2026-03-02 19:27:28'),
(65, '654b552876f3acfa898cb5171d9d4cff077a812806e8aa77ae22181dbd4ea213', 15, 1, '2026-03-02 19:40:40', 1, '2026-03-02 19:39:40'),
(66, 'e71388e0d464c1edeb3083c9ce6de248e6899fc821b62f6d9cea25a385b77698', 15, 1, '2026-03-02 19:41:26', 1, '2026-03-02 19:40:26'),
(67, '892cda7804dfa74cdfabb13cf66c5b16b95018a1b1a662e4ab3e4649d272b5fd', 15, 1, '2026-03-02 19:48:36', 1, '2026-03-02 19:47:36'),
(68, '8328b68bcec9654d73f5ded05651bd7dd1deb3054ea1bd3ad1f1402380d7db3d', 15, 1, '2026-03-02 19:51:23', 1, '2026-03-02 19:50:23'),
(69, '6bc02e3dc0bd3ea375ec8857016a8a4f03362db41077937a19e3bf6d7ded7adb', 15, 1, '2026-03-02 19:53:00', 1, '2026-03-02 19:52:00'),
(70, '209850a2bd5cc612f38f3b09b9e9133a0b5094bc5bfebaba93ecfbf40b9fd5a9', 15, 1, '2026-03-02 19:55:41', 1, '2026-03-02 19:54:41'),
(71, 'be14afe92b83be361813792c6dcb95cf3983d9cd02d93f5cfcd3534a70d94240', 15, 1, '2026-03-02 20:08:43', 1, '2026-03-02 20:07:43'),
(72, 'd0668dca0d520dfe8e6ce166ace79d8d76f6f3e6777c1d634d6c9455358cbe7d', 15, 1, '2026-03-02 22:01:43', 1, '2026-03-02 22:00:42'),
(73, 'e92a50231c0ec53eb163d39f4cf264f9974b76bbc442a2c24b763cff1bc94a1a', 15, 2, '2026-03-03 18:41:01', 0, '2026-03-03 18:40:00'),
(74, 'de1525ba64e0aab600ead863bedbc562d3cd58016a75258b7fd03d1ee039f910', 15, 1, '2026-03-05 10:25:48', 1, '2026-03-05 10:24:48'),
(75, '83f3b7111245049285467312c05890add402e6ed060f6a4dd988d4edad703a0a', 32, 2, '2026-03-05 14:27:46', 0, '2026-03-05 14:26:46'),
(76, '95e7e49ff5f721434c97c8c4172a05f9e33529e76a2287747eaaf589aea9fb71', 32, 1, '2026-03-05 14:31:19', 1, '2026-03-05 14:30:18'),
(77, 'ae5b0434de9add3d9f686801e2ba83bce3d5908f4e574bf5560a9df600d77f0b', 32, 2, '2026-03-05 14:32:02', 0, '2026-03-05 14:31:01'),
(78, 'ec996652ff154c092ca2d7c27e2eb20bd8c0702eeec0dcaf7c6f709cffd304d4', 26, 2, '2026-03-05 14:35:41', 0, '2026-03-05 14:34:41'),
(79, '560d86522ad662fce324e672625f6e74e2cc3463f0ae56a24f2f1df9057f0344', 26, 1, '2026-03-05 14:35:52', 1, '2026-03-05 14:34:51'),
(80, '3df5c77f9e5b4ae40c58add6e74d72ffeb76069841154d3b00cb6bd2d63ef4b6', 32, 1, '2026-03-06 07:59:54', 1, '2026-03-06 07:58:53'),
(81, 'd961a8320f518985976caa02c7df98eb3ccc2dd925ca1f65afac285969f9ae17', 14, 2, '2026-03-07 19:37:07', 0, '2026-03-07 19:36:07'),
(82, '3f92b23cce8f23c6fdb8bbd14cd51b6f95dd5b070e7a42c5e9eafe815ce4cd2b', 14, 1, '2026-03-07 19:37:13', 0, '2026-03-07 19:36:12'),
(83, '8936b0f64ab2491f6db153f9b0b6dfdcc0b651d8f1b5365fc7a52f77ef5a29ac', 14, 2, '2026-03-07 19:58:59', 0, '2026-03-07 19:57:59'),
(84, 'a26c998e3ddeb81743456bd98ff9715e523886f0d5c72bf256413ba6c657c2b9', 14, 1, '2026-03-07 19:59:02', 1, '2026-03-07 19:58:01'),
(85, '82e40ed6b0b7014ec7da2622ee814933991e95c84f04227284ac9057b29e5092', 1, 1, '2026-03-07 20:51:44', 1, '2026-03-07 20:50:43'),
(86, '6d23e1ea69b3659291055baea6e329a75b4c92bcdd04a68e68c3fe8cecf49846', 1, 1, '2026-03-07 20:58:55', 1, '2026-03-07 20:57:55'),
(87, 'f993c61b249cdae0cd7c72a216ba1bbb3a415e2e937ab2eeefc914db06df230a', 15, 1, '2026-03-07 21:03:19', 0, '2026-03-07 21:02:19'),
(88, '519a9d24c1a09eedb0a53ded55df89bff06e05ac6e6bf7fa75ba3054c985da65', 15, 1, '2026-03-07 21:04:42', 1, '2026-03-07 21:03:42'),
(89, 'f31030c4a66568316b891a643f30b208170e8b20c185efbd0290c83973cc9d87', 32, 1, '2026-03-09 05:53:51', 1, '2026-03-09 05:52:51'),
(90, '80435e9a1ee5f98c346f2798cbff10ad22d91c40296f8807748f4ac188dc8967', 15, 1, '2026-03-09 09:07:20', 1, '2026-03-09 09:06:20'),
(91, '6237c6751fcb28763166149cbd9f6aec7816c2b29f244457f41e16899587ff9d', 15, 1, '2026-03-09 09:13:37', 0, '2026-03-09 09:12:36'),
(92, '265dea22f5bad841fdf88eceddcaf86cee0595549e12f04e726114e8801a9a6d', 15, 1, '2026-03-09 15:25:56', 1, '2026-03-09 15:24:55'),
(93, '38261a45a8d465c42036be47c34234691a6c5988bf6249f8a7722f742090f6ff', 15, 1, '2026-03-10 05:59:43', 1, '2026-03-10 05:58:42'),
(94, '3d28a3232495fadc9aa0635e8c4c1febbc2220c3ef1bab48cc126bd4a18f615b', 32, 1, '2026-03-10 07:10:46', 1, '2026-03-10 07:09:45'),
(95, '2dc81e24e81efce10ce535214bc2dec23ebec24ae66b4d50b2979fded90c045e', 32, 2, '2026-03-10 07:12:21', 0, '2026-03-10 07:11:21'),
(96, '390d0ab292ec82cddd7f1eed92305e686a0d4cd9dc67a29a3b8cfdf38f5c6480', 31, 1, '2026-03-10 09:14:07', 1, '2026-03-10 09:13:06'),
(97, '24044eb6d9e76435fe73836750aa0ed2b4e3dc7adf7a168819292bd5d030356e', 32, 1, '2026-03-10 09:14:32', 1, '2026-03-10 09:13:31'),
(98, '29c02dc4b675f37fe991a80ddc15f7167e54d7f992ea87dbb8c46bafefe14e70', 19, 2, '2026-03-10 09:14:57', 0, '2026-03-10 09:13:57'),
(99, '1bbd2ce48672b7d7bd548f46d2a3d000b31aa7f9c28bceb358e036f5502a2729', 19, 2, '2026-03-10 09:15:04', 0, '2026-03-10 09:14:04'),
(100, '5dfb7cc334ae5953b0b30f7f6f6f8b5bff13103c5a99c809276377a5504f95bc', 19, 1, '2026-03-10 09:15:09', 1, '2026-03-10 09:14:08'),
(101, 'd93bc8445ea7575668ad9484ebe3b7c922f48a0754c7b00077f8b887259d5524', 30, 1, '2026-03-10 09:16:04', 1, '2026-03-10 09:15:03'),
(102, 'b5c45fc3126d20dabd6361d2523ff2e11c61b7b8c2f6eba440db0cef2989a413', 25, 1, '2026-03-10 09:16:09', 1, '2026-03-10 09:15:09'),
(103, '4d12b93e8117a0a3f0ce4c8bfe7d96ab00a2cda3dd865369de3ce2cbc2573dfe', 28, 1, '2026-03-10 09:16:29', 1, '2026-03-10 09:15:29'),
(104, '3f558e78a19884e06d6597d52fa858cb15f33da0585c0922405a3e63627cbbb2', 27, 1, '2026-03-10 09:16:34', 1, '2026-03-10 09:15:34'),
(105, 'cb2791aecd8790481fa1f89b2d1b0e4a91dcfbbe0ae4b040447d84d85de06ee4', 29, 1, '2026-03-10 09:17:33', 1, '2026-03-10 09:16:32'),
(106, '7229f180109042d6191e05580314745fe6a4455375de5b99097df86ca4d2d784', 26, 1, '2026-03-10 09:18:09', 1, '2026-03-10 09:17:09'),
(107, 'de5739d7f5dbab68f0abaab7f4fc58314c9042aabf96a9b06cb71a1b493dc35e', 33, 1, '2026-03-10 09:21:15', 1, '2026-03-10 09:20:15'),
(108, 'c4c4bfdddf4b0a55b2133d9393e4df7899f0d290af1ffc770a0462c85e5e18bd', 33, 1, '2026-03-10 09:22:23', 1, '2026-03-10 09:21:23'),
(109, '677c137dc22a98553e4128d233cd43de13abfd85bc0873ff686737d9adab50d7', 33, 1, '2026-03-10 09:27:13', 1, '2026-03-10 09:26:13'),
(110, '0f2fb05aff4b08c4a2952b2437f3fac9380859ca5dc1428a39f327bc8e74d32e', 19, 1, '2026-03-10 09:41:31', 1, '2026-03-10 09:40:30'),
(111, '815634cd9144c9071f1e02a24943316d91bee2f2c21271b9893cf2aaa8c4f531', 25, 1, '2026-03-10 09:44:04', 1, '2026-03-10 09:43:04'),
(112, '14f5599f029b7d044c771376beddb993f07cae3fc196a6408c877a976fadd0e5', 25, 1, '2026-03-10 10:00:38', 1, '2026-03-10 09:59:38'),
(113, '0e971429e966e68554713342c751dff9525e12910cbd1df9a198fdd453c4047b', 19, 2, '2026-03-10 10:11:29', 0, '2026-03-10 10:10:29'),
(114, '38abdf2c59ae061facb9a85d6543a179d6e69506b2047348ba4baf8046b17319', 32, 1, '2026-03-10 14:10:31', 1, '2026-03-10 14:09:31'),
(115, 'fb8774965d62fa21d3c2f81075f7980a9fa156828ae4e9bc34e515d8deabbff9', 32, 1, '2026-03-10 14:11:14', 1, '2026-03-10 14:10:14'),
(116, '815318521d183392a62fadfb0c0ba49ddb03b659f239580cdf5e551714749063', 32, 1, '2026-03-10 14:14:04', 1, '2026-03-10 14:13:03'),
(117, 'c3ec7ed99a1cdcac2d3c9894ea2c7799716e68e101a84932c6116eb45738773c', 19, 1, '2026-03-10 14:41:52', 1, '2026-03-10 14:40:52'),
(118, '622df2ba51d2ed281eb5a402bedf5e56da9be310f251df87f870fece746da023', 15, 1, '2026-03-10 18:33:10', 1, '2026-03-10 18:32:09'),
(119, '65a9c7ef9a31160e32b3f6fe49a9e20a6d052455c4296d447abc385dde55f126', 15, 1, '2026-03-10 18:37:35', 1, '2026-03-10 18:36:34'),
(120, '67ec40332f610daf93c1e703017c2c57053862556d6a4d3cf614e194c314d7f4', 32, 1, '2026-03-10 21:01:52', 1, '2026-03-10 21:00:52'),
(121, '44b0232a6d024a74a32da0a016583d176aab12ce75e063f16e6bceac57897825', 32, 1, '2026-03-10 22:36:24', 1, '2026-03-10 22:35:24'),
(122, 'a9980aec36c8a6146ca86e96611b7ff816cf1d4c15cc97251a6c7df1241c24fc', 32, 1, '2026-03-11 10:11:56', 1, '2026-03-11 10:10:55'),
(123, 'eb398708c68ce03ee31999d4f367e30c35f8b98240d8937c8bfade4f705c6fe9', 32, 1, '2026-03-12 12:59:16', 1, '2026-03-12 12:58:16'),
(124, '6b782134309df1475291cd177993d4dac6a228f5340e52ee2bee131810b7b5de', 27, 1, '2026-03-16 12:21:49', 1, '2026-03-16 12:20:49'),
(125, 'dd14ab34c0b44af9776b87dbe90b3047f7d432df8153b13d185314e7d76b7898', 19, 1, '2026-03-16 18:06:57', 1, '2026-03-16 18:05:57'),
(126, 'eb67cf668fae3fe5796e76ed61f95ef17b01bd2042593452d4fffc453cc78e13', 19, 2, '2026-03-16 18:06:59', 0, '2026-03-16 18:05:59'),
(127, 'b81f335adc0dc5d947d312b126326e30839d899dab052affe3afc037c7c063ff', 32, 1, '2026-03-16 18:07:59', 0, '2026-03-16 18:06:58'),
(128, 'f9a06cbd88763aa871205366e84360e8f17e61396c6764d910fd8227d723aa16', 32, 1, '2026-03-16 18:13:32', 1, '2026-03-16 18:12:31'),
(129, 'a03b4bceb2d48efec67af1ed29684458561058dc1a2ebde2070f1492f894ea1e', 30, 1, '2026-03-16 18:46:09', 1, '2026-03-16 18:45:08'),
(130, '5d971a4fabd539ff693484ef8daed7e9ef5b00e2da3f8bc0812c5400d091b4d6', 26, 1, '2026-03-16 20:11:07', 1, '2026-03-16 20:10:07'),
(131, 'f0e9065f4b835d7b8a7e7d65882849b388cad3a353a805e59e88c99fe918d3fe', 33, 1, '2026-03-17 01:29:43', 1, '2026-03-17 01:28:42'),
(132, 'd523449a234014d2059ba9abaec258f090878393a6028150bae371127429ec78', 25, 1, '2026-03-17 03:37:22', 1, '2026-03-17 03:36:22'),
(133, 'd6215e175d629e7b105e08dd4f3770e378e55310b6e98a7d1d6f6332770ebc3c', 32, 1, '2026-03-17 05:25:02', 1, '2026-03-17 05:24:02'),
(134, 'adcec5fa29f30c21662ecce49120549601389bf3e6e62cb185ecb7cc6ce48f87', 28, 1, '2026-03-17 05:50:17', 1, '2026-03-17 05:49:17'),
(135, '56b8a504f50b98dafca8229cb67a83eecc82f5d9ec9d98186f4609ba3d06e470', 29, 1, '2026-03-17 05:59:59', 1, '2026-03-17 05:58:59'),
(136, 'f0f797bd6612764a4e4d1b5157ffbb3c6c28adac1bf0d050f295c38e03afa3cb', 31, 1, '2026-03-17 06:00:33', 1, '2026-03-17 05:59:33'),
(137, '7694f504846f6b763861bd23835a8e2af554c73d2f4c3b0b4ee1ae5c70d1998f', 27, 1, '2026-03-17 14:35:47', 1, '2026-03-17 14:34:47'),
(138, 'b1d81d806ec80a901810b2f92d141d723e97f52b4208d0e8ae808eb62d556c18', 32, 1, '2026-03-17 17:00:01', 1, '2026-03-17 16:59:01'),
(139, 'f7dc72f7f573e9c73ce8bdcdd1f73af2c8524dfca4d0eccd13028bd943ea0e33', 15, 1, '2026-03-18 09:40:07', 0, '2026-03-18 09:39:06'),
(140, 'c0e9fed2dd283bac1af8164055caaaeae7b476c2b9cd6e2c7aa8de2c64314608', 15, 1, '2026-03-18 09:41:43', 1, '2026-03-18 09:40:43'),
(141, '982742123e4d2467f5a1e5ae6be96320e53f09afe1fff3010ff5ff36afa23b05', 15, 1, '2026-03-19 10:20:09', 0, '2026-03-19 10:19:08'),
(142, 'a5324a9bc64ad440f1e3fc1c73941e9b53063828cc656fbcd3adbb9a7e0eda4b', 15, 1, '2026-03-19 10:20:36', 0, '2026-03-19 10:19:36'),
(143, 'f24e90baeb08a39915273da965790bd0faec293a089289812fa1497a309fee6e', 15, 1, '2026-03-19 10:20:48', 0, '2026-03-19 10:19:47'),
(144, '1c7316007f6a065eac2d1c7bf16d4326ccb07a330a725744f9ba3556f0dc1259', 15, 1, '2026-03-19 10:21:05', 0, '2026-03-19 10:20:05'),
(145, '245f6f410f3db521f1c6192c10b1072f6e232d2c1113c4a6a88ed2d60f8e08f5', 15, 1, '2026-03-19 10:21:36', 1, '2026-03-19 10:20:36'),
(146, '3cb1838b727448d44087e541d8f1dd9ced7a3ff2e9f716f1542f196d109958c6', 31, 1, '2026-03-19 12:16:46', 1, '2026-03-19 12:15:45'),
(147, '21d2e6e114691bfcfac813bc1617893ca8a1f77de890da4b83cf984543a643cf', 29, 1, '2026-03-19 12:19:57', 1, '2026-03-19 12:18:57'),
(148, 'f5973bb1299c631b484af803c41fe2d4b2e28cca51abb9111b908a1517a79822', 31, 1, '2026-03-21 07:08:52', 1, '2026-03-21 07:07:51'),
(149, '75da2be560b95718075fc6504b3fc3858b68fe79492c4dbdaf0ce9464c00582d', 27, 1, '2026-03-21 08:07:46', 1, '2026-03-21 08:06:45'),
(150, 'ec9352cecf5b4306355d8ffe6adeb00d407c634d4cbe35bc1097c200c04bb393', 27, 1, '2026-03-23 05:32:46', 1, '2026-03-23 05:31:45'),
(151, '0271a111799e18d38a7523805d89ad29668d64c17c9e89ff3eda35bef61efd4e', 1, 1, '2026-03-27 09:31:08', 1, '2026-03-27 09:30:07'),
(152, 'dfa542b3e0d964580143bb3542fc6496bbf68fb18c48ffbd5ed40ddd1b9469c5', 32, 1, '2026-03-31 08:28:34', 1, '2026-03-31 08:27:34'),
(153, 'd11481ab775a399be9dcabb88c4c8babf248c10b423506f57f165a2271faac05', 32, 1, '2026-03-31 08:55:26', 1, '2026-03-31 08:54:26'),
(154, 'fb29e93dc53d49477cbf190ba2ff1e8fd714f7020c58e7283032292db7a57d0b', 21, 1, '2026-04-01 19:27:25', 1, '2026-04-01 19:26:25'),
(155, 'e26afa5ec87f0a2ba8303b82db3d62d8c88e568515dafc37ce8b1dcb21695756', 15, 1, '2026-04-03 08:51:05', 1, '2026-04-03 08:50:04'),
(156, '23300136385ce61fe756cec16e497224097aa64bf3f3b09c246501b11a778d44', 23, 2, '2026-04-20 05:27:57', 0, '2026-04-20 05:26:56'),
(157, '06b8075111c4112dc7ee2f2f0591d6fd36a254c6715ff49e70bf95863ed63c33', 32, 1, '2026-04-23 16:44:51', 1, '2026-04-23 16:43:51'),
(158, 'e179252072f0c9ca94dc43ed783657af839308cc9fdb1c2ed38d96f0cdf92258', 13, 1, '2026-04-27 12:55:49', 1, '2026-04-27 12:54:49'),
(159, '156fdef47f5c1aff5cea84b3cb78d7aa962f4d13b430298a37027e627dbe106d', 19, 1, '2026-04-27 13:21:42', 1, '2026-04-27 13:20:42'),
(160, '71d960beafb3efea7a6fb4e780f362c44368e462580859bf6a252e406a9b34c8', 26, 1, '2026-04-27 13:22:02', 1, '2026-04-27 13:21:01'),
(161, '2a1e02e36f74338cf6a9286e17ec5db2dcb705fb76fe775b54a896e179610fa1', 33, 1, '2026-04-27 13:44:31', 1, '2026-04-27 13:43:31'),
(162, '9eb10704044e3723da8e29382912b3714929d4c68f5c6458fc1f5d9da3b3d03c', 27, 1, '2026-04-27 13:49:18', 1, '2026-04-27 13:48:18'),
(163, '8ddca0ec0e8239a185ada3e8b60caf9471e99b97fd5d8f27a0a2152c85cfa2f7', 19, 1, '2026-04-27 17:46:58', 1, '2026-04-27 17:45:58'),
(164, 'a8f37a9c7d20c166a7bb05f2dfcce4e6b64cfeabdf6fa5f5030fb56ddbe6e7be', 19, 1, '2026-04-27 17:48:13', 1, '2026-04-27 17:47:13'),
(165, 'fc3f20c9cf83254a36a9d4c45bd4b25fccdaf8eaabf2be7ed9d5c90e47e37a0c', 19, 1, '2026-04-27 17:49:47', 1, '2026-04-27 17:48:47'),
(166, '0a266c584caed4bd956c3ff366fa3f6520d9e69ce9087bfd706139c17fea008b', 19, 1, '2026-04-27 17:50:09', 1, '2026-04-27 17:49:08'),
(167, 'a8764bacd4aa01b4d7ce4529d4a4ebf36ccd0e45684221047002b5e439d2b27a', 19, 1, '2026-04-27 17:50:43', 1, '2026-04-27 17:49:42'),
(168, 'ae619ac2564c88be2c60d13610830384c4a398936ebca2a8109b590d87cb8c69', 28, 1, '2026-04-27 18:19:38', 1, '2026-04-27 18:18:38'),
(169, '4c53c715a9c6f3c23ab6d3b2b2c6ab0c0fa5747aa720a18271edf3828191d276', 30, 1, '2026-04-28 05:49:42', 1, '2026-04-28 05:48:41'),
(170, 'b0d96caabe42f4e4fb7a6828002c37709c02de68655d3ffbb1e09baaa51c6fb5', 1, 1, '2026-04-28 08:53:00', 1, '2026-04-28 08:52:00'),
(171, 'e0c8079aedb969c4ff2386990650f393dc47f5706e1dc8abb3fb43b2672e0c90', 15, 1, '2026-04-28 08:54:28', 1, '2026-04-28 08:53:28'),
(172, 'a8d2fcb0e03b7a80bea00e479761a0dadc179859af9f74032300dd4f3fd34b7b', 33, 2, '2026-04-28 09:39:03', 0, '2026-04-28 09:38:02'),
(173, '81054bf474f7c3dab16be06e059e88b5f0054e9e9ee183c6672d8d8b75c0ada0', 33, 1, '2026-04-28 09:39:08', 1, '2026-04-28 09:38:07'),
(174, '63263e0dd85fbb8bdf721b04e44b45d2a2290d023f28c24915543d9854d2a282', 32, 1, '2026-04-28 09:39:49', 1, '2026-04-28 09:38:49'),
(175, 'c2d5f2e8165180a262263dd6e557efd0f53d9846426fa6c88baa39c80bc36a06', 19, 1, '2026-04-28 09:42:36', 1, '2026-04-28 09:41:35'),
(176, '16fcedcef9e9b6f670e81015c6c99e17555b365c24eb943657943129b53cf976', 19, 2, '2026-04-28 09:45:05', 0, '2026-04-28 09:44:05'),
(177, 'e6405c1058fa314bc936b4436f290a90ff70bf994fbbdbb89824ccc6e1b74b94', 19, 1, '2026-04-28 09:45:16', 1, '2026-04-28 09:44:16'),
(178, '775d380d6360d722f878fac0bbaa3877f1e5db687e28c7dc265d560855deca25', 28, 1, '2026-04-28 10:35:52', 1, '2026-04-28 10:34:52'),
(179, '91a6101d570568801f9c64eaadf4be9e71003e70dc3ffaf95c9421612c21253a', 27, 1, '2026-04-28 18:00:26', 1, '2026-04-28 17:59:26'),
(180, '22ce526e3cba079601c006518971b6d0bfcaa69fc7465a9c67039de7f5cc7eae', 19, 1, '2026-04-28 21:17:35', 1, '2026-04-28 21:16:35'),
(181, 'cd9bac3338a136585f6718598f3d09a3b6bd9d359bf76b34cf1d38f8ff240cb4', 33, 1, '2026-04-29 03:11:17', 1, '2026-04-29 03:10:16'),
(182, '718d821ebe67e7e37f7a74611124f51cbffe6c8686ee782e3ca5107aac7e6265', 30, 1, '2026-04-29 10:12:17', 1, '2026-04-29 10:11:17'),
(183, 'f329f829b2f1e80dd8c3e3de625d0ff8a241179c306f6238744b37e943e365b5', 13, 1, '2026-04-29 11:24:00', 1, '2026-04-29 11:22:59'),
(184, '29a3c1185196e89a0fe4f259d3dcc64ded3510b978e8886d2b5655e09ba22477', 15, 1, '2026-04-29 12:09:16', 0, '2026-04-29 12:08:15'),
(185, '333b1b830cdd839686d4401ce721013a7a10aa2c4162ae22bf7268f04ea902e5', 15, 1, '2026-04-29 12:09:54', 1, '2026-04-29 12:08:53'),
(186, '8e884cf8cf4cd42bdc70405e1bfaa29b1490ed767330063a56bd35d38216b9e1', 25, 1, '2026-04-29 12:32:45', 1, '2026-04-29 12:31:44'),
(187, 'f8f5df7049dac6fa6bf7e6c9b1c9744e9f04de0a18b6216c3975c420e9e627fc', 27, 1, '2026-04-29 12:55:42', 1, '2026-04-29 12:54:41'),
(188, 'd3c45954f963473ee550d73c60b9033d8e6215de38af6d6535f820380bf8baeb', 28, 1, '2026-04-29 19:04:13', 1, '2026-04-29 19:03:12'),
(189, 'ac04abd70737daeb20d30e925613e4ba9871c663c43713d005095739e8a4f7da', 32, 1, '2026-04-29 19:52:36', 0, '2026-04-29 19:51:36'),
(190, 'f2b84c9ad15d629fac6cc4cc5884583e9c008827d26f54b9e8b70900a86ed26b', 32, 1, '2026-04-29 19:53:11', 1, '2026-04-29 19:52:11'),
(191, '647f38682f4625d7423291d0abf786484a3f5bfb7230986b69f61c7fbc884e5f', 32, 1, '2026-04-30 03:56:38', 1, '2026-04-30 03:51:37'),
(192, '6b62439858b85e24cd961fdf15d4f525bcd828a7570ebfdcd1f8f949fb32f2cd', 32, 1, '2026-04-30 05:46:02', 1, '2026-04-30 05:41:02'),
(193, 'cc048dcfcb5875c9e2e6ee85bc5c8966216585b6a59ee2ab6a2c80aeb4c6eeff', 31, 1, '2026-04-30 05:52:00', 1, '2026-04-30 05:47:00'),
(194, 'e068a873ec6447113331ac3d13e239eabad295e1c00a74def189cbb4e3cc8ac7', 15, 1, '2026-04-30 07:05:22', 1, '2026-04-30 07:00:22'),
(195, 'd7f3d883e90bd636c8e9213ad0253a36c65c97776a878a04c6667d2cc98999fd', 15, 1, '2026-04-30 07:11:21', 1, '2026-04-30 07:06:21'),
(196, '1b66eb71a9677df5678a9eaeb87df322c90519b49cc42e8a6b98c815e910038f', 34, 1, '2026-04-30 08:02:19', 1, '2026-04-30 07:57:18'),
(197, '73da506cda82bd7f0d4dd0827878d023a28a823d0064ed76c964d67d3e0ab76a', 32, 1, '2026-04-30 10:26:09', 1, '2026-04-30 10:21:08'),
(198, '251bf0d16d7b1079352bc57580e511b10f65875f69d90ea4adbdc41fb0f285ea', 13, 1, '2026-04-30 11:02:01', 1, '2026-04-30 10:57:00'),
(199, '1321d927657554678287dde863908d4cc09968aff215a1736cdc5456b7a83c85', 19, 1, '2026-04-30 11:14:22', 1, '2026-04-30 11:09:22'),
(200, '2613d979146c6596307f1737c9f761d9464779a7a00738b5b942b7d90bcc76b7', 19, 1, '2026-04-30 11:19:56', 1, '2026-04-30 11:14:56'),
(201, '15ea03216bbf5b02ea2457e4f2b74bea90fffde52dba2f19bd696fb943cbba57', 29, 1, '2026-04-30 11:59:31', 1, '2026-04-30 11:54:30'),
(202, '794589f40a987a1227b900b47475d470be844fae47513d4a2ba5658e21017c89', 29, 1, '2026-04-30 12:39:02', 1, '2026-04-30 12:34:02'),
(203, 'b65ab8c5692c73be4d006fd9912fc9fcbed9240e8608ec0f1382d2637e8c7163', 30, 1, '2026-04-30 12:44:49', 1, '2026-04-30 12:39:48'),
(204, '51d8157644b4135fe7b198a4f2931f43506899d12e052f1c7da23431508ce63a', 33, 1, '2026-04-30 12:53:08', 0, '2026-04-30 12:48:07'),
(205, 'e7edcdb2ca8de83e6781f3105010e3939e722d02d1bf70683665006ad23fbe22', 33, 1, '2026-04-30 12:54:10', 1, '2026-04-30 12:49:10'),
(206, '775daa22d10c8605a233783060a5e5b23c650776b339b487a61f105d2ba85957', 27, 1, '2026-05-01 04:18:53', 1, '2026-05-01 04:13:53'),
(207, '687e84b6637c2dc7380440e7a28f4f946ff8a9c57d0a5ab308fefc9f4fa46741', 19, 1, '2026-05-01 11:02:54', 1, '2026-05-01 10:57:54'),
(208, '0eef11a9110389442643a468ff874fddb0e4b7b739e1b3636110cd6e81bbf37f', 29, 1, '2026-05-01 17:52:07', 1, '2026-05-01 17:47:07'),
(209, '50e0ebf99cf6929a5a2365166868a2c491859ee97e16631b70ce093429712008', 30, 1, '2026-05-01 18:40:37', 1, '2026-05-01 18:35:37'),
(210, '99390e6cc5c0663754370c5cd20aafd595f06201fd7bc61dd88aa29e83ec6957', 30, 1, '2026-05-01 18:41:50', 0, '2026-05-01 18:36:50'),
(211, 'b40e6f7d3c403f084e481c237a3d9811ef128ce452f9c79bc7f124730e6fbafb', 30, 1, '2026-05-01 20:05:29', 1, '2026-05-01 20:00:29'),
(212, '5159de5e96b338ab50a70a1ae885a327e78b2b40977990bc0c5fd6e873824954', 33, 1, '2026-05-02 08:59:06', 1, '2026-05-02 08:54:06'),
(213, '3c2d2cd0ba3ef452ae0d4029fb8c0c0425b687f57d4ac1e57bd8adb1519d6759', 27, 1, '2026-05-02 09:17:07', 1, '2026-05-02 09:12:07'),
(214, '93c421ae44c08949c0346c957c9686eb1d455af4c39bd37f14ce5b3912a8c72d', 32, 1, '2026-05-03 07:27:59', 1, '2026-05-03 07:22:58'),
(215, '27bf503cc59dd62881b0a0f9ac40a1ff9ea8389653e4a28c6430c913a784e43e', 19, 1, '2026-05-03 09:59:49', 1, '2026-05-03 09:54:48'),
(216, '24d87a81d07ac1a874f210147d65695ec87b7a320970e7c32eb4616244dedd58', 31, 1, '2026-05-03 14:02:34', 1, '2026-05-03 13:57:34'),
(217, '60c43b1f3d78f08ea0bbbb58804cbc0ab5857cbf86b6b95503d03201fe82e508', 25, 1, '2026-05-03 15:06:39', 1, '2026-05-03 15:01:39'),
(218, '2b7a80d204376c7c3961130e7ba3e3d14d275706c18fb5368154b0e140a0e619', 27, 1, '2026-05-04 05:51:59', 1, '2026-05-04 05:46:58'),
(219, '2488de610ba693de085adf7be6672bb0a5a6e05fd262e5f6bc944288140a92cd', 33, 1, '2026-05-04 11:33:54', 1, '2026-05-04 11:28:54'),
(220, '70999e9e04d0281c36b949148f0a653e4c569cb14712be1a339d5aed847733c1', 15, 1, '2026-05-04 15:44:38', 1, '2026-05-04 15:39:38'),
(221, '2f660007d054ea81e27e05bbb8b54210345a73c7c1aa285dda2898112c9bdc50', 34, 1, '2026-05-04 15:50:30', 1, '2026-05-04 15:45:29'),
(222, '3ec7afa36e9313f7477c489d0fd7f213a92eac2396899c25645959b1eebafe9d', 32, 1, '2026-05-04 16:52:22', 1, '2026-05-04 16:47:22'),
(223, '74fab5be3276418ab401a16ef4cdebfe8ed1fd03a66d294de2ea46aa04dffee3', 28, 1, '2026-05-04 17:00:18', 1, '2026-05-04 16:55:18'),
(224, '5c3e3c78e287e9289ed52e21769c85d2e54186685ae89b3d6df9203b93ceee26', 29, 1, '2026-05-04 17:26:40', 1, '2026-05-04 17:21:39'),
(225, '5b87849bef1e01a1633b6352df8b2848501e9a962b2ea7c29fd45809c7b1058e', 15, 1, '2026-05-04 17:37:01', 1, '2026-05-04 17:32:01'),
(226, '2c3e007af07db369daba701345f7aa745274fb3cd461473f1d7f9f822fd57b82', 15, 1, '2026-05-04 17:42:55', 1, '2026-05-04 17:37:55'),
(227, '32301279ea22fa247c7fa397a313fe9637ff00b124d1f1e90d3d4ac9f888a8fe', 34, 1, '2026-05-04 17:42:59', 1, '2026-05-04 17:37:59'),
(228, 'dffa142fdded2592c25511eb4253a1d8521e1c14ca9d730a75fe546dcb654d93', 15, 1, '2026-05-04 17:53:10', 1, '2026-05-04 17:48:10'),
(229, '5ee46a6769c92bf09c71a254bb081f1143480934ab8befb42ee75c805185a1a1', 27, 1, '2026-05-04 18:13:05', 1, '2026-05-04 18:08:04'),
(230, '5465cc44b2d684da6d29a88e28b3ef1a83c219b1a189c94b4eac14ac2214a437', 27, 1, '2026-05-04 18:13:30', 0, '2026-05-04 18:08:30'),
(231, '059de6e23e4217fc2c8ec47cb23e27a8bb69f23edffe3fbd2839442c94622923', 27, 1, '2026-05-04 18:14:50', 1, '2026-05-04 18:09:49'),
(232, '3574d484667c1986555a2303036695a7be0132037f2dd5ba80dc200c1163f69a', 27, 1, '2026-05-04 18:22:18', 1, '2026-05-04 18:17:18'),
(233, '1555eadfe0939d6f08091b31cbeb02bb5096d34e29e818825ad088d5da0db86d', 27, 1, '2026-05-04 18:22:32', 1, '2026-05-04 18:17:31'),
(234, '52fafde83679b2a1f1fca38c209a3552f62117367e0423447fc0fb3f920a10d6', 34, 1, '2026-05-04 19:09:21', 1, '2026-05-04 19:04:21'),
(235, '2bcf0440bac1b00e9f245999a9de654fa7bf38ff0929fe05855334c460f352f8', 15, 1, '2026-05-04 19:29:10', 1, '2026-05-04 19:24:10'),
(236, '147816a4c91baa0eb8c0c77ea010b2f3f0e52c81bf7fa9bb63491f7e1dd59f92', 34, 1, '2026-05-04 19:29:30', 1, '2026-05-04 19:24:30'),
(237, '67e55149fa429ffb1dc44908a17494300e9c1062a1f87dc31eacff4327586bba', 34, 1, '2026-05-04 19:34:24', 1, '2026-05-04 19:29:24'),
(238, '0fa92576e8dab213e57d6b5bd04983799e0f6ac0c22c95c1050a10ded549a84d', 34, 1, '2026-05-04 19:38:26', 1, '2026-05-04 19:33:26'),
(239, '6735efdbec3004503e78b1697dad9af06e7ff3e553cf43b5572e8b079dd0531a', 34, 1, '2026-05-04 19:38:41', 1, '2026-05-04 19:33:41'),
(240, '33708a05eee4c519dceec0bf98bf5095dea1217bba1eab1426b638c852551e28', 34, 1, '2026-05-04 19:41:26', 1, '2026-05-04 19:36:26'),
(241, 'ca56f48da52bb4c8984f3b375cadba6a75e92debba3981dd14b6c3ba8e1f6ce8', 34, 1, '2026-05-04 19:42:15', 1, '2026-05-04 19:37:15'),
(242, 'fba4897f1f587d36dca7cdd8c1076087cef90a6d4119e4a5d7f89746832fedb4', 29, 1, '2026-05-04 19:56:24', 1, '2026-05-04 19:51:24'),
(243, 'c5cb2abee6240447f8784a88a23bd00ac804c3f7d27080fcc54ccdd0062df118', 31, 1, '2026-05-04 20:02:58', 1, '2026-05-04 19:57:58'),
(244, '94cd603278a364675c6bccef1a660ca4acf6666261111056c68ba4ec639319db', 25, 1, '2026-05-04 20:03:15', 1, '2026-05-04 19:58:15'),
(245, '3c6a65a709964ef56cc1a06f2287328e01bbb43bd309a797882be44b99ab6916', 26, 1, '2026-05-04 22:02:53', 1, '2026-05-04 21:57:53'),
(246, '0f9b548e5c480003f9516280682feeebcf28627010859e8245bd825976aab126', 26, 1, '2026-05-04 22:07:51', 1, '2026-05-04 22:02:51'),
(247, '2fa769a055ab86e8d6c3745d94312f0f4a951662448ad8a3d690b342bc1313e7', 26, 1, '2026-05-04 22:14:16', 1, '2026-05-04 22:09:15'),
(248, '8a4cc22cf3329ef345b028a4fd918c3a4ab0997d573d421220f12bfc15cc2c07', 33, 1, '2026-05-05 02:12:26', 0, '2026-05-05 02:07:25'),
(249, 'b4c08bc79ee2ab5492ab25b592a48d529fa67f36616474e2d81ccf34ab5d1cdd', 33, 1, '2026-05-05 02:16:48', 1, '2026-05-05 02:11:47'),
(250, '1eef3399db0c43735dc00752b72a7e9a0bf6607be9c34651376cc2d0d5d16c20', 31, 1, '2026-05-05 04:20:51', 0, '2026-05-05 04:15:51'),
(251, '042a9cfd29ae600a7378be98493b442bee0aaf99d4fe13e4a31924b765d6fbef', 31, 1, '2026-05-05 04:21:13', 0, '2026-05-05 04:16:13'),
(252, '20cf87a608904c05ba8cb8a6eb0d5e189c316baa37846edcf75d167790ca061c', 31, 1, '2026-05-05 04:21:31', 0, '2026-05-05 04:16:30'),
(253, '60df0a4963a21b52e525435f90ca9829c048b86c1c70323c1ac591c88a2b9707', 31, 1, '2026-05-05 04:21:57', 0, '2026-05-05 04:16:56'),
(254, '9d0e924bcaab23bd7828ce28462601852965c4979db584ca0a80d9f6753098bf', 31, 1, '2026-05-05 04:22:29', 0, '2026-05-05 04:17:29'),
(255, '7357a2b2de943684379279421c97ebdb9c01d384bf7c0814e29457c5490cdce3', 31, 1, '2026-05-05 04:23:13', 0, '2026-05-05 04:18:12'),
(256, 'f38828762a6b0c881ec38fdd0218948046dd7a4fcf8a4c8a76c4a29a64ecd6ec', 32, 1, '2026-05-05 04:44:47', 0, '2026-05-05 04:39:47'),
(257, '8ecfa86839bfe1e02f58fa580f0b65ff1188be17806771e05cfd30c83a7e3db4', 32, 1, '2026-05-05 04:44:59', 0, '2026-05-05 04:39:58'),
(258, 'e6aa9f1596b8f2c2d75e4b7cf7d59d018231e32a46995ce1e4da52e0ecc8205b', 32, 1, '2026-05-05 04:45:24', 0, '2026-05-05 04:40:24'),
(259, '4c5d24e4e15e4bfd489554b7157de37815a1726d8da4659da24e9dd498a98847', 32, 1, '2026-05-05 04:46:37', 0, '2026-05-05 04:41:37'),
(260, '2b7244d57cfa13b11d6b3c57dd15e7e6d9a39ce9cfdb59647f5729ab9976c64c', 32, 1, '2026-05-05 04:46:51', 0, '2026-05-05 04:41:50'),
(261, '31f9af8b57fbb7a96200e964aa2cf3793d3a7884831ceb5a3e3369670df996ec', 32, 1, '2026-05-05 04:48:10', 0, '2026-05-05 04:43:10'),
(262, '7a5af7b1752bc9124ad7edfad09e714b06be59126a092125eadaad04acce3357', 32, 1, '2026-05-05 04:48:24', 0, '2026-05-05 04:43:23'),
(263, '8e660fb5365732475b148be02c8a2d96ca5bc77b3db866ef88fe27ce2f998a42', 32, 1, '2026-05-05 04:48:37', 0, '2026-05-05 04:43:36'),
(264, '5855f3b9893cd809250ef4612f2ebd205e3406d86118534a7579e9efc3133de1', 27, 1, '2026-05-05 05:48:59', 0, '2026-05-05 05:43:59'),
(265, '4c66a63217d4cbae3a1669e98a737fdc824118c526b0207d6daebdff2af129f4', 27, 1, '2026-05-05 05:49:27', 1, '2026-05-05 05:44:26'),
(266, 'df1f40ccd318675e4ff92f75136e82f7f2df8049bd2f6175e911d3200bd2b114', 33, 1, '2026-05-05 06:43:54', 1, '2026-05-05 06:38:53'),
(267, '491c00ed65982e7c9397ec2f7e2f842a8f6918dcf915d4dac7438effc581d202', 31, 1, '2026-05-05 08:43:20', 1, '2026-05-05 08:38:19'),
(268, 'f97704d4aedb3d45c2be9548650f11a97ce40112dce5a6f984ff276c20486e93', 15, 1, '2026-05-05 09:42:28', 1, '2026-05-05 09:37:27'),
(269, 'e6b750e5004fb9ef1fcca17976c1557b9c198598d7a25b2cef8acde703699b0e', 15, 1, '2026-05-06 17:25:05', 0, '2026-05-06 17:20:04'),
(270, 'a20d7442cf0c2a2b049b2da03cb15e0ca9bfe671568109502497361353a152e7', 15, 1, '2026-05-06 17:25:18', 1, '2026-05-06 17:20:17'),
(271, '3ee5435f55748e843b0cbd357d772eae17695ed451f55fdd6ecbf180cf149bfb', 34, 1, '2026-05-06 17:27:29', 1, '2026-05-06 17:22:28'),
(272, '972bfafd2881d07a472c0ac0084524cfa93ebada49ef1283db032bd01f49177c', 15, 1, '2026-05-07 00:21:02', 1, '2026-05-07 00:16:02'),
(273, 'b735615fa70908ae6614f6c98f7775fa9cd0a182f271ca14907789c5a411ca94', 15, 1, '2026-05-07 00:21:45', 0, '2026-05-07 00:16:44'),
(274, '95e62e47c6cf3a520a084c89044ca1cde496f6cdcf5e854cba2b33d1fab1bd1f', 15, 1, '2026-05-07 00:22:06', 0, '2026-05-07 00:17:05'),
(275, '2cad77db817740b486544beabda5b4410aa39e2b255f49f38ed6040bae4b2017', 15, 1, '2026-05-07 00:22:35', 0, '2026-05-07 00:17:34'),
(276, 'beb335c51ac88b40b14b120a05e2456df6a6ac7341ea7ea95769a8b828ab86fc', 15, 1, '2026-05-07 00:22:54', 0, '2026-05-07 00:17:54'),
(277, '2cdc9fcab5c22023f6596c89345aba7768ef85b8e2b82aaec6e155e7bc1a0950', 15, 1, '2026-05-07 00:24:25', 0, '2026-05-07 00:19:24'),
(278, '751835149acbff07be3faee35d2d4c7256501d3e1584afa289d366ea54d33d3a', 15, 1, '2026-05-07 00:25:44', 0, '2026-05-07 00:20:44'),
(279, '3d03120c6b84ddfdc1986c6f8a2066690b359f11014e9e6449fe7b4f1bdd092e', 15, 1, '2026-05-07 00:32:38', 0, '2026-05-07 00:27:38'),
(280, 'dd8aabe56f6254d8d8f37e7dcb70fd5624db76b5624dcd85ec9e9b69fc963f54', 15, 1, '2026-05-07 00:34:07', 0, '2026-05-07 00:29:07'),
(281, '9d0f8890d934ed4971ae0bdb197a1f4f6bbdb67015c8c01ff65df7d44fb0ef29', 15, 1, '2026-05-07 00:34:45', 0, '2026-05-07 00:29:44'),
(282, 'c2704f5ff482f456e9065ce0ac9f77511a175deaeb5f9f7098f0a19148b7c194', 15, 1, '2026-05-07 00:41:27', 0, '2026-05-07 00:36:27'),
(283, '37c86eb6e790a4637dcbf1a9ad8e92fcd65c94e0b2dbdd59975263b86611ed57', 15, 1, '2026-05-07 00:44:06', 1, '2026-05-07 00:39:06'),
(284, '900b80bc171c1607316657bfee230294dc5dc2dd8e93351d5ec754e753e4fd31', 34, 1, '2026-05-07 07:53:08', 0, '2026-05-07 07:48:08'),
(285, 'b1aff49764fa868c2b5ae4135ddb1c31fd7f8d95bebc60b9ddf226e7d451f523', 34, 1, '2026-05-07 07:54:51', 0, '2026-05-07 07:49:50'),
(286, 'c52ce8d546d0c8df280e2d9efdc61c5edc1c61754b5b57ec63e6137a470b2f4a', 34, 1, '2026-05-07 07:56:49', 0, '2026-05-07 07:51:48'),
(287, '82052412394a9b134c05dbe9127bee3b460328015a5bca71312928db5dec559b', 34, 1, '2026-05-07 07:57:09', 0, '2026-05-07 07:52:09'),
(288, 'de4fca009f8cb623ab62a5c6e4709c3769c7e62fc402c0d4d20303afe3711e9e', 34, 1, '2026-05-07 08:03:46', 1, '2026-05-07 07:58:46'),
(289, 'be322b39fea65ff47a067f255d4eaa2ad782ca9cc4b2b1bc953a00e56856636e', 15, 1, '2026-05-08 11:10:18', 1, '2026-05-08 11:05:18'),
(290, 'cb6b15c741fc7e4177bc439d0cc4be1861aaecc2b3329b0dadf62de90cd54a5d', 27, 1, '2026-05-10 16:44:23', 0, '2026-05-10 16:39:23'),
(291, '86d61f015a9d04333e8a049427f34498f0644c1364a1f146b54f83e7441da857', 27, 1, '2026-05-10 16:44:36', 0, '2026-05-10 16:39:35'),
(292, '608e1df3f576b107f300b53772668737ca9bdd0d6a3524ab48265cda9555784a', 27, 1, '2026-05-11 06:03:18', 0, '2026-05-11 05:58:18'),
(293, '93ad36e8bfa86bad725826a165bf64a3abc5d805c315cf12db4829e773a44bcf', 28, 1, '2026-05-11 07:18:24', 0, '2026-05-11 07:13:24'),
(294, '423859e9d6c7b0708e6974b2a7364d63fd41a81006888d1b292c540d6e7e235c', 28, 1, '2026-05-11 07:18:42', 0, '2026-05-11 07:13:42'),
(295, 'b3b14e43fdcaac8b73d5853eb6daadc2929cd34a72bb630e5f738901b805fd6c', 28, 1, '2026-05-11 07:18:59', 0, '2026-05-11 07:13:58'),
(296, '286595d599596c2e6a62c83e16f3efaec5e20caf2d3163e7935f6eeaa48edd86', 28, 1, '2026-05-11 07:19:41', 0, '2026-05-11 07:14:41'),
(297, '7fcc075f57d0b1cf8e1a1f5800ffcb175a069704078bdd7ace1db46d97af55bc', 28, 1, '2026-05-11 07:19:54', 0, '2026-05-11 07:14:54'),
(298, '3ad46826a5c6ab819f83d7794a6c8b1e3a642f1d67c22563939bea2ec4737b89', 28, 1, '2026-05-11 07:20:15', 0, '2026-05-11 07:15:14'),
(299, '42e37e8888d4b3f470a963e2fe26411f2b0bfeb8e5c81869e259e4e0db904d41', 1, 1, '2026-05-11 07:21:33', 1, '2026-05-11 07:16:33'),
(300, 'e08d66c3c1c34f2d3f45c55e51d6dcba168ef5e73ee67ae347ea5ad63699d541', 15, 1, '2026-05-11 07:22:32', 1, '2026-05-11 07:17:31'),
(301, '95d64c8750f14b4c8578573ae13ca4a1b79b3291d4e9b85956457d67999ec04f', 26, 1, '2026-05-11 07:23:35', 0, '2026-05-11 07:18:34'),
(302, '1ae87f5f22b45130b1560b9e462c237d9828597923cffd78510e62928dde736b', 26, 1, '2026-05-11 07:23:57', 0, '2026-05-11 07:18:56'),
(303, '3e3006ef573e900fe7d2f0d27dc3c1a9edcf9cd334dfde087efaf20232989f49', 13, 1, '2026-05-11 07:24:04', 0, '2026-05-11 07:19:04'),
(304, '59fd9ff9c2adb64c1a41944ca92e6ebbd24b340f7c578cd09457c983cbf7a724', 13, 1, '2026-05-11 07:24:26', 0, '2026-05-11 07:19:25'),
(305, '4f6f87c45d68f05ce0f58ea585632f648426ea305f057d747ddd1dd855cc6cad', 19, 1, '2026-05-11 07:26:11', 0, '2026-05-11 07:21:11'),
(306, '09aea601b99240fe5e3e9bd7a29cd1a1572bcda6258d3eccf051d2dcfe23ee54', 19, 1, '2026-05-11 07:26:26', 0, '2026-05-11 07:21:25'),
(307, '27c38b7c62c89462867a7e70c9597d993cfc73ff4cb03879e8d3290a5a13b151', 19, 1, '2026-05-11 07:27:05', 0, '2026-05-11 07:22:05'),
(308, '61ff1917cd439a1c7b0b5bcfe60615ea82c9c96489a9348fab3920d209b921cc', 27, 1, '2026-05-11 07:27:30', 0, '2026-05-11 07:22:29'),
(309, '39a1f361e601966d37aadda15cf7ce5579486ee11b6e7efd1a74ba5db436ad39', 31, 1, '2026-05-11 07:32:39', 0, '2026-05-11 07:27:38'),
(310, '0a54936014bec038306dc45ee37a3c5c60ddfdf3b190360f275e0ae62a602e03', 31, 1, '2026-05-11 07:33:10', 0, '2026-05-11 07:28:09'),
(311, '5d8eaedbdc5205f776890333f49c81338069cea9b13cd0df197f4f3cba98ae46', 19, 1, '2026-05-11 07:36:51', 0, '2026-05-11 07:31:51'),
(312, 'c07517e9f8aba09981693c56d708208570824c021ca881db14a8bf618b88b671', 34, 1, '2026-05-11 07:39:26', 1, '2026-05-11 07:34:26'),
(313, '9301c598a2ea4ccb7774af5348225b17b644aab3402bd71ed5ce609fa3aeb25b', 19, 1, '2026-05-11 07:41:44', 0, '2026-05-11 07:36:43'),
(314, 'a87aeaa45fdbab0b44b672c8890d4698f8dbf0a560d83e5e3bf47f468109859e', 19, 1, '2026-05-11 07:42:38', 0, '2026-05-11 07:37:38'),
(315, '85e3af3fe9c34494083b9d7dadb1eb5ffa011c6c9e0390ccee4c5226f17e789b', 19, 1, '2026-05-11 07:47:22', 1, '2026-05-11 07:42:21'),
(316, '67600814640d536526d568136591d19751c53a28eda82dd463c09bcdd54c223d', 19, 1, '2026-05-11 07:48:53', 0, '2026-05-11 07:43:53'),
(317, 'f23d442987b150271abe86404831c75b217883a7ecbef98323a91a874c2c4ad3', 19, 1, '2026-05-11 07:49:04', 0, '2026-05-11 07:44:03'),
(318, '93c5ad88ef9a4a57accbaf1b1974db5452e35557f473a5f6cfd09824d936f53a', 19, 1, '2026-05-11 07:49:58', 0, '2026-05-11 07:44:58'),
(319, '1a25f60e1427e1bcda6bb81bf85b25707d678165ed60aa8d7fd662970bdc7e51', 13, 1, '2026-05-11 07:54:43', 0, '2026-05-11 07:49:43'),
(320, 'd40206c434e80a29316d8ba3c01f9fcd6b8e19eced0bae1a71ae48b84b58871c', 33, 1, '2026-05-11 09:12:51', 0, '2026-05-11 09:07:51'),
(321, '8292ffa7128825002eb009e6740d2b3d08c6c2dfca4a4e46bfc197bd2bd00471', 33, 1, '2026-05-11 09:13:03', 0, '2026-05-11 09:08:03'),
(322, '0cdde87b38e7216fb76e29b4707d523b88f0a28fd6e5b9500a57a67444d1c2aa', 33, 1, '2026-05-11 09:13:18', 0, '2026-05-11 09:08:18'),
(323, '5113edaacad07b895a16bd311d9445ea864a4d14aaf17a8687c1a6d879bccf06', 30, 1, '2026-05-11 09:15:07', 0, '2026-05-11 09:10:07'),
(324, '3ac73ebdb745d7f9557d422e7765486a635092978aed4d44b8f4de8690cc8a19', 19, 1, '2026-05-12 10:25:25', 1, '2026-05-12 10:20:25'),
(325, '2df463b9728d4a6e4abb1d63c6c901118e129e963c9d6aeaa002e4d5d1d6eec8', 33, 1, '2026-05-12 10:26:20', 1, '2026-05-12 10:21:19'),
(326, 'da561807a4b5900727902bc2c19ee4d88a2cdf3e00a8b2ca3ce9674e34e88b7b', 27, 1, '2026-05-13 09:22:25', 0, '2026-05-13 09:17:24'),
(327, '4a7e30b0835b0da897cdcc06228619ab5e22dedb736a0c131d81f6df0e8ec3a1', 26, 1, '2026-05-14 03:17:38', 0, '2026-05-14 03:12:38'),
(328, 'fd2bd9d3f33dfa84acbd9db9cb8ae1cda6941e43521d14e85f9ecf54302eaa13', 25, 1, '2026-05-15 06:59:19', 1, '2026-05-15 06:54:19'),
(329, '53cd8338d9ec4739e9f8975d9ac5c3c04d1842a137bb245f1136c44dce74a641', 26, 1, '2026-05-16 07:07:20', 0, '2026-05-16 07:02:20'),
(330, '801b734cf45ff99131dc699909e902a58a761bdcc47ffd3ab1e2c942d83dd726', 26, 1, '2026-05-16 07:07:38', 0, '2026-05-16 07:02:37'),
(331, '354a96005c5fa200dff1594ac2bae04eb6c9f71f2e6ad9a9f0eaccb6c617ee33', 33, 1, '2026-05-17 17:53:10', 0, '2026-05-17 17:48:09'),
(332, '1f8f7758cadc11f7b46a82d636f8ae5207bbd1a2a5af62cb4a8ba8690e14f50b', 33, 1, '2026-05-17 17:53:25', 0, '2026-05-17 17:48:25'),
(333, '94eb6aa712b526e4f54bc3c524b5fef6ea6d8bec15641a681b851263e4cffc67', 33, 1, '2026-05-17 17:53:39', 0, '2026-05-17 17:48:39'),
(334, '39591b4d437ec2d2d4bc0f81f94961389113b80979418da14f59ce9eca2c3d8a', 33, 1, '2026-05-17 17:53:41', 0, '2026-05-17 17:48:40'),
(335, 'bf1010ce7ad2ebe8a299c38f304c738b0440c29dedc1e0094f9b12323b6c65bb', 33, 1, '2026-05-17 17:53:52', 0, '2026-05-17 17:48:51'),
(336, '1e0e2b7e72b380720ab01fb6dd625c3c5c660c6823d6f102affd549696f9da1c', 33, 1, '2026-05-17 17:54:35', 0, '2026-05-17 17:49:34'),
(337, '289d44c11e97befc6e38cbc326cd85d03b56a6ed46406d221dc2c0e06d08357a', 15, 1, '2026-05-21 10:07:28', 1, '2026-05-21 10:02:27'),
(338, '8f2c19e768a83031d828ffb84f19351c4543c485af95dc3a15041d7b13e9bc28', 15, 1, '2026-05-26 08:35:52', 1, '2026-05-26 08:30:52'),
(339, 'c0403f3a9de7b091602966964af14507fc12677543541cd5850b324a4d538803', 19, 1, '2026-05-26 09:18:00', 1, '2026-05-26 09:13:00'),
(340, '5b709cab46058b443bfe8717eeb14bfd0db577f34458e88e08319b88cfc72c57', 33, 1, '2026-05-26 09:25:32', 1, '2026-05-26 09:20:32'),
(341, '0b2f1a666ab2416961718628b5ed777c311cd08b8031bd7b852fcc725a8e813f', 29, 1, '2026-05-26 09:48:41', 1, '2026-05-26 09:43:41'),
(342, 'f6786a643c33c8029812e9cf07b3f53412c30682f611e1c11607916cab0eca03', 26, 1, '2026-05-26 09:53:03', 1, '2026-05-26 09:48:03'),
(343, 'ad45110907be3f5a570632d9cf8f48a6d9fab238ae96c789c5a6197e2f421b1f', 25, 1, '2026-05-26 09:56:29', 1, '2026-05-26 09:51:29'),
(344, 'ebb860d31804ae225bd715d7b2c9042eab287462137afc8c0453e67eb7aea0a2', 32, 1, '2026-05-26 09:57:48', 1, '2026-05-26 09:52:47'),
(345, '5651e2b6a8d217bee900753607b3ca717c15d078c3bc23f4a1caa2daf07032b8', 27, 1, '2026-05-26 10:00:13', 1, '2026-05-26 09:55:12'),
(346, '0729c201ed9953a7302af1f5f2434e81b10678bc8c07a9bac9e3baa108d3423e', 31, 1, '2026-05-26 10:03:33', 1, '2026-05-26 09:58:33'),
(347, '171c408d80b40608c2c49198c718c5e30044cb3038eb2ecf76688d3ff7bcda3f', 28, 1, '2026-05-26 10:10:14', 1, '2026-05-26 10:05:14'),
(348, 'bb2a3c28ba6a74d0b1d0d48cc904f0899abe056752c1ca94e3149b5e868906bc', 15, 1, '2026-05-28 09:45:19', 0, '2026-05-28 09:40:19'),
(349, 'f02c981e1161891b63374d073c135da23c919d411c1a885be930a46ccbed6787', 19, 1, '2026-05-28 09:45:24', 0, '2026-05-28 09:40:24'),
(350, 'a2a0a23f3829665e2d59df0771222d31b13e24f9819cfe3067415fdd1f0bfaf9', 19, 1, '2026-05-28 09:45:34', 0, '2026-05-28 09:40:33'),
(351, 'd0f1295637c5bde528b4c8639f30846fed05c15d2ee726b8a0e60a167f15b2d1', 19, 1, '2026-05-28 09:45:35', 0, '2026-05-28 09:40:34'),
(352, '2c7bcbdfe5c4d0e1ff1bd619755135f4ade889cd1944fe98a711a190b43a8f94', 15, 1, '2026-05-28 09:45:35', 0, '2026-05-28 09:40:35'),
(353, '6d46253cd32761c61528421ff8a86be828fad596d8bb239430497c70ae7b91b5', 15, 1, '2026-05-28 09:45:47', 0, '2026-05-28 09:40:47'),
(354, '5abfb268776478b318389a63df433e37771f25e8258b0359ad80ef289b12c8f6', 15, 1, '2026-05-28 09:46:05', 0, '2026-05-28 09:41:04'),
(355, '4b518b273fdb923bbb38a60cd341c9821e5aa46f2dbef0ff09d0cd3f05ca33e3', 27, 1, '2026-05-28 10:02:09', 0, '2026-05-28 09:57:09'),
(356, '1b60acfd4617c9b94a46601322514dac13768822aba158c7120009c6f3f69d19', 27, 1, '2026-05-28 10:02:21', 0, '2026-05-28 09:57:21'),
(357, 'daa42be0e0486e78f065ad734c954cb90957678d48b3a3ba08755b1920fc175a', 15, 1, '2026-05-28 14:24:27', 1, '2026-05-28 14:19:27'),
(358, '62179c8098a7ea79a3a3f45d1c71009055594bb633c6964a9aee86ac61abb5de', 27, 1, '2026-05-28 15:01:35', 1, '2026-05-28 14:56:34'),
(359, 'a9e3e3843acfa0c1e20f0438065b325b2cae6661dfb4d87737f59911e0dd949a', 32, 1, '2026-05-28 15:01:46', 1, '2026-05-28 14:56:46'),
(360, '76438fd054f2cafed4c7bd71f7e8ca72d0180818d6ca25abaa3eb90fe0413c5c', 25, 1, '2026-05-28 15:09:35', 1, '2026-05-28 15:04:34'),
(361, '8107676ddb0704a9dc931f37ea6f17fb2fa3a063c54d2a74c34eb594100027b6', 29, 1, '2026-05-28 15:11:28', 1, '2026-05-28 15:06:28'),
(362, '91c3164021cd449449810cb44cd0c9cdf421c95bf3593bd12ea8965adfeda3fb', 33, 1, '2026-05-28 15:13:10', 1, '2026-05-28 15:08:09'),
(363, '64543a38da12b86e894bdec60768af757c9c2b4aa85b8f2d0e90f0d33df8535d', 27, 1, '2026-05-28 15:20:58', 1, '2026-05-28 15:15:57'),
(364, '06519f2065de4bbe2caff984a2ef38af64224fef1b5c7f0acbcdbc02790f7c80', 19, 1, '2026-05-28 15:21:57', 1, '2026-05-28 15:16:56'),
(365, '962b290abec0e7186b940f7e8489c8c546d1507c6aa9510f3e70449a2657b480', 19, 1, '2026-05-28 15:21:57', 0, '2026-05-28 15:16:57'),
(366, '1d96cbcc994f136a7ea6b3414ed6d4d0de29b73fb63c7ae1ba18c15257b2f82a', 31, 1, '2026-05-28 15:22:33', 0, '2026-05-28 15:17:32'),
(367, '9d412811247ea97c26ddc777e04b101df92a685637d62c5087b838c6d3f2fc15', 26, 1, '2026-05-28 15:23:21', 0, '2026-05-28 15:18:21'),
(368, 'e4d2294452a4d8f537b2c0337cb5cfdf2801caa4e362079b37a15a092b769bf0', 19, 1, '2026-05-30 10:17:24', 0, '2026-05-30 10:12:23'),
(369, '8bcb2ea71d8e53deac58d99cd4ac1d911ee8de473979892fe6cd196badca8070', 19, 1, '2026-05-30 10:17:35', 0, '2026-05-30 10:12:34'),
(370, 'c6514e8e456d8c669f1154b30c6202f43139a5aa0cddaa36e9533302b1dec29c', 19, 3, '2026-05-30 14:31:54', 1, '2026-05-30 14:26:54'),
(371, '46ecdd5b1a813a4a8e392ae6e0ba76b849731002aa788be1e5dd395333e32e6f', 19, 3, '2026-05-30 14:55:28', 1, '2026-05-30 14:50:27'),
(372, 'efa715169c6a20ba1013d17fd06bc25d7b12776f9708759e3571d6240e97a1a2', 19, 1, '2026-05-30 14:55:47', 0, '2026-05-30 14:50:46'),
(373, 'e435c2b16a027fa5fe53865a074dc02cbcf05cff5e3b259df87a697a1cba56ea', 19, 1, '2026-05-30 14:55:58', 0, '2026-05-30 14:50:57'),
(374, 'ffc6d883e0930a0765625c0fc31572165e18c9a09b4bfdb9f82d8b8ef3bd8f41', 19, 1, '2026-05-30 14:55:58', 0, '2026-05-30 14:50:58'),
(375, '367c0454c8d6274407761145564e2d600e47b1e91c32476ead338280ed0ed714', 19, 1, '2026-05-30 16:14:08', 0, '2026-05-30 16:09:07'),
(376, '1a0eca1a4ae63769b26ae8cccedeb21a5f40fb3f7644b80a7d795dd62d6b6049', 15, 1, '2026-05-31 21:59:44', 1, '2026-05-31 21:54:43'),
(377, '112564c2a328b46d99b5ab414278d55335bbd2503955edb7cbbc661ca084ed91', 14, 1, '2026-05-31 21:59:57', 1, '2026-05-31 21:54:57'),
(378, '8cc4c58ea25c0cfd53e75c6e210ed56bee9cd864a0c79b5a8080b534fe2077eb', 14, 1, '2026-05-31 22:05:31', 1, '2026-05-31 22:00:31'),
(379, '792a732a8635a49c442d932bddc0425817e9348cd9b282d354e8ab69e4948b8d', 14, 1, '2026-05-31 22:07:44', 1, '2026-05-31 22:02:44'),
(380, '1f188d4e7efbec8d243c99d1e99019a12c5eb0b2408ea1cdfb0bb2b6486efd55', 36, 1, '2026-05-31 22:09:47', 1, '2026-05-31 22:04:47'),
(381, '93758b769e2c27e5bf751160fbddc841359c13b1fd3e509ccd290f5c693790ec', 37, 1, '2026-05-31 22:34:26', 1, '2026-05-31 22:29:26'),
(382, '4b05e4999aa888486e842fd964295a7fcb14fabe67a348512ce2cd753aa7bfaf', 15, 1, '2026-05-31 22:36:51', 1, '2026-05-31 22:31:50'),
(383, '00948330a96d93763a40e237088696bb85de94bd7ae5f2dfd5060c319259cb4a', 37, 3, '2026-05-31 22:50:34', 0, '2026-05-31 22:45:33'),
(384, 'f71c852b9542ad9762d7e0638efa3d6b2d7930b3f42311eca05e8b44eab2dd94', 15, 1, '2026-06-01 07:19:19', 1, '2026-06-01 07:14:19'),
(385, '80c7beba0fc07439921beef395de4f6226b9161ab324fef9e89ff0199521143f', 29, 1, '2026-06-01 09:51:34', 1, '2026-06-01 09:46:34'),
(386, '27d73aa524d6d0ac100986412eb544be1e24f2900e9126c1e0690573932db3e2', 29, 3, '2026-06-01 09:53:13', 0, '2026-06-01 09:48:13'),
(387, '63ea3bc21620195d39bcbba5f6f75989cd2f68de2b5facc2a07a0568ae143e72', 34, 1, '2026-06-01 13:12:24', 1, '2026-06-01 13:07:24');
INSERT INTO `SSOCode` (`code_id`, `code`, `user_id`, `system_id`, `expires_at`, `is_used`, `created_at`) VALUES
(388, 'd09b5d8a3994ad6d14f8681d436a3794a61d647113bbe01e079143494f169447', 37, 1, '2026-06-01 16:41:43', 1, '2026-06-01 16:36:42'),
(389, '4ae8a2bcc56f2995a5572fc60d656d1440a9ff6be5587f64b59d6556e184dd78', 36, 1, '2026-06-01 16:46:11', 1, '2026-06-01 16:41:10'),
(390, '59f8bbbddec4d60466154f5c6a9204e1ba5af0cd871f7153a4ec34fc52cd20ea', 15, 1, '2026-06-01 16:49:40', 1, '2026-06-01 16:44:40'),
(391, '857cc1cfefc844ae00fb280317db8928b278f4de0f50f4b244a98f48be359e36', 16, 1, '2026-06-01 16:57:09', 1, '2026-06-01 16:52:08'),
(392, 'b121a204eb57ec0f5eca18a9a68eea236a6863fcf317cae46a2ce1900525b996', 16, 1, '2026-06-01 23:31:40', 1, '2026-06-01 23:26:39'),
(393, 'ab3f360d3f270a251f7654ff846a9ef86d63293e38837e800bf339c98bf4e028', 34, 1, '2026-06-02 07:09:19', 1, '2026-06-02 07:04:19'),
(394, '9bb4ba74ab630d511f446dedbbeb38e8e4951899414630dfaedd6b99ae330f1d', 34, 1, '2026-06-02 07:12:30', 1, '2026-06-02 07:07:30'),
(395, 'd14f4d0b764ce132b52b4c4fb504404bfbcb575bc1cdffbee622182bb61c7d06', 15, 1, '2026-06-02 07:16:12', 1, '2026-06-02 07:11:12'),
(396, 'bcc9ba8b6e1fab5a47d4561fb5587b48d2fb4ff0afa482593f6111ef0b8626f0', 30, 1, '2026-06-02 08:15:40', 1, '2026-06-02 08:10:40'),
(397, '2aa522f4327e521302cde284db63f687b256c8015faad2a21f3c01cbe9809e34', 26, 1, '2026-06-02 08:20:52', 1, '2026-06-02 08:15:51'),
(398, '9b0279455cf72ed7109293d349490bbf62deafce08efc47f4ac013df44349a35', 15, 1, '2026-06-02 09:20:07', 1, '2026-06-02 09:15:07'),
(399, '17147fe6f7be1e7327c8ca161d3a7df32acda50b4a6ecdefe6b022b3c4a2363a', 34, 1, '2026-06-02 09:20:49', 1, '2026-06-02 09:15:48'),
(400, 'f77cc938718094665ec7438365dfc7457411af813b9c784a67400335810d3f2c', 15, 1, '2026-06-02 09:21:53', 1, '2026-06-02 09:16:52'),
(401, 'd2a1da783f8d068db7d4f65e4e19b7803e258ca89ab3118b3a44decd2447c002', 34, 1, '2026-06-02 09:23:40', 1, '2026-06-02 09:18:40'),
(402, '3e06667b1ead092c6e1fef65c79eddb07dbbe5ed240ef7af568ded1120cb0380', 27, 1, '2026-06-02 09:43:22', 1, '2026-06-02 09:38:22'),
(403, 'ed47c2e2fd5a37b360ceda14cefcd5a194268061e0191b28a8dec52d2b2325ab', 15, 1, '2026-06-02 09:45:45', 1, '2026-06-02 09:40:45'),
(404, 'a325b6c257767d34a8505aa4737ef7331c8238947c431712e7c7457d227bbfb4', 29, 1, '2026-06-02 09:53:40', 1, '2026-06-02 09:48:39'),
(405, 'ca2bca4a8a0682ffc1948dd1605a0910b3703167b8be52ddc0c4b1bfd9bc0af7', 34, 1, '2026-06-02 09:54:45', 1, '2026-06-02 09:49:45'),
(406, '89767cec048df4037047ed5ece8441cf19f08ac629a1ec466c5d811d85c7e4b6', 19, 1, '2026-06-02 09:58:47', 1, '2026-06-02 09:53:47'),
(407, '7b7534e52c449a3826173d83bc126515dbd8dfa824a7919e660907d53231afa6', 31, 1, '2026-06-02 10:18:32', 1, '2026-06-02 10:13:32'),
(408, '937942cc8a01f0430ba3c491449d8465f680ce33c9ee9b2585594324d2668c7a', 25, 1, '2026-06-02 10:19:11', 1, '2026-06-02 10:14:11'),
(409, '991125f430697a58524bab355a60f0c59f9934af9d55c83b186b5c7247e362a6', 25, 1, '2026-06-02 10:19:56', 1, '2026-06-02 10:14:56'),
(410, '41df87abb9b9d054fdfd249aa59c7b1fdd4fe23210476bd8a95fbe988ec9caf6', 15, 1, '2026-06-02 10:20:44', 1, '2026-06-02 10:15:43'),
(411, '1b670c336862eaf39e9a62ed86362e22c53178ef3e4101e0a95ffc6c1944164c', 33, 1, '2026-06-02 10:21:34', 1, '2026-06-02 10:16:34'),
(412, 'c0a7e896b3b20053fa4274350bc99db6cb8619e442fbf15a73cd1957636fc8fd', 28, 1, '2026-06-02 10:25:40', 1, '2026-06-02 10:20:40'),
(413, '865e2780d0eac320f86c3c716bc604166a4a4a34fb496ea4fc6fb528e1bb5582', 32, 3, '2026-06-02 10:31:06', 0, '2026-06-02 10:26:05'),
(414, '61e4d4b16bf0b78238f60728c3897f12f57965a4959c2072300ad8405197912f', 32, 1, '2026-06-02 10:31:10', 1, '2026-06-02 10:26:10'),
(415, 'c14d381371cb2352a02508f1179f7b8465b900809f74d5856251ba7280b4b775', 27, 1, '2026-06-02 10:38:27', 1, '2026-06-02 10:33:26'),
(416, '4fde7337001637522520d546f812a77150206c33e95aa7fc478279666a4c42a9', 15, 1, '2026-06-02 10:42:59', 1, '2026-06-02 10:37:58'),
(417, '1ebed38145f61324193e982905273e431d11dee382ec5ec3af0616251bb00fd4', 29, 1, '2026-06-02 14:27:15', 1, '2026-06-02 14:22:14'),
(418, 'c6e0ca8ffe2443cf0e7a0beb2aa6a8ac6f3bc5b21cc2540c369ca0975e691aa5', 33, 1, '2026-06-02 15:04:20', 1, '2026-06-02 14:59:19'),
(419, '66ead395d34b676305d0b2db6e9844f074938c69b3c6dc2d46c1166de7e30b81', 19, 3, '2026-06-02 17:29:00', 1, '2026-06-02 17:23:59'),
(420, 'bc969aaa0e8762b28ae9ed9c1b16d35f84bfadd40e566d4ea58e7c00c6aa4c22', 19, 3, '2026-06-02 17:29:01', 0, '2026-06-02 17:24:00'),
(421, '3dd913e0168f5b44a3942cfce0dfd502eb0a78e390ba6db2c4f8510eaf195238', 16, 1, '2026-06-02 17:38:07', 1, '2026-06-02 17:33:07'),
(422, '599f2528283b2e3c04038f1ae651f36c87aea56c3b72dbee954887cd6ea76c89', 19, 3, '2026-06-02 18:11:49', 1, '2026-06-02 18:06:48'),
(423, 'bde13505fcdcded0fea1943949ac71cb3c97671484dcb44378a9448c9f84af7b', 19, 3, '2026-06-02 18:37:21', 1, '2026-06-02 18:32:20'),
(424, '647f349374f57b162b90f7d3c57259b6795e4526df2c78ab08582f880a2a6bc8', 19, 3, '2026-06-02 18:47:50', 1, '2026-06-02 18:42:50'),
(425, 'aa767ec833a60d9c23dab272954a6b3c64ac78734df7c4f7990409bfb3cb166a', 16, 1, '2026-06-02 19:13:52', 1, '2026-06-02 19:08:51'),
(426, '89b1b49f2be6120631183d05b9378e43e688d22c7bfded01b25cc3031c769108', 19, 3, '2026-06-02 21:56:54', 1, '2026-06-02 21:51:53'),
(427, '719fa61ed7c2afa9de11c23bc5a4c65fdd7ceeaf81b4e9b6a778ea7bf7976a8a', 19, 3, '2026-06-02 21:56:54', 0, '2026-06-02 21:51:54'),
(428, '0b87aecb1ae2548484c102baf7332e4b05e15bec24a061af7b72531d6c28a2b4', 19, 1, '2026-06-02 22:00:15', 1, '2026-06-02 21:55:15'),
(429, '83e4e4a53e88d5d9089b18d5cb48a7cd9ca7afb243baaf33c1ee9d8529c8ce2c', 19, 3, '2026-06-02 22:04:10', 1, '2026-06-02 21:59:10'),
(430, '19331c14838e3de5c6e85205c31b9e5e167f7094f984623971ec54c1306aea50', 19, 3, '2026-06-02 22:04:11', 0, '2026-06-02 21:59:11'),
(431, 'de97ff305c2ca22cb45d5b7d203a863e7e528f15b63b787559d9eda61d65f1a6', 19, 3, '2026-06-02 22:05:45', 1, '2026-06-02 22:00:44'),
(432, '78ace7fd20b998483d9fb2e710cc2e6ae2791516e1ff52f1625c01c823afaca0', 19, 3, '2026-06-02 22:05:46', 0, '2026-06-02 22:00:45'),
(433, '7c995197d15f5f6a02ab025515002767adcbff4d6dfc14827e0da914358a7ae9', 16, 1, '2026-06-02 22:06:10', 1, '2026-06-02 22:01:10'),
(434, 'ee7701d762c87726172d4fb4659f75130485b97884002c0574b03dbcfc0cb410', 19, 3, '2026-06-02 22:10:01', 1, '2026-06-02 22:05:01'),
(435, 'aa046c7e36f9c73cf599930c992f01261473a68809385a3a8abe27a83ea1974f', 19, 3, '2026-06-02 22:10:02', 0, '2026-06-02 22:05:02'),
(436, '53b0805341eec3ea36207a80d429cfab5bd8c623696093bcca505ea5b55ca78d', 19, 3, '2026-06-02 22:13:56', 1, '2026-06-02 22:08:55'),
(437, 'ac55d16c98e9b63e13577881e90fbba6fd161c5a6f2fb20f69606e77082d3a1a', 19, 3, '2026-06-02 22:14:37', 1, '2026-06-02 22:09:36'),
(438, '37874363a9adfa707284e0efa0d5cc08fc7f35dd10a2a96cb8f735fce2c5a11d', 19, 3, '2026-06-02 22:16:12', 1, '2026-06-02 22:11:12'),
(439, 'b309f3f825e679f4778aeedd9d4df4eb409b47f7d45e1cf94494c8d276477f23', 16, 1, '2026-06-02 22:32:23', 1, '2026-06-02 22:27:22'),
(440, '94566391f288d9e64fe6ad25abebad2e38be834cc4ecf6dc0da17464fd08ff6d', 37, 1, '2026-06-02 22:36:45', 1, '2026-06-02 22:31:45'),
(441, '4fadc8c380e1dfbfa7d56703b88e139e3930a53b08e5d78873dc2f60b00dbc68', 37, 1, '2026-06-02 22:39:15', 1, '2026-06-02 22:34:15'),
(442, 'e9512461a8b89ac3627c6db11b8ce9505cfa0a0593e6b37fb31ec3fdc7db19c9', 16, 1, '2026-06-02 22:40:56', 1, '2026-06-02 22:35:56'),
(443, 'c01cee2880e223ae0d98da21f4dd606381befa46b1414d06765aef1fd3ac1e0b', 37, 1, '2026-06-02 22:41:38', 1, '2026-06-02 22:36:37'),
(444, '30d2d7ba1ae798ba4bc018e8b30e672efa876df69a156be300749b814f4853e5', 19, 3, '2026-06-02 22:42:33', 0, '2026-06-02 22:37:32'),
(445, '4656334dc1ca1ad18c847b78babe74c776b6803c04532bb810488997b90e107e', 19, 3, '2026-06-02 22:42:34', 1, '2026-06-02 22:37:33'),
(446, '4ecc7dfb3946916f02b97eb1399994445a06ff8c8af78ab83f18eb8246124c99', 37, 1, '2026-06-02 23:11:42', 1, '2026-06-02 23:06:41'),
(447, 'ec585808a1ab81d9ae2c807c71d8d0c13321174533125e239efcc11cd5b97032', 37, 1, '2026-06-02 23:12:15', 1, '2026-06-02 23:07:14'),
(448, '91760f9ca64adba891f2e05145ccd61db02ee48941641dab6e45dcbe7f5c3e9f', 16, 1, '2026-06-02 23:13:55', 1, '2026-06-02 23:08:55'),
(449, '39bb9891934bfa73faac4df0864d4f845d5276020b0325d1db99d88f5254fee7', 15, 1, '2026-06-03 07:22:54', 1, '2026-06-03 07:17:53'),
(450, '95bf52be21f8376e6039065348945f8c7f998b7a0bca95fa1cfc74039ccccc45', 15, 1, '2026-06-03 08:45:02', 1, '2026-06-03 08:40:02'),
(451, 'bcd6c2c452d8b47411c4592cbdf3d848edf7081ae6c21379cbfb9ae65660b582', 30, 1, '2026-06-03 10:28:13', 0, '2026-06-03 10:23:13'),
(452, '0ee2d753d2716dba881f13432816d0ebcea61baa6092c4b1293cd5ecb2566cd2', 30, 1, '2026-06-03 10:30:16', 0, '2026-06-03 10:25:16'),
(453, 'fa53f00ef599b1b6763d4f52d0c265e568d3580b60b359c3115387d6913e7401', 30, 1, '2026-06-03 10:31:32', 0, '2026-06-03 10:26:31'),
(454, 'fd5e044a734dd4c87bb8941d4632fb7bf9732f7407b27a203e0aea37b03bb05e', 30, 1, '2026-06-03 11:47:27', 1, '2026-06-03 11:42:27'),
(455, 'f0baa1d4510d9eacd9c05142aebaaa86a1d4bd5afa340ae210edb22bbcc9a2d9', 16, 1, '2026-06-03 11:50:05', 1, '2026-06-03 11:45:04'),
(456, '9c1b0c095aa6293e387dbb01cbf8a2a611d105723ff14ec2dbc501aa7b902479', 16, 1, '2026-06-03 11:50:28', 1, '2026-06-03 11:45:27'),
(457, '46d5607233c9cc314612e0ebf74c3f9728520bad750499bf66bfcd1c7cc77953', 27, 1, '2026-06-03 12:06:28', 1, '2026-06-03 12:01:27'),
(458, 'a4896c6aa843ac5677eed95af11cccb03b666f29826da2d087faf3f8407ddf35', 26, 1, '2026-06-03 12:07:05', 1, '2026-06-03 12:02:04'),
(459, '9e855ea9cc2f101edbc82f491fab851263c9c7f36183f0f628f752a595fed77d', 15, 1, '2026-06-03 12:19:26', 1, '2026-06-03 12:14:26'),
(460, '29fcc64ef3baf27b13ca632bc1f73168d2239733542d50bc4d4bea5a0ca3fbe2', 16, 1, '2026-06-03 12:24:01', 1, '2026-06-03 12:19:01'),
(461, '760a93840be86612456967645db828dab7065ce3fe9f131fa4c5041dfeb79f63', 32, 1, '2026-06-03 12:37:55', 1, '2026-06-03 12:32:55'),
(462, 'f7e7b60a9b5763b52319e1e57e502c8d23316528e45c2da6eb97fab8b9c5ba41', 25, 1, '2026-06-03 12:38:57', 1, '2026-06-03 12:33:57'),
(463, 'f063d4bfc8b4f7a40403b27d08d845c0f92d63702e5a17757336430f0d8d2aa4', 34, 1, '2026-06-03 12:59:54', 1, '2026-06-03 12:54:54'),
(464, '333d6886f4deb590630af7cfdd1043ab6f49d64df5977861b7e0226f03912883', 19, 1, '2026-06-03 13:05:55', 1, '2026-06-03 13:00:55'),
(465, '399dfa8c820a4e63665c8752e3a9334fc499a4fde1d4f518282d8b0d73fbc8c5', 31, 1, '2026-06-03 13:30:09', 1, '2026-06-03 13:25:09'),
(466, 'a957488be30f95eedb5c38bdea9c8ed14e7a50af4e4682f234d946b8e77c8daf', 27, 1, '2026-06-03 13:32:30', 1, '2026-06-03 13:27:30'),
(467, 'ffd651de4102512feb9550e173c885078ce7af7ea57d97b71dcef870243a2fef', 28, 1, '2026-06-03 13:46:15', 1, '2026-06-03 13:41:15'),
(468, 'a52ee39534a37a9711e5c44418ae5a5e6f5a2b7c741e91bbd36d3a608f82f73f', 19, 3, '2026-06-03 16:07:16', 0, '2026-06-03 16:02:15'),
(469, 'ea857b6cf96c9a574db0927bbfeddd4e36af56cfd0c44625186dec071b1a0852', 19, 3, '2026-06-03 16:07:16', 0, '2026-06-03 16:02:15'),
(470, '4312d165b8220c49a58a26fdb433cccd7fe27efd357814fac84bf36e4304b712', 19, 3, '2026-06-03 16:07:22', 0, '2026-06-03 16:02:21'),
(471, '0e641f56c2a46761e8716c04b981c3c532821feecd808a55d4486ba1ec05ce7c', 32, 1, '2026-06-03 16:16:52', 1, '2026-06-03 16:11:52'),
(472, '0ffdc88828be8915cf4bd4348d9cf38e2b88f7eed82d2ff6ca019ba1ade63106', 33, 1, '2026-06-03 16:19:17', 1, '2026-06-03 16:14:16'),
(473, '81b639b856582559ca4f06abdf3e7338de8d7000842e64c43106a523bbf752b7', 19, 3, '2026-06-03 18:00:02', 1, '2026-06-03 17:55:01'),
(474, 'a971a7b138965e7d8c2ea61931aca9c55624c01971fc21d0d65fac031d4eb2ac', 19, 3, '2026-06-03 18:00:02', 0, '2026-06-03 17:55:02'),
(475, 'e64ddb110cfa556831e15b69c65498c966a029cd3b48e9f81d6a51c5dfb56f2d', 19, 3, '2026-06-04 07:37:44', 1, '2026-06-04 07:32:44'),
(476, '7539191cd2e829459f30962d380a39620b436870f18c61d1139861c9ceaf922e', 19, 3, '2026-06-04 07:37:45', 0, '2026-06-04 07:32:45'),
(477, '1c3b5c36462a4a32591552f603d42153e41bc511a0ee2d10d093482ca20a52fd', 15, 1, '2026-06-04 08:50:27', 1, '2026-06-04 08:45:27'),
(478, '0b1a1441c68074d76ea519220b55bf485988eb13c484f910bc7fd978ea4b8c1a', 33, 1, '2026-06-04 09:17:38', 1, '2026-06-04 09:12:38'),
(479, '69a66417c90c405ebe40e0e3b31ad59797c0d451b773d18299716820123c637e', 28, 1, '2026-06-04 09:19:22', 1, '2026-06-04 09:14:21'),
(480, 'e0564b1f10c9ea5f2d20b220d76f73c5354c7fe93e860ce16b1c30577abb6698', 29, 1, '2026-06-04 09:20:16', 1, '2026-06-04 09:15:15'),
(481, '1bc71d64fa0c0527990beb44899580e0639dcf0fd28101ef506739b34ff3ec7e', 27, 1, '2026-06-04 09:53:36', 1, '2026-06-04 09:48:36');

-- --------------------------------------------------------

--
-- Table structure for table `StudentClassGroup`
--

CREATE TABLE `StudentClassGroup` (
  `user_id` bigint NOT NULL,
  `class_group_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `StudentClassGroup`
--

INSERT INTO `StudentClassGroup` (`user_id`, `class_group_id`, `assigned_at`, `status`) VALUES
(19, 9, '2026-01-18 19:05:37', 'ACTIVE'),
(25, 9, '2026-03-07 19:32:24', 'ACTIVE'),
(26, 9, '2026-03-07 19:34:48', 'ACTIVE'),
(27, 9, '2026-03-07 19:33:45', 'ACTIVE'),
(28, 9, '2026-03-07 19:36:01', 'ACTIVE'),
(29, 9, '2026-03-07 19:37:08', 'ACTIVE'),
(30, 9, '2026-03-07 19:38:10', 'ACTIVE'),
(31, 9, '2026-03-07 19:39:14', 'ACTIVE'),
(32, 9, '2026-03-07 19:40:15', 'ACTIVE'),
(33, 9, '2026-03-07 19:41:11', 'ACTIVE'),
(34, 9, '2026-04-30 07:54:18', 'ACTIVE'),
(36, 9, '2026-05-31 21:59:32', 'ACTIVE'),
(37, 9, '2026-05-31 22:26:18', 'ACTIVE');

-- --------------------------------------------------------

--
-- Table structure for table `StudentSubjectEnrollment`
--

CREATE TABLE `StudentSubjectEnrollment` (
  `user_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `academic_year_id` bigint NOT NULL,
  `enrolled_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `StudentSubjectEnrollment`
--

INSERT INTO `StudentSubjectEnrollment` (`user_id`, `subject_id`, `academic_year_id`, `enrolled_at`, `status`) VALUES
(19, 8, 3, '2026-01-18 19:47:13', 'ACTIVE'),
(19, 9, 3, '2026-01-18 19:35:50', 'ACTIVE'),
(19, 10, 3, '2026-02-26 16:15:06', 'ACTIVE'),
(19, 11, 3, '2026-02-26 16:14:54', 'ACTIVE'),
(19, 12, 3, '2026-02-26 16:13:36', 'ACTIVE'),
(19, 13, 3, '2026-01-22 12:19:43', 'ACTIVE'),
(19, 14, 3, '2026-01-22 12:19:32', 'ACTIVE'),
(25, 8, 3, '2026-03-07 19:33:12', 'ACTIVE'),
(25, 9, 3, '2026-03-07 19:33:06', 'ACTIVE'),
(25, 10, 3, '2026-03-07 19:33:24', 'ACTIVE'),
(25, 11, 3, '2026-03-07 19:33:17', 'ACTIVE'),
(25, 12, 3, '2026-03-07 19:33:00', 'ACTIVE'),
(25, 13, 3, '2026-03-07 19:32:49', 'ACTIVE'),
(25, 14, 3, '2026-03-07 19:32:31', 'ACTIVE'),
(26, 8, 3, '2026-03-07 19:35:21', 'ACTIVE'),
(26, 9, 3, '2026-03-07 19:35:16', 'ACTIVE'),
(26, 10, 3, '2026-03-07 19:35:32', 'ACTIVE'),
(26, 11, 3, '2026-03-07 19:35:27', 'ACTIVE'),
(26, 12, 3, '2026-03-07 19:35:10', 'ACTIVE'),
(26, 13, 3, '2026-03-07 19:34:58', 'ACTIVE'),
(26, 14, 3, '2026-03-07 19:35:04', 'ACTIVE'),
(27, 8, 3, '2026-03-07 19:34:16', 'ACTIVE'),
(27, 9, 3, '2026-03-07 19:34:10', 'ACTIVE'),
(27, 10, 3, '2026-03-07 19:34:26', 'ACTIVE'),
(27, 11, 3, '2026-03-07 19:34:20', 'ACTIVE'),
(27, 12, 3, '2026-03-07 19:33:58', 'ACTIVE'),
(27, 13, 3, '2026-03-07 19:34:04', 'ACTIVE'),
(27, 14, 3, '2026-03-07 19:33:52', 'ACTIVE'),
(28, 8, 3, '2026-03-07 19:36:33', 'ACTIVE'),
(28, 9, 3, '2026-03-07 19:36:28', 'ACTIVE'),
(28, 10, 3, '2026-03-07 19:36:44', 'ACTIVE'),
(28, 11, 3, '2026-03-07 19:36:40', 'ACTIVE'),
(28, 12, 3, '2026-03-07 19:36:18', 'ACTIVE'),
(28, 13, 3, '2026-03-07 19:36:22', 'ACTIVE'),
(28, 14, 3, '2026-03-07 19:36:11', 'ACTIVE'),
(29, 8, 3, '2026-03-07 19:37:46', 'ACTIVE'),
(29, 9, 3, '2026-03-07 19:37:40', 'ACTIVE'),
(29, 10, 3, '2026-03-07 19:37:56', 'ACTIVE'),
(29, 11, 3, '2026-03-07 19:37:52', 'ACTIVE'),
(29, 12, 3, '2026-03-07 19:37:21', 'ACTIVE'),
(29, 13, 3, '2026-03-07 19:37:27', 'ACTIVE'),
(29, 14, 3, '2026-03-07 19:37:15', 'ACTIVE'),
(30, 8, 3, '2026-03-07 19:38:37', 'ACTIVE'),
(30, 9, 3, '2026-03-07 19:38:32', 'ACTIVE'),
(30, 10, 3, '2026-03-07 19:38:51', 'ACTIVE'),
(30, 11, 3, '2026-03-07 19:38:44', 'ACTIVE'),
(30, 12, 3, '2026-03-07 19:38:22', 'ACTIVE'),
(30, 13, 3, '2026-03-07 19:38:27', 'ACTIVE'),
(30, 14, 3, '2026-03-07 19:38:17', 'ACTIVE'),
(31, 8, 3, '2026-03-07 19:39:49', 'ACTIVE'),
(31, 9, 3, '2026-03-07 19:39:44', 'ACTIVE'),
(31, 10, 3, '2026-03-07 19:39:58', 'ACTIVE'),
(31, 11, 3, '2026-03-07 19:39:54', 'ACTIVE'),
(31, 12, 3, '2026-03-07 19:39:33', 'ACTIVE'),
(31, 13, 3, '2026-03-07 19:39:39', 'ACTIVE'),
(31, 14, 3, '2026-03-07 19:39:27', 'ACTIVE'),
(32, 8, 3, '2026-03-07 19:40:46', 'ACTIVE'),
(32, 9, 3, '2026-03-07 19:40:40', 'ACTIVE'),
(32, 10, 3, '2026-03-07 19:40:58', 'ACTIVE'),
(32, 11, 3, '2026-03-07 19:40:52', 'ACTIVE'),
(32, 12, 3, '2026-03-07 19:40:29', 'ACTIVE'),
(32, 13, 3, '2026-03-07 19:40:35', 'ACTIVE'),
(32, 14, 3, '2026-03-07 19:40:23', 'ACTIVE'),
(33, 8, 3, '2026-03-07 19:41:59', 'ACTIVE'),
(33, 9, 3, '2026-03-07 19:41:52', 'ACTIVE'),
(33, 10, 3, '2026-03-07 19:42:34', 'ACTIVE'),
(33, 11, 3, '2026-03-07 19:42:10', 'ACTIVE'),
(33, 12, 3, '2026-03-07 19:41:39', 'ACTIVE'),
(33, 13, 3, '2026-03-07 19:41:46', 'ACTIVE'),
(33, 14, 3, '2026-03-07 19:41:28', 'ACTIVE'),
(34, 8, 3, '2026-04-30 10:09:13', 'ACTIVE'),
(34, 9, 3, '2026-04-30 07:54:47', 'ACTIVE'),
(36, 8, 3, '2026-05-31 22:06:59', 'ACTIVE'),
(37, 8, 3, '2026-05-31 22:26:30', 'ACTIVE'),
(37, 9, 3, '2026-06-02 22:32:00', 'ACTIVE'),
(37, 10, 3, '2026-06-02 22:31:36', 'ACTIVE'),
(37, 11, 3, '2026-06-02 22:31:24', 'ACTIVE'),
(37, 12, 3, '2026-06-02 22:31:15', 'ACTIVE'),
(37, 13, 3, '2026-06-02 22:31:54', 'ACTIVE'),
(37, 14, 3, '2026-06-02 22:31:48', 'ACTIVE'),
(37, 16, 3, '2026-06-02 22:32:06', 'ACTIVE');

-- --------------------------------------------------------

--
-- Table structure for table `Subject`
--

CREATE TABLE `Subject` (
  `subject_id` bigint NOT NULL,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `course_category_id` bigint DEFAULT NULL,
  `max_marks` int DEFAULT NULL,
  `blooms_taxonomy_level_id` bigint DEFAULT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#3B82F6'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Subject`
--

INSERT INTO `Subject` (`subject_id`, `code`, `name`, `description`, `status`, `course_category_id`, `max_marks`, `blooms_taxonomy_level_id`, `color`) VALUES
(8, 'SPEGI302', 'Graphic User Interface Design', NULL, 'ACTIVE', 1, 100, NULL, '#1fd63d'),
(9, 'SPEWI302', 'Development of Web User Interface', NULL, 'ACTIVE', 1, 100, NULL, '#3c2eff'),
(10, 'SPEWJ302', 'Web Application Development Using JavaScript', NULL, 'ACTIVE', 1, 100, NULL, '#b45e0e'),
(11, 'SPEPE301', 'Programming Fundamentals Using C', NULL, 'ACTIVE', 1, 100, NULL, '#3B82F6'),
(12, 'SFPCB302', 'Computer Basics', NULL, 'ACTIVE', 1, 100, NULL, '#b2b517'),
(13, 'SFPWP301', 'Develop Web Application Using PHP', NULL, 'ACTIVE', 1, 100, NULL, '#c310c6'),
(14, 'SPEDD302', 'Apply Basic Database Development', NULL, 'ACTIVE', 1, 100, NULL, '#3B82F6'),
(15, 'SFPNF301', 'Networking Fundamentals', NULL, 'DISABLED', 1, 100, NULL, '#3B82F6'),
(16, 'GENEG302', 'Maintain Professional Conversation', 'Maintain Professional Conversation in Upper Intermediate Technical English in SPES', 'ACTIVE', 2, 100, NULL, '#3B82F6'),
(17, 'NET0001', 'Networking fundamentals', 'Networking fundamentals', 'ACTIVE', 1, 100, NULL, '#6da800');

-- --------------------------------------------------------

--
-- Table structure for table `SubjectCompetency`
--

CREATE TABLE `SubjectCompetency` (
  `competency_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `element_number` int NOT NULL DEFAULT '1',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `SubjectDocument`
--

CREATE TABLE `SubjectDocument` (
  `document_id` bigint NOT NULL,
  `category_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `competency_id` bigint DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_extension` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `SubjectDocumentCategory`
--

CREATE TABLE `SubjectDocumentCategory` (
  `category_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#3B82F6',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `System`
--

CREATE TABLE `System` (
  `system_id` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `client_id` varchar(100) DEFAULT NULL,
  `client_secret` varchar(255) DEFAULT NULL,
  `allowed_redirect_uris` text,
  `status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `icon_url` varchar(255) NOT NULL,
  `home_url` varchar(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `System`
--

INSERT INTO `System` (`system_id`, `name`, `description`, `client_id`, `client_secret`, `allowed_redirect_uris`, `status`, `created_at`, `icon_url`, `home_url`) VALUES
(1, 'TaskMentor', 'Assignments, Quizzes with Proctoring', 'taskmentor_app', '0a06473eddf18e31db673648e3bad64a0dea33e4635611b6461e54d5dec4582d', 'https://nga.ac.rw/taskmentor/sso/callback,http://localhost:5173/taskmentor/sso/callback', 'ACTIVE', '2026-01-25 12:09:29', 'https://nga.ac.rw/taskmentor/favicon.ico', 'https://nga.ac.rw/taskmentor/'),
(2, 'Team', 'Chat App', 'team_app', 'd8148e687737253536881234950809268972da18d77ddc6f4d7714f00d07ece7', 'https://nga.ac.rw/mis/callback', 'ACTIVE', '2026-02-26 16:16:41', 'https://i.pinimg.com/1200x/0b/36/5b/0b365ba2bb5c34fe14f20bd9fe2e2e99.jpg', 'https://nga.ac.rw/mis/'),
(3, 'Discipline & Attendance', 'Discipline & Attendance', 'discipline_attendance', 'c619a0cab7da9227b3cd3aa29b611ea259ad86171e34bd5a1e6c5e529df806ce', 'http://localhost:3000/callback', 'ACTIVE', '2026-05-30 13:04:47', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJkAAACUCAMAAAC3HHtWAAAAY1BMVEU3i07///8phkTH28wviEj1+fYhgz8ziUuhxKrP39JbnGt9sIpgn3CWvaAcgjvt9O/m7+gTgDZKlF5CkFcAfC291cNppHjV5Nnc6d+oyLCItZO20b1UmWZvp32uzLaPuZkAdBeslXmcAAAKEklEQVR4nMWc66KiIBCAEREqEzXzkmnt+z/lg', 'https://localhost:3000');

-- --------------------------------------------------------

--
-- Table structure for table `TeacherSubjectAssignment`
--

CREATE TABLE `TeacherSubjectAssignment` (
  `user_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `class_group_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `TeacherSubjectAssignment`
--

INSERT INTO `TeacherSubjectAssignment` (`user_id`, `subject_id`, `class_group_id`, `assigned_at`) VALUES
(13, 10, 9, '2026-01-13 18:22:11'),
(14, 13, 9, '2026-01-22 12:10:47'),
(14, 14, 9, '2026-01-22 12:10:28'),
(15, 8, 9, '2026-01-13 18:38:39'),
(15, 9, 9, '2026-01-13 18:38:27'),
(15, 12, 9, '2026-06-03 12:13:54'),
(16, 11, 9, '2026-01-14 08:51:04'),
(16, 12, 9, '2026-01-14 08:50:36'),
(17, 11, 9, '2026-03-05 09:12:21'),
(23, 17, 9, '2026-06-04 10:59:55'),
(35, 16, 9, '2026-05-31 12:53:40');

-- --------------------------------------------------------

--
-- Table structure for table `User`
--

CREATE TABLE `User` (
  `user_id` bigint NOT NULL,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','SUSPENDED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `preferred_theme` enum('light','dark') COLLATE utf8mb4_unicode_ci DEFAULT 'light'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `User`
--

INSERT INTO `User` (`user_id`, `username`, `email`, `phone_number`, `status`, `created_at`, `updated_at`, `preferred_theme`) VALUES
(1, 'superadmin', 'emmanuelniyongabo44@gmail.com', '0798000045', 'ACTIVE', '2026-01-05 18:44:55', '2026-03-19 15:49:03', 'dark'),
(13, 'tuyishimire', 'tuyishimireericc@gmail.com', '0780313448', 'ACTIVE', '2026-01-13 17:40:07', '2026-01-13 17:40:07', 'light'),
(14, 'niyitegeka', 'faustin.niyitegeka@gmail.com', '0788600976', 'ACTIVE', '2026-01-13 17:42:24', '2026-01-13 17:42:24', 'light'),
(15, 'niyongaboemma', 'emmanuelniyongabo@nga.ac.rw', '0782634364', 'ACTIVE', '2026-01-13 17:45:56', '2026-06-03 12:47:23', 'dark'),
(16, 'ndazivunnyefelix08', 'ndazivunnyefelix08@gmail.com', '0783409722', 'ACTIVE', '2026-01-13 18:42:45', '2026-05-31 22:57:15', 'light'),
(17, 'assadou', 'assadunsba@nga.ac.rw', '0798538082', 'ACTIVE', '2026-01-13 22:41:43', '2026-01-13 22:41:43', 'light'),
(18, 'AssadouAdmin', 'ngacodingacademy@nga.ac.rw', NULL, 'ACTIVE', '2026-01-15 08:04:18', '2026-01-15 08:04:18', 'light'),
(19, 'levi', 'getmorelev@gmail.com', NULL, 'ACTIVE', '2026-01-18 18:15:18', '2026-06-03 16:04:16', 'dark'),
(20, 'jeandedieu', 'jeandedieunshimiyimana@gmail.com', NULL, 'ACTIVE', '2026-02-26 09:00:40', '2026-02-26 09:00:40', 'light'),
(21, 'JeanWilly', 'jeanwillyh@nga.ac.rw', NULL, 'ACTIVE', '2026-03-05 11:45:26', '2026-03-05 11:45:26', 'light'),
(22, 'christine', 'ingachrina@nga.ac.rw', NULL, 'INACTIVE', '2026-03-05 11:46:27', '2026-05-31 12:51:19', 'light'),
(23, 'leonntabomvura', 'leonntabomvura@nga.ac.rw', NULL, 'ACTIVE', '2026-03-05 11:47:29', '2026-03-05 11:47:29', 'light'),
(24, 'Josephine', 'josephine@nga.ac.rw', NULL, 'ACTIVE', '2026-03-05 11:48:26', '2026-03-05 11:48:26', 'light'),
(25, 'kheillavera', 'irakozegwizakheillavera@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:51:48', '2026-03-10 09:15:38', 'dark'),
(26, 'Keny Kelvin', 'ikennykelvin75@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:47', '2026-06-03 13:49:31', 'dark'),
(27, 'Oceanne', 'utujeocean@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:48', '2026-03-17 05:48:09', 'dark'),
(28, 'Deborah', 'isarodeborah85@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:49', '2026-03-17 09:10:28', 'dark'),
(29, 'Gaella', 'ninzizagaella416@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:50', '2026-06-02 14:23:38', 'dark'),
(30, 'Malvyn', 'malvyn304@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:51', '2026-04-29 12:22:46', 'dark'),
(31, 'Tiana', 'tiana.tunga@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:52', '2026-03-10 19:43:49', 'dark'),
(32, 'Brian', 'bhirwa344@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:53', '2026-05-05 09:20:22', 'dark'),
(33, 'Alpha', 'tigerkev07@gmail.com', NULL, 'ACTIVE', '2026-03-05 11:58:54', '2026-04-29 03:10:11', 'dark'),
(34, 'TestUser', 'universalbridgeltd@gmail.com', NULL, 'ACTIVE', '2026-04-30 07:43:33', '2026-04-30 07:43:33', 'light'),
(35, 'ingabire', 'charlieingabire1@gmail.com', '+250 788 523 436', 'ACTIVE', '2026-05-31 12:50:31', '2026-05-31 12:50:31', 'light'),
(36, 'Faustin', 'faustinganzasheila@gmail.com', NULL, 'ACTIVE', '2026-05-31 21:59:03', '2026-05-31 21:59:03', 'light'),
(37, 'Felixx', 'ndazivunnyefelix@nga.ac.rw', NULL, 'ACTIVE', '2026-05-31 22:25:48', '2026-05-31 22:25:48', 'light');

-- --------------------------------------------------------

--
-- Table structure for table `UserGrade`
--

CREATE TABLE `UserGrade` (
  `user_id` bigint NOT NULL,
  `grade_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `UserGrade`
--

INSERT INTO `UserGrade` (`user_id`, `grade_id`, `assigned_at`) VALUES
(17, 9, '2026-01-13 22:44:56');

-- --------------------------------------------------------

--
-- Table structure for table `UserProfile`
--

CREATE TABLE `UserProfile` (
  `profile_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` enum('MALE','FEMALE','OTHER') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_type` enum('STUDENT','TEACHER','ADMIN','PARENT','STAFF') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `UserProfile`
--

INSERT INTO `UserProfile` (`profile_id`, `user_id`, `first_name`, `last_name`, `gender`, `date_of_birth`, `address`, `user_type`, `external_id`, `created_at`, `updated_at`) VALUES
(1, 1, 'Niyongabo', 'Emmanuel', 'MALE', NULL, NULL, 'ADMIN', NULL, '2026-01-06 22:46:58', '2026-01-06 22:46:58'),
(13, 13, 'Tuyishimire', 'Eric', 'MALE', NULL, NULL, 'TEACHER', NULL, '2026-01-13 17:40:08', '2026-01-13 17:40:08'),
(14, 14, 'Niyitegeka', 'Faustin', 'MALE', NULL, NULL, 'TEACHER', NULL, '2026-01-13 17:42:25', '2026-01-13 17:42:25'),
(15, 15, 'Niyongabo', 'Emmanuel', 'MALE', '1996-01-01', 'Kigali Rwanda', 'TEACHER', NULL, '2026-01-13 17:45:57', '2026-01-13 17:45:57'),
(16, 16, 'Ndazivunnye', 'Felix', 'MALE', NULL, 'Kigali Gatenga', 'TEACHER', NULL, '2026-01-13 18:42:46', '2026-03-19 16:03:08'),
(17, 17, 'Assadou', 'Assadou', 'MALE', NULL, NULL, 'STAFF', NULL, '2026-01-13 22:41:43', '2026-01-13 22:41:43'),
(18, 18, NULL, NULL, NULL, NULL, NULL, 'STAFF', NULL, '2026-01-15 08:04:18', '2026-01-15 08:04:18'),
(19, 19, 'Levi', 'Gatimu', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-01-18 18:15:19', '2026-01-18 18:15:19'),
(20, 20, NULL, NULL, NULL, NULL, NULL, 'TEACHER', NULL, '2026-02-26 09:00:41', '2026-02-26 09:00:41'),
(21, 21, 'Jean Willy', 'Habimana', 'MALE', NULL, NULL, 'TEACHER', NULL, '2026-03-05 11:45:27', '2026-03-05 11:45:27'),
(22, 22, 'Christine', 'Ingabire', 'FEMALE', NULL, NULL, 'TEACHER', NULL, '2026-03-05 11:46:28', '2026-03-05 11:46:28'),
(23, 23, 'Leon', 'Ntabomvura', 'MALE', NULL, NULL, 'TEACHER', NULL, '2026-03-05 11:47:29', '2026-03-05 11:47:29'),
(24, 24, 'Josephine', 'Nyiranzeyimana', NULL, NULL, NULL, 'STAFF', NULL, '2026-03-05 11:48:26', '2026-03-05 11:48:26'),
(25, 25, 'Kheilla Vera', 'Irakoze Gwiza', 'FEMALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:51:49', '2026-03-05 11:51:49'),
(26, 26, 'KENY KELVIN', 'Ishimwe', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:47', '2026-03-05 11:58:47'),
(27, 27, 'Oceanne Camilla', 'Utuje', 'FEMALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:48', '2026-03-05 11:58:48'),
(28, 28, 'Deborah', 'Isaro', 'FEMALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:50', '2026-03-05 11:58:50'),
(29, 29, 'Gaella', 'Ninziza Ndizihiwe', 'FEMALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:50', '2026-03-05 11:58:50'),
(30, 30, 'Malvyn', 'Nkusi', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:51', '2026-03-05 11:58:51'),
(31, 31, 'TUNGA', 'Tiana', 'FEMALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:52', '2026-03-10 19:44:52'),
(32, 32, 'Brian', 'HIRWA', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:53', '2026-03-05 11:58:53'),
(33, 33, 'Alpha', 'Mugisha', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-03-05 11:58:54', '2026-03-05 11:58:54'),
(34, 34, 'Test', 'Student', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-04-30 07:43:33', '2026-04-30 07:43:33'),
(35, 35, 'Ingabire', 'Christine', 'FEMALE', NULL, 'Kigali', 'TEACHER', NULL, '2026-05-31 12:50:32', '2026-05-31 12:50:32'),
(36, 36, 'Faustin', 'Niyitegeka', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-05-31 21:59:04', '2026-05-31 21:59:04'),
(37, 37, 'Felix', 'Ndazivunnye', 'MALE', NULL, NULL, 'STUDENT', NULL, '2026-05-31 22:25:49', '2026-05-31 22:25:49');

-- --------------------------------------------------------

--
-- Table structure for table `UserProgramLead`
--

CREATE TABLE `UserProgramLead` (
  `user_id` bigint NOT NULL,
  `program_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `UserRole`
--

CREATE TABLE `UserRole` (
  `user_id` bigint NOT NULL,
  `role_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `UserRole`
--

INSERT INTO `UserRole` (`user_id`, `role_id`) VALUES
(1, 1),
(18, 1),
(13, 4),
(14, 4),
(15, 4),
(16, 4),
(20, 4),
(21, 4),
(22, 4),
(23, 4),
(35, 4),
(19, 6),
(25, 6),
(26, 6),
(27, 6),
(28, 6),
(29, 6),
(30, 6),
(31, 6),
(32, 6),
(33, 6),
(34, 6),
(36, 6),
(37, 6),
(17, 11),
(24, 12);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `AcademicCalendar`
--
ALTER TABLE `AcademicCalendar`
  ADD PRIMARY KEY (`calendar_id`),
  ADD UNIQUE KEY `unique_calendar` (`academic_year_id`,`academic_term_id`,`class_group_id`),
  ADD KEY `idx_academic_calendar_year` (`academic_year_id`),
  ADD KEY `idx_academic_calendar_term` (`academic_term_id`),
  ADD KEY `idx_academic_calendar_class` (`class_group_id`);

--
-- Indexes for table `AcademicTerm`
--
ALTER TABLE `AcademicTerm`
  ADD PRIMARY KEY (`academic_term_id`),
  ADD KEY `academic_year_id` (`academic_year_id`);

--
-- Indexes for table `AcademicYear`
--
ALTER TABLE `AcademicYear`
  ADD PRIMARY KEY (`academic_year_id`);

--
-- Indexes for table `ActivityLog`
--
ALTER TABLE `ActivityLog`
  ADD PRIMARY KEY (`activity_id`),
  ADD KEY `ActivityLog_user_id_User_user_id_fk` (`user_id`),
  ADD KEY `ActivityLog_actor_id_User_user_id_fk` (`actor_id`);

--
-- Indexes for table `AssessmentScore`
--
ALTER TABLE `AssessmentScore`
  ADD PRIMARY KEY (`score_id`),
  ADD KEY `idx_ascore_student` (`student_id`),
  ADD KEY `idx_ascore_subject` (`subject_id`),
  ADD KEY `idx_ascore_student_date` (`student_id`,`assessed_at`),
  ADD KEY `fk_ascore_recorder` (`recorded_by`);

--
-- Indexes for table `AuthCredential`
--
ALTER TABLE `AuthCredential`
  ADD PRIMARY KEY (`auth_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `CalendarActivity`
--
ALTER TABLE `CalendarActivity`
  ADD PRIMARY KEY (`activity_id`),
  ADD KEY `class_group_id` (`class_group_id`),
  ADD KEY `idx_calendar_activity_term` (`academic_term_id`),
  ADD KEY `idx_calendar_activity_year` (`academic_year_id`);

--
-- Indexes for table `CalendarNotification`
--
ALTER TABLE `CalendarNotification`
  ADD PRIMARY KEY (`notification_id`),
  ADD UNIQUE KEY `unique_user_notification` (`user_id`,`notification_type`,`minutes_before`),
  ADD KEY `idx_calendar_notification_user` (`user_id`);

--
-- Indexes for table `CalendarSlot`
--
ALTER TABLE `CalendarSlot`
  ADD PRIMARY KEY (`slot_id`),
  ADD UNIQUE KEY `unique_slot` (`academic_term_id`,`class_group_id`,`day_of_week`,`start_time`),
  ADD KEY `subject_id` (`subject_id`),
  ADD KEY `idx_calendar_slot_term` (`academic_term_id`),
  ADD KEY `idx_calendar_slot_class` (`class_group_id`),
  ADD KEY `idx_calendar_slot_instructor` (`user_id`),
  ADD KEY `idx_calendar_slot_day` (`day_of_week`),
  ADD KEY `idx_calendar_slot_year` (`academic_year_id`),
  ADD KEY `idx_calendar_slot_calendar` (`calendar_id`);

--
-- Indexes for table `ClassGroup`
--
ALTER TABLE `ClassGroup`
  ADD PRIMARY KEY (`class_group_id`),
  ADD UNIQUE KEY `academic_year_id` (`academic_year_id`,`grade_id`,`name`),
  ADD KEY `grade_id` (`grade_id`);

--
-- Indexes for table `CompetencyPerformanceCriteria`
--
ALTER TABLE `CompetencyPerformanceCriteria`
  ADD PRIMARY KEY (`criteria_id`),
  ADD KEY `idx_criteria_competency` (`competency_id`);

--
-- Indexes for table `CourseCategory`
--
ALTER TABLE `CourseCategory`
  ADD PRIMARY KEY (`category_id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `Document`
--
ALTER TABLE `Document`
  ADD PRIMARY KEY (`document_id`),
  ADD KEY `fk_document_user` (`user_id`),
  ADD KEY `fk_document_folder` (`folder_id`);

--
-- Indexes for table `DocumentFolder`
--
ALTER TABLE `DocumentFolder`
  ADD PRIMARY KEY (`folder_id`),
  ADD KEY `fk_document_folder_user` (`user_id`),
  ADD KEY `fk_document_folder_parent` (`parent_folder_id`);

--
-- Indexes for table `DocumentPermission`
--
ALTER TABLE `DocumentPermission`
  ADD PRIMARY KEY (`permission_id`),
  ADD KEY `fk_perm_document` (`document_id`),
  ADD KEY `fk_perm_user` (`user_id`),
  ADD KEY `fk_perm_shared_by` (`shared_by`),
  ADD KEY `idx_document_permission_filter` (`filter_type`,`filter_id`),
  ADD KEY `idx_document_permission_term` (`academic_term_id`);

--
-- Indexes for table `DocumentVersion`
--
ALTER TABLE `DocumentVersion`
  ADD PRIMARY KEY (`version_id`),
  ADD KEY `fk_version_document` (`document_id`),
  ADD KEY `fk_version_user` (`user_id`);

--
-- Indexes for table `FolderPermission`
--
ALTER TABLE `FolderPermission`
  ADD PRIMARY KEY (`permission_id`),
  ADD KEY `fk_folder_perm_folder` (`folder_id`),
  ADD KEY `fk_folder_perm_user` (`user_id`),
  ADD KEY `fk_folder_perm_shared_by` (`shared_by`),
  ADD KEY `idx_folder_permission_filter` (`filter_type`,`filter_id`),
  ADD KEY `idx_folder_permission_term` (`academic_term_id`);

--
-- Indexes for table `Grade`
--
ALTER TABLE `Grade`
  ADD PRIMARY KEY (`grade_id`),
  ADD UNIQUE KEY `program_id` (`program_id`,`name`);

--
-- Indexes for table `GradeSubject`
--
ALTER TABLE `GradeSubject`
  ADD PRIMARY KEY (`grade_id`,`subject_id`),
  ADD KEY `subject_id` (`subject_id`);

--
-- Indexes for table `InstructorReport`
--
ALTER TABLE `InstructorReport`
  ADD PRIMARY KEY (`report_id`);

--
-- Indexes for table `LessonReport`
--
ALTER TABLE `LessonReport`
  ADD PRIMARY KEY (`lesson_report_id`),
  ADD KEY `idx_lr_reported_by` (`reported_by`),
  ADD KEY `idx_lr_lesson_id` (`lesson_id`),
  ADD KEY `idx_lr_delivery_date` (`delivery_date`),
  ADD KEY `fk_lr_entry` (`entry_id`);

--
-- Indexes for table `LO_IndicativeContent`
--
ALTER TABLE `LO_IndicativeContent`
  ADD PRIMARY KEY (`id`),
  ADD KEY `lesson_id` (`lesson_id`);

--
-- Indexes for table `LO_LearningOutcome`
--
ALTER TABLE `LO_LearningOutcome`
  ADD PRIMARY KEY (`id`),
  ADD KEY `lesson_id` (`lesson_id`);

--
-- Indexes for table `LO_LearningOutcomeActivity`
--
ALTER TABLE `LO_LearningOutcomeActivity`
  ADD PRIMARY KEY (`id`),
  ADD KEY `learning_outcome_id` (`learning_outcome_id`);

--
-- Indexes for table `LO_LearningOutcomeResource`
--
ALTER TABLE `LO_LearningOutcomeResource`
  ADD PRIMARY KEY (`id`),
  ADD KEY `learning_outcome_id` (`learning_outcome_id`);

--
-- Indexes for table `LO_Lesson`
--
ALTER TABLE `LO_Lesson`
  ADD PRIMARY KEY (`id`),
  ADD KEY `entry_id` (`entry_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `LO_LessonAssignment`
--
ALTER TABLE `LO_LessonAssignment`
  ADD PRIMARY KEY (`id`),
  ADD KEY `lesson_id` (`lesson_id`);

--
-- Indexes for table `LO_LessonEvaluation`
--
ALTER TABLE `LO_LessonEvaluation`
  ADD PRIMARY KEY (`id`),
  ADD KEY `lesson_id` (`lesson_id`);

--
-- Indexes for table `LO_LessonSection`
--
ALTER TABLE `LO_LessonSection`
  ADD PRIMARY KEY (`id`),
  ADD KEY `lesson_id` (`lesson_id`);

--
-- Indexes for table `MentorshipSession`
--
ALTER TABLE `MentorshipSession`
  ADD PRIMARY KEY (`mentorship_id`),
  ADD KEY `MS_report_id_fk` (`report_id`),
  ADD KEY `idx_ms_user_id` (`user_id`),
  ADD KEY `idx_ms_student_id` (`student_id`),
  ADD KEY `idx_ms_session_date` (`session_date`),
  ADD KEY `idx_ms_student_date` (`student_id`,`session_date`),
  ADD KEY `fk_ms_prev_session` (`previous_session_id`),
  ADD KEY `idx_ms_subject_id` (`subject_id`);

--
-- Indexes for table `OTP`
--
ALTER TABLE `OTP`
  ADD PRIMARY KEY (`otp_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `otp_lookup` (`user_id`,`otp_code`,`otp_type`,`is_used`,`expires_at`);

--
-- Indexes for table `Parenting`
--
ALTER TABLE `Parenting`
  ADD PRIMARY KEY (`parenting_id`),
  ADD UNIQUE KEY `unique_student_parent` (`student_id`,`parent_id`),
  ADD KEY `Parenting_parent_id_User_user_id_fk` (`parent_id`);

--
-- Indexes for table `Permission`
--
ALTER TABLE `Permission`
  ADD PRIMARY KEY (`perm_id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `Program`
--
ALTER TABLE `Program`
  ADD PRIMARY KEY (`program_id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `ReportLesson`
--
ALTER TABLE `ReportLesson`
  ADD PRIMARY KEY (`lesson_report_id`),
  ADD KEY `RL_report_id_fk` (`report_id`);

--
-- Indexes for table `ReportProjectUpdate`
--
ALTER TABLE `ReportProjectUpdate`
  ADD PRIMARY KEY (`project_update_id`),
  ADD KEY `RPU_report_id_fk` (`report_id`),
  ADD KEY `idx_rpu_user_id` (`user_id`);

--
-- Indexes for table `ReportReflection`
--
ALTER TABLE `ReportReflection`
  ADD PRIMARY KEY (`reflection_id`),
  ADD KEY `RR_report_id_fk` (`report_id`);

--
-- Indexes for table `ReportTopic`
--
ALTER TABLE `ReportTopic`
  ADD PRIMARY KEY (`topic_report_id`),
  ADD KEY `RT_report_id_fk` (`report_id`);

--
-- Indexes for table `Role`
--
ALTER TABLE `Role`
  ADD PRIMARY KEY (`role_id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `RolePermission`
--
ALTER TABLE `RolePermission`
  ADD PRIMARY KEY (`role_id`,`perm_id`),
  ADD KEY `perm_id` (`perm_id`);

--
-- Indexes for table `RoleSystemFragment`
--
ALTER TABLE `RoleSystemFragment`
  ADD PRIMARY KEY (`fragment_id`),
  ADD UNIQUE KEY `unique_role_system_school` (`school_id`,`role_id`,`system_id`),
  ADD KEY `RoleSystemFragment_system_id_System_system_id_fk` (`system_id`),
  ADD KEY `RoleSystemFragment_role_id_Role_role_id_fk` (`role_id`);

--
-- Indexes for table `SchemeOfWork`
--
ALTER TABLE `SchemeOfWork`
  ADD PRIMARY KEY (`scheme_id`),
  ADD KEY `SchemeOfWork_user_id_fk` (`user_id`),
  ADD KEY `SchemeOfWork_subject_id_fk` (`subject_id`),
  ADD KEY `SchemeOfWork_class_group_id_fk` (`class_group_id`),
  ADD KEY `SchemeOfWork_academic_term_id_fk` (`academic_term_id`);

--
-- Indexes for table `SchemeOfWorkEntry`
--
ALTER TABLE `SchemeOfWorkEntry`
  ADD PRIMARY KEY (`entry_id`),
  ADD KEY `SchemeOfWorkEntry_scheme_id_fk` (`scheme_id`);

--
-- Indexes for table `School`
--
ALTER TABLE `School`
  ADD PRIMARY KEY (`school_id`),
  ADD UNIQUE KEY `School_name_unique` (`name`);

--
-- Indexes for table `SchoolSystemAssignment`
--
ALTER TABLE `SchoolSystemAssignment`
  ADD PRIMARY KEY (`school_id`,`system_id`),
  ADD KEY `SchoolSystemAssignment_system_id_System_system_id_fk` (`system_id`);

--
-- Indexes for table `SSOCode`
--
ALTER TABLE `SSOCode`
  ADD PRIMARY KEY (`code_id`),
  ADD UNIQUE KEY `code_unique_idx` (`code`),
  ADD KEY `SSOCode_user_id_fk` (`user_id`),
  ADD KEY `SSOCode_system_id_fk` (`system_id`);

--
-- Indexes for table `StudentClassGroup`
--
ALTER TABLE `StudentClassGroup`
  ADD PRIMARY KEY (`user_id`,`class_group_id`),
  ADD KEY `class_group_id` (`class_group_id`);

--
-- Indexes for table `StudentSubjectEnrollment`
--
ALTER TABLE `StudentSubjectEnrollment`
  ADD PRIMARY KEY (`user_id`,`subject_id`,`academic_year_id`),
  ADD KEY `subject_id` (`subject_id`),
  ADD KEY `studentsubjectenrollment_academic_year_id_fk` (`academic_year_id`);

--
-- Indexes for table `Subject`
--
ALTER TABLE `Subject`
  ADD PRIMARY KEY (`subject_id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD UNIQUE KEY `Subject_blooms_taxonomy_level_id_fk` (`blooms_taxonomy_level_id`) USING BTREE,
  ADD KEY `Subject_course_category_id_CourseCategory_category_id_fk` (`course_category_id`);

--
-- Indexes for table `SubjectCompetency`
--
ALTER TABLE `SubjectCompetency`
  ADD PRIMARY KEY (`competency_id`),
  ADD KEY `idx_competency_subject` (`subject_id`),
  ADD KEY `fk_competency_user` (`user_id`);

--
-- Indexes for table `SubjectDocument`
--
ALTER TABLE `SubjectDocument`
  ADD PRIMARY KEY (`document_id`),
  ADD KEY `idx_subject_doc_category` (`category_id`),
  ADD KEY `idx_subject_doc_subject` (`subject_id`),
  ADD KEY `fk_subject_doc_user` (`user_id`),
  ADD KEY `fk_subject_doc_competency` (`competency_id`);

--
-- Indexes for table `SubjectDocumentCategory`
--
ALTER TABLE `SubjectDocumentCategory`
  ADD PRIMARY KEY (`category_id`),
  ADD KEY `idx_doc_category_subject` (`subject_id`),
  ADD KEY `fk_doc_category_user` (`user_id`);

--
-- Indexes for table `System`
--
ALTER TABLE `System`
  ADD PRIMARY KEY (`system_id`),
  ADD UNIQUE KEY `System_name_unique` (`name`),
  ADD UNIQUE KEY `client_id` (`client_id`);

--
-- Indexes for table `TeacherSubjectAssignment`
--
ALTER TABLE `TeacherSubjectAssignment`
  ADD PRIMARY KEY (`user_id`,`subject_id`,`class_group_id`),
  ADD KEY `subject_id` (`subject_id`),
  ADD KEY `class_group_id` (`class_group_id`);

--
-- Indexes for table `User`
--
ALTER TABLE `User`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `UserGrade`
--
ALTER TABLE `UserGrade`
  ADD PRIMARY KEY (`user_id`,`grade_id`),
  ADD KEY `grade_id` (`grade_id`);

--
-- Indexes for table `UserProfile`
--
ALTER TABLE `UserProfile`
  ADD PRIMARY KEY (`profile_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `UserProgramLead`
--
ALTER TABLE `UserProgramLead`
  ADD PRIMARY KEY (`user_id`,`program_id`),
  ADD KEY `program_id` (`program_id`);

--
-- Indexes for table `UserRole`
--
ALTER TABLE `UserRole`
  ADD PRIMARY KEY (`user_id`,`role_id`),
  ADD KEY `role_id` (`role_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `AcademicCalendar`
--
ALTER TABLE `AcademicCalendar`
  MODIFY `calendar_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `AcademicTerm`
--
ALTER TABLE `AcademicTerm`
  MODIFY `academic_term_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `AcademicYear`
--
ALTER TABLE `AcademicYear`
  MODIFY `academic_year_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `ActivityLog`
--
ALTER TABLE `ActivityLog`
  MODIFY `activity_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=800;

--
-- AUTO_INCREMENT for table `AssessmentScore`
--
ALTER TABLE `AssessmentScore`
  MODIFY `score_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `AuthCredential`
--
ALTER TABLE `AuthCredential`
  MODIFY `auth_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `CalendarActivity`
--
ALTER TABLE `CalendarActivity`
  MODIFY `activity_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `CalendarNotification`
--
ALTER TABLE `CalendarNotification`
  MODIFY `notification_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `CalendarSlot`
--
ALTER TABLE `CalendarSlot`
  MODIFY `slot_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT for table `ClassGroup`
--
ALTER TABLE `ClassGroup`
  MODIFY `class_group_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT for table `CompetencyPerformanceCriteria`
--
ALTER TABLE `CompetencyPerformanceCriteria`
  MODIFY `criteria_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `CourseCategory`
--
ALTER TABLE `CourseCategory`
  MODIFY `category_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `Document`
--
ALTER TABLE `Document`
  MODIFY `document_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=109;

--
-- AUTO_INCREMENT for table `DocumentFolder`
--
ALTER TABLE `DocumentFolder`
  MODIFY `folder_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=43;

--
-- AUTO_INCREMENT for table `DocumentPermission`
--
ALTER TABLE `DocumentPermission`
  MODIFY `permission_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `DocumentVersion`
--
ALTER TABLE `DocumentVersion`
  MODIFY `version_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `FolderPermission`
--
ALTER TABLE `FolderPermission`
  MODIFY `permission_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT for table `Grade`
--
ALTER TABLE `Grade`
  MODIFY `grade_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT for table `InstructorReport`
--
ALTER TABLE `InstructorReport`
  MODIFY `report_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=46;

--
-- AUTO_INCREMENT for table `LessonReport`
--
ALTER TABLE `LessonReport`
  MODIFY `lesson_report_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `LO_IndicativeContent`
--
ALTER TABLE `LO_IndicativeContent`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT for table `LO_LearningOutcome`
--
ALTER TABLE `LO_LearningOutcome`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `LO_LearningOutcomeActivity`
--
ALTER TABLE `LO_LearningOutcomeActivity`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `LO_LearningOutcomeResource`
--
ALTER TABLE `LO_LearningOutcomeResource`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `LO_Lesson`
--
ALTER TABLE `LO_Lesson`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `LO_LessonAssignment`
--
ALTER TABLE `LO_LessonAssignment`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `LO_LessonEvaluation`
--
ALTER TABLE `LO_LessonEvaluation`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `LO_LessonSection`
--
ALTER TABLE `LO_LessonSection`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `MentorshipSession`
--
ALTER TABLE `MentorshipSession`
  MODIFY `mentorship_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `OTP`
--
ALTER TABLE `OTP`
  MODIFY `otp_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=560;

--
-- AUTO_INCREMENT for table `Parenting`
--
ALTER TABLE `Parenting`
  MODIFY `parenting_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Permission`
--
ALTER TABLE `Permission`
  MODIFY `perm_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=51;

--
-- AUTO_INCREMENT for table `Program`
--
ALTER TABLE `Program`
  MODIFY `program_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `ReportLesson`
--
ALTER TABLE `ReportLesson`
  MODIFY `lesson_report_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `ReportProjectUpdate`
--
ALTER TABLE `ReportProjectUpdate`
  MODIFY `project_update_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `ReportReflection`
--
ALTER TABLE `ReportReflection`
  MODIFY `reflection_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=36;

--
-- AUTO_INCREMENT for table `ReportTopic`
--
ALTER TABLE `ReportTopic`
  MODIFY `topic_report_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `Role`
--
ALTER TABLE `Role`
  MODIFY `role_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `RoleSystemFragment`
--
ALTER TABLE `RoleSystemFragment`
  MODIFY `fragment_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `SchemeOfWork`
--
ALTER TABLE `SchemeOfWork`
  MODIFY `scheme_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `SchemeOfWorkEntry`
--
ALTER TABLE `SchemeOfWorkEntry`
  MODIFY `entry_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `School`
--
ALTER TABLE `School`
  MODIFY `school_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `SSOCode`
--
ALTER TABLE `SSOCode`
  MODIFY `code_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=482;

--
-- AUTO_INCREMENT for table `Subject`
--
ALTER TABLE `Subject`
  MODIFY `subject_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT for table `SubjectCompetency`
--
ALTER TABLE `SubjectCompetency`
  MODIFY `competency_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `SubjectDocument`
--
ALTER TABLE `SubjectDocument`
  MODIFY `document_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `SubjectDocumentCategory`
--
ALTER TABLE `SubjectDocumentCategory`
  MODIFY `category_id` bigint NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `System`
--
ALTER TABLE `System`
  MODIFY `system_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `User`
--
ALTER TABLE `User`
  MODIFY `user_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=38;

--
-- AUTO_INCREMENT for table `UserProfile`
--
ALTER TABLE `UserProfile`
  MODIFY `profile_id` bigint NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=38;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `AcademicCalendar`
--
ALTER TABLE `AcademicCalendar`
  ADD CONSTRAINT `AcademicCalendar_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  ADD CONSTRAINT `AcademicCalendar_ibfk_2` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  ADD CONSTRAINT `AcademicCalendar_ibfk_3` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`);

--
-- Constraints for table `AcademicTerm`
--
ALTER TABLE `AcademicTerm`
  ADD CONSTRAINT `academicterm_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`);

--
-- Constraints for table `ActivityLog`
--
ALTER TABLE `ActivityLog`
  ADD CONSTRAINT `ActivityLog_actor_id_User_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `User` (`user_id`),
  ADD CONSTRAINT `ActivityLog_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `AssessmentScore`
--
ALTER TABLE `AssessmentScore`
  ADD CONSTRAINT `fk_ascore_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `User` (`user_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ascore_student` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ascore_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE;

--
-- Constraints for table `AuthCredential`
--
ALTER TABLE `AuthCredential`
  ADD CONSTRAINT `authcredential_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `CalendarActivity`
--
ALTER TABLE `CalendarActivity`
  ADD CONSTRAINT `CalendarActivity_ibfk_1` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  ADD CONSTRAINT `CalendarActivity_ibfk_2` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  ADD CONSTRAINT `CalendarActivity_ibfk_3` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`);

--
-- Constraints for table `CalendarNotification`
--
ALTER TABLE `CalendarNotification`
  ADD CONSTRAINT `CalendarNotification_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `CalendarSlot`
--
ALTER TABLE `CalendarSlot`
  ADD CONSTRAINT `CalendarSlot_ibfk_1` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  ADD CONSTRAINT `CalendarSlot_ibfk_2` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  ADD CONSTRAINT `CalendarSlot_ibfk_3` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  ADD CONSTRAINT `CalendarSlot_ibfk_4` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  ADD CONSTRAINT `CalendarSlot_ibfk_5` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  ADD CONSTRAINT `CalendarSlot_ibfk_6` FOREIGN KEY (`calendar_id`) REFERENCES `AcademicCalendar` (`calendar_id`);

--
-- Constraints for table `ClassGroup`
--
ALTER TABLE `ClassGroup`
  ADD CONSTRAINT `classgroup_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  ADD CONSTRAINT `classgroup_ibfk_2` FOREIGN KEY (`grade_id`) REFERENCES `Grade` (`grade_id`);

--
-- Constraints for table `CompetencyPerformanceCriteria`
--
ALTER TABLE `CompetencyPerformanceCriteria`
  ADD CONSTRAINT `fk_criteria_competency` FOREIGN KEY (`competency_id`) REFERENCES `SubjectCompetency` (`competency_id`) ON DELETE CASCADE;

--
-- Constraints for table `Document`
--
ALTER TABLE `Document`
  ADD CONSTRAINT `fk_document_folder` FOREIGN KEY (`folder_id`) REFERENCES `DocumentFolder` (`folder_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_document_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `DocumentFolder`
--
ALTER TABLE `DocumentFolder`
  ADD CONSTRAINT `fk_document_folder_parent` FOREIGN KEY (`parent_folder_id`) REFERENCES `DocumentFolder` (`folder_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_document_folder_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `DocumentPermission`
--
ALTER TABLE `DocumentPermission`
  ADD CONSTRAINT `fk_perm_document` FOREIGN KEY (`document_id`) REFERENCES `Document` (`document_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_perm_shared_by` FOREIGN KEY (`shared_by`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_perm_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `DocumentVersion`
--
ALTER TABLE `DocumentVersion`
  ADD CONSTRAINT `fk_version_document` FOREIGN KEY (`document_id`) REFERENCES `Document` (`document_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_version_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `FolderPermission`
--
ALTER TABLE `FolderPermission`
  ADD CONSTRAINT `fk_folder_perm_folder` FOREIGN KEY (`folder_id`) REFERENCES `DocumentFolder` (`folder_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_folder_perm_shared_by` FOREIGN KEY (`shared_by`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_folder_perm_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `Grade`
--
ALTER TABLE `Grade`
  ADD CONSTRAINT `grade_ibfk_1` FOREIGN KEY (`program_id`) REFERENCES `Program` (`program_id`);

--
-- Constraints for table `GradeSubject`
--
ALTER TABLE `GradeSubject`
  ADD CONSTRAINT `gradesubject_ibfk_1` FOREIGN KEY (`grade_id`) REFERENCES `Grade` (`grade_id`),
  ADD CONSTRAINT `gradesubject_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`);

--
-- Constraints for table `LessonReport`
--
ALTER TABLE `LessonReport`
  ADD CONSTRAINT `fk_lr_entry` FOREIGN KEY (`entry_id`) REFERENCES `SchemeOfWorkEntry` (`entry_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_lr_lesson` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_lr_reported_by` FOREIGN KEY (`reported_by`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `LO_IndicativeContent`
--
ALTER TABLE `LO_IndicativeContent`
  ADD CONSTRAINT `LO_IndicativeContent_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `LO_LearningOutcome`
--
ALTER TABLE `LO_LearningOutcome`
  ADD CONSTRAINT `LO_LearningOutcome_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `LO_LearningOutcomeActivity`
--
ALTER TABLE `LO_LearningOutcomeActivity`
  ADD CONSTRAINT `LO_LearningOutcomeActivity_ibfk_1` FOREIGN KEY (`learning_outcome_id`) REFERENCES `LO_LearningOutcome` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `LO_LearningOutcomeResource`
--
ALTER TABLE `LO_LearningOutcomeResource`
  ADD CONSTRAINT `LO_LearningOutcomeResource_ibfk_1` FOREIGN KEY (`learning_outcome_id`) REFERENCES `LO_LearningOutcome` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `LO_Lesson`
--
ALTER TABLE `LO_Lesson`
  ADD CONSTRAINT `LO_Lesson_ibfk_1` FOREIGN KEY (`entry_id`) REFERENCES `SchemeOfWorkEntry` (`entry_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `LO_Lesson_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `LO_LessonAssignment`
--
ALTER TABLE `LO_LessonAssignment`
  ADD CONSTRAINT `LO_LessonAssignment_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `LO_LessonEvaluation`
--
ALTER TABLE `LO_LessonEvaluation`
  ADD CONSTRAINT `LO_LessonEvaluation_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `LO_LessonSection`
--
ALTER TABLE `LO_LessonSection`
  ADD CONSTRAINT `LO_LessonSection_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `MentorshipSession`
--
ALTER TABLE `MentorshipSession`
  ADD CONSTRAINT `fk_ms_prev_session` FOREIGN KEY (`previous_session_id`) REFERENCES `MentorshipSession` (`mentorship_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_ms_student_id` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_ms_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `MS_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `OTP`
--
ALTER TABLE `OTP`
  ADD CONSTRAINT `otp_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `Parenting`
--
ALTER TABLE `Parenting`
  ADD CONSTRAINT `Parenting_parent_id_User_user_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `User` (`user_id`),
  ADD CONSTRAINT `Parenting_student_id_User_user_id_fk` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `ReportLesson`
--
ALTER TABLE `ReportLesson`
  ADD CONSTRAINT `RL_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport` (`report_id`) ON DELETE CASCADE;

--
-- Constraints for table `ReportProjectUpdate`
--
ALTER TABLE `ReportProjectUpdate`
  ADD CONSTRAINT `fk_rpu_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `ReportReflection`
--
ALTER TABLE `ReportReflection`
  ADD CONSTRAINT `RR_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport` (`report_id`) ON DELETE CASCADE;

--
-- Constraints for table `ReportTopic`
--
ALTER TABLE `ReportTopic`
  ADD CONSTRAINT `RT_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport` (`report_id`) ON DELETE CASCADE;

--
-- Constraints for table `RolePermission`
--
ALTER TABLE `RolePermission`
  ADD CONSTRAINT `rolepermission_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `Role` (`role_id`),
  ADD CONSTRAINT `rolepermission_ibfk_2` FOREIGN KEY (`perm_id`) REFERENCES `Permission` (`perm_id`);

--
-- Constraints for table `RoleSystemFragment`
--
ALTER TABLE `RoleSystemFragment`
  ADD CONSTRAINT `RoleSystemFragment_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role` (`role_id`),
  ADD CONSTRAINT `RoleSystemFragment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School` (`school_id`),
  ADD CONSTRAINT `RoleSystemFragment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System` (`system_id`);

--
-- Constraints for table `SchemeOfWork`
--
ALTER TABLE `SchemeOfWork`
  ADD CONSTRAINT `SchemeOfWork_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  ADD CONSTRAINT `SchemeOfWork_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  ADD CONSTRAINT `SchemeOfWork_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  ADD CONSTRAINT `SchemeOfWork_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `SchemeOfWorkEntry`
--
ALTER TABLE `SchemeOfWorkEntry`
  ADD CONSTRAINT `SchemeOfWorkEntry_scheme_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `SchemeOfWork` (`scheme_id`) ON DELETE CASCADE;

--
-- Constraints for table `SchoolSystemAssignment`
--
ALTER TABLE `SchoolSystemAssignment`
  ADD CONSTRAINT `SchoolSystemAssignment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School` (`school_id`),
  ADD CONSTRAINT `SchoolSystemAssignment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System` (`system_id`);

--
-- Constraints for table `SSOCode`
--
ALTER TABLE `SSOCode`
  ADD CONSTRAINT `SSOCode_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System` (`system_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `SSOCode_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `StudentClassGroup`
--
ALTER TABLE `StudentClassGroup`
  ADD CONSTRAINT `studentclassgroup_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  ADD CONSTRAINT `studentclassgroup_ibfk_2` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`);

--
-- Constraints for table `StudentSubjectEnrollment`
--
ALTER TABLE `StudentSubjectEnrollment`
  ADD CONSTRAINT `studentsubjectenrollment_academic_year_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `StudentSubjectEnrollment_subject_id_Subject_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `StudentSubjectEnrollment_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `Subject`
--
ALTER TABLE `Subject`
  ADD CONSTRAINT `Subject_blooms_taxonomy_level_id_fk` FOREIGN KEY (`blooms_taxonomy_level_id`) REFERENCES `BloomsTaxonomyLevel` (`level_id`),
  ADD CONSTRAINT `Subject_course_category_id_CourseCategory_category_id_fk` FOREIGN KEY (`course_category_id`) REFERENCES `CourseCategory` (`category_id`);

--
-- Constraints for table `SubjectCompetency`
--
ALTER TABLE `SubjectCompetency`
  ADD CONSTRAINT `fk_competency_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_competency_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `SubjectDocument`
--
ALTER TABLE `SubjectDocument`
  ADD CONSTRAINT `fk_subject_doc_category` FOREIGN KEY (`category_id`) REFERENCES `SubjectDocumentCategory` (`category_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_subject_doc_competency` FOREIGN KEY (`competency_id`) REFERENCES `SubjectCompetency` (`competency_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_subject_doc_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_subject_doc_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `SubjectDocumentCategory`
--
ALTER TABLE `SubjectDocumentCategory`
  ADD CONSTRAINT `fk_doc_category_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_doc_category_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `TeacherSubjectAssignment`
--
ALTER TABLE `TeacherSubjectAssignment`
  ADD CONSTRAINT `fk_tsa_class` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_tsa_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_tsa_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE;

--
-- Constraints for table `UserGrade`
--
ALTER TABLE `UserGrade`
  ADD CONSTRAINT `UserGrade_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `UserGrade_ibfk_2` FOREIGN KEY (`grade_id`) REFERENCES `Grade` (`grade_id`) ON DELETE CASCADE;

--
-- Constraints for table `UserProfile`
--
ALTER TABLE `UserProfile`
  ADD CONSTRAINT `userprofile_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `UserProgramLead`
--
ALTER TABLE `UserProgramLead`
  ADD CONSTRAINT `UserProgramLead_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `UserProgramLead_ibfk_2` FOREIGN KEY (`program_id`) REFERENCES `Program` (`program_id`) ON DELETE CASCADE;

--
-- Constraints for table `UserRole`
--
ALTER TABLE `UserRole`
  ADD CONSTRAINT `userrole_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  ADD CONSTRAINT `userrole_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `Role` (`role_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
