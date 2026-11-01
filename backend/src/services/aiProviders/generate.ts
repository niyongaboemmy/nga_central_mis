import { ServiceUnavailableError } from "../../errors/CustomError";
import logger from "../../utils/logger";
import { AIRole, GenerateJSONParams, ProviderCredential, TokenUsage } from "./types";
import { providerByName, orderedProviders, isCoolingDown, markCoolingDown, isParkedDead, markDead, roleOrder } from "./registry";
import { isQuotaError, isDeadProviderError, friendlyAIErrorMessage, classifyAIError } from "./errors";
import { acquireSlot, checkAvailability, noteAttempt, Unavailable } from "./limiter";
import { logAIUsage } from "./usageLog";
import { assertAiAppEnabled } from "../ai/policy";
import type { AiApp } from "../../vendor/nga-access";

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
  /** Whose AI switch applies (school AI policy); default "mis". */
  app?: AiApp;
  /**
   * Answer with this key instead of the school chain (a user's own provider account,
   * PERSONAL_AI_PROVIDERS_PLAN.md §7.1). Only this provider is tried; there is no fallback
   * here, because whether to fall back to School AI is the caller's decision. The school's
   * quotas, cooldowns and dead-key parking are neither consulted nor touched.
   */
  credential?: ProviderCredential & { provider: string; credentialId?: number };
}

export type PersonalAIErrorCode = "AI_KEY_INVALID" | "AI_KEY_NO_CREDIT" | "AI_KEY_RATE_LIMITED" | "AI_PERSONAL_FAILED";

const PERSONAL_AI_MESSAGES: Record<PersonalAIErrorCode, string> = {
  AI_KEY_INVALID: "Your AI key was refused by the provider. Check it in My AI.",
  AI_KEY_NO_CREDIT: "Your AI account is out of credit.",
  AI_KEY_RATE_LIMITED: "Your AI account is rate-limited right now. Try again shortly.",
  AI_PERSONAL_FAILED: "Your AI provider could not answer. Please try again.",
};

/** A call on a user's own key failed. The code says why, so the UI can tell them what to fix. */
export class PersonalAIError extends ServiceUnavailableError {
  constructor(readonly code: PersonalAIErrorCode, readonly provider: string) {
    super(PERSONAL_AI_MESSAGES[code]);
  }
}

export function personalAIErrorCode(err: any): PersonalAIErrorCode {
  const raw = [err?.message, err?.error?.message, err?.code, err?.error?.code].filter(Boolean).join(" ");
  if (err?.status === 402 || /insufficient_quota|insufficient (balance|credits)|payment required/i.test(raw)) return "AI_KEY_NO_CREDIT";
  if (isDeadProviderError(err)) return "AI_KEY_INVALID";
  if (isQuotaError(err)) return "AI_KEY_RATE_LIMITED";
  return "AI_PERSONAL_FAILED";
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
  // School AI policy (AI_USAGE_CONTROL_PLAN.md §4.4): nothing reaches a provider while
  // AI is off -- AiDisabledError, a 403 AI_DISABLED, whatever route or job called us.
  await assertAiAppEnabled(options?.app ?? "mis");
  if (options?.credential) return generateWithCredential<T>(params, options, options.credential);
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
        app: options?.app ?? "mis",
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
        app: options?.app ?? "mis",
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

async function generateWithCredential<T>(
  params: GenerateJSONParams,
  options: GenerateStructuredContentOptions,
  credential: NonNullable<GenerateStructuredContentOptions["credential"]>,
): Promise<GenerateStructuredContentResult<T>> {
  const provider = providerByName(credential.provider);
  if (!provider) throw new PersonalAIError("AI_PERSONAL_FAILED", credential.provider);
  const startedAt = new Date();
  const base = {
    feature: options.feature ?? params.schemaName ?? "unknown",
    role: options.role ?? null,
    bulk: options.bulk,
    provider: provider.name,
    actor_user_id: options.actorUserId ?? null,
    course_id: options.courseId ?? null,
    run_id: options.runId ?? null,
    app: options.app ?? "mis",
    route: "personal" as const,
    credential_id: credential.credentialId ?? null,
    occurred_at: startedAt,
  };
  try {
    const result = await provider.generateJSON<T>(params, credential);
    logAIUsage({
      ...base,
      model: result.model,
      ok: true,
      latency_ms: Date.now() - startedAt.getTime(),
      input_tokens: result.usage?.input_tokens ?? null,
      output_tokens: result.usage?.output_tokens ?? null,
    });
    return { data: result.data, providerUsed: provider.name, model: result.model, usage: result.usage };
  } catch (err: any) {
    // The provider's message can echo the key back, so only the class and status are logged.
    const errorClass = classifyAIError(err);
    logger.warn(`Personal AI key (${provider.name}) failed`, { class: errorClass, status: err?.status });
    logAIUsage({ ...base, model: credential.model ?? null, ok: false, error_class: errorClass, latency_ms: Date.now() - startedAt.getTime() });
    throw new PersonalAIError(personalAIErrorCode(err), provider.name);
  }
}
