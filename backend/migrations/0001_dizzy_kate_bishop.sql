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
CREATE TABLE `CourseCategory` (
	`category_id` bigint AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(255),
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `CourseCategory_category_id` PRIMARY KEY(`category_id`),
	CONSTRAINT `CourseCategory_name_unique` UNIQUE(`name`)
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
ALTER TABLE `Subject` ADD `course_category_id` bigint;--> statement-breakpoint
ALTER TABLE `Subject` ADD `max_marks` int;--> statement-breakpoint
ALTER TABLE `Subject` ADD CONSTRAINT `Subject_course_category_id_CourseCategory_category_id_fk` FOREIGN KEY (`course_category_id`) REFERENCES `CourseCategory`(`category_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_actor_id_User_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School`(`school_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role`(`role_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SSOCode` ADD CONSTRAINT `SSOCode_user_id_User_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `User`(`user_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SSOCode` ADD CONSTRAINT `SSOCode_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchoolSystemAssignment` ADD CONSTRAINT `SchoolSystemAssignment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School`(`school_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SchoolSystemAssignment` ADD CONSTRAINT `SchoolSystemAssignment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE no action ON UPDATE no action;