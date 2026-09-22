-- Migration 086: E-Learning — progress, completion and the learning-event log (Phase 2).
--
-- CourseItemProgress is the per-student projection ("where am I, what have I done");
-- LearningEvent is the xAPI-shaped append-only source of truth behind it, written by the
-- MIS UI (VIEWED / MARKED_DONE / …) and by partner systems (Task Mentor, Tupo) through
-- POST /integrations/learning-events. CourseSectionPrerequisite carries Canvas-style
-- "requires section X" locks (opt-in per course).

CREATE TABLE IF NOT EXISTS CourseItemProgress (
  item_id          BIGINT NOT NULL,
  user_id          BIGINT NOT NULL,
  state            ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
  first_viewed_at  DATETIME NULL,
  last_viewed_at   DATETIME NULL,
  completed_at     DATETIME NULL,
  completed_via    ENUM('VIEW','MARK_DONE','EVENT','TEACHER') NULL,
  view_count       INT NOT NULL DEFAULT 0,
  seconds_spent    INT NOT NULL DEFAULT 0,
  best_score_pct   DECIMAL(5,2) NULL,
  last_position    JSON NULL,
  PRIMARY KEY (item_id, user_id),
  KEY idx_progress_user (user_id, state),
  CONSTRAINT fk_progress_item FOREIGN KEY (item_id) REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  CONSTRAINT fk_progress_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS LearningEvent (
  event_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id  BIGINT NOT NULL,
  verb           ENUM('VIEWED','PROGRESSED','COMPLETED','MARKED_DONE','ATTEMPTED','SCORED','PASSED','FAILED','SUBMITTED','COMMENTED','ASKED_AI') NOT NULL,
  object_type    ENUM('COURSE_ITEM','COURSE_SECTION','COURSE','LESSON_NOTE','TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','TUPO_THREAD') NOT NULL,
  object_id      BIGINT NOT NULL,
  course_item_id BIGINT NULL,
  result_json    JSON NULL,
  context_json   JSON NULL,
  source_system  VARCHAR(30) NOT NULL DEFAULT 'MIS',
  occurred_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key VARCHAR(120) NULL,
  UNIQUE KEY uq_event_idem (source_system, idempotency_key),
  KEY idx_event_actor_time (actor_user_id, occurred_at),
  KEY idx_event_item (course_item_id, verb),
  CONSTRAINT fk_event_actor FOREIGN KEY (actor_user_id) REFERENCES `User`(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_event_item FOREIGN KEY (course_item_id) REFERENCES CourseItem(item_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CourseSectionPrerequisite (
  section_id          BIGINT NOT NULL,
  requires_section_id BIGINT NOT NULL,
  PRIMARY KEY (section_id, requires_section_id),
  CONSTRAINT fk_prereq_section FOREIGN KEY (section_id) REFERENCES CourseSection(section_id) ON DELETE CASCADE,
  CONSTRAINT fk_prereq_requires FOREIGN KEY (requires_section_id) REFERENCES CourseSection(section_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
