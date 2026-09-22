-- Migration 087: E-Learning — knowledge-check attempts and per-account learning prefs (Phase 3/5).
--
-- KnowledgeCheckAttempt keeps every attempt of a KNOWLEDGE_CHECK item (formative, unlimited);
-- the best score is projected onto CourseItemProgress.best_score_pct like any other result.
-- UserLearningPrefs is per account (not per device) because it encodes choices — celebrations,
-- the opt-in streak, a reduced-motion override (UX plan §6.3).

CREATE TABLE IF NOT EXISTS KnowledgeCheckAttempt (
  attempt_id   BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id      BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  answers_json JSON NOT NULL,
  correct      INT NOT NULL DEFAULT 0,
  total        INT NOT NULL DEFAULT 0,
  score_pct    DECIMAL(5,2) NOT NULL DEFAULT 0,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_kca_item_user (item_id, user_id),
  CONSTRAINT fk_kca_item FOREIGN KEY (item_id) REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  CONSTRAINT fk_kca_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS UserLearningPrefs (
  user_id              BIGINT PRIMARY KEY,
  streak_enabled       TINYINT NOT NULL DEFAULT 0,
  celebrations_enabled TINYINT NOT NULL DEFAULT 1,
  reduced_motion       TINYINT NULL,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ulp_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
