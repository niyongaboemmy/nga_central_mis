# Scheme of Work AI Generation — Term-Scoping Analysis

**Author:** Analysis for NGA Central MIS backend team
**Date:** 2026-07-29
**Scope:** `Generate Scheme of Work with AI` feature (SchemeAIGenerate.tsx / schemeAIController.ts)

## 1. Problem statement

RTB (Rwanda TVET Board) curriculum modules — e.g. `SPEGI302 Graphic User Interface Design` and
`SPEWI302 Development of Web User Interface` — are written **per module, for the full year**, not
per term. A single uploaded document covers all the content a trainee sees across the whole
module (130 learning hours in the GUI example), but the MIS generates a scheme **one term at a
time** (the screenshot shows Term 1, 11 weeks, starting 01/10/2025).

Today, `schemeAIController.ts` has no concept of "which part of this document belongs to the term
being planned." It reads the whole file, truncates it to `MAX_CURRICULUM_CHARS` (60,000 chars),
and hands it to Gemini with only one constraint: *"the term has N available teaching weeks."*
Gemini is trusted to figure out, unaided, which slice of a full-year document is appropriate for
week 1..N of *this specific term*. That's guesswork, not scoping — and it gets worse for Term 2/3,
where the truncation may already have cut off the later Learning Outcomes entirely.

## 2. Curriculum document structure (as authored by RTB)

Both sample modules follow an identical, highly regular skeleton. This regularity is the lever we
can exploit.

```
Cover page (module code, title, RQF level, credits, hours, sector, trade, curriculum, issue date)
Purpose statement
Delivery modality (theory/practical %, formative/summative %)
Elements of Competency and Performance Criteria      <- table: "1. <LO title>" -> "1.1 ...", "1.2 ...", "1.3 ..."
Course content
  Learning outcomes (numbered list, matches the table above 1:1)

  Learning outcome 1: <title>          Learning hours: <N>
    Indicative content
      - <topic bullet> (✔ sub-bullets)
    Resources required for the learning outcome
      Equipment / Materials / Tools
    Facilitation techniques
    Formative assessment methods

  Learning outcome 2: <title>          Learning hours: <N>
    ... same shape ...

  Learning outcome 3: <title>          Learning hours: <N>
    ... same shape ...

Integrated/Summative assessment
  Integrated situation (a scenario-based project brief)
  Assessable outcomes / marks table (maps back to each LO)
References
```

Key structural facts that matter for term-scoping:

- **The document is already partitioned by Learning Outcome (LO), and each LO carries an explicit
  hour budget** (`Learning hours: 30`, `40`, `60` in the GUI example — 130 total). This is the
  natural "chapter" boundary RTB itself uses.
- **The number of LOs is small and consistent (2-4)** and, in both sample modules, **matches the
  number of academic terms in the year (3)**. This is not a coincidence — RTB modules are designed
  so one LO ≈ one term of delivery. The second attached curriculum excerpt (web page design/
  responsive design/website development) shows the same pattern: 3 competency elements, 3 learning
  outcomes.
- **Every LO section starts with an unambiguous, greppable header**: `Learning outcome <n>[:.]`
  immediately followed (same line or next line) by `Learning hours: <n>`. This pattern repeats
  verbatim across RTB modules (it's a template, not free text), which makes it a reliable regex
  anchor — far more reliable than asking an LLM to infer section boundaries from a wall of text
  after `mammoth`/`pdf-parse` has flattened tables and lost visual structure.
- **The document has a clear tail marker**: `Integrated/Summative assessment` (or `References`)
  always follows the last LO and never contains indicative content — it must be excluded from any
  "content to teach this term" extraction, or the AI will hallucinate weekly topics out of the exam
  brief.

## 3. Existing system structure (what the code does today)

| File | Role | Term-awareness today |
|---|---|---|
| `backend/src/utils/docExtract.ts` | Converts .docx/.pdf/.txt → raw plain text | None — flattens everything, including tables, into one text blob |
| `backend/src/controllers/schemeAIController.ts` | `generateWeeksWithGemini()` sends `rawText.slice(0, 60000)` to Gemini with a prompt that only specifies `maxWeeks` | None — the *entire* document (or as much as fits in 60k chars) is sent regardless of which term is being generated |
| `AcademicTerm` table (`db/schema.ts`) | Has `academic_term_id`, `academic_year_id`, `name` (e.g. "Term 1"), `start_date`, `end_date` | `name` is free text but conventionally holds the term ordinal; nothing currently parses it |
| `SchemeAIGenerate.tsx` | Collects `start_date`, `num_weeks`, `skip_weeks`, uploads file | No input exists for "which learning outcome(s)/content range applies to this term" |

**The gap:** the system has term boundaries in *time* (start/end date, number of weeks) but no
mechanism to translate that into a boundary in the *document* (which characters/sections of the
curriculum are in scope). `computeMaxWeeks` and `parseSkipWeeks` solve "how many weeks," not "which
content."

## 4. Recommended approach: structural pre-parse + explicit LO selection

Rather than trying to make the Gemini prompt smarter about guessing scope (which is unreliable and
non-deterministic), **do a cheap, deterministic, regex-based structural pass over the extracted
text before the AI call**, and use it to compute an exact start/end character offset for the
content that belongs to the selected term. This removes the ambiguity mechanically instead of
hoping the model infers it correctly.

### 4.1 Structural parser (new, no AI cost)

Add `extractCurriculumStructure(rawText: string)` to `docExtract.ts`:

1. Scan for every occurrence of the pattern (case-insensitive, tolerant of line breaks):
   `Learning outcome\s+(\d+)\s*[:.\-]?\s*(.*?)\s*Learning hours?:?\s*(\d+)`
2. Record each match's `{ loNumber, title, hours, startIndex }` (the character offset where the
   match begins).
3. Find the tail marker: the first occurrence of `Integrated/Summative assessment`, `Integrated
   assessment`, or `References:` after the last LO match. That offset (or `rawText.length` if none
   found) becomes the end boundary of the final LO.
4. Each LO's **end boundary = next LO's start boundary** (or the tail marker for the last one).
   This yields an ordered list of exact `[start, end)` slices — the precise "where the AI should
   start and stop reading" the task asked for.
5. Return `{ los: [{ loNumber, title, hours, start, end }], hasStructure: boolean }`. If fewer than
   2 LO matches are found, `hasStructure = false` and the system falls back to today's
   whole-document behavior (with a UI notice — see §4.4).

This is pure string parsing — no API cost, runs in milliseconds, and is deterministic, so it can
run synchronously on file upload before the user even clicks "Generate."

### 4.2 Term → LO mapping

Two mapping strategies, applied in this priority order:

1. **Automatic 1:1 mapping (default).** Look up the sibling terms for the selected
   `academic_year_id` (`SELECT * FROM AcademicTerm WHERE academic_year_id = ? ORDER BY start_date`)
   to get the term's ordinal position (`termIndex`, 1-based). Parse the current term's ordinal
   directly from `AcademicTerm.name` via `/\d+/` as a fallback/cross-check. If
   `los.length === totalTermsInYear`, default-select `los[termIndex - 1]`. This covers the common
   case seen in both sample modules (3 LOs, 3 terms, hours already roughly proportioned to terms:
   30/40/60 ≈ increasing term workload).
2. **Manual override (always available).** Regardless of whether auto-mapping succeeded, show the
   user a checklist of detected LOs (title + hour budget) with the auto-selected one(s)
   pre-checked. This handles the schools/modules where LO count ≠ term count, or where a school
   splits one LO across two terms, or combines two short LOs into one term.

### 4.3 Slicing the text sent to Gemini

Once the user confirms which LO(s) apply to this term, compute
`contentSlice = rawText.slice(selectedLOs[0].start, selectedLOs[selectedLOs.length - 1].end)` and
pass **only that slice** (not the whole document) into `generateWeeksWithGemini`. Practical
benefits beyond correctness:

- Removes any chance the model pulls topics from a different term's LO (the content literally
  isn't in the prompt anymore).
- Shrinks the prompt drastically (a single 30-60 hour LO section is a fraction of a 130-hour
  module), so `MAX_CURRICULUM_CHARS` truncation stops being a real risk for later terms — today,
  Term 3 content near the end of a large document could already be getting truncated away by the
  blind `slice(0, 60000)`.
- Also slice the matching performance-criteria rows from the "Elements of Competency" table (match
  by prefix, e.g. `1.1`, `1.2`, `1.3` for LO 1) and prepend them to the prompt — gives the model the
  assessment criteria for *only* the in-scope content, improving alignment between generated weekly
  objectives and what the term will actually be graded on.

### 4.4 UI changes (`SchemeAIGenerate.tsx`)

Insert one step between "file selected" and "Generate Scheme of Work":

- On file select, call a new lightweight endpoint (e.g. `POST /scheme-of-work/ai-generate/structure`)
  that runs `extractCurriculumStructure` server-side (cheap — no Gemini call) and returns the LO
  list.
- If `hasStructure`, render a checklist: `☑ LO 2: Draw digital sketch (40 learning hrs)` etc., with
  the term-matched entry pre-checked, and a short label like *"Detected content for Term 2 —
  confirm or adjust what this term should cover."*
- If `!hasStructure` (non-RTB template, or a document that's already single-term), show the
  existing flow unchanged with a note: *"Couldn't detect separate terms in this document — the
  whole file will be used."*
- Include `selected_lo_numbers` (or, simpler for the API, the resolved `content_start`/`content_end`
  character offsets) in the `FormData` sent to `startAIGenerate`.

### 4.5 Backend changes (`schemeAIController.ts`)

- `processJob` accepts `selectedLoNumbers?: number[]` (or start/end offsets) alongside the existing
  params.
- Before calling `generateWeeksWithGemini`, if structure was detected and a selection was made,
  replace `rawText.slice(0, MAX_CURRICULUM_CHARS)` with the LO-bounded slice (still capped at
  `MAX_CURRICULUM_CHARS` as a safety net, but that cap should now almost never bind).
- Optionally persist which LO(s)/hours the scheme was generated from on `SchemeOfWork` (e.g. a
  `source_lo_range` text column) purely for traceability/audit — not required for correctness, but
  useful when a teacher asks "why does this term's scheme only cover topics 2.1-2.3?".

## 5. Why this beats "just tell the AI which weeks/topics to cover in the prompt"

A prompt-only fix (e.g. "only use content relevant to weeks X-Y of the year") still requires the
model to *find* that content inside a large, structurally-flattened document on every single
generation call — an inference step, repeated per request, with no guarantee of consistency
between runs or terms. The regex pre-parse instead turns "where does Term 2 start and end in this
document" into a **fact computed once, deterministically, from the document's own template
structure**, and only the already-correct slice is ever shown to the model. This is strictly more
reliable, cheaper (smaller prompts), debuggable (the LO boundaries can be logged/inspected), and
naturally extensible if RTB later publishes per-term curricula directly (in which case
`hasStructure` will simply be false and the document is used as-is, exactly like today).

## 6. Summary of changes required

| Layer | Change |
|---|---|
| `docExtract.ts` | Add `extractCurriculumStructure()` — regex-based LO boundary detector |
| `schemeAIController.ts` | New `getCurriculumStructure` endpoint; `processJob` slices text by selected LO(s) instead of blind `slice(0, 60000)` |
| `routes/schemeOfWork.ts` | New route for the structure-preview endpoint |
| `SchemeAIGenerate.tsx` | New "confirm term content" checklist step, pre-selected via term-ordinal ↔ LO-count matching |
| `SchemeOfWork` (optional) | Optional `source_lo_range` column for audit trail |
