-- MySQL dump 10.13  Distrib 5.7.39, for osx11.0 (x86_64)
--
-- Host: 127.0.0.1    Database: nga_central_mis
-- ------------------------------------------------------
-- Server version	5.7.39-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `AcademicCalendar`
--

DROP TABLE IF EXISTS `AcademicCalendar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `AcademicCalendar` (
  `calendar_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `academic_year_id` bigint(20) NOT NULL,
  `academic_term_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) NOT NULL,
  `name` varchar(150) DEFAULT NULL COMMENT 'Optional name for the calendar',
  `description` text,
  `is_active` tinyint(4) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`calendar_id`),
  UNIQUE KEY `unique_calendar` (`academic_year_id`,`academic_term_id`,`class_group_id`),
  KEY `idx_academic_calendar_year` (`academic_year_id`),
  KEY `idx_academic_calendar_term` (`academic_term_id`),
  KEY `idx_academic_calendar_class` (`class_group_id`),
  CONSTRAINT `academiccalendar_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  CONSTRAINT `academiccalendar_ibfk_2` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  CONSTRAINT `academiccalendar_ibfk_3` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AcademicCalendar`
--

LOCK TABLES `AcademicCalendar` WRITE;
/*!40000 ALTER TABLE `AcademicCalendar` DISABLE KEYS */;
INSERT INTO `AcademicCalendar` VALUES (1,3,4,9,'SPES Calendar','The desc here',1,'2026-03-04 13:52:12','2026-03-04 13:52:12'),(2,3,4,24,NULL,NULL,1,'2026-03-04 14:01:38','2026-03-04 14:01:38'),(3,3,6,9,'SPES Calendar','SPES Calendar',1,'2026-05-06 21:34:00','2026-05-06 21:34:00'),(4,5,7,41,'Coding 2 Calendar',NULL,1,'2026-08-05 15:24:12','2026-08-05 15:24:12'),(5,5,7,10,NULL,NULL,1,'2026-08-05 15:24:36','2026-08-05 15:24:36');
/*!40000 ALTER TABLE `AcademicCalendar` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AcademicTerm`
--

DROP TABLE IF EXISTS `AcademicTerm`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `AcademicTerm` (
  `academic_term_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `academic_year_id` bigint(20) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`academic_term_id`),
  KEY `academic_year_id` (`academic_year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AcademicTerm`
--

LOCK TABLES `AcademicTerm` WRITE;
/*!40000 ALTER TABLE `AcademicTerm` DISABLE KEYS */;
INSERT INTO `AcademicTerm` VALUES (4,3,'Term 2','2026-01-05','2026-04-03',0),(5,3,'Term 1','2025-10-01','2025-12-20',0),(6,3,'Term 3','2026-04-01','2026-08-06',0),(7,5,'Term 1','2026-07-29','2027-08-31',1),(8,5,'Term 2','2027-07-28','2027-09-28',0);
/*!40000 ALTER TABLE `AcademicTerm` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AcademicYear`
--

DROP TABLE IF EXISTS `AcademicYear`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `AcademicYear` (
  `academic_year_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `is_current` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`academic_year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AcademicYear`
--

LOCK TABLES `AcademicYear` WRITE;
/*!40000 ALTER TABLE `AcademicYear` DISABLE KEYS */;
INSERT INTO `AcademicYear` VALUES (3,'2025-2026','2025-07-01','2026-07-30',0),(5,'2026-2027','2026-07-28','2027-10-28',1);
/*!40000 ALTER TABLE `AcademicYear` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ActivityLog`
--

DROP TABLE IF EXISTS `ActivityLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ActivityLog` (
  `activity_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `actor_id` bigint(20) DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `description` varchar(500) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` bigint(20) DEFAULT NULL,
  `metadata` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`activity_id`),
  KEY `ActivityLog_user_id_User_user_id_fk` (`user_id`),
  KEY `ActivityLog_actor_id_User_user_id_fk` (`actor_id`),
  CONSTRAINT `ActivityLog_actor_id_User_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `ActivityLog_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=542 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ActivityLog`
--

LOCK TABLES `ActivityLog` WRITE;
/*!40000 ALTER TABLE `ActivityLog` DISABLE KEYS */;
INSERT INTO `ActivityLog` VALUES (1,20,NULL,'FAMILY_LINK','Linked to parent (ID: 1)','Parenting',NULL,'{\"parent_id\":1,\"relationship\":\"PARENT\",\"assigned_by\":1}','2026-01-19 21:59:53'),(2,1,NULL,'FAMILY_LINK','Linked to student (ID: 20)','Parenting',NULL,'{\"student_id\":20,\"relationship\":\"PARENT\",\"assigned_by\":1}','2026-01-19 21:59:53'),(3,22,1,'FAMILY_LINK','Linked to parent (ID: 13)','Parenting',NULL,'{\"parent_id\":13,\"relationship\":\"PARENT\",\"assigned_by\":1}','2026-01-19 22:25:02'),(4,13,1,'FAMILY_LINK','Linked to student (ID: 22)','Parenting',NULL,'{\"student_id\":22,\"relationship\":\"PARENT\",\"assigned_by\":1}','2026-01-19 22:25:02'),(5,22,22,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',22,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-19T20:27:50.371Z\"}','2026-01-19 22:27:50'),(6,22,22,'PASSWORD_CHANGE','User successfully changed their password','AuthCredential',22,NULL,'2026-01-19 22:28:00'),(7,22,22,'FOLDER_CREATE','Folder created: Dev','DocumentFolder',19,'{\"name\":\"Dev\"}','2026-01-19 22:28:43'),(8,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-19T20:29:05.213Z\"}','2026-01-19 22:29:05'),(9,14,NULL,'ACCOUNT_DISABLE','User account was disabled by administrator','User',14,NULL,'2026-01-19 22:45:24'),(10,14,NULL,'ACCOUNT_ENABLE','User account was enabled by administrator','User',14,NULL,'2026-01-19 22:46:53'),(11,13,1,'PROGRAM_LEAD_ASSIGN','You have been assigned as lead for program ID: 8','UserProgramLead',NULL,'{\"program_id\":8,\"assigned_by\":1}','2026-01-19 23:22:42'),(12,13,1,'PROGRAM_LEAD_REMOVE','You have been removed as lead for program ID: 8','UserProgramLead',NULL,'{\"program_id\":8,\"removed_by\":1}','2026-01-19 23:22:46'),(13,1,1,'COURSE_CATEGORY_CREATE','Created course category: Specific Module','CourseCategory',NULL,'{\"name\":\"Specific Module\",\"description\":\"Specific Module\"}','2026-01-20 00:15:54'),(14,1,1,'COURSE_CATEGORY_UPDATE','Updated course category: Specific Module','CourseCategory',1,'{\"name\":\"Specific Module\",\"description\":\"Specific Module1\"}','2026-01-20 00:16:01'),(15,1,1,'COURSE_CATEGORY_UPDATE','Updated course category: Specific Module','CourseCategory',1,'{\"name\":\"Specific Module\",\"description\":\"Specific Module\"}','2026-01-20 00:16:05'),(16,1,1,'SUBJECT_UPDATE','Updated subject: Development of Web User Interface','Subject',9,'{\"code\":\"SPEWI302\",\"name\":\"Development of Web User Interface\",\"description\":null}','2026-01-20 00:16:18'),(17,1,1,'SUBJECT_UPDATE','Updated subject: Development of Web User Interface','Subject',9,'{\"code\":\"SPEWI302\",\"name\":\"Development of Web User Interface\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}','2026-01-20 00:17:32'),(18,1,1,'SUBJECT_UPDATE','Updated subject: Graphic User Interface Design','Subject',8,'{\"code\":\"SPEGI302\",\"name\":\"Graphic User Interface Design\",\"description\":null,\"course_category_id\":1,\"max_marks\":10}','2026-01-20 00:25:01'),(19,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T09:48:28.043Z\"}','2026-01-25 11:48:28'),(20,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T09:50:09.952Z\"}','2026-01-25 11:50:09'),(21,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-25T11:23:23.277Z\"}','2026-01-25 13:23:23'),(22,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T09:45:36.863Z\"}','2026-01-26 11:45:36'),(23,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-26T10:51:45.477Z\"}','2026-01-26 12:51:45'),(24,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-28T09:10:17.448Z\"}','2026-01-28 11:10:17'),(25,15,15,'PASSWORD_RESET','User successfully reset their password','AuthCredential',15,NULL,'2026-01-28 11:21:42'),(26,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-28T09:22:18.172Z\"}','2026-01-28 11:22:18'),(27,15,15,'PASSWORD_CHANGE','User successfully changed their password','AuthCredential',15,NULL,'2026-01-28 11:22:28'),(28,15,15,'SCHEME_UPLOAD','Uploaded scheme of work for subject ID 9','SchemeOfWork',1,'{\"subject_id\":\"9\",\"entries_count\":13}','2026-01-28 12:16:53'),(29,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-28T13:32:47.456Z\"}','2026-01-28 15:32:47'),(30,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-01-28T13:37:49.189Z\"}','2026-01-28 15:37:49'),(31,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-02T21:32:59.646Z\"}','2026-02-02 23:32:59'),(32,23,1,'USER_CREATE','Created user: test_student','User',23,'{\"username\":\"test_student\",\"email\":\"universalbridgeltd@gmail.com\",\"roles\":[6]}','2026-02-02 23:36:00'),(33,23,1,'CLASS_GROUP_ASSIGN','You have been assigned to class group ID: 9','StudentClassGroup',NULL,'{\"class_group_id\":9,\"assigning_user_id\":1}','2026-02-02 23:37:45'),(34,1,1,'CLASS_GROUP_ASSIGN_ADMIN','Assigned student ID: 23 to class group ID: 9','StudentClassGroup',NULL,'{\"studentId\":23,\"classGroupId\":9}','2026-02-02 23:37:45'),(35,23,1,'SUBJECT_ENROLL','You have been enrolled in subject ID: 9','StudentSubjectEnrollment',NULL,'{\"subject_id\":9,\"academic_term_id\":4,\"enrolling_user_id\":1}','2026-02-02 23:37:55'),(36,1,1,'SUBJECT_ENROLL_ADMIN','Enrolled student ID: 23 in subject ID: 9','StudentSubjectEnrollment',NULL,'{\"studentId\":23,\"subjectId\":9,\"academic_term_id\":4}','2026-02-02 23:37:55'),(37,23,1,'SUBJECT_ENROLL','You have been enrolled in subject ID: 8','StudentSubjectEnrollment',NULL,'{\"subject_id\":8,\"academic_term_id\":4,\"enrolling_user_id\":1}','2026-02-02 23:37:58'),(38,1,1,'SUBJECT_ENROLL_ADMIN','Enrolled student ID: 23 in subject ID: 8','StudentSubjectEnrollment',NULL,'{\"studentId\":23,\"subjectId\":8,\"academic_term_id\":4}','2026-02-02 23:37:58'),(39,23,23,'PASSWORD_RESET','User successfully reset their password','AuthCredential',23,NULL,'2026-02-02 23:43:28'),(40,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-02T21:44:07.251Z\"}','2026-02-02 23:44:07'),(41,23,23,'PASSWORD_CHANGE','User successfully changed their password','AuthCredential',23,NULL,'2026-02-02 23:44:18'),(42,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-02T22:01:58.616Z\"}','2026-02-03 00:01:58'),(43,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-03T23:03:59.013Z\"}','2026-02-04 01:03:59'),(44,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-03T23:25:51.241Z\"}','2026-02-04 01:25:51'),(45,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-04T13:33:09.856Z\"}','2026-02-04 15:33:09'),(46,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-04T13:39:55.449Z\"}','2026-02-04 15:39:55'),(47,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-04T13:44:58.450Z\"}','2026-02-04 15:44:58'),(48,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-04T16:22:46.925Z\"}','2026-02-04 18:22:46'),(49,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-04T22:37:42.545Z\"}','2026-02-05 00:37:42'),(50,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-07T12:17:25.805Z\"}','2026-02-07 14:17:25'),(51,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-07T13:12:59.833Z\"}','2026-02-07 15:12:59'),(52,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T18:48:50.701Z\"}','2026-02-23 20:48:50'),(53,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T18:56:54.018Z\"}','2026-02-23 20:56:54'),(54,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T22:20:52.178Z\"}','2026-02-24 00:20:52'),(55,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T22:54:05.318Z\"}','2026-02-24 00:54:05'),(56,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T22:55:05.713Z\"}','2026-02-24 00:55:05'),(57,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T22:56:36.070Z\"}','2026-02-24 00:56:36'),(58,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-23T23:40:21.055Z\"}','2026-02-24 01:40:21'),(59,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-24T08:18:07.192Z\"}','2026-02-24 10:18:07'),(60,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-25T13:52:34.710Z\"}','2026-02-25 15:52:34'),(61,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-26T16:27:41.290Z\"}','2026-02-26 18:27:41'),(62,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-26T16:28:49.984Z\"}','2026-02-26 18:28:49'),(63,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-27T17:48:39.371Z\"}','2026-02-27 19:48:39'),(64,1,1,'SUBJECT_UPDATE','Updated subject: Kinyarwanda','Subject',12,'{\"code\":\"CCMKN302\",\"name\":\"Kinyarwanda\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}','2026-02-27 19:58:45'),(65,1,1,'SUBJECT_UPDATE','Updated subject: Web Application Development Using JavaScript','Subject',10,'{\"code\":\"SPEWJ302\",\"name\":\"Web Application Development Using JavaScript\",\"description\":null,\"course_category_id\":1,\"max_marks\":100}','2026-02-27 19:59:05'),(66,1,1,'GRADE_SUBJECT_ASSIGN','Assigned subject ID 10 to grade ID 10','GradeSubject',NULL,'{\"grade_id\":10,\"subject_id\":10}','2026-02-27 19:59:05'),(67,1,1,'PROFILE_UPDATE','User updated their personal profile information','UserProfile',1,'{\"first_name\":\"Niyongabo\",\"last_name\":\"Emmanuel\",\"gender\":\"MALE\",\"date_of_birth\":null,\"address\":null,\"external_id\":null}','2026-02-27 20:03:31'),(68,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-27T18:30:54.237Z\"}','2026-02-27 20:30:54'),(69,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-02-28T16:28:36.097Z\"}','2026-02-28 18:28:36'),(70,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-01T10:12:33.938Z\"}','2026-03-01 12:12:33'),(71,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-01T16:32:04.496Z\"}','2026-03-01 18:32:04'),(72,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-02T10:26:39.930Z\"}','2026-03-02 12:26:39'),(73,15,15,'FOLDER_CREATE','Folder created: Notes','DocumentFolder',20,'{\"name\":\"Notes\"}','2026-03-02 19:34:24'),(74,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-02T17:48:10.641Z\"}','2026-03-02 19:48:10'),(75,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T11:57:20.512Z\"}','2026-03-03 13:57:20'),(76,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T11:57:38.937Z\"}','2026-03-03 13:57:38'),(77,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,34]}','2026-03-03 13:58:37'),(78,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,34,33,35]}','2026-03-03 13:59:15'),(79,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T12:00:05.405Z\"}','2026-03-03 14:00:05'),(80,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,34,33,35,3,17]}','2026-03-03 14:00:57'),(81,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: SUPER_ADMIN','Role',1,'{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,35,36,38,37]}','2026-03-03 14:14:22'),(82,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: CLASS_TEACHER','Role',11,'{\"permissionIds\":[25,26,33,34,14,38]}','2026-03-03 14:15:08'),(83,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,17,37,38,36,35]}','2026-03-03 14:16:47'),(84,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: STUDENT','Role',6,'{\"permissionIds\":[6,8,39]}','2026-03-03 14:16:59'),(85,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35]}','2026-03-03 14:17:31'),(86,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T12:25:00.210Z\"}','2026-03-03 14:25:00'),(87,23,23,'FOLDER_CREATE','Folder created: Docs','DocumentFolder',21,'{\"name\":\"Docs\"}','2026-03-03 18:51:12'),(88,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T19:03:44.744Z\"}','2026-03-03 21:03:44'),(89,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T20:40:45.899Z\"}','2026-03-03 22:40:45'),(90,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-03T20:43:43.952Z\"}','2026-03-03 22:43:43'),(91,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T18:10:52.915Z\"}','2026-03-04 20:10:52'),(92,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,34]}','2026-03-04 20:14:13'),(93,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,34]}','2026-03-04 20:21:37'),(94,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35]}','2026-03-04 20:48:42'),(95,1,1,'SUBJECT_UPDATE','Updated subject: Graphic User Interface Design','Subject',8,'{\"code\":\"SPEGI302\",\"name\":\"Graphic User Interface Design\",\"description\":null,\"course_category_id\":1,\"max_marks\":10,\"color\":\"#eb7c14\"}','2026-03-04 22:11:28'),(96,1,1,'SUBJECT_UPDATE','Updated subject: Web Application Development Using JavaScript','Subject',10,'{\"code\":\"SPEWJ302\",\"name\":\"Web Application Development Using JavaScript\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#06bc12\"}','2026-03-04 22:11:56'),(97,1,1,'SUBJECT_UPDATE','Updated subject: Kinyarwanda','Subject',12,'{\"code\":\"CCMKN302\",\"name\":\"Kinyarwanda\",\"description\":null,\"course_category_id\":1,\"max_marks\":100,\"color\":\"#8ac40e\"}','2026-03-04 22:12:11'),(98,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T20:50:33.527Z\"}','2026-03-04 22:50:33'),(99,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T20:52:43.199Z\"}','2026-03-04 22:52:43'),(100,23,1,'SUBJECT_ENROLL','You have been enrolled in subject ID: 10','StudentSubjectEnrollment',NULL,'{\"subject_id\":10,\"academic_term_id\":4,\"enrolling_user_id\":1}','2026-03-04 22:53:10'),(101,1,1,'SUBJECT_ENROLL_ADMIN','Enrolled student ID: 23 in subject ID: 10','StudentSubjectEnrollment',NULL,'{\"studentId\":23,\"subjectId\":10,\"academic_term_id\":4}','2026-03-04 22:53:10'),(102,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-04T21:41:31.918Z\"}','2026-03-04 23:41:31'),(103,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-06T16:05:03.870Z\"}','2026-03-06 18:05:03'),(104,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T18:43:42.949Z\"}','2026-03-07 20:43:42'),(105,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-07T18:51:11.557Z\"}','2026-03-07 20:51:11'),(106,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T09:14:32.323Z\"}','2026-03-09 11:14:32'),(107,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-09T10:35:55.314Z\"}','2026-03-09 12:35:55'),(108,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: SUPER_ADMIN','Role',1,'{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,35,36,38,37,44]}','2026-03-09 12:36:16'),(109,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-10T12:50:18.535Z\"}','2026-03-10 14:50:18'),(110,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-12T14:51:44.961Z\"}','2026-03-12 16:51:44'),(111,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: ADMIN','Role',2,'{\"permissionIds\":[1,2,3,4,9,10,11,12,29,30,31,45]}','2026-03-12 16:52:22'),(112,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: SUPER_ADMIN','Role',1,'{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,35,36,38,37,44,45]}','2026-03-12 16:52:29'),(113,14,1,'SUBJECT_ASSIGN','You have been assigned to subject ID: 12','TeacherSubjectAssignment',NULL,'{\"subject_id\":12,\"academic_term_id\":4,\"assigning_user_id\":1}','2026-03-13 11:58:44'),(114,1,1,'SUBJECT_ASSIGN_ADMIN','Assigned teacher ID: 14 to subject ID: 12','TeacherSubjectAssignment',NULL,'{\"teacherId\":14,\"subjectId\":12,\"academic_term_id\":4}','2026-03-13 11:58:44'),(115,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: SUPER_ADMIN','Role',1,'{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,35,36,38,37,44,45,46]}','2026-03-13 13:45:39'),(116,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: PROGRAM_MANAGER','Role',12,'{\"permissionIds\":[16,17,46]}','2026-03-13 13:45:48'),(117,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-13T15:09:42.172Z\"}','2026-03-13 17:09:42'),(118,1,15,'SCHEME_ENTRIES_VALIDATION','Validated 13 scheme entries as APPROVED','SchemeOfWork',1,'{\"entry_ids\":[1,2,3,4,5,6,7,8,9,10,11,12,13],\"status\":\"APPROVED\",\"comment\":\"Validated\"}','2026-03-14 10:09:42'),(119,1,15,'SCHEME_ENTRIES_VALIDATION','Validated 13 scheme entries as APPROVED','SchemeOfWork',1,'{\"entry_ids\":[1,2,3,4,5,6,7,8,9,10,11,12,13],\"status\":\"APPROVED\",\"comment\":\"Validated\"}','2026-03-14 10:27:32'),(120,1,15,'SCHEME_ENTRIES_VALIDATION','Validated 13 scheme entries as REJECTED','SchemeOfWork',1,'{\"entry_ids\":[1,2,3,4,5,6,7,8,9,10,11,12,13],\"status\":\"REJECTED\",\"comment\":\"Rejected\"}','2026-03-14 10:27:43'),(121,1,15,'SCHEME_ENTRIES_VALIDATION','Validated 13 scheme entries as APPROVED','SchemeOfWork',1,'{\"entry_ids\":[1,2,3,4,5,6,7,8,9,10,11,12,13],\"status\":\"APPROVED\",\"comment\":\"You provided correct scheme of work\"}','2026-03-14 10:28:04'),(122,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T08:50:42.718Z\"}','2026-03-14 10:50:42'),(123,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T09:22:15.024Z\"}','2026-03-14 11:22:15'),(124,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,47]}','2026-03-14 11:23:06'),(125,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T09:26:47.658Z\"}','2026-03-14 11:26:47'),(126,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,47,48]}','2026-03-14 11:28:02'),(127,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: CLASS_TEACHER','Role',11,'{\"permissionIds\":[25,26,33,34,14,38,48]}','2026-03-14 11:28:09'),(128,15,NULL,'REPORT_SUBMISSION','Submitted instructor report for period 2026-03-03 to 2026-03-03','InstructorReport',1,NULL,'2026-03-14 12:54:41'),(129,15,NULL,'REPORT_SUBMISSION','Submitted instructor report for period 2026-03-04 to 2026-03-04','InstructorReport',3,NULL,'2026-03-14 13:27:33'),(130,15,NULL,'REPORT_SUBMISSION','Submitted instructor report for period 2026-03-04 to 2026-03-04','InstructorReport',4,NULL,'2026-03-14 14:06:45'),(131,15,NULL,'REPORT_SUBMISSION','Submitted instructor report for period 2026-03-05 to 2026-03-05','InstructorReport',5,NULL,'2026-03-14 14:08:40'),(132,15,NULL,'REPORT_SUBMISSION','Submitted instructor report for period 2026-03-05 to 2026-03-05','InstructorReport',6,NULL,'2026-03-14 15:12:36'),(133,15,NULL,'REPORT_SUBMISSION','Submitted instructor report for period 2026-03-05 to 2026-03-05','InstructorReport',1,NULL,'2026-03-14 17:51:19'),(134,15,NULL,'REPORT_UPDATE','Updated instructor report for period 2026-03-05 to 2026-03-05','InstructorReport',1,NULL,'2026-03-14 19:46:43'),(135,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T17:50:25.042Z\"}','2026-03-14 19:50:25'),(136,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T17:58:50.611Z\"}','2026-03-14 19:58:50'),(137,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-03-14T18:34:29.729Z\"}','2026-03-14 20:34:29'),(138,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: SUPER_ADMIN','Role',1,'{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,35,36,38,37,44,45,46,49]}','2026-03-14 20:36:15'),(139,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: PROGRAM_MANAGER','Role',12,'{\"permissionIds\":[16,17,46,49]}','2026-03-14 20:36:23'),(140,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-04-29T19:50:55.947Z\"}','2026-04-29 21:50:55'),(141,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-06T17:31:35.761Z\"}','2026-05-06 19:31:35'),(142,1,1,'ACADEMIC_TERM_CREATE','Created academic term: Term 3','AcademicTerm',6,'{\"name\":\"Term 3\",\"academic_year_id\":3,\"start_date\":\"2026-04-01\",\"end_date\":\"2026-08-06\",\"is_current\":1}','2026-05-06 19:34:04'),(143,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: ADMIN','Role',2,'{\"permissionIds\":[1,2,3,4,9,10,11,12,29,30,31,45,42,33,35,43,34,36,40,38,37]}','2026-05-06 21:33:10'),(144,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: SUPER_ADMIN','Role',1,'{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,35,36,38,37,44,45,46,49,42,43,40]}','2026-05-06 21:33:39'),(145,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-06T20:29:07.348Z\"}','2026-05-06 22:29:07'),(146,1,1,'COMPETENCY_CREATE','Competency created: Design a web Page','SubjectCompetency',1,'{\"subject_id\":9,\"title\":\"Design a web Page\"}','2026-05-06 22:43:34'),(147,1,1,'SUBJECT_DOCUMENT_UPLOAD','Subject document uploaded: Term 2 Performance_All.pdf','SubjectDocument',1,'{\"subject_id\":9,\"category_id\":1}','2026-05-06 22:44:45'),(148,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:09:17.530Z\"}','2026-05-11 09:09:17'),(149,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:11:19.493Z\"}','2026-05-11 09:11:19'),(150,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,47,48,51,12,15]}','2026-05-11 09:12:55'),(151,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-11T07:13:41.609Z\"}','2026-05-11 09:13:41'),(152,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-05-31T13:20:04.080Z\"}','2026-05-31 15:20:04'),(153,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-27T12:15:53.021Z\"}','2026-07-27 14:15:53'),(154,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-27T15:41:36.682Z\"}','2026-07-27 17:41:36'),(155,14,14,'DOCUMENT_UPLOAD','Document uploaded: test_doc.txt','Document',1,'{\"file_name\":\"1785174788491-ogdxce6mps8.txt\",\"original_name\":\"test_doc.txt\",\"mime_type\":\"text/plain\",\"file_size\":36}','2026-07-27 19:53:11'),(156,14,14,'FOLDER_CREATE','Folder created: Folder A','DocumentFolder',22,'{\"name\":\"Folder A\"}','2026-07-27 19:56:32'),(157,14,14,'FOLDER_CREATE','Folder created: Folder B','DocumentFolder',23,'{\"name\":\"Folder B\"}','2026-07-27 19:56:32'),(158,14,14,'FOLDER_CREATE','Folder created: Folder C','DocumentFolder',24,'{\"name\":\"Folder C\"}','2026-07-27 19:56:33'),(159,14,14,'FOLDER_CREATE','Folder created: Folder B','DocumentFolder',25,'{\"name\":\"Folder B\",\"parentFolderId\":22}','2026-07-27 19:56:48'),(160,14,14,'FOLDER_CREATE','Folder created: Folder C','DocumentFolder',26,'{\"name\":\"Folder C\",\"parentFolderId\":25}','2026-07-27 19:56:48'),(161,14,14,'DOCUMENT_UPLOAD','Document uploaded: nested_doc.txt','Document',2,'{\"file_name\":\"1785175019977-koz5ujy9ttn.txt\",\"original_name\":\"nested_doc.txt\",\"mime_type\":\"text/plain\",\"file_size\":11}','2026-07-27 19:57:03'),(162,14,14,'DOCUMENT_DELETE','Document deleted: test_doc.txt','Document',1,NULL,'2026-07-27 20:06:09'),(163,14,14,'DOCUMENT_DELETE','Document deleted: nested_doc.txt','Document',2,NULL,'2026-07-27 20:06:12'),(164,14,14,'FOLDER_DELETE','Folder deleted: Folder C','DocumentFolder',26,NULL,'2026-07-27 20:06:12'),(165,14,14,'FOLDER_DELETE','Folder deleted: Folder B','DocumentFolder',25,NULL,'2026-07-27 20:06:12'),(166,14,14,'FOLDER_DELETE','Folder deleted: Folder A','DocumentFolder',22,NULL,'2026-07-27 20:06:12'),(167,1,1,'ACADEMIC_YEAR_CREATE','Created academic year: 2026 - 2027','AcademicYear',5,'{\"name\":\"2026 - 2027\",\"start_date\":\"2026-07-28\",\"end_date\":\"2027-10-28\",\"is_current\":1}','2026-07-28 06:18:19'),(168,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-28T04:32:16.682Z\"}','2026-07-28 06:32:16'),(169,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 9 from \"curriculum-sample.txt\"','SchemeOfWork',2,'{\"subject_id\":9,\"entries_count\":18}','2026-07-28 07:26:39'),(170,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302 - GRAPHIC USER INTERFACE DESIGN.pdf\"','SchemeOfWork',3,'{\"subject_id\":8,\"entries_count\":18}','2026-07-28 07:29:35'),(171,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302 - GRAPHIC USER INTERFACE DESIGN.pdf\"','SchemeOfWork',4,'{\"subject_id\":8,\"entries_count\":8}','2026-07-28 07:35:32'),(172,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN.pdf\"','SchemeOfWork',5,'{\"subject_id\":8,\"entries_count\":12}','2026-07-28 08:05:36'),(173,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302 - GRAPHIC USER INTERFACE DESIGN.pdf\"','SchemeOfWork',5,'{\"subject_id\":8,\"entries_count\":6}','2026-07-28 08:09:52'),(174,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEWI302 -DEVELOPMENT OF WEB USER INTERFACE.pdf\"','SchemeOfWork',6,'{\"subject_id\":8,\"entries_count\":16}','2026-07-28 08:15:27'),(175,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 92 (Week 5)','LO_Lesson',8,'{\"entry_id\":92}','2026-07-28 08:25:47'),(176,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 94 (Week 2)','LO_Lesson',10,'{\"entry_id\":94}','2026-07-28 08:33:03'),(177,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 76 (Week 1)','LO_Lesson',11,'{\"entry_id\":76}','2026-07-28 08:37:17'),(178,15,15,'SCHEME_ENTRY_INSERT','Inserted a new week into the scheme of work (subject ID 9), rescheduling 3 following weeks','SchemeOfWork',10,'{\"subject_id\":9,\"entries_count\":4}','2026-07-28 09:31:00'),(179,15,15,'SCHEME_ENTRY_INSERT','Inserted a new week into the scheme of work (subject ID 9), rescheduling 1 following weeks','SchemeOfWork',11,'{\"subject_id\":9,\"entries_count\":2}','2026-07-28 09:33:28'),(180,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 101 (Week 6)','LO_Lesson',12,'{\"entry_id\":101}','2026-07-28 15:33:38'),(181,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-07-29T08:40:47.136Z\"}','2026-07-29 10:40:47'),(182,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-29T09:40:34.577Z\"}','2026-07-29 11:40:34'),(183,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 9 from \"SPEWI302 -DEVELOPMENT OF WEB USER INTERFACE.pdf\"','SchemeOfWork',13,'{\"subject_id\":9,\"entries_count\":12}','2026-07-29 14:40:23'),(184,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 102 (Week 1)','LO_Lesson',13,'{\"entry_id\":102}','2026-07-29 14:41:30'),(185,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 106 (Week 5)','LO_Lesson',14,'{\"entry_id\":106}','2026-07-30 09:30:27'),(186,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-30T07:34:33.110Z\"}','2026-07-30 09:34:33'),(187,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-07-30T07:37:36.418Z\"}','2026-07-30 09:37:36'),(188,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,47,48,51,12,15,50]}','2026-07-30 09:38:04'),(189,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-30T07:38:24.811Z\"}','2026-07-30 09:38:24'),(190,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-07-30T07:39:18.915Z\"}','2026-07-30 09:39:18'),(191,1,1,'ACADEMIC_TERM_CREATE','Created academic term: Term 1','AcademicTerm',7,'{\"name\":\"Term 1\",\"academic_year_id\":5,\"start_date\":\"2026-07-29\",\"end_date\":\"2027-08-31\",\"is_current\":1}','2026-07-30 09:40:03'),(192,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-07-30T07:45:55.255Z\"}','2026-07-30 09:45:55'),(193,1,1,'ACADEMIC_TERM_CREATE','Created academic term: Term 2','AcademicTerm',8,'{\"name\":\"Term 2\",\"academic_year_id\":5,\"start_date\":\"2027-07-28\",\"end_date\":\"2027-09-28\",\"is_current\":0}','2026-07-30 09:57:14'),(194,1,1,'ACADEMIC_YEAR_UPDATE','Updated academic year: 2026-2027','AcademicYear',5,'{\"name\":\"2026-2027\",\"start_date\":{\"decoder\":{},\"shouldInlineParams\":false,\"queryChunks\":[{\"value\":[\"\"]},\"2026-07-28\",{\"value\":[\"\"]}]},\"end_date\":{\"decoder\":{},\"shouldInlineParams\":false,\"queryChunks\":[{\"value\":[\"\"]},\"2027-10-28\",{\"value\":[\"\"]}]},\"is_current\":1}','2026-07-30 09:59:13'),(195,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-30T08:00:14.168Z\"}','2026-07-30 10:00:14'),(196,15,15,'FOLDER_CREATE','Folder created: Notes','DocumentFolder',22,'{\"name\":\"Notes\"}','2026-07-30 10:39:56'),(197,15,15,'DOCUMENT_UPLOAD','Document uploaded: LessonPlan_Development_of_Web_User_Interface_Week5.pdf','Document',1,'{\"file_name\":\"1785400805980-390h36sj0ga.pdf\",\"original_name\":\"LessonPlan_Development_of_Web_User_Interface_Week5.pdf\",\"mime_type\":\"application/pdf\",\"file_size\":39909}','2026-07-30 10:40:12'),(198,15,15,'FOLDER_UPDATE','Folder updated: Notes for New Year','DocumentFolder',22,'{\"name\":\"Notes for New Year\"}','2026-07-30 10:42:53'),(199,13,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-03-15 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',1,NULL,'2026-07-30 15:33:02'),(200,13,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-29 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',2,NULL,'2026-07-30 15:52:21'),(201,14,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-30 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',3,NULL,'2026-07-30 15:52:21'),(202,13,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-05-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',4,NULL,'2026-07-30 16:51:20'),(203,14,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-05-02 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',5,NULL,'2026-07-30 16:51:20'),(204,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 9 from \"SPEWI302 -DEVELOPMENT OF WEB USER INTERFACE.pdf\"','SchemeOfWork',14,'{\"subject_id\":9,\"entries_count\":14}','2026-07-30 16:51:24'),(205,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 114 (Week 1)','LO_Lesson',15,'{\"entry_id\":114}','2026-07-30 16:52:20'),(206,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',6,NULL,'2026-07-30 21:49:12'),(207,13,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-15 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',7,NULL,'2026-07-30 22:18:37'),(208,13,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-29 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',8,NULL,'2026-07-30 22:21:08'),(209,13,NULL,'LESSON_REPORT_UPDATE','Lesson report 8 updated (status: UNPLANNED)','LessonReport',8,NULL,'2026-07-30 22:22:43'),(210,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',9,NULL,'2026-07-30 23:40:05'),(211,13,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-29 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',10,NULL,'2026-07-30 23:42:52'),(212,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',11,NULL,'2026-07-30 23:57:04'),(213,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',12,NULL,'2026-07-30 23:57:14'),(214,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2025-10-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',13,NULL,'2026-07-31 00:02:57'),(215,15,NULL,'LESSON_REPORT_UPDATE','Lesson report 13 updated (status: UNPLANNED)','LessonReport',13,NULL,'2026-07-31 00:03:12'),(216,15,NULL,'LESSON_REPORT_UPDATE','Lesson report 13 updated (status: UNPLANNED)','LessonReport',13,NULL,'2026-07-31 00:06:33'),(217,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',14,NULL,'2026-07-31 00:15:23'),(218,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-07-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',15,NULL,'2026-07-31 00:17:36'),(219,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2025-10-01 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',16,NULL,'2026-07-31 00:19:27'),(220,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-01-08 (status: DELIVERED, schedule: ON_TIME)','LessonReport',17,NULL,'2026-07-31 01:29:28'),(221,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-31T08:36:41.764Z\"}','2026-07-31 10:36:41'),(222,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-01-06 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',18,NULL,'2026-07-31 11:22:53'),(223,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-01-07 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',19,NULL,'2026-07-31 11:23:03'),(224,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-07-31T09:54:09.077Z\"}','2026-07-31 11:54:09'),(225,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-01T06:51:38.814Z\"}','2026-08-01 08:51:38'),(226,14,1,'ACCOUNT_DISABLE','User account was disabled by administrator','User',14,'{\"disabled_by\":1}','2026-08-01 08:53:19'),(227,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: STUDENT','Role',6,'{\"permissionIds\":[6,8,39,56]}','2026-08-01 09:05:07'),(228,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,47,48,51,12,15,50,52]}','2026-08-01 09:05:26'),(229,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: SUPER_ADMIN','Role',1,'{\"permissionIds\":[1,2,3,4,5,6,7,8,9,10,11,12,13,18,19,20,21,22,23,24,27,28,29,30,31,33,34,35,36,38,37,44,45,46,49,42,43,40,50,51,52,53,54,55]}','2026-08-01 09:05:35'),(230,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-01T07:10:09.876Z\"}','2026-08-01 09:10:09'),(231,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-01T08:02:37.436Z\"}','2026-08-01 10:02:37'),(232,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-08-02 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',20,NULL,'2026-08-02 00:34:49'),(233,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2025-10-02 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',21,NULL,'2026-08-02 00:35:47'),(234,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-02T12:08:54.625Z\"}','2026-08-02 14:08:54'),(235,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: ACCOUNTANT','Role',5,'{\"permissionIds\":[9,10]}','2026-08-02 16:15:10'),(236,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-02T14:34:50.289Z\"}','2026-08-02 16:34:50'),(237,23,23,'DOCUMENT_UPLOAD','Document uploaded: Cite Nazareth - Payroll Report (15).xlsx','Document',2,'{\"file_name\":\"1785682437897-xziclwxidua.xlsx\",\"original_name\":\"Cite Nazareth - Payroll Report (15).xlsx\",\"mime_type\":\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\",\"file_size\":758544}','2026-08-02 16:54:03'),(238,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-02T15:09:25.945Z\"}','2026-08-02 17:09:25'),(239,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-02T15:24:57.515Z\"}','2026-08-02 17:24:57'),(240,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-02T16:13:16.931Z\"}','2026-08-02 18:13:16'),(241,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-02T16:13:42.795Z\"}','2026-08-02 18:13:42'),(242,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 115 (Week 2)','LO_Lesson',17,'{\"entry_id\":115}','2026-08-02 18:14:40'),(243,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-02T17:20:37.771Z\"}','2026-08-02 19:20:37'),(244,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-02T17:40:27.192Z\"}','2026-08-02 19:40:27'),(245,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-02T18:20:58.178Z\"}','2026-08-02 20:20:58'),(246,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-02T18:22:33.666Z\"}','2026-08-02 20:22:33'),(247,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: TEACHER','Role',4,'{\"permissionIds\":[5,6,7,8,14,37,38,36,35,47,48,51,12,15,50]}','2026-08-02 20:22:52'),(248,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-02T18:23:09.682Z\"}','2026-08-02 20:23:09'),(249,15,15,'SUBJECT_DOCUMENT_UPLOAD','Subject document uploaded: mentorship-report-Niyongabo-Emmanuel (2).pdf','SubjectDocument',2,'{\"subject_id\":9,\"category_id\":1}','2026-08-02 21:08:09'),(250,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-03T08:57:37.447Z\"}','2026-08-03 10:57:37'),(251,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: STUDENT','Role',6,'{\"permissionIds\":[6,8,39,56,41]}','2026-08-03 10:59:27'),(252,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: STUDENT','Role',6,'{\"permissionIds\":[6,8,39,56,41,57,58]}','2026-08-03 11:16:11'),(253,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-03T09:16:45.181Z\"}','2026-08-03 11:16:45'),(254,23,1,'SUBJECT_ENROLL','You have been enrolled in subject ID: 9','StudentSubjectEnrollment',NULL,'{\"subject_id\":9,\"academic_year_id\":5,\"enrolling_user_id\":1}','2026-08-03 11:17:41'),(255,1,1,'SUBJECT_ENROLL_ADMIN','Enrolled student ID: 23 in subject ID: 9','StudentSubjectEnrollment',NULL,'{\"studentId\":23,\"subjectId\":9,\"academic_year_id\":5}','2026-08-03 11:17:41'),(256,1,1,'ROLE_PERMISSIONS_ASSIGN','Permissions assigned to role: STUDENT','Role',6,'{\"permissionIds\":[6,8,39,56,41,57,58,59]}','2026-08-03 12:15:25'),(257,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-03T12:40:38.214Z\"}','2026-08-03 14:40:38'),(258,1,1,'CURRICULUM_IMPORT','Imported 3 element(s) of competency from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','Subject',8,'{\"subject_id\":8,\"elements_count\":3}','2026-08-03 15:11:05'),(259,15,15,'CURRICULUM_IMPORT','Imported 3 element(s) of competency from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','Subject',8,'{\"subject_id\":8,\"elements_count\":3}','2026-08-03 15:21:02'),(260,13,13,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 10 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','SchemeOfWork',15,'{\"subject_id\":10,\"entries_count\":4}','2026-08-03 23:19:29'),(261,13,13,'CURRICULUM_IMPORT','Imported 3 element(s) of competency from \"test.pdf\"','Subject',10,'{\"subject_id\":10,\"elements_count\":3}','2026-08-03 23:19:42'),(262,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','SchemeOfWork',16,'{\"subject_id\":8,\"entries_count\":3}','2026-08-03 23:32:40'),(263,13,13,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 10 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','SchemeOfWork',17,'{\"subject_id\":10,\"entries_count\":2}','2026-08-03 23:33:53'),(264,19,19,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 10 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','SchemeOfWork',17,'{\"subject_id\":10,\"entries_count\":2}','2026-08-03 23:35:24'),(265,13,13,'CURRICULUM_IMPORT','Imported 3 element(s) of competency from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','Subject',12,'{\"subject_id\":12,\"elements_count\":3}','2026-08-03 23:37:25'),(266,15,15,'LESSON_PLAN_AI_GENERATE','AI-generated lesson plan for entry ID 116 (Week 3)','LO_Lesson',18,'{\"entry_id\":116}','2026-08-04 11:38:38'),(267,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','SchemeOfWork',18,'{\"subject_id\":8,\"entries_count\":11}','2026-08-04 12:07:57'),(268,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-04T13:11:08.274Z\"}','2026-08-04 15:11:08'),(269,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf\"','SchemeOfWork',19,'{\"subject_id\":8,\"entries_count\":13}','2026-08-04 15:35:07'),(270,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-04T13:36:50.008Z\"}','2026-08-04 15:36:50'),(271,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-04T13:51:17.528Z\"}','2026-08-04 15:51:17'),(272,1,1,'GRADE_CREATE','Created grade: Coding 2 in program ID 8','Grade',NULL,'{\"name\":\"Coding 2\",\"program_id\":8,\"level_order\":2}','2026-08-04 15:55:09'),(273,1,1,'CLASS_GROUP_COPY','Copied 16 class group(s) from 2025-2026 to 2026-2027','ClassGroup',NULL,'{\"sourceYearId\":3,\"targetYearId\":5,\"copied\":16}','2026-08-04 18:15:34'),(274,1,1,'CLASS_GROUP_CREATE','Created class group: Coding 2','ClassGroup',NULL,'{\"name\":\"Coding 2\",\"academic_year_id\":5,\"grade_id\":24}','2026-08-04 18:16:44'),(275,1,1,'CLASS_GROUP_UPDATE','Updated class group: Coding 1','ClassGroup',26,'{\"academic_year_id\":5,\"grade_id\":9,\"name\":\"Coding 1\"}','2026-08-04 18:16:52'),(276,15,1,'SUBJECT_ASSIGN','You have been assigned to subject ID: 8','TeacherSubjectAssignment',NULL,'{\"subject_id\":8,\"assigning_user_id\":1}','2026-08-04 18:17:14'),(277,1,1,'SUBJECT_ASSIGN_ADMIN','Assigned teacher ID: 15 to subject ID: 8','TeacherSubjectAssignment',NULL,'{\"teacherId\":15,\"subjectId\":8}','2026-08-04 18:17:14'),(278,1,1,'USER_BULK_CREATE','Bulk created 2 users via Excel upload','User',NULL,'{\"successCount\":2,\"failedCount\":0,\"totalRows\":2,\"roleId\":\"6\"}','2026-08-04 23:27:25'),(279,1,1,'TEACHER_ASSIGNMENTS_COPY','Copied 1 teacher assignment(s) from 2025-2026 to 2026-2027','TeacherSubjectAssignment',NULL,'{\"sourceYearId\":3,\"targetYearId\":5,\"copied\":1,\"skippedNoClassGroup\":4,\"skippedDuplicate\":0}','2026-08-05 08:56:20'),(280,1,1,'CLASS_GROUP_COPY','Copied 1 class group(s) from 2025-2026 to 2026-2027','ClassGroup',NULL,'{\"sourceYearId\":3,\"targetYearId\":5,\"copied\":1}','2026-08-05 12:29:03'),(281,1,1,'STUDENTS_PROMOTE','Promoted 1 student(s) from Coding A to Coding 2','StudentClassGroup',NULL,'{\"sourceClassGroupId\":9,\"targetClassGroupId\":41,\"promoted\":1}','2026-08-05 12:33:02'),(282,1,1,'STUDENTS_PROMOTE_YEAR','Promoted 0 student(s) across 1 grade(s) from 2025-2026 to 2026-2027','StudentClassGroup',NULL,'{\"sourceYearId\":3,\"targetYearId\":5,\"totalPromoted\":0,\"promotedGrades\":[{\"source_grade_name\":\"Coding - 1\",\"target_class_group_name\":\"Coding 2\",\"promoted\":0,\"skipped\":1}],\"skippedGrades\":[]}','2026-08-05 15:08:57'),(283,1,1,'PROFILE_UPDATE','User updated their personal profile information','UserProfile',1,'{\"first_name\":\"Niyongabo\",\"last_name\":\"Emmanuel\",\"gender\":\"MALE\",\"date_of_birth\":null,\"address\":null,\"external_id\":null}','2026-08-05 15:09:45'),(284,1,1,'PROFILE_UPDATE','User updated their personal profile information','UserProfile',1,'{\"first_name\":\"Niyongabo\",\"last_name\":\"Emmanuel\",\"gender\":\"MALE\",\"date_of_birth\":null,\"address\":null,\"external_id\":null}','2026-08-05 15:09:48'),(285,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-05T13:35:59.404Z\"}','2026-08-05 15:35:59'),(286,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Test Manual Note\"','LessonNote',1,NULL,'2026-08-05 17:22:52'),(287,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Test Manual Note\"','LessonNote',1,NULL,'2026-08-05 17:23:53'),(288,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Test Manual Note\" (class_group)','LessonNote',1,NULL,'2026-08-05 17:24:08'),(289,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',2,'{\"entry_id\":76}','2026-08-05 17:24:32'),(290,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"still mine\"','LessonNote',1,NULL,'2026-08-05 17:32:03'),(291,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Week 1: Foundations of Web Design and HTML Structure\"','LessonNote',2,NULL,'2026-08-05 17:32:03'),(292,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',3,NULL,'2026-08-05 17:47:08'),(293,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',3,NULL,'2026-08-05 17:47:11'),(294,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',3,NULL,'2026-08-05 17:49:47'),(295,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',4,NULL,'2026-08-05 17:50:05'),(296,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',4,NULL,'2026-08-05 17:50:08'),(297,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',4,NULL,'2026-08-05 17:51:29'),(298,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',5,NULL,'2026-08-05 17:51:47'),(299,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',5,NULL,'2026-08-05 17:51:50'),(300,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',5,NULL,'2026-08-05 17:53:27'),(301,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',6,NULL,'2026-08-05 17:53:34'),(302,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',6,NULL,'2026-08-05 17:53:38'),(303,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',6,NULL,'2026-08-05 17:54:31'),(304,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',7,NULL,'2026-08-05 17:54:36'),(305,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',7,NULL,'2026-08-05 17:54:41'),(306,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',7,NULL,'2026-08-05 17:56:21'),(307,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',8,NULL,'2026-08-05 17:56:27'),(308,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',8,NULL,'2026-08-05 17:56:31'),(309,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',8,NULL,'2026-08-05 17:58:09'),(310,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',9,NULL,'2026-08-05 17:58:14'),(311,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',9,NULL,'2026-08-05 17:58:20'),(312,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',9,NULL,'2026-08-05 17:59:17'),(313,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',10,NULL,'2026-08-05 18:26:11'),(314,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',10,NULL,'2026-08-05 18:26:11'),(315,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',10,NULL,'2026-08-05 18:26:12'),(316,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',11,'{\"entry_id\":76}','2026-08-05 18:27:11'),(317,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',10,NULL,'2026-08-05 18:27:19'),(318,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure & Setup\"','LessonNote',11,NULL,'2026-08-05 18:27:19'),(319,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',12,NULL,'2026-08-05 18:28:57'),(320,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',12,NULL,'2026-08-05 18:29:02'),(321,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Playwright Smoke Test Note\" (class_group)','LessonNote',12,NULL,'2026-08-05 18:29:13'),(322,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',12,NULL,'2026-08-05 18:31:04'),(323,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',13,NULL,'2026-08-05 18:31:10'),(324,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',13,NULL,'2026-08-05 18:31:15'),(325,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Playwright Smoke Test Note\" (class_group)','LessonNote',13,NULL,'2026-08-05 18:31:27'),(326,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',13,NULL,'2026-08-05 18:31:57'),(327,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',14,NULL,'2026-08-05 18:31:57'),(328,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',14,NULL,'2026-08-05 18:31:57'),(329,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',14,NULL,'2026-08-05 18:31:57'),(330,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',15,'{\"entry_id\":76}','2026-08-05 18:32:16'),(331,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',14,NULL,'2026-08-05 18:32:30'),(332,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: Your First HTML Document\"','LessonNote',15,NULL,'2026-08-05 18:32:30'),(333,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',16,NULL,'2026-08-05 19:02:32'),(334,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',16,NULL,'2026-08-05 19:02:33'),(335,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',16,NULL,'2026-08-05 19:02:33'),(336,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',17,'{\"entry_id\":76}','2026-08-05 19:02:55'),(337,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',16,NULL,'2026-08-05 19:03:04'),(338,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"GUI Design Week 1: Web Fundamentals & Basic HTML\"','LessonNote',17,NULL,'2026-08-05 19:03:04'),(339,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Edge Case Note\"','LessonNote',18,NULL,'2026-08-05 19:03:32'),(340,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Edge Case Note\"','LessonNote',18,NULL,'2026-08-05 19:03:32'),(341,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Edge Case Note\" (specific_students)','LessonNote',18,NULL,'2026-08-05 19:03:32'),(342,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Expiry Test Note\"','LessonNote',19,NULL,'2026-08-05 19:03:49'),(343,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Expiry Test Note\"','LessonNote',19,NULL,'2026-08-05 19:03:50'),(344,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Expiry Test Note\"','LessonNote',19,NULL,'2026-08-05 19:03:58'),(345,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Expiry Fix Verify\"','LessonNote',20,NULL,'2026-08-05 19:06:48'),(346,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Expiry Fix Verify\"','LessonNote',20,NULL,'2026-08-05 19:06:48'),(347,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Expiry Fix Verify\" (specific_students)','LessonNote',20,NULL,'2026-08-05 19:06:48'),(348,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Expiry Fix Verify\" (specific_students)','LessonNote',20,NULL,'2026-08-05 19:06:48'),(349,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Expiry Fix Verify\"','LessonNote',20,NULL,'2026-08-05 19:06:48'),(350,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Edge Case Note\"','LessonNote',18,NULL,'2026-08-05 19:07:06'),(351,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"No Versions Note\"','LessonNote',21,NULL,'2026-08-05 19:07:06'),(352,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"No Versions Note\"','LessonNote',21,NULL,'2026-08-05 19:07:06'),(353,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Cross Owner Redirect Test\"','LessonNote',22,NULL,'2026-08-05 20:58:39'),(354,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Cross Owner Redirect Test\"','LessonNote',22,NULL,'2026-08-05 21:00:03'),(355,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',23,NULL,'2026-08-05 21:00:10'),(356,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',23,NULL,'2026-08-05 21:00:15'),(357,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Playwright Smoke Test Note\" (class_group)','LessonNote',23,NULL,'2026-08-05 21:00:27'),(358,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',23,NULL,'2026-08-05 21:00:56'),(359,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',24,NULL,'2026-08-05 21:00:56'),(360,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',24,NULL,'2026-08-05 21:00:56'),(361,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',24,NULL,'2026-08-05 21:00:56'),(362,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',25,'{\"entry_id\":76}','2026-08-05 21:01:24'),(363,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',24,NULL,'2026-08-05 21:01:43'),(364,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure & Editor Setup\"','LessonNote',25,NULL,'2026-08-05 21:01:43'),(365,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',26,NULL,'2026-08-05 21:01:55'),(366,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',26,NULL,'2026-08-05 21:01:55'),(367,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',26,NULL,'2026-08-05 21:01:55'),(368,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',27,'{\"entry_id\":76}','2026-08-05 21:02:15'),(369,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',26,NULL,'2026-08-05 21:02:26'),(370,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure & Editors\"','LessonNote',27,NULL,'2026-08-05 21:02:26'),(371,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',28,NULL,'2026-08-05 21:02:38'),(372,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',28,NULL,'2026-08-05 21:02:38'),(373,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',28,NULL,'2026-08-05 21:02:38'),(374,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',29,'{\"entry_id\":76}','2026-08-05 21:03:03'),(375,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',28,NULL,'2026-08-05 21:03:12'),(376,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Essentials: HTML Structure and Editor Setup\"','LessonNote',29,NULL,'2026-08-05 21:03:12'),(377,15,15,'SCHEME_AI_GENERATE','AI-generated scheme of work for subject ID 8 from \"SPEGI302  -   GRAPHIC USER INTERFACE DESIGN.pdf\"','SchemeOfWork',20,'{\"subject_id\":8,\"entries_count\":12}','2026-08-05 21:16:25'),(378,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',30,NULL,'2026-08-05 21:39:20'),(379,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',30,NULL,'2026-08-05 21:39:20'),(380,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',30,NULL,'2026-08-05 21:39:20'),(381,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',30,NULL,'2026-08-05 21:39:37'),(382,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',31,NULL,'2026-08-05 21:42:26'),(383,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',31,NULL,'2026-08-05 21:42:26'),(384,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',31,NULL,'2026-08-05 21:42:26'),(385,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',31,NULL,'2026-08-05 21:42:38'),(386,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',32,NULL,'2026-08-05 21:43:20'),(387,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',32,NULL,'2026-08-05 21:43:24'),(388,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Playwright Smoke Test Note\" (class_group)','LessonNote',32,NULL,'2026-08-05 21:43:37'),(389,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',32,NULL,'2026-08-05 21:44:06'),(390,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',33,NULL,'2026-08-05 23:54:56'),(391,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',33,NULL,'2026-08-05 23:54:56'),(392,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',33,NULL,'2026-08-05 23:54:56'),(393,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',34,'{\"entry_id\":76}','2026-08-05 23:55:27'),(394,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',33,NULL,'2026-08-05 23:55:31'),(395,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Foundations of Web Design: HTML Structure and Editor Setup\"','LessonNote',34,NULL,'2026-08-05 23:55:31'),(396,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',35,NULL,'2026-08-05 23:56:35'),(397,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',35,NULL,'2026-08-05 23:56:40'),(398,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Playwright Smoke Test Note\" (class_group)','LessonNote',35,NULL,'2026-08-05 23:56:53'),(399,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',35,NULL,'2026-08-05 23:57:20'),(400,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"friendly error test\"','LessonNote',36,NULL,'2026-08-06 00:21:38'),(401,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"friendly error test\"','LessonNote',36,NULL,'2026-08-06 00:21:40'),(402,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',37,NULL,'2026-08-06 00:22:04'),(403,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',37,NULL,'2026-08-06 00:22:05'),(404,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',37,NULL,'2026-08-06 00:22:05'),(405,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',37,NULL,'2026-08-06 00:22:18'),(406,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',38,NULL,'2026-08-06 00:22:30'),(407,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',38,NULL,'2026-08-06 00:22:30'),(408,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',38,NULL,'2026-08-06 00:22:30'),(409,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',38,NULL,'2026-08-06 00:22:43'),(410,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',39,NULL,'2026-08-06 08:36:58'),(411,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',39,NULL,'2026-08-06 08:36:59'),(412,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',39,NULL,'2026-08-06 08:36:59'),(413,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',40,'{\"entry_id\":76}','2026-08-06 08:37:21'),(414,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',39,NULL,'2026-08-06 08:37:26'),(415,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure\"','LessonNote',40,NULL,'2026-08-06 08:37:26'),(416,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',41,'{\"entry_id\":76}','2026-08-06 09:16:03'),(417,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Getting Started with Web Design: HTML Fundamentals\"','LessonNote',41,NULL,'2026-08-06 09:16:53'),(418,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',42,'{\"entry_id\":76}','2026-08-06 09:24:32'),(419,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Getting Started with Web Design: Your First HTML Page\"','LessonNote',42,NULL,'2026-08-06 09:25:15'),(420,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',43,'{\"entry_id\":76}','2026-08-06 09:26:32'),(421,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Building Your First Web Page: HTML Basics\"','LessonNote',43,NULL,'2026-08-06 09:27:28'),(422,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',44,NULL,'2026-08-06 09:28:20'),(423,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',44,NULL,'2026-08-06 09:28:20'),(424,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',44,NULL,'2026-08-06 09:28:21'),(425,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',45,'{\"entry_id\":76}','2026-08-06 09:28:38'),(426,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',44,NULL,'2026-08-06 09:28:48'),(427,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Foundations: HTML Structure & Editor Setup\"','LessonNote',45,NULL,'2026-08-06 09:28:49'),(428,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',46,'{\"entry_id\":76}','2026-08-06 10:43:36'),(429,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Foundations: HTML Structure and Setup\"','LessonNote',46,NULL,'2026-08-06 10:55:39'),(430,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',47,'{\"entry_id\":76}','2026-08-06 10:56:07'),(431,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Getting Started with Web Design: HTML Fundamentals\"','LessonNote',47,NULL,'2026-08-06 10:56:42'),(432,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',48,'{\"entry_id\":76}','2026-08-06 10:58:03'),(433,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Introduction to Web Design & Basic HTML Structure\"','LessonNote',48,NULL,'2026-08-06 10:59:03'),(434,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',49,NULL,'2026-08-06 10:59:48'),(435,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',49,NULL,'2026-08-06 10:59:48'),(436,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',49,NULL,'2026-08-06 10:59:49'),(437,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1)','LessonNote',50,'{\"entry_id\":76}','2026-08-06 11:00:22'),(438,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',49,NULL,'2026-08-06 11:00:27'),(439,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: Your First HTML Page\"','LessonNote',50,NULL,'2026-08-06 11:00:28'),(440,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1) via gemini','LessonNote',51,'{\"entry_id\":76,\"provider\":\"gemini\"}','2026-08-06 11:07:16'),(441,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure & Tools\"','LessonNote',51,NULL,'2026-08-06 11:07:48'),(442,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1) via groq','LessonNote',52,'{\"entry_id\":76,\"provider\":\"groq\"}','2026-08-06 11:10:32'),(443,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Getting Started: Building a Simple Web Page\"','LessonNote',52,NULL,'2026-08-06 11:11:58'),(444,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',53,NULL,'2026-08-06 11:13:20'),(445,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',53,NULL,'2026-08-06 11:13:20'),(446,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',53,NULL,'2026-08-06 11:13:20'),(447,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1) via gemini','LessonNote',54,'{\"entry_id\":76,\"provider\":\"gemini\"}','2026-08-06 11:13:45'),(448,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',53,NULL,'2026-08-06 11:14:00'),(449,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Decoding Web Pages: HTML Fundamentals\"','LessonNote',54,NULL,'2026-08-06 11:14:00'),(450,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Playwright Smoke Test Note\"','LessonNote',55,NULL,'2026-08-06 11:17:31'),(451,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Playwright Smoke Test Note\"','LessonNote',55,NULL,'2026-08-06 11:17:36'),(452,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Playwright Smoke Test Note\" (class_group)','LessonNote',55,NULL,'2026-08-06 11:17:47'),(453,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Playwright Smoke Test Note\"','LessonNote',55,NULL,'2026-08-06 11:18:22'),(454,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',56,NULL,'2026-08-06 11:22:20'),(455,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',56,NULL,'2026-08-06 11:22:20'),(456,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',56,NULL,'2026-08-06 11:22:20'),(457,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1) via gemini','LessonNote',57,'{\"entry_id\":76,\"provider\":\"gemini\"}','2026-08-06 11:22:48'),(458,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',56,NULL,'2026-08-06 11:22:58'),(459,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure & Tools\"','LessonNote',57,NULL,'2026-08-06 11:22:58'),(460,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 163 (Week 1) via gemini','LessonNote',58,'{\"entry_id\":163,\"provider\":\"gemini\"}','2026-08-06 11:25:46'),(461,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Introduction to Graphic Design: Core Concepts and Elements\"','LessonNote',58,NULL,'2026-08-06 11:35:03'),(462,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',59,NULL,'2026-08-06 11:35:03'),(463,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',59,NULL,'2026-08-06 11:35:03'),(464,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',59,NULL,'2026-08-06 11:35:03'),(465,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1) via gemini','LessonNote',60,'{\"entry_id\":76,\"provider\":\"gemini\"}','2026-08-06 11:35:23'),(466,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',59,NULL,'2026-08-06 11:35:31'),(467,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"GUI Design: Web Foundations & Basic HTML\"','LessonNote',60,NULL,'2026-08-06 11:35:31'),(468,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Status Test Note\"','LessonNote',61,NULL,'2026-08-06 11:51:20'),(469,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Status Test Note\"','LessonNote',61,NULL,'2026-08-06 11:51:20'),(470,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Status Test Note\"','LessonNote',61,NULL,'2026-08-06 11:51:20'),(471,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1) via gemini','LessonNote',62,'{\"entry_id\":76,\"provider\":\"gemini\"}','2026-08-06 11:51:56'),(472,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure & Tools\"','LessonNote',62,NULL,'2026-08-06 11:51:56'),(473,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note\"','LessonNote',63,NULL,'2026-08-06 11:53:00'),(474,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note\"','LessonNote',63,NULL,'2026-08-06 11:53:00'),(475,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Regression Test Note\" (class_group)','LessonNote',63,NULL,'2026-08-06 11:53:00'),(476,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 76 (Week 1) via gemini','LessonNote',64,'{\"entry_id\":76,\"provider\":\"gemini\"}','2026-08-06 11:53:30'),(477,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note\"','LessonNote',63,NULL,'2026-08-06 11:53:37'),(478,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Web Design Fundamentals: HTML Structure & Tools\"','LessonNote',64,NULL,'2026-08-06 11:53:37'),(479,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Status Management UI Test\"','LessonNote',65,NULL,'2026-08-06 11:55:47'),(480,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Status Management UI Test\"','LessonNote',65,NULL,'2026-08-06 11:55:49'),(481,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Status Management UI Test\"','LessonNote',65,NULL,'2026-08-06 11:56:39'),(482,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 163 (Week 1) via gemini','LessonNote',66,'{\"entry_id\":163,\"provider\":\"gemini\"}','2026-08-06 12:12:34'),(483,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Foundations of Graphic Design for GUI\"','LessonNote',66,NULL,'2026-08-06 12:16:24'),(484,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Foundations of Graphic Design for GUI\"','LessonNote',66,NULL,'2026-08-06 12:16:40'),(485,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 164 (Week 2) via groq','LessonNote',67,'{\"entry_id\":164,\"provider\":\"groq\"}','2026-08-06 14:03:58'),(486,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Graphic Design Principles & Digital Image Formats – Core Concepts for Coding 2\"','LessonNote',67,NULL,'2026-08-06 14:04:18'),(487,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-08-06 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',22,NULL,'2026-08-06 14:18:42'),(488,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-06T12:26:38.193Z\"}','2026-08-06 14:26:38'),(489,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-06T14:30:35.661Z\"}','2026-08-06 16:30:35'),(490,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Regression Test Note 2\"','LessonNote',68,NULL,'2026-08-06 16:33:08'),(491,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Regression Test Note 2\"','LessonNote',68,NULL,'2026-08-06 16:33:09'),(492,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Regression Test Note 2\"','LessonNote',68,NULL,'2026-08-06 16:33:24'),(493,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Smoke Test Note\"','LessonNote',69,NULL,'2026-08-06 16:35:45'),(494,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Smoke Test Note\"','LessonNote',69,NULL,'2026-08-06 16:36:19'),(495,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Smoke Test Note\"','LessonNote',70,NULL,'2026-08-06 16:41:40'),(496,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Smoke Test Note\"','LessonNote',70,NULL,'2026-08-06 16:41:51'),(497,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Smoke Test Note\"','LessonNote',69,NULL,'2026-08-06 16:43:47'),(498,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Smoke Test Note\"','LessonNote',70,NULL,'2026-08-06 16:43:47'),(499,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Graphic Design Principles & Digital Image Formats – Core Concepts for Coding 2\"','LessonNote',67,NULL,'2026-08-06 16:44:32'),(500,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"PHASE TEST SCRATCH NOTE\"','LessonNote',71,NULL,'2026-08-06 17:51:13'),(501,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"PHASE TEST SCRATCH NOTE\"','LessonNote',71,NULL,'2026-08-06 17:57:06'),(502,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"PHASE TEST SCRATCH NOTE\"','LessonNote',72,NULL,'2026-08-06 17:57:06'),(503,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"PHASE TEST SCRATCH NOTE\"','LessonNote',72,NULL,'2026-08-06 18:20:04'),(504,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"PDF Export Test\"','LessonNote',73,NULL,'2026-08-06 18:30:01'),(505,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"PDF Export Test\"','LessonNote',73,NULL,'2026-08-06 18:36:29'),(506,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"FINAL E2E TEST NOTE\"','LessonNote',74,NULL,'2026-08-06 18:38:12'),(507,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"FINAL E2E TEST NOTE\"','LessonNote',74,NULL,'2026-08-06 18:38:48'),(508,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"FINAL E2E TEST NOTE\"','LessonNote',74,NULL,'2026-08-06 18:40:20'),(509,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"API Regression Note\"','LessonNote',75,NULL,'2026-08-06 20:28:51'),(510,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"API Regression Note\"','LessonNote',75,NULL,'2026-08-06 20:28:52'),(511,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"API Regression Note\" (class_group)','LessonNote',75,NULL,'2026-08-06 20:29:08'),(512,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"API Regression Note\"','LessonNote',75,NULL,'2026-08-06 20:29:08'),(513,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 164 (Week 2) via groq','LessonNote',76,'{\"entry_id\":164,\"provider\":\"groq\"}','2026-08-06 20:31:29'),(514,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Design Essentials: Principles, Contrast & Digital Image Formats\"','LessonNote',76,NULL,'2026-08-06 20:33:40'),(515,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"Table Handle Check\"','LessonNote',77,NULL,'2026-08-06 20:37:29'),(516,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Table Handle Check\"','LessonNote',77,NULL,'2026-08-06 20:48:51'),(517,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Table Handle Check\" (class_group)','LessonNote',77,NULL,'2026-08-06 20:48:51'),(518,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Design Essentials: Principles, Contrast & Digital Image Formats\"','LessonNote',76,NULL,'2026-08-06 21:02:43'),(519,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Table Handle Check\"','LessonNote',77,NULL,'2026-08-06 21:03:40'),(520,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 164 (Week 2) via gemini','LessonNote',78,'{\"entry_id\":164,\"provider\":\"gemini\"}','2026-08-06 22:20:20'),(521,15,NULL,'LESSON_NOTE_SHARE','Shared lesson note \"Foundations of Graphic Design for GUI\" (class_group)','LessonNote',66,NULL,'2026-08-07 13:02:12'),(522,1,1,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',1,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-08T10:39:48.809Z\"}','2026-08-08 12:39:48'),(523,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-08T10:40:39.072Z\"}','2026-08-08 12:40:39'),(524,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"GUI Design Essentials: Principles and Digital Image Formats\"','LessonNote',78,NULL,'2026-08-08 12:42:17'),(525,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 165 (Week 3) via gemini','LessonNote',79,'{\"entry_id\":165,\"provider\":\"gemini\"}','2026-08-08 13:02:55'),(526,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Vector Graphics Fundamentals & Adobe Illustrator Basics\"','LessonNote',79,NULL,'2026-08-08 13:07:47'),(527,15,15,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',15,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-08T11:52:40.684Z\"}','2026-08-08 13:52:40'),(528,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Foundations of Graphic Design for GUI\"','LessonNote',66,NULL,'2026-08-08 15:30:34'),(529,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 163 (Week 1) via gemini','LessonNote',80,'{\"entry_id\":163,\"provider\":\"gemini\"}','2026-08-08 15:30:59'),(530,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"Foundations of Graphic Design: Core Concepts and Elements\"','LessonNote',80,NULL,'2026-08-08 15:31:11'),(531,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 163 (Week 1) via gemini','LessonNote',81,'{\"entry_id\":163,\"provider\":\"gemini\"}','2026-08-08 15:31:46'),(532,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Graphic Design Fundamentals: Core Concepts & Elements\"','LessonNote',81,NULL,'2026-08-08 15:35:47'),(533,15,NULL,'LESSON_NOTE_CREATE','Created lesson note \"CROP FEATURE TEST SCRATCH\"','LessonNote',82,NULL,'2026-08-08 15:56:56'),(534,15,NULL,'LESSON_NOTE_DELETE','Deleted lesson note \"CROP FEATURE TEST SCRATCH\"','LessonNote',82,NULL,'2026-08-08 16:13:38'),(535,15,NULL,'LESSON_NOTE_AI_GENERATE','AI-generated lesson note for entry ID 166 (Week 4) via gemini','LessonNote',83,'{\"entry_id\":166,\"provider\":\"gemini\"}','2026-08-08 17:15:47'),(536,15,NULL,'LESSON_NOTE_PUBLISH','Published lesson note \"Digital Sketching & Advanced Vector Techniques in Illustrator\"','LessonNote',83,NULL,'2026-08-08 17:35:42'),(537,15,NULL,'LESSON_REPORT_SUBMIT','Lesson delivery reported for 2026-08-08 (status: UNPLANNED, schedule: ON_TIME)','LessonReport',23,NULL,'2026-08-08 21:35:16'),(538,23,23,'LOGIN_SUCCESS','User successfully logged in via 2FA','User',23,'{\"method\":\"OTP_EMAIL\",\"timestamp\":\"2026-08-08T19:37:13.640Z\"}','2026-08-08 21:37:13'),(541,1,1,'LOGIN_SUCCESS','User successfully logged in via Google','User',1,'{\"method\":\"GOOGLE_OAUTH\",\"timestamp\":\"2026-08-15T14:31:21.502Z\"}','2026-08-15 16:31:21');
/*!40000 ALTER TABLE `ActivityLog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AssessmentScore`
--

DROP TABLE IF EXISTS `AssessmentScore`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `AssessmentScore` (
  `score_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `student_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `academic_year_id` int(11) DEFAULT NULL,
  `term` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. TERM1, TERM2, TERM3',
  `assessment_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EXAM' COMMENT 'EXAM, CAT, ASSIGNMENT, PROJECT',
  `title` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `score` decimal(5,2) NOT NULL,
  `max_score` decimal(5,2) NOT NULL DEFAULT '100.00',
  `assessed_at` date NOT NULL,
  `recorded_by` bigint(20) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`score_id`),
  KEY `idx_ascore_student` (`student_id`),
  KEY `idx_ascore_subject` (`subject_id`),
  KEY `idx_ascore_student_date` (`student_id`,`assessed_at`),
  KEY `fk_ascore_recorder` (`recorded_by`),
  CONSTRAINT `fk_ascore_recorder` FOREIGN KEY (`recorded_by`) REFERENCES `User` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ascore_student` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ascore_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AssessmentScore`
--

LOCK TABLES `AssessmentScore` WRITE;
/*!40000 ALTER TABLE `AssessmentScore` DISABLE KEYS */;
/*!40000 ALTER TABLE `AssessmentScore` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `AuthCredential`
--

DROP TABLE IF EXISTS `AuthCredential`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `AuthCredential` (
  `auth_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `force_password_change` tinyint(1) DEFAULT '0',
  `mfa_enabled` tinyint(1) DEFAULT '0',
  `failed_attempts` int(11) DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  `google_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`auth_id`),
  UNIQUE KEY `google_id` (`google_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `AuthCredential`
--

LOCK TABLES `AuthCredential` WRITE;
/*!40000 ALTER TABLE `AuthCredential` DISABLE KEYS */;
INSERT INTO `AuthCredential` VALUES (1,1,'$2a$12$xwSNYM7WNwFbW1twd.Qqo.CA1YCBB3QLzCYHEOPsGhVYVDr0LbJL.',0,0,0,NULL,'112063028177408872867'),(2,13,'$2a$12$HggTO99JRuYmDBOKRsxZOOEYQ/2/7DT1MYSI9B.EUhfx7HbDkuyFe',0,0,0,NULL,NULL),(3,14,'$2a$12$ZApFAVZTGJW.NPO6iULMneldhmLiZODEWstal2a4Co5KxWKKvOHUy',0,0,0,NULL,NULL),(4,15,'$2a$12$2E.g2QvirnFOlgF/jHp1n.zPMPHiDQJrQwdNa1euCP6L4tOUML7TK',0,0,0,NULL,NULL),(5,16,'$2a$12$cHagmjgKoZZonYeHBFf0Pe/XXAi8TvZovvUXM/V.LWGpf/b4V6Z1K',1,0,0,NULL,NULL),(6,18,'$2a$12$nPlzybuykcbR0OshFtSOaejqdwcHi75t4mWvmKVG3P8Kl82X/I1hW',1,0,0,NULL,NULL),(7,19,'$2a$12$YP1iHaXUl5COsPRiZ9NUC.10D2L98gwGux12loE.FcOH4f4gsTSWW',0,0,0,NULL,NULL),(8,20,'$2a$12$QAT1byMZFJIAwNdcLpx91.pbubPcNaaCyaw0qWTE0VSP3mwm9nJjO',0,0,0,NULL,NULL),(9,21,'$2a$12$.FKHXwnUDj5vyKQ2yEWyUOuehYJi.t3NxF8k7Wp4B6HZAB.vAAByO',0,0,0,NULL,NULL),(10,22,'$2a$12$M8UNA6Cz8/0AB.JP/lnMZekMn4lP1Gs4KcW1r9W33IwlMilYETrHG',0,0,0,NULL,NULL),(11,23,'$2a$12$YykU6huS4OO8m0SiveU2GenZsuniFtYOIenNFLjZuMJ70VfM6Kj0O',0,0,0,NULL,NULL),(12,24,'$2a$12$5srIA/W8K/40RWVZM9C74OjG/t64OSKBU8j/XE/Cty43vCYTMjT62',1,0,0,NULL,NULL),(13,25,'$2a$12$ybE2bBNpcNdaTHG2yb2HRuvsNi5QZw9UoXrzkS9SH7z98t0rNryda',1,0,0,NULL,NULL);
/*!40000 ALTER TABLE `AuthCredential` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CalendarActivity`
--

DROP TABLE IF EXISTS `CalendarActivity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `CalendarActivity` (
  `activity_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `academic_term_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) DEFAULT NULL,
  `activity_name` varchar(150) NOT NULL,
  `activity_type` varchar(50) NOT NULL COMMENT 'BREAK, ASSEMBLY, EXAM, EVENT, OTHER',
  `day_of_week` tinyint(4) DEFAULT NULL COMMENT 'For recurring activities, NULL for one-time',
  `start_date` date DEFAULT NULL COMMENT 'For one-time activities',
  `end_date` date DEFAULT NULL COMMENT 'For one-time activities',
  `start_time` varchar(10) NOT NULL,
  `end_time` varchar(10) NOT NULL,
  `location` varchar(100) DEFAULT NULL,
  `description` text,
  `color` varchar(7) DEFAULT '#10B981',
  `is_recurring` tinyint(4) DEFAULT '1' COMMENT '1=weekly recurring, 0=one-time event',
  `is_active` tinyint(4) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `academic_year_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`activity_id`),
  KEY `class_group_id` (`class_group_id`),
  KEY `idx_calendar_activity_term` (`academic_term_id`),
  KEY `idx_calendar_activity_year` (`academic_year_id`),
  CONSTRAINT `calendaractivity_ibfk_1` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  CONSTRAINT `calendaractivity_ibfk_2` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  CONSTRAINT `calendaractivity_ibfk_3` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CalendarActivity`
--

LOCK TABLES `CalendarActivity` WRITE;
/*!40000 ALTER TABLE `CalendarActivity` DISABLE KEYS */;
/*!40000 ALTER TABLE `CalendarActivity` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CalendarNotification`
--

DROP TABLE IF EXISTS `CalendarNotification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `CalendarNotification` (
  `notification_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `notification_type` varchar(50) NOT NULL DEFAULT 'LESSON_STARTING' COMMENT 'LESSON_STARTING, REMINDER',
  `minutes_before` int(11) NOT NULL DEFAULT '30' COMMENT 'Minutes before lesson starts to send notification',
  `is_enabled` tinyint(4) DEFAULT '1',
  `notification_method` varchar(20) DEFAULT 'IN_APP' COMMENT 'IN_APP, EMAIL, SMS',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  UNIQUE KEY `unique_user_notification` (`user_id`,`notification_type`,`minutes_before`),
  KEY `idx_calendar_notification_user` (`user_id`),
  CONSTRAINT `calendarnotification_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CalendarNotification`
--

LOCK TABLES `CalendarNotification` WRITE;
/*!40000 ALTER TABLE `CalendarNotification` DISABLE KEYS */;
/*!40000 ALTER TABLE `CalendarNotification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CalendarSlot`
--

DROP TABLE IF EXISTS `CalendarSlot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `CalendarSlot` (
  `slot_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `academic_term_id` bigint(20) DEFAULT NULL,
  `class_group_id` bigint(20) DEFAULT NULL,
  `subject_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL COMMENT 'Instructor assigned to this slot',
  `day_of_week` tinyint(4) NOT NULL COMMENT '0=Sunday, 1=Monday, ..., 6=Saturday',
  `start_time` varchar(10) NOT NULL COMMENT 'HH:MM format',
  `end_time` varchar(10) NOT NULL COMMENT 'HH:MM format',
  `location` varchar(100) DEFAULT NULL COMMENT 'Room or location',
  `color` varchar(7) DEFAULT '#3B82F6' COMMENT 'Calendar event color',
  `notes` text,
  `is_active` tinyint(4) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `academic_year_id` bigint(20) DEFAULT NULL,
  `calendar_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`slot_id`),
  UNIQUE KEY `unique_slot` (`academic_term_id`,`class_group_id`,`day_of_week`,`start_time`),
  KEY `subject_id` (`subject_id`),
  KEY `idx_calendar_slot_term` (`academic_term_id`),
  KEY `idx_calendar_slot_class` (`class_group_id`),
  KEY `idx_calendar_slot_instructor` (`user_id`),
  KEY `idx_calendar_slot_day` (`day_of_week`),
  KEY `idx_calendar_slot_year` (`academic_year_id`),
  KEY `idx_calendar_slot_calendar` (`calendar_id`),
  CONSTRAINT `calendarslot_ibfk_1` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  CONSTRAINT `calendarslot_ibfk_2` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  CONSTRAINT `calendarslot_ibfk_3` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  CONSTRAINT `calendarslot_ibfk_4` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `calendarslot_ibfk_5` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  CONSTRAINT `calendarslot_ibfk_6` FOREIGN KEY (`calendar_id`) REFERENCES `AcademicCalendar` (`calendar_id`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CalendarSlot`
--

LOCK TABLES `CalendarSlot` WRITE;
/*!40000 ALTER TABLE `CalendarSlot` DISABLE KEYS */;
INSERT INTO `CalendarSlot` VALUES (30,4,9,9,15,1,'09:00','10:40','room 1','#3B82F6',NULL,0,'2026-03-04 20:46:18','2026-03-04 21:05:11',NULL,1),(31,4,9,8,15,2,'15:40','17:20','room 1','#F59E0B',NULL,1,'2026-03-04 20:46:45','2026-03-04 20:46:45',NULL,1),(32,4,9,9,15,1,'11:00','11:50','room 1','#3B82F6',NULL,0,'2026-03-04 20:47:21','2026-03-04 21:05:19',NULL,1),(33,4,9,9,15,4,'11:00','12:40','room 1','#3B82F6',NULL,1,'2026-03-04 21:05:54','2026-03-04 21:05:54',NULL,1),(34,4,9,9,15,4,'13:40','14:30','room 1','#3B82F6',NULL,1,'2026-03-04 21:06:06','2026-03-04 21:06:06',NULL,1),(35,4,9,10,13,3,'11:00','12:40','room 1','#F59E0B',NULL,1,'2026-03-04 21:12:54','2026-03-04 21:12:54',NULL,1),(36,4,9,10,13,3,'13:40','14:30','room 1','#F59E0B',NULL,1,'2026-03-04 21:13:03','2026-03-04 21:13:03',NULL,1),(37,6,9,9,15,3,'09:00','09:50','room 1','#3B82F6',NULL,1,'2026-05-06 21:37:54','2026-05-06 21:37:54',NULL,3),(38,6,9,8,15,3,'09:50','10:40','room 1','#3B82F6',NULL,1,'2026-05-06 21:38:02','2026-05-06 21:38:02',NULL,3),(39,6,9,12,14,3,'11:00','12:30','room 1','#3B82F6',NULL,1,'2026-05-06 21:38:17','2026-05-06 21:38:31',NULL,3),(40,4,9,9,15,3,'09:00','09:50','room 1','#3B82F6',NULL,1,'2026-07-27 18:47:01','2026-07-27 18:47:01',NULL,1),(41,6,9,12,14,4,'09:00','09:50','room 1','#3B82F6',NULL,1,'2026-07-28 06:14:18','2026-07-28 06:14:18',NULL,3);
/*!40000 ALTER TABLE `CalendarSlot` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ChallengeCategory`
--

DROP TABLE IF EXISTS `ChallengeCategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ChallengeCategory` (
  `category_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `label` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(4) DEFAULT '1',
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `label` (`label`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ChallengeCategory`
--

LOCK TABLES `ChallengeCategory` WRITE;
/*!40000 ALTER TABLE `ChallengeCategory` DISABLE KEYS */;
INSERT INTO `ChallengeCategory` VALUES (1,'Electricity / Power',1),(2,'Equipment / Lab Issues',1),(3,'Connectivity',1),(4,'Student Engagement',1),(5,'Curriculum Pacing',1),(6,'Attendance',1),(7,'Facility / Space',1),(8,'Other',1);
/*!40000 ALTER TABLE `ChallengeCategory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ClassGroup`
--

DROP TABLE IF EXISTS `ClassGroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ClassGroup` (
  `class_group_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `grade_id` bigint(20) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`class_group_id`),
  UNIQUE KEY `uq_class_group_grade_name` (`grade_id`,`name`),
  KEY `grade_id` (`grade_id`)
) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ClassGroup`
--

LOCK TABLES `ClassGroup` WRITE;
/*!40000 ALTER TABLE `ClassGroup` DISABLE KEYS */;
INSERT INTO `ClassGroup` VALUES (13,8,'G1'),(26,9,'Coding 1'),(9,9,'Coding A'),(10,10,'N1'),(11,11,'N2'),(14,12,'G2'),(15,13,'G3'),(16,14,'G4'),(17,15,'G5'),(18,16,'G6'),(12,17,'N3'),(19,18,'G7'),(20,19,'G8'),(21,20,'G9'),(22,21,'G10'),(23,22,'G11'),(24,23,'G12'),(41,24,'Coding 2');
/*!40000 ALTER TABLE `ClassGroup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CompetencyPerformanceCriteria`
--

DROP TABLE IF EXISTS `CompetencyPerformanceCriteria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `CompetencyPerformanceCriteria` (
  `criteria_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `competency_id` bigint(20) NOT NULL,
  `criteria_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`criteria_id`),
  KEY `idx_criteria_competency` (`competency_id`),
  CONSTRAINT `fk_criteria_competency` FOREIGN KEY (`competency_id`) REFERENCES `SubjectCompetency` (`competency_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CompetencyPerformanceCriteria`
--

LOCK TABLES `CompetencyPerformanceCriteria` WRITE;
/*!40000 ALTER TABLE `CompetencyPerformanceCriteria` DISABLE KEYS */;
INSERT INTO `CompetencyPerformanceCriteria` VALUES (1,1,'1.1','HTML elements are properly used according to standards',0,'2026-05-06 22:43:44','2026-05-06 22:43:44'),(2,1,'1.2','CSS styles according to CSS Syntax are properly used',0,'2026-05-06 22:43:59','2026-05-06 22:43:59'),(3,1,'1.3','Web ergonomics based the layout  is properly applied',0,'2026-05-06 22:44:14','2026-05-06 22:44:14'),(14,5,'1.1','Core concepts and elements of Graphic Design are properly described',0,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(15,5,'1.2','Key features and formats of digital images are properly described',1,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(16,5,'1.3','Graphic design principles are properly described',2,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(17,6,'2.1','Use of Adobe Illustrator and Photoshop is properly described',0,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(18,6,'2.2','Digital sketch is properly drawn',1,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(19,6,'2.3','Logo and banner are properly drawn',2,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(20,7,'3.1','User Interface Wireframe is properly developed',0,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(21,7,'3.2','User Interface Mockup is properly developed',1,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(22,7,'3.3','User Interface Prototype is properly developed',2,'2026-08-03 15:21:02','2026-08-03 15:21:02'),(23,7,'3.4','User Interface is properly evaluated',3,'2026-08-03 15:21:02','2026-08-03 15:21:02');
/*!40000 ALTER TABLE `CompetencyPerformanceCriteria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `CourseCategory`
--

DROP TABLE IF EXISTS `CourseCategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `CourseCategory` (
  `category_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `CourseCategory`
--

LOCK TABLES `CourseCategory` WRITE;
/*!40000 ALTER TABLE `CourseCategory` DISABLE KEYS */;
INSERT INTO `CourseCategory` VALUES (1,'Specific Module','Specific Module','ACTIVE');
/*!40000 ALTER TABLE `CourseCategory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `DatabaseQueryLog`
--

DROP TABLE IF EXISTS `DatabaseQueryLog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `DatabaseQueryLog` (
  `log_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `query_text` text NOT NULL,
  `statement_type` varchar(50) NOT NULL,
  `is_write` tinyint(4) NOT NULL DEFAULT '0',
  `row_count` int(11) DEFAULT NULL,
  `execution_ms` int(11) DEFAULT NULL,
  `status` enum('SUCCESS','ERROR') NOT NULL,
  `error_message` text,
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_database_query_log_user` (`user_id`),
  KEY `idx_database_query_log_created` (`created_at`),
  CONSTRAINT `fk_database_query_log_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `DatabaseQueryLog`
--

LOCK TABLES `DatabaseQueryLog` WRITE;
/*!40000 ALTER TABLE `DatabaseQueryLog` DISABLE KEYS */;
/*!40000 ALTER TABLE `DatabaseQueryLog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Document`
--

DROP TABLE IF EXISTS `Document`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `Document` (
  `document_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `folder_id` bigint(20) DEFAULT NULL,
  `academic_year_id` bigint(20) DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint(20) NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_extension` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_public` tinyint(4) DEFAULT '0',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tags` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  KEY `idx_document_academic_year` (`academic_year_id`),
  CONSTRAINT `document_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Document`
--

LOCK TABLES `Document` WRITE;
/*!40000 ALTER TABLE `Document` DISABLE KEYS */;
INSERT INTO `Document` VALUES (1,15,22,NULL,'1785400805980-390h36sj0ga.pdf','LessonPlan_Development_of_Web_User_Interface_Week5.pdf','15/1785400805980-390h36sj0ga.pdf',39909,'application/pdf','pdf',0,NULL,NULL,'2026-07-30 10:40:12','2026-07-30 10:40:12'),(2,23,21,NULL,'1785682437897-xziclwxidua.xlsx','Cite Nazareth - Payroll Report (15).xlsx','23/1785682437897-xziclwxidua.xlsx',758544,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx',0,NULL,NULL,'2026-08-02 16:54:03','2026-08-02 16:54:03');
/*!40000 ALTER TABLE `Document` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `DocumentFolder`
--

DROP TABLE IF EXISTS `DocumentFolder`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `DocumentFolder` (
  `folder_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `parent_folder_id` bigint(20) DEFAULT NULL,
  `academic_year_id` bigint(20) DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#6366f1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`folder_id`),
  KEY `idx_document_folder_academic_year` (`academic_year_id`),
  CONSTRAINT `documentfolder_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `DocumentFolder`
--

LOCK TABLES `DocumentFolder` WRITE;
/*!40000 ALTER TABLE `DocumentFolder` DISABLE KEYS */;
INSERT INTO `DocumentFolder` VALUES (15,1,NULL,3,'Development of Web User Interface',NULL,'#008d3b','2026-01-13 18:39:47','2026-07-30 10:29:38'),(16,14,NULL,3,'Scheme of work',NULL,'#008d3b','2026-01-13 18:54:43','2026-07-30 10:29:38'),(17,14,16,3,'PHP',NULL,'#008d3b','2026-01-13 18:54:57','2026-07-30 10:29:38'),(18,14,16,3,'DATABASE',NULL,'#008d3b','2026-01-13 18:55:07','2026-07-30 10:29:38'),(19,22,NULL,3,'Dev',NULL,'#008d3b','2026-01-19 22:28:43','2026-07-30 10:29:38'),(20,15,NULL,3,'Notes',NULL,'#008d3b','2026-03-02 19:34:24','2026-07-30 10:29:38'),(21,23,NULL,3,'Docs',NULL,'#008d3b','2026-03-03 18:51:12','2026-07-30 10:29:38'),(22,15,NULL,5,'Notes for New Year',NULL,'#008d3b','2026-07-30 10:39:56','2026-07-30 10:42:53');
/*!40000 ALTER TABLE `DocumentFolder` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `DocumentPermission`
--

DROP TABLE IF EXISTS `DocumentPermission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `DocumentPermission` (
  `permission_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `document_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `permission_type` enum('VIEW','EDIT','DOWNLOAD','SHARE') COLLATE utf8mb4_unicode_ci DEFAULT 'VIEW',
  `shared_by` bigint(20) NOT NULL,
  `shared_with` enum('user','role') COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `filter_type` enum('subject_assigned','subject_enrolled','program_assigned','grade_assigned') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `filter_id` bigint(20) unsigned DEFAULT NULL,
  `academic_term_id` bigint(20) unsigned DEFAULT NULL,
  `filter_ids` json DEFAULT NULL,
  PRIMARY KEY (`permission_id`),
  KEY `idx_document_permission_filter` (`filter_type`,`filter_id`),
  KEY `idx_document_permission_term` (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `DocumentPermission`
--

LOCK TABLES `DocumentPermission` WRITE;
/*!40000 ALTER TABLE `DocumentPermission` DISABLE KEYS */;
/*!40000 ALTER TABLE `DocumentPermission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `DocumentVersion`
--

DROP TABLE IF EXISTS `DocumentVersion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `DocumentVersion` (
  `version_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `document_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `version_number` int(11) NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint(20) NOT NULL,
  `change_description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `DocumentVersion`
--

LOCK TABLES `DocumentVersion` WRITE;
/*!40000 ALTER TABLE `DocumentVersion` DISABLE KEYS */;
/*!40000 ALTER TABLE `DocumentVersion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `FolderPermission`
--

DROP TABLE IF EXISTS `FolderPermission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `FolderPermission` (
  `permission_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `folder_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `permission_type` enum('VIEW','EDIT','SHARE') COLLATE utf8mb4_unicode_ci DEFAULT 'VIEW',
  `shared_by` bigint(20) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `filter_type` enum('subject_assigned','subject_enrolled','program_assigned','grade_assigned') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `filter_id` bigint(20) unsigned DEFAULT NULL,
  `academic_term_id` bigint(20) unsigned DEFAULT NULL,
  `filter_ids` json DEFAULT NULL,
  PRIMARY KEY (`permission_id`),
  KEY `idx_folder_permission_filter` (`filter_type`,`filter_id`),
  KEY `idx_folder_permission_term` (`academic_term_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `FolderPermission`
--

LOCK TABLES `FolderPermission` WRITE;
/*!40000 ALTER TABLE `FolderPermission` DISABLE KEYS */;
INSERT INTO `FolderPermission` VALUES (2,15,13,'VIEW',1,NULL,'2026-07-27 20:09:39',NULL,NULL,NULL,NULL),(3,15,14,'VIEW',1,NULL,'2026-07-27 20:09:39',NULL,NULL,NULL,NULL),(4,15,15,'VIEW',1,NULL,'2026-07-27 20:09:39',NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `FolderPermission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Grade`
--

DROP TABLE IF EXISTS `Grade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `Grade` (
  `grade_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `program_id` bigint(20) NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_order` int(11) NOT NULL,
  PRIMARY KEY (`grade_id`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Grade`
--

LOCK TABLES `Grade` WRITE;
/*!40000 ALTER TABLE `Grade` DISABLE KEYS */;
INSERT INTO `Grade` VALUES (8,6,'Grade 1',4),(9,8,'Coding - 1',16),(10,5,'Nursery 1',1),(11,5,'Nursery 2',2),(12,6,'Grade 2',5),(13,6,'Grade 3',6),(14,6,'Grade 4',7),(15,6,'Grade 5',8),(16,6,'Grade 6',9),(17,5,'Nursery 3',3),(18,7,'Grade 7',10),(19,7,'Grade 8',11),(20,9,'Grade 9',12),(21,9,'Grade 10',13),(22,11,'Grade 11',14),(23,10,'Grade 12',15),(24,8,'Coding 2',2);
/*!40000 ALTER TABLE `Grade` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `GradeSubject`
--

DROP TABLE IF EXISTS `GradeSubject`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `GradeSubject` (
  `grade_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `GradeSubject`
--

LOCK TABLES `GradeSubject` WRITE;
/*!40000 ALTER TABLE `GradeSubject` DISABLE KEYS */;
INSERT INTO `GradeSubject` VALUES (10,10);
/*!40000 ALTER TABLE `GradeSubject` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `InstructorReport`
--

DROP TABLE IF EXISTS `InstructorReport`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `InstructorReport` (
  `report_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `academic_term_id` bigint(20) DEFAULT NULL,
  `class_group_id` bigint(20) DEFAULT NULL,
  `week_number` int(11) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `submission_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `progress_status` enum('ON_TRACK','SLIGHTLY_BEHIND','AHEAD') DEFAULT 'ON_TRACK',
  `key_highlights` text,
  `challenges_encountered` text,
  `lessons_delivered_count` int(11) DEFAULT '0',
  `mentorship_sessions_count` int(11) DEFAULT '0',
  `active_students_count` int(11) DEFAULT '0',
  `struggling_students_count` int(11) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_id`),
  KEY `IR_user_id_fk` (`user_id`),
  KEY `IR_term_id_fk` (`academic_term_id`),
  KEY `IR_class_id_fk` (`class_group_id`),
  CONSTRAINT `IR_class_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `IR_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `IR_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `InstructorReport`
--

LOCK TABLES `InstructorReport` WRITE;
/*!40000 ALTER TABLE `InstructorReport` DISABLE KEYS */;
INSERT INTO `InstructorReport` VALUES (1,15,4,9,NULL,'2026-03-05','2026-03-05','2026-03-14 17:51:19','ON_TRACK','This is my report','This is my challenge',1,0,9,1,'2026-03-14 17:51:19','2026-03-14 17:51:19');
/*!40000 ALTER TABLE `InstructorReport` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_IndicativeContent`
--

DROP TABLE IF EXISTS `LO_IndicativeContent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_IndicativeContent` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lesson_id` int(11) NOT NULL,
  `category` varchar(100) DEFAULT NULL,
  `content` text,
  PRIMARY KEY (`id`),
  KEY `lesson_id` (`lesson_id`),
  CONSTRAINT `lo_indicativecontent_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=106 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_IndicativeContent`
--

LOCK TABLES `LO_IndicativeContent` WRITE;
/*!40000 ALTER TABLE `LO_IndicativeContent` DISABLE KEYS */;
INSERT INTO `LO_IndicativeContent` VALUES (35,7,'General','a. Optimize a web page for search engines'),(36,7,'General','b. Ways to optimize the website'),(37,7,'General','Sitemap creation and management'),(38,7,'General','Keyword research and placement'),(39,7,'General','Meta tags and descriptions'),(40,7,'General','c. HTML Elements for SEO'),(41,7,'General','Title tags'),(42,7,'General','Meta descriptions'),(43,7,'General','Header tags (H1, H2, H3)'),(44,7,'General','d. Webmaster tools'),(45,7,'General','Google Search Console'),(46,7,'General','Bing Webmaster Tools'),(47,7,'General','e. Page structure optimization'),(48,7,'General','URL structure'),(49,7,'General','Internal linking'),(50,7,'General','Mobile responsiveness'),(51,7,'General','f. Google site verification'),(65,11,'Introduction to Web Design','Overview of what web design entails, the purpose of websites, and the basic client-server model interaction.'),(66,11,'Web Page Components','Identification of key elements: web browsers, web servers, and the three core languages (HTML for structure, CSS for style, JavaScript for interactivity) with a focus on HTML.'),(67,11,'Introduction to HTML','Definition of HyperText Markup Language, its function in providing content and structure to web pages, and the concept of HTML elements and tags.'),(68,11,'Setting Up Development Environment','Guidance on selecting and installing a code editor (e.g., VS Code), creating a dedicated project folder, and basic editor interface navigation.'),(69,11,'Basic HTML Document Structure','Explanation and practical application of the essential tags: <!DOCTYPE html>, <html>, <head>, <title>, and <body>. Understanding their hierarchy and purpose.'),(70,11,'Essential HTML Elements','Introduction to common text-based tags for headings (<h1> to <h6>) and paragraphs (<p>), and how to incorporate content within them.'),(78,13,'Introduction to Web Development','Overview of Web Development (Frontend vs. Backend), the role of HTML, CSS, and JavaScript. Introduction to HTML: what it is (HyperText Markup Language) and its fundamental purpose in structuring web content. Basic workflow: Text Editor to Web Browser.'),(79,13,'Basic HTML Document Structure','The essential \'skeleton\' of any HTML page: `<!DOCTYPE html>` declaration, the root `<html>` element, the `<head>` section (metadata like `<title>`), and the `<body>` section (visible content). Emphasizing correct nesting and indentation for readability and maintainability.'),(80,13,'Fundamental HTML Text Elements','Implementing various heading levels (`<h1>` through `<h6>`) to denote content hierarchy and importance. Using paragraph tags (`<p>`) for blocks of descriptive text. Brief mention of line breaks (`<br>`) for specific formatting needs, with a note on semantic usage.'),(81,14,'Introduction to CSS','Defining CSS: What it is and why it\'s essential for separating content (HTML) from presentation (CSS). The role of CSS in creating visually appealing and responsive web interfaces.'),(82,14,'CSS Syntax Fundamentals','Understanding the structure of a CSS ruleset: selectors, declarations, properties, and values. Correct punctuation (curly braces, colons, semicolons) and comments in CSS.'),(83,14,'Methods of Applying CSS','Detailed explanation and demonstration of Inline Styles (using the `style` attribute), Internal Styles (using the `<style>` tag within `<head>`), and External Styles (linking a `.css` file via `<link>` tag). Emphasizing external stylesheets as the industry standard for maintainability and reusability.'),(84,14,'Fundamental CSS Selectors','Practical application of Type Selectors (e.g., `p`, `h1`), Class Selectors (e.g., `.my-class`), and ID Selectors (e.g., `#my-id`). Best practices for naming classes and IDs, and when to use each selector type.'),(85,14,'CSS Cascade and Specificity','In-depth explanation of how CSS rules are applied based on the cascade (origin, importance, order) and specificity (ID > Class > Type). Understanding these concepts is critical for predicting style outcomes and effective debugging.'),(86,14,'Core CSS Properties for Styling','Hands-on application of fundamental CSS properties: `color` (for text color), `background-color` (for element backgrounds), `font-family` (for selecting typefaces), and `font-size` (for adjusting text size). Practical exercises to combine these properties.'),(87,15,'Introduction to Web Development','Overview of the World Wide Web and how web pages are served. The fundamental role of HTML, CSS, and JavaScript in building interactive web experiences.'),(88,15,'Understanding HTML','Definition of HTML as a HyperText Markup Language. Concepts of tags, elements, and attributes (brief introduction, focus on structural tags). The importance of semantic HTML (brief mention for future context).'),(89,15,'Basic HTML5 Document Structure','Detailed explanation and practical implementation of the `<!DOCTYPE html>` declaration. The purpose and correct nesting of the `<html>` root element. The `<head>` element for metadata (e.g., `<title>`). The `<body>` element for all visible page content.'),(90,15,'Essential Content Tags','Introduction to common block-level elements: `<h1>` (main heading) and `<p>` (paragraph). How to use them for structuring text content.'),(91,15,'Development Environment Setup','Guided setup of VS Code (or a similar code editor). Creating and saving an HTML file with the `.html` extension. Opening and viewing HTML files in a modern web browser.'),(92,15,'Best Practices for HTML','Emphasis on correct tag pairing (opening and closing tags). Importance of proper tag nesting. Basic code indentation for readability and maintainability. Common syntax errors and basic debugging strategies.'),(93,17,'HTML Text Formatting','Heading elements (h1-h6): structuring document hierarchy.'),(94,17,'HTML Text Formatting','Paragraphs (p) and their correct use, avoiding misuse of line breaks (br).'),(95,17,'HTML Text Formatting','Semantic text-level elements: strong (importance), em (emphasis).'),(96,17,'HTML Text Formatting','Distinction between semantic (strong, em) and presentational (b, i) tags.'),(97,17,'HTML Text Formatting','Other common text elements: blockquote, pre, code, sub, sup.'),(98,17,'HTML List Elements','Unordered lists (ul, li): grouping related items without specific order.'),(99,17,'HTML List Elements','Ordered lists (ol, li): presenting items in a sequential or numbered order.'),(100,17,'HTML List Elements','Definition lists (dl, dt, dd): presenting terms and their definitions.'),(101,17,'HTML List Elements','Nesting of list elements for complex structures.'),(102,18,'HTML Links','The `<a>` (anchor) tag for creating hyperlinks. The `href` attribute for specifying the link destination. Internal links vs. External links. The `target=\"_blank\"` attribute for opening links in a new tab/window.'),(103,18,'HTML Images','The `<img>` tag for embedding images. The `src` attribute for specifying the image source. The `alt` attribute for accessibility and SEO. The `width` and `height` attributes for controlling image dimensions.'),(104,18,'File Paths','Understanding relative file paths (e.g., `./`, `../`, `folder/file.html`). Understanding absolute file paths (e.g., `https://www.example.com/image.jpg`, `file:///C:/...`). Applying correct paths for both links and images.'),(105,18,'Best Practices','Importance of semantic \'alt\' text. Organizing project files for maintainability. Basic accessibility considerations for images.');
/*!40000 ALTER TABLE `LO_IndicativeContent` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_LearningOutcome`
--

DROP TABLE IF EXISTS `LO_LearningOutcome`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_LearningOutcome` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lesson_id` int(11) NOT NULL,
  `code` varchar(10) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` text,
  `duration_minutes` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `lesson_id` (`lesson_id`),
  CONSTRAINT `lo_learningoutcome_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_LearningOutcome`
--

LOCK TABLES `LO_LearningOutcome` WRITE;
/*!40000 ALTER TABLE `LO_LearningOutcome` DISABLE KEYS */;
INSERT INTO `LO_LearningOutcome` VALUES (4,2,'LO1','Explain Responsive Web Design Concepts','Explain the principles of responsive web design and key CSS concepts like viewport, box-sizing, media queries, and breakpoints',25),(5,2,'LO2','Apply Mobile-First Design Strategies','Apply mobile-first design strategies to create layouts that adapt to different screen sizes',25),(16,7,'LO1','Optimize websites for search engines','Optimize websites for search engines',0),(17,7,'LO2','Implement SEO best practices','Implement SEO best practices',0),(18,7,'LO3','Create and manage sitemaps','Create and manage sitemaps',0),(19,7,'LO4','Use proper metadata and keywords','Use proper metadata and keywords',0),(20,7,'LO5','Understand search ranking factors','Understand search ranking factors',0),(26,11,'LO1','Describe Web Page Components and the Role of HTML','Learners will be able to identify the essential components that make up a web page and understand the foundational role of HTML in structuring web content.',20),(27,11,'LO2','Set Up a Basic HTML Editor','Learners will successfully install and configure a suitable HTML editor (e.g., VS Code) on their computers, preparing their development environment.',30),(28,11,'LO3','Create a Foundational HTML Document','Learners will be able to construct a basic HTML document including the doctype, html, head, and body tags, along with a title and a simple heading.',40),(32,13,'LO1','Deconstruct the HTML Document Skeleton','Trainees will be able to identify and explain the purpose of core HTML structural tags (<DOCTYPE>, <html>, <head>, <body>) and articulate their role in organizing web content.',60),(33,13,'LO2','Implement Fundamental Text Elements','Trainees will practically apply essential HTML text elements, including various heading levels (<h1> to <h6>) and paragraphs (<p>), to structure textual content within an HTML document.',120),(34,14,'LO1','Grasping CSS Fundamentals and Basic Application Methods','Trainees will be able to explain what CSS is, its core syntax components (selectors, properties, values, rulesets), and apply basic inline and internal CSS styles to HTML elements.',40),(35,14,'LO2','Implementing External Styles and Fundamental Selectors with Cascade','Trainees will be able to create and link external stylesheets, utilize type, class, and ID selectors, and explain the concepts of CSS cascade and specificity to resolve style conflicts.',60),(36,14,'LO3','Practical Application of Essential CSS Properties','Trainees will be able to apply practical styling using `color`, `background-color`, `font-family`, and `font-size` properties to HTML elements, achieving specified visual designs.',80),(37,15,'LO1','Understand the Purpose of HTML and Identify Core Structural Tags','Learners will define HTML\'s role in web development and recognize the essential structural tags (<!DOCTYPE html>, <html>, <head>, <body>) and their purpose.',40),(38,15,'LO2','Apply HTML5 Boilerplate to Create a Valid Document Structure','Learners will set up their development environment (VS Code) and create a new HTML file, correctly implementing the <!DOCTYPE html>, <html>, <head>, and <body> tags.',70),(39,15,'LO3','Insert Basic Content Elements Within the HTML Structure','Learners will add a page title, a main heading, and a paragraph to their HTML document, ensuring correct tag usage and nesting.',70),(40,16,'LO1','Explain Responsive Web Design Concepts','Explain the principles of responsive web design and key CSS concepts like viewport, box-sizing, media queries, and breakpoints',25),(41,16,'LO2','Apply Mobile-First Design Strategies','Apply mobile-first design strategies to create layouts that adapt to different screen sizes',25),(42,17,'LO1','Structure and Format Textual Content Semantically','Trainees will be able to use appropriate HTML elements such as h1-h6, p, strong, and em to structure and format textual content, distinguishing between semantic and presentational tags.',70),(43,17,'LO2','Present Information using HTML List Elements','Trainees will effectively use ordered, unordered, and definition list elements to present structured information, including proper nesting.',50),(44,18,'LO1','Incorporate Hyperlinks for Web Navigation','Trainees will be able to create both internal and external hyperlinks using the <a> tag and its \'href\' attribute, effectively linking web pages for seamless navigation.',45),(45,18,'LO2','Embed Images and Ensure Accessibility','Trainees will be able to embed images into web pages using the <img> tag, correctly applying \'src\', \'alt\', \'width\', and \'height\' attributes while understanding their importance for display and accessibility.',45),(46,18,'LO3','Apply Relative and Absolute File Paths','Trainees will correctly differentiate between and apply relative and absolute file paths for both hyperlinks and embedded images to ensure proper resource loading.',30);
/*!40000 ALTER TABLE `LO_LearningOutcome` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_LearningOutcomeActivity`
--

DROP TABLE IF EXISTS `LO_LearningOutcomeActivity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_LearningOutcomeActivity` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `learning_outcome_id` int(11) NOT NULL,
  `trainer_activities` text,
  `learner_activities` text,
  PRIMARY KEY (`id`),
  KEY `learning_outcome_id` (`learning_outcome_id`),
  CONSTRAINT `lo_learningoutcomeactivity_ibfk_1` FOREIGN KEY (`learning_outcome_id`) REFERENCES `LO_LearningOutcome` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_LearningOutcomeActivity`
--

LOCK TABLES `LO_LearningOutcomeActivity` WRITE;
/*!40000 ALTER TABLE `LO_LearningOutcomeActivity` DISABLE KEYS */;
INSERT INTO `LO_LearningOutcomeActivity` VALUES (2,4,'- Introduce responsive design principles: viewport, box-sizing, media queries, and breakpoints.\n- Demonstrate simple examples showing how websites adjust on different devices.\n','- Observe and analyze the examples.\n- Take notes on definitions and purposes of each concept.\n- Pair discussion: “Which concept is most important for a mobile user experience?”\n'),(3,5,'- Explain the mobile-first design approach and its advantages.\n- Show examples of layouts starting with small screens and scaling up to larger screens.\n','- Practice writing simple CSS using mobile-first media queries.\n- Modify a basic webpage template to adapt first to mobile screens, then tablets/desktops.\n- Share and discuss challenges in pairs.\n'),(9,26,'Introduce the concept of web pages, browsers, and the client-server model. Explain HTML as the \'skeleton\' of a web page.','Participate in discussions, take notes, and ask clarifying questions about web page structure and HTML\'s purpose.'),(10,27,'Demonstrate the installation process for VS Code and guide learners through initial setup steps.','Follow trainer\'s demonstration to install VS Code, create a new folder for projects, and familiarize themselves with the interface.'),(11,28,'Explain and demonstrate the basic HTML document structure and common tags like <title>, <h1>, <p>. Guide learners through typing their first HTML code.','Type and save a basic HTML file, experimenting with the discussed tags, and observe the output in a web browser.'),(15,32,'Deliver a lecture on the foundational structure of an HTML document, explaining the hierarchy and purpose of <!DOCTYPE>, <html>, <head>, and <body> tags. Use clear visual aids and simple analogies.','Actively listen, take notes on key structural elements, ask clarifying questions, and identify the main structural tags in provided example HTML snippets.'),(16,33,'Conduct a live coding demonstration, creating a basic HTML page structure in VS Code and then adding different heading levels and paragraphs. Emphasize correct syntax, indentation, and closing tags. Circulate the lab, providing individualized support and feedback during the guided hands-on practice.','Follow the live coding demonstration, replicate the code, and then independently practice creating a simple personal webpage. Experiment with different heading levels (h1-h6) and paragraphs to structure text content. Seek assistance when encountering issues.'),(17,34,'Deliver a lecture defining CSS, its purpose, and its core syntax (rulesets, selectors, properties, values). Demonstrate live coding of inline styling directly in HTML elements and internal styling within the <style> tag in the HTML head. Explain the advantages and disadvantages of each method.','Listen actively, take notes on CSS definitions and syntax. Observe live coding demonstrations, ask clarifying questions about syntax and application methods. Attempt to replicate simple inline and internal styles in their own text editors.'),(18,35,'Introduce external stylesheets as the industry best practice, demonstrating how to create and link a .css file to an HTML document. Explain and demonstrate type, class, and ID selectors with live coding examples, showing how to target different HTML elements. Crucially, provide a clear explanation of CSS \'cascade\' and \'specificity\' with illustrative examples and potential debugging scenarios.','Follow along as the trainer demonstrates creating and linking external stylesheets. Practice creating their own external .css files. Actively engage with the explanations of cascade and specificity, asking questions to solidify understanding. Apply type, class, and ID selectors in their own practice files.'),(19,36,'Introduce key CSS properties: `color`, `background-color`, `font-family`, and `font-size`. Provide a starter HTML file with unstyled content. Lead a guided practice session where trainees apply these properties using external stylesheets and various selector types to achieve a specific design. Circulate among trainees, offering individualized support, troubleshooting common errors, and reinforcing best practices.','Work on provided HTML and CSS files, applying the introduced properties. Follow guided instructions, experiment with different values, and practice using type, class, and ID selectors. Debug their own code, ask for trainer assistance when encountering difficulties, and apply feedback to correct their styling.'),(20,37,'Lecture-demonstration on \'What is HTML?\', explain basic tags and document structure. Use a simple visual diagram. Ask guiding questions to engage learners.','Participate in discussion, take notes on key concepts, answer questions posed by the trainer.'),(21,38,'Guide learners through VS Code setup (creating a new file, saving it as .html). Demonstrate typing the basic HTML boilerplate. Emphasize correct tag pairing and nesting. Circulate to provide individual assistance and troubleshoot initial setup issues.','Follow trainer\'s demonstration, type the HTML boilerplate into VS Code, save the file correctly, and open it in a web browser.'),(22,39,'Demonstrate adding <title>, <h1>, and <p> tags with example content. Explain how to view changes in the browser. Provide common error examples (e.g., unclosed tags) and guide learners through debugging. Facilitate a short Q&A session.','Add a <title> within <head>, and <h1> and <p> within <body> to their existing HTML file. View their page in the browser to check output. Identify and correct any syntax errors encountered.'),(23,42,'Introduce common text-level semantics (headings, paragraphs, bold/italic). Explain the difference between semantic tags (strong, em) and presentational tags (b, i) with examples. Demonstrate common misuse of <br> for paragraphs. Guide trainees through converting a raw text document into structured HTML, emphasizing correct tag usage.','Participate in discussions about semantic vs. presentational tags. Follow trainer\'s demonstrations. Practice converting provided raw text into HTML using h1-h6, p, strong, em, blockquote. Collaborate in peer-reviewing code for semantic correctness.'),(24,43,'Introduce and demonstrate unordered lists (ul, li), ordered lists (ol, li), and definition lists (dl, dt, dd), including examples of nesting. Provide clear use-cases for each list type. Observe and provide individual feedback during practical exercises.','Follow trainer\'s demonstrations on creating various list types. Practice building different list structures from provided data, including nested lists. Actively seek help when encountering issues. Engage in peer-review to check for correct list syntax and nesting.'),(25,44,'Demonstrate the basic structure of the <a> tag with \'href\' for external links. Explain \'target=\"_blank\"\'. Guide trainees to create external links. Introduce and demonstrate internal links to other HTML files within the same project directory.','Create new HTML files and practice adding external links to popular websites. Experiment with \'target=\"_blank\"\'. Create two additional HTML files (e.g., \'about.html\', \'contact.html\') and link them to the main \'index.html\' using relative paths.'),(26,45,'Demonstrate the <img> tag with the \'src\' attribute. Explain the importance of the \'alt\' attribute for accessibility and SEO, providing examples of good and bad alt text. Show how \'width\' and \'height\' attributes affect image display. Provide sample image files.','Practice embedding a local image into their \'index.html\' page. Add appropriate \'alt\' text to the image. Experiment with \'width\' and \'height\' attributes to resize the image, observing the impact on layout.'),(27,46,'Clearly explain the concepts of relative and absolute file paths using a visual directory structure example. Demonstrate how to use relative paths for files within the same directory, subdirectories, and parent directories. Briefly touch upon absolute URLs for external resources.','Reorganize their project files into a simple folder structure (e.g., \'images\' folder for images, \'pages\' folder for other HTML files). Update existing links and image \'src\' attributes to use correct relative paths based on the new structure. Practice embedding an image from an external URL (absolute path).');
/*!40000 ALTER TABLE `LO_LearningOutcomeActivity` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_LearningOutcomeResource`
--

DROP TABLE IF EXISTS `LO_LearningOutcomeResource`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_LearningOutcomeResource` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `learning_outcome_id` int(11) NOT NULL,
  `resource_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `learning_outcome_id` (`learning_outcome_id`),
  CONSTRAINT `lo_learningoutcomeresource_ibfk_1` FOREIGN KEY (`learning_outcome_id`) REFERENCES `LO_LearningOutcome` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=82 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_LearningOutcomeResource`
--

LOCK TABLES `LO_LearningOutcomeResource` WRITE;
/*!40000 ALTER TABLE `LO_LearningOutcomeResource` DISABLE KEYS */;
INSERT INTO `LO_LearningOutcomeResource` VALUES (2,4,'PPT Presentation'),(3,4,'white board'),(4,4,'marker pens'),(5,4,'projector'),(6,5,'PPT Presentation'),(7,5,'white board'),(8,5,'marker pens'),(9,5,'projector'),(23,26,'Projector with presentation slides on web components'),(24,27,'Computers with internet access'),(25,27,'Projector displaying editor installation steps'),(26,27,'VS Code installer (pre-downloaded or internet access)'),(27,28,'Computers with VS Code installed'),(28,28,'Projector displaying live coding examples'),(29,28,'Reference sheet for basic HTML tags'),(39,32,'Presentation slides: \'Anatomy of an HTML Document\''),(40,32,'Whiteboard or projector for live diagramming'),(41,33,'Text editor (VS Code) on each learner\'s machine'),(42,33,'Modern web browser for viewing output'),(43,33,'Projector for live coding demonstration'),(44,33,'Online HTML reference documentation (e.g., MDN Web Docs)'),(45,34,'Whiteboard or projector'),(46,34,'Sample HTML file for demonstrations'),(47,34,'Text editor (e.g., VS Code)'),(48,35,'Text editor (e.g., VS Code)'),(49,35,'Web browser'),(50,35,'Projector'),(51,35,'Sample HTML files with linked CSS for examples'),(52,36,'Computer lab workstations'),(53,36,'Text editor (e.g., VS Code)'),(54,36,'Web browser'),(55,36,'Guided practice exercise sheet/instructions'),(56,36,'Online CSS reference documentation (e.g., MDN, W3Schools)'),(57,37,'Whiteboard/Projector'),(58,37,'Simplified HTML5 specification snippets (for doctype, html, head, body)'),(59,38,'VS Code (installed on lab computers)'),(60,38,'Modern web browser (Chrome/Firefox)'),(61,38,'Sample HTML boilerplate code snippet'),(62,39,'VS Code'),(63,39,'Modern web browser (Chrome/Firefox)'),(64,39,'List of common HTML syntax errors for troubleshooting'),(65,42,'VS Code'),(66,42,'Sample raw text document for formatting'),(67,42,'HTML text formatting element reference (MDN Web Docs)'),(68,42,'Projector and Whiteboard'),(69,43,'VS Code'),(70,43,'Sample data for creating different list types (e.g., recipe ingredients/steps, glossary terms)'),(71,43,'HTML list element reference (MDN Web Docs)'),(72,44,'VS Code'),(73,44,'Web browser'),(74,44,'Sample HTML files for linking practice'),(75,45,'VS Code'),(76,45,'Web browser'),(77,45,'Sample image files (PNG, JPG)'),(78,45,'HTML attributes reference (online)'),(79,46,'VS Code'),(80,46,'Web browser'),(81,46,'Project directory diagram');
/*!40000 ALTER TABLE `LO_LearningOutcomeResource` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_Lesson`
--

DROP TABLE IF EXISTS `LO_Lesson`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_Lesson` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `entry_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `session_code` varchar(50) DEFAULT NULL,
  `sector` varchar(100) DEFAULT NULL,
  `trade` varchar(100) DEFAULT NULL,
  `level` varchar(50) DEFAULT NULL,
  `module_code` varchar(50) DEFAULT NULL,
  `module_name` varchar(255) DEFAULT NULL,
  `week` int(11) DEFAULT NULL,
  `term` varchar(20) DEFAULT NULL,
  `school_year` varchar(20) DEFAULT NULL,
  `class_name` varchar(100) DEFAULT NULL,
  `number_of_trainees` int(11) DEFAULT NULL,
  `lesson_date` date DEFAULT NULL,
  `start_time` varchar(50) DEFAULT NULL,
  `end_time` varchar(50) DEFAULT NULL,
  `instructor_name` varchar(255) DEFAULT NULL,
  `big_question` text,
  `total_duration_minutes` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `entry_id` (`entry_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `lo_lesson_ibfk_1` FOREIGN KEY (`entry_id`) REFERENCES `SchemeOfWorkEntry` (`entry_id`) ON DELETE CASCADE,
  CONSTRAINT `lo_lesson_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_Lesson`
--

LOCK TABLES `LO_Lesson` WRITE;
/*!40000 ALTER TABLE `LO_Lesson` DISABLE KEYS */;
INSERT INTO `LO_Lesson` VALUES (2,1,15,NULL,'ICT','SPEs','3',NULL,NULL,NULL,NULL,NULL,'Year 1',NULL,'2026-01-08','11:00','12:40','NIYONGABO Emmanuel','How can we create responsive and visually appealing web pages using CSS frameworks and Bootstrap?',NULL,'2026-02-07 18:05:54'),(7,9,15,NULL,'ICT','SPEs','3',NULL,'SPEWI302, Development of Web User Interface',9,'II','2025-26','Year 1',10,'2026-03-05','11:00','14:30','NIYONGABO Emmanuel','How can we optimize our websites to rank better in search engines and increase visibility?',150,'2026-03-04 22:15:28'),(11,76,15,'W1S1','ICT & Software Development','Web Development','Coding A','GUID101','Graphic User Interface Design',1,'Term 3','2025-2026','Coding A',NULL,'2026-08-03',NULL,NULL,'Niyongabo Emmanuel','How do we begin to build the interactive web pages we see every day, and what are their fundamental building blocks?',100,'2026-07-28 06:37:17'),(13,102,15,'W1S1','Information Technology','Web Development','Introductory','DWI101','Development of Web User Interface',1,'Term 3','2025-2026','Coding A',NULL,'2026-04-06',NULL,NULL,'Niyongabo Emmanuel','How do we speak the language of the web to structure content for digital display, and why is HTML fundamental to this conversation?',180,'2026-07-29 12:41:30'),(14,106,15,'WEBUI-W5-S1','Information and Communication Technology','Web Development','Introductory','WEBUI005','Development of Web User Interface',5,'Term 3','2025-2026','Coding A',NULL,'2026-05-04',NULL,NULL,'Niyongabo Emmanuel','How can we effectively control the visual presentation of our HTML content to create engaging, consistent, and maintainable web interfaces?',180,'2026-07-30 07:30:27'),(15,114,15,'W1S1','Information Technology','Web Development','Introductory','UIWD101','Development of Web User Interface',1,'Term 1','2025-2026','Coding A',NULL,'2026-08-03',NULL,NULL,'Niyongabo Emmanuel','How do we build the fundamental structure of every webpage?',180,'2026-07-30 14:52:20'),(16,1,15,NULL,'ICT','SPEs','3',NULL,NULL,NULL,NULL,NULL,'Year 1',NULL,'2026-01-08','13:40','14:30','NIYONGABO Emmanuel','How can we create responsive and visually appealing web pages using CSS frameworks and Bootstrap?',NULL,'2026-07-31 09:42:33'),(17,115,15,'DUI-2-S002','Information and Communication Technology (ICT)','Web Development','Coding A','DUI-C1-W2','Development of Web User Interface',2,'Term 1','2025-2026','Coding A',NULL,'2026-08-10',NULL,NULL,'Niyongabo Emmanuel','Why is structuring text and lists semantically crucial for effective, accessible, and maintainable web content?',120,'2026-08-02 16:14:40'),(18,116,15,'W3-HTML-LI','ICT','Coding A','Introductory','UI-101','Development of Web User Interface',3,'Term 1','2025-2026','Coding A',NULL,'2026-08-17',NULL,NULL,'Niyongabo Emmanuel','How do we connect disparate web pages and incorporate visual elements to create a comprehensive, navigable, and engaging user experience on the web?',120,'2026-08-04 09:38:38');
/*!40000 ALTER TABLE `LO_Lesson` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_LessonAssignment`
--

DROP TABLE IF EXISTS `LO_LessonAssignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_LessonAssignment` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lesson_id` int(11) NOT NULL,
  `description` text,
  PRIMARY KEY (`id`),
  KEY `lesson_id` (`lesson_id`),
  CONSTRAINT `lo_lessonassignment_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_LessonAssignment`
--

LOCK TABLES `LO_LessonAssignment` WRITE;
/*!40000 ALTER TABLE `LO_LessonAssignment` DISABLE KEYS */;
INSERT INTO `LO_LessonAssignment` VALUES (3,7,'Assignment/Homework Perform SEO audit of assigned website: - Analyze current content - Check meta tags and titles - Review URL structure Implement SEO improvements: - Add/optimize meta descriptions - Improve keyword placement - Create XML sitemap - Set up Google Search Console Document findings: - Current SEO status report - Improvements implemented - Optimization recommendations SEO audit report and optimized website with improved metadata'),(7,11,'Create a new HTML file named \'myfirstpage.html\'. Inside this file, include the basic HTML document structure: DOCTYPE, html, head, and body tags. Set the page title to \'My First Web Page\'. Inside the body, add a main heading \'Welcome to My First Web Page\' and a paragraph stating \'This is a simple web page created during our first GUI Design lesson.\' Ensure your HTML is correctly structured and saved. Submit the .html file.'),(9,13,'Create an HTML file named `my_personal_intro.html`. This page should introduce yourself (or a fictional character/topic) using:\n1. The correct HTML document structure (including `<!DOCTYPE>`, `<html>`, `<head>` with a relevant `<title>`, and `<body>`).\n2. At least three different heading levels (`<h1>` to `<h6>`) to organize your information semantically (e.g., `<h1>` for your name, `<h2>` for your hobbies, `<h3>` for your favorite food).\n3. At least two paragraphs (`<p>`) of descriptive text. Ensure correct syntax, consistent indentation, and proper closing tags for all elements. Submit the `.html` file via the learning management system before the next session.'),(10,14,'**Assignment 1: Style Your Mini-Portfolio** - Create a simple one-page HTML portfolio (e.g., \'About Me\', \'My Skills\', \'Contact\'). Using an *external stylesheet*, apply at least seven different CSS properties (e.g., `color`, `background-color`, `font-family`, `font-size`, `text-align`, `border`, `padding`, etc.) to various elements. Ensure you use a combination of type, class, and ID selectors to achieve a clear and visually appealing design. Submit both your HTML and CSS files.'),(11,14,'**Assignment 2: Research & Explain a New CSS Property** - Research one additional CSS property not explicitly covered in today\'s session (e.g., `margin`, `box-shadow`, `text-decoration`). Write a short explanation (100-150 words) detailing its purpose, syntax, and common use cases. Include a small HTML and CSS code snippet demonstrating its practical application. Be prepared to share your findings next week.'),(12,15,'Create a personal \'My Hobbies\' webpage. This page must include the correct HTML5 document structure (doctype, html, head, body). Add a meaningful <title> within the <head> that accurately describes the page. Inside the <body>, include a main <h1> heading \'My Hobbies\' and at least three separate <p> paragraphs, each describing a different hobby or interest. Ensure all HTML tags are properly opened and closed, and that the document is well-nested and readable.'),(13,17,'Create an HTML file named \'recipe.html\' that presents your favorite recipe. The recipe must include: a main heading for the dish name, paragraphs for a brief description, an unordered list for ingredients, and an ordered list for preparation steps. Ensure all text and list elements are semantically appropriate (e.g., use <strong> for key ingredients, do not use <br> for new paragraphs).'),(14,17,'Develop an HTML page named \'faq.html\' presenting at least five frequently asked questions and their answers. Use a definition list (<dl>, <dt>, <dd>) for the questions and answers. The questions should be emphasized using <strong> or <em> tags.'),(15,18,'Create a personal webpage project consisting of at least three linked HTML pages (e.g., \'home.html\', \'portfolio.html\', \'contact.html\'). On your \'home.html\' page, include an external link to your favourite website. On your \'portfolio.html\' page, embed at least three relevant images (e.g., project screenshots) using both relative and absolute paths, ensuring each image has a descriptive \'alt\' attribute. All pages must link to each other for navigation. Organize your files in a logical folder structure.');
/*!40000 ALTER TABLE `LO_LessonAssignment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_LessonEvaluation`
--

DROP TABLE IF EXISTS `LO_LessonEvaluation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_LessonEvaluation` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lesson_id` int(11) NOT NULL,
  `teacher_notes` text,
  `references` text,
  `prepared_by` varchar(255) DEFAULT NULL,
  `verified_by` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `lesson_id` (`lesson_id`),
  CONSTRAINT `lo_lessonevaluation_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_LessonEvaluation`
--

LOCK TABLES `LO_LessonEvaluation` WRITE;
/*!40000 ALTER TABLE `LO_LessonEvaluation` DISABLE KEYS */;
INSERT INTO `LO_LessonEvaluation` VALUES (2,2,'','','',''),(7,7,'Evaluation of the session and Teacher\'s notes: ….…………………………………………………………………………… ….………………………………………………… ….…………………………… Did trainees understand SEO principles? ☐ Yes ☐ Partially ☐ No Can trainees identify optimization opportunities? ☐ Yes ☐ Partially ☐ No Can trainees use SEO tools? ☐ Yes ☐ Partially ☐ No Observations: ….……………………………………………………………………………','','NIYONGABO Emmanuel','………………………………………'),(11,11,'Formative assessment will be conducted through direct observation during the practical sessions (editor setup and initial HTML coding) to ensure all students successfully set up their development environment. The practical exercise (creating a basic HTML page with a title and simple body structure) will serve as evidence of understanding. I will circulate around the lab, providing individualized support and checking for correct syntax and structure. Focus will be on participation and successful completion of the basic setup and file creation, rather than complex code.','MDN Web Docs (developer.mozilla.org), W3Schools (w3schools.com), HTML and CSS: Design and Build Websites by Jon Duckett, Professional trainers\' guides and curriculum resources.','Niyongabo Emmanuel',''),(13,13,'Formative assessment will be conducted through observation during the hands-on practice, ensuring trainees are actively applying concepts. The primary evidence of learning will be the submission of their individual HTML file by the end of the session (or as homework). I will check for correct implementation of: <!DOCTYPE> declaration, <html>, <head>, and <body> tags, appropriate use of at least three heading levels (e.g., h1, h2, h3), and proper use of paragraphs. Specific attention will be paid to correct syntax, consistent indentation, and the presence of all necessary closing tags, as emphasized throughout the lesson.','MDN Web Docs (Mozilla Developer Network) for HTML, W3C HTML Living Standard.','Niyongabo Emmanuel',''),(14,14,'Formative assessment will be ongoing throughout the guided practice during the Development section. I will observe trainees\' ability to apply CSS properties correctly and use different selector types. For formal assessment, trainees will submit an external stylesheet (.css file) that successfully styles a given HTML page. I will check for: 1. Correct linking of the external stylesheet. 2. Application of at least five distinct CSS properties (`color`, `background-color`, `font-family`, `font-size` are mandatory, plus one more). 3. Successful use of type, class, AND ID selectors. 4. Correct CSS syntax. 5. Evidence of understanding cascade/specificity if they\'ve debugged conflicts. This will be collected at the end of the session as evidence of learning.','MDN Web Docs: CSS Basics; W3Schools CSS Tutorial; Internally prepared HTML/CSS exercise files.','Niyongabo Emmanuel',''),(15,15,'Formative assessment will involve trainees submitting their \'hello world\' HTML page created during the session. I will assess based on the following criteria: presence of correct HTML5 doctype, proper nesting of <html>, <head>, and <body> tags, inclusion of a <title>, a main <h1> heading, and at least one <p> paragraph. I will check for correct tag pairing and overall document validity, providing specific written feedback to each trainee.','W3C HTML5 Specification, MDN Web Docs: HTML Basics, The Modern Web Browser documentation (for developer tools).','Niyongabo Emmanuel',''),(16,17,'Formative assessment will be ongoing throughout the session. I will observe trainees\' progress during practical exercises, noting their ability to correctly identify and apply semantic text and list elements. Peer review sessions will provide an opportunity for trainees to articulate and apply their understanding, and for me to identify areas needing further clarification. The submitted homework assignments will serve as direct evidence of their ability to apply the learned concepts independently, focusing on correct and semantic usage of tags, proper nesting, and adherence to best practices (e.g., avoiding <br> for paragraphs). Specific attention will be paid to the distinction between semantic and presentational tags.','MDN Web Docs (developer.mozilla.org/en-US/docs/Web/HTML), W3C HTML Living Standard (html.spec.whatwg.org/multipage/)','Niyongabo Emmanuel',''),(17,18,'Formative assessment will involve observing trainees during the \'Development\' section as they create a small multi-page website (index.html, about.html, contact.html) with internal and external links, and correctly embed at least two images with appropriate \'alt\' attributes. I will look for: correct syntax for <a> and <img> tags; accurate use of \'href\', \'src\', \'alt\', \'width\', \'height\' attributes; and proper application of relative file paths for local resources. Specific attention will be paid to the `alt` attribute for accessibility.','Mozilla Developer Network (MDN) Web Docs: HTML Links, HTML Images; W3Schools HTML Tutorial.','Niyongabo Emmanuel','');
/*!40000 ALTER TABLE `LO_LessonEvaluation` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LO_LessonSection`
--

DROP TABLE IF EXISTS `LO_LessonSection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LO_LessonSection` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `lesson_id` int(11) NOT NULL,
  `section_type` enum('Introduction','Development','Conclusion') DEFAULT NULL,
  `trainer_activities` text,
  `learner_activities` text,
  `resources` text,
  `duration_minutes` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `lesson_id` (`lesson_id`),
  CONSTRAINT `lo_lessonsection_ibfk_1` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LO_LessonSection`
--

LOCK TABLES `LO_LessonSection` WRITE;
/*!40000 ALTER TABLE `LO_LessonSection` DISABLE KEYS */;
INSERT INTO `LO_LessonSection` VALUES (3,2,'Introduction','- Review previous lessons on web design and CSS fundamentals and provide a small welcome quiz.\n- Introduce responsive design concepts: viewport, box-sizing, media queries, breakpoints, and mobile-first design, using short examples.\n- Explain CSS frameworks and their benefits for faster, consistent web development.\n- Demonstrate the use of Bootstrap framework, including:\nGrid system: containers, rows, and columns\nBootstrap layout components: Jumbotron, Tabs, and Carousel','- Do a small quiz\n- Observe demonstration UI samples.\n- Respond to introductory questions (e.g., “Where have you seen navigation bars and animations?”).\n- Note learning objectives.','PPT Presentation, white board, marker pens and projector.',25),(4,2,'Development','','','Projector',60),(5,2,'Conclusion','- Summarize key concepts: responsive design, viewport, box-sizing, media queries, breakpoints, mobile-first design, CSS frameworks, Bootstrap grid system, and components (Jumbotron, Tabs, Carousel).\n- Ask short oral questions to check learners’ understanding.\n- Highlight best practices for building responsive and visually appealing web pages.\n','- Share their completed layouts and Bootstrap components.\n- Discuss which concepts were easiest or most challenging.\n- Write 3 key takeaways in their notebook about responsive design and Bootstrap usage.','N/A',15),(20,7,'Introduction','Review previous deployment lessons Explain importance of SEO in web presence Present search engine basics Discuss ranking factors Show real SEO examples','','Resources SEO tools (Google Analytics, Search Console) Keyword research tools Text editor Web browser with SEO extensions Projector Sample websites Reference guides Internet connection',20),(21,7,'Development','Explain SEO fundamentals Show keyword research process Demonstrate meta tag optimization Explain sitemap creation Show Google Search Console Discuss content optimization Review site structure best practices','Take notes on SEO principles Research keywords for sample sites Optimize sample webpage content Create XML sitemap Set up Google Search Console Analyze existing websites Practice optimization techniques','SEO tools and platforms Keyword research tools Website analyzer tools Projector Laptops Text editor Google Search Console Reference documentation',100),(22,7,'Conclusion','Summarize SEO best practices Recap optimization techniques Discuss measurement and analytics Answer questions about SEO','Reflect on SEO learning Review key optimization strategies Discuss implementation challenges Ask clarifying questions','SEO audit report and optimized website with improved metadata',15),(30,11,'Introduction','Welcome learners and introduce the module \'Graphic User Interface Design\'. Present the \'big question\' for the session and outline the learning objectives (LO1, LO2, LO3). Initiate a brief discussion asking learners what they think a web page is made of.','Engage in warm-up discussion, listen actively to the big question and learning objectives, and prepare for the lesson.','Projector, Whiteboard/Flipchart',15),(31,11,'Development','1. **(LO1)** Lecture and demonstrate key web page components (browser, server, HTML, CSS, JavaScript, focusing on HTML\'s role). Use visual aids. 2. **(LO2)** Guide learners step-by-step through the installation of VS Code, ensuring all students successfully set up their environment. Provide troubleshooting support. 3. **(LO3)** Demonstrate creating a new HTML file in VS Code. Explain and live-code the basic HTML structure: <!DOCTYPE html>, <html>, <head>, <title>, <body>. Add a simple <h1> and <p> tag. Explain how to save and open the file in a browser. Provide time for learners to replicate and experiment.','1. Take notes on web page components and HTML\'s role. 2. Actively follow the trainer\'s instructions to install VS Code, setting up their development folder. Seek help when encountering issues. 3. Practice typing the basic HTML structure and adding simple content in VS Code, saving files, and viewing them in a browser.','Computers, Projector, HTML editor (VS Code), Presentation slides, Internet access',75),(32,11,'Conclusion','Recap the main concepts covered: web page components, HTML\'s role, HTML editor setup, and basic HTML structure. Conduct a quick Q&A session to gauge understanding. Assign the practical exercise as an immediate formative assessment and homework. Emphasize the importance of practicing. Provide final notes and dismiss.','Participate in the recap and Q&A. Prepare to complete the practical exercise. Note down the homework assignment.','Whiteboard/Flipchart',10),(36,13,'Introduction','Welcome trainees, introduce myself and the module. Briefly outline the \'Big Question\' for the session and state the learning objectives. Conduct a quick poll/discussion to gauge prior experience with web development. Emphasize the importance of good coding habits from the start.','Engage in introductory discussion, articulate expectations, and ensure workstations are set up with VS Code and a browser ready.','Whiteboard/projector for session objectives, \'What is Web Development?\' introductory slide.',25),(37,13,'Development','Deliver content for LO1 (60 minutes): Lecture on HTML document structure (DOCTYPE, html, head, body). Facilitate discussion. Transition to LO2 (70 minutes): Live coding demonstration of headings (h1-h6) and paragraphs (p). Guide trainees through hands-on practice, building a simple page. Provide continuous feedback and troubleshoot common syntax errors, reinforcing correct indentation and closing tags.','Actively participate in the lecture, take detailed notes. Follow live coding, then independently create and modify HTML files, applying learned structural and text elements. Debug personal code and seek clarification from the trainer.','Projector, VS Code, web browser, HTML reference sheets/links.',130),(38,13,'Conclusion','Lead a quick recap of the main HTML structural tags and text elements covered. Address common issues observed during practice. Introduce the homework assignment and explain the submission requirements. Preview next week\'s topic (e.g., attributes and lists).','Participate in the recap discussion, ask any lingering questions, note down assignment details, and save all created files.','Whiteboard/projector for recap points and assignment details.',25),(39,14,'Introduction','Greet trainees and briefly recap key concepts from the previous week\'s HTML sessions. Introduce the \'Big Question\' for today\'s session and clearly state the learning objectives for CSS styling. Explain the vital role of CSS in modern web development and provide a concise overview of the session\'s agenda. Emphasize the shift from structure (HTML) to presentation (CSS).','Respond to greetings, participate in a quick recall of HTML fundamentals. Listen attentively to the \'Big Question\' and learning objectives. Take notes on the session overview and the importance of CSS.','Whiteboard or projector for agenda and Big Question. Previous week\'s HTML examples (optional).',20),(40,14,'Development','I will proceed sequentially through the learning outcomes: 1. **(40 min)** Introduce CSS basics, syntax (rulesets, selectors, properties, values), and demonstrate inline and internal styling with live code. Explain the contexts for each. 2. **(60 min)** Transition to external stylesheets, stressing them as best practice. Demonstrate linking. Introduce type, class, and ID selectors. **Dedicate 15-20 minutes here specifically to explaining \'cascade\' and \'specificity\' with clear visual examples and debugging tips.** Show how these concepts resolve conflicting styles. 3. **(40 min)** Introduce core properties like `color`, `background-color`, `font-family`, `font-size`. Provide a starter HTML file and lead a guided practice where trainees apply these properties using external CSS and various selectors. I will circulate to provide individual support and formative feedback, ensuring everyone is actively coding.','Trainees will first observe and take notes during the lecture and live coding demonstrations on CSS basics, inline/internal styling, and external stylesheet setup. They will actively participate in discussions on cascade and specificity, attempting to predict outcomes. During the guided practice, trainees will work hands-on at their workstations, applying learned CSS properties and selectors to a provided HTML file, troubleshooting issues independently or with trainer support. This practical application directly addresses the objective of applying basic styles.','Computer lab workstations, Text editor (e.g., VS Code), Web browser, Projector, Pre-prepared sample HTML files (for demonstrations and guided practice), Online CSS reference documentation (e.g., MDN Web Docs, W3Schools).',140),(41,14,'Conclusion','Facilitate a concise recap of the day\'s key concepts: the purpose of CSS, its syntax, methods of application (especially external), fundamental selectors, and the importance of cascade and specificity. Address any lingering questions. Clearly explain the formative assessment task (creating an external stylesheet for a given HTML page with specific requirements) and the homework assignments. Encourage continued exploration of CSS.','Participate in the recap discussion, recalling key CSS concepts. Ask any remaining questions. Take clear notes on the formative assessment instructions and homework assignments. Prepare for the next session.','Whiteboard or projector for key takeaways and assignment details. Formative assessment brief.',20),(42,15,'Introduction','Welcome learners to the \'Development of Web User Interface\' module. Introduce the \'Big Question\' for the session. State the learning objectives. Briefly outline the session\'s flow. Initiate a short discussion to activate prior knowledge about websites.','Engage in welcome, listen attentively to objectives, consider the big question, and participate in the brief discussion.','Whiteboard/Projector, Lesson Plan Outline',20),(43,15,'Development','Execute lecture-demonstrations for LO1 (HTML purpose, structural tags) and LO3 (inserting basic content). Guide learners through practical exercises for LO2 (VS Code setup, boilerplate creation) and LO3 (adding title, headings, paragraphs). Circulate continuously, offering individual support, troubleshooting issues, and providing immediate feedback. Emphasize best practices like tag pairing and nesting.','Actively participate in theoretical discussions. Follow trainer\'s instructions for hands-on activities. Type HTML code, save files, and view them in the browser. Ask questions, collaborate with peers (if allowed), and work to correct their own syntax errors.','VS Code, modern web browser (Chrome/Firefox), HTML5 specification snippets, sample HTML code, projector for demonstrations, whiteboard for notes.',140),(44,15,'Conclusion','Lead a quick recap of the main concepts covered: the role of HTML, the essential structural tags (<DOCTYPE html>, <html>, <head>, <body>), and basic content tags (<h1>, <p>, <title>). Address any remaining questions. Clearly explain the formative assessment task and the homework assignment, reiterating submission requirements and deadlines. Reinforce the importance of correct document structure.','Participate in the recap discussion, ask clarifying questions, take notes on the assessment and homework details, and ensure full understanding of the next steps.','Whiteboard/Projector, Assignment brief',20),(45,17,'Introduction','Welcome trainees and recap Week 1\'s basic HTML structure. Introduce the \'Big Question\' for the session. Outline the learning objectives (LO1 & LO2). Briefly demonstrate a web page with poorly structured text and lists versus one with well-structured, semantic HTML to highlight the benefits. Conduct a quick Q&A to gauge prior knowledge.','Actively participate in the recap and Q&A. Listen to the session objectives and \'Big Question\'. Observe the demonstration of good vs. bad HTML structure.','Projector, Whiteboard, Example HTML pages (good and bad structure)',15),(46,17,'Development','Deliver short direct instructions and live coding demonstrations for LO1 (text formatting: h1-h6, p, strong, em, blockquote, pre, code). Emphasize semantic usage over presentational. Facilitate practical exercises where trainees convert raw text to semantic HTML. Circulate and provide individualized support, correcting common errors like using <br> for paragraphs. Conduct mini-demonstrations for LO2 (list elements: ul, ol, dl) with examples of nesting. Assign practical tasks for trainees to create various list types. Oversee peer review sessions, guiding trainees on how to provide constructive feedback.','Engage in active listening during demonstrations. Independently practice coding text formatting elements and list structures in VS Code. Work on converting provided sample content into structured HTML. Participate in peer review sessions, analyzing classmates\' code for correct tag usage, semantic meaning, and proper nesting. Ask clarifying questions and seek assistance when needed.','VS Code, Sample raw text content, Sample data for lists, HTML element reference documentation (local or online), Trainer\'s computer with projector',90),(47,17,'Conclusion','Lead a brief plenary discussion to summarize key learning points: importance of semantic HTML for text and lists, correct usage of headings, paragraphs, emphasis tags, and the three main list types. Address common mistakes observed during the practical session (e.g., using <br> for paragraphs, mixing semantic and presentational incorrectly). Answer any remaining questions. Explain the homework assignment clearly.','Participate in the summary discussion. Ask any lingering questions. Take notes on common pitfalls and best practices. Listen attentively to the homework assignment explanation.','Whiteboard, Projector',15),(48,18,'Introduction','Welcome trainees and take attendance. Briefly recap the previous session\'s topic (basic HTML structure). Introduce today\'s \'Big Question\' and outline the learning objectives for links and images. Emphasize their fundamental role in web development.','Actively listen and respond to recap questions. Mentally prepare for the new topic, understanding the relevance of links and images for creating interactive web pages.','Whiteboard or projector for objectives, Previous lesson\'s notes',15),(49,18,'Development','Lead demonstrations for LO1 (hyperlinks), LO2 (images), and LO3 (file paths). Provide clear, step-by-step instructions. Circulate around the lab, providing individual support, troubleshooting common errors, and offering hints during guided practice. Prompt trainees with questions to check understanding of attributes and pathing. Provide mini-challenges, like \'link to a specific section of a longer page\' or \'embed an image from a different folder\'.','Follow trainer demonstrations in VS Code. Actively participate in guided practice, creating HTML links and embedding images. Ask clarifying questions. Troubleshoot their own code with trainer assistance. Engage in peer-learning where appropriate. Experiment with different attributes and path structures as instructed.','VS Code, web browser, sample image files, pre-prepared HTML snippets for demonstration, HTML attributes reference',90),(50,18,'Conclusion','Lead a quick class recap of key concepts: <a> vs. <img>, href vs. src, alt attribute importance, relative vs. absolute paths. Address common errors observed during practice. Briefly explain the formative assessment task. Introduce the take-home assignment and answer any remaining questions.','Participate in the recap, summarizing key learnings. Ask final questions about any areas of confusion. Note down the formative assessment requirements and the details of the homework assignment.','Whiteboard for key takeaways, Assignment sheet',15);
/*!40000 ALTER TABLE `LO_LessonSection` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonNote`
--

DROP TABLE IF EXISTS `LessonNote`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonNote` (
  `note_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) DEFAULT NULL,
  `scheme_entry_id` bigint(20) DEFAULT NULL,
  `academic_term_id` bigint(20) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `content_json` json DEFAULT NULL,
  `content_html` longtext,
  `status` enum('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  `source` enum('MANUAL','AI_GENERATED','AI_ASSISTED') NOT NULL DEFAULT 'MANUAL',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`note_id`),
  KEY `fk_ln_class_group` (`class_group_id`),
  KEY `fk_ln_term` (`academic_term_id`),
  KEY `idx_ln_user` (`user_id`),
  KEY `idx_ln_subject` (`subject_id`,`class_group_id`),
  KEY `idx_ln_scheme_entry` (`scheme_entry_id`),
  CONSTRAINT `fk_ln_class_group` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  CONSTRAINT `fk_ln_scheme_entry` FOREIGN KEY (`scheme_entry_id`) REFERENCES `SchemeOfWorkEntry` (`entry_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ln_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ln_term` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  CONSTRAINT `fk_ln_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonNote`
--

LOCK TABLES `LessonNote` WRITE;
/*!40000 ALTER TABLE `LessonNote` DISABLE KEYS */;
INSERT INTO `LessonNote` VALUES (78,15,8,41,164,7,'GUI Design Essentials: Principles and Digital Image Formats','{\"type\": \"doc\", \"content\": [{\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Introduction to GUI Design Foundations\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Welcome to Week 2 of Graphic User Interface Design! This week, we dive into the fundamental principles that govern effective visual communication and the crucial role of digital image formats in building compelling GUIs. Understanding these concepts is essential for creating user interfaces that are not only aesthetically pleasing but also highly functional and user-friendly.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"I. Core Graphic Design Principles\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Effective GUI design isn\'t just about making things look good; it\'s about guiding the user, communicating clearly, and creating an intuitive experience. This is achieved by applying core graphic design principles.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Contrast\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Contrast refers to the difference between two or more elements in a design. This difference can manifest in various ways, such as color, size, shape, texture, typography, or spacing.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Purpose:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Draw Attention:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Highlight important elements.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Create Hierarchy:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Distinguish between primary and secondary information.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Improve Readability:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Ensure text is easily discernible from its background.\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Example:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" In a login screen, a bright, prominent \\\"Login\\\" button stands out against a subdued background. Similarly, using a large, bold font for a main heading compared to a smaller, lighter font for body text creates strong visual contrast.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Balance\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Balance in design is the distribution of visual weight within a composition. It gives a sense of stability and structure to your layout.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Types of Balance:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Symmetrical Balance:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Elements are equally distributed on either side of a central axis, creating a formal and stable feel (e.g., mirroring elements).\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Asymmetrical Balance:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Different elements are used on either side of a central axis, but they hold equal visual weight, creating a more dynamic and modern feel (e.g., a large image on one side balanced by several smaller text blocks on the other).\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Example:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" A navigation bar with evenly spaced menu items demonstrates symmetrical balance. An asymmetrical layout might feature a large image off to one side, balanced by a smaller text block and a compact button group on the opposite side, maintaining overall visual equilibrium.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Hierarchy\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Visual hierarchy is the arrangement of design elements to indicate their order of importance. It guides the user\'s eye through the interface, ensuring they encounter information in a logical sequence.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Methods to Establish Hierarchy:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Size:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Larger elements are perceived as more important.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Color & Contrast:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Bright, saturated colors or high-contrast elements draw attention.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Placement:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Elements at the top or center often receive more focus.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Typography:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Using different font sizes, weights (bold/light), and styles (serif/sans-serif) to differentiate information.\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Example:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" On a product page, the product name might be an\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \", the price a bolded\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"tag, and the \\\"Add to Cart\\\" button a distinct color and size. This establishes a clear reading order and emphasizes key actions.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"II. Digital Image Formats: Raster vs. Vector\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Understanding the fundamental differences between digital image formats is crucial for optimizing your GUI for performance and visual quality. Choosing the right format depends on the type of image and its intended use.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Raster Images\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Raster images, also known as bitmap images, are composed of a grid of tiny individual pixels (picture elements). Each pixel holds specific color and location information.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Key Features:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Pixel-Based:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Built from a finite number of colored squares.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Resolution-Dependent:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The quality of the image is tied to its resolution (pixels per inch/PPI). Scaling raster images up too much can lead to pixelation and blurriness.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Rich Detail:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Excellent for photographs and complex images with subtle color gradients and textures.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"File Size:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Can be large, especially for high-resolution images. Compression techniques (lossy like JPEG, lossless like PNG) are used to reduce size.\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Common Formats & Use Cases:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"JPEG (.jpg, .jpeg):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Best for photographs and images with continuous tones. Uses \", \"type\": \"text\"}, {\"text\": \"lossy compression\", \"type\": \"text\", \"marks\": [{\"type\": \"italic\"}]}, {\"text\": \", meaning some data is discarded to reduce file size, leading to quality loss at high compression levels.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"PNG (.png):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Supports transparency and is excellent for web graphics, logos, and images requiring sharp edges or transparency. Uses \", \"type\": \"text\"}, {\"text\": \"lossless compression\", \"type\": \"text\", \"marks\": [{\"type\": \"italic\"}]}, {\"text\": \", preserving image quality.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"GIF (.gif):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Supports animation and transparency, but is limited to 256 colors. Best for simple animations, small icons, and low-color graphics. Uses \", \"type\": \"text\"}, {\"text\": \"lossless compression\", \"type\": \"text\", \"marks\": [{\"type\": \"italic\"}]}, {\"text\": \".\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Proper Use:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Use raster images for photos, detailed backgrounds, or any image where rich color depth and subtle transitions are paramount, but be mindful of resolution and file size.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Vector Images\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Vector images are created using mathematical paths, points, and curves. Instead of pixels, they define shapes, lines, and colors through algorithms.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Key Features:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Path-Based:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Defined by mathematical equations.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Resolution-Independent:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Can be scaled to any size without loss of quality, as the software redraws the image based on its mathematical definitions. This makes them perfectly sharp on any screen resolution.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Clean & Crisp:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Ideal for logos, icons, illustrations, and typography where scalability and sharp edges are critical.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Smaller File Sizes:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Often smaller than raster images for simple graphics, as they store instructions rather than pixel data.\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Common Formats & Use Cases:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"SVG (.svg):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Scalable Vector Graphics. An XML-based vector image format for two-dimensional graphics with support for interactivity and animation. Widely used on the web.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"AI (.ai):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Adobe Illustrator Document. Proprietary format for vector graphics created with Adobe Illustrator.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"EPS (.eps):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Encapsulated PostScript. An older vector graphics file format.\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Proper Use:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Use vector images for logos, icons, illustrations, charts, and any graphic that needs to maintain crispness and quality across various screen sizes and resolutions, such as responsive web designs.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Raster vs. Vector: A Quick Comparison\", \"type\": \"text\"}]}, {\"type\": \"blockquote\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Raster:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Best for photos, complex textures, resolution-dependent, pixelation if scaled up too much (e.g., JPEG, PNG).\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Vector:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Best for logos, icons, illustrations, resolution-independent, scales perfectly (e.g., SVG, AI).\", \"type\": \"text\"}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Conclusion\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Mastering graphic design principles like contrast, balance, and hierarchy empowers you to create intuitive and visually appealing user interfaces. Simultaneously, a clear understanding of digital image formats—raster for rich detail and vector for crisp scalability—ensures your designs are performant and visually sharp on any device. Apply these foundational concepts as you develop your GUI projects to build professional and effective applications.\", \"type\": \"text\"}]}]}','<h2>Introduction to GUI Design Foundations</h2><p>Welcome to Week 2 of Graphic User Interface Design! This week, we dive into the fundamental principles that govern effective visual communication and the crucial role of digital image formats in building compelling GUIs. Understanding these concepts is essential for creating user interfaces that are not only aesthetically pleasing but also highly functional and user-friendly.</p><h2>I. Core Graphic Design Principles</h2><p>Effective GUI design isn\'t just about making things look good; it\'s about guiding the user, communicating clearly, and creating an intuitive experience. This is achieved by applying core graphic design principles.</p><h3>Contrast</h3><p><strong>Definition:</strong> Contrast refers to the difference between two or more elements in a design. This difference can manifest in various ways, such as color, size, shape, texture, typography, or spacing.</p><p><strong>Purpose:</strong></p><ul><li><p><strong>Draw Attention:</strong> Highlight important elements.</p></li><li><p><strong>Create Hierarchy:</strong> Distinguish between primary and secondary information.</p></li><li><p><strong>Improve Readability:</strong> Ensure text is easily discernible from its background.</p></li></ul><p><strong>Example:</strong> In a login screen, a bright, prominent \"Login\" button stands out against a subdued background. Similarly, using a large, bold font for a main heading compared to a smaller, lighter font for body text creates strong visual contrast.</p><h3>Balance</h3><p><strong>Definition:</strong> Balance in design is the distribution of visual weight within a composition. It gives a sense of stability and structure to your layout.</p><p><strong>Types of Balance:</strong></p><ul><li><p><strong>Symmetrical Balance:</strong> Elements are equally distributed on either side of a central axis, creating a formal and stable feel (e.g., mirroring elements).</p></li><li><p><strong>Asymmetrical Balance:</strong> Different elements are used on either side of a central axis, but they hold equal visual weight, creating a more dynamic and modern feel (e.g., a large image on one side balanced by several smaller text blocks on the other).</p></li></ul><p><strong>Example:</strong> A navigation bar with evenly spaced menu items demonstrates symmetrical balance. An asymmetrical layout might feature a large image off to one side, balanced by a smaller text block and a compact button group on the opposite side, maintaining overall visual equilibrium.</p><h3>Hierarchy</h3><p><strong>Definition:</strong> Visual hierarchy is the arrangement of design elements to indicate their order of importance. It guides the user\'s eye through the interface, ensuring they encounter information in a logical sequence.</p><p><strong>Methods to Establish Hierarchy:</strong></p><ul><li><p><strong>Size:</strong> Larger elements are perceived as more important.</p></li><li><p><strong>Color &amp; Contrast:</strong> Bright, saturated colors or high-contrast elements draw attention.</p></li><li><p><strong>Placement:</strong> Elements at the top or center often receive more focus.</p></li><li><p><strong>Typography:</strong> Using different font sizes, weights (bold/light), and styles (serif/sans-serif) to differentiate information.</p></li></ul><p><strong>Example:</strong> On a product page, the product name might be an</p><h2>, the price a bolded</h2><p>tag, and the \"Add to Cart\" button a distinct color and size. This establishes a clear reading order and emphasizes key actions.</p><h2>II. Digital Image Formats: Raster vs. Vector</h2><p>Understanding the fundamental differences between digital image formats is crucial for optimizing your GUI for performance and visual quality. Choosing the right format depends on the type of image and its intended use.</p><h3>Raster Images</h3><p><strong>Definition:</strong> Raster images, also known as bitmap images, are composed of a grid of tiny individual pixels (picture elements). Each pixel holds specific color and location information.</p><p><strong>Key Features:</strong></p><ul><li><p><strong>Pixel-Based:</strong> Built from a finite number of colored squares.</p></li><li><p><strong>Resolution-Dependent:</strong> The quality of the image is tied to its resolution (pixels per inch/PPI). Scaling raster images up too much can lead to pixelation and blurriness.</p></li><li><p><strong>Rich Detail:</strong> Excellent for photographs and complex images with subtle color gradients and textures.</p></li><li><p><strong>File Size:</strong> Can be large, especially for high-resolution images. Compression techniques (lossy like JPEG, lossless like PNG) are used to reduce size.</p></li></ul><p><strong>Common Formats &amp; Use Cases:</strong></p><ul><li><p><strong>JPEG (.jpg, .jpeg):</strong> Best for photographs and images with continuous tones. Uses <em>lossy compression</em>, meaning some data is discarded to reduce file size, leading to quality loss at high compression levels.</p></li><li><p><strong>PNG (.png):</strong> Supports transparency and is excellent for web graphics, logos, and images requiring sharp edges or transparency. Uses <em>lossless compression</em>, preserving image quality.</p></li><li><p><strong>GIF (.gif):</strong> Supports animation and transparency, but is limited to 256 colors. Best for simple animations, small icons, and low-color graphics. Uses <em>lossless compression</em>.</p></li></ul><p><strong>Proper Use:</strong> Use raster images for photos, detailed backgrounds, or any image where rich color depth and subtle transitions are paramount, but be mindful of resolution and file size.</p><h3>Vector Images</h3><p><strong>Definition:</strong> Vector images are created using mathematical paths, points, and curves. Instead of pixels, they define shapes, lines, and colors through algorithms.</p><p><strong>Key Features:</strong></p><ul><li><p><strong>Path-Based:</strong> Defined by mathematical equations.</p></li><li><p><strong>Resolution-Independent:</strong> Can be scaled to any size without loss of quality, as the software redraws the image based on its mathematical definitions. This makes them perfectly sharp on any screen resolution.</p></li><li><p><strong>Clean &amp; Crisp:</strong> Ideal for logos, icons, illustrations, and typography where scalability and sharp edges are critical.</p></li><li><p><strong>Smaller File Sizes:</strong> Often smaller than raster images for simple graphics, as they store instructions rather than pixel data.</p></li></ul><p><strong>Common Formats &amp; Use Cases:</strong></p><ul><li><p><strong>SVG (.svg):</strong> Scalable Vector Graphics. An XML-based vector image format for two-dimensional graphics with support for interactivity and animation. Widely used on the web.</p></li><li><p><strong>AI (.ai):</strong> Adobe Illustrator Document. Proprietary format for vector graphics created with Adobe Illustrator.</p></li><li><p><strong>EPS (.eps):</strong> Encapsulated PostScript. An older vector graphics file format.</p></li></ul><p><strong>Proper Use:</strong> Use vector images for logos, icons, illustrations, charts, and any graphic that needs to maintain crispness and quality across various screen sizes and resolutions, such as responsive web designs.</p><h3>Raster vs. Vector: A Quick Comparison</h3><blockquote><p><strong>Raster:</strong> Best for photos, complex textures, resolution-dependent, pixelation if scaled up too much (e.g., JPEG, PNG).</p><p><strong>Vector:</strong> Best for logos, icons, illustrations, resolution-independent, scales perfectly (e.g., SVG, AI).</p></blockquote><h2>Conclusion</h2><p>Mastering graphic design principles like contrast, balance, and hierarchy empowers you to create intuitive and visually appealing user interfaces. Simultaneously, a clear understanding of digital image formats—raster for rich detail and vector for crisp scalability—ensures your designs are performant and visually sharp on any device. Apply these foundational concepts as you develop your GUI projects to build professional and effective applications.</p>','PUBLISHED','AI_GENERATED','2026-08-06 22:20:20','2026-08-08 11:21:39'),(79,15,8,41,165,7,'Vector Graphics Fundamentals & Adobe Illustrator Basics','{\"type\": \"doc\", \"content\": [{\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Understanding Vector Graphics\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Vector graphics are digital images that use mathematical equations to represent images as points, lines, curves, and shapes. Unlike raster graphics (pixel-based images), vectors are defined by geometric properties rather than a grid of colored pixels.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The key characteristic of vector graphics is their **scalability**. Because they are based on mathematical descriptions, vector images can be scaled up or down to any size without losing quality or becoming pixelated. This makes them ideal for logos, illustrations, and any design element that needs to be used across various mediums and sizes, from a small business card to a large billboard.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"To put it simply, imagine drawing a perfect circle. In a vector program like Adobe Illustrator, the circle is described mathematically (e.g., center point, radius). You can make it as big or small as you want, and it will always remain a perfect, smooth circle. In contrast, a raster image (like those edited in **Adobe Photoshop**) would describe that circle as a collection of individual colored squares (pixels), which would become blurry and jagged if significantly enlarged.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"What is Adobe Illustrator?\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Adobe Illustrator is the industry-standard software for creating and editing vector graphics. It is a powerful tool designed for graphic designers, illustrators, and artists to produce high-quality, scalable artwork.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Its core functionality revolves around creating vector paths, shapes, and text that can be infinitely scaled without loss of resolution. Illustrator is widely used for:\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**\", \"type\": \"text\"}, {\"text\": \"Logo Design\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \"**: Creating distinctive and versatile brand marks.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**\", \"type\": \"text\"}, {\"text\": \"Iconography\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \"**: Designing clear and scalable icons for web and app interfaces.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**\", \"type\": \"text\"}, {\"text\": \"Illustrations\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \"**: Crafting detailed artwork, from simple cartoons to complex technical diagrams.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**\", \"type\": \"text\"}, {\"text\": \"Typography\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \"**: Designing custom fonts and manipulating text for various design projects.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Core Concepts in Illustrator\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Paths, Anchor Points, and Handles\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"At the heart of Illustrator are **paths**. A path is a line or outline that defines the shape of an object. Paths are made up of one or more **anchor points**, which are points that define where a path changes direction or curvature. Each anchor point can have **direction handles** (also called Bezier handles) that control the curvature of the path segments connected to that anchor point. Understanding these three elements is crucial for precise drawing.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Artboards\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"An **Artboard** in Illustrator is essentially your digital canvas. It represents the printable or exportable area of your artwork. An Illustrator document can contain multiple artboards, allowing you to create different versions of a design, multiple pages, or various design elements within a single file.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Layers\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Like many design applications, Illustrator uses **layers** to organize artwork. Layers are like transparent sheets stacked on top of each other. Objects on higher layers appear in front of objects on lower layers. Using layers helps manage complex designs, allows you to hide or lock specific elements, and facilitates non-destructive editing.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Essential Tools for Creating Shapes\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Basic Shape Tools\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Illustrator provides a suite of tools for quickly creating common geometric shapes:\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Rectangle Tool (M)**: Draws squares and rectangles.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Ellipse Tool (L)**: Draws circles and ovals.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Polygon Tool**: Creates polygons with a specified number of sides (e.g., triangles, hexagons).\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Star Tool**: Draws stars with adjustable points and inner/outer radii.\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"You can hold down the Shift key while drawing with most shape tools to constrain proportions (e.g., a perfect square or circle).\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"The Pen Tool (P)\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The **Pen Tool** is one of the most powerful and fundamental tools in Illustrator for creating precise, custom vector paths. It allows you to draw straight lines, smooth curves, and combine both to create complex shapes. Mastering the Pen Tool is key to drawing anything from intricate illustrations to custom logos.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"You create paths with the Pen Tool by clicking to create anchor points. Clicking creates a corner point (straight line segments), while clicking and dragging creates a smooth point with direction handles (curved segments).\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Essential Tools for Manipulating Shapes\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Selection Tools\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Selection Tool (V)**: This is your primary tool for selecting entire objects (paths, shapes, text frames). You can use it to move, scale, rotate, and generally transform whole objects.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Direct Selection Tool (A)**: This tool allows you to select and manipulate individual anchor points and path segments within an object. This is essential for fine-tuning the shape of a path or adjusting curves.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Basic Transformations\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Once you have created shapes, you will often need to modify their size, orientation, or position. The Selection Tool allows you to perform basic transformations directly:\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Scaling**: Dragging a corner of a selected object\'s bounding box to resize it. Hold Shift to constrain proportions.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Rotating**: Hovering your cursor just outside a corner of the bounding box until a curved arrow appears, then dragging to rotate.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"**Reflecting (Flipping)**: While not directly on the bounding box, the Reflect Tool allows you to flip objects horizontally or vertically.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Conclusion\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"This week, we\'ve laid the groundwork for understanding vector graphics and introduced you to the core functionality of Adobe Illustrator. You should now be able to describe what vector graphics are, appreciate Illustrator\'s role as a powerful vector editor, and begin using its basic tools to create and manipulate fundamental shapes. Competently using the shape tools, Pen Tool, and selection tools are crucial steps towards developing your graphic user interface design skills.\", \"type\": \"text\"}]}]}','<h2>Understanding Vector Graphics</h2><p>Vector graphics are digital images that use mathematical equations to represent images as points, lines, curves, and shapes. Unlike raster graphics (pixel-based images), vectors are defined by geometric properties rather than a grid of colored pixels.</p><p>The key characteristic of vector graphics is their **scalability**. Because they are based on mathematical descriptions, vector images can be scaled up or down to any size without losing quality or becoming pixelated. This makes them ideal for logos, illustrations, and any design element that needs to be used across various mediums and sizes, from a small business card to a large billboard.</p><p>To put it simply, imagine drawing a perfect circle. In a vector program like Adobe Illustrator, the circle is described mathematically (e.g., center point, radius). You can make it as big or small as you want, and it will always remain a perfect, smooth circle. In contrast, a raster image (like those edited in **Adobe Photoshop**) would describe that circle as a collection of individual colored squares (pixels), which would become blurry and jagged if significantly enlarged.</p><h2>What is Adobe Illustrator?</h2><p>Adobe Illustrator is the industry-standard software for creating and editing vector graphics. It is a powerful tool designed for graphic designers, illustrators, and artists to produce high-quality, scalable artwork.</p><p>Its core functionality revolves around creating vector paths, shapes, and text that can be infinitely scaled without loss of resolution. Illustrator is widely used for:</p><ul><li><p>**<strong>Logo Design</strong>**: Creating distinctive and versatile brand marks.</p></li><li><p>**<strong>Iconography</strong>**: Designing clear and scalable icons for web and app interfaces.</p></li><li><p>**<strong>Illustrations</strong>**: Crafting detailed artwork, from simple cartoons to complex technical diagrams.</p></li><li><p>**<strong>Typography</strong>**: Designing custom fonts and manipulating text for various design projects.</p></li></ul><h2>Core Concepts in Illustrator</h2><h3>Paths, Anchor Points, and Handles</h3><p>At the heart of Illustrator are **paths**. A path is a line or outline that defines the shape of an object. Paths are made up of one or more **anchor points**, which are points that define where a path changes direction or curvature. Each anchor point can have **direction handles** (also called Bezier handles) that control the curvature of the path segments connected to that anchor point. Understanding these three elements is crucial for precise drawing.</p><h3>Artboards</h3><p>An **Artboard** in Illustrator is essentially your digital canvas. It represents the printable or exportable area of your artwork. An Illustrator document can contain multiple artboards, allowing you to create different versions of a design, multiple pages, or various design elements within a single file.</p><h3>Layers</h3><p>Like many design applications, Illustrator uses **layers** to organize artwork. Layers are like transparent sheets stacked on top of each other. Objects on higher layers appear in front of objects on lower layers. Using layers helps manage complex designs, allows you to hide or lock specific elements, and facilitates non-destructive editing.</p><h2>Essential Tools for Creating Shapes</h2><h3>Basic Shape Tools</h3><p>Illustrator provides a suite of tools for quickly creating common geometric shapes:</p><ul><li><p>**Rectangle Tool (M)**: Draws squares and rectangles.</p></li><li><p>**Ellipse Tool (L)**: Draws circles and ovals.</p></li><li><p>**Polygon Tool**: Creates polygons with a specified number of sides (e.g., triangles, hexagons).</p></li><li><p>**Star Tool**: Draws stars with adjustable points and inner/outer radii.</p></li></ul><p>You can hold down the Shift key while drawing with most shape tools to constrain proportions (e.g., a perfect square or circle).</p><h3>The Pen Tool (P)</h3><p>The **Pen Tool** is one of the most powerful and fundamental tools in Illustrator for creating precise, custom vector paths. It allows you to draw straight lines, smooth curves, and combine both to create complex shapes. Mastering the Pen Tool is key to drawing anything from intricate illustrations to custom logos.</p><p>You create paths with the Pen Tool by clicking to create anchor points. Clicking creates a corner point (straight line segments), while clicking and dragging creates a smooth point with direction handles (curved segments).</p><h2>Essential Tools for Manipulating Shapes</h2><h3>Selection Tools</h3><ul><li><p>**Selection Tool (V)**: This is your primary tool for selecting entire objects (paths, shapes, text frames). You can use it to move, scale, rotate, and generally transform whole objects.</p></li><li><p>**Direct Selection Tool (A)**: This tool allows you to select and manipulate individual anchor points and path segments within an object. This is essential for fine-tuning the shape of a path or adjusting curves.</p></li></ul><h3>Basic Transformations</h3><p>Once you have created shapes, you will often need to modify their size, orientation, or position. The Selection Tool allows you to perform basic transformations directly:</p><ul><li><p>**Scaling**: Dragging a corner of a selected object\'s bounding box to resize it. Hold Shift to constrain proportions.</p></li><li><p>**Rotating**: Hovering your cursor just outside a corner of the bounding box until a curved arrow appears, then dragging to rotate.</p></li><li><p>**Reflecting (Flipping)**: While not directly on the bounding box, the Reflect Tool allows you to flip objects horizontally or vertically.</p></li></ul><h2>Conclusion</h2><p>This week, we\'ve laid the groundwork for understanding vector graphics and introduced you to the core functionality of Adobe Illustrator. You should now be able to describe what vector graphics are, appreciate Illustrator\'s role as a powerful vector editor, and begin using its basic tools to create and manipulate fundamental shapes. Competently using the shape tools, Pen Tool, and selection tools are crucial steps towards developing your graphic user interface design skills.</p>','PUBLISHED','AI_GENERATED','2026-08-08 13:02:55','2026-08-08 15:34:48'),(81,15,8,41,163,7,'Graphic Design Fundamentals: Core Concepts & Elements','{\"type\": \"doc\", \"content\": [{\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Introduction to Graphic Design & Core Concepts\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Welcome to Week 1 of Graphic User Interface Design! This week, we lay the foundation for understanding how visual elements communicate effectively. Graphic design is more than just making things look pretty; it\'s about solving problems and conveying messages clearly and efficiently through visual means.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Core Concepts of Graphic Design\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"These principles guide designers in arranging elements to create visually appealing and functional layouts. Understanding them is crucial for effective visual communication.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Visual Communication\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The process of conveying ideas and information through visual elements, such as images, typography, and symbols.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" In GUI design, it ensures users can quickly understand an interface, find what they need, and interact with the system intuitively.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Hierarchy\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The arrangement of elements to show their order of importance. Larger, bolder, or more prominent elements grab attention first.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Example:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" A prominent \\\"Submit\\\" button and smaller, lighter text for \\\"Cancel\\\" establish a clear hierarchy of actions.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Balance\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The distribution of visual weight within a composition. It creates a sense of stability and harmony.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Types:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Symmetrical Balance:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Elements are mirrored on either side of a central axis, creating formality and stability.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Asymmetrical Balance:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Achieved with dissimilar elements that have equal visual weight, often creating dynamic and modern designs.\", \"type\": \"text\"}]}]}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Contrast\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The difference between two or more elements. It is used to create visual interest, emphasize elements, and improve readability.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Examples:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Light text on a dark background, large type next to small type, or a brightly colored button against a muted background.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Repetition\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The consistent use of design elements throughout a composition. It creates unity, strengthens a design, and establishes familiarity.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Ensures a consistent look and feel across different screens or components in a UI, aiding user navigation and recognition.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Proximity\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The relationship between how close or far apart elements are placed. Elements that are close together are perceived as related.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Example:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Grouping a label directly above its input field tells the user they belong together.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Alignment\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Arranging elements in a way that creates a clean, organized, and intentional design. It helps create order and readability.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Example:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Left-aligning all text within a column makes it easier to read than scattered text.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Space (Negative Space)\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The empty areas around and between elements. It helps define and separate elements, guiding the eye and reducing clutter.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Essential in GUI design for readability, user comfort, and drawing attention to key interactive elements.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Elements of Graphic Design\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"These are the building blocks that designers use to create any visual composition.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Line\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" A mark made by a moving point. It can be straight, curved, thick, thin, dashed, or solid.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Defines shapes, divides space, creates emphasis, and guides the eye.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Shape\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" A two-dimensional area defined by lines, color, or value. Shapes can be geometric (squares, circles) or organic (free-form).\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Organizes content, creates visual interest, and forms icons or buttons.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Form\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" A three-dimensional object, or the illusion of three dimensions created through shading and perspective.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Adds depth and realism, often used in icons or interactive elements that appear tactile.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Color\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The property of light that is reflected or emitted by an object. It evokes emotions, creates mood, and provides contrast.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Establishes brand identity, indicates status (e.g., red for error, green for success), and improves visual hierarchy.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Texture\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The perceived surface quality of an object. It can be real (rough paper) or implied (a visual pattern that suggests roughness).\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Adds depth and tactile appeal, though often used subtly in digital interfaces.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Type (Typography)\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The art and technique of arranging type to make written language legible, readable, and appealing.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Essential for conveying textual information, establishing brand voice, and guiding user interaction (e.g., button labels).\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"Value (Lightness/Darkness)\", \"type\": \"text\"}]}, {\"type\": \"bulletList\", \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Definition:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" The relative lightness or darkness of a color or tone.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Role:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" Creates contrast, defines shapes, and adds depth and dimension to a design. It\'s crucial for readability, especially with text.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Role in Visual Communication\", \"type\": \"text\"}]}, {\"type\": \"blockquote\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Understanding these core concepts and elements allows designers to craft messages that are not only aesthetically pleasing but also highly effective and functional. By consciously applying hierarchy, contrast, balance, and using lines, shapes, and colors deliberately, we can create user interfaces that are intuitive, engaging, and easy to use. This forms the bedrock of good GUI design.\", \"type\": \"text\"}]}]}]}','<h2>Introduction to Graphic Design &amp; Core Concepts</h2><p>Welcome to Week 1 of Graphic User Interface Design! This week, we lay the foundation for understanding how visual elements communicate effectively. Graphic design is more than just making things look pretty; it\'s about solving problems and conveying messages clearly and efficiently through visual means.</p><h2>Core Concepts of Graphic Design</h2><p>These principles guide designers in arranging elements to create visually appealing and functional layouts. Understanding them is crucial for effective visual communication.</p><h3>Visual Communication</h3><ul><li><p><strong>Definition:</strong> The process of conveying ideas and information through visual elements, such as images, typography, and symbols.</p></li><li><p><strong>Role:</strong> In GUI design, it ensures users can quickly understand an interface, find what they need, and interact with the system intuitively.</p></li></ul><h3>Hierarchy</h3><ul><li><p><strong>Definition:</strong> The arrangement of elements to show their order of importance. Larger, bolder, or more prominent elements grab attention first.</p></li><li><p><strong>Example:</strong> A prominent \"Submit\" button and smaller, lighter text for \"Cancel\" establish a clear hierarchy of actions.</p></li></ul><h3>Balance</h3><ul><li><p><strong>Definition:</strong> The distribution of visual weight within a composition. It creates a sense of stability and harmony.</p></li><li><p><strong>Types:</strong></p><ul><li><p><strong>Symmetrical Balance:</strong> Elements are mirrored on either side of a central axis, creating formality and stability.</p></li><li><p><strong>Asymmetrical Balance:</strong> Achieved with dissimilar elements that have equal visual weight, often creating dynamic and modern designs.</p></li></ul></li></ul><h3>Contrast</h3><ul><li><p><strong>Definition:</strong> The difference between two or more elements. It is used to create visual interest, emphasize elements, and improve readability.</p></li><li><p><strong>Examples:</strong> Light text on a dark background, large type next to small type, or a brightly colored button against a muted background.</p></li></ul><h3>Repetition</h3><ul><li><p><strong>Definition:</strong> The consistent use of design elements throughout a composition. It creates unity, strengthens a design, and establishes familiarity.</p></li><li><p><strong>Role:</strong> Ensures a consistent look and feel across different screens or components in a UI, aiding user navigation and recognition.</p></li></ul><h3>Proximity</h3><ul><li><p><strong>Definition:</strong> The relationship between how close or far apart elements are placed. Elements that are close together are perceived as related.</p></li><li><p><strong>Example:</strong> Grouping a label directly above its input field tells the user they belong together.</p></li></ul><h3>Alignment</h3><ul><li><p><strong>Definition:</strong> Arranging elements in a way that creates a clean, organized, and intentional design. It helps create order and readability.</p></li><li><p><strong>Example:</strong> Left-aligning all text within a column makes it easier to read than scattered text.</p></li></ul><h3>Space (Negative Space)</h3><ul><li><p><strong>Definition:</strong> The empty areas around and between elements. It helps define and separate elements, guiding the eye and reducing clutter.</p></li><li><p><strong>Role:</strong> Essential in GUI design for readability, user comfort, and drawing attention to key interactive elements.</p></li></ul><h2>Elements of Graphic Design</h2><p>These are the building blocks that designers use to create any visual composition.</p><h3>Line</h3><ul><li><p><strong>Definition:</strong> A mark made by a moving point. It can be straight, curved, thick, thin, dashed, or solid.</p></li><li><p><strong>Role:</strong> Defines shapes, divides space, creates emphasis, and guides the eye.</p></li></ul><h3>Shape</h3><ul><li><p><strong>Definition:</strong> A two-dimensional area defined by lines, color, or value. Shapes can be geometric (squares, circles) or organic (free-form).</p></li><li><p><strong>Role:</strong> Organizes content, creates visual interest, and forms icons or buttons.</p></li></ul><h3>Form</h3><ul><li><p><strong>Definition:</strong> A three-dimensional object, or the illusion of three dimensions created through shading and perspective.</p></li><li><p><strong>Role:</strong> Adds depth and realism, often used in icons or interactive elements that appear tactile.</p></li></ul><h3>Color</h3><ul><li><p><strong>Definition:</strong> The property of light that is reflected or emitted by an object. It evokes emotions, creates mood, and provides contrast.</p></li><li><p><strong>Role:</strong> Establishes brand identity, indicates status (e.g., red for error, green for success), and improves visual hierarchy.</p></li></ul><h3>Texture</h3><ul><li><p><strong>Definition:</strong> The perceived surface quality of an object. It can be real (rough paper) or implied (a visual pattern that suggests roughness).</p></li><li><p><strong>Role:</strong> Adds depth and tactile appeal, though often used subtly in digital interfaces.</p></li></ul><h3>Type (Typography)</h3><ul><li><p><strong>Definition:</strong> The art and technique of arranging type to make written language legible, readable, and appealing.</p></li><li><p><strong>Role:</strong> Essential for conveying textual information, establishing brand voice, and guiding user interaction (e.g., button labels).</p></li></ul><h3>Value (Lightness/Darkness)</h3><ul><li><p><strong>Definition:</strong> The relative lightness or darkness of a color or tone.</p></li><li><p><strong>Role:</strong> Creates contrast, defines shapes, and adds depth and dimension to a design. It\'s crucial for readability, especially with text.</p></li></ul><h2>Role in Visual Communication</h2><blockquote><p>Understanding these core concepts and elements allows designers to craft messages that are not only aesthetically pleasing but also highly effective and functional. By consciously applying hierarchy, contrast, balance, and using lines, shapes, and colors deliberately, we can create user interfaces that are intuitive, engaging, and easy to use. This forms the bedrock of good GUI design.</p></blockquote>','PUBLISHED','AI_GENERATED','2026-08-08 15:31:46','2026-08-08 13:35:48'),(83,15,8,41,166,7,'Digital Sketching & Advanced Vector Techniques in Illustrator','{\"type\": \"doc\", \"content\": [{\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Introduction to Digital Sketching and Advanced Vector Techniques\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Welcome to Week 4 of Graphic User Interface Design! This week, we dive into the exciting world of digital sketching and advanced vector techniques using Adobe Illustrator. Understanding these skills is crucial for anyone creating visual interfaces, as they provide the foundation for scalable, clean, and professional artwork. We will learn how to transform initial ideas into polished digital sketches and refine existing vector art. This involves mastering key tools and concepts like layers, Pathfinder operations, and gradient applications, which are essential for creating complex shapes and adding depth to your designs. By the end of this module, you will be able to apply these techniques to create original digital sketches and refine vector artwork with precision, directly addressing the performance criteria of properly drawing a digital sketch and effectively using Adobe Illustrator and Photoshop in your workflow.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Section 1: Foundations of Digital Sketching\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"1.1 What is Digital Sketching?\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Digital sketching\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" is the process of creating drawings or illustrations using digital tools, typically a computer and a graphics tablet, instead of traditional pen and paper. While traditional sketching focuses on quick visual ideas and rough compositions, digital sketching allows for greater precision, flexibility, and the ability to easily edit and refine your work. It bridges the gap between raw ideas and finished digital artwork, serving as a vital step in the GUI design process.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Think of digital sketching as an evolution of traditional drawing. Instead of pencils, you use digital brushes; instead of paper, you draw on a digital canvas. The benefits are numerous: infinite undo/redo options, non-destructive editing (meaning you can make changes without permanently altering the original), easy color experimentation, and the ability to integrate seamlessly with other digital design tools. For GUI designers, this means you can quickly iterate on interface elements, buttons, icons, and even full screen layouts without having to redraw from scratch every time you want to make a small change.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"A key advantage is the ability to work with different forms of graphics, specifically vector and raster. This week, our focus will be primarily on vector graphics, which offer unique benefits for GUI elements like logos, icons, and scalable interface components. Digital sketching in a vector environment means that every line, shape, and curve you create is mathematically defined, leading to unparalleled precision and scalability.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"1.2 Why Vectors for Sketching?\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"To understand why vectors are so important for digital sketching, especially in GUI design, we need to first differentiate between two main types of digital graphics: vector and raster.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Vector graphics\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" are images built from mathematical formulas that define points, lines, curves, and shapes. These elements are called paths. Because they are defined mathematically, vector graphics can be scaled to any size without losing quality or becoming pixelated. Imagine drawing a perfect circle: in vector graphics, the computer remembers the mathematical equation for that circle, not just a grid of colored dots. When you make it bigger, the computer simply recalculates the equation for a larger circle.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Raster graphics\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \", on the other hand, are composed of a grid of tiny colored squares called pixels. Photographs are the most common example of raster graphics. When you zoom in on a raster image, you start to see these individual pixels, and the image can appear blurry or pixelated. This loss of quality when scaling is a major drawback for elements that need to appear sharp at various sizes, like logos or icons on different screen resolutions.\", \"type\": \"text\"}]}, {\"type\": \"blockquote\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Suggested visual: A side-by-side comparison illustrating a vector circle scaled up (remaining smooth) and a raster circle scaled up (showing pixelation).\", \"type\": \"text\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"For GUI design, the scalability of vector graphics is paramount. An icon needs to look crisp on a tiny mobile screen as well as a large 4K monitor. A logo must appear sharp on a small app button and a massive billboard. Vector graphics, created in programs like Adobe Illustrator, ensure this quality. They also result in smaller file sizes for simple graphics and are easier to edit and refine, making them ideal for the iterative nature of design.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Adobe Illustrator\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}, {\"text\": \" is the industry standard software for creating and editing vector graphics. It provides a comprehensive set of tools specifically designed for drawing, coloring, and manipulating vector paths and shapes. This week, we will focus heavily on using Illustrator to harness the power of vector art for our digital sketches.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"1.3 Setting Up Your Workspace in Illustrator\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Before we dive into creating, it\'s helpful to understand the basic layout of Adobe Illustrator. When you open Illustrator, you\'ll see a main canvas area, surrounded by various panels and toolbars. Familiarizing yourself with these components will make your workflow much smoother.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The central area is your **Artboard**, which is your digital canvas where you create your artwork. You can have multiple artboards in a single Illustrator document, useful for designing different elements or variations of a design. On the left side, you\'ll find the **Tools panel**, which contains all the drawing, selection, and manipulation tools. On the right, you\'ll see various **Panels**, such as Layers, Properties, Pathfinder, Gradient, Color, and Swatches. These panels provide options and controls for the selected tools and objects.\", \"type\": \"text\"}]}, {\"type\": \"blockquote\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Suggested visual: A labeled screenshot of the default Adobe Illustrator workspace, highlighting the Artboard, Tools panel, and common panels like Layers and Properties.\", \"type\": \"text\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"For efficient digital sketching, consider setting up a custom workspace. You can rearrange panels, dock them, or leave them floating. A common setup involves having the Layers, Pathfinder, and Properties panels easily accessible, as we will be using them frequently this week. You can save your preferred layout by going to \", \"type\": \"text\"}, {\"text\": \"Window > Workspace > New Workspace...\", \"type\": \"text\", \"marks\": [{\"type\": \"code\"}]}, {\"text\": \" This ensures that your most-used tools and panels are always at your fingertips, streamlining your creative process.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"To start a new document for sketching, go to \", \"type\": \"text\"}, {\"text\": \"File > New...\", \"type\": \"text\", \"marks\": [{\"type\": \"code\"}]}, {\"text\": \". Choose a suitable size for your artboard, perhaps a common screen resolution like 1920x1080 pixels, or a generic print size if you prefer. Ensure the \'Color Mode\' is set to RGB for screen-based GUI design, as CMYK is primarily for print.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Section 2: Basic Vector Tools for Sketching\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Before we tackle advanced techniques, let\'s review some fundamental vector tools in Illustrator that form the bedrock of digital sketching. Mastering these tools is crucial for precise and efficient vector artwork creation.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"2.1 The Pen Tool\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The **Pen Tool** (P) is arguably the most powerful and precise drawing tool in Illustrator. It allows you to create custom shapes and paths with incredible accuracy by placing points, called **anchor points**, and defining the curves between them. Understanding how to use the Pen Tool effectively is foundational to advanced vector design.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"A **path** is a line segment, and it is defined by at least two anchor points. These paths can be open (like a line) or closed (like a circle or square). The segments between anchor points are called **path segments**. When you create curved paths, the Pen Tool uses **handles**, also known as direction lines, which extend from anchor points and control the shape and direction of the curve.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 4, \"textAlign\": null}, \"content\": [{\"text\": \"Step-by-Step: Using the Pen Tool\", \"type\": \"text\"}]}, {\"type\": \"orderedList\", \"attrs\": {\"type\": null, \"start\": 1}, \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Drawing Straight Lines:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Select the Pen Tool (P) from the Tools panel. Click once on the artboard to create your first anchor point. Move your mouse and click again to create a second anchor point. Illustrator will draw a straight line segment between these two points. Continue clicking to add more straight segments. To stop drawing the path, press the Escape key or select another tool.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Drawing Smooth Curves:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Select the Pen Tool. Click and drag (don\'t just click) to create your first anchor point with handles. The direction you drag determines the initial curve. Release the mouse button. Now, move to where you want the next anchor point, click and drag again. As you drag, you\'ll see the curve adjust. The length and angle of the handles control the arc of the curve. To make a smooth curve, ensure the handles are aligned. Release the mouse button.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Creating Corner Points (Sharp Turns):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"After creating an anchor point with handles (a smooth point), you might want to make a sharp turn or corner. To do this, while still having the Pen Tool selected, click on the last anchor point you created. This will retract one of its handles, allowing the next segment to be a sharp corner. Now, click and drag to create a new anchor point with handles for a new curve, or simply click for a straight line. This technique lets you combine smooth curves and sharp corners in a single path.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Closing a Path:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"To create a closed shape (like a complete circle or a custom polygon), move the Pen Tool cursor over your very first anchor point. A small circle will appear next to the Pen Tool icon, indicating that clicking will close the path. Click the first anchor point to connect the last segment to the first, forming a complete shape.\", \"type\": \"text\"}]}]}]}, {\"type\": \"blockquote\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Suggested visual: A series of small diagrams illustrating each step of using the Pen Tool: drawing straight lines, drawing curves, creating a corner point in a curved path, and closing a path.\", \"type\": \"text\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Practice is key with the Pen Tool. It can feel a bit challenging at first, but with repeated use, it becomes intuitive and allows for unparalleled control over your vector artwork.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"2.2 Shape Tools\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"While the Pen Tool offers ultimate customizability, Illustrator also provides a set of pre-built **Shape Tools** for creating common geometric shapes quickly and accurately. These include the Rectangle Tool, Rounded Rectangle Tool, Ellipse Tool, Polygon Tool, and Star Tool. These tools are excellent starting points for many GUI elements.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 4, \"textAlign\": null}, \"content\": [{\"text\": \"Step-by-Step: Using Shape Tools\", \"type\": \"text\"}]}, {\"type\": \"orderedList\", \"attrs\": {\"type\": null, \"start\": 1}, \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Rectangle Tool (M) and Ellipse Tool (L):\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Select the Rectangle Tool or Ellipse Tool from the Tools panel. Click and drag on the artboard to draw your shape. To draw a perfect square with the Rectangle Tool, or a perfect circle with the Ellipse Tool, hold down the Shift key while dragging. To draw from the center outwards, hold down the Alt (Option on Mac) key while dragging. You can combine Shift + Alt for a perfect shape drawn from its center.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Polygon Tool:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Select the Polygon Tool. Click and drag to draw a polygon. While dragging, you can press the Up Arrow key to add more sides or the Down Arrow key to reduce sides. To draw a perfect, regular polygon, hold down the Shift key. If you simply click on the artboard instead of dragging, a dialog box will appear, allowing you to specify the radius and number of sides numerically.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Modifying Shapes:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Once a shape is drawn, you can easily modify its size, rotation, and other properties using the Selection Tool (black arrow) or by adjusting values in the Properties panel. For example, for a rounded rectangle, the Properties panel allows you to change the corner radius after creation.\", \"type\": \"text\"}]}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"These shape tools are not just for basic forms; they are often the foundation upon which more complex designs are built using techniques like the Pathfinder, which we will cover later.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"2.3 Selection Tools\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"After creating shapes and paths, you need tools to select and manipulate them. Illustrator primarily offers two selection tools, each with a distinct purpose.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The **Selection Tool** (V), also known as the Black Arrow Tool, is used to select entire objects or groups of objects. With this tool, you can move, scale, rotate, and distort whole shapes. When an object is selected, you\'ll see a bounding box around it. Clicking and dragging the corners of the bounding box scales the object; hovering just outside a corner allows you to rotate it.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The **Direct Selection Tool** (A), also known as the White Arrow Tool, is used to select and manipulate individual anchor points and path segments within an object. This tool gives you fine-grained control over the exact shape of your paths. With the Direct Selection Tool, you can click on an anchor point and drag it to reshape a curve or straighten a line. You can also select multiple anchor points to move them together, or adjust the handles of an anchor point to refine a curve.\", \"type\": \"text\"}]}, {\"type\": \"blockquote\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Suggested visual: Two images side-by-side. One shows the Selection Tool active, selecting an entire shape with a bounding box. The other shows the Direct Selection Tool active, selecting and moving a single anchor point on the same shape.\", \"type\": \"text\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Understanding the difference between these two tools is critical. The Selection Tool is for broad adjustments and rearrangements of complete objects, while the Direct Selection Tool is for detailed editing of the path\'s structure. You will frequently switch between them while refining your digital sketches.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 2, \"textAlign\": null}, \"content\": [{\"text\": \"Section 3: Advanced Vector Techniques - Layering and Organization\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"As your digital sketches become more complex, efficient organization becomes paramount. **Layers** and **groups** are fundamental tools in Illustrator for managing your artwork, enabling non-destructive editing and a streamlined workflow.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"3.1 Understanding Layers\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"In digital art, **layers** are like transparent sheets stacked on top of each other. Each sheet can hold different elements of your artwork, allowing you to work on one part of your design without affecting others. Imagine drawing a person: you might put the background on one layer, the clothes on another, and the facial features on a third. This separation offers immense flexibility.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The importance of layers cannot be overstated, especially for complex GUI designs. They enable **non-destructive editing**, meaning you can modify, hide, or delete elements on one layer without altering anything on other layers. This is crucial for iteration and refinement. For instance, you could have a layer for your basic wireframe sketch, another for detailed lines, a third for color fills, and a fourth for annotations. If you decide to change the background color, you only need to edit the background layer, without accidentally selecting or changing your detailed lines.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Layers also help in maintaining a clear and organized document. When working on a large project, a well-structured layer panel can save you hours of searching for specific elements. It allows for easier collaboration with other designers or developers, as the document structure is logical and understandable.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"3.2 Managing Layers in Illustrator\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The **Layers panel** (Window > Layers) is where you control all aspects of your layers. Each document starts with at least one layer. You can create new layers, rename them, reorder them, lock them, hide them, and assign specific objects to them.\", \"type\": \"text\"}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 4, \"textAlign\": null}, \"content\": [{\"text\": \"Step-by-Step: Working with Layers\", \"type\": \"text\"}]}, {\"type\": \"orderedList\", \"attrs\": {\"type\": null, \"start\": 1}, \"content\": [{\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Creating a New Layer:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Open the Layers panel. Click the \'Create New Layer\' icon (a square with a plus sign) at the bottom of the panel. A new layer will appear above the currently selected layer.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Renaming a Layer:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Double-click on the layer\'s name in the Layers panel. Type a descriptive name (e.g., \'Background\', \'Main UI elements\', \'Icons\', \'Text\'). Meaningful names are vital for organization.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Reordering Layers:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Click and drag a layer up or down in the Layers panel to change its stacking order. Layers higher in the panel appear on top of layers lower in the panel in your artwork.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Locking and Hiding Layers:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"To the left of each layer name, there are two small boxes. Click the empty box next to the eye icon to make the eye appear; this hides the layer. Click the eye icon to hide the layer. Click the empty box next to the eye (it will be empty if the layer is not locked) to make a padlock icon appear; this locks the layer, preventing you from accidentally selecting or editing its contents. Click the padlock again to unlock.\", \"type\": \"text\"}]}]}, {\"type\": \"listItem\", \"content\": [{\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Moving Objects Between Layers:\", \"type\": \"text\", \"marks\": [{\"type\": \"bold\"}]}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"Select the object(s) on your artboard that you want to move. In the Layers panel, find the small colored square indicator to the right of the layer name that contains your selected object(s). Drag this colored square up or down to the desired layer. The object will now reside on the new layer.\", \"type\": \"text\"}]}]}]}, {\"type\": \"heading\", \"attrs\": {\"level\": 3, \"textAlign\": null}, \"content\": [{\"text\": \"3.3 Grouping Objects\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"While layers organize broad sections of your artwork, **grouping** allows you to combine multiple objects within a single layer (or across layers, though typically within one for simplicity) so they can be moved, scaled, or manipulated as a single unit. Think of grouping as temporarily sticking pieces together that belong to one logical component.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"For example, if you design a button consisting of a rectangle for the background, text for the label, and a small icon, you would select all three elements and group them (Object > Group, or Ctrl/Cmd + G). Now, when you select any part of that button, the entire button moves or scales together. You can still access individual elements within a group by double-clicking the group to enter isolation mode, or by using the Direct Selection Tool.\", \"type\": \"text\"}]}, {\"type\": \"paragraph\", \"attrs\": {\"textAlign\": null}, \"content\": [{\"text\": \"The difference between layers and groups is one of hierarchy and scope. Layers provide a fundamental structural organization for your entire document, isolating major components of your design. Groups provide a way to manage related elements *within* those layers, treating smaller collections of objects as single units.\", \"type\": \"text\"}]}]}','<h2>Introduction to Digital Sketching and Advanced Vector Techniques</h2><p>Welcome to Week 4 of Graphic User Interface Design! This week, we dive into the exciting world of digital sketching and advanced vector techniques using Adobe Illustrator. Understanding these skills is crucial for anyone creating visual interfaces, as they provide the foundation for scalable, clean, and professional artwork. We will learn how to transform initial ideas into polished digital sketches and refine existing vector art. This involves mastering key tools and concepts like layers, Pathfinder operations, and gradient applications, which are essential for creating complex shapes and adding depth to your designs. By the end of this module, you will be able to apply these techniques to create original digital sketches and refine vector artwork with precision, directly addressing the performance criteria of properly drawing a digital sketch and effectively using Adobe Illustrator and Photoshop in your workflow.</p><h2>Section 1: Foundations of Digital Sketching</h2><h3>1.1 What is Digital Sketching?</h3><p><strong>Digital sketching</strong> is the process of creating drawings or illustrations using digital tools, typically a computer and a graphics tablet, instead of traditional pen and paper. While traditional sketching focuses on quick visual ideas and rough compositions, digital sketching allows for greater precision, flexibility, and the ability to easily edit and refine your work. It bridges the gap between raw ideas and finished digital artwork, serving as a vital step in the GUI design process.</p><p>Think of digital sketching as an evolution of traditional drawing. Instead of pencils, you use digital brushes; instead of paper, you draw on a digital canvas. The benefits are numerous: infinite undo/redo options, non-destructive editing (meaning you can make changes without permanently altering the original), easy color experimentation, and the ability to integrate seamlessly with other digital design tools. For GUI designers, this means you can quickly iterate on interface elements, buttons, icons, and even full screen layouts without having to redraw from scratch every time you want to make a small change.</p><p>A key advantage is the ability to work with different forms of graphics, specifically vector and raster. This week, our focus will be primarily on vector graphics, which offer unique benefits for GUI elements like logos, icons, and scalable interface components. Digital sketching in a vector environment means that every line, shape, and curve you create is mathematically defined, leading to unparalleled precision and scalability.</p><h3>1.2 Why Vectors for Sketching?</h3><p>To understand why vectors are so important for digital sketching, especially in GUI design, we need to first differentiate between two main types of digital graphics: vector and raster.</p><p><strong>Vector graphics</strong> are images built from mathematical formulas that define points, lines, curves, and shapes. These elements are called paths. Because they are defined mathematically, vector graphics can be scaled to any size without losing quality or becoming pixelated. Imagine drawing a perfect circle: in vector graphics, the computer remembers the mathematical equation for that circle, not just a grid of colored dots. When you make it bigger, the computer simply recalculates the equation for a larger circle.</p><p><strong>Raster graphics</strong>, on the other hand, are composed of a grid of tiny colored squares called pixels. Photographs are the most common example of raster graphics. When you zoom in on a raster image, you start to see these individual pixels, and the image can appear blurry or pixelated. This loss of quality when scaling is a major drawback for elements that need to appear sharp at various sizes, like logos or icons on different screen resolutions.</p><blockquote><p>Suggested visual: A side-by-side comparison illustrating a vector circle scaled up (remaining smooth) and a raster circle scaled up (showing pixelation).</p></blockquote><p>For GUI design, the scalability of vector graphics is paramount. An icon needs to look crisp on a tiny mobile screen as well as a large 4K monitor. A logo must appear sharp on a small app button and a massive billboard. Vector graphics, created in programs like Adobe Illustrator, ensure this quality. They also result in smaller file sizes for simple graphics and are easier to edit and refine, making them ideal for the iterative nature of design.</p><p><strong>Adobe Illustrator</strong> is the industry standard software for creating and editing vector graphics. It provides a comprehensive set of tools specifically designed for drawing, coloring, and manipulating vector paths and shapes. This week, we will focus heavily on using Illustrator to harness the power of vector art for our digital sketches.</p><h3>1.3 Setting Up Your Workspace in Illustrator</h3><p>Before we dive into creating, it\'s helpful to understand the basic layout of Adobe Illustrator. When you open Illustrator, you\'ll see a main canvas area, surrounded by various panels and toolbars. Familiarizing yourself with these components will make your workflow much smoother.</p><p>The central area is your **Artboard**, which is your digital canvas where you create your artwork. You can have multiple artboards in a single Illustrator document, useful for designing different elements or variations of a design. On the left side, you\'ll find the **Tools panel**, which contains all the drawing, selection, and manipulation tools. On the right, you\'ll see various **Panels**, such as Layers, Properties, Pathfinder, Gradient, Color, and Swatches. These panels provide options and controls for the selected tools and objects.</p><blockquote><p>Suggested visual: A labeled screenshot of the default Adobe Illustrator workspace, highlighting the Artboard, Tools panel, and common panels like Layers and Properties.</p></blockquote><p>For efficient digital sketching, consider setting up a custom workspace. You can rearrange panels, dock them, or leave them floating. A common setup involves having the Layers, Pathfinder, and Properties panels easily accessible, as we will be using them frequently this week. You can save your preferred layout by going to <code>Window &gt; Workspace &gt; New Workspace...</code> This ensures that your most-used tools and panels are always at your fingertips, streamlining your creative process.</p><p>To start a new document for sketching, go to <code>File &gt; New...</code>. Choose a suitable size for your artboard, perhaps a common screen resolution like 1920x1080 pixels, or a generic print size if you prefer. Ensure the \'Color Mode\' is set to RGB for screen-based GUI design, as CMYK is primarily for print.</p><h2>Section 2: Basic Vector Tools for Sketching</h2><p>Before we tackle advanced techniques, let\'s review some fundamental vector tools in Illustrator that form the bedrock of digital sketching. Mastering these tools is crucial for precise and efficient vector artwork creation.</p><h3>2.1 The Pen Tool</h3><p>The **Pen Tool** (P) is arguably the most powerful and precise drawing tool in Illustrator. It allows you to create custom shapes and paths with incredible accuracy by placing points, called **anchor points**, and defining the curves between them. Understanding how to use the Pen Tool effectively is foundational to advanced vector design.</p><p>A **path** is a line segment, and it is defined by at least two anchor points. These paths can be open (like a line) or closed (like a circle or square). The segments between anchor points are called **path segments**. When you create curved paths, the Pen Tool uses **handles**, also known as direction lines, which extend from anchor points and control the shape and direction of the curve.</p><h4>Step-by-Step: Using the Pen Tool</h4><ol><li><p><strong>Drawing Straight Lines:</strong></p><p>Select the Pen Tool (P) from the Tools panel. Click once on the artboard to create your first anchor point. Move your mouse and click again to create a second anchor point. Illustrator will draw a straight line segment between these two points. Continue clicking to add more straight segments. To stop drawing the path, press the Escape key or select another tool.</p></li><li><p><strong>Drawing Smooth Curves:</strong></p><p>Select the Pen Tool. Click and drag (don\'t just click) to create your first anchor point with handles. The direction you drag determines the initial curve. Release the mouse button. Now, move to where you want the next anchor point, click and drag again. As you drag, you\'ll see the curve adjust. The length and angle of the handles control the arc of the curve. To make a smooth curve, ensure the handles are aligned. Release the mouse button.</p></li><li><p><strong>Creating Corner Points (Sharp Turns):</strong></p><p>After creating an anchor point with handles (a smooth point), you might want to make a sharp turn or corner. To do this, while still having the Pen Tool selected, click on the last anchor point you created. This will retract one of its handles, allowing the next segment to be a sharp corner. Now, click and drag to create a new anchor point with handles for a new curve, or simply click for a straight line. This technique lets you combine smooth curves and sharp corners in a single path.</p></li><li><p><strong>Closing a Path:</strong></p><p>To create a closed shape (like a complete circle or a custom polygon), move the Pen Tool cursor over your very first anchor point. A small circle will appear next to the Pen Tool icon, indicating that clicking will close the path. Click the first anchor point to connect the last segment to the first, forming a complete shape.</p></li></ol><blockquote><p>Suggested visual: A series of small diagrams illustrating each step of using the Pen Tool: drawing straight lines, drawing curves, creating a corner point in a curved path, and closing a path.</p></blockquote><p>Practice is key with the Pen Tool. It can feel a bit challenging at first, but with repeated use, it becomes intuitive and allows for unparalleled control over your vector artwork.</p><h3>2.2 Shape Tools</h3><p>While the Pen Tool offers ultimate customizability, Illustrator also provides a set of pre-built **Shape Tools** for creating common geometric shapes quickly and accurately. These include the Rectangle Tool, Rounded Rectangle Tool, Ellipse Tool, Polygon Tool, and Star Tool. These tools are excellent starting points for many GUI elements.</p><h4>Step-by-Step: Using Shape Tools</h4><ol><li><p><strong>Rectangle Tool (M) and Ellipse Tool (L):</strong></p><p>Select the Rectangle Tool or Ellipse Tool from the Tools panel. Click and drag on the artboard to draw your shape. To draw a perfect square with the Rectangle Tool, or a perfect circle with the Ellipse Tool, hold down the Shift key while dragging. To draw from the center outwards, hold down the Alt (Option on Mac) key while dragging. You can combine Shift + Alt for a perfect shape drawn from its center.</p></li><li><p><strong>Polygon Tool:</strong></p><p>Select the Polygon Tool. Click and drag to draw a polygon. While dragging, you can press the Up Arrow key to add more sides or the Down Arrow key to reduce sides. To draw a perfect, regular polygon, hold down the Shift key. If you simply click on the artboard instead of dragging, a dialog box will appear, allowing you to specify the radius and number of sides numerically.</p></li><li><p><strong>Modifying Shapes:</strong></p><p>Once a shape is drawn, you can easily modify its size, rotation, and other properties using the Selection Tool (black arrow) or by adjusting values in the Properties panel. For example, for a rounded rectangle, the Properties panel allows you to change the corner radius after creation.</p></li></ol><p>These shape tools are not just for basic forms; they are often the foundation upon which more complex designs are built using techniques like the Pathfinder, which we will cover later.</p><h3>2.3 Selection Tools</h3><p>After creating shapes and paths, you need tools to select and manipulate them. Illustrator primarily offers two selection tools, each with a distinct purpose.</p><p>The **Selection Tool** (V), also known as the Black Arrow Tool, is used to select entire objects or groups of objects. With this tool, you can move, scale, rotate, and distort whole shapes. When an object is selected, you\'ll see a bounding box around it. Clicking and dragging the corners of the bounding box scales the object; hovering just outside a corner allows you to rotate it.</p><p>The **Direct Selection Tool** (A), also known as the White Arrow Tool, is used to select and manipulate individual anchor points and path segments within an object. This tool gives you fine-grained control over the exact shape of your paths. With the Direct Selection Tool, you can click on an anchor point and drag it to reshape a curve or straighten a line. You can also select multiple anchor points to move them together, or adjust the handles of an anchor point to refine a curve.</p><blockquote><p>Suggested visual: Two images side-by-side. One shows the Selection Tool active, selecting an entire shape with a bounding box. The other shows the Direct Selection Tool active, selecting and moving a single anchor point on the same shape.</p></blockquote><p>Understanding the difference between these two tools is critical. The Selection Tool is for broad adjustments and rearrangements of complete objects, while the Direct Selection Tool is for detailed editing of the path\'s structure. You will frequently switch between them while refining your digital sketches.</p><h2>Section 3: Advanced Vector Techniques - Layering and Organization</h2><p>As your digital sketches become more complex, efficient organization becomes paramount. **Layers** and **groups** are fundamental tools in Illustrator for managing your artwork, enabling non-destructive editing and a streamlined workflow.</p><h3>3.1 Understanding Layers</h3><p>In digital art, **layers** are like transparent sheets stacked on top of each other. Each sheet can hold different elements of your artwork, allowing you to work on one part of your design without affecting others. Imagine drawing a person: you might put the background on one layer, the clothes on another, and the facial features on a third. This separation offers immense flexibility.</p><p>The importance of layers cannot be overstated, especially for complex GUI designs. They enable **non-destructive editing**, meaning you can modify, hide, or delete elements on one layer without altering anything on other layers. This is crucial for iteration and refinement. For instance, you could have a layer for your basic wireframe sketch, another for detailed lines, a third for color fills, and a fourth for annotations. If you decide to change the background color, you only need to edit the background layer, without accidentally selecting or changing your detailed lines.</p><p>Layers also help in maintaining a clear and organized document. When working on a large project, a well-structured layer panel can save you hours of searching for specific elements. It allows for easier collaboration with other designers or developers, as the document structure is logical and understandable.</p><h3>3.2 Managing Layers in Illustrator</h3><p>The **Layers panel** (Window &gt; Layers) is where you control all aspects of your layers. Each document starts with at least one layer. You can create new layers, rename them, reorder them, lock them, hide them, and assign specific objects to them.</p><h4>Step-by-Step: Working with Layers</h4><ol><li><p><strong>Creating a New Layer:</strong></p><p>Open the Layers panel. Click the \'Create New Layer\' icon (a square with a plus sign) at the bottom of the panel. A new layer will appear above the currently selected layer.</p></li><li><p><strong>Renaming a Layer:</strong></p><p>Double-click on the layer\'s name in the Layers panel. Type a descriptive name (e.g., \'Background\', \'Main UI elements\', \'Icons\', \'Text\'). Meaningful names are vital for organization.</p></li><li><p><strong>Reordering Layers:</strong></p><p>Click and drag a layer up or down in the Layers panel to change its stacking order. Layers higher in the panel appear on top of layers lower in the panel in your artwork.</p></li><li><p><strong>Locking and Hiding Layers:</strong></p><p>To the left of each layer name, there are two small boxes. Click the empty box next to the eye icon to make the eye appear; this hides the layer. Click the eye icon to hide the layer. Click the empty box next to the eye (it will be empty if the layer is not locked) to make a padlock icon appear; this locks the layer, preventing you from accidentally selecting or editing its contents. Click the padlock again to unlock.</p></li><li><p><strong>Moving Objects Between Layers:</strong></p><p>Select the object(s) on your artboard that you want to move. In the Layers panel, find the small colored square indicator to the right of the layer name that contains your selected object(s). Drag this colored square up or down to the desired layer. The object will now reside on the new layer.</p></li></ol><h3>3.3 Grouping Objects</h3><p>While layers organize broad sections of your artwork, **grouping** allows you to combine multiple objects within a single layer (or across layers, though typically within one for simplicity) so they can be moved, scaled, or manipulated as a single unit. Think of grouping as temporarily sticking pieces together that belong to one logical component.</p><p>For example, if you design a button consisting of a rectangle for the background, text for the label, and a small icon, you would select all three elements and group them (Object &gt; Group, or Ctrl/Cmd + G). Now, when you select any part of that button, the entire button moves or scales together. You can still access individual elements within a group by double-clicking the group to enter isolation mode, or by using the Direct Selection Tool.</p><p>The difference between layers and groups is one of hierarchy and scope. Layers provide a fundamental structural organization for your entire document, isolating major components of your design. Groups provide a way to manage related elements *within* those layers, treating smaller collections of objects as single units.</p>','PUBLISHED','AI_GENERATED','2026-08-08 17:15:46','2026-08-08 16:12:31');
/*!40000 ALTER TABLE `LessonNote` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonNoteImage`
--

DROP TABLE IF EXISTS `LessonNoteImage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonNoteImage` (
  `image_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `note_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `file_path` varchar(500) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `fk_lni_user` (`user_id`),
  KEY `idx_lni_note` (`note_id`),
  CONSTRAINT `fk_lni_note` FOREIGN KEY (`note_id`) REFERENCES `LessonNote` (`note_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lni_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonNoteImage`
--

LOCK TABLES `LessonNoteImage` WRITE;
/*!40000 ALTER TABLE `LessonNoteImage` DISABLE KEYS */;
INSERT INTO `LessonNoteImage` VALUES (35,78,15,'/lesson-notes/78/1786187338981-372731161.png','image/png','image.png','2026-08-08 13:09:49'),(36,78,15,'/lesson-notes/78/1786187342074-789746045.png','image/png','image.png','2026-08-08 13:09:49'),(37,78,15,'/lesson-notes/78/1786187383360-479045980.png','image/png','image.png','2026-08-08 13:10:32');
/*!40000 ALTER TABLE `LessonNoteImage` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonNotePromptPreset`
--

DROP TABLE IF EXISTS `LessonNotePromptPreset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonNotePromptPreset` (
  `preset_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `label` varchar(80) NOT NULL,
  `prompt_text` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`preset_id`),
  KEY `idx_lnpp_user` (`user_id`),
  CONSTRAINT `fk_lnpp_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonNotePromptPreset`
--

LOCK TABLES `LessonNotePromptPreset` WRITE;
/*!40000 ALTER TABLE `LessonNotePromptPreset` DISABLE KEYS */;
/*!40000 ALTER TABLE `LessonNotePromptPreset` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonNoteShare`
--

DROP TABLE IF EXISTS `LessonNoteShare`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonNoteShare` (
  `share_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `note_id` bigint(20) NOT NULL,
  `shared_by` bigint(20) NOT NULL,
  `filter_type` enum('class_group','subject_enrolled','specific_students') NOT NULL,
  `filter_ids` json NOT NULL,
  `permission` enum('VIEW') NOT NULL DEFAULT 'VIEW',
  `expires_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`share_id`),
  KEY `fk_lns_shared_by` (`shared_by`),
  KEY `idx_lns_note` (`note_id`),
  CONSTRAINT `fk_lns_note` FOREIGN KEY (`note_id`) REFERENCES `LessonNote` (`note_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lns_shared_by` FOREIGN KEY (`shared_by`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonNoteShare`
--

LOCK TABLES `LessonNoteShare` WRITE;
/*!40000 ALTER TABLE `LessonNoteShare` DISABLE KEYS */;
/*!40000 ALTER TABLE `LessonNoteShare` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonNoteVersion`
--

DROP TABLE IF EXISTS `LessonNoteVersion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonNoteVersion` (
  `version_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `note_id` bigint(20) NOT NULL,
  `content_json` json NOT NULL,
  `created_by` enum('USER','AI') NOT NULL DEFAULT 'USER',
  `prompt_text` text,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version_id`),
  KEY `idx_lnv_note` (`note_id`,`created_at`),
  CONSTRAINT `fk_lnv_note` FOREIGN KEY (`note_id`) REFERENCES `LessonNote` (`note_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonNoteVersion`
--

LOCK TABLES `LessonNoteVersion` WRITE;
/*!40000 ALTER TABLE `LessonNoteVersion` DISABLE KEYS */;
/*!40000 ALTER TABLE `LessonNoteVersion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonReport`
--

DROP TABLE IF EXISTS `LessonReport`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonReport` (
  `lesson_report_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `lesson_id` int(11) DEFAULT NULL,
  `entry_id` bigint(20) DEFAULT NULL,
  `reported_by` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) DEFAULT NULL,
  `academic_term_id` bigint(20) DEFAULT NULL,
  `subject_id` bigint(20) DEFAULT NULL,
  `class_group_id` bigint(20) DEFAULT NULL,
  `delivery_date` date NOT NULL,
  `status` enum('DELIVERED','PARTIAL','MISSED','UNPLANNED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DELIVERED',
  `attendance_count` int(11) DEFAULT NULL,
  `completion_rate` int(11) DEFAULT NULL COMMENT '0-100',
  `reflection_notes` text COLLATE utf8mb4_unicode_ci,
  `evidence_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `schedule_flag` enum('ON_TIME','AHEAD','BEHIND') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ON_TIME',
  `validation_status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `validation_comment` text COLLATE utf8mb4_unicode_ci,
  `validated_by` bigint(20) DEFAULT NULL,
  `validated_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`lesson_report_id`),
  UNIQUE KEY `uq_lesson_report_reporter_lesson_date` (`reported_by`,`lesson_id`,`delivery_date`),
  KEY `idx_lr_reported_by` (`reported_by`),
  KEY `idx_lr_lesson_id` (`lesson_id`),
  KEY `idx_lr_delivery_date` (`delivery_date`),
  KEY `fk_lr_entry` (`entry_id`),
  KEY `idx_lesson_report_academic_year` (`academic_year_id`),
  KEY `idx_lesson_report_academic_term` (`academic_term_id`),
  KEY `idx_lesson_report_subject` (`subject_id`),
  KEY `idx_lesson_report_class_group` (`class_group_id`),
  KEY `idx_lr_validation_status` (`validation_status`),
  CONSTRAINT `fk_lesson_report_class_group` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lesson_report_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_entry` FOREIGN KEY (`entry_id`) REFERENCES `SchemeOfWorkEntry` (`entry_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_lesson` FOREIGN KEY (`lesson_id`) REFERENCES `LO_Lesson` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_reported_by` FOREIGN KEY (`reported_by`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `lessonreport_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  CONSTRAINT `lessonreport_ibfk_2` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonReport`
--

LOCK TABLES `LessonReport` WRITE;
/*!40000 ALTER TABLE `LessonReport` DISABLE KEYS */;
INSERT INTO `LessonReport` VALUES (6,NULL,NULL,15,3,5,9,9,'2026-07-01','UNPLANNED',NULL,NULL,'n/a',NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-30 21:49:12'),(9,NULL,NULL,15,3,5,9,9,'2026-07-01','UNPLANNED',NULL,NULL,'oi',NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-30 23:40:05'),(11,NULL,NULL,15,3,5,9,9,'2026-07-01','UNPLANNED',NULL,NULL,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-30 23:57:04'),(12,NULL,NULL,15,3,5,8,9,'2026-07-01','UNPLANNED',NULL,NULL,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-30 23:57:14'),(13,NULL,NULL,15,3,5,9,9,'2025-10-01','UNPLANNED',8,100,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-31 00:02:57'),(14,NULL,NULL,15,3,5,9,9,'2026-07-01','UNPLANNED',NULL,NULL,'ok',NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-31 00:15:23'),(15,NULL,NULL,15,3,5,9,9,'2026-07-01','UNPLANNED',NULL,NULL,'rrr',NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-31 00:17:36'),(16,NULL,NULL,15,3,5,8,9,'2025-10-01','UNPLANNED',NULL,NULL,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-31 00:19:27'),(17,2,1,15,3,4,9,9,'2026-01-08','DELIVERED',NULL,100,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-31 01:29:28'),(18,NULL,NULL,15,3,4,8,9,'2026-01-06','UNPLANNED',NULL,100,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-31 11:22:53'),(19,NULL,NULL,15,3,4,9,9,'2026-01-07','UNPLANNED',NULL,100,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-07-31 11:23:03'),(20,NULL,NULL,15,3,5,9,9,'2026-08-02','UNPLANNED',NULL,NULL,'uygtu',NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-08-02 00:34:49'),(21,NULL,NULL,15,3,5,8,9,'2025-10-02','UNPLANNED',NULL,NULL,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-08-02 00:35:47'),(22,NULL,NULL,15,5,7,8,41,'2026-08-06','UNPLANNED',NULL,NULL,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-08-06 14:18:42'),(23,NULL,NULL,15,5,7,8,41,'2026-08-08','UNPLANNED',NULL,NULL,NULL,NULL,'ON_TIME','PENDING',NULL,NULL,NULL,'2026-08-08 21:35:16');
/*!40000 ALTER TABLE `LessonReport` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonReportChallengeTag`
--

DROP TABLE IF EXISTS `LessonReportChallengeTag`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonReportChallengeTag` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `lesson_report_id` bigint(20) NOT NULL,
  `category_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lrct_lesson_report` (`lesson_report_id`),
  KEY `idx_lrct_category` (`category_id`),
  CONSTRAINT `fk_lrct_category` FOREIGN KEY (`category_id`) REFERENCES `ChallengeCategory` (`category_id`),
  CONSTRAINT `fk_lrct_lesson_report` FOREIGN KEY (`lesson_report_id`) REFERENCES `LessonReport` (`lesson_report_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonReportChallengeTag`
--

LOCK TABLES `LessonReportChallengeTag` WRITE;
/*!40000 ALTER TABLE `LessonReportChallengeTag` DISABLE KEYS */;
INSERT INTO `LessonReportChallengeTag` VALUES (3,6,1),(4,6,2),(5,11,2),(6,13,2),(7,14,5),(8,14,1),(9,15,2),(10,15,4),(11,20,2),(12,21,7),(13,21,2),(14,22,2),(15,23,2),(16,23,7);
/*!40000 ALTER TABLE `LessonReportChallengeTag` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `LessonReportSupportRequest`
--

DROP TABLE IF EXISTS `LessonReportSupportRequest`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `LessonReportSupportRequest` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `lesson_report_id` bigint(20) NOT NULL,
  `category_id` bigint(20) NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_lrsr_lesson_report` (`lesson_report_id`),
  KEY `idx_lrsr_category` (`category_id`),
  CONSTRAINT `fk_lrsr_category` FOREIGN KEY (`category_id`) REFERENCES `SupportRequestCategory` (`category_id`),
  CONSTRAINT `fk_lrsr_lesson_report` FOREIGN KEY (`lesson_report_id`) REFERENCES `LessonReport` (`lesson_report_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `LessonReportSupportRequest`
--

LOCK TABLES `LessonReportSupportRequest` WRITE;
/*!40000 ALTER TABLE `LessonReportSupportRequest` DISABLE KEYS */;
INSERT INTO `LessonReportSupportRequest` VALUES (2,6,1,NULL),(3,6,2,NULL),(5,11,1,NULL),(7,13,4,NULL),(8,14,1,NULL),(9,15,1,NULL),(10,15,3,NULL),(11,16,4,NULL),(12,20,2,NULL),(13,21,2,NULL),(14,21,5,NULL),(15,22,1,NULL),(16,23,1,NULL),(17,23,2,NULL);
/*!40000 ALTER TABLE `LessonReportSupportRequest` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `MenteeCheckIn`
--

DROP TABLE IF EXISTS `MenteeCheckIn`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `MenteeCheckIn` (
  `checkin_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `student_id` bigint(20) NOT NULL,
  `mentor_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `category` enum('GENERAL','APPRECIATION','ACADEMIC','BEHAVIORAL','ATTENDANCE','WELLBEING','CONCERN','REQUEST_MEETING','OTHER') NOT NULL DEFAULT 'GENERAL',
  `title` varchar(150) DEFAULT NULL,
  `subject_id` bigint(20) DEFAULT NULL,
  `message` text NOT NULL,
  `linked_session_id` bigint(20) DEFAULT NULL,
  `status` enum('NEW','ACKNOWLEDGED','ADDRESSED') NOT NULL DEFAULT 'NEW',
  `validation_status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `mentor_response` text,
  `responded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`checkin_id`),
  KEY `fk_mci_year` (`academic_year_id`),
  KEY `fk_mci_session` (`linked_session_id`),
  KEY `idx_mci_mentor` (`mentor_id`,`status`),
  KEY `idx_mci_student` (`student_id`,`academic_year_id`),
  KEY `idx_mci_validation_status` (`validation_status`),
  KEY `idx_mci_subject` (`subject_id`),
  CONSTRAINT `fk_mci_mentor` FOREIGN KEY (`mentor_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `fk_mci_session` FOREIGN KEY (`linked_session_id`) REFERENCES `MentorshipSession` (`mentorship_id`),
  CONSTRAINT `fk_mci_student` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `fk_mci_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  CONSTRAINT `fk_mci_year` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `MenteeCheckIn`
--

LOCK TABLES `MenteeCheckIn` WRITE;
/*!40000 ALTER TABLE `MenteeCheckIn` DISABLE KEYS */;
/*!40000 ALTER TABLE `MenteeCheckIn` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `MentorAssignment`
--

DROP TABLE IF EXISTS `MentorAssignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `MentorAssignment` (
  `assignment_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `mentor_id` bigint(20) NOT NULL,
  `student_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `status` enum('ACTIVE','ENDED') NOT NULL DEFAULT 'ACTIVE',
  `assigned_by` bigint(20) NOT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` datetime DEFAULT NULL,
  `notes` text,
  PRIMARY KEY (`assignment_id`),
  KEY `fk_ma_year` (`academic_year_id`),
  KEY `fk_ma_assigned_by` (`assigned_by`),
  KEY `idx_ma_mentor` (`mentor_id`,`academic_year_id`),
  KEY `idx_ma_student` (`student_id`,`academic_year_id`),
  CONSTRAINT `fk_ma_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `User` (`user_id`),
  CONSTRAINT `fk_ma_mentor` FOREIGN KEY (`mentor_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `fk_ma_student` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`),
  CONSTRAINT `fk_ma_year` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `MentorAssignment`
--

LOCK TABLES `MentorAssignment` WRITE;
/*!40000 ALTER TABLE `MentorAssignment` DISABLE KEYS */;
INSERT INTO `MentorAssignment` VALUES (1,13,23,3,'ACTIVE',13,'2026-08-01 00:12:19',NULL,'Backfilled from TeacherSubjectAssignment on migration 047'),(2,14,23,3,'ACTIVE',14,'2026-08-01 00:12:19',NULL,'Backfilled from TeacherSubjectAssignment on migration 047'),(3,15,23,3,'ACTIVE',15,'2026-08-01 00:12:19',NULL,'Backfilled from TeacherSubjectAssignment on migration 047'),(4,15,23,5,'ENDED',1,'2026-08-02 17:27:14','2026-08-02 19:40:56',NULL),(5,15,23,5,'ACTIVE',1,'2026-08-02 19:41:20',NULL,NULL);
/*!40000 ALTER TABLE `MentorAssignment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `MentorshipSession`
--

DROP TABLE IF EXISTS `MentorshipSession`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `MentorshipSession` (
  `mentorship_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `report_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `student_id` bigint(20) DEFAULT NULL,
  `student_name` varchar(255) DEFAULT NULL,
  `topic` varchar(255) DEFAULT NULL,
  `academic_year_id` bigint(20) DEFAULT NULL,
  `academic_term_id` bigint(20) DEFAULT NULL,
  `subject_id` bigint(20) DEFAULT NULL COMMENT 'Optional subject context for this session',
  `previous_session_id` bigint(20) DEFAULT NULL COMMENT 'Chain-of-support link to the preceding session',
  `session_date` date DEFAULT NULL,
  `duration_minutes` int(11) DEFAULT NULL,
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
  `wellbeing_score` tinyint(4) DEFAULT NULL COMMENT '1=Struggling 2=Concerned 3=Neutral 4=Good 5=Excellent',
  `wellbeing_notes` text,
  `follow_up_required` tinyint(4) DEFAULT '0',
  `is_completed` tinyint(1) NOT NULL DEFAULT '0',
  `session_status` enum('OPEN','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'OPEN',
  `validation_status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `validation_comment` text,
  `validated_by` bigint(20) DEFAULT NULL,
  `validated_at` datetime DEFAULT NULL,
  `notes` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`mentorship_id`),
  KEY `MS_report_id_fk` (`report_id`),
  KEY `idx_ms_user_id` (`user_id`),
  KEY `idx_ms_student_id` (`student_id`),
  KEY `idx_ms_session_date` (`session_date`),
  KEY `idx_ms_student_date` (`student_id`,`session_date`),
  KEY `fk_ms_prev_session` (`previous_session_id`),
  KEY `idx_ms_subject_id` (`subject_id`),
  KEY `idx_mentorship_academic_year` (`academic_year_id`),
  KEY `idx_mentorship_academic_term` (`academic_term_id`),
  KEY `idx_ms_validation_status` (`validation_status`),
  CONSTRAINT `MS_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `fk_ms_prev_session` FOREIGN KEY (`previous_session_id`) REFERENCES `MentorshipSession` (`mentorship_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ms_student_id` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ms_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE SET NULL,
  CONSTRAINT `mentorshipsession_ibfk_1` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`),
  CONSTRAINT `mentorshipsession_ibfk_2` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `MentorshipSession`
--

LOCK TABLES `MentorshipSession` WRITE;
/*!40000 ALTER TABLE `MentorshipSession` DISABLE KEYS */;
INSERT INTO `MentorshipSession` VALUES (1,NULL,15,23,NULL,'Sess',3,5,8,NULL,'2026-08-01',30,'PARTIAL',NULL,'GOOD','OK','CONSISTENT',NULL,NULL,0,0,NULL,NULL,NULL,NULL,'CONCERNED',2,NULL,0,0,'OPEN','PENDING',NULL,NULL,NULL,NULL,'2026-08-01 17:55:44');
/*!40000 ALTER TABLE `MentorshipSession` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `OTP`
--

DROP TABLE IF EXISTS `OTP`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `OTP` (
  `otp_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `otp_code` varchar(6) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_type` enum('LOGIN_2FA','PASSWORD_RESET','EMAIL_VERIFICATION') COLLATE utf8mb4_unicode_ci DEFAULT 'LOGIN_2FA',
  `expires_at` datetime NOT NULL,
  `is_used` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`otp_id`)
) ENGINE=InnoDB AUTO_INCREMENT=155 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `OTP`
--

LOCK TABLES `OTP` WRITE;
/*!40000 ALTER TABLE `OTP` DISABLE KEYS */;
INSERT INTO `OTP` VALUES (1,1,'346584','PASSWORD_RESET','2026-01-13 17:36:11',1,'2026-01-13 17:26:11'),(2,1,'587552','LOGIN_2FA','2026-01-13 17:36:53',1,'2026-01-13 17:26:53'),(3,13,'952838','LOGIN_2FA','2026-01-13 18:28:04',1,'2026-01-13 18:18:03'),(4,1,'050194','LOGIN_2FA','2026-01-13 18:38:39',1,'2026-01-13 18:28:39'),(5,1,'049617','LOGIN_2FA','2026-01-13 18:39:35',1,'2026-01-13 18:29:35'),(6,14,'678070','LOGIN_2FA','2026-01-13 19:02:33',1,'2026-01-13 18:52:33'),(7,19,'366725','PASSWORD_RESET','2026-01-13 19:56:11',1,'2026-01-13 21:46:10'),(8,19,'935997','LOGIN_2FA','2026-01-13 19:57:08',1,'2026-01-13 21:47:08'),(9,1,'097834','LOGIN_2FA','2026-01-13 20:22:22',1,'2026-01-13 22:12:21'),(10,19,'925913','LOGIN_2FA','2026-01-13 20:23:16',1,'2026-01-13 22:13:15'),(11,1,'585232','LOGIN_2FA','2026-01-13 21:06:26',0,'2026-01-13 22:56:26'),(12,1,'491543','LOGIN_2FA','2026-01-13 21:06:58',0,'2026-01-13 22:56:58'),(13,1,'036716','LOGIN_2FA','2026-01-13 21:07:56',0,'2026-01-13 22:57:55'),(14,1,'568490','LOGIN_2FA','2026-01-13 21:18:12',1,'2026-01-13 23:08:11'),(15,20,'498686','LOGIN_2FA','2026-01-13 22:16:19',1,'2026-01-14 00:06:19'),(16,1,'961485','LOGIN_2FA','2026-01-14 09:34:30',1,'2026-01-14 11:24:29'),(17,1,'399655','LOGIN_2FA','2026-01-14 11:52:53',1,'2026-01-14 13:42:52'),(18,21,'822956','LOGIN_2FA','2026-01-14 12:08:03',1,'2026-01-14 13:58:03'),(19,21,'981928','LOGIN_2FA','2026-01-15 08:55:27',1,'2026-01-15 10:45:26'),(20,20,'290720','LOGIN_2FA','2026-01-15 08:56:38',1,'2026-01-15 10:46:38'),(21,1,'470933','LOGIN_2FA','2026-01-16 15:16:09',1,'2026-01-16 17:06:09'),(22,1,'480629','LOGIN_2FA','2026-01-19 18:02:32',1,'2026-01-19 19:52:31'),(23,22,'752592','LOGIN_2FA','2026-01-19 20:37:35',1,'2026-01-19 22:27:35'),(24,1,'444985','LOGIN_2FA','2026-01-19 20:38:50',1,'2026-01-19 22:28:50'),(25,1,'502373','LOGIN_2FA','2026-01-25 09:57:46',1,'2026-01-25 11:47:46'),(26,1,'025116','LOGIN_2FA','2026-01-25 09:59:55',1,'2026-01-25 11:49:55'),(27,1,'488601','LOGIN_2FA','2026-01-25 11:33:05',1,'2026-01-25 13:23:05'),(28,1,'667284','LOGIN_2FA','2026-01-26 09:55:18',1,'2026-01-26 11:45:18'),(29,1,'536658','LOGIN_2FA','2026-01-26 11:01:30',1,'2026-01-26 12:51:30'),(30,1,'773979','LOGIN_2FA','2026-01-28 09:19:56',1,'2026-01-28 11:09:55'),(31,15,'126977','PASSWORD_RESET','2026-01-28 09:31:14',1,'2026-01-28 11:21:14'),(32,15,'533052','LOGIN_2FA','2026-01-28 09:31:54',1,'2026-01-28 11:21:53'),(33,15,'729996','LOGIN_2FA','2026-01-28 13:42:25',1,'2026-01-28 15:32:25'),(34,15,'948691','LOGIN_2FA','2026-01-28 13:47:12',0,'2026-01-28 15:37:12'),(35,15,'990760','LOGIN_2FA','2026-01-28 13:47:31',1,'2026-01-28 15:37:31'),(36,1,'440688','LOGIN_2FA','2026-02-02 21:42:27',1,'2026-02-02 23:32:27'),(37,23,'407330','PASSWORD_RESET','2026-02-02 21:52:59',1,'2026-02-02 23:42:58'),(38,23,'941388','LOGIN_2FA','2026-02-02 21:53:52',1,'2026-02-02 23:43:52'),(39,1,'553623','LOGIN_2FA','2026-02-02 22:11:33',1,'2026-02-03 00:01:32'),(40,23,'003388','LOGIN_2FA','2026-02-03 23:13:36',1,'2026-02-04 01:03:35'),(41,15,'077703','LOGIN_2FA','2026-02-03 23:35:29',1,'2026-02-04 01:25:29'),(42,23,'759277','LOGIN_2FA','2026-02-04 13:42:37',1,'2026-02-04 15:32:37'),(43,15,'652773','LOGIN_2FA','2026-02-04 13:48:47',1,'2026-02-04 15:38:47'),(44,23,'036702','LOGIN_2FA','2026-02-04 13:54:36',1,'2026-02-04 15:44:36'),(45,15,'596948','LOGIN_2FA','2026-02-04 16:32:07',1,'2026-02-04 18:22:06'),(46,23,'341631','LOGIN_2FA','2026-02-04 22:47:20',1,'2026-02-05 00:37:20'),(47,15,'990884','LOGIN_2FA','2026-02-07 12:27:02',1,'2026-02-07 14:17:01'),(48,15,'610919','LOGIN_2FA','2026-02-07 13:21:07',0,'2026-02-07 15:11:07'),(49,15,'935078','LOGIN_2FA','2026-02-07 13:21:49',0,'2026-02-07 15:11:49'),(50,15,'323236','LOGIN_2FA','2026-02-07 13:22:42',1,'2026-02-07 15:12:41'),(51,15,'922667','LOGIN_2FA','2026-02-23 18:58:19',1,'2026-02-23 20:48:18'),(52,23,'708614','LOGIN_2FA','2026-02-23 19:06:32',1,'2026-02-23 20:56:31'),(53,15,'409548','LOGIN_2FA','2026-02-23 22:30:13',0,'2026-02-24 00:20:12'),(54,15,'915770','LOGIN_2FA','2026-02-23 22:30:31',1,'2026-02-24 00:20:31'),(55,23,'806231','LOGIN_2FA','2026-02-23 23:02:18',0,'2026-02-24 00:52:18'),(56,15,'750260','LOGIN_2FA','2026-02-23 23:03:24',0,'2026-02-24 00:53:24'),(57,15,'725047','LOGIN_2FA','2026-02-23 23:03:36',1,'2026-02-24 00:53:35'),(58,23,'017868','LOGIN_2FA','2026-02-23 23:04:39',1,'2026-02-24 00:54:39'),(59,15,'102999','LOGIN_2FA','2026-02-23 23:06:05',1,'2026-02-24 00:56:04'),(60,23,'614339','LOGIN_2FA','2026-02-23 23:50:07',1,'2026-02-24 01:40:06'),(61,15,'773447','LOGIN_2FA','2026-02-24 08:27:48',1,'2026-02-24 10:17:48'),(62,15,'282383','LOGIN_2FA','2026-02-25 14:02:05',1,'2026-02-25 15:52:04'),(63,23,'155155','LOGIN_2FA','2026-02-26 16:37:19',1,'2026-02-26 18:27:19'),(64,15,'835255','LOGIN_2FA','2026-02-26 16:38:32',1,'2026-02-26 18:28:31'),(65,1,'759949','LOGIN_2FA','2026-02-27 17:58:14',1,'2026-02-27 19:48:14'),(66,15,'474582','LOGIN_2FA','2026-02-27 18:40:27',1,'2026-02-27 20:30:26'),(67,23,'525619','LOGIN_2FA','2026-02-28 16:38:18',1,'2026-02-28 18:28:17'),(68,15,'111972','LOGIN_2FA','2026-03-01 10:20:33',0,'2026-03-01 12:10:32'),(69,15,'764080','LOGIN_2FA','2026-03-01 10:20:36',0,'2026-03-01 12:10:36'),(70,15,'015852','LOGIN_2FA','2026-03-01 10:20:41',0,'2026-03-01 12:10:41'),(71,15,'290919','LOGIN_2FA','2026-03-01 10:20:42',0,'2026-03-01 12:10:41'),(72,15,'371770','LOGIN_2FA','2026-03-01 10:20:43',0,'2026-03-01 12:10:42'),(73,15,'206025','LOGIN_2FA','2026-03-01 10:20:43',0,'2026-03-01 12:10:43'),(74,15,'145132','LOGIN_2FA','2026-03-01 10:20:44',0,'2026-03-01 12:10:44'),(75,15,'552134','LOGIN_2FA','2026-03-01 10:20:58',0,'2026-03-01 12:10:57'),(76,15,'380405','LOGIN_2FA','2026-03-01 10:20:59',0,'2026-03-01 12:10:58'),(77,15,'911905','LOGIN_2FA','2026-03-01 10:21:00',0,'2026-03-01 12:10:59'),(78,15,'063714','LOGIN_2FA','2026-03-01 10:21:00',0,'2026-03-01 12:11:00'),(79,15,'171289','LOGIN_2FA','2026-03-01 10:21:01',0,'2026-03-01 12:11:01'),(80,15,'289590','LOGIN_2FA','2026-03-01 10:21:02',0,'2026-03-01 12:11:02'),(81,15,'495253','LOGIN_2FA','2026-03-01 10:21:03',0,'2026-03-01 12:11:02'),(82,15,'215219','LOGIN_2FA','2026-03-01 10:21:04',0,'2026-03-01 12:11:03'),(83,15,'222707','LOGIN_2FA','2026-03-01 10:21:55',0,'2026-03-01 12:11:54'),(84,15,'561915','LOGIN_2FA','2026-03-01 10:22:13',1,'2026-03-01 12:12:13'),(85,23,'224835','LOGIN_2FA','2026-03-01 16:41:41',1,'2026-03-01 18:31:40'),(86,15,'509924','LOGIN_2FA','2026-03-02 10:36:21',1,'2026-03-02 12:26:21'),(87,23,'569404','LOGIN_2FA','2026-03-02 17:57:49',1,'2026-03-02 19:47:48'),(88,15,'944602','LOGIN_2FA','2026-03-03 12:06:27',1,'2026-03-03 13:56:27'),(89,1,'436175','LOGIN_2FA','2026-03-03 12:07:12',1,'2026-03-03 13:57:12'),(90,15,'758750','LOGIN_2FA','2026-03-03 12:09:47',1,'2026-03-03 13:59:47'),(91,15,'942610','LOGIN_2FA','2026-03-03 12:34:43',1,'2026-03-03 14:24:42'),(92,1,'399521','LOGIN_2FA','2026-03-03 19:13:30',1,'2026-03-03 21:03:29'),(93,1,'432386','LOGIN_2FA','2026-03-03 20:50:26',1,'2026-03-03 22:40:25'),(94,1,'246557','LOGIN_2FA','2026-03-03 20:53:20',1,'2026-03-03 22:43:19'),(95,15,'085777','LOGIN_2FA','2026-03-04 18:19:59',1,'2026-03-04 20:09:58'),(96,23,'926375','LOGIN_2FA','2026-03-04 21:00:14',1,'2026-03-04 22:50:14'),(97,1,'342919','LOGIN_2FA','2026-03-04 21:02:13',1,'2026-03-04 22:52:12'),(98,15,'189872','LOGIN_2FA','2026-03-04 21:51:03',1,'2026-03-04 23:41:02'),(99,1,'132889','LOGIN_2FA','2026-03-06 16:12:49',0,'2026-03-06 18:02:49'),(100,1,'841177','LOGIN_2FA','2026-03-06 16:13:41',0,'2026-03-06 18:03:40'),(101,1,'453095','LOGIN_2FA','2026-03-06 16:14:45',1,'2026-03-06 18:04:45'),(102,1,'576419','LOGIN_2FA','2026-03-07 18:53:22',1,'2026-03-07 20:43:22'),(103,1,'630270','LOGIN_2FA','2026-03-07 19:01:00',1,'2026-03-07 20:50:59'),(104,15,'037679','LOGIN_2FA','2026-03-09 09:24:13',1,'2026-03-09 11:14:13'),(105,1,'596546','LOGIN_2FA','2026-03-09 10:43:47',0,'2026-03-09 12:33:46'),(106,1,'584133','LOGIN_2FA','2026-03-09 10:45:35',1,'2026-03-09 12:35:34'),(107,15,'751337','LOGIN_2FA','2026-03-10 12:59:42',1,'2026-03-10 14:49:42'),(108,1,'754507','LOGIN_2FA','2026-03-12 15:01:25',1,'2026-03-12 16:51:25'),(109,1,'427194','LOGIN_2FA','2026-03-13 15:19:04',0,'2026-03-13 17:09:03'),(110,1,'399772','LOGIN_2FA','2026-03-13 15:19:24',1,'2026-03-13 17:09:24'),(111,15,'628701','LOGIN_2FA','2026-03-14 09:00:12',1,'2026-03-14 10:50:12'),(112,1,'307989','LOGIN_2FA','2026-03-14 09:32:01',1,'2026-03-14 11:22:00'),(113,15,'845517','LOGIN_2FA','2026-03-14 09:36:26',1,'2026-03-14 11:26:26'),(114,15,'719673','LOGIN_2FA','2026-03-14 17:59:41',1,'2026-03-14 19:49:41'),(115,15,'656653','LOGIN_2FA','2026-03-14 18:08:25',1,'2026-03-14 19:58:24'),(116,1,'713149','LOGIN_2FA','2026-03-14 18:44:02',1,'2026-03-14 20:34:01'),(117,15,'782860','LOGIN_2FA','2026-04-29 20:00:36',1,'2026-04-29 21:50:35'),(118,1,'906338','LOGIN_2FA','2026-05-06 17:41:05',1,'2026-05-06 19:31:04'),(119,1,'242450','LOGIN_2FA','2026-05-06 20:38:01',1,'2026-05-06 22:28:00'),(120,15,'923627','LOGIN_2FA','2026-05-11 07:18:51',1,'2026-05-11 09:08:50'),(121,1,'092411','LOGIN_2FA','2026-05-11 07:21:01',1,'2026-05-11 09:11:00'),(122,15,'550080','LOGIN_2FA','2026-05-11 07:23:18',1,'2026-05-11 09:13:18'),(123,15,'445188','LOGIN_2FA','2026-05-31 13:29:47',1,'2026-05-31 15:19:47'),(124,1,'010365','LOGIN_2FA','2026-07-27 12:24:40',1,'2026-07-27 14:14:40'),(125,1,'465377','LOGIN_2FA','2026-07-27 15:08:29',0,'2026-07-27 16:58:28'),(126,1,'271189','LOGIN_2FA','2026-07-27 15:08:41',0,'2026-07-27 16:58:41'),(127,1,'170940','LOGIN_2FA','2026-07-27 15:51:00',1,'2026-07-27 17:40:59'),(128,15,'271692','LOGIN_2FA','2026-07-28 04:41:58',1,'2026-07-28 06:31:57'),(129,15,'173145','LOGIN_2FA','2026-07-29 08:51:25',0,'2026-07-29 10:41:25'),(130,1,'149939','LOGIN_2FA','2026-07-29 09:49:38',0,'2026-07-29 11:39:38'),(131,15,'653809','LOGIN_2FA','2026-07-29 09:50:31',1,'2026-07-29 11:40:30'),(132,15,'339764','LOGIN_2FA','2026-07-30 07:44:31',1,'2026-07-30 09:34:31'),(133,15,'747417','LOGIN_2FA','2026-07-30 07:48:23',1,'2026-07-30 09:38:23'),(134,15,'878334','LOGIN_2FA','2026-07-30 08:10:13',1,'2026-07-30 10:00:12'),(135,15,'968122','LOGIN_2FA','2026-07-31 08:46:37',1,'2026-07-31 10:36:36'),(136,15,'325426','LOGIN_2FA','2026-07-31 10:04:07',1,'2026-07-31 11:54:07'),(137,15,'367611','LOGIN_2FA','2026-08-01 08:12:36',1,'2026-08-01 10:02:35'),(138,23,'726401','LOGIN_2FA','2026-08-02 14:44:48',1,'2026-08-02 16:34:48'),(139,23,'275585','LOGIN_2FA','2026-08-02 15:19:24',1,'2026-08-02 17:09:24'),(140,1,'905937','LOGIN_2FA','2026-08-02 16:23:13',1,'2026-08-02 18:13:12'),(141,15,'368499','LOGIN_2FA','2026-08-02 16:23:41',1,'2026-08-02 18:13:40'),(142,23,'651103','LOGIN_2FA','2026-08-02 17:30:36',1,'2026-08-02 19:20:35'),(143,15,'253703','LOGIN_2FA','2026-08-02 18:30:56',1,'2026-08-02 20:20:56'),(144,15,'078815','LOGIN_2FA','2026-08-02 18:33:08',1,'2026-08-02 20:23:08'),(145,23,'725014','LOGIN_2FA','2026-08-03 09:26:42',1,'2026-08-03 11:16:42'),(146,15,'813865','LOGIN_2FA','2026-08-03 12:50:36',1,'2026-08-03 14:40:35'),(147,15,'189378','LOGIN_2FA','2026-08-04 13:21:06',1,'2026-08-04 15:11:06'),(148,15,'255477','LOGIN_2FA','2026-08-04 14:01:14',1,'2026-08-04 15:51:14'),(149,15,'342142','LOGIN_2FA','2026-08-05 13:45:55',1,'2026-08-05 15:35:55'),(150,15,'056651','LOGIN_2FA','2026-08-06 14:40:28',1,'2026-08-06 16:30:28'),(151,1,'546534','LOGIN_2FA','2026-08-08 10:49:45',1,'2026-08-08 12:39:45'),(152,15,'188564','LOGIN_2FA','2026-08-08 10:50:13',1,'2026-08-08 12:40:13'),(153,15,'441913','LOGIN_2FA','2026-08-08 12:02:38',1,'2026-08-08 13:52:38'),(154,23,'946268','LOGIN_2FA','2026-08-08 19:47:10',1,'2026-08-08 21:37:10');
/*!40000 ALTER TABLE `OTP` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Parenting`
--

DROP TABLE IF EXISTS `Parenting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `Parenting` (
  `parenting_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `student_id` bigint(20) NOT NULL,
  `parent_id` bigint(20) NOT NULL,
  `relationship` varchar(50) DEFAULT 'PARENT',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`parenting_id`),
  UNIQUE KEY `unique_student_parent` (`student_id`,`parent_id`),
  KEY `Parenting_parent_id_User_user_id_fk` (`parent_id`),
  CONSTRAINT `Parenting_parent_id_User_user_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `User` (`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `Parenting_student_id_User_user_id_fk` FOREIGN KEY (`student_id`) REFERENCES `User` (`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Parenting`
--

LOCK TABLES `Parenting` WRITE;
/*!40000 ALTER TABLE `Parenting` DISABLE KEYS */;
INSERT INTO `Parenting` VALUES (1,19,22,'PARENT','2026-01-19 20:31:29'),(3,22,13,'PARENT','2026-01-19 22:25:02');
/*!40000 ALTER TABLE `Parenting` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Permission`
--

DROP TABLE IF EXISTS `Permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `Permission` (
  `perm_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  PRIMARY KEY (`perm_id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Permission`
--

LOCK TABLES `Permission` WRITE;
/*!40000 ALTER TABLE `Permission` DISABLE KEYS */;
INSERT INTO `Permission` VALUES (1,'MANAGE_USERS','Create, update, deactivate users','ACTIVE'),(2,'MANAGE_ROLES','Manage roles and permissions','ACTIVE'),(3,'MANAGE_ACADEMICS','Manage academic structures','ACTIVE'),(4,'MANAGE_CLASSES','Manage classes and groups','ACTIVE'),(5,'MARK_ATTENDANCE','Mark student attendance','ACTIVE'),(6,'VIEW_ATTENDANCE','View attendance','ACTIVE'),(7,'ENTER_MARKS','Enter assessment marks','ACTIVE'),(8,'VIEW_RESULTS','View exam results','ACTIVE'),(9,'MANAGE_FEES','Manage fee structures and payments','ACTIVE'),(10,'VIEW_FINANCE','View finance reports','ACTIVE'),(11,'SEND_ANNOUNCEMENTS','Publish announcements','ACTIVE'),(12,'UPLOAD_DOCUMENTS','Upload documents','ACTIVE'),(13,'SUPER_ADMIN_DASHBOARD','Permission for super admin dashboard access with overall system overview','ACTIVE'),(14,'VIEW_MY_ASSIGNED_SUBJECTS','Permission for teachers to view their assigned subjects, grades, and enrolled students','ACTIVE'),(15,'TEACHER_DASHBOARD','Permission for teachers to access their personalized dashboard with relevant information and summaries','ACTIVE'),(16,'VIEW_PROGRAM_USERS','Can view users assigned to programs they lead','ACTIVE'),(17,'VIEW_PROGRAM_ACADEMICS','Can view academic details for programs they are assigned to','ACTIVE'),(18,'ENABLE_DISABLE_USERS','Can enable or disable user accounts','ACTIVE'),(19,'CHANGE_USER_ROLES','Can change user roles and assign roles to users','ACTIVE'),(20,'MANAGE_PROGRAM_LEADS','Can assign and remove program leads','ACTIVE'),(21,'ASSIGN_TEACHER_SUBJECTS','Can assign and remove subjects from teachers','ACTIVE'),(22,'MANAGE_STUDENT_ENROLLMENTS','Can enroll and unenroll students from subjects','ACTIVE'),(23,'ASSIGN_STUDENT_CLASS_GROUPS','Can assign and remove students from class groups','ACTIVE'),(24,'ASSIGN_GRADE_TO_CLASS_TEACHER','Can assign and remove grades from class teachers','ACTIVE'),(25,'VIEW_USERS_BY_CLASS_TEACHER_GRADE','Can view users assigned to grades that the logged user is assigned to','ACTIVE'),(26,'VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE','Can view subjects in grades that the logged user is assigned to','ACTIVE'),(27,'ACCESS_REPORT_CARD_MODULE','Permission to access the report card module','ACTIVE'),(28,'UPDATE_USER_PROFILE_INFO','Update user profile information','ACTIVE'),(29,'MANAGE_SCHOOLS','Permission to manage schools/tenants','ACTIVE'),(30,'MANAGE_SYSTEMS','Permission to manage systems/modules','ACTIVE'),(31,'ASSIGN_SCHOOL_SYSTEMS','Permission to assign systems to schools and roles','ACTIVE'),(32,'MANAGE_SSO_CLIENTS','Manage SSO client applications and their callback URIs','ACTIVE'),(33,'MANAGE_ACADEMIC_CALENDAR','Can create, update, and delete calendar slots and activities','ACTIVE'),(34,'VIEW_ACADEMIC_CALENDAR','Can view the academic calendar','ACTIVE'),(35,'MANAGE_CALENDAR_NOTIFICATIONS','Can manage notification preferences for calendar','ACTIVE'),(36,'VIEW_CALENDAR_NOTIFICATIONS','Can view notification preferences','ACTIVE'),(37,'VIEW_MY_CALENDAR','Can view personal calendar with assigned subjects','ACTIVE'),(38,'VIEW_LESSON_PLANS','Can view lesson plans from calendar','ACTIVE'),(39,'VIEW_STUDENT_CALENDAR','Student can view their enrolled subjects calendar','ACTIVE'),(40,'VIEW_CALENDAR_SUBJECT_LESSON_PLAN','View full details of a course lesson plan from the academic calendar','ACTIVE'),(41,'STUDENT_VIEW_LESSON_PLAN_SUMMARY','View a summary (title and big question) of a course lesson plan','ACTIVE'),(42,'CREATE_ACADEMIC_CALENDAR','Can create new academic calendars for a class group','ACTIVE'),(43,'UPDATE_CALENDAR_SLOT','Can create and update calendar slot details (subject/teacher/time)','ACTIVE'),(44,'VIEW_ALL_LOGS_HISTORY','Permission to view all system activity logs history','ACTIVE'),(45,'VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST','VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST','ACTIVE'),(46,'VALIDATE_SCHEME_OF_WORK','Allows users to approve or reject schemes of work','ACTIVE'),(47,'GENERATE_REPORTS','GENERATE_REPORTS','ACTIVE'),(48,'SUBMIT_REPORTING','Can submit weekly instructor reports','ACTIVE'),(49,'ALL_SUBMITTED_REPORTS','ALL_SUBMITTED_REPORTS','ACTIVE'),(50,'MANAGE_CURRICULUM','Create/edit/delete competencies, criteria, and document categories','ACTIVE'),(51,'UPLOAD_SUBJECT_DOCUMENTS','Upload/delete documents in subject material categories','ACTIVE'),(52,'VIEW_REPORTS','View lesson/mentorship/project reports and admin analytics (read-only)','ACTIVE'),(53,'EXPORT_REPORTS','Export/download reporting data (CSV, PDF, rollup)','ACTIVE'),(54,'MANAGE_REPORTS','Manage reporting lookup lists (Support/Challenge categories) and future admin edit/delete actions','ACTIVE'),(55,'MANAGE_MENTOR_ASSIGNMENTS','Assign/reassign/end mentor-student relationships per academic year','ACTIVE'),(56,'SUBMIT_MENTEE_CHECKIN','Student can submit a check-in/comment to their assigned mentor','ACTIVE'),(57,'VIEW_SUBJECT_DOCUMENTS','View subject material categories and documents for subjects the user teaches or is enrolled in','ACTIVE'),(58,'DOWNLOAD_SUBJECT_DOCUMENTS','Download a specific subject material attachment for subjects the user teaches or is enrolled in','ACTIVE'),(59,'VIEW_MY_ENROLLED_SUBJECTS','View the list of subjects the student is enrolled in, plus each subject\'s overview and curriculum','ACTIVE'),(60,'VIEW_SUBJECT_ENROLLED_STUDENTS','View the roster of students enrolled in a subject (Students tab on the subject page)','ACTIVE'),(61,'MANAGE_LESSON_NOTES','Create, edit, generate with AI, and share lesson notes for subjects the teacher is assigned to','ACTIVE'),(62,'VIEW_SHARED_LESSON_NOTES','View lesson notes a teacher has shared with the student (read-only)','ACTIVE'),(63,'DATABASE_MANAGEMENT','Permission to access the Database Management tool (browse/edit tables, run SQL queries)','ACTIVE');
/*!40000 ALTER TABLE `Permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Program`
--

DROP TABLE IF EXISTS `Program`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `Program` (
  `program_id` bigint(20) NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Program`
--

LOCK TABLES `Program` WRITE;
/*!40000 ALTER TABLE `Program` DISABLE KEYS */;
INSERT INTO `Program` VALUES (5,'Nursery Program',NULL),(6,'Primary Program',NULL),(7,'Lower Secondary Program',NULL),(8,'Coding Academy',NULL),(9,'IGCSE','International General Certificate of Secondary Education'),(10,'Advanced Level',NULL),(11,'AS Level',NULL);
/*!40000 ALTER TABLE `Program` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ReportLesson`
--

DROP TABLE IF EXISTS `ReportLesson`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ReportLesson` (
  `lesson_report_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `report_id` bigint(20) NOT NULL,
  `lesson_title` varchar(255) DEFAULT NULL,
  `planned` tinyint(4) DEFAULT '1',
  `delivered` tinyint(4) DEFAULT '1',
  `notes` text,
  PRIMARY KEY (`lesson_report_id`),
  KEY `RL_report_id_fk` (`report_id`),
  CONSTRAINT `RL_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport` (`report_id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ReportLesson`
--

LOCK TABLES `ReportLesson` WRITE;
/*!40000 ALTER TABLE `ReportLesson` DISABLE KEYS */;
INSERT INTO `ReportLesson` VALUES (11,1,'[N/A] SPEWI302, Development of Web User Interface: LO1 - Optimize websites for search engines',1,1,'How can we optimize our websites to rank better in search engines and increase visibility?'),(12,1,'[N/A] SPEWI302, Development of Web User Interface: LO2 - Implement SEO best practices',1,1,'How can we optimize our websites to rank better in search engines and increase visibility?'),(13,1,'[N/A] SPEWI302, Development of Web User Interface: LO3 - Create and manage sitemaps',1,1,'How can we optimize our websites to rank better in search engines and increase visibility?'),(14,1,'[N/A] SPEWI302, Development of Web User Interface: LO4 - Use proper metadata and keywords',1,1,'How can we optimize our websites to rank better in search engines and increase visibility?'),(15,1,'[N/A] SPEWI302, Development of Web User Interface: LO5 - Understand search ranking factors',1,1,'How can we optimize our websites to rank better in search engines and increase visibility?');
/*!40000 ALTER TABLE `ReportLesson` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ReportProjectUpdate`
--

DROP TABLE IF EXISTS `ReportProjectUpdate`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ReportProjectUpdate` (
  `project_update_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `report_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `project_name` varchar(255) DEFAULT NULL,
  `role` varchar(100) DEFAULT NULL,
  `work_completed` text,
  `status` enum('ON_TRACK','AT_RISK','DELAYED','COMPLETE') DEFAULT 'ON_TRACK',
  `key_outputs` text,
  `challenges` text,
  PRIMARY KEY (`project_update_id`),
  KEY `RPU_report_id_fk` (`report_id`),
  KEY `idx_rpu_user_id` (`user_id`),
  CONSTRAINT `fk_rpu_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ReportProjectUpdate`
--

LOCK TABLES `ReportProjectUpdate` WRITE;
/*!40000 ALTER TABLE `ReportProjectUpdate` DISABLE KEYS */;
INSERT INTO `ReportProjectUpdate` VALUES (2,1,15,'NGA MIS','','Reporting module','ON_TRACK',NULL,NULL);
/*!40000 ALTER TABLE `ReportProjectUpdate` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ReportReflection`
--

DROP TABLE IF EXISTS `ReportReflection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ReportReflection` (
  `reflection_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `report_id` bigint(20) NOT NULL,
  `what_worked_well` text,
  `improvement_areas` text,
  `academic_support_needed` text,
  `technical_support_needed` text,
  `infrastructure_support_needed` text,
  `coordination_support_needed` text,
  PRIMARY KEY (`reflection_id`),
  KEY `RR_report_id_fk` (`report_id`),
  CONSTRAINT `RR_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport` (`report_id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ReportReflection`
--

LOCK TABLES `ReportReflection` WRITE;
/*!40000 ALTER TABLE `ReportReflection` DISABLE KEYS */;
INSERT INTO `ReportReflection` VALUES (2,1,'N/A','N/A','N/A','N/A','N/A','N/A');
/*!40000 ALTER TABLE `ReportReflection` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ReportTopic`
--

DROP TABLE IF EXISTS `ReportTopic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `ReportTopic` (
  `topic_report_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `report_id` bigint(20) NOT NULL,
  `topic_name` text,
  `is_planned_for_next_week` tinyint(4) DEFAULT '0',
  PRIMARY KEY (`topic_report_id`),
  KEY `RT_report_id_fk` (`report_id`),
  CONSTRAINT `RT_report_id_fk` FOREIGN KEY (`report_id`) REFERENCES `InstructorReport` (`report_id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ReportTopic`
--

LOCK TABLES `ReportTopic` WRITE;
/*!40000 ALTER TABLE `ReportTopic` DISABLE KEYS */;
INSERT INTO `ReportTopic` VALUES (3,1,'[SPEWI302] Development of Web User Interface: Optimize a web page for search engines, Ways to optimize the website Sitemap Key works (HTML element) Webmaster Description Page structure Google site verification',0);
/*!40000 ALTER TABLE `ReportTopic` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Role`
--

DROP TABLE IF EXISTS `Role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `Role` (
  `role_id` bigint(20) NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Role`
--

LOCK TABLES `Role` WRITE;
/*!40000 ALTER TABLE `Role` DISABLE KEYS */;
INSERT INTO `Role` VALUES (1,'SUPER_ADMIN','Full system control','ACTIVE'),(2,'ADMIN','School management','ACTIVE'),(3,'HEAD_TEACHER','Academic oversight','ACTIVE'),(4,'TEACHER','Teaching staff','ACTIVE'),(5,'ACCOUNTANT','Finance management','ACTIVE'),(6,'STUDENT','Learner','ACTIVE'),(7,'PARENT','Parent/Guardian','ACTIVE'),(8,'STAFF','Support staff','ACTIVE'),(11,'CLASS_TEACHER','Someone who is leading a class','ACTIVE'),(12,'PROGRAM_MANAGER','Program Project Manager','ACTIVE');
/*!40000 ALTER TABLE `Role` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `RolePermission`
--

DROP TABLE IF EXISTS `RolePermission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `RolePermission` (
  `role_id` bigint(20) NOT NULL,
  `perm_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `RolePermission`
--

LOCK TABLES `RolePermission` WRITE;
/*!40000 ALTER TABLE `RolePermission` DISABLE KEYS */;
INSERT INTO `RolePermission` VALUES (3,3),(3,4),(3,6),(7,6),(8,6),(3,8),(7,8),(3,11),(11,25),(11,26),(11,33),(11,34),(11,14),(11,38),(11,48),(12,16),(12,17),(12,46),(12,49),(2,1),(2,2),(2,3),(2,4),(2,9),(2,10),(2,11),(2,12),(2,29),(2,30),(2,31),(2,45),(2,42),(2,33),(2,35),(2,43),(2,34),(2,36),(2,40),(2,38),(2,37),(12,52),(12,53),(12,54),(1,1),(1,2),(1,3),(1,4),(1,5),(1,6),(1,7),(1,8),(1,9),(1,10),(1,11),(1,12),(1,13),(1,18),(1,19),(1,20),(1,21),(1,22),(1,23),(1,24),(1,27),(1,28),(1,29),(1,30),(1,31),(1,33),(1,34),(1,35),(1,36),(1,38),(1,37),(1,44),(1,45),(1,46),(1,49),(1,42),(1,43),(1,40),(1,50),(1,51),(1,52),(1,53),(1,54),(1,55),(5,9),(5,10),(4,5),(4,6),(4,7),(4,8),(4,14),(4,37),(4,38),(4,36),(4,35),(4,47),(4,48),(4,51),(4,12),(4,15),(4,50),(6,6),(6,8),(6,39),(6,56),(6,41),(6,57),(6,58),(6,59),(2,22),(3,22),(2,23),(3,23),(4,61),(3,61),(11,61),(6,62),(1,63);
/*!40000 ALTER TABLE `RolePermission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `RoleSystemFragment`
--

DROP TABLE IF EXISTS `RoleSystemFragment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `RoleSystemFragment` (
  `fragment_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `school_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL,
  `system_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`fragment_id`),
  UNIQUE KEY `unique_role_system_school` (`school_id`,`role_id`,`system_id`),
  CONSTRAINT `RoleSystemFragment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School` (`school_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `RoleSystemFragment`
--

LOCK TABLES `RoleSystemFragment` WRITE;
/*!40000 ALTER TABLE `RoleSystemFragment` DISABLE KEYS */;
INSERT INTO `RoleSystemFragment` VALUES (5,1,2,1,'2026-01-20 01:58:35'),(6,1,11,1,'2026-01-20 01:58:43');
/*!40000 ALTER TABLE `RoleSystemFragment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SSOCode`
--

DROP TABLE IF EXISTS `SSOCode`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SSOCode` (
  `code_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `system_id` bigint(20) NOT NULL,
  `expires_at` datetime NOT NULL,
  `is_used` tinyint(4) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code_id`),
  UNIQUE KEY `code_unique_idx` (`code`),
  KEY `SSOCode_user_id_fk` (`user_id`),
  KEY `SSOCode_system_id_fk` (`system_id`),
  CONSTRAINT `SSOCode_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System` (`system_id`) ON DELETE CASCADE,
  CONSTRAINT `SSOCode_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SSOCode`
--

LOCK TABLES `SSOCode` WRITE;
/*!40000 ALTER TABLE `SSOCode` DISABLE KEYS */;
INSERT INTO `SSOCode` VALUES (1,'6ee9619cab657296c689669b0f026bea469175e23a142561101e81a135ce9e57',1,2,'2026-01-26 09:55:32',0,'2026-01-26 11:54:31'),(2,'afeb55735d514280489f6bd687eb8498d1eaaca65071360699025beeb3523ee9',1,2,'2026-01-26 09:58:00',0,'2026-01-26 11:56:59'),(3,'e8f06c613a9b346bd211d332e0d5102a7b828d4ccb24f69304b7299caae18ef1',1,2,'2026-01-26 09:58:23',0,'2026-01-26 11:57:23'),(4,'625b7431662f0d427899cea7fafb124ea9189658474f9e043c9da343e0bdd543',1,2,'2026-01-26 10:00:01',0,'2026-01-26 11:59:00'),(5,'2d2b99065931b66f58ff6bc6a0999c6c88f76f03a955f56eec211be06fd7bb78',1,2,'2026-01-26 10:01:14',0,'2026-01-26 12:00:13'),(6,'398de2984bae5d756fc29d18971db21973be8e74ded9fab87a88d1cb5a9f8e5b',1,2,'2026-01-26 10:01:35',0,'2026-01-26 12:00:35'),(7,'df1e3f2d480baeb27aa05b9c66a3c8d3c5c02ab863220659f1679311fe7ebeec',1,2,'2026-01-26 10:08:32',0,'2026-01-26 12:07:31'),(8,'0069ae6c0f700d0b59b97967b878afd923a4e7571888edd11c4ab64ba8e99c42',1,2,'2026-01-26 16:26:24',0,'2026-01-26 18:25:24'),(9,'57856a9cfe415a0bd61fb1609ab5c9355e08790da92a06f86bd5a36cde37bdeb',1,2,'2026-02-02 21:43:21',0,'2026-02-02 23:42:20'),(10,'7f1fb318697a61fa931242c8a2023dd8b376b612b4fb7dda4881e1372cf5270c',23,2,'2026-02-02 21:52:18',0,'2026-02-02 23:51:18'),(11,'298fa754110268f0b990ce72bcaa0b102d120afa6da5dd7406cdde71f10f09eb',23,2,'2026-02-02 21:52:35',0,'2026-02-02 23:51:35'),(12,'13b601926101b137a5cc5e3ae41c2e2765207a8bf0a81854c7e29f070d7c598c',23,2,'2026-02-02 21:52:59',0,'2026-02-02 23:51:58'),(13,'9ed896b4724679f154de77110057af99d1ac29539a19cd8d9beb8c3c22153f25',23,2,'2026-02-02 21:53:11',0,'2026-02-02 23:52:10'),(14,'ca1d4e9d98f7f0ab0ea9449d1b8472c5fe98ec8244f144c7aa61c6b32bb9bd00',23,2,'2026-02-02 21:55:53',0,'2026-02-02 23:54:53'),(15,'da8d9b38f94c23461b32dc56ea988ac6a32ba254f6ca7cf2a83b677db49539b1',23,2,'2026-02-02 21:58:00',0,'2026-02-02 23:57:00'),(16,'70817b0a81ae77821c2769328247845e1812b2eb2941e1fd1b5bfa4b5c5c106e',23,2,'2026-02-02 21:59:39',0,'2026-02-02 23:58:38'),(17,'19ea87e273260ecb9f5a97818cacde3e396a56de9acf5f3ae5db743451f4dc91',23,2,'2026-02-02 22:01:21',0,'2026-02-03 00:00:20'),(18,'771b84cf688d181d1c852f0b843858936507a05d74d1362b70deb3be961b28d3',23,2,'2026-02-02 22:01:29',0,'2026-02-03 00:00:28'),(19,'0b8cf4088548783620baf1a3122905a3dab8590278fe580d690b624a03eaa63f',1,2,'2026-02-02 22:03:03',0,'2026-02-03 00:02:02'),(20,'a0f3883279845b13cbca134c958354f78545a1d1b9fab1bee930d71dcec9fb38',23,2,'2026-02-02 22:03:52',0,'2026-02-03 00:02:51'),(21,'34d2f28bf57d9b3959cc30ad8f39bab47980eb6a8b82c2423565ba49b204b56c',23,2,'2026-02-02 22:06:45',1,'2026-02-03 00:05:45'),(22,'b5eaee81ab0ff136cdc5b24484ecb695097240e984c9e1013488ea1cf536619f',23,2,'2026-02-03 23:05:09',1,'2026-02-04 01:04:08'),(23,'ea9ee0ef25a7f967da1b714c4111d391177230f19abd0c8796fd6b821eee502e',23,2,'2026-02-03 23:06:05',1,'2026-02-04 01:05:04'),(24,'c806fee6c5d58e671096e270e1a071113a0723d29adabda1356f388b469b6b15',23,2,'2026-02-03 23:13:43',0,'2026-02-04 01:12:42'),(25,'3b90410243460630294a49dc8e0b6d3e53b56f635ae9a0c9060dc66a5789754e',23,2,'2026-02-03 23:13:43',1,'2026-02-04 01:12:42'),(26,'02667fc6daad82d9f874fe12bf44679d99e17dc40cac6d65db6589e3856f2782',23,2,'2026-02-03 23:16:17',1,'2026-02-04 01:15:17'),(27,'0fa9ad683dcce60cb73080266dbcdff7a79dc80d1e30505bee3f6b4063672bce',15,2,'2026-02-03 23:26:54',1,'2026-02-04 01:25:54'),(28,'d5610bd3b0cad43bc1fdb5c846be1d92e327d533ee4a1ede8f0c8e1bf27c38e3',23,2,'2026-02-04 13:34:17',1,'2026-02-04 15:33:17'),(29,'21bea7b8b2ffcfd859951ca7e25e9392b75683dcfda3bf7769b33b3ee097ea39',15,2,'2026-02-04 13:40:58',1,'2026-02-04 15:39:58'),(30,'aca3c59f53a8cfdb2c54609eb1bb77cbba9d660e9d9029e1b99532c1be52ad02',23,2,'2026-02-04 13:46:02',1,'2026-02-04 15:45:02'),(31,'2fde8e2acca15fac5db8a3679a015d43dd025e2eff7e391813f0d555c6331ec1',15,2,'2026-02-04 16:23:51',1,'2026-02-04 18:22:51'),(32,'62034a4f4fed6a73868f3d8cdbfacd0a6b9cc5c61543c9107c1ca218583b1c38',23,2,'2026-02-04 22:38:46',1,'2026-02-05 00:37:46'),(33,'ee515a552c0a84695c1efb211294f7d86e1c870f5c1d34a52db65848989b5551',15,2,'2026-02-07 16:41:48',0,'2026-02-07 18:40:47'),(34,'8cafb67423eea571df2e0eca67e893866b8c8469a2879af0f3bc35672a585385',15,2,'2026-02-07 21:05:37',0,'2026-02-07 23:04:36'),(35,'9ff07e457c3542c862c76955488bdbf6d220697a90c28dc63b587e9eecc798f9',15,2,'2026-02-07 21:06:15',0,'2026-02-07 23:05:15'),(36,'5aef2ffb781f99181ce75979321bb1151c89cb8f3d201055b263f0b62c32c811',15,2,'2026-02-07 21:07:41',0,'2026-02-07 23:06:41'),(37,'83f98ac9bfefadc813ba12ac8cbc3308f49ad1ea866249296d81a0b3e704a113',15,2,'2026-02-07 21:08:26',1,'2026-02-07 23:07:26'),(38,'5a36cf314339eae0932478819bf9542206896e42b455a276d08a216fb639a419',15,2,'2026-02-23 18:50:01',0,'2026-02-23 20:49:01'),(39,'ec301af29c7a96eb828334cf0e53bddaa1cd596042e81aa1417a6c7e789ade1e',15,2,'2026-02-23 18:51:04',1,'2026-02-23 20:50:03'),(40,'738537fdc280cf27774c11010c585f423a68b0cadd8cf29ab39168ada16942ea',15,2,'2026-02-23 18:51:15',1,'2026-02-23 20:50:15'),(41,'22a118e62847ef13d6bfb34d0248dfcdf0e84bbf61e44781f9a022827c7b4264',23,2,'2026-02-23 18:57:54',1,'2026-02-23 20:56:54'),(42,'d4c95480f7afd137b9daa18b9f317f59beede7622e7bee60e803d2ced0f95c91',15,2,'2026-02-23 22:21:52',1,'2026-02-24 00:20:52'),(43,'5df8630ade457c5999a6649fc870306ed6a711251c8703ef6abbf48d2dcc79b8',15,2,'2026-02-23 22:55:05',1,'2026-02-24 00:54:05'),(44,'37a40dd2985cf1c5be184ddcced30c0e0078c0ef037c5b1c765738a0b4329217',23,2,'2026-02-23 22:56:06',1,'2026-02-24 00:55:05'),(45,'01df3b5a42453c90735ab8b5b51a7daa8a92e6fb6cba515975ffe91cbc04f55a',23,2,'2026-02-23 22:56:30',1,'2026-02-24 00:55:30'),(46,'2d0ccffec367ee7546a7d59d65ecd8152fd44d5d9aa529add5dbd9622a21a635',15,2,'2026-02-23 22:57:36',1,'2026-02-24 00:56:36'),(47,'e67bc8ce698307d4f1666d7ab6655dc1afeb4e05544ad70d594a1e9dbc088d54',23,2,'2026-02-23 23:41:21',1,'2026-02-24 01:40:21'),(48,'15e3bab06c1c0a0c37d1897bad7b8f3db1bba7ff4d67eed3d43738a608f16a47',15,2,'2026-02-24 08:19:07',1,'2026-02-24 10:18:07'),(49,'2f75562081011bb23b71bb0fb9520567b664f3544a9a4fb8aea6aecbbd9f481f',15,2,'2026-02-25 13:53:35',1,'2026-02-25 15:52:34'),(50,'2e2cac00cde06c92763beca108492548da7594c09fbbbb54ec6c0a6e60bbdc07',23,2,'2026-02-26 16:28:47',1,'2026-02-26 18:27:47'),(51,'5564e320fa9d0938ced78b64bad18fa2c4527876a95d7f52c9bd2686f66c3638',15,2,'2026-02-26 16:29:53',1,'2026-02-26 18:28:53'),(52,'6c281664737125663d73c93f673dca487d93012ed258894897bf4ab8a49dd195',15,2,'2026-02-27 18:31:59',1,'2026-02-27 20:30:58'),(53,'08da10941ac264676b2c04c97ec3515306f28a3b44dcda88ebeca9cbdf61cff9',1,2,'2026-02-28 14:27:46',1,'2026-02-28 16:26:46'),(54,'83b95dc1d45642b687f2fa1df43ea012d824508fc4bb556fc34f474c0764efdf',23,2,'2026-02-28 16:30:17',1,'2026-02-28 18:29:16'),(55,'aacd83b99c3888605ae5f8732d0c4d79c413533d2befa616dfcca5b3b7521144',15,2,'2026-03-01 10:13:34',1,'2026-03-01 12:12:33'),(56,'31b880db3d96c044648a8a9d1f0f98d2e4770981adf833aa093410f06793f698',23,2,'2026-03-01 16:33:05',1,'2026-03-01 18:32:04'),(57,'a990ec9a43f3aae92a0d19dd571ae00a306241596503a2773d3e76603750fe88',15,2,'2026-03-02 10:27:40',1,'2026-03-02 12:26:39'),(58,'7fe7b65423f39e4fed7385a38d794dd5aaed73320027568eece5b39d86da3a9d',23,2,'2026-03-02 17:49:11',1,'2026-03-02 19:48:10'),(59,'6cfd70277712dcd4b26d53620c2f16c9b6044156eb7dd143c14a20b7a07ec155',15,2,'2026-03-09 09:15:36',1,'2026-03-09 11:14:36'),(60,'3c164424f01a0240830b70cabde7aaa0d6a641dd70938e496fa45051d0fc4ff0',15,2,'2026-03-10 12:51:26',1,'2026-03-10 14:50:25'),(61,'dad3d9d65002fb503d8a9cfc1978159071010a9b0c7f694a99d9a0ed41b85ab0',15,2,'2026-04-29 19:55:59',0,'2026-04-29 21:50:59'),(62,'f59151254f7ac9739ebaa064ea7fe256d7d1fe68ff14a0a9f880b37c70eee4be',15,2,'2026-04-29 20:01:13',1,'2026-04-29 21:56:13'),(63,'464471096c15366dc2729d27e610f517740a84b0237bac5cfa7c3383c6cd583e',1,2,'2026-05-06 19:44:56',0,'2026-05-06 21:39:56'),(64,'0c1be6cdbcf69e58d14a27a511826faf2cd3745517249bc74b36b5fedb8eb6b4',15,2,'2026-05-11 07:42:46',0,'2026-05-11 09:37:45'),(65,'f4955dd4eb8f76afe7d4fc99c1151203eba4d63d912cb7afcffc8256980fceb4',15,2,'2026-05-31 13:25:04',0,'2026-05-31 15:20:04'),(66,'579b06ca86afda62536cfc0529c9516f5304e2022fc3197cc64c51ee14947ce4',15,2,'2026-05-31 13:25:17',0,'2026-05-31 15:20:16'),(67,'6bf0723d046747f4b44581c3d69fa425276ba5d07c3eef8260eb3d5f9f41bbab',15,2,'2026-05-31 13:28:32',0,'2026-05-31 15:23:31'),(68,'d4afff03861a87c5a5de782dc11f5602eaf775c1df472f37e9e904cc9f3fb7cd',15,2,'2026-05-31 13:30:21',0,'2026-05-31 15:25:21'),(69,'7bb20df6aedf911202aade38085aee2cb0cb32cd0d75ca2f9eb9f02ea965f9a6',15,2,'2026-05-31 13:30:52',1,'2026-05-31 15:25:52'),(70,'d50d5c42478af78f64cdc0cfa1e75c327c681bcab7ab21cdfd728daaf8f19962',15,2,'2026-05-31 14:02:34',1,'2026-05-31 15:57:33'),(71,'0df670b380bbb15aaa6c595d3601fa178edf98fc0abf4cb591ee979817faa18f',23,2,'2026-08-02 17:29:01',0,'2026-08-02 19:24:01'),(72,'55dde46b5d91547cdf9cdcf31facb96b6d0fc029fc7c65cac78d1b94f742bcfd',15,2,'2026-08-06 12:14:42',1,'2026-08-06 14:09:41'),(73,'715a739354d59f75ee08beb05bf9c16a093c22fce52c27ce8a8683dd39987751',15,2,'2026-08-06 12:15:16',1,'2026-08-06 14:10:16'),(74,'8b239e74f78e986577269575dc9df2f84e18c7f53f8fddd81d198e4bfb79ef55',15,2,'2026-08-06 12:29:04',1,'2026-08-06 14:24:03'),(75,'1a7a314e71c2a5758075c698c0f904cad90ad177a46693121b7751d265c89462',1,4,'2026-08-15 14:36:28',1,'2026-08-15 16:31:27'),(76,'372a3b8fcdd456cb25fb3085e980710ebb8473571ac7b7f85ff4921a1613c2de',1,4,'2026-08-15 14:47:00',1,'2026-08-15 16:41:59'),(77,'18448c26ea9538e2a9cfffbd60e9a3a82fc8cd633c7bd5548346bcc250b428a8',1,4,'2026-08-15 14:48:29',1,'2026-08-15 16:43:28');
/*!40000 ALTER TABLE `SSOCode` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SchemeEntryCriteria`
--

DROP TABLE IF EXISTS `SchemeEntryCriteria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SchemeEntryCriteria` (
  `entry_id` bigint(20) NOT NULL,
  `criteria_id` bigint(20) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`entry_id`,`criteria_id`),
  KEY `idx_sec_criteria` (`criteria_id`),
  CONSTRAINT `fk_sec_criteria` FOREIGN KEY (`criteria_id`) REFERENCES `CompetencyPerformanceCriteria` (`criteria_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sec_entry` FOREIGN KEY (`entry_id`) REFERENCES `SchemeOfWorkEntry` (`entry_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SchemeEntryCriteria`
--

LOCK TABLES `SchemeEntryCriteria` WRITE;
/*!40000 ALTER TABLE `SchemeEntryCriteria` DISABLE KEYS */;
INSERT INTO `SchemeEntryCriteria` VALUES (139,14,'2026-08-04 12:07:57'),(140,16,'2026-08-04 12:07:57'),(141,15,'2026-08-04 12:07:57'),(142,17,'2026-08-04 12:07:57'),(142,18,'2026-08-04 12:07:57'),(142,19,'2026-08-04 12:07:57'),(143,17,'2026-08-04 12:07:57'),(143,19,'2026-08-04 12:07:57'),(144,16,'2026-08-04 12:07:57'),(145,20,'2026-08-04 12:07:57'),(146,21,'2026-08-04 12:07:57'),(147,22,'2026-08-04 12:07:57'),(148,23,'2026-08-04 12:07:57'),(149,21,'2026-08-04 15:03:43'),(149,22,'2026-08-04 15:03:43'),(149,23,'2026-08-04 15:03:43'),(150,14,'2026-08-04 15:35:07'),(151,14,'2026-08-04 15:35:07'),(151,16,'2026-08-04 15:35:07'),(152,16,'2026-08-04 15:35:07'),(153,15,'2026-08-04 15:35:07'),(154,17,'2026-08-04 15:35:07'),(155,17,'2026-08-04 15:35:07'),(156,17,'2026-08-04 15:35:07'),(157,16,'2026-08-04 15:35:07'),(157,19,'2026-08-04 15:35:07'),(158,16,'2026-08-04 15:35:07'),(159,20,'2026-08-04 15:35:07'),(160,16,'2026-08-04 15:35:07'),(160,21,'2026-08-04 15:35:07'),(161,22,'2026-08-04 15:35:07'),(162,23,'2026-08-04 15:35:07'),(163,14,'2026-08-05 21:16:25'),(164,15,'2026-08-05 21:16:25'),(164,16,'2026-08-05 21:16:25'),(165,17,'2026-08-05 21:16:25'),(166,17,'2026-08-05 21:16:25'),(166,18,'2026-08-05 21:16:25'),(167,16,'2026-08-05 21:16:25'),(167,17,'2026-08-05 21:16:25'),(167,19,'2026-08-05 21:16:25'),(168,17,'2026-08-05 21:16:25'),(169,15,'2026-08-05 21:16:25'),(169,17,'2026-08-05 21:16:25'),(169,19,'2026-08-05 21:16:25'),(170,16,'2026-08-05 21:16:25'),(171,20,'2026-08-05 21:16:25'),(172,16,'2026-08-05 21:16:25'),(172,21,'2026-08-05 21:16:25'),(173,22,'2026-08-05 21:16:25'),(174,23,'2026-08-05 21:16:25');
/*!40000 ALTER TABLE `SchemeEntryCriteria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SchemeOfWork`
--

DROP TABLE IF EXISTS `SchemeOfWork`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SchemeOfWork` (
  `scheme_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) NOT NULL,
  `academic_term_id` bigint(20) NOT NULL,
  `validation_status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `validation_comment` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `source` enum('MANUAL','DOCX_IMPORT','AI_GENERATED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MANUAL',
  `ai_source_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`scheme_id`),
  KEY `SchemeOfWork_user_id_fk` (`user_id`),
  KEY `SchemeOfWork_subject_id_fk` (`subject_id`),
  KEY `SchemeOfWork_class_group_id_fk` (`class_group_id`),
  KEY `SchemeOfWork_academic_term_id_fk` (`academic_term_id`),
  CONSTRAINT `SchemeOfWork_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm` (`academic_term_id`),
  CONSTRAINT `SchemeOfWork_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup` (`class_group_id`),
  CONSTRAINT `SchemeOfWork_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`),
  CONSTRAINT `SchemeOfWork_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SchemeOfWork`
--

LOCK TABLES `SchemeOfWork` WRITE;
/*!40000 ALTER TABLE `SchemeOfWork` DISABLE KEYS */;
INSERT INTO `SchemeOfWork` VALUES (1,15,9,9,4,'PENDING',NULL,'2026-01-28 12:06:52','2026-01-28 12:06:52','MANUAL',NULL),(6,15,8,9,6,'PENDING',NULL,'2026-07-28 08:15:27','2026-07-28 08:15:27','AI_GENERATED','SPEWI302 -DEVELOPMENT OF WEB USER INTERFACE.pdf'),(13,15,9,9,6,'PENDING',NULL,'2026-07-29 14:40:23','2026-07-29 14:40:23','AI_GENERATED','SPEWI302 -DEVELOPMENT OF WEB USER INTERFACE.pdf'),(14,15,9,9,5,'PENDING',NULL,'2026-07-30 16:51:24','2026-07-30 16:51:24','AI_GENERATED','SPEWI302 -DEVELOPMENT OF WEB USER INTERFACE.pdf'),(18,15,8,9,5,'PENDING',NULL,'2026-08-04 12:07:57','2026-08-04 12:07:57','AI_GENERATED','SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf'),(19,15,8,9,4,'PENDING',NULL,'2026-08-04 15:35:07','2026-08-04 15:35:07','AI_GENERATED','SPEGI302  -   GRAPHIC USER INTERFACE DESIGN (2).pdf'),(20,15,8,41,7,'PENDING',NULL,'2026-08-05 21:16:25','2026-08-05 21:16:25','AI_GENERATED','SPEGI302  -   GRAPHIC USER INTERFACE DESIGN.pdf');
/*!40000 ALTER TABLE `SchemeOfWork` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SchemeOfWorkEntry`
--

DROP TABLE IF EXISTS `SchemeOfWorkEntry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SchemeOfWorkEntry` (
  `entry_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `scheme_id` bigint(20) NOT NULL,
  `week_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `topic` text COLLATE utf8mb4_unicode_ci,
  `sub_topic` text COLLATE utf8mb4_unicode_ci,
  `objective` text COLLATE utf8mb4_unicode_ci,
  `methodology` text COLLATE utf8mb4_unicode_ci,
  `resources` text COLLATE utf8mb4_unicode_ci,
  `evaluation` text COLLATE utf8mb4_unicode_ci,
  `is_completed` tinyint(4) DEFAULT '0',
  `validation_status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `validation_comment` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `duration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `learning_place` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observation` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`entry_id`),
  KEY `SchemeOfWorkEntry_scheme_id_fk` (`scheme_id`),
  CONSTRAINT `SchemeOfWorkEntry_scheme_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `SchemeOfWork` (`scheme_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=175 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SchemeOfWorkEntry`
--

LOCK TABLES `SchemeOfWorkEntry` WRITE;
/*!40000 ALTER TABLE `SchemeOfWorkEntry` DISABLE KEYS */;
INSERT INTO `SchemeOfWorkEntry` VALUES (1,1,'Week 1','2026-01-05','2026-01-09','a. Responsive design Viewport Box-sizing Media Query Breaking point Mobile first design b. Description of CSS Frameworks c. Use the Bootstrap framework. Bootstrap Grid system Containers Columns Rows Bootstrap Layout Jumbotron Tabs Carousel','','Learning outcome 2: Implement responsive design and use CSS frameworks','Individual and Trainer guided','Black/white board, Computer, projector','Back to School Quiz: Quiz 1 on the 8th',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(2,1,'Week 2','2026-01-12','2026-01-16','Navbar Scrollspy Font awesome icons Bootstrap Forms Styling Form validation Progress Bootstrap utilities Styling borders Colors Display Context classes Spacing with Margins and padding Floating Flexbox Position','','Learning outcome 2: Implement responsive design and use CSS frameworks','Individual and Trainer guided','Black/white board, Computer, projector, Reference books','Group Homework',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(3,1,'Week 3','2026-01-19','2026-01-23','Progress Bootstrap utilities Text alignment and transformation Sizing with width and height Lists Table','','Learning outcome 2: Implement responsive design and use CSS frameworks','Individual and Trainer guided','Black/white board, Computer, projector, Reference books','Individual Quiz',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(4,1,'Week 4','2026-01-26','2026-01-30','Use Tailwind CSS Responsive design Breakpoints and media queries Container Typography Backgrounds Borders Columns Box sizing Display Position Use Tailwind CSS Floats Flexbox &amp; Grid Spacing Sizing Table Forms','','Learning outcome 2: Implement responsive design and use CSS frameworks','Individual and Trainer guided','Black/white board, Computer, projector, Reference books','Individual Homework',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(5,1,'Week 5','2026-02-02','2026-02-06','Gather and organize the website contents Defining web contents Define the website mock-up Define types of contents Creating directories Create directories Create sub directories Differentiate Contents according to their types Images Videos Music Types of web pages (News, Entertainment, Business, etc) Create / Develop Contents','','Learning outcome 3: Design a website','Group work and Group discussion','Black/white board, Computer, projector, Reference books','Group Homework',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(6,1,'Week 6','2026-02-09','2026-02-13','Implement web links Creating Links Relative Link Absolute Link HTML Multimedia mp3 mpg mp4 avi webm QuickTime Flash Embedding media Files Videos Music','','Learning outcome 3: Design a website','','Individual work, and Trainer guided','Black/white board, Computer, projector, Reference books',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(7,1,'Week 7','2026-02-16','2026-02-20','Midterm / Holidays','','Midterm','','','',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(8,1,'Week 8','2026-02-23','2026-02-27','Manage a website Deploy a developed website HTTP Protocol Introduction to http protocol Understanding HTTP Basics Introduction to webserver What is a webserver How webserver works Different type of webservers Install Apache2 Deploy the web content Move content to root folder Accessing the website.','','Learning outcome 3: Design a website','Group work, Trainer guided, and Group discussion','Black/white board, Computer, projector, Reference books','Individual Homework',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(9,1,'Week 9','2026-03-02','2026-03-06','Optimize a web page for search engines, Ways to optimize the website Sitemap Key works (HTML element) Webmaster Description Page structure Google site verification','','','Individual work, and Trainer guided','Individual Quiz','',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(10,1,'Week 10','2026-03-09','2026-03-13','Maintain a website Website update Update website Content Feature Addition Maintenance tasks Backup a website Monitor a website Link Check Software update','','','Individual and Trainer guided','Black/white board, Computer, projector, Reference books','Individual Quiz',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(11,1,'Week 11','2026-03-16','2026-03-20','Review','','','Individual and group work, Trainer guided, Group discussion','Projector, Computer, Notebook, Whiteboard, Markers, Printed Exam papers','Mock Exam',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(12,1,'Week 12','2026-03-23','2026-03-27','Finals week','','','','Exam papers, Scratch papers, Markers, clock','End of term II exam',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(13,1,'Week 13','2026-03-30','2026-04-03','Grading and packing','','','','','',0,'APPROVED','You provided correct scheme of work','2026-01-28 12:16:53',NULL,NULL,NULL),(76,6,'Week 1','2026-08-03','2026-08-07','Introduction to Web Design & Basic HTML Structure','','Describe web page components, set up a basic HTML editor, and create a foundational HTML document.','Trainer-guided lecture and demonstration of web page components. Practical session for HTML editor setup and initial HTML file creation.','Computer, projector, HTML editor (e.g., VS Code), reference books.','Practical exercise: Create a basic HTML page with a title and a simple body structure.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab','Ensure all students successfully set up their development environment.'),(77,6,'Week 2','2026-08-10','2026-08-14','Structuring Content with HTML Elements','Block elements, inline elements, headings, paragraphs, breaks, containers (div, section, article).','Differentiate between block and inline elements and effectively use various HTML tags for text and content structuring.','Trainer demonstration of block and inline elements. Individual practical exercises on using headings, paragraphs, breaks, and container elements.','Computer, projector, reference books, HTML editor.','Practical exercise: Create an HTML page structured with headings, paragraphs, and \'div\', \'section\', \'article\' tags.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(78,6,'Week 3','2026-08-17','2026-08-21','Organizing Data and Media in HTML','Ordered lists, unordered lists, description lists, nested lists, tables, HTML media (audio, video).','Create and manage ordered, unordered, and description lists, construct HTML tables, and embed multimedia content.','Hands-on coding session focusing on list and table creation. Guided practice for embedding audio and video using HTML5 media tags.','Computer, projector, sample media files (audio/video), HTML editor.','Practical exercise: Build an HTML page that includes various types of lists, a structured table, and embedded multimedia.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(79,6,'Week 4','2026-08-24','2026-08-28','Interactivity and Advanced HTML Forms','Absolute links, relative links, HTML forms (controls, validation), HTML entities, SVG, figure and figcaption.','Implement different types of links for navigation, design interactive forms with validation, and use semantic HTML elements like SVG and figure.','Practical session on creating various link types and designing HTML forms with different input controls. Discussion on form validation and semantic markup.','Computer, projector, reference books, HTML editor.','Practical exercise: Create an HTML form with multiple input types, basic validation, and linked pages (absolute, relative).',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(80,6,'Week 5','2026-08-31','2026-09-04','Introduction to Cascading Style Sheets (CSS)','CSS Introduction, CSS Syntax, Types of CSS (inline, internal, external), basic selectors (element, class, ID, grouping).','Understand the purpose and syntax of CSS, and apply basic styling using different integration methods and element, class, and ID selectors.','Lecture on CSS fundamentals and syntax. Live coding demonstrations and practical exercises applying basic styles using inline, internal, and external CSS.','Computer, projector, CSS reference materials, HTML editor.','Practical exercise: Style an HTML page using an external CSS stylesheet, applying styles with element, class, and ID selectors.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(81,6,'Week 6','2026-09-07','2026-09-11','Controlling Layout with CSS Box Model','CSS Box Model (borders, margins, padding, height, width), CSS Colors, CSS Backgrounds, CSS Outline.','Understand and apply the CSS Box Model (borders, margins, padding, height, width) to control element spacing, sizing, and visual presentation.','Trainer demonstration of the CSS Box Model using browser developer tools. Hands-on practice applying various box model properties to different HTML elements.','Computer, projector, browser developer tools, reference books.','Practical exercise: Style multiple \'div\' elements, demonstrating clear understanding and application of the box model properties.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(82,6,'Week 7','2026-09-14','2026-09-18','Styling Text, Fonts & Structured Content','CSS Text, CSS Fonts, CSS Icons, CSS Links, CSS Lists, CSS Tables.','Apply CSS properties to style text, fonts, icons, links, lists, and tables for improved readability and aesthetic appeal.','Practical coding exercises focusing on typography and structured content styling. Guided exploration of font resources and icon libraries.','Computer, projector, reference books, online font resources (e.g., Google Fonts), icon libraries.','Practical exercise: Restyle an existing HTML page, focusing on typography, link appearance, and list/table presentation.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(83,6,'Week 8','2026-09-21','2026-09-25','Advanced CSS Layout & Positioning','CSS Display, CSS Position (static, relative, absolute, fixed), CSS Overflow, CSS Float, CSS Alignment, CSS Opacity.','Control element positioning and layout using CSS \'display\', \'position\', \'float\', and \'alignment\' properties.','Guided coding sessions for implementing multi-column layouts using floats and display properties. Debugging layout issues using browser developer tools.','Computer, projector, browser developer tools, CSS reference.','Practical exercise: Create a multi-column layout and position elements accurately on a web page using various CSS positioning methods.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(84,6,'Week 9','2026-09-28','2026-10-02','Modern Layouts with Flexbox & Navigation Patterns','CSS Flexbox, CSS Navigation bar, CSS Drop Downs.','Utilize CSS Flexbox for efficient one-dimensional layouts and build responsive navigation menus with dropdown functionality.','Intensive practical coding sessions focused on Flexbox properties. Demonstration and guided implementation of responsive navigation bars and dropdowns.','Computer, projector, online Flexbox guides, CSS reference.','Practical exercise: Implement a flexible, responsive navigation bar with interactive dropdown menus using Flexbox.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(85,6,'Week 10','2026-10-05','2026-10-09','Dynamic CSS Effects & Web Ergonomics','CSS Transitions and Animation, CSS 2D and 3D transformation, CSS text Effects, Object Fit, Web Ergonomics.','Apply CSS transitions, animations, and transformations, and integrate web ergonomics principles for enhanced user experience.','Project-based learning to create interactive elements with CSS animations. Lecture and group discussion on web ergonomics principles and guidelines.','Computer, projector, web ergonomics case studies, CSS animation references.','Practical exercise: Implement interactive buttons or elements using CSS animations/transitions, and a written reflection on ergonomic principles applied to web design.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(86,6,'Week 11','2026-10-12','2026-10-16','Building Responsive Web Interfaces','Responsive design principles, Viewport, Box-sizing, Media Query, Breaking point, Mobile first design.','Understand and apply fundamental responsive design concepts, including viewport settings, media queries, and the mobile-first approach.','Lecture and live demonstration of responsive design techniques. Practical exercises on implementing basic responsive layouts using media queries.','Computer, projector, various device emulators in browser developer tools.','Practical exercise: Convert a non-responsive webpage into a responsive layout using media queries and viewport configurations.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(87,6,'Week 12','2026-10-19','2026-10-23','Expediting Development with CSS Frameworks','Description of CSS Frameworks (Bootstrap, Bulma, Tailwind, Materialize CSS, Foundation), Bootstrap Grid system (Containers, Columns, Rows).','Describe common CSS frameworks and efficiently build responsive layouts using the Bootstrap Grid system.','Introduction to popular CSS frameworks. Hands-on practice building responsive grid-based layouts using Bootstrap\'s grid system.','Computer, projector, Bootstrap documentation.','Practical exercise: Design a responsive page layout using Bootstrap\'s grid system to arrange content.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(88,6,'Week 13','2026-10-26','2026-10-30','Advanced Bootstrap Components for UI','Bootstrap Layout (Jumbotron, Tabs, Carousel, Navbar, Scrollspy, Font awesome icons), Bootstrap Forms (styling, validation), Bootstrap utilities.','Integrate various Bootstrap components (e.g., navigation bars, carousels, forms) and utilities to create feature-rich and styled user interfaces.','Project-based learning focusing on building UI elements. Practical application of Bootstrap\'s layout components, forms, and utility classes.','Computer, projector, Bootstrap documentation, Font Awesome.','Practical exercise: Create a webpage incorporating a Bootstrap navigation bar, a carousel, and a styled form with validation.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(89,6,'Week 14','2026-11-02','2026-11-06','Utility-First CSS with Tailwind CSS','Tailwind CSS (responsive design, breakpoints, typography, backgrounds, borders, flexbox & grid, spacing, sizing, forms).','Apply Tailwind CSS utility classes to rapidly style and build responsive web interfaces in a utility-first approach.','Guided practical application of Tailwind CSS classes. Comparison with traditional CSS and other frameworks like Bootstrap.','Computer, projector, Tailwind CSS documentation.','Practical exercise: Recreate a simple UI component or page layout using Tailwind CSS utility classes.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(90,6,'Week 15','2026-11-09','2026-11-13','Planning and Structuring Website Content','Gather and organize website contents, defining website mock-up, creating directories, implementing web links (hyper, relative, absolute, internal, external), HTML multimedia embedding.','Plan website content hierarchy, organize files into logical directories, and implement comprehensive internal and external linking.','Group project planning session for website content and mock-up definition. Practical exercises on creating directories and implementing various types of web links.','Computer, projector, conceptual wireframing tools, sample content for organization.','Submission of a website content plan, mock-up, and an organized directory structure with example links and embedded multimedia.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(91,6,'Week 16','2026-11-16','2026-11-20','Website Management, Deployment & Optimization','Deploying a developed website, HTTP Protocol basics, webserver introduction, optimizing a web page for search engines, maintaining a website.','Understand the process of deploying a website to a local server, basic HTTP/web server concepts, and principles of SEO and ongoing maintenance.','Trainer demonstration of local web server setup (e.g., Apache2) and website deployment. Guided discussion on SEO strategies and website maintenance tasks.','Computer, projector, Apache2 installation (for local server), conceptual SEO tools, reference books.','Practical exercise: Deploy a simple website to a local server environment. Short presentation outlining an SEO and maintenance plan for their website project.',0,'PENDING',NULL,'2026-07-28 08:15:27','Approx. 9-10 hours','Classroom/Lab',''),(102,13,'Week 1','2026-04-06','2026-04-10','Introduction to Web Development & Basic HTML Structure','','Trainees will understand the basic structure of an HTML document and use fundamental text elements like headings and paragraphs.','Lecture on web page structure, live coding demonstration of essential tags, followed by guided hands-on practice building a simple personal page.','Text editor (VS Code), modern web browser, HTML reference documentation.','Trainees submit an HTML file with correct `DOCTYPE`, `html`, `head`, `body` tags, and proper use of at least three heading levels and paragraphs.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Emphasize correct syntax, indentation, and the importance of closing tags from the very first lesson to build good habits.'),(103,13,'Week 2','2026-04-13','2026-04-17','HTML Elements: Hyperlinks and Images','','Trainees will be able to embed images and create navigational hyperlinks both within a page and to external resources, understanding absolute and relative paths.','Demonstration of `<a>` and `<img>` tags, explaining attributes like `href`, `src`, `alt`, and `target`. Practical exercises creating a multi-page local website with interlinked pages and embedded images.','Text editor, web browser, sample image files, pre-prepared text content for linking.','Trainees present a two-page website featuring at least three images and five functional hyperlinks, including internal and external links.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Stress the critical role of the `alt` attribute for accessibility and the practical difference between absolute and relative URLs. Common pitfall: incorrect file paths.'),(104,13,'Week 3','2026-04-20','2026-04-24','HTML Elements: Lists and Tables','','Trainees will effectively structure content using ordered, unordered, and definition lists, and accurately represent tabular data with HTML tables.','Guided practice sessions where trainees convert raw textual data into structured lists (`<ul>`, `<ol>`, `<dl>`) and build a basic data table using `<table>`, `<th>`, `<tr>`, `<td>`, and `<caption>` tags.','Text editor, web browser, example data sets for lists and tables.','Trainees create an HTML page displaying a product catalog using various list types and a class schedule using a well-formed HTML table.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Highlight that tables are for tabular data, not for general page layout. Reinforce proper nesting of list items.'),(105,13,'Week 4','2026-04-27','2026-05-01','HTML Forms and Semantic HTML5 Structure','','Trainees will develop interactive web forms for user input using various input types and structure web pages semantically using HTML5 tags.','Hands-on lab focused on building a complete registration form, covering `<form>`, `<input>` types (text, password, checkbox, radio, submit), `<label>`, `<textarea>`, and `<select>`. Introduce and apply HTML5 structural elements like `<header>`, `<nav>`, `<main>`, `<footer>`, `<article>`, `<section>`, and `<aside>` to an existing page.','Text editor, web browser.','Trainees build a multi-field web form and then restructure a provided basic HTML page using appropriate semantic HTML5 tags.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Emphasize the importance of the `<label>` tag for accessibility. Discuss the conceptual benefits of semantic HTML for search engines and assistive technologies.'),(106,13,'Week 5','2026-05-04','2026-05-08','CSS Styles: Introduction to Styling Fundamentals','','Trainees will be able to apply basic CSS styles to HTML elements using inline, internal, and external stylesheets, understanding CSS syntax and fundamental selectors.','Lecture explaining CSS syntax (selectors, properties, values, rulesets), followed by live coding demonstrations of styling a simple HTML page using type, class, and ID selectors. Guided practice applying various `color`, `background-color`, `font-family`, and `font-size` properties.','Text editor, web browser, CSS reference documentation.','Trainees create an external stylesheet (`.css` file) that successfully styles a given HTML page with at least five different CSS properties applied via different selector types.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Clearly explain the \'cascade\' and \'specificity\' early on, as these concepts are foundational for effective CSS debugging. Stress best practice of using external stylesheets.'),(107,13,'Week 6','2026-05-11','2026-05-15','CSS Styles: The Box Model and Text Styling','','Trainees will control the spacing, sizing, and appearance of elements using the CSS Box Model and apply advanced text properties for refined typography.','Visual demonstration of the CSS Box Model (`margin`, `padding`, `border`, `width`, `height`) using browser developer tools. Practical exercises styling content blocks, and refining text with `text-align`, `line-height`, `letter-spacing`, and font styling properties.','Text editor, web browser with developer tools.','Trainees style a content block to specific dimensions, with defined margins, padding, and borders, and apply advanced typography to its text content.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Developer tools are indispensable for understanding and debugging the box model; encourage frequent use. Explain `box-sizing: border-box` early as a modern best practice.'),(108,13,'Week 7','2026-05-18','2026-05-22','CSS Styles: Layouts with Display and Positioning','','Trainees will arrange elements on a page using different `display` property values and various `positioning` techniques.','Hands-on exercises exploring the `display` property (`block`, `inline`, `inline-block`, `none`) and the `position` property (`static`, `relative`, `absolute`, `fixed`, `sticky`). Students will create different arrangements of elements to understand their impact on flow.','Text editor, web browser.','Trainees build a page layout where a sidebar is positioned absolutely, and a footer is fixed to the bottom, while main content elements use `display: inline-block`.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','`absolute` and `fixed` positioning can be confusing initially; provide clear visual examples of their reference points. Highlight accessibility considerations for `position: fixed` elements.'),(109,13,'Week 8','2026-05-25','2026-05-29','CSS Styles: Introduction to Flexbox','','Trainees will create flexible and responsive one-dimensional layouts using the fundamental properties of Flexbox for containers and items.','Interactive tutorial and guided practice focusing on Flex Container properties (`display: flex`, `flex-direction`, `justify-content`, `align-items`, `flex-wrap`) and key Flex Item properties (`flex`, `order`, `align-self`). Students will build common layout patterns like navigation bars and content distribution rows.','Text editor, web browser, online interactive Flexbox guides (e.g., CSS-Tricks Flexbox Guide).','Trainees use Flexbox to create a responsive navigation bar that aligns items differently based on `flex-direction` and a section of three equally spaced content cards.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Flexbox is a powerful layout model; repetition and varied practical examples are crucial for mastery. Encourage experimentation with different property values.'),(110,13,'Week 9','2026-06-01','2026-06-05','CSS Styles & Web Ergonomics: Responsive Design with Media Queries','','Trainees will make web pages adapt to different screen sizes and devices using responsive design principles, including the viewport meta tag and media queries.','Demonstration comparing a non-responsive site with a responsive one. Guided practice implementing the viewport meta tag and crafting media queries (`@media`, `min-width`, `max-width`) to adjust layouts and styles for mobile and tablet breakpoints. Introduce fluid images (`max-width: 100%`).','Text editor, web browser with developer tools (responsive mode simulator).','Trainees convert a previously built static page into a responsive layout that successfully adapts its appearance and element arrangement for at least two different screen sizes using media queries.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Emphasize a \'mobile-first\' approach as a modern best practice for responsive design, focusing on core content first.'),(111,13,'Week 10','2026-06-08','2026-06-12','Web Ergonomics: Usability and Accessibility Best Practices','','Trainees will apply best practices for web ergonomics, including principles of usability and accessibility, to enhance the user experience of web interfaces.','Case study analysis of websites demonstrating good and poor ergonomic design. Discussion on usability principles (intuitiveness, efficiency, learnability) and core accessibility guidelines (semantic HTML, keyboard navigation, contrast ratios, ARIA attributes). Practical application: trainees modify a provided webpage to improve its accessibility and usability.','Web browser, accessibility checker tools (e.g., Lighthouse, WAVE browser extensions), summaries of WCAG guidelines.','Trainees present an analysis of a given webpage, identifying specific ergonomic and accessibility issues and proposing concrete, implementable solutions.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Classroom/Computer lab','This topic is vital for ethical and effective web development; connect concepts to real-world user scenarios and diverse user needs. Accessibility is not an afterthought, but integral to design.'),(112,13,'Week 11','2026-06-15','2026-06-19','Project Work: Integrating HTML & CSS for a Complete Web Page','','Trainees will integrate all learned HTML structuring and CSS styling concepts to build a complete, well-structured, styled, and ergonomically sound responsive web page.','Independent project work where trainees design and implement a personal portfolio page or a simple company landing page. One-on-one consultation and feedback provided during lab sessions. Peer review of in-progress work to identify areas for improvement.','Text editor, web browser, all previous curriculum notes and references.','Ongoing assessment of project progress, including HTML structure quality, CSS styling effectiveness, responsiveness, and initial ergonomic considerations. Trainees demonstrate key features of their developing project.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab','Encourage trainees to apply critical thinking about user experience and visual hierarchy. Provide a clear project brief with minimum requirements, but allow for creativity.'),(113,13,'Week 12','2026-06-22','2026-06-26','Final Project Submission and Presentation','','Trainees will consolidate their understanding of all course topics by finalizing and presenting a polished web user interface project that demonstrates mastery of HTML, CSS, responsiveness, and ergonomic principles.','Q&A session to address last-minute queries, individual project presentations where trainees showcase their final web page, and provide a brief explanation of design choices and challenges. Final feedback session and discussion on future learning paths.','Trainee projects, projector for presentations, final project rubric.','Final project submission assessed against a comprehensive rubric covering correctness of HTML and CSS, application of responsive design, adherence to ergonomic principles, and overall presentation quality. Peer and instructor feedback is provided.',0,'PENDING',NULL,'2026-07-29 14:40:23','','Computer lab/Classroom','Focus on constructive criticism to foster continuous improvement. Celebrate achievements and highlight successful application of concepts. Discuss career pathways in web development.'),(114,14,'Week 1','2026-08-03','2026-08-07','Introduction to Web Development & Basic HTML Structure','','Trainees will be able to create a basic, valid HTML5 page with correct structural elements (doctype, html, head, body).','Lecture-demonstration of core HTML syntax, followed by a guided hands-on exercise creating a first webpage, emphasizing proper tag pairing and nesting.','VS Code, modern web browser (Chrome/Firefox), HTML5 specification snippets.','Trainees submit a basic \'hello world\' HTML page with a title, a main heading, and a paragraph.',0,'PENDING',NULL,'2026-07-30 16:51:24','3 hours lecture/lab','Computer lab','Focus on correct document structure from the outset to build good habits. Watch for common syntax errors like unclosed tags.'),(115,14,'Week 2','2026-08-10','2026-08-14','HTML Text Formatting & List Elements','','Trainees will use various HTML elements to structure and format textual content and present information in ordered, unordered, and definition lists.','Practical exercises converting raw text into structured HTML using appropriate tags (e.g., h1-h6, p, strong, em, ul, ol, dl, li, dt, dd). Peer review of code.','VS Code, sample text content, HTML element reference.','Review of trainee HTML code for correct and semantic usage of text and list elements, including proper nesting.',0,'PENDING',NULL,'2026-07-30 16:51:24','3 hours lecture/lab','Computer lab','Distinguish between presentational tags (e.g., b, i) and semantic tags (strong, em) and their appropriate use. Avoid using line breaks (<br>) for paragraphs.'),(116,14,'Week 3','2026-08-17','2026-08-21','HTML Links & Images','','Trainees will incorporate hyperlinks for navigation (internal and external) and embed images correctly in their web pages, understanding relative and absolute paths.','Demonstration of anchor tags (<a>) for navigation and image tags (<img>) with attributes (src, alt, width, height). Guided practice creating a multi-page site with linked pages and embedded images.','VS Code, sample image files, web browser, HTML attributes reference.','Trainees create a small website with at least two linked pages and correctly embedded images, ensuring proper \'alt\' attributes for accessibility.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours lecture/lab','Computer lab','Emphasize the importance of `alt` attributes for accessibility and SEO. Thoroughly explain relative vs. absolute file paths.'),(117,14,'Week 4','2026-08-24','2026-08-28','HTML Tables & Forms - Part 1','','Trainees will create well-structured HTML tables for presenting tabular data and understand basic form input types.','Guided practice building HTML tables from mock data using `<table>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<th>`, `<td>`, `colspan`, `rowspan`. Introduction to `<form>` and basic `<input type=\'text\'>`.','VS Code, sample tabular data, form element reference.','Trainees build a complex data table based on a provided layout and a simple input field within a form.',0,'PENDING',NULL,'2026-07-30 16:51:24','3 hours lecture/lab','Computer lab','Reinforce that tables are for tabular data, not for page layout. Introduce basic form semantics like `label` early.'),(118,14,'Week 5','2026-08-31','2026-09-04','HTML Forms - Part 2 & Semantic HTML5 Structure','','Trainees will construct interactive web forms using various input types and apply semantic HTML5 structure to their web pages.','Building a multi-input form including `textarea`, `select`, radio buttons, checkboxes, submit buttons, and `fieldset`/`legend`. Refactoring a previous project to use HTML5 semantic tags (header, nav, main, article, section, aside, footer).','VS Code, HTML5 semantic element guide, form validation concepts.','Trainees submit a registration form demonstrating varied input types and a semantically structured webpage using new HTML5 elements.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours lecture/lab','Computer lab','Explain the importance of `<label>` for form accessibility. Discuss the benefits of semantic HTML for SEO and screen readers.'),(119,14,'Week 6','2026-09-07','2026-09-11','Introduction to CSS - Selectors and Properties','','Trainees will apply basic CSS styles to HTML elements using inline, internal, and external stylesheets, and utilize element, class, and ID selectors.','Lecture-demonstration of CSS syntax and application methods. Hands-on styling of an unstyled HTML page, experimenting with common properties (color, background-color, font-size, font-family).','VS Code, web browser, CSS reference documentation.','Trainees style a simple HTML document using an external stylesheet, demonstrating understanding of basic selectors and at least five different CSS properties.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours lecture/lab','Computer lab','Introduce the concept of the CSS cascade and specificity early. Encourage the use of external stylesheets as best practice.'),(120,14,'Week 7','2026-09-14','2026-09-18','CSS Box Model & Display Properties','','Trainees will understand and apply the CSS Box Model (margin, border, padding, content) to control element spacing and size, and differentiate between `block`, `inline`, and `inline-block` display types.','Interactive exercises using browser developer tools to inspect and modify box model properties. Practical implementation of spacing for layout components like navigation and content blocks.','VS Code, web browser developer tools.','Trainees recreate a given layout\'s spacing and element arrangement purely using box model properties and different display values.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours lecture/lab','Computer lab','This is a foundational concept; ensure thorough understanding through visual examples and debugging with developer tools. Highlight `box-sizing: border-box`.'),(121,14,'Week 8','2026-09-21','2026-09-25','CSS Typography & Text Styling','','Trainees will effectively style text elements using a range of CSS typographic properties, improving readability and visual hierarchy, and integrate web fonts.','Workshop setting, experimenting with `font-weight`, `font-style`, `text-align`, `text-decoration`, `line-height`, `letter-spacing`, `word-spacing`. Integration of web fonts from sources like Google Fonts.','VS Code, Google Fonts, font pairing tools, typography design principles.','Trainees restyle an article page to meet specific typographic design requirements, including proper line-height and font choices, integrating a custom web font.',0,'PENDING',NULL,'2026-07-30 16:51:24','3 hours lecture/lab','Computer lab','Introduce relative font units (em, rem) and discuss their benefits for responsiveness and accessibility. Discuss basic font pairing rules.'),(122,14,'Week 9','2026-09-28','2026-10-02','CSS Layout with Flexbox - Part 1','','Trainees will implement basic one-dimensional layouts using Flexbox, utilizing properties like `display: flex`, `flex-direction`, `justify-content`, and `align-items`.','Guided tutorial and hands-on practice building common layout patterns (e.g., horizontal navigation bars, evenly spaced item lists) with Flexbox. Use of interactive Flexbox learning tools.','VS Code, interactive Flexbox guides (e.g., Flexbox Froggy), CSS-Tricks Flexbox guide.','Trainees create a responsive navigation bar and a gallery of items, demonstrating correct application of core Flexbox properties for alignment and distribution.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours lecture/lab','Computer lab','Flexbox can be confusing initially; focus on clear visual examples and hands-on practice. Emphasize the concept of main axis and cross axis.'),(123,14,'Week 10','2026-10-05','2026-10-09','CSS Layout with Flexbox - Part 2 & Positioning','','Trainees will master advanced Flexbox properties (`flex-grow`, `flex-shrink`, `flex-basis`, `order`) and apply CSS positioning (`relative`, `absolute`, `fixed`, `sticky`, `z-index`) to fine-tune element placement.','Continue Flexbox exercises with more complex distribution and sizing scenarios. Introduce CSS `position` property with demonstrations of practical uses like overlays, sticky headers, and element stacking with `z-index`.','VS Code, advanced Flexbox tutorials, CSS positioning reference.','Trainees build a multi-section layout incorporating both advanced Flexbox techniques and various positioning methods to achieve specific element overlaps or fixed elements.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours lecture/lab','Computer lab','The relationship between `position: absolute` and its `position: relative` parent is a crucial concept requiring clear explanation and repeated practice.'),(124,14,'Week 11','2026-10-12','2026-10-16','Introduction to Web Ergonomics & Best Practices','','Trainees will understand core ergonomic principles, including usability, accessibility, and visual hierarchy, and identify best practices for intuitive web layouts.','Case study analysis of good vs. bad web design examples. Discussion on user flow, information architecture, and basic accessibility guidelines (WCAG principles). Introduction to F-pattern and Z-pattern reading habits.','Curated examples of websites (good and bad UX), articles on web ergonomics and usability, WCAG quick reference.','Group discussion and critique of various website layouts based on defined ergonomic principles, identifying strengths and weaknesses.',0,'PENDING',NULL,'2026-07-30 16:51:24','3 hours lecture/discussion','Classroom','Encourage critical thinking about how users interact with web interfaces. This week is more conceptual; facilitate active discussion.'),(125,14,'Week 12','2026-10-19','2026-10-23','Applying Web Ergonomics to Layout Design & Responsive Fundamentals','','Trainees will design and begin implementing layouts that prioritize user experience and responsiveness, utilizing basic media queries.','Design challenge: given a specific content set, trainees will sketch an ergonomic layout (wireframe/mockup). Introduce foundational responsive design concepts and implement basic media queries to adapt the layout for mobile screens.','Sketching tools/digital wireframing software (optional), VS Code, web browser developer tools (responsive mode).','Trainees present a wireframe/mockup and initial responsive HTML/CSS structure for a given content scenario, demonstrating at least one media query for a different screen size.',0,'PENDING',NULL,'2026-07-30 16:51:24','3 hours lecture/lab','Computer lab','Emphasize a \'mobile-first\' approach. Focus on how responsive design extends ergonomic principles to different devices.'),(126,14,'Week 13','2026-10-26','2026-10-30','Capstone Project: Web Page Development (Part 1)','','Trainees will apply all learned HTML, CSS, and ergonomic principles to plan and begin developing a multi-page static website.','Project brief provided. Trainees will individually plan their website structure (HTML), design its styling (CSS), and begin coding the main pages. Instructor provides one-on-one guidance and troubleshooting.','Project brief, VS Code, all previously learned resources, internet for research.','Submission of project plan (wireframes/sitemap) and the initial HTML structure for all pages, with basic CSS integration for navigation and overall layout.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours project work','Computer lab','Encourage modular design and clean code. Circulate constantly to provide immediate feedback and help overcome initial hurdles.'),(127,14,'Week 14','2026-11-02','2026-11-06','Capstone Project: Web Page Development (Part 2) & Review','','Trainees will complete their multi-page static website, ensuring it adheres to HTML/CSS standards and ergonomic best practices, and be ready for presentation.','Dedicated lab session for project completion. Focus on refining CSS, ensuring responsiveness, addressing accessibility, and polishing the user interface. Peer review and final adjustments.','All project resources, peer review checklist, browser compatibility testing tools (conceptual).','Final project submission and a short presentation of their website, demonstrating functionality, styling, and adherence to ergonomic principles.',0,'PENDING',NULL,'2026-07-30 16:51:24','4 hours project work','Computer lab','Ensure trainees test their work thoroughly in different browsers/screen sizes. Highlight common areas for improvement and refinement.'),(139,18,'Week 1','2025-10-06','2025-10-10','Core concepts and elements of Graphic Design','','Trainees will be able to identify and describe the fundamental elements (line, shape, color, texture, space, form, typography) and core concepts of graphic design.','Lecture with visual examples, class discussion, and analysis of existing designs to identify elements.','Projector, whiteboard, curated examples of designs (e.g., posters, logos, web layouts).','Short quiz on graphic design terminology; critique of design examples identifying specific elements.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Classroom','Focus on understanding the \'language\' of design before practical application. Emphasize visual literacy.'),(140,18,'Week 2','2025-10-13','2025-10-17','Principles of Graphic Design','','Trainees will apply graphic design principles (e.g., balance, contrast, hierarchy, alignment, proximity, repetition, white space) to analyze and critique visual compositions.','Guided analysis of good and bad designs, followed by small group exercises applying principles to redesign a simple layout.','Printouts of various designs (ads, flyers), A3 paper, markers, online design showcases.','Group presentation critiquing a given design based on principles; individual reflection on applying principles to a redesign task.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Classroom','Ensure trainees move beyond just \'seeing\' to \'understanding why\' certain designs work or don\'t. Connect to user experience implicitly.'),(141,18,'Week 3','2025-10-20','2025-10-24','Digital Image Formats and Preparation for UI','','Trainees will describe different digital image formats (raster vs. vector, JPEG, PNG, GIF, SVG), choose appropriate formats for various UI contexts, and perform basic image optimization.','Lecture with software demonstration (e.g., Photoshop showing image properties), followed by guided practice resizing and saving images for web/UI.','Computer lab, Adobe Photoshop (or GIMP), sample images (photos, icons, illustrations).','Practical exercise: optimize various images for a given web context (e.g., hero image, icon), justifying format and resolution choices.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Computer lab','Highlight the impact of image quality and file size on website performance and user experience early on.'),(142,18,'Week 4','2025-10-27','2025-10-31','Introduction to Adobe Illustrator: Vector Graphics & Logo Design','','Trainees will use Adobe Illustrator to create basic vector shapes, utilize fundamental tools (pen, shape tools), and develop a simple digital sketch leading to a conceptual logo design.','Instructor demonstration of Illustrator interface and tools, hands-on guided exercises creating vector illustrations and practicing the pen tool.','Computer lab, Adobe Illustrator, Wacom tablets (optional but recommended for sketching).','Submission of a simple vector logo concept (including initial digital sketches) created in Illustrator.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Computer lab','Emphasize precision and scalability of vector graphics. Troubleshooting common pen tool frustrations is key.'),(143,18,'Week 5','2025-11-03','2025-11-07','Adobe Photoshop: Raster Graphics & Banner Design','','Trainees will use Adobe Photoshop to manipulate raster images, combine elements using layers, and design a web banner incorporating imagery and text effectively.','Instructor demonstration on image editing techniques (selections, layers, adjustments), hands-on project to design a promotional web banner for a fictional product.','Computer lab, Adobe Photoshop, stock images, example banner designs.','Submission of a multi-layered web banner design in Photoshop, showcasing image manipulation and composition skills.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Computer lab','Reinforce the difference between raster and vector, and when to use each. Layer organization is crucial for complex designs.'),(144,18,'Week 6','2025-11-10','2025-11-14','User Interface (UI) Design Principles & Brand Consistency','','Trainees will apply UI-specific design principles (e.g., consistency, feedback, affordance, learnability) and branding guidelines (color, typography) to analyze and inform effective UI choices.','Case study analysis of good and bad UI examples, interactive discussion on color theory, typography, and brand identity in renowned digital products.','Projector, online UI design pattern libraries, examples of strong and weak UI from popular apps/websites.','Group exercise: Redesign a problematic UI element (e.g., a form or navigation bar) applying learned principles and justifying changes in a brief presentation.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Classroom','This week bridges graphic design foundations to specific UI considerations. Encourage critical thinking about user experience.'),(145,18,'Week 7','2025-11-17','2025-11-21','Wireframing User Interfaces','','Trainees will develop low-to-mid fidelity wireframes for a simple application or website, demonstrating understanding of information hierarchy, user flow, and basic layout structures.','Instructor demonstration of a wireframing tool (e.g., Figma or Adobe XD basics), hands-on practice creating wireframes from a given project brief.','Computer lab, Figma (or Adobe XD), paper and pens for initial conceptual sketching.','Submission of a set of wireframes (e.g., 3-5 key screens) for a defined user task or simple app functionality.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Computer lab','Emphasize that wireframing is about structure and content, not visual polish. Focus on clarity and usability of layout.'),(146,18,'Week 8','2025-11-24','2025-11-28','Developing UI Mockups','','Trainees will transform a wireframe into a high-fidelity visual mockup, incorporating appropriate visual design elements (color, typography, iconography, imagery) and ensuring brand consistency.','Instructor demonstration of creating high-fidelity mockups in a design tool (e.g., Figma), guided practice developing a mockup based on their wireframes from the previous week.','Computer lab, Figma (or Adobe XD), pre-selected UI kits/component libraries (optional), curated icon sets.','Submission of a high-fidelity mockup (e.g., 1-2 key screens) based on their wireframe, demonstrating visual design execution.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Computer lab','Pay attention to consistency in visual styling. Guide students on selecting appropriate typefaces and color palettes.'),(147,18,'Week 9','2025-12-01','2025-12-05','Prototyping User Interfaces','','Trainees will create an interactive prototype from their high-fidelity mockups, simulating user interactions, navigation flows, and basic animations within the design software.','Instructor demonstration of prototyping features within the design software (e.g., Figma\'s prototyping mode), hands-on exercise creating clickable prototypes for their mockups.','Computer lab, Figma (or Adobe XD), pre-designed mockups from previous week.','Presentation of an interactive prototype demonstrating core user flows and interactions for their project.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Computer lab','Focus on the user journey and logical flow. Ensure all interactive elements are correctly linked and transitions are smooth.'),(148,18,'Week 10','2025-12-08','2025-12-12','User Interface Evaluation & Testing Basics','','Trainees will identify common usability issues in a given UI using basic evaluation methods (e.g., heuristic evaluation) and propose informed design improvements.','Discussion of usability heuristics, peer review of prototypes, and role-playing basic usability testing scenarios to gather feedback.','Sample UI designs with inherent flaws, heuristic evaluation checklists, peer prototypes.','Written report identifying usability issues in a peer\'s prototype based on heuristic principles and suggesting concrete, justified design improvements.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Classroom/Computer lab','Emphasize the iterative nature of design. Learning to articulate constructive criticism is a key skill.'),(149,18,'Week 11','2025-12-15','2025-12-19','Final Project Refinement & Portfolio Development','','Trainees will refine their UI project, prepare a brief presentation showcasing their design process and final output, and begin structuring a basic portfolio entry.','Independent work period for final project refinement, one-on-one feedback sessions with instructor, peer critiques of project presentations and potential portfolio pieces.','Computer lab, design software, online portfolio platforms (e.g., Behance, Dribbble) for inspiration.','Final project presentation showcasing the entire UI design process (wireframe to prototype) and submission of a refined UI design.',0,'PENDING',NULL,'2026-08-04 12:07:57','','Computer lab','This is a crucial week for consolidating learning and preparing students for presenting their work professionally. Encourage storytelling in their presentations.'),(150,19,'Week 1','2026-01-05','2026-01-09','Introduction to Graphic Design & Core Concepts','','Trainees will be able to describe the core concepts and elements of graphic design and its significance in visual communication.','Interactive lecture and discussion on the history and purpose of graphic design. Case study analysis of effective designs from various industries.','Whiteboard, projector, curated examples of graphic design work, student notebooks.','Short quiz on defining graphic design and identifying its key elements from provided examples.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Classroom','Focus on demystifying graphic design for beginners, emphasizing its problem-solving aspect.'),(151,19,'Week 2','2026-01-12','2026-01-16','Elements of Design: Line, Shape, Form, Texture, Space','','Trainees will identify and apply the basic elements of design in simple visual compositions, understanding their impact on a design.','Demonstration of each element\'s use, followed by hands-on drawing exercises to create compositions focusing on specific elements. Group critique of exercises.','Sketchpads, pencils, rulers, geometric shapes templates, visual examples of each element in real designs.','Completion of a small portfolio of sketches demonstrating understanding of various design elements.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Classroom','Some students struggle with abstract concepts; use clear, relatable examples. Encourage experimentation.'),(152,19,'Week 3','2026-01-19','2026-01-23','Principles of Design: Balance, Contrast, Repetition, Alignment, Proximity, Hierarchy, Emphasis','','Trainees will analyze and apply key design principles to create visually effective and harmonious layouts.','Lecture with visual examples showcasing each principle. Guided exercises where students redesign a simple layout to incorporate specific principles. Peer review.','Projector, worksheets with poor layouts for redesign, design principle reference handouts, computers with basic drawing software (e.g., Google Drawings).','Redesigned layout demonstrating the application of at least three design principles, with a brief explanation.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Classroom/Computer Lab','Reinforce that principles often work together, not in isolation. Emphasize consistency in application.'),(153,19,'Week 4','2026-01-26','2026-01-30','Digital Image Formats & Resolution','','Trainees will differentiate between various digital image formats (raster vs. vector, JPEG, PNG, GIF, SVG) and select appropriate formats for specific digital and print use cases.','Demonstration of image properties and formats. Guided discussion on scenarios requiring different formats. Hands-on practice converting and saving images in various formats.','Projector, computer lab, sample images in different formats, Adobe Photoshop (trial version acceptable) or GIMP, online image converters.','Practical exercise where trainees correctly identify and convert images to specified formats and resolutions for web and print scenarios.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','Highlight the impact of resolution on file size and quality. Explain when lossy vs. lossless compression is acceptable.'),(154,19,'Week 5','2026-02-02','2026-02-06','Introduction to Adobe Photoshop: Interface & Basic Tools','','Trainees will navigate the Adobe Photoshop interface, understand the concept of layers, and perform basic image manipulation tasks such as selection, cropping, and simple adjustments.','Instructor-led demonstration of Photoshop workspace, tools panel, and layers panel. Guided hands-on exercises to open, save, crop, and make basic color adjustments to images.','Computer lab with Adobe Photoshop installed (or equivalent like GIMP), sample images for editing, Photoshop hotkey handout.','Completion of a practical task: \'clean up\' a given image by cropping, adjusting brightness/contrast, and isolating a subject using basic selection tools.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','Spend extra time on layers; it\'s a foundational concept that often trips up beginners. Encourage keyboard shortcuts.'),(155,19,'Week 6','2026-02-09','2026-02-13','Image Editing and Preparation for UI with Photoshop','','Trainees will effectively use advanced Photoshop techniques like masks, smart objects, and blending modes to prepare and optimize raster images and assets for user interface design.','Demonstration of non-destructive editing techniques (masks, smart objects). Hands-on project: create UI elements (e.g., button states, icons) from raw images using learned techniques. Group work and feedback.','Computer lab with Adobe Photoshop, UI asset packs (icons, stock photos), Wacom tablets (optional for finer work).','Submission of a small set of optimized UI assets (e.g., three icon variations, a hero image correctly scaled and masked) created in Photoshop.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','Emphasize optimization for web/mobile – smaller file sizes, correct dimensions. Discuss exporting for different screen densities.'),(156,19,'Week 7','2026-02-16','2026-02-20','Introduction to Adobe Illustrator & Vector Graphics','','Trainees will navigate Adobe Illustrator\'s environment, understand the principles of vector graphics, and create simple vector shapes and paths using drawing tools.','Instructor-led demonstration of Illustrator\'s interface, artboards, and basic drawing tools (Pen Tool, Shape Tools). Guided hands-on exercises to recreate simple vector graphics.','Computer lab with Adobe Illustrator installed, Pen Tool practice sheets, vector graphic examples.','Completion of a worksheet requiring students to draw specific shapes and paths using Illustrator\'s tools, demonstrating proficiency with vector drawing basics.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','The Pen Tool can be challenging; dedicate ample time for practice and provide clear, step-by-step guidance.'),(157,19,'Week 8','2026-02-23','2026-02-27','Logo and Banner Design with Illustrator','','Trainees will design and execute a basic logo and a web banner adhering to design principles, brand consistency, and vector scalability.','Discussion on logo design principles and typography choices. Hands-on project: conceptualize and create a vector logo and corresponding web banner for a fictional company using Illustrator.','Computer lab with Adobe Illustrator, examples of good and bad logos/banners, typography guides, online color palette generators.','Presentation of a complete vector logo and web banner, along with a brief explanation of design choices.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','Stress the importance of simplicity and versatility in logo design. Encourage iterative sketching before digital execution.'),(158,19,'Week 9','2026-03-02','2026-03-06','UI Design Principles & Accessibility','','Trainees will apply user-centered design principles, understand usability heuristics, and incorporate accessibility considerations into interface design.','Lecture on key UI principles (e.g., Fitts\' Law, Hick\'s Law, Gestalt principles), Nielsen\'s Usability Heuristics. Group activity: analyze existing websites/apps for adherence to principles and identify accessibility issues.','Projector, case studies of good and bad UI, accessibility guidelines (WCAG), checklist for heuristic evaluation.','Written analysis of an existing application\'s UI, identifying strengths, weaknesses, and suggesting improvements based on learned principles and heuristics.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Classroom','Accessibility is crucial; emphasize its ethical and legal importance from the start, not as an afterthought.'),(159,19,'Week 10','2026-03-09','2026-03-13','Wireframing & Information Architecture','','Trainees will understand user flows and develop functional low-fidelity wireframes for a given digital product scenario, mapping out content structure and user interaction.','Introduction to information architecture and user flows. Demonstration of different wireframing techniques (sketching, digital tools). Hands-on activity: create wireframes for a small application or website section.','Whiteboard, markers, sketchpads, pencils, wireframing templates, Figma or Adobe XD (free version or trial).','Submission of a set of low-fidelity wireframes (digital or hand-drawn) for a specific user journey within a provided scenario.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','Emphasize \'content-first\' approach and not getting bogged down by visual details at this stage. Focus on functionality.'),(160,19,'Week 11','2026-03-16','2026-03-20','UI Mockup Development','','Trainees will create high-fidelity UI mockups using appropriate design tools, translating wireframes into visually appealing designs while incorporating learned visual design principles and brand consistency.','Demonstration of creating high-fidelity mockups using a UI design tool. Guided hands-on project: take previous week\'s wireframes and develop them into polished mockups, applying color, typography, and imagery.','Computer lab with Figma or Adobe XD, UI kits/component libraries, brand style guides (examples), stock image resources.','Completion and presentation of high-fidelity mockups for the chosen application/website, demonstrating attention to visual detail and consistency.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','Encourage using component libraries for efficiency and consistency. Provide feedback on visual hierarchy and spacing.'),(161,19,'Week 12','2026-03-23','2026-03-27','Prototyping User Interfaces','','Trainees will develop interactive prototypes from their high-fidelity mockups, simulating basic user experiences and transitions within a chosen prototyping tool.','Demonstration of linking screens, adding micro-interactions, and creating basic animations in a prototyping tool. Hands-on project: convert mockups into an interactive prototype, focusing on a primary user flow.','Computer lab with Figma or Adobe XD, previous week\'s mockups, examples of effective micro-interactions.','Submission of a functional, interactive prototype showcasing a key user journey from their project, accessible via a shareable link.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Computer Lab','Focus on the \'feel\' of the interaction. Small details in transitions can significantly impact user experience.'),(162,19,'Week 13','2026-03-30','2026-04-03','User Interface Evaluation & Usability Testing','','Trainees will conduct basic evaluations of a user interface prototype using methods like heuristic evaluation and identify areas for improvement based on collected feedback.','Lecture on common evaluation methods (heuristic evaluation, informal usability testing). Group activity: conduct a mini-usability test or heuristic evaluation on a peer\'s prototype. Discuss findings and suggest iterations.','Peer prototypes, usability testing scripts/templates, feedback forms, heuristic evaluation checklists.','Written report summarizing the findings from a heuristic evaluation or informal usability test of a peer\'s prototype, including actionable recommendations for improvement.',0,'PENDING',NULL,'2026-08-04 15:35:07','','Classroom/Computer Lab','Emphasize constructive criticism and objective feedback. Teach how to phrase findings to be helpful, not just critical. Introduce the iterative nature of design.'),(163,20,'Week 1','2026-08-10','2026-08-14','Introduction to Graphic Design & Core Concepts','','Trainees will be able to describe the fundamental concepts and elements of graphic design and their role in visual communication.','Interactive lecture, discussion of design examples, and initial hands-on exploration of visual elements like line, shape, and form.','Whiteboard, projector, handouts with key terminology, curated examples of good and bad graphic design.','Short quiz on graphic design terminology and a class discussion demonstrating understanding of core concepts.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Classroom','Ensure trainees grasp the abstract nature of concepts before moving to application. Address common misconceptions about \'art vs. design\'.'),(164,20,'Week 2','2026-08-17','2026-08-21','Graphic Design Principles & Digital Image Formats','','Trainees will identify and apply basic graphic design principles (e.g., contrast, balance, hierarchy) and describe key features and proper use of digital image formats (raster vs. vector).','Demonstration of principles using existing designs, analysis of images to identify formats, and guided exercises applying principles to simple layouts.','Projector, computer with image viewing software, sample images in various formats (JPG, PNG, SVG), articles on design principles.','Critique of design examples identifying applied principles and a written summary differentiating image formats and their appropriate use.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Classroom/Computer Lab','Emphasize \'why\' certain principles work. Connect image formats directly to quality and file size for practical understanding.'),(165,20,'Week 3','2026-08-24','2026-08-28','Introduction to Vector Graphics & Adobe Illustrator','','Trainees will describe the core functionality of Adobe Illustrator and competently use basic tools for creating and manipulating vector shapes.','Instructor demonstration of Illustrator interface and basic tools (pen tool, shape tools), followed by guided hands-on exercises to recreate simple vector graphics.','Computer lab with Adobe Illustrator, projector, exercise files for basic shape creation.','Completion of a series of short Illustrator exercises demonstrating proficiency with basic shape creation and manipulation tools.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','The Pen tool can be challenging initially; dedicate ample time for practice and provide individual feedback.'),(166,20,'Week 4','2026-08-31','2026-09-04','Digital Sketching & Advanced Vector Techniques in Illustrator','','Trainees will apply advanced vector techniques in Illustrator to create original digital sketches and refine vector artwork.','Demonstration of layering, Pathfinder operations, and gradient tools. Trainees will work on a guided project to digitally sketch an object from a reference image.','Computer lab with Adobe Illustrator, reference images for sketching, Wacom tablets (optional but recommended for sketching).','Submission of a completed digital sketch, assessed for accurate use of vector tools and clean line work.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Encourage trainees to experiment with different brush styles and strokes to develop their own digital sketching approach.'),(167,20,'Week 5','2026-09-07','2026-09-11','Project: Logo Design with Adobe Illustrator','','Trainees will design and create a multi-part logo using Adobe Illustrator, applying principles of graphic design and vector creation.','Briefing on logo design best practices, individual ideation and sketching, then hands-on development of a logo concept in Illustrator.','Computer lab with Adobe Illustrator, examples of effective logos, brainstorming templates.','Presentation and submission of a finished logo design, evaluated for originality, application of design principles, and technical execution in Illustrator.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Remind trainees to consider scalability and versatility in logo design. Provide constructive feedback during the ideation phase.'),(168,20,'Week 6','2026-09-14','2026-09-18','Introduction to Raster Graphics & Adobe Photoshop','','Trainees will describe the core functionality of Adobe Photoshop and competently use basic tools for image selection, manipulation, and layer management.','Instructor demonstration of Photoshop interface, selection tools, basic adjustments, and layer basics. Guided exercises on non-destructive editing.','Computer lab with Adobe Photoshop, projector, sample raster images for manipulation.','Completion of exercises demonstrating accurate image selection, basic color correction, and effective layer organization.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Emphasize the distinction between destructive and non-destructive editing from the start. Layers are key for complex work.'),(169,20,'Week 7','2026-09-21','2026-09-25','Image Editing for UI & Banner Design with Photoshop','','Trainees will prepare images for UI design (resizing, optimizing) and design a promotional banner using Photoshop, integrating text and imagery.','Demonstration of image optimization techniques, integration of text and images. Trainees will create a web banner incorporating prepared assets.','Computer lab with Adobe Photoshop, pre-selected images and text content for banner creation, examples of effective web banners.','Submission of a final web banner design, assessed for visual appeal, technical execution, and appropriate image preparation.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Focus on resolution and file size for web assets. Encourage creative typography within the banner design constraints.'),(170,20,'Week 8','2026-09-28','2026-10-02','Introduction to UI Design Principles & Tools','','Trainees will identify key UI design principles (e.g., consistency, feedback, learnability) and describe the purpose of common UI design software (e.g., Figma, Adobe XD).','Lecture on human-computer interaction principles and UI heuristics, comparative analysis of different UI design tools. Initial exploration of a chosen UI design tool.','Projector, articles/case studies on UI principles, access to Figma/Adobe XD (free versions are suitable).','Group discussion on the strengths and weaknesses of different UI tools and a written reflection on applying two UI principles to an existing interface.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Classroom/Computer Lab','Transition from general graphic design to specific UI considerations. Encourage trainees to observe UI in apps they use daily.'),(171,20,'Week 9','2026-10-05','2026-10-09','Wireframing: From Sketch to Digital','','Trainees will develop low-fidelity user interface wireframes, both hand-drawn and digitally, for a given application scenario.','Demonstration of effective wireframing techniques. Trainees will sketch paper wireframes and then translate them into digital wireframes using a UI design tool.','Paper, pens, templates for sketching (phone/web frames), computer lab with Figma/Adobe XD.','Submission of a set of digital wireframes (e.g., for a 3-screen app flow), assessed for clarity, information hierarchy, and adherence to requirements.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Emphasize that wireframes are about structure and function, not aesthetics. Discourage premature styling.'),(172,20,'Week 10','2026-10-12','2026-10-16','Mockup Design: Creating High-Fidelity UI','','Trainees will develop high-fidelity user interface mockups, applying branding, color theory, and typography to bring wireframes to life.','Demonstration of mockup creation in a UI tool, focusing on style guides, component libraries, and visual consistency. Trainees will convert their wireframes into polished mockups.','Computer lab with Figma/Adobe XD, curated color palettes, typography resources, icon sets.','Presentation and submission of high-fidelity UI mockups for a chosen screen, evaluated for visual appeal, brand consistency, and user experience.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Guide trainees on making design decisions based on target audience and brand identity. Focus on attention to detail.'),(173,20,'Week 11','2026-10-19','2026-10-23','Prototyping: Adding Interactivity to UI','','Trainees will develop interactive user interface prototypes, linking screens and adding micro-interactions to simulate user flow.','Instructor demonstration of prototyping features in the chosen UI tool (e.g., hotspots, transitions, animations). Trainees will build a navigable prototype from their mockups.','Computer lab with Figma/Adobe XD.','Submission of a functional, interactive UI prototype that demonstrates a complete user journey, assessed for navigability and interaction clarity.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Encourage trainees to think about the \'feel\' of the interaction. Simple, clear transitions are better than overly complex ones.'),(174,20,'Week 12','2026-10-26','2026-10-30','User Interface Evaluation & Usability Testing','','Trainees will evaluate a user interface and conduct basic usability testing to identify issues and propose improvements.','Lecture on usability testing methods (e.g., heuristic evaluation, task-based testing). Trainees will conduct peer evaluations of prototypes and provide constructive feedback.','Projector, templates for usability test scripts and feedback forms, user interface prototypes created by trainees.','Participation in a peer usability testing session and submission of a brief report outlining identified UI issues and suggested improvements for a given prototype.',0,'PENDING',NULL,'2026-08-05 21:16:25','3 hours','Computer Lab','Emphasize empathy in feedback. Remind trainees that the goal is to improve the design, not just criticize.');
/*!40000 ALTER TABLE `SchemeOfWorkEntry` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `School`
--

DROP TABLE IF EXISTS `School`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `School` (
  `school_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `contact_email` varchar(150) DEFAULT NULL,
  `contact_phone` varchar(50) DEFAULT NULL,
  `logo` varchar(500) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','SUSPENDED') DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`school_id`),
  UNIQUE KEY `School_name_unique` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `School`
--

LOCK TABLES `School` WRITE;
/*!40000 ALTER TABLE `School` DISABLE KEYS */;
INSERT INTO `School` VALUES (1,'New Generation Academy','Kigali','info@nga.ac.rw','0782634364','https://nga.ac.rw/mis/assets/logo-CS5kgjNA.png','ACTIVE','2026-01-20 01:32:34','2026-01-20 01:32:34');
/*!40000 ALTER TABLE `School` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SchoolSystemAssignment`
--

DROP TABLE IF EXISTS `SchoolSystemAssignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SchoolSystemAssignment` (
  `school_id` bigint(20) NOT NULL,
  `system_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
  PRIMARY KEY (`school_id`,`system_id`),
  KEY `SchoolSystemAssignment_system_id_System_system_id_fk` (`system_id`),
  CONSTRAINT `SchoolSystemAssignment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School` (`school_id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `SchoolSystemAssignment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System` (`system_id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SchoolSystemAssignment`
--

LOCK TABLES `SchoolSystemAssignment` WRITE;
/*!40000 ALTER TABLE `SchoolSystemAssignment` DISABLE KEYS */;
INSERT INTO `SchoolSystemAssignment` VALUES (1,1,'2026-01-20 01:58:31','ACTIVE');
/*!40000 ALTER TABLE `SchoolSystemAssignment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `StudentClassGroup`
--

DROP TABLE IF EXISTS `StudentClassGroup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `StudentClassGroup` (
  `user_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`user_id`,`class_group_id`,`academic_year_id`),
  KEY `scg_academic_year_fk` (`academic_year_id`),
  CONSTRAINT `scg_academic_year_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `StudentClassGroup`
--

LOCK TABLES `StudentClassGroup` WRITE;
/*!40000 ALTER TABLE `StudentClassGroup` DISABLE KEYS */;
INSERT INTO `StudentClassGroup` VALUES (23,9,3,'2026-02-02 23:37:45','ACTIVE'),(23,41,5,'2026-08-05 12:33:02','ACTIVE');
/*!40000 ALTER TABLE `StudentClassGroup` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `StudentSubjectEnrollment`
--

DROP TABLE IF EXISTS `StudentSubjectEnrollment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `StudentSubjectEnrollment` (
  `user_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `enrolled_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (`user_id`,`subject_id`,`academic_year_id`),
  KEY `studentsubjectenrollment_academic_year_id_fk` (`academic_year_id`),
  CONSTRAINT `studentsubjectenrollment_academic_year_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `StudentSubjectEnrollment`
--

LOCK TABLES `StudentSubjectEnrollment` WRITE;
/*!40000 ALTER TABLE `StudentSubjectEnrollment` DISABLE KEYS */;
INSERT INTO `StudentSubjectEnrollment` VALUES (23,8,3,'2026-02-02 23:37:58','ACTIVE'),(23,9,3,'2026-02-02 23:37:55','ACTIVE'),(23,9,5,'2026-08-03 11:17:41','ACTIVE'),(23,10,3,'2026-03-04 22:53:10','ACTIVE');
/*!40000 ALTER TABLE `StudentSubjectEnrollment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `Subject`
--

DROP TABLE IF EXISTS `Subject`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `Subject` (
  `subject_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','DISABLED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `course_category_id` bigint(20) DEFAULT NULL,
  `max_marks` int(11) DEFAULT NULL,
  `blooms_taxonomy_level_id` bigint(20) DEFAULT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#3B82F6',
  PRIMARY KEY (`subject_id`),
  KEY `Subject_course_category_id_CourseCategory_category_id_fk` (`course_category_id`),
  KEY `Subject_blooms_taxonomy_level_id_fk` (`blooms_taxonomy_level_id`),
  CONSTRAINT `Subject_blooms_taxonomy_level_id_fk` FOREIGN KEY (`blooms_taxonomy_level_id`) REFERENCES `BloomsTaxonomyLevel` (`level_id`),
  CONSTRAINT `Subject_course_category_id_CourseCategory_category_id_fk` FOREIGN KEY (`course_category_id`) REFERENCES `CourseCategory` (`category_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `Subject`
--

LOCK TABLES `Subject` WRITE;
/*!40000 ALTER TABLE `Subject` DISABLE KEYS */;
INSERT INTO `Subject` VALUES (8,'SPEGI302','Graphic User Interface Design',NULL,'ACTIVE',1,10,NULL,'#eb7c14'),(9,'SPEWI302','Development of Web User Interface',NULL,'ACTIVE',1,100,NULL,'#3B82F6'),(10,'SPEWJ302','Web Application Development Using JavaScript',NULL,'ACTIVE',1,100,NULL,'#06bc12'),(12,'CCMKN302','Kinyarwanda',NULL,'ACTIVE',1,100,NULL,'#8ac40e');
/*!40000 ALTER TABLE `Subject` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SubjectCompetency`
--

DROP TABLE IF EXISTS `SubjectCompetency`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SubjectCompetency` (
  `competency_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `subject_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `element_number` int(11) NOT NULL DEFAULT '1',
  `learning_hours` int(11) DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `indicative_content` text COLLATE utf8mb4_unicode_ci,
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`competency_id`),
  KEY `idx_competency_subject` (`subject_id`),
  KEY `fk_competency_user` (`user_id`),
  CONSTRAINT `fk_competency_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_competency_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SubjectCompetency`
--

LOCK TABLES `SubjectCompetency` WRITE;
/*!40000 ALTER TABLE `SubjectCompetency` DISABLE KEYS */;
INSERT INTO `SubjectCompetency` VALUES (1,9,1,1,NULL,'Design a web Page','HTML elements are properly used according to standards',NULL,0,'2026-05-06 22:43:34','2026-05-06 22:43:34'),(5,8,15,1,30,'Describe graphic design basics','Learners will describe fundamental concepts, digital image characteristics, and core principles of graphic design.','Describe core concepts and elements of Graphic Design\nGraphic design career description\nBasic graphic design tools description\nElements of interface design identification\nInterface elements interpretation\nDescribe key features and formats of digital images\nDescription of digital images key features\nDescribing common raster formats\nDescribing common vector formats\nDescribe graphic design principles\nPrinciples of User Interface Design description\nColor Design Principles demonstration\nDescription of advantages and disadvantages for using color\nConsiderations on design and user experience',0,'2026-08-03 15:21:02','2026-08-03 23:36:22'),(6,8,15,2,40,'Draw digital sketch','Learners will use digital tools like Adobe Illustrator and Photoshop to create and refine digital sketches, logos, and banners.','Describe the use of Adobe Illustrator and Photoshop\nPhotoshop basics introduction\nIllustrator basics introduction\nPrinting and Exporting artworks\nDraw a digital sketch\nSketching lines and shapes and editing paths using Adobe illustrator\nWorking with Symbol\nWorking with brush tool\nPainting sketch design\nSelecting and arranging sketch design objects\nReshaping objects\nDraw a logo and a banner\nLogo implementation using Adobe illustrator\nBanner drawing using Adobe illustrator',1,'2026-08-03 15:21:02','2026-08-03 23:36:22'),(7,8,15,3,60,'Design User Interface','Learners will develop, prototype, and evaluate user interfaces, including wireframes and mockups, using various design tools and techniques.','Develop User Interface Wireframe\nUse Visual features of wireframe\nUse Simple Vector, Interactive Wireframe and Storyboard\nUse Wireframe Tools (notion, Wireframe.CC, FrameBox, JumpChart)\nDevelop User Interface Mockup\nUse Mockup Features\nUse Mockup Tools (Balsamiq, figma, Adobe Xd,MockPlus, MockFlow)\nDevelop User Interface Prototype\nDescribe Different Types of Prototypes, Techniques\nCreate User Interface Prototypes\nEvaluate User Interface\nUsability Evaluation\nCognitive Walkthroughs\nHeuristic Evaluation',2,'2026-08-03 15:21:02','2026-08-03 23:36:22');
/*!40000 ALTER TABLE `SubjectCompetency` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SubjectDocument`
--

DROP TABLE IF EXISTS `SubjectDocument`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SubjectDocument` (
  `document_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `category_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `competency_id` bigint(20) DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` bigint(20) NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_extension` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`document_id`),
  KEY `idx_subject_doc_category` (`category_id`),
  KEY `idx_subject_doc_subject` (`subject_id`),
  KEY `fk_subject_doc_user` (`user_id`),
  KEY `fk_subject_doc_competency` (`competency_id`),
  CONSTRAINT `fk_subject_doc_category` FOREIGN KEY (`category_id`) REFERENCES `SubjectDocumentCategory` (`category_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subject_doc_competency` FOREIGN KEY (`competency_id`) REFERENCES `SubjectCompetency` (`competency_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_subject_doc_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_subject_doc_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SubjectDocument`
--

LOCK TABLES `SubjectDocument` WRITE;
/*!40000 ALTER TABLE `SubjectDocument` DISABLE KEYS */;
INSERT INTO `SubjectDocument` VALUES (1,1,9,1,NULL,'1778100276839-7xplhqjhyzp.pdf','Term 2 Performance_All.pdf','subjects/9/1778100276839-7xplhqjhyzp.pdf',1466743,'application/pdf','pdf',NULL,'2026-05-06 22:44:45','2026-05-06 22:44:45'),(2,1,9,15,NULL,'1785697684631-y02mxikw97o.pdf','mentorship-report-Niyongabo-Emmanuel (2).pdf','subjects/9/1785697684631-y02mxikw97o.pdf',12785,'application/pdf','pdf',NULL,'2026-08-02 21:08:09','2026-08-02 21:08:09');
/*!40000 ALTER TABLE `SubjectDocument` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SubjectDocumentCategory`
--

DROP TABLE IF EXISTS `SubjectDocumentCategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SubjectDocumentCategory` (
  `category_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `subject_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#3B82F6',
  `sort_order` int(11) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  KEY `idx_doc_category_subject` (`subject_id`),
  KEY `fk_doc_category_user` (`user_id`),
  CONSTRAINT `fk_doc_category_subject` FOREIGN KEY (`subject_id`) REFERENCES `Subject` (`subject_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_doc_category_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SubjectDocumentCategory`
--

LOCK TABLES `SubjectDocumentCategory` WRITE;
/*!40000 ALTER TABLE `SubjectDocumentCategory` DISABLE KEYS */;
INSERT INTO `SubjectDocumentCategory` VALUES (1,9,1,'Notes',NULL,'#3B82F6',0,'2026-05-06 22:44:27','2026-05-06 22:44:27'),(3,9,15,'Lesson',NULL,'#EC4899',0,'2026-08-02 21:08:33','2026-08-02 21:08:33');
/*!40000 ALTER TABLE `SubjectDocumentCategory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `SupportRequestCategory`
--

DROP TABLE IF EXISTS `SupportRequestCategory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `SupportRequestCategory` (
  `category_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `label` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(4) DEFAULT '1',
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `label` (`label`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `SupportRequestCategory`
--

LOCK TABLES `SupportRequestCategory` WRITE;
/*!40000 ALTER TABLE `SupportRequestCategory` DISABLE KEYS */;
INSERT INTO `SupportRequestCategory` VALUES (1,'Academic / Curriculum Clarification',1),(2,'Technical / IT Support',1),(3,'Infrastructure / Facilities',1),(4,'Coordination / Scheduling',1),(5,'Training / Professional Development',1),(6,'Other',1);
/*!40000 ALTER TABLE `SupportRequestCategory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `System`
--

DROP TABLE IF EXISTS `System`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `System` (
  `system_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `client_id` varchar(100) DEFAULT NULL,
  `client_secret` varchar(255) DEFAULT NULL,
  `allowed_redirect_uris` text,
  `status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `icon_url` varchar(255) NOT NULL,
  `home_url` varchar(255) NOT NULL,
  PRIMARY KEY (`system_id`),
  UNIQUE KEY `System_name_unique` (`name`),
  UNIQUE KEY `client_id` (`client_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `System`
--

LOCK TABLES `System` WRITE;
/*!40000 ALTER TABLE `System` DISABLE KEYS */;
INSERT INTO `System` VALUES (1,'MIS','Management System',NULL,NULL,NULL,'ACTIVE','2026-01-25 13:17:02','',''),(2,'TaskMentor','Assessments Taking Management System','taskmentor_app','8da1401be85d3bec0631e091a7e45e252c839bcfe6cb3044ac9407023952d98c','http://localhost:5174/taskmentor/sso/callback,https://nga.ac.rw/taskmentor/sso/callback','ACTIVE','2026-01-25 13:49:29','https://nga.ac.rw/taskmentor/favicon.ico','http://localhost:5174/taskmentor/login'),(4,'NGA Discipline & Attendance','Student attendance, discipline logs and staff duty tracking system','discipline_attendance','4d1770ed5b6aa29a945b9a7eb7d833306c1c1d28225200b7ec07c3b2f7727ff2','http://localhost:3000/sso/callback','ACTIVE','2026-08-15 16:27:32','https://nga.ac.rw/favicon.ico','http://localhost:3000');
/*!40000 ALTER TABLE `System` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `TeacherSubjectAssignment`
--

DROP TABLE IF EXISTS `TeacherSubjectAssignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `TeacherSubjectAssignment` (
  `user_id` bigint(20) NOT NULL,
  `subject_id` bigint(20) NOT NULL,
  `class_group_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`subject_id`,`class_group_id`,`academic_year_id`),
  KEY `tsa_academic_year_fk` (`academic_year_id`),
  CONSTRAINT `tsa_academic_year_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `TeacherSubjectAssignment`
--

LOCK TABLES `TeacherSubjectAssignment` WRITE;
/*!40000 ALTER TABLE `TeacherSubjectAssignment` DISABLE KEYS */;
INSERT INTO `TeacherSubjectAssignment` VALUES (13,10,9,3,'2026-01-13 18:22:11'),(14,12,9,3,'2026-03-13 11:58:44'),(15,8,9,3,'2026-01-13 18:38:39'),(15,8,41,5,'2026-08-04 18:17:14'),(15,9,9,3,'2026-01-13 18:38:27'),(21,12,10,3,'2026-01-14 13:56:59'),(21,12,10,5,'2026-08-05 08:56:20');
/*!40000 ALTER TABLE `TeacherSubjectAssignment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `User`
--

DROP TABLE IF EXISTS `User`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `User` (
  `user_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','SUSPENDED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `preferred_theme` enum('light','dark') COLLATE utf8mb4_unicode_ci DEFAULT 'light',
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `User`
--

LOCK TABLES `User` WRITE;
/*!40000 ALTER TABLE `User` DISABLE KEYS */;
INSERT INTO `User` VALUES (1,'superadmin','emmanuelniyongabo44@gmail.com','0798000045','ACTIVE','2026-01-05 18:44:55','2026-08-03 10:57:39','dark'),(13,'tuyishimire','tuyishimireericc@gmail.com','0780313448','ACTIVE','2026-01-13 17:40:07','2026-01-13 17:40:07','light'),(14,'niyitegeka','faustin.niyitegeka@gmail.com','0788600976','INACTIVE','2026-01-13 17:42:24','2026-08-01 08:53:19','light'),(15,'niyongaboemma','emmanuelniyongabo@nga.ac.rw','0782634364','ACTIVE','2026-01-13 17:45:56','2026-08-08 21:36:18','dark'),(16,'ndazivunnyefelix08','ndazivunnyefelix08@gmail.com','0783409722','ACTIVE','2026-01-13 18:42:45','2026-01-13 18:42:45','light'),(19,'Emman','emmanuelniyongabo2020@gmail.com','0784875454','ACTIVE','2026-01-13 21:24:48','2026-01-13 21:24:48','light'),(20,'emmmm','universalbridgeltd1@gmail.com','0789834573','ACTIVE','2026-01-13 23:54:10','2026-02-02 23:35:55','light'),(21,'Testsd','nyambikaonline@gmail.com',NULL,'ACTIVE','2026-01-14 13:56:27','2026-01-14 13:56:27','light'),(22,'devlamp','devlamp2022@gmail.com',NULL,'ACTIVE','2026-01-19 20:30:31','2026-01-19 20:30:31','light'),(23,'test_student','universalbridgeltd@gmail.com',NULL,'ACTIVE','2026-02-02 23:36:00','2026-08-02 19:24:12','dark'),(24,'john_doe_001','john.doe@example.com','+250788123456','ACTIVE','2026-08-04 23:27:24','2026-08-04 23:27:24','light'),(25,'jane_smith_002','jane.smith@example.com','+250788654321','ACTIVE','2026-08-04 23:27:25','2026-08-04 23:27:25','light');
/*!40000 ALTER TABLE `User` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserGrade`
--

DROP TABLE IF EXISTS `UserGrade`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `UserGrade` (
  `user_id` bigint(20) NOT NULL,
  `grade_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`grade_id`,`academic_year_id`),
  KEY `grade_id` (`grade_id`),
  KEY `usergrade_ibfk_year` (`academic_year_id`),
  CONSTRAINT `usergrade_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `usergrade_ibfk_2` FOREIGN KEY (`grade_id`) REFERENCES `Grade` (`grade_id`) ON DELETE CASCADE,
  CONSTRAINT `usergrade_ibfk_year` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserGrade`
--

LOCK TABLES `UserGrade` WRITE;
/*!40000 ALTER TABLE `UserGrade` DISABLE KEYS */;
INSERT INTO `UserGrade` VALUES (20,9,5,'2026-01-14 00:01:44');
/*!40000 ALTER TABLE `UserGrade` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserProfile`
--

DROP TABLE IF EXISTS `UserProfile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `UserProfile` (
  `profile_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` enum('MALE','FEMALE','OTHER') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_type` enum('STUDENT','TEACHER','ADMIN','PARENT','STAFF') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`profile_id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserProfile`
--

LOCK TABLES `UserProfile` WRITE;
/*!40000 ALTER TABLE `UserProfile` DISABLE KEYS */;
INSERT INTO `UserProfile` VALUES (1,1,'Niyongabo','Emmanuel','MALE',NULL,NULL,'ADMIN',NULL,'2026-01-06 22:46:58','2026-01-06 22:46:58'),(13,13,'Tuyishimire','Eric','MALE',NULL,NULL,'TEACHER',NULL,'2026-01-13 17:40:08','2026-01-13 17:40:08'),(14,14,'Niyitegeka','Faustin','MALE',NULL,NULL,'TEACHER',NULL,'2026-01-13 17:42:25','2026-01-13 17:42:25'),(15,15,'Niyongabo','Emmanuel','MALE','1996-01-01','Kigali Rwanda','TEACHER',NULL,'2026-01-13 17:45:57','2026-01-13 17:45:57'),(16,16,NULL,'Felix','MALE',NULL,NULL,'TEACHER',NULL,'2026-01-13 18:42:46','2026-01-13 18:42:46'),(17,19,'Emma','Niyo','MALE',NULL,NULL,'STAFF',NULL,'2026-01-13 21:24:48','2026-01-13 21:24:48'),(18,20,'Test User1','test','MALE',NULL,NULL,'STAFF',NULL,'2026-01-13 23:54:10','2026-01-19 21:20:45'),(19,21,NULL,NULL,NULL,NULL,NULL,'TEACHER',NULL,'2026-01-14 13:56:27','2026-01-14 13:56:27'),(20,22,'Dev','Lamp',NULL,NULL,NULL,'PARENT',NULL,'2026-01-19 20:30:32','2026-01-19 20:30:32'),(21,23,'Student','Tester','MALE',NULL,NULL,'STUDENT',NULL,'2026-02-02 23:36:00','2026-02-02 23:36:00'),(22,24,'John','Doe','MALE','2010-01-15','Kigali, Rwanda','STUDENT',NULL,'2026-08-04 23:27:25','2026-08-04 23:27:25'),(23,25,'Jane','Smith','FEMALE','2008-05-20','Kigali, Rwanda','STUDENT',NULL,'2026-08-04 23:27:25','2026-08-04 23:27:25');
/*!40000 ALTER TABLE `UserProfile` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserProgramLead`
--

DROP TABLE IF EXISTS `UserProgramLead`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `UserProgramLead` (
  `user_id` bigint(20) NOT NULL,
  `program_id` bigint(20) NOT NULL,
  `academic_year_id` bigint(20) NOT NULL,
  `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`program_id`,`academic_year_id`),
  KEY `userprogramlead_ibfk_year` (`academic_year_id`),
  CONSTRAINT `userprogramlead_ibfk_year` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserProgramLead`
--

LOCK TABLES `UserProgramLead` WRITE;
/*!40000 ALTER TABLE `UserProgramLead` DISABLE KEYS */;
INSERT INTO `UserProgramLead` VALUES (19,8,5,'2026-01-13 21:25:04');
/*!40000 ALTER TABLE `UserProgramLead` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `UserRole`
--

DROP TABLE IF EXISTS `UserRole`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `UserRole` (
  `user_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `UserRole`
--

LOCK TABLES `UserRole` WRITE;
/*!40000 ALTER TABLE `UserRole` DISABLE KEYS */;
INSERT INTO `UserRole` VALUES (1,1),(13,4),(14,4),(15,4),(16,4),(19,12),(20,11),(21,4),(22,7),(23,6),(24,6),(25,6);
/*!40000 ALTER TABLE `UserRole` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'nga_central_mis'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-15 17:09:52
