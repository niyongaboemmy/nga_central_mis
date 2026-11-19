import React, { useMemo } from "react";
import { ArrowUpRight, CircleDot, NotebookPen, Target } from "lucide-react";
import type { PlanData, PlanItem, ProjectDetail } from "../../../api/sideProjects";
import { PLAN_FLOW, PLAN_META } from "../work/meta";
import { ProgressRing, cardCls, pathStage, statusColor, useIsDark } from "../ui";

const DAY = 86_400_000;
const ACTIVE = new Set(["IN_PROGRESS", "IN_REVIEW", "BLOCKED"]);
const STALE_DAYS = 7;

/** Switches the project workspace to another section (handled by ProjectDrawer). */
export const openSection = (tab: string, item?: number | null) => window.dispatchEvent(new CustomEvent("sp:open", { detail: { tab, item: item ?? null } }));

const daysSince = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - Date.parse(`${iso}T00:00:00Z`)) / DAY) : null);

/**
 * Progress on the Progress tab once a plan exists: the project's % is features done / features
 * (the same rule as everywhere), the mix of feature states, each phase, how much of the active
 * work was reported on this week, and the active features nobody has reported on lately, each
 * with a one-click report.
 */
const PlanProgress: React.FC<{
  p: ProjectDetail;
  plan: PlanData;
  canReport: boolean;
  onReportOn: (itemId: number) => void;
  onShowReports: (itemId: number) => void;
}> = ({ p, plan, canReport, onReportOn, onShowReports }) => {
  const dark = useIsDark();
  const features = useMemo(() => plan.items.filter((i) => i.kind === "FEATURE" && i.status !== "CANCELLED"), [plan.items]);
  const phases = useMemo(() => plan.items.filter((i) => i.kind === "PHASE"), [plan.items]);
  const done = features.filter((f) => f.status === "DONE").length;
  const active = features.filter((f) => ACTIVE.has(f.status));
  const reportedThisWeek = active.filter((f) => {
    const d = daysSince(f.lastReport);
    return d !== null && d < STALE_DAYS;
  }).length;
  const quiet = active
    .filter((f) => {
      const d = daysSince(f.lastReport);
      return d === null || d >= STALE_DAYS;
    })
    .sort((a, b) => (daysSince(b.lastReport) ?? 9999) - (daysSince(a.lastReport) ?? 9999));
  const reportedHours = features.reduce((s, f) => s + (f.reportedHours ?? 0), 0);
  const estimate = features.reduce((s, f) => s + (f.estimateHours ?? 0), 0);
  const byStatus = PLAN_FLOW.filter((s) => s !== "CANCELLED").map((s) => ({ s, n: features.filter((f) => f.status === s).length })).filter((x) => x.n > 0);

  const phaseRow = (ph: PlanItem | null) => {
    const list = features.filter((f) => (ph ? f.parentId === ph.id : !f.parentId));
    if (!list.length) return null;
    const d = list.filter((f) => f.status === "DONE").length;
    const pct = Math.round((d / list.length) * 100);
    const reports = list.reduce((s, f) => s + (f.reports ?? 0), 0);
    return (
      <li key={ph?.id ?? "none"}>
        <button type="button" onClick={() => openSection("plan")} className="group w-full rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-gray-800/50">
          <span className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-semibold text-slate-800 dark:text-gray-100">{ph?.title ?? "Other features"}</span>
            <span className="shrink-0 tabular-nums text-slate-500 dark:text-gray-400">
              {d}/{list.length}
              {reports > 0 && <span className="ml-1.5">· {reports} report{reports === 1 ? "" : "s"}</span>}
            </span>
          </span>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <span className="block h-full rounded-full bg-blue-600 transition-all dark:bg-blue-400" style={{ width: `${pct}%` }} />
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className={`${cardCls} p-4`} aria-labelledby="sp-plan-progress">
      <div className="flex items-center gap-3">
        <ProgressRing value={p.progress} size={52} stroke={5} color={statusColor(pathStage(p.status, p.pausedFrom), dark)} label={`${p.progress}% done`} />
        <div className="min-w-0 flex-1">
          <h3 id="sp-plan-progress" className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <Target className="h-4 w-4" aria-hidden /> Plan progress
          </h3>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            {done} of {features.length} features done
          </p>
        </div>
        <button type="button" onClick={() => openSection("plan")} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Open the plan" title="Open the plan">
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      {/* Mix of feature states */}
      {byStatus.length > 0 && (
        <div className="mt-3">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {byStatus.map((x) => (
              <span key={x.s} className={`${PLAN_META[x.s].dot} h-full`} style={{ flexGrow: x.n }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-gray-300">
            {byStatus.map((x) => (
              <li key={x.s} className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${PLAN_META[x.s].dot}`} aria-hidden /> {PLAN_META[x.s].label} <span className="tabular-nums text-slate-500 dark:text-gray-400">{x.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reporting against the plan */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {reportedThisWeek}
            <span className="text-xs font-medium text-slate-500 dark:text-gray-400">/{active.length}</span>
          </p>
          <p className="text-[11px] text-slate-600 dark:text-gray-300">active features reported this week</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
            {Math.round(reportedHours * 10) / 10}
            <span className="text-xs font-medium text-slate-500 dark:text-gray-400">{estimate ? ` / ${Math.round(estimate)}h` : "h"}</span>
          </p>
          <p className="text-[11px] text-slate-600 dark:text-gray-300">{estimate ? "hours reported of the estimate" : "hours reported on the plan"}</p>
        </div>
      </div>

      {/* Active work nobody reported on lately */}
      {quiet.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 px-1 text-xs font-semibold text-slate-800 dark:text-gray-100">Needs a report</p>
          <ul className="space-y-0.5">
            {quiet.slice(0, 5).map((f) => {
              const d = daysSince(f.lastReport);
              return (
                <li key={f.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-gray-800/50">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${PLAN_META[f.status].dot}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-800 dark:text-gray-100">{f.title}</span>
                    <span className="block text-[11px] text-amber-700 dark:text-amber-300">{d === null ? "Never reported on" : `Last report ${d} days ago`}</span>
                  </span>
                  {canReport && (
                    <button type="button" onClick={() => onReportOn(f.id)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">
                      <NotebookPen className="h-3 w-3" aria-hidden /> Report
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Phases */}
      <div className="mt-3">
        <p className="mb-1 px-1 text-xs font-semibold text-slate-800 dark:text-gray-100">Phases</p>
        <ul className="space-y-0.5">
          {phases.map((ph) => phaseRow(ph))}
          {phaseRow(null)}
        </ul>
      </div>

      {/* Most reported features */}
      {features.some((f) => (f.reports ?? 0) > 0) && (
        <div className="mt-3">
          <p className="mb-1 px-1 text-xs font-semibold text-slate-800 dark:text-gray-100">Most reported</p>
          <ul className="flex flex-wrap gap-1.5 px-1">
            {[...features]
              .filter((f) => (f.reports ?? 0) > 0)
              .sort((a, b) => (b.reports ?? 0) - (a.reports ?? 0))
              .slice(0, 6)
              .map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => onShowReports(f.id)} className="inline-flex max-w-[14rem] items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-800 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-blue-500/15 dark:hover:text-blue-200">
                    <CircleDot className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{f.title}</span>
                    <span className="shrink-0 tabular-nums opacity-80">{f.reports}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default PlanProgress;
