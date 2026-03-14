-- Database migration to add missing fields to SchemeOfWorkEntry for the refined PDF report
-- Generated on: 2026-03-13

-- Add missing columns to support the detailed Scheme of Work report
ALTER TABLE SchemeOfWorkEntry 
ADD COLUMN duration VARCHAR(50) DEFAULT NULL AFTER evaluation,
ADD COLUMN learning_place VARCHAR(100) DEFAULT NULL AFTER duration,
ADD COLUMN observation TEXT DEFAULT NULL AFTER learning_place;

-- Verify the changes
-- DESCRIBE SchemeOfWorkEntry;
