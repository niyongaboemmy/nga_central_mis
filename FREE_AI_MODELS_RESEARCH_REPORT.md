# Free AI Model APIs for Integration — Research Report

**Prepared by:** Senior Software Tools Research
**Date:** 2026-08-06
**Trigger:** The Lesson Notes AI feature (`backend/src/controllers/lessonNoteAIController.ts`) currently depends solely on Google Gemini (`gemini-2.5-flash`) via `@google/genai`. Its free tier is capped at **20 requests/day per project/model**, and that quota was exhausted during development testing alone — nowhere near real classroom usage. This report surveys free (or near-free) alternatives, including Chinese providers, to determine whether a fallback or multi-provider strategy is viable.

**Scope of the ask:** find models/providers usable for the platform's actual pattern — server-side Node.js/TypeScript calls that request **JSON-schema-constrained structured output** (the equivalent of Gemini's `responseMimeType: "application/json"` + `responseSchema`), used to generate lesson note HTML and to perform in-editor AI revisions.

---

## Methodology & a note on confidence

Rate limits and free-tier terms for these products change **weekly to monthly** and are increasingly gated behind logged-in consoles rather than published on public docs pages — several official pages returned 404s, redirects, or login walls during this research. Every claim below is labeled:

- **Confirmed** — read directly from an official, current docs/pricing page (source linked).
- **[Unverified]** — from secondary/aggregator sources only, or a docs page that describes the mechanism but not exact numbers. Treat these as directionally correct, not contractually reliable — re-check the live console before depending on a specific number in production.

Given this volatility, **the recommendation in this report is an architecture (multi-provider abstraction with fallback), not a permanent commitment to any single provider's numbers.**

---

## TL;DR Recommendation

1. **Don't chase a single "better free tier."** Every free tier here is small enough that a real classroom rollout will exhaust it. The fix is architectural: an AI-provider abstraction layer with automatic fallback across 2–3 providers, not a bigger quota from one vendor.
2. **For schema-constrained JSON (this platform's actual requirement), Groq's `strict: true` JSON Schema mode** (on `openai/gpt-oss-20b` / `gpt-oss-120b`) is the closest free equivalent to what Gemini's `responseSchema` already gives you — genuine constrained decoding, not best-effort.
3. **DeepSeek, Qwen (DashScope), and Zhipu (GLM)** are all real, low-friction options but only offer **JSON-object mode** (valid JSON guaranteed, but not guaranteed to match your schema) — same risk class as treating Gemini's output as "probably right" and validating with Zod/Ajv afterward, which the codebase should be doing regardless.
4. **GitHub Models is dead** (retired July 30, 2026) — remove from consideration entirely.
5. **Hugging Face's free serverless tier is effectively gone** ($0.10/month in credits as of 2026) — not viable for this use case.
6. Treat **OpenRouter's `:free` catalog as a rotating pool, not a stable dependency** — it lost several models (including DeepSeek's free variants) in the weeks leading up to this report.

---

## Comparison table

| Provider | Free tier (confirmed unless noted) | Structured output | Node.js fit | Verdict for this platform |
|---|---|---|---|---|
| **Google Gemini** (current) | Per-project quota; Flash/Flash-Lite only now — Pro tier went paid-only ~Apr 2026 [unverified exact RPM/RPD — console-gated] | `responseSchema` — real constrained JSON schema | `@google/genai` (already integrated) | Keep as primary; quota is the whole problem |
| **Groq** | 30 RPM; 1K–14.4K RPD; 6K–15K TPM depending on model | `json_schema` + `strict:true`, but **only** on `gpt-oss-20b`/`gpt-oss-120b` | OpenAI-compatible | **Best fallback candidate** — real schema guarantee, fast inference |
| **DeepSeek** | No standing free tier; pay-as-you-go from $0 balance, concurrency-capped (2,500/500 concurrent) not RPD-capped | JSON-object mode only | OpenAI-compatible (`baseURL` swap) | Cheap paid fallback, not truly free |
| **Alibaba Qwen (DashScope Intl.)** | 1M input + 1M output tokens, 90-day expiry, Singapore region only | JSON-object mode (prompt must contain the word "json") | OpenAI/Anthropic-compatible + native SDK | Good one-time trial pool, not renewable |
| **Zhipu AI / GLM (z.ai)** | **GLM-4.5-Flash / 4.7-Flash permanently free** | JSON-object mode w/ schema-shaped hints | REST, OpenAI-compatible-ish | Strong candidate — actually recurring-free, not trial credit |
| **Moonshot AI / Kimi** | No confirmed standing free tier [unverified promo: ¥15+$5, 3 RPM] | `json_schema` **strict mode documented** — best JSON support of the Chinese providers | REST | Interesting if a real free tier is confirmed; verify before relying on it |
| **OpenRouter** | 20 RPM always; 50 RPD (no credit) → 1,000 RPD (≥$10 lifetime credit) | Model-dependent passthrough | OpenAI-compatible | Good multiplexer, but free model list is volatile (shrinking) |
| **Cerebras** | $5 signup credit, no published RPM/RPD | Unconfirmed | REST | Speed-oriented; verify limits before use |
| **Mistral AI** | "Experiment" plan exists; exact numbers no longer public [unverified: ~1–2 RPM, 1B tokens/mo] | JSON mode historically supported | Official SDK | Usable but numbers unverifiable right now |
| **Hugging Face Inference Providers** | $0.10/month credit (explicitly "subject to change") | Varies by provider | `@huggingface/inference` | **Not viable** — effectively no free tier left |
| **Cloudflare Workers AI** | 10,000 Neurons/day, no card required | Not confirmed for JSON schema | REST / Workers binding | Broad model catalog (incl. DeepSeek-R1-Distill, Qwen, Kimi) — worth a follow-up check |
| **GitHub Models** | **Retired July 30, 2026** | N/A | N/A | Dead — do not plan around it |
| **NVIDIA NIM** | ~1,000–5,000 signup credits [largely unverified — fetch failed] | Unconfirmed | REST | Lowest-confidence entry; re-verify before use |

---

## Detailed findings by provider

### 1. Google Gemini (current baseline)
- Rate limits apply **per Google Cloud project**, not per API key (`ai.google.dev/gemini-api/docs/rate-limits`).
- Exact free-tier numeric limits have moved behind the logged-in `aistudio.google.com/rate-limit` console; public docs no longer list a static table.
- Multiple 2026-dated secondary sources converge on approximate free limits — **treat these as indicative only**:
  - `gemini-2.5-flash`: ~10 RPM / 250 RPD / 250K TPM
  - `gemini-2.5-flash-lite`: ~15 RPM / 1,000 RPD / 250K TPM
  - `gemini-2.0-flash`: ~5 RPM
- **Pro-tier models became paid-only around April 2026** — free access is now scoped to Flash/Flash-Lite only.
- Quota is project-scoped, so a second Google Cloud **project** does get an independent quota pool. No explicit anti-multiplication clause was found in the fetched docs, but this sits in ToS grey territory and shouldn't be built into production architecture as a "solution."
- `responseSchema` structured output is Gemini's existing, well-documented strength — this is the bar every alternative below is measured against.

Sources: https://ai.google.dev/gemini-api/docs/rate-limits · https://ai.google.dev/gemini-api/docs/billing

### 2. DeepSeek API (China)
- **No standing free tier.** Current pricing page lists paid-only models: `deepseek-v4-flash` ($0.14/M input-miss, $0.28/M output) and `deepseek-v4-pro` ($0.435/M input-miss, $0.87/M output). Older "deepseek-chat"/"deepseek-reasoner" names no longer appear.
- Rate limiting is **concurrency-based**, not RPM/RPD: 2,500 concurrent requests (v4-flash), 500 concurrent (v4-pro). No documented RPD/TPM ceiling.
- JSON output via `response_format: {"type": "json_object"}` — **JSON-mode only, not schema-enforced**; docs explicitly recommend validating the returned object yourself.
- Signup via phone or email; API platform (`platform.deepseek.com`) is separate from the consumer chat app. International signup exists but has had rough SMS-delivery history for non-PRC numbers.
- OpenAI-compatible — drop-in with the `openai` npm SDK via `baseURL` override.

Sources: https://api-docs.deepseek.com/quick_start/pricing · https://api-docs.deepseek.com/quick_start/rate_limit · https://api-docs.deepseek.com/guides/json_mode/

### 3. Alibaba Qwen / DashScope Model Studio (China)
- International (Singapore) new accounts get **1M input + 1M output free tokens, expiring after 90 days** — auto-granted on enabling Model Studio. **The Global/US-Virginia deployment has no free quota**; only Singapore does.
- JSON output requires `response_format: {"type": "json_object"}` **and** the literal word "json" somewhere in the prompt, or the call errors — documented behavior, not a bug. This is JSON-object mode, not full schema-constrained decoding.
- Current model family names have moved past "Qwen2.5/Qwen3" branding: qwen3.8-max / qwen3.7-plus / qwen3.7-flash / qwen3.5-omni-plus, etc.
- Both OpenAI-compatible and Anthropic-compatible interfaces are offered alongside the native DashScope SDK — easy Node.js integration.
- Exact RPM/TPM figures are console-gated; not confirmed from a public page.

Sources: https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output · https://help.aliyun.com/zh/model-studio/getting-started/models

### 4. Zhipu AI / GLM (China — z.ai international, bigmodel.cn domestic)
- **GLM-4.5-Flash and GLM-4.7-Flash are listed as permanently free** on the official pricing page — input, output, cached-input, and cached-storage all shown as "Free," not a time-boxed trial. This is the only provider in this report offering a genuinely recurring (not trial-credit) free tier for a capable model.
- New accounts also reportedly get a signup credit grant toward paid models (~25M tokens) — **[unverified, not confirmed on an official page]**.
- Structured output via `response_format: {"type": "json_object"}`, documented with JSON-Schema-style property/type/enum/required definitions in the request — available on the GLM-4.5/4.6/4.7 family.
- No RPM/TPM numbers found on the fetched free-tier docs — flagged unverified.
- Domestic (bigmodel.cn) access requires Chinese phone verification; international z.ai signup does not.

Sources: https://docs.z.ai/guides/capabilities/struct-output · https://bigmodel.cn/pricing

### 5. Moonshot AI / Kimi (China)
- **No confirmed standing free API tier.** A promotional trial (¥15 + $5 bonus credit, capped at 3 RPM) is reported by secondary sources but not confirmed on an official page — most references point to a **$1 minimum top-up** to activate the developer platform.
- The consumer chat app (Kimi) is free to use but is a separate product from the API.
- JSON support is comparatively the strongest of the Chinese providers surveyed: `platform.kimi.ai` documents both a loose `json_object` mode and a **strict `json_schema` mode** — the closest analog to Gemini's `responseSchema` found among non-Google/non-Groq options.
- Billed in USD via `api.moonshot.ai`; some regions report needing an international card.

Sources: cross-referenced via `platform.kimi.ai/docs/api/chat` (search-cache; direct fetch not completed in this pass — **re-verify before relying on this entry**).

### 6. OpenRouter
- Official, confirmed rate limits for `:free` models (`openrouter.ai/docs/api-reference/limits`): **20 RPM always**; **50 RPD** with under $10 lifetime credit purchased, **1,000 RPD** once ≥$10 in credit exists on the account (the credit doesn't need to be spent, just present).
- The free-model roster is **volatile and currently shrinking**: ~14 `:free` model IDs live as of early August 2026 (down from ~20 a few weeks prior). Qwen3-235B-MoE and a Qwen3-Coder variant were free at time of research; DeepSeek's free variants had already been pulled by July 2026.
- OpenAI-compatible API — trivial to integrate as a secondary client alongside `@google/genai`.
- Structured-output support passes through from the underlying model — not a fixed OpenRouter feature, varies per model.
- **Do not hardcode a specific `:free` model ID as a long-term dependency** — build the model ID as configuration, not a constant.

Source: https://openrouter.ai/docs/api-reference/limits

### 7. Groq
- Confirmed (`console.groq.com/docs/rate-limits`): **30 RPM** across free models; RPD ranging **1,000–14,400** and TPM **6,000–15,000**, varying per model (exact per-model table lives in the console).
- Hosts Llama 3.1/3.3, GPT-OSS 20B/120B, Qwen 3.6-27B, and Whisper on the free catalog as confirmed in this pass — **no DeepSeek-distilled or Kimi K2 models were confirmed present**; catalogs rotate, so re-check `console.groq.com/docs/models` directly if those specifically matter.
- **Best structured-output story of any free provider surveyed**: `response_format: {"type": "json_schema", "json_schema": {...}, "strict": true}` gives genuine constrained-decoding schema guarantees — but **`strict: true` currently only works on `openai/gpt-oss-20b` and `openai/gpt-oss-120b`**; other models silently fall back to best-effort JSON-object mode if you set `strict: true` on them. Streaming and Structured Outputs cannot currently be combined.
- LPU hardware gives Groq a real speed advantage — relevant for classroom-latency AI generation (teachers waiting on a lesson note or an in-editor revision).

Sources: https://console.groq.com/docs/rate-limits · https://console.groq.com/docs/structured-outputs

### 8. Cerebras
- Free tier: **$5 signup credit**, access to "all Cerebras-powered models," Discord community support. Paid Developer tier ($10 minimum) unlocks "10x higher rate limits."
- **No published RPM/RPD numbers for the free tier** — pricing page doesn't list them; the inference-docs subdomain redirected away from the target page during this research. Flagged unverified.
- JSON/structured-output support not confirmed in this pass — needs a direct follow-up against `inference-docs.cerebras.ai`.

Source: https://www.cerebras.ai/pricing

### 9. Mistral AI ("La Plateforme")
- A free **"Experiment"** plan exists, reportedly giving access to all Mistral models — but Mistral's own docs now state current limits are **only visible in the account Admin Console**, not published publicly (`docs.mistral.ai/admin/user-management-finops/tier`). Secondary sources conflict on the actual numbers (~1 request/second + 1B tokens/month vs. 2 RPM + 1B tokens/month).
- JSON-mode / schema-constrained output has long been part of Mistral's general API docs, but the specific current page content could not be re-confirmed in this pass (404s / nav-only responses).
- **Genuinely not independently verifiable right now** — Mistral itself doesn't publish the numbers anymore.

Source (partial): https://docs.mistral.ai/admin/user-management-finops/tier

### 10. Hugging Face Inference Providers
- Confirmed (`huggingface.co/docs/inference-providers/pricing`): **free accounts get $0.10/month in credits**, explicitly marked "subject to change." PRO tier gets $2.00/month.
- This is now a pass-through billing router, not the old free unlimited serverless tier — $0.10/month covers a handful of requests on most hosted models at most.
- The legacy `hf-inference` free serverless provider is now largely CPU-only, limited to small/legacy models (BERT/GPT-2-class) — not usable for lesson-note-quality generation.
- **Verdict: not a meaningful free option for this use case in 2026.**

Source: https://huggingface.co/docs/inference-providers/pricing

### 11. Cloudflare Workers AI
- Confirmed: **10,000 Neurons/day free**, no credit card required. Model catalog includes Llama family, Mistral 7B/24B, **DeepSeek-R1-Distill-Qwen-32B**, **Qwen2.5/3/QwQ**, Gemma, **Kimi (Moonshot) models**, and GPT-OSS variants — genuinely the broadest single free catalog found in this survey, spanning both US and Chinese-origin open models.
- JSON-schema structured-output support was **not confirmed** in the fetched pricing doc — needs a follow-up check of `developers.cloudflare.com/workers-ai/features/` or specific model pages.
- 10,000 Neurons/day is a compute-unit budget, not a flat request count — real throughput depends heavily on model size and output length chosen.
- **Worth a dedicated follow-up investigation** given the breadth of the free catalog.

Source: https://developers.cloudflare.com/workers-ai/platform/pricing/

### 12. GitHub Models — retired
- Confirmed directly from GitHub's own docs: **"GitHub Models has been fully retired" as of July 30, 2026.** Playground, model catalog, inference API, and BYOK are all gone. GitHub now points users to Azure AI Foundry or GitHub Copilot instead.
- **Remove from consideration entirely.**

Source: https://docs.github.com/en/github-models/prototyping-with-ai-models

### 13. NVIDIA NIM / build.nvidia.com
- Direct fetch of the pricing/catalog page timed out twice during this research; relying on cross-referenced secondary sources only: **1,000 free signup credits**, with an option to request up to 4,000 more (5,000 total) via a forum/request form. Credit consumption is model-weighted (larger models like DeepSeek-R1-671B cost more per call than Llama-3.1-8B). A 40 RPM per-model cap was also cited.
- Catalog reportedly includes DeepSeek, Qwen, Nemotron, and Llama models.
- **Lowest-confidence entry in this report** — none of the above was confirmed against NVIDIA's own current page. Re-verify directly before relying on any of these numbers.

---

## Suggested integration approach for this platform

Given the actual architecture already in place (`lessonNoteAIController.ts` using `@google/genai` with `responseSchema`, plus the `sanitizeNoteHtml` layer already treating AI output as untrusted), a pragmatic next step would be:

1. **Introduce a thin provider-abstraction interface** (`generateStructuredContent(prompt, schema): Promise<T>`) so the controller code doesn't need to know which vendor answered.
2. **Primary: Gemini** (unchanged) — best schema guarantee, already integrated, already sanitized.
3. **Fallback #1: Groq** with `gpt-oss-20b`/`gpt-oss-120b` + `strict: true` — nearly equivalent schema guarantee, free, fast, and OpenAI-compatible (minimal new code).
4. **Fallback #2: Zhipu GLM-4.5-Flash** (permanently free, not just trial credit) or **OpenRouter's rotating `:free` pool** — accept JSON-object mode here and run the existing `sanitizeNoteHtml`/schema validation harder on this path, since these don't guarantee schema match the way Groq's strict mode or Gemini's `responseSchema` do.
5. Whichever fallback fires, **log which provider actually answered** (already have `recordActivity`/`logger` conventions in this codebase) so real-world quota pressure is visible before it becomes a support ticket.
6. Re-verify every **[unverified]** number in this report against the live console for whichever 1–2 fallback providers you actually choose, before writing them into rate-limit-aware retry/backoff logic — don't hardcode approximate numbers from this report as production constants.

---

## Sources (all fetched/cross-referenced 2026-08-06)

- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/billing
- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/quick_start/rate_limit
- https://api-docs.deepseek.com/guides/json_mode/
- https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output
- https://help.aliyun.com/zh/model-studio/getting-started/models
- https://docs.z.ai/guides/capabilities/struct-output
- https://bigmodel.cn/pricing
- https://platform.kimi.ai/docs/api/chat (secondary/cache only)
- https://openrouter.ai/docs/api-reference/limits
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/structured-outputs
- https://www.cerebras.ai/pricing
- https://docs.mistral.ai/admin/user-management-finops/tier
- https://huggingface.co/docs/inference-providers/pricing
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://docs.github.com/en/github-models/prototyping-with-ai-models
- build.nvidia.com (fetch failed — secondary sources only)
