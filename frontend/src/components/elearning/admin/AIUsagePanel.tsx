import React, { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { studioApi } from "../../../api/studio";

/**
 * AI on free tiers, made visible (Lesson Studio §15, decision D2): what's left of today's free
 * quota per provider, how many calls a day the school makes, and what teachers do with the
 * drafts (kept as-is, edited, or discarded). Read-only; behind VIEW_ALL_COURSES.
 */

const PROVIDER: Record<string, string> = { glm: "GLM", groq: "Groq", gemini: "Gemini", openai: "OpenAI" };
const TYPE: Record<string, string> = { LESSON_NOTE: "Lessons", KNOWLEDGE_CHECK: "Checks", PRACTICAL_TASK: "Practical tasks", PAGE: "Pages", VIDEO: "Video slots", EXIT_TICKET: "Exit tickets", FLASHCARDS: "Flashcards" };

const AIUsagePanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    studioApi.aiUsage(14).then((r) => setData(r.data.data), () => setData(null));
  }, []);

  // One series: total calls per day (providers are listed in the table view, not as colours).
  const days = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { day: string; calls: number; failures: number }>();
    for (const r of data.by_day) {
      const d = String(r.day).slice(0, 10);
      const e = m.get(d) ?? { day: d, calls: 0, failures: 0 };
      e.calls += r.calls;
      e.failures += r.failures;
      m.set(d, e);
    }
    // A fixed 14-day window (quiet days at zero), so one busy day doesn't fill the chart.
    const out: { day: string; calls: number; failures: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      out.push(m.get(d) ?? { day: d, calls: 0, failures: 0 });
    }
    return out;
  }, [data]);
  const funnel = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, Record<string, number>>();
    for (const r of data.review_funnel) {
      const e = m.get(r.item_type) ?? {};
      e[r.review_state] = (e[r.review_state] ?? 0) + r.n;
      m.set(r.item_type, e);
    }
    return [...m.entries()];
  }, [data]);

  if (!data) return null;
  const max = Math.max(1, ...days.map((d) => d.calls));
  return (
    <section aria-labelledby="ai-usage-h" className="mt-8 el-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ai-usage-h" className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-200" /> AI on free tiers
        </h2>
        <button onClick={() => setTable((t) => !t)} className="min-h-[36px] px-3 rounded-pill el-chip text-xs font-medium">{table ? "Show chart" : "Show as table"}</button>
      </div>

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.quota.map((q: any) => {
          const pct = q.daily_limit ? Math.round(((q.remaining ?? 0) / q.daily_limit) * 100) : null;
          return (
            <div key={q.provider} className="rounded-xl el-subtle p-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">{PROVIDER[q.provider] ?? q.provider} · left today</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{q.daily_limit ? `${q.remaining}/${q.daily_limit}` : "No cap"}</p>
              {pct !== null && (
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden" role="img" aria-label={`${pct}% of today's free requests left`}>
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
              )}
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">{q.used_today} used today</p>
            </div>
          );
        })}
      </div>

      <h3 className="mt-5 text-sm font-semibold text-gray-900 dark:text-white">AI calls per day — last 14 days</h3>
      {days.every((d) => d.calls === 0) ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No AI calls yet.</p>
      ) : table ? (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-600 dark:text-slate-300"><th className="py-1">Day</th><th>Provider</th><th className="text-right">Calls</th><th className="text-right">Failed</th></tr>
          </thead>
          <tbody>
            {data.by_day.map((r: any, i: number) => (
              <tr key={i} className="border-t border-gray-100 dark:border-white/[0.06] text-gray-800 dark:text-gray-100">
                <td className="py-1">{String(r.day).slice(0, 10)}</td><td>{PROVIDER[r.provider] ?? r.provider}</td><td className="text-right tabular-nums">{r.calls}</td><td className="text-right tabular-nums">{r.failures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative mt-2">
          {hover !== null && (
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full el-float rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white whitespace-nowrap pointer-events-none" role="status">
              {days[hover].day}: {days[hover].calls} calls{days[hover].failures ? ` · ${days[hover].failures} failed` : ""}
            </div>
          )}
          <div className="h-32 flex items-end gap-[2px] border-b border-gray-200 dark:border-white/10" onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <button
                key={d.day}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.day}: ${d.calls} calls`}
                className="flex-1 h-full flex items-end focus:outline-none focus-visible:shadow-glow rounded-t"
              >
                <span className={`w-full rounded-t ${hover === i ? "bg-brand-700" : "bg-brand-600"}`} style={{ height: d.calls ? `${Math.max(4, (d.calls / max) * 100)}%` : "2px" }} />
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-600 dark:text-slate-300">
            <span>{days[0].day.slice(5)}</span>
            <span>{days[days.length - 1].day.slice(5)}</span>
          </div>
        </div>
      )}

      {funnel.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-gray-900 dark:text-white">What teachers did with AI drafts</h3>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-600 dark:text-slate-300"><th className="py-1">Kind</th><th className="text-right">Waiting</th><th className="text-right">Approved as is</th><th className="text-right">Edited</th></tr>
            </thead>
            <tbody>
              {funnel.map(([type, c]) => (
                <tr key={type} className="border-t border-gray-100 dark:border-white/[0.06] text-gray-800 dark:text-gray-100">
                  <td className="py-1">{TYPE[type] ?? type}</td>
                  <td className="text-right tabular-nums">{c.PENDING_REVIEW ?? 0}</td>
                  <td className="text-right tabular-nums">{c.ACCEPTED ?? 0}</td>
                  <td className="text-right tabular-nums">{c.EDITED ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
};

export default AIUsagePanel;
