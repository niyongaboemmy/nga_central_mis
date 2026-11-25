import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, BadgeCheck, CalendarClock, Clock3, Flame, GanttChartSquare, ListChecks, ListTodo, NotebookPen, OctagonAlert, PauseCircle, Target, Timer, Users } from "lucide-react";
import type { MonitorRow, Summary } from "../../../api/sideProjects";
import UserAvatar from "../../ui/UserAvatar";
import { StageChip } from "../ProjectCard";
import { ProgressRing, STATUS_META, StatTile, type StatTone, cardCls, dayWord, statusColor, useIsDark } from "../ui";

const Panel: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode; className?: string }> = ({ title, icon: Icon, children, action, className = "" }) => (
  <section className={`${cardCls} p-4 ${className}`}>
    <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
        <Icon className="h-4 w-4 text-slate-400" aria-hidden />
        {title}
      </h3>
      {action}
    </header>
    {children}
  </section>
);

const ProjectLine: React.FC<{ r: MonitorRow; onOpen: (id: number) => void; right: React.ReactNode }> = ({ r, onOpen, right }) => (
  <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 rounded-full px-2 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-gray-700/40">
    <UserAvatar name={r.student.name} src={r.student.avatar} userId={r.student.id} size={28} decorative />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-white">{r.title}</span>
      <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">
        {r.student.name}
        {r.class ? ` · ${r.class.name}` : ""}
      </span>
    </span>
    {right}
  </button>
);

/**
 * Where projects spend their time: per working stage, the average actual stay against the
 * average plan (soft bar = planned, solid = actual, red past the plan), how many are there now
 * and how many have overrun; the bottleneck stage; and the projects stuck longest.
 */
export const StageInsights: React.FC<{ s: Summary; onOpen: (id: number) => void; detail: boolean }> = ({ s, onOpen, detail }) => {
  const dark = useIsDark();
  const st = s.stages;
  const max = Math.max(1, ...st.stages.map((x) => Math.max(x.avgActualDays, x.avgPlannedDays ?? 0)));
  return (
    <Panel
      title="Time in each stage"
      icon={GanttChartSquare}
      action={
        st.bottleneck ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">
            <Flame className="h-3.5 w-3.5" aria-hidden /> Bottleneck: {STATUS_META[st.bottleneck.stage].label} · {st.bottleneck.ratio}× the plan
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700 dark:bg-green-500/15 dark:text-green-300">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Stages keep to plan
          </span>
        )
      }
    >
      <ul className="space-y-3">
        {st.stages.map((x, i) => {
          const M = STATUS_META[x.stage];
          const color = statusColor(x.stage, dark);
          const planned = x.avgPlannedDays ?? 0;
          const within = Math.min(x.avgActualDays, planned || x.avgActualDays);
          const beyond = planned ? Math.max(0, x.avgActualDays - planned) : 0;
          return (
            <li key={x.stage} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)_12rem]">
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-gray-200">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: color }}>
                  <M.icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="truncate">{M.label}</span>
              </span>
              <div
                className="relative h-7"
                role="img"
                aria-label={`${M.label}: on average ${x.avgActualDays} days actual, ${x.avgPlannedDays ?? "no"} days planned`}
                title={`${x.avgActualDays}d actual · ${x.avgPlannedDays ?? "–"}d planned · ${x.samples} stays`}
              >
                {planned > 0 && <motion.span className="absolute inset-y-0 left-0 rounded-lg" style={{ backgroundColor: `${color}2e` }} initial={{ width: 0 }} animate={{ width: `${(planned / max) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.05 }} />}
                <motion.span className="absolute left-0 top-2 h-3 rounded-full" style={{ backgroundColor: color }} initial={{ width: 0 }} animate={{ width: `${(within / max) * 100}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.05 }} />
                {beyond > 0 && (
                  <motion.span
                    className="absolute top-2 h-3 rounded-full bg-[#d03b3b]"
                    style={{ left: `calc(${(planned / max) * 100}% + 2px)` }}
                    initial={{ width: 0 }}
                    animate={{ width: `calc(${(beyond / max) * 100}% - 2px)` }}
                    transition={{ duration: 0.5, delay: 0.6 }}
                  />
                )}
              </div>
              <span className="col-span-2 flex flex-wrap items-center gap-1.5 pl-[7.25rem] text-[11px] sm:col-span-1 sm:justify-end sm:pl-0">
                <span className="font-bold tabular-nums text-slate-800 dark:text-gray-100">
                  {x.avgActualDays}d<span className="font-medium text-slate-500 dark:text-gray-400"> / {x.avgPlannedDays ?? "–"}d</span>
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold tabular-nums text-slate-600 dark:bg-gray-700/60 dark:text-gray-300" title="Projects in this stage now">
                  {x.now} now
                </span>
                {x.overrunNow > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 font-semibold tabular-nums text-red-700 dark:bg-red-500/15 dark:text-red-300" title="Past their stage plan now">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> {x.overrunNow}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded bg-blue-500/20" aria-hidden /> Average plan
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-full bg-blue-600" aria-hidden /> Average actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-5 rounded-full bg-[#d03b3b]" aria-hidden /> Beyond the plan
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-slate-600 dark:text-gray-300">
          <PauseCircle className="h-3.5 w-3.5" aria-hidden /> {st.onHold.now} on hold{st.onHold.avgDays ? ` · ${st.onHold.avgDays}d average pause` : ""}
        </span>
      </div>
      {detail && st.stuck.length > 0 && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-2 dark:bg-gray-800/40">
          <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Longest in their stage</p>
          {st.stuck.map((r) => (
            <ProjectLine key={r.id} r={r} onOpen={onOpen} right={<StageChip card={r} />} />
          ))}
        </div>
      )}
    </Panel>
  );
};

/** Reporting habits this week, and working projects that have gone quiet. */
export const ReportingInsights: React.FC<{ s: Summary; onOpen: (id: number) => void; detail: boolean }> = ({ s, onOpen, detail }) => {
  const r = s.reporting;
  const pct = r.workingProjects ? Math.min(100, Math.round((r.projectsReportedThisWeek / r.workingProjects) * 100)) : 0;
  return (
    <Panel title="Progress reporting" icon={NotebookPen}>
      <div className="flex flex-wrap items-center gap-4">
        <ProgressRing value={pct} size={72} stroke={7} label={`${pct}% of working projects reported this week`}>
          <span className="text-sm">{pct}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            {r.projectsReportedThisWeek} of {r.workingProjects} working projects
          </p>
          <p className="text-xs text-slate-500 dark:text-gray-400">reported in the last 7 days</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatTile icon={NotebookPen} label="Reports" value={r.reportsThisWeek} />
        <StatTile icon={Clock3} label="Hours" value={r.hoursThisWeek} unit="h" />
        <StatTile icon={AlertTriangle} label="Quiet 14d+" value={r.quietCount} tone={r.quietCount ? "warn" : "blue"} />
      </div>
      {detail && r.quiet.length > 0 && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-2 dark:bg-gray-800/40">
          <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">Gone quiet</p>
          {r.quiet.map((q) => (
            <ProjectLine
              key={q.id}
              r={q}
              onOpen={onOpen}
              right={
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                  {q.daysSinceReport === null ? "never reported" : `${dayWord(q.daysSinceReport)} ago`}
                </span>
              }
            />
          ))}
        </div>
      )}
    </Panel>
  );
};

/** School-wide delivery of implementation plans and tasks (migration 133). */
export const DeliveryInsights: React.FC<{ s: Summary; onOpen: (id: number) => void; detail: boolean }> = ({ s, onOpen, detail }) => {
  const d = s.delivery;
  if (!d) return null;
  const planPct = d.planItems ? Math.round((d.planDone / d.planItems) * 100) : 0;
  const tiles: Array<[React.ElementType, string, React.ReactNode, StatTone?]> = [
    [GanttChartSquare, "With a plan", d.withPlan],
    [Users, "Team projects", d.teamProjects],
    [ListTodo, "Open tasks", d.open],
    [CalendarClock, "Overdue tasks", d.overdue, d.overdue > 0 ? "bad" : undefined],
    [OctagonAlert, "Blocked tasks", d.blocked, d.blocked > 0 ? "bad" : undefined],
    [Timer, "Avg cycle time", d.avgCycleDays === null ? "–" : d.avgCycleDays],
    [Target, "On time", d.onTimeRate === null ? "–" : `${d.onTimeRate}%`],
  ];
  return (
    <Panel title="Plans & tasks" icon={ListChecks} action={<span className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">{d.total} tasks in all</span>}>
      <div className="flex flex-wrap items-center gap-4">
        <ProgressRing value={planPct} size={64} stroke={6} label={`${planPct}% of planned features done`}>
          <span className="text-xs">{planPct}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            {d.planDone} of {d.planItems} planned features delivered
          </p>
          <div className="mt-2 flex h-2 gap-[2px] overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="img" aria-label={`Tasks: ${d.byStatus.TODO} to do, ${d.byStatus.IN_PROGRESS} in progress, ${d.byStatus.IN_REVIEW} in review, ${d.byStatus.BLOCKED} blocked, ${d.byStatus.DONE} done`}>
            {(["DONE", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "TODO"] as const).map((k) =>
              d.byStatus[k] ? <span key={k} className={`h-full ${TASK_DOT[k]}`} style={{ flexGrow: d.byStatus[k] }} /> : null,
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-gray-300">
            {(["DONE", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "TODO"] as const).map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${TASK_DOT[k]}`} aria-hidden /> {TASK_LABEL[k]} {d.byStatus[k]}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {tiles.map(([icon, label, value, tone], n) => (
          <StatTile key={label} icon={icon} label={label} value={value} unit={n === 5 && d.avgCycleDays !== null ? "days" : undefined} tone={tone} />
        ))}
      </div>
      {detail && d.atRisk.length > 0 && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-2 dark:bg-gray-800/60">
          <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">At risk</p>
          {d.atRisk.map((r) => (
            <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 rounded-full px-2 py-2 text-left transition hover:bg-white dark:hover:bg-gray-900">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-white">{r.title}</span>
              {r.overdue > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">{r.overdue} overdue</span>}
              {r.blocked > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-300">{r.blocked} blocked</span>}
              <span className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">{r.open} open</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
};

const TASK_DOT = { TODO: "bg-slate-400 dark:bg-gray-500", IN_PROGRESS: "bg-blue-600 dark:bg-blue-400", IN_REVIEW: "bg-amber-500 dark:bg-amber-400", BLOCKED: "bg-red-600 dark:bg-red-400", DONE: "bg-green-600 dark:bg-green-400" } as const;
const TASK_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", BLOCKED: "Blocked", DONE: "Done" } as const;
