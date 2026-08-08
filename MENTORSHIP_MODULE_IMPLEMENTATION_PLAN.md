# Mentorship Module — Full Implementation Plan

**Date:** 2026-07-31
**Companion documents:** [`REPORTING_MODULE_RESTRUCTURE_IMPLEMENTATION_PLAN.md`](./REPORTING_MODULE_RESTRUCTURE_IMPLEMENTATION_PLAN.md) (shipped 2026-07-30 — explicitly scoped `MentorshipSession` **out**, "a separate, similarly-shaped effort"), [`REPORTING_MODULE_DASHBOARD_DOWNLOAD_IMPLEMENTATION_PLAN.md`](./REPORTING_MODULE_DASHBOARD_DOWNLOAD_IMPLEMENTATION_PLAN.md) (same exclusion, §5). This is that follow-on effort.
**Reference example reviewed:** `Mentorship Report Quarter Three.pdf` (Rwanda Coding Academy, mentor UWITONZE Jean Bosco, 18 mentees, Q3 2026) — analyzed in full below (§1) to derive the data model and document shape.

---

## 1. What the sample report tells us (data model analysis)

The PDF is a **mentor-authored quarterly consolidation**, not raw session logs. Reading it end to end, it has five structurally distinct layers that the current schema either partially or doesn't cover at all:

| Layer in the PDF | Content | Current schema coverage |
|---|---|---|
| **Roster** | One mentor, 18 mentees, grouped by year (Year 1/2/3), with name/sex/email/class | **Gap.** No table says "this mentor is responsible for these students this year." Today's `MentoringHub`/`getAssignedStudents` *infers* a mentor's list from `TeacherSubjectAssignment → ClassGroup → StudentClassGroup` (i.e. "who do I teach"), not from an explicit mentor-mentee assignment. The screenshot's "1 student assigned" is that inferred list, not a designated roster — a teacher could teach a class group without being its mentor, or a school could want one mentor for 18 students across four different class groups (exactly what the PDF shows: Year 1A–3D mixed under one mentor). |
| **Non-engagement log** | A table of mentees who won't engage ("unknown reason," "needs admin support") vs. known/excused absences, each with a suggestion | **Gap.** `MentorshipSession` has no way to record "no session happened and here's why" — every row implies a session occurred. There's no "missed/refused" status. |
| **Per-mentee dossier** | Name, class, DOB/place of birth, last-term marks *per course*, current project, area of improvement, photo, contact, mentee's own signature | **Partial.** `AssessmentScore` already holds per-subject marks (used today for `getMenteeIntelligence`'s "recent scores"), so marks are derivable, not something to re-store. Photo/DOB/project/contact are **not** on `UserProfile`/`MentorshipSession` in any mentorship-specific way — DOB may exist generically on `UserProfile`, needs checking; "project" and "area of improvement" are free text with no home. |
| **Meeting schedule log** | Repeating rows: date, content of discussion, recommendations for the student, mentor's remarks — effectively a running minutes table across a term, with two checkpoint rows ("Partial submission," "Consolidation") each carrying its own submission/signature date | **Partial.** This *is* `MentorshipSession` (one row per meeting, `topic`≈"content of discussion", `next_steps`/`guidance_notes`≈"recommendations", `notes`≈"mentor's remarks"). What's missing is the **checkpoint/submission** concept — a mentor formally signing off a batch of sessions as "partial" or "consolidated" for a reporting period, which is a distinct action from logging any one session. |
| **Mentee's own voice** | "Student comment and appreciation" — free text *from the mentee*, plus a mentee signature, filled in progressively | **Full gap.** This is the literal feature the user is asking for ("student/mentee to report to his mentor") — nothing today lets a student submit anything into the mentorship record. Every existing endpoint (`submitMentorshipSession`, `updateSessionStatus`) is mentor-authored only, gated by `TEACHER_DASHBOARD`/`SUBMIT_REPORTING`. |
| **Closing** | "recommend/do not recommend for special follow up" checkbox, "Future Directions," "Conclusion," prepared-and-signed-by + date | **Partial.** `follow_up_required` (boolean) already exists on `MentorshipSession` but is per-session, not a term-level recommendation. The narrative "Future Directions/Conclusion" text and the formal sign-off have no home — this is the **periodic report document** itself, which doesn't exist as a generated artifact anywhere (mentorship was explicitly excluded from the Dashboard-download plan).

**Conclusion:** roughly half of what the sample report needs is already modeled (`MentorshipSession`'s per-meeting fields, `AssessmentScore` for marks, the follow-up/wellbeing/dishonesty flags). The two real gaps are (a) an **explicit mentor-mentee assignment** as a first-class, admin-controlled relationship scoped to an academic year, decoupled from subject-teaching assignments, and (b) a **student-facing reporting/comment path** plus the **periodic consolidation & document generation** on top of it. Both are net-new; everything else is extension of what's there.

---

## 2. Feature-by-feature gap analysis (against the user's 7 requirements)

1. **"Assigning student to a specific person in a specific academic year"** — **Gap.** No `MentorAssignment`-type table exists. Build one (§3.1).
2. **"View list of assigned mentees"** — **Mostly exists**, but rewire it to read from the new assignment table instead of inferring from `TeacherSubjectAssignment` (§3.2), so a mentor's roster matches what an admin actually assigned, not what they happen to teach.
3. **"Enabling reporting on different levels, i.e. student/mentee to report to his mentor"** — **Full gap.** New student-facing submission surface (§4).
4. **"View all reported by mentees, and view details"** — depends on #3; the mentor-side inbox/detail view for mentee-submitted check-ins (§4.3).
5. **"Instructor/mentor mentorship reporting based on students/mentee reports"** — the mentor's existing session-logging flow (`MentoringSessionModal.tsx`), extended so a mentor can see and respond to/close out a mentee's check-in when logging the next session (§4.4).
6. **"Admin able to view all submitted reports by mentors"** — **Mostly exists** (`getAdminMentoringLog`/`AdminMentoringLogView.tsx`); extend with assignment-based filters and mentee-submitted check-ins in the same view (§5.1).
7. **"Generate different periodic reports and dashboard"** — **Gap.** A quarterly/termly consolidated document matching the sample PDF's shape, plus mentorship-specific dashboard widgets (§5.2-5.3, §6).

---

## 3. Phase 1 — Explicit mentor-mentee assignment (foundation)

**Goal:** make "who mentors whom, this academic year" a real, admin-managed relationship instead of an inferred one.

### 3.1 Schema (new migration, numbered after the latest existing migration — confirm current max in `backend/migrations/` before writing, `039_mentorship_intelligence_layer.sql` is the latest mentorship-specific one seen so far)

```sql
CREATE TABLE MentorAssignment (
  assignment_id   BIGINT PRIMARY KEY AUTO_INCREMENT,
  mentor_id       BIGINT NOT NULL REFERENCES UserProfile(user_id),
  student_id      BIGINT NOT NULL REFERENCES UserProfile(user_id),
  academic_year_id BIGINT NOT NULL REFERENCES AcademicYear(academic_year_id),
  status          ENUM('ACTIVE','ENDED') NOT NULL DEFAULT 'ACTIVE',
  assigned_by     BIGINT NOT NULL REFERENCES UserProfile(user_id),
  assigned_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at        DATETIME NULL,
  notes           TEXT NULL,
  UNIQUE KEY uq_active_mentee_per_year (student_id, academic_year_id, status)
    -- enforced at the application layer instead if MySQL version can't do a
    -- partial/filtered unique index; the intent is "one active mentor per
    -- student per year", not "one row ever"
);
CREATE INDEX idx_ma_mentor ON MentorAssignment(mentor_id, academic_year_id);
CREATE INDEX idx_ma_student ON MentorAssignment(student_id, academic_year_id);
```

- `status`/`ended_at` (soft-close, not delete) so re-assigning a mentee mid-year preserves history — the sample PDF shows mentors tracking *why* a mentee disengaged, which implies continuity of record matters here.
- No `class_group_id` column — deliberately decoupled from `TeacherSubjectAssignment`, matching the PDF's reality of one mentor spanning Year 1A through Year 3D.
- Add `MentorAssignment` to `backend/src/db/schema.ts` alongside `MentorshipSession`.

### 3.2 Backend

- New controller `mentorAssignmentController.ts`:
  - `POST /mentorship/assignments` (admin) — body `{ mentor_id, student_id, academic_year_id, notes? }`; reject if student already has an `ACTIVE` assignment for that year (409, not silent overwrite) unless `reassign: true` is passed, in which case atomically end the old row and insert the new one.
  - `GET /mentorship/admin/assignments?academic_year_id&mentor_id&student_id` (admin) — roster browser with mentor/student names joined in, for the admin UI in §5.1.
  - `DELETE /mentorship/assignments/:id` (admin) — soft-close (`status='ENDED'`), never a hard delete (mirrors the "don't drop, archive" convention already used for `InstructorReport` in the Restructure Plan §Phase 5).
  - Bulk-assign endpoint `POST /mentorship/assignments/bulk` accepting `{ mentor_id, student_ids[], academic_year_id }` — the realistic admin workflow is "assign these 18 students to this mentor," not one-by-one.
- Rewrite `getInstructorClassGroupIds`-based logic in `getAssignedStudents` (`mentorshipController.ts:70-173`): replace the `TeacherSubjectAssignment → ClassGroup → StudentClassGroup` join with a direct `MentorAssignment` lookup (`mentor_id = userId AND academic_year_id = <current> AND status='ACTIVE'`), then join `UserProfile`/`StudentClassGroup`/`ClassGroup` only for display fields (class name, etc.). Keep the existing overdue/last-session/wellbeing enrichment logic (lines 111-172) unchanged — it's session-data enrichment, not assignment logic, and already works.
- `verifyStudentAccess` (line 48) similarly switches its access check from class-group membership to `MentorAssignment` membership — this is also a **security fix**: today a teacher can log a mentorship session for any student in a class group they teach, even if they aren't that student's actual assigned mentor.
- Permissions: reuse `Permissions.MANAGE_REPORTS` (already exists, added in the Restructure Plan's Phase 6) for assignment CRUD, gated to admin roles — no new permission constant needed.

### 3.3 Frontend

- New admin screen `AdminMentorAssignments.tsx` (or a tab inside the existing admin reporting area) — table of current assignments per academic year, "Assign mentor" action (searchable mentor + multi-select student picker, reusing whatever student-search component the existing admin UI already has for other features), "Reassign"/"End assignment" row actions.
- `frontend/src/api/mentorship.ts`: add `createAssignment`, `bulkAssignMentor`, `getAssignments`, `endAssignment`.

### 3.4 Testing

- Unit: bulk-assign rejects a student who already has an active assignment unless `reassign:true`; ended assignments don't count toward "active roster."
- Integration: assign mentor A to student X for year 2026; mentor B calls `getAssignedStudents` → X does not appear; mentor A calls it → X appears. Mentor B attempts `submitMentorshipSession` for X → `403`/`404` (the `verifyStudentAccess` fix).
- Manual/UAT: admin bulk-assigns 18 students to one mentor in one action (mirroring the PDF's real numbers), confirms the mentor's Mentoring Hub shows exactly those 18, grouped/sorted sensibly for that volume (the current `MentoringHub.tsx` — 205 lines — was built and visually verified against a **single**-mentee case per the screenshot; re-check its layout at 18+ rows, since a card grid might not scale before a plan/UAT catches it).

### 3.5 Definition of Done
Admin can assign/reassign/bulk-assign/end mentor-student relationships per academic year; mentor rosters and session-logging access are both driven by this table, not by teaching assignments; existing wellbeing/overdue/follow-up logic in `getAssignedStudents` is unchanged in behavior, only in its source-of-truth join.

**Effort estimate:** 5-7 days.

---

## 4. Phase 2 — Student-facing mentee reporting

**Goal:** let a mentee submit something into their own mentorship record — the PDF's "student comment and appreciation" plus the concept of a mentee-initiated check-in (e.g. requesting a session, flagging a concern), and let the mentor see and act on it.

### 4.1 Design decision: extend `MentorshipSession` vs. new table

Recommend a **new table**, `MenteeCheckIn`, rather than overloading `MentorshipSession` with a nullable "who authored this row" flag:
- `MentorshipSession` today assumes a mentor logged a real, dated, duration-bearing meeting (`duration_minutes`, `assignment_completion`, `punctuality_attendance`, etc. — all mentor-observation fields that make no sense as student input).
- A mentee's submission is structurally different: free-text comment/appreciation, an optional "I'd like to talk about X" request, no duration/attendance/discipline fields.
- Keeping them separate avoids a large table where most columns are null depending on author, and keeps the existing, working `MentorshipSession` code path (§ mentorshipController.ts) untouched — lower regression risk, consistent with how this codebase has consistently chosen "new table + own controller" over widening an existing one (see `SupportRequestCategory`/`LessonReportChallengeTag` in the Restructure Plan's Phase 1, done the same way).

```sql
CREATE TABLE MenteeCheckIn (
  checkin_id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id       BIGINT NOT NULL REFERENCES UserProfile(user_id),
  mentor_id        BIGINT NOT NULL REFERENCES UserProfile(user_id), -- denormalized from MentorAssignment at submit time
  academic_year_id BIGINT NOT NULL REFERENCES AcademicYear(academic_year_id),
  submitted_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  category         ENUM('APPRECIATION','CONCERN','REQUEST_MEETING','GENERAL') NOT NULL DEFAULT 'GENERAL',
  message          TEXT NOT NULL,
  linked_session_id BIGINT NULL REFERENCES MentorshipSession(mentorship_id), -- set once a mentor addresses it in a session
  status           ENUM('NEW','ACKNOWLEDGED','ADDRESSED') NOT NULL DEFAULT 'NEW',
  mentor_response  TEXT NULL,
  responded_at     DATETIME NULL
);
CREATE INDEX idx_mci_mentor ON MenteeCheckIn(mentor_id, status);
CREATE INDEX idx_mci_student ON MenteeCheckIn(student_id, academic_year_id);
```

### 4.2 Backend

- `POST /mentorship/checkins` (student-authenticated) — body `{ category, message }`; server resolves `mentor_id` from the student's `ACTIVE` `MentorAssignment` for the current academic year (never accepted from the client — same "hard-set from session, not from request body" guard used for `reported_by` in the Dashboard-download plan §3.2); `404`/`422` if the student has no active mentor assigned yet (a real, expected state per the PDF — e.g. year-start before assignment).
- `GET /mentorship/checkins/mine` (student-authenticated) — a student's own submission history, so they can see their past comments and any mentor response (closing the loop — the PDF shows mentees' comments sitting unanswered "to be completed," which this makes visible/trackable instead of invisible).
- `GET /mentorship/checkins/inbox` (mentor-authenticated, `TEACHER_DASHBOARD`) — all check-ins for the mentor's assigned mentees, filterable by `status`, defaulting to `NEW` first — this is §requirement 4, "view all reported by mentees."
- `GET /mentorship/checkins/:id` (mentor-authenticated) — detail view; ownership-checked against `mentor_id`.
- `PATCH /mentorship/checkins/:id` (mentor-authenticated) — `{ status, mentor_response?, linked_session_id? }`, lets a mentor acknowledge/respond/link to the session where they addressed it (§requirement 5).
- New permission needed: mentee/student role currently may not have any reporting-adjacent permission at all — check what permission (if any) gates the student portal today (`Permissions` list doesn't show a `STUDENT_*` reporting one in the grep above) and add `SUBMIT_MENTEE_CHECKIN` scoped to the student role, rather than reusing `SUBMIT_REPORTING` (that one's semantics are "I am an instructor submitting a report," wrong actor).

### 4.3 Frontend — student side

- New component, e.g. `frontend/src/components/student/MentorCheckIn.tsx`, wherever the student-facing portal already lives (check `frontend/src/pages`/`components` for an existing student dashboard shell to slot into, rather than assuming a new top-level route) — a simple form (category + message) plus a history list of past submissions and any mentor reply, matching the PDF's "student comment and appreciation... to be completed" pattern but making it an actual persisted, visible exchange instead of a blank line in a document.
- If no student-facing portal exists yet in this codebase at all (worth confirming before this phase — the screenshot and both existing plans are entirely instructor/admin-facing), this becomes the **first** student-authenticated UI surface in the reporting module, which changes the effort estimate materially (see §7 risk register) — flag this explicitly to the team before estimating Phase 2's frontend work.

### 4.4 Frontend — mentor side

- `MentoringHub.tsx`: add a badge/indicator per mentee card showing unread check-in count (mirrors the existing "1 overdue" badge pattern already in the screenshot's header).
- New `MentorCheckInInbox.tsx` (or a tab inside `MentoringHub.tsx`) listing check-ins across all assigned mentees, sorted `NEW` first — the mentor-side "view all reported by mentees" requirement.
- `MentoringSessionModal.tsx` (993 lines already): when opening the modal for a student with open check-ins, surface them inline (similar to how `getMenteeIntelligence`'s "open challenges" are presumably already surfaced there today, per the existing pre-session-brief pattern) with a one-click "mark addressed, link to this session" action on save.

### 4.5 Testing

- Unit: check-in submission resolves `mentor_id` server-side only; a student with no active assignment gets a clear `422`, not a crash.
- Integration: student submits a check-in → mentor's inbox shows it under `NEW`; mentor patches status to `ADDRESSED` with a linked session → student's `GET /checkins/mine` reflects the update.
- Integration (cross-tenant): student A's check-in never appears in mentor B's inbox even if B mentors other students in the same class group as A (regression guard tied to the Phase 1 assignment-based access model).
- Manual/UAT: a real student account submits a check-in, a real mentor sees and responds to it within the existing Mentoring Hub flow without needing a page reload/separate app.

**Effort estimate:** 6-10 days if a student-authenticated portal shell already exists to build into; add 4-6 days if this phase must also stand up the first student-facing authenticated surface in this module (auth/routing/layout groundwork) — **resolve which case applies before committing to a number.**

---

## 5. Phase 3 — Admin visibility & periodic report generation

### 5.1 Extend admin mentoring log

- `getAdminMentoringLog`/`AdminMentoringLogView.tsx` already list every `MentorshipSession` (§requirement 6, mostly done). Extend:
  - Add `academic_year_id`/`mentor_id` filters backed by `MentorAssignment` (so admin can browse "who was assigned to whom" alongside "what sessions happened"), not just the current unfiltered/`student_id`-only query (`mentorshipController.ts:544-604`).
  - Add a second admin view/tab for `MenteeCheckIn` rows (from §4) — currently no admin visibility into mentee-submitted content at all; the PDF's "student comment and appreciation" is explicitly part of what admin oversight should be able to review, not just the mentor's own log.
  - Surface `MentorAssignment` roster gaps as a dashboard flag — "student with no active mentor assigned this year" — since the PDF shows real consequences (Analysis §1's non-engagement table) of assignment/engagement gaps going unnoticed.

### 5.2 Periodic report document generation

This is the artifact the PDF actually is — a per-mentor, per-period consolidated document. Mirrors the proven pattern from the Dashboard-download plan (§3-4 there), reusing the same client-side `jsPDF`/`jspdf-autotable` approach already working for `LessonReportRollupService.ts`/`SchemeReportService.ts`, rather than introducing a new document-generation library.

- Backend: `GET /mentorship/reports/consolidated?mentor_id&academic_year_id&academic_term_id` (mentor viewing their own, hard-scoped like the lesson-rollup pattern; admin variant takes `mentor_id` as a real filter). Returns, per mentee:
  - Roster/basics (from `MentorAssignment` + `UserProfile` + latest `AssessmentScore`s, matching the PDF's "Basics information" table),
  - The full `MentorshipSession` list for the period as the "Mentoring Plan Meeting Schedule" rows,
  - Any `MenteeCheckIn` rows with `category='APPRECIATION'` as the "Student comment and appreciation" section,
  - Aggregated flags (`follow_up_required` count, `dishonesty_flagged`/`stress_flag` occurrences) feeding a term-level "recommend for special follow up" summary — not a new manual checkbox, derived from data already logged, which is more reliable than the PDF's blank hand-filled field.
- Frontend: `MentorshipReportService.ts` (new, modeled directly on `LessonReportRollupService.ts`'s structure) renders one section per mentee, in the PDF's own layout order (basics → meeting log → student comment → recommendation), plus a cover page mirroring the PDF's "Overview/Objectives" boilerplate (static template text, editable by admin in a future iteration — not required for v1).
- A "Download my consolidated report" action in `MentoringHub.tsx` (mentor-facing) and a per-mentor download action in `AdminMentoringLogView.tsx` (admin-facing), following the exact button-placement precedent set in the Dashboard-download plan §4.2.

### 5.3 Mentorship dashboard widgets

`ReportingDashboard.tsx` already shows a "Mentorship Sessions" stat card and trend line (Restructure Plan, current state). Add, scoped to the logged-in mentor (and an admin-wide equivalent view):
- Overdue mentee count (reuses the `overdue` boolean already computed in `getAssignedStudents`).
- Open `MenteeCheckIn` count by status.
- Wellbeing distribution (STRUGGLING/CONCERNED/NEUTRAL/GOOD/EXCELLENT) as a simple bar, since `wellbeing_score`/`wellbeing_status` are already captured per session but never visualized anywhere today.

### 5.4 Testing

- Unit: consolidated-report data assembly against a fixture mentor with a mix of sessions/check-ins/flags — assert every PDF section gets populated or cleanly omitted (e.g. a mentee with zero check-ins shows an empty, not broken, "student comment" section).
- Integration: mentor A's consolidated report never includes mentor B's mentees even by ID-guessing on the query param (same ownership-guard pattern as the lesson-rollup route).
- Manual/UAT: generate a real consolidated report for a mentor with 18 assigned mentees across three years (mirroring the PDF's actual scale) and have an admin/academic-ops stakeholder compare it side-by-side against the real Rwanda Coding Academy reference PDF for structural fit — this is the acceptance test that matters most, same caveat as the Restructure Plan's Phase 3 (automated tests can't judge "does this look right").

**Effort estimate:** 8-12 days (document generation + admin views + dashboard widgets).

---

## 6. Explicitly out of scope for this plan

- **DOCX generation** — PDF-only via `jsPDF`, consistent with every other reporting document in this codebase; no current requirement calls for editable Word output.
- **AI-assisted analysis of mentee check-ins/comments** (sentiment, theme clustering) — the Restructure Plan deferred the equivalent for lesson reports "pending real usage data to justify it"; same call here.
- **Changing `MentorshipSession`'s existing per-session fields/shape** — Phase 2 adds a sibling table (`MenteeCheckIn`) specifically to avoid touching this working, already-tested path.
- **Retiring/changing `TeacherSubjectAssignment`** — Phase 1 only stops *reusing* it for mentorship access; it continues to drive actual subject-teaching assignment exactly as today.
- **Parent/guardian-facing visibility** — the PDF lists parent/guardian contact info per mentee, but nothing in the user's 7 requirements asks for a parent-facing surface; flagging it as a plausible Phase 4 if it comes up, not building it now.

---

## 7. Risk register

| Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| No student-authenticated portal exists yet anywhere in this app to build Phase 2's UI into | 2 | Medium | High (changes effort estimate materially) | Confirm this **before** estimating Phase 2 as a fixed number — see §4.3's explicit flag |
| `MentorAssignment` unique-active-per-year constraint isn't expressible as a real DB constraint on the target MySQL version | 1 | Medium | Low | Enforce at the application layer (check-then-insert in a transaction) if a partial/filtered unique index isn't available; document this as a known race-condition-under-concurrency risk, mitigated by the fact that assignment is an infrequent admin action, not a hot path |
| Rewiring `getAssignedStudents`/`verifyStudentAccess` off `TeacherSubjectAssignment` breaks an existing mentor's access mid-year if admin hasn't backfilled `MentorAssignment` yet | 1 | High | High | Ship a backfill migration that seeds `MentorAssignment` from *today's* inferred `TeacherSubjectAssignment → ClassGroup → StudentClassGroup` relationships for the current academic year, so no mentor loses access on cutover; require an admin to explicitly manage assignments only going forward |
| `MentoringHub.tsx`'s current card-grid UI (verified only at n=1 in the screenshot) doesn't scale visually to real rosters of 18+ mentees | 1 | Medium | Medium | Explicit UAT check-in point at the end of Phase 1 (§3.4) before Phase 2/3 build further UI on top of it |
| Consolidated-report PDF structurally diverges from stakeholder expectations set by the real reference document | 3 | Medium | Medium | Mandatory human side-by-side sign-off before calling Phase 3 done, same caveat already proven necessary in the Restructure Plan |

---

## 8. Timeline roll-up

| Phase | Effort estimate | Hard dependency on |
|---|---|---|
| 1 — Explicit mentor-mentee assignment | 5-7 days | none — start immediately |
| 2 — Student-facing mentee reporting | 6-10 days (+4-6 if no student portal shell exists) | Phase 1 (assignment table is the access-control backbone) |
| 3 — Admin visibility & periodic report generation | 8-12 days | Phase 1 (roster data) + Phase 2 (check-ins feed the report) |

**Critical path: ~19-29 working days**, before accounting for the Phase 2 student-portal unknown. Phases 1 and the admin-log-filter portion of Phase 3 (§5.1) can start in parallel once Phase 1's schema lands; the document-generation work (§5.2) is a hard dependency on both prior phases' data existing.

---

## 9. Definition of Done — whole project

- [ ] Admin can assign/reassign/end mentor-mentee relationships per academic year; every mentor's roster and session-logging access derives from this, not from subject-teaching assignments.
- [ ] A student can submit a check-in/comment that reaches their actual assigned mentor, and see any response — the first two-way, student-authored surface in this reporting module.
- [ ] A mentor has a single inbox view of everything their mentees have submitted, can act on it, and can link it to a logged session.
- [ ] Admin can browse all mentor-submitted sessions **and** all mentee-submitted check-ins, filterable by academic year and mentor.
- [ ] A mentor (and admin, per-mentor) can download a consolidated periodic PDF report structurally matching the Rwanda Coding Academy reference document, signed off by a human stakeholder against the real reference.
- [ ] Mentorship-specific dashboard widgets (overdue, open check-ins, wellbeing distribution) are live on the existing Dashboard tab.
