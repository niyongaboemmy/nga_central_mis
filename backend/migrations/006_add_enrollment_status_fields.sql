-- Add status fields to enrollment tables for soft delete functionality

ALTER TABLE StudentClassGroup
ADD COLUMN status ENUM('ACTIVE', 'DISABLED') DEFAULT 'ACTIVE' NOT NULL;

ALTER TABLE StudentSubjectEnrollment
ADD COLUMN status ENUM('ACTIVE', 'DISABLED') DEFAULT 'ACTIVE' NOT NULL;