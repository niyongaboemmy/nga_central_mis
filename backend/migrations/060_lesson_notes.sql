-- Migration 060: Lesson Notes — a Google-Docs-style rich text notes workspace for
-- teachers, optionally anchored to a Scheme of Work week (and, through it, to the
-- Curriculum's performance criteria) so AI generation/editing stays grounded in the
-- syllabus. See LESSON_NOTES implementation plan (AI Lesson Notes artifact).
--
-- LessonNote stores the Tiptap document (content_json, source of truth) plus a
-- rendered HTML cache (content_html) for fast read-only rendering in the student
-- share view. LessonNoteVersion snapshots content before every AI-applied edit so a
-- teacher can always revert an AI change. LessonNoteShare mirrors the filter-based
-- shape already used by DocumentPermission/FolderPermission. LessonNoteImage tracks
-- images embedded in a note, uploaded through the existing FTP-backed flow.

CREATE TABLE IF NOT EXISTS LessonNote (
  note_id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id           BIGINT NOT NULL,
  subject_id        BIGINT NOT NULL,
  class_group_id    BIGINT NULL,
  scheme_entry_id   BIGINT NULL,
  academic_term_id  BIGINT NULL,
  title             VARCHAR(255) NOT NULL,
  content_json      JSON NULL,
  content_html      LONGTEXT NULL,
  status            ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  source            ENUM('MANUAL','AI_GENERATED','AI_ASSISTED') NOT NULL DEFAULT 'MANUAL',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ln_user FOREIGN KEY (user_id) REFERENCES `User`(user_id),
  CONSTRAINT fk_ln_subject FOREIGN KEY (subject_id) REFERENCES Subject(subject_id) ON DELETE CASCADE,
  CONSTRAINT fk_ln_class_group FOREIGN KEY (class_group_id) REFERENCES ClassGroup(class_group_id),
  CONSTRAINT fk_ln_scheme_entry FOREIGN KEY (scheme_entry_id) REFERENCES SchemeOfWorkEntry(entry_id) ON DELETE SET NULL,
  CONSTRAINT fk_ln_term FOREIGN KEY (academic_term_id) REFERENCES AcademicTerm(academic_term_id)
);

CREATE INDEX idx_ln_user ON LessonNote(user_id);
CREATE INDEX idx_ln_subject ON LessonNote(subject_id, class_group_id);
CREATE INDEX idx_ln_scheme_entry ON LessonNote(scheme_entry_id);

CREATE TABLE IF NOT EXISTS LessonNoteVersion (
  version_id   BIGINT PRIMARY KEY AUTO_INCREMENT,
  note_id      BIGINT NOT NULL,
  content_json JSON NOT NULL,
  created_by   ENUM('USER','AI') NOT NULL DEFAULT 'USER',
  prompt_text  TEXT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lnv_note FOREIGN KEY (note_id) REFERENCES LessonNote(note_id) ON DELETE CASCADE
);

CREATE INDEX idx_lnv_note ON LessonNoteVersion(note_id, created_at);

CREATE TABLE IF NOT EXISTS LessonNoteShare (
  share_id    BIGINT PRIMARY KEY AUTO_INCREMENT,
  note_id     BIGINT NOT NULL,
  shared_by   BIGINT NOT NULL,
  filter_type ENUM('class_group','subject_enrolled','specific_students') NOT NULL,
  filter_ids  JSON NOT NULL,
  permission  ENUM('VIEW') NOT NULL DEFAULT 'VIEW',
  expires_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lns_note FOREIGN KEY (note_id) REFERENCES LessonNote(note_id) ON DELETE CASCADE,
  CONSTRAINT fk_lns_shared_by FOREIGN KEY (shared_by) REFERENCES `User`(user_id)
);

CREATE INDEX idx_lns_note ON LessonNoteShare(note_id);

CREATE TABLE IF NOT EXISTS LessonNoteImage (
  image_id      BIGINT PRIMARY KEY AUTO_INCREMENT,
  note_id       BIGINT NOT NULL,
  user_id       BIGINT NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lni_note FOREIGN KEY (note_id) REFERENCES LessonNote(note_id) ON DELETE CASCADE,
  CONSTRAINT fk_lni_user FOREIGN KEY (user_id) REFERENCES `User`(user_id)
);

CREATE INDEX idx_lni_note ON LessonNoteImage(note_id);

INSERT INTO Permission (name, description, status)
SELECT 'MANAGE_LESSON_NOTES', 'Create, edit, generate with AI, and share lesson notes for subjects the teacher is assigned to', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'MANAGE_LESSON_NOTES');

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_SHARED_LESSON_NOTES', 'View lesson notes a teacher has shared with the student (read-only)', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_SHARED_LESSON_NOTES');
