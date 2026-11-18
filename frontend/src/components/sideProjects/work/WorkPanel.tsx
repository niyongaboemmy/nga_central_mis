import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { BarChart3, Check, ChevronDown, KanbanSquare, ListTree, RefreshCw } from "lucide-react";
import { failure, sideProjectsApi, type PlanData, type ProjectDetail } from "../../../api/sideProjects";
import { Skeleton, cardCls } from "../ui";
import PlanView from "./PlanView";
import { ROLE_META } from "./meta";
import TasksView from "./TasksView";
import InsightsView from "./InsightsView";

export type View = "plan" | "tasks" | "insights";
export type Teammate = { id: number; name: string; avatar?: string | null; role?: string | null; invited?: boolean; owner?: boolean };

/** The team: owner first, then teammates (accepted, then invited); everyone can be given work. */
export const teamOf = (p: ProjectDetail): Teammate[] => [
  { id: p.owner.id, name: p.owner.name, avatar: p.owner.avatar, role: "Owner", owner: true },
  ...[...p.members]
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "ACCEPTED" ? -1 : 1))
    .map((m) => ({ id: m.id, name: m.name, role: m.roleTitle || ROLE_META[m.roleKey]?.label || null, invited: m.status === "INVITED" })),
];

const MENU_W = 248;
const GAP = 6;
const EDGE = 12;

/**
 * Popover for picking a status (plan item or task). It renders in a portal with fixed
 * positioning, so cards that clip their overflow never cut it off; it opens below the trigger,
 * flips above when there is more room there, stays inside the window and scrolls when taller
 * than the space. Arrow keys / Home / End move, Enter picks, Escape closes.
 */
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
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const want = Math.min(options.length * 54 + 44, 460);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = below < want && above > below;
    const left = Math.max(EDGE, Math.min(r.left, vw - MENU_W - EDGE));
    setPos(up ? { left, bottom: vh - r.top + GAP, maxH: Math.max(160, above), up } : { left, top: r.bottom + GAP, maxH: Math.max(160, below), up });
  }, [options.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true); // any scrolling ancestor
    const at = Math.max(0, options.indexOf(value));
    requestAnimationFrame(() => items.current[at]?.focus());
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, options, value]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = items.current.filter(Boolean) as HTMLButtonElement[];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => (e.preventDefault(), list[(n + list.length) % list.length]?.focus());
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  if (disabled) return <>{children}</>;
  return (
    <span className="relative inline-flex">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) (e.preventDefault(), setOpen(true));
        }}
        className="inline-flex items-center gap-0.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {children}
        <ChevronDown className={`h-3 w-3 text-slate-400 transition dark:text-gray-500 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <motion.div
            ref={menu}
            role="menu"
            aria-label={label}
            initial={{ opacity: 0, y: pos.up ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={onMenuKey}
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_W, maxHeight: pos.maxH, transformOrigin: pos.up ? "bottom left" : "top left" }}
            className="z-[80] flex flex-col overflow-hidden rounded-2xl border border-slate-900/[0.08] bg-white dark:border-white/10 dark:bg-gray-900"
          >
            <p className="shrink-0 px-3.5 pb-1 pt-3 text-xs font-medium text-slate-500 dark:text-gray-400">Set status</p>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-1.5 pt-0.5 [scrollbar-width:thin]">
              {options.map((o, n) => {
                const M = meta[o];
                const on = o === value;
                return (
                  <button
                    key={o}
                    ref={(el) => (items.current[n] = el)}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      setOpen(false);
                      trigger.current?.focus();
                      if (!on) onPick(o);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition focus-visible:bg-slate-100 dark:focus-visible:bg-gray-800 ${on ? "bg-blue-50 dark:bg-blue-500/10" : "hover:bg-slate-50 dark:hover:bg-gray-800/70"}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-gray-400"}`}>
                      <M.icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-gray-100">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${M.dot}`} aria-hidden />
                        {M.label}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{M.hint}</span>
                    </span>
                    {on && <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </motion.div>,
          document.body,
        )}
    </span>
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
