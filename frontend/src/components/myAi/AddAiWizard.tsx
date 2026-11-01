import React, { useEffect, useId, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ExternalLink, Link2, Loader2 } from "lucide-react";
import Modal from "../ui/Modal";
import { inputCls, labelCls, primaryBtn, secondaryBtn } from "../officeHours/ohUi";
import { errorMessage, myAiApi, type AiPersonalRoute, type MyAiCredential, type MyAiProvider, type RouteInput } from "../../api/myAi";
import { Badge, StatusDot, Switch } from "./ui";
import { loadModels } from "./useModels";

/**
 * "Add AI" (PERSONAL_AI_PROVIDERS_PLAN.md §9.2): choose a provider, connect it (OpenRouter
 * one-click, or paste a key), then see the check result and choose what it answers.
 */

export const OPENROUTER_CALLBACK_PATH = "/my-ai/openrouter-callback";
/** The staff free-only choice survives the trip to openrouter.ai here. */
export const OPENROUTER_FREE_ONLY_KEY = "nga.myai.openrouterFreeOnly";

type Use = "everything" | "author" | "assist" | "later";
const USES: Array<{ value: Use; label: string; hint: string }> = [
  { value: "everything", label: "Everything", hint: "All AI in every app where the key is allowed" },
  { value: "author", label: "Writing only", hint: "Lesson notes, plans, schemes and other generators" },
  { value: "assist", label: "Chat only", hint: "Ask AI, tutors and questions" },
  { value: "later", label: "Decide later", hint: "School AI keeps answering until you choose" },
];

/** The model a new key should use for a task: the provider's default when the key has it. */
async function pickModel(c: MyAiCredential, task: "*" | "author" | "assist", provider?: MyAiProvider): Promise<string | null> {
  const models = await loadModels(c.id, task);
  const def = provider?.defaultModel;
  if (def && (models.some((m) => m.id === def) || (!models.length && !c.models.length))) return def;
  return models[0]?.id ?? c.models[0] ?? def ?? null;
}

/** Point everything / writing / chat at this key, keeping the person's other choices. */
export async function routesForUse(c: MyAiCredential, use: Use, existing: readonly AiPersonalRoute[], provider?: MyAiProvider): Promise<RouteInput[] | null> {
  if (use === "later") return null;
  const task = use === "everything" ? "*" : use;
  const model = await pickModel(c, task, provider);
  if (!model) return null;
  const keep: RouteInput[] = existing
    .filter((r) => !(r.app === "*" && r.task === task))
    .map((r) => ({ app: r.app, task: r.task, credentialId: r.credentialId, model: r.model, fallback: r.fallback }));
  return [...keep, { app: "*", task, credentialId: c.id, model, fallback: "school" }];
}

const SUBSCRIPTIONS: Array<{ name: string; provider: string; text: string }> = [
  {
    name: "ChatGPT Plus / Pro",
    provider: "openai",
    text: "A ChatGPT subscription does not include API use, and OpenAI does not let other websites use it. Create an API key at platform.openai.com (paid per use), or connect OpenRouter, which reaches the same GPT models.",
  },
  {
    name: "Claude Pro / Max / Team",
    provider: "anthropic",
    text: "A Claude subscription does not include API use, and Anthropic does not allow other apps to sign in with it. Claude Max, Ultra and Team include monthly API credits: create a Console key at console.anthropic.com and add it here. Otherwise a key is paid per use, or connect OpenRouter for Claude models. Your subscription still works in Claude Code inside TMCode.",
  },
  {
    name: "Gemini Advanced / Google AI Pro",
    provider: "gemini",
    text: "A Google AI subscription does not cover the Gemini API. Create a free API key at aistudio.google.com (18+ only), or connect OpenRouter. Google Workspace for Education gives school accounts Gemini and NotebookLM free.",
  },
  {
    name: "GitHub Copilot",
    provider: "",
    text: "Copilot answers inside your code editor, not in NGA web pages. Use it in VS Code next to TMCode.",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  providers: MyAiProvider[];
  routes: AiPersonalRoute[];
  isStudent: boolean;
  /** A key was added (and maybe routes written); reload the page. */
  onDone: (c: MyAiCredential | null) => void;
}

const AddAiWizard: React.FC<Props> = ({ isOpen, onClose, providers, routes, isStudent, onDone }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<MyAiProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [freeOnly, setFreeOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<MyAiCredential | null>(null);
  const [use, setUse] = useState<Use>("everything");
  const [showSubs, setShowSubs] = useState(false);
  const uid = useId();

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setProvider(null);
    setApiKey("");
    setLabel("");
    setBaseUrl("");
    setFreeOnly(true);
    setError(null);
    setCreated(null);
    setUse(routes.length ? "later" : "everything");
    setShowSubs(false);
  }, [isOpen, routes.length]);

  const choose = (p: MyAiProvider) => {
    if (!p.allowed) return;
    setProvider(p);
    setLabel(p.label);
    setError(null);
    setStep(2);
  };

  const connectOpenRouter = async () => {
    setBusy(true);
    setError(null);
    try {
      try {
        sessionStorage.setItem(OPENROUTER_FREE_ONLY_KEY, isStudent || freeOnly ? "1" : "0");
      } catch {
        /* storage blocked: the server keeps students on free models anyway */
      }
      const r = await myAiApi.openRouterStart(`${window.location.origin}${OPENROUTER_CALLBACK_PATH}`);
      window.location.assign(r.data.data.url);
    } catch (e) {
      setError(errorMessage(e, "Couldn't start the OpenRouter connection."));
      setBusy(false);
    }
  };

  const submitKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    setBusy(true);
    setError(null);
    try {
      const r = await myAiApi.create({
        provider: provider.id,
        apiKey: apiKey.trim(),
        label: label.trim() || provider.label,
        ...(provider.id === "custom" ? { baseUrl: baseUrl.trim() } : {}),
        ...(provider.id === "openrouter" && !isStudent ? { freeOnly } : {}),
      });
      setApiKey("");
      setCreated(r.data.data);
      setStep(3);
    } catch (err) {
      setError(errorMessage(err, "Couldn't add the key."));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!created) return;
    setBusy(true);
    setError(null);
    try {
      const next = created.status === "active" ? await routesForUse(created, use, routes, provider ?? undefined) : null;
      if (next) await myAiApi.saveRoutes(next);
      onDone(created);
    } catch (e) {
      setError(errorMessage(e, "The key is saved, but your choice couldn't be saved. Set it in “What answers what”."));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    // A key added in step 2 is already saved; closing early still refreshes the page.
    if (created) onDone(created);
    else onClose();
  };

  const stepTitle = step === 1 ? "Choose a provider" : step === 2 ? `Connect ${provider?.label ?? ""}` : "Test & choose";

  return (
    <Modal isOpen={isOpen} onClose={close} size="xl" title={<span>Add AI <span className="text-sm font-normal text-slate-600 dark:text-gray-300">· Step {step} of 3: {stepTitle}</span></span>}>
      <ol className="mb-4 flex gap-1" aria-label="Progress">
        {[1, 2, 3].map((n) => (
          <li key={n} aria-current={n === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-blue-600" : "bg-slate-200 dark:bg-gray-700"}`}>
            <span className="sr-only">Step {n}{n < step ? " (done)" : n === step ? " (current)" : ""}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-4">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Providers">
            {providers.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!p.allowed}
                  onClick={() => choose(p)}
                  aria-describedby={`${uid}-p-${p.id}`}
                  className="flex h-full w-full flex-col items-start gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-white dark:border-gray-700/50 dark:bg-gray-800/40 dark:hover:bg-gray-700/40 dark:disabled:hover:bg-gray-800/40"
                >
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{p.label}</span>
                  <span className="flex flex-wrap gap-1">
                    {p.oauth && <Badge tone="blue">One-click connect</Badge>}
                    {p.freeTier ? <Badge tone="green">Free tier</Badge> : p.id !== "custom" && <Badge>Paid</Badge>}
                  </span>
                  <span id={`${uid}-p-${p.id}`} className="text-xs text-slate-600 dark:text-gray-300">
                    {p.allowed ? p.privacyNote : p.blockedReason ?? "Not available for your account."}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl bg-slate-50 dark:bg-gray-800/60">
            <button
              type="button"
              aria-expanded={showSubs}
              aria-controls={`${uid}-subs`}
              onClick={() => setShowSubs((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-100"
            >
              I have ChatGPT Plus / Claude Pro / Gemini Advanced
              <ChevronDown className={`h-4 w-4 flex-none transition ${showSubs ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {showSubs && (
              <div id={`${uid}-subs`} className="space-y-3 px-4 pb-4 text-sm text-slate-700 dark:text-gray-200">
                <p>
                  Chat subscriptions are for the provider's own apps. They <strong>don't include API use</strong>, and the providers don't allow other websites
                  to sign in with them, so they can't be connected here. You can still take any NGA prompt to them with <strong>Open in my AI</strong> and paste
                  the answer back, when your school turns it on. What works here:
                </p>
                <ul className="space-y-2">
                  {SUBSCRIPTIONS.map((s) => {
                    const p = providers.find((x) => x.id === s.provider);
                    return (
                      <li key={s.name}>
                        <strong className="text-slate-900 dark:text-white">{s.name}: </strong>
                        {s.text}{" "}
                        {p?.keyUrl && (
                          <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline dark:text-blue-300">
                            Get an API key<span className="sr-only"> for {p.label} (opens in a new tab)</span>
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {providers.find((p) => p.id === "openrouter")?.allowed && (
                  <button type="button" className={secondaryBtn} onClick={() => choose(providers.find((p) => p.id === "openrouter")!)}>
                    <Link2 className="h-4 w-4" aria-hidden /> Connect OpenRouter instead
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 2 && provider && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-gray-300">{provider.privacyNote}</p>

          {provider.oauth === "openrouter" && (
            <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">One click, no copy-paste</p>
              <p className="text-sm text-slate-700 dark:text-gray-200">
                You'll sign in at openrouter.ai and approve a key for NGA. It works with free models and no card. You can revoke it there at any time.
              </p>
              {!isStudent && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-800 dark:text-gray-100">Free models only (never spends credit, also for a pasted key)</span>
                  <Switch on={freeOnly} onChange={setFreeOnly} label="Free models only" />
                </div>
              )}
              <button type="button" className={primaryBtn} disabled={busy} onClick={() => void connectOpenRouter()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />} Connect OpenRouter
              </button>
              <p className="text-xs text-slate-600 dark:text-gray-300">Or paste an OpenRouter key below.</p>
            </div>
          )}

          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-gray-200">
            {provider.keySteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {provider.keyUrl && (
            <a href={provider.keyUrl} target="_blank" rel="noopener noreferrer" className={`${secondaryBtn} w-fit`}>
              Get a key <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only"> at {provider.label} (opens in a new tab)</span>
            </a>
          )}

          <form onSubmit={(e) => void submitKey(e)} className="space-y-3">
            {provider.id === "custom" && (
              <div>
                <label htmlFor={`${uid}-base`} className={labelCls}>
                  Endpoint address
                </label>
                <input
                  id={`${uid}-base`}
                  className={inputCls}
                  type="url"
                  inputMode="url"
                  placeholder="https://api.example.com/v1"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-600 dark:text-gray-300">An OpenAI-compatible API over https. Local addresses are not allowed.</p>
              </div>
            )}
            <div>
              <label htmlFor={`${uid}-key`} className={labelCls}>
                API key
              </label>
              <input
                id={`${uid}-key`}
                className={`${inputCls} font-mono`}
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                placeholder="Paste your key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                aria-describedby={`${uid}-key-hint`}
              />
              <p id={`${uid}-key-hint`} className="mt-1 text-xs text-slate-600 dark:text-gray-300">
                Stored encrypted and never shown again; only its last 4 characters are kept visible. It's checked with {provider.label} before it's saved.
              </p>
            </div>
            <div>
              <label htmlFor={`${uid}-name`} className={labelCls}>
                Name (optional)
              </label>
              <input id={`${uid}-name`} className={inputCls} maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" className={secondaryBtn} onClick={() => setStep(1)} disabled={busy}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </button>
              <button type="submit" className={primaryBtn} disabled={busy || apiKey.trim().length < 8}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the key…
                  </>
                ) : (
                  "Check and save"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 3 && created && (
        <div className="space-y-4">
          <div
            role="status"
            className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${created.status === "active" ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-amber-50 dark:bg-amber-500/10"}`}
          >
            {created.status === "active" && <Check className="mt-0.5 h-5 w-5 flex-none text-emerald-700 dark:text-emerald-300" aria-hidden />}
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {created.label} is saved. <StatusDot status={created.status} />
              </p>
              <p className="text-sm text-slate-700 dark:text-gray-200">
                {created.status === "active"
                  ? created.models.length
                    ? `It works, with ${created.models.length} model${created.models.length === 1 ? "" : "s"} available.`
                    : "It works."
                  : created.statusDetail || "The key needs attention before it can answer. School AI keeps answering meanwhile."}
              </p>
            </div>
          </div>

          {created.status === "active" ? (
            <fieldset>
              <legend className={labelCls}>Use this key for</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {USES.map((u) => (
                  <label
                    key={u.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2 text-sm ${use === u.value ? "border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-500/10" : "border-slate-200 dark:border-gray-700/50"}`}
                  >
                    <input type="radio" name={`${uid}-use`} className="mt-1" value={u.value} checked={use === u.value} onChange={() => setUse(u.value)} />
                    <span>
                      <span className="block font-semibold text-slate-900 dark:text-white">{u.label}</span>
                      <span className="block text-xs text-slate-600 dark:text-gray-300">{u.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => void finish()}>
              {busy ? "Saving…" : "Finish"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default AddAiWizard;
