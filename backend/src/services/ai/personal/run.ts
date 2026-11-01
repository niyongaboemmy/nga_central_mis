import type { AiPersonalReason } from "../../../vendor/nga-access";
import type { ProviderCredential } from "../../aiProviders/types";
import { PersonalAIError, type PersonalAIErrorCode } from "../../aiProviders/errors";
import { noteCredentialFailure, touchCredential } from "./credentials";
import { resolvePersonal, type PersonalCallContext, type PersonalWho } from "./routes";

/**
 * Which AI answered, for the "via …" chip (PERSONAL_AI_PROVIDERS_PLAN.md §9.3). Returned by
 * every MIS AI endpoint as `ai` and by the gateway to the other apps.
 */
export interface AiRouteMeta {
  /** "handoff": the person pasted the answer from their own Claude/ChatGPT. */
  route: "personal" | "school" | "handoff";
  reason: AiPersonalReason | "HANDOFF";
  provider?: string;
  model?: string;
  credentialId?: number;
  label?: string;
  /** The user's key failed and the school's AI answered instead. */
  fallbackFrom?: PersonalAIErrorCode;
  /** The user's key was skipped because a daily limit was reached. */
  skipped?: "DAILY_CAP" | "STUDENT_CAP";
}

export type PersonalCredential = ProviderCredential & { provider: string; credentialId: number };

/**
 * Run one AI call on the user's own key when their routes say so, else on the school's AI.
 * A failed personal call marks the key, then falls back to the school's AI only when both
 * the policy and the user's route allow it; otherwise the PersonalAIError reaches the caller.
 */
export async function withPersonalAi<T>(
  who: PersonalWho | null,
  ctx: PersonalCallContext,
  run: { personal: (c: PersonalCredential) => Promise<T>; school: () => Promise<T> },
  meta: (r: T) => { provider?: string; model?: string } = () => ({}),
): Promise<{ result: T; ai: AiRouteMeta }> {
  const resolved = who ? await resolvePersonal(who, ctx) : null;
  const cred = resolved?.credential;
  if (!cred) {
    const result = await run.school();
    return { result, ai: { route: "school", reason: resolved?.decision.reason ?? "NO_ROUTE", skipped: resolved?.skipped, ...meta(result) } };
  }
  try {
    const result = await run.personal({
      provider: cred.provider,
      apiKey: cred.apiKey,
      baseUrl: cred.baseUrl ?? undefined,
      model: cred.model,
      freeOnly: cred.freeOnly,
      credentialId: cred.id,
    });
    touchCredential(cred.id);
    return { result, ai: { route: "personal", reason: "PERSONAL", credentialId: cred.id, label: cred.label, provider: cred.provider, model: cred.model, ...meta(result) } };
  } catch (e) {
    if (!(e instanceof PersonalAIError)) throw e;
    await noteCredentialFailure(cred.id, e.code);
    if (!resolved!.decision.fallbackToSchool) throw e;
    const result = await run.school();
    return { result, ai: { route: "school", reason: "KEY_NOT_ACTIVE", fallbackFrom: e.code, credentialId: cred.id, label: cred.label, ...meta(result) } };
  }
}
