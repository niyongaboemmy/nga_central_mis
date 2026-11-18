# Student Side Projects — Analysis and Implementation Plan

| | |
|---|---|
| **Status** | Implemented 2026-11-18 on `feat/side-projects` (Phases 0–5). Phase 6 extras not built. See §11. |
| **App** | Central MIS (`nga_central_mis`), built on `origin/main` (e33923f6, latest migration 127). |
| **Owner** | Team lead (side-projects programme) |
| **Pages** | Students: `/my-projects` (board). Monitoring: `/projects-monitor` (dashboard, list, board, preview). |
| **New migration** | `128_student_projects.sql` (number free on every remote branch on 2026-11-18; recheck at merge time). |

---

## 1. What we are building

Students at NGA run side projects outside their normal coursework. The team lead needs one place to record and follow them.

**Students** need:
- one page listing all their projects, as a board with three columns: **Idea → In progress → Completed**;
- drag and drop to move a project between columns (plus a keyboard and menu alternative);
- for each project: title, problem statement, description, category and technologies, GitHub link, live/access link, other links;
- three documents: **Concept note (mandatory)**, **SRS (optional)**, **Implementation plan (optional)**;
- a gallery of images and files (screenshots, diagrams, demo videos, slides, zipped source);
- progress tracking: milestones, a progress percentage and short progress updates.

**The team lead and leadership** (super admin first, and anyone given the new role) need:
- a modern dashboard: totals per status, completions over time, projects per class and year, projects nobody has updated, missing documents;
- a filterable list of every student's projects;
- a read-only, school-wide board;
- a preview drawer for one project: documents previewed inline, gallery, links, timeline, feedback;
- feedback and review: comments, "changes requested", and "verified complete";
- export (CSV/XLSX) and registering a project on a student's behalf (to load the existing list).

### 1.1 Information each project carries

| Field | Source | Notes |
|---|---|---|
| Registration number | `UserProfile.registration_number` | **Derived, never retyped.** Snapshotted at creation (see §3.3). |
| Names | `UserProfile.first_name/last_name` | Shown live; snapshot kept for exports of past years. |
| Academic year | `AcademicYear` (current at creation) | Stored as `academic_year_id`. A project can continue into the next year (see §3.3). |
| Class | `StudentClassGroup` → `ClassGroup` → `Grade` → `Program` | Class at creation is stored, and the current class is shown live. |
| Title | student | 3–150 characters, unique per student (case-insensitive). |
| Problem statement | student | Required, 30–3 000 characters. |
| Description / solution summary | student | Optional, rich text (the existing lesson-note sanitiser). |
| Category | lookup | Web app, Mobile app, AI/ML, IoT/Embedded, Robotics/Hardware, Game, Data/Analytics, Cybersecurity, Other. |
| Technologies | free tags | Up to 15 tags, suggested from tags already used. |
| Status | board | `IDEA`, `IN_PROGRESS`, `COMPLETED`. Archiving is a separate flag (§3.2). |
| Progress % | derived or manual | Done milestones ÷ all milestones when any exist; otherwise a manual slider. |
| Start / target / completed dates | student and system | `completed_at` is set by the system. |
| GitHub link | student | Optional. Validated as `https://github.com/<owner>/<repo>`. |
| Access (live) link | student | Optional. `https://` only. |
| Other links | student | Up to 10, each labelled (video, Figma, docs, Play Store, other). |
| Concept note | upload | **Mandatory** (§3.4). |
| SRS, Implementation plan | upload | Optional, versioned. |
| Media and files | upload | Images, video, PDF, slides, zip, and so on. |
| Supervisor | staff picker | Optional. Any active non-student. |
| Team members | other students | Optional co-owners (Phase 5). |

---

## 2. What already exists, and how this feature fits it

The analysis was done on `origin/main`. The local `nga_central_mis` checkout is on the stale `feat/safeguarding` branch, so build from a fresh branch off `origin/main`.

| Concern | Existing building block | How this feature uses it |
|---|---|---|
| Student identity | `UserProfile` (`registration_number`, names, `user_type`), `User.status` | Join and snapshot. Active students only ([active-users rule]). |
| Year and class | `AcademicYear.is_current`, `StudentClassGroup (user, class_group, academic_year, status)`, `ClassGroup → Grade → Program`, `utils/academicYear.getCurrentAcademicYearId()` | Stamp the year and class on create. Filters on the monitor. |
| Permissions | `backend/src/access/manifest.ts` (`MIS_MANIFEST`), `presets.ts`, `v2Only.ts`, `services/access/policy.ts` (`authorizeIn`, `requireCapability`, `req.access.scopeFor`) | New `SIDE_PROJECTS_*` capabilities (§4). |
| Scope filtering | The `services/earlyWarning.ts` `studentsIn(scope)` pattern (`all / class_groups / grades / programs / students`) | The same shape for the monitor's list queries. Move it into a shared `services/access/studentScope.ts` instead of copying it. |
| Tenancy / packages | `services/tenantMgmt/catalog.ts` `FEATURES`, `CAPABILITY_FEATURES`, `requireFeature()` in `app.ts`, `migrations/platform/002` `PackageEntitlement` | New feature key `feature.student_projects`, mapped to `SIDE_PROJECTS_*` (§4.6). |
| File storage | `services/files/assets.ts` `storeAsset()` (classifies, blocks executables, per-owner quota, sha256 dedupe, preview job), `FileAsset`, `FileDerivative`, `services/files/stream.ts` `streamStoredFile/previewManifest` | Add the `PROJECT` scope to `FileAsset.scope`. Previews (PDF/thumbnail) work without extra code. |
| Notifications | `services/notifications/notifyPerson.ts` (in-app and push) | Supervisor and student notices (§7). |
| Activity / audit | `utils/activityLogger.recordActivity`, `frontend/src/activity/mis.catalog.json` | Log every status change, review and download by staff. |
| UI kit | Tailwind, `framer-motion`, `recharts`, `ui/Modal` (accessible), `useConfirm` / `ConfirmDialog`, `Sidebar.tsx` (`userTypes`, `requiredCapability`), `NavSearch.tsx` | Board, dashboard and drawer. **No drag-and-drop library yet** (§6.2). |

Nearby features that are different things. Do not merge them:
- `ReportProjectUpdate`: projects in *teachers'* instructor reports.
- Task Mentor `tm:PROJECTS_*`: TMCode coding-assignment projects, a grading workflow mapped to `feature.tm.code_runner`. These are **assessed** class projects. Side projects are **self-driven**, so the MIS capabilities are named `SIDE_PROJECTS_*` to avoid any confusion with `tm:PROJECTS_*`. A later bridge (§10) could let a student attach a TMCode project as the GitHub/source link.

---

## 3. Rules (domain analysis)

### 3.1 Status lifecycle

```
          ┌──────────────── reopen (with reason) ─────────────┐
          ▼                                                    │
   IDEA ───────────► IN_PROGRESS ───────────► COMPLETED ───────┘
     ▲                    │
     └── back to idea ────┘          (any status) ──► archived = 1 (hidden; restorable)
```

| Move | Who | Conditions | Effect |
|---|---|---|---|
| create → IDEA | owner, or `SIDE_PROJECTS_MANAGE_ANY` for a student | Title, problem statement and a **concept note** are present | `StatusEvent` row written. Supervisor and class teacher notified. |
| IDEA → IN_PROGRESS | owner, co-owner, MANAGE_ANY | Concept present (always true) | Sets `started_at` if empty. |
| IN_PROGRESS → IDEA | owner, co-owner, MANAGE_ANY | — | Kept in history. |
| IN_PROGRESS → COMPLETED | owner, co-owner, MANAGE_ANY | The "Complete" dialog asks for a short outcome summary (required, ≥ 20 characters) and suggests adding a GitHub or access link and at least one screenshot (soft warnings, not blocks) | Sets `completed_at` and progress = 100. Review state → `AWAITING_VERIFICATION`. |
| IDEA → COMPLETED | — | **Not allowed** (a dropped card bounces back with a message). Projects are completed after work, not straight from an idea. | — |
| COMPLETED → IN_PROGRESS | owner (reason required), MANAGE_ANY | — | Clears `completed_at` and `verified_at`. |
| archive / restore | owner (own), MANAGE_ANY | — | `archived_at` set or cleared. Hidden from the board and from dashboard totals unless "include archived". |
| delete | owner only while `IDEA` and never reviewed; MANAGE_ANY anytime | Soft delete (`deleted_at`) | Files soft-deleted with it. |

The server is the only judge: `services/sideProjects/lifecycle.ts` `transition(project, to, actor, payload)` returns either the new state or a coded refusal: `CONCEPT_REQUIRED`, `SKIP_NOT_ALLOWED`, `OUTCOME_REQUIRED`, `REASON_REQUIRED`, `NOT_OWNER`, `ARCHIVED`. The board shows the refusal text and snaps the card back.

### 3.2 Review state (separate from status)

Status belongs to the student. Review belongs to staff:
`NONE → CHANGES_REQUESTED → NONE …`, and `AWAITING_VERIFICATION → VERIFIED` (or `CHANGES_REQUESTED`).
"Verified complete" is the signal the team lead can trust and report on. Staff never drag a student's card to change its status; they review it. MANAGE_ANY can still correct a status, and that correction is logged.

### 3.3 Year, class and identity snapshots

- `academic_year_id` and `class_group_id` are stamped at creation from the current year's ACTIVE `StudentClassGroup`. A student with no class this year can still create a project (class = null, shown as "No class").
- `reg_number_snapshot` and `student_name_snapshot` are kept, so exports stay correct after a name change or graduation. Screens show live values.
- Rollover: a project still `IDEA` or `IN_PROGRESS` when a new academic year begins **stays one project**. It keeps its origin year and gains `last_active_year_id`, updated on every student write. The monitor's "Academic year" filter matches either *started in* or *active in*. A toggle sets the default to "active in".

### 3.4 Documents

| Type | Required | Accepted | Versions |
|---|---|---|---|
| `CONCEPT` | **Yes, at creation** | pdf, docx, odt, md, txt (the existing `classifyUpload` kinds `pdf/word/markdown/text`) | Re-upload adds a version. The previous versions stay downloadable. A concept can be replaced but never removed. |
| `SRS` | No | same | versioned |
| `IMPLEMENTATION_PLAN` | No | same, plus xlsx (Gantt sheets) | versioned |

- Each type has a **"Download template"** button with NGA's suggested headings (static files in `frontend/public/templates/projects/`), so a concept note is quick to write.
- Alternative to an upload, offered in the create wizard: **"Write it here"**. A short form (problem, target users, proposed solution, expected impact) is rendered server-side to PDF with the existing `pdfExport.ts` and stored as the concept file. This keeps "concept is mandatory" without blocking students who have no file ready.
- Previews: `storeAsset` already queues `file.preview`, so Word becomes PDF and gets a thumbnail. The drawer embeds the PDF variant.

### 3.5 Media and files

- Images (jpg/png/webp/gif/svg are sanitised by the classifier), video (mp4/webm, max 100 MB by env), pdf, slides, sheets, zip, code, markdown. Executables and macro documents are refused (`BLOCKED_EXTS`).
- Each item has an optional caption and a flag that makes it the **cover image** (one per project; the board card shows it).
- Limits (environment, with defaults): `SIDE_PROJECT_MAX_FILES=40`, `SIDE_PROJECT_MAX_MB=300` per project. The per-owner quota `storeAsset` already enforces still applies. Tenant `limit.storage_gb` counts as usual.
- Drag files onto the gallery or the card's drawer to upload. Several at a time, with per-file progress and a retry button.

### 3.6 Links

- GitHub: `^https://github\.com/[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}/?$` (trailing `.git` stripped). Optional Phase 6: fetch public repo facts (last push, language, stars) from the unauthenticated GitHub API (60 requests/hour, free), cached 12 h, never blocking.
- Access link and other links: `https://` only, at most 500 characters, not `javascript:`. Rendered with `target="_blank" rel="noopener noreferrer"` (the captured-links rule), never iframed.
- A server-side reachability check is **not** done in v1 (SSRF risk, no budget for a fetch sandbox).

### 3.7 Progress monitoring

- **Milestones**: title, optional due date, done/not done, order. They give the progress % when any exist.
- **Progress updates**: a short "What I did / what's next / blockers" post (max 1 000 characters, optional attachment). This is the project's timeline, interleaved with status events and reviews.
- **Health** (computed, never stored):
  - `STALE`: in progress with no student activity for 21 days (`SIDE_PROJECT_STALE_DAYS`);
  - `OVERDUE`: past its target date, or with overdue milestones;
  - `BLOCKED`: the last update has blockers;
  - otherwise `ON_TRACK`.
  Shown as a dot on cards and as a dashboard tile.

---

## 4. Permissions (capabilities, presets, seeding)

### 4.1 Naming constraints (from the access-v2 rules)

- Spoke apps keyword-match the legacy permission list ("ADMIN" ⇒ admin, and so on). The new names contain **no** role keyword (`ADMIN`, `TEACHER`, `STUDENT`, `SUPER`, `INSTRUCTOR`, `PARENT`, `STAFF`). Hence `SIDE_PROJECTS_*`, not `STUDENT_PROJECTS_*`.
- Prod MIS runs in **shadow** mode, so `authorizeIn` lets **legacy** permissions decide, while `requireCapability` always asks the v2 engine. Each capability below says which guard it uses and why.

### 4.2 Capabilities (add to `MIS_MANIFEST`, new domain comment "Student side projects")

| Capability | Kind / depths | Scopeable | Restricted | Legacy-visible? | Guard | Purpose |
|---|---|---|---|---|---|---|
| `SIDE_PROJECTS_MANAGE_OWN` | WRITE | no (`SCHOOL_ONLY`) | no | **yes**, like `OFFICE_HOURS_VIEW_SELF`: students reach routes through the legacy STUDENT role | `authorizeIn(cap, null, { legacy: [cap] })`, plus an ownership check in the service | Create and manage your own projects: board, documents, media, milestones, updates. |
| `SIDE_PROJECTS_VIEW` | READ `summary`, `detail` | **yes** (class / grade / programme / mentees / school) | no | no (v2-only) | `requireCapability(cap)` + `req.access.scopeFor(cap)` | `summary`: the dashboard's aggregates only, with groups under 5 students suppressed (the `USAGE_INSIGHTS_VIEW` rule). `detail`: list, open projects, preview and download files. |
| `SIDE_PROJECTS_REVIEW` | WRITE | yes | no | no (v2-only) | `requireCapability(cap, targetOfProject)` | Comment, request changes, verify completion, assign a supervisor. Only on projects inside the scope. |
| `SIDE_PROJECTS_MANAGE_ANY` | WRITE | no (`SCHOOL_ONLY`) | **yes** | no (v2-only) | `requireCapability(cap)` | Register or import projects for students, edit any project, correct status, archive, delete, restore, edit categories, export everything. |

Supervisors: a staff member named as a project's `supervisor_user_id` gets view and review rights on **that project only** through a relation check in the service (`canSuperviseProject`), not through a capability. This matches how mentors are scoped to their mentees. Listed in `GET /side-projects/supervising`.

Add all three v2-only names to `V2_ONLY_CAPABILITIES` in `access/v2Only.ts`.

### 4.3 Preset mapping (`access/presets.ts`)

| Preset (legacy role) | MANAGE_OWN | VIEW | REVIEW | MANAGE_ANY |
|---|---|---|---|---|
| `platform_owner` (SUPER_ADMIN) | – | detail | ✓ | ✓ |
| `school_owner` | – | detail | ✓ | ✓ |
| `head_teacher` | – | detail | ✓ | ✓ |
| `deputy_head_academics` | – | detail | ✓ | – |
| `director_of_studies` | – | detail | ✓ | – |
| `programme_coordinator` (scoped to programme) | – | detail | ✓ | – |
| `class_teacher` (scoped to own class) | – | detail | ✓ | – |
| `mentor` (scoped to mentees) | – | detail | – | – |
| `academic_insights_viewer` | – | summary | – | – |
| **new** `side_projects_lead` "Student projects lead" (the team lead's role; school scope) | – | detail | ✓ | ✓ |
| `student` (STUDENT) | ✓ | – | – | – |

- The new preset `side_projects_lead` lets the team lead (or a future co-lead) run the programme **without** super-admin rights. It is assigned in Access Studio → Positions. Add it to `MIS_PRESETS` with `persona: staff`, so it appears in the Studio picker, and to the "Academics" group.
- Scoped presets (class teacher, programme coordinator, mentor) get the scope from their existing grant rules (`DEFAULT_RULES` CLASS_TEACHER / PROGRAM_LEAD / MENTOR triggers). Nothing new is needed.
- Parents: none in v1. The Phase 6 option is a read-only "Projects" block on `/family` behind the existing parent link (no capability, same as competences).

### 4.4 Migration `128_student_projects.sql` (idempotent, MySQL 5.7 and 8.4)

Following the 112/120 pattern exactly:

1. `INSERT … SELECT … WHERE NOT EXISTS` each of the four `Permission` rows with full metadata (`app='mis'`, `cap_key`, `label`, `domain='ACADEMICS'`, `kind`, `depths` JSON `["summary","detail"]` for VIEW, `restricted`, `scopeable`), then the `UPDATE … SET status='ACTIVE', cap_key=name` repair step.
2. `RolePermission` grants from a derived table `(preset, legacy, perm, depth)` joined to `Role` on `preset_key = preset OR (preset_key IS NULL AND name = legacy)`, with `WHERE NOT EXISTS`. Include `STUDENT` → `SIDE_PROJECTS_MANAGE_OWN` (legacy-visible) and `SUPER_ADMIN` → all three v2 caps.
3. Create the `side_projects_lead` role row only if it is missing. Legacy `Role` has no auto-increment, so the role itself is created by the **boot preset sync** (`insertRoleWithNextId` under `GET_LOCK`), not by SQL. The migration only records `AccessPresetLink` rows for it.
4. `INSERT IGNORE INTO AccessPresetLink (preset_key, perm_name)` for every (preset, cap) pair above, so the registry never re-adds a cap that an admin deliberately removed in Access Studio.
5. **Bump `UserAccessVersion`** for every holder of an affected role. This avoids the snapshot-cache trap: a capability added by migration is otherwise refused with 403 for up to 5 minutes.
6. `ALTER TABLE FileAsset MODIFY scope ENUM('COURSE','RUN_REFERENCE','SUBJECT','SUBMISSION','PROJECT') NOT NULL`. Guard it with an `information_schema` check, so a rerun is a no-op.
7. Create the tables (§5) and seed `SideProjectCategory` (9 rows, `INSERT IGNORE` on a unique `slug`).

Drizzle: add the tables to `backend/src/db/schema.ts`, and add `'PROJECT'` to the `FileAsset.scope` enum and to the `storeAsset` `scope` type.

### 4.5 Seeding beyond the migration

- **Boot sync**: the manifest version bump (`version: "2026.11.18"`) makes the registry sync metadata, and the preset sync gives v2-only caps to roles with holders.
- **Prod runbook**: run `migrate.yml` (128), then deploy the backend, then check, without a user, that `node dist/access/cli.js explain --user <super admin id> --cap SIDE_PROJECTS_VIEW` (or the Studio "Preview as") answers allowed/detail/SCHOOL.
- **Dev demo data**: `backend/scripts/seed-side-projects.ts` (local and test only, refuses when `NODE_ENV=production`). It creates about 12 projects across 4 students and all statuses, using small generated PDF and PNG fixtures, so the board and dashboard can be checked visually.
- **Initial load of the real list**: the monitor's **Import** (MANAGE_ANY) takes CSV/XLSX columns `registration_number, title, problem_statement, status, category, github_url, access_url, academic_year`. Rows are matched by registration number, there is a dry-run preview with errors per row, and imported projects get `concept_pending = 1` (see below).

> **Concept for imported rows:** concept-mandatory applies to students creating projects. Imported legacy projects are flagged `concept_pending` and show a "Concept note needed" badge plus a student notification until one is uploaded. This means the real backlog can be loaded today without inventing documents.

### 4.6 Tenancy / package

- `catalog.ts`: `FEATURES["feature.student_projects"] = "Student side projects"` and `CAPABILITY_FEATURES.mis["SIDE_PROJECTS_*"] = "feature.student_projects"`.
- `migrations/platform/004_student_projects_feature.sql`: a `PackageEntitlement` row for **all four packages** (`starter, gold, premium, max`). It is core for NGA, and keeping it a feature key lets other schools have it switched off later. Add a `kit/icons.ts` icon (`Lightbulb`).
- `app.ts`: `app.use("/side-projects", requireFeature("feature.student_projects"))` before the router mount.
- DB-per-tenant: the MIS migration runner applies 128 to every tenant DB. NGA is tenant 1.

---

## 5. Data model (tables in migration 128)

All `utf8mb4`, InnoDB, `BIGINT` ids, `DATETIME` in UTC (the Reminder Hub UTC trap: write with `UTC_TIMESTAMP()` or JS `toISOString` at whole seconds).

```
SideProjectCategory   (category_id PK, slug UNIQUE, name, sort, is_active)

SideProject
  project_id PK
  owner_user_id            FK User          -- the student
  title VARCHAR(150), title_key VARCHAR(150)  -- lower-cased, UNIQUE(owner_user_id, title_key, deleted_marker)
  problem_statement TEXT, description MEDIUMTEXT NULL (sanitised HTML)
  category_id NULL, tech_tags JSON NULL
  status ENUM('IDEA','IN_PROGRESS','COMPLETED') DEFAULT 'IDEA'
  board_position INT        -- order inside the owner's column
  progress_mode ENUM('AUTO','MANUAL') DEFAULT 'AUTO', progress_manual TINYINT NULL
  review_state ENUM('NONE','CHANGES_REQUESTED','AWAITING_VERIFICATION','VERIFIED') DEFAULT 'NONE'
  github_url, access_url VARCHAR(500) NULL
  supervisor_user_id NULL
  academic_year_id, class_group_id NULL, last_active_year_id
  reg_number_snapshot VARCHAR(20), student_name_snapshot VARCHAR(201)
  cover_asset_id NULL, concept_pending TINYINT(1) DEFAULT 0
  outcome_summary TEXT NULL
  start_date, target_date DATE NULL
  started_at, completed_at, verified_at, verified_by, archived_at, deleted_at NULL
  last_activity_at DATETIME   -- student activity only (drives STALE)
  created_by, created_at, updated_at
  KEY (owner_user_id, status, board_position), KEY (academic_year_id, status),
  KEY (class_group_id, status), KEY (status, last_activity_at), KEY (supervisor_user_id)

SideProjectMember      (project_id, user_id, role ENUM('OWNER','MEMBER'), added_at)  PK(project_id,user_id) -- Phase 5
SideProjectDocument    (document_id PK, project_id, doc_type ENUM('CONCEPT','SRS','IMPLEMENTATION_PLAN'),
                        version INT, asset_id FK FileAsset, is_current TINYINT, source ENUM('UPLOAD','WRITTEN'),
                        uploaded_by, created_at)   UNIQUE(project_id, doc_type, version)
SideProjectMedia       (media_id PK, project_id, asset_id, caption VARCHAR(200), sort INT, created_by, created_at, deleted_at)
SideProjectLink        (link_id PK, project_id, kind ENUM('VIDEO','DESIGN','DOCS','STORE','OTHER'), label, url, sort)
SideProjectMilestone   (milestone_id PK, project_id, title, due_date NULL, done_at NULL, sort)
SideProjectUpdate      (update_id PK, project_id, author_id, did TEXT, next TEXT NULL, blockers TEXT NULL,
                        asset_id NULL, created_at)
SideProjectEvent       (event_id PK, project_id, actor_id, type VARCHAR(24)  -- CREATED|STATUS|REVIEW|DOC|ARCHIVE|RESTORE|IMPORT|SUPERVISOR
                        from_value, to_value VARCHAR(32) NULL, note VARCHAR(500) NULL, created_at)
                        KEY(project_id, created_at), KEY(type, created_at)   -- also feeds the dashboard trends
SideProjectComment     (comment_id PK, project_id, author_id, body TEXT, kind ENUM('COMMENT','CHANGES_REQUESTED','VERIFIED'),
                        created_at, edited_at, deleted_at)
```

The unique title per student uses `deleted_marker` (0 for live rows, the `project_id` for deleted ones), so a deleted title can be reused. This is MySQL 5.7-safe: there are no partial indexes.

---

## 6. Student experience: `/my-projects`

### 6.1 Layout

- **Header**: "My projects", counts per status, a **New project** button, a search box, and a filter (category, include archived).
- **Board** (default) with three columns, each showing a count and its empty state ("No ideas yet. Every project starts as an idea."). There is a **List** toggle for small screens; phones get stacked columns with tabs.
- **Card**: cover thumbnail, title, category chip, a progress bar, a health dot (stale/overdue/blocked), icons for GitHub, live link and file count, document chips (Concept ✓, SRS –, Plan –), and the review badge ("Changes requested", "Verified ✓").
- **Drawer / detail page** (`/my-projects/:id`, deep-linkable). Tabs:
  1. **Overview**: problem, description, links, dates, supervisor.
  2. **Documents**: the three slots, each with upload, versions, preview and template download.
  3. **Gallery**: drag-and-drop uploads, captions, cover choice, lightbox for images and video, file list.
  4. **Progress**: milestones checklist with drag ordering, plus progress updates.
  5. **Timeline**: events, reviews and updates.
  6. **Feedback**: staff comments, with the student's replies.

### 6.2 Drag and drop

- Library: **`@dnd-kit/core` + `@dnd-kit/sortable`** (MIT, free, about 15 kB gzip). It handles pointer, touch and **keyboard** sensors (Space to lift, arrow keys to move, Space to drop) and has screen-reader announcements. Native HTML5 drag and drop does not work on touch devices or with a keyboard, and `framer-motion` `Reorder` only reorders within one list.
- Behaviour:
  - Dropping a card in another column calls `POST /side-projects/:id/transition`. The UI moves the card **optimistically** and rolls it back, with a toast showing the server's reason, on a refusal (e.g. `SKIP_NOT_ALLOWED`).
  - Dropping onto **Completed** first opens the *Complete project* dialog (outcome summary, plus the link and screenshot nudges). Cancelling puts the card back.
  - Reordering inside a column calls `PATCH /side-projects/board/order` with the new id order, debounced.
  - Every card also has a **"Move to…"** menu (the accessible alternative), and the drawer has a status stepper.
- Gallery and milestones reuse the same `SortableContext`.
- File drag and drop (OS → gallery or document slot) is a separate dropzone component using native `dragenter/drop` on `DataTransfer.files` (touch users get the file picker).

### 6.3 Create wizard (modal, 3 steps)

1. **Basics**: title, category, technologies, problem statement.
2. **Concept note** (mandatory): upload (drag and drop) **or** "Write it here", plus a template link.
3. **Links & dates** (optional): GitHub, access link, start/target dates, supervisor.

The project is created as `IDEA` (or, from an "Add" button inside a column, with that column's status, which the lifecycle rules still check).

### 6.4 Sidebar and entry points

- `Sidebar.tsx`: "My projects", section `learning`, `userTypes: ["STUDENT"]`, `requiredPermission: Permissions.SIDE_PROJECTS_MANAGE_OWN`. Add it to `NavSearch.tsx` too.
- `frontend/src/constants` `Permissions`: add the four names.
- Activity catalog: `mis.my_projects` (`/my-projects`) and `mis.projects_monitor` (`/projects-monitor`).

---

## 7. Monitoring experience: `/projects-monitor`

Visible with `SIDE_PROJECTS_VIEW` (`summary` gives the Dashboard tab only), or to a supervisor (a "Supervising" tab only). Sidebar: section `oversight`, `requiredCapability: "SIDE_PROJECTS_VIEW"`.

### 7.1 Global filter bar (shared by all tabs, kept in the URL)

Academic year (default: current, mode "active in"), programme, grade, class, status, review state, category, health, has GitHub, has live link, missing SRS/plan, supervisor, and free-text search (title, student name, registration number). "Include archived" is off by default.

### 7.2 Dashboard tab (modern, interactive)

Build it with the `dataviz` skill's palette and rules, `recharts`, light and dark themes, at 3 viewports.

- **KPI tiles** (each tile is a link that applies its filter to the List tab):
  - total projects and active students (students with ≥ 1 project / all active students in scope, as %);
  - Idea / In progress / Completed counts;
  - completed this term, with the change against last term;
  - awaiting verification;
  - stale (≥ 21 days);
  - overdue;
  - concept pending;
  - with a GitHub link (%).
- **Pipeline funnel / stacked bar**: projects per status. Click a segment to filter.
- **Completions over time**: monthly line for the selected year, against the previous year.
- **Projects per class**: horizontal stacked bars by status, sorted. Click a bar to open that class.
- **Category mix**: donut, or bars when there are more than 6 categories.
- **Top technologies**: bars (top 12 tags).
- **Activity heat strip**: student activity per week (updates, uploads, moves) over the last 16 weeks.
- **Needs attention** list: the 10 most urgent projects (changes requested and not yet answered, stale, overdue, awaiting verification longest), each with a one-click preview.
- **Recently completed** gallery: cover images, which open the preview.
- Freshness: refresh on window focus, plus a 60-second poll while the tab is visible. Show a "Last updated" stamp. There is no websocket in v1 (the MIS has none for this).
- `summary`-only holders get the tiles and charts with **no names**, and classes with fewer than 5 students are merged into "Other".

### 7.3 List tab

- A virtualised table with these columns: reg. number, student, class, year, title, status, review, progress, health, documents, links, last activity, supervisor. Sort on any column, choose columns, rows per page.
- Row click opens the **preview drawer**. Checkboxes give bulk actions (MANAGE_ANY: assign supervisor, archive; REVIEW: request an update).
- **Export**: CSV/XLSX of the filtered rows (the existing report export helpers). Every export is written to `ActivityLog`.

### 7.4 Board tab

The school-wide board grouped by status, with swim lanes by class (toggle). It is read-only for VIEW/REVIEW (no drag). MANAGE_ANY can drag with a "Correct status" confirmation that requires a reason, and the move is logged as a staff correction.

### 7.5 Preview drawer (shared by List, Board and Dashboard)

- A header with the student's photo, reg. number, class and year, a status stepper, the review badge and the health indicator.
- An embedded **concept note** (PDF variant through `streamStoredFile`), with SRS and plan tabs and version pickers.
- The gallery lightbox, the links (opened with noopener), milestones, the progress-update timeline and the events.
- A **Review panel** (REVIEW or supervisor): comment, **Request changes** (the student is notified and the review state changes), **Verify completion** (only when `AWAITING_VERIFICATION`), and assign a supervisor.
- An "Open full page" link to `/projects-monitor/projects/:id`.

### 7.6 Notifications (`notifyPerson`, in-app + push)

| Event | Notified |
|---|---|
| Project created | supervisor (if set), class teacher |
| Moved to Completed | supervisor, `side_projects_lead` holders |
| Changes requested / verified / comment | student and co-owners |
| Student replies to "changes requested" | the reviewer |
| Stale (weekly sweep, Mondays 07:00 Africa/Kigali) | the student (one nudge per project per 14 days) and a digest to supervisors |
| Concept pending (imported) | the student, once, plus a weekly reminder until uploaded |

The weekly sweep runs as a `BackgroundJob` handler `sideProjects.sweep`, scheduled the same way as the existing reminder sweeps.

---

## 8. API (`backend/src/routes/sideProjects.ts`, mounted at `/side-projects`)

`sideProjectsRouter(auth, guards…)` is injectable for tests, like `safeguardingRouter`. Every response follows the `{ success, data | message }` shape. Errors are `SideProjectError(status, code, message)`.

**Student (MANAGE_OWN + ownership / co-ownership):**
```
GET    /side-projects/mine                         ?status=&archived=
POST   /side-projects                              multipart: fields + concept file | conceptWritten JSON
GET    /side-projects/:id
PATCH  /side-projects/:id                          basics, links, dates, supervisor, progress_manual
POST   /side-projects/:id/transition               { to, outcomeSummary?, reason? }
PATCH  /side-projects/board/order                  { status, ids[] }
POST   /side-projects/:id/archive | /restore
DELETE /side-projects/:id
POST   /side-projects/:id/documents/:type          multipart file (new version)
GET    /side-projects/:id/documents/:type/versions
POST   /side-projects/:id/media                    multipart files[] (max 10 per request)
PATCH  /side-projects/:id/media/:mediaId           caption, sort, cover
DELETE /side-projects/:id/media/:mediaId
PUT    /side-projects/:id/links                    [{kind,label,url}]
POST|PATCH|DELETE /side-projects/:id/milestones[/:mid];  PATCH /side-projects/:id/milestones/order
POST   /side-projects/:id/updates
POST   /side-projects/:id/comments                 (student reply)
GET    /side-projects/files/:assetId               ?variant=original|pdf|thumb&download=1  (access-checked stream)
GET    /side-projects/categories | /tags?q=
GET    /side-projects/supervisors?q=               active non-students
```

**Monitor (VIEW / REVIEW / MANAGE_ANY, all filtered through the scope):**
```
GET    /side-projects/monitor/summary              filters → tiles + chart series (summary depth OK)
GET    /side-projects/monitor/projects             filters, sort, page → rows (detail)
GET    /side-projects/monitor/projects/:id         full project (detail; audited)
GET    /side-projects/monitor/attention            needs-attention list
GET    /side-projects/monitor/export               ?format=csv|xlsx (detail; audited)
POST   /side-projects/:id/review                   { kind: COMMENT|CHANGES_REQUESTED|VERIFIED, body } (REVIEW or supervisor)
PATCH  /side-projects/:id/supervisor               (REVIEW)
POST   /side-projects/admin/import?dryRun=1        CSV/XLSX (MANAGE_ANY)
POST   /side-projects/admin/projects               create for a student (MANAGE_ANY)
PATCH  /side-projects/admin/projects/:id/status    correction with reason (MANAGE_ANY)
CRUD   /side-projects/admin/categories             (MANAGE_ANY)
GET    /side-projects/supervising                  projects I supervise (relation, no cap)
```

**Service layout (`backend/src/services/sideProjects/`):**
- `lifecycle.ts`: transitions and refusal codes; pure, so it can be unit-tested.
- `projects.ts`: CRUD, snapshots, ordering, `last_activity_at`.
- `access.ts`: `canOwn`, `canSupervise`, `projectInScope(scope, project)`, `scopeWhere(scope)`. It reuses the shared `studentScope.ts` extracted from early-warning.
- `files.ts`: documents, media and the streaming check (an asset must belong to a project the viewer may see).
- `health.ts`: STALE / OVERDUE / BLOCKED.
- `monitor.ts`: summary aggregates in **one round-trip per chart**, with small-group suppression.
- `importer.ts`: CSV/XLSX parse (the existing xlsx dependency), dry run, commit.
- `notify.ts`, `sweep.ts`.

Security checklist:
- Every `:id` route loads the project and checks owner, co-owner, scope or supervisor **in the service**, not only in the route guard.
- The file stream checks that the asset belongs to the project.
- HTML is sanitised with the existing sanitiser.
- URLs are validated.
- Multer uses disk storage under the tmp dir, and `storeAsset` deletes the tmp file.
- Rate limits: 30 uploads per 10 minutes per user.
- Staff detail views and downloads go to `ActivityLog`.

---

## 9. Phased delivery

Each phase is one PR to `nga_central_mis` `main`, with tests, and is deployable alone. Deploy only on an explicit "deploy" ([deploy-needs-explicit-ask]).

### Phase 0: Foundations, permissions and seeding (backend only)
- [ ] Branch `feat/side-projects` from `origin/main`.
- [ ] Manifest: four capabilities, manifest version bump. Add the v2-only names to `v2Only.ts`.
- [ ] Presets: the §4.3 mapping, plus the new `side_projects_lead` preset.
- [ ] `catalog.ts` feature key and pattern, platform migration `004`, the `requireFeature` mount.
- [ ] Migration 128: permissions, grants, preset links, `UserAccessVersion` bump, `FileAsset.scope` + `PROJECT`, all tables, category seed.
- [ ] Drizzle schema plus the `storeAsset` scope type.
- [ ] Extract `services/access/studentScope.ts` from early-warning (no behaviour change; early-warning tests stay green).
- [ ] `seed-side-projects.ts` dev script.
- [ ] **Tests:**
  - legacy permission output includes `SIDE_PROJECTS_MANAGE_OWN` for students and none of the v2-only names;
  - snapshot answers: a super admin gets VIEW detail SCHOOL; a class teacher gets VIEW scoped to their class; a student gets MANAGE_OWN only;
  - `accessPresets.test.ts` restores any preset it edits;
  - the migration runs twice on a fresh 5.7 clone (idempotent).
- **Exit:** `access cli explain` shows the expected answers; no Access Studio regressions.

### Phase 1: Student projects API
- [ ] `lifecycle.ts` with every rule in §3.1 / §3.2, plus unit tests for each transition and refusal code.
- [ ] CRUD, transition, board order, archive/restore/delete, concept upload (file or written → PDF), document versions, links, the snapshot fields.
- [ ] The access-checked file stream endpoint.
- [ ] **Tests:**
  - supertest per route;
  - another student gets 404 (not 403), so the API does not reveal that a project exists;
  - creating without a concept gives `CONCEPT_REQUIRED`;
  - a blocked extension is refused;
  - the quota is enforced.

### Phase 2: Student board UI (`/my-projects`)
- [ ] Add `@dnd-kit/core` and `@dnd-kit/sortable`. Build the board, cards, keyboard and menu move, optimistic transitions with rollback, and the Complete dialog.
- [ ] Create wizard (3 steps) with a drag-and-drop concept upload and "Write it here".
- [ ] Detail drawer: Overview and Documents (preview through the PDF variant), versions, templates.
- [ ] Sidebar, NavSearch, routes in `App.tsx`, activity catalog.
- [ ] **Tests:**
  - Vitest/RTL: the board renders, a keyboard move calls transition, a refusal rolls back;
  - Playwright flow: create → drag to In progress → complete;
  - axe WCAG AA in 2 themes × 3 viewports (the `scripts/access-ux` harness pattern);
  - secondary text uses `slate-600 / dark:slate-300`.

### Phase 3: Media, progress and timeline
- [ ] Gallery: multi-file dropzone with progress and retry, captions, sortable order, cover image, lightbox (images and video), file list.
- [ ] Milestones (sortable, AUTO progress), progress updates with blockers, the merged timeline, health computation, and health dots on cards.
- [ ] **Tests:** upload limits, cover image unique per project, progress maths, the STALE / OVERDUE / BLOCKED rules with a fixed clock (TZ=UTC).

### Phase 4: Monitoring dashboard and review (`/projects-monitor`)
- [ ] `monitor.ts` aggregates, scope filtering, small-group suppression for `summary`.
- [ ] Filter bar kept in the URL; Dashboard tab (tiles, funnel, completions trend, per class, categories, technologies, heat strip, needs attention, recently completed); List tab (virtualised, sort, columns, export); read-only school Board with the MANAGE_ANY correction; preview drawer; review panel (comment / changes requested / verify); supervisor assignment; the Supervising tab.
- [ ] Notifications for review events. Audit entries for detail views and downloads.
- [ ] **Tests:**
  - a class teacher sees only their class (API and UI);
  - a summary-only holder gets no names and no `/projects/:id` (403);
  - a supervisor sees only the projects they supervise;
  - export is audited;
  - Recharts charts have accessible titles and data tables;
  - a performance check: the summary for 1 000 projects stays under 300 ms on the test clone.

### Phase 5: Load the real list, teams and admin tools
- [ ] Import CSV/XLSX: dry run with errors per row, then commit; `concept_pending` handling and its badge and notification.
- [ ] Create on behalf of a student; category admin; bulk archive and supervisor assignment.
- [ ] Team projects: `SideProjectMember` co-owners invited by registration number (the invited student accepts), the board shows shared projects, and permissions treat co-owners as owners except for delete.
- [ ] Weekly `sideProjects.sweep` (stale nudges, the supervisor digest, concept-pending reminders).
- [ ] **Tests:** the import's matching and failure paths, co-owner rights, sweep idempotency (one nudge per 14 days).

### Phase 6: Optional extras (each needs its own go-ahead)
- [ ] GitHub repo facts (unauthenticated API, cached, best effort).
- [ ] A read-only "Projects" block for parents on `/family`.
- [ ] A Home tile and reminders: a Reminder Hub source for milestone due dates.
- [ ] A public "Showcase" page of verified projects that the student has opted into (needs a privacy decision first).
- [ ] TMCode bridge: attach a TMCode project as the source of a side project.

### Rollout checklist (each phase that touches the database)
1. Apply migration 128 in prod with `migrate.yml` **before** the backend deploy (MySQL 8.4: avoid reserved words; the new table names are safe).
2. Deploy the backend, then the frontend. Hard-refresh to get past the service-worker cache, as with earlier releases.
3. Smoke test: a super admin opens `/projects-monitor`; a test student creates a project, drags it, uploads a file and completes it; an export is written to the audit log.
4. Assign the `side_projects_lead` position to the team lead in Access Studio.
5. Import the existing project list (dry run first).

---

## 10. Risks and decisions

| # | Topic | Default chosen in this plan | Alternative |
|---|---|---|---|
| D1 | When the concept is mandatory | **At creation** (upload, or write it in the wizard). Imported rows are exempt through `concept_pending`. | Allow creating a bare idea, and require the concept only to leave `IDEA`. |
| D2 | Who changes status | The student (and co-owners). Staff review instead of moving cards. MANAGE_ANY can correct, with a reason. | Let supervisors move cards too. |
| D3 | IDEA → COMPLETED directly | Refused | Allowed, with the outcome summary. |
| D4 | Team projects | Phase 5 (co-owners) | Single owner only. |
| D5 | Package | Core: in all four packages, behind a feature key | Premium and above only. |
| D6 | Who monitors besides the super admin | Head teacher, deputies/DoS, programme coordinators (scoped), class teachers (scoped), mentors (view only), the new Student projects lead | Super admin and the lead only. |
| D7 | Video uploads | Allowed up to 100 MB each, within the 300 MB per-project budget | Links only (YouTube/Drive), to save disk space. |

**Risks**
- *Disk space on the single EC2 host* (no infra budget): per-project and per-owner caps, sha256 dedupe (already in `storeAsset`), and a video cap. Watch `limit.storage_gb`.
- *Snapshot cache after the migration*: handled by the `UserAccessVersion` bump in 128.
- *Shadow mode*: the student route relies on the legacy grant to STUDENT. Monitor routes use `requireCapability`, which is always v2. Phase 0 tests both.
- *Local test database*: run on a freshly migrated 5.7 clone, and start mysqld with the FD limits ([mis-local-test-database]) before trusting a "Connection lost" failure.
- *Name confusion with TM `tm:PROJECTS_*`*: avoided by the `SIDE_PROJECTS_*` names and the separate `feature.student_projects` key.

---

## 11. Implementation status (2026-11-18)

Phases 0–5 are built. Phase 6 (GitHub facts, parents' view, Home tile, showcase, TMCode bridge) is not.

### 11.1 Where it lives

| Part | Files |
|---|---|
| Seeding | `backend/migrations/128_student_projects.sql`, `backend/migrations/platform/004_student_projects_feature.sql` |
| Access | `access/manifest.ts` (4 caps), `access/presets.ts` (`SIDE_PROJECTS_REVIEWER`/`SIDE_PROJECTS_FULL` + new `side_projects_lead`), `access/v2Only.ts`, `services/tenantMgmt/catalog.ts` |
| Backend | `services/sideProjects/{core,lifecycle,validate,access,files,projects,progress,review,members,monitor,importer,notify,sweep}.ts`, `routes/sideProjects.ts` (mounted at `/side-projects` behind `requireFeature("feature.student_projects")`), sweep scheduled in `index.ts` every 12 h |
| Frontend | `api/sideProjects.ts`, `components/sideProjects/` (`MyProjects`, `Board`, `ProjectCard`, `CreateWizard`, `ProjectDrawer`, `fields`, `ui`, `panels/*`, `monitor/{ProjectsMonitor,Dashboard,ImportDialog}`), routes `/my-projects` and `/projects-monitor`, sidebar + search entries, `public/templates/projects/*.md` |
| Demo data | `backend/scripts/seed-side-projects.ts [--fixtures]` (refuses production) |
| Tests | `backend/src/__tests__/sideProjects.test.ts` (25), `frontend/src/components/sideProjects/__tests__/sideProjects.test.tsx` (7) |

### 11.2 Deviations from the plan

- **Video files (D7):** not uploaded. The shared classifier already refuses video across the platform ("put it on YouTube and add it as a Video link"), so a project's videos are `VIDEO` links.
- **Written concept:** "Write it here" stores a Markdown document (`<title> - concept.md`), not a PDF. It previews as text and avoids a headless-browser dependency.
- **Description:** plain text with line breaks, not rich HTML.
- **Image thumbnails:** generated at upload with `sharp` (640 px PNG) and cached as a `THUMB` derivative by content hash; board cards and the gallery load thumbnails.
- **Idea progress:** an idea never shows more than 20%, even with milestones ticked.
- **Supervisor entry point:** staff without `SIDE_PROJECTS_VIEW` who supervise projects get a "Supervised projects" sidebar item (with a count) that opens the monitor's Supervising tab.
- **Drag and drop:** pointer drag anywhere on a card; keyboard drag through the small handle at the top of the card (Space, arrows, Space). Left/right jump exactly one column. Every card also has a "Move to…" menu.

### 11.3 Verification

- Backend: 25 new tests pass (repeated runs). Full suite: 1379 pass; the 17 failures also fail on unmodified `main` (environment / test-order), confirmed by running the same files on a clean `main` worktree.
- Frontend: 1070 tests pass (including the no-native-select rule), `tsc` clean, `vite build` succeeds.
- Real access engine (demo DB): super admin → VIEW detail + MANAGE_ANY; student → MANAGE_OWN; a supervising teacher → no capability, 4 supervised projects.
- Browser (Puppeteer, local servers): axe WCAG 2 AA clean on every new view in light/dark and desktop/phone (the only remaining hits are the existing sidebar section headings); no horizontal overflow; end-to-end flows pass: wizard validation, create with concept upload, gallery upload and cover, milestone + update, keyboard drag, pointer drag, complete dialog, lead search + verify, import dry run + import.
