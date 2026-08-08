import { AIProvider } from "./types";
import { geminiProvider } from "./geminiProvider";
import { groqProvider } from "./groqProvider";
import { glmProvider } from "./glmProvider";

const ALL_PROVIDERS: Record<string, AIProvider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  glm: glmProvider,
};

const DEFAULT_ORDER = "gemini,groq,glm";

/** Providers to try, in order, per AI_PROVIDER_ORDER (comma-separated env var). */
export function orderedProviders(): AIProvider[] {
  const names = (process.env.AI_PROVIDER_ORDER || DEFAULT_ORDER)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return names.map((name) => ALL_PROVIDERS[name]).filter((p): p is AIProvider => !!p);
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
