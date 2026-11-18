import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity, AlertTriangle, BadgeCheck, Briefcase, Clock3, FileWarning, FolderKanban, Github, Hourglass, PauseCircle, Table2, TrendingDown, TrendingUp, Users, AlertOctagon, Minus,
} from "lucide-react";
import { fileUrl, type Kind, type Health, type MonitorRow, type Status, type Summary } from "../../../api/sideProjects";
import UserAvatar from "../../ui/UserAvatar";
import { DeliveryInsights, ReportingInsights, StageInsights } from "./Insights";
import { KIND_META, KINDS, STATUS_SOLID, HEALTH_META, ReviewBadge, STATUS_META, STATUS_ORDER, statusColor, timeAgo, useIsDark, cardCls, CATEGORY_ICON } from "../ui";

export type DrillFilter = Partial<{ kind: Kind; ownerType: "STUDENT" | "STAFF"; status: Status; review: string; health: Health; missing: string; hasGithub: string; hasAccess: string; classId: number }>;

const SEQ = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const SEQ_DARK = ["#1e293b", "#184f95", "#1c5cab", "#256abf", "#3987e5", "#6da7ec"];

const useChartTokens = () => {
  const dark = useIsDark();
  return {
    dark,
    grid: dark ? "#334155" : "#e2e8f0",
    axis: dark ? "#cbd5e1" : "#475569",
    s1: dark ? "#3987e5" : "#2a78d6",
    s3: dark ? "#0ca30c" : "#008300",
  };
};

const Tip: React.FC<{ active?: boolean; payload?: any[]; label?: string; fmt?: (l: string) => string }> = ({ active, payload, label, fmt }) =>
  active && payload?.length ? (
    <div className="rounded-xl border border-slate-900/[0.07] bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-gray-800/40">
      <p className="mb-1 font-bold text-slate-800 dark:text-white">{fmt ? fmt(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600 dark:text-gray-300">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color || p.fill }} />
          {p.name}: <span className="font-bold tabular-nums text-slate-800 dark:text-white">{p.value}</span>
        </p>
      ))}
    </div>
  ) : null;

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });

const Tile: React.FC<{ icon: React.ElementType; value: React.ReactNode; label: string; tone?: string; onClick?: () => void; delta?: number | null; spark?: number[]; delay?: number }> = ({
  icon: Icon, value, label, tone = "text-blue-600 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200", onClick, delta, delay = 0,
}) => {
  const Body = (
    <>
      <div className="flex items-start justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
        {delta !== undefined && delta !== null && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${delta > 0 ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" : delta < 0 ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-gray-700/50 dark:text-gray-300"}`}>
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-extrabold tabular-nums text-slate-800 dark:text-white">{value}</p>
      <p className="text-xs font-medium text-slate-600 dark:text-gray-300">{label}</p>
    </>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      {onClick ? (
        <button type="button" onClick={onClick} className={`${cardCls} w-full p-4 text-left transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30`}>{Body}</button>
      ) : (
        <div className={`${cardCls} p-4`}>{Body}</div>
      )}
    </motion.div>
  );
};

const Panel: React.FC<{ title: string; icon: React.ElementType; children: React.ReactNode; className?: string; action?: React.ReactNode }> = ({ title, icon: Icon, children, className = "", action }) => (
  <section className={`${cardCls} p-4 ${className}`}>
    <header className="mb-3 flex items-center justify-between">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white"><Icon className="h-4 w-4 text-slate-400" aria-hidden />{title}</h3>
      {action}
    </header>
    {children}
  </section>
);

/** Status pipeline: one stacked bar, segments sized by count, 2px gaps, direct labels. */
const Pipeline: React.FC<{ s: Summary; onDrill: (f: DrillFilter) => void }> = ({ s, onDrill }) => {
  const { dark } = useChartTokens();
  const total = Math.max(1, s.totals.projects);
  return (
    <div>
      <div className="flex h-12 w-full gap-[2px] overflow-hidden rounded-2xl" role="group" aria-label={STATUS_ORDER.map((st) => `${STATUS_META[st].label} ${s.totals.byStatus[st]}`).join(", ")}>
        {STATUS_ORDER.map((st) => {
          const n = s.totals.byStatus[st];
          if (!n) return null;
          const M = STATUS_META[st];
          return (
            <motion.button
              key={st}
              type="button"
              title={`${M.label}: ${n}`}
              onClick={() => onDrill({ status: st })}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: n / total }}
              transition={{ duration: 0.7 }}
              className="flex min-w-[2.5rem] basis-0 items-center justify-center gap-1.5 text-sm font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: STATUS_SOLID[st] }}
            >
              <M.icon className="h-4 w-4" aria-hidden /> {n}
            </motion.button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-gray-300">
        {STATUS_ORDER.map((st) => (
          <span key={st} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: statusColor(st, dark) }} />{STATUS_META[st].label} · {Math.round((s.totals.byStatus[st] / total) * 100)}%</span>
        ))}
      </div>
    </div>
  );
};

const Heat: React.FC<{ weeks: Summary["weeks"] }> = ({ weeks }) => {
  const dark = useIsDark();
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const ramp = dark ? SEQ_DARK : SEQ;
  return (
    <div>
      <div className="grid grid-cols-16 gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w) => {
          const i = w.count === 0 ? 0 : Math.min(ramp.length - 1, 1 + Math.floor((w.count / max) * (ramp.length - 2)));
          return (
            <motion.div key={w.week} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} className="group relative aspect-square rounded-md" style={{ backgroundColor: ramp[i] }} title={`Week of ${w.week}: ${w.count}`} tabIndex={0} role="img" aria-label={`Week of ${w.week}: ${w.count} actions`}>
              <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-bold text-white group-hover:block group-focus:block">{w.count}</span>
            </motion.div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-gray-400">
        <span>{weeks[0]?.week}</span>
        <span className="flex items-center gap-1">0 {ramp.slice(1).map((c) => <span key={c} className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c }} />)} {max}</span>
      </div>
    </div>
  );
};

const AttentionRow: React.FC<{ r: MonitorRow; onOpen: (id: number) => void }> = ({ r, onOpen }) => {
  const H = HEALTH_META[r.health];
  return (
    <button type="button" onClick={() => onOpen(r.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-gray-700/40">
      <UserAvatar name={r.student.name} src={r.student.avatar} userId={r.student.id} size={32} decorative />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{r.title}</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-gray-400">{r.student.name}{r.class ? ` · ${r.class.name}` : ""} · {timeAgo(r.lastActivityAt)}</p>
      </div>
      {r.conceptPending && <FileWarning className="h-4 w-4 text-red-500" aria-label="Concept needed" />}
      <ReviewBadge state={r.reviewState} compact />
      <H.icon className={`h-4 w-4 ${H.cls}`} aria-label={H.label} />
    </button>
  );
};

const Dashboard: React.FC<{ s: Summary; onDrill: (f: DrillFilter) => void; onOpen: (id: number) => void }> = ({ s, onDrill, onOpen }) => {
  const t = useChartTokens();
  const [table, setTable] = useState(false);
  const delta = s.totals.completedThisTerm - s.totals.completedPreviousTerm;
  const classData = useMemo(() => s.byClass.slice(0, 12).map((c) => ({ ...c, label: c.name })), [s.byClass]);
  const detail = s.depth === "detail";
  const drill = (f: DrillFilter) => detail && onDrill(f);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Tile icon={FolderKanban} value={s.totals.projects} label="Projects" delay={0} onClick={detail ? () => onDrill({}) : undefined} />
        <Tile icon={Users} value={s.totals.participation !== null ? `${s.totals.participation}%` : s.totals.students} label={s.totals.participation !== null ? `${s.totals.studentOwners} of ${s.totals.population} students` : "Owners"} tone="text-blue-700 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200" delay={0.03} />
        <Tile icon={BadgeCheck} value={s.totals.completedThisTerm} label={`Completed · ${s.totals.termLabel}`} delta={delta} tone="text-green-700 bg-green-50 dark:bg-green-500/15 dark:text-green-200" delay={0.06} onClick={detail ? () => onDrill({ status: "COMPLETED" }) : undefined} />
        <Tile icon={Hourglass} value={s.totals.awaitingVerification} label="Awaiting verification" tone="text-blue-700 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200" delay={0.09} onClick={detail ? () => onDrill({ review: "AWAITING_VERIFICATION" }) : undefined} />
        <Tile icon={PauseCircle} value={s.totals.stale} label="No recent activity" tone="text-amber-700 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-200" delay={0.12} onClick={detail ? () => onDrill({ health: "STALE" }) : undefined} />
        <Tile icon={Clock3} value={s.totals.overdue} label="Overdue" tone="text-red-700 bg-red-50 dark:bg-red-500/15 dark:text-red-200" delay={0.15} onClick={detail ? () => onDrill({ health: "OVERDUE" }) : undefined} />
        <Tile icon={AlertOctagon} value={s.totals.blocked} label="Blocked" tone="text-orange-700 bg-orange-50 dark:bg-orange-500/15 dark:text-orange-200" delay={0.18} onClick={detail ? () => onDrill({ health: "BLOCKED" }) : undefined} />
        <Tile icon={FileWarning} value={s.totals.conceptPending} label="Concept needed" tone="text-rose-700 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-200" delay={0.21} onClick={detail ? () => onDrill({ missing: "CONCEPT" }) : undefined} />
        <Tile icon={Github} value={s.totals.projects ? `${Math.round((s.totals.withGithub / s.totals.projects) * 100)}%` : "—"} label="With GitHub" tone="text-slate-700 bg-slate-100 dark:bg-gray-700/50 dark:text-gray-200" delay={0.24} onClick={detail ? () => onDrill({ hasGithub: "1" }) : undefined} />
        <Tile icon={AlertTriangle} value={s.totals.changesRequested} label="Changes requested" tone="text-yellow-800 bg-yellow-50 dark:bg-yellow-500/15 dark:text-yellow-200" delay={0.3} onClick={detail ? () => onDrill({ review: "CHANGES_REQUESTED" }) : undefined} />
        <Tile icon={Briefcase} value={s.totals.staffProjects} label="Staff & others' projects" tone="text-slate-700 bg-slate-100 dark:bg-gray-700/50 dark:text-gray-200" delay={0.36} onClick={detail ? () => onDrill({ ownerType: "STAFF" }) : undefined} />
        <Tile icon={Activity} value={`${s.totals.avgProgress}%`} label="Average progress" tone="text-blue-700 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200" delay={0.33} />
      </div>

      <Panel
        title="Pipeline"
        icon={FolderKanban}
        action={
          s.totals.byKind ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Projects by type">
              {KINDS.map((k) => {
                const K = KIND_META[k];
                return (
                  <button key={k} type="button" disabled={!detail} onClick={() => drill({ kind: k })} title={K.label} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition enabled:hover:bg-slate-200 dark:bg-gray-700/60 dark:text-gray-200 dark:enabled:hover:bg-gray-700">
                    <K.icon className="h-3.5 w-3.5" aria-hidden /> {K.short}
                    <span className="tabular-nums text-slate-900 dark:text-white">{s.totals.byKind?.[k] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
      >
        <Pipeline s={s} onDrill={drill} />
      </Panel>

      {s.stages && s.reporting && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <StageInsights s={s} onOpen={onOpen} detail={detail} />
          </div>
          <ReportingInsights s={s} onOpen={onOpen} detail={detail} />
        </div>
      )}

      <DeliveryInsights s={s} onOpen={onOpen} detail={detail} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Started vs completed" icon={TrendingUp} className="lg:col-span-2" action={<button type="button" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700/50" aria-pressed={table} aria-label="Show as table" onClick={() => setTable((v) => !v)}><Table2 className="h-4 w-4" /></button>}>
          {table ? (
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Month</th><th>Started</th><th>Completed</th></tr></thead>
                <tbody>{s.months.map((m) => <tr key={m.month} className="border-t border-slate-900/[0.05] dark:border-white/[0.06]"><td className="py-1">{monthLabel(m.month)}</td><td className="tabular-nums">{m.created}</td><td className="tabular-nums">{m.completed}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={s.months} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spCreated" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.s1} stopOpacity={0.25} /><stop offset="100%" stopColor={t.s1} stopOpacity={0} /></linearGradient>
                      <linearGradient id="spDone" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.s3} stopOpacity={0.25} /><stop offset="100%" stopColor={t.s3} stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={t.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip fmt={monthLabel} />} cursor={{ stroke: t.axis, strokeDasharray: "3 3" }} />
                    <Area type="monotone" dataKey="created" name="Started" stroke={t.s1} strokeWidth={2} fill="url(#spCreated)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: t.dark ? "#1e293b" : "#fff" }} />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke={t.s3} strokeWidth={2} fill="url(#spDone)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: t.dark ? "#1e293b" : "#fff" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex gap-4 text-xs text-slate-600 dark:text-gray-300">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: t.s1 }} />Started</span>
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ backgroundColor: t.s3 }} />Completed</span>
              </div>
            </>
          )}
        </Panel>
        <Panel title="Activity · 16 weeks" icon={Activity}>
          <Heat weeks={s.weeks} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="By class" icon={Users} className="lg:col-span-2">
          {classData.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">—</p>
          ) : (
            <>
              <div style={{ height: Math.max(160, classData.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap={6}>
                    <CartesianGrid horizontal={false} stroke={t.grid} strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: t.axis }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} cursor={{ fill: t.dark ? "#33415555" : "#f1f5f9" }} />
                    {STATUS_ORDER.map((st, i) => (
                      <Bar key={st} dataKey={st} name={STATUS_META[st].label} stackId="s" fill={statusColor(st, t.dark)} stroke={t.dark ? "#1e293b" : "#fff"} strokeWidth={2} radius={i === STATUS_ORDER.length - 1 ? [0, 4, 4, 0] : 0} cursor={detail ? "pointer" : undefined}
                        onClick={(d: any) => detail && d?.classId && onDrill({ classId: d.classId, status: st })} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 dark:text-gray-300">
                {STATUS_ORDER.map((st) => <span key={st} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: statusColor(st, t.dark) }} />{STATUS_META[st].label}</span>)}
              </div>
            </>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Categories" icon={FolderKanban}>
            <ul className="space-y-2">
              {s.byCategory.map((c) => {
                const max = Math.max(1, ...s.byCategory.map((x) => x.count));
                return (
                  <li key={c.name} className="text-xs">
                    <div className="mb-0.5 flex justify-between text-slate-600 dark:text-gray-300"><span>{c.name}</span><span className="font-bold tabular-nums text-slate-800 dark:text-white">{c.count}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700/50"><motion.div className="h-full rounded-full" style={{ backgroundColor: t.s1 }} initial={{ width: 0 }} animate={{ width: `${(c.count / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Technologies" icon={Activity}>
            <div className="flex flex-wrap gap-1.5">
              {s.topTech.map((x, i) => {
                const max = Math.max(1, s.topTech[0]?.count ?? 1);
                const w = 0.75 + (x.count / max) * 0.5;
                return (
                  <motion.span key={x.tag} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className="rounded-lg bg-blue-50 px-2 py-1 font-semibold text-blue-800 dark:bg-blue-500/15 dark:text-blue-100" style={{ fontSize: `${w}rem` }} title={`${x.count} projects`}>
                    {x.tag} <span className="text-[10px] font-bold opacity-70">{x.count}</span>
                  </motion.span>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {detail && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Needs attention" icon={AlertTriangle}>
            {s.attention.length === 0 ? <p className="flex items-center justify-center gap-2 py-6 text-sm text-green-700 dark:text-green-400"><BadgeCheck className="h-5 w-5" /> All clear</p> : s.attention.map((r) => <AttentionRow key={r.id} r={r} onOpen={onOpen} />)}
          </Panel>
          <Panel title="Recently completed" icon={BadgeCheck}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {s.recentCompleted.map((r) => {
                const Icon = CATEGORY_ICON[r.category?.icon ?? "sparkles"] ?? CATEGORY_ICON.sparkles;
                return (
                  <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="group relative aspect-[4/3] overflow-hidden rounded-xl text-left" style={{ background: `linear-gradient(135deg, ${r.category?.color ?? t.s3}, ${(r.category?.color ?? t.s3)}88)` }}>
                    {r.coverAssetId ? <img src={fileUrl(r.coverAssetId, "thumb")} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" /> : <Icon className="absolute right-2 top-2 h-8 w-8 text-white/40" aria-hidden />}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2">
                      <span className="line-clamp-1 text-xs font-bold text-white">{r.title}</span>
                      <span className="line-clamp-1 text-[10px] text-white/80">{r.student.name}</span>
                    </span>
                    {r.reviewState === "VERIFIED" && <BadgeCheck className="absolute left-2 top-2 h-5 w-5 text-white " aria-label="Verified" />}
                  </button>
                );
              })}
              {s.recentCompleted.length === 0 && <p className="col-span-full py-6 text-center text-sm text-slate-500">—</p>}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
