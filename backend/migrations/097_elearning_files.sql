-- Migration 097: E-Learning — any file as a learning resource, with in-browser preview
-- (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §10, §12).
--
-- FileAsset: a file a teacher uploaded straight onto a week (FILE item), or as a reference
-- for the Lesson Studio, or (later) a student's practical-task evidence.
-- FileDerivative: preview PDF / first-page thumbnail / extracted text, cached by the file's
-- sha256 — so the same deck uploaded twice converts once, and subject materials and
-- Documents can share the cache without being migrated.
-- BackgroundJob: a small durable queue for conversions (they run out of process, one at a
-- time, on the shared EC2 host — decision D1).
-- Videos are never uploaded (decision D4): they stay YouTube/Vimeo VIDEO items.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS FileAsset (
  asset_id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_user_id    BIGINT NOT NULL,
  scope            ENUM('COURSE','RUN_REFERENCE','SUBJECT','SUBMISSION') NOT NULL,
  course_id        BIGINT NULL,
  subject_id       BIGINT NULL,
  original_name    VARCHAR(255) NOT NULL,
  storage_path     VARCHAR(500) NOT NULL,
  mime_type        VARCHAR(150) NOT NULL,
  extension        VARCHAR(16) NOT NULL,
  kind             VARCHAR(16) NOT NULL,
  size_bytes       BIGINT NOT NULL,
  sha256           CHAR(64) NOT NULL,
  preview_status   ENUM('PENDING','PROCESSING','READY','FAILED','UNSUPPORTED','NOT_NEEDED') NOT NULL DEFAULT 'PENDING',
  preview_error    VARCHAR(500) NULL,
  page_count       INT NULL,
  duration_seconds INT NULL,
  text_chars       INT NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at       DATETIME NULL,
  KEY idx_fa_course (course_id),
  KEY idx_fa_sha (sha256),
  KEY idx_fa_owner (owner_user_id, deleted_at),
  CONSTRAINT fk_fa_owner FOREIGN KEY (owner_user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_fa_course FOREIGN KEY (course_id) REFERENCES Course(course_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS FileDerivative (
  sha256       CHAR(64) NOT NULL,
  variant      ENUM('PDF','THUMB','TEXT') NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  size_bytes   BIGINT NOT NULL,
  meta         JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sha256, variant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS BackgroundJob (
  job_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  kind         VARCHAR(40) NOT NULL,
  payload      JSON NOT NULL,
  status       ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  attempts     INT NOT NULL DEFAULT 0,
  not_before   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at   DATETIME NULL,
  heartbeat_at DATETIME NULL,
  last_error   VARCHAR(1000) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME NULL,
  KEY idx_bj_ready (status, not_before)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- FILE items: a CourseItem whose ref_id is a FileAsset.
ALTER TABLE CourseItem MODIFY item_type ENUM('HEADER','LESSON_NOTE','SUBJECT_DOCUMENT','PAGE','VIDEO','LINK',
  'TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','KNOWLEDGE_CHECK','DISCUSSION','FILE') NOT NULL;

-- Legacy files join the derivative cache lazily (hash computed on first preview).
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SubjectDocument' AND COLUMN_NAME = 'sha256') > 0, 'SELECT 1',
  'ALTER TABLE `SubjectDocument` ADD COLUMN `sha256` CHAR(64) NULL');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
