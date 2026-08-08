# Reporting Module — Instructor Dashboard & Downloadable Reports Implementation Plan

**Date:** 2026-07-31
**Companion documents:** [`REPORTING_MODULE_SUBJECT_SCOPING_ANALYSIS.md`](./REPORTING_MODULE_SUBJECT_SCOPING_ANALYSIS.md), [`REPORTING_MODULE_RESTRUCTURE_IMPLEMENTATION_PLAN.md`](./REPORTING_MODULE_RESTRUCTURE_IMPLEMENTATION_PLAN.md) (the "Restructure Plan" — its Phase 0-6 already shipped 2026-07-30). This document assumes that work is done and picks up from the current, code-verified state.
**Reference example reviewed:** `Mathematics weekly class record.pdf` (Rwanda Coding Academy) — a real consolidated, per-subject/per-class-group weekly-to-termly teaching record. Used here only to confirm the *shape* instructors expect from a downloadable report (week rows, topic/objective/activity/assessment columns, milestone markers like "MID TERM EVALUATION"); the actual rollup generator already targets this shape for admins (see §1).

---

## 1. Current state (verified against code, not assumed from prior docs)

The `ReportingModule.tsx` UI in the screenshot already exists exactly as built: three tabs — **Lesson Reports**, **Mentoring**, **Dashboard** — this is not new work, it shipped as part of the 2026-07-30 restructure (`ReportingModule.tsx:22-24,62-78`).

The **Dashboard tab** renders `frontend/src/components/reporting/ReportingDashboard.tsx` (404 lines), and it is **already fully wired, not a placeholder**:
- 4 stat cards (Total Reports, Lessons Delivered, Mentorship Sessions, Last Lesson Report) fed by `reportsApi.getDashboardStats()` → `GET /reports/dashboard-stats` → `getDashboardStats` in `backend/src/controllers/reportController.ts`, which computes real aggregates from `LessonReport` and `MentorshipSession`.
- A "Reporting Trend" line chart (Recharts) plotting `lessons` vs `mentorship` per day, driven by the same stats payload's `trend` array.
- A working Today / Week / Month / Custom date-range filter (`ReportingDashboard.tsx:41-93`) that re-fetches stats on change — this is the exact range-picker infrastructure a download feature can reuse as-is.
- "No data yet. Submit your first report." (line 318) is only the chart's empty state when `trend` is genuinely empty — confirmed by reading the component, this is real data wiring, not a stub.

**What does not exist today:** any way for the logged-in instructor to *download* their own reports. Confirmed by reading `reportRoutes.ts`, `reports.ts`, and `LessonReportRollupService.ts`:
- Export/download only exists on the **admin** side: `GET /reports/admin/export` (CSV/HTML, `exportReportingData`) and `GET /reports/admin/lesson-reports/rollup` (`getAdminLessonReportsRollup`, `adminReportController.ts:355-480`), gated by `authorize(canView)`/`authorize(canExport)` — an instructor without admin report permissions cannot call either.
- `getAdminLessonReportsRollup` already does exactly the grouping a downloadable weekly/monthly/range report needs — subject → class group → week, with per-entry date/instructor/topic/status/completion/reflection — and the frontend already has a working PDF renderer for that exact shape: `LessonReportRollupService.ts` (jsPDF + jspdf-autotable, already a project dependency, already proven against `SchemeReportService.ts`'s pattern).
- `GET /reports/weekly-summary` (`lessonReportController.ts:841-937`) exists and is instructor-scoped already, but returns raw JSON only — no file, and nothing in the UI calls it today.

**Conclusion on feasibility:** yes, this is straightforward to implement, and cheaper than it looks — it is almost entirely *reuse*. The grouping logic, the PDF renderer, and the date-range UI all already exist and work; the only missing piece is a self-scoped (not admin-only) version of the rollup endpoint and a "Download" button wired to it from the Dashboard tab already shown in the screenshot.

---

## 2. What this plan actually delivers

1. An instructor can, from the **Dashboard tab** they already see, download their own lesson reports for the selected range (Today/Week/Month/Custom — the same picker already on screen) as a PDF, grouped the same way the admin rollup already groups (subject → class group → week).
2. No new tabs are needed — Lesson Reports / Mentoring / Dashboard already exist. This plan's UI change is additive (a download button + format choice) inside the existing Dashboard tab, not a restructure of the tab layout.
3. Mentorship data is **not** included in the downloadable rollup document, consistent with the standing scope decision in the Restructure Plan (§2 there: `MentorshipSession` follows a different workflow and is out of scope for `LessonReport`-shaped rollups). The Dashboard's stat card/trend chart continues to show mentorship counts for context, unchanged — only the *document generation* stays lesson-only.

---

## 3. Backend changes

### 3.1 Extract shared rollup logic (no behavior change)

`getAdminLessonReportsRollup`'s grouping logic (`adminReportController.ts:355-480`) is currently private to that one handler. Extract the query + subject→class-group→week grouping into a shared function, e.g. `backend/src/services/lessonReportRollupService.ts`:

```ts
buildLessonReportRollup(params: {
  start_date: string;
  end_date: string;
  academic_term_id: number;
  subject_id?: number;
  class_group_id?: number;
  reported_by?: number;   // NEW — the self-scoping filter
}): Promise<LessonReportsRollup>
```

- Add `reported_by` as an optional `and(...)` clause alongside the existing `subject_id`/`class_group_id` filters (same `? eq(...) : sql\`1=1\`` pattern already used at `adminReportController.ts:402-403`).
- Re-point `getAdminLessonReportsRollup` at this shared function (no behavior change for the admin route — pure refactor, keep its own test coverage green).

### 3.2 New self-scoped route

Add to `reportRoutes.ts` (instructor-authenticated section, near `/lessons/reportable` and `/weekly-summary`):

```
GET /reports/lessons/rollup
```

- Handler calls `buildLessonReportRollup({ ...query, reported_by: req.user.userId })` — hard-set from the authenticated session, never accepted from the client, so an instructor can never pull another teacher's data through this route (mirrors the ownership-guard pattern already established in the Restructure Plan's Phase 0).
- `subject_id`/`class_group_id` remain optional filters the instructor can narrow by (e.g. "just my Math sections"), but only within their own `reported_by` scope.
- `academic_term_id` defaults to the currently-active term (reuse whatever helper `getDashboardStats`/`getWeeklySummary` already use to resolve "current term" — both are already instructor-scoped and term-aware) if the client omits it, since the instructor-facing Dashboard already defaults its own range without asking the user to pick a term explicitly.
- No admin permission required — `authenticate` only, same tier as `/dashboard-stats` and `/weekly-summary`.

### 3.3 Testing

- Unit: shared rollup builder produces identical output whether called with an explicit `reported_by` or none (admin path unaffected) — regression guard for the extraction in 3.1.
- Integration (Supertest, following the existing pattern from the Restructure Plan's Phase 0 test infra): User A hits `/reports/lessons/rollup` → only User A's `LessonReport` rows appear, even when User B has rows in the same date range/subject/class group.
- Integration: instructor with zero reports in range gets a well-formed empty rollup (`subjects: []`), not a 500 — the frontend PDF renderer already handles this case (`LessonReportRollupService.ts:110-114`).

---

## 4. Frontend changes

### 4.1 API client

Add to `frontend/src/api/reports.ts`, alongside the existing `getAdminLessonReportsRollup`-calling function:

```ts
getMyLessonReportsRollup(params: { start_date, end_date, academic_term_id?, subject_id?, class_group_id? }): Promise<LessonReportsRollup>
```
→ `GET /reports/lessons/rollup`.

### 4.2 Dashboard tab UI (`ReportingDashboard.tsx`)

- Add a "Download Report" button to the existing date-filter bar (`ReportingDashboard.tsx:136-195`), next to the Today/Week/Month/Custom controls — it reuses whatever `start_date`/`end_date` is currently active (the same values already driving `onLoad(...)`), so the instructor downloads exactly the range they're already viewing. No new date-picking UI is needed.
- On click: call `getMyLessonReportsRollup(...)` with the active range, then `LessonReportRollupService.generate(rollup, metadata)` — the exact function the admin export already uses (`LessonReportRollupService.ts:119-122`), producing a client-side PDF download. Zero new document-generation code required.
- `metadata.generatedBy` = the logged-in instructor's name (already available from auth context elsewhere in the app); `schoolName`/`academicTermName` sourced the same way the admin export already does.
- Disable the button (with a tooltip) when `stats?.totalReports === 0` for the active range, matching the existing empty-state pattern already in this component (line 314-320).

### 4.3 Optional: CSV fallback

If a lighter-weight format is wanted alongside PDF (e.g. for instructors who want to paste into a spreadsheet), add a small format dropdown (PDF / CSV) next to the download button. CSV can be generated client-side by flattening the same rollup JSON — no new backend endpoint needed. Treat this as a nice-to-have, not blocking — ship PDF-only first, add CSV only if requested after instructors use the PDF path.

---

## 5. Explicitly out of scope for this plan

- **New tabs.** Lesson Reports / Mentoring / Dashboard already exist and are not being restructured here.
- **Mentorship report downloads.** Consistent with the standing scope decision (Restructure Plan §2), `MentorshipSession` is not folded into the lesson rollup document. If a future ask wants a downloadable mentorship log, that's a separate, similarly-shaped effort (its own service/endpoint), not an extension of `LessonReportRollupService`.
- **DOCX generation.** The existing pipeline is PDF-only (jsPDF); DOCX (`docx` package is present in `package.json` but unused for reports) stays a future option if a stakeholder specifically needs an editable Word output — no current requirement calls for it.
- **Changing the admin rollup/export** (`adminReportController.ts`, `AdminReportList.tsx`'s `ExportModal`) — those continue to work exactly as they do; §3.1's refactor is required to be behavior-preserving for them.

---

## 6. Effort estimate

| Task | Estimate |
|---|---|
| Extract shared rollup builder + `reported_by` filter (§3.1-3.2) + tests | 1.5-2 days |
| Frontend API function + Download button wiring (§4.1-4.2) | 1-1.5 days |
| Manual UAT: instructor downloads Today/Week/Month/Custom, confirms PDF matches on-screen stats and only shows their own data | 0.5 day |
| *(Optional)* CSV fallback (§4.3) | 0.5-1 day |

**Total: ~3-4 days** (excluding the optional CSV add-on), almost entirely reuse of existing, already-tested code paths.

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| Refactor in §3.1 subtly changes admin rollup output | Snapshot-test the admin endpoint's output before/after the extraction against a fixed fixture; treat any diff as a bug, not an acceptable side effect |
| Instructor tries to pass `reported_by`/another user's ID via query string | Route handler must hard-set `reported_by` from `req.user.userId` server-side and never read it from `req.query` — call this out explicitly in code review |
| Large date ranges (e.g. full year) produce a very long PDF | Not a functional bug, but consider a soft warning in the UI ("this range covers N reports across M weeks") before generating for ranges beyond one term — defer unless it proves to be a real problem in UAT |
