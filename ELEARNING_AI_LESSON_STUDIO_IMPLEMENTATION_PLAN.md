# E-Learning Lesson Studio: AI Generation for Every Week, Any File, Connected Curriculum

**Implementation plan**

**Date:** 2026-10-01
**Status:** **Implemented** on branch `feat/elearning-lesson-studio` (2026-10-01): Phases A1–A3 and B1–B4. Not yet merged or deployed. See **§22** for the review findings, deviations, verification and what is left.
**Scope:** `nga_central_mis` (backend, frontend and `file-server/`). No satellite app changes are required.

**Builds on:**
- [`ELEARNING_MODULE_IMPLEMENTATION_PLAN.md`](./ELEARNING_MODULE_IMPLEMENTATION_PLAN.md) and [`ELEARNING_MODULE_UX_IMPLEMENTATION_PLAN.md`](./ELEARNING_MODULE_UX_IMPLEMENTATION_PLAN.md): Course, Section and Item, coverage, mastery.
- [`CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md`](./CURRICULUM_SCHEME_OF_WORK_INTEGRATION_IMPLEMENTATION_PLAN.md): the `SchemeEntryCriteria` links.
- [`AI_PROVIDER_FALLBACK_IMPLEMENTATION_PLAN.md`](./AI_PROVIDER_FALLBACK_IMPLEMENTATION_PLAN.md) and [`FREE_AI_MODELS_RESEARCH_REPORT.md`](./FREE_AI_MODELS_RESEARCH_REPORT.md): the provider chain.
- [`ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md`](./ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md): how new capabilities are granted.

**Migration numbers:** `origin/main` ends at `094`, and `095` is reserved by `feat/platform-activity`. This plan uses **096–099**. Renumber at merge time if another branch lands first.

---

## Decision record (2026-10-01)

| # | Decision | Consequence in this plan |
|---|---|---|
| D1 | **Document conversion runs on the same EC2 host** as the apps. | LibreOffice headless (`soffice`) is spawned per job. Only one conversion runs at a time, with a time limit and a memory watchdog. No always-on Docker container. Gotenberg remains a supported alternative behind `GOTENBERG_URL`, but is not deployed (§10.3). |
| D2 | **No AI budget. Only free provider tiers.** | OpenAI is out of every default order. Runs are planned against each provider's free daily quota, are spread across Gemini, Groq and GLM, and **pause and resume automatically** when a quota is used up instead of failing. Calls per week are kept to 2–3. Paid-only features (TTS narration) move to Tier 3. AI checking degrades to mechanical checks when quota is low (§7.3, §17). |
| D3 | **Generated lessons land as a `LessonNote`** (the recommendation). | A generated lesson shows in Lesson Notes (with version history, sharing and PDF export) **and** is placed on the e-learning week as a `LESSON_NOTE` item. A `PAGE` is used only for practical-task briefs. |
| D4 | **No video uploads.** Videos are external links (YouTube, Vimeo). | Video files are refused at upload with a message pointing to the Video link item. There is no transcoding and no `ffmpeg`. The recipe gets a **Video slot** block: the teacher pastes a link and the AI writes "watch for" questions. The AI never invents video URLs (§8.2, §10.1). |
| D5 | Defaults for the remaining questions follow the recommendations in §21. | See §21. All can be revisited without schema changes. |

---

## 0. Executive summary

### The problem

A teacher with four subjects × 15 weeks has about 60 e-learning weeks to fill. Each week needs three pieces:
- a lesson students can read on a phone;
- something interactive;
- a check that the week's performance criteria were met.

The screenshots show the result:
- **Development of Web User Interface** has 2 of 15 weeks live, and "0 % of the curriculum".
- Two of four subjects have no notes at all.
- The "Build it for me" button only places notes that **already exist** (`buildSectionJourney`, `services/elearning/courseCoverage.ts:100`). When no note exists, it does nothing useful.

### What we already have

Almost all the ingredients for automatic generation are already in the database:
- **Curriculum.** Every week of the scheme of work points to a Learning Outcome and to exact performance criteria: `SchemeOfWorkEntry.competency_id` and `SchemeEntryCriteria`.
- **Teaching intent.** Each scheme entry has topic, sub-topic, objective, methodology, resources and evaluation.
- **Lesson plans.** Detailed plans hang off the same entry (`LO_Lesson.entry_id`): Introduction/Development/Conclusion, trainer and learner activities, and indicative content.
- **Teacher material.** Teachers already have notes (`LessonNote` + `LessonNoteCriteria`) and subject materials (`SubjectDocument`), all linked to competencies.
- **AI.** A four-provider fallback chain exists (`services/aiProviders`: Gemini, Groq, GLM, OpenAI). Three of them have free tiers, and this plan uses only those (D2).
- **Single-item generators.** We can already generate a lesson note, a page (`/items/:id/generate-page`) and a knowledge check (`/items/:id/generate-check`).

### What is missing

1. **A connected "week bundle".** Nothing gathers scheme entry, lesson plans, notes, materials and files for one week into one grounded AI context. Today lesson plans are never used as AI input for e-learning, and they have no criteria link.
2. **A durable bulk-generation engine.** It must work through 15 weeks × several artifacts, survive restarts, spread the load across providers and never overwrite teacher work. All current AI jobs live in in-memory Maps (`aiNotesJobStore.ts` and others). These are lost on every restart, and pm2 restarts the backend at 500 MB (`ecosystem.config.js`).
3. **A customizable, interactive authoring experience.** It should take the teacher from "scheme of work" to "reviewed, published term" in minutes, not days.
4. **Any file as a learning resource, with an in-browser preview.** Today a course can only hold `SUBJECT_DOCUMENT` or PDF lesson notes by reference. Non-PDF files show *"This file opens outside the browser — download it to read"* (`learner/ItemView.tsx` ~L556).

### What this plan delivers

| # | Deliverable | What the teacher sees |
|---|---|---|
| 1 | **Week Context Pack** (§6) | Every AI call for a week is grounded in that week's scheme entry, criteria, lesson plans, notes, materials and uploaded files, with numbered sources it must cite. |
| 2 | **Connected chain** (§5) | Lesson Notes, Scheme of Work, Lesson Plans and E-Learning show each other's state ("Week 4: plan ✓ · note ✓ · on e-learning ✓"). Teachers can turn a lesson plan into a note, or a note into an e-learning week, in one click. |
| 3 | **AI orchestration v2** (§7) | The free providers work *together*: each has a role (draft, assess, verify), each one's free daily quota is tracked and shared out, a different provider cross-checks the answer keys, and a long run pauses and resumes on its own when quota runs out. |
| 4 | **Generation engine** (§8) | Database-backed runs and tasks, idempotent and resumable. Every output lands as a **draft for review**. |
| 5 | **Lesson Studio** (§9) | A modern wizard: pick weeks → choose sources → design the lesson recipe → try one week → generate all with live progress → review side by side with citations → approve week by week. |
| 6 | **Files and universal preview** (§10) | Teachers can upload any common document (PPT/PPTX, DOC/DOCX, XLS/XLSX, ODF, PDF, images, audio, text and code). Students preview it in the browser through one reusable `<FilePreview>` utility, backed by server-side conversion to PDF. Videos are YouTube/Vimeo links, not uploads. |
| 7 | **Interactive and innovative features** (§11) | Exit tickets with confidence ratings, flashcards with spaced repetition, AI-generated interactive blocks, TVET practical tasks with photo evidence, YouTube videos with "watch for" questions and offline "download this week", in tiers. |

### Effort

About **11–13 developer-weeks**, split into two parallel tracks (§18):
- **Track A:** AI generation (the priority).
- **Track B:** files and preview.

Track A Phases A1 and A2 alone already turn "2/15 weeks live" into "15/15 weeks drafted, ready to review".

---

## 1. Outcomes and success measures

| Outcome | Measure (from `AIUsageLog`, `CourseGenerationRun` and existing coverage data) |
|---|---|
| A teacher drafts a whole term of e-learning quickly | When free quota is available, median time from "Start" to "all weeks drafted" ≤ 15 min for 15 weeks. Otherwise the run finishes by the next morning without anyone watching it. Teacher review time ≤ 3 min per week. |
| Generated content follows the curriculum | Each generated week covers ≥ 90 % of its `SchemeEntryCriteria`. Every paragraph or question cites a source. |
| Teachers keep control | 0 items auto-published. 0 teacher-edited items overwritten. Acceptance rate (accepted without edit + edited) is tracked per artifact kind. |
| Students can open anything | ≥ 95 % of uploaded files reach `preview_status = READY`. The unsupported-format message is shown only for genuinely unsupported types. |
| Works on free tiers only | Every run shows its call count and whether it fits today's remaining free quota ("finishes today" / "finishes tomorrow morning"). No run ever fails because a quota ran out: it pauses and resumes. Per-teacher fair-share caps are enforced. |
| Course health improves | The share of weeks with ≥ 1 published item rises; `coverage_pct` and `curriculum_pct` rise (`courseCoverage.ts`). |

---

## 2. Analysis: what exists today

### 2.1 The chain, as it is wired today

```
SubjectCompetency (Learning Outcome / Element)          ── schema.ts:1411
  └─ CompetencyPerformanceCriteria ("1.1", "1.2" …)      ── schema.ts:1437
        ▲ SchemeEntryCriteria (entry_id, criteria_id)    ── schema.ts:1459
        ▲ LessonNoteCriteria  (note_id,  criteria_id)    ── schema.ts:1589
        ▲ CourseItemCriteria  (item_id,  criteria_id)    ── schema.ts:1825
SchemeOfWork (teacher × subject × class group × term)    ── schema.ts:733
  └─ SchemeOfWorkEntry (one per week: topic, objective, methodology,
       resources, evaluation, competency_id, start/end date)  ── schema.ts:785
        ├─ LO_Lesson[] (lesson plans; entry_id FK, NO criteria link)  ── schema.ts:829
        │    └─ LO_LearningOutcome / Activity / Resource / LessonSection /
        │       IndicativeContent / Assignment / Evaluation
        ├─ LessonNote.scheme_entry_id (legacy week link)   ── schema.ts:1549
        └─ CourseSection.scheme_entry_id (UNIQUE, 1 section per week)  ── migration 085
Course (1:1 SchemeOfWork via scheme_id UNIQUE)
  └─ CourseSection ── CourseItem (LESSON_NOTE | SUBJECT_DOCUMENT | PAGE | VIDEO |
                       LINK | KNOWLEDGE_CHECK | HEADER | TASKMENTOR_* | DISCUSSION)
SubjectDocument (subject materials, optional competency_id) ── schema.ts:1499
Document (general "Documents" module, folders/versions)   ── schema.ts:383-535
```

### 2.2 What we reuse

| Piece | Location | How this plan uses it |
|---|---|---|
| Week context and curriculum prompt block | `controllers/courseInteractiveController.ts:207` `weekContext`, `:245` `curriculumBlock` | Moved into a service and extended into the **Week Context Pack** (§6). |
| Page and knowledge-check generators | `courseInteractiveController.ts:289` and `:337` | Prompt logic moved into `services/elearning/generation/artifacts/*`. The endpoints keep working and call the same functions. |
| Lesson note generator | `controllers/lessonNoteAIController.ts:158` `processGenerateJob` | Prompt and persistence moved into `services/lessonNotes/generateNote.ts`. Used by the engine for the `CORE_LESSON` artifact. |
| Knowledge-check validator | `controllers/courseController.ts:88` `normaliseKnowledgeCheck` | All generated checks are validated with it. Max questions `MAX_KC_QUESTIONS`. |
| Seeding, coverage and journey | `services/elearning/courseSeeding.ts`, `courseCoverage.ts` | The engine calls `ensureCourseForScheme` and `syncSectionsFromScheme` before planning. After each week it calls `coverageOfSection` to show the coverage gained. |
| Note placement | `services/elearning/notePlacement.ts`, `POST /notes/:noteId/place` | Generated notes are placed using the same rules. A class-group `LessonNoteShare` is created on placement, as today. |
| Text extraction | `utils/docExtract.ts` (`pdf-parse`, `mammoth`) | Extended to pptx, xlsx, odt/odp and csv/md/txt (§10.5). |
| PDF viewer | `frontend/src/components/lessonNotes/pdf/PdfPagesViewer.tsx` (react-pdf 9) | The PDF renderer of `<FilePreview>`. |
| SSE presence | `services/elearning/livePresence.ts` | Same pattern for live run progress. |
| Interactive TipTap nodes | `frontend/src/components/elearning/interactive/nodes.tsx` (`reveal`, `inlineCheck`) | The AI is allowed to emit these nodes. New nodes are added (§11). |
| Offline queue | `frontend/src/components/elearning/learner/offline.ts`, `queue.ts` | Extended with "Download this week" (§11). |
| Provider chain | `services/aiProviders/{registry,generate,errors}.ts` | Extended, not replaced (§7). |

### 2.3 Gaps (numbered so tasks can reference them)

| ID | Gap | Evidence |
|---|---|---|
| G1 | "Build it for me" never creates content. It only places existing notes. | `courseCoverage.ts:100` `buildSectionJourney` |
| G2 | All AI jobs live in memory, so a pm2 restart (memory limit 500 MB, any deploy) silently loses them. | `services/aiNotesJobStore.ts`, `aiLessonJobStore.ts`, `aiSchemeJobStore.ts`; `ecosystem.config.js` `max_memory_restart: "500M"` |
| G3 | Lesson plans are never used as AI input for e-learning or notes, and have no criteria link. | `lessonPlanController.ts` never touches `SchemeEntryCriteria` |
| G4 | `GET /lesson-plans/entry/:entryId` has **no ownership check** and runs N+1 queries. | `lessonPlanController.ts:161` |
| G5 | No AI usage or cost record. Bulk generation would be blind. | No `usage`/token handling anywhere. Only `recordActivity({provider})`. |
| G6 | There is no AI budget (D2), and Gemini's free tier is about 20 requests/day. A 15-week run needs 30–45 calls, and every teacher in the school shares the same free keys. Calls must be spread across providers, shared fairly between teachers, and allowed to continue the next day. | `FREE_AI_MODELS_RESEARCH_REPORT.md` |
| G7 | No `FILE` item type. Teachers cannot upload a file straight onto a week. | Migration 085 `item_type` ENUM |
| G8 | Non-PDF files cannot be previewed. | `learner/ItemView.tsx` ~L556 |
| G9 | Every download buffers the **whole file in memory** before sending. A few students opening a large slide deck or subject document (subject documents allow up to 5 GB) at the same time can push the 500 MB process into a restart. | `utils/fileServer.ts:79` `downloadToBuffer`, used by `learnerCourseController.ts:411`, `curriculumController.ts:1061`, `documentController.ts:2081/3113`, `lessonNoteController.ts:714/795` |
| G10 | The file-server has no HTTP Range support, so audio cannot seek and pdf.js cannot load large PDFs page by page. | `file-server/src/routes/files.ts:92` pipes the whole stream |
| G11 | `xlsx@0.18.5` (backend and frontend) is the frozen npm build with known advisories. Parsing teacher uploads with it is a risk. | `backend/package.json:48`, `frontend/package.json:60` |
| G12 | The note length is fixed at "about 10 pages" (3,500–5,000 words). That is too long for a weekly phone lesson. | `lessonNoteAIController.ts` prompt |
| G13 | The Lesson Notes landing page knows "On e-learning x/y", but not which **weeks** have no note at all. | `lessonNoteController.ts:230` `listMyLessonNoteSubjects` |
| G14 | The provider interface only returns parsed JSON: no usage data, no model name, no per-call provider exclusion. | `services/aiProviders/types.ts` |
| G15 | Subject documents accept any type up to 5 GB with no MIME sniffing. | `routes/curriculum.ts:38-54` |

### 2.4 Hard constraints the design must respect

- **One backend process.** The backend is a single Node process (`instances: 1`, `exec_mode: fork`). Anything heavy (office → PDF, thumbnails) runs **outside** it.
- **MySQL 5.7 locally.** The local dev DB is MAMP MySQL 5.7 (see `LOCAL_SETUP.md`). Do not use `SKIP LOCKED`, CTEs or window functions in the job claim. Use an atomic `UPDATE … WHERE status='QUEUED'` and check `affectedRows`.
- **Timeouts.** nginx allows 3,600 s, but the frontend axios default is **10 s** (`frontend/src/services/api.ts:43`). Every long action must return **202** and report progress by SSE or polling.
- **Single storage host.** Storage is the internal file-server on the same EC2 host (local disk, `X-API-Key`). There is no S3. Every file read goes through the backend's access checks.
- **Shared EC2 host (D1).** The production host also runs Task Mentor, Tupo and Discipline & Attendance, and conversion runs there too. So conversion is one `soffice` process at a time, short-lived, time-limited and memory-watched (§10.3). Phase 0 measures free RAM and CPU to set those limits.
- **Free AI tiers only (D2).** Quotas are small, differ per provider and reset daily. The engine must treat "quota used up" as a normal state, not an error (§7.3).

---

## 3. Research summary

Full sources are at the end. These findings drive the decisions below.

**How other LMSs do AI course building.**
- D2L **Brightspace Lumi** builds modules from a Word or PowerPoint file, with mandatory review before insertion.
- **Canvas IgniteAI** (Nov 2025) aligns content to outcomes and drafts quizzes and rubrics.
- **Moodle 4.5/5** has a core AI subsystem with providers and usage reports; the `local_coursegen` plugin builds a course from a syllabus.
- **Google Classroom** has Gemini tools and NotebookLM/Gems that are **grounded only in class materials**.
- **Khanmigo** has teacher tools (exit tickets, lesson plans) and a Socratic tutor.
- The common pattern: **ground on the teacher's own material, draft by default, review before publishing, show AI provenance.**

**Best practice for bulk generation.**
- Use a parent job with per-week and per-artifact sub-tasks that are idempotent (hash of inputs + prompt version) and resumable.
- Record which provider and model made each item.
- Request structured JSON with `source_refs`, and run a second-pass checker on answer keys.
- Enforce quotas per teacher and per day.
- Follow UNESCO guidance: human oversight, and no automated high-stakes decisions.

**Document preview.**
- Browser PPTX rendering is still immature. The canonical approach is **server conversion to PDF** with LibreOffice, either through **Gotenberg** (MIT, Docker, `POST /forms/libreoffice/convert`) or headless `soffice`, then pdf.js in the browser.
- Client-side libraries are fallbacks only:
  - `docx-preview` (Apache-2.0, maintenance mode)
  - SheetJS CE from the SheetJS CDN (the npm `xlsx` build is frozen)
  - `PptxViewJS` (MIT), behind a flag after a spike
- Never use the Google or Microsoft online viewers: they send school files to third parties.

**Interactive features with good evidence and a fit for low-bandwidth TVET.**
- Exit tickets with confidence ratings.
- Spaced-repetition flashcards (`ts-fsrs`, MIT).
- H5P-like interactions built natively from JSON. This is easier for AI to generate and lighter on phones than embedding H5P.
- Rule-based remediation.
- Pre-generated, compressed audio narration (needs a TTS provider; there is no free tier, so it is Tier 3 here).
- Offline "download this week".
- Gamification tied to mastered competencies, never public leaderboards of weak students.

---

## 4. Design principles

1. **Reuse before generate.** If a teacher note, lesson plan or material already covers a criterion, place it or ground on it. Only generate what is missing. Generation fills gaps; it does not replace teachers.
2. **Draft by default, never auto-publish.** Every AI output lands as a `DRAFT` note or an `is_published = 0` item with `review_state = PENDING_REVIEW`. Only a teacher action publishes. The engine never changes `Course.status` or `CourseSection.status`.
3. **Grounded and cited.** Prompts contain only the week's context pack, with sources numbered `[S1]…[Sn]`. Output schemas require `source_refs`, and the reviewer UI shows the cited snippet. Uncited content is flagged.
4. **Curriculum is the contract.** The target of every week is its `SchemeEntryCriteria` list. Success is measured by the existing coverage service, not by word count.
5. **Never overwrite human work.** Items or notes with `review_state ∈ {ACCEPTED, EDITED}`, or `ai_origin = NONE`, are immutable to the engine. Regenerating creates a new draft beside them.
6. **Durable and idempotent.** All state lives in MySQL. A restart resumes the run. Rerunning a run with unchanged inputs spends no AI quota.
7. **Long work is asynchronous.** Endpoints answer in under 1 s (202 plus an id). Progress arrives by SSE with polling as fallback.
8. **Heavy work runs out of process.** Office conversion, thumbnails and transcoding never run inside `mis-backend`.
9. **Files stay in the school.** No third-party viewers. AI providers receive extracted text only, never raw files and never student data.
10. **Phone first.** Lessons are short sections with interactive breaks. Previews are lazy-loaded, and each week shows its download size before an offline save.

---

## 5. Workstream A: connecting curriculum, scheme of work, lesson plans, notes and e-learning

**Goal:** every surface knows the state of the same week, and each artifact can produce the next one in one click.

### 5.1 One shared read model: `WeekBundle`

New service: `backend/src/services/curriculumChain/weekBundle.ts`.

```ts
interface WeekBundle {
  entry: { entry_id; scheme_id; week_number; start_date; end_date; topic; sub_topic;
           objective; methodology; resources; evaluation; entry_status };
  competency: { competency_id; element_number; title; indicative_content; learning_hours } | null;
  criteria: { criteria_id; criteria_number; description }[];          // SchemeEntryCriteria
  lessonPlans: { lesson_id; session_code; lesson_date; big_question;
                 outcomes: {code; title}[]; sections: {type; trainer; learner; minutes}[] }[];
  notes: { note_id; title; status; source; is_pdf; criteria_ids: number[];
           placed_item_id: number | null }[];       // anchored by scheme_entry_id OR criteria overlap
  materials: { document_id; original_name; mime_type; file_size; competency_id }[];
  section: { section_id; status; unlock_at; item_count; published_item_count } | null;
  coverage: { targets: number; covered: number; gaps: number[] } | null;  // coverageOfSection
  readiness: { has_topic; has_criteria; has_plan; has_note; has_items; is_live };
}

loadWeekBundles(schemeId: number, viewerUserId: number): Promise<WeekBundle[]>
```

- The function uses **one query per table**, grouped by `entry_id` (no N+1), and checks scheme ownership or building permission through `assertCanBuildCourse`.
- **Endpoint:** `GET /scheme-of-work/schemes/:id/week-bundles`.
- **Consumers:**
  - Lesson Studio, step 1 (§9).
  - The Scheme of Work calendar, as week badges.
  - The Lesson Notes subject page, as the week strip.
  - The e-learning `WeekContextPanel`.

### 5.2 Fixes and links (small, do first)

| Task | Files | Notes |
|---|---|---|
| **G4.** Ownership check and query batching on `GET /lesson-plans/entry/:entryId` | `controllers/lessonPlanController.ts:161` | Allow the scheme owner, anyone holding course-build rights on the scheme's course, or an admin with the existing scheme-view permission. Use 7 batched `IN (…)` queries instead of N+1. This is a **security fix**: ship it on its own. |
| Lesson plans inherit criteria | none (no schema change) | A plan's criteria = its entry's `SchemeEntryCriteria`. Document this in code and use it in the bundle. **No new join table**, because plans are always per entry. |
| Generated notes set both links | `services/lessonNotes/generateNote.ts` (new, extracted) | Set `scheme_entry_id` (legacy week link) **and** `LessonNoteCriteria`, so every existing reader keeps working. |
| `listMyLessonNoteSubjects` adds week coverage | `lessonNoteController.ts:230` | Add `weeks_total`, `weeks_with_note` and `weeks_live` per subject (current scheme for the class group and term). The cards show "Notes for 6/15 weeks · 2 live" (G13). |

### 5.3 One-click bridges

| From → To | Where the button lives | Backend |
|---|---|---|
| **Lesson plan → lesson note** ("Write student notes from this plan") | Lesson plan view; week bundle row | `POST /lesson-notes/ai-generate` gains `lesson_id[]`. The context pack puts the plan first. |
| **Note → e-learning week** ("Put on e-learning") | Already exists (`POST /notes/:noteId/place`) | No change. Surfaced on the week strip. |
| **Scheme week → e-learning week** ("Generate this week") | Scheme calendar week popover; e-learning builder banner | Creates a Lesson Studio run limited to one week (§8). |
| **E-learning gap → AI** (upgraded "Build it for me") | `CourseBuilderPage.tsx:179` banner | Step 1: `buildSectionJourney` (place existing notes, as today). Step 2: if `still_missing` is not empty, offer **"Generate the missing part"**, which starts a one-week run with `blocks` limited to the gap criteria. |
| **Subject material → e-learning** | Subject Materials tab, per file: "Add to week…" | `POST /elearning/sections/:id/items` with `SUBJECT_DOCUMENT`. Already supported, but only reachable from the builder today. |

### 5.4 UI: the week strip (shared component)

`frontend/src/components/curriculumChain/WeekStrip.tsx`
- A horizontal strip with one chip per week, coloured by readiness:
  - grey: no topic
  - amber: topic but no content
  - blue: drafted
  - green: live
- Each chip has four dots: Plan · Note · E-learning · Coverage %.
- **Used on:** the Lesson Notes subject view (above the note list), the Scheme of Work calendar header and Lesson Studio step 1.
- Clicking a chip opens a `WeekPeek`-style popover (reuse `builder/WeekPeek.tsx`) with the bridges from §5.3.

---

## 6. Workstream B: the Week Context Pack

This is the single grounding input for every AI artifact, whether generated in bulk or one at a time.

`backend/src/services/elearning/generation/contextPack.ts`

```ts
interface ContextSource {
  ref: string;                 // "S1", "S2", … stable within one pack
  kind: "SCHEME_ENTRY" | "CURRICULUM" | "LESSON_PLAN" | "LESSON_NOTE"
      | "SUBJECT_DOCUMENT" | "COURSE_FILE" | "TEACHER_UPLOAD" | "TEACHER_INSTRUCTION";
  id: number | null;           // entry_id / lesson_id / note_id / document_id / asset_id
  title: string;
  text: string;                // already trimmed to its budget
  priority: number;            // lower = more authoritative
}
interface WeekContextPack {
  week: { entry_id; section_id; week_number; topic; objective; dates };
  criteria: { criteria_id; number; description }[];   // the contract
  sources: ContextSource[];
  hash: string;                // sha256 of normalised sources + criteria; used for idempotency
  truncated: boolean;
  approx_tokens: number;
}
buildWeekContextPack(sectionId, opts: { sources: SourceToggles; extraAssetIds?: number[];
                                        budgetTokens?: number }): Promise<WeekContextPack>
```

### Source priority and budgets

The default total budget is about 12k input tokens, configurable through `ELEARNING_AI_CONTEXT_TOKENS`.

| Priority | Source | Budget | Notes |
|---|---|---|---|
| 0 | Scheme entry + curriculum block (current `curriculumBlock`) | always in full | The contract |
| 1 | Lesson plans for the entry (sections, activities, indicative content, assignment) | 3k | Closest to what happens in class |
| 2 | Teacher's own notes for the week's criteria (anchored or criteria-matched, newest first) | 3k | `content_html` → text; PDF notes already hold extracted text in `content_html` |
| 3 | Files the teacher attached to this run or week (`FileAsset.text`) | 3k | §10.5 |
| 4 | Subject materials whose `competency_id` matches | 2k | Cached text derivative (§10.5). Never downloaded per call. |
| 5 | Previously **accepted** items of earlier weeks (titles + key terms only) | 0.5k | Continuity, with no repetition ("last week you learned…") |

### Rules

- **Chunking.** Each source is split by headings into paragraphs. Chunks are scored by keyword overlap with the criteria descriptions and the topic (plain BM25-lite, no vectors), and the best chunks are taken within the budget. Reuse the token estimate from `lessonNoteAIController.ts` (characters / 4).
- **Text sources.** All text comes from the DB or from cached derivatives. Building a pack **never downloads a file**.
- **PII guard.** Strip student names and emails. Packs never include `UserProfile` data beyond the teacher's display name (which is not needed either).
- **Prompt format.** The rendered prompt uses `<<S1: Lesson plan "…">> … <</S1>>` blocks, so `source_refs` can be checked mechanically.
- **Inspection endpoint.** `GET /elearning/sections/:id/context-pack?…` returns the pack **without the text bodies** (titles, kinds, token counts). Studio step 2 shows it so the teacher sees what the AI will read.

---

## 7. Workstream C: AI orchestration v2 ("providers working together")

Extend `services/aiProviders` **without breaking** its 17 current call sites (listed in the analysis notes): the new options are all optional.

### 7.1 Interface changes (`types.ts`, each provider)

```ts
interface GenerateJSONResult<T> { data: T; usage?: { input_tokens?: number; output_tokens?: number };
                                  model: string; latency_ms: number }
interface AIProvider { …; generateJSON<T>(p: GenerateJSONParams): Promise<GenerateJSONResult<T>>; }

generateStructuredContent<T>(params, opts?: {
  providerOrder?: string[];
  role?: "draft" | "assess" | "verify" | "repair" | "interactive";  // NEW
  excludeProviders?: string[];                                      // NEW (verifier ≠ drafter)
  feature?: string;           // NEW, e.g. "elearning.core_lesson"; used for logging and quotas
  actorUserId?: number; courseId?: number; runId?: number;          // NEW, logging
}) => Promise<{ data: T; providerUsed: string; model: string; usage?: …; attempts: AttemptLog[] }>
```

- **Gemini.** Read `response.usageMetadata`. Set `thinkingBudget: 0` for JSON, as Task Mentor already does: thinking tokens truncated JSON arrays there (see the comment in `courseInteractiveController.ts:307`).
- **Groq and GLM** (and OpenAI, if a key is ever added). Read `completion.usage`.
- **Return shape.** The existing callers destructure `{data, providerUsed}`, so the extra fields are harmless.

### 7.2 Role-based routing

Configure it with env `AI_ROLE_ORDER_<ROLE>`, defaulting to `AI_PROVIDER_ORDER`.

| Role | Default preference | Why |
|---|---|---|
| `draft` (long HTML lessons) | glm → gemini → groq | GLM-4.5-Flash is free with no small daily cap and handles long output. Gemini's ~20 requests/day are kept for where its quality matters most. |
| `assess` (MCQ, flashcards, exit tickets: strict JSON) | groq (gpt-oss, strict `json_schema`) → gemini → glm | Strict schema, so fewer malformed answer keys |
| `verify` (answer-key and grounding check) | Any configured provider **except** the one that drafted the artifact | Independent second opinion |
| `repair` (fix JSON that failed the schema) | groq → glm → gemini | Fast |

**OpenAI** is excluded from every default order, because there is no budget (D2). The code keeps the provider, so adding a key with credit later only needs an env change. Phase 0 confirms these orders with the prompt-quality spike.

### 7.3 Living on free tiers (G6, D2)

New file `services/aiProviders/limiter.ts`. This is the most important part of the AI layer, because the school has no AI budget.

**Per-provider limits** (all env-configurable, filled in during Phase 0 from the real limits of the keys in use):

| Env | Meaning |
|---|---|
| `AI_DAILY_REQUESTS_<PROVIDER>` | Free requests per day (for example, Gemini about 20, per `FREE_AI_MODELS_RESEARCH_REPORT.md`) |
| `AI_RPM_<PROVIDER>` | Requests per minute |
| `AI_TPM_<PROVIDER>` | Tokens per minute (Groq's free tier limits tokens per minute, which matters for long lessons) |
| `AI_MAX_CONCURRENCY_<PROVIDER>` | Parallel calls, default 1 on free tiers |
| `AI_QUOTA_RESET_UTC_HOUR_<PROVIDER>` | When the daily count resets |

**How it behaves:**
- **Count before calling.** Usage today comes from `AIUsageLog` (cached for 60 s). A provider with no quota left is skipped **without** being called, like a cooling-down provider. A 15-week run therefore moves to the next provider without each call first failing on an exhausted one.
- **Reserve for interactive use.** `AI_INTERACTIVE_RESERVE_PCT` (default 25 %) of each provider's daily quota is kept for synchronous features: note edit, page draft, the student tutor, "Generate it" for one week. Bulk runs can only use the rest. A teacher clicking one button during the day must not find the quota eaten by a colleague's 15-week run.
- **Fair share between teachers.** The bulk quota left today is divided across teachers with active runs (round-robin by run in the worker, §8.5). One teacher cannot drain the day.
- **Quota exhausted = pause, not failure.** When no provider can take the next task, the run goes to `PAUSED_QUOTA`.
  - The worker probes once every 30 minutes and after each provider's reset hour.
  - The run resumes on its own as soon as a provider accepts a call.
  - The teacher sees "Paused: today's free AI quota is used up. Continues automatically, expected around 08:00" and gets a notification when the run is ready for review.
- **Off-peak scheduling.** Full runs may be started "Tonight" (the default when the estimate does not fit today's remaining quota). They are queued with `not_before` = 19:00 Kigali time, so they use the quota evening and night, when teachers are not using interactive features.
- **Dead-provider parking.** Port `isDeadProviderError` from Task Mentor. A bad key or a provider that suddenly requires billing is parked for 1 h, separate from the 5-minute quota cooldown.
- **Reuse before calling.** Idempotent tasks (§8.5) mean a rerun or a retry never spends quota on content that already exists.

### 7.4 Usage log (G5)

Table `AIUsageLog` (migration 097).

- **One row per provider attempt:** feature, role, provider, model, ok/error class, latency, tokens in and out, actor, course and run. There is no cost column: everything is on free tiers (D2). If a paid key is added later, cost can be derived from the token counts.
- **Write path.** Written fire-and-forget from `generate.ts`, so it never blocks or fails a generation.
- **Reads.** Quota counting (§7.3), Studio estimates ("fits today's quota?"), per-teacher fair share, and the admin "AI usage" panel (§15).

### 7.5 The verifier pass

`services/elearning/generation/verify.ts` runs on `KNOWLEDGE_CHECK`, `EXIT_TICKET` and `FLASHCARDS` artifacts, and on `CORE_LESSON` when the blueprint enables "Strict accuracy".

| Input | Output schema |
|---|---|
| The generated artifact + the cited source chunks + the criteria | `{ issues: [{ target_id, kind: "WRONG_KEY" \| "AMBIGUOUS" \| "UNSUPPORTED_BY_SOURCE" \| "OFF_CRITERIA" \| "READING_LEVEL", note, suggested_fix? }] }` |

- **Mechanical checks** run first and need no AI: every MCQ has exactly one valid `correct_index` (`normaliseKnowledgeCheck`), every `source_refs` entry exists in the pack, and the criteria numbers are in the week's list.
- **When issues are found.** For `WRONG_KEY` and `AMBIGUOUS`, run one **repair** call with the issues listed. Otherwise attach the issues to the item as `review_flags`, so the teacher sees them in review. The engine never silently drops a flagged item.
- **When quota is low.** The AI verify call is skipped (only the mechanical checks run) when the bulk quota left today is under 20 %, or when no provider other than the drafter is available. The item gets the flag `NOT_CROSS_CHECKED`, and the review screen shows "Answers not double-checked by a second AI. Please check them." The run never waits only for verification.

---

## 8. Workstream D: the generation engine

### 8.1 Concepts

- **Blueprint.** The teacher's lesson recipe: which artifacts, how many, the style and the sources. It can be saved as a preset per teacher, subject or department.
- **Run.** One execution of a blueprint over a course and a set of weeks.
- **Task.** One unit of AI work: `(run, week, artifact kind)`. Tasks within a week form a small dependency graph (DAG): `CORE_LESSON` comes first, and the assessments are grounded on its output.

### 8.2 Artifact kinds (a registry; each kind is one file in `generation/artifacts/`)

| Kind | AI role | Lands as | Phase |
|---|---|---|---|
| `REUSE_PLACEMENT` | none | Places existing notes and materials that cover gap criteria (wraps `buildSectionJourney`, extended to `SUBJECT_DOCUMENT` by `competency_id`) | A2 |
| `CORE_LESSON` | draft | `LessonNote` (DRAFT, `source=AI_GENERATED`, criteria + `scheme_entry_id`) **plus** a `LESSON_NOTE` CourseItem (D3). | A2 |
| `ASSESSMENT_PACK` | assess + verify | **One call** returns the knowledge check, and (when the recipe asks for them) the exit ticket and the flashcards, to save free quota. Split on persist into a `KNOWLEDGE_CHECK` item aligned to criteria (`CourseItemCriteria`), plus `EXIT_TICKET` and `FLASHCARDS` items once B3 lands. | A2 (check), B3 (ticket, cards) |
| `VIDEO_SLOT` (D4) | assess (inside `ASSESSMENT_PACK`, no extra call) | A `VIDEO` item placeholder: "Paste a YouTube or Vimeo link for this week", with AI-written "watch for" questions in its description. It stays unpublished until the teacher adds a link. **The AI never proposes URLs.** | A2 |
| `PRACTICAL_TASK` (TVET) | draft | `PAGE` item: task brief, steps, safety notes, success checklist mapped to criteria. Phase B3 upgrades it to `PRACTICAL_TASK` with evidence upload. | A2 |
| Interactive breaks (inside `CORE_LESSON`, no extra call) | draft | Inserted inside the lesson HTML as TipTap nodes (`reveal`, `inlineCheck`, plus new `fillBlank`, `orderSteps`, `matchPairs`) | A3 |
| `FLASHCARDS` (part of `ASSESSMENT_PACK`) | assess | `FLASHCARDS` item (key terms ↔ definitions, optional Kinyarwanda gloss). Cards are seeded from `CORE_LESSON.key_terms`, so often no extra AI work is needed. | B3 |
| `EXIT_TICKET` (part of `ASSESSMENT_PACK`) | assess | `EXIT_TICKET` item (1–3 questions + a confidence rating) | B3 |

There is no audio-narration artifact: text-to-speech has no usable free tier, so it is Tier 3 (§11).

Each artifact module exports the same contract:

```ts
interface ArtifactGenerator<Out> {
  kind: ArtifactKind;
  dependsOn: ArtifactKind[];
  promptVersion: string;                       // bump when the prompt changes → new input hash
  estimate(pack, blueprint): { calls: number; output_tokens: number };
  generate(ctx: { pack; blueprint; upstream: Record<ArtifactKind, any>; ai: AIClient }): Promise<Out>;
  validate(out: Out, pack): ValidationIssue[];  // mechanical checks (§7.5)
  persist(out: Out, tx, ctx): Promise<{ note_id?: number; item_ids: number[] }>;
}
```

### 8.3 What `CORE_LESSON` produces (phone-first)

The output schema, used with `role: "draft"` and `maxOutputTokens` 8000–12000 depending on length:

```json
{
  "title": "Structuring HTML with Lists and Links",
  "summary": "One paragraph: what you will be able to do",
  "sections": [
    { "heading": "…", "html": "<p>…</p>", "source_refs": ["S1","S3"], "criteria": ["1.1"] }
  ],
  "worked_example": { "html": "…", "source_refs": ["S2"] },
  "key_terms": [{ "term": "anchor", "definition": "…", "gloss_rw": null }],
  "check_yourself": ["…", "…"],
  "covered_criteria": ["1.1"]
}
```

- **Assembly.** The server assembles the HTML in a fixed order: summary → sections (with interactive nodes, A3) → worked example → key terms → check yourself. It then runs it through `sanitizeNoteHtml` and stores the citations as `data-src="S1"` attributes. These are hidden from students and shown in teacher review.
- **Interactive breaks in the same call.** When the recipe asks for interactive breaks (A3), they are part of the `CORE_LESSON` schema (`sections[].interaction`), not a separate call. This keeps a full week at 2–3 calls (§17).
- **Length options** (G12). The existing 10-page full-note prompt stays for `/lesson-notes/ai-generate`. The Studio offers three lengths:

  | Length | Words |
  |---|---|
  | `SHORT` | 600–900 |
  | `STANDARD` (default) | 1,200–1,800 |
  | `FULL` | the existing 3,500+ prompt |

### 8.4 Run lifecycle

```
          create (202)
DRAFT_PLAN ──────────► PLANNED ──start──► RUNNING ──all tasks terminal──► READY_FOR_REVIEW ──all weeks approved/dismissed──► COMPLETED
    │ (preview mode:       │                  │  ▲ resume                         │
    │  one week only)      │                  ▼  │                               └──► PARTIALLY_APPROVED (still COMPLETED when closed)
    └──────────────────────┴──cancel──► CANCELLED      PAUSED (teacher) · PAUSED_QUOTA (free quota used up; resumes by itself, §7.3)
Task: QUEUED → RUNNING → SUCCEEDED | FAILED (attempts < 3 → QUEUED with backoff) | SKIPPED (reuse covered it / dependency failed) | CANCELLED
```

**Planning** (`planner.ts`) is synchronous and fast, with no AI:

1. Call `ensureCourseForScheme` and `syncSectionsFromScheme`.
2. For each selected week, build the context pack metadata (hash only).
3. Decide which tasks are needed:
   - When `blueprint.reuse_existing_notes` is on and a week's gap criteria are already covered by placed or placeable notes, `CORE_LESSON` is **SKIPPED** with reason `COVERED_BY_EXISTING`.
   - A week is skipped when it has no topic and no criteria (reason `NO_CURRICULUM`; Studio offers to fix the scheme entry first).
   - An item of the same kind already accepted with the same `input_hash` → SKIPPED (`UNCHANGED`).
4. Return the estimate: number of calls by provider role, approximate tokens and minutes, **whether it fits today's remaining free quota** (if not, when it is expected to finish, and a suggestion to start it "Tonight"), plus the list of skipped weeks with reasons.

### 8.5 The worker

`services/elearning/generation/worker.ts`, started from `index.ts` beside the existing sweeps.

```
every 2 s (and immediately when a run starts):
  claim up to (GLOBAL_CONCURRENCY − running) tasks:
    candidates = SELECT task_id FROM CourseGenerationTask
                 WHERE status='QUEUED' AND not_before <= NOW()
                   AND all dependencies SUCCEEDED/SKIPPED
                 ORDER BY run priority, week position, kind order LIMIT n
    for each: UPDATE … SET status='RUNNING', claimed_at=NOW(), attempts=attempts+1
              WHERE task_id=? AND status='QUEUED'      -- claim only if affectedRows = 1
  run each claimed task (no await chain across tasks), heartbeat every 15 s
on boot and every 60 s: tasks RUNNING with heartbeat older than 3 min → QUEUED (restart recovery)
```

**Settings:**
- `ELEARNING_AI_CONCURRENCY` (default 3).
- Backoff: 30 s × 2^attempt with jitter.
- A run moves to `PAUSED_QUOTA` instead of failing when every provider's free quota or the teacher's fair share is used up. It resumes by itself (§7.3), and the UI says when.
- **Claim order is round-robin by run** (one task from each active run in turn), so the free quota is shared fairly between teachers. Preview and single-week runs go before full runs.

**Task execution, step by step:**
1. Rebuild the context pack (cheap, from the DB). If `hash` changed since planning, record it; this is not an error.
2. Compute `input_hash = sha256(kind, promptVersion, pack.hash, blueprint slice, upstream output hash)`.
3. Call `generate`, then `validate`, then (if the kind needs it) verify and repair.
4. In **one transaction**: check that the target slot is still writable (principle 5), call `persist`, store `output_ref`, and mark the task SUCCEEDED.
5. Emit an SSE event `{run_id, task_id, week, kind, status, coverage_after}`.

**Failure:** after 3 attempts the task is marked FAILED with a friendly error from `friendlyAIErrorMessage`. Its dependent tasks are SKIPPED with reason `DEPENDENCY_FAILED`, and the week shows **"Retry"** in the UI.

### 8.6 Output landing and the review state

New columns on `CourseItem` (migration 097):
- `ai_origin` ENUM('NONE','AI_GENERATED','AI_ASSISTED')
- `generation_task_id`
- `review_state` ENUM('NOT_REQUIRED','PENDING_REVIEW','ACCEPTED','EDITED','DISMISSED')
- `source_refs` JSON
- `review_flags` JSON
- `input_hash`

Every generated item is `is_published = 0` and `review_state = PENDING_REVIEW`.

- **Edited.** Any teacher PATCH of the item (or of its note's content) moves `PENDING_REVIEW → EDITED`. Hook this into `PATCH /items/:id` and `updateLessonNote`.
- **Approve week** (`POST /elearning/generation/runs/:id/weeks/:sectionId/approve`):
  - Body: `{ item_ids?: number[], publish_section?: boolean }`. Without `item_ids`, it approves all pending items of the week.
  - Sets `is_published = 1` and `review_state = ACCEPTED`.
  - Sets each linked note to `status = PUBLISHED`, using the existing `isPublishable` check.
  - With `publish_section: true`, it moves the section from `HIDDEN` to `SCHEDULED` (it unlocks on its date, through the existing `publishDueSections`) or to `PUBLISHED` if the date has already passed.
  - It writes an activity record.
  - It never touches `Course.status`. If the course is still `DRAFT`, the UI reminds the teacher: "Students see nothing until you publish the course".
- **Dismiss** deletes the draft item (and its note, if the note is AI-generated, never edited and never placed elsewhere), and marks the task `DISMISSED`.
- **Regenerate** (`POST /elearning/generation/items/:id/regenerate` `{instruction?}`) creates a one-task child run. The new draft replaces the old one **only** if the old one is still `PENDING_REVIEW`; otherwise it is inserted beside it.

### 8.7 Guard rails

- **One active run per course.** A second run gets a 409 with the active run's id.
- **Daily cap per teacher.** `ELEARNING_AI_DAILY_TASKS_PER_USER` (default 150) and `ELEARNING_AI_DAILY_TASKS_SCHOOL` (default 2000), counted from `CourseGenerationTask` rows created today.
- **Preview mode is mandatory before the first full run of a blueprint.** The UI enforces it; the API allows `preview_section_id`.
- **Prompts as data.** The teacher's free-text instructions (max 2,000 characters) are passed as a quoted block, never as system text. The prompt tells the model to ignore instructions found inside sources.
- **Provenance.** Every generated note keeps a `LessonNoteVersion` with `created_by = 'AI'` and `prompt_text` = blueprint summary + run id, so the existing version history shows where it came from.

---

## 9. Workstream E: the Lesson Studio UI (interactive and customizable)

**Route:** `/elearning/courses/:courseId/studio`. It is also reachable from:
- a **"✨ Build with AI"** button in the course builder header, beside Preview and More;
- the Lesson Notes subject card ("Fill all weeks with AI");
- the Scheme of Work toolbar, next to `CourseTabButton`.

**Folder:** `frontend/src/components/elearning/studio/`.

### 9.1 Layout

The layout is a full-height, three-pane workspace on desktop and a stepper on phones. It matches the dark UI in the screenshots and reuses `design/motion.ts` and `components/elearning/ui`.

```
┌ Header: Development of Web User Interface · L3 Class A · Term 1   [Preset ▾] [34 AI calls · fits today's free quota ✓] [Start ▾ now | tonight] ┐
├ Stepper:  ① Weeks  ② Sources  ③ Recipe  ④ Try one week  ⑤ Generate  ⑥ Review                                         ┤
├─────────────── Left: WeekRail ───────────────┬──────── Centre: step content ────────┬── Right: Live preview / Inspector ─┤
│ ☑ W1 7 Sep   No topic yet         ⚠ fix     │                                      │ phone-frame preview of the current │
│ ☑ W2 14 Sep  Intro to Web Pages   ● live    │                                      │ week as a student sees it,         │
│ ☑ W4 28 Sep  Lists and Links      ○ gap 1.1 │                                      │ updated as the recipe changes      │
│ …           readiness dots P·N·E·%          │                                      │                                    │
└──────────────────────────────────────────────┴──────────────────────────────────────┴────────────────────────────────────┘
```

### 9.2 Steps

1. **Weeks.** The `WeekRail` shows every week with readiness from `week-bundles`.
   - Quick selectors: *All weeks* · *Only weeks with gaps* (default) · *From this week on* · *Custom range*.
   - Weeks with no topic or criteria show "Fix in scheme" (deep link to the entry editor) or "Let AI suggest the entry" (existing `/entries/ai-suggest`).
2. **Sources.** Per source kind, a toggle with a count: Scheme entry (always on) · Lesson plans (n) · My notes (n) · Subject materials (n) · Curriculum indicative content.
   - **"Add reference files"** is a drop zone that uploads `FileAsset`s scoped to the run. They are text-extracted and become context, but they are **not** placed on the course unless the teacher ticks "also give to students".
   - A per-week expandable "What the AI will read" list comes from the context-pack endpoint, showing token use as a small bar.
3. **Recipe (the blueprint).** A drag-to-order list of **blocks** (dnd-kit; check whether it is already in the frontend, otherwise use the existing reorder pattern in `WeekList.tsx`):
   - **Blocks:** Lesson (format: Lesson note | Page; length S/M/L) · Interactive breaks (0–3 per lesson) · Worked example · Practical task · Video slot (teacher pastes a YouTube/Vimeo link; AI writes "watch for" questions) · Knowledge check (3–10 questions; MCQ/True-False mix; difficulty band) · Flashcards (5–15) · Exit ticket (1–3).
   - **Style panel:** language of instruction (EN default; FR), optional Kinyarwanda glossary for key terms, reading level (L3/L4/L5), tone (friendly/formal), "use Rwandan workplace examples", "strict accuracy (extra verification)".
   - **Free-text teacher instructions** (max 2,000 characters), with chips from `quickPrompts.ts`, e.g. "Use a car-garage example".
   - **Presets:**
     - *Quick week* (short lesson + 5-question check)
     - *Full lesson* (standard lesson + 2 interactive breaks + worked example + 8-question check + exit ticket)
     - *Practical TVET week* (short theory + practical task + checklist + exit ticket)
     - *Revision week* (flashcards + 10-question check)
   - **"Save as preset"** stores it per teacher; programme leads can mark a preset "shared with my department" (§14).
   - The phone preview on the right shows a **skeleton** of the resulting week (block outlines), so the recipe is concrete before any AI call.
4. **Try one week.** Generates the recipe for one chosen week (default: the current week, marked "Now"). It shows the real output in the review pane, so the teacher can tweak the recipe and try again. Recommended before a full run.
5. **Generate.** A live board with one card per week, streaming state: Queued → Reading sources → Writing lesson → Writing questions → Checking answers → Ready.
   - Each card shows the provider badge (e.g. "Gemini · checked by Groq") and the coverage gained ("1.1 ✓ 1.2 ✓").
   - Controls: Pause · Resume · Cancel · Retry failed.
   - The teacher can leave the page. Runs continue on the server, and a reminder notification (through the existing notification or Reminder Hub path) fires when the run is ready for review.
   - Updates come from SSE (`GET /elearning/generation/runs/:id/stream`) with a 3 s polling fallback.
6. **Review.** For each week, a split view:
   - **Left:** the generated content in the real student renderer, with citation chips `S2` that highlight the source excerpt in a drawer.
   - **Right:** the criteria checklist (turns green as items cover it), `review_flags` (e.g. "Q3: the answer key may be ambiguous"), per-item **Accept · Edit · Regenerate with note · Dismiss**.
   - Week-level actions: **Approve week** (+ "turn this week on" toggle) and **Approve all clean weeks** (weeks with no flags).
   - Editing opens the existing editors (`LessonNoteRichEditor` / `ItemSettingsDrawer`) in a side sheet. Saving marks the item `EDITED`.
   - Keyboard: `J/K` next/previous week, `A` approve, `E` edit, `R` regenerate.

### 9.3 State and data flow

- **State.** Server state comes from React Query (or the pattern already used in `api/elearning.ts`). The Studio keeps only UI state locally: the blueprint draft, autosaved to `localStorage` per course, wrapped in try/catch.
- **Pure logic** lives in `studio/studioModel.ts`, for testing: estimate formatting, preset ↔ blueprint mapping, week selection rules, review keyboard map.
- **Accessibility.** Focus management follows the accessible `ui/Modal`. Every live status change is announced through an `aria-live="polite"` region. Secondary text uses `slate-600 / dark:slate-300`. Run `backend/scripts/access-ux/ux-audit.cjs`-style axe checks on the Studio (both themes × 3 viewports).

### 9.4 Builder integration

- **Header button.** `CourseBuilderPage` header gets **"✨ Build with AI"**.
- **Gap banner.** The banner (L355-400) becomes three actions: *Add it myself* · *Use my notes* (old Build it for me) · **Generate it** (a one-week run limited to the gap criteria, opened inline in a sheet, not the full Studio).
- **Review badges.** Items with `review_state = PENDING_REVIEW` show an "AI draft · review" badge in `WeekList`, and the week shows "3 drafts to review".
- **Learner exposure.** Learners never receive unapproved items: they are already filtered by `is_published` in `isItemVisibleToStudents`. Add a test for this.

---

## 10. Workstream F: any file as a resource, and universal preview

### 10.1 Supported types (allowlist: extension **and** magic-byte sniffing with the `file-type` package)

| Category | Extensions | Preview strategy | Text for AI |
|---|---|---|---|
| PDF | pdf | Native (react-pdf) | `pdf-parse` |
| Word | docx, doc, odt, rtf | **Server PDF** → pdf viewer. Client fallback for docx: `docx-preview` | docx: `mammoth.extractRawText`; others: from the PDF derivative |
| Slides | pptx, ppt, odp | **Server PDF** → slide mode (one page per screen, swipe). Client fallback: none at first; `PptxViewJS` after a spike | pptx: slide XML via `jszip`; others: from the PDF derivative |
| Spreadsheets | xlsx, xls, ods, csv | Client grid (SheetJS CE from `cdn.sheetjs.com`, read-only, first 500 rows per sheet, sheet tabs). Server PDF as a print view. | Sheet → CSV text (first N rows) |
| Images | png, jpg, jpeg, webp, gif, svg | `<img>` with zoom/pan. **SVG only through `<img>`**, never inline. | none (OCR out of scope) |
| Audio | mp3, m4a, ogg, wav | `<audio preload="none">` with Range | none |
| Video (D4) | mp4, webm, mov, mkv, avi, … | **Not uploadable.** Refused with "Videos aren't uploaded. Put the video on YouTube (it can be unlisted) and add it as a Video link." The message has a button that opens the Video link item. | — |
| Text and code | txt, md, json, html, css, js, ts, py, java, c, cpp, sql, xml | Text: highlighted code (`highlight.js` core + a few languages). Markdown: `react-markdown` + `rehype-sanitize`. **HTML is shown as source, never rendered.** | Direct |
| Archives | zip | List the entries only (`jszip`, names and sizes), with download | none |
| Blocked | exe, bat, sh, msi, apk, docm, xlsm, pptm, any unknown binary | Refused at upload with a clear message | — |

**Size limits** (env-configurable):
- documents 50 MB
- slides 100 MB
- audio 50 MB
- video: not accepted (D4)
- 20 files per upload request

### 10.2 Data model

`FileAsset` holds new uploads. `FileDerivative` is a derivative cache keyed by **content hash**, so it can also serve `SubjectDocument`, `Document` and PDF lesson notes without migrating them (see §12).

```
FileAsset(asset_id, owner_user_id, scope ENUM('COURSE','RUN_REFERENCE','SUBJECT'), course_id NULL,
          subject_id NULL, original_name, storage_path, mime_type, extension, kind, size_bytes,
          sha256 CHAR(64), preview_status ENUM('PENDING','PROCESSING','READY','FAILED','UNSUPPORTED','NOT_NEEDED'),
          preview_error, page_count, duration_seconds, width, height, text_chars, created_at, deleted_at)
FileDerivative(sha256, variant ENUM('PDF','THUMB','TEXT'),
               storage_path, size_bytes, meta JSON, created_at, PRIMARY KEY(sha256, variant))
```

- **New item type `FILE`.** `CourseItem.ref_id → FileAsset.asset_id`.
- **Default completion rule.** `VIEW` for documents. For audio, `VIEW` triggers at ≥ 80 % listened (reuse `last_position`). YouTube/Vimeo `VIDEO` items keep their current rule.
- **Storage layout.** `elearning/assets/{asset_id}/original.{ext}` and `elearning/derivatives/{sha256}/{variant}.{ext}`.

### 10.3 The conversion pipeline (out of process, on the same EC2 host: D1)

`backend/src/services/files/preview/`:
- `converter.ts` defines the interface `convertToPdf(inputPath, ext): Promise<outputPath>`. The implementation is chosen by env:
  - **`SofficeConverter` (production default, D1).** Uses `SOFFICE_PATH` (default `/usr/bin/soffice`).
    - Spawns `soffice --headless --norestore --convert-to pdf --outdir <tmp> <input>` with a unique `-env:UserInstallation=file:///tmp/lo-<jobid>` per job (soffice allows only one instance per profile).
    - **Concurrency 1** (`PREVIEW_CONCURRENCY`, default 1). Conversions queue behind each other; they never run in parallel on the shared host.
    - **Time limit:** `PREVIEW_TIMEOUT_MS`, default 120 s. On timeout, kill the whole process group (`detached: true` + `process.kill(-pid)`), because soffice forks child processes.
    - **Memory watchdog:** poll the process tree's resident memory every second (`pidusage`); kill above `PREVIEW_MAX_RSS_MB` (default 800). The job is marked `FAILED` with "This file is too complex to preview. Students can still download it."
    - **Niceness:** run under `nice -n 10`, so the apps' API requests win CPU contention.
    - **Input limit:** office files above 50 MB are not converted (the client fallback or download is used).
    - **Cleanup:** temp input, output and profile directories are removed in `finally`. A sweep on boot removes leftover `/tmp/lo-*` directories.
  - `GotenbergConverter`, used only if `GOTENBERG_URL` is set. It is kept small so the school can move conversion to a separate instance later without code changes. It is not deployed now.
  - `NoConverter`, if neither is available. It marks the preview `UNSUPPORTED`, so the client fallback is used.
- `thumbnails.ts`: `pdftoppm -png -f 1 -l 1 -scale-to 480` (poppler), then `sharp` → WebP. For images, `sharp` resize.
- `pipeline.ts`: a job runner on the same worker loop as §8.5, using the generic `BackgroundJob` table (§12) so the AI and file jobs share durability. Steps:
  1. Check `FileDerivative` by sha256. If it exists, link it and mark READY (no conversion).
  2. Otherwise stream from the file-server to a temp file, convert, generate the thumbnail and text, upload the derivatives and mark READY.
- **Host setup** (once, by the deploy runbook): `sudo apt-get install --no-install-recommends libreoffice-writer libreoffice-impress libreoffice-calc poppler-utils fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu ttf-mscorefonts-installer`. Without these fonts, PPTX/DOCX layouts drift. Add the install to the deployment notes, because DEPLOYMENT_GUIDE.md is stale.
- **Why not Gotenberg on the host:** an always-on container holds memory even when idle, about 1 GB under load. That is too much on a host shared by four apps. `soffice` per job uses memory only while it converts, and conversions are rare (once per uploaded file, never per view).

### 10.4 Streaming and Range (G9, G10)

- **file-server.** Replace the manual pipe in `GET /files` with `res.sendFile(fullPath, { acceptRanges: true, … })`. That gives `Range`, `206` and `Last-Modified`/`ETag` with no custom code.
- **Backend.** Add `fileServer.streamTo(res, remotePath, { range, filename, disposition })` in `utils/fileServer.ts`. It forwards the `Range` header and pipes status 200/206 and headers back. **Never buffer.**
- **Migrate all `downloadToBuffer` call sites that serve users** (`learnerCourseController.ts:411`, `curriculumController.ts:1061`, `documentController.ts:2081/3113`, `lessonNoteController.ts:714/795/1057`) to `streamTo`. Keep `downloadToBuffer` only for small, server-side reads (school logo, text extraction under 25 MB).
- **Headers on preview responses:** `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: sandbox` on anything that is not a PDF, image or media type. `Cache-Control: private, max-age=3600` for derivatives, which are immutable by sha256.

### 10.5 Text extraction (feeds the context pack)

Extend `utils/docExtract.ts` into `services/files/extractText.ts`:

```ts
extractText(input: Buffer | string /* temp path */, kind: FileKind, ext: string):
  Promise<{ text: string; pages?: number; method: "pdf-parse" | "mammoth" | "pptx-xml"
            | "sheet-csv" | "plain" | "from-pdf-derivative" | "none" }>
```

- **pptx.** `jszip` → `ppt/slides/slide*.xml` in slide order, take `<a:t>` runs. Include speaker notes (`ppt/notesSlides`); teachers often put the real explanation there.
- **doc, ppt, odt, odp, rtf.** Extract from the PDF derivative (one code path).
- **Scanned PDFs.** Fewer than 50 readable characters is treated as "scanned". Mark `text_chars = 0` and show "This file has no readable text, so the AI can't use it" in the Studio sources step. OCR is a later option.
- **Storage.** The text is stored as the `TEXT` derivative (a file on the file-server, not a DB column), capped at 200k characters.

### 10.6 The reusable frontend utility: `<FilePreview>`

**Folder:** `frontend/src/lib/files/` (pure logic) and `frontend/src/components/files/` (UI).

```ts
// lib/files/fileKinds.ts  (pure; mirrored by backend services/files/fileKinds.ts; shared fixtures test both)
type FileKind = "pdf" | "word" | "slides" | "sheet" | "image" | "audio" | "text" | "code"
              | "markdown" | "csv" | "archive" | "other";
detectFileKind({ mime, name }): FileKind
fileKindMeta(kind): { label; icon; accent; canPreviewClientSide: boolean }
formatBytes(n), extensionOf(name)

// lib/files/previewPlan.ts  (pure)
planPreview(input: { kind; ext; size; derivatives: { pdf?: boolean; thumb?: boolean };
                     network: "slow" | "ok"; saveData: boolean }):
  { strategy: "pdf-derivative" | "pdf-native" | "docx-client" | "sheet-client" | "image"
              | "media" | "text" | "zip-list" | "download-only";
    needsConfirm: boolean;            // slow network + large file → "Load preview (12 MB)?"
    fallback?: Strategy }
```

```tsx
// components/files/FilePreview.tsx
<FilePreview
  source={{ kind, name, size, urls: { original, pdf?, thumb?, text? } }}
  mode="inline" | "fullscreen" | "slides"
  onProgress?={(pct) => …}            // completion tracking (pages seen / media watched)
  onError?={…}
/>
```

- **Renderers.** Each renderer is `React.lazy` and lives in `components/files/renderers/`: `PdfRenderer` (wraps `PdfPagesViewer`, adds "slides" mode), `DocxRenderer` (`docx-preview` → output passed through `DOMPurify`, links forced to `rel="noopener noreferrer" target="_blank"`, `javascript:` stripped), `SheetRenderer`, `ImageRenderer`, `MediaRenderer`, `TextRenderer`, `MarkdownRenderer`, `ZipRenderer`, `DownloadCard`.
- **Companions:** `<FileThumb>` (thumbnail, or kind icon + extension badge) and `<FileChip>` (icon, name, size, preview status).
- **Pending previews.** While the server preview is `PENDING`, show the thumbnail placeholder with "Preparing preview…" and poll `GET …/preview-status` every 3 s for up to 2 minutes, then fall back.

**Adopt the utility everywhere a file is shown:**
- learner `DocumentView` (replaces the "opens outside the browser" text)
- builder item drawer
- Subject Materials tab
- Documents module viewer
- Studio sources step
- Lesson note PDF reader (keeps its own features; uses `FilePreview` only for non-PDF)

### 10.7 Backend endpoints for files

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /elearning/sections/:id/files` (multipart `files[]`, optional `title`, `is_required`) | `MANAGE_COURSE_CONTENT` + `assertCanBuildCourse` | Upload → `FileAsset` + `FILE` item (draft) per file; queue preview jobs. Returns 201 with the items. |
| `POST /elearning/courses/:id/reference-files` | same | Upload run reference files (scope `RUN_REFERENCE`). Not placed on the course. |
| `GET /elearning/files/:assetId/preview-status` | builder or learner member | `{ preview_status, derivatives, page_count, … }` |
| `GET /elearning/my/items/:id/file?variant=original\|pdf\|thumb` | learner membership (re-derived, 404 for non-members) | Stream with Range |
| `GET /elearning/files/:assetId/raw?variant=…` | builder | Same for teachers |
| `GET /curriculum/documents/:id/preview?variant=pdf\|thumb` | `assertSubjectAccess` | Preview for subject materials through the sha256 derivative cache |
| `GET /documents/:id/preview?variant=…` | existing document permission check | Same for the Documents module |
| `DELETE /elearning/items/:id` | existing | For `FILE`: soft-delete the `FileAsset` (`deleted_at`). A nightly sweep removes storage 30 days later, unless the sha256 is still referenced. |

---

## 11. Workstream G: interactive and innovative features (tiered)

Tiers are chosen for **impact on CBT mastery × fit for low bandwidth × effort**. Tier 1 is in this plan's phases. Tier 2 is designed now and scheduled after. Tier 3 needs spikes or policy decisions first.

### Tier 1: in scope (Phases A3, B3, B4)

| Feature | What it is | Build notes |
|---|---|---|
| **AI interactive breaks inside lessons** | The lesson is interrupted every 2–3 sections by a small activity: tap-to-reveal, inline check, **fill in the blank**, **put the steps in order**, **match pairs**. | New TipTap nodes in `interactive/nodes.tsx` (`fillBlank`, `orderSteps`, `matchPairs`), hydrated by `hydrate.ts`. `CORE_LESSON` emits them as `sections[].interaction` JSON → nodes. Answers are logged as `LearningEvent` `ATTEMPTED`, no grade. |
| **Exit ticket + confidence** | 1–3 questions at the end of a week, plus "How sure are you? 😟 😐 🙂". | New item type `EXIT_TICKET`, table `ExitTicketResponse`. The teacher sees a **class pulse** heat map (questions × students, coloured by correct/confidence) in Insights before the next lesson. The "confident but wrong" quadrant is highlighted: these are misconceptions to address. |
| **Flashcards with spaced repetition** | Key terms from each week become cards. A daily "5-minute review" queue across all the student's courses. | New item type `FLASHCARDS`; `FlashcardReview` stores **FSRS** state per card per student (`ts-fsrs`, MIT, runs on the client, so the review queue works offline and syncs through `queue.ts`). "Review" tile on `MyLearningHome`. |
| **TVET practical task with evidence** | Task brief + safety notes + checklist mapped to criteria. The student uploads 1–3 photos of their work (no video, D4). The teacher ticks the checklist. | New item type `PRACTICAL_TASK`, `PracticalSubmission` (assets via `FileAsset` scope `SUBMISSION`, image compression on the client before upload). Teacher sign-off counts as **DEMONSTRATED** in `courseMastery` for the mapped criteria. This is the most CBT-specific feature in the plan. |
| **Offline "download this week"** | One button per week: caches lesson HTML, PDF derivatives, thumbnails, flashcards and checks. Shows the size first. | Extend `learner/offline.ts` (Cache API) with a week manifest endpoint `GET /my/sections/:id/offline-manifest` (URLs + sizes). Attempts queue in `queue.ts` and replay on reconnect. |
| **"Explain it differently"** | Learner button on any lesson section: simpler words / an example from a Rwandan workplace / step by step / in French. | Reuse the course tutor endpoint (`/my/courses/:id/ask`) with a fixed intent and the section HTML as context. Logs `ASKED_AI`. The answer is ephemeral, never stored as content. Because of free tiers (D2), it draws from the interactive reserve (§7.3) with a per-student cap (`ELEARNING_AI_STUDENT_DAILY_ASKS`, default 10, shared with the tutor). When quota is out, the button says "Try again later today". The same explanation for the same section and intent is cached for 7 days, so students asking the same thing cost one call. |

### Tier 2: designed, scheduled after this plan

- **Adaptive remediation (rule-based).** If a student fails a check or exit ticket on criterion X twice, unlock a short remediation card (simpler explanation + 2 practice questions, AI-pre-generated per criterion at run time as an optional artifact) before the next week. No machine learning.
- **AI tutor with citations over files.** The course tutor retrieves from `FileDerivative TEXT` chunks as well as notes, cites "Slide 7 of Week 4 slides", and uses a Socratic "hint, don't answer" mode when an assessment for that criterion is open.
- **Translation toggle (EN ⇄ FR, Kinyarwanda glossary).** Machine translation is cached per item and labelled "machine translated".
- **YouTube video with embedded questions.** Through the YouTube IFrame Player API (free, no key needed): the video pauses at teacher-set times and shows a question (uses `last_position` and the knowledge-check engine).
- **Teacher weekly digest.** "3 weeks are ready for review · 2 weeks unlock on Monday with no content", through the Reminder Hub.

### Tier 3: needs a spike or a policy decision

- **H5P import** (`@lumieducation/h5p-react` + server, or `h5p-standalone`) for teachers who author in Lumi.
- **Peer "Ask the class" boards** per week, through Tupo threads (the `DISCUSSION` item type already exists), with AI thread summaries for the teacher.
- **Audio narration** per approved lesson, about 24 kbps Opus (≈ 180 KB/min), cached offline. Blocked by D2: text-to-speech has no usable free tier. A self-hosted model is an option (Kinyarwanda: Meta MMS `kin` / Digital Umuganda), but MMS is CC-BY-NC and would need a **license review** and CPU on the shared host.
- **NotebookLM-style audio overview** (two-voice conversation) per week. Same blocker.
- **AI diagrams** (Mermaid in a sandboxed renderer) for process and flow content.
- **Responsible gamification.** Competency badges and streaks with rest days. No public leaderboards (see `tupo-taskmentor-overall-ranking` privacy rules in Task Mentor).

---

## 12. Data model (migrations)

All migrations use the house pattern: idempotent `CREATE TABLE IF NOT EXISTS`, `INSERT … WHERE NOT EXISTS` for permissions, and a matching Drizzle definition in `backend/src/db/schema.ts`. After adding them, run `npm run test:db:reset`. **Production:** pipe the SQL into the mysql client (`npm run migrate` fails on the box; see the deploy notes), or use `.github/workflows/migrate.yml`.

### `096_elearning_files.sql` (Track B, Phase B1)

```sql
CREATE TABLE IF NOT EXISTS FileAsset (
  asset_id        INT AUTO_INCREMENT PRIMARY KEY,
  owner_user_id   INT NOT NULL,
  scope           ENUM('COURSE','RUN_REFERENCE','SUBJECT','SUBMISSION') NOT NULL,
  course_id       INT NULL,
  subject_id      INT NULL,
  original_name   VARCHAR(255) NOT NULL,
  storage_path    VARCHAR(500) NOT NULL,
  mime_type       VARCHAR(150) NOT NULL,
  extension       VARCHAR(16)  NOT NULL,
  kind            VARCHAR(16)  NOT NULL,          -- FileKind
  size_bytes      BIGINT NOT NULL,
  sha256          CHAR(64) NOT NULL,
  preview_status  ENUM('PENDING','PROCESSING','READY','FAILED','UNSUPPORTED','NOT_NEEDED') NOT NULL DEFAULT 'PENDING',
  preview_error   VARCHAR(500) NULL,
  page_count      INT NULL, duration_seconds INT NULL, width INT NULL, height INT NULL,
  text_chars      INT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  KEY idx_fa_course (course_id), KEY idx_fa_sha (sha256), KEY idx_fa_owner (owner_user_id),
  CONSTRAINT fk_fa_course FOREIGN KEY (course_id) REFERENCES Course(course_id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS FileDerivative (
  sha256       CHAR(64) NOT NULL,
  variant      ENUM('PDF','THUMB','TEXT') NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  size_bytes   BIGINT NOT NULL,
  meta         JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (sha256, variant)
);
-- Lazily filled for legacy files (SubjectDocument, Document, PDF LessonNote) on first preview:
ALTER TABLE SubjectDocument ADD COLUMN sha256 CHAR(64) NULL;   -- guard with an information_schema check
ALTER TABLE Document        ADD COLUMN sha256 CHAR(64) NULL;
ALTER TABLE CourseItem MODIFY item_type ENUM('HEADER','LESSON_NOTE','SUBJECT_DOCUMENT','PAGE','VIDEO','LINK',
  'TASKMENTOR_QUIZ','TASKMENTOR_ASSIGNMENT','KNOWLEDGE_CHECK','DISCUSSION','FILE') NOT NULL;
```

Use the `BackgroundJob` table from 097 for preview jobs. If B1 lands before A1, create `BackgroundJob` in 096 instead and drop it from 097.

### `097_elearning_ai_generation.sql` (Track A, Phase A1)

```sql
CREATE TABLE IF NOT EXISTS BackgroundJob (                 -- generic durable queue (file previews etc.)
  job_id INT AUTO_INCREMENT PRIMARY KEY, kind VARCHAR(40) NOT NULL, payload JSON NOT NULL,
  status ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  attempts INT NOT NULL DEFAULT 0, not_before DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME NULL, heartbeat_at DATETIME NULL, last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME NULL,
  KEY idx_bj_ready (status, not_before)
);
CREATE TABLE IF NOT EXISTS CourseBlueprint (
  blueprint_id INT AUTO_INCREMENT PRIMARY KEY, owner_user_id INT NOT NULL,
  subject_id INT NULL, program_id INT NULL,                   -- NULL = personal preset
  visibility ENUM('PRIVATE','DEPARTMENT','SCHOOL') NOT NULL DEFAULT 'PRIVATE',
  name VARCHAR(120) NOT NULL, config JSON NOT NULL, is_builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NULL
);
CREATE TABLE IF NOT EXISTS CourseGenerationRun (
  run_id INT AUTO_INCREMENT PRIMARY KEY, course_id INT NOT NULL, created_by INT NOT NULL,
  parent_run_id INT NULL,                                     -- regenerate / retry child runs
  mode ENUM('PREVIEW','FULL','SINGLE_WEEK','REGENERATE_ITEM') NOT NULL,
  status ENUM('PLANNED','RUNNING','PAUSED','PAUSED_QUOTA','READY_FOR_REVIEW','COMPLETED','CANCELLED','FAILED') NOT NULL,
  blueprint JSON NOT NULL,                                    -- snapshot, not a FK (presets change)
  section_ids JSON NOT NULL,
  estimate JSON NULL, totals JSON NULL,                       -- {queued,running,succeeded,failed,skipped}
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at DATETIME NULL, finished_at DATETIME NULL,
  KEY idx_cgr_course (course_id, status),
  CONSTRAINT fk_cgr_course FOREIGN KEY (course_id) REFERENCES Course(course_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS CourseGenerationTask (
  task_id INT AUTO_INCREMENT PRIMARY KEY, run_id INT NOT NULL, section_id INT NOT NULL,
  kind VARCHAR(32) NOT NULL, depends_on JSON NULL,            -- [task_id]
  status ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','SKIPPED','CANCELLED','DISMISSED') NOT NULL DEFAULT 'QUEUED',
  skip_reason VARCHAR(40) NULL, attempts INT NOT NULL DEFAULT 0,
  not_before DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, claimed_at DATETIME NULL, heartbeat_at DATETIME NULL,
  input_hash CHAR(64) NULL, provider_used VARCHAR(20) NULL, model VARCHAR(80) NULL,
  output_ref JSON NULL,                                       -- {note_id?, item_ids[]}
  output_digest JSON NULL,                                    -- small summary for the board (title, counts)
  error VARCHAR(1000) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME NULL,
  KEY idx_cgt_ready (status, not_before), KEY idx_cgt_run (run_id, section_id),
  CONSTRAINT fk_cgt_run FOREIGN KEY (run_id) REFERENCES CourseGenerationRun(run_id) ON DELETE CASCADE,
  CONSTRAINT fk_cgt_section FOREIGN KEY (section_id) REFERENCES CourseSection(section_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS AIUsageLog (
  usage_id BIGINT AUTO_INCREMENT PRIMARY KEY, occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  feature VARCHAR(60) NOT NULL, role VARCHAR(16) NULL, provider VARCHAR(20) NOT NULL, model VARCHAR(80) NULL,
  ok TINYINT(1) NOT NULL, error_class VARCHAR(30) NULL, latency_ms INT NULL,
  input_tokens INT NULL, output_tokens INT NULL,
  actor_user_id INT NULL, course_id INT NULL, run_id INT NULL,
  KEY idx_aiu_day (occurred_at, provider), KEY idx_aiu_actor (actor_user_id, occurred_at)
);
-- CourseItem provenance + review (ALTERs guarded with information_schema checks, as in prior migrations)
ALTER TABLE CourseItem
  ADD COLUMN ai_origin ENUM('NONE','AI_GENERATED','AI_ASSISTED') NOT NULL DEFAULT 'NONE',
  ADD COLUMN review_state ENUM('NOT_REQUIRED','PENDING_REVIEW','ACCEPTED','EDITED','DISMISSED') NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN generation_task_id INT NULL,
  ADD COLUMN input_hash CHAR(64) NULL,
  ADD COLUMN source_refs JSON NULL,
  ADD COLUMN review_flags JSON NULL;
-- Permission seeds (legacy table, same pattern as 085) + see §14 for RBAC v2 manifest
INSERT INTO Permission (permission_name, …) SELECT 'GENERATE_COURSE_CONTENT', … WHERE NOT EXISTS (…);
INSERT INTO Permission (permission_name, …) SELECT 'VIEW_AI_USAGE', … WHERE NOT EXISTS (…);
-- Built-in blueprint presets (is_builtin = 1): Quick week, Full lesson, Practical TVET week, Revision week
```

### `098_elearning_interactive_types.sql` (Track B, Phase B3)

```sql
ALTER TABLE CourseItem MODIFY item_type ENUM(…,'FILE','FLASHCARDS','EXIT_TICKET','PRACTICAL_TASK') NOT NULL;
CREATE TABLE IF NOT EXISTS FlashcardReview (item_id INT, user_id INT, card_id VARCHAR(40),
  fsrs_state JSON NOT NULL, due_at DATETIME NOT NULL, last_review_at DATETIME NULL, reps INT NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, user_id, card_id), KEY idx_fr_due (user_id, due_at));
CREATE TABLE IF NOT EXISTS ExitTicketResponse (response_id INT AUTO_INCREMENT PRIMARY KEY, item_id INT NOT NULL,
  user_id INT NOT NULL, answers JSON NOT NULL, correct INT NOT NULL, total INT NOT NULL,
  confidence TINYINT NOT NULL, submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_etr (item_id, user_id));
CREATE TABLE IF NOT EXISTS PracticalSubmission (submission_id INT AUTO_INCREMENT PRIMARY KEY, item_id INT NOT NULL,
  user_id INT NOT NULL, asset_ids JSON NOT NULL, student_note VARCHAR(1000) NULL,
  status ENUM('SUBMITTED','RETURNED','SIGNED_OFF') NOT NULL DEFAULT 'SUBMITTED',
  checklist_result JSON NULL, reviewed_by INT NULL, reviewed_at DATETIME NULL,
  submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_ps_item (item_id, status));
ALTER TABLE LearningEvent MODIFY verb ENUM(…existing…, 'REVIEWED_CARD','SUBMITTED_EVIDENCE');
```

**Adding item types: the checklist** (from the e-learning survey). For every new type, update all of these:
- the MySQL ENUM
- `COURSE_ITEM_TYPES` (`schema.ts:1778`)
- the frontend `CourseItemType` (`api/elearning.ts`)
- `buildItemBody` (`courseController.ts:126`)
- `openMyItem` (`learnerCourseController.ts` ~L293)
- `ItemView` dispatch
- `AddItemPalette` `NEW_TYPES`
- `copy.builder.itemTypes`
- `actionCompletes` (`courseProgress.ts:30`)
- `courseMastery`, if the type demonstrates criteria

### `099_elearning_generation_hardening.sql` (reserve)

Reserved for indexes or columns found during A3 (for example `CourseSection.last_generated_at`). Skip it if not needed.

---

## 13. API contracts (Track A)

All endpoints are under `/elearning`, require `authenticate`, and are gated as shown in §14. Responses use the existing `successResponse` envelope.

| Method and path | Purpose |
|---|---|
| `GET /scheme-of-work/schemes/:id/week-bundles` | §5.1 read model |
| `GET /elearning/sections/:id/context-pack?sources=…&asset_ids=…` | Pack metadata (no bodies) + token use |
| `GET /elearning/blueprints?subject_id=` | Built-in + mine + shared with my department or school |
| `POST /elearning/blueprints` · `PATCH /elearning/blueprints/:id` · `DELETE …` | Presets (owner only; `DEPARTMENT` visibility needs a programme-lead scope) |
| `POST /elearning/courses/:id/generation/estimate` `{blueprint, section_ids}` | Planner dry run: tasks, skips with reasons, calls, tokens, minutes, free quota left today per provider, `fits_today`, expected finish time |
| `POST /elearning/courses/:id/generation/runs` `{blueprint, section_ids, mode, preview_section_id?}` | **202** `{run_id}`; plans and enqueues |
| `GET /elearning/generation/runs/:id` | Run + tasks grouped by week + coverage before/after |
| `GET /elearning/generation/runs/:id/stream` | SSE events `task`, `run`, `heartbeat` |
| `POST /elearning/generation/runs/:id/{pause,resume,cancel,retry-failed}` | Controls |
| `POST /elearning/generation/runs/:id/weeks/:sectionId/approve` `{item_ids?, publish_section?}` | §8.6 |
| `POST /elearning/generation/items/:id/{dismiss,regenerate}` `{instruction?}` | §8.6 |
| `GET /elearning/courses/:id/generation/runs?limit=` | History (Studio "previous runs") |
| `GET /admin/ai-usage?from&to&group=provider\|feature\|teacher` | §15 (`VIEW_AI_USAGE`) |

**Run read shape (abridged):**

```json
{
  "run": { "run_id": 12, "status": "RUNNING", "mode": "FULL",
           "totals": { "queued": 9, "running": 3, "succeeded": 20, "failed": 1, "skipped": 4 },
           "estimate": { "calls": 34, "minutes": 6, "fits_today": false, "expected_finish": "2026-10-02T08:30:00+02:00" } },
  "weeks": [
    { "section_id": 88, "week_number": "Week 4", "topic": "Structuring HTML with Lists and Links",
      "coverage_before": { "targets": 1, "covered": 0 }, "coverage_after": { "targets": 1, "covered": 1 },
      "tasks": [
        { "task_id": 301, "kind": "CORE_LESSON", "status": "SUCCEEDED", "provider_used": "gemini",
          "output_digest": { "title": "…", "words": 1420, "sections": 5 }, "review_flags": [] },
        { "task_id": 302, "kind": "ASSESSMENT_PACK", "status": "SUCCEEDED", "provider_used": "groq",
          "verified_by": "glm", "output_digest": { "questions": 8 }, "review_flags": [ { "target_id": "q3", "kind": "AMBIGUOUS" } ] }
      ],
      "pending_review": 2 }
  ]
}
```

---

## 14. Access control (RBAC v2)

Extend the access model through the manifest and presets; never hardcode role names (see `ACCESS_LEVELS_RBAC_IMPLEMENTATION_PLAN.md`).

| Capability | Granted by preset | Notes |
|---|---|---|
| `GENERATE_COURSE_CONTENT` | TEACHING (and anyone with `MANAGE_COURSE_CONTENT` today, by backfill) | Required for Studio, runs, blueprints and the "Generate it" action. Plus `assertCanBuildCourse` on the course. |
| `MANAGE_COURSE_CONTENT` | unchanged | File uploads to sections need only this. |
| `VIEW_AI_USAGE` | Super admin; programme lead (scoped to their programmes) | Usage console (§15). |
| Department blueprints | Programme-lead scope over `program_id` | Through existing scope resolution (`userScope.ts`). |

- **Manifest.** Add to `backend/src/access/manifest.ts` (category CURRICULUM) and `access/presets.ts`.
- **Legacy names.** Keep them without `:`, so they survive the legacy permission filter that spoke apps keyword-match.
- **Frontend.** Add the constants to `frontend/src/constants/permissions.ts`.
- **Learners.** Learner-side endpoints are unchanged: membership is derived, and non-members get 404.

---

## 15. Admin and quality visibility

**`/admin/elearning` gains an "AI" tab** (`VIEW_AI_USAGE`). It shows:
- calls and tokens by provider and day (bar chart);
- failure rate by provider;
- the busiest teachers or subjects;
- **acceptance funnel** per artifact kind: generated → accepted unchanged / edited / dismissed;
- the top `review_flags` kinds;
- free quota remaining today per provider, the interactive reserve, and paused runs waiting for quota.

**Per course (Insights tab):** "AI drafts awaiting review", plus provenance on items ("AI-assisted · reviewed by <teacher> on <date>").

**Student-facing provenance:** approved AI items show a subtle "AI-assisted, reviewed by your teacher" line (UNESCO and D2L practice).

---

## 16. Security, privacy and safety

- **Uploads.**
  - Allowlist plus magic-byte check (`file-type`). Reject macro-enabled Office files.
  - Random storage names; the original name is metadata only.
  - Per-type size caps; per-teacher storage quota (`ELEARNING_STORAGE_QUOTA_MB`, default 5,000) shown in the UI.
  - ClamAV scan (`clamdscan`) as an **optional** pipeline step, off by default. Turn it on only if the shared host has room for it (clamd uses about 1 GB of RAM).
- **Rendering.**
  - Never render uploaded HTML or SVG inline.
  - `docx-preview` output goes through DOMPurify.
  - Markdown goes through `rehype-sanitize`.
  - Non-media responses are sent with `CSP: sandbox` and `nosniff`.
  - PDFs render through pdf.js, never through the browser's built-in plug-in, for consistency.
- **Conversion isolation.** Each `soffice` job runs in its own profile directory, with a timeout and a memory watchdog (§10.3). (If Gotenberg is ever used, it runs in its own container with a memory cap.) Temp files are removed in `finally`. Zip-bomb guard: refuse office files whose uncompressed size exceeds 20× the compressed size or 500 MB (inspect with `jszip` before conversion).
- **Access checks.**
  - Every file route re-derives access: learner membership, builder rights, subject access or document permission.
  - Derivatives are shared by sha256 but are only ever served through an endpoint that checks access to an object owning that sha256.
- **AI data.**
  - Providers receive extracted teaching text and teacher instructions only.
  - No student data is sent to providers, except the existing tutor, which sends the question text only.
  - Prompt injection: source text is fenced, the model is told to treat it as data, and `source_refs` are validated mechanically.
- **Content safety.**
  - Verifier issue `OFF_CRITERIA` or `UNSUPPORTED_BY_SOURCE` is shown to the teacher.
  - A "Report a problem" button on learner items creates a `LearningEvent` with verb `COMMENTED` and `context_json.kind = "REPORT"`, and notifies the teacher.
- **Audit.** `recordActivity` on run start, approve, dismiss and file upload. Plus `AIUsageLog` and the `LessonNoteVersion` provenance.

---

## 17. Performance and free-quota use

- **Planner.** Builds packs with hash only, using batched queries per table (no per-week round trips). Target under 500 ms for 15 weeks.
- **Context-pack bodies** are built only inside the worker task.
- **Worker concurrency.** 3 tasks by default, but per-provider limits on free tiers (concurrency 1, RPM and TPM) are the real limit (§7.3). The single Node process stays responsive because AI calls are I/O-bound. Pack building handles ≤ 200 KB of text per week.
- **AI calls per week:**

  | Call | Full lesson recipe | Quick week |
  |---|---|---|
  | `CORE_LESSON` (lesson + interactive breaks + key terms) | 1 | 1 |
  | `ASSESSMENT_PACK` (knowledge check + exit ticket + flashcards + video "watch for" questions) | 1 | 1 |
  | verify (skipped when quota is low, §7.5) | 1 | 0 |
  | repair (in about 10 % of weeks) | 0–1 | 0–1 |
  | **Total** | **≈ 3** | **≈ 2** |

  A 15-week term is **about 45 calls** (full) or **about 30** (quick). Weeks covered by existing notes skip `CORE_LESSON`, so real runs are smaller. The estimate endpoint shows the exact number.
- **What free tiers mean in practice.** Gemini's ~20/day is not enough for one full term on its own; that is why GLM leads the `draft` role and Groq the `assess` role. Phase 0 records each key's real limits. If the combined free capacity is about 150–300 bulk calls a day, roughly 3–6 full terms can be drafted per day across the school. A large start-of-term rush therefore spreads over a few nights, which the queue, `PAUSED_QUOTA` and "Tonight" scheduling handle without anyone watching.
- **Ways to stretch quota, in priority order:**
  1. reuse existing notes and lesson plans (no call);
  2. idempotent hashes (no repeated call);
  3. "Quick week" as the preset for revision weeks;
  4. skip AI verification under 20 % quota;
  5. night-time runs.
- **Conversion load.** One `soffice` job at a time, niced, ≤ 120 s each, and only once per unique file (sha256 cache). It never runs when a student opens a file.
- **Learner side.** Preview renderers are lazy-loaded; the course page bundle must not grow by more than 5 KB gzipped. Derivatives get `Cache-Control: private, max-age=3600` and an ETag. Thumbnails are WebP, ≤ 30 KB.
- **Memory.** No buffered downloads (G9). Text extraction runs in the worker with a 25 MB input cap; larger files take their text from the PDF derivative page by page.

---

## 18. Phased delivery

There are two tracks that can run in parallel with two developers. If there is one developer, do Phase 0 → A1 → A2 → B1 → A3 → B2 → B3 → B4.

### Phase 0: setup and spikes (2–3 days, both tracks)

The decisions are made (see the decision record). Phase 0 only prepares the host and measures.

- [ ] **Host capacity (D1).** On the EC2 host, record `free -m`, `nproc` and pm2 memory of every app at a normal school-day peak. Set `PREVIEW_MAX_RSS_MB` and `PREVIEW_TIMEOUT_MS` from what is free.
- [ ] **Install the converter (D1).** Install the LibreOffice packages, poppler and fonts (§10.3) on the host. Convert 10 real teacher files (PPTX with images, DOCX with tables, XLSX, one ODP) one at a time, and record time and peak memory. If any file needs more than the limit, note it as "download only".
- [ ] **Free-tier limits (D2).** List which provider keys are live in MIS production (Gemini, Groq, GLM). For each, record the real free limits (requests/day, requests/minute, tokens/minute) and reset time, and set the `AI_*` env values in §7.3. Confirm OpenAI is out of `AI_PROVIDER_ORDER`.
- [ ] **Spike, prompt quality on free models.** Run `CORE_LESSON` and `ASSESSMENT_PACK` on 3 real weeks (the Web UI subject in the screenshots) with GLM-4.5-Flash, Gemini Flash and Groq gpt-oss. Record quality, JSON validity and latency. Confirm the role orders in §7.2.
- [ ] **Spike, PPTX client fallback.** Evaluate `PptxViewJS`, `pptx-preview` and `pptx-glimpse` on the same files. Adopt one only if the fidelity is acceptable and the license is MIT or Apache.
- [ ] Confirm the production MySQL version. The claim query works on 5.7 either way.

### Track A: AI generation

**A1. Foundations: connections + AI layer + engine core (~2 weeks)**
- [ ] §5.2 fixes, **G4 security fix first, as its own PR**.
- [ ] `weekBundle.ts` + endpoint + `WeekStrip` on Lesson Notes and Scheme of Work.
- [ ] `contextPack.ts` (moves `weekContext` and `curriculumBlock` out of the controller; the controller imports them).
- [ ] `aiProviders` v2: usage return values, `role`/`excludeProviders`/`feature`, `limiter.ts` (daily/RPM/TPM quotas, interactive reserve, fair share, pause and resume), dead-provider parking, `AIUsageLog` writes.
- [ ] Migration 097; Drizzle definitions; permissions + manifest + presets + backfill.
- [ ] Engine core: `planner.ts`, `worker.ts` (claim, heartbeat, recovery, backoff), the run and task API, and SSE.
- [ ] **Acceptance:**
  - A run with a fake provider survives a backend restart in the middle of a run and finishes.
  - A second run on unchanged inputs makes 0 AI calls.
  - G4 is covered by a test where another teacher gets 404 or 403.

**A2. Artifacts + review (~2 weeks)**
- [ ] Extract `generateNote.ts` from `lessonNoteAIController.ts` (the old endpoint keeps working, with a test).
- [ ] Artifacts `REUSE_PLACEMENT`, `CORE_LESSON` (with length options), `ASSESSMENT_PACK` (knowledge check first; assess + verify + repair), `VIDEO_SLOT`, `PRACTICAL_TASK` (as a page).
- [ ] Persist with provenance columns. Hook `EDITED` into `PATCH /items/:id` and `updateLessonNote`.
- [ ] Approve, dismiss and regenerate endpoints. Upgrade the builder banner ("Generate it"). Review badges in `WeekList`.
- [ ] **Acceptance:**
  - On the Web UI course, Week 4 (gap 1.1) generates a lesson + check covering 1.1.
  - The coverage endpoint moves from 0 to 1 after approval.
  - Students see nothing before approval.
  - A teacher-edited item is never overwritten by a rerun.

**A3. Lesson Studio UI + interactive blocks (~2–2.5 weeks)**
- [ ] Studio route + steps 1–6 (§9), presets and blueprint CRUD, the try-one-week flow, live board (SSE + poll fallback), review split view with citations and keyboard shortcuts.
- [ ] Interactive breaks in the `CORE_LESSON` schema + new TipTap nodes (`fillBlank`, `orderSteps`, `matchPairs`) in editor and learner.
- [ ] Entry points: builder header, Lesson Notes card, Scheme of Work toolbar. "Run ready for review" notification.
- [ ] axe audit (2 themes × 3 viewports), screenshot pass at 390 px.
- [ ] **Acceptance:** a teacher goes from an empty 15-week course to 15 drafted weeks without leaving the Studio, and approves 3 weeks in under 10 minutes in a moderated test.

### Track B: files, preview and interactive learning

**B1. File resources + streaming (~1.5 weeks)**
- [ ] Migration 096; `FileAsset`/`FileDerivative`; `FILE` item type end to end (checklist in §12).
- [ ] Upload endpoint with allowlist, sniffing and quotas. The builder drop zone on a week ("Drop files here") and the palette entry "Upload file".
- [ ] file-server `res.sendFile` Range; `fileServer.streamTo`; migrate all user-facing `downloadToBuffer` sites (G9/G10).
- [ ] Replace `xlsx@0.18.5` with SheetJS CE from the SheetJS CDN in both packages (G11). Run the existing import tests that use `xlsx`.
- [ ] **Acceptance:** a 200 MB slide deck and a 40 MB audio file stream with backend RSS flat; audio seeks instantly on a phone. A `.exe` renamed to `.pdf` is refused. An `.mp4` is refused with the YouTube message.

**B2. Conversion pipeline + `<FilePreview>` (~1.5 weeks)**
- [ ] `BackgroundJob` runner (shared with the A1 worker loop), converter implementations, thumbnails, text extraction (`extractText.ts`) + `TEXT` derivative.
- [ ] `lib/files/{fileKinds,previewPlan}.ts` + `components/files/*` renderers (lazy).
- [ ] Adopt the utility in learner `DocumentView`, the builder drawer, the Subject Materials tab, the Documents viewer and the Studio sources step. Legacy files get a sha256 on first preview.
- [ ] Context pack reads `TEXT` derivatives (connects Track B to Track A).
- [ ] **Acceptance:**
  - The 10 Phase 0 sample files all preview in the browser on desktop and on a 390 px phone.
  - The PPTX speaker notes appear in the context pack.
  - With the converter disabled, DOCX still previews on the client.

**B3. Interactive item types (~2 weeks)**
- [ ] Migration 098. `EXIT_TICKET` (+ class pulse heat map), `FLASHCARDS` (+ ts-fsrs daily review on `MyLearningHome`), `PRACTICAL_TASK` with evidence upload and teacher sign-off feeding `courseMastery`.
- [ ] Engine artifacts `EXIT_TICKET` and `FLASHCARDS`. Presets updated.
- [ ] **Acceptance:** confidence × correctness is visible to the teacher. A flashcard review done offline syncs later. Practical sign-off makes the criterion DEMONSTRATED.

**B4. Offline week + "Explain it differently" (~1 week)**
- [ ] Offline manifest endpoint, the "Download this week" UI with its size, the cache, and the attempts outbox.
- [ ] "Explain it differently" on lesson sections.

### Effort summary

| Phase | Effort |
|---|---|
| Phase 0 | 2–3 d |
| A1 | 10–11 d (includes the free-quota limiter) |
| A2 | 9–10 d |
| A3 | 10–12 d |
| B1 | 6–7 d (no video) |
| B2 | 7–8 d |
| B3 | 9–10 d |
| B4 | 4–5 d |
| **Total** | **about 57–66 developer-days (≈ 11–13 weeks for one developer, ≈ 6–7 weeks for two in parallel)** |

---

## 19. Testing strategy

**Backend (vitest; `backend/src/__tests__/`)**
- **Fake provider.** `elearningGeneration.fakeProvider.ts` registers a deterministic provider through the registry (no network).
- **Planner:** skip reasons (covered by existing note, no curriculum, unchanged hash), estimate math.
- **Worker:**
  - claim atomicity (two claimers, one wins);
  - restart recovery (a RUNNING task with a stale heartbeat goes back to QUEUED);
  - backoff;
  - dependency skip;
  - quota pause and automatic resume (fake provider reports quota errors, then recovers).
- **Artifacts:** validation (bad answer key → repair is called), citation validation, `persist` writes provenance and never touches `HIDDEN` sections or `Course.status`.
- **Review:** approve publishes item + note; dismiss deletes only untouched AI notes; regenerate never overwrites `EDITED`.
- **Learner visibility:** `PENDING_REVIEW` items are invisible to members; non-members get 404.
- **Limiter:** a provider over its daily quota is skipped without being called; bulk runs cannot use the interactive reserve; two teachers' runs alternate; the verifier excludes the drafter and is skipped (with `NOT_CROSS_CHECKED`) under 20 % quota.
- **AI layer:** extend Task Mentor's `fallback.test.ts` pattern to MIS (quota → next, dead key → parked 1 h, bad JSON → next, timeout → next).
- **Files:**
  - kind detection fixtures (shared JSON with the frontend);
  - sniffing rejects a disguised `.exe`;
  - Range returns 206 with the correct bytes;
  - derivative cache hit by sha256;
  - `extractText` for pptx (with speaker notes), docx, xlsx, csv;
  - access matrix for every file route.
- **G4 regression:** another teacher cannot read lesson plans through `/lesson-plans/entry/:id`.
- **Reminders:**
  - Run `npm run test:db:reset` after each migration.
  - Use `TZ=UTC` for date-sensitive tests, and remember that DATE columns come back as JS `Date` (`services/elearning/dates.ts`).
  - Tests that change preset roles must restore them.

**Frontend (vitest + Testing Library)**
- `studioModel.test.ts` (presets ↔ blueprint, week selectors, estimate formatting).
- `previewPlan.test.ts` (every kind × network × derivative availability).
- `fileKinds.test.ts` (shared fixtures).
- `LessonStudio.test.tsx` (step flow with a mocked API, SSE fallback to polling, review keyboard shortcuts).
- `FilePreview.test.tsx` (lazy renderer selection, pending → ready transition, download fallback).

**End to end and UX**
- The `backend/scripts/access-ux/ui-flows.cjs` pattern gets a Studio flow: select gaps → try one week → run → approve.
- axe WCAG AA on the Studio and the preview pages, in 2 themes × 3 viewports.
- Manual pass on a low-end Android device with a throttled 3G profile for previews and offline week.

---

## 20. Implementation file map

**Backend (`nga_central_mis/backend/src`)**

| File | Status |
|---|---|
| `services/curriculumChain/weekBundle.ts` | NEW |
| `services/elearning/generation/{contextPack,planner,worker,events,verify,review,blueprints}.ts` | NEW |
| `services/elearning/generation/artifacts/{reusePlacement,coreLesson,knowledgeCheck,practicalTask,interactiveBlocks,flashcards,exitTicket}.ts` | NEW |
| `services/elearning/generation/prompts/*.ts` (versioned prompt builders) | NEW |
| `services/lessonNotes/generateNote.ts` | NEW (extracted from `controllers/lessonNoteAIController.ts`) |
| `services/aiProviders/{types,generate,registry}.ts` + each provider | CHANGED (usage, roles, exclusions) |
| `services/aiProviders/{limiter,usageLog}.ts` | NEW |
| `services/files/{fileKinds,extractText,upload,stream}.ts` | NEW |
| `services/files/preview/{converter,soffice,gotenberg,thumbnails,pipeline}.ts` | NEW (`gotenberg.ts` optional, small) |
| `services/jobs/backgroundJobs.ts` | NEW (shared claim/heartbeat loop) |
| `controllers/{generationController,blueprintController,courseFileController,aiUsageController}.ts` | NEW |
| `controllers/courseInteractiveController.ts` | CHANGED (imports from `contextPack`/artifacts) |
| `controllers/courseController.ts` | CHANGED (`FILE` etc. in `buildItemBody`; `EDITED` hook) |
| `controllers/learnerCourseController.ts` | CHANGED (new types in `openMyItem`; streaming) |
| `controllers/lessonPlanController.ts` | CHANGED (G4) |
| `controllers/lessonNoteController.ts` | CHANGED (week coverage in subjects; `EDITED` hook; streaming) |
| `controllers/{curriculumController,documentController}.ts` | CHANGED (preview endpoints; streaming) |
| `routes/elearning.ts`, `routes/schemeOfWork.ts`, `routes/curriculum.ts`, `routes/documents.ts` | CHANGED |
| `utils/fileServer.ts` | CHANGED (`streamTo`) |
| `utils/docExtract.ts` | CHANGED (delegates to `extractText`) |
| `access/manifest.ts`, `access/presets.ts`, `utils/permissions.ts` | CHANGED |
| `db/schema.ts` | CHANGED |
| `index.ts` | CHANGED (start the job loop) |
| `backend/migrations/096_elearning_files.sql`, `097_elearning_ai_generation.sql`, `098_elearning_interactive_types.sql` | NEW |

**file-server:** `src/routes/files.ts` (CHANGED: `sendFile` with Range).

**Frontend (`nga_central_mis/frontend/src`)**

| File | Status |
|---|---|
| `components/elearning/studio/{LessonStudioPage,WeekRail,SourcesStep,RecipeBuilder,PresetMenu,TryOneWeek,GenerationBoard,ReviewWorkspace,CitationDrawer,EstimateBar}.tsx` | NEW |
| `components/elearning/studio/studioModel.ts` | NEW |
| `api/generation.ts` (runs, blueprints, SSE helper) | NEW |
| `components/curriculumChain/WeekStrip.tsx` | NEW |
| `lib/files/{fileKinds,previewPlan}.ts` | NEW |
| `components/files/{FilePreview,FileThumb,FileChip,FileDropZone}.tsx` + `renderers/*` | NEW |
| `components/elearning/interactive/nodes.tsx`, `hydrate.ts` | CHANGED (new nodes) |
| `components/elearning/builder/{CourseBuilderPage,WeekList,AddItemPalette,ItemSettingsDrawer}.tsx` | CHANGED |
| `components/elearning/learner/{ItemView,MyLearningHome,offline,queue}.tsx/ts` | CHANGED |
| `components/elearning/learner/{ExitTicketCard,FlashcardDeck,PracticalTaskView}.tsx` | NEW |
| `components/elearning/builder/{ClassPulse,PracticalReview}.tsx` | NEW |
| `components/lessonNotes/LessonNotesListPage.tsx` | CHANGED (week coverage, "Fill all weeks with AI") |
| `components/schemeOfWork/*` calendar toolbar | CHANGED (Studio entry, `WeekStrip`) |
| `components/curriculum/SubjectMaterialsTab.tsx`, documents viewer | CHANGED (`FilePreview`) |
| `constants/permissions.ts`, `App.tsx` (route `/elearning/courses/:courseId/studio`) | CHANGED |

**New dependencies** (pin exact versions; check licenses in Phase 0):
- backend: `file-type`, `sharp`, `jszip`, `pidusage` (conversion memory watchdog)
- frontend: `docx-preview`, `dompurify`, `ts-fsrs`, `highlight.js` (core), `react-markdown`, `rehype-sanitize`
- both: SheetJS CE (from the SheetJS CDN tarball)
- optional, after the spike: `pptxviewjs`
- system (on the EC2 host, D1): `libreoffice-writer`, `libreoffice-impress`, `libreoffice-calc` (`--no-install-recommends`), `poppler-utils`, fonts (`fonts-crosextra-carlito`, `fonts-crosextra-caladea`, `ttf-mscorefonts-installer`, `fonts-dejavu`); optional `clamav`

---

## 21. Decisions (all resolved)

| # | Question | Decision | Decided by |
|---|---|---|---|
| Q1 | Where does document conversion run? | Same EC2 host, `soffice` per job, one at a time, time- and memory-limited (§10.3). | School, 2026-10-01 (D1) |
| Q2 | AI budget | None. Free tiers of Gemini, Groq and GLM only; OpenAI out of default orders; quota-aware queue that pauses and resumes (§7.3). | School, 2026-10-01 (D2) |
| Q3 | Generated lesson = LessonNote or Page? | `LessonNote`, placed on the week as a `LESSON_NOTE` item. | Recommendation accepted (D3) |
| Q4 | Video uploads | Not allowed. Videos are YouTube/Vimeo links; the recipe's Video slot asks the teacher for the link. | School, 2026-10-01 (D4) |
| Q5 | Department-wide blueprints; pushing a generated week to all class groups of a grade | Department blueprints: yes (programme-lead scope). Pushing content to other classes: deferred, not in this plan. | Recommended default (D5) |
| Q6 | Kinyarwanda | Glossary of key terms only (an optional field in the lesson; no extra call). Full translation is Tier 2. TTS is Tier 3 (no free tier, license review). | Recommended default (D5) |
| Q7 | Show AI provenance to students? | Yes, as a subtle "AI-assisted, reviewed by your teacher" line. | Recommended default (D5) |
| Q8 | ClamAV scanning | Supported but off by default (memory on the shared host). | Recommended default (D5) |

---

## 22. Implementation status (2026-10-01)

Branch `feat/elearning-lesson-studio`, cut from `origin/main` (6871b1ba). It is not merged and not deployed. Migrations **096, 097 and 098** have been applied to the **local** dev database and to the local test schema only.

### 22.1 Review findings that changed the plan

| # | Finding | What was done |
|---|---|---|
| R1 | A new `GENERATE_COURSE_CONTENT` permission would need legacy seed rows, a v2 manifest entry, a preset change and a backfill. All of that would only reproduce `MANAGE_COURSE_CONTENT`. | No new permissions. The Studio is gated by `MANAGE_COURSE_CONTENT` plus `assertCanBuildCourse`. The admin AI panel uses `VIEW_ALL_COURSES`. RBAC v2 is untouched. |
| R2 | Moving the lesson-note generator out of `lessonNoteAIController` risked regressions in a working feature. | Left as it is. `CORE_LESSON` has its own phone-first prompt in `generation/artifacts/coreLesson.ts`. |
| R3 | `vi.mock` of the AI layer was unreliable under `isolate: false`, so the tutor test sometimes made **real** AI calls. | Added `setTestProviders` and `src/test/fakeAI.ts`. AI keys are blanked under `NODE_ENV=test` unless `TEST_ALLOW_REAL_AI=1`. The tutor and mentorship tests use the fake. |
| R4 | Built-in blueprint presets were going to be seeded as DB rows. | Presets live in code (`blueprint.ts`), versioned with the prompts. `CourseBlueprint` holds teacher presets only. |
| R5 | MySQL 5.7 *rounds* fractional seconds, so a `not_before` written as "now" can be stored up to a second in the future. | The worker and job queue compare against now + 1 s. A test found this. |
| R6 | Two weeks placing existing notes in parallel both placed the same note. | Note placement is serialised per course (an in-process lock; there is one backend process). The test that found it stays. |
| R7 | Gemini's free-tier 429 says "check your plan and billing", so it was classified as a dead key and parked for an hour. | A dead key now means 401/403, OpenAI `insufficient_quota`, an invalid key, or payment required. Covered by a regression test. |
| R8 | A full run and an interactive run (preview, redo) can coexist, for example during a run paused for quota. | One active FULL run per course, plus one interactive run, and they may never touch the same week (409). |
| R9 | Approve with "turn the week on" only switched HIDDEN weeks. | It also publishes a SCHEDULED week whose date has passed. |
| R10 | Exit tickets and flashcards with VIEW/MARK_DONE could be completed by opening them or tapping "mark done". | Both complete via `SUBMIT` (answering, or reviewing every card). `courseMastery` ignores them, so they never claim DEMONSTRATED. Only a practical sign-off or a passed check does. |
| R11 | Interactive breaks and the practical task were planned as separate calls. | Both are part of `CORE_LESSON`, and the check, ticket, flashcards and video prompts are one `ASSESSMENT_PACK` call. A full week is about 3 calls. |
| R12 | `xlsx@0.18.5` (G11) | Replaced with SheetJS CE 0.20.3 from the SheetJS CDN in both packages. Existing import tests pass. |
| R13 | The plan said `sharp` for thumbnails. | Not added. `pdftoppm` writes the PNG thumbnail directly, so there is one fewer native dependency on the shared host. |
| R14 | The Documents/Materials preview modal showed only file info for office files. | Office files now go through `<FilePreview>`: server PDF and text for subject materials, browser fallbacks for the Documents module. |
| R15 | "Explain it differently" mostly existed already (note reader AI panel). | Added three starters (Rwandan workplace example, step by step, en français) instead of a new feature. |

### 22.2 What exists now

**Phase A1: connections, context pack, AI layer, engine**
- **Security fix G4:** `GET /lesson-plans/entry/:id` and plan creation are owner, co-teacher or validator only (404 otherwise), with batched queries (`services/curriculumChain/lessonPlans.ts`).
- **Week bundle:** `GET /scheme-of-work/schemes/:id/week-bundles` (`weekBundle.ts`).
- **Week Context Pack:** `generation/contextPack.ts`, with `[S1]` contract, lesson plans, own notes (never unapproved AI drafts), file text, earlier weeks, and BM25-lite trimming to a budget.
- **AI v2:** role orders (draft = GLM, assess = Groq, verify ≠ drafter), free-tier quotas (daily, RPM, concurrency, interactive reserve), dead-key parking, `AIUsageLog`, and `AIQuotaExhaustedError` (`services/aiProviders/limiter.ts`, `usageLog.ts`).
- **Durable engine:** runs and tasks in MySQL (096). The worker has atomic claims, round-robin between teachers, retries with backoff, `PAUSED_QUOTA` with automatic resume, "Tonight" runs, restart recovery and SSE events (`generation/{planner,worker,events}.ts`).

**Phase A2: artifacts and review**
- `REUSE_PLACEMENT`, `CORE_LESSON` (a DRAFT LessonNote placed as a pending item), `ASSESSMENT_PACK` (check + exit ticket + flashcards + video "watch for" questions, then a second-AI verify with `KEY_CORRECTED` / `NOT_CROSS_CHECKED` flags), and `VIDEO_SLOT`. The AI never writes URLs.
- Idempotent `input_hash`. An unchanged rerun makes 0 calls.
- Approve, dismiss and "redo with a note". An edited draft is never replaced.
- The builder gains a "Build with AI" button, "Generate with AI" / "Use my notes" / "Add it myself" on the gap banner, and AI-draft badges.

**Phase A3: Lesson Studio UI** (`/elearning/courses/:id/studio`)
- Six steps: Weeks → Sources (with reference-file upload) → Recipe (presets, blocks, style, phone preview) → Try one week → Generate (live board, SSE with polling fallback, pause/resume/stop/retry) → Review (lesson in the reader with "where each part comes from", answer keys, flags, J/K/A keys).
- Entry points: builder header, gap banner, and the Lesson Notes cards ("E-learning: 2/13 weeks live · Fill weeks with AI").
- Interactive activities (fill in the blanks, order the steps, match pairs) are generated, editable (TipTap `Activity` node) and live in the reader.

**Phase B1–B2: files and previews** (097)
- `FILE` items: multi-file upload and drag-and-drop on a week, with progress. An allowlist plus magic-byte sniffing refuses renamed executables, macro files and fakes. Videos are refused with the YouTube message (D4). Per-teacher storage quota.
- `FileAsset` and a `FileDerivative` cache keyed by sha256: the same file converts once.
- `BackgroundJob` queue, one job at a time. `soffice` converter: per-job profile, `nice`, timeout, process-group kill, memory watchdog. Optional Gotenberg. `pdftoppm` thumbnails.
- Text extraction: pdf, docx, pptx with speaker notes, sheets, text. The text feeds the context pack.
- Range streaming end to end: file-server `sendFile`, backend `streamTo`. All user-facing `downloadToBuffer` call sites were moved (G9/G10).
- `<FilePreview>` (`components/files`): PDF and server PDF via pdf.js, docx (docx-preview + DOMPurify), sheets (SheetJS), slide outline with notes, images, streamed audio, text/code/CSV (never rendered as HTML), a download card, and a slow-network confirm. Used in the learner item view, the builder drawer, Subject Materials and the Documents modal.

**Phase B3: interactive types** (098)
- `EXIT_TICKET` with a confidence rating, plus the class pulse (confident-but-wrong first).
- `FLASHCARDS` with FSRS on the device (ts-fsrs), offline-queued reviews, and a "Review N cards" daily session on My Learning.
- `PRACTICAL_TASK` with photo evidence (compressed in the browser), a checklist, and teacher sign-off or return in the builder's "Who's learning" tab. Sign-off counts the criteria as DEMONSTRATED.
- The Studio now generates these types for real.

**Phase B4: offline and AI help**
- "Save this week for offline" (size first), via `GET /my/sections/:id/offline-manifest` and `X-Prefetch: 1`. A prefetch never counts as a view.
- Reader AI starters.
- Admin "AI on free tiers" panel: quota left per provider, calls per day, and what teachers did with drafts.

### 22.3 Verification

- **Backend (vitest):** new suites `aiProvidersV2` (9), `elearningStudio` (11), `elearningFiles` (8) and `elearningInteractiveTypes` (4). On a fresh test schema, the full suite passes apart from known order or timing flakes that pass when rerun alone: `remindersHub`, `registrationNumberRegenerate`, and load-related 401/404s while another session's suite shared the MySQL server.
- **Frontend (vitest):** `studioModel`, `activities`, `filePreview`, `flashcardModel` and `interactiveItems`. Full suite 611/611.
- **Real free-tier AI run (local keys):** GLM wrote a 891-word lesson with 2 activities and a practical task in about 70 s. Questions fell back to GLM because the local Groq key is invalid (401, correctly parked). Gemini's free quota was used up (correctly treated as quota after R7).
- **Browser flows:**
  - `backend/scripts/studio-ux/studio-flows.cjs`: every Studio step in desktop dark and phone light, a live "try one week", review, and WCAG 2 AA axe checks. 22/22, plus a live run 17/17.
  - `backend/scripts/studio-ux/files-flows.cjs`: real PPTX/DOCX/XLSX/PDF upload through the picker, previews, student view on phone and desktop, and axe. 18/18.
  - axe excludes the top-bar notification badge, which fails contrast in app-shell code outside this work.

### 22.4 Not done / follow-ups

1. **Real LibreOffice conversion was not exercised.** `soffice` is not installed on the development machine, so tests use a fake converter and the browser fallbacks were verified instead. Install the packages on the EC2 host (§10.3) and convert the 10 sample files before relying on slide previews (Phase 0).
2. **Production capacity and free-tier limits (Phase 0)** were not measured. Set `AI_DAILY_REQUESTS_*`, `AI_RPM_*`, `PREVIEW_MAX_RSS_MB` and `PREVIEW_TIMEOUT_MS` from real numbers.
3. **Prompt quality spike on all three providers** was not done: the local Groq key is invalid and Gemini was out of quota. Only GLM was exercised for real.
4. **Practical-task brief editing:** teachers can edit the checklist, but the brief (HTML) is only regenerated, not edited in the drawer.
5. **WeekStrip on the Scheme of Work calendar** (§5.4) was not built. The week bundle API exists and the Studio's week rail uses it.
6. **H5P import, TTS narration, adaptive remediation, translation toggle** remain Tier 2/3 (§11).
7. **Data left in the local dev database:** course 1 (from scheme 19) is published with sample drafts, files, an exit ticket and flashcards from the browser checks.

### 22.5 Deploy runbook (when merged)

1. Back up the database, then apply `096`, `097` and `098` with the mysql client (`npm run migrate` fails on the box). They are additive and idempotent, and must be applied **before** the new code starts, because `CourseItem` gained columns.
2. Install on the host: `libreoffice-writer libreoffice-impress libreoffice-calc poppler-utils` plus the fonts in §10.3 (`--no-install-recommends`).
3. Env: `AI_PROVIDER_ORDER` without `openai`. `AI_DAILY_REQUESTS_GEMINI`/`_GROQ`/`_GLM` from the real limits. Optional `AI_ROLE_ORDER_*`, `ELEARNING_AI_CONCURRENCY`, `PREVIEW_*`, `ELEARNING_*_MAX_MB`, `ELEARNING_STORAGE_QUOTA_MB`.
4. Restart `file-server` (Range support) and `mis-backend`. The generation worker and job queue start with it (`ELEARNING_STUDIO_WORKER=false` switches the worker off).

---

## Sources

- D2L Brightspace Lumi (create a module from a document; review before insertion): https://buffalostate.teamdynamix.com/TDClient/2003/Portal/KB/ArticleDet?ID=167996 · https://www.d2l.com/whats-new
- Instructure Canvas IgniteAI: https://www.nasdaq.com/press-release/instructure-delivers-safe-simple-ai-promise-igniteai-and-major-ecosystem-updates-2025
- Moodle AI subsystem: https://docs.moodle.org/500/en/AI_subsystem · Course Creator AI plugin: https://moodle.org/plugins/local_coursegen
- Google Classroom Gemini tools and NotebookLM/Gems grounded in class materials: https://workspaceupdates.googleblog.com/2025/09/educators-create-gems-notebooks-google-classroom.html · https://siliconangle.com/2025/06/30/google-expands-access-ai-tools-classroom-educators-gemini/
- Khanmigo teacher tools and tutor: https://blog.khanacademy.org/khanmigo-features/
- UNESCO guidance on generative AI in education (human oversight): https://neqmap.bangkok.unesco.org/wp-content/uploads/2023/09/UNESCO-Guidance-and-AI-frameworks.pdf · https://inee.org/pt/node/13023
- Gotenberg: https://gotenberg.dev/
- react-pdf / pdf.js: https://cdn.jsdelivr.net/npm/react-pdf@10.4.1/README.md
- docx-preview: https://awesome.ecosyste.ms/projects/github.com%2Fvolodymyrbaydalka%2Fdocxjs
- PptxViewJS: https://cdn.jsdelivr.net/npm/pptxviewjs@1.1.9/README.md · pptx-glimpse: https://libraries.io/npm/pptx-glimpse · preview survey: https://www.besthub.dev/articles/comprehensive-guide-to-docx-pptx-xlsx-and-pdf-preview-solutions-d5e00bd76cb4
- SheetJS installation (CDN tarball; npm build frozen): https://git.sheetjs.com/sheetjs/docs.sheetjs.com/raw/commit/b2ef80c897b5bbd658b982c1ef5274a735c71112/docz/docs/02-installation/02-frameworks.md
- ts-fsrs / FSRS: https://github.com/open-spaced-repetition
- H5P React (Lumi): https://docs.lumi.education/npm-packages/h5p-react
- Kinyarwanda TTS (MMS `kin`, check the license): https://huggingface.co/nikalaasante/mms-tts-kin · https://huggingface.co/spaces/mbazaNLP/Kinyarwanda-text-to-speech
