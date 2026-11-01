import type { AiProviderId, AiTask } from "../../../vendor/nga-access";
import catalog from "./modelCatalog.json";

/**
 * Every provider a user can connect in My AI (PERSONAL_AI_PROVIDERS_PLAN.md §1, §7).
 *
 * Facts about terms and data use come from the providers' own pages as of 2026-11-01
 * (sources in the plan). They are shown to people as plain-language notes, so keep them
 * short and update them when a provider changes its terms.
 */
export interface ProviderInfo {
  id: AiProviderId;
  label: string;
  /** Default API base (structured calls). */
  baseUrl: string;
  /** OpenAI-compatible chat endpoint used for streaming answers. */
  chatBaseUrl: string;
  /** Where a person creates a key. */
  keyUrl: string;
  /** Three short steps shown in the wizard. */
  keySteps: string[];
  /** A free tier exists (card not needed). */
  freeTier: boolean;
  /** One-click connect instead of pasting a key. */
  oauth?: "openrouter";
  /** Plain-language data note shown on the card and in the wizard. */
  privacyNote: string;
  /** Model used when the person has not picked one for a task. */
  defaultModel: string;
  /** Students may never use this provider (see AI_STUDENT_BLOCKED_PROVIDERS). */
  notForStudents?: string;
}

export const PROVIDERS: Record<AiProviderId, ProviderInfo> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    chatBaseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    keySteps: ["Sign in at platform.openai.com", "Open API keys and choose Create new secret key", "Copy the key (it starts with sk-) and paste it here"],
    freeTier: false,
    privacyNote: "OpenAI does not train on API data unless you opt in. Abuse logs are kept up to 30 days.",
    defaultModel: "gpt-4o-mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    chatBaseUrl: "https://api.anthropic.com/v1/",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keySteps: ["Sign in at console.anthropic.com", "Open API keys and choose Create key", "Copy the key (it starts with sk-ant-) and paste it here"],
    freeTier: false,
    privacyNote: "Anthropic does not train on API data by default. A Claude Pro or Max subscription does not include API use.",
    defaultModel: "claude-haiku-5-5",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    chatBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    keyUrl: "https://aistudio.google.com/apikey",
    keySteps: ["Sign in at aistudio.google.com", "Choose Get API key, then Create API key", "Copy the key (it starts with AIza) and paste it here"],
    freeTier: true,
    privacyNote: "On the free tier Google uses prompts to improve its products and people may review them. Paid use is not used for training.",
    defaultModel: "gemini-2.5-flash",
    notForStudents: "Google's Gemini API terms require users to be 18 or older.",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    chatBaseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    keySteps: ["Sign in at console.groq.com", "Open API Keys and choose Create API Key", "Copy the key (it starts with gsk_) and paste it here"],
    freeTier: true,
    privacyNote: "Fast open models with a free tier.",
    defaultModel: "openai/gpt-oss-120b",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    chatBaseUrl: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    keySteps: ["Sign in at platform.deepseek.com and add credit", "Open API keys and choose Create new API key", "Copy the key and paste it here"],
    freeTier: false,
    privacyNote: "Data is stored in China and may be used to improve DeepSeek's models.",
    defaultModel: "deepseek-chat",
    notForStudents: "DeepSeek stores data in China and may train on it.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    chatBaseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    keySteps: ["Choose Connect (no copy-paste), or sign in at openrouter.ai", "Open Keys and choose Create Key", "Copy the key (it starts with sk-or-) and paste it here"],
    freeTier: true,
    oauth: "openrouter",
    privacyNote: "One account for hundreds of models, including free ones. For students, free models that train on prompts are excluded.",
    defaultModel: "openrouter/free",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    chatBaseUrl: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/api-keys",
    keySteps: ["Sign in at console.mistral.ai", "Open API Keys and choose Create new key", "Copy the key and paste it here"],
    freeTier: true,
    privacyNote: "The free Experiment plan may use your data for training unless you opt out in Mistral's console.",
    defaultModel: "mistral-small-latest",
  },
  glm: {
    id: "glm",
    label: "Z.ai (GLM)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    chatBaseUrl: "https://api.z.ai/api/paas/v4",
    keyUrl: "https://z.ai/manage-apikey/apikey-list",
    keySteps: ["Sign in at z.ai", "Open API Keys and create a key", "Copy the key and paste it here"],
    freeTier: true,
    privacyNote: "GLM models from Z.ai, with free Flash models.",
    defaultModel: "glm-4.5-flash",
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    chatBaseUrl: "https://api.cerebras.ai/v1",
    keyUrl: "https://cloud.cerebras.ai/platform",
    keySteps: ["Sign in at cloud.cerebras.ai", "Open API Keys and create a key", "Copy the key (it starts with csk-) and paste it here"],
    freeTier: true,
    privacyNote: "Very fast open models with a free daily allowance.",
    defaultModel: "gpt-oss-120b",
  },
  custom: {
    id: "custom",
    label: "Other (OpenAI-compatible)",
    baseUrl: "",
    chatBaseUrl: "",
    keyUrl: "",
    keySteps: ["Get the endpoint address (https only) and a key from your provider", "Paste both here", "Pick a model from the list it reports"],
    freeTier: false,
    privacyNote: "You choose the service; check its terms yourself. Local models (Ollama, LM Studio) run in NGA Desktop, not here.",
    defaultModel: "",
    notForStudents: "Custom endpoints are for staff only.",
  },
};

export interface CatalogModel {
  id: string;
  name: string;
  json: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  context: number | null;
  output: number | null;
  cost_in: number | null;
  cost_out: number | null;
  free: boolean;
  released: string | null;
}

const CATALOG = (catalog as { providers: Record<string, CatalogModel[]> }).providers;
export const CATALOG_FETCHED_AT = (catalog as { fetched_at: string }).fetched_at;

export function catalogModel(provider: AiProviderId, model: string): CatalogModel | undefined {
  return CATALOG[provider]?.find((m) => m.id === model);
}

/**
 * What a model must be able to do for a task (§7.4). Models the catalogue doesn't know
 * pass: a provider's own /models list is the authority on what exists.
 */
export function modelFitsTask(m: CatalogModel | undefined, task: AiTask | "*"): boolean {
  if (!m) return true;
  if (task === "author") return (m.output ?? 8192) >= 8192;
  return true;
}

/**
 * The models to offer for one credential: the provider's live list (from validation)
 * intersected with the catalogue, catalogue facts attached. Unknown live models are kept
 * at the end so a brand-new model is still usable.
 */
export function modelsFor(provider: AiProviderId, live: string[] | null, task: AiTask | "*" = "*", freeOnly = false) {
  const known = CATALOG[provider] ?? [];
  const liveSet = live && live.length ? new Set(live) : null;
  const picked = known.filter((m) => (!liveSet || liveSet.has(m.id)) && modelFitsTask(m, task) && (!freeOnly || m.free));
  const extra = liveSet
    ? [...liveSet]
        .filter((id) => !known.some((m) => m.id === id) && (!freeOnly || id.endsWith(":free") || id === "openrouter/free"))
        .sort()
        .map((id) => ({ id, name: id, unknown: true as const }))
    : [];
  return [...picked, ...extra];
}

/** Cost estimate in USD (catalogue prices are per million tokens). */
export function estimateCostUsd(provider: AiProviderId, model: string, input?: number | null, output?: number | null): number | null {
  const m = catalogModel(provider, model);
  if (!m || m.cost_in == null || m.cost_out == null) return null;
  return ((input ?? 0) * m.cost_in + (output ?? 0) * m.cost_out) / 1_000_000;
}

/**
 * "What a key really costs" (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §4): a heavy month of school
 * work (20 lesson notes, 30 question batches, 20 rubrics, 200 chat turns, 50 mail drafts).
 */
export const HEAVY_MONTH = { inputTokens: 640_000, outputTokens: 385_000 };

/** The models people ask about, cheapest first in each family. */
const COST_MODELS: Array<[AiProviderId, string]> = [
  ["anthropic", "claude-haiku-5-5"],
  ["openai", "gpt-6-luna"],
  ["deepseek", "deepseek-v4-flash"],
  ["gemini", "gemini-3.5-flash-lite"],
  ["gemini", "gemini-3.8-flash"],
  ["openai", "gpt-6.1-terra"],
  ["anthropic", "claude-sonnet-5-5"],
  ["anthropic", "claude-opus-5-5"],
];

/** One row per headline model the catalogue prices, with the heavy month's cost in USD. */
export function monthlyCosts() {
  return COST_MODELS.flatMap(([provider, id]) => {
    const m = catalogModel(provider, id);
    if (!m || m.cost_in == null || m.cost_out == null) return [];
    return [
      {
        provider,
        providerLabel: PROVIDERS[provider]?.label ?? provider,
        model: m.id,
        name: m.name,
        cost_in: m.cost_in,
        cost_out: m.cost_out,
        monthlyUsd: estimateCostUsd(provider, m.id, HEAVY_MONTH.inputTokens, HEAVY_MONTH.outputTokens) ?? 0,
      },
    ];
  }).sort((a, b) => a.monthlyUsd - b.monthlyUsd);
}
