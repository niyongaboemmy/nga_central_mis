-- Migration: Add CourseCategory table and update Subject table
-- Date: 2026-01-20
-- Description: Add course_category_id and max_marks to Subject table, create CourseCategory table

-- Create CourseCategory table
CREATE TABLE IF NOT EXISTS `CourseCategory` (
  `category_id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `description` VARCHAR(255),
  `status` ENUM('ACTIVE', 'DISABLED') DEFAULT 'ACTIVE'
);

-- Add new columns to Subject table
ALTER TABLE `Subject` 
  ADD COLUMN `course_category_id` BIGINT,
  ADD COLUMN `max_marks` INT;

-- Add foreign key constraint
ALTER TABLE `Subject`
  ADD CONSTRAINT `Subject_course_category_id_CourseCategory_category_id_fk`
  FOREIGN KEY (`course_category_id`) REFERENCES `CourseCategory`(`category_id`);
