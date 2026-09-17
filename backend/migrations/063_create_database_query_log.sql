-- Audit log for every query executed through the Database Management tool
CREATE TABLE IF NOT EXISTS `DatabaseQueryLog` (
  `log_id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `query_text` TEXT NOT NULL,
  `statement_type` VARCHAR(50) NOT NULL,
  `is_write` TINYINT NOT NULL DEFAULT 0,
  `row_count` INT NULL,
  `execution_ms` INT NULL,
  `status` ENUM('SUCCESS', 'ERROR') NOT NULL,
  `error_message` TEXT NULL,
  `ip_address` VARCHAR(64) NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_database_query_log_user` (`user_id`),
  KEY `idx_database_query_log_created` (`created_at`),
  CONSTRAINT `fk_database_query_log_user` FOREIGN KEY (`user_id`) REFERENCES `User` (`user_id`)
);
