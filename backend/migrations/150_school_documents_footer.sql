-- 150: a school's document letterhead gets a footer.
-- School.documents_logo (migration 080) is the header mark printed at the top of every page of
-- the school's documents. These two columns are the matching footer printed at the bottom of
-- every page:
--   documents_footer       the footer image (file-server path, like the logos), e.g. a strip
--                          with an accreditation mark and the school's contacts
--   documents_footer_text  footer text, one line per row (used with or without the image)
-- Every school database has a School table, so this runs in every tenant database.
-- Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'School' AND COLUMN_NAME = 'documents_footer') > 0,
  'SELECT 1', 'ALTER TABLE `School` ADD COLUMN `documents_footer` VARCHAR(500) DEFAULT NULL AFTER `documents_logo`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'School' AND COLUMN_NAME = 'documents_footer_text') > 0,
  'SELECT 1', 'ALTER TABLE `School` ADD COLUMN `documents_footer_text` VARCHAR(500) DEFAULT NULL AFTER `documents_footer`');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
