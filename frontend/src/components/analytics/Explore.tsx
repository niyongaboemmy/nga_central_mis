import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { exploreApi } from "../../api/monitor";
import { Empty, Panel, btnGhost, btnPrimary, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { fmtDur, fmtInt, fmtPct } from "./charts";
import { APPS, AppDot, Segmented, useFeatureLabels } from "./common";
import { useTheme } from "../../contexts/ThemeContext";

/**
 * Explore (plan §14 page 12): funnels (up to 10 steps, open or closed, within a visit or
 * N days) and paths (what people do after / before a feature).
 */
type Step = { type: "feature" | "event"; value: string };

export default function Explore() {
  const { state, update, qs } = useReportQuery();
  const [tab, setTab] = useState<"funnel" | "paths">("funnel");
  const catalog = useReport(() => exploreApi.catalog(), "catalog");
  const options = useMemo(
    () =>
      (catalog.data ?? []).map((c) => ({
        type: c.is_event ? ("event" as const) : ("feature" as const),
        value: c.feature_key,
        label: `${c.label}${c.module ? ` · ${c.module}` : ""}`,
        app: APPS[c.app - 1],
      })),
    [catalog.data],
  );
  return (
    <AnalyticsShell title="Explore" subtitle="Follow people through a sequence of steps, or see where they go next.">
      <Toolbar state={state} update={update} showCompare={false} showGran={false} />
      <Segmented label="Technique" value={tab} onChange={setTab} options={[{ value: "funnel", label: "Funnel" }, { value: "paths", label: "Paths" }]} />
      {tab === "funnel" ? <FunnelBuilder qs={qs} options={options} /> : <PathExplorer qs={qs} options={options.filter((o) => o.type === "feature")} />}
    </AnalyticsShell>
  );
}

type Opt = { type: "feature" | "event"; value: string; label: string; app?: string };

const StepSelect: React.FC<{ value: string; options: Opt[]; onChange: (o: Opt) => void; label: string }> = ({ value, options, onChange, label }) => (
  <select aria-label={label} className={`${inputCls} min-w-0`} value={value} onChange={(e) => { const o = options.find((x) => x.value === e.target.value); if (o) onChange(o); }}>
    <option value="">Choose a page or action…</option>
    {APPS.map((a) => (
      <optgroup key={a} label={a.toUpperCase()}>
        {options.filter((o) => o.app === a).map((o) => <option key={`${o.type}|${o.value}`} value={o.value}>{o.type === "event" ? "★ " : ""}{o.label}</option>)}
      </optgroup>
    ))}
  </select>
);

const FunnelBuilder: React.FC<{ qs: string; options: Opt[] }> = ({ qs, options }) => {
  const [steps, setSteps] = useState<Step[]>([{ type: "feature", value: "mis.login" }, { type: "feature", value: "mis.home" }]);
  const [mode, setMode] = useState<"open" | "closed">("closed");
  const [within, setWithin] = useState<"session" | "days">("session");
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = useFeatureLabels();
  const { theme } = useTheme();
  const bar = theme === "dark" ? "#3987e5" : "#2a78d6";
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await exploreApi.funnel(qs, { steps: steps.filter((s) => s.value), mode, within, days }));
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Couldn't run the funnel.");
    } finally {
      setBusy(false);
    }
  };
  const move = (i: number, d: number) => setSteps((s) => { const n = [...s]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Panel title="Steps" className="min-w-0">
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="w-5 text-xs text-slate-600 dark:text-slate-300 tabular-nums">{i + 1}.</span>
              <StepSelect label={`Step ${i + 1}`} value={s.value} options={options} onChange={(o) => setSteps((x) => x.map((y, k) => (k === i ? { type: o.type, value: o.value } : y)))} />
              <button className="p-1 disabled:opacity-30" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-4 h-4" /></button>
              <button className="p-1 disabled:opacity-30" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-4 h-4" /></button>
              <button className="p-1 disabled:opacity-30" aria-label="Remove step" disabled={steps.length <= 2} onClick={() => setSteps((x) => x.filter((_, k) => k !== i))}><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
        </ol>
        {steps.length < 10 && <button className={`${btnGhost} mt-2`} onClick={() => setSteps((s) => [...s, { type: "feature", value: "" }])}><Plus className="w-4 h-4" aria-hidden /> Add step</button>}
        <div className="mt-4 space-y-2 text-sm">
          <Segmented label="Funnel type" value={mode} onChange={setMode} options={[{ value: "closed", label: "Must start at step 1" }, { value: "open", label: "Can join at any step" }]} />
          <Segmented label="Counted within" value={within} onChange={setWithin} options={[{ value: "session", label: "One visit" }, { value: "days", label: "Several days" }]} />
          {within === "days" && <label className="flex items-center gap-2 text-xs">Within <input type="number" min={1} max={90} className={`${inputCls} !w-20 !py-1`} value={days} onChange={(e) => setDays(Number(e.target.value) || 7)} /> days of step 1</label>}
        </div>
        <div className="flex justify-end mt-4"><button className={btnPrimary} onClick={run} disabled={busy || steps.filter((s) => s.value).length < 2}>{busy ? "Running…" : "Run funnel"}</button></div>
      </Panel>
      <Panel title={result ? `${result.unit === "session" ? "Visits" : "People"} through each step` : "Result"} className="lg:col-span-2 min-w-0">
        {error && <Empty>{error}</Empty>}
        {!result && !error && <Empty>Choose the steps and run the funnel.</Empty>}
        {result && (
          <ol className="space-y-3" aria-label="Funnel result">
            {result.steps.map((s: any, i: number) => {
              const max = Math.max(1, ...result.steps.map((x: any) => x.reached));
              return (
                <li key={i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{i + 1}. {label(s.value)}</span>
                    <span className="tabular-nums">{fmtInt(s.reached)} <span className="text-xs text-slate-600 dark:text-slate-300">({fmtPct(s.rate_from_start)} of step 1{i > 0 ? `, ${fmtPct(s.rate_from_previous)} of previous` : ""})</span></span>
                  </div>
                  <div className="h-6 rounded-md bg-slate-100 dark:bg-slate-800 mt-1 overflow-hidden" aria-hidden>
                    <div className="h-full rounded-r-[4px]" style={{ width: `${(s.reached / max) * 100}%`, background: bar }} />
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {i > 0 && <>Dropped here: {fmtInt(s.dropped)}. </>}
                    {result.mode === "open" && s.entered_here > 0 && i > 0 && <>Joined here: {fmtInt(s.entered_here)}. </>}
                    {s.median_seconds_from_start !== null && <>Median time from step 1: {fmtDur(s.median_seconds_from_start)}.</>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {result?.truncated && <p className="text-xs mt-2 text-amber-800 dark:text-amber-200">Very large range: the result uses the first 400,000 matching events. Narrow the dates for an exact count.</p>}
      </Panel>
    </div>
  );
};

const PathExplorer: React.FC<{ qs: string; options: Opt[] }> = ({ qs, options }) => {
  const [feature, setFeature] = useState("mis.home");
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const pq = `${qs}&feature=${encodeURIComponent(feature)}&direction=${direction}&depth=4`;
  const { data, loading, error } = useReport(() => exploreApi.paths(pq), pq);
  const label = useFeatureLabels();
  return (
    <Panel
      title="Paths"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Direction" value={direction} onChange={setDirection} options={[{ value: "forward", label: "What comes after" }, { value: "backward", label: "What came before" }]} />
          <StepSelect label="Starting page" value={feature} options={options} onChange={(o) => setFeature(o.value)} />
        </div>
      }
    >
      {error && <Empty>{error}</Empty>}
      {loading && !data && <Empty>Loading…</Empty>}
      {data && data.sessions === 0 && <Empty>No visits opened this page in the range.</Empty>}
      {data && data.sessions > 0 && (
        <>
          <p className="text-sm mb-3">{fmtInt(data.sessions)} visits opened <span className="font-medium">{label(data.anchor)}</span>.</p>
          <div className="overflow-x-auto relative">
            <div className="flex gap-3 min-w-max" role="list" aria-label="Pages by step">
              {data.levels.map((lvl: any) => {
                const total = lvl.nodes.reduce((s: number, n: any) => s + n.n, 0) || 1;
                return (
                  <div key={lvl.depth} role="listitem" className="w-56 shrink-0">
                    <div className="text-xs font-semibold mb-2 text-slate-600 dark:text-slate-300">{lvl.depth === 0 ? "Start" : `${direction === "forward" ? "Step +" : "Step −"}${lvl.depth}`}</div>
                    <ul className="space-y-1.5">
                      {lvl.nodes.map((n: any) => (
                        <li key={n.feature} className="rounded-lg border border-border-light dark:border-slate-700 px-2 py-1.5 text-xs bg-white/70 dark:bg-slate-900/40">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {n.app && <AppDot app={n.app} withLabel={false} />}
                            <span className="truncate" title={n.feature}>{n.feature.startsWith("(") ? n.feature : label(n.feature)}</span>
                          </div>
                          <div className="tabular-nums text-slate-600 dark:text-slate-300">{fmtInt(n.n)} · {fmtPct(Math.round((n.n / total) * 1000) / 10)}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
};
