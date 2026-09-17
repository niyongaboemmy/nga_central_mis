# Curriculum ↔ Scheme of Work: Relationship Analysis

**Date:** 2026-08-03
**Author:** Senior analyst review (Claude)
**Scope:** Whether/how the Curriculum feature (Elements of Competency / Performance Criteria) and the Scheme of Work feature should be linked, given they are both derived from the same source document (an official RTB-style curriculum PDF) and currently exist as two fully independent data models. Includes a specific look at where AI is required to make that link work in practice, rather than relying on manual tagging.

---

## 1. Executive summary

Curriculum and Scheme of Work were built at different times, by different code paths, against the same underlying source material (the official curriculum document), but **they do not share a single foreign key, shared type, or joined query today**. Each feature re-parses the same PDF independently, using different extraction strategies, and stores the result in unrelated tables. This works today because both features are individually useful, but it creates three concrete problems as both features mature:

1. **No traceability** — nothing in the system can answer "which Performance Criteria has this term's Scheme of Work actually covered?" or "which weeks map to Element 3?" This is the single most valuable question a HOD/QA reviewer or RTB auditor would ask, and today it requires manually reading both documents side by side.
2. **Duplicated, drifting extraction logic** — `curriculumImportAIController.ts` and `schemeAIController.ts` each independently parse the same class of PDF (one via a single whole-document Gemini call, the other via regex-based "Learning Outcome" detection + a scoped Gemini call). A curriculum PDF that trips up one parser's assumptions won't necessarily trip up the other's, so the two features can silently disagree about how many elements/outcomes a document has, what the hours are, etc.
3. **No content reuse** — a teacher who has already had the Curriculum's Elements/Criteria/Indicative Content entered for a subject still has to re-upload the same PDF (or write from scratch) to generate a Scheme of Work, even though the richest, most structured version of that content already lives in `SubjectCompetency`/`CompetencyPerformanceCriteria`.

My recommendation: **partial linkage is worth doing now (low cost, high traceability value); full mandatory linkage is not worth doing.** But there's a fourth point that changes the shape of the recommendation, and is the focus of this revision:

4. **A manual-only link will not get populated.** Scheme of Work content is free text (`topic`, `objective`, `methodology`...) written independently of Curriculum's criteria wording. Asking a teacher to additionally hand-pick which Performance Criteria each week covers is realistically an optional field nobody reliably fills in — it's extra clerical work with no immediate payoff for the person doing it. If the goal is traceability that HODs/QA/RTB can actually rely on, **the matching itself has to be AI-assisted**, with manual selection available only as a correction/override, not as the primary data-entry path. This report treats that as a first-class design requirement, not a "nice to have later."

---

## 2. Current state (as implemented)

### 2.1 Data model

| | Curriculum | Scheme of Work |
|---|---|---|
| Header table | `SubjectCompetency` (an "Element of Competency") | `SchemeOfWork` (one row per subject+class+term) |
| Detail table | `CompetencyPerformanceCriteria` | `SchemeOfWorkEntry` (one row per week) |
| Scope / FK | `subject_id` only — **term- and class-independent** | `subject_id` **+ `class_group_id` + `academic_term_id`** — one scheme per offering |
| Content fields | `title`, `description`, `learning_hours`, `indicative_content` (element); `criteria_number`, `description` (criteria) | `topic`, `sub_topic`, `objective`, `methodology`, `resources`, `evaluation`, `duration`, `learning_place`, `observation` — all free text |
| Cross-reference column | none | none |

This scoping difference is the crux of the problem: **Curriculum describes what must be taught, once, for the whole subject. Scheme of Work describes when a specific class in a specific term actually taught it.** They are conceptually parent/child (a scheme should cover the subject's curriculum), but nothing in the schema encodes that relationship, and — critically — nothing in either feature's *wording* is guaranteed to match the other's. A Scheme entry's `topic` is teacher-authored prose; a Criteria's `description` is RTB-authored prose. They can describe the same thing in completely different words (e.g. entry topic "Practice drawing shapes and icons in Illustrator" vs. criteria "Digital sketch is properly drawn"). This is the reason a simple text/keyword match won't work — see §4.

### 2.2 Two independent AI-extraction pipelines from the same document type

| | `curriculumImportAIController.ts` | `schemeAIController.ts` |
|---|---|---|
| Purpose | Populate `SubjectCompetency` + `CompetencyPerformanceCriteria` | Populate `SchemeOfWorkEntry` rows for one term |
| Text extraction | `extractTextFromFile` (shared util) | `extractTextFromFile` (shared util) |
| Structure detection | **None** — sends the whole extracted text to Gemini in one call and asks it to find elements/criteria/hours/indicative content itself | **Regex-based** — `extractCurriculumStructure`/`extractLoContentItems`/`mapTermToLearningOutcome` in `docExtract.ts` locate "Learning Outcome N" sections first, then only the relevant slice is sent to Gemini |
| Output | Elements + criteria + hours + indicative content, saved after user review | Weekly entries (topic/objective/methodology/...), generated to fill exactly the number of teaching weeks in a term |

Both pipelines are solving "read an RTB-style curriculum PDF" but with different heuristics. This is the kind of duplication that tends to age badly: if RTB changes their template next year, both parsers need separate fixes, and there is no guarantee they'll fail (or succeed) the same way on the same document.

### 2.3 Frontend

The Scheme of Work entry modal (`SchemeOfWorkEntryModal.tsx`) has a field labeled "Learning Outcomes / Objectives" — but it is a **plain free-text textarea**, not a picker bound to a `SubjectCompetency`/`CompetencyPerformanceCriteria` record. A teacher typing a scheme entry has no way to say "this week covers Performance Criteria 2.1 and 2.2" in a structured way; they can only write it as prose, which means the system can't query it back.

---

## 3. Answering the three questions

### Q1 — Do we need to update Curriculum to add Scheme-of-Work-related fields?

**No, not as owner of the link.** Curriculum is the correct place for the *authoritative, term-independent* definition of what's taught (Elements/Criteria/Indicative Content/Hours). It should **not** grow scheme-of-work-specific columns (like `class_group_id` or `academic_term_id`) — that would break its "one definition per subject, reused every term/class" design, which is actually a strength (RTB curricula don't change per class).

What Curriculum *could* usefully gain, without compromising that design:
- A **read-only rollup** (e.g. on the Subject detail page or the Curriculum tab) showing, for the currently selected term/class, how many of its Performance Criteria have been referenced by at least one Scheme of Work entry. This is a *view* built by joining the two tables at query time — it requires the link proposed in Q2, but no schema change to Curriculum itself.

### Q2 — Do we need to update Scheme of Work entries to match Performance Criteria?

**Yes — as an AI-populated, optionally-corrected link, not a manual-first one.** Concretely:

- Add a many-to-many join table `SchemeEntryCriteria` (`entry_id` FK → `SchemeOfWorkEntry`, `criteria_id` FK → `CompetencyPerformanceCriteria`, both `ON DELETE CASCADE`) — see §5.3 for why a join table beats a single nullable FK column.
- Make the link **optional and non-blocking** in the API — never require an entry to have a criterion before it can be saved:
  - Manually-authored, informal weeks (revision, exams, holidays, guest sessions) legitimately have no matching criterion.
  - Subjects that haven't had their Curriculum filled in yet must not be blocked from writing a Scheme of Work.
- **The rows in this table should, in the normal case, be written by AI, not by a teacher manually ticking boxes.** See §4 for exactly where in the two existing pipelines this fits, and why manual-only tagging is a data-quality trap.
- A manual multi-select in `SchemeOfWorkEntryModal.tsx` should still exist, but as a **review/correction UI over AI suggestions** ("We think this week covers 2.1 and 2.2 — remove or add"), not a from-scratch picker. This mirrors the pattern this codebase already uses for Curriculum import: AI proposes, human reviews before it's final.

A many-to-many join is also the more realistic shape for *why* AI is needed here at all: an entry can plausibly match more than one criterion, and picking the right one(s) requires understanding meaning, not exact text — squarely an LLM task, not a dropdown a person fills in from memory of a PDF they read weeks ago.

### Q3 — Is there a better way to reconcile the fact they hold "the same content"?

They don't fully hold the same content — that's worth being precise about, because it changes the proposal:

- **Curriculum's indicative content** = *what the RTB curriculum says must be taught* (static, subject-wide, authoritative).
- **Scheme of Work's topic/objective/methodology** = *what a specific teacher actually planned/did, for a specific class, in a specific term* (dynamic, per-offering, practical/pedagogical, free text, in the teacher's own words).

These are complementary, not duplicate — but that gap in wording is exactly why the "same content" can't be reconciled by a database constraint or a keyword search; it needs semantic matching. **This is the core argument for making AI matching part of the design, not an enhancement bolted on afterward.** See §4 for the concrete mechanism.

---

## 4. Why — and where — AI has to do the matching

Three realistic ways this link could be populated, in increasing order of reliability:

| Approach | Reliability | Why |
|---|---|---|
| **Manual tagging only** (teacher picks criteria from a list when writing/editing an entry) | Low | Extra work with no immediate benefit to the teacher writing it; historically this is exactly the kind of optional metadata field that ends up empty on most rows. Also requires the teacher to re-remember/re-read the curriculum's exact criteria wording while writing free-text prose about their own lesson plan. |
| **Exact/keyword text matching** (e.g. match if entry `topic` shares words with a criterion `description`) | Low–Medium | The two texts are independently authored (§2.1) — a teacher writing "practice logo design in Illustrator" and a criterion reading "Logo and banner are properly drawn" share almost no exact keywords despite describing the same thing. Cheap to build, but produces enough false negatives/positives that reviewers won't trust it, defeating the point. |
| **AI (LLM) semantic matching** | High | An LLM given an entry's `topic`/`objective`/`methodology` plus the subject's list of Performance Criteria (numbers + descriptions) can judge semantic overlap the way a human reviewer would, and return which criteria (if any, possibly several) the entry addresses — with a confidence/rationale a reviewer can sanity-check before it's saved. This is the same "extract structure from messy real-world text" capability already proven in this codebase by both `curriculumImportAIController.ts` and `schemeAIController.ts`. |

Given that, here is where AI matching plugs into the two *existing* pipelines with minimal new surface area:

### 4.1 At Scheme-of-Work AI-generation time (cheapest, do first)
`schemeAIController.ts`'s `generateWeeksWithGemini` already sends Gemini the curriculum text and asks it to produce `topic`/`objective`/`methodology`/etc. per week. Since the subject's `CompetencyPerformanceCriteria` are already available via `competenciesApi`/`SubjectCompetency`, extend the Gemini call to *also* return which criteria number(s) each generated week addresses (a small addition to `weekSchema`'s `responseSchema`, e.g. `criteria_numbers: string[]`). The AI has both texts already in front of it in this flow, so this is nearly free — no second API call, no new endpoint. After the user reviews/edits the generated weeks as they do today, the suggested `criteria_numbers` get resolved to `criteria_id`s and written into `SchemeEntryCriteria` alongside the entry.

### 4.2 For manually-written or already-existing entries (the harder, necessary case)
Most real Scheme of Work entries are *not* AI-generated — teachers write and edit them directly (`addSchemeEntry`/`updateSchemeEntry`/`SchemeOfWorkEntryModal.tsx`). For these, add a small, synchronous **"Suggest Criteria"** action, following the same pattern already used for `suggestEntryContent` in `schemeAIController.ts` (single Gemini call, no job-polling needed since it's one entry):

- New endpoint, e.g. `POST /curriculum/subjects/:subjectId/entries/:entryId/suggest-criteria` (or a stateless variant that just takes `{ topic, objective, methodology }` + `subject_id` in the body, so it can also be called from the "new entry" form before the entry even has an ID).
- Prompt: give Gemini the entry's `topic`/`sub_topic`/`objective`/`methodology` and the subject's full criteria list (`criteria_number` + `description`), ask for the best-matching criteria number(s), and require it to return *no matches* rather than force-fitting one when nothing genuinely corresponds (mirrors how `generateWeeksWithGemini` is already instructed to use judgement rather than reproduce noise verbatim).
- Surface the result in `SchemeOfWorkEntryModal.tsx` as pre-checked suggestions inside the (otherwise plain) multi-select from §3/Q2 — the teacher confirms or adjusts, then saves. This keeps a human in the loop for the final write, consistent with how "Import from Curriculum" already works (AI proposes → preview → confirm → persist).
- This same endpoint can be run in a small batch job to backfill suggestions for a term's *existing* entries the first time this feature ships, rather than leaving all historical data unlinked.

### 4.3 Longer-term: skip re-extraction, use curriculum data directly
Once a subject's Curriculum is populated, `schemeAIController.ts` doesn't need to re-parse the PDF with regex heuristics (§2.2) at all — it can hand Gemini the subject's existing, human-reviewed `SubjectCompetency`/`CompetencyPerformanceCriteria`/`indicative_content` directly as the source material for generating weeks, with §4.1's criteria-tagging built in from the start. This both improves generation quality (curated data beats a second raw-PDF extraction) and makes the AI-matching step a natural byproduct of generation rather than a bolt-on. This is a larger change and should follow, not precede, §4.1–4.2.

---

## 5. Concrete proposal (phased, low-risk)

### 5.1 Do now (schema + API)
- Nothing to Curriculum's own tables (see Q1).
- New join table `SchemeEntryCriteria` (`entry_id` FK → `SchemeOfWorkEntry`, `criteria_id` FK → `CompetencyPerformanceCriteria`, both `ON DELETE CASCADE`, composite PK).
- New endpoints to read/replace an entry's linked criteria (e.g. `PUT /curriculum/entries/:entryId/criteria` accepting an array of `criteria_id`s — simplest as a full-replace rather than individual attach/detach calls, since the UI will typically save a whole multi-select at once).
- New AI endpoint per §4.2 (`.../suggest-criteria`), gated behind the same `isGeminiConfigured()` check already used everywhere else in this codebase, so it degrades gracefully (manual multi-select still works with no suggestions) when no `GEMINI_API_KEY` is configured.

### 5.2 Do next (UI + generation-time wiring)
- Extend `schemeAIController.ts`'s generation schema per §4.1 so AI-generated schemes come pre-tagged.
- Add the "Suggest Criteria" action + review multi-select to `SchemeOfWorkEntryModal.tsx` per §4.2.
- Small badge/chip list on each entry in `SchemeDetails.tsx`/calendar views showing linked criteria numbers (e.g. "1.1, 1.2") when present — purely additive, doesn't disturb existing free-text display.

### 5.3 Why a join table, not a single FK column
A single `criteria_id` on `SchemeOfWorkEntry` forces "one entry = one criterion", which doesn't match how teaching actually maps to criteria (many-to-many: one week can address multiple criteria; one criterion can span multiple weeks) — and it doesn't match how the AI matching in §4 will naturally want to respond ("this entry addresses criteria 2.1 and 2.2"). A join table costs one extra migration and one small endpoint, and avoids a data model that will need re-migrating the first time a real scheme needs to tag two criteria on the same week.

### 5.4 Do later
- Coverage dashboard: a "Curriculum Coverage" panel (Scheme of Work page or Curriculum tab) listing each Performance Criteria with a ✓/✗ against "covered by ≥1 scheme entry this term" — needs §5.1 shipped and some real linked data first.
- Batch-backfill AI suggestions for historical/existing entries (mentioned in §4.2) once the endpoint exists.
- §4.3's larger refactor (curriculum-data-driven scheme generation, replacing PDF re-extraction).
- Unifying the two pipelines' raw structure-detection (`curriculumImportAIController.ts` adopting `extractCurriculumStructure`/`extractLoContentItems`) — worth doing for long-term maintainability, but it's a code-quality improvement, not something end users would notice, so it should be scheduled opportunistically rather than blocking the above.

### 5.5 Explicitly out of scope / not recommended
- **Do not** make the link mandatory (blocking entry save without a criteria selection) — would break informal/non-curriculum weeks and any subject without curriculum data yet.
- **Do not** rely on manual tagging as the primary mechanism — per §4, it will not get filled in consistently; AI suggestion + human confirmation is the mechanism that will actually produce usable data.
- **Do not** merge `SchemeOfWorkEntry` and `CompetencyPerformanceCriteria` into one table, or auto-derive scheme entries wholesale from curriculum criteria — they have genuinely different lifecycles (subject-wide vs per-offering) and merging would regress the correct scoping design each currently has.
- **Do not** rewrite `curriculumImportAIController.ts` to depend on `schemeAIController.ts` or vice versa — keep them as separate controllers; only share the lower-level `docExtract.ts` structure-detection function, and only as a later opportunistic cleanup (§5.4).

---

## 6. Effort/impact summary

| Change | Effort | Impact | Priority |
|---|---|---|---|
| `SchemeEntryCriteria` join table + replace-links endpoint | Small (1 migration, small controller addition, 1 route) | Unlocks traceability; prerequisite for everything else | **High** |
| AI "Suggest Criteria" endpoint (§4.2) | Small–medium (1 Gemini call following the existing `suggestEntryContent` pattern) | Makes the link populate reliably without teacher busywork | **High** |
| Criteria multi-select (AI-prefilled, manually correctable) in entry modal | Small–medium (1 component, 2 API calls) | Makes the link visible/usable/correctable by teachers | **High** |
| Tag criteria at AI-generation time (§4.1) | Small (extend existing `weekSchema`/prompt) | Free traceability for every AI-generated scheme going forward | Medium–High |
| Coverage dashboard | Medium (new query + small UI) | High visibility for HOD/QA/RTB reviews | Medium, do after the link ships |
| Curriculum-data-driven scheme generation (§4.3) | Medium–large (new code path, prompt redesign) | Better AI accuracy, removes redundant PDF re-parsing | Medium, do later |
| Unify structure-detection between the two AI pipelines | Medium (refactor `curriculumImportAIController.ts`'s Gemini call to work per-LO-slice) | Reduces long-term drift risk; no user-visible change | Low–Medium, opportunistic |
