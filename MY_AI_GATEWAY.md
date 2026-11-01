# My AI gateway: how Task Mentor, Tupo and Tendo use people's own AI keys

Plan: `PERSONAL_AI_PROVIDERS_PLAN.md` (workspace root), §3 and §10. People add their own AI provider keys in the MIS (`/my-ai`). The keys never leave the MIS. Each app keeps its own school AI exactly as it is today. For a call **by a person**, the app asks the MIS whether that person's own key should answer. If it should, the app sends the call to the MIS, and the MIS calls the provider with the key.

## Rules every app keeps

1. **The school AI policy still decides first.** That covers `decideAi`, the teacher's `ai_mode`, exam locks, and `AI_DISABLED` 403s. My AI only ever picks *which* AI answers a call that is already allowed.
2. **Background and system work always uses the school AI.** Examples: grading on submit, worker jobs and batch narration. Never send these to the gateway.
3. **Inside a quiz, assignment or project**, send `inAssessment: true`. The policy default (`personal.inAssessments: "never"`) then keeps the school AI.
4. **If the MIS is unreachable, use the school AI.** Network errors, timeouts and unexpected 5xx responses all count, and the answer is labelled with `ai.reason = "GATEWAY_UNAVAILABLE"`. The gateway must never make AI less available than it is today.
5. **Skip the gateway entirely while `policy.personal.enabled` is false.** The policy comes from `/integrations/ai-policy`; with `@nga/access` 1.5.0, `normalizeAiPolicy()` fills in `personal`. Also skip it when `policy.personal.apps[<app>] === false`.

## Auth

The gateway uses the same credentials as `GET /integrations/ai-policy`.

- **Client credentials:** HTTP Basic with `SSO_CLIENT_ID:SSO_CLIENT_SECRET`.
- **Calling app:** the MIS works out which app is calling from the client id (`access/apps.ts`: `taskmentor_app` → tm, `tupo` → tupo, `discipline_attendance` → da), never from the request body.
- **The person:** every request carries the header `X-Nga-On-Behalf-Of: <MIS user id>`. That person must be ACTIVE in the MIS.

## Endpoints (base `{NGA_MIS_BASE_URL}/integrations/ai`)

### `GET /routes` (header `X-Nga-On-Behalf-Of`)

Returns, for each task, what answers this person in this app, plus the keys they may choose for a single request. The response contains no secrets.

```json
{ "success": true, "data": {
  "v": 1730460000, "policyV": 7, "enabled": true,
  "byTask": {
    "author":   { "route": "personal", "reason": "PERSONAL", "credentialId": 12, "provider": "anthropic", "model": "claude-sonnet-5-5", "label": "My Claude", "fallbackToSchool": true },
    "assist":   { "route": "school", "reason": "NO_ROUTE" },
    "complete": { "route": "school", "reason": "NO_ROUTE" },
    "hint":     { "route": "school", "reason": "NO_ROUTE" },
    "translate":{ "route": "school", "reason": "NO_ROUTE" }
  },
  "choices": [ { "credentialId": 12, "provider": "anthropic", "model": "claude-sonnet-5-5", "label": "My Claude" } ]
} }
```

- **Caching:** cache per person for 60 s. Throw the cached copy away when `/auth/verify` returns a different `ai_routes_v` (new) or `ai_policy_v`.
- **Tasks:** `assist` (chat, ask, summarise, smart replies, Q&A), `author` (generators, drafts, rubrics, reports), `complete` (inline completion), `hint` (Socratic hints), `translate`.

### `POST /gateway/json` (structured output)

Body:

```json
{ "task": "author", "feature": "tm.question-generator", "inAssessment": false, "aiRoute": null,
  "prompt": "…", "schema": { "type": "object", … }, "schemaName": "questions", "maxOutputTokens": 4000, "disableThinking": false }
```

`200`:

```json
{ "success": true, "data": { … }, "ai": { "route": "personal", "reason": "PERSONAL", "credentialId": 12, "label": "My Claude", "provider": "anthropic", "model": "…" }, "usage": { "input_tokens": 0, "output_tokens": 0 } }
```

### `POST /gateway/text` (plain text)

Body: `{ task, feature, aiRoute?, prompt, system? }`. Returns `200 { success, data: "<text>", ai }`.

### `POST /gateway/chat` (Server-Sent Events)

Body: `{ task, feature, aiRoute?, system, messages: [{ role: "user"|"assistant", content }] }`.

Events arrive in this order:
1. `delta` with `{ text }`, repeated.
2. Then exactly one of:
   - `done` with `{ ai }`;
   - `error` with `{ code, message, fallbackAllowed }`. `fallbackAllowed` is false once any text has been sent.

### Answers that mean "do something else"

| Status | Body | What the app does |
|---|---|---|
| `409` | `{ code: "AI_USE_SCHOOL", reason, skipped }` | Run the app's own school AI. Label the answer `ai = { route: "school", reason, skipped }`. |
| `503` | `{ code: "AI_KEY_INVALID" \| "AI_KEY_NO_CREDIT" \| "AI_KEY_RATE_LIMITED" \| "AI_PERSONAL_FAILED", message, fallbackAllowed, label }` | If `fallbackAllowed`, run the school AI and label the answer `ai = { route: "school", reason: "KEY_NOT_ACTIVE", fallbackFrom: code, label }`. Otherwise return the error to the person: a 503 with `message`. |
| `403` | `{ code: "AI_DISABLED", reason, message }` | Same as today. |
| `403` | `{ code: "AI_GATEWAY_UNKNOWN_APP" \| "AI_GATEWAY_USER_INACTIVE" }` | Run the school AI (or refuse, for an inactive user, as the app already does). |
| other / network | — | Run the school AI with `reason: "GATEWAY_UNAVAILABLE"`. |

### `aiRoute`: a one-off choice from the AI panel

The person can pick, for a single request, `"school"`, `"<credentialId>"` or `"<credentialId>:<model>"`. Pass the value through unchanged. The MIS checks that the key belongs to that person and is allowed in the calling app.

## UI in each app

The AI panels show a small control next to the generate or send button.

- **Before the call:** "Answers with: School AI ▾". The options are School AI, each entry in `choices` ("My Claude · claude-sonnet-5-5"), and "Manage My AI ↗", which opens `{MIS front end}/my-ai`. Show the control only when `enabled` and `choices.length > 0`.
- **After the call:** "via My Claude · claude-sonnet-5-5". If the app fell back: "Your key 'My Claude' was out of credit, so School AI answered."

## Where the MIS side lives

- `backend/src/routes/aiGateway.ts`
- `backend/src/services/ai/personal/*`
- `packages/access/src/index.ts` (`decidePersonalRoute`, `AiPersonalPolicy`)
