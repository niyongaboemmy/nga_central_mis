-- ============================================
-- School code (for student registration numbers)
-- ============================================
-- Registration numbers are now "<school code>-<4-digit sequence>" (e.g.
-- 120823-0001) instead of "NGA-<year>-<5-digit sequence>" -- see
-- utils/registrationNumber.ts. The school code lives on School (school
-- details) so it's admin-editable per deployment rather than hardcoded.

ALTER TABLE `School`
  ADD COLUMN `school_code` VARCHAR(20) DEFAULT NULL AFTER `name`,
  ADD UNIQUE KEY `uq_school_school_code` (`school_code`);
