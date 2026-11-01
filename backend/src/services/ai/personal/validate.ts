import type { AiProviderId } from "../../../vendor/nga-access";
import { PROVIDERS } from "./providers";
import { safeFetch, UnsafeUrlError } from "./safeFetch";

/**
 * Is this key alive, and what can it do? One cheap read call per provider, never a
 * generation (PERSONAL_AI_PROVIDERS_PLAN.md §7.2). Messages are written for people and
 * never contain the key.
 */
export type CredentialStatus = "active" | "invalid" | "no_credit" | "rate_limited" | "unreachable" | "disabled";

export interface ValidationResult {
  status: CredentialStatus;
  detail: string | null;
  models: string[];
  balance: Record<string, unknown> | null;
}

const TIMEOUT_MS = 10_000;

/** Tests swap the network out. */
let fetchImpl: typeof fetch = (...a) => fetch(...a);
export function setValidationFetch(f: typeof fetch | null) {
  fetchImpl = f ?? ((...a) => fetch(...a));
}

function fromStatus(status: number): CredentialStatus {
  if (status === 401 || status === 403) return "invalid";
  if (status === 402) return "no_credit";
  if (status === 429) return "rate_limited";
  return "unreachable";
}

const DETAIL: Record<CredentialStatus, string | null> = {
  active: null,
  invalid: "The provider refused this key. Check that it was copied whole and has not been revoked.",
  no_credit: "The key works but the account has no credit.",
  rate_limited: "The key works but is rate-limited right now.",
  unreachable: "The provider could not be reached. Try again in a moment.",
  disabled: "Turned off.",
};

const ids = (body: any): string[] =>
  (Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [])
    .map((m: any) => String(m?.id ?? m?.name ?? "").replace(/^models\//, ""))
    .filter(Boolean)
    .slice(0, 2000);

async function getJson(url: string, headers: Record<string, string>, viaSafeFetch = false) {
  const f = viaSafeFetch ? (safeFetch as typeof fetch) : fetchImpl;
  const res = await f(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "manual" } as RequestInit);
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body };
}

export async function validateKey(provider: AiProviderId, apiKey: string, baseUrl?: string | null): Promise<ValidationResult> {
  const info = PROVIDERS[provider];
  const done = (status: CredentialStatus, models: string[] = [], balance: Record<string, unknown> | null = null, detail?: string): ValidationResult => ({
    status,
    detail: detail ?? DETAIL[status],
    models,
    balance,
  });
  try {
    if (provider === "anthropic") {
      const r = await getJson(`${info.baseUrl}/models?limit=1000`, { "x-api-key": apiKey, "anthropic-version": "2023-06-01" });
      return r.ok ? done("active", ids(r.body)) : done(fromStatus(r.status));
    }
    if (provider === "gemini") {
      const r = await getJson(`${info.baseUrl}/v1beta/models?pageSize=1000`, { "x-goog-api-key": apiKey });
      // Gemini answers a bad key with 400 API_KEY_INVALID.
      if (r.status === 400 && /API_KEY_INVALID|API key not valid/i.test(JSON.stringify(r.body ?? ""))) return done("invalid");
      return r.ok ? done("active", ids(r.body)) : done(fromStatus(r.status));
    }
    if (provider === "openrouter") {
      const r = await getJson(`${info.baseUrl}/key`, { authorization: `Bearer ${apiKey}` });
      if (!r.ok) return done(fromStatus(r.status));
      const d = r.body?.data ?? {};
      const balance = {
        limit: d.limit ?? null,
        limit_remaining: d.limit_remaining ?? null,
        usage: d.usage ?? null,
        is_free_tier: d.is_free_tier ?? null,
      };
      const m = await getJson(`${info.baseUrl}/models`, { authorization: `Bearer ${apiKey}` }).catch(() => null);
      const noCredit = typeof d.limit_remaining === "number" && d.limit_remaining <= 0 && d.is_free_tier === false;
      return done(noCredit ? "no_credit" : "active", m?.ok ? ids(m.body) : [], balance);
    }
    if (provider === "deepseek") {
      const r = await getJson(`${info.baseUrl}/user/balance`, { authorization: `Bearer ${apiKey}` });
      if (!r.ok) return done(fromStatus(r.status));
      const balance = { is_available: r.body?.is_available ?? null, balance_infos: r.body?.balance_infos ?? [] };
      const m = await getJson(`${info.baseUrl}/models`, { authorization: `Bearer ${apiKey}` }).catch(() => null);
      return done(r.body?.is_available === false ? "no_credit" : "active", m?.ok ? ids(m.body) : [], balance);
    }
    const base = provider === "custom" ? String(baseUrl ?? "").replace(/\/+$/, "") : info.baseUrl;
    if (!base) return done("unreachable", [], null, "Enter the endpoint address.");
    const r = await getJson(`${base}/models`, { authorization: `Bearer ${apiKey}` }, provider === "custom");
    return r.ok ? done("active", ids(r.body)) : done(fromStatus(r.status));
  } catch (e: any) {
    if (e instanceof UnsafeUrlError || e?.code === "UNSAFE_URL") return done("unreachable", [], null, e.message);
    return done("unreachable");
  }
}
