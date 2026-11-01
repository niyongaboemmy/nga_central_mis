# External AI: contract for MIS, Task Mentor, Tupo and Tendo

Plan: `REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md` (workspace root). Owner decisions S1–S5 were all approved on 2026-11-01.

People's own Claude, ChatGPT and other subscriptions can **never** be called by the NGA apps; the vendors' terms forbid it. People bring them to NGA in two ways:
- **Hand-off:** "Open in Claude / ChatGPT", then "Paste the answer".
- **Connector:** NGA as an MCP server inside their own Claude or ChatGPT.

## Rules every app keeps

1. **Staff only.** Use the MIS capability `AI_EXTERNAL_CONNECT`. It is legacy-visible, so it appears in the SSO permission list that spokes already read.
2. **School policy first.** Everything sits behind `decideAi` (the master switch and per-app switches), then the new `AiPolicy.external` fields, all off by default. You get these from `@nga/access` **1.6.0** via `normalizeAiPolicy`:
   ```ts
   external: { connector: boolean; handoff: boolean; pupilNames: "never" | "with_consent" }
   ```
   Use `externalPupilDataAllowed(policy, consented)`.
3. **Never inside assessments or exams.** Hints, anything a learner does inside a quiz or assignment, and any active TMCode exam session are excluded.
4. **Pupil-identifying data** (a named student's record, submission, discipline case) leaves the school only when `policy.external.pupilNames === "with_consent"` **and** the person ticked consent for this request or connector session. Otherwise anonymise it ("Student 7", class-level aggregates) or refuse with `AI_HANDOFF_PUPIL_CONSENT`.
5. **Connector writes create drafts only.** No tool sends, publishes, grades, releases or deletes. A person confirms the draft in the app.
6. **Re-vendor `@nga/access` 1.6.0** with `node <mis>/packages/access/sync.mjs <vendor dir>`.

## 1. Hand-off (every AI endpoint)

Request: the usual body of any AI endpoint, plus `aiHandoff`:

```jsonc
{ "aiHandoff": { "mode": "prompt", "pupilConsent": false } }   // return the prompt instead of calling AI
{ "aiHandoff": { "mode": "import", "text": "<the pasted answer>" } } // use this answer instead of calling AI
```

**Prompt mode answer:** HTTP 200 with
```jsonc
{ "success": true, "handoff": { "prompt": "...", "expects": "json" | "text", "schemaName": "..." } }
```
- For JSON features the prompt ends with: "Answer with ONLY one JSON object that matches this JSON Schema, inside a ```json code block …" followed by the schema.
- Emails and phone numbers are scrubbed out.
- For job-based features (async generation), the job must not start. Return the hand-off prompt directly, or store it on the job state as `handoff`.

**Import mode:** validate the pasted text and run the feature's normal post-processing as if a provider had answered.
- JSON is taken from the last fenced ```json block, else the outermost `{…}`, and checked with `matchesSchema`.
- If it doesn't match: 400 with "The pasted answer isn't in the expected format…".
- The result carries `ai: { route: "handoff", reason: "HANDOFF" }`, which the UI shows as "via your own AI (pasted)".
- Log usage with `provider "handoff"`, `route "handoff"`. These calls never count against the school's quotas.

**Errors** (403 `{ success:false, code, message }`):

| Code | Meaning |
|---|---|
| `AI_HANDOFF_OFF` | `policy.external.handoff` is false |
| `AI_HANDOFF_NOT_ALLOWED` | The caller lacks `AI_EXTERNAL_CONNECT` |
| `AI_HANDOFF_PUPIL_CONSENT` | Pupil data without consent, or the policy says never |

**MIS reference implementation:**
- `backend/src/services/ai/handoff.ts`
- `generate.ts` → `handoffJson`, and `chat.ts`
- `routes.ts` → `personalFor()` parses `aiHandoff`
- `middleware/errorHandler.ts` turns `HandoffPrompt` into the 200 answer

Controllers that catch AI errors must re-throw `HandoffPrompt` (`isHandoffPrompt`), `HandoffForbiddenError` and `PersonalAIError` unchanged.

**UI:** an **"Open in my AI ▾"** control next to every AI button, offering Claude, ChatGPT, Gemini and Copy.
1. Call the endpoint in prompt mode.
2. If `prompt.length <= 6000`, open `https://claude.ai/new?q=<enc>` or `https://chatgpt.com/?q=<enc>` in a new tab with `noopener`. Gemini has no prefill, so copy the prompt and open `https://gemini.google.com/app`. For longer prompts, copy to the clipboard and open the site. Never auto-submit anything ourselves.
3. Show a **"Paste the answer"** box, then call import mode. Render the result as usual with "via your own AI (pasted)".
4. For pupil-data features, show an "Include pupil details" checkbox (unticked) that sends `pupilConsent`.

## 2. Connector (MCP) tools served by each app

The MIS hosts the only MCP endpoint (`https://api.amashuri.com/mcp`) and the OAuth server. For tools that belong to another app, the MIS relays the call **with a short-lived MIS token for the signed-in person**, the same way Home relays `/api/integration/home-summary`. The app checks it against MIS `/auth/verify` and applies its own access rules.

### `GET /api/integration/mcp/tools`
Authorization: `Bearer <person's MIS token>`. Returns the tools this person may use right now: `[]` when the policy is off, they lack `AI_EXTERNAL_CONNECT`, or they are a student.

```jsonc
{ "tools": [
  { "name": "tm_list_my_courses", "title": "My Task Mentor courses", "description": "...",
    "kind": "read" | "draft", "pupilData": false,
    "inputSchema": { "type": "object", "properties": { ... }, "required": [] } }
] }
```
- Names are `<app>_<verb>_<noun>` with app prefixes `mis_`, `tm_`, `tupo_`, `da_`.
- Keep schemas small.
- Descriptions are written for the model: say what it returns and that drafts need human confirmation.

### `POST /api/integration/mcp/call`

Body:
```jsonc
{ "name": "tm_draft_rubric", "arguments": { ... }, "consent": { "pupilNames": false } }
```

On success, 200:
```jsonc
{ "result": <JSON-serialisable>, "summary": "short human text", "openUrl": "https://taskmentor.amashuri.com/..." }
```

On refusal, 4xx `{ "code", "message" }`. The codes are:
- `TOOL_UNKNOWN`
- `TOOL_FORBIDDEN`
- `EXTERNAL_OFF`
- `EXAM_ACTIVE`
- `PUPIL_CONSENT_REQUIRED`
- `BAD_ARGUMENTS`

Rules for results:
- Cap each result at about 50 KB; paginate with `cursor`.
- `pupilData` tools return anonymised rows unless `consent.pupilNames` is true **and** `policy.external.pupilNames === "with_consent"` **and** the person already has detail access to those pupils.
- Draft tools save something the person sees in the app as a **draft** (unpublished, unsent, unreleased) and return `openUrl`.

### Tools to provide

| App | Read | Draft |
|---|---|---|
| MIS | `mis_get_my_timetable`, `mis_list_my_subjects`, `mis_get_scheme_of_work`, `mis_list_my_lesson_notes`, `mis_get_competences` | `mis_create_lesson_note_draft`, `mis_propose_scheme_week` |
| Task Mentor | `tm_list_my_courses`, `tm_search_question_bank`, `tm_list_assignments`, `tm_list_submissions_to_grade` (pupilData) | `tm_add_questions_draft`, `tm_draft_rubric`, `tm_draft_feedback` (pupilData; never released) |
| Tupo | — | `tupo_draft_mail` (saved in Drafts, never sent) |
| Tendo | `da_list_rules` | `da_draft_rule` (inactive until a person approves) |
