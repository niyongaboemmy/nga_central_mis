import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, ChevronDown, KanbanSquare, ListTree, RefreshCw } from "lucide-react";
import { failure, sideProjectsApi, type PlanData, type ProjectDetail } from "../../../api/sideProjects";
import { Skeleton, cardCls } from "../ui";
import PlanView from "./PlanView";
import TasksView from "./TasksView";
import InsightsView from "./InsightsView";

export type View = "plan" | "tasks" | "insights";
export type Teammate = { id: number; name: string; avatar?: string | null };

/** The team: owner first, then accepted teammates. */
export const teamOf = (p: ProjectDetail): Teammate[] => [
  { id: p.owner.id, name: p.owner.name, avatar: p.owner.avatar },
  ...p.members.filter((m) => m.status === "ACCEPTED").map((m) => ({ id: m.id, name: m.name })),
];

/** A small popover menu for picking a status (plan item or task). */
export function StatusMenu<T extends string>({
  value,
  options,
  meta,
  onPick,
  disabled,
  label,
  children,
}: {
  value: T;
  options: T[];
  meta: Record<T, { label: string; icon: React.ElementType; hint: string; dot: string }>;
  onPick: (v: T) => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setOpen(false));
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open]);
  if (disabled) return <>{children}</>;
  return (
    <div ref={box} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className="inline-flex items-center gap-0.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {children}
        <ChevronDown className="h-3 w-3 text-slate-400 dark:text-gray-500" aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-0 top-7 z-40 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
          {options.map((o) => {
            const M = meta[o];
            return (
              <button
                key={o}
                type="button"
                role="menuitemradio"
                aria-checked={o === value}
                onClick={() => (setOpen(false), o !== value && onPick(o))}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${o === value ? "bg-slate-100 dark:bg-gray-800" : "hover:bg-slate-50 dark:hover:bg-gray-800/70"}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${M.dot}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-gray-100">{M.label}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-gray-400">{M.hint}</span>
                </span>
                <M.icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-gray-500" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The project's Plan tab: Plan (phases -> features), Tasks (board / list) and Insights, over
 * one shared load of the plan and its tasks.
 */
const WorkPanel: React.FC<{ p: ProjectDetail; meId: number; onChanged: () => void; wide?: boolean }> = ({ p, meId, onChanged, wide }) => {
  const [data, setData] = useState<PlanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem("sp.work.view") as View) || "plan";
    } catch {
      return "plan";
    }
  });
  const [focusItem, setFocusItem] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await sideProjectsApi.plan(p.id));
    } catch (e) {
      setError(failure(e, "The plan couldn't load").message);
    }
  }, [p.id]);
  useEffect(() => {
    load();
  }, [load]);
  const refresh = useCallback(() => {
    load();
    onChanged();
  }, [load, onChanged]);
  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("sp.work.view", v);
    } catch {
      /* private mode */
    }
  };
  const team = useMemo(() => teamOf(p), [p]);
  const open = data?.tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED").length ?? 0;

  const tabs: Array<{ key: View; label: string; icon: React.ElementType; count?: number }> = [
    { key: "plan", label: "Plan", icon: ListTree, count: data?.items.filter((i) => i.kind === "FEATURE").length },
    { key: "tasks", label: "Tasks", icon: KanbanSquare, count: data ? open : undefined },
    { key: "insights", label: "Insights", icon: BarChart3 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full bg-slate-100 p-1 dark:bg-gray-800/80" role="tablist" aria-label="Plan views">
          {tabs.map((t) => {
            const on = view === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pick(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  on ? "bg-white text-slate-900 dark:bg-gray-950 dark:text-white" : "text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                <t.icon className={`h-4 w-4 ${on ? "text-blue-600 dark:text-blue-400" : ""}`} aria-hidden />
                {t.label}
                {t.count !== undefined && t.count > 0 && <span className="text-[11px] font-medium tabular-nums text-slate-600 dark:text-gray-300">{t.count}</span>}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={load} aria-label="Refresh" title="Refresh" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <div className={`${cardCls} p-6 text-center`}>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          <button type="button" onClick={load} className="mt-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
            Retry
          </button>
        </div>
      ) : !data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading the plan">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : view === "plan" ? (
        <PlanView p={p} data={data} team={team} meId={meId} onChanged={refresh} onOpenTasks={(itemId) => (setFocusItem(itemId), pick("tasks"))} />
      ) : view === "tasks" ? (
        <TasksView p={p} data={data} team={team} meId={meId} onChanged={refresh} focusItem={focusItem} onClearFocus={() => setFocusItem(null)} wide={wide} />
      ) : (
        <InsightsView p={p} refreshKey={data.tasks.map((t) => `${t.id}${t.status}${t.spentHours}`).join()} />
      )}
    </div>
  );
};

export default WorkPanel;
