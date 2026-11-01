import React, { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, KeyRound, Sparkles, TriangleAlert } from "lucide-react";
import SelectField from "../ui/SelectField";
import { TASK_LABELS, answeredByText, myAiApi, type AiRouteMeta, type AiTask, type MyAiResolved } from "../../api/myAi";

/**
 * "Answers with: School AI ▾" (PERSONAL_AI_PROVIDERS_PLAN.md §9.3): a per-request choice of
 * which AI answers, shown in an AI panel only when the person has My AI keys they may use
 * here. The value goes into the request body as `aiRoute`:
 *
 *   ""                     what My AI says for this task (the default)
 *   "school"               the school's AI, this once
 *   "<credentialId>:<model>"  one of my keys, this once
 *
 *   const [aiRoute, setAiRoute] = useState("");
 *   <AiSourceControl task="author" value={aiRoute} onChange={setAiRoute} />
 *   api.post(url, { ...body, ...(aiRoute ? { aiRoute } : {}) })
 *   <AiAnsweredBy ai={aiMetaOf(res.data)} />
 */

// One fetch per minute for every panel on the page.
const TTL = 60_000;
let cached: { at: number; value: MyAiResolved | null } | null = null;
let inflight: Promise<MyAiResolved | null> | null = null;

export async function loadResolved(force = false): Promise<MyAiResolved | null> {
  if (!force && cached && Date.now() - cached.at < TTL) return cached.value;
  // Through a then(): a page whose API layer can't answer must still render, just without the chip.
  inflight ??= Promise.resolve()
    .then(() => myAiApi.resolved())
    .then((r) => r.data.data ?? null)
    .catch(() => null)
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Forget the cached map (after keys or routes change on the My AI page). */
export const forgetResolved = () => {
  cached = null;
};

export function useResolvedAi(): MyAiResolved | null {
  const [value, setValue] = useState<MyAiResolved | null>(cached?.value ?? null);
  useEffect(() => {
    let live = true;
    void loadResolved().then((v) => live && setValue(v));
    return () => {
      live = false;
    };
  }, []);
  return value;
}

/** The body fields to send for a choice (nothing for the default). */
export const aiRouteBody = (value: string | undefined | null): { aiRoute?: string } => (value ? { aiRoute: value } : {});

interface Props {
  task: AiTask;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

const AiSourceControl: React.FC<Props> = ({ task, value, onChange, className = "", disabled }) => {
  const resolved = useResolvedAi();
  const id = useId();
  if (!resolved?.enabled || !resolved.choices.length) return null;

  const current = resolved.byTask?.[task];
  const defaultName =
    current?.route === "personal" ? `My AI default (${current.label || current.provider}${current.model ? ` · ${current.model}` : ""})` : "My AI default (School AI)";

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${className}`}>
      <label htmlFor={id} className="flex items-center gap-1 font-semibold text-slate-700 dark:text-gray-200">
        <Sparkles className="h-3.5 w-3.5" aria-hidden /> Answers with
      </label>
      <SelectField
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[12rem] max-w-full rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-gray-700/50 dark:bg-gray-800/40 dark:text-gray-100"
        title={`Which AI answers this ${TASK_LABELS[task].name.toLowerCase()} request`}
      >
        <option value="">{defaultName}</option>
        <option value="school">School AI (free)</option>
        {resolved.choices.map((c) => (
          <option key={`${c.credentialId}:${c.model}`} value={`${c.credentialId}:${c.model}`} data-description={c.model}>
            {`My ${c.label || c.provider}`}
          </option>
        ))}
      </SelectField>
      <Link
        to="/my-ai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
      >
        Manage My AI <ExternalLink className="h-3 w-3" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </Link>
    </div>
  );
};

/** "via My Claude · model" or "Your key was out of credit; School AI answered." */
export const AiAnsweredBy: React.FC<{ ai: AiRouteMeta | null | undefined; className?: string; showSchool?: boolean }> = ({ ai, className = "", showSchool = false }) => {
  const t = answeredByText(ai);
  if (!t || (t.tone === "school" && !showSchool)) return null;
  const tone =
    t.tone === "fallback"
      ? "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"
      : t.tone === "personal"
        ? "bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200"
        : "bg-slate-100 text-slate-700 dark:bg-gray-800/50 dark:text-gray-200";
  const Icon = t.tone === "fallback" ? TriangleAlert : t.tone === "personal" ? KeyRound : Sparkles;
  return (
    <p role="status" className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone} ${className}`}>
      <Icon className="h-3.5 w-3.5 flex-none" aria-hidden />
      <span className="min-w-0 break-words">{t.text}</span>
      {t.tone === "fallback" && (
        <Link to="/my-ai" className="flex-none font-semibold underline underline-offset-2">
          Fix in My AI
        </Link>
      )}
    </p>
  );
};

export default AiSourceControl;
