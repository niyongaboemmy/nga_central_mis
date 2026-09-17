# AI Provider Fallback — Implementation Plan

**Status:** Proposed, not yet implemented
**Date:** 2026-08-06
**Depends on:** [`FREE_AI_MODELS_RESEARCH_REPORT.md`](./FREE_AI_MODELS_RESEARCH_REPORT.md)
**Touches:** `backend/src/controllers/lessonNoteAIController.ts` and (optionally, if adopted platform-wide later) `lessonPlanAIController.ts`, `schemeAIController.ts`, `curriculumImportAIController.ts`, `mentorshipAIController.ts` — all of which independently call `@google/genai` today.

## Problem

Every AI feature on this platform calls Gemini directly and hard-fails when its quota is exhausted (proven live during Lesson Notes testing: 20 requests/day was consumed by development alone). The research report found no free tier — Gemini's included — that's large enough to trust as a single point of failure for real classroom usage. The fix isn't a bigger quota from one vendor; it's **not depending on one vendor**.

## Goal

When the active AI provider is rate-limited or exhausted, the request should **automatically retry against the next configured provider**, transparently to the teacher, with no code path outside the AI controllers needing to know a fallback happened. Gemini stays primary — this is a safety net, not a replacement.

---

## Design

### 1. Provider-agnostic interface

New directory: `backend/src/services/aiProviders/`

```
aiProviders/
  types.ts          — shared interfaces
  geminiProvider.ts  — wraps existing @google/genai logic
  groqProvider.ts    — new
  glmProvider.ts     — new
  registry.ts        — ordered provider list + circuit breaker state
  generate.ts         — the orchestrator called by controllers
```

```ts
// types.ts
export interface AIProvider {
  name: string;                         // "gemini" | "groq" | "glm"
  isConfigured(): boolean;              // has an API key set
  supportsStrictSchema: boolean;        // true only for gemini + groq(gpt-oss)
  generateJSON<T>(params: {
    prompt: string;
    schema: JSONSchema;                 // plain JSON-Schema, provider converts internally
  }): Promise<T>;
}
```

Every provider adapter is responsible for translating the shared plain-JSON-Schema shape into whatever format it needs (Gemini's `Type.OBJECT` schema, Groq's `json_schema.strict`, GLM's `json_object` + prompt hint), and for parsing/validating its own response back into `T`. Callers (the controllers) never see provider-specific request/response shapes.

### 2. Reuse the existing `openai` dependency for every fallback

`backend/package.json` already lists `openai@^6.16.0` as a dependency — currently unused. Groq, Zhipu/GLM, DeepSeek, Qwen (OpenAI-compat mode), and OpenRouter are **all OpenAI-API-compatible**. That means `groqProvider.ts` and `glmProvider.ts` are both just:

```ts
new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
```

No new npm dependency required for either fallback.

### 3. Orchestrator with a circuit breaker

```ts
// generate.ts
export async function generateStructuredContent<T>(params: {
  prompt: string;
  schema: JSONSchema;
}): Promise<{ data: T; providerUsed: string }> {
  for (const provider of registry.orderedProviders()) {
    if (!provider.isConfigured()) continue;
    if (registry.isCoolingDown(provider.name)) continue;   // skip known-exhausted providers

    try {
      const data = await provider.generateJSON<T>(params);
      return { data, providerUsed: provider.name };
    } catch (err) {
      logger.warn(`AI provider ${provider.name} failed`, { error: err?.message });
      if (isQuotaError(err)) {
        registry.markCoolingDown(provider.name, COOLDOWN_MS); // e.g. 5 min
      }
      // fall through to next provider regardless of error type
    }
  }
  throw new ServiceUnavailableError(
    "All configured AI providers are currently unavailable. Please try again shortly.",
  );
}
```

- `isQuotaError(err)` reuses the same detection logic already written for `friendlyAIErrorMessage` in `lessonNoteAIController.ts` (checks for `RESOURCE_EXHAUSTED`, `429`, `/quota/i`) — generalize that helper into `aiProviders/errors.ts` and use it both for the cooldown decision and for the final user-facing message.
- **Cooldown, not permanent disable.** A provider that hit a quota error gets skipped for `COOLDOWN_MS` (suggest 5 minutes), then retried — daily quotas do reset, and we don't want a stale in-memory flag to permanently exclude a provider after a process restart resets it anyway (the job store already uses in-memory state with a TTL sweep — same pattern, see `aiNotesJobStore.ts`).
- Non-quota errors (network blip, malformed response) do **not** trigger cooldown — just move to the next provider for *this* request; the next request still tries the original provider first.

### 4. Provider order & config

```
AI_PROVIDER_ORDER=gemini,groq,glm     # env var, comma-separated, defaults to "gemini"
GEMINI_API_KEY=...                    # already exists
GEMINI_MODEL=gemini-2.5-flash         # already exists
GROQ_API_KEY=...                      # new
GLM_API_KEY=...                       # new
```

Each provider's `isConfigured()` checks its own env var, mirroring the existing `isGeminiConfigured()` pattern — so an admin can add `GROQ_API_KEY` later without any code change, and the feature keeps working with just Gemini if the others are never configured.

### 5. Model choice per fallback provider

- **Groq**: use `openai/gpt-oss-20b` specifically — per the research report, `strict: true` JSON Schema mode is **only** guaranteed on `gpt-oss-20b`/`gpt-oss-120b`. Any other Groq-hosted model falls back to best-effort JSON, silently.
- **GLM**: use `glm-4.5-flash` — confirmed permanently free (not a trial-credit model), unlike DeepSeek/Qwen's one-time token grants. Use JSON-object mode; since GLM doesn't guarantee schema match, validate the parsed object against the same JSON Schema with a lightweight validator before accepting it as success (see §6).

### 6. Validation layer for non-strict providers

Gemini and Groq(`gpt-oss`) return schema-guaranteed JSON. GLM (and any future JSON-object-only provider) does not. Add a small runtime check in `glmProvider.generateJSON()`:

```ts
const parsed = JSON.parse(response);
if (!matchesSchema(parsed, schema)) {   // check required keys + basic types exist
  throw new Error("GLM response did not match expected schema");
}
```

A thrown error here is treated the same as any other provider failure by the orchestrator — falls through to the next provider (or fails the whole request if GLM is last in the chain). No new dependency needed for `matchesSchema` — a handful of `typeof`/`Array.isArray` checks against the existing `noteHtmlSchema`/criteria-list shapes already used in `lessonNoteAIController.ts` covers this; reach for `ajv` only if the schemas get meaningfully more complex later.

### 7. Wiring into the existing controller

`lessonNoteAIController.ts` currently has two call sites that construct `new GoogleGenAI(...)` directly: `processGenerateJob` (async job path) and `proposeAINoteEdit` (sync path). Both get replaced with a call to `generateStructuredContent()`. The prompt-building logic (`buildCurriculumBlock`, `buildCurriculumBlockFromCompetency`) is unchanged — only the "send this prompt, get this schema back" call changes shape.

`processGenerateJob`'s `updateJob(jobId, { status: "analyzing", ... })` step is a good place to also record which provider ultimately answered, e.g. append to the job's `message`: `"Drafting notes with AI (via groq)..."` only if it's not Gemini — keeps normal-path UX unchanged but makes fallback visible in the job status for debugging, without needing a UI change.

### 8. Sanitization is unaffected

`sanitizeNoteHtml()` already treats **all** AI output as untrusted regardless of source — no changes needed there. This matters more, not less, with multiple providers: GLM/Groq's safety filtering and prompt-injection resistance is unverified/unknown territory, so the existing allow-list sanitizer is the correct and sufficient boundary regardless of which provider answered.

---

## Delivery phases

1. **Refactor only, no new provider** (~2–3 hrs): extract the existing Gemini call into `geminiProvider.ts` behind the `AIProvider` interface, add the (trivial, single-provider) orchestrator, confirm `lessonNoteAIController.ts` behaves identically. This de-risks the interface design before adding real fallback logic.
2. **Add Groq fallback** (~half day): `groqProvider.ts` using the existing `openai` package pointed at Groq's `baseURL`, `gpt-oss-20b`, `strict: true`. Wire into the orchestrator's provider order. Test by deliberately exhausting Gemini (already possible — quota is currently at zero) and confirming a real generation succeeds via Groq.
3. **Add GLM fallback + schema validation layer** (~half day): `glmProvider.ts`, `matchesSchema()` helper, wire as third provider.
4. **Observability polish** (~1–2 hrs): surface `providerUsed` in job status message; add a log line at `recordActivity` time noting which provider generated each AI note, so any future degradation is visible without digging through raw logs.
5. **(Optional, later) Extend beyond Lesson Notes**: `lessonPlanAIController.ts`, `schemeAIController.ts`, `curriculumImportAIController.ts`, and `mentorshipAIController.ts` all have the identical single-provider-Gemini pattern and would benefit from the same `aiProviders/` module — deliberately scoped out of this plan to keep the first rollout small and provable in one feature before generalizing.

## Explicitly out of scope for this plan

- Self-hosting any open-weight model (Ollama, vLLM, etc.) — infra/ops burden not justified when hosted free tiers exist.
- Per-teacher AI usage quotas/rate-limiting on *our* side — worth doing eventually (flagged as a risk in the original Lesson Notes plan) but orthogonal to provider fallback and shouldn't block this.
- Chinese providers requiring domestic phone verification (bigmodel.cn direct, Qwen's China-only endpoints) — only the international-accessible endpoints (z.ai, DashScope Singapore) are in scope.
- Streaming responses — none of the current AI endpoints stream; introducing streaming is a separate, larger change and Groq's docs note structured output + streaming can't currently be combined anyway.

## Risks / open questions

- **GLM and Groq's content-safety behavior for education-domain prompts is unverified** — recommend a manual smoke test across a few real lesson topics before relying on either in front of real teachers, the same way Gemini's behavior was learned empirically during this project.
- **Cooldown duration (5 min suggested) is a guess** — tune based on observed real quota-reset windows once the fallback is live and logging which provider serves each request.
- **`AI_PROVIDER_ORDER` misconfiguration** (e.g., listing a provider with no key set) should degrade gracefully via `isConfigured()` — verify this explicitly in phase 1's refactor, since it is the first line of defense against total AI unavailability.
