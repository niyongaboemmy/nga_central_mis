-- 114: Index UserProfile by user_id.
--
-- UserProfile had no index on user_id (only profile_id and registration_number),
-- so every User <-> UserProfile join was a full nested-loop scan on MySQL 5.7.
-- Found while building the Assign Mentor picker: one search over ~5.5k users took
-- ~9 s. Non-unique on purpose (nothing guarantees one profile per user).
-- Idempotent: only added when missing. MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'UserProfile' AND INDEX_NAME = 'ix_userprofile_user_id') > 0, 'SELECT 1',
  'ALTER TABLE `UserProfile` ADD KEY `ix_userprofile_user_id` (`user_id`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
