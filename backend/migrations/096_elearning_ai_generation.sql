-- Migration 096: E-Learning Lesson Studio — AI generation of whole weeks
-- (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §8, §12).
--
-- CourseGenerationRun / CourseGenerationTask are the durable queue behind "generate every
-- week": a run is one execution of a recipe (blueprint) over a course, a task is one unit
-- of AI work for one week. Both survive restarts (the old AI job stores were in-memory).
-- CourseBlueprint holds teachers' saved recipes; the built-in presets live in code.
-- AIUsageLog has one row per provider attempt and is what free-tier quotas are counted from.
-- CourseItem gains provenance + review columns so AI drafts are never shown to students
-- before a teacher approves them. Additive and idempotent.

CREATE TABLE IF NOT EXISTS CourseBlueprint (
  blueprint_id  BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_user_id BIGINT NOT NULL,
  subject_id    BIGINT NULL,
  program_id    BIGINT NULL,
  visibility    ENUM('PRIVATE','DEPARTMENT','SCHOOL') NOT NULL DEFAULT 'PRIVATE',
  name          VARCHAR(120) NOT NULL,
  config        JSON NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_cb_owner (owner_user_id),
  CONSTRAINT fk_cb_owner FOREIGN KEY (owner_user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CourseGenerationRun (
  run_id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id     BIGINT NOT NULL,
  created_by    BIGINT NOT NULL,
  parent_run_id BIGINT NULL,
  mode          ENUM('PREVIEW','FULL','SINGLE_WEEK','REGENERATE_ITEM') NOT NULL,
  status        ENUM('PLANNED','RUNNING','PAUSED','PAUSED_QUOTA','READY_FOR_REVIEW','COMPLETED','CANCELLED','FAILED') NOT NULL DEFAULT 'PLANNED',
  blueprint     JSON NOT NULL,
  section_ids   JSON NOT NULL,
  estimate      JSON NULL,
  not_before    DATETIME NULL,
  paused_reason VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at    DATETIME NULL,
  finished_at   DATETIME NULL,
  KEY idx_cgr_course (course_id, status),
  KEY idx_cgr_status (status),
  CONSTRAINT fk_cgr_course FOREIGN KEY (course_id) REFERENCES Course(course_id) ON DELETE CASCADE,
  CONSTRAINT fk_cgr_user FOREIGN KEY (created_by) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CourseGenerationTask (
  task_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  run_id        BIGINT NOT NULL,
  section_id    BIGINT NOT NULL,
  kind          VARCHAR(32) NOT NULL,
  depends_on    JSON NULL,
  status        ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','SKIPPED','CANCELLED','DISMISSED') NOT NULL DEFAULT 'QUEUED',
  skip_reason   VARCHAR(40) NULL,
  attempts      INT NOT NULL DEFAULT 0,
  not_before    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at    DATETIME NULL,
  heartbeat_at  DATETIME NULL,
  input_hash    CHAR(64) NULL,
  provider_used VARCHAR(20) NULL,
  model         VARCHAR(80) NULL,
  output_ref    JSON NULL,
  output_digest JSON NULL,
  error         VARCHAR(1000) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at   DATETIME NULL,
  KEY idx_cgt_ready (status, not_before),
  KEY idx_cgt_run (run_id, section_id),
  CONSTRAINT fk_cgt_run FOREIGN KEY (run_id) REFERENCES CourseGenerationRun(run_id) ON DELETE CASCADE,
  CONSTRAINT fk_cgt_section FOREIGN KEY (section_id) REFERENCES CourseSection(section_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS AIUsageLog (
  usage_id      BIGINT PRIMARY KEY AUTO_INCREMENT,
  occurred_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  feature       VARCHAR(60) NOT NULL,
  role          VARCHAR(16) NULL,
  bulk          TINYINT NOT NULL DEFAULT 0,
  provider      VARCHAR(20) NOT NULL,
  model         VARCHAR(80) NULL,
  ok            TINYINT NOT NULL,
  error_class   VARCHAR(30) NULL,
  latency_ms    INT NULL,
  input_tokens  INT NULL,
  output_tokens INT NULL,
  actor_user_id BIGINT NULL,
  course_id     BIGINT NULL,
  run_id        BIGINT NULL,
  KEY idx_aiu_day (occurred_at, provider),
  KEY idx_aiu_actor (actor_user_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- CourseItem provenance + review state ---------------------------------------------------
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CourseItem' AND COLUMN_NAME = 'ai_origin') > 0, 'SELECT 1',
  'ALTER TABLE `CourseItem` ADD COLUMN `ai_origin` ENUM(''NONE'',''AI_GENERATED'',''AI_ASSISTED'') NOT NULL DEFAULT ''NONE''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CourseItem' AND COLUMN_NAME = 'review_state') > 0, 'SELECT 1',
  'ALTER TABLE `CourseItem` ADD COLUMN `review_state` ENUM(''NOT_REQUIRED'',''PENDING_REVIEW'',''ACCEPTED'',''EDITED'',''DISMISSED'') NOT NULL DEFAULT ''NOT_REQUIRED''');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CourseItem' AND COLUMN_NAME = 'generation_task_id') > 0, 'SELECT 1',
  'ALTER TABLE `CourseItem` ADD COLUMN `generation_task_id` BIGINT NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CourseItem' AND COLUMN_NAME = 'input_hash') > 0, 'SELECT 1',
  'ALTER TABLE `CourseItem` ADD COLUMN `input_hash` CHAR(64) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CourseItem' AND COLUMN_NAME = 'source_refs') > 0, 'SELECT 1',
  'ALTER TABLE `CourseItem` ADD COLUMN `source_refs` JSON NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CourseItem' AND COLUMN_NAME = 'review_flags') > 0, 'SELECT 1',
  'ALTER TABLE `CourseItem` ADD COLUMN `review_flags` JSON NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
