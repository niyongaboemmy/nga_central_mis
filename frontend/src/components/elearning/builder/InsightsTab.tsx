import React, { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Send, Users } from "lucide-react";
import type { BuilderCourse } from "../../../api/elearning";
import { apiService } from "../../../services/api";
import { useToast } from "../../../contexts/ToastContext";
import { useTheme } from "../../../contexts/ThemeContext";
import { copy } from "../copy";
import { EmptyState, ProgressBar, Skeleton } from "../ui/primitives";
import MasteryHeatmap from "./MasteryHeatmap";

interface AnalyticsSection {
  section_id: number;
  title: string;
  week_number: string | null;
  started: number;
  completed: number;
  started_pct: number;
  completed_pct: number;
  items: { item_id: number; title: string; item_type: string; viewed: number; completed: number; viewed_pct: number; completed_pct: number; avg_seconds: number; avg_score: number | null }[];
}
interface AnalyticsStudent {
  user_id: number;
  name: string;
  percent: number;
  required_done: number;
  required_total: number;
  overdue: number;
  seconds_spent: number;
  last_seen_at: string | null;
  status: "not_started" | "behind" | "on_track" | "done";
}
interface Analytics {
  members: number;
  active_this_week: number;
  median_percent: number;
  not_started: number;
  behind: number;
  done: number;
  sections: AnalyticsSection[];
  students: AnalyticsStudent[];
  stuck: { user_id: number; name: string; status: string }[];
}

// Two-series categorical pair, validated with the dataviz palette checker for each surface.
const SERIES = {
  light: { started: "#14b8a6", completed: "#2f56d9", grid: "#e2e8f0", ink: "#64748b" },
  dark: { started: "#0d9488", completed: "#5b86ff", grid: "#334155", ink: "#94a3b8" },
};

const STATUS_LABEL: Record<AnalyticsStudent["status"], { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300" },
  behind: { label: "Behind", cls: "bg-warning-100 text-warning-700" },
  on_track: { label: "On track", cls: "bg-brand-50 dark:bg-brand-700/20 text-brand-700 dark:text-brand-200" },
  done: { label: "Done", cls: "bg-success-100 text-success-700" },
};

const fmtMinutes = (s: number) => (s < 60 ? `${s}s` : `${Math.round(s / 60)} min`);
const fmtWhen = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");

/**
 * Teacher Insights (UX plan §3.2): funnel per week, per-student table with filters, one-tap
 * Nudge, CSV export, mastery heat-map. The admin drill-down reuses it read-only via `basePath`.
 */
const InsightsTab: React.FC<{ courseId: number; course?: BuilderCourse; basePath?: string; readOnly?: boolean }> = ({ courseId, basePath = "/elearning/courses", readOnly = false }) => {
  const { showToast } = useToast();
  const { theme } = useTheme() as { theme?: string };
  const colours = theme === "dark" ? SERIES.dark : SERIES.light;
  const [data, setData] = useState<Analytics | null | undefined>(undefined);
  const [filter, setFilter] = useState<"all" | AnalyticsStudent["status"]>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [questions, setQuestions] = useState<{ question: string; grounded: boolean | null; asked_at: string }[]>([]);

  useEffect(() => {
    apiService
      .get(`${basePath}/${courseId}/analytics`)
      .then((r) => setData(r.data.data))
      .catch(() => setData(null));
    if (!readOnly) apiService.get(`${basePath}/${courseId}/questions`).then((r) => setQuestions(r.data.data || [])).catch(() => undefined);
  }, [courseId, basePath, readOnly]);

  const rows = useMemo(() => (data?.students || []).filter((s) => filter === "all" || s.status === filter), [data, filter]);

  const nudge = async (ids: number[]) => {
    if (ids.length === 0) return;
    setSending(true);
    try {
      const r = await apiService.post(`/elearning/courses/${courseId}/nudge`, { student_ids: ids });
      showToast(copy.builder.nudged(r.data.data.sent), "success");
      setSelected(new Set());
    } catch (e: any) {
      showToast(e?.response?.data?.message || copy.errors.generic, "error");
    } finally {
      setSending(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const head = ["Student", "Status", "Done", "Required", "Percent", "Overdue", "Time spent (s)", "Last seen"];
    const lines = data.students.map((s) => [s.name, STATUS_LABEL[s.status].label, s.required_done, s.required_total, s.percent, s.overdue, s.seconds_spent, s.last_seen_at || ""]);
    const csv = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `course-${courseId}-progress.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (data === undefined) return <div className="mt-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (data === null) return <EmptyState pose="thinking" title={copy.errors.generic} />;
  if (data.members === 0) return <EmptyState pose="sleepy" title="No students yet" body="Students appear here once they're in this class group and enrolled in the subject." />;

  const chart = data.sections.map((s) => ({ name: s.week_number || s.title.split(" — ")[0], Started: s.started_pct, Completed: s.completed_pct, section_id: s.section_id }));

  return (
    <div className="mt-4 space-y-5">
      {/* KPI row (bento) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Students", value: data.members },
          { label: "Active this week", value: data.active_this_week },
          { label: "Median completion", value: `${data.median_percent}%` },
          { label: "Need a nudge", value: data.behind + data.not_started },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-soft">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Funnel per week */}
      <div className="rounded-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-soft">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Who started and finished each week</h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">% of students, live weeks only</p>
        {chart.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">No week is live yet.</p>
        ) : (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} barGap={2} barCategoryGap="30%" margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={colours.grid} strokeDasharray="2 4" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: colours.ink }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: colours.ink }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip cursor={{ fill: colours.grid, opacity: 0.4 }} formatter={(v: any) => `${v}%`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Started" fill={colours.started} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Started" position="top" formatter={(v: any) => (v ? `${v}%` : "")} style={{ fontSize: 10, fill: colours.ink }} />
                </Bar>
                <Bar dataKey="Completed" fill={colours.completed} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Completed" position="top" formatter={(v: any) => (v ? `${v}%` : "")} style={{ fontSize: 10, fill: colours.ink }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Per-item detail as a table (the accessible view of the same data) */}
        <details className="mt-3">
          <summary className="text-xs text-brand-600 dark:text-brand-200 cursor-pointer">Per-item detail</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-gray-500"><tr><th className="py-1 pr-3">Week</th><th className="py-1 pr-3">Item</th><th className="py-1 pr-3">Opened</th><th className="py-1 pr-3">Done</th><th className="py-1 pr-3">Avg time</th><th className="py-1">Avg score</th></tr></thead>
              <tbody>
                {data.sections.flatMap((s) => s.items.map((i) => (
                  <tr key={i.item_id} className="border-t border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-200">
                    <td className="py-1 pr-3 whitespace-nowrap">{s.week_number}</td>
                    <td className="py-1 pr-3">{i.title}</td>
                    <td className="py-1 pr-3 tabular-nums">{i.viewed_pct}%</td>
                    <td className="py-1 pr-3 tabular-nums">{i.completed_pct}%</td>
                    <td className="py-1 pr-3">{fmtMinutes(i.avg_seconds)}</td>
                    <td className="py-1 tabular-nums">{i.avg_score === null ? "—" : `${i.avg_score}%`}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* Students */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-soft">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5"><Users className="w-4 h-4" /> Students</h3>
          <div className="flex items-center p-0.5 rounded-pill bg-gray-100 dark:bg-gray-800 ml-2" role="radiogroup" aria-label="Filter students">
            {(["all", "not_started", "behind", "on_track", "done"] as const).map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={`min-h-[32px] px-2.5 rounded-pill text-[11px] font-semibold ${filter === f ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
                {f === "all" ? "All" : STATUS_LABEL[f].label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {!readOnly && (
          <button onClick={() => nudge([...selected])} disabled={selected.size === 0 || sending} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-40">
            <Send className="w-3.5 h-3.5" /> {copy.builder.nudge} {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
          )}
          {!readOnly && data.stuck.length > 0 && (
            <button onClick={() => nudge(data.stuck.map((s) => s.user_id))} disabled={sending} className="min-h-[36px] px-3 rounded-pill bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200">
              Nudge everyone behind ({data.stuck.length})
            </button>
          )}
          <button onClick={exportCsv} className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-pill text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800" title="Export CSV">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-2 w-8"><input type="checkbox" aria-label="Select all shown" checked={rows.length > 0 && rows.every((r) => selected.has(r.user_id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.user_id)) : new Set())} className="accent-brand-500" /></th>
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 w-44">Progress</th>
                <th className="px-2 py-2">Overdue</th>
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Nobody matches this filter.</td></tr>}
              {rows.map((s) => (
                <tr key={s.user_id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2"><input type="checkbox" aria-label={`Select ${s.name}`} checked={selected.has(s.user_id)} onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(s.user_id); else n.delete(s.user_id); return n; })} className="accent-brand-500" /></td>
                  <td className="px-2 py-2 text-gray-800 dark:text-gray-100 whitespace-nowrap">{s.name}</td>
                  <td className="px-2 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-pill font-semibold ${STATUS_LABEL[s.status].cls}`}>{STATUS_LABEL[s.status].label}</span></td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2"><ProgressBar value={s.percent} className="flex-1" ariaLabel={`${s.name} ${s.percent}%`} /><span className="text-[11px] text-gray-500 tabular-nums w-16">{s.required_done}/{s.required_total}</span></div></td>
                  <td className="px-2 py-2 tabular-nums text-gray-700 dark:text-gray-200">{s.overdue || "—"}</td>
                  <td className="px-2 py-2 text-gray-700 dark:text-gray-200">{fmtMinutes(s.seconds_spent)}</td>
                  <td className="px-2 py-2 text-gray-500">{fmtWhen(s.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* What students asked the AI (Phase 5) — anonymised, direct input for the next lesson */}
      {questions.length > 0 && (
        <div className="rounded-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-soft">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">What students asked the tutor</h3>
          <p className="text-[11px] text-gray-500">Anonymous. Questions the notes couldn't answer are flagged.</p>
          <ul className="mt-2 space-y-1">
            {questions.slice(0, 12).map((q, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${q.grounded === false ? "bg-warning-500" : "bg-gray-300"}`} aria-hidden />
                <span>{q.question}{q.grounded === false && <span className="ml-1 text-[10px] text-warning-700">not in notes</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mastery (Phase 4) */}
      <MasteryHeatmap courseId={courseId} basePath={basePath} />
    </div>
  );
};

export default InsightsTab;
