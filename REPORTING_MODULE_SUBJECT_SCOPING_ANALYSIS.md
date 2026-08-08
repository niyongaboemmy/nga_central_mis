# Reporting Module: Should Reports Be Scoped Per Subject?

**Date:** 2026-07-30
**Scope:** `nga_central_mis` (backend Drizzle/MySQL schema, Express controllers; frontend React/TS reporting components)
**Companion document:** [`REPORTING_MODULE_RESTRUCTURE_IMPLEMENTATION_PLAN.md`](./REPORTING_MODULE_RESTRUCTURE_IMPLEMENTATION_PLAN.md) turns §8-§9 below into a phased, testable delivery plan.
**Question driving this analysis:** Should an instructor's daily report be tied to one specific subject/lesson plan (so "what happened" and "challenges" are reported per subject taught), or is a single day-level report sufficient? **Update (2026-07-30):** also covers (a) whether "Support Needed" reflections can be aggregated into cross-teacher statistics, (b) whether a teacher can report subject activity on a day with no scheduled lesson plan, (c) whether "Highlights & Challenges" content can be ranked/detected as recurring across multiple subjects, (d) — against a real consolidated weekly class record example (Rwanda Coding Academy, Mathematics) — whether reports should be downloadable by date range and rolled up per subject **and** per class group/grade, and (e) a full inventory of the module (§7) supporting a full restructure proposal (§8-§9) rather than continued incremental patching.

---

## 1. Answer, up front

**Yes — reporting should be scoped per subject, and the codebase is already mid-migration toward that model but hasn't finished the job.** There are currently **two parallel reporting flows** in production, and neither one cleanly delivers "one report per subject per day":

| Flow | Table | Scoping | Status |
|---|---|---|---|
| Legacy | `InstructorReport` + `ReportTopic`/`ReportLesson` | Week/date-range + `class_group_id` only | No `subject_id` anywhere; subjects are merged into free text |
| Newer | `LessonReport` | Per-lesson via `lesson_id`/`entry_id` (transitively subject-specific) | Structurally closer, but has a data-integrity bug and is missing a direct `subject_id` |

Both are live simultaneously in the UI (`ReportingModule.tsx`), so instructors today can submit a vague, multi-subject day report through one tab and a lesson-specific report through another, with no reconciliation between them.

Three further gaps confirmed in this update (detailed in §5):
- **No statistics on "Support Needed" requests** — all four support fields (Academic/Technical/Infrastructure/Coordination) are free text with zero categorization and zero aggregation anywhere in the code, so there is currently no way to see which support request is most common across teachers.
- **No ad-hoc reporting path** — the subject-aware `LessonReport` flow only lets you report against a pre-scheduled lesson/calendar slot; there's no way to log "did activity for Subject X, no plan existed for today" while keeping subject-level traceability. That capability only exists in the legacy free-text flow, which loses subject scoping.
- **No frequency ranking for "Highlights & Challenges"** — `challenges_encountered`/`reflection_notes` have the same free-text-only problem as Support Needed: no tagging, no clustering, no AI summarization, and no admin-facing "top challenges" view, so a challenge (e.g., an electricity outage) reported independently by several subjects/teachers is invisible as a pattern — each mention only exists buried inside its own report.
- **No consolidated per-subject-per-class-group export** — real-world reporting output (see §5.4) needs to look like a rolled-up "Mathematics — Year One A/B — Term 2" record spanning many weeks, downloadable by date range. Today's export only produces flat CSV/print-HTML of individual report rows, and `LessonReport` never persists `class_group_id`, so a true per-subject-per-class-group weekly/termly rollup isn't achievable from current data.

**Restructure verdict (§7-§9):** a full module inventory turned up two more decoupled event tables beyond `LessonReport` (`MentorshipSession`, `ReportProjectUpdate`) that share several of the gaps identified above, an unwired admin UI (dead "Send Reminder" button, no notifications at all), an orphaned backend endpoint (`getWeeklyStitchedReport`, never called from the frontend) that may already do most of the rollup-export work, and — separately from the subject-scoping question — a likely access-control gap on `PUT /reports/:id` with no visible ownership check. **Scope decision (2026-07-30, stakeholder direction): this restructure covers `LessonReport` only.** `MentorshipSession` and `ReportProjectUpdate` follow a different workflow (1:1 student sessions and project check-ins, not subject/class-group delivery) and are explicitly out of scope — they continue operating unchanged and may be addressed as a separate initiative later. §8 replaces the legacy/`LessonReport` two-flow structure with one consistent "one event row per lesson delivered" model, and §9 phases the migration so the access-control fix ships first, independent of the larger restructure timeline.

---

## 2. Current state: data model

### 2.1 `InstructorReport` (legacy) — `backend/src/db/schema.ts:898-930`

```
InstructorReport {
  report_id
  user_id            -> User
  academic_term_id
  class_group_id     -> ClassGroup
  week_number
  start_date, end_date
  key_highlights
  challenges_encountered
  ...
}
```

- Scoped to **class group + date range**, not subject.
- Child tables:
  - `ReportTopic` (schema.ts:1033-1042) — `topic_name` is **free text**, no `subject_id` FK.
  - `ReportLesson` (schema.ts:933-944) — `lesson_title` is **free text**, no `subject_id` FK.
- Result: if an instructor teaches Math and English the same week, both show up as strings inside one report, not as two distinguishable, queryable records.

### 2.2 `LessonReport` (newer, per-lesson) — `backend/src/db/schema.ts:1045-1077`, introduced in migration `035_decoupled_lesson_reporting.sql`

```
LessonReport {
  lesson_report_id
  lesson_id   -> LO_Lesson (nullable, ON DELETE SET NULL)
  entry_id    -> SchemeOfWorkEntry (nullable, ON DELETE SET NULL)
  reported_by -> User
  delivery_date  (not null)
  status  ENUM(DELIVERED, PARTIAL, MISSED)
  reflection_notes
  ...
}
```

- Subject is only reachable by joining `lesson_id → SchemeOfWorkEntry.scheme_id → SchemeOfWork.subject_id`.
- **No direct `subject_id` column.** Both FKs are nullable, so a report can be saved with no subject/lesson link at all.
- No uniqueness constraint on `(reported_by, lesson_id, delivery_date)` — duplicate reports for the same subject/day are possible.

### 2.3 The upstream data already supports full subject partitioning

- `TeacherSubjectAssignment` (schema.ts:296-313): composite PK `(user_id, subject_id, class_group_id)` — instructors legitimately teach multiple subjects.
- `SchemeOfWork.subject_id` (`.notNull()`, schema.ts:620-650) and `CalendarSlot.subject_id` (schema.ts:818-844) confirm the lesson-plan and timetable layers are fully subject-partitioned.

**Conclusion:** the subject dimension exists everywhere upstream (scheme of work, lesson plans, calendar slots, teacher assignments) — it's only the reporting layer that loses it.

---

## 3. Current state: application logic

### 3.1 `lessonReportController.ts` — the right idea, with a same-day multi-subject bug

`getReportableLessons` builds one "reportable" occurrence per calendar slot (subject × date) — correct in principle. But the lookup maps used to attach lesson/report data are **keyed by date string only**, not `(date, subject)`:

```js
// lessonByDate keyed only by date — first lesson wins
const lessonByDate = new Map<string, ...>();
for (const l of lessons) {
  const key = formatDbDate(l.lesson_date);
  if (key && !lessonByDate.has(key)) lessonByDate.set(key, l);
}

// reportByDate — same problem
const reportByDate = new Map<string, ...>();
for (const r of existingReports) {
  const key = formatDbDate(r.delivery_date);
  if (key) reportByDate.set(key, r);
}
```

**Practical failure mode:** if an instructor teaches two subjects on the same date, the *first* subject's lesson is attached to every occurrence that date, and submitting a report for *any one* subject marks *all* subjects that day as `"REPORTED"` with the wrong report data shown. This directly undermines the goal of accurate per-subject "what happened / challenges" reporting.

### 3.2 Frontend: two competing forms, only one is subject-aware

- **`ReportForm.tsx`** (legacy, "Reporting" tab): no subject selector; `handleAutoFill` deliberately flattens topics across *all* the instructor's subjects into one list (`topic_name: subject + ': ' + name`). Captures `key_highlights` ("what happened") and `challenges_encountered` as separate fields — good field separation, but at the wrong granularity (whole day, not per subject).
- **`LessonReportModal.tsx`** (newer, per-lesson calendar flow): opened for one specific subject/lesson occurrence, shows read-only context (subject, topic, sub-topic, learning outcomes) — correctly subject-scoped. But it collapses "what happened" and "challenges" into a **single textarea** labeled "Reflection / Challenges" — the opposite problem: right granularity, wrong field structure.

### 3.3 Documentation gap

`reporting_prompt.md` (project root) describes a day-centric calendar UX ("click a date... submit multiple actions per day") and references a `reporting_form_required_fields.doc` for the autofill field spec. **That file does not exist in the repository** — it's referenced once and never delivered, so the original field requirements (and any explicit statement on subject scoping) can't be verified against source intent. Only `docs/Weekly Instructor Report Template.pdf` and two generic `Template 1/2.docx` exist.

---

## 4. Why subject-level scoping is the right target

1. **Traceability**: "What happened" and "what were the challenges" are only actionable to an administrator if tied to a specific subject + lesson/topic. A day-level blob ("taught 2 classes, some issues") can't be aggregated into subject-level insights (e.g., "Chemistry Term 2 has a recurring challenges theme across 5 instructors").
2. **Autofill quality**: the entire premise of `reporting_prompt.md` §2 ("Intelligent Form Autofill" from Scheme of Work / Lesson Plans) only works cleanly per subject — a lesson plan's topic, sub-topic, learning outcomes, and objectives are subject-specific fields. Autofilling them into a multi-subject day form is why `ReportForm.tsx` had to string-concatenate subjects together.
3. **Existing upstream model already supports it**: `TeacherSubjectAssignment`, `SchemeOfWork`, `CalendarSlot`, `LO_Lesson` are all subject-partitioned. Reporting is the only layer not following that pattern — this is an inconsistency, not a deliberate design choice.
4. **Dashboard/analytics value**: per-subject reports enable subject-level trend dashboards (completion rate, challenge frequency, delivery status) which is explicitly requested in `reporting_prompt.md` §4 (Dashboard tab) but is currently only achievable at the class-group/week level via `InstructorReport`, losing subject resolution.

---

## 5. Additional gaps identified (2026-07-30 update)

### 5.1 "Reflections & Support" fields are free text with zero aggregation — no way to see what's *most requested* across teachers

The "Reflections & Support" section (What worked well / Areas needing improvement / Support Needed from NGA HQ — Academic, Technical/IT, Infrastructure, Coordination) lives in its own table, `ReportReflection` (`backend/src/db/schema.ts:1017-1029`), 1:1 with `InstructorReport`:

```ts
export const ReportReflection = mysqlTable("ReportReflection", {
  reflection_id: bigint(...).primaryKey().autoincrement(),
  report_id: bigint(...).notNull().references(() => InstructorReport.report_id, { onDelete: "cascade" }),
  what_worked_well: text("what_worked_well"),
  improvement_areas: text("improvement_areas"),
  academic_support_needed: text("academic_support_needed"),
  technical_support_needed: text("technical_support_needed"),
  infrastructure_support_needed: text("infrastructure_support_needed"),
  coordination_support_needed: text("coordination_support_needed"),
});
```

Every one of these six fields is unstructured `text`, with **no FK to any category/enum table** (`SupportCategory`, `SupportType`, etc. do not exist anywhere in `schema.ts`). On the frontend, `ReportForm.tsx` renders all of them as plain `<textarea>` elements (e.g. lines 754, 767, 786-834) — there is no dropdown, tag picker, or structured-select anywhere in the module for this content.

Consequently, `backend/src/controllers/reportController.ts` only ever does raw per-report CRUD on `ReportReflection` — insert on create (:136-144), delete-and-reinsert on update (:894-905), plain `SELECT *` on read (:563-566). `adminReportController.ts` *does* aggregate — but only over structured/enum fields on `LessonReport` (e.g. `groupBy(LessonReport.status)` at :55-58, `groupBy(Subject.subject_id, ...)` at :221) — it never touches `ReportReflection`.

**Practical consequence for the stakeholder's scenario:** with ~10 teachers submitting reports, if five of them separately type "server issues in lab" and three type "no functioning projector," there is currently **no way to see this as a ranked/counted list** ("Technical/IT Support: 5 mentions this week") — an administrator can only open each report individually and read the free text. The dashboard's "Most active users" / "Activity trends" charts (per `reporting_prompt.md` §4) have no equivalent for support-request themes because the underlying data was never captured as structured, countable categories.

**Recommendation:** convert the four "Support Needed" fields (and optionally "Areas needing improvement") from free text to a **multi-select from a fixed category list** (e.g., a new `SupportRequestCategory` lookup table: Curriculum Clarification, Lab/Server Issue, Electricity, Space, Partner Relations, etc., seeded from real historical text via a one-time NLP/manual pass), backed by a join table `ReportSupportRequest(report_id, category_id, note?)` where `note` remains free text only for details beyond the category. This lets the dashboard do a simple `GROUP BY category_id, COUNT(*)` to surface "most requested support type this week/month," while still allowing a free-text detail note per selection so nothing is lost. Keep "What worked well" / "Areas needing improvement" as free text (they're inherently narrative) but consider basic keyword/theme tagging later if the same need arises there.

### 5.2 No way to report subject activity on a day with no scheduled lesson plan

The stakeholder's second scenario — "I did activity for my subject today but there's no lesson plan for it" — exposes a real gap in the **newer, subject-aware `LessonReport` flow**, and a workaround-only path in the **legacy flow**:

- **`LessonReportingCalendar.tsx`** only renders days as clickable/reportable when a scheduled occurrence already exists: `onClick={(e) => dayLessons.length > 0 && handleDayClick(dateStr, dayLessons, e)}` (`:222`), with `cursor-pointer` similarly gated on `dayLessons.length > 0` (`:224`). A day with zero `CalendarSlot`/`LO_Lesson` occurrences is inert — there is no button to say "report anyway, for Subject X, no plan today."
- **`lessonReportController.ts`'s `submitLessonReport`** technically *allows* `lesson_id`/`entry_id` to be `null` (only `delivery_date` and `status` are required; the ownership check is gated `if (lesson_id)`), and `LessonReport.lesson_id`/`entry_id` are nullable FKs in the schema. So the backend could accept a lessonless report — **but `LessonReport` has no `subject_id` column at all**, so even if the UI allowed it, there would be no way to record *which subject* the ad-hoc activity was for without a lesson to derive it from. This path is a dead end today.
- **The legacy `ReportForm.tsx`/`InstructorReport` flow does support this**, incidentally: `ReportLesson.lesson_title` (`varchar(255)`, no FK) and `ReportTopic.topic_name` (`text`, no FK) are fully free-text, added via an "Add Manual Lesson" / topic button (`ReportForm.tsx:294-300`, :639-666, :285-290, :588-596). A user can type any lesson/topic title with no matching scheme-of-work entry. But this flow is class-group/week scoped, not subject-scoped (§2.1/§3.3 above), so while it technically captures the activity, it does so back in the untraceable, multi-subject-blended format this whole analysis is trying to move away from.

**Net effect:** the only flow that currently lets a teacher log unplanned, ad-hoc subject activity is the one that loses subject-level traceability, and the flow with subject-level traceability has no ad-hoc path. Fixing §5.1's `subject_id` gap on `LessonReport` (recommendation §6.2 below) is a prerequisite for closing this gap too.

**Recommendation:** add an explicit "Report unscheduled activity" action to `LessonReportingCalendar.tsx` (e.g., a "+ Add activity" button on any day, scheduled or not) that opens `LessonReportModal.tsx` in an ad-hoc mode: user picks `subject_id` from their `TeacherSubjectAssignment` list (rather than inheriting it from a `CalendarSlot`), `lesson_id`/`entry_id` stay `null`, and the newly-added `subject_id` column (§6.2) is set directly from the picker. `status` in this case should probably default to/allow a value distinct from DELIVERED/PARTIAL/MISSED (e.g., `UNPLANNED` or `AD_HOC`) so dashboards can distinguish "did something not on the scheme of work" from "missed something that was planned" — these carry very different meaning to an administrator.

### 5.3 "Highlights & Challenges" — no way to detect the same challenge recurring across subjects, and no frequency ranking for admins

The "Highlights & Challenges" section ("Key Highlights (What happened today?)" / "Challenges Encountered") has the identical structural problem as §5.1's Support Needed fields, confirmed independently for this content:

- **`InstructorReport.key_highlights` / `challenges_encountered`** (`schema.ts:916-917`) are plain `text`, and — because `InstructorReport` is scoped per class-group/week, not per subject (§2.1) — a single `challenges_encountered` value can already be a blend of whatever multiple subjects that instructor taught that week. Checked both child tables for a per-subject alternative: `ReportLesson` (`schema.ts:933-944`) only has a generic `notes` field, no dedicated challenge column; `ReportTopic` (`schema.ts:1033-1042`) has no notes/challenge field at all. So in the legacy flow, "which subject had which challenge" is often not even recoverable from the data as stored.
- **`LessonReport.reflection_notes`** (the newer, per-lesson flow) is, by contrast, already correctly scoped — one row per lesson/subject/day, so the data granularity needed to compare challenges *across* subjects and teachers already exists here. The gap is purely on the **read/analytics side**: nothing aggregates it.
- **No categorization, tagging, keyword extraction, clustering, or similarity matching exists anywhere in `backend/src`** for either field. A grep across all controllers/services for challenge/tag/category/cluster/similar logic touching `key_highlights`, `challenges_encountered`, or `reflection_notes` returns nothing — the closest matches (`CourseCategory`, `SubjectDocumentCategory`, upload `tags`) belong to unrelated curriculum/document features.
- **No ranking or frequency display exists.** `adminReportController.ts` only counts/groups structured columns (`LessonReport.status`, `schedule_flag`, delivery-date buckets, `reported_by`, `subject_id`) — it selects and passes `reflection_notes` through verbatim into JSON/CSV/HTML exports without ever aggregating it. `AdminReportList.tsx:391-399` renders it as a raw paragraph (`{log.reflection_notes}`, fallback "No reflection notes submitted."). `AdminReportDashboard.tsx` (516 lines) contains no reference to challenge/highlight/reflection text at all — its charts are purely numeric/status-based.
- **No AI/LLM summarization is wired up for reports**, unlike lesson plans and scheme-of-work generation which already use an AI SDK (`lessonPlanAIController.ts`, `schemeAIController.ts`, both on Gemini/`@google/genai`). There is no equivalent `aiReportController` and zero AI SDK references anywhere in `reportController.ts`, `lessonReportController.ts`, or `adminReportController.ts`.

**Practical consequence for the stakeholder's scenario:** if three different subjects (taught by the same or different instructors) each independently report "electricity outage disrupted the lesson" or "students struggled with the new grading rubric," there is currently no way for an administrator to see this as a recurring, ranked pattern ("Electricity/power issues: reported 6 times this week across 4 subjects") — each mention sits invisibly inside its own report's free text, discoverable only by reading every report individually.

**Recommendation:** this is the same underlying gap as §5.1 and should share the fix rather than get a second bespoke mechanism. Two complementary options, not mutually exclusive:
1. **Structured option (same pattern as §5.1):** add an optional `ChallengeCategory` tag-select (multi-select from a maintained list: Electricity/Power, Equipment/Lab, Connectivity, Student Engagement, Curriculum Pacing, Attendance, Other) alongside the existing free-text `challenges_encountered`/`reflection_notes` field, captured via a join table (`ReportChallengeTag(report_id | lesson_report_id, category_id)`). This makes `GROUP BY category_id, COUNT(*)` trivial for a "Top Challenges This Week" dashboard widget, mirroring recommendation §6.8.
2. **AI-assisted option (leverages existing infrastructure):** since the project already has a working Gemini AI pipeline for lesson plans/scheme-of-work, add a lightweight scheduled/on-demand summarization job (a new `aiReportController` or extension of `adminReportController.ts`) that periodically clusters/summarizes `reflection_notes`/`challenges_encountered` text across the current week's reports into a ranked "recurring themes" list for the admin dashboard — useful for the free-text nuance that a fixed category list would lose, and doesn't require every teacher to also tag their entry.

Given the categorized approach is cheap, deterministic, and immediately queryable, it should be the baseline; the AI summarization is a good phase-2 enhancement on top of it, not a replacement.

### 5.4 Real-world reference example: consolidated per-subject, per-class-group weekly record (Rwanda Coding Academy Mathematics record)

A real example document was reviewed — a "Mathematics weekly class record" — which is the clearest evidence yet of what administrators actually expect a rolled-up report to look like, and it directly confirms two structural requirements the module doesn't yet meet.

**What the document shows:**
- One subject (Mathematics), one teacher, but **three separate tables, one per class group/year** ("Year One A and B," "Year Two C," "Year Three C and D") — each with its own week-by-week rows (Week, Day/date range, Topic, Objective, Activity, Needed Material, Assessment) spanning a full term, with milestone rows ("MID TERM EVALUATION," "NESA PRACTICAL EXAMS") interleaved.
- It is fundamentally a **rolled-up, date-range-filtered view**, not a single day's entry — i.e., exactly the "download by week/month/term/custom range" capability the stakeholder is asking for.
- Every row's Topic/Objective/Activity/Material columns read almost identically to `SchemeOfWorkEntry`/`LO_Lesson` fields already in the schema — reinforcing §3's autofill argument: this kind of report is best generated *from* Scheme of Work + Lesson Plan + `LessonReport` delivery data, not typed by hand.
- Critically, **the class group is a first-class grouping axis, on equal footing with subject** — the same subject, same teacher, produces three distinct tables because Year 1A/B, Year 2C, and Year 3C/D are different audiences with different pacing. This matches `TeacherSubjectAssignment`'s composite key `(user_id, subject_id, class_group_id)` (schema.ts:296-313) — the data model already treats subject+class-group as the natural unit, but the reporting layer does not yet mirror it.
- An **Assessment** column appears on every row — a structured "how was this checked" field distinct from "what happened" and "challenges." Neither `LessonReport` nor `InstructorReport`/`ReportLesson` currently has a dedicated assessment/evaluation-method field (`LessonReport` has `completion_rate` and `status`, which capture *outcome*, but not *how it was assessed*).

**Gap 1 confirmed — export exists but is flat, not rolled-up, and covers the wrong data source.** `adminReportController.ts`'s `exportReportingData` endpoint (mounted at `GET /api/reports/admin/export`, lines 574-900) does support `start_date`/`end_date` filtering and a "This Week / This Month / Custom Range" picker in `AdminReportList.tsx`'s `ExportModal` (lines 51-282, download button at 552-558) — so date-range download **already exists as a feature**. But: (a) output is CSV or print-ready HTML only — no real PDF/DOCX generation library exists anywhere in the repo (`package.json` only has read-side `mammoth`/`pdf-parse`/`xlsx`, no `docxtemplater`/`puppeteer`/`pdfkit`); (b) it exports a flat list of report rows (`category=lessons|mentorship|projects|unified`), not a grouped-by-subject-then-by-class-group document like the reference example; (c) the export's `category=lessons` branch is presumably reading from `LessonReport`, which — per Gap 2 below — has no reliable class-group data to group by anyway.

**Gap 2 confirmed — `LessonReport` never captures class group.** `getReportableLessons` computes `class_group_id` transiently from the joined `CalendarSlot` (`lessonReportController.ts:99,156`) to build the reportable-occurrence list, but `submitLessonReport` (`:318-330`) never accepts or persists `class_group_id` on the saved row. So even once §6.2's `subject_id` fix lands, `LessonReport` still can't answer "show me everything for Mathematics, Year One A" without re-joining through `lesson_id → CalendarSlot` at query time (fragile, and impossible for the ad-hoc/no-lesson reports from §5.2, which have no `CalendarSlot` to join through at all). `adminReportController.ts`'s existing aggregation queries never `groupBy`/filter on `class_group_id` either (only `status`, `schedule_flag`, date, instructor, `subject_id`) — class-group-level rollups aren't possible today from either the write side or the read side.

By contrast, the **legacy `ReportForm.tsx`/`InstructorReport` flow does have a real, user-facing class-group selector** (`ReportForm.tsx:460-479`, populated from `classGroupsApi.getAll()`, defaulting to the teacher's first assignment) — but as established throughout this document, that flow is the one losing subject-level precision. Neither flow currently has both dimensions captured cleanly at once.

**Recommendation:**
1. Persist `class_group_id` directly on `LessonReport` (denormalized from `CalendarSlot`/`TeacherSubjectAssignment` at write time, same treatment as the `subject_id` fix in §6.2) — do these two schema changes together since they're the same migration.
2. Build a genuine "Subject × Class Group × Date Range" export/report generator that groups `LessonReport` rows first by `subject_id`, then by `class_group_id`, then by week — matching the Rwanda Coding Academy document's structure — rather than extending the current flat CSV.
3. Add real document generation (DOCX and/or PDF) for this rolled-up report, since none exists in the repo today; a template-based approach (e.g. `docxtemplater` against a template similar to the reviewed reference document, or server-side HTML→PDF) is lower-risk than building the layout from scratch, given the target format is already known from the reference example.
4. Add an `assessment_method`/`assessment_notes` field to `LessonReport` (distinct from `status`/`completion_rate`) if this level of detail is required for parity with the reference document — confirm with stakeholders whether this is a real requirement or whether `completion_rate`+`reflection_notes` already suffice.

---

## 6. Recommended changes

1. **Retire the day-level `InstructorReport`/`ReportTopic`/`ReportLesson` flow** (or migrate its data into `LessonReport`) — it's the source of the subject-flattening problem and duplicates `LessonReport`'s purpose.
2. **Add explicit `subject_id` AND `class_group_id` FKs to `LessonReport`**, both denormalized from `lesson_id`/`entry_id`/`CalendarSlot`/`TeacherSubjectAssignment` at write time, so subject and class group are both queryable/reportable even if the lesson or SOW entry is later deleted (currently `ON DELETE SET NULL` would silently strip subject context), and so ad-hoc reports (§5.2, no `CalendarSlot` to join through) still carry both dimensions. Do this as one migration — see §5.4.
3. **Fix the date-only keying bug** in `lessonReportController.ts` — key `lessonByDate` and `reportByDate` maps by `(date, subject_id)` or `(date, calendar_slot_id)`, not date alone, so same-day multi-subject reporting attributes correctly.
4. **Add a unique constraint** on `(reported_by, lesson_id, delivery_date)` in `LessonReport` to prevent duplicate submissions per subject/day.
5. **Split `LessonReportModal.tsx`'s combined "Reflection / Challenges" field** into two distinct fields — "What happened / actions performed" and "Challenges encountered" — matching the separation already present (correctly) in the legacy `ReportForm.tsx` and in the original Weekly Instructor Report Template intent.
6. **Locate or recreate `reporting_form_required_fields.doc`** referenced in `reporting_prompt.md` so the autofill field spec is verifiable; if it's genuinely lost, treat `Weekly Instructor Report Template.pdf` as the source of truth and document the field mapping explicitly in `docs/`.
7. Once `LessonReport` is the single source of truth, point the Dashboard and Submitted Reports tabs at it exclusively (subject filter becomes a first-class filter alongside daily/weekly/monthly/annual and user filters already planned in `reporting_prompt.md` §3-4).
8. **Replace free-text "Support Needed" fields with a categorized multi-select** (`SupportRequestCategory` lookup table + `ReportSupportRequest` join table, optional free-text note per selection) so an admin can `GROUP BY category_id, COUNT(*)` to see the most-requested support types across teachers (see §5.1).
9. **Add an "unscheduled/ad-hoc activity" reporting path** to the per-lesson flow: a subject picker independent of `CalendarSlot`/`LO_Lesson`, writing directly to the new `LessonReport.subject_id` column with `lesson_id`/`entry_id` left `null`, and a distinct status value (e.g. `UNPLANNED`) so it's not conflated with `MISSED` (see §5.2).
10. **Add a `ChallengeCategory` tag-select** alongside the free-text `challenges_encountered`/`reflection_notes` field (`ReportChallengeTag` join table), so admins can rank recurring challenges by frequency across subjects/teachers, not just read them one report at a time (see §5.3). Consider this the same underlying pattern/effort as item 8 and implement both together.
11. *(Phase 2, optional)* **Extend the existing Gemini AI pipeline** (already used for lesson plans/scheme-of-work in `lessonPlanAIController.ts`/`schemeAIController.ts`) to a new report-summarization job that clusters/ranks free-text `challenges_encountered`/`reflection_notes` into recurring themes for the admin dashboard, complementing the structured tags in item 10 rather than replacing them (see §5.3).
12. **Build a "Subject × Class Group × Date Range" rolled-up report generator**, grouping `LessonReport` rows by `subject_id` → `class_group_id` → week (once item 2's columns exist), matching the structure of the reviewed real-world reference document (see §5.4).
13. **Add real document generation** (DOCX via a template library such as `docxtemplater`, and/or server-rendered PDF) for the rolled-up report — today's export (`adminReportController.ts` `exportReportingData`) only produces flat CSV or print-ready HTML; no PDF/DOCX generation library exists in the repo yet (see §5.4).
14. **Extend the existing date-range export UI** (`AdminReportList.tsx`'s `ExportModal`, which already supports This Week / This Month / Custom Range) with the new grouped format from item 12, rather than building a separate download flow — the date-range picker itself doesn't need to change (see §5.4).
15. *(Confirm with stakeholders)* **Add an `assessment_method`/`assessment_notes` field to `LessonReport`** if per-lesson assessment detail (distinct from `status`/`completion_rate`) is a real requirement, based on the "Assessment" column present in the reference document (see §5.4).

---

## 7. Full module inventory (2026-07-30 — complete picture before restructure)

Items 1-15 above were incremental fixes layered onto the existing two-flow structure. Before recommending a full restructure, the entire reporting surface was inventoried — including pieces not touched by §§1-6. This section is the complete map; §8 builds the restructure proposal on top of it.

### 7.1 The module is really five decoupled tables, not two

Beyond `InstructorReport` (legacy monolith) and `LessonReport` (per-lesson), migration `035_decoupled_lesson_reporting.sql` also decoupled two more logs from `InstructorReport`, both still live under the "Reporting Module Tables" schema section (`schema.ts:895` header):

- **`MentorshipSession`** (`schema.ts:947-993`) — one mentor/instructor↔student 1:1 session log. `report_id` is a nullable, legacy-only FK to `InstructorReport` (`onDelete: cascade`) — new rows since migration 035 don't set it. Carries a large "intelligence layer" added later (migration 039): `subject_id`, `wellbeing_score`, `wellbeing_status`, `discipline_progress`, `dishonesty_flagged`, `stress_flag`, `follow_up_required`, `session_status` (`OPEN/IN_PROGRESS/RESOLVED`). Got `academic_year_id`/`academic_term_id` in migration 044.
- **`ReportProjectUpdate`** (`schema.ts:996-1014`) — Delivery-Studio/capstone project status log: `project_name`, `role`, `work_completed`, `status` (`ON_TRACK/AT_RISK/DELAYED/COMPLETE`), `key_outputs`, `challenges`. Also has a legacy-only nullable `report_id` FK. **Unlike `LessonReport`/`MentorshipSession`, migration 044 did not add `academic_year_id`/`academic_term_id` to this table** — it currently has no reliable academic-period linkage at all.

`adminReportController.ts` treats `lessons` (`LessonReport`), `mentorship` (`MentorshipSession`), and `projects` (`ReportProjectUpdate`) as three parallel "categories," each with its own admin list/export endpoint (`getAdminLessonReports`, `getAdminMentorshipLogs`, `getAdminProjectUpdates`) plus a `unified`/`getWeeklyStitchedReport` view that combines all three. **None of the recommendations in §6 addressed `MentorshipSession` or `ReportProjectUpdate`** — the subject/class-group/challenge-ranking gaps identified for `LessonReport` (§2, §5.1-§5.4) apply to these two tables as well but were not previously in scope.

**Scope decision (2026-07-30, stakeholder direction):** `MentorshipSession` and `ReportProjectUpdate` follow a materially different workflow (1:1 student sessions and project-status check-ins are not tied to a subject/class-group delivery cadence the way lesson reporting is), and are **explicitly excluded from the restructure below**. §8 and §9 now scope the restructure to `LessonReport` only; `MentorshipSession`/`ReportProjectUpdate` continue operating exactly as they do today, unchanged, and may be addressed as a separate initiative later if warranted. This narrows §8.1-§8.5 considerably from the version originally drafted for all three tables — see §8.6 for the full out-of-scope list.

### 7.2 Full current API surface (`frontend/src/api/reports.ts` ↔ `backend/src/routes/reportRoutes.ts`)

All 20 endpoints, every one gated only by `authenticate` (self-scoped inside each controller) except the 11 `/admin/*` routes, which additionally require a single permission, `ALL_SUBMITTED_REPORTS` (`backend/src/utils/permissions.ts:105`):

| Endpoint | Scope |
|---|---|
| `POST /submit`, `GET /autofill`, `GET /`, `GET /by-date`, `GET /dashboard-stats`, `GET /lessons/reportable`, `POST /lessons`, `GET /weekly-summary`, `GET /:id`, `PUT /:id` | authenticated (self-scoped in controller) |
| `GET /admin/all`, `/admin/missing`, `/admin/dashboard`, `/admin/compliance`, `/admin/lesson-reports`, `/admin/mentorship-logs`, `/admin/project-updates`, `/admin/coverage`, `/admin/weekly-stitched`, `/admin/student-timeline/:studentId`, `/admin/export` | `ALL_SUBMITTED_REPORTS` permission |

Two anomalies worth flagging on their own, independent of the subject-scoping question:

- **`PUT /reports/:id` (`updateReport`) has no visible ownership check at the route or middleware level** — every other self-scoped controller path manually compares `req.user.userId` against the row owner (e.g. `reportController.ts:62,162,414,585`), but this was not confirmed for the update path during this pass. This should be verified as a priority — if confirmed, any authenticated user could edit another instructor's report by ID, a real access-control gap, not just a UX one.
- **`GET /admin/weekly-stitched` (`getWeeklyStitchedReport`) is registered on the backend but has no corresponding call in `frontend/src/api/reports.ts`** — dead/orphaned backend code, or a feature that was half-shipped and never wired to the UI. Worth checking whether this endpoint was actually the intended source for the "Subject × Class Group × Date Range" rollup requested in §5.4 §recommendation 12, before building a new one from scratch.
- The permission name `ACCESS_REPORT_CARD_MODULE` (migration `011_add_access_report_card_module_permission.sql`) is unrelated to this Reporting Module — it gates the student **report-card/grades** feature. Naming collision only; no functional overlap, but worth noting so future readers don't conflate the two "reporting" features in this codebase.

### 7.3 Admin-side UI not previously covered

- **`AdminReporting.tsx`** (439 lines) is the actual top-level admin container (four tabs: `list`, `dashboard`, `missing`, `mentoring-log`), composing `AdminReportList`, `AdminReportDashboard`, `AdminMissingReports`, and an `AdminMentoringLogView` not previously inventoried, plus opening `ReportDetailsModal` on row click.
- **`ReportDetailsModal.tsx`** (540 lines) is the single detail view used both by instructors (editable) and admins (read-only) — but it renders only the **legacy `InstructorReport`** shape (topics/lessons/mentorship/project arrays + 6-field reflections). There is no equivalent detail modal for a single `LessonReport` row shown from `AdminReportList`/`AdminReporting`'s list tab — confirming the newer per-lesson flow is still a second-class citizen in the admin UI, not just the data model.
- **`AdminMissingReports.tsx`** shows instructors with no submission for the selected period, but contains a **dead, commented-out "Send Reminder" button** with no click handler — reminder functionality was stubbed and abandoned. Confirmed separately: **no cron job, no email/notification dispatch of any kind exists anywhere in the reporting backend.** Missing-report detection is a passive read-only view; nothing proactively nudges instructors.

### 7.4 `SchemeReportService.ts` / `SchemeReportPreviewModal.tsx` are a separate, unrelated feature

These live under `frontend/src/services/` and `frontend/src/components/` (not `components/reporting/`) and generate a client-side PDF (via `jsPDF`/`jspdf-autotable`) of the **Scheme of Work** itself (cover page, weekly SOW table, signatures) — used only by `SchemeOfWorkCalendar.tsx`/`SchemeDetails.tsx`. It has zero dependency on `reportsApi`, `InstructorReport`, or `LessonReport`. It is **not part of the Reporting Module** and should not be conflated with it — though its client-side PDF generation pattern is a candidate reference implementation for §6 recommendation 13's document-generation gap, since it's the only working PDF pipeline anywhere in the repo.

---

## 8. Full restructure proposal (scoped to lesson reporting only)

The stakeholder has asked to restructure the module rather than continue patching two parallel flows — **scoped specifically to lesson/subject reporting** (`LessonReport` and the lesson-relevant parts of legacy `InstructorReport`). `MentorshipSession` and `ReportProjectUpdate` behave differently (1:1 student sessions and project-status check-ins, not tied to a subject/class-group delivery cadence) and are intentionally left untouched — see §8.6. Given §7's complete inventory, the target design below **replaces §6's items 1, 7 (retire legacy / repoint dashboards) with a concrete end-state**, and folds items 2-6, 8-15 in as the specific schema/UI changes needed to reach it. Items not superseded remain valid as-is.

### 8.1 Target principle

**One event-sourced log per "lesson delivered," not one weekly document.** Every subject-delivery activity a teacher performs — scheduled or ad-hoc — is a single `LessonReport` row, carrying full context at write time:

```
LessonReport — one row per subject delivered on a date (scheduled or ad-hoc)
```

`MentorshipSession` and `ReportProjectUpdate` continue exactly as they operate today (own tables, own admin endpoints, own UI) — no schema, API, or UI change is proposed for them in this restructure.

The lesson-relevant portions of `InstructorReport`/`ReportTopic`/`ReportLesson`/`ReportReflection` (the legacy weekly batch and its children) are **retired**, not extended — their lesson-relevant surviving fields (`key_highlights`, `what_worked_well`, `improvement_areas`, and the four support-need fields, insofar as they were being used to describe lesson delivery) migrate onto `LessonReport` as shared, reusable columns/join-tables (see 8.2), so nothing captured today is lost, but nothing new is built on the old shape. Any legacy `InstructorReport` content that was actually describing mentorship or project activity (via the `mentorship_sessions[]`/`project_updates[]` arrays `ReportDetailsModal.tsx` renders) is out of scope for this migration — those already live in their own decoupled tables per §7.1 and aren't affected either way.

### 8.2 Target schema changes (consolidates §6 items 2, 4, 8, 10, 15 — `LessonReport` only)

Add to **`LessonReport`** where not already present:
- `subject_id` (FK, `Subject`, denormalized at write time)
- `class_group_id` (FK, `ClassGroup`, denormalized at write time)
- Unique constraint on `(reported_by, lesson_id, delivery_date)` to prevent duplicate submissions (§6 item 4)

New shared lookup/join tables, scoped to `LessonReport` rows only (no polymorphic `entity_type` needed since there's now only one entity type in play):
- `SupportRequestCategory` + `LessonReportSupportRequest(lesson_report_id, category_id, note?)` — replaces the four free-text support fields (§6 item 8)
- `ChallengeCategory` + `LessonReportChallengeTag(lesson_report_id, category_id)` — enables cross-subject challenge ranking (§6 item 10)
- Keep one free-text `challenges_encountered`/`reflection_notes`/`what_happened` pair of fields per `LessonReport` row for narrative detail (already split correctly per §6 item 5) — tags/categories are additive, not a replacement for narrative text.
- `status` enum on `LessonReport` gains `UNPLANNED`/`AD_HOC` (§6 item 9) so ad-hoc, no-lesson-plan subject activity is representable without conflating it with `MISSED`.
- *(Stakeholder-confirm)* `assessment_method`/`assessment_notes` on `LessonReport` (§6 item 15).

`MentorshipSession.academic_year_id`/`academic_term_id` gap (already present, migration 044) and `ReportProjectUpdate`'s missing period columns (noted in §7.1) are **not** addressed by this restructure — flagged for a possible future, separate initiative covering those two tables, not bundled in here.

### 8.3 Target API surface

Consolidate the `LessonReport` portion of the current 20-endpoint surface into one consistent pattern, replacing ad hoc self-scoping with a shared ownership-guard middleware (closes the `PUT /reports/:id` gap in §7.2, for lesson reports specifically — verify whether the same gap exists on any mentorship/project update endpoints as a quick audit, even though fixing their broader scoping is out of scope):

- `POST/GET/PUT /api/reports/lessons[/:id]` — CRUD for lesson reports, self-scoped via middleware, not manual controller checks.
- `GET /api/reports/lessons/reportable` — retained as-is (already correct per-occurrence design, once §6 item 3's date-keying bug is fixed), extended with an ad-hoc/unscheduled mode (§6 item 9).
- `GET /api/reports/admin/lesson-reports` — retained, extended to filter/group by `subject_id` **and** `class_group_id` (currently only `subject_id` in places, `class_group_id` nowhere — §5.4). The `mentorship`/`projects`/`unified` admin endpoints are **unchanged** by this restructure.
- `GET /api/reports/admin/export` — extended per §6 items 12-14 to produce the grouped Subject × Class Group × Date Range rollup **for lesson reports**, in CSV (existing), HTML-print (existing), and new DOCX/PDF (§6 item 13) formats. **Before building new document generation, evaluate reusing/finishing `getWeeklyStitchedReport`** (§7.2) — it may already be most of this work, orphaned rather than absent (note: that endpoint currently combines all three categories into one "stitched" view — if reused, scope its output to lessons only for this phase, or explicitly decide to keep the unified view as-is and build a lesson-only export alongside it).
- Retire `/submit`, `/autofill`, `/`, `/by-date`, `/dashboard-stats` (all `InstructorReport`-shaped) **once confirmed they carry no mentorship/project-only data that would otherwise be lost** — since these legacy endpoints currently serve all three categories via `InstructorReport`'s child arrays, retiring them prematurely could affect mentorship/project data paths that are supposed to stay untouched. Audit this dependency before retiring anything (see §9 Phase 5).

### 8.4 Target permissions model

Split the single `ALL_SUBMITTED_REPORTS` permission (§7.2) into narrower, purpose-specific permissions so future roles (e.g. a department head who should see compliance stats but not run raw exports) aren't forced into all-or-nothing access:
- `VIEW_REPORTS` (list/detail/dashboard/compliance/coverage — read-only analytics, all categories including mentorship/projects, since this permission split is a cross-cutting auth concern, not a lesson-only one)
- `EXPORT_REPORTS` (the export endpoint specifically — often a stricter/audited action)
- `MANAGE_REPORTS` (admin edit/delete, if that capability is added)
Keep self-scoped instructor routes as-is (authenticate + ownership middleware per 8.3). This permission split is the one piece of the restructure that reasonably applies across all report categories, since it's about *who can see reports*, not *how lesson reports are modeled* — apply it uniformly rather than carving out a lesson-only permission scheme.

### 8.5 Target admin UI

- Replace `ReportDetailsModal.tsx`'s `InstructorReport`-only rendering with a lightweight lesson-report-specific detail view, matching the already-decoupled `LessonReport` data model instead of forcing lesson data through the legacy shape (closes the gap in §7.3, for lessons). The modal's existing mentorship/project rendering can stay as-is for now since those tables aren't changing.
- Wire up `AdminMissingReports.tsx`'s dead "Send Reminder" button to a real notification (§7.3) — even a simple in-app notification or email is a net-new capability today, since none exists. (This applies to missing-report detection broadly, not just lessons, but is a small, low-risk addition worth doing regardless of the lesson-only scope.)
- Add the subject/class-group filter pair to the **lesson-reports views** within `AdminReporting.tsx`, `AdminReportList.tsx`, and `AdminReportDashboard.tsx` (today only some views filter by subject, none by class group — §5.4/§7.1). Mentorship/project views/filters are unchanged.
- Retire `ReportForm.tsx`/`SubmittedReports.tsx` (legacy instructor-facing weekly form and its list) **for lesson reporting** in favor of `LessonReportingCalendar.tsx`/`LessonReportModal.tsx` extended with the ad-hoc mode (§6 item 9) — **only once confirmed instructors have another way to log mentorship/project updates**, since today's `ReportForm.tsx` may be the only UI path for those two categories (verify before removing; if so, either keep a slimmed-down `ReportForm.tsx` for mentorship/project entry only, or explicitly scope that as separate follow-up work).

### 8.6 Explicitly out of scope

- **`MentorshipSession` and `ReportProjectUpdate`** — different behavior/workflow from lesson reporting (per stakeholder direction, 2026-07-30); no schema, API, or UI changes proposed for either table in this restructure. Their existing gaps (missing `class_group_id` on `MentorshipSession`, missing period columns on `ReportProjectUpdate`, same free-text/no-ranking problem as lessons) are noted for a possible future, separate initiative.
- **`SchemeReportService.ts`/`SchemeReportPreviewModal.tsx`** (§7.4) and the **`ACCESS_REPORT_CARD_MODULE`** permission/report-card feature (§7.2) — separate features, unrelated to reporting, flagged only so restructure work doesn't accidentally touch them under the shared "reporting" name.

---

## 9. Phased migration plan (lesson reporting only)

1. **Phase 0 — data-integrity fixes (no schema change, low risk):** fix the date-only-keying bug (§6 item 3); verify and, if confirmed, fix the `PUT /reports/:id` ownership gap (§7.2) for `LessonReport` — this is a potential live access-control issue and should not wait for the rest of the restructure. *(Worth a quick check on the mentorship/project update paths too, even though fixing their scoping is out of scope — if the same ownership gap exists there, it should at least be logged, not silently left for later.)*
2. **Phase 1 — schema foundation:** add `subject_id`/`class_group_id` columns, the two category+join-table pairs, the `UNPLANNED` status value, and the uniqueness constraint **to `LessonReport` only** (§8.2). Backfill from existing `lesson_id`/`CalendarSlot`/`entry_id` joins where possible. `MentorshipSession`/`ReportProjectUpdate` schemas are untouched.
3. **Phase 2 — ad-hoc + admin filtering:** ship the unscheduled/ad-hoc lesson-reporting path (§6 item 9) and add subject+class-group filters to the **lesson-reports admin views** (§8.5). Mentorship/project admin views are untouched.
4. **Phase 3 — rollup export:** build/repurpose the Subject × Class Group × Date Range export **for lesson reports** (§8.3), evaluating `getWeeklyStitchedReport` first (scoping its reused output to lessons only, or building alongside it — decide explicitly, see §8.3); add DOCX/PDF generation reusing the `jsPDF` pattern from `SchemeReportService.ts` if suitable, or a template-based library otherwise.
5. **Phase 4 — categorization + ranking:** ship `SupportRequestCategory`/`ChallengeCategory` tagging and the associated admin "most requested/most frequent" views **for `LessonReport`** (§6 items 8, 10); optionally layer the Gemini-based summarization job (§6 item 11) after this ships and real data exists to summarize.
6. **Phase 5 — decommission legacy (lesson portion only):** first audit whether `ReportForm.tsx`/`InstructorReport`'s legacy endpoints are still the only path for mentorship/project logging (§8.3/§8.5) — if so, retiring them wholesale would break an out-of-scope feature, so either preserve a slimmed-down legacy path for those two categories or treat that as separate follow-up work. Once resolved, retire the lesson-relevant parts of `InstructorReport`/`ReportTopic`/`ReportLesson`/`ReportReflection` and their routes/controllers/components. Keep the tables (not hard-deleted) for a full academic year as a historical read-only archive before considering physical removal.
7. **Phase 6 — permissions split:** roll out `VIEW_REPORTS`/`EXPORT_REPORTS`/`MANAGE_REPORTS` (§8.4) once the rest of the surface is stable — this phase applies across all report categories (it's an auth concern, not a lesson-modeling concern), so it's the one phase that isn't scoped down.

---

## 10. Files referenced

- `backend/src/db/schema.ts` — `InstructorReport` (898-930), `ReportTopic` (1033-1042), `ReportLesson` (933-944), `ReportReflection` (1017-1029), `MentorshipSession` (947-993), `ReportProjectUpdate` (996-1014), `LessonReport` (1045-1077), `TeacherSubjectAssignment` (296-313), `SchemeOfWork` (620-650), `CalendarSlot` (818-844)
- `backend/migrations/011_add_access_report_card_module_permission.sql` (naming-collision note, §7.2), `035_decoupled_lesson_reporting.sql`, `039_*` (MentorshipSession intelligence-layer fields, §7.1), `044_add_academic_period_to_reporting.sql`
- `backend/src/controllers/lessonReportController.ts` (`getReportableLessons`, `submitLessonReport`)
- `backend/src/controllers/reportController.ts` (`ReportReflection` CRUD, :136-144, :563-566, :894-905; self-scoping checks :62,162,414,585)
- `backend/src/controllers/adminReportController.ts` (existing aggregation over `LessonReport` status/subject, :55-58, :151, :221; `exportReportingData` CSV/HTML export, :574-900; `getWeeklyStitchedReport`, `getAdminLessonReports`, `getAdminMentorshipLogs`, `getAdminProjectUpdates`)
- `backend/src/routes/reportRoutes.ts` (all 20 routes, `ALL_SUBMITTED_REPORTS` guard on 11 `/admin/*` routes; `PUT /:id` ownership-check gap, §7.2)
- `backend/src/utils/permissions.ts:105` (`ALL_SUBMITTED_REPORTS`)
- `frontend/src/api/reports.ts` (full 20-function `reportsApi` surface; `getWeeklyStitchedReport` orphaned — no frontend caller)
- `frontend/src/components/reporting/ReportForm.tsx` (:294-300, :639-666, :285-290, :588-596, :754-834, class-group select :460-479), `LessonReportModal.tsx`, `LessonReportingCalendar.tsx` (:222-224), `ReportingModule.tsx`, `SubmittedReports.tsx`
- `frontend/src/components/reporting/AdminReportList.tsx` (`ExportModal`, :51-282; download button :552-558), `AdminReporting.tsx` (4-tab container, :40, `loadData` :120-201), `AdminReportDashboard.tsx`, `AdminMissingReports.tsx` (dead "Send Reminder" button, :75-83), `ReportDetailsModal.tsx` (legacy-`InstructorReport`-only rendering)
- `frontend/src/services/SchemeReportService.ts`, `frontend/src/components/SchemeReportPreviewModal.tsx` (separate Scheme-of-Work PDF feature — explicitly out of scope, §7.4/§8.6)
- `reporting_prompt.md` (project root — original module spec)
- `Mathematics weekly class record.pdf` (external reference document — real-world consolidated per-subject, per-class-group weekly report example, reviewed 2026-07-30)
