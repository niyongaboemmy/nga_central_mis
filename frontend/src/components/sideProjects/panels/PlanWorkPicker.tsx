import React, { useMemo, useState } from "react";
import { CircleDot, ListChecks, Plus, Search, Sparkles, X } from "lucide-react";
import type { PlanData, PlanItem, PlanStatus, Task, TaskStatus } from "../../../api/sideProjects";
import { StatusMenu } from "../work/WorkPanel";
import { PLAN_FLOW, PLAN_META, StatusChip, TASK_FLOW, TASK_META } from "../work/meta";
import { inputCls } from "../ui";

/** A line of a report while it is being written. */
export type WorkLineDraft = { key: string; itemId: number; taskId: number | null; hours: number | null; status: string | null };

export const lineKey = (itemId: number, taskId: number | null) => (taskId ? `t${taskId}` : `i${itemId}`);

const OPEN_TASK = (t: Task) => t.status !== "DONE" && t.status !== "CANCELLED";

/**
 * "What did you work on?": the report's lines picked from the implementation plan. You report on
 * your own work: your assigned tasks come first; unassigned tasks (reporting takes them) and
 * features you are accountable for or that have no tasks can be added too. The owner and team
 * managers can pick anything. Each line
 * takes the hours spent and, where allowed, a new state (tasks: assignee or manager; features:
 * managers only, otherwise they follow their tasks).
 */
const PlanWorkPicker: React.FC<{
  plan: PlanData;
  meId: number;
  manage: boolean;
  lines: WorkLineDraft[];
  onChange: (lines: WorkLineDraft[]) => void;
  error?: string | null;
}> = ({ plan, meId, manage, lines, onChange, error }) => {
  const [q, setQ] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const items = useMemo(() => new Map(plan.items.map((i) => [i.id, i])), [plan.items]);
  const features = useMemo(() => plan.items.filter((i) => i.kind === "FEATURE" && i.status !== "CANCELLED"), [plan.items]);
  const phaseOf = (it: PlanItem | undefined) => (it?.parentId ? items.get(it.parentId)?.title ?? null : null);
  const chosen = new Set(lines.map((l) => l.key));

  // What this person may report on (the server applies the same rules).
  const taskAllowed = (t: Task) => manage || t.assigneeId === meId || t.assigneeId === null;
  const featureAllowed = (f: PlanItem) => manage || f.ownerId === meId || !plan.tasks.some((t) => t.planItemId === f.id && t.status !== "CANCELLED");
  const myTasks = plan.tasks.filter((t) => t.assigneeId === meId && OPEN_TASK(t) && !chosen.has(lineKey(t.planItemId, t.id)));
  const myAllTasks = plan.tasks.filter((t) => t.assigneeId === meId && OPEN_TASK(t));
  const needle = q.trim().toLowerCase();
  const matchFeatures = features.filter((f) => featureAllowed(f) && !chosen.has(lineKey(f.id, null)) && (!needle || f.title.toLowerCase().includes(needle) || (phaseOf(f) ?? "").toLowerCase().includes(needle)));
  const matchTasks = plan.tasks
    .filter((t) => OPEN_TASK(t) && taskAllowed(t) && !chosen.has(lineKey(t.planItemId, t.id)) && (!needle || t.title.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.assigneeId === meId) - Number(a.assigneeId === meId));

  const add = (itemId: number, taskId: number | null) => {
    const key = lineKey(itemId, taskId);
    if (chosen.has(key)) return;
    onChange([...lines, { key, itemId, taskId, hours: null, status: null }]);
  };
  const patch = (key: string, x: Partial<WorkLineDraft>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...x } : l)));
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  const canMoveTask = (t: Task) => manage || t.assigneeId === meId || t.assigneeId === null;

  return (
    <div className="space-y-3">
      {/* Chosen lines */}
      {lines.length > 0 && (
        <ul className="space-y-1.5">
          {lines.map((l) => {
            const t = l.taskId ? plan.tasks.find((x) => x.id === l.taskId) : null;
            const it = items.get(l.itemId);
            const title = t ? t.title : it?.title ?? "Plan item";
            const sub = t ? [phaseOf(it), it?.title].filter(Boolean).join(" › ") : phaseOf(it) ?? "Feature";
            const current = (l.status ?? (t ? t.status : it?.status)) as string;
            return (
              <li key={l.key} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300">
                  {t ? <ListChecks className="h-3.5 w-3.5" aria-hidden /> : <CircleDot className="h-3.5 w-3.5" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-gray-100">{title}</span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{t ? `Task · ${sub}` : `Feature${sub !== "Feature" ? ` · ${sub}` : ""}`}</span>
                </span>
                {t ? (
                  <StatusMenu<TaskStatus> value={current as TaskStatus} options={TASK_FLOW} meta={TASK_META} onPick={(s) => patch(l.key, { status: s === t.status ? null : s })} disabled={!canMoveTask(t)} label={`State of ${title}`}>
                    <StatusChip meta={TASK_META[current as TaskStatus]} />
                  </StatusMenu>
                ) : it ? (
                  <StatusMenu<PlanStatus> value={current as PlanStatus} options={PLAN_FLOW} meta={PLAN_META} onPick={(s) => patch(l.key, { status: s === it.status ? null : s })} disabled={!manage} label={`Status of ${title}`}>
                    <StatusChip meta={PLAN_META[current as PlanStatus]} />
                  </StatusMenu>
                ) : null}
                <label className="sr-only" htmlFor={`wl-h-${l.key}`}>Hours on {title}</label>
                <span className="relative">
                  <input
                    id={`wl-h-${l.key}`}
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.5}
                    inputMode="decimal"
                    placeholder="hrs"
                    value={l.hours ?? ""}
                    onChange={(e) => patch(l.key, { hours: e.target.value === "" ? null : Number(e.target.value) })}
                    className={`${inputCls} !min-h-[32px] !w-[4.5rem] !rounded-lg !py-1 !pl-2.5 !pr-6 text-xs tabular-nums`}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 dark:text-gray-400">h</span>
                </span>
                <button type="button" onClick={() => remove(l.key)} aria-label={`Remove ${title}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Suggestions: your open tasks */}
      {myTasks.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-gray-400">
            <Sparkles className="h-3 w-3" aria-hidden /> Your assigned tasks
          </p>
          <div className="flex flex-wrap gap-1.5">
            {myTasks.slice(0, 8).map((t) => (
              <button key={t.id} type="button" onClick={() => add(t.planItemId, t.id)} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20">
                <Plus className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!manage && myAllTasks.length === 0 && lines.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          No task is assigned to you yet. Ask the owner to assign you one in the Plan, or pick an unassigned task below (reporting on it makes it yours).
        </p>
      )}

      {/* Browse the plan */}
      {browsing ? (
        <div className="rounded-2xl border border-slate-900/[0.07] p-2 dark:border-white/[0.08]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search features and tasks" aria-label="Search the plan" className={`${inputCls} !min-h-[36px] !pl-9 text-sm`} />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto overscroll-contain [scrollbar-width:thin]" role="listbox" aria-label="Plan items">
            {matchFeatures.length === 0 && matchTasks.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-500 dark:text-gray-400">Nothing matches.</p>
            ) : (
              <>
                {matchTasks.length > 0 && <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-slate-500 dark:text-gray-400">Tasks</p>}
                {matchTasks.slice(0, 30).map((t) => (
                  <button key={`t${t.id}`} type="button" role="option" aria-selected={false} onClick={() => add(t.planItemId, t.id)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-gray-800/70">
                    <ListChecks className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800 dark:text-gray-100">{t.title}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{items.get(t.planItemId)?.title}</span>
                    </span>
                    {t.assigneeId === null && <span className="shrink-0 text-[10px] font-semibold text-slate-500 dark:text-gray-400">unassigned</span>}
                    <StatusChip meta={TASK_META[t.status]} />
                  </button>
                ))}
                {matchFeatures.length > 0 && <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-slate-500 dark:text-gray-400">Features</p>}
                {matchFeatures.slice(0, 30).map((f) => (
                  <button key={`f${f.id}`} type="button" role="option" aria-selected={false} onClick={() => add(f.id, null)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-gray-800/70">
                    <CircleDot className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800 dark:text-gray-100">{f.title}</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{phaseOf(f) ?? "Feature"}</span>
                    </span>
                    <StatusChip meta={PLAN_META[f.status]} />
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={() => (setBrowsing(false), setQ(""))} className="rounded-full px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800">
              Done
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setBrowsing(true)} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/10">
          <Plus className="h-3.5 w-3.5" aria-hidden /> {lines.length ? "Add another" : manage ? "Choose from the plan" : "More of your work"}
        </button>
      )}
      {error && <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </div>
  );
};

export default PlanWorkPicker;
