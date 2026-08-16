CREATE TABLE `AcademicTerm` (
	`academic_term_id` bigint AUTO_INCREMENT NOT NULL,
	`academic_year_id` bigint NOT NULL,
	`name` varchar(50),
	`start_date` date,
	`end_date` date,
	`is_current` tinyint DEFAULT 0,
	CONSTRAINT `AcademicTerm_academic_term_id` PRIMARY KEY(`academic_term_id`)
);
--> statement-breakpoint
CREATE TABLE `AcademicYear` (
	`academic_year_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`start_date` date,
	`end_date` date,
	`is_current` tinyint DEFAULT 0,
	CONSTRAINT `AcademicYear_academic_year_id` PRIMARY KEY(`academic_year_id`)
);
--> statement-breakpoint
CREATE TABLE `AuthCredential` (
	`auth_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`force_password_change` tinyint DEFAULT 0,
	`mfa_enabled` tinyint DEFAULT 0,
	`failed_attempts` int DEFAULT 0,
	`locked_until` datetime,
	CONSTRAINT `AuthCredential_auth_id` PRIMARY KEY(`auth_id`)
);
--> statement-breakpoint
CREATE TABLE `ClassGroup` (
	`class_group_id` bigint AUTO_INCREMENT NOT NULL,
	`academic_year_id` bigint NOT NULL,
	`grade_id` bigint NOT NULL,
	`name` varchar(50) NOT NULL,
	CONSTRAINT `ClassGroup_class_group_id` PRIMARY KEY(`class_group_id`)
);
--> statement-breakpoint
CREATE TABLE `Document` (
	`document_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`folder_id` bigint,
	`file_name` varchar(255) NOT NULL,
	`original_name` varchar(255) NOT NULL,
	`file_path` varchar(500) NOT NULL,
	`file_size` bigint NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`file_extension` varchar(20) NOT NULL,
	`is_public` tinyint DEFAULT 0,
	`description` varchar(500),
	`tags` varchar(500),
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `Document_document_id` PRIMARY KEY(`document_id`)
);
--> statement-breakpoint
CREATE TABLE `DocumentFolder` (
	`folder_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`parent_folder_id` bigint,
	`name` varchar(255) NOT NULL,
	`description` varchar(500),
	`color` varchar(7) DEFAULT '#008d3b',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `DocumentFolder_folder_id` PRIMARY KEY(`folder_id`)
);
--> statement-breakpoint
CREATE TABLE `DocumentPermission` (
	`permission_id` bigint AUTO_INCREMENT NOT NULL,
	`document_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`permission_type` enum('VIEW','EDIT','DOWNLOAD','SHARE') DEFAULT 'VIEW',
	`shared_by` bigint NOT NULL,
	`shared_with` enum('user','role') DEFAULT 'user',
	`expires_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `DocumentPermission_permission_id` PRIMARY KEY(`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `DocumentVersion` (
	`version_id` bigint AUTO_INCREMENT NOT NULL,
	`document_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`version_number` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_path` varchar(500) NOT NULL,
	`file_size` bigint NOT NULL,
	`change_description` varchar(500),
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `DocumentVersion_version_id` PRIMARY KEY(`version_id`)
);
--> statement-breakpoint
CREATE TABLE `FolderPermission` (
	`permission_id` bigint AUTO_INCREMENT NOT NULL,
	`folder_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`permission_type` enum('VIEW','EDIT','SHARE') DEFAULT 'VIEW',
	`shared_by` bigint NOT NULL,
	`expires_at` datetime,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `FolderPermission_permission_id` PRIMARY KEY(`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `Grade` (
	`grade_id` bigint AUTO_INCREMENT NOT NULL,
	`program_id` bigint NOT NULL,
	`name` varchar(50) NOT NULL,
	`level_order` int NOT NULL,
	CONSTRAINT `Grade_grade_id` PRIMARY KEY(`grade_id`)
);
--> statement-breakpoint
CREATE TABLE `GradeSubject` (
	`grade_id` bigint NOT NULL,
	`subject_id` bigint NOT NULL,
	CONSTRAINT `GradeSubject_grade_id_subject_id_pk` PRIMARY KEY(`grade_id`,`subject_id`)
);
--> statement-breakpoint
CREATE TABLE `OTP` (
	`otp_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`otp_code` varchar(6) NOT NULL,
	`otp_type` enum('LOGIN_2FA','PASSWORD_RESET','EMAIL_VERIFICATION') DEFAULT 'LOGIN_2FA',
	`expires_at` datetime NOT NULL,
	`is_used` tinyint DEFAULT 0,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `OTP_otp_id` PRIMARY KEY(`otp_id`)
);
--> statement-breakpoint
CREATE TABLE `Parenting` (
	`parenting_id` bigint AUTO_INCREMENT NOT NULL,
	`student_id` bigint NOT NULL,
	`parent_id` bigint NOT NULL,
	`relationship` varchar(50) DEFAULT 'PARENT',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `Parenting_parenting_id` PRIMARY KEY(`parenting_id`),
	CONSTRAINT `unique_student_parent` UNIQUE(`student_id`,`parent_id`)
);
--> statement-breakpoint
CREATE TABLE `Permission` (
	`perm_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`description` varchar(255),
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `Permission_perm_id` PRIMARY KEY(`perm_id`),
	CONSTRAINT `Permission_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `Program` (
	`program_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(255),
	CONSTRAINT `Program_program_id` PRIMARY KEY(`program_id`),
	CONSTRAINT `Program_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `Role` (
	`role_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(255),
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `Role_role_id` PRIMARY KEY(`role_id`),
	CONSTRAINT `Role_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `RolePermission` (
	`role_id` bigint NOT NULL,
	`perm_id` bigint NOT NULL,
	CONSTRAINT `RolePermission_role_id_perm_id_pk` PRIMARY KEY(`role_id`,`perm_id`)
);
--> statement-breakpoint
CREATE TABLE `StudentClassGroup` (
	`user_id` bigint NOT NULL,
	`class_group_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `StudentClassGroup_user_id_class_group_id_pk` PRIMARY KEY(`user_id`,`class_group_id`)
);
--> statement-breakpoint
CREATE TABLE `StudentSubjectEnrollment` (
	`user_id` bigint NOT NULL,
	`subject_id` bigint NOT NULL,
	`academic_term_id` bigint NOT NULL,
	`enrolled_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `StudentSubjectEnrollment_user_id_subject_id_academic_term_id_pk` PRIMARY KEY(`user_id`,`subject_id`,`academic_term_id`)
);
--> statement-breakpoint
CREATE TABLE `Subject` (
	`subject_id` bigint AUTO_INCREMENT NOT NULL,
	`code` varchar(50),
	`name` varchar(150) NOT NULL,
	`description` varchar(255),
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `Subject_subject_id` PRIMARY KEY(`subject_id`),
	CONSTRAINT `Subject_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `TeacherSubjectAssignment` (
	`user_id` bigint NOT NULL,
	`subject_id` bigint NOT NULL,
	`class_group_id` bigint NOT NULL,
	`academic_term_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `TSA_user_subject_class_term_pk` PRIMARY KEY(`user_id`,`subject_id`,`class_group_id`,`academic_term_id`)
);
--> statement-breakpoint
CREATE TABLE `User` (
	`user_id` bigint AUTO_INCREMENT NOT NULL,
	`username` varchar(100) NOT NULL,
	`email` varchar(150) NOT NULL,
	`phone_number` varchar(50),
	`status` enum('ACTIVE','INACTIVE','SUSPENDED') DEFAULT 'ACTIVE',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `User_user_id` PRIMARY KEY(`user_id`),
	CONSTRAINT `User_username_unique` UNIQUE(`username`),
	CONSTRAINT `User_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `UserGrade` (
	`user_id` bigint NOT NULL,
	`grade_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `UserGrade_user_id_grade_id_pk` PRIMARY KEY(`user_id`,`grade_id`)
);
--> statement-breakpoint
CREATE TABLE `UserProfile` (
	`profile_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`first_name` varchar(100),
	`last_name` varchar(100),
	`gender` enum('MALE','FEMALE','OTHER'),
	`date_of_birth` date,
	`address` varchar(255),
	`user_type` enum('STUDENT','TEACHER','ADMIN','PARENT','STAFF'),
	`external_id` varchar(100),
	CONSTRAINT `UserProfile_profile_id` PRIMARY KEY(`profile_id`)
);
--> statement-breakpoint
CREATE TABLE `UserProgramLead` (
	`user_id` bigint NOT NULL,
	`program_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `UserProgramLead_user_id_program_id_pk` PRIMARY KEY(`user_id`,`program_id`)
);
--> statement-breakpoint
CREATE TABLE `UserRole` (
	`user_id` bigint NOT NULL,
	`role_id` bigint NOT NULL,
	CONSTRAINT `UserRole_user_id_role_id_pk` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
ALTER TABLE `AcademicTerm` ADD CONSTRAINT `AcademicTerm_academic_year_id_AcademicYear_academic_year_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear`(`academic_year_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `AuthCredential` ADD CONSTRAINT `AuthCredential_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ClassGroup` ADD CONSTRAINT `ClassGroup_academic_year_id_AcademicYear_academic_year_id_fk` FOREIGN KEY (`academic_year_id`) REFERENCES `AcademicYear`(`academic_year_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ClassGroup` ADD CONSTRAINT `ClassGroup_grade_id_Grade_grade_id_fk` FOREIGN KEY (`grade_id`) REFERENCES `Grade`(`grade_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Document` ADD CONSTRAINT `Document_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `DocumentFolder` ADD CONSTRAINT `DocumentFolder_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `DocumentPermission` ADD CONSTRAINT `DocumentPermission_document_id_Document_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `Document`(`document_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `DocumentPermission` ADD CONSTRAINT `DocumentPermission_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `DocumentPermission` ADD CONSTRAINT `DocumentPermission_shared_by_User_user_id_fk` FOREIGN KEY (`shared_by`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_document_id_Document_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `Document`(`document_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `DocumentVersion` ADD CONSTRAINT `DocumentVersion_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `FolderPermission` ADD CONSTRAINT `FolderPermission_folder_id_DocumentFolder_folder_id_fk` FOREIGN KEY (`folder_id`) REFERENCES `DocumentFolder`(`folder_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `FolderPermission` ADD CONSTRAINT `FolderPermission_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `FolderPermission` ADD CONSTRAINT `FolderPermission_shared_by_User_user_id_fk` FOREIGN KEY (`shared_by`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Grade` ADD CONSTRAINT `Grade_program_id_Program_program_id_fk` FOREIGN KEY (`program_id`) REFERENCES `Program`(`program_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `GradeSubject` ADD CONSTRAINT `GradeSubject_grade_id_Grade_grade_id_fk` FOREIGN KEY (`grade_id`) REFERENCES `Grade`(`grade_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `GradeSubject` ADD CONSTRAINT `GradeSubject_subject_id_Subject_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject`(`subject_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `OTP` ADD CONSTRAINT `OTP_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Parenting` ADD CONSTRAINT `Parenting_student_id_User_user_id_fk` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Parenting` ADD CONSTRAINT `Parenting_parent_id_User_user_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role`(`role_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_perm_id_Permission_perm_id_fk` FOREIGN KEY (`perm_id`) REFERENCES `Permission`(`perm_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentClassGroup` ADD CONSTRAINT `StudentClassGroup_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentClassGroup` ADD CONSTRAINT `StudentClassGroup_class_group_id_ClassGroup_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup`(`class_group_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentSubjectEnrollment` ADD CONSTRAINT `StudentSubjectEnrollment_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentSubjectEnrollment` ADD CONSTRAINT `StudentSubjectEnrollment_subject_id_Subject_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject`(`subject_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentSubjectEnrollment` ADD CONSTRAINT `SSE_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm`(`academic_term_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TeacherSubjectAssignment_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TeacherSubjectAssignment_subject_id_Subject_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject`(`subject_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TSA_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup`(`class_group_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TSA_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm`(`academic_term_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserGrade` ADD CONSTRAINT `UserGrade_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserGrade` ADD CONSTRAINT `UserGrade_grade_id_Grade_grade_id_fk` FOREIGN KEY (`grade_id`) REFERENCES `Grade`(`grade_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserProfile` ADD CONSTRAINT `UserProfile_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserProgramLead` ADD CONSTRAINT `UserProgramLead_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserProgramLead` ADD CONSTRAINT `UserProgramLead_program_id_Program_program_id_fk` FOREIGN KEY (`program_id`) REFERENCES `Program`(`program_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role`(`role_id`) ON DELETE no action ON UPDATE no action;