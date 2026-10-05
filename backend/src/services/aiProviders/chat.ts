import OpenAI from "openai";
import logger from "../../utils/logger";
import { classifyAIError, isDeadProviderError, isQuotaError } from "./errors";
import { acquireSlot, checkAvailability, noteAttempt } from "./limiter";
import { isCoolingDown, isParkedDead, markCoolingDown, markDead } from "./registry";
import { logAIUsage } from "./usageLog";
import { freeModels, isFreeModel } from "./openrouterProvider";

/**
 * Streaming chat on the providers MIS already has keys for (NGA Desktop "Ask AI";
 * docs/TOOLS_HUB_IMPLEMENTATION_PLAN.md §5.6–5.7).
 *
 * The structured-JSON providers in this folder can't chat, so this talks to each
 * vendor's OpenAI-compatible chat endpoint directly. Gemini included, through its
 * /v1beta/openai endpoint. It keeps the same rules as generateStructuredContent:
 * provider order, the per-provider limiter and its interactive reserve, cooldown on
 * quota errors, parking dead providers, and one AIUsageLog row per attempt.
 *
 * **Audience.** Several free tiers' terms are 18+ (Gemini API, Groq, OpenRouter
 * since 2026-09), so a `minor` conversation only reaches providers whose terms allow
 * minors (`allowsMinors`). Today that is GLM (Z.ai) alone.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatAudience = "adult" | "minor";

interface ChatTarget {
  name: string;
  allowsMinors: boolean;
  isConfigured(): boolean;
  baseURL(): string;
  apiKey(): string | undefined;
  /** Models to ask for, first choice first. */
  models(): string[];
  /** Vendor-specific request fields. */
  extra?: () => Record<string, unknown>;
  /** Refuse a reply the account would be charged for (OpenRouter). */
  check?: (chunk: any) => void;
}

const env = (k: string) => (process.env[k] || "").trim();

export const CHAT_TARGETS: Record<string, ChatTarget> = {
  groq: {
    name: "groq",
    allowsMinors: false,
    isConfigured: () => !!env("GROQ_API_KEY"),
    baseURL: () => "https://api.groq.com/openai/v1",
    apiKey: () => env("GROQ_API_KEY"),
    models: () => [env("GROQ_CHAT_MODEL") || "openai/gpt-oss-120b"],
    extra: () => ({ reasoning_effort: "low" }),
  },
  gemini: {
    name: "gemini",
    allowsMinors: false,
    isConfigured: () => !!env("GEMINI_API_KEY") && env("GEMINI_API_KEY") !== "your_gemini_api_key_here",
    baseURL: () => "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: () => env("GEMINI_API_KEY"),
    models: () => [env("GEMINI_CHAT_MODEL") || "gemini-2.5-flash-lite"],
  },
  glm: {
    name: "glm",
    allowsMinors: true,
    isConfigured: () => !!env("GLM_API_KEY"),
    baseURL: () => "https://api.z.ai/api/paas/v4",
    apiKey: () => env("GLM_API_KEY"),
    models: () => [env("GLM_CHAT_MODEL") || env("GLM_MODEL") || "glm-4.5-flash"],
    extra: () => ({ thinking: { type: "disabled" } }),
  },
  openrouter: {
    name: "openrouter",
    allowsMinors: false,
    isConfigured: () => !!env("OPENROUTER_API_KEY"),
    baseURL: () => env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1",
    apiKey: () => env("OPENROUTER_API_KEY"),
    models: () => freeModels(),
    extra: () => ({ models: freeModels() }),
    check: (chunk) => {
      if (chunk?.model && !isFreeModel(String(chunk.model))) throw Object.assign(new Error("OpenRouter served a paid model"), { status: 402 });
    },
  },
  deepseek: {
    name: "deepseek",
    allowsMinors: false,
    isConfigured: () => !!env("DEEPSEEK_API_KEY"),
    baseURL: () => env("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
    apiKey: () => env("DEEPSEEK_API_KEY"),
    models: () => [env("DEEPSEEK_MODEL") || "deepseek-chat"],
  },
};

/** Default chat orders (comma lists; env AI_CHAT_ORDER_ADULT / _MINOR override). */
export const DEFAULT_CHAT_ORDER: Record<ChatAudience, string> = {
  adult: "groq,gemini,glm,openrouter,deepseek",
  minor: "glm",
};

/** Providers to try for this audience, in order. Minors never reach an 18+ provider, whatever the env says. */
export function chatOrder(audience: ChatAudience): ChatTarget[] {
  const raw = env(`AI_CHAT_ORDER_${audience.toUpperCase()}`) || DEFAULT_CHAT_ORDER[audience];
  return raw
    .split(",")
    .map((s) => CHAT_TARGETS[s.trim()])
    .filter((t): t is ChatTarget => !!t && (audience === "adult" || t.allowsMinors));
}

/** Character limits keep prompts inside free-tier token budgets. */
export const LIMITS = { messages: 20, perMessage: 8000, total: 24000, maxOutputTokens: 1600 };

/** The last messages that fit, alternating roles, ending with the user's. Throws on bad input. */
export function trimConversation(input: unknown): ChatMessage[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("No message");
  const clean = input
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, LIMITS.perMessage) }) as ChatMessage)
    .filter((m) => m.content.trim());
  if (!clean.length || clean[clean.length - 1].role !== "user") throw new Error("The last message must be yours");
  const out: ChatMessage[] = [];
  let total = 0;
  for (let i = clean.length - 1; i >= 0 && out.length < LIMITS.messages; i--) {
    total += clean[i].content.length;
    if (total > LIMITS.total && out.length > 0) break;
    out.unshift(clean[i]);
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** Emails and phone numbers never leave MIS (free tiers may keep prompts). */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(?:\+?250|0)\s?7\d(?:[\s-]?\d){7}/g, "[phone]")
    .replace(/\+\d{1,3}(?:[\s-]?\d){7,12}/g, "[phone]");
}

export interface ChatRun {
  provider: string;
  model: string;
}

export class ChatUnavailableError extends Error {
  constructor(public readonly reason: "QUOTA" | "UNCONFIGURED" | "FAILED", message: string) {
    super(message);
  }
}

/** For tests: replace the client factory. */
let makeClient = (t: ChatTarget) => new OpenAI({ apiKey: t.apiKey(), baseURL: t.baseURL(), timeout: 90_000, maxRetries: 0 });
export function setChatClientFactory(f: ((t: ChatTarget) => any) | null) {
  makeClient = f ?? ((t: ChatTarget) => new OpenAI({ apiKey: t.apiKey(), baseURL: t.baseURL(), timeout: 90_000, maxRetries: 0 }));
}

/**
 * Stream a reply. `onText` gets each piece of text. A provider that fails before
 * its first token falls through to the next one; once text has been sent the
 * answer stays with that provider (a mid-answer failure ends it).
 */
export async function streamChat(opts: {
  system: string;
  messages: ChatMessage[];
  audience: ChatAudience;
  actorUserId: number;
  feature: string;
  onText: (text: string) => void;
  signal?: AbortSignal;
}): Promise<ChatRun> {
  const order = chatOrder(opts.audience);
  let attempted = 0;
  let quotaOnly = true;
  let lastErr: any = null;

  for (const t of order) {
    if (!t.isConfigured() || isParkedDead(t.name) || isCoolingDown(t.name)) continue;
    if (await checkAvailability(t.name, false)) continue;
    attempted++;
    const release = await acquireSlot(t.name);
    const startedAt = new Date();
    noteAttempt(t.name, startedAt);
    const model = t.models()[0];
    let sent = false;
    let outputChars = 0;
    try {
      const stream: any = await makeClient(t).chat.completions.create(
        {
          model,
          stream: true,
          max_tokens: LIMITS.maxOutputTokens,
          temperature: 0.4,
          messages: [{ role: "system", content: opts.system }, ...opts.messages.map((m) => ({ role: m.role, content: scrub(m.content) }))],
          ...(t.extra?.() ?? {}),
        } as any,
        { signal: opts.signal },
      );
      for await (const chunk of stream) {
        t.check?.(chunk);
        const text = chunk?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) {
          sent = true;
          outputChars += text.length;
          opts.onText(text);
        }
      }
      if (!sent) throw Object.assign(new Error(`${t.name} returned an empty answer`), { status: 502 });
      logAIUsage({ feature: opts.feature, role: "interactive", provider: t.name, model, ok: true, latency_ms: Date.now() - startedAt.getTime(), output_tokens: Math.round(outputChars / 4), actor_user_id: opts.actorUserId, occurred_at: startedAt });
      return { provider: t.name, model };
    } catch (err: any) {
      lastErr = err;
      const cls = opts.signal?.aborted ? "ABORTED" : classifyAIError(err);
      logAIUsage({ feature: opts.feature, role: "interactive", provider: t.name, model, ok: false, error_class: cls, latency_ms: Date.now() - startedAt.getTime(), actor_user_id: opts.actorUserId, occurred_at: startedAt });
      if (opts.signal?.aborted) throw err;
      logger.warn(`[ai-chat] ${t.name} failed`, { error: err?.message, class: cls });
      if (isDeadProviderError(err)) {
        markDead(t.name);
        quotaOnly = false;
      } else if (isQuotaError(err)) {
        markCoolingDown(t.name);
      } else {
        quotaOnly = false;
      }
      // Text already on screen: don't start a second, different answer.
      if (sent) throw new ChatUnavailableError("FAILED", "The answer was cut off. Please try again.");
    } finally {
      release();
    }
  }
  if (attempted === 0 && !order.some((t) => t.isConfigured()))
    throw new ChatUnavailableError("UNCONFIGURED", "No AI provider is configured for this.");
  if (attempted === 0 || quotaOnly)
    throw new ChatUnavailableError("QUOTA", "The free AI services are busy or out of today's quota. Please try again later.");
  logger.warn("[ai-chat] every provider failed", { error: lastErr?.message });
  throw new ChatUnavailableError("FAILED", "The AI couldn't answer right now. Please try again.");
}
