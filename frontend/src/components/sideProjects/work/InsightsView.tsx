import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Gauge, Hourglass, ListTodo, OctagonAlert, RefreshCw, Target, Timer, Users } from "lucide-react";
import { failure, sideProjectsApi, type Delivery, type ProjectDetail } from "../../../api/sideProjects";
import UserAvatar from "../../ui/UserAvatar";
import { Skeleton, StatTile, cardCls, useIsDark } from "../ui";
import { PLAN_META, ROLE_META, TASK_META, fmtDay } from "./meta";

const tokens = (dark: boolean) => ({
  grid: dark ? "#1f2937" : "#e2e8f0",
  axis: dark ? "#9ca3af" : "#64748b",
  remaining: dark ? "#3987e5" : "#2a78d6",
  scope: dark ? "#6b7280" : "#94a3b8",
  bar: dark ? "#3987e5" : "#2a78d6",
  tipBg: dark ? "#111827" : "#ffffff",
  tipBorder: dark ? "#374151" : "#e2e8f0",
  tipText: dark ? "#f3f4f6" : "#0f172a",
});

const Tip: React.FC<{ active?: boolean; payload?: any[]; label?: string; fmt?: (l: string) => string; dark: boolean }> = ({ active, payload, label, fmt, dark }) => {
  const t = tokens(dark);
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-xs" style={{ background: t.tipBg, border: `1px solid ${t.tipBorder}`, color: t.tipText }}>
      <p className="mb-1 font-bold">{fmt ? fmt(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-bold tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

const days = (n: number | null) => (n === null ? "–" : `${n}d`);

/**
 * Delivery insights for one project (plan §6): KPIs, burndown with scope, weekly throughput,
 * time spent in each state, late plan items and one row per teammate.
 */
const InsightsView: React.FC<{ p: ProjectDetail; refreshKey?: unknown }> = ({ p, refreshKey }) => {
  const dark = useIsDark();
  const t = tokens(dark);
  const [d, setD] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setD(await sideProjectsApi.delivery(p.id));
    } catch (e) {
      setError(failure(e, "Insights couldn't load").message);
    }
  }, [p.id]);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (error)
    return (
      <div className={`${cardCls} p-6 text-center`}>
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        <button type="button" onClick={load} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  if (!d)
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading insights">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        <Skeleton className="h-56" />
        <Skeleton className="h-40" />
      </div>
    );

  const k = d.kpis;
  if (k.total === 0)
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
          <Gauge className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-gray-100">Insights appear once tasks move</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Add tasks to the plan and track them; cycle time, burndown and each teammate's work show up here.</p>
      </div>
    );
  const maxStatus = Math.max(1, ...d.statusTime.map((s) => s.avgDays));
  const maxLoad = Math.max(1, ...d.members.map((m) => m.assigned));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={ListTodo} label="Open tasks" value={k.open} />
        <StatTile icon={CheckCircle2} label="Done" value={k.done} tone={k.done ? "good" : undefined} />
        <StatTile icon={CalendarClock} label="Overdue" value={k.overdue} tone={k.overdue ? "bad" : undefined} />
        <StatTile icon={OctagonAlert} label="Blocked" value={k.blocked} tone={k.blocked ? "bad" : undefined} />
        <StatTile icon={Timer} label="Avg cycle time" value={k.avgCycleDays === null ? "–" : k.avgCycleDays} unit={k.avgCycleDays === null ? undefined : "days"} />
        <StatTile icon={Target} label="On time" value={k.onTimeRate === null ? "–" : `${k.onTimeRate}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} p-4`} aria-label="Burndown">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Burndown · 30 days</h4>
          <p className="text-[11px] text-slate-500 dark:text-gray-400">Open tasks against all tasks created</p>
          <div className="mt-2 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.burndown} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(v) => fmtDay(v)} tick={{ fontSize: 10, fill: t.axis }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: t.axis }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip dark={dark} fmt={(l) => fmtDay(l, { weekday: "short", day: "numeric", month: "short" })} />} cursor={{ stroke: t.axis, strokeDasharray: "3 3" }} />
                <Line type="stepAfter" dataKey="scope" name="All tasks" stroke={t.scope} strokeWidth={2} strokeDasharray="4 3" dot={false} />
                <Line type="monotone" dataKey="remaining" name="Open" stroke={t.remaining} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-slate-600 dark:text-gray-300">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: t.remaining }} /> Open</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed" style={{ borderColor: t.scope }} /> All tasks</span>
          </div>
        </section>

        <section className={`${cardCls} p-4`} aria-label="Throughput">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Done per week</h4>
          <p className="text-[11px] text-slate-500 dark:text-gray-400">Tasks finished, last 8 weeks</p>
          <div className="mt-2 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.throughput} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="3 3" />
                <XAxis dataKey="week" tickFormatter={(v) => fmtDay(v)} tick={{ fontSize: 10, fill: t.axis }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: t.axis }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip dark={dark} fmt={(l) => `Week of ${fmtDay(l)}`} />} cursor={{ fill: dark ? "#1f293766" : "#f1f5f9" }} />
                <Bar dataKey="done" name="Done" fill={t.bar} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={`${cardCls} p-4`} aria-label="Teammates">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Users className="h-4 w-4 text-slate-400" aria-hidden /> Teammates
          </h4>
          <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Teammates table">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="text-[11px] text-slate-500 dark:text-gray-400">
                <tr>
                  <th className="pb-2 font-medium">Person</th>
                  <th className="pb-2 font-medium">Workload</th>
                  <th className="pb-2 text-right font-medium">Done</th>
                  <th className="pb-2 text-right font-medium">Overdue</th>
                  <th className="pb-2 text-right font-medium">Hours</th>
                  <th className="pb-2 text-right font-medium">Cycle</th>
                  <th className="pb-2 text-right font-medium">On time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/[0.05] dark:divide-white/[0.05]">
                {d.members.map((m) => {
                  const R = ROLE_META[m.roleKey] ?? ROLE_META.OTHER;
                  const open = m.todo + m.inProgress + m.inReview + m.blocked;
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <UserAvatar name={m.name} userId={m.id} size={26} decorative />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-800 dark:text-gray-100">{m.name}</span>
                            <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-gray-400">
                              <R.icon className="h-3 w-3" aria-hidden /> {m.roleTitle || R.label}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex h-2 w-32 gap-[2px] overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="img" aria-label={`${open} open: ${m.inProgress} in progress, ${m.inReview} in review, ${m.blocked} blocked, ${m.todo} to do`}>
                          {(["inProgress", "inReview", "blocked", "todo"] as const).map((key) => {
                            const n = m[key];
                            if (!n) return null;
                            const s = key === "inProgress" ? "IN_PROGRESS" : key === "inReview" ? "IN_REVIEW" : key === "blocked" ? "BLOCKED" : "TODO";
                            return <span key={key} className={`h-full ${TASK_META[s].dot}`} style={{ width: `${(n / maxLoad) * 100}%` }} />;
                          })}
                        </div>
                        <span className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">{open} open{m.openEstimateHours ? ` · ${m.openEstimateHours}h est.` : ""}</span>
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-gray-100">{m.done}</td>
                      <td className={`py-2 text-right font-semibold tabular-nums ${m.overdue ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-gray-400"}`}>{m.overdue}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700 dark:text-gray-200">{m.hoursLogged}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700 dark:text-gray-200">{days(m.avgCycleDays)}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700 dark:text-gray-200">{m.onTimeRate === null ? "–" : `${m.onTimeRate}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {k.unassigned > 0 && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{k.unassigned} open task{k.unassigned === 1 ? "" : "s"} without an assignee.</p>}
        </section>

        <div className="space-y-4">
          <section className={`${cardCls} p-4`} aria-label="Time in each state">
            <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Hourglass className="h-4 w-4 text-slate-400" aria-hidden /> Time in each state
            </h4>
            <ul className="mt-3 space-y-2.5">
              {d.statusTime.map((s) => (
                <li key={s.status} className="text-xs">
                  <div className="mb-1 flex justify-between text-slate-600 dark:text-gray-300">
                    <span>{TASK_META[s.status].label}</span>
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{s.avgDays}d avg</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                    <motion.div className={`h-full rounded-full ${TASK_META[s.status].dot}`} initial={{ width: 0 }} animate={{ width: `${(s.avgDays / maxStatus) * 100}%` }} transition={{ duration: 0.6 }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-gray-400">
              <Clock3 className="h-3 w-3" aria-hidden /> Lead time {days(k.avgLeadDays)} · median cycle {days(k.medianCycleDays)}
            </p>
          </section>
          {d.latePlan.length > 0 && (
            <section className={`${cardCls} p-4`} aria-label="Late plan items">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden /> Late features
              </h4>
              <ul className="mt-2 space-y-1.5">
                {d.latePlan.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-xs">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${PLAN_META[i.status].dot}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-gray-200">{i.title}</span>
                    <span className="font-semibold tabular-nums text-red-700 dark:text-red-300">{fmtDay(i.due)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default InsightsView;
