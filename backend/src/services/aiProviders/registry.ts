import { AIProvider, AIRole } from "./types";
import { geminiProvider } from "./geminiProvider";
import { groqProvider } from "./groqProvider";
import { glmProvider } from "./glmProvider";
import { openaiProvider } from "./openaiProvider";
import { deepseekProvider } from "./deepseekProvider";
import { openrouterProvider } from "./openrouterProvider";

const ALL_PROVIDERS: Record<string, AIProvider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  glm: glmProvider,
  openai: openaiProvider,
  deepseek: deepseekProvider,
  openrouter: openrouterProvider,
};

const DEFAULT_ORDER = "gemini,groq,deepseek,openrouter,glm";

/**
 * Providers to try, in order. Defaults to AI_PROVIDER_ORDER (comma-separated env var,
 * falling back to DEFAULT_ORDER) — pass `overrideOrder` only when a specific feature has
 * a genuine reason to prefer a different provider first (e.g. one provider is measurably
 * better at a particular task), which still falls through to the rest of the configured
 * providers rather than being limited to just the override.
 */
export function orderedProviders(overrideOrder?: string[]): AIProvider[] {
  if (testProviders) {
    const names = overrideOrder?.filter((n) => testProviders![n]) ?? [];
    return (names.length ? names : Object.keys(testProviders)).map((n) => testProviders![n]);
  }
  const names = (overrideOrder ?? (process.env.AI_PROVIDER_ORDER || DEFAULT_ORDER).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  return names.map((name) => ALL_PROVIDERS[name]).filter((p): p is AIProvider => !!p);
}

/**
 * The free tiers each have a strength (LESSON_STUDIO plan §7.2): GLM-4.5-Flash has no small
 * daily cap and handles long output, so it drafts lessons; Groq's gpt-oss has strict
 * json_schema, so it writes questions; Gemini's ~20 free requests/day are the backup.
 * OpenRouter's free models (50 requests/day without credits) are the last resort.
 * OpenAI is in no default order (no AI budget, decision D2) but still works if listed in
 * AI_ROLE_ORDER_<ROLE> or AI_PROVIDER_ORDER. "interactive" keeps the school's existing order.
 */
const DEFAULT_ROLE_ORDERS: Record<Exclude<AIRole, "interactive">, string> = {
  draft: "glm,gemini,groq,openrouter",
  assess: "groq,gemini,glm,openrouter",
  verify: "groq,glm,gemini,openrouter",
  repair: "groq,glm,gemini,openrouter",
};

export function roleOrder(role?: AIRole): string[] | undefined {
  if (!role || role === "interactive") return undefined;
  const raw = process.env[`AI_ROLE_ORDER_${role.toUpperCase()}`] || DEFAULT_ROLE_ORDERS[role];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// --- Test seam -----------------------------------------------------------------------
// vi.mock() of this module is unreliable with vitest's isolate:false (another file may
// have imported the real module first, and the "mocked" test then calls a real provider).
// Tests install deterministic providers here instead; never used outside NODE_ENV=test.
let testProviders: Record<string, AIProvider> | null = null;

export function setTestProviders(providers: Record<string, AIProvider> | null): void {
  if (providers && process.env.NODE_ENV !== "test") throw new Error("setTestProviders is for tests only");
  testProviders = providers;
  cooldownUntil.clear();
  deadUntil.clear();
}

export function isAnyProviderConfigured(): boolean {
  return orderedProviders().some((p) => p.isConfigured());
}

// --- Cooldown / circuit breaker ---------------------------------------------------
// A provider that just returned a quota/rate-limit error is skipped for COOLDOWN_MS
// rather than retried every request — daily/per-minute quotas do reset, so this is a
// temporary skip, not a permanent disable. In-memory only, same pattern as
// aiNotesJobStore's job map (acceptable to reset on process restart).
const COOLDOWN_MS = 5 * 60 * 1000;
const cooldownUntil = new Map<string, number>();

export function isCoolingDown(providerName: string): boolean {
  const until = cooldownUntil.get(providerName);
  return !!until && until > Date.now();
}

export function markCoolingDown(providerName: string, ms: number = COOLDOWN_MS): void {
  cooldownUntil.set(providerName, Date.now() + ms);
}

// A dead key / billing-required account is parked for an hour (see isDeadProviderError).
const DEAD_PARK_MS = 60 * 60 * 1000;
const deadUntil = new Map<string, number>();

export function isParkedDead(providerName: string): boolean {
  const until = deadUntil.get(providerName);
  return !!until && until > Date.now();
}

export function markDead(providerName: string, ms: number = DEAD_PARK_MS): void {
  deadUntil.set(providerName, Date.now() + ms);
}
