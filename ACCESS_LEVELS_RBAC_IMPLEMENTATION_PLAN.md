# Dynamic Access Control & Leadership Insights — Implementation Plan (v2)

*Revised 2026-09-25 · Scope: Central MIS, Task Mentor, Discipline & Attendance (D&A), Tupo*

---

## 0. What changed from v1, and why

| v1 (fixed catalog) | v2 (dynamic, data-driven) |
|---|---|
| ~20 canonical role codes hardcoded in a shared library and in each app's `access-map.ts` | **Roles are data.** Presets are seeded, then created, edited and retired in the MIS **Access Studio** without a deploy. Apps never reference role names. |
| Each app kept its own role catalog, role admin UI and mapping file | Each app publishes one **capability manifest**. The whole platform has **one** place to build roles and assign them (MIS). Local role screens in the satellites are retired. |
| Permission = allowed or not | Permission = allowed at a **read depth**: `summary` (aggregates only) → `detail` (individual records) → `sensitive` (restricted fields). |
| An admin who needed marks or discipline got the record-level permission, or nothing | Admins have **no** marks or discipline access by default. When granted **summary** depth, they see **programme dashboards, grade/class summaries and trends** with no individual student records. Drill-down stops where their depth stops. |
| Placement → role mapping hardcoded in `grantSync.ts` | **Auto-assignment rules** are data, e.g. "every class teacher gets role *Class Teacher* at their class". Leadership can change what class teachers get from the UI. |
| Fixed "who may assign whom" table | One generic rule: you may only grant what you hold, at a depth no higher than yours, inside your own scope. |
| Dashboards were per app | A federated **Leadership Insights hub** in MIS: School → Programme → Grade → Class. Each app contributes aggregate widgets, and every widget is filtered by the viewer's scope and depth. |

**Why:** this is easier to maintain.

- Adding a feature means adding a capability to the app's manifest and checking it in code; nothing else.
- Changing who can do what is a UI action, not a code change.
- The three duplicated role catalogs, the three role-guessing heuristics and the three role admin UIs are removed.

---

## 1. Research basis — the current state (condensed)

Sources: code of all four apps, the MIS dev DB (MAMP 8889) and the Aug-12 prod dump.

**Central MIS**
- 10 flat, global roles.
- HEAD_TEACHER, ADMIN, ACCOUNTANT and STAFF have **0 holders**.
- HEAD_TEACHER has less oversight than PROGRAM_MANAGER.
- CLASS_TEACHER holds school-wide `MANAGE_ACADEMICS`.
- **No** position, department, HOD, DOS or deputy concept exists.
- Scope comes only from placement tables: `UserProgramLead`, `UserGrade`, `TeacherSubjectAssignment`, `MentorAssignment`, `Parenting`.
- `resolveUserScope` treats *no placement rows* as **unrestricted** (`backend/src/services/userScope.ts`).
- SUPER_ADMIN is resolved 3 different ways: the code constant, `/users/me`, and the SSO token.
- The SSO token is signed with the shared `JWT_SECRET`, has no `aud`, and client secrets are in plaintext (`ssoController.ts`).
- `RoleSystemFragment` is never enforced.
- The frontend only guards login; there are 4+ duplicated `roles.some` helpers.

**Task Mentor**
- `mapMisRoleToLocal` is duplicated. It maps MIS role ids/names by substring, so PROGRAM_MANAGER → admin and PARENT/ACCOUNTANT → student.
- 70 local keys.
- Report cards, manual assessments and proctoring are school-wide for every instructor.
- The live proctoring socket is unauthenticated.

**D&A**
- `roleFromPermissions` does keyword matching: any permission containing "ADMIN" makes the user an admin.
- 31 local keys.
- Any teacher can mark any register, review any excuse and see all discipline.
- The client gates on the role string; the JWT role can be up to 24h stale.
- Major-incident alerts go to *all* staff.

**Tupo**
- `resolveMisRole` does keyword matching.
- 62 local keys.
- The dashboard is the only scoped feature, and a class teacher's scope leaks to the whole programme.
- An admin role change doesn't update `users.role`.
- The realtime socket skips the suspension check.
- The contact policy defaults to allow.
- Mail campaigns can be self-approved.

**Academic hierarchy available for scoping:**

```
School → Program → Grade → ClassGroup
Subject × ClassGroup
```

All placements are per academic year. Only Coding Academy data is operational today.

---

## 2. Design principles

1. **Everything that changes with school policy is data.**
   - Roles, their capabilities, depths, auto-assignment rules and grants live in the database and are edited in Access Studio.
   - Code only declares *capabilities* (what the software can do) and *checks* them.
2. **One decision model, evaluated everywhere the same way.**
   - MIS compiles each user's effective access into a snapshot per app.
   - Every app evaluates it with the same small SDK (`@nga/access`).
3. **Capability × scope × depth × period.** A grant says *what* (the role's capabilities), *where* (a node in the school hierarchy), *how deep* (the depth per capability, taken from the role) and *when* (the validity window).
4. **Grants are never pooled.** Each capability carries its own scope list. A Primary DOS who teaches one IGCSE class has DOS powers over Primary only.
5. **Least privilege by default; aggregate before detail.**
   - Non-teaching roles start with no academic or welfare data.
   - When they get it, `summary` depth is the normal grant.
   - Summaries suppress cohorts that are too small to be anonymous.
6. **Explicit, explainable, reviewable.**
   - "Unrestricted" is a SCHOOL grant, never missing data.
   - Every decision can answer "why?" with the grant(s) that allowed it.
   - Every grant has an owner, a reason and an optional expiry.
   - Leadership re-certifies positions each term.
7. **Incremental, reversible rollout.**
   - Existing permission keys stay valid, just namespaced by app.
   - Shadow mode precedes enforcement in every app.

---

## 3. Core model

### 3.1 Concepts

| Concept | Meaning | Who defines it | Changes need a deploy? |
|---|---|---|---|
| **Capability** | Something the software can do, e.g. `tm:REPORT_CARDS_APPROVE`, `da:DISCIPLINE_VIEW_ALL`, `mis:VALIDATE_SCHEME_OF_WORK` | Developers, in each app's manifest | Yes, and it's the *only* thing that does |
| **Depth** (read capabilities only) | `summary` < `detail` < `sensitive` | Declared per capability in the manifest (which depths it supports). Chosen per role | No |
| **Role** | A named bundle of capabilities with depths, e.g. "Director of Studies", "Academic Insights Viewer" | Leadership / platform owner, in Access Studio. Presets are seeded | No |
| **Scope node** | A place in the hierarchy: `SCHOOL`, `PROGRAM:2`, `DEPARTMENT:3`, `GRADE:7`, `CLASS_GROUP:12`, `SUBJECT_CLASS:31/12`, `MENTEES`, `CHILDREN`, `SELF` | Derived from the academic structure plus departments | No |
| **Grant** | user × role × scope node × validity window (× academic year) | Assigned manually, or created by an auto-assignment rule | No |
| **Auto-assignment rule** | "When a user has placement X, grant role R at the placement's node" | Access Studio | No |
| **Persona** | Baseline identity: Student, Parent, Teaching staff, Support staff (`UserProfile.user_type`) | Registrar/admin | No. The persona itself is granted by an auto rule |

### 3.2 Read depth — the key to "admins see summaries, not marks"

| Depth | What the holder gets | Example UI |
|---|---|---|
| `summary` | Aggregates at or above **class** level: counts, rates, averages, distributions, trends, rankings of *groups*. **No names, no per-student rows.** Cohorts smaller than `MIN_COHORT` (default 5, configurable) are shown as "<5" | Programme dashboard, grade summary, class summary, subject heat-map, discipline trends by category |
| `detail` | Individual records within scope: student marks, incidents, attendance rows, report cards | Class mark sheet, incident list, student profile |
| `sensitive` | `detail` plus restricted fields: counselling notes, sanction deliberations, safeguarding flags, redacted/oversight message content | Case file, oversight reader |

**Rules:**

- Write capabilities (`create`, `edit`, `approve` …) have no depth; they imply `detail` on the records they touch.
- `sensitive` capabilities are marked `restricted` in the manifest. They can only be granted with a written justification and a **maximum validity** (default 90 days), and every read is audit-logged.
- **Drill-down follows depth**:

  ```
  School → Programme → Grade → Class      (summary)
  Class  → Student                         (needs detail)
  Student → case notes                     (needs sensitive)
  ```

  The UI shows the next level only if the viewer holds that depth at that node.

**Example: School Administrator.**

- **Default:** no `tm:*RESULTS*` or `da:DISCIPLINE_*` capabilities. The admin simply doesn't see those menus.
- **If leadership assigns them the preset "Academic Insights Viewer" @SCHOOL:**
  - They get `tm:RESULTS_VIEW` @summary, `da:ATTENDANCE_VIEW` @summary and `da:DISCIPLINE_VIEW` @summary.
  - They now see the programme dashboards, grade and class summaries, and attendance and discipline trends.
  - Opening a class shows averages and distributions, but the student list with marks is not offered.

### 3.3 Scope resolution

Every grant's node is expanded once, when MIS compiles the snapshot:

| Node | Expands to (bounded to school + academic year) |
|---|---|
| `SCHOOL` | `all` |
| `PROGRAM:p` | grades in p → their class groups; subjects via `GradeSubject` |
| `DEPARTMENT:d` | subjects in d (`DepartmentSubject`) × class groups where they are taught or enrolled |
| `GRADE:g` | class groups of g; subjects of g |
| `CLASS_GROUP:c` | c; subjects taught in c |
| `SUBJECT_CLASS:s/c` | the single pair |
| `MENTEES` | the mentor's active mentee ids |
| `CHILDREN` | the parent's `Parenting` student ids |
| `SELF` | the user's own id |

**A target is in scope if any scope entry of that capability covers it.** For example, a class-group target is covered by `all`, by `class_groups ∋ c`, or by `pairs ∋ (s, c)` when the target also has a subject. A student target is resolved to the student's class group and enrollments, or matched directly against a mentee, child or self list.

**Future node types** (§13): `HOUSE` for boarding and `CAMPUS` for multi-school. Adding one needs a new expansion function plus an Access Studio picker, and no app changes.

### 3.4 One generic delegation rule (replaces the v1 "who may assign whom" table)

A user may create, edit or end a grant only when **all** of the following hold:

1. They hold `mis:ACCESS_GRANTS_MANAGE` at a node that **contains** the target node.
2. Every capability in the target role is one they hold themselves at that node, **at an equal or higher depth**. This makes privilege escalation impossible.
3. The target role isn't marked `platform_only`, which keeps platform owner and IT roles out of reach.
4. `restricted` capabilities additionally need `mis:ACCESS_GRANTS_RESTRICTED`, and the grant must include a justification and an expiry.

Result: a Head Teacher can appoint a DOS for Primary. A DOS for Primary can appoint Primary class teachers. A DOS can't create a school-wide role or give anyone discipline powers they don't hold themselves. **No hardcoded table.**

Holder-count caps, such as "1 active Head Teacher per school", are an optional `max_holders` attribute on the role.

---

## 4. Data model (MIS — evolve existing tables, don't fork them)

The existing `Role`, `Permission` and `RolePermission` tables are **extended**, not replaced, so current MIS code keeps working. `UserRole` is superseded by `AccessGrant` and kept as a mirror during migration.

```sql
-- 1) Capability registry (was Permission)
ALTER TABLE Permission
  ADD COLUMN app            VARCHAR(30)  NOT NULL DEFAULT 'mis',   -- mis | tm | da | tupo
  ADD COLUMN `key`          VARCHAR(100) NULL,                     -- app-local key, e.g. REPORT_CARDS_APPROVE
  ADD COLUMN domain         VARCHAR(40)  NULL,                     -- ACADEMICS, ASSESSMENT, ATTENDANCE, DISCIPLINE, WELFARE, COMMS, FINANCE, PEOPLE, ACCESS, SYSTEM
  ADD COLUMN kind           ENUM('READ','WRITE') DEFAULT 'WRITE',
  ADD COLUMN depths         SET('summary','detail','sensitive') NULL,  -- supported depths for READ
  ADD COLUMN restricted     BOOLEAN DEFAULT FALSE,
  ADD COLUMN scopeable      BOOLEAN DEFAULT TRUE,                  -- FALSE = school/platform-only (e.g. MANAGE_SSO_CLIENTS)
  ADD COLUMN deprecated_at  TIMESTAMP NULL,
  ADD UNIQUE KEY uq_perm_app_key (app, `key`);
-- name stays the global unique id: "<app>:<key>" (existing MIS rows: "mis:<name>")

-- 2) Roles become editable templates
ALTER TABLE Role
  ADD COLUMN school_id            INT NULL,          -- NULL = platform-wide preset
  ADD COLUMN category             VARCHAR(40) NULL,  -- Leadership, Teaching, Operations, Welfare, Learner, Family, Platform
  ADD COLUMN allowed_scope_types  VARCHAR(200) NULL, -- CSV; UI only offers these nodes
  ADD COLUMN max_holders          INT NULL,
  ADD COLUMN platform_only        BOOLEAN DEFAULT FALSE,
  ADD COLUMN is_preset            BOOLEAN DEFAULT FALSE,  -- seeded; editable, "reset to preset" available
  ADD COLUMN version              INT NOT NULL DEFAULT 1;

-- 3) Capability depth per role
ALTER TABLE RolePermission
  ADD COLUMN depth ENUM('summary','detail','sensitive') NULL;  -- NULL for WRITE capabilities

-- 4) Grants (replaces UserRole)
CREATE TABLE AccessGrant (
  grant_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  role_id          INT NOT NULL,
  school_id        INT NOT NULL,
  scope_type       ENUM('PLATFORM','SCHOOL','PROGRAM','DEPARTMENT','GRADE','CLASS_GROUP',
                        'SUBJECT_CLASS','MENTEES','CHILDREN','SELF') NOT NULL,
  scope_id         INT NULL,
  scope_id2        INT NULL,                 -- class_group for SUBJECT_CLASS
  academic_year_id INT NULL,                 -- NULL = not year-bound
  valid_from       DATE NULL,
  valid_until      DATE NULL,
  title            VARCHAR(150) NULL,        -- "Director of Studies — Primary", "Acting Head Teacher"
  justification    VARCHAR(500) NULL,        -- required for restricted capabilities
  source           ENUM('MANUAL','RULE','MIGRATION') NOT NULL,
  rule_id          INT NULL,
  source_ref       VARCHAR(120) NULL,        -- placement row key, for idempotent rule sync
  status           ENUM('ACTIVE','SUSPENDED','ENDED') DEFAULT 'ACTIVE',
  granted_by       INT NULL,  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_by         INT NULL,  ended_at   TIMESTAMP NULL,  end_reason VARCHAR(255) NULL,
  last_certified_at TIMESTAMP NULL, certified_by INT NULL,
  KEY ix_user (user_id, status), KEY ix_scope (scope_type, scope_id),
  UNIQUE KEY uq_rule_source (rule_id, source_ref)
);

-- 5) Auto-assignment rules (dynamic placement → role)
CREATE TABLE AccessRule (
  rule_id      INT AUTO_INCREMENT PRIMARY KEY,
  school_id    INT NOT NULL,
  name         VARCHAR(150) NOT NULL,
  trigger_type ENUM('PERSONA','CLASS_TEACHER','SUBJECT_TEACHER','PROGRAM_LEAD',
                    'MENTOR','PARENT','DEPARTMENT_MEMBER') NOT NULL,
  trigger_filter JSON NULL,               -- e.g. {"user_type":"STUDENT"} or {"program_ids":[8]}
  role_id      INT NOT NULL,
  scope_from   ENUM('PLACEMENT','SELF','CHILDREN','MENTEES','SCHOOL') NOT NULL,
  status       ENUM('ACTIVE','PAUSED') DEFAULT 'ACTIVE',
  created_by   INT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 6) Departments (HOD scope)
CREATE TABLE Department (department_id INT AUTO_INCREMENT PRIMARY KEY, school_id INT NOT NULL,
  code VARCHAR(40) NOT NULL, name VARCHAR(150) NOT NULL, status ENUM('ACTIVE','DISABLED') DEFAULT 'ACTIVE',
  UNIQUE KEY (school_id, code));
CREATE TABLE DepartmentSubject (department_id INT NOT NULL, subject_id INT NOT NULL,
  PRIMARY KEY (department_id, subject_id), UNIQUE KEY (subject_id));

-- 7) Freshness + audit + app manifests
ALTER TABLE User ADD COLUMN access_version INT NOT NULL DEFAULT 1;
CREATE TABLE AccessAudit (audit_id BIGINT AUTO_INCREMENT PRIMARY KEY, actor_id INT, subject_user_id INT NULL,
  action VARCHAR(60) NOT NULL,             -- grant.create, grant.end, role.update, rule.update, restricted.read, preview.as ...
  target JSON NULL, before_json JSON NULL, after_json JSON NULL, reason VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY (subject_user_id), KEY (action, created_at));
CREATE TABLE AccessManifest (app VARCHAR(30) PRIMARY KEY, version VARCHAR(40), checksum CHAR(64),
  manifest JSON NOT NULL, published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
```

**Why grants are one table instead of one per position type:** a new position ("Head of Boarding", "Exams Officer", "ICT Coordinator") needs **zero schema work**. Leadership creates a role in the UI and assigns it at a node.

**Placement tables are unchanged** (`UserGrade`, `TeacherSubjectAssignment`, `UserProgramLead`, `MentorAssignment`, `Parenting`). They stay the authoring source for teaching operations. The rule engine turns them into grants (§5).

---

## 5. Dynamic assignment

### 5.1 Auto-assignment rules (the seeded defaults, all editable)

| Rule | Trigger | Grants role (preset) | Scope |
|---|---|---|---|
| Student baseline | persona STUDENT | Student | SELF |
| Parent baseline | `Parenting` row | Parent | CHILDREN |
| Staff baseline | persona TEACHER / STAFF / ADMIN | Staff Member | SELF |
| Class teachers | `UserGrade` row (year) | Class Teacher | CLASS_GROUP (or GRADE if class_group is null) |
| Subject teachers | `TeacherSubjectAssignment` row (year) | Subject Teacher | SUBJECT_CLASS |
| Programme leads | `UserProgramLead` row (year) | Programme Coordinator | PROGRAM |
| Mentors | active `MentorAssignment` | Mentor | MENTEES |

**Engine** (`backend/src/services/access/ruleEngine.ts`):

- **When it runs:**
  - Synchronously in the same transaction as each placement write. The class-teacher, subject-assignment, programme-lead, mentor, parenting and profile controllers call `applyRules({userId, trigger})`.
  - As a nightly reconcile job.
  - Whenever a rule is edited. Editing a rule re-derives every grant it owns, in the background, with progress shown in the UI.
- **Idempotency:** guaranteed by `uq_rule_source`.
- **Placement removed:** the placement's grant is ended with `end_reason='placement removed'`.
- **Year rollover:** old-year grants expire with the year. New-year placements create new grants, and nothing else needs doing.

### 5.2 Manual assignment (positions)

Leadership assigns positions in Access Studio: pick a person → pick a role → pick a node (only the node types the role allows, and only inside the assigner's own scope, per §3.4) → set dates → give a reason.

Supported:

- **Acting appointments:** overlapping grants with `valid_until`.
- **Suspending a grant:** leave, investigations.
- **Handover:** end one grant and start another in one action.

### 5.3 Freshness

Any change to a grant, a role (all holders), a rule, a department or the hierarchy (affected holders) bumps `User.access_version`:

1. `/auth/verify`, which all three apps already poll every 3 minutes, returns `access_version`.
2. When it changes, the app re-fetches its snapshot.

Worst-case staleness is 3 minutes (24h in D&A today). An optional signed webhook `POST {app}/api/access/changed` gives instant revocation.

### 5.4 Governance

- **Termly access review:**
  - Each grant-holder's manager, meaning the holder of `ACCESS_GRANTS_MANAGE` over the node, gets a checklist of manual grants to *certify* or *end*.
  - Grants left uncertified for 30 days after the review are flagged, and suspended if the school turns on the setting.
- **Expiring grants:** a banner shows 14 days before `valid_until`.
- **Leaving staff:** `User.status → INACTIVE` ends all of the user's grants.
- **Lock-out guard:** the last active grant carrying `mis:ACCESS_GRANTS_MANAGE @SCHOOL` can't be ended.

---

## 6. Capability manifests (one per app)

Each app keeps its **existing permission keys**, so there is no mass rename. It declares them, with metadata, in a single typed file:

```ts
// nga-discipline-attendance/server/src/access/manifest.ts
import { defineManifest } from '@nga/access';

export default defineManifest({
  app: 'da',
  name: 'Discipline & Attendance',
  capabilities: {
    ATTENDANCE_MARK:        { domain: 'ATTENDANCE', kind: 'WRITE', label: 'Mark registers' },
    ATTENDANCE_VIEW:        { domain: 'ATTENDANCE', kind: 'READ', depths: ['summary', 'detail'],
                              label: 'View attendance' },
    DISCIPLINE_VIEW:        { domain: 'DISCIPLINE', kind: 'READ', depths: ['summary', 'detail', 'sensitive'],
                              restricted: ['sensitive'], label: 'View discipline' },
    DISCIPLINE_SANCTION_SUSPEND: { domain: 'DISCIPLINE', kind: 'WRITE', label: 'Approve suspensions' },
    // ...
  },
  insights: {                               // aggregate widgets this app contributes (§8)
    'attendance.rate':      { capability: 'ATTENDANCE_VIEW', minDepth: 'summary', levels: ['SCHOOL','PROGRAM','GRADE','CLASS_GROUP'] },
    'discipline.incidents': { capability: 'DISCIPLINE_VIEW', minDepth: 'summary', levels: ['SCHOOL','PROGRAM','GRADE','CLASS_GROUP'] },
  },
  aliases: { ATTENDANCE_VIEW_ALL: 'ATTENDANCE_VIEW', DISCIPLINE_VIEW_ALL: 'DISCIPLINE_VIEW' },   // legacy keys → new
});
```

**Publishing:**

1. On deploy, CI runs `npm run access:publish`, which sends `PUT /access/manifests/:app` (authenticated with the app's client credentials).
2. MIS upserts the `Permission` rows (`name = "da:ATTENDANCE_VIEW"`).
3. Removed keys are marked `deprecated_at`, never deleted. Access Studio then warns any role still using them.

**Key consolidation:** where an app has separate `*_VIEW_ALL` / `*_VIEW_OWN` pairs, the manifest collapses them into one READ capability. "Own" becomes the SELF scope, and "all" becomes a wider scope with a depth. `aliases` keep old call sites working until they are cleaned up.

**Adding a feature from now on:**

1. Add the key to `manifest.ts`.
2. Call `access.can('NEW_KEY', target)` in code.
3. Deploy.

The capability then shows up in Access Studio, ready to add to roles.

---

## 7. Enforcement: the snapshot and the SDK

### 7.1 Snapshot: `GET /access/me?app=da` (compiled by MIS, per app)

```jsonc
{
  "v": 17,                       // access_version
  "app": "da",
  "user": { "id": 42, "persona": "TEACHING_STAFF", "school_id": 1 },
  "year": 5,
  "caps": {
    "DISCIPLINE_VIEW": [
      { "depth": "summary", "scope": { "all": true },            "via": [311] },  // Insights Viewer @SCHOOL
      { "depth": "detail",  "scope": { "class_groups": [7] },    "via": [402] }   // Class Teacher @G7-A
    ],
    "DISCIPLINE_LOG": [
      { "scope": { "class_groups": [7], "pairs": [[31, 12]] },   "via": [402, 405] }
    ]
  },
  "grants": { "311": { "role": "Academic Insights Viewer", "title": null },
              "402": { "role": "Class Teacher", "title": "Class Teacher — G7-A" } },
  "home": "insights:SCHOOL",
  "systems": ["MIS", "TaskMentor", "Tendo", "Tupo"]
}
```

- **Compiled per capability**, so apps do no hierarchy logic and never see role names in decisions. Role names appear only in `grants` for display and explanation.
- **Small:** a few KB for NGA's size.
- **Unknown capability:** denied (fail closed).
- **`systems`** lists the apps that grant at least one capability, which replaces the unused `RoleSystemFragment`. `/sso/authorize` refuses a client whose app has no capability for the user (`403 not_entitled`).

### 7.2 `@nga/access` SDK

A small, dependency-free TypeScript package:

- **Location:** `nga_central_mis/packages/access`.
- **Consumed:** as a git dependency pinned by tag, or vendored with a checksum test in CI.
- **Tests:** the same test table runs against MIS and the SDK to guarantee identical decisions.

```ts
// server
const access = createAccess({ app: 'da', fetchSnapshot, cache });      // snapshot cached by (user, v)
router.get('/discipline', access.require('DISCIPLINE_VIEW', { depth: 'detail' }), handler);
access.can(req, 'DISCIPLINE_LOG', { classGroupId: 7, subjectId: 31 });           // → boolean
access.depthAt(req, 'DISCIPLINE_VIEW', { classGroupId: 12 });                    // → 'summary' | 'detail' | 'sensitive' | null
access.scopeFor(req, 'DISCIPLINE_VIEW', 'detail');                               // → { all } | { class_groups, pairs, students } | null  → SQL filter
access.explain(req, 'DISCIPLINE_VIEW', { studentId: 99 });                       // → { allowed, depth, via: [{grant, role, node}] }

// client (React)
const { can, depthAt } = useAccess();                                            // same semantics, reads the same snapshot
<Can cap="DISCIPLINE_LOG" target={{ classGroupId }}>…</Can>
```

**Helpers apps use for data filtering:**

- `toSqlFilter(scope, columns)`: builds a `WHERE` fragment for the app's own column names. There are adapters for MySQL (Task Mentor, MIS), SQLite (D&A) and Postgres (Tupo).
- `suppressSmallCohorts(rows, minCohort)`: used by every summary endpoint.

### 7.3 What each app deletes

| App | Removed | Replaced by |
|---|---|---|
| MIS | `ALL_PERMISSIONS` super-admin shortcut; `resolveUserScope`'s "no rows = unrestricted"; the duplicated `roles.some` helpers; `usePermissions` walking `user.roles[]` | Policy engine plus `useAccess()`. `resolveUserScope` keeps its signature but reads `scopeFor` |
| Task Mentor | Both copies of `mapMisRoleToLocal`; `getSubjectScope` inferring "all" from `USERS_EDIT`; the local `roles` / `role_permissions` tables and Roles & Permissions page; `users.role` ENUM; JWT `role` | Snapshot + SDK. The admin page becomes a link to Access Studio (filtered to `tm:`) |
| D&A | `roleFromPermissions` / `detectRoleFromMis`; local roles tables and admin page; 24 `allowedRoles` routes; 18 `roles:` nav items; JWT `role` | Snapshot + SDK. `ADMIN_USERNAMES` is kept only as a first-run bootstrap when MIS is unreachable |
| Tupo | `resolveMisRole`; `readAcademic`; `SYSTEM_ROLES`; `seedRbac`; RolesPermissions admin; `users.role`; `dashboardService.resolveScope` shortcuts | Snapshot + SDK. The `users.mis_*_ids` columns stay as a cache derived from the snapshot, for the GIN-indexed dashboard SQL |

---

## 8. Leadership Insights (aggregate views for summary depth)

### 8.1 Views and drill-down path

```
School overview ─▶ Programme dashboard ─▶ Grade summary ─▶ Class summary ─▶ Student profile ─▶ Case file
   (summary)          (summary)             (summary)        (summary)        (detail)           (sensitive)
```

| View | Shows (per domain the viewer holds at ≥ summary) |
|---|---|
| **School overview** | Per programme: attendance rate, punctuality, average result, pass rate, incidents per 100 students, merit/demerit balance, scheme-of-work validation progress, lesson-report submission rate, Tupo engagement |
| **Programme dashboard** | The same KPIs per grade; term-over-term trend; subject heat-map (grade × subject average); top and bottom classes by attendance and incidents |
| **Grade summary** | The same KPIs per class group; result distribution (bands); incident categories; chronic-absence *counts* |
| **Class summary** | Per subject: average, distribution, completion of assessments; attendance by weekday and period; incident categories and trend; excuse turnaround. **No student names at summary depth** |
| **Student profile** | Available only with `detail` at a node covering the student: marks, attendance log, incidents, report cards |
| **Case file** | Available only with `sensitive`: counselling notes, sanction deliberations, safeguarding flags. Each read is audited |

### 8.2 Federated insights contract

Every app exposes read-only aggregate endpoints, declared in its manifest's `insights` block:

```
GET /api/insights/:metric?node=PROGRAM:2&period=TERM:7&groupBy=GRADE|CLASS_GROUP|SUBJECT|WEEK
→ { metric, node, period, groupBy, rows: [{ key, label, value, n, suppressed }], generated_at }
```

**Server rules**, the same in every app and provided by the SDK:

- **Access:** `depthAt(cap, node) ≥ minDepth`; otherwise 403.
- **Grouping:** `groupBy` may never go below `CLASS_GROUP` at summary depth. Grouping by `STUDENT` requires `detail`.
- **Suppression:** rows with `n < MIN_COHORT` return `suppressed: true` with no value.
- **Caching:** results are cached per (metric, node, period) for 10 minutes. Cached results are **shared between viewers**, because aggregates don't depend on who is asking once access has passed.

**Metrics by app:**

| App | Metrics |
|---|---|
| D&A | `attendance.rate`, `attendance.punctuality`, `attendance.chronic_absence`, `excuses.turnaround`, `discipline.incidents`, `discipline.points_balance`, `discipline.by_category`, `staff.register_completion` |
| Task Mentor | `results.average`, `results.distribution`, `results.pass_rate`, `assessments.completion`, `report_cards.progress`, `proctoring.violations_rate` |
| MIS | `curriculum.sow_validation`, `teaching.lesson_reports`, `elearning.progress`, `mentorship.checkins` |
| Tupo | `engagement.active_rate`, `comms.parent_mail_response_time`, `safety.reports_count` (no content) |

### 8.3 MIS Insights hub

- **Route:** `/insights/:node`, a new module that replaces the scattered admin, program-lead and class-teacher dashboards.
- **Widgets:** the hub reads every published manifest's `insights`. It renders only widgets whose capability the viewer holds at ≥ `minDepth` at the current node, and fetches each widget directly from its app with the user's SSO token. **Result: the dashboard assembles itself from grants.** Give someone "Discipline Insights" and a discipline panel appears; nothing is hardcoded per role.
- **Breadcrumb node picker:** limited to nodes where the viewer holds at least one insight capability.
- **Landing page:** the snapshot's `home` sends the user to their widest node, e.g. `insights:SCHOOL` for the head and `insights:PROGRAM:2` for a DOS. Teachers without insight capabilities keep `/teacher-dashboard`.
- **Exports:** exporting an insight view (PDF/Excel via the existing reporting exporters) keeps the viewer's depth. Summary exports contain no names.

---

## 9. Access Studio (MIS UI)

The single place to manage access for all four apps. Gate: `mis:ACCESS_STUDIO_VIEW`; editing needs the specific capability.

| Screen | Purpose |
|---|---|
| **Roles** | List presets and custom roles. The role editor shows capabilities grouped by *domain → app*, a **depth selector** (None / Summary / Detail / Sensitive) for READ capabilities and a toggle for WRITE capabilities, the allowed scope types, `max_holders`, and a live "affects N people" count. Supports duplicate, "reset to preset", and a version history with diffs |
| **People & positions** | An organisation chart (School → Programmes → Departments → Grades → Classes) showing holders per node, vacancies and acting holders. Assign/end/suspend/hand over, following the §3.4 checks |
| **Auto-assignment rules** | Edit the §5.1 rules. Preview "this change affects N grants" before saving; the sync runs in the background |
| **Departments** | CRUD departments and drag-drop subjects into them. Subjects with no department are flagged |
| **Access explorer** | Pick a user → effective access per app (capability × depth × nodes), each with "via" grant(s). **Simulator:** "Can *X* do *capability* on *target*?" answers with the explanation trace |
| **Preview as** | Read-only preview of another user's menus and dashboards (`mis:ACCESS_PREVIEW_AS`, audited) |
| **Reviews** | The termly certification campaign, expiring grants, restricted-grant justifications |
| **Audit** | A filterable `AccessAudit` log, including restricted reads reported by apps through `POST /access/audit` |
| **Apps** | Published manifests per app: version, capabilities, deprecated keys still used by roles |

**Frontend:** new module `frontend/src/features/access-studio/`. The existing `components/Permissions.tsx` and `permissions/*` screens are folded into Roles. `UserProfileTabs/{RolesTab,GradesTab,ProgramsTab}` become one **Access** tab showing grants and their sources.

---

## 10. Seeded role presets (starting point, fully editable)

Legend:

- **Depth:** S = summary, D = detail, X = sensitive, ✎ = write/manage, — = none.
- **Scope:** shown as the default node in the header. It can be narrowed or widened within `allowed_scope_types` when assigning.
- Mentioned capabilities are indicative. The seed file (`backend/src/services/access/presets.ts`) lists exact keys per app.

| Preset (default node) | Structure & timetable | Curriculum (SoW, notes, courses) | Assessment & results | Report cards | Attendance | Discipline | Welfare / mentorship | Comms (Tupo) | Finance | People & access |
|---|---|---|---|---|---|---|---|---|---|---|
| **Platform Owner** (PLATFORM, platform_only) | ✎ | ✎ | — ¹ | — ¹ | — ¹ | — ¹ | — | ✎ admin | — | ✎ incl. systems/SSO |
| **Head Teacher** (SCHOOL) | D | D + approve | D | approve & publish | D | D + suspend | S | announce, bulk, approve mail | S | grant positions |
| **Deputy Head — Academics** (SCHOOL) | ✎ timetable | ✎ validate | D + override (audited) | approve | S | — | — | announce | — | grant teaching roles |
| **Director of Studies** (PROGRAM) | ✎ timetable | validate | D | approve | S | S | — | announce (programme) | — | grant teaching roles in node |
| **Programme Coordinator** (PROGRAM) | D | validate | S | S | S | S | S | announce (programme) | — | grant teaching roles in node |
| **Deputy Head — Discipline** (SCHOOL) | D | — | — | — | D | D + rules ✎ + recommend suspension | S | announce | — | grant discipline leads |
| **Discipline Lead** (PROGRAM / GRADE) | D | — | — | — | D + mark (cover) | D + detention / community service | — | — | — | — |
| **Head of Department** (DEPARTMENT) | D | review, question-bank curation | D + moderate | S | — | — | — | channel | — | — |
| **Class Teacher** (CLASS_GROUP, rule) | D | — | D | comment | ✎ homeroom + D | log, D, warning/parent contact | S | class channel, class+parent bulk mail | — | — |
| **Subject Teacher** (SUBJECT_CLASS, rule) | D | ✎ own | ✎ enter marks, D | enter subject marks | ✎ lesson + D | log, D (own class) | — | channel | — | — |
| **Mentor** (MENTEES, rule) | — | — | D | D | D | D | ✎ check-ins | DM mentees | — | — |
| **School Administrator** (SCHOOL) | ✎ structure, enrollment, calendar | — | **—** | — | **—** | **—** | — | announce | — | manage accounts, grant placements (if delegated) |
| **Academic Insights Viewer** (SCHOOL / PROGRAM) *add-on* | — | S | **S** | S | **S** | **S** | S | engagement S | — | — |
| **Registrar** (SCHOOL) | enrollment ✎ | — | — | — | — | — | — | — | — | student/parent accounts ✎ |
| **Bursar** (SCHOOL) | — | — | — | — | — | — | — | — | ✎ | — |
| **Counsellor** (SCHOOL / PROGRAM) | — | — | S | — | S | D (referred) | X (cases) ² | DM | — | — |
| **Safeguarding Lead** (SCHOOL) | — | — | — | — | S | X ² | X ² | oversight X ², moderation ✎, contact policy ✎ | — | — |
| **Communications Officer** (SCHOOL) | — | — | — | — | — | — | — | feed pages ✎, bulk mail, engagement S | — | — |
| **IT Support** (SCHOOL, platform_only) | — | — | — | — | — | — | — | system health | — | accounts, SSO, systems ✎ |
| **Staff Member** (SELF, rule) | own timetable | — | — | — | own staff clock | — | — | chat/meet/mail | — | own profile |
| **Student** (SELF, rule) | own | enrolled courses | own | own | own + excuses | own | own check-ins | contact policy | own | own profile |
| **Parent** (CHILDREN, rule) | children | — | children | children | children + excuses | children | — | children's teachers | children | own profile |

¹ The Platform Owner has **no default content access** to marks, discipline or welfare. They administer the system; they are not a reader. Break-glass is a time-boxed restricted grant with a justification, audited and reported to the Head Teacher.
² Restricted: requires a justification and expiry (max 1 year for a standing safeguarding role), and every read is audited.

**This directly answers the requirement:**

- **School Administrator** has **no marks or discipline access by default**.
- Adding the **Academic Insights Viewer** role (at SCHOOL or at one programme) opens the programme dashboards, grade and class summaries and trends, with no individual records.
- If leadership later wants an admin to see one class's individual marks, they grant a narrow, time-boxed `detail` role at that class node. No code changes.

**Workflows are expressed as capabilities, so they stay dynamic:**

| Workflow | Step capabilities (holder must have them at a node covering the target) |
|---|---|
| Scheme of work | `mis:SOW_EDIT` → `mis:SOW_REVIEW` → `mis:SOW_VALIDATE` |
| Report cards | `tm:MARKS_ENTER` → `tm:REPORT_CARDS_COMMENT` → `tm:REPORT_CARDS_APPROVE` → `tm:REPORT_CARDS_PUBLISH` |
| Discipline sanctions | `da:SANCTION_WARNING`, `da:SANCTION_DETENTION`, `da:SANCTION_SUSPEND_RECOMMEND`, `da:SANCTION_SUSPEND_APPROVE` |
| Bulk mail approval | `tupo:MAIL_APPROVE` covering the audience; approver ≠ sender |

- **Approver pool:** "the holders of the next step's capability whose scope covers the target". It is computed by `GET /access/holders?cap=&target=` in MIS and used for notifications and approval queues.
- **Replaces broadcasts:** D&A's `user_id='all'` broadcasts and Tupo's self-approval.
- **Re-routing:** moving a step to a different position means editing roles, not code.

---

## 11. Implementation phases

Estimates are for one senior full-stack engineer. Phases 6–8 can run in parallel with a second engineer.

### Phase 0 — Security & hygiene prerequisites (≈1 week)

1. **MIS super admin:** seed the unseeded but checked permissions (MANAGE_PERMISSIONS, VIEW_USERS, VIEW_ACADEMICS, MANAGE_SETTINGS). Grant the orphaned ones. Make SUPER_ADMIN database-driven (drop the `ALL_PERMISSIONS` shortcut) so the API, `/users/me` and SSO agree.
2. **MIS roles:** remove `MANAGE_ACADEMICS` / `MANAGE_ACADEMIC_CALENDAR` from CLASS_TEACHER. Give a teaching baseline to users 26 and 27 and to the CLASS_TEACHER / PROGRAM_MANAGER holders.
3. **SSO hardening:**
   - `iss`/`aud` claims and a separate `SSO_JWT_SECRET`.
   - Hashed client secrets plus rotation of all three; scrub the committed dumps.
   - Check user status and `token_version` at `/sso/token`.
   - `state` in all three clients.
4. **App fixes:**
   - Task Mentor: authenticate the `live-server` socket.
   - Tupo: sync `users.role` on role change, suspension check in the realtime socket, block mail self-approval.
5. **Dev data:** a single current academic year; remove the test programmes and grades.

### Phase 1 — Registry & model (≈1 week)

- The §4 migrations and Drizzle schema updates (`backend/src/db/schema.ts`).
- The MIS's own manifest (`backend/src/access/manifest.ts`), covering its 61 permissions with domain, kind and depths. Existing names are kept as `mis:<name>`.
- Seed presets (§10) and default rules (§5.1). Map the existing roles onto presets in place:

  | Existing role | Becomes preset |
  |---|---|
  | SUPER_ADMIN | Platform Owner |
  | ADMIN | School Administrator |
  | HEAD_TEACHER | Head Teacher |
  | ACCOUNTANT | Bursar |
  | PROGRAM_MANAGER | Programme Coordinator |
  | CLASS_TEACHER | Class Teacher |
  | TEACHER | Staff Member + Subject Teacher (via rule) |
  | STUDENT | Student |
  | PARENT | Parent |
  | STAFF | Staff Member |

- **Backfill** (`scripts/backfill-access-grants.ts`, dry-run by default):
  - `UserRole` → manual grants @SCHOOL (or @SELF for personas).
  - Run the rules over all placements, e.g. user 20 → Class Teacher @Coding A, user 19 → Programme Coordinator @Coding Academy titled "NGA SPES Program Coordinator".
  - A reconciliation report lists users without a persona, class teachers without a `UserGrade` row (prod user 17), and PROGRAM_MANAGER holders without a programme (prod user 24). These are **not** given school scope.

**Exit:** a comparison script shows old vs new effective access for every user, with each difference justified.

### Phase 2 — Policy engine, snapshot, SDK (≈1.5 weeks)

- `backend/src/services/access/`:
  - `compile.ts`: grants → per-capability scope lists, cached by (user, version, app, year)
  - `expand.ts`: node expansion, §3.3
  - `policy.ts`
  - `ruleEngine.ts`
  - `delegation.ts`: §3.4
  - `holders.ts`: approver pools
- Endpoints:

  | Endpoint | Purpose |
  |---|---|
  | `GET /access/me?app=` | the user's snapshot (§7.1) |
  | `GET /access/users/:id?app=` | preview another user's access |
  | `GET /access/explain` | explanation trace for a decision |
  | `GET /access/holders` | approver pools (§10) |
  | `PUT /access/manifests/:app` | apps publish their manifest (§6) |
  | `POST /access/audit` | apps report restricted reads |
  | `/access/grants`, `/access/roles`, `/access/rules`, `/departments` | CRUD with §3.4 checks |

- Bump `access_version` on every relevant change; return it from `/auth/verify`.
- Enforce `systems` entitlement at `/sso/authorize`.
- MIS middleware:
  - `authorize(perm)` keeps its signature, backed by the policy.
  - Add `authorizeIn(perm, targetFn, depth?)` to the currently open routes and the `MANAGE_ACADEMICS` / `MANAGE_USERS` catch-alls.
  - `resolveUserScope` is re-implemented on `scopeFor`.
- `packages/access` (`@nga/access`): the shared decision table, SQL adapters, `suppressSmallCohorts`, the React `useAccess` / `<Can>`, and `defineManifest`. Tag `access-v1`.

### Phase 3 — Access Studio (≈2 weeks)

- The §9 screens.
- MIS frontend migrates to `useAccess()`, adds per-route guards, and deletes the duplicated helpers.
- The existing Permissions and UserProfile tabs are folded into Access Studio.

**Exit:** leadership can model NGA's structure and change a role's capabilities with no developer involved.

### Phase 4 — Insights layer (≈2 weeks)

- SDK insights helpers: node parsing, depth gate, `groupBy` floor, suppression, cache.
- MIS metrics (`curriculum.*`, `teaching.*`, `elearning.*`, `mentorship.*`) and the **Insights hub** (`/insights/:node`), with manifest-driven widgets, breadcrumb drill-down and depth-preserving export.
- Retire the separate program-lead / class-teacher dashboard pages. Redirect them to `/insights/PROGRAM:x` or `/insights/CLASS_GROUP:y`. The `ClassTeacher*Page` components are reused inside the class summary where the viewer has detail depth.

### Phase 5 — Task Mentor adoption (≈1.5 weeks)

- `server/src/access/manifest.ts`: the 70 keys consolidated into READ-with-depth where pairs exist, plus aliases.
- `protect` uses the snapshot, and `req.access` comes from the SDK.
- Replace `mapMisRoleToLocal` ×2, `getSubjectScope` / `getScopedSubjects` and the remaining role-string reads (`course.controller.ts`, `dashboardController.getRecentActivity`, `questionBank.controller.ts:665`).
- Scope and depth checks on report cards, manual assessments and proctoring. Report-card approve and publish become separate capabilities.
- Insights: `results.*`, `assessments.completion`, `report_cards.progress`, `proctoring.violations_rate`.
- Retire the local roles tables and the Roles & Permissions page. Drop `users.role` and JWT `role` after the soak.
- Extend `server/src/tests/roles.integration.spec.ts` with persona fixtures (run with `--runInBand`).

### Phase 6 — D&A adoption (≈1.5 weeks)

- Manifest with consolidated keys, including the sanction ladder capabilities.
- `authMiddleware` reads the snapshot, which removes the stale-role-in-JWT problem.
- Target checks on marking, excuse review and discipline mutations. `scopeFor` on every list, stats and report route.
- Notifications route to `GET /access/holders` recipients instead of `'all'`. Retire the raw-INSERT notification writers and the duplicate excuse-decision notice.
- Client: replace `allowedRoles`, `roles:` and inline role checks with `<Can>` / `can()`.
- Insights: `attendance.*`, `excuses.turnaround`, `discipline.*`, `staff.register_completion`.
- Optional 6b: a parent view of the children's attendance and conduct.

### Phase 7 — Tupo adoption (≈1.5 weeks)

- Manifest (62 keys), and snapshot ingestion in `apps/api/src/routes/sso.ts`. Retire `resolveMisRole`, `readAcademic`, `seedRbac`, `SYSTEM_ROLES` and the RolesPermissions admin page.
- Dashboard scope via `scopeFor('DASHBOARD_VIEW')`. This fixes the class-teacher programme leak and removes the `USERS_MANAGE` / `role==='admin'` shortcuts.
- **Contact policy from grants** (default **deny** for student-initiated contact outside their teachers, mentors and classmates). Parents may contact their children's teachers. Applied to DMs, channel member adds, mentions and search (SRS FR-USR-6, SEC-Z1–Z3).
- Bulk mail and announce audiences are limited to `scopeFor(MAIL_BULK_SEND)`. The approver pool is computed from holders, excluding the sender.
- Oversight is a restricted `sensitive` capability, with a justification on each session and a weekly digest to holders of `SANCTION_SUSPEND_APPROVE`-level leadership (the Head).
- Insights: `engagement.active_rate`, `comms.parent_mail_response_time`, `safety.reports_count`.

### Phase 8 — NGA configuration & UAT (≈1 week, with leadership)

- **Workshop:** enter the departments and subjects, appoint positions (§12), tune the preset depths, decide `MIN_COHORT`.
- **Persona UAT per app:** "log in as X → you see Y, you don't see Z". Leadership signs off each preset.

### Phase 9 — Cut-over & clean-up (≈0.5 week + 2-week soak)

- `ACCESS_ENFORCE` per app in this order: D&A → Task Mentor → Tupo → MIS open-route tightening.
- After the soak, remove the aliases still in use (Access Studio's Apps screen lists them), stop the `UserRole` mirror, and drop the legacy role columns.

**Total:** ≈ 13–14 engineer-weeks, plus UAT and the soak. That is about 2 weeks more than v1, mainly for Access Studio and Insights. It is recovered many times over because role changes no longer require developers.

---

## 12. NGA initial configuration (to confirm in the Phase 8 workshop)

| Grant | Node | Holder | Source |
|---|---|---|---|
| Head Teacher | School | *(to confirm)* | manual |
| Deputy Head — Academics | School | *(to confirm)* | manual |
| Deputy Head — Discipline | School | *(to confirm)* | manual (needed before D&A sanction ladder goes live) |
| Director of Studies | Nursery+Primary · Lower Sec+IGCSE · AS/A Level (one grant per programme node) | *(to confirm)* | manual |
| Programme Coordinator | Coding Academy | current PROGRAM_MANAGER (user 19), title "NGA SPES Program Coordinator" | rule (`UserProgramLead`) |
| Head of Department | Sciences · Mathematics · Languages · Humanities · ICT/TVET · Arts & PE | *(to confirm)* | manual; needs departments + full subject list loaded (only TVET modules exist today) |
| Class Teacher / Subject Teacher / Mentor | per placement | existing rows (e.g. user 20 → Coding A) | rules |
| School Administrator | School | *(to confirm)* | manual — **no academic data by default** |
| Academic Insights Viewer | School or a programme | *(leadership decides — e.g. School Administrator, Board liaison)* | manual, optional expiry |
| Bursar, Registrar, Counsellor, Safeguarding Lead, Comms Officer, IT Support | School | *(to confirm)* | manual |

---

## 13. Testing, rollout & safety

- **Shadow mode.** Each app gets two flags:
  - `ACCESS_SHADOW=true`: v1 and v2 decide side by side. Differences go to `access_shadow_diff` (user, route, capability, target, v1, v2), with a daily digest in Access Studio.
  - `ACCESS_ENFORCE=true`: switches the decision to v2.
  - Every intended tightening is published in release notes and signed off before enforcement. Example: teachers lose school-wide discipline detail.
- **Shared decision table.** One fixture school:
  - 2 programmes, 1 department, 3 classes, ≥ 6 students per class (to exercise suppression).
  - Personas: Head, DOS-Primary, HOD, DOD, a Class-Teacher-plus-IGCSE-Subject-Teacher (the non-pooling case), School Admin with and without Insights Viewer, Counsellor, Student, Parent, an expired acting head.
  - The table runs against MIS `policy.ts`, the SDK, and each app's integration suite:

    | App | Framework / file |
    |---|---|
    | MIS | vitest |
    | Task Mentor | jest `--runInBand` |
    | D&A | jest |
    | Tupo | vitest `apps/api/src/__tests__/access.test.ts` |

- **Insights tests:**
  - Summary endpoints never return student-level rows.
  - `groupBy=STUDENT` without detail → 403.
  - Cohorts below `MIN_COHORT` are suppressed.
  - Exports respect depth.
- **Regression:** all existing suites stay green (D&A 171 tests, Tupo 235 api tests, MIS, Task Mentor).
- **Safeguards:**
  - Break-glass for the Platform Owner via time-boxed restricted grants.
  - The lock-out guard (§5.4).
  - MIS outage: apps use the last snapshot for up to 24h, read-only for approval-type actions, then fail closed.
  - Snapshots carry ids and capability keys only; no personal data.

---

## 14. Risks & open decisions

| # | Decision / risk | Recommendation |
|---|---|---|
| 1 | Build vs adopt a policy engine (OpenFGA / Cedar / Casbin) | **Build the small in-house compiler + SDK.** The hierarchy is shallow and NGA-sized; an external engine adds a service to operate across 4 stacks. The grant/relationship model is compatible with OpenFGA if scale ever demands it |
| 2 | Leadership misconfigures a role | Role version history + "reset to preset" + simulator + "affects N people" preview before save |
| 3 | `MIN_COHORT` value | Default 5; small classes (Coding Academy has 2–13 students) will show many suppressed cells at summary depth — leadership may choose 3 |
| 4 | Parents in Task Mentor / D&A | D&A children view in Phase 6b; Task Mentor report-card view later — both are just preset edits once the UI exists |
| 5 | Boarding (Patron/Matron) and multi-campus | Add `HOUSE` / `CAMPUS` node types when needed — schema, expansion function and picker only; no app changes |
| 6 | Manifest publish failure on deploy | Apps keep working (snapshot uses the last known registry); CI step fails loudly; Access Studio flags unregistered keys seen in `access_shadow_diff` |
| 7 | Curriculum data is thin | Load real subjects/classes before DOS/HOD/insights are meaningful (Phase 8 dependency) |

---

## 15. Deliverables checklist

- [ ] Phase 0 security/hygiene fixes (4 repos)
- [ ] Registry & model migrations, MIS manifest, presets + rules seed, backfill + reconciliation report
- [ ] Policy compiler, rule engine, delegation checks, `/access/*` endpoints, `access_version`, SSO entitlement
- [ ] `@nga/access` SDK (server + React + SQL adapters + insights helpers) with the shared decision table
- [ ] Access Studio (roles, positions/org chart, rules, departments, explorer/simulator, preview-as, reviews, audit, apps)
- [ ] Insights contract + MIS Insights hub + MIS metrics
- [ ] Task Mentor, D&A, Tupo: manifest, snapshot/SDK adoption, scope + depth checks, insights endpoints, local RBAC retired
- [ ] Shadow-diff logging, persona decision tables in all suites, UAT sign-off
- [ ] NGA structure configured by leadership; legacy role fields removed after soak

---

## 16. Implementation status and deviations (updated 2026-09-27)

Branch `feat/access-control-v2` in all four repos, not yet merged. Every behaviour change is additive, or sits behind `ACCESS_V2_*` flags whose defaults leave today's access unchanged.

### 16.1 Done and tested in Central MIS

| Phase | What exists | Tests |
|---|---|---|
| 0 | One permission resolver (`utils/auth.ts getEffectivePermissions`) for the middleware, `/users/me`, login and the SSO token. SSO token has `iss` / `aud`, refuses inactive users, accepts bcrypt-hashed client secrets (`scripts/hash-sso-client-secrets.ts`, opt-in). Migration 089. | `accessPhase0Hygiene` (11) |
| 1 | Migration 090 (additive): registry columns, `AccessGrant`, `AccessRule`, `Department(Subject)`, `AccessAudit`, `AccessManifest`, `AccessPresetLink`, `User.access_version`. MIS manifest (`access/manifest.ts`), presets (`access/presets*.ts`), default rules, rule engine, legacy backfill (`node dist/access/cli.js backfill [--apply]`), insert-only boot bootstrap. | `accessPhase1Model` (16), `accessPresets` (5), `accessCore` (37) |
| 2 | Snapshot compiler and cache, `authorizeIn` / `requireCapability`, shadow-diff logging (migration 091), delegation rules, grant lifecycle, role / rule / department admin, holders API, manifest publish API, `/auth/verify` → `access_version`, placement hooks on every class-teacher / subject / programme-lead / mentor / parent / user / structure write, node-deletion clean-up, daily reconcile. | `accessPhase2Engine` (23), `accessPhase2Hooks` (6) |
| 3 | Frontend: `useAccess()` (v2 snapshot), Leadership & Access (Access Studio) at `/access-studio`, with Structure, Positions, Roles (editor with read depth), Auto-assignment, Departments, Explorer (preview and "can X do Y here?") and Audit (with shadow-difference review) tabs; sidebar entries gated by v2 capabilities. | `AccessStudio` (4) |
| 4 | MIS insight metrics (`curriculum.sow_validation`, `teaching.lesson_reports`, `elearning.progress`) with node and viewer-scope filtering, grouping no finer than class, and cohort suppression (`ACCESS_MIN_COHORT`, default 5); widget listing across all apps' manifests; Insights page `/insights` with drill-down. | `accessPhase4Insights` (4), `InsightsHub` (2) |

The shared core is `packages/access`: source, the decision table, `sync.mjs` and the integration README. The MIS test suite fails if its vendored copy drifts from the source.

### 16.2 Done in the other apps

**Phase 0 (all three apps):**
- SSO `state` is checked.
- Task Mentor's live proctoring socket uses signed tickets, and its CORS is restricted.
- Tupo keeps `users.role` in sync (migration `0027`), its socket honours suspension and `MESSAGE_SEND`, and mail self-approval is blocked.

**Phases 5–7 (shadow by default, enforce behind `ACCESS_V2_MODE=enforce`):**

| App | Adopted | Tests |
|---|---|---|
| Task Mentor (`tm`) | Snapshot client, shadow diffs (migration `20260927120100`), `REPORT_CARDS_COMMENT` / `PUBLISH` keys (`20260927120000`), scoped report cards / proctoring / manual assessments / `getScopedSubjects`, publish script plus a non-fatal deploy step, `GET /api/access/me` | server 207/207 (75 new); live-server 34/34; client 133 pass + 6 failures that were already there |
| D&A (`da`) | Snapshot client, shadow diffs, scoped register marking / excuse review / discipline detail and status / list filtering, sanction ladder (`DISCIPLINE_SANCTION_*`, `SUSPEND_*`), notifications routed to holders (enforce), publish script plus a non-fatal deploy step | server 250/250 (69 new) |
| Tupo (`tupo`) | Snapshot client, shadow diffs and contact columns (migration `0028`), v2 dashboard scope with summary vs detail panels, a contact-policy engine, restricted oversight with audit forwarding to MIS, a mail-approver pool, publish step. Class-teacher dashboard privacy fix (applies in every mode). | api 359/360 (the one failure, `feed.test` "team member title", predates this work) |

Core 1.2.0 is vendored in all 8 consumers:
- **1.1:** `Target.anySubject` lets a subject teacher's pair cover a student of that class when no subject is in context (conduct, excuses). Whole-class actions don't use it.
- **1.2:** `snapshot.user.class_groups` holds a student's own class groups, or a parent's children's, so Tupo's contact policy can match teachers and classmates. MIS refreshes it through `touchLearners` on every student placement write.

### 16.3 Deviations from the plan (deliberate)

1. **MIS permission names are unprefixed.** They are not renamed to `mis:NAME`, so every existing `authorize()` call and the SSO `permissions` array stay untouched. Only the other apps' capabilities are namespaced (`tm:`, `da:`, `tupo:`).
2. **Legacy outputs never include v2 names.** `req.user.permissions`, `/users/me` and the SSO token exclude v2-only capabilities and any name containing `:`. The apps still derive roles by keyword matching on that list (e.g. `tm:DASHBOARD_VIEW_ADMIN` contains "ADMIN"), and nobody's current access may change before cut-over. v2 features read the snapshot.
3. **Held roles only gain v2-only capabilities.** A preset mapped onto a role people already hold never gains legacy MIS permissions; a role nobody holds gets its full bundle. Nothing is ever removed.
4. **Legacy role names are kept.** A preset mapped to a legacy role keeps the legacy name (`SUPER_ADMIN`, `TEACHER`, `CLASS_TEACHER`...), because code keys off those names; they cannot be renamed in Studio.
5. **The legacy Roles & Permissions screen manages legacy permissions only.** Saves are applied as a diff, so read depths and v2 capabilities on a role survive a legacy save. Before this, it deleted and re-inserted every link.
6. **SUPER_ADMIN keeps the code catalog.** It is not seeded with "every permission": that would put the teacher dashboard and teacher pages in front of super admins. The resolver takes the union of the code catalog and the DB grants instead.
7. **SSO tokens keep one audience.** They are not audience-restricted on the MIS API: every app calls MIS APIs with the user's SSO token. `aud` records the client for traceability.
8. **Class-teacher write access waits for enforce mode.** Plan 0.2 (removing `MANAGE_ACADEMICS` from `CLASS_TEACHER`) now happens through enforce mode on the converted routes, not by editing the role, which would break today's class-teacher screens.
9. **Delegation exempts the platform owner.** The rule "grant only what you hold" does not apply to the platform owner, which is how operations roles (Bursar, Registrar, IT) get appointed. The Head Teacher preset was widened (timetable, subject materials, question-bank curation) so every intended appointment chain works; `accessPresets.test.ts` checks this.
10. **Ops and restricted roles are appointed by the platform owner.** The Head Teacher cannot appoint the Bursar, Registrar, IT Support or Safeguarding Lead: they hold capabilities the Head does not. The platform owner appoints them.

### 16.4 Still to do

**Decide or clean before switching any app to `enforce`:**
- **Task Mentor `ReportCard.student_id`:** it mixes local and MIS ids (`saveSubjectMapping` writes MIS roster ids). The dev DB also lacks `QUIZZES_MANAGE_ANY` / `QUESTION_BANK_MANAGE_ANY`, although their migration is marked as applied.
- **Tupo contact policy:** a parent whose child has never signed in to Tupo still has no class groups (the loader uses the children's rows). Check the `contact:*` shadow differences before enforcing.
- **Tupo, not yet covered:** the realtime gateway's sends and mentions, the files-service oversight preview, and scoping of the bulk-mail audience.
- **D&A:** `DISCIPLINE_SUSPEND_RECOMMEND` is declared, but there is no recommend flow. `/reports/overview`, termly and annual reporting are still "held anywhere".
- **UI:** the apps' UIs still gate on their local permissions. Move them to their `useAccess` hooks before enforcing, or menus will show and then refuse.

**Other:**

- **Apps:** insights endpoints in each app. The hub already lists their widgets and shows "available once that app serves its insights".
- **MIS routes to convert to `authorizeIn`:** the currently open ones (`GET /users/:id`, `/users/search`, ...) and the `MANAGE_ACADEMICS` catch-alls. This is shadow-only until reviewed.
- **Studio additions:** the user-profile Access tab, the termly certification campaign screen (per-grant *Certify* already exists), and an "Apps" tab listing manifests and deprecated keys.
- **MIS app switcher (`SystemsMenu.tsx`):** it opens an app with its own random `state`. It should open the app's own login start instead, so the apps can make the `state` check strict.
- **Phase 8:** configure NGA's structure and UAT. **Phase 9:** cut-over and legacy clean-up.

### 16.5 Production runbook (MIS)

1. **Apply the migrations before deploying the code.** Pipe `089`, `090` and `091` into mysql, as for every MIS migration. The code tolerates a missing 090/091 (the engine stays off, `/access` answers 503, `/auth/verify` omits `access_version`), but the access features need them.
2. **Bootstrap.** Deploy; bootstrap runs on boot (insert-only). Or run `node dist/access/cli.js bootstrap`.
3. **Backfill.** Run `node dist/access/cli.js backfill` (dry run), read the "needsAttention" list, then run it again with `--apply`.
4. **Watch shadow mode.** `ACCESS_V2_MIS_MODE` defaults to `shadow`. Review `/access-studio` → Audit → differences for at least a week before setting it to `enforce`.
5. **Apps:** apply the migrations (Task Mentor `20260927120000` and `…120100`; Tupo `0027` and `0028`; D&A creates its table on boot). Each deploy publishes the app's manifest, and a failed publish never fails the deploy. Apps stay in `shadow` until leadership has reviewed the differences.
6. **Optional:** hash the SSO client secrets with `npx ts-node scripts/hash-sso-client-secrets.ts --apply` (locally against prod credentials, or via a compiled copy).

| Env var | Effect |
|---|---|
| `ACCESS_V2_BOOTSTRAP=false` | Disables the bootstrap and the placement hooks |
| `ACCESS_MIN_COHORT` | Cohort floor for summaries (default 5) |
| `ACCESS_APP_CLIENTS` | App ↔ SSO client mapping |

### 16.6 Local migration and deep testing (2026-09-27)

**Backups.** Taken before migrating, in `nga-mis-full/backups/pre-access-v2-20260927_024337/`: the MIS and Task Mentor MySQL dumps, the Tupo `pg_dump` (pg17) and the D&A SQLite file.

**Local databases migrated:**

| App | What was applied |
|---|---|
| MIS | 089, 090, 091; bootstrap; backfill `--apply`. Result: 33 active grants: 2 platform (super admins) and 31 from rules, i.e. teachers → subject-in-class, class teacher 20 → class 9, programme lead 19 → programme 8, mentors, parents, personas. |
| Task Mentor | `20260927120000` and `20260927120100`. Local `.env` gained `NGA_MIS_BASE_URL` / `SSO_CLIENT_*`. |
| Tupo | `0027`, `0028` |
| D&A | Its table is created on boot. |

All three apps published their manifests to the local MIS (tm 70, da 36, tupo 67 capabilities; 464 preset links).

**Deeper tests:**
- `accessSecurity.test.ts` (13 tests):
  - Escalation and leak attempts over HTTP.
  - A randomized cross-check of the decision core: 3,000 cases against an independent reference.
  - A performance bound.
  - Each security fix was mutation-checked: the test fails when the fix is removed.
- `scripts/access-e2e-access.cjs`: 47 checks against the four live local services and the real dev data.
  - MIS snapshots per app.
  - Real SSO login into each app.
  - Each app serving the same snapshot as MIS.
  - Shadow mode live.
  - Insights.
  - An Access Studio round trip.
  - A version bump between two runs, checking that apps refresh at sign-in.
- `scripts/access-ui-smoke.cjs`: 17 headless-browser checks of Access Studio and Insights for the platform owner, the programme lead and a student, plus a screenshot review.

**Found and fixed along the way:**
1. **Leaked client secrets.** `/users/me`, the login responses and the SSO token payload contained every SSO client's `client_secret`. They now use `getPublicSystems()`.
2. **Platform grants.** A school-wide manager could end or suspend the platform owner's grant.
3. **Grants list.** `GET /access/grants` showed a programme DOS every grant in the school, justifications included.
4. **Explain.** `GET /access/explain` for another user only needed Studio access; it now needs the (audited) preview permission.
5. **Holders not refreshed.** Preset seeding that added capabilities did not bump the holders' `access_version`.
6. **Stale snapshot at sign-in.** Apps could serve a stale snapshot right after sign-in. `/sso/token` now returns `access_version`, and each app drops its cached snapshot at login.
7. **Missing Task Mentor viewing rights.** Shadow mode on real data showed a class teacher with a STAFF profile losing Task Mentor quiz and assignment viewing; the Class Teacher preset now includes it.
8. **UI.** Dark-mode contrast in the role editor, raw node ids in the Insights breadcrumb, and one compact list instead of many placeholder cards.

**Final results (each suite run on its own):**

| Suite | Result |
|---|---|
| MIS backend | 570/573. The 3 failures are the known `registrationNumberRegenerate` ordering flake. |
| MIS frontend | 437/437 |
| Task Mentor | 207/207 |
| D&A | 250/250 |
| Tupo | 359/360. The one failure is in `feed.test`, which was failing before this work. |

Running all the suites in parallel on one machine adds timeout flakes in Tupo, D&A and Task Mentor. Run them one at a time.

### 16.7 UI/UX principles audit and fixes (2026-09-27)

**Audit.** `backend/scripts/access-ux/ux-audit.cjs` covers every Studio tab, both dialogs, the denied state and Insights (13 states), each in light and dark and at 1366, 768 and 390 px. Checks:
- axe WCAG 2.1 A/AA and best-practice rules
- page overflow
- clipped text
- keyboard behaviour: the tabs pattern and dialog focus / Escape

**Results.**

| Stage | Findings |
|---|---|
| First run | 139 |
| After fixes | 0 |

`backend/scripts/access-ux/ui-flows.cjs` drives six real workflows in the browser: 22/22 pass.

**Fixed:**

*Accessibility*
- **Contrast:** secondary text now meets AA in both themes (slate-600 / slate-300). The dark-mode sidebar labels were at 4.24:1 and now pass.
- **Dialog labels:** the Assign dialog's labels were black on dark (1.1:1).
- **Shared `Modal`**, affecting every dialog in the MIS: it is now `role="dialog"`, `aria-modal` and labelled; Escape closes it; focus moves in on open and back on close; the close button has a name.
- **Tabs:** full WAI-ARIA tabs (`tablist` / `tab` / `tabpanel`, a single Tab stop, arrow / Home / End keys, visible focus).
- **Structure:** the heading order is correct (the page h1, then h2 sections).
- **Names:** every control, filter and icon button has an accessible name; the tables have captions, scoped headers and a named actions column; the scroll region can be reached by keyboard.

*Layout*
- **Phones:** positions are cards instead of a 7-column table, with a gutter on narrow screens and no clipped text.

*Safety and feedback*
- **Risky actions:** `window.prompt` is replaced by a themed confirmation that states the consequence and requires a reason (validated inline, recorded in the audit).
- **Role editor:**
  - Save stays disabled until something changes.
  - The footer says how many people a save affects.
  - Leaving with unsaved edits uses the app's `ConfirmDialog` ("Discard your changes?" / "Keep editing").

*Information design*
- **Structure tab:** key school posts are shown even when vacant. "Platform administration" is separate from school leadership. Missing leads read "No programme lead yet" or "No class teacher".
- **Positions list:** personal baselines (own records, mentees, children) are hidden behind a counted toggle; the list pages 25 at a time; the school year is shown, so repeated assignments across years don't look like duplicates.
- **Insights:** the breadcrumb uses names; widgets the other apps have not served yet are grouped into one list instead of many placeholder cards.

**Test results after these changes** (each suite run on its own):

| Suite | Result |
|---|---|
| MIS backend | 593/596. The 3 failures are the known `registrationNumberRegenerate` ordering flake. |
| MIS frontend | 462/462, and it builds |
| Task Mentor | 223/223. One live-ticket test is intermittent; it passed on rerun. |
| D&A | 264/264 |
| Tupo | 378/379. The one failure is in `feed.test`, which was failing before this work. |
