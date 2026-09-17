-- Migration 061: LessonNotePromptPreset — lets a teacher save their own frequently-used
-- "Ask AI" instructions, shown as quick-pick chips alongside the built-in prompt library
-- in the lesson note editor.

CREATE TABLE IF NOT EXISTS LessonNotePromptPreset (
  preset_id   BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id     BIGINT NOT NULL,
  label       VARCHAR(80) NOT NULL,
  prompt_text TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lnpp_user FOREIGN KEY (user_id) REFERENCES `User`(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_lnpp_user ON LessonNotePromptPreset(user_id);
