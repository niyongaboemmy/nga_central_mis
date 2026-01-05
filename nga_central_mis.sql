-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: localhost:8889
-- Generation Time: Jan 05, 2026 at 04:55 PM
-- Server version: 5.7.39-log
-- PHP Version: 8.2.0

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `nga_central_mis`
--

-- --------------------------------------------------------

--
-- Table structure for table `AcademicTerm`
--

CREATE TABLE `AcademicTerm` (
  `academic_term_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `AcademicTerm`
--

INSERT INTO `AcademicTerm` (`academic_term_id`, `academic_year_id`, `name`, `start_date`, `end_date`, `is_current`) VALUES
(1, 2, 'Term 1', '2024-09-01', '2024-12-15', 1),
(2, 2, 'Term 2', '2025-01-10', '2025-03-31', 0),
(3, 2, 'Term 3', '2025-04-10', '2025-07-15', 0);

-- --------------------------------------------------------

--
-- Table structure for table `AcademicYear`
--

CREATE TABLE `AcademicYear` (
  `academic_year_id` bigint(20) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `AcademicYear`
--

INSERT INTO `AcademicYear` (`academic_year_id`, `name`, `start_date`, `end_date`, `is_current`) VALUES
(1, '2023-2024', '2023-09-01', '2024-07-31', 0),
(2, '2024-2025', '2024-09-01', '2025-07-31', 1);

-- --------------------------------------------------------

--
-- Table structure for table `AuthCredential`
--

CREATE TABLE `AuthCredential` (
  `auth_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mfa_enabled` tinyint(1) DEFAULT '0',
  `failed_attempts` int(11) DEFAULT '0',
  `locked_until` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `AuthCredential`
--

INSERT INTO `AuthCredential` (`auth_id`, `user_id`, `password_hash`, `mfa_enabled`, `failed_attempts`, `locked_until`) VALUES
(1, 1, '$2y$hash_super', 0, 0, NULL),
(2, 2, '$2y$hash_admin', 0, 0, NULL),
(3, 3, '$2y$hash_head', 0, 0, NULL),
(4, 4, '$2y$hash_teacher', 0, 0, NULL),
(5, 5, '$2y$hash_accountant', 0, 0, NULL),
(6, 6, '$2y$hash_student1', 0, 0, NULL),
(7, 7, '$2y$hash_student2', 0, 0, NULL),
(8, 8, '$2y$hash_parent', 0, 0, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `ClassGroup`
--

CREATE TABLE `ClassGroup` (
  `class_group_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `grade_id` bigint(20) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `ClassGroup`
--

INSERT INTO `ClassGroup` (`class_group_id`, `academic_year_id`, `grade_id`, `name`) VALUES
(1, 2, 1, 'A'),
(2, 2, 1, 'B'),
(3, 2, 4, 'A'),
(4, 2, 7, 'SPES-1');

-- --------------------------------------------------------

--
-- Table structure for table `Grade`
--

CREATE TABLE `Grade` (
  `grade_id` bigint(20) NOT NULL,
  `program_id` bigint(20) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_order` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Grade`
--

INSERT INTO `Grade` (`grade_id`, `program_id`, `name`, `level_order`) VALUES
(1, 2, 'Grade 1', 1),
(2, 2, 'Grade 2', 2),
(3, 2, 'Grade 3', 3),
(4, 3, 'Grade 7', 7),
(5, 3, 'Grade 8', 8),
(6, 3, 'Grade 9', 9),
(7, 4, 'SPES', 1);

-- --------------------------------------------------------

--
-- Table structure for table `GradeSubject`
--

CREATE TABLE `GradeSubject` (
  `grade_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `GradeSubject`
--

INSERT INTO `GradeSubject` (`grade_id`, `subject_id`) VALUES
(1, 1),
(2, 1),
(1, 2),
(2, 2),
(1, 3),
(2, 3),
(7, 5),
(7, 6);

-- --------------------------------------------------------

--
-- Table structure for table `Permission`
--

CREATE TABLE `Permission` (
  `perm_id` bigint(20) NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Permission`
--

INSERT INTO `Permission` (`perm_id`, `name`, `description`) VALUES
(1, 'MANAGE_USERS', 'Create, update, deactivate users'),
(2, 'MANAGE_ROLES', 'Manage roles and permissions'),
(3, 'MANAGE_ACADEMICS', 'Manage academic structures'),
(4, 'MANAGE_CLASSES', 'Manage classes and groups'),
(5, 'MARK_ATTENDANCE', 'Mark student attendance'),
(6, 'VIEW_ATTENDANCE', 'View attendance'),
(7, 'ENTER_MARKS', 'Enter assessment marks'),
(8, 'VIEW_RESULTS', 'View exam results'),
(9, 'MANAGE_FEES', 'Manage fee structures and payments'),
(10, 'VIEW_FINANCE', 'View finance reports'),
(11, 'SEND_ANNOUNCEMENTS', 'Publish announcements'),
(12, 'UPLOAD_DOCUMENTS', 'Upload documents');

-- --------------------------------------------------------

--
-- Table structure for table `Program`
--

CREATE TABLE `Program` (
  `program_id` bigint(20) NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Program`
--

INSERT INTO `Program` (`program_id`, `name`, `description`) VALUES
(1, 'Nursery', 'Early childhood education'),
(2, 'Primary', 'Primary education'),
(3, 'Secondary', 'Lower secondary education'),
(4, 'Coding Academy', 'Software & Embedded Systems');

-- --------------------------------------------------------

--
-- Table structure for table `Role`
--

CREATE TABLE `Role` (
  `role_id` bigint(20) NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Role`
--

INSERT INTO `Role` (`role_id`, `name`, `description`) VALUES
(1, 'SUPER_ADMIN', 'Full system control'),
(2, 'ADMIN', 'School management'),
(3, 'HEAD_TEACHER', 'Academic oversight'),
(4, 'TEACHER', 'Teaching staff'),
(5, 'ACCOUNTANT', 'Finance management'),
(6, 'STUDENT', 'Learner'),
(7, 'PARENT', 'Parent/Guardian'),
(8, 'STAFF', 'Support staff');

-- --------------------------------------------------------

--
-- Table structure for table `RolePermission`
--

CREATE TABLE `RolePermission` (
  `role_id` bigint(20) NOT NULL,
  `perm_id` bigint(20) NOT NULL
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
(1, 12);

-- --------------------------------------------------------

--
-- Table structure for table `StudentClassGroup`
--

CREATE TABLE `StudentClassGroup` (
  `user_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `StudentClassGroup`
--

INSERT INTO `StudentClassGroup` (`user_id`, `class_group_id`, `assigned_at`) VALUES
(6, 1, '2026-01-05 18:47:48'),
(7, 2, '2026-01-05 18:47:48');

-- --------------------------------------------------------

--
-- Table structure for table `StudentSubjectEnrollment`
--

CREATE TABLE `StudentSubjectEnrollment` (
  `user_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `academic_term_id` bigint(20) NOT NULL,
  `enrolled_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `StudentSubjectEnrollment`
--

INSERT INTO `StudentSubjectEnrollment` (`user_id`, `subject_id`, `academic_term_id`, `enrolled_at`) VALUES
(6, 1, 1, '2026-01-05 18:48:26'),
(6, 2, 1, '2026-01-05 18:48:26'),
(7, 1, 1, '2026-01-05 18:48:26'),
(7, 2, 1, '2026-01-05 18:48:26');

-- --------------------------------------------------------

--
-- Table structure for table `Subject`
--

CREATE TABLE `Subject` (
  `subject_id` bigint(20) NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `Subject`
--

INSERT INTO `Subject` (`subject_id`, `code`, `name`, `description`) VALUES
(1, 'MAT', 'Mathematics', NULL),
(2, 'ENG', 'English', NULL),
(3, 'SCI', 'Science', NULL),
(4, 'ICT', 'ICT', NULL),
(5, 'PROG', 'Programming', NULL),
(6, 'EMB', 'Embedded Systems', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `TeacherSubjectAssignment`
--

CREATE TABLE `TeacherSubjectAssignment` (
  `user_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) NOT NULL,
  `academic_term_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `TeacherSubjectAssignment`
--

INSERT INTO `TeacherSubjectAssignment` (`user_id`, `subject_id`, `class_group_id`, `academic_term_id`, `assigned_at`) VALUES
(3, 5, 4, 1, '2026-01-05 18:48:38'),
(4, 1, 1, 1, '2026-01-05 18:48:38'),
(4, 2, 1, 1, '2026-01-05 18:48:38');

-- --------------------------------------------------------

--
-- Table structure for table `User`
--

CREATE TABLE `User` (
  `user_id` bigint(20) NOT NULL,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','SUSPENDED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `User`
--

INSERT INTO `User` (`user_id`, `username`, `email`, `phone_number`, `status`, `created_at`, `updated_at`) VALUES
(1, 'superadmin', 'superadmin@nga.ac.rw', '+250788100001', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55'),
(2, 'admin', 'admin@nga.ac.rw', '+250788100002', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55'),
(3, 'headteacher', 'headteacher@nga.ac.rw', '+250788100003', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55'),
(4, 'teacher_john', 'john.teacher@nga.ac.rw', '+250788100004', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55'),
(5, 'accountant', 'finance@nga.ac.rw', '+250788100005', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55'),
(6, 'student_alice', 'alice.student@nga.ac.rw', '+250788100006', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55'),
(7, 'student_paul', 'paul.student@nga.ac.rw', '+250788100007', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55'),
(8, 'parent_grace', 'grace.parent@nga.ac.rw', '+250788100008', 'ACTIVE', '2026-01-05 18:44:55', '2026-01-05 18:44:55');

-- --------------------------------------------------------

--
-- Table structure for table `UserProfile`
--

CREATE TABLE `UserProfile` (
  `profile_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` enum('MALE','FEMALE','OTHER') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_type` enum('STUDENT','TEACHER','ADMIN','PARENT','STAFF') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `UserProfile`
--

INSERT INTO `UserProfile` (`profile_id`, `user_id`, `first_name`, `last_name`, `gender`, `date_of_birth`, `address`, `user_type`, `external_id`) VALUES
(1, 1, 'System', 'Owner', 'MALE', NULL, NULL, 'ADMIN', NULL),
(2, 2, 'James', 'Admin', 'MALE', NULL, NULL, 'ADMIN', NULL),
(3, 3, 'David', 'Mukamana', 'MALE', NULL, NULL, 'TEACHER', NULL),
(4, 4, 'John', 'Uwimana', 'MALE', NULL, NULL, 'TEACHER', NULL),
(5, 5, 'Sarah', 'Finance', 'FEMALE', NULL, NULL, 'STAFF', NULL),
(6, 6, 'Alice', 'Uwamahoro', 'FEMALE', NULL, NULL, 'STUDENT', NULL),
(7, 7, 'Paul', 'Nkurunziza', 'MALE', NULL, NULL, 'STUDENT', NULL),
(8, 8, 'Grace', 'Mukamana', 'FEMALE', NULL, NULL, 'PARENT', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `UserRole`
--

CREATE TABLE `UserRole` (
  `user_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `UserRole`
--

INSERT INTO `UserRole` (`user_id`, `role_id`) VALUES
(1, 1),
(2, 2),
(3, 3),
(4, 4),
(5, 5),
(6, 6),
(7, 6),
(8, 7);

--
-- Indexes for dumped tables
--

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
-- Indexes for table `AuthCredential`
--
ALTER TABLE `AuthCredential`
  ADD PRIMARY KEY (`auth_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `ClassGroup`
--
ALTER TABLE `ClassGroup`
  ADD PRIMARY KEY (`class_group_id`),
  ADD UNIQUE KEY `academic_year_id` (`academic_year_id`,`grade_id`,`name`),
  ADD KEY `grade_id` (`grade_id`);

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
-- Indexes for table `StudentClassGroup`
--
ALTER TABLE `StudentClassGroup`
  ADD PRIMARY KEY (`user_id`,`class_group_id`),
  ADD KEY `class_group_id` (`class_group_id`);

--
-- Indexes for table `StudentSubjectEnrollment`
--
ALTER TABLE `StudentSubjectEnrollment`
  ADD PRIMARY KEY (`user_id`,`subject_id`,`academic_term_id`),
  ADD KEY `subject_id` (`subject_id`),
  ADD KEY `academic_term_id` (`academic_term_id`);

--
-- Indexes for table `Subject`
--
ALTER TABLE `Subject`
  ADD PRIMARY KEY (`subject_id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `TeacherSubjectAssignment`
--
ALTER TABLE `TeacherSubjectAssignment`
  ADD PRIMARY KEY (`user_id`,`subject_id`,`class_group_id`,`academic_term_id`),
  ADD KEY `subject_id` (`subject_id`),
  ADD KEY `class_group_id` (`class_group_id`),
  ADD KEY `academic_term_id` (`academic_term_id`);

--
-- Indexes for table `User`
--
ALTER TABLE `User`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `UserProfile`
--
ALTER TABLE `UserProfile`
  ADD PRIMARY KEY (`profile_id`),
  ADD KEY `user_id` (`user_id`);

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
-- AUTO_INCREMENT for table `AcademicTerm`
--
ALTER TABLE `AcademicTerm`
  MODIFY `academic_term_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `AcademicYear`
--
ALTER TABLE `AcademicYear`
  MODIFY `academic_year_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `AuthCredential`
--
ALTER TABLE `AuthCredential`
  MODIFY `auth_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `ClassGroup`
--
ALTER TABLE `ClassGroup`
  MODIFY `class_group_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `Grade`
--
ALTER TABLE `Grade`
  MODIFY `grade_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `Permission`
--
ALTER TABLE `Permission`
  MODIFY `perm_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `Program`
--
ALTER TABLE `Program`
  MODIFY `program_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `Role`
--
ALTER TABLE `Role`
  MODIFY `role_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `Subject`
--
ALTER TABLE `Subject`
  MODIFY `subject_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `User`
--
ALTER TABLE `User`
  MODIFY `user_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `UserProfile`
--
ALTER TABLE `UserProfile`
  MODIFY `profile_id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `AcademicTerm`
--
ALTER TABLE `AcademicTerm`
  ADD CONSTRAINT `academicterm_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`);

--
-- Constraints for table `AuthCredential`
--
ALTER TABLE `AuthCredential`
  ADD CONSTRAINT `authcredential_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

--
-- Constraints for table `ClassGroup`
--
ALTER TABLE `ClassGroup`
  ADD CONSTRAINT `classgroup_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  ADD CONSTRAINT `classgroup_ibfk_2` FOREIGN KEY (`grade_id`) REFERENCES `Grade` (`grade_id`);

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
-- Constraints for table `RolePermission`
--
ALTER TABLE `RolePermission`
  ADD CONSTRAINT `rolepermission_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `Role` (`role_id`),
  ADD CONSTRAINT `rolepermission_ibfk_2` FOREIGN KEY (`perm_id`) REFERENCES `Permission` (`perm_id`);

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
  ADD CONSTRAINT `studentsubjectenrollment_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  ADD CONSTRAINT `studentsubjectenrollment_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  ADD CONSTRAINT `studentsubjectenrollment_ibfk_3` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`);

--
-- Constraints for table `TeacherSubjectAssignment`
--
ALTER TABLE `TeacherSubjectAssignment`
  ADD CONSTRAINT `teachersubjectassignment_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  ADD CONSTRAINT `teachersubjectassignment_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  ADD CONSTRAINT `teachersubjectassignment_ibfk_3` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  ADD CONSTRAINT `teachersubjectassignment_ibfk_4` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`);

--
-- Constraints for table `UserProfile`
--
ALTER TABLE `UserProfile`
  ADD CONSTRAINT `userprofile_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`);

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
