# E-Learning Module — Research, Analysis & Implementation Plan

**Date:** 2026-09-21
**Scope:** a student-facing, curriculum-aligned e-learning module inside **Central MIS** (`nga_central_mis`), built on top of the lesson-delivery data the MIS already owns (curriculum → scheme of work → lesson plans → lesson notes → subject materials).
**Companion documents:** [`CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md`](./CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md) (competency ↔ scheme-entry linkage this plan builds on), `backend/migrations/060_lesson_notes.sql` → `082_lesson_note_criteria.sql` (lesson notes, sharing, PDF upload, criteria coverage), [`../PLATFORM_CAPABILITIES.md`](../PLATFORM_CAPABILITIES.md) (where Task Mentor, Tupo and Discipline & Attendance stop and MIS starts).
**Reference platforms analysed:** Canvas LMS (modules/requirements/outcomes), Moodle 4 (course index, activity completion; also what RTB's own `elearning.rtb.gov.rw` runs), Open edX (section/subsection/unit/component), Google Classroom (stream/classwork/topics), plus the xAPI/cmi5 tracking standards.

---

## 0. Executive summary

Central MIS already has ~70 % of the *content* an e-learning platform needs and ~0 % of the *learning environment*:

| Already in MIS | Missing |
|---|---|
| Curriculum: `SubjectCompetency` (Learning Outcome / Element) → `CompetencyPerformanceCriteria`, with indicative content and learning hours | A **course structure** that students navigate (sections → items), ordered and published week-by-week |
| Scheme of Work: per subject × class group × term, weekly `SchemeOfWorkEntry` rows linked to competencies/criteria, with PLANNED/SKIPPED/COMPLETED status | A **student home per subject** ("what should I be learning this week, what have I done, what's next") |
| Lesson plans (`LO_Lesson` family), lesson notes (`LessonNote` — Tiptap JSON, PDF upload, AI generation, versioning, criteria links, share-to-class), subject documents (`SubjectDocument`), timetable (`CalendarSlot`) | **Progress & completion tracking** per student per item, and the **mastery view** per performance criterion that a competency-based (RTB/CBT) school actually reports on |
| Student "My Library" (`SharedLessonNotesPage` — reader with AI tutor, find, reading prefs) | Non-note content types (rich pages, video, links, embedded quizzes), **knowledge checks**, and a bridge to Task Mentor assessments so a completed quiz counts as a completed learning item |
| SSO + integration sync for satellite apps | Teacher **engagement analytics** and admin **cross-subject oversight** of digital delivery |

The recommended shape — derived in §2–§3 — is a **Canvas-style "Course → Section (week) → Item" structure that is auto-seeded from the Scheme of Work and whose items are mostly *references* to content MIS already stores**, with Moodle-style activity completion, Canvas-style outcome mastery keyed on `CompetencyPerformanceCriteria`, and an xAPI-lite `LearningEvent` table so Task Mentor (assessment) and Tupo (discussion) can feed completion back without MIS re-implementing a quiz engine or a chat.

Five phases, ~11–14 engineering weeks total. Phase 1 alone (course structure + student course page, ~3 weeks) already delivers a usable e-learning experience because the content exists today.

---

## 1. Research — how mature platforms structure learning

### 1.1 Structural hierarchies compared

| Platform | Hierarchy | Unit of student navigation | Notes |
|---|---|---|---|
| **Canvas** | Course → Module → ModuleItem (`File`, `Page`, `Discussion`, `Assignment`, `Quiz`, `SubHeader`, `ExternalUrl`, `ExternalTool`) | Module (usually one per week — see the CMU 18-785 screenshot: "Week 1…5", each holding an assignment + a PDF) | Items are **references** to content that lives elsewhere in the course; a module is an ordered playlist with `position`, `indent`, `published`, `unlock_at`, `require_sequential_progress`, `prerequisite_module_ids`, `requirement_type` (`all`/`one`). Per-item `completion_requirement.type` ∈ `must_view`, `must_submit`, `must_contribute`, `min_score`, `min_percentage`, `must_mark_done`. Student-side module `state` ∈ `locked`/`unlocked`/`started`/`completed`. |
| **Moodle 4** | Course → Section (topic or week) → Activity/Resource | Section + a persistent left "course index" drawer with grey/green completion dots | Completion is per activity: automatic (view / grade ≥ threshold / posts) or manual "mark as done". Course formats: *Topics*, *Weekly*, *Single activity*. RTB's national e-learning platform is Moodle. |
| **Open edX** | Course → Section (chapter) → Subsection (sequential) → Unit (vertical) → Component (XBlock) | Unit, viewed inside a horizontal sequence | One extra level of nesting; components are mixed text/video/problem within one page. Overkill for a school; the "unit = one lesson page mixing text+video+check" idea is worth keeping. |
| **Google Classroom** | Class → Classwork (Topics) + Stream | Assignment/material cards grouped by topic | Extremely light: no completion tracking beyond assignment submission, no outcomes. Wins on teacher speed, loses on structure — MIS teachers already do more structured planning than this. |

**Takeaways adopted:**
1. Two levels (Section → Item) are enough; items reference existing content rather than duplicating it (Canvas). The week is the natural section because the Scheme of Work is already weekly.
2. Completion is a small enum on the item, evaluated per student (Canvas + Moodle) — not a bespoke workflow per content type.
3. A persistent course index with completion dots is the single most-cited usability win of Moodle 4; adopt it for the student page.
4. "Locked until prerequisite done" and "sequential progress" are optional per section; default **off** for a school where the teacher paces the class in person.

### 1.2 Competency / outcomes tracking

Canvas *Outcomes* + *Learning Mastery Gradebook*: every assignment/quiz/rubric is *aligned* to outcomes; mastery is computed per outcome per student and displayed across the class. This is the exact model MIS needs, but MIS's outcome primitive is finer than Canvas's: the **performance criterion** (`1.1 HTML elements are properly used…`). MIS already links criteria to taught weeks (`SchemeEntryCriteria`) and to notes (`LessonNoteCriteria`) — see the Curriculum tab screenshot ("Taught in 5 scheme entries this year"). What is missing is the *student* leg: which criteria has *this student* covered / demonstrated.

### 1.3 Tracking standards (SCORM / xAPI / cmi5)

- SCORM: packaging + completion for content hosted in the LMS itself; browser-only; legacy.
- xAPI: `actor – verb – object (– result – context)` statements to a Learning Record Store; tracks learning anywhere (mobile, other apps).
- cmi5: xAPI + packaging/launch rules; IEEE standardisation in progress.

**Decision:** do **not** implement SCORM/cmi5 packaging (MIS authors its own content; nobody is importing SCORM packages). **Do** adopt the xAPI *shape* for the internal event log (`LearningEvent`: actor, verb, object, result, context) because it is exactly what's needed for Task Mentor and Tupo to report "student X *completed* quiz Y with 82 %" back to MIS, and it keeps the door open for a real LRS export later.

### 1.4 Context constraints (Rwanda, TVET, low bandwidth)

- RTB's CBT curriculum format (Module → Learning Unit/Element → Learning Outcome → Performance Criteria → Indicative Content, with learning hours) is already the MIS curriculum model. The e-learning module must speak that vocabulary, not "Chapters"/"Lessons".
- Connectivity: design text-first, PDF/notes cached, video optional and size-capped, no feature that requires being online *during* class. Offline reading of published notes via PWA caching is a Phase 5 item, not a Phase 1 blocker.

---

## 2. Analysis — what MIS has today and where it falls short

### 2.1 Existing data model (relevant slice of `backend/src/db/schema.ts`)

```
Subject ──< SubjectCompetency ──< CompetencyPerformanceCriteria
   │                                        │
   │  (subject × class_group × term)        │ SchemeEntryCriteria / LessonNoteCriteria
   ├──< SchemeOfWork ──< SchemeOfWorkEntry ─┤   (many-to-many)
   │                       │  (week; PLANNED/SKIPPED/COMPLETED)
   │                       ├──< LO_Lesson (structured lesson plan, teacher-only)
   │                       └──< LessonNote (Tiptap JSON / PDF; DRAFT/PUBLISHED; LessonNoteShare → students)
   ├──< SubjectDocument (files in categories, optional competency_id)
   ├──< StudentSubjectEnrollment (student × subject × year)
   ├──< TeacherSubjectAssignment (teacher × subject × class_group × year)
   └──< CalendarSlot (timetable; links subject + class_group + teacher)
```

### 2.2 Gap analysis

| # | Capability | Status today | Gap |
|---|---|---|---|
| 1 | Course container per subject/class/term | Implicit — `SchemeOfWork` has exactly these keys | No student-facing object; no publish state; no settings (sequential, unlock) |
| 2 | Weekly sections | `SchemeOfWorkEntry` (week_number, dates, topic, status) | Not navigable by students; no ordering of *content* within a week |
| 3 | Content items | `LessonNote` (shared individually), `SubjectDocument` (teacher-side Materials tab only — students can't see them), `LO_Lesson` (teacher-only) | No unified "item" concept; no rich page, video, link, embedded quiz types; documents are not exposed to students at all |
| 4 | Student discovery | `SharedLessonNotesPage` — flat list grouped by subject, sorted by recency (screenshot: "4 notes · 3 subjects · 105 min") | No week/topic context, no "continue", no relation to the timetable or to what the teacher taught this week |
| 5 | Progress / completion | none (reader has per-viewer prefs only) | No `viewed`/`done` per item; teacher cannot see who read what |
| 6 | Mastery per criterion | Teacher-side coverage only (criteria → scheme entries / notes) | No per-student mastery; no class heat-map |
| 7 | Assessment | Task Mentor (quizzes, assignments, proctoring) with its own `course_id`; no MIS `subject_id` on `Quiz`/`Assignment` (only `SubjectAssessmentMapping` for report cards) | No way to place a Task Mentor quiz inside a MIS week, nor to get its completion back |
| 8 | Discussion | Tupo chat/feed | No per-lesson thread; acceptable to link out, not to rebuild |
| 9 | AI tutor | `askAboutSharedNote` — scoped to one note | Should be scoped to the course/week (all published items) |
| 10 | Notifications | `Notification` (in-app), `CalendarNotification` (LESSON_STARTING) | No "new content published in Week 4", "3 items overdue" |
| 11 | Analytics / admin oversight | Scheme-of-work dashboards (`AllTeachersSOW_*`) | Nothing about digital delivery or student engagement |
| 12 | Permissions | `MANAGE_LESSON_NOTES`, `VIEW_SHARED_LESSON_NOTES`, `MANAGE_CURRICULUM`, `UPLOAD_SUBJECT_DOCUMENTS` | Need course-builder / learner / oversight permissions |

### 2.3 Key architectural decisions

| Decision | Choice | Why |
|---|---|---|
| Where does the module live? | **Central MIS**, not Task Mentor | Content, curriculum, scheme, roster and timetable are all MIS-native; Task Mentor would have to mirror all of it. Task Mentor keeps assessment. |
| Course identity | `Course` = one `SchemeOfWork` (subject × class group × term), 1:1, `scheme_id` unique FK | Reuses the exact scope teachers already plan in; one course per term keeps sections ≈ scheme weeks. A subject's year-long view is just its three term courses. |
| Membership | **Derived**, no `CourseEnrollment` table | Student is in a course iff `StudentClassGroup(active, year)` for the course's class group **and** `StudentSubjectEnrollment(active, year)` for its subject. Same resolution `LessonNoteShare.filter_type='class_group'` already uses. Avoids a third roster to keep in sync. |
| Sections | `CourseSection`, auto-seeded 1:1 from `SchemeOfWorkEntry`, with optional manual sections (e.g. "Before you start", "Revision") | Week is the unit teachers, calendars and PDFs already use. SKIPPED entries become hidden sections. |
| Items | `CourseItem` polymorphic by `item_type` + `ref_id` for existing content; own `content_json` only for `PAGE` | Canvas model; no duplication of note/document bytes; one progress row shape for everything. |
| Completion | Per-item `completion_rule` enum (`NONE`, `VIEW`, `MARK_DONE`, `SUBMIT`, `MIN_SCORE`) + `CourseItemProgress` per student | Canvas/Moodle proven; `SUBMIT`/`MIN_SCORE` are satisfied only by inbound `LearningEvent`s from Task Mentor. |
| Mastery | Computed, not stored: item → criteria (via `LessonNoteCriteria` for notes, `CourseItemCriteria` for other items) × student progress/scores | Keeps the criterion as the single outcome primitive; a materialised summary table is a Phase 4 optimisation only if queries prove slow. |
| Assessment engine | **Task Mentor stays the engine**; MIS embeds via deep link + receives results via `LearningEvent` | No second quiz engine. A tiny native `KNOWLEDGE_CHECK` (≤ 5 MCQ, ungraded, self-check) is added in Phase 3 because a formative check inside a note is a different product from a proctored exam. |
| Tracking events | `LearningEvent` (xAPI-shaped) as an append-only log | One ingestion path for MIS UI, Task Mentor and Tupo; source for analytics; exportable to a real LRS later. |
| Rich content editor | Reuse `LessonNoteRichEditor` (Tiptap) for `PAGE` items | Already supports images, tables, math (KaTeX), task lists. |
| Video | Phase 3: YouTube/Vimeo embed **or** upload to the MIS file-server with a hard size cap (default 150 MB) and no transcoding; HLS/adaptive is out of scope | Bandwidth reality; most teacher video is already on YouTube. |

---

## 3. Target design

### 3.1 Domain model (new tables)

```sql
-- 085_elearning_courses.sql
CREATE TABLE Course (
  course_id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  scheme_id        BIGINT NOT NULL UNIQUE REFERENCES SchemeOfWork(scheme_id) ON DELETE CASCADE,
  -- denormalised from the scheme for cheap student-side listing (kept in sync by the scheme controller)
  subject_id       BIGINT NOT NULL REFERENCES Subject(subject_id),
  class_group_id   BIGINT NOT NULL REFERENCES ClassGroup(class_group_id),
  academic_term_id BIGINT NOT NULL REFERENCES AcademicTerm(academic_term_id),
  owner_user_id    BIGINT NOT NULL REFERENCES User(user_id),
  title            VARCHAR(255) NOT NULL,           -- default "<Subject name> — <Class group> — <Term>"
  description      TEXT NULL,
  cover_color      VARCHAR(7) NULL,                 -- default Subject.color
  status           ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  require_sequential_progress TINYINT NOT NULL DEFAULT 0,
  auto_publish_from_scheme    TINYINT NOT NULL DEFAULT 1, -- section auto-publishes when its week starts / entry is COMPLETED
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE CourseSection (
  section_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id        BIGINT NOT NULL REFERENCES Course(course_id) ON DELETE CASCADE,
  scheme_entry_id  BIGINT NULL REFERENCES SchemeOfWorkEntry(entry_id) ON DELETE SET NULL, -- NULL = manual section
  competency_id    BIGINT NULL REFERENCES SubjectCompetency(competency_id) ON DELETE SET NULL,
  title            VARCHAR(255) NOT NULL,           -- "Week 3 — CSS selectors"
  summary          TEXT NULL,                       -- defaults to entry.topic / objective
  position         INT NOT NULL DEFAULT 0,
  status           ENUM('HIDDEN','SCHEDULED','PUBLISHED') NOT NULL DEFAULT 'HIDDEN',
  unlock_at        DATETIME NULL,                   -- defaults to entry.start_date when SCHEDULED
  requirement_type ENUM('ALL','ONE') NOT NULL DEFAULT 'ALL',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_section_entry (scheme_entry_id)
);
CREATE INDEX idx_section_course_pos ON CourseSection(course_id, position);

CREATE TABLE CourseSectionPrerequisite (           -- Phase 2; Canvas prerequisite_module_ids
  section_id       BIGINT NOT NULL REFERENCES CourseSection(section_id) ON DELETE CASCADE,
  requires_section_id BIGINT NOT NULL REFERENCES CourseSection(section_id) ON DELETE CASCADE,
  PRIMARY KEY (section_id, requires_section_id)
);

CREATE TABLE CourseItem (
  item_id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  section_id       BIGINT NOT NULL REFERENCES CourseSection(section_id) ON DELETE CASCADE,
  item_type        ENUM('HEADER','LESSON_NOTE','SUBJECT_DOCUMENT','PAGE','VIDEO','LINK',
                        'TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','KNOWLEDGE_CHECK','DISCUSSION') NOT NULL,
  ref_id           BIGINT NULL,                     -- LessonNote.note_id / SubjectDocument.document_id / Task Mentor quiz id / …
  title            VARCHAR(255) NOT NULL,           -- defaults from the referenced object
  description      TEXT NULL,
  content_json     JSON NULL,                       -- PAGE: Tiptap doc; VIDEO: {provider,url|file_path,duration}; LINK: {url,new_tab}; KNOWLEDGE_CHECK: questions
  external_url     VARCHAR(1000) NULL,              -- resolved deep link for TASKMENTOR_* / DISCUSSION / LINK
  position         INT NOT NULL DEFAULT 0,
  indent           TINYINT NOT NULL DEFAULT 0,
  is_published     TINYINT NOT NULL DEFAULT 1,
  is_required      TINYINT NOT NULL DEFAULT 1,      -- counts toward section completion
  completion_rule  ENUM('NONE','VIEW','MARK_DONE','SUBMIT','MIN_SCORE') NOT NULL DEFAULT 'VIEW',
  min_score_pct    TINYINT NULL,                    -- MIN_SCORE only
  estimated_minutes INT NULL,
  due_at           DATETIME NULL,
  created_by       BIGINT NOT NULL REFERENCES User(user_id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_item_section_pos ON CourseItem(section_id, position);
CREATE INDEX idx_item_ref ON CourseItem(item_type, ref_id);

-- Which performance criteria an item addresses. LESSON_NOTE items inherit LessonNoteCriteria and
-- store nothing here; every other type uses this table. Mirrors SchemeEntryCriteria.
CREATE TABLE CourseItemCriteria (
  item_id     BIGINT NOT NULL REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  criteria_id BIGINT NOT NULL REFERENCES CompetencyPerformanceCriteria(criteria_id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, criteria_id)
);

-- 086_elearning_progress.sql
CREATE TABLE CourseItemProgress (
  item_id          BIGINT NOT NULL REFERENCES CourseItem(item_id) ON DELETE CASCADE,
  user_id          BIGINT NOT NULL REFERENCES User(user_id),
  state            ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
  first_viewed_at  DATETIME NULL,
  last_viewed_at   DATETIME NULL,
  completed_at     DATETIME NULL,
  completed_via    ENUM('VIEW','MARK_DONE','EVENT','TEACHER') NULL,
  view_count       INT NOT NULL DEFAULT 0,
  seconds_spent    INT NOT NULL DEFAULT 0,          -- heartbeat-accumulated, capped per session
  best_score_pct   DECIMAL(5,2) NULL,               -- from LearningEvent result for SUBMIT/MIN_SCORE items
  last_position    JSON NULL,                       -- reader page / video second — "continue where you left off"
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX idx_progress_user ON CourseItemProgress(user_id, state);

-- xAPI-shaped append-only log. MIS UI writes VIEWED/COMPLETED/MARKED_DONE; Task Mentor and
-- Tupo write via /integrations. Source of truth for analytics; progress rows are the projection.
CREATE TABLE LearningEvent (
  event_id    BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT NOT NULL REFERENCES User(user_id),
  verb        ENUM('VIEWED','PROGRESSED','COMPLETED','MARKED_DONE','ATTEMPTED','SCORED','PASSED','FAILED','SUBMITTED','COMMENTED','ASKED_AI') NOT NULL,
  object_type ENUM('COURSE_ITEM','COURSE_SECTION','COURSE','LESSON_NOTE','TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','TUPO_THREAD') NOT NULL,
  object_id   BIGINT NOT NULL,
  course_item_id BIGINT NULL REFERENCES CourseItem(item_id) ON DELETE SET NULL, -- resolved at ingest when object maps to an item
  result_json JSON NULL,                            -- {score_pct, success, duration_s, response}
  context_json JSON NULL,                           -- {course_id, section_id, source:'MIS'|'TASKMENTOR'|'TUPO', session_id}
  source_system VARCHAR(30) NOT NULL DEFAULT 'MIS',
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key VARCHAR(120) NULL,
  UNIQUE KEY uq_event_idem (source_system, idempotency_key)
);
CREATE INDEX idx_event_actor_time ON LearningEvent(actor_user_id, occurred_at);
CREATE INDEX idx_event_item ON LearningEvent(course_item_id, verb);
```

Phase 3/5 additions (separate migrations): `KnowledgeCheckAttempt` (item_id, user_id, answers_json, score_pct, attempted_at) and `CourseAnnouncement` (course_id, author, body, pinned, published_at) — the latter only if Tupo Feed pages can't be scoped per class-subject; decide in Phase 5.

### 3.2 Lifecycle rules

- **Course creation** — created lazily the first time a teacher opens the "Course" tab of a scheme, or explicitly ("Set up e-learning for this scheme"). Sections are seeded from every `SchemeOfWorkEntry` (`position` = entry order; `status='HIDDEN'` for `SKIPPED`, `'SCHEDULED'` with `unlock_at = start_date` otherwise). Each seeded section gets pre-filled items: any `LessonNote` whose `scheme_entry_id` matches or whose criteria intersect the entry's `SchemeEntryCriteria` (`LESSON_NOTE`, `completion_rule='VIEW'`), and any `SubjectDocument` whose `competency_id` equals the entry's competency (`SUBJECT_DOCUMENT`). Teacher reviews and publishes.
- **Scheme ↔ course sync** — inserting/deleting/re-ordering scheme entries (`schemeOfWorkController.insertSchemeEntry` / `deleteSchemeEntry` / `updateSchemeEntry`) creates/soft-hides/re-positions the matching section. Deleting a scheme cascades to its course (already `ON DELETE CASCADE`); the existing "Delete Scheme" confirmation must say so.
- **Auto-publish** — a nightly job (same pattern as the calendar notification sweep) flips `SCHEDULED → PUBLISHED` when `unlock_at ≤ now` **and** the course is `PUBLISHED`. Marking an entry `COMPLETED` publishes its section immediately when `auto_publish_from_scheme=1`.
- **Visibility to a student** — course `PUBLISHED` ∧ section `PUBLISHED` ∧ item `is_published` ∧ student is a derived member ∧ (no unmet prerequisite ∧ not blocked by sequential progress). `LESSON_NOTE` items additionally require the note to be `PUBLISHED`; placing a note in a course **implicitly shares it** with the course's class group (create a `LessonNoteShare(filter_type='class_group')` row on publish so the existing shared-note reader and AI ask keep working unchanged).
- **Completion evaluation** (`services/courseProgress.ts`, pure function + persistence):
  - `VIEW`: first `GET /items/:id` by a member completes it.
  - `MARK_DONE`: `POST /items/:id/done`.
  - `SUBMIT` / `MIN_SCORE`: only an inbound `LearningEvent` (`SUBMITTED`, or `SCORED` with `score_pct ≥ min_score_pct`) completes it.
  - Section complete ⇔ (`ALL`: every required published item complete) / (`ONE`: any). Course % = completed required items ÷ required published items.
  - Teacher override: `POST /items/:id/progress/:userId/complete` (`completed_via='TEACHER'`), audit-logged via `ActivityLog`.

### 3.3 API surface (`/elearning`, mounted in `app.ts` next to `/lesson-notes`)

**Teacher / course builder** — gate `MANAGE_COURSE_CONTENT`, scoped by `TeacherSubjectAssignment` for the course's subject+class group+year (reuse the check in `lessonNoteController`'s subject scoping):

| Method & path | Purpose |
|---|---|
| `POST /courses/from-scheme/:schemeId` | create + seed (idempotent — returns existing) |
| `GET /courses/:id` | full builder tree (sections → items, with per-item publish/completion settings and criteria) |
| `PATCH /courses/:id` | title, description, status, sequential, auto-publish |
| `POST /courses/:id/sections`, `PATCH /sections/:id`, `DELETE /sections/:id`, `PUT /courses/:id/sections/order` | manual sections & ordering |
| `POST /sections/:id/items`, `PATCH /items/:id`, `DELETE /items/:id`, `PUT /sections/:id/items/order` | items; body validated per `item_type` |
| `PUT /items/:id/criteria` | criteria alignment (non-note items) |
| `POST /items/:id/suggest-criteria` | AI suggestion, same provider fallback as `suggestEntryCriteria` |
| `GET /courses/:id/pickers/lesson-notes`, `…/subject-documents`, `…/taskmentor` | content pickers (the Task Mentor picker calls TM's API with the teacher's SSO token; TM must expose `GET /api/quizzes?subject_ref=…`) |
| `GET /courses/:id/analytics` | per-section/item view & completion counts, per-student table, stuck-students list |
| `GET /courses/:id/mastery` | class × criteria matrix (Phase 4) |
| `POST /items/:id/progress/:userId/complete` | teacher override |

**Student / learner** — gate `VIEW_MY_COURSES` (granted to the Student role alongside `VIEW_SHARED_LESSON_NOTES`):

| Method & path | Purpose |
|---|---|
| `GET /my/courses` | cards: subject, teacher, term, % complete, "this week" section, next item, overdue count |
| `GET /my/courses/:id` | course index (sections with lock/state, items with state) — the Moodle drawer payload |
| `GET /my/items/:id` | resolved item (note → existing shared-note payload; document → stream URL; page → JSON; TM → launch URL); records `VIEWED` |
| `POST /my/items/:id/heartbeat` | `{seconds, position}` every 30 s while open; capped at 2× `estimated_minutes` |
| `POST /my/items/:id/done` | `MARK_DONE` |
| `POST /my/items/:id/knowledge-check` | Phase 3 attempt |
| `POST /my/courses/:id/ask` | AI tutor across the course's published content (extends `askAboutSharedNote`) |
| `GET /my/mastery` | student's own criteria coverage per subject (Phase 4) |

**Admin / oversight** — gate `VIEW_ALL_COURSES` (super admin; programme leads scoped via `UserProgramLead`, class teachers via `UserGrade`, using `services/userScope.ts`):

| Method & path | Purpose |
|---|---|
| `GET /admin/courses?year&term&program&grade&subject&teacher` | digital-delivery register: which schemes have a course, published %, items count, last update, class engagement % |
| `GET /admin/courses/:id/analytics`, `GET /admin/mastery?…` | same payloads as teacher, wider scope |
| `GET /admin/export/…` | PDF/Excel via existing `pdfExport.ts` / report patterns |

**Integrations** — under the existing `/integrations` router (`IntegrationToken` auth):

| Method & path | Purpose |
|---|---|
| `POST /integrations/learning-events` | batch of xAPI-lite statements; idempotent on `(source_system, idempotency_key)`; resolves `course_item_id` by `(object_type, object_id)`; updates `CourseItemProgress` |
| `GET /integrations/sync/courses` | published courses + items that reference TM objects, so TM can show "used in MIS Week 4" and TM's SSO deep link can return the student to the right item |

### 3.4 Frontend

**Teacher — course builder** (`frontend/src/components/elearning/builder/`)
- Entry point: new **"Course"** tab on `SchemeDetails`/`SchemeOfWorkCalendar` toolbar (next to Timeline/Calendar toggle in the screenshot) and on `SubjectDetailPage` (`curriculum/`), plus `/elearning/courses/:id/build` route.
- Left: section list (drag to reorder, publish toggles, week dates, status pill mirroring `entry_status`). Main: items list per section with drag/indent, "+ Add" menu → Lesson note / Material / Page / Video / Link / Task Mentor quiz / assignment / Header (Phase 1 ships the first three + Header). Item drawer: title, completion rule, required, due date, criteria picker (reuse `lessonNotes/CurriculumPicker.tsx`).
- "Preview as student" switch reuses the learner components.
- Analytics tab (Phase 2): funnel per section, per-student table with filters (not started / behind / done), export.

**Student — My Learning** (`frontend/src/components/elearning/learner/`)
- `/my-learning` replaces the nav entry for `/shared-lesson-notes` (the library stays reachable as a "All notes" view inside it): subject cards with progress ring, "This week: Week 4 — CSS Grid", "Continue: …", overdue badge.
- `/my-learning/courses/:id`: two-pane — left **course index** (sections, completion dots, lock icons), right **item view**. Item view dispatches on type: `LESSON_NOTE` → embed the existing reader (`SharedLessonNoteViewPage` internals: find bar, reader prefs, `NoteAIPanel`); `SUBJECT_DOCUMENT` → PDF/office viewer with download; `PAGE` → Tiptap read-only render; `VIDEO` → player; `LINK`/`TASKMENTOR_*` → launch card (opens TM via SSO in new tab, item shows "Awaiting result" until an event arrives). Bottom bar: "Mark as done" (rule `MARK_DONE`), ← Prev / Next →.
- Week alignment: the course index highlights the section whose dates contain today; the existing student calendar (`VIEW_STUDENT_CALENDAR`) gets a "Open lesson content" link from a `CalendarSlot` to the section matching its subject/class group/date.
- Mobile: index collapses into a drawer; item view is single-column (many students will be on phones).

**Admin** (`frontend/src/components/elearning/admin/`)
- `/admin/elearning`: register table (filters mirror `AllTeachersSOW_List`), course drill-down reusing the teacher analytics component, mastery heat-map (Phase 4).

### 3.5 Permissions (seeded in the Phase 1 migration, following `060_lesson_notes.sql`'s `INSERT … WHERE NOT EXISTS` pattern; constants added to `backend/src/utils/permissions.ts`)

| Permission | Granted to (by default) | Guards |
|---|---|---|
| `MANAGE_COURSE_CONTENT` | Teacher, Class Teacher (copied like migration 067) | builder endpoints, scoped to own assignments |
| `VIEW_MY_COURSES` | Student | learner endpoints |
| `VIEW_ALL_COURSES` | Super Admin, Programme Lead (scoped), Class Teacher (scoped) | admin endpoints |
| `OVERRIDE_COURSE_PROGRESS` | Teacher | teacher completion override |

### 3.6 Notifications

Reuse `Notification` with new `notification_type` values: `COURSE_SECTION_PUBLISHED` (to members when a section publishes — batched, one per section), `COURSE_ITEM_DUE_SOON` (24 h before `due_at`, nightly sweep), `COURSE_ITEM_OVERDUE` (weekly digest, not per item), `COURSE_RESULT_RECEIVED` (TM event closed a `SUBMIT`/`MIN_SCORE` item). Teachers get `COURSE_SECTION_EMPTY` from the same sweep that already flags missing lesson plans (screenshot banner "2 teaching days missing a lesson plan") — "Week 4 is published with no content".

### 3.7 Learning environment principles (from §1)

1. **One click from "today" to content** — timetable slot → section; dashboard card → next item.
2. **Everything is aligned** — every item shows its criteria chips; the student sees "you have covered 7/10 criteria of Element 1".
3. **Teacher pacing by default** — sequential/prerequisites are opt-in; the week publishes when the teacher teaches it.
4. **Text first, media capped** — notes and PDFs are the core; video ≤ 150 MB or embedded; estimated minutes shown so students on data budgets can plan.
5. **Nothing duplicated** — a note is edited in one place and appears in the course; Task Mentor stays the gradebook.

---

## 4. Implementation phases

### Phase 0 — Decisions & spikes (2–3 days)
- Confirm the 1:1 `Course ↔ SchemeOfWork` decision with academic leads (alternative: one course per subject per *year* with term sub-groups — rejected here because schemes, validation and PDFs are per term).
- Spike: Task Mentor endpoint to list quizzes/assignments by MIS subject + class group (TM currently has only `course_id`; it needs `mis_subject_id`/`mis_class_group_id` columns or a mapping — TM-side change, ~1 day) and TM emitting `learning-events` on submission/grade (~1 day).
- Spike: render a `LessonNote` reader inside a two-pane layout without regressing `useReaderPrefs`/`useNoteFind`.
- Decide video policy (embed-only vs upload cap) and PWA offline scope (Phase 5 or never).

### Phase 1 — Course structure + student course page (MVP, ~3 weeks)
**Backend**
- Migration `085_elearning_courses.sql` (tables in §3.1 except progress/events; permissions in §3.5). Add tables to `schema.ts`.
- `controllers/courseController.ts` (builder), `controllers/learnerCourseController.ts`, `services/courseSeeding.ts` (seed from scheme), `services/courseMembership.ts` (derived membership — reuse the resolver behind `listSharedWithMe`), `services/courseVisibility.ts`.
- Hook scheme controller mutations to keep sections in sync; extend the delete-scheme path.
- Item types shipped: `HEADER`, `LESSON_NOTE`, `SUBJECT_DOCUMENT`, `LINK`. Placing a note auto-creates the class-group `LessonNoteShare`. Add a student-readable document stream endpoint (`GET /elearning/my/items/:id/file`) that re-checks membership — `SubjectDocument` download is teacher-only today.
- Nightly `SCHEDULED → PUBLISHED` sweep.

**Frontend**
- Builder page (sections, items, publish, reorder, pickers for notes/materials, link form). Course tab on scheme + subject pages.
- My Learning hub + course page with index and item views for the four types; embed the note reader.
- Nav: add "My Learning" for students; keep "My Library".

**Tests** (`backend/src/__tests__/`, follow `lessonNoteSharedWithMe.test.ts` fixtures)
- Seeding: a scheme with 12 entries (2 SKIPPED) → 12 sections, 2 HIDDEN, positions match; re-run is idempotent.
- Membership: student in class group but not enrolled in subject → 404 on course; enrolled + in group → 200; teacher of another class → 403 on builder.
- Visibility: DRAFT course invisible; SCHEDULED section with `unlock_at` tomorrow invisible; sweep publishes it.
- Note placement creates the share row; removing the item does **not** revoke a share that existed before.

**Definition of done:** a teacher opens an existing scheme, clicks "Set up course", sees weeks pre-filled with their notes/materials, publishes; a student sees the course under My Learning, navigates weeks, reads notes and downloads materials, and the current week is highlighted. **Effort: 12–15 days.**

### Phase 2 — Progress, completion, notifications, teacher analytics (~2 weeks)
- Migration `086_elearning_progress.sql` (`CourseItemProgress`, `LearningEvent`, `CourseSectionPrerequisite`).
- `services/courseProgress.ts` (rules in §3.2), heartbeat endpoint, mark-done, teacher override, sequential/prerequisite locking (default off).
- `POST /integrations/learning-events` + idempotency; TM emits `SUBMITTED`/`SCORED` (TM-side change from Phase 0 spike).
- Notifications (§3.6) incl. the "published but empty" teacher nudge.
- Learner UI: completion dots, progress rings, "Continue", overdue list, locked states. Builder UI: completion rule/required/due-date fields; Analytics tab (section funnel, per-student table, CSV export via existing report utilities).
- Tests: rule evaluation table-driven (each `completion_rule` × action → state); `ONE` vs `ALL`; sequential lock; idempotent event replay; heartbeat cap; override audit row.
**Effort: 8–10 days.**

### Phase 3 — Rich content: pages, video, Task Mentor items, knowledge checks (~2 weeks)
- `PAGE` items using `LessonNoteRichEditor` (images via a `CourseItemImage` flow copied from `LessonNoteImage`, or store page images under the note-image endpoint with a nullable `note_id` — pick the former for clean ownership).
- `VIDEO` (embed provider whitelist: YouTube, Vimeo; optional upload to file-server with cap and MIME sniff like `lessonNotePdf.ts`), `TASKMENTOR_QUIZ`/`TASKMENTOR_ASSIGNMENT` picker + launch, `KNOWLEDGE_CHECK` (MCQ/true-false, ≤ 10 questions, instant feedback, unlimited attempts, `KnowledgeCheckAttempt`, AI "generate 5 questions from this note" using the lesson-note AI provider chain).
- Learner item views for each; teacher analytics adds average knowledge-check score and most-missed question.
- Tests: page save/version round-trip; video URL validation; knowledge-check scoring; TM launch URL carries item id for return.
**Effort: 8–10 days.**

### Phase 4 — Competency mastery & admin oversight (~2 weeks)
- `CourseItemCriteria` UI + AI suggest for non-note items; mastery computation service: per student × criterion → `NOT_COVERED` (no published item aligned), `COVERED` (aligned item completed), `DEMONSTRATED` (aligned `MIN_SCORE`/`SUBMIT` item passed or knowledge check ≥ 80 %). Class matrix and per-student view; teacher and admin heat-maps; student "My mastery" page.
- Admin register `/admin/elearning` with `userScope.ts` scoping; PDF/Excel exports; digital-delivery KPIs added to the existing super-admin/programme-lead dashboards ("% of validated schemes with a published course", "median student completion").
- Materialise `StudentCriteriaMastery` only if the live query exceeds ~300 ms on a class of 60 × 40 criteria (measure first).
- Tests: mastery state derivation; scoping (programme lead sees only own programmes); export shape.
**Effort: 8–10 days.**

### Phase 5 — AI tutor, discussion, offline (~1.5 weeks, can be split)
- Course-wide AI tutor (`POST /my/courses/:id/ask`): retrieve top-k chunks across the course's published notes/pages (start with in-DB full-text over `content_html`; vector index only if quality demands), cite the item, log `ASKED_AI`. Teacher sees anonymised "most asked questions" per section — direct input for the next lesson.
- `DISCUSSION` items: link to a Tupo channel/thread created via Tupo's API for the class-subject; Tupo posts `COMMENTED` events back. Course announcements go to the Tupo Feed page for the class group; MIS only stores the link. Fallback `CourseAnnouncement` table if Tupo scoping isn't ready.
- Offline: service worker caching for the learner shell + last-opened items' note HTML/PDF (`stale-while-revalidate`), queued `heartbeat`/`done` events replayed on reconnect. Explicitly *not* full offline authoring.
**Effort: 6–8 days.**

---

## 5. Cross-cutting concerns

- **Security** — every learner endpoint re-derives membership; never trust `course_id` from the client without the join. Document streaming re-checks membership (same lesson as `streamLessonNotePdf`). Integration events are accepted only for `(actor, object)` pairs the source system is authorised for (`IntegrationToken` scope `learning-events:write`), and `actor_user_id` must be an MIS user id, not an email.
- **Performance** — course index is one query per section list + one aggregated progress query (`GROUP BY section_id`); cache `GET /my/courses` per user for 60 s. Heartbeats are fire-and-forget, batched on the client (one call per 30 s, not per scroll).
- **Data migration** — none destructive. Existing `LessonNoteShare` rows keep working; the seeding step only *adds* course items. A one-off script (`backend/scripts/seedCoursesFromSchemes.ts`) can create DRAFT courses for every APPROVED scheme of the current term so teachers start from a filled builder.
- **Backwards compatibility** — `/lesson-notes/shared-with-me*` stays; My Library remains as a view. No Task Mentor behaviour changes until TM adopts the event emitter; until then `SUBMIT`/`MIN_SCORE` items simply never auto-complete (teacher override still works) — the builder warns about this when TM integration is disabled.
- **AI** — reuse `services/aiProviders` fallback chain; every AI-generated criteria suggestion / knowledge check is a *proposal* the teacher confirms, consistent with the lesson-note versioning philosophy.
- **Accessibility & i18n** — reader already has font/contrast prefs; keep keyboard navigation for Prev/Next; strings via the existing pattern (English only today; note that Kinyarwanda UI is a separate initiative).
- **Deployment** — two migrations per phase at most, applied through `.github/workflows/migrate.yml`; the nightly sweep runs under PM2 like the calendar notification job; file-server storage growth from video uploads must be budgeted (S3-style offload is out of scope).

---

## 6. Open questions (need an answer before the corresponding phase)

1. Should a course be visible to **parents** (`Parenting` table exists)? Suggested: read-only progress summary in Phase 4, no content access.
2. Do programme leads want to **author** shared course templates (one course copied to all class groups of a grade)? If yes, add `Course.template_of_course_id` and a "Copy to other classes" action in Phase 3.
3. Task Mentor identifiers: will TM add `mis_subject_id`/`mis_class_group_id` to `Quiz`/`Assignment`, or expose a mapping endpoint? (Blocks the TM picker in Phase 3.)
4. Video hosting policy (embed-only vs upload) — cost and bandwidth decision for the school, not engineering.
5. Is Kinyarwanda/French content tagging needed per item (`language` column)? Cheap to add in Phase 1 if yes.

---

## 7. Effort summary

| Phase | Scope | Estimate |
|---|---|---|
| 0 | Decisions, TM/reader spikes | 2–3 days |
| 1 | Course structure, seeding, builder, student course page | 12–15 days |
| 2 | Progress, completion, events, notifications, analytics | 8–10 days |
| 3 | Pages, video, TM items, knowledge checks | 8–10 days |
| 4 | Criteria mastery, admin oversight, exports | 8–10 days |
| 5 | Course AI tutor, Tupo discussion, offline caching | 6–8 days |
| **Total** | | **~44–56 engineering days (≈ 11–14 weeks for one engineer; ≈ 7–8 weeks with backend/frontend in parallel from Phase 1)** |

Phase 1 is independently shippable and is the recommended first release: it turns the existing lesson notes, materials and scheme of work into a navigable, week-aligned learning space for every enrolled student with no new content authoring required from teachers.

---

## Sources

- Canvas Modules API — [developerdocs.instructure.com/services/canvas/resources/modules](https://developerdocs.instructure.com/services/canvas/resources/modules); module requirements/prerequisites — [Ohio University KB](https://help.ohio.edu/TDClient/30/Portal/KB/ArticleDet?ID=972), [MSU Denver CTLD](https://ready.msudenver.edu/canvas-spotlight/prerequisites-requirements-and-locking-in-canvas-modules/), [UW-Green Bay CATL](https://blog.uwgb.edu/catl/canvas-module-requirements/)
- Canvas Outcomes / Learning Mastery Gradebook — [University of Michigan ITS](https://its.umich.edu/academics-research/teaching-learning/teaching-activities/353028), [University of Pittsburgh Teaching Center](https://teaching.pitt.edu/resources/track-student-progress-with-outcomes-and-the-learning-mastery-gradebook/), [Instructure CBE](https://www.instructure.com/solutions/competency-based-education)
- Moodle — [Activity completion (MoodleDocs)](https://docs.moodle.org/502/en/Activity_completion), [Course formats](https://docs.moodle.org/502/en/Course_formats), [Moodle 4 course index & completion](https://moodle.com/news/activity-completion-moodle-4/), [UCL course structure guide](https://ucldata.atlassian.net/wiki/spaces/MoodleResourceCentre/pages/31863827/M01+-+Moodle+course+structure); RTB e-learning (Moodle) — [elearning.rtb.gov.rw](https://www.elearning.rtb.gov.rw/course/index.php?categoryid=718)
- Open edX OLX structure — [Course building blocks](https://docs.openedx.org/en/latest/educators/olx/organizing-course/course-structure-overview.html), [Course content data](https://edx.readthedocs.io/projects/devdata/en/latest/internal_data_formats/course_structure.html)
- LMS comparisons for schools — [Teachfloor: Canvas vs Google Classroom](https://www.teachfloor.com/blog/canvas-vs-google-classroom), [Slate: LMS comparison](https://www.slateup.ai/blogs/lms-comparison-google-classroom-canvas-schoology-blackboard), [IJRISS comparative study](https://rsisinternational.org/journals/ijriss/articles/comparative-study-between-moodle-canvas-and-google-classroom/)
- Tracking standards — [xapi.com: SCORM vs xAPI vs cmi5](https://xapi.com/cmi5/comparison-of-scorm-xapi-and-cmi5/), [Rustici KB](https://support.scorm.com/hc/en-us/sections/201404426-xAPI-cmi5-and-the-Learning-Record-Store-LRS), [Aristek: eLearning standards](https://aristeksystems.com/blog/elearning-standards/)
- Rwanda TVET / RTB competency-based framework — [RTB Trainer Certification Framework](https://www.rtb.gov.rw/index.php?eID=dumpFile&t=f&f=86490&token=2cff81c684d0ee1bc9a8723ab09574e0b1864673), [RTB ICT Strategic Plan](https://www.rtb.gov.rw/index.php?eID=dumpFile&t=f&f=61800&token=9953f4659a67424161174ccbf458ed86ef6df0f5)
- Low-bandwidth / offline design — [ASU Teach Online: low internet access](https://teachonline.asu.edu/2022/04/designing-e-learning-for-students-with-low-internet-access/), [University of Bristol low-bandwidth guide](https://www.bristol.ac.uk/digital-education/guides/low-bandwidth/), [IEEE: offline-enabled web e-learning in Africa](https://ieeexplore.ieee.org/document/8095574/), [MDN PWA best practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices)
