import { useEffect, useState } from "react";
import api from "../services/api";
import type { AiApp, AiPolicy } from "../vendor/nga-access";

/**
 * The school AI policy (backend routes/aiPolicy.ts, AI_USAGE_CONTROL_PLAN.md §4):
 * the super admin's master switch, per-app switches and assessment rules. Every
 * AI button can pre-check it to explain itself instead of failing.
 */

export type { AiApp, AiPolicy };

export interface AiPolicyView {
  policy: AiPolicy;
  me: { hasAiUse: boolean; canManage: boolean };
  /** Who made the last change (super admins only). */
  updatedByName?: string | null;
}

type Envelope<T> = { success: boolean; message?: string; code?: string; data: T };

export const aiPolicyApi = {
  get: () => api.get<Envelope<AiPolicyView>>("/ai-policy"),
  save: (patch: Partial<Pick<AiPolicy, "enabled" | "apps" | "features" | "assessments" | "thirdPartyExtensions">>) =>
    api.put<Envelope<{ policy: AiPolicy; updatedByName: string | null }>>("/ai-policy", patch),
};

/** The message shown wherever an AI feature is off for the whole school. */
export const AI_OFF_MESSAGE = "AI is turned off for the school.";

/** Why AI is unavailable to this user in `app`, or null when it is available. */
export function aiUnavailableReason(view: AiPolicyView | null, app: AiApp = "mis"): string | null {
  if (!view) return null; // unknown: let the server decide
  if (!view.policy.enabled) return AI_OFF_MESSAGE;
  if (view.policy.apps[app] === false) return "AI is turned off in this app.";
  if (!view.me.hasAiUse) return "Your role does not include AI tools.";
  return null;
}

// One shared fetch per 30 s for every component on the page.
let cached: { at: number; value: AiPolicyView } | null = null;
let inflight: Promise<AiPolicyView | null> | null = null;

export async function loadAiPolicy(force = false): Promise<AiPolicyView | null> {
  if (!force && cached && Date.now() - cached.at < 30_000) return cached.value;
  inflight ??= aiPolicyApi
    .get()
    .then((r) => {
      cached = { at: Date.now(), value: r.data.data };
      return cached.value;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const rememberAiPolicy = (value: AiPolicyView) => {
  cached = { at: Date.now(), value };
};

/** The policy as this user sees it (null while loading or when it can't be read). */
export function useAiPolicy(): AiPolicyView | null {
  const [view, setView] = useState<AiPolicyView | null>(cached?.value ?? null);
  useEffect(() => {
    let live = true;
    void loadAiPolicy().then((v) => live && setView(v));
    return () => {
      live = false;
    };
  }, []);
  return view;
}
