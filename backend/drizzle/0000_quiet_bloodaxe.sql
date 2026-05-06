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
CREATE TABLE `ActivityLog` (
	`activity_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`actor_id` bigint,
	`action_type` varchar(50) NOT NULL,
	`description` varchar(500) NOT NULL,
	`entity_type` varchar(50),
	`entity_id` bigint,
	`metadata` text,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ActivityLog_activity_id` PRIMARY KEY(`activity_id`)
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
CREATE TABLE `CourseCategory` (
	`category_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(255),
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `CourseCategory_category_id` PRIMARY KEY(`category_id`),
	CONSTRAINT `CourseCategory_name_unique` UNIQUE(`name`)
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
CREATE TABLE `LessonPlan` (
	`lesson_plan_id` bigint AUTO_INCREMENT NOT NULL,
	`entry_id` bigint NOT NULL,
	`user_id` bigint NOT NULL,
	`date` date NOT NULL,
	`start_time` varchar(50),
	`end_time` varchar(50),
	`sector` varchar(100),
	`trade` varchar(100),
	`level` int,
	`module_code` varchar(50),
	`module_name` varchar(255),
	`no_trainees` int,
	`class_name` varchar(100),
	`learning_outcomes` text,
	`indicative_content` text,
	`topic_big_question` text,
	`range_duration` varchar(100),
	`objectives` text,
	`language_focus` text,
	`facilitation_techniques` text,
	`specific_knowledge` text,
	`introduction_trainer` text,
	`introduction_learner` text,
	`introduction_resources` text,
	`introduction_duration` varchar(50),
	`development_trainer` text,
	`development_learner` text,
	`development_resources` text,
	`development_duration` varchar(50),
	`conclusion_summary` text,
	`conclusion_learner` text,
	`conclusion_duration` varchar(50),
	`assignment` text,
	`evaluation` text,
	`references` text,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `LessonPlan_lesson_plan_id` PRIMARY KEY(`lesson_plan_id`)
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
CREATE TABLE `RoleSystemFragment` (
	`fragment_id` bigint AUTO_INCREMENT NOT NULL,
	`school_id` bigint NOT NULL,
	`role_id` bigint NOT NULL,
	`system_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `RoleSystemFragment_fragment_id` PRIMARY KEY(`fragment_id`),
	CONSTRAINT `unique_role_system_school` UNIQUE(`school_id`,`role_id`,`system_id`)
);
--> statement-breakpoint
CREATE TABLE `SSOCode` (
	`code_id` bigint AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`user_id` bigint NOT NULL,
	`system_id` bigint NOT NULL,
	`expires_at` datetime NOT NULL,
	`is_used` tinyint DEFAULT 0,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `SSOCode_code_id` PRIMARY KEY(`code_id`),
	CONSTRAINT `SSOCode_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `SchemeOfWork` (
	`scheme_id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`subject_id` bigint NOT NULL,
	`class_group_id` bigint NOT NULL,
	`academic_term_id` bigint NOT NULL,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `SchemeOfWork_scheme_id` PRIMARY KEY(`scheme_id`)
);
--> statement-breakpoint
CREATE TABLE `SchemeOfWorkEntry` (
	`entry_id` bigint AUTO_INCREMENT NOT NULL,
	`scheme_id` bigint NOT NULL,
	`week_number` varchar(50),
	`start_date` date,
	`end_date` date,
	`topic` text,
	`sub_topic` text,
	`objective` text,
	`methodology` text,
	`resources` text,
	`evaluation` text,
	`is_completed` tinyint DEFAULT 0,
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `SchemeOfWorkEntry_entry_id` PRIMARY KEY(`entry_id`)
);
--> statement-breakpoint
CREATE TABLE `School` (
	`school_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`address` varchar(255),
	`contact_email` varchar(150),
	`contact_phone` varchar(50),
	`logo` varchar(500),
	`status` enum('ACTIVE','INACTIVE','SUSPENDED') DEFAULT 'ACTIVE',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `School_school_id` PRIMARY KEY(`school_id`),
	CONSTRAINT `School_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `SchoolSystemAssignment` (
	`school_id` bigint NOT NULL,
	`system_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `SchoolSystemAssignment_school_id_system_id_pk` PRIMARY KEY(`school_id`,`system_id`)
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
	`course_category_id` bigint,
	`max_marks` int,
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `Subject_subject_id` PRIMARY KEY(`subject_id`),
	CONSTRAINT `Subject_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `System` (
	`system_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(255),
	`client_id` varchar(100),
	`client_secret` varchar(255),
	`allowed_redirect_uris` text,
	`icon_url` varchar(255) NOT NULL,
	`home_url` varchar(255) NOT NULL,
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	`created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `System_system_id` PRIMARY KEY(`system_id`),
	CONSTRAINT `System_name_unique` UNIQUE(`name`),
	CONSTRAINT `System_client_id_unique` UNIQUE(`client_id`)
);
--> statement-breakpoint
CREATE TABLE `TeacherSubjectAssignment` (
	`user_id` bigint NOT NULL,
	`subject_id` bigint NOT NULL,
	`class_group_id` bigint NOT NULL,
	`academic_term_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `TeacherSubjectAssignment_user_id_subject_id_class_group_id_academic_term_id_pk` PRIMARY KEY(`user_id`,`subject_id`,`class_group_id`,`academic_term_id`)
);
--> statement-breakpoint
CREATE TABLE `User` (
	`user_id` bigint AUTO_INCREMENT NOT NULL,
	`username` varchar(100) NOT NULL,
	`email` varchar(150) NOT NULL,
	`phone_number` varchar(50),
	`status` enum('ACTIVE','INACTIVE','SUSPENDED') DEFAULT 'ACTIVE',
	`preferred_theme` enum('light','dark') DEFAULT 'light',
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
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_actor_id_User_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE `LessonPlan` ADD CONSTRAINT `LessonPlan_entry_id_SchemeOfWorkEntry_entry_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `SchemeOfWorkEntry`(`entry_id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `LessonPlan` ADD CONSTRAINT `LessonPlan_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `OTP` ADD CONSTRAINT `OTP_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Parenting` ADD CONSTRAINT `Parenting_student_id_User_user_id_fk` FOREIGN KEY (`student_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Parenting` ADD CONSTRAINT `Parenting_parent_id_User_user_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role`(`role_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RolePermission` ADD CONSTRAINT `RolePermission_perm_id_Permission_perm_id_fk` FOREIGN KEY (`perm_id`) REFERENCES `Permission`(`perm_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School`(`school_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role`(`role_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SSOCode` ADD CONSTRAINT `SSOCode_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SSOCode` ADD CONSTRAINT `SSOCode_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchemeOfWork` ADD CONSTRAINT `SchemeOfWork_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchemeOfWork` ADD CONSTRAINT `SchemeOfWork_subject_id_Subject_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject`(`subject_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchemeOfWork` ADD CONSTRAINT `SchemeOfWork_class_group_id_ClassGroup_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup`(`class_group_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchemeOfWork` ADD CONSTRAINT `SchemeOfWork_academic_term_id_AcademicTerm_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm`(`academic_term_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchemeOfWorkEntry` ADD CONSTRAINT `SchemeOfWorkEntry_scheme_id_SchemeOfWork_scheme_id_fk` FOREIGN KEY (`scheme_id`) REFERENCES `SchemeOfWork`(`scheme_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchoolSystemAssignment` ADD CONSTRAINT `SchoolSystemAssignment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School`(`school_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchoolSystemAssignment` ADD CONSTRAINT `SchoolSystemAssignment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentClassGroup` ADD CONSTRAINT `StudentClassGroup_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentClassGroup` ADD CONSTRAINT `StudentClassGroup_class_group_id_ClassGroup_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup`(`class_group_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentSubjectEnrollment` ADD CONSTRAINT `StudentSubjectEnrollment_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentSubjectEnrollment` ADD CONSTRAINT `StudentSubjectEnrollment_subject_id_Subject_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject`(`subject_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `StudentSubjectEnrollment` ADD CONSTRAINT `StudentSubjectEnrollment_academic_term_id_AcademicTerm_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm`(`academic_term_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `Subject` ADD CONSTRAINT `Subject_course_category_id_CourseCategory_category_id_fk` FOREIGN KEY (`course_category_id`) REFERENCES `CourseCategory`(`category_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TeacherSubjectAssignment_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TeacherSubjectAssignment_subject_id_Subject_subject_id_fk` FOREIGN KEY (`subject_id`) REFERENCES `Subject`(`subject_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TeacherSubjectAssignment_class_group_id_ClassGroup_class_group_id_fk` FOREIGN KEY (`class_group_id`) REFERENCES `ClassGroup`(`class_group_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TeacherSubjectAssignment` ADD CONSTRAINT `TeacherSubjectAssignment_academic_term_id_AcademicTerm_academic_term_id_fk` FOREIGN KEY (`academic_term_id`) REFERENCES `AcademicTerm`(`academic_term_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserGrade` ADD CONSTRAINT `UserGrade_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserGrade` ADD CONSTRAINT `UserGrade_grade_id_Grade_grade_id_fk` FOREIGN KEY (`grade_id`) REFERENCES `Grade`(`grade_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserProfile` ADD CONSTRAINT `UserProfile_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserProgramLead` ADD CONSTRAINT `UserProgramLead_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserProgramLead` ADD CONSTRAINT `UserProgramLead_program_id_Program_program_id_fk` FOREIGN KEY (`program_id`) REFERENCES `Program`(`program_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role`(`role_id`) ON DELETE no action ON UPDATE no action;