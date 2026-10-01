-- Migration 098: E-Learning — exit tickets, flashcards with spaced repetition, and TVET
-- practical tasks with photo evidence (ELEARNING_AI_LESSON_STUDIO_IMPLEMENTATION_PLAN.md §11).
--
-- FlashcardReview keeps each student's FSRS scheduling state per card (computed on the
-- device with ts-fsrs, so reviews work offline and sync later).
-- ExitTicketResponse: one answer set per student per ticket, with a confidence rating —
-- the teacher's "class pulse" before the next lesson.
-- PracticalSubmission: a student's photos of their practical work; a teacher's sign-off
-- against the checklist counts as DEMONSTRATED for the mapped criteria.
-- Additive and idempotent.

ALTER TABLE CourseItem MODIFY item_type ENUM('HEADER','LESSON_NOTE','SUBJECT_DOCUMENT','PAGE','VIDEO','LINK',
  'TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','KNOWLEDGE_CHECK','DISCUSSION','FILE',
  'FLASHCARDS','EXIT_TICKET','PRACTICAL_TASK') NOT NULL;

CREATE TABLE IF NOT EXISTS FlashcardReview (
  item_id        BIGINT NOT NULL,
  user_id        BIGINT NOT NULL,
  card_id        VARCHAR(40) NOT NULL,
  fsrs_state     JSON NOT NULL,
  due_at         DATETIME NOT NULL,
  last_review_at DATETIME NULL,
  reps           INT NOT NULL DEFAULT 0,
  lapses         INT NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, user_id, card_id),
  KEY idx_fr_due (user_id, due_at),
  CONSTRAINT fk_fr_item FOREIGN KEY (item_id) REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  CONSTRAINT fk_fr_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ExitTicketResponse (
  response_id  BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id      BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  answers      JSON NOT NULL,
  correct      INT NOT NULL,
  total        INT NOT NULL,
  confidence   TINYINT NOT NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_etr (item_id, user_id),
  CONSTRAINT fk_etr_item FOREIGN KEY (item_id) REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  CONSTRAINT fk_etr_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS PracticalSubmission (
  submission_id    BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id          BIGINT NOT NULL,
  user_id          BIGINT NOT NULL,
  asset_ids        JSON NOT NULL,
  student_note     VARCHAR(1000) NULL,
  status           ENUM('SUBMITTED','RETURNED','SIGNED_OFF') NOT NULL DEFAULT 'SUBMITTED',
  checklist_result JSON NULL,
  teacher_comment  VARCHAR(1000) NULL,
  reviewed_by      BIGINT NULL,
  reviewed_at      DATETIME NULL,
  submitted_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ps (item_id, user_id),
  KEY idx_ps_item (item_id, status),
  CONSTRAINT fk_ps_item FOREIGN KEY (item_id) REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE LearningEvent MODIFY verb ENUM('VIEWED','PROGRESSED','COMPLETED','MARKED_DONE','ATTEMPTED','SCORED','PASSED',
  'FAILED','SUBMITTED','COMMENTED','ASKED_AI','REVIEWED_CARD','SUBMITTED_EVIDENCE') NOT NULL;
