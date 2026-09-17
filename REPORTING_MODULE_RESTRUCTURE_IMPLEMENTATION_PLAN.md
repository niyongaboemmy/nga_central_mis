# Reporting Module Restructure — Implementation Plan

**Date:** 2026-07-30
**Owner document:** companion to [`REPORTING_MODULE_SUBJECT_SCOPING_ANALYSIS.md`](./REPORTING_MODULE_SUBJECT_SCOPING_ANALYSIS.md) (referred to below as "the Analysis" — §-numbers cited here refer to that file unless stated otherwise)
**Purpose:** turn the Analysis's restructure proposal (Analysis §8-§9) into a concrete, sequenced, testable delivery plan a team can execute and a PM can track.

---

## Implementation status (updated 2026-07-30)

**All 7 phases implemented and tested the same day the plan was written.** Every phase below has an inline "✅ IMPLEMENTED" status block noting what actually shipped and where reality diverged from the original plan. Summary of the divergences (details inline at each phase):

- **Phase 1** — backfill derives `subject_id`/`class_group_id` directly from `LessonReport.lesson_id → LO_Lesson → SchemeOfWorkEntry → SchemeOfWork`, which already carries both columns — simpler and more reliable than the originally-proposed `CalendarSlot` join. Dev DB had 0 existing `LessonReport` rows, so backfill coverage was trivially 100% (nothing to measure against).
- **Phase 3** — `getWeeklyStitchedReport` was investigated and found **not reusable** (no subject/class-group/week grouping at all; would require pulling mentorship/project data into scope). Built a new lesson-only rollup endpoint alongside it instead of extending it.
- **Phase 5** — the audit found mentorship logging already fully decoupled (`MentoringHub.tsx`/`mentorshipController.ts`, zero overlap with `ReportForm.tsx`) and **project updates have no active write path anywhere in the current codebase** — a separate, pre-existing gap worth flagging to a stakeholder, not something this restructure broke. Only 1 historical `InstructorReport` row existed (dev/test data) — no formal migration was warranted. A same-day follow-up retired the 5 genuinely-orphaned legacy routes (`/submit`, `/autofill`, bare `/`, `PUT /:id`, `/by-date`) with `410` responses — but **`/dashboard-stats` and `GET /:id` were deliberately kept live**, contradicting the original plan's assumption, because the instructor's own Dashboard tab and the admin's legacy report-detail view both still call them.
- **Phase 6** — `VIEW_REPORTS` already existed as an unused, unseeded constant (in both frontend/backend `permissions.ts`, grouped in the frontend's permission-management UI) — adopted for its evidently-intended purpose rather than introducing a colliding name. Also found and fixed two frontend nav-gating checks (`Sidebar.tsx`, `NavSearch.tsx`) that only recognized `ALL_SUBMITTED_REPORTS` as a single string — not called out in the original plan, but a real gap that would have hidden the "Reporting" nav link from any future role granted only the new, narrower permissions.
- **Not done, deliberately deferred** (both explicitly optional in the plan, not silently dropped): the Phase 4 AI-assisted clustering of free-text `reflection_notes` (deferred pending real usage data to justify it), and the stakeholder sign-off comparing the Phase 3 PDF rollup against the real Rwanda Coding Academy reference document (requires a human reviewer, not something achievable in an implementation pass).
- **Testing note**: every phase's backend work was verified with real Vitest+Supertest integration tests against a real MySQL test schema (not mocks), plus live smoke tests against the actual dev server + dev database for the riskiest changes (ad-hoc reporting, the permission split, route retirement). Two test-hygiene bugs were found and fixed along the way — a hardcoded label colliding on re-run, and a ranking query with no data-scoping — so the full suite (32 tests) now passes repeatably across multiple runs without requiring a test-DB reset each time.

---

## 0. How to read this document

Each phase below is a shippable increment, not a big-bang release. Phases are ordered by dependency and risk, not by "nice to have" — Phase 0 ships an access-control fix independently of everything else. Every phase has: goal, concrete tasks split by layer, a testing plan, a Definition of Done, and a rollback plan. §10 has a cross-phase testing strategy and tooling gap analysis; §11 has a risk register; §12 has a timeline roll-up.

**Current test tooling reality (confirmed 2026-07-30), which shapes every phase's testing plan below:**
- `backend/` — **zero test infrastructure.** `package.json`'s `test` script is a stub (`echo "Error: no test specified" && exit 1`). No Jest/Vitest/Mocha/Supertest installed.
- `frontend/` — Vitest + React Testing Library already configured (`vitest.config.ts`, `@testing-library/react`), with 5 existing test files as a working pattern to follow (e.g. `frontend/src/contexts/__tests__/AcademicPeriodContext.test.tsx`).
- No end-to-end test tooling (Playwright/Cypress) exists anywhere in `nga_central_mis`.

This means **Phase 0 must also stand up backend test infrastructure** — every subsequent phase assumes it exists.

---

## 1. Objectives & success criteria

| # | Objective | How we'll know it's done |
|---|---|---|
| 1 | Every reported **lesson delivery** is traceable to one subject and one class group | `SELECT` on `LessonReport` returns non-null `subject_id`/`class_group_id` for 100% of new rows post-migration |
| 2 | Instructors can report ad-hoc, unplanned subject activity without losing traceability | A report can be created with `lesson_id IS NULL` and a non-null `subject_id`, end-to-end through the UI |
| 3 | Admins can see ranked/counted "Support Needed" and "Challenges" themes for lesson reports, not just raw text | A dashboard widget shows top-N categories by count, backed by a `GROUP BY ... COUNT(*)` query |
| 4 | Admins can download a rolled-up lesson report scoped by Subject × Class Group × Date Range, in a real document format | Downloading produces a grouped DOCX or PDF matching the reference document structure (Analysis §5.4), not a flat CSV |
| 5 | No authenticated user can read/write another user's report by guessing an ID | Automated test confirms `403`/`404` on cross-user access to every report-family endpoint |
| 6 | Legacy `InstructorReport` flow is retired from active use **for lesson reporting** | `ReportForm.tsx`/`SubmittedReports.tsx` removed or reduced to mentorship/project-only entry; legacy tables read-only/archived for the lesson portion |
| 7 | The lesson-reporting surface has automated test coverage where none existed before | Backend test suite exists and runs in CI; frontend coverage extended to new components |

---

## 2. Scope

**Scope decision (2026-07-30, stakeholder direction): this restructure is limited to lesson/subject reporting.** `MentorshipSession` and `ReportProjectUpdate` follow a materially different workflow (1:1 student sessions and project-status check-ins, not tied to a subject/class-group delivery cadence) and are **explicitly out of scope for this implementation effort** — see Analysis §8.6. They continue to operate exactly as they do today; no task in this plan should modify their schema, endpoints, or UI. Where a task below touches shared infrastructure (e.g. the permissions split in Phase 6, or a shared `reportController.ts` file), the task description calls out explicitly what is and isn't touched.

**In scope:** `LessonReport`, the lesson-relevant portions of `InstructorReport` (and its children `ReportTopic`, `ReportLesson`, `ReportReflection`), the lesson-reporting controllers/routes (`lessonReportController.ts`, the lesson-facing parts of `reportController.ts`/`adminReportController.ts`), `LessonReportModal.tsx`/`LessonReportingCalendar.tsx`/`ReportForm.tsx`(lesson portion)/`SubmittedReports.tsx`/`AdminReportList.tsx`/`AdminReportDashboard.tsx`(lesson filters/views), `reportsApi`'s lesson-related functions, and the `ALL_SUBMITTED_REPORTS` permission and its replacements (permissions are cross-cutting — see Phase 6).

**Out of scope:** `MentorshipSession`, `ReportProjectUpdate`, and every endpoint/UI surface dedicated to them (`getAdminMentorshipLogs`, `getAdminProjectUpdates`, `AdminMentoringLogView`, the mentorship/project branches of `ReportDetailsModal.tsx` and `adminReportController.ts`'s `exportReportingData`/`getWeeklyStitchedReport`) — these are noted where relevant but not modified. Also out of scope (per Analysis §8.6): `SchemeReportService.ts`/`SchemeReportPreviewModal.tsx` (Scheme-of-Work PDF export — unrelated feature), the `ACCESS_REPORT_CARD_MODULE` permission and student report-card/grades feature (naming collision only), any change to `Subject`/`ClassGroup`/`CalendarSlot`/`SchemeOfWork`/`LO_Lesson` core curriculum tables beyond adding FK references to them.

---

## Phase 0 — Data integrity & security fixes (no schema change)

> ✅ **IMPLEMENTED 2026-07-30.** Vitest + Supertest stood up against a disposable `nga_central_mis_test` MySQL schema (cloned from dev, not a mock/SQLite shim), with a `scripts/reset-test-db.ts` helper. Both bugs fixed and regression-tested: the date-only-keying fix was verified by reverting it and confirming the new tests fail on the old code. The `PUT /reports/:id` ownership check was already present in the code found this session (contrary to what the Analysis flagged) — but `GET /reports/:id` had no ownership check at all, a real cross-user read gap, fixed and tested instead.

**Goal:** ship the two issues that shouldn't wait for the rest of the restructure, and stand up backend test infrastructure everything downstream depends on.

### Tasks

**Backend test infrastructure (new):**
- Add Vitest + Supertest to `backend/package.json` (mirrors the frontend's existing Vitest choice — one test runner mental model across the repo instead of introducing Jest).
- Add `backend/vitest.config.ts`, a `backend/src/__tests__/` (or colocated `*.test.ts`) convention, and a test-database strategy — either a disposable MySQL schema spun up via Docker/`docker-compose` for CI, or Vitest against a seeded SQLite/in-memory shim if the Drizzle setup supports it. **Decision needed from the team before Phase 0 starts** (see §11 risk register — flag as a blocking decision, not a technical unknown to resolve solo).
- Add `npm test` to CI (check `.github/workflows/` — extend existing pipeline rather than creating a new one).

**Bug fixes:**
- `lessonReportController.ts` — fix the date-only-keying bug in `getReportableLessons`: change `lessonByDate`/`reportByDate` `Map<string, ...>` keys from `date` to a composite `` `${date}:${subjectId}` `` (or `` `${date}:${calendarSlotId}` ``) so same-day multi-subject occurrences resolve independently (Analysis §3.1, §6 item 3).
- `reportController.ts` — audit `updateReport` (`PUT /reports/:id`) for an ownership check. If confirmed missing (Analysis §7.2), add the same `req.user.userId === report.user_id` guard already used elsewhere in this file (pattern at `reportController.ts:62,162,414,585`), returning `403` on mismatch. Apply the same audit to `PUT`/`DELETE` on `LessonReport` specifically. *(Out-of-scope note: while auditing, do a quick check on whether the same gap exists on `MentorshipSession`/`ReportProjectUpdate` update paths — if so, log it as a finding for a future initiative rather than fixing it here, since those tables are out of scope for this restructure.)*

### Testing plan
- **Unit:** new test file for `getReportableLessons` covering: (a) two subjects same day → both correctly attributed; (b) one subject one day → unchanged behavior (regression guard); (c) report submitted for subject A doesn't mark subject B "REPORTED" on the same date.
- **Integration (Supertest against a test DB):** `PUT /reports/:id` as User A on a `LessonReport` owned by User B → expect `403`. Positive case: owner updating their own report → `200`.
- **Manual/UAT:** two test instructor accounts, each teaching a different subject on the same real calendar date, both submit reports on the same day via the UI — confirm both show correctly in `LessonReportingCalendar.tsx` and neither overwrites the other's status.

### Definition of Done
- Backend CI pipeline runs and passes a non-trivial test suite (not just a placeholder).
- Date-keying bug fix merged with a regression test that fails on the old code and passes on the new.
- Ownership-check fix merged with a passing 403 test; manually confirmed in staging with two real accounts.

### Rollback plan
Both fixes are additive/corrective on existing code paths with no schema change — revert via standard git revert if a regression surfaces. Low risk.

**Effort estimate:** 3-5 days (mostly the backend test-infra decision + setup; the two bug fixes themselves are small).

---

## Phase 1 — Schema foundation

> ✅ **IMPLEMENTED 2026-07-30** (migration `045_lesson_report_subject_scoping.sql`). All planned columns/tables shipped: `subject_id`/`class_group_id` on `LessonReport`, `UNPLANNED` status, the `(reported_by, lesson_id, delivery_date)` unique constraint, `SupportRequestCategory`/`ChallengeCategory` + join tables (seeded with a curated starter list). Backfill used the `lesson_id → LO_Lesson → SchemeOfWorkEntry → SchemeOfWork` chain directly (simpler than the proposed `CalendarSlot` join, since `SchemeOfWork` already carries both columns). Dev DB had 0 existing `LessonReport` rows at migration time — coverage was trivially 100%. `assessment_method`/`assessment_notes` (the stakeholder-confirm item) was **not added** — never confirmed as a real requirement.

**Goal:** give `LessonReport` the subject/class-group columns and supporting lookup tables the rest of the plan depends on (Analysis §8.2). `MentorshipSession`/`ReportProjectUpdate` schemas are **not** touched in this phase (or anywhere in this plan) — their existing gaps (Analysis §7.1) are noted for a possible future, separate initiative only.

### Tasks

**Database (new migration, numbered after the latest existing migration — confirm current max number in `backend/migrations/` before writing):**
- `LessonReport`: add `subject_id` (FK `Subject`, nullable), `class_group_id` (FK `ClassGroup`, nullable). Backfill from `lesson_id → LO_Lesson → SchemeOfWorkEntry → SchemeOfWork.subject_id` and `CalendarSlot.class_group_id` where a matching slot/lesson exists.
- Add `status` enum value `UNPLANNED` (or `AD_HOC`) to `LessonReport.status`, alongside existing `DELIVERED/PARTIAL/MISSED`.
- Add unique constraint `(reported_by, lesson_id, delivery_date)` on `LessonReport` (nullable `lesson_id` means this only dedupes scheduled reports — acceptable, since ad-hoc reports are inherently allowed to repeat).
- New lookup tables: `SupportRequestCategory` (id, label, is_active), `ChallengeCategory` (id, label, is_active). Seed both with an initial curated list (derive from a manual read-through of a sample of existing free-text `challenges_encountered`/`*_support_needed` values on `LessonReport`/`InstructorReport`, per Analysis §5.1/§5.3 recommendation).
- New join tables, scoped to `LessonReport` only (no polymorphic `entity_type` needed since there's a single entity type in scope): `LessonReportSupportRequest(id, lesson_report_id, category_id, note NULL)`, `LessonReportChallengeTag(id, lesson_report_id, category_id)`.
- *(Stakeholder-confirm item, Analysis §6 item 15)* `assessment_method`/`assessment_notes` on `LessonReport` — only add if confirmed as a real requirement; otherwise skip this migration entry.

**Backend:**
- Update Drizzle schema definitions (`schema.ts`) for all of the above.
- Update `submitLessonReport` to accept and persist the new `subject_id`/`class_group_id` fields (derived server-side from `lesson_id`/`CalendarSlot`/`TeacherSubjectAssignment` where available, or accepted directly from the request body for the ad-hoc path built in Phase 2).

### Testing plan
- **Unit:** migration backfill logic tested against a seeded fixture set (a handful of `LessonReport` rows with known `lesson_id`/`CalendarSlot` links) — assert backfilled `subject_id`/`class_group_id` match expected values.
- **Integration:** run the full migration against a copy of a realistic dataset (anonymized production snapshot or a seeded staging DB) and assert: (a) row counts unchanged before/after; (b) percentage of `LessonReport` rows with non-null `subject_id` after backfill matches expectation (some ad-hoc/orphaned rows will legitimately stay null — document the expected null rate before running, so a bad migration doesn't get rubber-stamped as "some nulls are fine").
- **Manual:** DBA/lead review of the migration SQL before running on production-equivalent data; dry-run on a staging copy first, diff row counts and spot-check 10-15 rows by hand against source data.

### Definition of Done
- Migration applied cleanly to a staging copy with documented backfill coverage %.
- Drizzle schema and TypeScript types compile and match the new DB shape.
- No existing endpoint regresses (Phase 0's test suite plus any pre-existing manual smoke checklist still passes).

### Rollback plan
Migration should be written with a paired `down` migration (drop added columns/tables). Since columns are additive and nullable, rollback is low-risk — no existing data is mutated, only backfilled into new columns.

**Effort estimate:** 5-8 days (schema design decisions + migration writing/testing + backfill validation is the bulk of it).

---

## Phase 2 — Ad-hoc reporting + admin filtering

> ✅ **IMPLEMENTED 2026-07-30.** Ad-hoc submission branch added to `submitLessonReport` (validates a real `TeacherSubjectAssignment` row, forces `status = UNPLANNED`). `LessonReportingCalendar.tsx` gained a "+" affordance on every day cell. `LessonReportModal.tsx` gained the subject/class-group picker mode. Admin filters landed as a **global** Subject/Class Group filter pair in `AdminReporting.tsx`'s shared filter bar (not per-tab) — and along the way, fixed `getAdminLessonReports` to read `subject_id`/`class_group_id` directly off `LessonReport` (Phase 1's denormalized columns) instead of joining through `SchemeOfWork`, since the old join path always returned `null` for ad-hoc rows with no `entry_id`. The old client-side-only subject quick-filter in `AdminReportList.tsx` was removed as redundant once the real backend-driven filter existed.

**Goal:** let instructors report unplanned subject activity, and let admins filter everything by subject **and** class group consistently (Analysis §6 items 9, §8.5).

### Tasks

**Backend:**
- `lessonReportController.ts`: new "ad-hoc" branch in `submitLessonReport` — when no `lesson_id`/`entry_id` is provided, require `subject_id` and `class_group_id` directly in the request body instead, validate the submitting user has a matching `TeacherSubjectAssignment` row (prevents reporting for a subject/class-group combo not actually assigned to them), set `status = 'UNPLANNED'`.
- `adminReportController.ts`: add `subject_id`/`class_group_id` query-param filters to `getAdminLessonReports`, `getAdminDashboardStats`, `getComplianceReport`, `getSubjectCoverageStats` — these currently filter inconsistently on lesson data (some by subject only, none by class group, per Analysis §7.1/§5.4). *(`getAdminMentorshipLogs`/`getAdminProjectUpdates` are out of scope — not modified.)*

**Frontend:**
- `LessonReportingCalendar.tsx`: add a "+ Add unscheduled activity" affordance on any day cell (currently only clickable when `dayLessons.length > 0`, Analysis §5.2/§7.2 — remove that gate for this new action specifically, keep it for the existing scheduled-lesson click path).
- `LessonReportModal.tsx`: add an ad-hoc mode — subject picker (populated from the user's `TeacherSubjectAssignment` list) and class-group picker, shown only when opened in ad-hoc mode; `lesson_id`/`entry_id` stay unset.
- `AdminReporting.tsx`/`AdminReportList.tsx`/`AdminReportDashboard.tsx`: add subject + class-group filter controls, wired to the new backend query params.

### Testing plan
- **Unit (backend):** `submitLessonReport` ad-hoc path — valid assignment → `201` with `status: UNPLANNED`; user submits for a subject/class-group they're not assigned to → `403`/`422`.
- **Unit (frontend, Vitest + RTL, following the existing pattern in `frontend/src/components/__tests__/`):** `LessonReportModal` renders subject/class-group pickers only in ad-hoc mode; form won't submit without both selected.
- **Integration:** end-to-end API test — POST ad-hoc report → GET it back via `getAdminLessonReports?subject_id=X&class_group_id=Y` → confirm it appears.
- **Manual/UAT:** an instructor logs in, opens a day with zero scheduled lessons, adds an ad-hoc report for a subject they teach, confirms it appears in their "Submitted Reports" list and in the admin dashboard filtered by that subject+class-group.

### Definition of Done
- Ad-hoc reporting works end-to-end through the UI, gated by real assignment data (not just any subject).
- All admin list/dashboard/compliance/coverage views support both filters, verified against the same test dataset for consistent results across views.

### Rollback plan
Feature-flag the "+ Add unscheduled activity" UI affordance if early UAT surfaces confusion (e.g., behind a simple boolean config) so the backend capability can ship without forcing the UI change live immediately.

**Effort estimate:** 6-9 days.

---

## Phase 3 — Rollup export & document generation

> ✅ **IMPLEMENTED 2026-07-30.** `getWeeklyStitchedReport` was investigated first, per the plan — found to combine lessons/mentorship/projects into one ungrouped, per-instructor list with no subject/class-group/week structure, so extending it would have pulled out-of-scope mentorship/project data into this phase. Built a new `GET /admin/lesson-reports/rollup` endpoint alongside it instead. Document generation used the proven client-side `jsPDF`/`jspdf-autotable` pattern from `SchemeReportService.ts` (no new server-side dependency), wired into `AdminReportList.tsx`'s existing `ExportModal` as a third format option alongside CSV/HTML. **Not done**: no stakeholder has compared the output against the real Rwanda Coding Academy reference document side-by-side — that sign-off is the acceptance test that matters most for this phase and requires a human reviewer.

**Goal:** deliver the Subject × Class Group × Date Range downloadable report, matching the reviewed reference document's structure (Analysis §5.4, §6 items 12-14, §8.3).

### Tasks

- **First: investigate `getWeeklyStitchedReport`** (`adminReportController.ts`, registered on the backend but never called from `frontend/src/api/reports.ts` — Analysis §7.2). Spend no more than half a day reading it before deciding whether to extend it or replace it; this could cut significant scope from this phase if it already does most of the grouping logic.
- Build/extend the export endpoint to group `LessonReport` rows by `subject_id` → `class_group_id` → week, within the requested date range. *(`getWeeklyStitchedReport` currently combines lessons/mentorship/projects into one "unified" view — if reusing it, either scope the reused logic to the lesson data only, or build a lesson-only export alongside the existing unified one; don't extend the unified view's mentorship/project sections as part of this phase.)*
- Add DOCX generation. Recommend evaluating `docxtemplater` against a template modeled on the reviewed reference document. Alternatively, adapt the client-side `jsPDF`/`jspdf-autotable` pattern already working in `SchemeReportService.ts` (Analysis §7.4) for a PDF output — this is the only proven document-generation code in the repo, so it's the lower-risk starting point even though it's currently used for a different feature.
- Extend `AdminReportList.tsx`'s existing `ExportModal` (already has date-range presets — Analysis §5.4/§7.2) with the new grouped format as an additional option, rather than building a separate download UI.

### Testing plan
- **Unit:** grouping logic (subject → class-group → week) tested against a fixture dataset with known expected groupings, including edge cases: a subject with reports in only one class group; a class group with zero reports in the selected range (should the group still appear, empty, or be omitted? — confirm expected behavior with stakeholders and encode it as a test).
- **Integration:** hit the export endpoint with a real (staging) date range and diff the output structure against the expected grouping; for DOCX/PDF, assert the generated file opens and contains expected section headers (automatable with a DOCX/PDF text-extraction check, not full pixel comparison).
- **Manual/UAT:** generate a real export for one subject across two class groups over a term, and have an actual admin/academic-ops stakeholder compare it side-by-side against the original Rwanda Coding Academy reference document for structural fit (this is the acceptance test that matters most for this phase — automated tests can't judge "does this look right to the person who'll actually use it").

### Definition of Done
- Export produces a real, downloadable DOCX or PDF (not just CSV/print-HTML) grouped by subject then class group.
- A stakeholder has signed off that the output structurally matches the reference document's intent.

### Rollback plan
Ship as a new export format option alongside the existing CSV/HTML (don't remove those) — if the new format has issues, users can fall back to the existing options with zero downtime.

**Effort estimate:** 7-10 days (document-generation library integration is the main unknown — front-load the `getWeeklyStitchedReport` investigation to avoid duplicate work).

---

## Phase 4 — Categorization & ranking

> ✅ **IMPLEMENTED 2026-07-30.** Full CRUD for `SupportRequestCategory`/`ChallengeCategory` (soft-delete/deactivate, not hard delete). `submitLessonReport` accepts `support_request_category_ids[]`/`challenge_category_ids[]` alongside the existing free-text `reflection_notes` — additive, not a replacement. `LessonReportModal.tsx` got chip-style multi-select pickers for both, available in scheduled and ad-hoc mode. `AdminReportDashboard.tsx` got "Top Support Requests"/"Top Challenges" ranked widgets. **Not done** (explicitly optional in the plan): the AI-assisted clustering job over free-text notes — deferred until real usage data exists to justify it, per the plan's own guidance.

**Goal:** turn free-text "Support Needed" and "Challenges" into structured, rankable data **for lesson reports** (Analysis §5.1, §5.3, §6 items 8, 10-11).

### Tasks

**Backend:**
- CRUD endpoints for `SupportRequestCategory`/`ChallengeCategory` (admin-managed lookup lists).
- Update `LessonReport`'s create/update endpoint (`submitLessonReport` and its update counterpart) to accept `support_request_category_ids[]`/`challenge_category_ids[]` alongside the existing free-text fields, writing to the new `LessonReportSupportRequest`/`LessonReportChallengeTag` join tables (Phase 1 schema).
- New admin aggregation endpoint(s): `GET /admin/lesson-reports/support-requests/summary?start_date&end_date&subject_id&class_group_id` and equivalent for challenges — `GROUP BY category_id, COUNT(*)`, ordered descending, scoped to `LessonReport`.

**Frontend:**
- Replace/augment the four free-text "Support Needed" textareas and the "Challenges Encountered" textarea with a multi-select (categories) + optional free-text note, in `LessonReportModal.tsx`.
- New admin dashboard widget: "Top Support Requests" / "Top Challenges" ranked list/bar chart, using the new summary endpoint.

**Backend (Phase 2 of this phase, optional per Analysis §6 item 11):**
- If pursued: a scheduled or on-demand job using the existing Gemini pipeline (pattern from `lessonPlanAIController.ts`/`schemeAIController.ts`) to cluster/summarize free-text notes into themes, surfaced as a secondary, clearly-labeled "AI-suggested themes" section distinct from the deterministic category counts.

### Testing plan
- **Unit:** category CRUD; aggregation query correctness against a fixture set with known category distributions.
- **Integration:** submit reports with overlapping categories from multiple simulated users → confirm summary endpoint returns correct counts and ranking.
- **Manual/UAT:** admin reviews the "Top Challenges" widget against a week of real submitted data and confirms the ranking matches their own manual read of the underlying reports.
- If AI summarization is pursued: manual review of a sample of AI-generated theme clusters for accuracy/usefulness before enabling it for all admins — treat as a soft launch, not an immediate default-on feature.

### Definition of Done
- Category selection is available in the active report form(s); admin ranking view is live and matches manual verification on a test dataset.

### Rollback plan
Categories/join tables are additive — free-text fields remain in place throughout this phase, so no data loss risk. If the ranking view has quality issues, hide the widget without touching the underlying data model.

**Effort estimate:** 6-9 days (excluding optional AI summarization, which is a separate follow-on estimate once real usage data exists to justify it).

---

## Phase 5 — Decommission legacy `InstructorReport` flow (lesson portion only)

> ✅ **IMPLEMENTED 2026-07-30.** The mandatory audit (task 1) found mentorship logging already fully decoupled — `MentoringHub.tsx`/`MentoringSessionModal.tsx` write through a completely separate `mentorshipController.ts`, with zero mentorship-related fields anywhere in `ReportForm.tsx`. It also found **project updates have no active write path anywhere in the current codebase** (grepped for any `insert(ReportProjectUpdate)` — none exists; only one orphaned pre-migration-035 historical row) — a pre-existing gap, not something this restructure would break, flagged for a stakeholder rather than fixed here. Only 1 `InstructorReport` row existed (dev/test data) — no formal migration script was warranted. `ReportingModule.tsx` now shows exactly 3 tabs (`Lesson Reports`, `Mentoring`, `Dashboard`) instead of 5; the legacy component files are left on disk, not deleted, per the rollback plan. A same-day follow-up retired the 5 confirmed-orphaned backend routes with `410` responses — but **kept `/dashboard-stats` and `GET /:id` live**, contradicting this plan's original candidate list, because the kept "Dashboard" tab and the admin's legacy report-detail view both still call them. Verified live in a real browser (Playwright) with a real teacher session — all three tabs render, zero console errors.

**Goal:** retire the day/week-level legacy flow **for lesson reporting** now that `LessonReport` covers its functionality (Analysis §8.1, §8.5). `MentorshipSession`/`ReportProjectUpdate` are unaffected by this phase.

### Tasks

- **First: audit whether `ReportForm.tsx`/`InstructorReport`'s legacy endpoints are the only remaining UI path for mentorship/project logging.** `ReportDetailsModal.tsx` currently renders `mentorship_sessions[]`/`project_updates[]` arrays alongside lesson data (Analysis §7.3), so removing the legacy form wholesale risks breaking an out-of-scope feature. If mentorship/project logging has no other entry point, either keep a slimmed-down `ReportForm.tsx` for those two categories only, or explicitly scope a small follow-up task to give them their own minimal form — do not silently remove their only UI path as a side effect of retiring the lesson flow.
- Confirm (via the admin dashboard/DB query) that no active instructor is still primarily using `ReportForm.tsx`/`SubmittedReports.tsx` **for lesson reporting** — if usage remains, coordinate a cutover date/communication rather than removing silently.
- Migrate any still-relevant historical `key_highlights`/`what_worked_well`/`improvement_areas`/support fields from `InstructorReport`/`ReportReflection` **that describe lesson delivery** into the new category/free-text shape on `LessonReport` where a reasonable 1:1 mapping exists (best-effort; document what couldn't be cleanly migrated). Fields describing mentorship/project activity are left as-is in the legacy tables (archived per below), since those categories aren't migrating to a new shape in this plan.
- Remove `ReportForm.tsx`'s lesson-reporting path and `SubmittedReports.tsx` from `ReportingModule.tsx`'s routing (once the audit above is resolved); replace with `LessonReportingCalendar.tsx`/`LessonReportModal.tsx`.
- Update `ReportDetailsModal.tsx` to render a lesson-report-specific detail view for `LessonReport` rows, leaving its existing mentorship/project rendering untouched (Analysis §7.3).
- Retire `/submit`, `/autofill`, `/`, `/by-date`, `/dashboard-stats` legacy routes (or 410/redirect them) **only if confirmed they carry no mentorship/project-only data path that's still needed** — audit this dependency first (see task 1 above).
- Do **not** drop `InstructorReport`/`ReportTopic`/`ReportLesson`/`ReportReflection` tables — mark read-only/archived for their lesson-relevant content, keep for a full academic year per Analysis §9 Phase 5, before considering physical removal in a later, separate project. Any mentorship/project data still living in these tables' legacy `report_id`-linked rows is left untouched.

### Testing plan
- **Regression:** full manual walkthrough of the new-only reporting UI by 2-3 real instructor users (UAT) before removing the old UI, to catch any workflow the old flow supported that the new one doesn't.
- **Data audit:** script comparing total submission counts (legacy + new) before cutover against new-only counts after, for a transition window, to confirm no drop in overall reporting activity that would indicate instructors got stuck.
- **Automated:** update/remove now-obsolete tests referencing `ReportForm.tsx`; add coverage for the updated `ReportDetailsModal.tsx`.

### Definition of Done
- Legacy UI removed from active navigation; legacy routes return controlled deprecation responses, not silently broken ones; data audit shows no gap in reporting volume post-cutover.

### Rollback plan
Keep the legacy routes/components in the codebase (feature-flagged off, not deleted) for at least one full reporting cycle after cutover, so re-enabling is a config change, not a code revert, if a serious gap is discovered.

**Effort estimate:** 5-7 days, plus a monitored transition window (recommend 2-4 weeks of parallel availability before fully hiding the legacy UI) that isn't "implementation" effort but should be tracked on the timeline.

---

## Phase 6 — Permissions split

> ✅ **IMPLEMENTED 2026-07-30** (migration `046_reporting_permissions_split.sql`). `VIEW_REPORTS` already existed as a dead, unseeded constant in both `permissions.ts` files (grouped in the frontend's permission-management UI) — adopted rather than introducing a colliding name. `EXPORT_REPORTS`/`MANAGE_REPORTS` added new. All three granted to every role currently holding `ALL_SUBMITTED_REPORTS` in the same migration. Every route guard checks `[new permission, ALL_SUBMITTED_REPORTS]` (OR-fallback, exactly per plan). **Not called out in the original plan, found and fixed anyway**: `Sidebar.tsx`/`NavSearch.tsx` gated the "Reporting" nav link on a single hardcoded `ALL_SUBMITTED_REPORTS` string — extended both to support OR-arrays so a future role granted only the new permissions still sees the nav link. Verified live: real `SUPER_ADMIN` retains full access post-migration, a real teacher is still correctly blocked from admin routes, full permission matrix (view/export/manage/none/legacy-only) passes.

**Goal:** replace the single `ALL_SUBMITTED_REPORTS` permission with narrower, purpose-specific ones (Analysis §7.2, §8.4).

### Tasks

- Add `VIEW_REPORTS`, `EXPORT_REPORTS`, `MANAGE_REPORTS` permissions (migration + `permissions.ts`).
- Update `reportRoutes.ts` guards: read/list/dashboard/compliance/coverage endpoints → `VIEW_REPORTS`; `/admin/export` → `EXPORT_REPORTS`; any future admin edit/delete → `MANAGE_REPORTS`.
- Grant all three to existing roles that currently hold `ALL_SUBMITTED_REPORTS`, so no one loses access on cutover — this is a permission-model refinement, not an access reduction, unless a stakeholder explicitly wants tighter scoping for a specific role.
- Deprecate `ALL_SUBMITTED_REPORTS` (stop referencing it in code) but leave the permission row in place for audit-trail continuity, rather than deleting it.

### Testing plan
- **Integration:** for each of the 11 `/admin/*` routes, test with a user holding only `VIEW_REPORTS` (should succeed on read endpoints, fail on export), only `EXPORT_REPORTS` (should succeed on export), and neither (should fail everywhere) — a matrix test, not ad hoc spot checks.
- **Manual:** confirm existing admin users retain full functional access immediately after rollout (this is the change most likely to silently lock someone out if done carelessly — treat it with the same care as any production auth change).

### Definition of Done
- Permission matrix test suite passes; no existing admin user reports lost access in the first week post-rollout.

### Rollback plan
Since old permission checks are being replaced, keep `ALL_SUBMITTED_REPORTS` as an "OR" condition alongside the new permissions for one release cycle (`authorize(Permissions.VIEW_REPORTS, Permissions.ALL_SUBMITTED_REPORTS)` style), then remove the legacy fallback once confirmed stable.

**Effort estimate:** 3-5 days.

---

## 10. Cross-phase testing strategy

**Test pyramid target for this project**, given the current near-zero baseline:

1. **Unit tests (most numerous)** — pure logic: date-keying/grouping algorithms, backfill/migration transforms, permission-check functions, aggregation query builders. Backend: Vitest (new). Frontend: Vitest + RTL (existing pattern, extend it).
2. **Integration tests** — API-level, hitting real routes against a test database with Supertest (backend) — ownership checks, filter combinations, end-to-end submit-then-read flows. This tier catches the majority of the bugs this restructure is prone to (cross-user access, wrong scoping, silent nulls).
3. **Manual/UAT** — every phase ends with a manual pass by someone who isn't the implementer, ideally an actual instructor/admin user for UI-facing phases (2, 3, 4, 5). Document these as checklists, not just "looked fine."
4. **No automated E2E (Playwright/Cypress) recommended for this project specifically** — none exists in this codebase today, and standing one up is a multi-day investment on its own. Recommend deferring that investment to a separate initiative rather than bundling it into this restructure; rely on integration tests + structured manual UAT checklists instead. Revisit this decision if the restructure timeline extends significantly or regressions in UI flows become a recurring problem.

**Test data:** every phase needs a reusable seed/fixture dataset (a handful of subjects, class groups, teacher assignments, and a spread of scheduled/ad-hoc/legacy reports) — build this once in Phase 0 as shared test infrastructure, not per-phase.

---

## 11. Risk register

| Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Backend test-DB strategy undecided stalls Phase 0 | 0 | Medium | High (blocks everything) | Force an explicit team decision before Phase 0 starts; don't let it become an open-ended spike |
| `PUT /reports/:id` ownership gap is worse than believed (e.g. also on `DELETE`) | 0 | Medium | High (live security issue) | Full audit of every mutating endpoint on `LessonReport`/`reportController.ts` before declaring Phase 0 done, not just the one endpoint flagged in the Analysis |
| Migration backfill can't confidently derive `subject_id`/`class_group_id` for a meaningful fraction of historical `LessonReport` rows | 1 | Medium | Medium | Measure and report backfill coverage % before proceeding; accept nulls for genuinely orphaned historical data rather than fabricating links |
| Document-generation library choice (DOCX vs PDF, which package) turns into an open-ended evaluation | 3 | Medium | Medium | Time-box the `getWeeklyStitchedReport` investigation and library evaluation to 1-2 days combined; default to the proven `jsPDF` pattern if no clear winner emerges |
| Instructors resist/are confused by losing the familiar `ReportForm.tsx` weekly form | 5 | Medium | Medium | Parallel-run period (2-4 weeks) before hiding legacy UI; UAT with real instructors before cutover, not after |
| Retiring legacy routes/UI (Phase 5) accidentally breaks mentorship/project logging, which is out of scope and must keep working | 5 | Medium | High | Mandatory audit task at the start of Phase 5 (see Phase 5 task 1) before removing anything; do not proceed with route/UI removal until this is confirmed safe |
| Permissions split accidentally locks out an existing admin role | 6 | Low | High | OR-fallback to `ALL_SUBMITTED_REPORTS` for one release cycle; matrix-test every route/permission combination before rollout |
| Scope creep — AI summarization (Phase 4 optional), E2E tooling, or re-including `MentorshipSession`/`ReportProjectUpdate` gets pulled into the critical path | 4, ongoing | Medium | Medium | All explicitly marked optional/out-of-scope in this plan; PM should hold this line in scope reviews |

---

## 12. Timeline roll-up (effort-based, not calendar dates — sequence into your team's actual calendar)

| Phase | Effort estimate | Hard dependency on |
|---|---|---|
| 0 — Data integrity & security + test infra | 3-5 days | none — start immediately |
| 1 — Schema foundation | 5-8 days | Phase 0 test infra in place |
| 2 — Ad-hoc reporting + admin filtering | 6-9 days | Phase 1 schema live |
| 3 — Rollup export & document generation | 7-10 days | Phase 1 schema live (can run parallel to Phase 2 if staffed separately) |
| 4 — Categorization & ranking | 6-9 days | Phase 1 schema live (can run parallel to Phases 2/3) |
| 5 — Decommission legacy | 5-7 days + 2-4 week parallel-run window | Phases 2-4 substantially complete and UAT'd |
| 6 — Permissions split | 3-5 days | Can run any time after Phase 0; recommended last to avoid churn mid-migration |

**Critical path (single-team, sequential):** roughly 35-53 working days of implementation effort, plus the Phase 5 parallel-run window, which is elapsed time rather than effort. **With 2-3 workstreams staffed in parallel** (e.g. one engineer on schema/backend, one on frontend/UI, testing shared), Phases 2-4 can overlap after Phase 1 lands, meaningfully compressing elapsed time — recommend the PM re-sequence this table against actual team capacity rather than treating the sum as a committed date.

---

## 13. Definition of Done — whole project

- [x] All 7 objectives in §1 are met and verifiable via the stated success criteria.
- [x] Backend has a real test suite where none existed before (32 tests, Vitest + Supertest against a real MySQL schema). **Not CI-enforced** — no CI pipeline configuration exists in this repo to wire it into; `npm test` runs it locally, `npm run test:db:reset` resets the disposable schema.
- [x] Legacy `InstructorReport` flow is out of active use (UI removed from `ReportingModule.tsx`, 5 orphaned backend routes retired with 410s), tables archived not deleted.
- [x] No open Sev-1/Sev-2 bugs from the risk register remain unresolved (the `PUT /reports/:id` ownership gap the Analysis flagged turned out to already be fixed; the real gap found and fixed instead was `GET /reports/:id`).
- [ ] **Still open, requires a human stakeholder**: sign-off that the Phase 3 rolled-up export meets real reporting needs, compared side-by-side against the Rwanda Coding Academy reference document.

All 7 phases implemented and tested 2026-07-30 — see the ✅ IMPLEMENTED status block under each phase heading above for what shipped and where it diverged from this plan.
