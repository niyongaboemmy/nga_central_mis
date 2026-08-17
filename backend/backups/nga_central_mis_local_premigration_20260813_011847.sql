-- MySQL dump 10.13  Distrib 9.6.0, for macos26.3 (arm64)
--
-- Host: localhost    Database: nga_central_mis
-- ------------------------------------------------------
-- Server version	9.6.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '';

--
-- Table structure for table `AcademicTerm`
--

DROP TABLE IF EXISTS `AcademicTerm`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AcademicTerm` (
  `academic_term_id` bigint NOT NULL AUTO_INCREMENT,
  `academic_year_id` bigint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`academic_term_id`),
  KEY `academic_year_id` (`academic_year_id`),
  CONSTRAINT `academicterm_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AcademicTerm`
--

LOCK TABLES `AcademicTerm` WRITE;
/*!40000 ALTER TABLE `AcademicTerm` DISABLE KEYS */;
INSERT INTO `AcademicTerm` VALUES (1,2,'Term 1','2024-09-01','2024-12-15',1),(2,2,'Term 2','2025-01-10','2025-03-31',0),(3,2,'Term 3','2025-04-10','2025-07-15',0);
/*!40000 ALTER TABLE `AcademicTerm` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AcademicYear`
--

DROP TABLE IF EXISTS `AcademicYear`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AcademicYear` (
  `academic_year_id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`academic_year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AcademicYear`
--

LOCK TABLES `AcademicYear` WRITE;
/*!40000 ALTER TABLE `AcademicYear` DISABLE KEYS */;
INSERT INTO `AcademicYear` VALUES (1,'2023-2024','2023-09-01','2024-07-31',0),(2,'2024-2025','2024-09-01','2025-07-31',1);
/*!40000 ALTER TABLE `AcademicYear` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AuthCredential`
--

DROP TABLE IF EXISTS `AuthCredential`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `AuthCredential` (
  `auth_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `mfa_enabled` tinyint(1) DEFAULT '0',
  `failed_attempts` int DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  PRIMARY KEY (`auth_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `authcredential_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AuthCredential`
--

LOCK TABLES `AuthCredential` WRITE;
/*!40000 ALTER TABLE `AuthCredential` DISABLE KEYS */;
INSERT INTO `AuthCredential` VALUES (1,1,'$2y$hash_super',1,0,NULL),(2,2,'$2y$hash_admin',1,0,NULL),(3,3,'$2y$hash_head',1,0,NULL),(4,4,'$2y$hash_teacher',0,0,NULL),(5,5,'$2y$hash_accountant',0,0,NULL),(6,6,'$2y$hash_student1',0,0,NULL),(7,7,'$2y$hash_student2',0,0,NULL),(8,8,'$2y$hash_parent',0,0,NULL);
/*!40000 ALTER TABLE `AuthCredential` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ClassGroup`
--

DROP TABLE IF EXISTS `ClassGroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ClassGroup` (
  `class_group_id` bigint NOT NULL AUTO_INCREMENT,
  `academic_year_id` bigint NOT NULL,
  `grade_id` bigint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`class_group_id`),
  UNIQUE KEY `academic_year_id` (`academic_year_id`,`grade_id`,`name`),
  KEY `grade_id` (`grade_id`),
  CONSTRAINT `classgroup_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  CONSTRAINT `classgroup_ibfk_2` FOREIGN KEY (`grade_id`) REFERENCES `Grade` (`grade_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ClassGroup`
--

LOCK TABLES `ClassGroup` WRITE;
/*!40000 ALTER TABLE `ClassGroup` DISABLE KEYS */;
INSERT INTO `ClassGroup` VALUES (1,2,1,'A'),(2,2,1,'B'),(3,2,4,'A'),(4,2,7,'SPES-1');
/*!40000 ALTER TABLE `ClassGroup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Grade`
--

DROP TABLE IF EXISTS `Grade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Grade` (
  `grade_id` bigint NOT NULL AUTO_INCREMENT,
  `program_id` bigint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_order` int NOT NULL,
  PRIMARY KEY (`grade_id`),
  UNIQUE KEY `program_id` (`program_id`,`name`),
  CONSTRAINT `grade_ibfk_1` FOREIGN KEY (`program_id`) REFERENCES `Program` (`program_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Grade`
--

LOCK TABLES `Grade` WRITE;
/*!40000 ALTER TABLE `Grade` DISABLE KEYS */;
INSERT INTO `Grade` VALUES (1,2,'Grade 1',1),(2,2,'Grade 2',2),(3,2,'Grade 3',3),(4,3,'Grade 7',7),(5,3,'Grade 8',8),(6,3,'Grade 9',9),(7,4,'SPES',1);
/*!40000 ALTER TABLE `Grade` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `GradeSubject`
--

DROP TABLE IF EXISTS `GradeSubject`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `GradeSubject` (
  `grade_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  PRIMARY KEY (`grade_id`,`subject_id`),
  KEY `subject_id` (`subject_id`),
  CONSTRAINT `gradesubject_ibfk_1` FOREIGN KEY (`grade_id`) REFERENCES `Grade` (`grade_id`),
  CONSTRAINT `gradesubject_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `GradeSubject`
--

LOCK TABLES `GradeSubject` WRITE;
/*!40000 ALTER TABLE `GradeSubject` DISABLE KEYS */;
INSERT INTO `GradeSubject` VALUES (1,1),(2,1),(1,2),(2,2),(1,3),(2,3),(7,5),(7,6);
/*!40000 ALTER TABLE `GradeSubject` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `OTP`
--

DROP TABLE IF EXISTS `OTP`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `OTP` (
  `otp_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `otp_code` varchar(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_type` enum('LOGIN_2FA','PASSWORD_RESET','EMAIL_VERIFICATION') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'LOGIN_2FA',
  `expires_at` datetime NOT NULL,
  `is_used` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`otp_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `otp_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `OTP`
--

LOCK TABLES `OTP` WRITE;
/*!40000 ALTER TABLE `OTP` DISABLE KEYS */;
/*!40000 ALTER TABLE `OTP` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Permission`
--

DROP TABLE IF EXISTS `Permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Permission` (
  `perm_id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`perm_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Permission`
--

LOCK TABLES `Permission` WRITE;
/*!40000 ALTER TABLE `Permission` DISABLE KEYS */;
INSERT INTO `Permission` VALUES (1,'MANAGE_USERS','Create, update, deactivate users'),(2,'MANAGE_ROLES','Manage roles and permissions'),(3,'MANAGE_ACADEMICS','Manage academic structures'),(4,'MANAGE_CLASSES','Manage classes and groups'),(5,'MARK_ATTENDANCE','Mark student attendance'),(6,'VIEW_ATTENDANCE','View attendance'),(7,'ENTER_MARKS','Enter assessment marks'),(8,'VIEW_RESULTS','View exam results'),(9,'MANAGE_FEES','Manage fee structures and payments'),(10,'VIEW_FINANCE','View finance reports'),(11,'SEND_ANNOUNCEMENTS','Publish announcements'),(12,'UPLOAD_DOCUMENTS','Upload documents');
/*!40000 ALTER TABLE `Permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Program`
--

DROP TABLE IF EXISTS `Program`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Program` (
  `program_id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`program_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Program`
--

LOCK TABLES `Program` WRITE;
/*!40000 ALTER TABLE `Program` DISABLE KEYS */;
INSERT INTO `Program` VALUES (1,'Nursery','Early childhood education'),(2,'Primary','Primary education'),(3,'Secondary','Lower secondary education'),(4,'Coding Academy','Software & Embedded Systems');
/*!40000 ALTER TABLE `Program` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Role`
--

DROP TABLE IF EXISTS `Role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Role` (
  `role_id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Role`
--

LOCK TABLES `Role` WRITE;
/*!40000 ALTER TABLE `Role` DISABLE KEYS */;
INSERT INTO `Role` VALUES (1,'SUPER_ADMIN','Full system control'),(2,'ADMIN','School management'),(3,'HEAD_TEACHER','Academic oversight'),(4,'TEACHER','Teaching staff'),(5,'ACCOUNTANT','Finance management'),(6,'STUDENT','Learner'),(7,'PARENT','Parent/Guardian'),(8,'STAFF','Support staff');
/*!40000 ALTER TABLE `Role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `RolePermission`
--

DROP TABLE IF EXISTS `RolePermission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `RolePermission` (
  `role_id` bigint NOT NULL,
  `perm_id` bigint NOT NULL,
  PRIMARY KEY (`role_id`,`perm_id`),
  KEY `perm_id` (`perm_id`),
  CONSTRAINT `rolepermission_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `Role` (`role_id`),
  CONSTRAINT `rolepermission_ibfk_2` FOREIGN KEY (`perm_id`) REFERENCES `Permission` (`perm_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `RolePermission`
--

LOCK TABLES `RolePermission` WRITE;
/*!40000 ALTER TABLE `RolePermission` DISABLE KEYS */;
INSERT INTO `RolePermission` VALUES (1,1),(2,1),(1,2),(2,2),(1,3),(2,3),(3,3),(1,4),(2,4),(3,4),(1,5),(4,5),(1,6),(3,6),(4,6),(6,6),(7,6),(8,6),(1,7),(4,7),(1,8),(3,8),(4,8),(6,8),(7,8),(1,9),(2,9),(5,9),(1,10),(2,10),(5,10),(1,11),(2,11),(3,11),(1,12);
/*!40000 ALTER TABLE `RolePermission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `StudentClassGroup`
--

DROP TABLE IF EXISTS `StudentClassGroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `StudentClassGroup` (
  `user_id` bigint NOT NULL,
  `class_group_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`class_group_id`),
  KEY `class_group_id` (`class_group_id`),
  CONSTRAINT `studentclassgroup_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `studentclassgroup_ibfk_2` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `StudentClassGroup`
--

LOCK TABLES `StudentClassGroup` WRITE;
/*!40000 ALTER TABLE `StudentClassGroup` DISABLE KEYS */;
INSERT INTO `StudentClassGroup` VALUES (6,1,'2026-01-05 18:47:48'),(7,2,'2026-01-05 18:47:48');
/*!40000 ALTER TABLE `StudentClassGroup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `StudentSubjectEnrollment`
--

DROP TABLE IF EXISTS `StudentSubjectEnrollment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `StudentSubjectEnrollment` (
  `user_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `academic_term_id` bigint NOT NULL,
  `enrolled_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`subject_id`,`academic_term_id`),
  KEY `subject_id` (`subject_id`),
  KEY `academic_term_id` (`academic_term_id`),
  CONSTRAINT `studentsubjectenrollment_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `studentsubjectenrollment_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  CONSTRAINT `studentsubjectenrollment_ibfk_3` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `StudentSubjectEnrollment`
--

LOCK TABLES `StudentSubjectEnrollment` WRITE;
/*!40000 ALTER TABLE `StudentSubjectEnrollment` DISABLE KEYS */;
INSERT INTO `StudentSubjectEnrollment` VALUES (6,1,1,'2026-01-05 18:48:26'),(6,2,1,'2026-01-05 18:48:26'),(7,1,1,'2026-01-05 18:48:26'),(7,2,1,'2026-01-05 18:48:26');
/*!40000 ALTER TABLE `StudentSubjectEnrollment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Subject`
--

DROP TABLE IF EXISTS `Subject`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `Subject` (
  `subject_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`subject_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Subject`
--

LOCK TABLES `Subject` WRITE;
/*!40000 ALTER TABLE `Subject` DISABLE KEYS */;
INSERT INTO `Subject` VALUES (1,'MAT','Mathematics',NULL),(2,'ENG','English',NULL),(3,'SCI','Science',NULL),(4,'ICT','ICT',NULL),(5,'PROG','Programming',NULL),(6,'EMB','Embedded Systems',NULL);
/*!40000 ALTER TABLE `Subject` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `TeacherSubjectAssignment`
--

DROP TABLE IF EXISTS `TeacherSubjectAssignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `TeacherSubjectAssignment` (
  `user_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `class_group_id` bigint NOT NULL,
  `academic_term_id` bigint NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`subject_id`,`class_group_id`,`academic_term_id`),
  KEY `subject_id` (`subject_id`),
  KEY `class_group_id` (`class_group_id`),
  KEY `academic_term_id` (`academic_term_id`),
  CONSTRAINT `teachersubjectassignment_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `teachersubjectassignment_ibfk_2` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  CONSTRAINT `teachersubjectassignment_ibfk_3` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  CONSTRAINT `teachersubjectassignment_ibfk_4` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `TeacherSubjectAssignment`
--

LOCK TABLES `TeacherSubjectAssignment` WRITE;
/*!40000 ALTER TABLE `TeacherSubjectAssignment` DISABLE KEYS */;
INSERT INTO `TeacherSubjectAssignment` VALUES (3,5,4,1,'2026-01-05 18:48:38'),(4,1,1,1,'2026-01-05 18:48:38'),(4,2,1,1,'2026-01-05 18:48:38');
/*!40000 ALTER TABLE `TeacherSubjectAssignment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `User`
--

DROP TABLE IF EXISTS `User`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `User` (
  `user_id` bigint NOT NULL AUTO_INCREMENT,
  `username` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','SUSPENDED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `User`
--

LOCK TABLES `User` WRITE;
/*!40000 ALTER TABLE `User` DISABLE KEYS */;
INSERT INTO `User` VALUES (1,'superadmin','superadmin@nga.ac.rw','+250788100001','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55'),(2,'admin','admin@nga.ac.rw','+250788100002','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55'),(3,'headteacher','headteacher@nga.ac.rw','+250788100003','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55'),(4,'teacher_john','john.teacher@nga.ac.rw','+250788100004','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55'),(5,'accountant','finance@nga.ac.rw','+250788100005','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55'),(6,'student_alice','alice.student@nga.ac.rw','+250788100006','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55'),(7,'student_paul','paul.student@nga.ac.rw','+250788100007','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55'),(8,'parent_grace','grace.parent@nga.ac.rw','+250788100008','ACTIVE','2026-01-05 18:44:55','2026-01-05 18:44:55');
/*!40000 ALTER TABLE `User` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserProfile`
--

DROP TABLE IF EXISTS `UserProfile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UserProfile` (
  `profile_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `first_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` enum('MALE','FEMALE','OTHER') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_type` enum('STUDENT','TEACHER','ADMIN','PARENT','STAFF') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`profile_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `userprofile_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserProfile`
--

LOCK TABLES `UserProfile` WRITE;
/*!40000 ALTER TABLE `UserProfile` DISABLE KEYS */;
INSERT INTO `UserProfile` VALUES (1,1,'System','Owner','MALE',NULL,NULL,'ADMIN',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09'),(2,2,'James','Admin','MALE',NULL,NULL,'ADMIN',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09'),(3,3,'David','Mukamana','MALE',NULL,NULL,'TEACHER',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09'),(4,4,'John','Uwimana','MALE',NULL,NULL,'TEACHER',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09'),(5,5,'Sarah','Finance','FEMALE',NULL,NULL,'STAFF',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09'),(6,6,'Alice','Uwamahoro','FEMALE',NULL,NULL,'STUDENT',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09'),(7,7,'Paul','Nkurunziza','MALE',NULL,NULL,'STUDENT',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09'),(8,8,'Grace','Mukamana','FEMALE',NULL,NULL,'PARENT',NULL,'2026-01-07 00:45:09','2026-01-07 00:45:09');
/*!40000 ALTER TABLE `UserProfile` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserRole`
--

DROP TABLE IF EXISTS `UserRole`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `UserRole` (
  `user_id` bigint NOT NULL,
  `role_id` bigint NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `userrole_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `userrole_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `Role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserRole`
--

LOCK TABLES `UserRole` WRITE;
/*!40000 ALTER TABLE `UserRole` DISABLE KEYS */;
INSERT INTO `UserRole` VALUES (1,1),(2,2),(3,3),(4,4),(5,5),(6,6),(7,6),(8,7);
/*!40000 ALTER TABLE `UserRole` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-13  1:18:48
