# Unified Home (Cross-Module Overview) — Implementation Plan (v2, RBAC-aligned)

**Revised:** 2026-09-27 (v1: 2026-09-25)
**Scope:** Central MIS (`nga_central_mis`) plus one read-only summary endpoint in each satellite (`nga-task-mentor`, `nga-discipline-attendance`, `nga-communication-module` / Tupo).
**Audience:** developers and Claude Code sessions implementing it. Paths are relative to `/Users/m2pro/dev/projects/nga-mis-full/`.
**Depends on:** [`ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md`](./ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md) (hereafter **RBAC**), which is being developed in parallel. Every "who sees what" rule in this plan is expressed in RBAC terms: **capability × scope node × depth**.
**Builds on:** the Teacher Dashboard (`/teacher-dashboard`, `teacherOverviewController.ts`, `teacher/urgency.ts`), the e-learning learner queue, and the D&A calendar-first schedule endpoints.

> **Status check (2026-09-27):** RBAC is still plan-only. There is no `AccessGrant` table, no `@nga/access` package and no manifest in any repo, and the latest MIS migration is `088`. This plan is therefore sequenced against RBAC phases (§10), and it only uses today's permission model behind one adapter that is deleted when RBAC Phase 2 lands.

---

## 0. What changed from v1, and why

| v1 (2026-09-25) | v2 (RBAC-aligned) |
|---|---|
| User levels detected from permission names plus placement tables (`UserGrade`, `UserProgramLead`) | **Lenses = the viewer's grant nodes** from the RBAC snapshot (`SELF`, `SUBJECT_CLASS`, `CLASS_GROUP`, `GRADE`, `DEPARTMENT`, `PROGRAM`, `SCHOOL`, `MENTEES`, `CHILDREN`, `PLATFORM`). There are no role names anywhere in Home |
| Signal catalog organised by persona (student / teacher / class teacher / lead / admin) | Every signal declares **the capability, minimum depth and node type** it needs. A preset such as "Class Teacher" or "Director of Studies" sees a signal only because its role holds that capability at a covering node, so editing a role in Access Studio changes Home with no deploy |
| Admins saw attendance, report-card and approval items by being "admin" | **School Administrator gets no marks or discipline items by default** (RBAC §10). With the *Academic Insights Viewer* add-on they get **summary tiles only** (no names, small cohorts suppressed) that link to `/insights/:node` |
| Items could list student names for any staff lens | **Depth rule:** an item that names students needs `detail` at that node. At `summary` it collapses to a suppressed count. Home never shows `sensitive` content |
| Satellites verified the MIS bearer via `/users/me` and re-derived lenses from placement | Satellites authenticate a **federated read token** (audience-bound, short-lived) and decide with the **`@nga/access` SDK** (`scopeFor`, `depthAt`) against their own snapshot. No MIS token is forwarded, and no role guessing happens |
| Home tiles were bespoke queries | **Tiles are Insights metrics** (RBAC §8.2 `GET /api/insights/:metric`). The MIS metrics Home needs are built once, shared with the Insights hub |
| The satellite list and URLs came from a new `System.api_base_url` migration | They come from **`snapshot.systems`** (entitlement) plus each app's **manifest** (`endpoints.api`, `home` block). Migration 089 is dropped |
| Hardcoded "who approves" lists | Approval queues come from **workflow step capabilities** (RBAC §10): "awaiting *your* step" means you hold the next step's capability at a node covering the item |
| No explanation of why an item is shown | Every item carries `via` grant ids, so there is a **"Why am I seeing this?"** popover: "Because you are *Class Teacher — G7-A*" (RBAC `explain`) |
| — | New lenses: **Department** (HOD), **Mentees**, **Children** (parents), **Platform**. New item family: **access governance** (reviews to certify, grants expiring, vacancies) |

**Why:** Home is the first page every user sees. If it had its own access logic, it would become the fourth duplicated role model RBAC is trying to remove. In v2, Home only *consumes* RBAC decisions.

---

## 1. Problem & outcome

**Today:**
- After login everyone lands on `/dashboard` (`frontend/src/App.tsx:70`, `:116`), and what they see depends on one permission check (`App.tsx:135-167`).
- To find out what is overdue, late, missing, unread or waiting on them, users open every MIS module, then Task Mentor, D&A and Tupo, one at a time.

**Outcome:** **Home** (`/home`) is the post-login page for every user. It answers, in this order:

1. **What needs me now?** One ranked list of actionable items from every module and app, each with a reason, a source, and one action.
2. **What does my day look like?** Today's timetable, with cross-app status on each lesson (register, plan, report).
3. **How are my areas doing?** Up to four headline tiles per lens (Insights metrics at the viewer's depth), plus messages, meetings and updates.

**Relationship to the other two "dashboards" RBAC and v1 define:**

| Page | Question it answers | Who |
|---|---|---|
| **`/home`** (this plan) | "What do I need to do, and what's happening today?" Action-first, all lenses, one page | everyone; **post-login landing** |
| **`/insights/:node`** (RBAC §8) | "How is this school / programme / grade / class doing?" Analytics with drill-down by depth | holders of any insight capability |
| **`/teacher-dashboard`** | Deep teaching analytics (coverage charts, weekly load) | teaching lens |

Home's tiles deep-link into Insights at the same node, and its Teaching lens links "Full teaching board →". Home never re-implements either.

**Success targets (UAT):**

| Target | Measure |
|---|---|
| Zero-hunt | 90 % of "what's outstanding" questions answered without leaving Home (5 users per preset) |
| Fast | Home is usable (skeleton plus MIS data) in ≤ 1.5 s p95; satellite panels arrive in ≤ 3 s p95; the page never blocks on a satellite |
| Honest | Every item says why it matters, where it came from, and **which of your positions put it there**; no duplicates |
| Calm | At most one banner; red only for `blocking`; empty state reads "You're all caught up" |
| Correct access | Home shows nothing the RBAC decision table denies. This is proven by running RBAC's persona fixture school (RBAC §13) against Home (§11) |

---

## 2. Analysis — data sources (unchanged facts, RBAC-annotated)

Legend:
- ✅ the source exists
- 🔧 it exists but needs work
- ➕ must be built
- **R*n*** the issue is fixed by RBAC Phase *n*, so Home does not fix it separately

### 2.1 Central MIS (`nga_central_mis/backend/src`)

| Module | Signal | Status | Source |
|---|---|---|---|
| Calendar | today's lessons, current and next lesson, next teaching day, activities | ✅ | `calendarController.ts` `loadTeacherLessons` (L247), `loadAssignedActivities` (L1297) |
| Calendar | student timetable | 🔧 inline in `getStudentCalendar` (L1914); extract `loadStudentLessons` | |
| Scheme of work | missing, empty, rejected, behind | ✅ | `services/teacherSchemes.ts` `loadSchemeStatus` (L91) |
| Scheme of work | awaiting review / validation | ➕ grouped count query; the step capabilities are `mis:SOW_REVIEW` / `mis:SOW_VALIDATE` (RBAC §10) | `SchemeOfWorkEntry.validation_status` |
| Lesson plans / reports | no plan for a lesson; past lesson unreported | 🔧 inline in `getReportableLessons` (`lessonReportController.ts:49`); extract | |
| Lesson reports | rejected (own); approval queue | ➕ count on `LessonReport.validation_status` (indexed) | `schema.ts:1295` |
| Lesson reports | compliance, BEHIND flags, challenges | 🔧 `/reports/admin/*` ignore scope (**R2**: `authorizeIn` + `scopeFor`). Home uses Insights metric `teaching.lesson_reports` | |
| Mentorship | overdue mentees, follow-ups, NEW check-ins, mentor replies | ✅ | `mentorshipController.ts` `/students`, `/follow-ups` (L634), `/checkins/inbox` (L975), `/checkins/mine` |
| Lesson notes / e-learning | drafts, shared notes, overdue / due-soon items, continue | ✅ `summariseCourse` (`services/elearning/courseProgress.ts:326`). ⚠ never call `listMyLearningCourses` from Home: it writes (`publishDueSections`) and has N+1 queries | |
| Data quality | classes without a class teacher, subjects without a teacher, partial enrolment, unassigned students, students without a mentor | ✅ `getClassGroupsOverview` (`academicController.ts:6073`), `/academics/students/unassigned`, `/mentorship/admin/unassigned-students` | |
| Data quality | teachers with no assignment; class groups with no timetable | ➕ | |
| Notifications | inbox (document share and e-learning kinds only) | ✅ `Notification` + `/notifications` | `utils/notifications.ts` |
| Access governance | reviews to certify, grants expiring, vacancies, deprecated keys in use | ➕ (**R3**: Access Studio data) | `AccessGrant`, `AccessAudit`, `AccessManifest` |

### 2.2 Task Mentor (`nga-task-mentor/server/src`)

TM has no notifications table.

| Signal | Status | Source |
|---|---|---|
| Student: assignments overdue / due soon, not submitted | ✅ `getEnrolledAssignments` (`assignment.controller.ts:1070`). ⚠ `dashboard/student/*` leaks school-wide (**R5**) | |
| Student: quizzes open and closing | ✅ `/quizzes/available` (`quiz.controller.ts:965`) | |
| Student: results released | 🔧 `QuizSubmission.graded_at`; `Submission.updated_at` where `status='graded'` | |
| Teacher: grading queue | ✅ `/submissions/grouped?status=needs_grading`. `/quizzes/submissions/pending` is unscoped (**R5**) | |
| Teacher: flagged proctoring | 🔧 `ProctoringSession.status='flagged'` (7-day window; `reviewed` is never set) | |
| Report-card pipeline: marks to enter, comments, approve, publish | ✅ `ReportCard.status` plus the RBAC step capabilities `tm:MARKS_ENTER` → `tm:REPORT_CARDS_COMMENT` → `tm:REPORT_CARDS_APPROVE` → `tm:REPORT_CARDS_PUBLISH` | `reportCard.controller.ts` |

### 2.3 Discipline & Attendance (`nga-discipline-attendance/server/src`)

`users.id` is the MIS user id.

| Signal | Status | Source |
|---|---|---|
| Register missing for a started lesson / homeroom | ✅ `schedule.routes.ts` `SessionItem.status`. Compute from MIS-supplied lessons (§5.4) | |
| Excuses pending (scoped) | 🔧 school-wide today (**R6**: `scopeFor` on every list) | `routes/attendance.ts:949` |
| At-risk, absent-today, rate trends | ✅ `/reports/overview?scope=me`; school/programme rates become Insights metrics `attendance.*` (**R6**) | |
| Student: unexcused absences, rate, conduct balance | ✅ `/attendance/excuses/me/absences`, `/attendance/me`, `/discipline/term-balance/me` | |
| Sanction ladder queue (recommend → approve suspension) | ➕ (**R6** adds `da:SANCTION_*` capabilities) | |
| Staff late today | 🔧 `/staff/attendance`, count only | |
| Notifications | ✅ with `severity` + `link`. `'all'` broadcasts are replaced by holder-routed notifications (**R6**) | |

### 2.4 Tupo (`nga-communication-module/apps/api/src`)

| Signal | Status | Source |
|---|---|---|
| Chat unread + mentions | ✅ `chat.totalUnread` | `routes/chat.ts:898` |
| Mail unread | ✅ `mail.mailboxCounts().inbox` | `routes/mail.ts:43` |
| Meetings live / today | ✅ | `routes/meet.ts:234,367` |
| Announcements | 🔧 unread `feed.announcement` notifications | `packages/notify` |
| Bulk mail awaiting approval (approver ≠ sender) | 🔧 count query (self-approval block is **R0/R7**) | `packages/mail/src/campaigns.ts` |
| Moderation open | 🔧 count query | `packages/feed/src/moderation.ts:60` |

### 2.5 Constraints Home still owns

1. **MIS DB pool = 1 connection** (`backend/src/db/index.ts`). Batch queries in waves, cache per user **keyed by `access_version`**, give the endpoint its own 30 s client budget, and make every provider optional (see the 2026-09-22 teacher-dashboard incident).
2. **The shared axios client logs out on any 401** (`frontend/src/services/api.ts`). Satellite calls use their own axios instance.
3. **No shared current-term / week-of-term helper.** Extract one (H0).
4. **Time zone:** Home sends `date` + `tz=Africa/Kigali` to every provider.
5. **`/users/me` leaks every `System.client_secret`** (`userController.ts:520-523`, `db.select().from(System)`). RBAC Phase 0 hashes and rotates the secrets, but **does not list this response leak**, so it is added to RBAC Phase 0 by amendment **A2** (§12). Rotating without fixing the response would leak the new secrets too.

---

## 3. Access model for Home (how RBAC decides what appears)

### 3.1 Lenses = grant nodes

MIS compiles the lenses from the viewer's active grants: `AccessGrant` rows expanded by RBAC `compile.ts`. **Grants are never pooled** (RBAC principle 4). Each lens carries only the capabilities granted *at that node*.

| Lens key | From grants at | Default label (grant `title` wins when set) | Typical presets (RBAC §10) |
|---|---|---|---|
| `SELF` | SELF | "Me" | Student, Staff Member |
| `TEACHING` | all SUBJECT_CLASS grants, merged into one lens | "Teaching" | Subject Teacher (rule) |
| `CLASS_GROUP:c` | CLASS_GROUP c | "Class G7-A" | Class Teacher (rule) |
| `GRADE:g` | GRADE g | "Grade 7" | Discipline Lead, Class Teacher with no class group |
| `DEPARTMENT:d` | DEPARTMENT d | "Sciences department" | Head of Department |
| `PROGRAM:p` | PROGRAM p | "Primary programme" / "Director of Studies — Primary" | DOS, Programme Coordinator |
| `SCHOOL` | SCHOOL | "School" | Head, Deputies, School Administrator, Registrar, Counsellor, … |
| `MENTEES` | MENTEES | "My mentees" | Mentor (rule) |
| `CHILDREN` | CHILDREN | "My children" | Parent (rule), from phase H5 |
| `PLATFORM` | PLATFORM | "Platform" | Platform Owner, IT Support |

- **`TEACHING` is the one merge.** SUBJECT_CLASS grants are many, small, and belong to the same role, so they merge into a single lens. They still never pool with other lenses.
- **Lens order:** widest node first (SCHOOL → PROGRAM → DEPARTMENT → GRADE → CLASS_GROUP → TEACHING → MENTEES → CHILDREN → SELF).
- **Default lens:** `Everything`. `snapshot.home` (RBAC §7.1) preselects the lens on first visit (amendment **A1**).

**Worked examples (the RBAC fixture personas):**

| Viewer | Grants | Lenses shown |
|---|---|---|
| Class Teacher G7-A who also teaches IGCSE Physics | Class Teacher @CLASS_GROUP:7, Subject Teacher @SUBJECT_CLASS:31/12, Staff @SELF | Everything · Teaching · Class G7-A · Me. The IGCSE class gets **no** class-teacher items (non-pooling) |
| DOS Primary who teaches one IGCSE class | DOS @PROGRAM:1, Subject Teacher @SUBJECT_CLASS:… | Everything · DOS — Primary · Teaching · Me. **No** DOS items for IGCSE |
| School Administrator (default) | School Administrator @SCHOOL | Everything · School · Me. School items limited to structure, enrolment and accounts. **No** attendance, results or discipline |
| School Administrator + Academic Insights Viewer | … + Insights Viewer @SCHOOL | same lenses, plus **summary tiles** (attendance rate, results average, incidents per 100) linking to `/insights/SCHOOL`. **Still no named items** |
| Head Teacher | Head @SCHOOL | Everything · School · Me. Approvals: report cards, suspension approvals, bulk mail (not own), scheme validation |
| Counsellor | Counsellor @SCHOOL | School · Me. **Counts only** for referred cases (sensitive content never appears on Home) |
| Parent (H5) | Parent @CHILDREN | My children · Me |

### 3.2 Signal gating (the one rule)

A signal is computed for lens *L* only if:

```
viewer.can(signal.capability, L.node)                    // RBAC capability held at that node (via a grant AT that node)
AND (signal.kind == WRITE-queue OR depthAt(signal.capability, L.node) >= signal.minDepth)
```

Its rows are filtered with `scopeFor(signal.capability, depth)` intersected with `L.node`, so a query never sees rows outside the lens node.

**Depth → presentation** applies to Home items, tiles and updates:

| Depth held at node | Home may show | Home must not show |
|---|---|---|
| `summary` | counts, rates and trends at class level or above; `suppressSmallCohorts` applied (RBAC `MIN_COHORT`, default 5 → "<5") | student names, per-student rows, per-student entity chips |
| `detail` | the above, plus named entity chips ("Aline M. · 3 absences") within scope | restricted fields |
| `sensitive` | **counts of the holder's own queue only** ("2 referrals updated"). Opening goes to the audited reader in the owning app | any content, names or reasons. Nothing sensitive is rendered or cached on Home |

**Workflow queues** ("awaiting *your* step") need the **step capability** (WRITE) at a node covering the item. For example, P-01 "Schemes awaiting your validation" needs `mis:SOW_VALIDATE`, and a scheme appears only when its class group is inside the viewer's scope for that capability. RBAC `GET /access/holders?cap=&target=` is the inverse query, used by Home H4 for notifications. Staff names in workflow queues (a teacher's unsubmitted scheme) are fine at write-step level: they are records of the workflow, not student data.

**CTA gating:** a CTA is rendered only when `can(cta.requires, target)`, so Home never links to a 403. At summary depth, CTAs point to `/insights/:node`; at detail depth, they point to the record list.

### 3.3 One adapter until RBAC Phase 2

`backend/src/services/home/access.ts` exports one interface, which every Home provider uses:

```ts
export interface HomeAccess {
  version: number;                                       // access_version (legacy adapter: token_version)
  lenses(): HomeLens[];                                  // §3.1
  can(cap: string, node: NodeRef): boolean;
  depthAt(cap: string, node: NodeRef): Depth | null;
  scopeFor(cap: string, depth?: Depth): ScopeList | null;  // RBAC §7.2 shape
  via(cap: string, node: NodeRef): number[];             // grant ids, for "why am I seeing this"
}
```

- **`snapshotAccess` (target):** thin wrapper over RBAC `services/access/policy.ts` / `compile.ts`.
- **`legacyAccess` (temporary, H1 pilot only):** built from today's `permissions` + `resolveUserScope` + placements, mapping legacy permission names to `mis:<name>`.
  - It **must not** inherit "no placement rows = unrestricted". The `SCHOOL` lens needs an explicit admin permission (`MANAGE_USERS` / `VIEW_REPORTS` / `MANAGE_ACADEMICS`).
  - It returns no depth above `detail`.
  - It is deleted once RBAC Phase 2 is live.
- **Switching:** follow RBAC's flags (`ACCESS_SHADOW`, `ACCESS_ENFORCE`). In shadow, Home computes lenses and item ids with both adapters and writes differences to RBAC's `access_shadow_diff` (route `/home/overview`).

---

## 4. UX principles (senior UI/UX review)

These are unchanged from v1 except points 10–11.

1. **Triage, not wallpaper.** There are three tiers (code names from `urgency.ts`), with labels per audience:

   | Tier | Meaning | Staff label | Learner / parent label | Colour |
   |---|---|---|---|---|
   | `blocking` | someone is waiting, or a deadline has passed | **Needs you now** | **Overdue** | `STATUS.critical` |
   | `slipping` | the gap widens on its own | **Coming up** | **Due soon** | `STATUS.warning` |
   | `tidy` | nobody is waiting | **When you can** | **When you can** | neutral |

   The audience label comes from the lens: `SELF` items with learner capabilities and `CHILDREN` items use the learner/parent label.
2. **One hero, one primary action** ("Next up").
3. **Say why, name the thing** (names only at `detail`, §3.2). Every item shows a source badge and a single CTA verb.
4. **Progressive disclosure:** at most 5 rows per tier, at most 4 tiles per lens. Detail lives in the module or in Insights.
5. **Never block on a slow app.** Sections are independent; a satellite that is down is a muted row.
6. **The timetable stays on the first screen for anyone with the `TEACHING` lens.**
7. **No duplicates:** an item suppresses its matching notification.
8. **Calm by default:** one banner at most, and `prefers-reduced-motion` is honoured.
9. **Accessible:** WCAG 2.2 AA, targets ≥ 44 px, keyboard-navigable, `aria-live` count changes, colour never the only carrier.
10. **Explainable (new).** Each item has an ⓘ "Why am I seeing this?" popover built from `via`: "*Director of Studies — Primary* (granted by K. Mugisha, until 31 Dec)". It also shows "Not you? Ask whoever manages your access", linking to the grant's manager (RBAC §5.4).
11. **Access changes are visible (new).** When `access_version` changes, Home refetches, and an Update says "You now have *Class Teacher — G7-A*" or "*Acting Head Teacher* ended". A new lens briefly pulses once (not under reduced motion).

---

## 5. Information architecture

### 5.1 Layout

Desktop uses 12 columns; mobile is a single column in the numbered order.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ① Good morning, Aline            Thu 25 Sep · Term 1 · Week 6 of 13  ▓▓▓▓░░ │
│    ● MIS ● Task Mentor ● Attendance ○ Tupo (retrying)   Updated 08:42  ⟳    │
│ ② [ Everything | DOS — Primary | Teaching | Class G7-A | Me ]                │
├──────────────────────────────────────────────────────────────────────────────┤
│ ③ NEXT UP ─────────────────────────────────────────────────────────────────  │
│ ⛔ 2 registers not taken today — Maths · S3B (08:00), Physics · G7-A (09:40) │
│    Parents are notified of absences from the register.     [ Take register ] │
├───────────────────────────────────────────────┬──────────────────────────────┤
│ ④ NEEDS YOU                          7 · 3 · 4│ ⑥ AT A GLANCE (per lens)     │
│ ▸ Needs you now (3)                           │  Primary · attendance  94 %  │
│   ⛔ 2 registers missing   Attendance · ⓘ     │  Primary · SoW valid.  81 %  │
│   ⛔ 6 schemes to validate  MIS · DOS ⓘ       │  G7-A · present today 27/30  │
│   ⛔ 3 check-ins >2 days    Mentorship ⓘ      │  To grade               14   │
│ ▸ Coming up (3) …                             │         Open insights →      │
│ ▸ When you can (4)                 Show all ▾ ├──────────────────────────────┤
├───────────────────────────────────────────────┤ ⑦ MESSAGES & MEETINGS         │
│ ⑤ TODAY                                        │ ⑧ UPDATES                    │
│ 08:00 Maths S3B     Register ✗ Plan ✓ Report ✗│ ⑨ QUICK ACTIONS              │
│ ─── now 10:12 ───────────────────────────────  │ ⑩ YOUR APPS                  │
│ 11:00 Maths S2A     Plan ✗                    │                              │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

Sections: ① header with source health · ② lens switcher (shown only with 2+ non-`SELF` lenses; remembered in `localStorage` `home.lens`, try/catch) · ③ Next up · ④ Needs you (every row: tier icon, title, entity chips, why, source badge, lens chip in *Everything*, ⓘ) · ⑤ Today (`TEACHING` lens → own lessons with marks; learner caps at `SELF` → own timetable; hidden otherwise) · ⑥ At a glance (Insights metric tiles per lens, "Open insights →" to `/insights/<lens node>`) · ⑦ Messages & meetings (Tupo) · ⑧ Updates (merged, access-change updates included) · ⑨ Quick actions (≤ 4, each gated by `can`) · ⑩ Your apps (`snapshot.systems` only, with a per-app badge).

**Mobile order:** ① → ③ → ⑤ → ④ → ⑦ → ⑥ → ⑧ → ⑨ → ⑩.

### 5.2 States

| State | Behaviour |
|---|---|
| First load | Paint the last snapshot from `sessionStorage` (`home.snapshot.<userId>.<access_version>`; a version change discards it), show "Updating…", otherwise per-section skeletons |
| Refresh | MIS every 5 min, satellites every 2 min, visible tab only; refetch on focus if older than 60 s; manual ⟳. **Immediate refetch when `access_version` changes** (from the RBAC `/auth/verify` poll) |
| Satellite down / timeout | Muted row: "*Attendance* didn't respond · Retry · Open app ↗" |
| Satellite `provisioned:false` (Tupo user never logged in) | "Open Tupo once to connect it to Home" |
| App not entitled | The app is absent from `snapshot.systems`, so it is not called and not shown (RBAC §7.1) |
| Only `SELF` lens with no teaching or learner capabilities (new staff, grants pending) | Comms, updates and apps, plus a hint: "Your positions haven't been set up yet — ask *<manager of your node>*" |
| All clear | "You're all caught up ✨"; calm `Celebration` only on the > 0 → 0 transition |
| **Preview-as** (RBAC §9, `mis:ACCESS_PREVIEW_AS`) | `/home?as=<userId>` renders the target user's Home **read-only**: CTAs disabled, a banner "Previewing as …", audited. This is the main UAT tool for signing off presets |

---

## 6. Signal catalog (capability-gated)

**How to read the tables:**
- **Requires** is the capability at the lens node, with `@depth` for READ capabilities.
- Keys are **indicative**. Final keys come from each app's manifest (RBAC §6); legacy keys are shown namespaced, and manifest `aliases` resolve them.
- **Names?** says whether the entity chips can name students (`detail` only).
- Tier rules are the spec; the IDs are used as item `kind` and in tests.

### 6.1 `SELF` — learner capabilities

| ID | Item | Requires | Tier rule | Source | CTA |
|---|---|---|---|---|---|
| S-01 | Assignments overdue, not submitted | `tm:ASSIGNMENTS_SUBMIT` @SELF | blocking | TM enrolled assignments, `due_date < now`, no submission | Submit |
| S-02 | Assignments due ≤ 48 h | same | slipping | same | Open |
| S-03 | Quiz closing ≤ 24 h, not finished | `tm:QUIZZES_TAKE` @SELF | blocking ≤ 6 h, else slipping | TM available quizzes `end_date` | Start |
| S-04 | E-learning items overdue | `mis:VIEW_MY_COURSES` @SELF | blocking | `summariseCourse.overdue_count` | Continue |
| S-05 | E-learning due ≤ 7 d | same | slipping | `summariseCourse.due_soon[]` | Open |
| S-06 | Absences with no excuse yet | `da:EXCUSES_SUBMIT` @SELF | slipping (blocking once the excuse window closes, **Q1**) | D&A `/excuses/me/absences` `excuse===null` | Explain |
| S-07 | Attendance below threshold | `da:ATTENDANCE_VIEW` @SELF | slipping | D&A `/attendance/me` | My attendance |
| S-08 | Conduct balance < 70 | `da:DISCIPLINE_VIEW` @SELF | slipping | D&A `/discipline/term-balance/me` | My conduct |
| S-09 | Mentor replied to your check-in | `mis:SUBMIT_MENTEE_CHECKIN` @SELF | tidy (→ Updates once read) | `MenteeCheckIn.responded_at` | Read |

**Tiles:** Attendance % · Learning progress % · Assignments done n/m · Conduct.
**Updates:** results released, excuse decisions, shared notes, section published, announcements.

### 6.2 `SELF` — staff capabilities (everyone with a staff role)

| ID | Item | Requires | Tier rule | Source |
|---|---|---|---|---|
| M-01 | Unread mentions / DMs | `tupo:MESSAGE_READ` @SELF | slipping if mentions, else tidy | Tupo `/chat/unread` |
| M-02 | Meeting live now / starting ≤ 15 min | `tupo:MEET_JOIN` @SELF | blocking while live and invited | Tupo meet live/upcoming |
| M-03 | **Your grant ends in ≤ 14 days** (acting appointment) | any grant with `valid_until` | slipping | RBAC `AccessGrant.valid_until` (RBAC §5.4 banner, surfaced here) |
| M-04 | Staff clock-in not recorded today | `da:STAFF_CLOCK` @SELF | tidy | D&A staff attendance |

### 6.3 `TEACHING` (SUBJECT_CLASS grants)

**Today:** every lesson from `loadTeacherLessons` carries three marks:
- **Register**: D&A, computed per lesson with `can('da:ATTENDANCE_MARK', pair)`
- **Plan**: MIS `LO_Lesson`
- **Report**: MIS reportable occurrence

| ID | Item | Requires | Tier rule | Source | CTA |
|---|---|---|---|---|---|
| T-01 | Registers not taken for lessons that have started today | `da:ATTENDANCE_MARK` | **blocking** | D&A (§8.2, lessons supplied by MIS) | Take register |
| T-02 | Registers missing earlier this week | same | blocking | same, past days | Catch up |
| T-03 | Scheme sent back | `mis:SOW_EDIT` | blocking | `loadSchemeStatus` REJECTED | Revise |
| T-04 | Scheme not submitted | `mis:SOW_EDIT` | blocking if week ≥ 2, else slipping | `loadSchemeStatus` pending | Submit |
| T-05 | Lesson report rejected | `mis:SUBMIT_REPORTING` | blocking | ➕ `LessonReport` own REJECTED | Fix |
| T-06 | Marks not entered for closed assessments | `tm:MARKS_ENTER` | blocking if the report-card window closes ≤ 7 d, else slipping | TM manual assessments per pair | Enter marks |
| T-07 | Submissions to grade | `tm:SUBMISSIONS_GRADE` / `tm:QUIZZES_GRADE` | blocking if the oldest is > 7 d past due (**Q2**), else slipping | TM grouped submissions, `scopeFor` | Grade |
| T-08 | Past lessons unreported this week | `mis:SUBMIT_REPORTING` | slipping (blocking after 5 school days) | reportable PENDING | Report |
| T-09 | No plan for the next teaching day | `mis:SOW_EDIT` | slipping | occurrences with `lesson_id=null` | Plan |
| T-10 | Scheme empty / behind the calendar | `mis:SOW_EDIT` | slipping | existing rules | Plan |
| T-11 | Course unpublished | `mis:MANAGE_COURSE_CONTENT` | slipping | existing | Publish |
| T-14 | Proctoring sessions flagged (7 d) | `tm:PROCTORING_VIEW_SESSIONS` @detail | slipping | TM | Review |
| T-15 | Quiz closes ≤ 24 h with 0 submissions | `tm:QUIZZES_EDIT` | tidy | TM | Check |
| T-16 | Lesson notes in draft | `mis:MANAGE_LESSON_NOTES` | tidy | existing | Finish |

**Tiles:** Registers today n/m · Reports this week n/m · To grade · Scheme coverage.

### 6.4 `MENTEES`

| ID | Item | Requires | Tier rule | Source |
|---|---|---|---|---|
| E-01 | Check-ins unanswered | `mis:MENTEE_CHECKIN_RESPOND` | blocking if > 48 h waiting, else slipping | `/mentorship/checkins/inbox?status=NEW` |
| E-02 | Mentees overdue (> 21 d since last session) | `mis:MENTORSHIP_LOG` | slipping | `/mentorship/students` |
| E-03 | Open follow-ups | same | slipping | `/mentorship/follow-ups` |

Mentees are within the mentor's MENTEES scope at `detail` (RBAC §10), so names are allowed.

### 6.5 `CLASS_GROUP:c` (and `GRADE:g`, aggregated per class)

| ID | Item | Requires | Names? | Tier rule | Source |
|---|---|---|---|---|---|
| C-01 | Homeroom register not taken | `da:ATTENDANCE_MARK` (homeroom) | — | blocking after the homeroom period starts | D&A |
| C-02 | Excuses waiting for review | `da:EXCUSES_REVIEW` | yes (detail) | blocking if > 48 h, else slipping | D&A `scopeFor` |
| C-03 | Students below the attendance threshold | `da:ATTENDANCE_VIEW` | at detail; **count only at summary** | slipping | D&A |
| C-04 | Absent today without notice | `da:ATTENDANCE_VIEW` @detail | yes | slipping | D&A |
| C-05 | Conduct at risk / major incident this week | `da:DISCIPLINE_VIEW` | detail: names; summary: count | slipping | D&A |
| C-06 | Report cards needing your comment | `tm:REPORT_CARDS_COMMENT` | yes | blocking if the approval deadline ≤ 7 d, else slipping | TM report-card pipeline |
| C-07 | Students not enrolled in all class subjects | `mis:MANAGE_STUDENT_ENROLLMENTS` or `mis:VIEW_ACADEMICS` @detail | count + fix link | slipping | `getClassGroupsOverview` |
| C-08 | Class subjects with no teacher | `mis:VIEW_ACADEMICS` | — | slipping | same |
| C-09 | Students without a mentor | `mis:MANAGE_MENTOR_ASSIGNMENTS` | count | tidy | MIS |

**Tiles:** Present today · 14-day attendance with sparkline · At-risk (suppressed at summary) · Pending excuses.

### 6.6 `DEPARTMENT:d` (HOD)

| ID | Item | Requires | Tier rule | Source |
|---|---|---|---|---|
| D-01 | Schemes awaiting your review | `mis:SOW_REVIEW` | blocking if the oldest is > 5 school days (**Q3**), else slipping | ➕ scheme entries in the department's subjects × classes |
| D-02 | Assessments awaiting moderation | `tm:ASSESSMENTS_MODERATE` | slipping | TM |
| D-03 | Department subjects behind the calendar | `mis:SOW_REVIEW` | tidy | `loadSchemeStatus` over scope |

**Tiles:** Insights `curriculum.sow_validation`, `results.average` (if held) at `DEPARTMENT:d`.

### 6.7 `PROGRAM:p` (DOS, Programme Coordinator) and `SCHOOL` (Head, Deputies)

These are the same signals, each at its node. Every one is filtered by `scopeFor` ∩ node.

| ID | Item | Requires | Tier rule | Source |
|---|---|---|---|---|
| P-01 | Schemes awaiting your validation | `mis:SOW_VALIDATE` | blocking if > 5 school days (**Q3**), else slipping | ➕ grouped count |
| P-02 | Lesson reports awaiting approval | `mis:MANAGE_REPORTS` | blocking if > 5 d, else slipping | ➕ `LessonReport` PENDING |
| P-03 | Mentorship sessions awaiting approval | `mis:MANAGE_MENTOR_ASSIGNMENTS` | slipping | ➕ |
| P-04 | Teachers with schemes not submitted (week ≥ 2) | `mis:SOW_VALIDATE` | slipping; teacher names allowed (workflow record) | ➕ |
| P-05 | Report cards awaiting approval / publishing | `tm:REPORT_CARDS_APPROVE` / `tm:REPORT_CARDS_PUBLISH` | blocking if the term ends ≤ 14 d, else slipping | TM pipeline |
| P-06 | Suspension recommendations awaiting you | `da:SANCTION_SUSPEND_APPROVE` | **blocking** | D&A sanction ladder |
| P-07 | Bulk mail awaiting approval (not your own) | `tupo:MAIL_APPROVE` covering the audience | blocking | Tupo campaigns |
| P-08 | Classes without a class teacher / subjects without a teacher | `mis:MANAGE_ACADEMICS` or `mis:ACCESS_GRANTS_MANAGE` | slipping | `getClassGroupsOverview` ∩ node |
| P-09 | Registers missing across the node today | `da:ATTENDANCE_VIEW` @summary | slipping; blocking if ≥ 10 % of started lessons. **Class-level counts only** | D&A insight `staff.register_completion` |

**Tiles:** Insights metrics the viewer holds at this node, with `minDepth` summary. Examples: `attendance.rate`, `results.pass_rate`, `curriculum.sow_validation`, `teaching.lesson_reports`, `discipline.incidents`. **The tiles assemble themselves from grants**, exactly like the Insights hub: give someone "Discipline Insights" and a discipline tile appears.

### 6.8 `SCHOOL` — operations presets (School Administrator, Registrar, Bursar, Comms Officer)

| ID | Item | Requires | Tier rule | Source |
|---|---|---|---|---|
| O-01 | Students with no class group this year | `mis:ASSIGN_STUDENT_CLASS_GROUPS` | slipping | `/academics/students/unassigned` |
| O-02 | Teachers with no subject assignment | `mis:MANAGE_ACADEMICS` | slipping | ➕ |
| O-03 | Class groups with no timetable this term | `mis:MANAGE_ACADEMIC_CALENDAR` | slipping | ➕ |
| O-04 | Accounts pending activation / forced password change | `mis:MANAGE_USERS` | tidy | `User.status`, `force_password_change` |
| O-05 | Moderation reports open | `tupo:MODERATION_QUEUE_VIEW` | slipping | Tupo count |
| O-06 | Staff clocked in late today | `da:STAFF_ATTENDANCE_VIEW` @summary | tidy (count) | D&A |

The default School Administrator sees O-items only. No attendance, results or discipline appears unless their roles grant those capabilities (RBAC §10).

### 6.9 Access governance (holders of `mis:ACCESS_GRANTS_MANAGE` at the node)

| ID | Item | Requires | Tier rule | Source |
|---|---|---|---|---|
| G-01 | Access review: grants to certify | `mis:ACCESS_GRANTS_MANAGE` | blocking once the review is > 30 d old (RBAC §5.4), else slipping | `AccessGrant.last_certified_at` in the current review campaign |
| G-02 | Grants in your area ending ≤ 14 d | same | slipping | `valid_until` |
| G-03 | Vacant positions (roles with `max_holders` or expected holders at node, 0 active) | same | slipping | RBAC org chart |
| G-04 | Restricted grants missing justification or past max validity | `mis:ACCESS_GRANTS_RESTRICTED` | blocking | `AccessGrant.justification` / `valid_until` |
| G-05 | Placements without a grant (reconciliation) | `mis:ACCESS_GRANTS_MANAGE` @SCHOOL | tidy | rule engine reconcile report |

### 6.10 `PLATFORM` (Platform Owner, IT Support)

| ID | Item | Requires | Tier rule | Source |
|---|---|---|---|---|
| X-01 | App summary / insights endpoint failing > 15 min | `mis:MANAGE_SYSTEMS` | slipping | Home source-health log (H4) |
| X-02 | Integration tokens expiring ≤ 14 d | `mis:MANAGE_SYSTEMS` | slipping | `IntegrationToken.expires_at` |
| X-03 | Deprecated capability keys still used by roles | `mis:ACCESS_STUDIO_VIEW` | tidy | `AccessManifest` + `RolePermission` |
| X-04 | Shadow-mode differences today | `mis:ACCESS_STUDIO_VIEW` | slipping during rollout | `access_shadow_diff` digest |

The Platform Owner has **no content access** (RBAC §10 ¹), so their Home has no academic items unless break-glass is granted.

### 6.11 `CHILDREN` (Parent, phase H5, after RBAC 6b)

| ID | Item | Requires | Tier rule |
|---|---|---|---|
| F-01 | Child absent today / unexcused absence | `da:ATTENDANCE_VIEW` @CHILDREN | blocking the same day, then slipping |
| F-02 | Excuse you can submit | `da:EXCUSES_SUBMIT` @CHILDREN | slipping |
| F-03 | Report card published | `tm:REPORT_CARDS_VIEW` @CHILDREN | → Update |
| F-04 | Assignment overdue (child) | `tm:ASSIGNMENTS_VIEW` @CHILDREN | slipping |

---

## 7. Architecture

### 7.1 Flow

```
Browser (MIS SPA /home)
 ├─ GET  {MIS}/home/overview?date&tz                  ← MIS session; lenses + MIS items + tiles + today + app list
 ├─ GET  {MIS}/insights/:metric?node=… (MIS metrics)  ← via tiles, same contract as RBAC §8.2
 ├─ POST {MIS}/sso/federated-token {app}              ← one per entitled app with a `home` manifest block (A3), cached until exp-30 s
 ├─ POST {app}/api/integration/home-summary           ← Authorization: Bearer <federated token aud=app>
 ├─ GET  {app}/api/insights/:metric?node=…            ← same token; tiles for that app's metrics
 └─ existing MIS NotificationContext (45 s poll)
          ↓
   mergeHome(): normalise → dedupe → suppress → rank → group by tier and lens
```

The browser fans out, not the MIS backend, because:
- the single-connection MIS pool is never held by satellite latency;
- sources fail independently;
- it is **the same path the Insights hub uses** (RBAC §8.3), so both surfaces share one token mechanism, one client, and one cache.

### 7.2 Federated read token (shared with the Insights hub, amendment A3)

RBAC §8.3 says the hub fetches widgets "with the user's SSO token", but no satellite accepts an MIS token, and RBAC Phase 0 adds `aud` claims. The concrete mechanism both surfaces need:

```
POST /sso/federated-token   { app: "da" }         (MIS session required)
→ 200 { token, expires_at }  JWT: { iss:"mis", aud:"da", sub:<mis user_id>, v:<access_version>,
                                    scope:"read:home read:insights", exp: now+300s }
   403 not_entitled when app ∉ snapshot.systems
```

- The token is signed with the RBAC `SSO_JWT_SECRET` key material. **Recommendation:** asymmetric (EdDSA/RS256) with MIS `/.well-known/jwks.json`, so apps verify locally and hold no MIS secret.
- It is **read-only by scope**: apps accept it only on `/api/integration/*` and `/api/insights/*`.
- The app verifies `aud`, `exp` and `scope`, loads the snapshot for `(sub, v)` through the SDK's `fetchSnapshot` (cached by version), and runs the handler with `req.access`.
- **No MIS token is forwarded**, and no call to `/users/me` is made per request.

### 7.3 Manifest additions (amendment A4)

Each app's `defineManifest` gains two optional blocks next to `insights`:

```ts
endpoints: { api: process.env.PUBLIC_API_URL },          // where Home/Insights call this app
home: {                                                  // signals this app contributes to Home
  'attendance.register_missing': { capability: 'ATTENDANCE_MARK', lenses: ['TEACHING', 'CLASS_GROUP'] },
  'attendance.excuses_pending':  { capability: 'EXCUSES_REVIEW',  lenses: ['CLASS_GROUP', 'GRADE', 'PROGRAM', 'SCHOOL'] },
  'discipline.suspension_approval': { capability: 'SANCTION_SUSPEND_APPROVE', lenses: ['PROGRAM', 'SCHOOL'] },
  // …
},
```

The MIS includes an app in Home only when the viewer holds **at least one** capability named in that app's `home` block. A preset with nothing from D&A never calls D&A at all. The `endpoints.api` field replaces v1's proposed `System.api_base_url` migration.

### 7.4 Contract (versioned; identical copy in each codebase)

Location per repo: MIS `backend/src/services/home/contract.ts` + `frontend/src/components/home/contract.ts`; TM `server/src/integration/homeContract.ts`; D&A `server/src/modules/integration/homeContract.ts`; Tupo `apps/api/src/integration/homeContract.ts`. Each includes a zod schema. Move it into `@nga/access` (`packages/access/src/home.ts`) once the SDK exists, which removes the four copies.

```ts
export type HomeSource = "mis" | "taskmentor" | "attendance" | "tupo";
export type Tier = "blocking" | "slipping" | "tidy";
export type NodeKey = string;           // "SELF" | "TEACHING" | "CLASS_GROUP:7" | "PROGRAM:2" | "SCHOOL" | …

export interface AttentionItem {
  id: string;                           // `${source}:${kind}:${nodeKey}:${scopeKey}` — stable across refreshes
  source: HomeSource;
  kind: string;                         // catalog id, e.g. "T-01"
  tier: Tier;
  lens: NodeKey;
  via: number[];                        // grant ids (RBAC snapshot) → "why am I seeing this"
  depth: "summary" | "detail" | "write"; // what the item was computed at — the client refuses names when "summary"
  count: number;
  title: string;
  entities: string[];                   // MUST be [] or group-level labels when depth === "summary"
  why: string;
  cta: { label: string; href: string; external: boolean; requires?: string };
  due_at?: string;
  waiting_since?: string;
  suppresses?: string[];                // notification kinds made redundant, e.g. ["attendance:register_missing"]
}

export interface GlanceTile {           // thin reference to an Insights metric
  id: string; source: HomeSource; lens: NodeKey;
  metric: string;                       // RBAC §8.2 metric id, e.g. "attendance.rate"
  label: string; value: string | null;  // null + suppressed:true when n < MIN_COHORT
  suppressed?: boolean;
  status?: "good" | "warning" | "critical";
  trend?: number[];
  href: string;                         // "/insights/PROGRAM:2?metric=attendance.rate"
}

export interface UpdateItem {
  id: string; source: HomeSource; kind: string; title: string; body?: string;
  severity: "info" | "success" | "warning" | "critical";
  created_at: string; read: boolean; href?: string; external?: boolean;
}

export interface TodayMark {            // attendance → pinned onto MIS lessons
  lesson_key: string;                   // `${class_group_id}:${subject_id ?? "HR"}:${date}:${start_time}`
  status: "done" | "missing" | "upcoming" | "not_yours";
  href: string;
}

export interface HomeSummary {          // satellite response
  version: 2;
  source: Exclude<HomeSource, "mis">;
  generated_at: string;
  access_version: number;               // snapshot version the app decided with
  provisioned: boolean;
  items: AttentionItem[];
  updates: UpdateItem[];
  today_marks?: TodayMark[];
  comms?: { chat_unread: number; mentions: number; mail_unread: number;
            meetings: { id: string; title: string; starts_at: string; live: boolean; href: string }[] };
  app_home: string;
}

export interface HomeOverview {         // MIS response
  version: 2;
  viewer: { user_id: number; first_name: string; last_name: string; tz: string; preview_of?: number };
  access_version: number;
  period: { academic_year_id: number; academic_year_name: string; academic_term_id: number;
            academic_term_name: string; term_start_date: string | null; term_end_date: string | null;
            week_of_term: number | null; weeks_in_term: number | null };
  lenses: { key: NodeKey; label: string; node_type: string; via: number[] }[];
  default_lens: NodeKey | "EVERYTHING";
  grants: Record<number, { role: string; title: string | null; node: NodeKey; valid_until: string | null }>;
  today: { date: string; server_now: string;
           lessons: { lesson_key: string; slot_id: number; subject_id: number; subject_name: string;
                      class_group_id: number; class_group_name: string; start_time: string; end_time: string;
                      location: string | null; color: string | null;
                      plan: "done" | "missing" | "n/a"; report: "done" | "pending" | "upcoming" | "n/a";
                      href: string }[];
           activities: { id: number; title: string; start_time: string; end_time: string; color: string | null }[];
           next_teaching_day?: { date: string; lessons: number } };
  items: AttentionItem[];
  tiles: GlanceTile[];                  // MIS-metric tiles; satellite-metric tiles are fetched by the client
  tile_plan: { app: string; metric: string; lens: NodeKey }[];   // which satellite metrics to fetch, already access-filtered
  quick_actions: { label: string; href: string; icon: string }[];
  apps: { app: string; name: string; icon_url: string | null; home_url: string | null;
          api_base_url: string | null; home_signals: boolean }[];   // snapshot.systems ∩ manifests
  degraded: string[];
}
```

`grants` in the MIS response needs **`node` on each snapshot grant** (amendment A5). RBAC §7.1's `grants` map currently has only `role` and `title`.

### 7.5 Deep links into satellites

Extract `SystemsMenu.handleSystemClick` (`frontend/src/components/ui/SystemsMenu.tsx:49-112`) to `utils/openSystem.ts(app, targetPath?)`. It passes `state = base64url({n: nonce, next: targetPath})` through `/sso/authorize`. RBAC Phase 0 already adds `state` to all three clients; each client additionally honours `next` when it is a relative path (starts with `/`, not `//`) (amendment A6).

---

## 8. Backend implementation

### 8.1 Central MIS files

```
backend/src/
  routes/home.ts                         NEW  router.use(authenticate); GET /overview
  app.ts                                 EDIT app.use("/home", homeRoutes)
  controllers/homeOverviewController.ts  NEW  parse → buildHomeOverview → successResponse; ?as= preview (authorize mis:ACCESS_PREVIEW_AS, AccessAudit 'preview.as')
  services/home/
    contract.ts                          NEW  §7.4
    access.ts                            NEW  HomeAccess interface + snapshotAccess + legacyAccess (§3.3)
    lenses.ts                            NEW  grants → lenses (§3.1), labels, default lens
    optional.ts                          NEW  moved from teacherOverviewController (re-exported there)
    cache.ts                             NEW  per-user LRU keyed (user, access_version, date, term) 60 s
    buildHomeOverview.ts                 NEW  lens × signal gating (§3.2), provider waves, assemble, rank
    signals.ts                           NEW  MIS signal registry: {id, capability, minDepth, lenses, provider}
    providers/
      today.ts          (TEACHING: loadTeacherLessons + plan/report marks; SELF learner: loadStudentLessons)
      schemes.ts        (T-03,T-04,T-09,T-10; D-01,D-03; P-01,P-04)
      lessonReports.ts  (T-05,T-08; P-02)
      mentorship.ts     (S-09; E-01..E-03; P-03)
      elearning.ts      (S-04,S-05; T-11)   read-only, batched, no publishDueSections
      lessonNotes.ts    (T-16; shared-notes updates)
      structure.ts      (C-07,C-08,C-09; P-08; O-01..O-04)
      governance.ts     (M-03; G-01..G-05)            ← after RBAC Phase 3
      platform.ts       (X-01..X-04)
      quickActions.ts
  services/insights/metrics/             NEW  (shared with RBAC Phase 4 — build here first)
      curriculumSowValidation.ts, teachingLessonReports.ts, elearningProgress.ts, mentorshipCheckins.ts
  routes/insights.ts                     NEW  GET /insights/:metric (RBAC §8.2 contract, SDK depth gate + suppression)
  services/academicPeriod.ts             NEW  resolvePeriod + weekOfTerm(tz) — extracted
  services/lessonOccurrences.ts          NEW  extracted from getReportableLessons
  controllers/calendarController.ts      EDIT export loadStudentLessons
  controllers/userController.ts          EDIT explicit System columns (A2)
  controllers/ssoController.ts           EDIT POST /sso/federated-token (A3) — lands with RBAC Phase 2
```

### 8.2 `buildHomeOverview`

```ts
export async function buildHomeOverview(viewerId: number, q: HomeQuery): Promise<HomeOverview> {
  const access = await getHomeAccess(viewerId);                      // snapshotAccess | legacyAccess
  const key = `${viewerId}:${access.version}:${q.date}:${q.termId ?? "cur"}`;
  if (!q.refresh) { const hit = userCache.get(key); if (hit) return hit; }

  const [profile, period] = await Promise.all([loadProfile(viewerId), resolvePeriod(q.yearId, q.termId)]);
  const lenses = buildLenses(access);                                // §3.1

  // Plan: which (signal, lens) pairs this viewer may compute. Pure; unit-tested against the RBAC decision table.
  const plan = SIGNALS.flatMap(s => lenses
    .filter(l => s.lenses.includes(l.type) && access.can(s.capability, l.node))
    .filter(l => s.kind === "WRITE" || atLeast(access.depthAt(s.capability, l.node), s.minDepth))
    .map(l => ({ signal: s, lens: l, depth: access.depthAt(s.capability, l.node) ?? "write",
                 scope: intersect(access.scopeFor(s.capability), l.node) })));

  // Group by provider so each provider runs ONE batched query set for all its (signal, lens) pairs.
  const byProvider = groupBy(plan, p => p.signal.provider);
  const wave1 = await Promise.all(PROVIDERS_W1.filter(p => byProvider[p.name])
    .map(p => optional(p.run(ctx, byProvider[p.name]), EMPTY, p.name)));
  const wave2 = await Promise.all(PROVIDERS_W2.filter(p => byProvider[p.name])     // today marks etc.
    .map(p => optional(p.run(ctx, byProvider[p.name], wave1), EMPTY, p.name)));

  const out = assemble({ profile, period, lenses, access, results: [...wave1, ...wave2] });
  enforceDepth(out.items);   // last line of defence: strips entities from any item whose depth === "summary"
  userCache.set(key, out);
  return out;
}
```

**Rules:**
- Providers must **never loop per entity**. Use grouped `COUNT(*) … GROUP BY`, `inArray`, and `toSqlFilter(scope, columns)` from `@nga/access` (the legacy adapter provides an equivalent).
- School- and programme-wide aggregates come from Insights metrics. They use RBAC's shared cache (per metric, node and period, 10 min), shared across viewers.
- Log per-provider timing: `warn` above 1 s.
- **The cache key includes `access_version`**, so a grant change is reflected on the next request with no stale lenses.
- `?as=` preview computes with the *target's* access and never writes the target's cache.

### 8.3 Notifications (H4)

Recipients come from **RBAC `holders()`**, not hardcoded roles:

| Event | Where | kind | Recipients |
|---|---|---|---|
| Scheme submitted | scheme submit | `scheme_submitted` | `holders('mis:SOW_REVIEW', class)`, else `holders('mis:SOW_VALIDATE', class)` |
| Scheme validated / rejected | validate handler | `scheme_validated` / `scheme_rejected` | owner |
| Lesson report reviewed | admin approval PATCH | `lesson_report_reviewed` | `reported_by` |
| Check-in submitted / answered | mentorship | `checkin_received` / `checkin_answered` | mentor / student |
| Lesson note shared | share create | `lesson_note_shared` | resolved students (`notifyUsers`, batched) |
| **Access changed** | grant create/end/suspend, role update | `access_changed` | subject user ("You now have …" / "… ended") |

### 8.4 Performance (ops decision)

RBAC adds snapshot compilation, and Home adds one aggregate per login. Both run on the 1-connection pool. **Recommendation:** set `DB_CONNECTION_LIMIT=5` in production after checking MySQL `max_connections` (**Q5**). The caches keep Home safe even at 1.

---

## 9. Satellite work — one route each, **born enforced**

A new route has no legacy behaviour to shadow, so `/api/integration/home-summary` uses the SDK with enforcement from day one. It needs only the first two steps of that app's RBAC adoption phase (its manifest + SDK install). Full adoption (retiring local roles) is not a prerequisite.

**Common to all three:**
- `middleware/federatedAuth.ts`: verify the §7.2 token (JWKS or shared key, `aud` = this app, `scope` includes `read:home`), `fetchSnapshot(sub, v)` via the SDK, attach `req.access`.
- Rate-limit 30/min per `sub`. Never log the token.
- `POST /api/integration/home-summary` body `{ date, tz, lenses: NodeKey[], lessons?: LessonKey[] }`. **Lenses are hints only.** The app recomputes everything from its own snapshot and drops any lens the viewer has no grant for.
- The route is **read-only**. It must not trigger lazy writers (D&A `generateForUser`, MIS `publishDueSections`).
- Signals are declared in the manifest `home` block (§7.3); each has a pure builder and a test.
- CORS: add the MIS frontend origin (TM `ALLOWED_ORIGINS`; D&A and Tupo `CORS_ORIGINS`).
- Test with the RBAC fixture school.

### 9.1 Task Mentor

Files: `server/src/access/manifest.ts` (`home` block), `server/src/middleware/federatedAuth.ts`, `server/src/routes/integration.ts`, `server/src/integration/homeSummary.ts`.

Signals: S-01, S-02, S-03 · T-06, T-07, T-14, T-15 · C-06 · D-02 · P-05. Plus insight metric tiles (`results.*`, `report_cards.progress`), served from `/api/insights/*` (RBAC Phase 5).

Report-card pipeline items are one generic builder: for each step capability, count cards in the preceding state within `scopeFor(step)`.

Local-user mapping: `findOrCreate` by `mis_user_id`, the same approach as `grading.controller getQuizStudents`. Tests: jest `TZ=UTC --runInBand`.

### 9.2 Discipline & Attendance

Files: `server/src/access/manifest.ts` (`home` block), `server/src/middleware/federatedAuth.ts`, `server/src/modules/integration/{routes,homeSummary}.ts`.

- **Today marks (T-01, T-02, C-01):**
  - The client sends `lessons[]` (from the MIS overview) plus homeroom keys for the viewer's `CLASS_GROUP` lenses.
  - For each lesson, D&A checks `can('ATTENDANCE_MARK', {classGroupId, subjectId})`. If the check fails it returns `status:"not_yours"`, otherwise `done` / `missing` / `upcoming` from its attendance tables.
  - This removes the need to call MIS calendar endpoints with a user token, and a spoofed lesson list reveals nothing outside the viewer's grant.
- **Other signals:** S-06, S-07, S-08 · C-02 … C-05 · P-06 (sanction ladder, RBAC Phase 6) · P-09 · O-06 · M-04.
- **Updates:** unread notifications for the user. T-01/C-01 suppress `register_missing` / `homeroom_missing`.

### 9.3 Tupo

Files: `apps/api/src/access/manifest.ts` (`home` block), `apps/api/src/middleware/federatedAuth.ts`, `apps/api/src/routes/integration.ts`, `apps/api/src/integration/homeSummary.ts`.

- **No local user yet:** return `provisioned:false`. SSO owns user creation.
- **`comms`:** chat unread + mentions, mail inbox unread, meetings today (live + upcoming).
- **Signals:** M-01, M-02 · P-07 (`countPendingCampaigns({ approverScope, excludeSender: viewer })`) · O-05 (`countOpenReports()`, a plain COUNT with no previews).
- **Updates:** unread notifications excluding `chat.*`, from the last 7 days.

---

## 10. Phased delivery, sequenced against RBAC

| Home phase | Content | Needs from RBAC | Can start |
|---|---|---|---|
| **H0 — Foundations** (2–3 d) | A2 leak fix · `academicPeriod.ts`, `lessonOccurrences.ts`, `loadStudentLessons` extractions · `optional()` move · UI primitives extracted from `TeacherDashboard.tsx` (L113-330) to `components/ui/dashboard/` · `openSystem.ts` | none (runs alongside RBAC Phase 0) | **now** |
| **H1 — MIS Home, pilot** (6–8 d) | `/home/overview` with `HomeAccess` (**legacyAccess**) · providers for all MIS signals except G-/X- · `HomePage` with all sections (satellite sections hidden) · lens switcher · Today with Plan/Report marks · flag `HOME_V2` (pilot users only) | none; built on the adapter | now, in parallel with RBAC Phases 1–2 |
| **H2 — Switch to snapshot + Insights tiles** (4–5 d) | `snapshotAccess` in shadow, then enforce · MIS Insights metrics (`curriculum.sow_validation`, `teaching.lesson_reports`, `elearning.progress`, `mentorship.checkins`) + `/insights/:metric`. **This is RBAC Phase 4's MIS-metrics deliverable, done once** · `useAccess()` on the client · preview-as · ⓘ explain · **delete `legacyAccess`** · landing switch to `/home` for everyone (A1) | Phase 2 (snapshot, SDK, `access_version`) · Phase 4 contract (shared) · Phase 3 for preview-as | when RBAC Phase 2 is live |
| **H3 — Satellite summaries** (per app 2–3 d; 7–9 d total) | A3 federated token · A4 manifest blocks · §9 routes · CORS · A6 deep links · client fan-out, SourceHealth, today-mark merge, comms card, app badges · satellite insight tiles | Phase 2 + each app's manifest/SDK install (first step of Phases 5/6/7). P-06 needs D&A Phase 6 sanction ladder | per app, as soon as its manifest is published |
| **H4 — Updates & governance** (4–5 d) | §8.3 notification writers via `holders()` · merged Updates with suppression · `access_changed` updates · G-01…G-05, M-03, X-01…X-04 · snooze for `tidy` only: migration `UserHomeState(user_id, item_id, dismissed_until, seen_at)`; `blocking` can never be dismissed | Phase 3 (Access Studio reviews, holders) | after RBAC Phase 3 |
| **H5 — Parents & polish** (4–6 d) | `CHILDREN` lens (F-01…F-04) · sparklines · delete generic `Dashboard.tsx` + `WelcomePopup` · Lighthouse a11y ≥ 95 · remove flag | RBAC 6b (parent view) · Phase 9 cut-over | after RBAC Phase 8 UAT |

**Acceptance criteria by phase:**
- **H0:** all suites green (`npm run test:db:reset` first). The teacher-overview JSON is byte-identical before and after the extractions. `/users/me` has no `client_secret`.
- **H1:** the six pilot users see the expected lenses and items. p95 < 1.5 s at `DB_CONNECTION_LIMIT=1`. `legacyAccess` never yields `SCHOOL` without an explicit admin permission.
- **H2:**
  - Shadow diff for `/home/overview` is empty (or every difference is justified) for 1 week.
  - Every RBAC fixture persona matches the expected-Home table (§11).
  - Summary-depth items have empty `entities`.
- **H3:**
  - Killing any one app leaves Home usable.
  - A token for app A is rejected by app B (`aud`).
  - A spoofed `lessons[]` returns `not_yours`.
  - Non-entitled apps are never called.
- **H4:** no fact appears both as an item and as an update. Granting a role in Access Studio changes the grantee's Home lenses on their next refresh, with an Update.

---

## 11. Testing

| Layer | What | Where |
|---|---|---|
| Access (the key suite) | **Expected-Home table** built on RBAC's fixture school (RBAC §13): Head, DOS-Primary, HOD, DOD, Class-Teacher + IGCSE Subject Teacher, School Admin with and without Insights Viewer, Counsellor, Student, Parent, expired acting head. For each persona: expected lenses, item kinds present, item kinds **absent**, and max depth per item | MIS `backend/src/__tests__/homeAccess.test.ts`; the same fixture JSON in each app's summary test |
| Depth | at summary depth `entities` is empty and tiles are suppressed below `MIN_COHORT`; sensitive holders get counts only; `enforceDepth` strips any leak | MIS + each app |
| Non-pooling | a DOS-Primary's IGCSE class never produces DOS items; a Class Teacher's second, subject-only class never produces class items | MIS |
| Providers | tier boundaries (week 1/2, 48 h, 5 school days, term-end windows), batching (no query per entity) | `backend/src/__tests__/home*.test.ts` (vitest) |
| Federation | token `aud` / `exp` / `scope`, `access_version` bump → new snapshot, non-entitled app → 403 | TM jest (`--runInBand`, `TZ=UTC`), D&A jest, Tupo vitest |
| Security | `/users/me` has no `client_secret`; `?as=` needs `mis:ACCESS_PREVIEW_AS` and writes `AccessAudit` | MIS |
| Frontend | `merge.ts`, `lenses.ts`, `tierCopy.ts`; states (snapshot paint, degraded, unprovisioned, preview, all caught up); the client refuses to render `entities` when `depth==="summary"` | `frontend/src/components/home/__tests__/` |
| UAT | leadership signs off each preset **by previewing its Home** (RBAC Phase 8) | manual |

---

## 12. Amendments requested to the RBAC plan

These are small additions RBAC should adopt so the two plans do not diverge. Each is needed by Home **and** by the Insights hub.

| # | RBAC section | Amendment | Why |
|---|---|---|---|
| **A1** | §8.3 "Landing page" | The post-login landing page is **`/home` for everyone**. `snapshot.home` becomes Home's **default lens** plus the target of its "Open insights →" link, not a redirect. The Insights hub stays at `/insights/:node` | One landing page across presets. Leadership still starts from their widest node, but sees their approvals queue first |
| **A2** | §11 Phase 0, item 3 | Also fix `/users/me` returning `System.*` including `client_secret` (`userController.ts:520-523`): use an explicit column list, and later `snapshot.systems` | Rotating secrets without this leaks the new ones to every user |
| **A3** | §7 / §8.3 | Specify `POST /sso/federated-token {app}` → an audience-bound, 5-min, read-scoped JWT. Recommend asymmetric signing with JWKS | "The user's SSO token" is not accepted by any app, and Phase 0 adds `aud` |
| **A4** | §6 manifest | Add optional `endpoints.api` and a `home` block (signal id → capability + lens types) next to `insights` | Home assembles itself from grants exactly as the hub does, and the app API URL needs no MIS migration |
| **A5** | §7.1 snapshot | Add `node` (and `valid_until`) to each entry of `grants` | Lens labels and "why am I seeing this" need the node of each `via` grant |
| **A6** | §11 Phase 0, item 3 (`state` in all clients) | The SSO callbacks honour `state.next` (relative paths only) | Deep links from Home and Insights into the owning app |
| **A7** | §9 Preview-as | Preview-as covers `/home` (read-only; CTAs disabled) | Preset sign-off in Phase 8 UAT |

---

## 13. Frontend implementation

```
frontend/src/
  App.tsx                         EDIT  /home route; post-login + PublicRoute → /home (flag, then A1)
  components/ui/Sidebar.tsx       EDIT  "Home" first; `/dashboard` becomes "Timetable" (TEACHING lens) / "System dashboard"
                                        (mis:SUPER_ADMIN_DASHBOARD) — gated with useAccess once RBAC Phase 3 migrates the sidebar
  api/home.ts                     NEW   getHomeOverview (30 s timeout), getFederatedToken(app)
  api/federated.ts                NEW   per-app axios instance: baseURL from overview.apps[].api_base_url, 8 s timeout,
                                        Bearer federated token (refresh at exp-30 s), NO logout interceptor, zod-validated
  utils/openSystem.ts             NEW   (§7.5)
  components/ui/dashboard/        NEW   Card, CardHeader, StatTile, QuickAction, Countdown (extracted)
  components/home/
    HomePage.tsx, contract.ts, useHomeData.ts,
    merge.ts        normalise → dedupe → suppress → lens filter → rank → group  (PURE)
    lenses.ts       lens ordering, labels, audience (staff vs learner/parent) copy (PURE)
    tierCopy.ts     (PURE)
    sections/ HomeHeader, SourceHealth, LensSwitcher, NextUpHero, NeedsYouList (evolves teacher/AttentionPanel),
              WhyPopover (via → grants), TodayStrip (reuses DayRail), GlanceTiles (Insights metric fetch per tile),
              CommsCard, UpdatesFeed, QuickActions, AppsDock, PreviewBanner
    __tests__/ merge.test.ts, lenses.test.ts, depthGuard.test.ts, HomePage.states.test.tsx
```

**Ranking** (in `merge.ts`, pure). The score is the sum of these terms:

| Term | Value |
|---|---|
| Tier weight | blocking 3000 · slipping 2000 · tidy 1000 |
| Overdue | overdue hours × 2 (cap 500) |
| Someone waiting | waiting hours (cap 300) |
| Not yet due | − hours until due (cap 200) |
| Lens bonus | TEACHING / SELF-learner 30 · CLASS_GROUP / MENTEES 20 · DEPARTMENT / PROGRAM 10 · SCHOOL / PLATFORM 0 |

Items are sorted by score, grouped by tier.

**Hero:** the first blocking item, else the current or next lesson, else the first slipping item, else "all caught up".

**Depth guard:** before rendering, any item with `depth === "summary"` has its `entities` dropped, and a dev-only console error is raised. This is defence in depth behind the server.

**Visual system** (unchanged from v1):
- Existing Tailwind tokens and `teacher/chartTheme.ts` `STATUS` for tiers, with no new hex values.
- Monochrome source badges and lens chips.
- `rounded-2xl` / `shadow-soft` cards.
- `design/motion.ts` `reveal` with a 40 ms stagger.
- Both themes verified.
- The ⓘ popover is a keyboard-reachable `button` with `aria-describedby`.

---

## 14. Risks & open questions

| # | Risk / question | Recommendation |
|---|---|---|
| R1 | RBAC slips, so Home waits | H0 and H1 have no RBAC dependency. The pilot runs on `legacyAccess` behind the flag. General release waits for H2 so no user ever sees Home decide differently from RBAC |
| R2 | Summary tiles are mostly "<5" for the small Coding Academy classes | Uses RBAC's `MIN_COHORT` decision (RBAC §14 #3); Home follows it, with no separate setting |
| R3 | Four copies of the contract drift | Version field + zod on the client (a mismatch shows as degraded); move into `@nga/access` in H2 |
| R4 | Federated token misuse | Read-only scope, 5-min expiry, `aud`-bound, never logged; apps accept it only on integration and insights routes |
| R5 | Too many items for multi-hat leaders | Tier caps, `tidy` collapsed, lens switcher, one banner |
| Q1 | Excuse submission deadline (when S-06 / F-02 turn blocking)? | leadership |
| Q2 | Grading service level (T-07 blocking after 7 d?) | leadership |
| Q3 | Validation / review service level (D-01, P-01, P-02: 5 school days?) | leadership; could become a per-school setting in Access Studio |
| Q5 | Production `DB_CONNECTION_LIMIT=5`? | prod server owner |
| Q6 | Should RBAC accept amendments A1–A7? | owners of both plans. **A1 and A3 block H2 and H3** |

v1 questions Q4 (parents) and Q6 (head-teacher scope) are answered by RBAC: parents get the `CHILDREN` lens (H5), and the Head Teacher's scope is whatever the preset grants.

---

## 15. Quick reference for implementers

- **Home never decides access.** It asks `HomeAccess` (MIS) or `req.access` (apps). Never check role names or permission lists directly.
- **A signal = capability + minDepth + lens types + a pure builder.** Register it in `signals.ts` (MIS) or the manifest `home` block (apps).
- **Names only at `detail`.** Summary is counts with suppression; sensitive is counts of your own queue only.
- **Lenses are grant nodes, never pooled.** `TEACHING` is the only merge.
- **Reuse:** `loadTeacherLessons`, `loadSchemeStatus`, `summariseCourse`, `toSqlFilter`, `suppressSmallCohorts`, Insights metrics.
- **Every aggregate batches its queries and has its own client timeout** (single-connection pool). Cache keys include `access_version`.
- **Home is read-only.** No provider or summary route writes or triggers a lazy writer.
- **Items are state; updates are events.** When both exist for one fact, the item wins and suppresses the update.

---

## 16. Implementation status (updated 2026-09-27)

Built on branch `feat/access-control-v2` in all four repos (shared with the RBAC work; uncommitted, like the RBAC changes). **H0–H3 are done and tested; H4 and H5 are not started.**

### 16.1 What exists

| Area | Files | Tests |
|---|---|---|
| Endpoint `GET /home/overview` (`?academic_year_id&academic_term_id&refresh=1&as=`) | `routes/home.ts`, `controllers/homeOverviewController.ts`, mounted in `app.ts` | `__tests__/homeOverview.test.ts` (13): teacher, student, programme lead, school admin, class teacher, mentor, ended term, year-without-placement, preview refused, tier order, v2-enforced DOS and insights viewer |
| Access layer | `services/home/access.ts`: lenses from grant nodes, `heldAt` (non-pooled), a legacy snapshot built from today's permissions + placements | same |
| Providers | `services/home/providers.ts`: teaching (T-03/04/05/08/09/10/11/16 + Today with plan/report marks), learner (S-04/05/09 + timetable), mentoring (E-01/02/03), class (C-07/08/09), oversight (P-01/02/03/04/08 + Insights tiles via `computeMisInsight`), operations and governance (O-01/02/03, G-02, M-03, X-02, X-04) | same |
| Orchestration | `services/home/buildHomeOverview.ts`: one provider wave, each provider optional (`degraded[]`), 60 s per-user cache keyed by the access version, summary-depth entity stripping | same |
| Shared helpers | `services/academicPeriod.ts` (`resolvePeriod`, `weekOfTerm`, `weeksInTerm`); `loadStudentLessons` exported from `calendarController.ts`; `teacherOverviewController` uses the shared `resolvePeriod` | existing calendar, teacher-overview and reportable-lessons suites still pass |
| Page | `components/home/` (`HomePage`, `NeedsYouList`, `TodaySections`, `SideCards`, `ui`, `merge.ts`, `useHomeData.ts`), `api/home.ts` | `components/home/__tests__/` (22) |
| Landing | Login and `PublicRoute` → `/home`; sidebar "Home" first, the teacher's `/dashboard` item relabelled "My Timetable"; "Home" in nav search; `?tab=` deep links on `ReportingModule` / `AdminReporting` | — |

Verified in a real browser (Playwright against the dev DB) for a teacher, a class teacher, a programme lead, a student, a super admin and a parent, on desktop and mobile, in light and dark themes. Every page returned 200 in about 2.3–2.9 s with no console errors.

### 16.2 Deviations from this plan (deliberate)

1. **No temporary adapter.** Home follows `misAccessMode()`. In `enforce` it reads the v2 snapshot. In `off` / `shadow` it lifts today's permissions and placements into the same snapshot shape (`buildLegacySnapshot`). Lens differences are logged to `AccessShadowDiff` as `home.lens:<key>` on route `/home/overview`.
2. **No School widening for placed users.** Someone who holds (or held) a class-teacher or programme-lead placement in any year never gets a School lens from legacy permissions, the same rule as `resolveUserScope`. This was found on the dev DB, where the period selector defaulted to a year with no placement.
3. **Learner content follows persona**, not permissions. Legacy SUPER_ADMIN holds every permission, student ones included.
4. **Landing without a flag.** `/home` is the landing page now. `/dashboard` stays reachable.
5. **UI primitives not extracted** from `TeacherDashboard.tsx`. Home has its own small `ui.tsx` in the same visual language, which avoids regression risk on a working page.
6. **Plan/report matching in `teachingProvider`** mirrors `getReportableLessons` instead of extracting it (that controller is large and hot).

### 16.3 H3: the other apps (done 2026-09-27)

| Repo | Endpoint / files | Tests |
|---|---|---|
| MIS | Relay `POST /home/apps/:source/summary` (`services/home/apps.ts`: config, fetch with the user's own token, `sanitiseSummary`). The overview lists `apps`. The page is `useAppSummaries.ts` + `mergeApps`: app items ranked with MIS items, app tiles, a Register chip on Today, a "Messages & meetings" card, a merged Updates feed, and source-health dots in the header. | `homeAppsRelay.test.ts` (10), Home frontend (24) |
| Task Mentor | `POST/GET /api/integration/home-summary`: `middleware/misBearerAuth.ts`, `integration/homeSummary.ts`, `routes/integration.ts`. Signals S-01/02/03, T-07 (instructor-scoped), T-14, T-15, C-06, P-05. | `tests/homeSummary.integration.spec.ts` (16) |
| D&A | same route: `middleware/misBearerAuth.ts`, `modules/integration/*`. `today_marks`, T-01, C-01–C-04, S-06–S-08, O-06; T-02 only fires if MIS sends past lessons. | `__tests__/homeSummary.test.ts` (14); server suite 264/264 |
| Tupo | same route: `middleware/misBearerAuth.ts`, `services/homeSummaryService.ts`, `routes/integration.ts`, `openReportCount()` in `packages/feed`. `comms`, M-01, M-02, P-07 (approver ≠ sender), O-05. | `__tests__/homeSummary.test.ts` (19); api suite 378/379 (the one failure predates this work) |

Verified end to end on the dev machine with all four APIs running: every app verified the MIS token and answered `ok` or `unprovisioned`, and the page showed the app tiles, the comms card and four green source dots.

**Deviations (deliberate):**
- **Relayed by the MIS backend** instead of a browser fan-out. There are no CORS changes in the apps and no app URLs in the browser, and every answer is sanitised in one place: safe `http(s)` links only, names stripped at summary depth, only known lens keys, and ids namespaced once.
- **Authenticated with the user's existing MIS token**, verified by each app against MIS `/auth/verify` (cached 60 s under a sha256 hash). This replaces the plan's federated token (A3), as the RBAC session asked. It adds no new token type.
- **Scope is decided in each app by its own access helpers.** D&A checks the legacy key directly in off/shadow mode, so the endpoint writes no `access_shadow_diffs` rows. TM and Tupo reuse their gate helpers, which may log shadow differences, the only rows they write.

**Configuration:**
- **MIS:** `HOME_APP_TASKMENTOR_URL`, `HOME_APP_ATTENDANCE_URL`, `HOME_APP_TUPO_URL` (API base URLs; leave one empty to keep that app off Home) and `HOME_APP_TIMEOUT_MS` (default 8000). See `backend/.env.example`.
- **Apps:** `APP_PUBLIC_URL` (D&A, Tupo) and `FRONTEND_URL` (TM) set the SPA base used in the links.

**Known limits:**
- Links into an app open in a new tab. A user with no session there passes through that app's sign-in first (plan A6 `state.next` is not built).
- Tupo matches users on `mis_user_id = String(MIS user_id)`. Rows stored under a uuid or email fallback show as `provisioned:false`.
- T-06 (marks not entered), D-02 (moderation) and P-06 (suspension recommendations) are skipped: the data model has no state for them yet.

### 16.4 Next

- **H4:** MIS notification writers routed through `holders()`, merged Updates, snooze for `tidy` items.
- **H5:** the parent `CHILDREN` lens.
- **Dev data:** three academic years (5, 6, 7) are all flagged `is_current`, so the period selector and the server can disagree about "this term". Fix the data, not Home.

### 16.5 Deep testing and UI/UX audit (2026-09-27)

- **Audit method:** Playwright plus axe-core (WCAG 2.2 AA plus best practice) against the seeded test DB, on a single DB connection like production. Four personas (a multi-role teacher, a student, a programme lead, an admin). Widths 320, 360, 390, 768, 1024 and 1440 px, in light, dark and reduced motion. Checked: horizontal overflow, target size (24 px AA, 40 px or more on touch), Tab reachability with visible focus, Escape on popovers, heading structure, console errors, timing.
- **Final audit result:** 0 axe violations, no horizontal scroll at any width, no targets under 24 px, every Tab stop has a focus ring, and no console errors. Home renders in about 1.1–1.5 s; the overview API answers in 15–50 ms (cached) on one connection.
- **Fixed during the audit:**
  - Text contrast of 4.32:1 on the page background and 3.59:1 on faded finished lessons (a check icon now marks them instead).
  - A page 662–716 px wide on phones, from three causes: the grid had no `grid-cols-1`, the lens row's natural width leaked out, and absolutely positioned screen-reader labels escaped the scroller.
  - A 23 px "Why?" button and 15 px text links.
  - The "Why?" popover didn't close with Escape.
  - The lens switcher was declared as ARIA tabs without arrow keys; it is now toggle buttons with `aria-pressed`.
  - Blocking items were hidden behind "Show more"; they now never are.
  - Future lessons with no plan showed in alarm red; they are now amber, and red is kept for a missing register.
  - Today appeared after the list for teachers on desktop; it now leads.
  - Unreachable apps were explained only in a hover tooltip; there is now visible text.
  - Tiles and quick actions are capped (6, with critical tiles first).
  - Phone lesson names were squeezed by the status chips.
  - The loading skeleton now respects reduced motion.
- **New tests:** `homeOverviewEdges.test.ts` (8): missing period, malformed ids (400), a student with no class, cache vs refresh, nameless people, 150 pending schemes within the time budget, audited preview-as, and a relay that can't be steered by the path. Frontend: blocking items never capped, Escape, unreachable-app text, toggle semantics.
- **The three app endpoints were reviewed adversarially:**

  | App | Home-summary tests | Full suite | Fixed |
  |---|---|---|---|
  | TM | 16 → 47 | 254/254 | term override widening scope, wrong-student names on report cards, strict lens parsing, term-end timezone |
  | D&A | 13 → 37 | 287/287 | an HTML stack trace on errors, excuses with no class invisible to reviewers plus MIS fan-out, 400 on one bad entry, no rate limit, uncached period lookup |
  | Tupo | 26 → 61 | 420/421 (1 failure predates this work) | counts capped by query limits, 500 on a bad date or time zone, 404/429 from MIS treated as a bad token, approving bulk mail sent in the viewer's own name, no verify timeout |

  A contract checker now runs on every response in each app's suite.

### 16.6 Every quick reminder on Home (2026-10-09)

An audit of all four apps against what Home showed found reminder-worthy state that only reached people through each app's own dashboard or bell. Each app now sends it, using the same rules as its own dashboard, so Home and the app never disagree.

- **MIS** (`services/home/careProvider.ts`, `__tests__/homeCare.test.ts`). These pages are guarded by `requireCapability`, which always uses the v2 engine, so this provider decides with the v2 snapshot in every access mode.
  - **Safeguarding team:** SG-01 new concerns to acknowledge, SG-02 concerns assigned to me (counts only, never names).
  - **Students:** SG-S1, the weekly wellbeing check-in.
  - **Early warning:** EW-01 at-risk students with no support plan, EW-02 plan reviews that are due.
  - **Cover managers:** CV-01 absences waiting for a decision, CV-02 lessons with no cover teacher.
  - **Any teacher:** CV-03, lessons I'm covering.
  - **Parents:** FAM-01, a child who needs a word this week, plus one tile per child (the H5 `CHILDREN` lens).
  - **Frontend:** a third audience, `family` ("For your family" / "Worth a look"). The learner blocking label is now "Do now", because work due today and running quizzes are not overdue.
- **Task Mentor** (nga-task-mentor PR #56). The student loader is shared with the student dashboard, and dashboard alerts come from `computeOverview`/`buildAlerts`.
  - **Learners:** S-05 quiz in progress; S-01 missed in the last 7 days (late work is refused, so it says "talk to your teacher"); S-02/S-03 due or closing within 24 h; S-10 due within 3 days; S-06 unsubmitted drafts; S-09 project returned for changes; S-04 new work; S-07 quiz retake available; S-08 quiz opens soon. Quizzes count only when public.
  - **Teachers:** T-07 now uses the dashboard's grading queue (co-teachers' work and timed-out attempts included, blocking after 7 days).
  - **Teachers, from dashboard alerts:** T-16 subject at risk, T-17 closing soon with under half submitted, T-18 closed with missing work, T-19 low class average, T-20 students needing support, T-21/T-22 live or stale proctoring, T-23 unpublished drafts, T-25 subjects with nothing published.
  - **Teachers, question bank:** T-24, an empty or thin question bank.
  - **Admins** get no dashboard alerts, because a school-wide `computeOverview` loads every roster from MIS.
- **Discipline & Attendance** (nga-discipline-attendance PR #48):
  - **Discipline staff:** D-01 demerits waiting for review (needs `DISCIPLINE_REVIEW` too), D-02 conduct follow-up (15 or more demerit points this term), D-03 major incidents in the last 7 days.
  - **Excuse reviewers:** C-05, approved excuses whose absence is still recorded.
  - **Students:** S-09, own excuses pending or rejected and resubmittable.
  - **Staff:** O-07, own clock-in missing.
  - **Admins:** A-01, accounts waiting for a role.
  - **Legacy mode:** D items are school-wide, as on the discipline overview page.
- **Tupo** (nga-communication-module PR #29): M-03 unread mail, M-04 meeting invitations with no reply, M-06 failed scheduled messages, F-01 unseen announcements (last 14 days), P-08 bulk sends sent back or failed.
- **Query budgets:** the Tupo summary is at its test cap of 15 queries and the D&A teacher path at its cap of 20 reads. A new signal in either app must share a query.
- **Production prerequisite:** none of the app items reach Home unless `HOME_APP_TASKMENTOR_URL`, `HOME_APP_ATTENDANCE_URL` and `HOME_APP_TUPO_URL` are set in the MIS `.env.production`.
