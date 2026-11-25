-- 148: User.email becomes optional. Young students often have no e-mail address; they
-- are registered (by hand or by Excel upload) without one and cannot sign in: there is
-- no password for them, and sign-in, Google sign-in and password reset all need an
-- e-mail. Adding an e-mail later gives them a temporary password by e-mail.
-- The UNIQUE key stays: MySQL allows any number of NULLs in it. Idempotent; MySQL 5.7 and 8.

SET @s := IF((SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User' AND COLUMN_NAME = 'email') = 'YES',
  'SELECT 1', 'ALTER TABLE `User` MODIFY COLUMN `email` VARCHAR(150) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Accounts saved with an empty e-mail before this change mean "no e-mail".
UPDATE `User` SET `email` = NULL WHERE `email` = '';
