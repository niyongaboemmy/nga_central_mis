import api from "../services/api";
import type { AiPersonalApp, AiPersonalReason, AiPersonalRoute, AiProviderId, AiTask } from "../vendor/nga-access";

/**
 * My AI (backend routes/myAi.ts, PERSONAL_AI_PROVIDERS_PLAN.md §9-§10): a person's own AI
 * provider keys and which of them answers what. Keys go up once and never come back:
 * every credential here is the public view (label, last 4 characters, health).
 */

export type { AiPersonalApp, AiPersonalRoute, AiProviderId, AiTask };

type Envelope<T> = { success: boolean; message?: string; code?: string; data: T };

export type CredentialStatus = "active" | "invalid" | "no_credit" | "rate_limited" | "unreachable" | "disabled";

export interface MyAiCredential {
  id: number;
  provider: AiProviderId;
  providerLabel: string;
  authType: string;
  label: string;
  baseUrl: string | null;
  keyHint: string;
  status: CredentialStatus;
  statusDetail: string | null;
  allowedApps: AiPersonalApp[];
  dailyRequestCap: number | null;
  freeOnly: boolean;
  models: string[];
  balance: Record<string, unknown> | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface MyAiProvider {
  id: AiProviderId;
  label: string;
  keyUrl: string;
  keySteps: string[];
  freeTier: boolean;
  oauth: "openrouter" | null;
  privacyNote: string;
  defaultModel: string;
  allowed: boolean;
  blockedReason: string | null;
}

export interface MyAiView {
  /** Set when this person can't use My AI now; its message replaces the page. */
  blocked: { code: string; message: string } | null;
  me: { isStudent: boolean; hasPersonalCap: boolean };
  policy: { fallbackToSchool: boolean; inAssessments: "never" | "allowed"; studentDailyLimit: number | null };
  apps: AiPersonalApp[];
  tasks: AiTask[];
  providers: MyAiProvider[];
  credentials: MyAiCredential[];
  routes: AiPersonalRoute[];
  catalogDate: string;
}

/** One model a key can use for a task. Catalogue facts are absent for models it doesn't know. */
export interface MyAiModel {
  id: string;
  name: string;
  json?: boolean;
  tools?: boolean;
  vision?: boolean;
  reasoning?: boolean;
  context?: number | null;
  output?: number | null;
  /** USD per 1M tokens. */
  cost_in?: number | null;
  cost_out?: number | null;
  free?: boolean;
  released?: string | null;
  unknown?: true;
}

export interface ResolvedTask {
  route: "personal" | "school";
  reason: AiPersonalReason;
  credentialId?: number;
  provider?: AiProviderId;
  model?: string;
  label?: string;
  fallbackToSchool?: boolean;
}

export interface MyAiResolved {
  v: number;
  policyV: number;
  enabled: boolean;
  byTask: Record<AiTask, ResolvedTask>;
  choices: Array<{ credentialId: number; provider: AiProviderId; model: string; label?: string }>;
}

export interface RouteInput {
  app: AiPersonalApp | "*";
  task: AiTask | "*";
  credentialId: number;
  model: string;
  fallback: "school" | "none";
}

export interface CredentialInput {
  provider?: AiProviderId;
  apiKey?: string;
  label?: string;
  baseUrl?: string;
  allowedApps?: AiPersonalApp[];
  dailyRequestCap?: number | null;
  freeOnly?: boolean;
}

export type PlaygroundSide =
  | { ok: true; text: string; provider: string; model: string; ms: number; estCostUsd: number | null }
  | { ok: false; error: { code: string; message: string }; ms: number };

export interface MyAiUsage {
  days: number;
  byRoute: Array<{ app: string; route: string | null; calls: number; failures: number }>;
  byProvider: Array<{ provider: string; route: string | null; calls: number; failures: number; tokens: number }>;
  keys: Array<{ provider: string; status: string; count: number }>;
  peopleWithKeys: number;
  schoolQuotas: Array<{ provider: string; daily_limit: number | null; used_today: number; remaining: number | null; bulk_remaining: number | null; resets_at: string }>;
  vaultConfigured: boolean;
}

/**
 * Which AI answered one request (every MIS AI endpoint returns it as `ai`): the person's own
 * key, or the school's AI, maybe because their key failed (`fallbackFrom`).
 */
export interface AiRouteMeta {
  /** "handoff": the person pasted their own AI's answer ("Paste the answer"). */
  route: "personal" | "school" | "handoff";
  reason?: AiPersonalReason;
  provider?: string;
  model?: string;
  credentialId?: number;
  label?: string;
  fallbackFrom?: string;
  skipped?: "DAILY_CAP" | "STUDENT_CAP";
}

/** "What a key really costs": a heavy month of school work on each headline model. */
export interface MyAiCosts {
  month: { inputTokens: number; outputTokens: number };
  catalogDate: string;
  models: Array<{ provider: AiProviderId; providerLabel: string; model: string; name: string; cost_in: number; cost_out: number; monthlyUsd: number }>;
}

// Validation calls the provider (up to 10 s) and the playground runs two generations.
const SLOW = { timeout: 30_000 };
const PLAYGROUND = { timeout: 120_000 };

export const myAiApi = {
  get: () => api.get<Envelope<MyAiView>>("/my-ai"),
  resolved: () => api.get<Envelope<MyAiResolved>>("/my-ai/resolved"),
  create: (input: CredentialInput) => api.post<Envelope<MyAiCredential>>("/my-ai/credentials", input, SLOW),
  update: (id: number, input: CredentialInput) => api.patch<Envelope<MyAiCredential>>(`/my-ai/credentials/${id}`, input, SLOW),
  remove: (id: number) => api.delete<{ success: boolean }>(`/my-ai/credentials/${id}`),
  test: (id: number) => api.post<Envelope<MyAiCredential>>(`/my-ai/credentials/${id}/test`, {}, SLOW),
  models: (id: number, task?: AiTask | "*") =>
    api.get<Envelope<MyAiModel[]>>(`/my-ai/credentials/${id}/models`, { params: task && task !== "*" ? { task } : undefined }),
  saveRoutes: (routes: RouteInput[]) => api.put<Envelope<AiPersonalRoute[]>>("/my-ai/routes", { routes }),
  playground: (body: { prompt: string; credentialId: number; model?: string }) =>
    api.post<Envelope<{ school: PlaygroundSide; mine: PlaygroundSide }>>("/my-ai/playground", body, PLAYGROUND),
  openRouterStart: (callbackUrl: string) => api.post<Envelope<{ url: string }>>("/my-ai/oauth/openrouter/start", { callbackUrl }),
  openRouterComplete: (body: { code: string; state: string; freeOnly?: boolean }) =>
    api.post<Envelope<MyAiCredential>>("/my-ai/oauth/openrouter/complete", body, SLOW),
  costs: () => api.get<Envelope<MyAiCosts>>("/my-ai/costs"),
  adminUsage: (days = 30) => api.get<Envelope<MyAiUsage>>("/my-ai/admin/usage", { params: { days } }),
};

/** The server's message for a failed call, or `fallback`. */
export const errorMessage = (e: any, fallback: string): string => e?.response?.data?.message || fallback;

// ---------------------------------------------------------------------------------------
// Labels shared by the My AI page, the wizard and the in-panel source control.

export const TASK_LABELS: Record<AiTask, { name: string; hint: string }> = {
  author: { name: "Writing & generators", hint: "Lesson notes, plans, schemes, questions, rubrics" },
  assist: { name: "Chat & questions", hint: "Ask AI, tutors, SQL helper, insights" },
  translate: { name: "Translate", hint: "Translating messages and pages" },
  hint: { name: "Hints", hint: "Step-by-step hints for learners" },
  complete: { name: "Code completion", hint: "Inline suggestions while you type code" },
};

/** Rows of the matrix, in the order people think about them. */
export const TASK_ORDER: AiTask[] = ["author", "assist", "translate", "hint", "complete"];

export const APP_LABELS: Record<AiPersonalApp, string> = { mis: "MIS", tm: "Task Mentor", tupo: "Tupo", da: "Tendo" };

export const STATUS_META: Record<CredentialStatus, { label: string; dot: string; text: string }> = {
  active: { label: "Active", dot: "bg-emerald-500", text: "text-emerald-800 dark:text-emerald-200" },
  no_credit: { label: "Out of credit", dot: "bg-amber-500", text: "text-amber-900 dark:text-amber-100" },
  invalid: { label: "Invalid key", dot: "bg-rose-500", text: "text-rose-800 dark:text-rose-200" },
  rate_limited: { label: "Rate-limited", dot: "bg-amber-500", text: "text-amber-900 dark:text-amber-100" },
  unreachable: { label: "Unreachable", dot: "bg-slate-400", text: "text-slate-700 dark:text-gray-200" },
  disabled: { label: "Turned off", dot: "bg-slate-400", text: "text-slate-700 dark:text-gray-200" },
};

/** "$0.15 in · $0.60 out per 1M tokens", or null when the catalogue has no price. */
export function modelPrice(m: MyAiModel): string | null {
  if (m.free) return null;
  if (m.cost_in == null || m.cost_out == null) return null;
  const f = (n: number) => `$${n.toFixed(2)}`;
  return `${f(m.cost_in)} in · ${f(m.cost_out)} out per 1M tokens`;
}

/** Short badges for a model ("Free", "JSON", "Vision", or "capabilities unknown"). */
export function modelBadges(m: MyAiModel): string[] {
  if (m.unknown) return ["capabilities unknown"];
  const out: string[] = [];
  if (m.free) out.push("Free");
  if (m.json) out.push("JSON");
  if (m.vision) out.push("Vision");
  return out;
}

/** One line under a model in a picker. */
export const modelDescription = (m: MyAiModel) => [...modelBadges(m), modelPrice(m)].filter(Boolean).join(" · ");

/**
 * What a provider says it has left, when it says (OpenRouter `limit_remaining`, DeepSeek
 * `balance_infos`). Null when there is nothing worth showing.
 */
export function balanceText(balance: Record<string, unknown> | null | undefined): string | null {
  if (!balance) return null;
  const b = balance as Record<string, any>;
  if (typeof b.limit_remaining === "number") return `$${b.limit_remaining.toFixed(2)} left on this key`;
  if (b.is_free_tier === true) return "Free tier (free models only)";
  if (typeof b.usage === "number") return `$${b.usage.toFixed(2)} used, no limit set`;
  if (Array.isArray(b.balance_infos) && b.balance_infos.length) {
    return b.balance_infos
      .map((x: any) => `${x?.total_balance ?? "?"} ${x?.currency ?? ""}`.trim())
      .join(" · ")
      .concat(" balance");
  }
  if (typeof b.total_balance === "string" || typeof b.total_balance === "number") return `${b.total_balance} balance`;
  return null;
}

const FALLBACK_TEXT: Record<string, string> = {
  AI_KEY_INVALID: "Your key was refused",
  AI_KEY_NO_CREDIT: "Your key was out of credit",
  AI_KEY_RATE_LIMITED: "Your key was rate-limited",
  AI_PERSONAL_FAILED: "Your key didn't answer",
};

/** "via My Claude · claude-haiku" / "Your key was out of credit; School AI answered." / null. */
export function answeredByText(ai: AiRouteMeta | null | undefined): { text: string; tone: "personal" | "fallback" | "school" } | null {
  if (!ai || typeof ai !== "object") return null;
  if (ai.route === "handoff") return { text: "via your own AI (pasted)", tone: "personal" };
  if (ai.route === "personal") {
    const name = ai.label || ai.provider || "AI";
    return { text: `via ${/^my\s/i.test(name) ? name : `My ${name}`}${ai.model ? ` · ${ai.model}` : ""}`, tone: "personal" };
  }
  if (ai.fallbackFrom) {
    return { text: `${FALLBACK_TEXT[ai.fallbackFrom] ?? "Your key didn't answer"}${ai.label ? ` (${ai.label})` : ""}; School AI answered.`, tone: "fallback" };
  }
  if (ai.skipped) {
    return { text: `${ai.skipped === "STUDENT_CAP" ? "Your daily My AI limit is reached" : "Your key's daily limit is reached"}; School AI answered.`, tone: "fallback" };
  }
  if (ai.reason === "KEY_NOT_ACTIVE") return { text: "Your key needs attention in My AI; School AI answered.", tone: "fallback" };
  return { text: "via School AI", tone: "school" };
}

/** The `ai` meta from an axios response, whether the server put it in `data` or at the top. */
export const aiMetaOf = (body: any): AiRouteMeta | null => body?.data?.ai ?? body?.ai ?? null;
