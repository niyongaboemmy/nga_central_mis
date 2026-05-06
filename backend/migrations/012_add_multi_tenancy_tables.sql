CREATE TABLE `School` (
	`school_id` bigint NOT NULL AUTO_INCREMENT,
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

CREATE TABLE `System` (
	`system_id` bigint NOT NULL AUTO_INCREMENT,
	`name` varchar(100) NOT NULL,
	`description` varchar(255),
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `System_system_id` PRIMARY KEY(`system_id`),
	CONSTRAINT `System_name_unique` UNIQUE(`name`)
);

CREATE TABLE `SchoolSystemAssignment` (
	`school_id` bigint NOT NULL,
	`system_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	`status` enum('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
	CONSTRAINT `SchoolSystemAssignment_school_id_system_id` PRIMARY KEY(`school_id`,`system_id`)
);

CREATE TABLE `RoleSystemFragment` (
	`fragment_id` bigint NOT NULL AUTO_INCREMENT,
	`school_id` bigint NOT NULL,
	`role_id` bigint NOT NULL,
	`system_id` bigint NOT NULL,
	`assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `RoleSystemFragment_fragment_id` PRIMARY KEY(`fragment_id`),
    CONSTRAINT `unique_role_system_school` UNIQUE(`school_id`,`role_id`,`system_id`)
);

ALTER TABLE `SchoolSystemAssignment` ADD CONSTRAINT `SchoolSystemAssignment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School`(`school_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `SchoolSystemAssignment` ADD CONSTRAINT `SchoolSystemAssignment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_school_id_School_school_id_fk` FOREIGN KEY (`school_id`) REFERENCES `School`(`school_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_role_id_Role_role_id_fk` FOREIGN KEY (`role_id`) REFERENCES `Role`(`role_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `RoleSystemFragment` ADD CONSTRAINT `RoleSystemFragment_system_id_System_system_id_fk` FOREIGN KEY (`system_id`) REFERENCES `System`(`system_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
