import { ServiceUnavailableError } from "../../errors/CustomError";
import logger from "../../utils/logger";
import { AIRole, GenerateJSONParams, TokenUsage } from "./types";
import { orderedProviders, isCoolingDown, markCoolingDown, isParkedDead, markDead, roleOrder } from "./registry";
import { isQuotaError, isDeadProviderError, friendlyAIErrorMessage, classifyAIError } from "./errors";
import { acquireSlot, checkAvailability, noteAttempt, Unavailable } from "./limiter";
import { logAIUsage } from "./usageLog";

export interface GenerateStructuredContentResult<T> {
  data: T;
  providerUsed: string;
  model?: string;
  usage?: TokenUsage;
}

export interface GenerateStructuredContentOptions {
  /** Try these providers, in this order, instead of AI_PROVIDER_ORDER — see orderedProviders(). */
  providerOrder?: string[];
  /** What the call is for; picks the provider order when providerOrder isn't given (registry.roleOrder). */
  role?: AIRole;
  /** Never use these providers for this call (e.g. a verifier must not be the drafter). */
  excludeProviders?: string[];
  /**
   * Bulk work (whole-term generation) may not use the share of each daily free quota kept
   * for interactive calls, and is skipped rather than queued behind a busy provider.
   */
  bulk?: boolean;
  /** Logging context for AIUsageLog. */
  feature?: string;
  actorUserId?: number | null;
  courseId?: number | null;
  runId?: number | null;
}

/**
 * Thrown when no provider can take the call because every free quota is used up (or held in
 * reserve). Distinct from a generic failure so bulk generation can pause and resume later
 * instead of marking work as failed. Still a 503 for HTTP callers.
 */
export class AIQuotaExhaustedError extends ServiceUnavailableError {
  readonly code = "AI_QUOTA_EXHAUSTED";
  constructor(readonly reasons: Record<string, Unavailable | "QUOTA">) {
    super("Today's free AI quota is used up. Please try again later.");
  }
}

/**
 * Tries each configured provider in order (role order, explicit order, or AI_PROVIDER_ORDER),
 * skipping any that is cooling down, parked as dead, excluded, or out of free quota. Returns
 * the first success. Every attempt is logged to AIUsageLog (fire-and-forget).
 */
export async function generateStructuredContent<T = any>(
  params: GenerateJSONParams,
  options?: GenerateStructuredContentOptions,
): Promise<GenerateStructuredContentResult<T>> {
  const providers = orderedProviders(options?.providerOrder ?? roleOrder(options?.role));
  const exclude = new Set(options?.excludeProviders ?? []);
  const quotaBlocked: Record<string, Unavailable | "QUOTA"> = {};
  let lastErr: any = null;
  let attempted = 0;
  let failuresAllQuota = true;

  for (const provider of providers) {
    if (!provider.isConfigured() || exclude.has(provider.name)) continue;
    if (isParkedDead(provider.name)) continue;
    if (isCoolingDown(provider.name)) {
      logger.info(`AI provider ${provider.name} is cooling down, skipping`);
      quotaBlocked[provider.name] = "QUOTA";
      continue;
    }
    const unavailable = await checkAvailability(provider.name, !!options?.bulk);
    if (unavailable) {
      quotaBlocked[provider.name] = unavailable;
      continue;
    }

    attempted++;
    const release = await acquireSlot(provider.name);
    const startedAt = new Date();
    noteAttempt(provider.name, startedAt);
    try {
      const result = await provider.generateJSON<T>(params);
      logAIUsage({
        feature: options?.feature ?? params.schemaName ?? "unknown",
        role: options?.role ?? null,
        bulk: options?.bulk,
        provider: provider.name,
        model: result.model,
        ok: true,
        latency_ms: Date.now() - startedAt.getTime(),
        input_tokens: result.usage?.input_tokens ?? null,
        output_tokens: result.usage?.output_tokens ?? null,
        actor_user_id: options?.actorUserId ?? null,
        course_id: options?.courseId ?? null,
        run_id: options?.runId ?? null,
        occurred_at: startedAt,
      });
      return { data: result.data, providerUsed: provider.name, model: result.model, usage: result.usage };
    } catch (err: any) {
      lastErr = err;
      const errorClass = classifyAIError(err);
      logger.warn(`AI provider ${provider.name} failed`, { error: err?.message, class: errorClass });
      logAIUsage({
        feature: options?.feature ?? params.schemaName ?? "unknown",
        role: options?.role ?? null,
        bulk: options?.bulk,
        provider: provider.name,
        ok: false,
        error_class: errorClass,
        latency_ms: Date.now() - startedAt.getTime(),
        actor_user_id: options?.actorUserId ?? null,
        course_id: options?.courseId ?? null,
        run_id: options?.runId ?? null,
        occurred_at: startedAt,
      });
      if (isDeadProviderError(err)) {
        markDead(provider.name);
        failuresAllQuota = false;
      } else if (isQuotaError(err)) {
        markCoolingDown(provider.name);
        quotaBlocked[provider.name] = "QUOTA";
      } else {
        failuresAllQuota = false;
      }
    } finally {
      release();
    }
  }

  const blocked = Object.keys(quotaBlocked).length > 0;
  if (attempted === 0 && blocked) throw new AIQuotaExhaustedError(quotaBlocked);
  if (attempted === 0) {
    throw new ServiceUnavailableError(
      "AI generation is not configured. Add an API key for at least one AI provider to the backend environment.",
    );
  }
  if (failuresAllQuota && blocked) throw new AIQuotaExhaustedError(quotaBlocked);
  throw new ServiceUnavailableError(friendlyAIErrorMessage(lastErr));
}
