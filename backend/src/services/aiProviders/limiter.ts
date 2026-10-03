import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { AIUsageLog } from "../../db/schema";
import logger from "../../utils/logger";

/**
 * Free-tier quota keeping (LESSON_STUDIO plan §7.3, decision D2: no AI budget).
 *
 * - Daily request limits per provider, counted from AIUsageLog (loaded once per quota day,
 *   then kept in memory — there is one backend process).
 * - A reserve of each daily quota is kept for "interactive" calls (someone is waiting on
 *   them); bulk generation can only use the rest.
 * - A per-minute cap and a small concurrency limit per provider.
 *
 * A provider that is out of quota is skipped *before* calling it, so a 15-week run moves
 * to the next provider without paying a failed round trip each time.
 */

interface ProviderLimits {
  daily: number; // 0 = no limit
  rpm: number; // 0 = no limit
  concurrency: number;
  resetHourUtc: number;
}

// Conservative defaults for the free tiers in use; every value is overridable by env and is
// meant to be set from the real limits of the school's keys (Phase 0).
const DEFAULTS: Record<string, ProviderLimits> = {
  gemini: { daily: 20, rpm: 10, concurrency: 2, resetHourUtc: 8 }, // resets at midnight Pacific
  groq: { daily: 1000, rpm: 30, concurrency: 2, resetHourUtc: 0 },
  glm: { daily: 0, rpm: 0, concurrency: 2, resetHourUtc: 0 },
  openai: { daily: 0, rpm: 0, concurrency: 2, resetHourUtc: 0 },
  // Free models without purchased credits: 50 requests/day, 20/min. Set AI_DAILY_REQUESTS_OPENROUTER=0 once credits are bought.
  openrouter: { daily: 50, rpm: 20, concurrency: 2, resetHourUtc: 0 },
};

const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

export function limitsFor(provider: string): ProviderLimits {
  const d = DEFAULTS[provider] ?? { daily: 0, rpm: 0, concurrency: 2, resetHourUtc: 0 };
  const P = provider.toUpperCase();
  return {
    daily: envInt(`AI_DAILY_REQUESTS_${P}`, d.daily),
    rpm: envInt(`AI_RPM_${P}`, d.rpm),
    concurrency: Math.max(1, envInt(`AI_MAX_CONCURRENCY_${P}`, d.concurrency)),
    resetHourUtc: Math.min(23, envInt(`AI_QUOTA_RESET_UTC_HOUR_${P}`, d.resetHourUtc)),
  };
}

export const interactiveReservePct = (): number => Math.min(90, envInt("AI_INTERACTIVE_RESERVE_PCT", 25));

/** Start of the provider's current quota day. */
export function quotaDayStart(resetHourUtc: number, now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(resetHourUtc, 0, 0, 0);
  if (d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

export function nextQuotaReset(resetHourUtc: number, now = new Date()): Date {
  const start = quotaDayStart(resetHourUtc, now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

interface ProviderState {
  dayStart: number;
  used: number;
  loaded: boolean;
  minute: number[]; // attempt timestamps in the last 60 s
  running: number;
  waiters: Array<() => void>;
}

const state = new Map<string, ProviderState>();

function stateOf(provider: string): ProviderState {
  let s = state.get(provider);
  if (!s) {
    s = { dayStart: 0, used: 0, loaded: false, minute: [], running: 0, waiters: [] };
    state.set(provider, s);
  }
  return s;
}

async function ensureDayLoaded(provider: string, now = new Date()): Promise<ProviderState> {
  const s = stateOf(provider);
  const start = quotaDayStart(limitsFor(provider).resetHourUtc, now).getTime();
  if (s.loaded && s.dayStart === start) return s;
  s.dayStart = start;
  s.used = 0;
  s.loaded = true;
  try {
    const [row] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(AIUsageLog)
      .where(and(eq(AIUsageLog.provider, provider), gte(AIUsageLog.occurred_at, new Date(start))));
    s.used = Number(row?.n ?? 0);
  } catch (error: any) {
    // Missing table (migration not applied) or a DB hiccup: count from zero rather than
    // blocking AI entirely; quota errors from the vendor still cool the provider down.
    if (error?.code !== "ER_NO_SUCH_TABLE") logger.warn("[ai] could not load usage for quota", { provider, error: error?.message });
  }
  return s;
}

export type Unavailable = "DAILY" | "RESERVE" | "RPM";

/** Whether `provider` may take one more call now. Bulk calls must leave the interactive reserve. */
export async function checkAvailability(provider: string, bulk: boolean, now = new Date()): Promise<Unavailable | null> {
  const limits = limitsFor(provider);
  const s = await ensureDayLoaded(provider, now);
  if (limits.daily > 0) {
    if (s.used >= limits.daily) return "DAILY";
    if (bulk) {
      const reserve = Math.ceil((limits.daily * interactiveReservePct()) / 100);
      if (s.used >= limits.daily - reserve) return "RESERVE";
    }
  }
  if (limits.rpm > 0) {
    const cutoff = now.getTime() - 60_000;
    s.minute = s.minute.filter((t) => t > cutoff);
    if (s.minute.length >= limits.rpm) return "RPM";
  }
  return null;
}

/** Counts one attempt against the provider's quotas (call right before the request). */
export function noteAttempt(provider: string, now = new Date()): void {
  const s = stateOf(provider);
  s.used += 1;
  s.minute.push(now.getTime());
}

/** Per-provider concurrency gate. Resolves with a release function. */
export async function acquireSlot(provider: string): Promise<() => void> {
  const s = stateOf(provider);
  const max = limitsFor(provider).concurrency;
  if (s.running >= max) await new Promise<void>((resolve) => s.waiters.push(resolve));
  s.running += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    s.running -= 1;
    const next = s.waiters.shift();
    if (next) next();
  };
}

export interface QuotaSnapshot {
  provider: string;
  daily_limit: number | null;
  used_today: number;
  remaining: number | null;
  bulk_remaining: number | null;
  resets_at: string;
}

/** What is left today, per provider — the Studio estimate and the admin AI panel read this. */
export async function quotaSnapshot(providers: string[], now = new Date()): Promise<QuotaSnapshot[]> {
  const out: QuotaSnapshot[] = [];
  for (const provider of providers) {
    const limits = limitsFor(provider);
    const s = await ensureDayLoaded(provider, now);
    const reserve = limits.daily > 0 ? Math.ceil((limits.daily * interactiveReservePct()) / 100) : 0;
    out.push({
      provider,
      daily_limit: limits.daily > 0 ? limits.daily : null,
      used_today: s.used,
      remaining: limits.daily > 0 ? Math.max(0, limits.daily - s.used) : null,
      bulk_remaining: limits.daily > 0 ? Math.max(0, limits.daily - reserve - s.used) : null,
      resets_at: nextQuotaReset(limits.resetHourUtc, now).toISOString(),
    });
  }
  return out;
}

/** Tests only: forget all counters. */
export function resetLimiterState(): void {
  state.clear();
}
