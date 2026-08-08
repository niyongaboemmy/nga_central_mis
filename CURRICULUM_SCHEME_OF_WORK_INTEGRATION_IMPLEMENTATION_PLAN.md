# Curriculum ↔ Scheme of Work: Integration Implementation Plan

**Date:** 2026-08-03
**Author:** Senior analyst review (Claude)
**Precedes:** [`CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md`](./CURRICULUM_SCHEME_OF_WORK_RELATIONSHIP_ANALYSIS.md) — read that first for the full problem analysis (data model comparison, why AI matching is required, join-table rationale). This document is the concrete build plan for the specific direction chosen: **uploading a curriculum document on the Scheme of Work screen should be able to auto-populate Curriculum too, by reusing the existing Curriculum-import backend utility — while keeping the AI-powered criteria matching from the prior report as the linking mechanism.**

---

## 1. Re-analysis: what's different about this requirement

The prior report proposed AI-powered matching as a *link* between two independently-populated tables. This requirement goes one step further: it collapses the two upload flows so a teacher generating a Scheme of Work doesn't have to separately visit the Curriculum tab and re-upload the same PDF — **one upload, on the Scheme of Work screen, can produce both.**

This changes three things worth calling out before designing the flow:

1. **Ordering dependency.** AI-powered matching (from the prior report) needs real `criteria_id` rows to attach to. If Curriculum is being generated *in the same request* as the Scheme of Work, those `criteria_id`s don't exist yet at the moment the scheme weeks are being generated. The plan below sequences this correctly: **Curriculum must be confirmed and persisted before matching runs**, even though both can be *proposed* from a single upload and a single Gemini pass over the text.
2. **Permission boundary.** Writing to `SubjectCompetency`/`CompetencyPerformanceCriteria` today requires `MANAGE_CURRICULUM` (enforced in `curriculum.ts` routes). Scheme of Work generation is gated differently (`assertTeacherOwnsScheme`, no `MANAGE_CURRICULUM` requirement). If a teacher without `MANAGE_CURRICULUM` uploads a document on the Scheme of Work screen, **the system must not silently create Curriculum records on their behalf** — that would be a privilege escalation via a side door. The plan below makes curriculum generation strictly conditional on the requesting user holding `MANAGE_CURRICULUM`.
3. **Don't clobber existing curriculum.** If a subject already has Curriculum data, re-extracting it from every Scheme-of-Work upload would be wasteful at best and destructive at worst (a garbled re-extraction overwriting a carefully curated element list). The plan below only offers curriculum generation **when the subject currently has zero `SubjectCompetency` rows**; when curriculum already exists, the existing data is used as-is for matching, and no extraction/regeneration happens.

With those three constraints, "reuse the existing utility" has a precise meaning: don't fork or duplicate `curriculumImportAIController.ts`'s Gemini extraction — **extract its extraction function into a shared module both controllers call**, and reuse its existing preview → confirm endpoint (`POST /curriculum/subjects/:subjectId/import/confirm`) unchanged as the actual persistence path, triggered from within the Scheme of Work wizard instead of only from the Curriculum tab's own modal.

---

## 2. Goals

- A teacher generating a Scheme of Work via AI, for a subject with **no existing Curriculum**, can optionally have Curriculum (Elements + Performance Criteria + hours + indicative content) extracted from the *same uploaded document* in the *same flow*, without re-uploading.
- Curriculum extraction reuses the existing Gemini extraction logic and the existing confirm/save endpoint — no duplicated prompt, no duplicated persistence code.
- Once Curriculum exists (freshly confirmed or already present), the generated Scheme of Work entries get **AI-suggested Performance Criteria links** (per the prior report's §4), reviewable/correctable by the teacher before or after they're saved.
- Nothing here removes or replaces the standalone "Import from Curriculum" flow on the Curriculum tab — it keeps working exactly as it does today, for subjects/teachers who prefer to manage Curriculum independently.

## 3. Non-goals

- Not making Curriculum generation mandatory or automatic without user confirmation.
- Not allowing users without `MANAGE_CURRICULUM` to create/modify Curriculum data through this new path.
- Not re-generating/overwriting Curriculum for subjects that already have it — only for subjects with zero `SubjectCompetency` rows at the time of upload.
- Not changing how manually-authored (non-AI) Scheme of Work entries are created — the "Suggest Criteria" manual/AI matching flow from the prior report still applies there unchanged.

---

## 4. Proposed unified flow

From the teacher's perspective, uploading a curriculum document in the Scheme of Work AI-generate wizard now looks like this:

1. **Upload document** (unchanged step) — same file picker as today in `SchemeAIGenerate.tsx`.
2. **Structure preview** (unchanged step) — the existing fast, non-AI "detected Learning Outcomes" checklist (`getCurriculumStructure`) still runs first, letting the teacher pick which content applies to this term, exactly as today.
3. **New, conditional step — "Set up Curriculum too?"** Only shown when:
   - the subject currently has **zero** `SubjectCompetency` rows, **and**
   - the requesting user holds `MANAGE_CURRICULUM`.

   If shown, a checkbox (default **checked**) reads: *"This subject has no Curriculum defined yet — also extract Elements of Competency and Performance Criteria from this document?"* If unchecked, or the step isn't shown at all (curriculum already exists, or user lacks permission), behavior is identical to today — skip straight to step 4.
4. **AI generation job runs** (existing job-polling UX, `SchemeAIGenerate.tsx`'s step tracker) — extended with one more possible step, "Extracting curriculum" (only when step 3's checkbox was checked), alongside the existing "Reading document / Analyzing with AI / Structuring weekly plan / Saving to database" steps.
   - Scheme of Work entries are saved exactly as today, at the end of this job (no new preview gate — matches current behavior, where scheme generation already auto-saves without a review step).
   - If curriculum generation was requested, the job **also** returns a *proposed* (not yet saved) set of Elements/Criteria, generated via the shared extraction utility, in the same job-status payload.
5. **New, conditional step — Curriculum preview/confirm** (only appears if step 3 produced a proposal): reuses the existing `ImportCurriculumModal` preview UI (same editable table: per-element/per-criteria checkboxes, editable title/description/hours/indicative content) to let the teacher review before anything is written. Confirming calls the **existing, unmodified** `POST /curriculum/subjects/:subjectId/import/confirm` endpoint. Skipping this step means no Curriculum data is saved (the Scheme of Work entries from step 4 are unaffected either way — they were already saved).
6. **AI-powered criteria matching** (from the prior report, §4) now runs automatically for the entries just generated in step 4, matching against whichever criteria are available — freshly confirmed in step 5, or already existing (if step 3 wasn't shown because curriculum already existed). This uses the **"Suggest Criteria"** mechanism, not a new one: either (a) the criteria numbers were already returned per-week by the same Gemini call in step 4 (cheapest — see §5.3) and just need resolving to real `criteria_id`s now that they exist, or (b) a follow-up batch call to the "Suggest Criteria" endpoint if step 4's prompt didn't have real criteria to reference yet (i.e. curriculum was proposed-but-not-yet-confirmed at generation time). Either way, results land as pre-filled, human-correctable suggestions — never silently final.
7. Teacher reviews the generated Scheme of Work (as today) and can adjust criteria tags per entry via the multi-select in `SchemeOfWorkEntryModal.tsx` (from the prior report's plan) at any time afterward, independent of this wizard.

If the subject already has Curriculum, or the user lacks `MANAGE_CURRICULUM`, the flow degrades exactly to what the prior report already proposed: scheme entries generate as today, then get AI-matched against the *existing* criteria.

---

## 5. Backend design

### 5.1 Extract the shared extraction utility

Move the Gemini extraction logic currently private to `curriculumImportAIController.ts` into a new shared module:

**New file: `backend/src/services/curriculumExtraction.ts`**
- `generateCurriculumWithGemini(curriculumText: string, subjectName: string): Promise<ImportedElement[]>` — moved verbatim from `curriculumImportAIController.ts` (same prompt, same `responseSchema`, same post-processing/validation). No behavior change.
- Export the `ImportedElement`/`ImportedCriteria` shape (or keep importing from `curriculumImportJobStore.ts` as today — that file already defines them; no need to move the type definitions, just the function).

**`curriculumImportAIController.ts`** changes to: `import { generateCurriculumWithGemini } from "../services/curriculumExtraction";` — otherwise unchanged. This is a pure refactor; the standalone Curriculum-tab import flow is unaffected.

**`schemeAIController.ts`** changes to: import the same function, call it when curriculum generation is requested (§5.3).

This is the concrete meaning of "reusing the existing utility" — one implementation, two callers.

### 5.2 New table: `SchemeEntryCriteria` (from the prior report, required here too)

```sql
CREATE TABLE SchemeEntryCriteria (
  entry_id     BIGINT NOT NULL,
  criteria_id  BIGINT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_id, criteria_id),
  CONSTRAINT fk_sec_entry
    FOREIGN KEY (entry_id) REFERENCES SchemeOfWorkEntry(entry_id) ON DELETE CASCADE,
  CONSTRAINT fk_sec_criteria
    FOREIGN KEY (criteria_id) REFERENCES CompetencyPerformanceCriteria(criteria_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Mirrors the join-table rationale already established in the prior report (§5.3 there) — many-to-many, since one week can cover multiple criteria and vice versa.

### 5.3 `schemeAIController.ts` changes

**Job store (`aiSchemeJobStore.ts`)** — add optional fields to `AISchemeJobState`:
```ts
proposedCurriculum?: ImportedElement[];   // only set when curriculum generation was requested & subject had none
curriculumSubjectHadNone?: boolean;       // so the frontend knows whether to show the confirm step
```
Add a new status value `"extracting_curriculum"` to the status union, inserted between `"parsing"` and `"analyzing"` when applicable (total step count becomes conditional: 5 steps instead of 4 when curriculum generation runs).

**`startAIGeneration`** — accept a new optional body field `generate_curriculum: "true" | "false"`. Before creating the job, check:
```ts
const wantsCurriculum = generate_curriculum === "true";
const canManageCurriculum = req.user.permissions.includes("MANAGE_CURRICULUM");
const [existingCompetencyCount] = await db.select({ count: sql`COUNT(*)` })
  .from(SubjectCompetency).where(eq(SubjectCompetency.subject_id, subjectId));
const shouldGenerateCurriculum =
  wantsCurriculum && canManageCurriculum && Number(existingCompetencyCount.count) === 0;
```
Pass `shouldGenerateCurriculum` into `processJob`'s params. **If the flag is true but the permission/emptiness checks fail, silently treat it as false** (don't error — the checkbox simply has no effect for that user/subject, matching the "step isn't shown" case from §4 defensively, in case of a stale client).

**`processJob`** — insert a new step when `shouldGenerateCurriculum`:
```ts
if (params.shouldGenerateCurriculum) {
  updateJob(jobId, { status: "extracting_curriculum", message: "Extracting curriculum structure..." });
  const proposedCurriculum = await generateCurriculumWithGemini(rawText, params.subjectName);
  updateJob(jobId, { proposedCurriculum, curriculumSubjectHadNone: true });
}
```
This runs on the **same `rawText`** already extracted for scheme generation — no second file read, no second `extractTextFromFile` call.

**`generateWeeksWithGemini` prompt/schema** — extend `weekSchema` with an optional field:
```ts
criteria_numbers: { type: Type.ARRAY, items: { type: Type.STRING } }, // e.g. ["1.1", "1.3"]
```
and extend the prompt text to include, when criteria are available (either `proposedCurriculum` just generated, or the subject's existing `CompetencyPerformanceCriteria` fetched from DB), a compact list of `criteria_number: description` pairs with an instruction: *"For each week, also list which of the following Performance Criteria (if any) it addresses, by number. Only include a number if the week genuinely covers it — it's fine for a week to match none."* This is exactly proposal §4.1 from the prior report, now feeding from either source.

**After scheme entries are saved** (end of `processJob`, where `status: "done"` is currently set) — resolve criteria linkage:
- **If curriculum already existed** (no generation needed): `criteria_numbers` from the AI response are real — resolve each to a `criteria_id` via a join on `CompetencyPerformanceCriteria.criteria_number` + `competency_id IN (subject's competencies)`, and bulk-insert into `SchemeEntryCriteria` immediately. Store the count in the job state for the UI to report ("N entries auto-tagged with performance criteria").
- **If curriculum was proposed but not yet confirmed**: `criteria_numbers` can't be resolved yet (no real `criteria_id`s exist). Store the raw `criteria_numbers` per generated entry in the job state (`entryCriteriaNumbers: Record<number, string[]>` keyed by a temporary index or the entry's `week_number`) so the frontend can resolve and persist them **after** the curriculum confirm step (§5.4) completes.

### 5.4 New/adjusted endpoints

- **`GET /scheme-of-work/ai-generate/:jobId/status`** (existing) — response payload extended with `proposedCurriculum`, `curriculumSubjectHadNone`, and either `autoTaggedCriteriaCount` (already-existing-curriculum case) or `entryCriteriaNumbers` (needs-confirmation case), per §5.3.
- **`POST /curriculum/subjects/:subjectId/import/confirm`** (existing, **unmodified**) — reused as-is for the curriculum confirm step. No changes needed here; it already accepts the same `ImportedElement[]` shape and returns `competency_ids`. *(Minor addition worth considering: have it also return the created `criteria_id`s keyed by `criteria_number`, so the frontend doesn't need a second round-trip to resolve them — see §7 open question.)*
- **New: `POST /scheme-of-work/schemes/:schemeId/link-criteria`** — accepts `{ entryCriteriaNumbers: Record<string, string[]>, subjectId }` (produced by the job in the "not yet confirmed" branch of §5.3), resolves each `criteria_number` against the subject's *now-confirmed* `CompetencyPerformanceCriteria`, and bulk-inserts `SchemeEntryCriteria` rows. Called once by the frontend immediately after the curriculum confirm step succeeds.
- **New (from the prior report, still needed): `POST /curriculum/subjects/:subjectId/entries/suggest-criteria`** or similar "Suggest Criteria" endpoint for manually-written/edited entries, and a **replace-links** endpoint (e.g. `PUT /curriculum/entries/:entryId/criteria`) for the manual multi-select in `SchemeOfWorkEntryModal.tsx`. These are unchanged from the prior report and are what "keep the manual AI-powered matching" refers to — this plan adds an *additional* auto-tagging path at generation time, it doesn't remove the per-entry suggest/correct mechanism.

### 5.5 Permission summary

| Action | Required permission |
|---|---|
| Generate Scheme of Work via AI (existing) | Teacher owns the scheme (`assertTeacherOwnsScheme`) — unchanged |
| Also generate Curriculum from the same upload (new) | Additionally requires `MANAGE_CURRICULUM`; silently skipped if absent |
| Confirm the proposed Curriculum (existing endpoint, existing permission) | `MANAGE_CURRICULUM` (route already enforces this) |
| Auto-tag / suggest criteria links on scheme entries | No new permission beyond existing scheme-edit rights — reading Curriculum data to *match against* is not the same as writing it |

---

## 6. Frontend design

### 6.1 `SchemeAIGenerate.tsx`
- On mount (or once `subjectId` is known), fetch `competenciesApi.getAll(subjectId)`; if the result is empty **and** `hasPermission(Permissions.MANAGE_CURRICULUM)`, show the new checkbox from step 3 of §4 (default checked). Otherwise, the checkbox and everything curriculum-related is simply not rendered — the component behaves exactly as it does today.
- Pass `generate_curriculum: "true"/"false"` in the `FormData` sent to `POST /ai-generate` based on the checkbox.
- Extend the `STEPS` tracker array with the conditional `"extracting_curriculum"` entry (only spliced in when the checkbox was checked), so the progress UI accurately reflects what's happening.
- On job `"done"`: if `proposedCurriculum` is present in the status payload, transition into a new sub-step (§6.2) instead of immediately calling `onComplete()`.

### 6.2 Curriculum preview/confirm sub-step
- Reuse the **preview table portion** of `ImportCurriculumModal.tsx` (the editable per-element/per-criteria checklist) rather than duplicating it — extract it into a shared presentational component, e.g. `CurriculumExtractionPreview.tsx`, taking `elements`/`onConfirm`/`onSkip` props, used by both `ImportCurriculumModal.tsx` (existing usage, refactored to use the shared component) and this new step in `SchemeAIGenerate.tsx`.
- "Confirm" calls the existing `curriculumImportApi.confirm(subjectId, { elements, source_filename })` — same call the Curriculum tab already makes.
- "Skip" proceeds without saving curriculum; the already-saved Scheme of Work entries remain as they are (no criteria links added, since nothing to link against).
- After a successful confirm, call the new `link-criteria` endpoint (§5.4) with the job's `entryCriteriaNumbers`, then call `onComplete()`.

### 6.3 Entry-level review (from the prior report, unchanged)
- `SchemeOfWorkEntryModal.tsx` still gets the optional criteria multi-select, pre-filled with whatever `SchemeEntryCriteria` rows exist for that entry (whether from the new generation-time auto-tagging in §5.3, or from a later manual "Suggest Criteria" call), letting the teacher add/remove at any time. This is the "keep the manual AI-powered matching" requirement — auto-tagging at generation time is an optimization on top of it, not a replacement.

---

## 7. Open questions (need a decision before/while building)

1. **Should `POST .../import/confirm` return `criteria_id`s keyed by `criteria_number`?** Recommended yes (small additive change to that endpoint's response) — avoids the frontend having to re-fetch `competenciesApi.getAll` just to resolve IDs for the `link-criteria` call in §5.4. Low risk since it's purely additive to the response shape.
2. **What if the teacher edits criteria numbers/descriptions during the §6.2 preview** (e.g. renumbers "1.1" to "1.1a")? The `entryCriteriaNumbers` map from the scheme-generation step was built against the *original* AI-proposed numbers. Recommend: resolve links by matching on the *original* proposed numbering only if unedited; if a criteria row's number was changed during preview, that link is simply dropped (teacher can re-add it manually via §6.3). This should be called out explicitly in the UI copy ("editing criteria numbers here may affect auto-linked Scheme of Work entries") rather than silently failing.
3. **Multiple terms, one subject.** If a second teacher later generates another term's Scheme of Work for the same subject (which now has Curriculum from term 1), the "also generate curriculum" step correctly won't show again (subject no longer has zero competencies) — only the matching step runs. Confirm this is the desired behavior (it is, per §3's non-goals — no re-generation once curriculum exists).
4. **Should the "extracting_curriculum" step block scheme generation, or run in parallel?** Plan above runs them sequentially within one job (curriculum extraction, then week generation) for simplicity and to keep one Gemini call's output available to the other (weeks need the criteria list). Running them as two parallel Gemini calls would be faster but more complex to coordinate in the job store — not recommended for the first version.

---

## 8. Phased rollout

| Phase | Scope | Depends on |
|---|---|---|
| **1** | Extract `generateCurriculumWithGemini` into `curriculumExtraction.ts`; update `curriculumImportAIController.ts` to import it (pure refactor, zero behavior change) | — |
| **2** | `SchemeEntryCriteria` migration + `link-criteria` endpoint + "Suggest Criteria" / replace-links endpoints (from the prior report) | Phase 1 not required, can run in parallel |
| **3** | `schemeAIController.ts`: permission/emptiness check in `startAIGeneration`, curriculum-extraction step in `processJob`, extended `weekSchema`/prompt for `criteria_numbers`, post-save auto-tagging when curriculum already exists | Phases 1–2 |
| **4** | Frontend: checkbox + extra progress step in `SchemeAIGenerate.tsx`; extract `CurriculumExtractionPreview.tsx` from `ImportCurriculumModal.tsx` and reuse it in the new confirm sub-step; wire the `link-criteria` call after confirm | Phase 3 |
| **5** | `SchemeOfWorkEntryModal.tsx` criteria multi-select + manual "Suggest Criteria" action (prior report's §4.2, still needed for entries not covered by generation-time auto-tagging) | Phase 2 |
| **6** | Coverage dashboard, batch-backfill for historical entries (prior report §5.4) | Phases 2–5 in production with real data |

Phases 1–2 are low-risk, additive, and independently shippable. Phase 3 is the core new logic and should be code-reviewed carefully around the permission/emptiness gating in §5.5 — that's the part with actual security implications (preventing curriculum writes by users who shouldn't have them).
