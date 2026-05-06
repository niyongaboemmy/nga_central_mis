-- Migration 034: Course Curriculum & Competency Management
-- Tables: SubjectCompetency, CompetencyPerformanceCriteria, SubjectDocumentCategory, SubjectDocument

CREATE TABLE SubjectCompetency (
  competency_id   BIGINT        NOT NULL AUTO_INCREMENT,
  subject_id      BIGINT        NOT NULL,
  user_id         BIGINT        NOT NULL,
  element_number  INT           NOT NULL DEFAULT 1,
  title           VARCHAR(255)  NOT NULL,
  description     TEXT          NULL,
  sort_order      INT           NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (competency_id),
  INDEX idx_competency_subject (subject_id),
  CONSTRAINT fk_competency_subject
    FOREIGN KEY (subject_id) REFERENCES Subject(subject_id) ON DELETE CASCADE,
  CONSTRAINT fk_competency_user
    FOREIGN KEY (user_id) REFERENCES User(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE CompetencyPerformanceCriteria (
  criteria_id     BIGINT        NOT NULL AUTO_INCREMENT,
  competency_id   BIGINT        NOT NULL,
  criteria_number VARCHAR(20)   NOT NULL,
  description     TEXT          NOT NULL,
  sort_order      INT           NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (criteria_id),
  INDEX idx_criteria_competency (competency_id),
  CONSTRAINT fk_criteria_competency
    FOREIGN KEY (competency_id) REFERENCES SubjectCompetency(competency_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE SubjectDocumentCategory (
  category_id     BIGINT        NOT NULL AUTO_INCREMENT,
  subject_id      BIGINT        NOT NULL,
  user_id         BIGINT        NOT NULL,
  name            VARCHAR(150)  NOT NULL,
  description     VARCHAR(500)  NULL,
  color           VARCHAR(7)    NOT NULL DEFAULT '#3B82F6',
  sort_order      INT           NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (category_id),
  INDEX idx_doc_category_subject (subject_id),
  CONSTRAINT fk_doc_category_subject
    FOREIGN KEY (subject_id) REFERENCES Subject(subject_id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_category_user
    FOREIGN KEY (user_id) REFERENCES User(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE SubjectDocument (
  document_id     BIGINT        NOT NULL AUTO_INCREMENT,
  category_id     BIGINT        NOT NULL,
  subject_id      BIGINT        NOT NULL,
  user_id         BIGINT        NOT NULL,
  competency_id   BIGINT        NULL,
  file_name       VARCHAR(255)  NOT NULL,
  original_name   VARCHAR(255)  NOT NULL,
  file_path       VARCHAR(500)  NOT NULL,
  file_size       BIGINT        NOT NULL,
  mime_type       VARCHAR(100)  NOT NULL,
  file_extension  VARCHAR(20)   NOT NULL,
  description     VARCHAR(500)  NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_id),
  INDEX idx_subject_doc_category (category_id),
  INDEX idx_subject_doc_subject (subject_id),
  CONSTRAINT fk_subject_doc_category
    FOREIGN KEY (category_id) REFERENCES SubjectDocumentCategory(category_id) ON DELETE CASCADE,
  CONSTRAINT fk_subject_doc_subject
    FOREIGN KEY (subject_id) REFERENCES Subject(subject_id) ON DELETE CASCADE,
  CONSTRAINT fk_subject_doc_user
    FOREIGN KEY (user_id) REFERENCES User(user_id),
  CONSTRAINT fk_subject_doc_competency
    FOREIGN KEY (competency_id) REFERENCES SubjectCompetency(competency_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- New permissions
INSERT INTO Permission (name, description, status) VALUES
  ('MANAGE_CURRICULUM', 'Create/edit/delete competencies, criteria, and document categories', 'ACTIVE'),
  ('UPLOAD_SUBJECT_DOCUMENTS', 'Upload/delete documents in subject material categories', 'ACTIVE');

-- Assign new permissions to SUPER_ADMIN role
INSERT INTO RolePermission (role_id, perm_id)
SELECT r.role_id, p.perm_id
FROM Role r
JOIN Permission p ON p.name IN ('MANAGE_CURRICULUM', 'UPLOAD_SUBJECT_DOCUMENTS')
WHERE r.name = 'SUPER_ADMIN';
