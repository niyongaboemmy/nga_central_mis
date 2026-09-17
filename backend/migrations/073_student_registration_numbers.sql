-- ============================================
-- Student registration numbers
-- ============================================
-- Every STUDENT gets a unique registration number, formatted
-- "NGA-<admission year>-<5-digit sequence>" (e.g. NGA-2026-00001). The
-- sequence is global (never resets per year) and comes from
-- RegistrationSequence, a single-row counter incremented under a row lock so
-- concurrent student creations can never collide -- see
-- utils/registrationNumber.ts.

ALTER TABLE `UserProfile`
  ADD COLUMN `registration_number` VARCHAR(20) DEFAULT NULL AFTER `external_id`,
  ADD UNIQUE KEY `uq_user_profile_registration_number` (`registration_number`);

CREATE TABLE IF NOT EXISTS `RegistrationSequence` (
  `id` TINYINT NOT NULL,
  `current_value` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `RegistrationSequence` (`id`, `current_value`)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE `id` = `id`;
