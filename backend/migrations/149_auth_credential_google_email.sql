-- 149: the Google account a person uses for the staff attendance clock (Tendo /c/<school>).
-- AuthCredential.google_id already holds the Google account id (sub) once someone signs in
-- with Google. google_email lets a person (or an admin) name a Google account whose address
-- differs from their Amashuri e-mail; the first clock registration with that account then
-- fills google_id. Read and written with raw SQL (services/staffIdentity.ts), so a server
-- without this column keeps working. Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AuthCredential' AND COLUMN_NAME = 'google_email') > 0,
  'SELECT 1', 'ALTER TABLE `AuthCredential` ADD COLUMN `google_email` VARCHAR(255) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AuthCredential' AND INDEX_NAME = 'idx_auth_google_email') > 0,
  'SELECT 1', 'CREATE INDEX `idx_auth_google_email` ON `AuthCredential` (`google_email`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
