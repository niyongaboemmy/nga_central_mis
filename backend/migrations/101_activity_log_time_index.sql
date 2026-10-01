-- 101: Index the audit log (ActivityLog) by time.
--
-- Every Audit log query filters on a created_at range (and optionally an action
-- type); without an index each one scanned the whole table. Idempotent: each index
-- is only added when missing. MySQL 5.7 and 8.

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ActivityLog' AND INDEX_NAME = 'ix_activitylog_created') > 0, 'SELECT 1',
  'ALTER TABLE `ActivityLog` ADD KEY `ix_activitylog_created` (`created_at`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ActivityLog' AND INDEX_NAME = 'ix_activitylog_action_created') > 0, 'SELECT 1',
  'ALTER TABLE `ActivityLog` ADD KEY `ix_activitylog_action_created` (`action_type`, `created_at`)');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
