import React, { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import SelectField from "../ui/SelectField";
import { inputCls, labelCls, primaryBtn } from "../officeHours/ohUi";
import { errorMessage, modelDescription, myAiApi, type MyAiCredential, type PlaygroundSide } from "../../api/myAi";
import { keyName } from "./routesModel";
import { useModels } from "./useModels";

/** Try it (§9.1 item 4): one prompt to School AI and to one of my keys, side by side. */

const cost = (usd: number | null | undefined) => (usd == null ? null : usd === 0 ? "free" : usd < 0.001 ? "< $0.001" : `~$${usd.toFixed(usd < 0.01 ? 4 : 3)}`);

const Side: React.FC<{ title: string; side: PlaygroundSide | null; busy: boolean }> = ({ title, side, busy }) => (
  <section aria-label={title} aria-busy={busy} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700/40 dark:bg-gray-800/40">
    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
    {busy ? (
      <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-gray-300">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Waiting for the answer…
      </p>
    ) : !side ? (
      <p className="text-sm text-slate-600 dark:text-gray-300">The answer appears here.</p>
    ) : side.ok ? (
      <>
        <p className="text-xs text-slate-600 dark:text-gray-300">
          {side.provider} · {side.model} · {(side.ms / 1000).toFixed(1)} s{cost(side.estCostUsd) ? ` · ${cost(side.estCostUsd)}` : ""}
        </p>
        <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-gray-100">{side.text}</div>
      </>
    ) : (
      <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
        {side.error.message} <span className="text-xs">({(side.ms / 1000).toFixed(1)} s)</span>
      </p>
    )}
  </section>
);

const TryIt: React.FC<{ credentials: MyAiCredential[] }> = ({ credentials }) => {
  const active = useMemo(() => credentials.filter((c) => c.status === "active"), [credentials]);
  const [credentialId, setCredentialId] = useState<number | null>(active[0]?.id ?? null);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("Explain photosynthesis to a Senior 2 class in three sentences.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ school: PlaygroundSide; mine: PlaygroundSide } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const models = useModels(credentialId ? [credentialId] : [], "assist", !!credentialId);
  const list = credentialId ? models[credentialId] : undefined;

  useEffect(() => {
    if (!active.some((c) => c.id === credentialId)) setCredentialId(active[0]?.id ?? null);
  }, [active, credentialId]);
  useEffect(() => setModel(""), [credentialId]);

  if (!active.length) return <p className="text-sm text-slate-600 dark:text-gray-300">Add a working key to compare it with School AI.</p>;

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentialId || !prompt.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await myAiApi.playground({ prompt: prompt.trim(), credentialId, ...(model ? { model } : {}) });
      setResult(r.data.data);
    } catch (err) {
      setError(errorMessage(err, "Couldn't run the comparison."));
    } finally {
      setBusy(false);
    }
  };

  const mine = active.find((c) => c.id === credentialId);
  return (
    <form onSubmit={(e) => void run(e)} className="space-y-3">
      <div>
        <label htmlFor={`${uid}-prompt`} className={labelCls}>
          Prompt
        </label>
        <textarea id={`${uid}-prompt`} className={`${inputCls} min-h-[5rem]`} maxLength={2000} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-key`} className={labelCls}>
            My key
          </label>
          <SelectField id={`${uid}-key`} className={inputCls} value={String(credentialId ?? "")} onChange={(e) => setCredentialId(Number(e.target.value))}>
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {keyName(c)}
              </option>
            ))}
          </SelectField>
        </div>
        <div>
          <label htmlFor={`${uid}-model`} className={labelCls}>
            Model
          </label>
          <SelectField id={`${uid}-model`} className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} searchable="auto">
            <option value="">The key's default model</option>
            {(list ?? []).map((m) => (
              <option key={m.id} value={m.id} data-description={modelDescription(m) || undefined}>
                {m.name || m.id}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600 dark:text-gray-300">Counts once against your key; School AI is free.</p>
        <button type="submit" className={primaryBtn} disabled={busy || !prompt.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} Compare
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </p>
      )}
      {(busy || result) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-live="polite">
          <Side title="School AI" side={result?.school ?? null} busy={busy} />
          <Side title={keyName(mine)} side={result?.mine ?? null} busy={busy} />
        </div>
      )}
    </form>
  );
};

export default TryIt;
