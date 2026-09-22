-- Migration 085: E-Learning — course structure (Phase 1).
--
-- A Course is the student-facing shape of one Scheme of Work (subject × class group ×
-- term, 1:1). Its sections are seeded from the scheme's weekly entries and its items are
-- mostly *references* to content MIS already stores (lesson notes, subject documents),
-- Canvas-style, so nothing is duplicated. See ELEARNING_MODULE_IMPLEMENTATION_PLAN.md §3.
--
-- Membership is derived (student in the class group AND enrolled in the subject for the
-- course's year) — there is deliberately no CourseEnrollment table to keep in sync.

CREATE TABLE IF NOT EXISTS Course (
  course_id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  scheme_id        BIGINT NOT NULL,
  subject_id       BIGINT NOT NULL,
  class_group_id   BIGINT NOT NULL,
  academic_term_id BIGINT NOT NULL,
  owner_user_id    BIGINT NOT NULL,
  title            VARCHAR(255) NOT NULL,
  description      TEXT NULL,
  cover_color      VARCHAR(7) NULL,
  -- Teacher-chosen emoji / icon key for the subject cover (UX plan §6.3). NULL = derive
  -- from the subject's course category.
  icon             VARCHAR(16) NULL,
  status           ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  require_sequential_progress TINYINT NOT NULL DEFAULT 0,
  auto_publish_from_scheme    TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_course_scheme (scheme_id),
  KEY idx_course_subject_class (subject_id, class_group_id),
  KEY idx_course_term (academic_term_id),
  CONSTRAINT fk_course_scheme FOREIGN KEY (scheme_id) REFERENCES SchemeOfWork(scheme_id) ON DELETE CASCADE,
  CONSTRAINT fk_course_subject FOREIGN KEY (subject_id) REFERENCES Subject(subject_id),
  CONSTRAINT fk_course_class_group FOREIGN KEY (class_group_id) REFERENCES ClassGroup(class_group_id),
  CONSTRAINT fk_course_term FOREIGN KEY (academic_term_id) REFERENCES AcademicTerm(academic_term_id),
  CONSTRAINT fk_course_owner FOREIGN KEY (owner_user_id) REFERENCES `User`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CourseSection (
  section_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id        BIGINT NOT NULL,
  -- NULL = a manual section ("Before you start", "Revision") not tied to a scheme week.
  scheme_entry_id  BIGINT NULL,
  competency_id    BIGINT NULL,
  title            VARCHAR(255) NOT NULL,
  summary          TEXT NULL,
  position         INT NOT NULL DEFAULT 0,
  status           ENUM('HIDDEN','SCHEDULED','PUBLISHED') NOT NULL DEFAULT 'HIDDEN',
  unlock_at        DATETIME NULL,
  requirement_type ENUM('ALL','ONE') NOT NULL DEFAULT 'ALL',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_section_entry (scheme_entry_id),
  KEY idx_section_course_pos (course_id, position),
  CONSTRAINT fk_section_course FOREIGN KEY (course_id) REFERENCES Course(course_id) ON DELETE CASCADE,
  CONSTRAINT fk_section_entry FOREIGN KEY (scheme_entry_id) REFERENCES SchemeOfWorkEntry(entry_id) ON DELETE SET NULL,
  CONSTRAINT fk_section_competency FOREIGN KEY (competency_id) REFERENCES SubjectCompetency(competency_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS CourseItem (
  item_id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  section_id       BIGINT NOT NULL,
  item_type        ENUM('HEADER','LESSON_NOTE','SUBJECT_DOCUMENT','PAGE','VIDEO','LINK',
                        'TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','KNOWLEDGE_CHECK','DISCUSSION') NOT NULL,
  -- LessonNote.note_id / SubjectDocument.document_id / Task Mentor id, by item_type.
  ref_id           BIGINT NULL,
  title            VARCHAR(255) NOT NULL,
  description      TEXT NULL,
  -- PAGE: Tiptap doc; VIDEO: {provider,url,duration}; LINK: {url,new_tab};
  -- KNOWLEDGE_CHECK: {questions:[...]}
  content_json     JSON NULL,
  content_html     LONGTEXT NULL,
  external_url     VARCHAR(1000) NULL,
  position         INT NOT NULL DEFAULT 0,
  indent           TINYINT NOT NULL DEFAULT 0,
  is_published     TINYINT NOT NULL DEFAULT 1,
  is_required      TINYINT NOT NULL DEFAULT 1,
  completion_rule  ENUM('NONE','VIEW','MARK_DONE','SUBMIT','MIN_SCORE') NOT NULL DEFAULT 'VIEW',
  min_score_pct    TINYINT NULL,
  estimated_minutes INT NULL,
  due_at           DATETIME NULL,
  created_by       BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_item_section_pos (section_id, position),
  KEY idx_item_ref (item_type, ref_id),
  CONSTRAINT fk_item_section FOREIGN KEY (section_id) REFERENCES CourseSection(section_id) ON DELETE CASCADE,
  CONSTRAINT fk_item_created_by FOREIGN KEY (created_by) REFERENCES `User`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Which performance criteria a non-note item addresses. LESSON_NOTE items inherit
-- LessonNoteCriteria and store nothing here.
CREATE TABLE IF NOT EXISTS CourseItemCriteria (
  item_id     BIGINT NOT NULL,
  criteria_id BIGINT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id, criteria_id),
  KEY idx_cic_criteria (criteria_id),
  CONSTRAINT fk_cic_item FOREIGN KEY (item_id) REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  CONSTRAINT fk_cic_criteria FOREIGN KEY (criteria_id) REFERENCES CompetencyPerformanceCriteria(criteria_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permissions (§3.5). Granted to the default roles below; SUPER_ADMIN has everything.
INSERT INTO Permission (name, description, status)
SELECT 'MANAGE_COURSE_CONTENT', 'Build and publish e-learning courses for subjects the teacher is assigned to', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'MANAGE_COURSE_CONTENT');

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_MY_COURSES', 'Open My Learning: the e-learning courses for subjects the student is enrolled in', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_MY_COURSES');

INSERT INTO Permission (name, description, status)
SELECT 'VIEW_ALL_COURSES', 'Oversight of every e-learning course (scoped for programme leads and class teachers)', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'VIEW_ALL_COURSES');

INSERT INTO Permission (name, description, status)
SELECT 'OVERRIDE_COURSE_PROGRESS', 'Mark a course item complete on behalf of a student', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM Permission WHERE name = 'OVERRIDE_COURSE_PROGRESS');

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name IN ('MANAGE_COURSE_CONTENT', 'OVERRIDE_COURSE_PROGRESS')
WHERE r.name IN ('TEACHER', 'CLASS_TEACHER')
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name = 'VIEW_MY_COURSES'
WHERE r.name = 'STUDENT'
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );

INSERT INTO `RolePermission` (`role_id`, `perm_id`)
SELECT r.role_id, p.perm_id
FROM `Role` r
JOIN `Permission` p ON p.name = 'VIEW_ALL_COURSES'
WHERE r.name IN ('PROGRAM_MANAGER', 'CLASS_TEACHER', 'HEAD_TEACHER')
  AND NOT EXISTS (
    SELECT 1 FROM `RolePermission` rp WHERE rp.role_id = r.role_id AND rp.perm_id = p.perm_id
  );
