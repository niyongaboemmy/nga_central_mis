import React, { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Clock3, KanbanSquare, List, Plus, Search, X } from "lucide-react";
import { failure, sideProjectsApi, type PlanData, type ProjectDetail, type Task, type TaskStatus } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import UserAvatar from "../../ui/UserAvatar";
import SelectField from "../../ui/SelectField";
import { cardCls, chipCls, primaryBtn } from "../ui";
import { PriorityMark, StatusChip, TASK_FLOW, TASK_META, fmtDay } from "./meta";
import type { Teammate } from "./WorkPanel";
import { BlockedReason, TaskDetailModal, TaskModal, planOptions } from "./TaskModals";

const selectCls =
  "min-w-0 max-w-full rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";

const TaskCard: React.FC<{ t: Task; itemTitle: string; onOpen: () => void; draggable: boolean }> = ({ t, itemTitle, onOpen, draggable }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id, disabled: !draggable });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }} className={`touch-manipulation ${isDragging ? "z-30 opacity-80" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}>
      <button
        type="button"
        {...(draggable ? listeners : {})}
        {...(draggable ? attributes : {})}
        aria-roledescription={draggable ? "draggable task" : undefined}
        aria-label={`${t.title}, ${t.status.toLowerCase().replace("_", " ")}`}
        onClick={onOpen}
        className="w-full rounded-xl border border-slate-200/80 bg-white p-3 text-left transition hover:border-blue-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-500/50"
      >
        <p className="line-clamp-1 text-[11px] font-medium text-slate-500 dark:text-gray-400">{itemTitle}</p>
        <p className={`mt-0.5 line-clamp-2 text-sm font-semibold leading-snug ${t.status === "DONE" ? "text-slate-500 line-through dark:text-gray-400" : "text-slate-800 dark:text-gray-100"}`}>{t.title}</p>
        {t.status === "BLOCKED" && t.blockedReason && <p className="mt-1 line-clamp-2 text-[11px] text-red-700 dark:text-red-300">{t.blockedReason}</p>}
        <div className="mt-2.5 flex items-center gap-2">
          <PriorityMark priority={t.priority} />
          {t.dueDate && (
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${t.overdue ? "font-bold text-red-700 dark:text-red-300" : "text-slate-500 dark:text-gray-400"}`}>
              <CalendarDays className="h-3 w-3" aria-hidden /> {fmtDay(t.dueDate)}
            </span>
          )}
          {(t.spentHours > 0 || t.estimateHours) && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums text-slate-500 dark:text-gray-400">
              <Clock3 className="h-3 w-3" aria-hidden /> {t.spentHours}
              {t.estimateHours ? `/${t.estimateHours}` : ""}h
            </span>
          )}
          <span className="ml-auto">
            {t.assigneeName ? <UserAvatar name={t.assigneeName} userId={t.assigneeId ?? undefined} size={22} decorative /> : <span className="block h-[22px] w-[22px] rounded-full border border-dashed border-slate-300 dark:border-gray-600" title="Unassigned" />}
          </span>
        </div>
      </button>
    </div>
  );
};

const Column: React.FC<{ status: TaskStatus; count: number; children: React.ReactNode }> = ({ status, count, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  const M = TASK_META[status];
  return (
    <section ref={setNodeRef} aria-label={`${M.label} column`} className={`flex min-h-[14rem] w-64 shrink-0 snap-start flex-col rounded-2xl p-2 transition xl:w-auto xl:min-w-[13rem] xl:flex-1 ${isOver ? "bg-blue-50 ring-2 ring-blue-400 dark:bg-blue-500/10 dark:ring-blue-500/60" : "bg-slate-100/70 dark:bg-gray-900/60"}`}>
      <header className="mb-2 flex items-center gap-2 px-1.5 pt-1">
        <span className={`h-2 w-2 rounded-full ${M.dot}`} aria-hidden />
        <h4 className="text-xs font-bold text-slate-700 dark:text-gray-200">{M.label}</h4>
        <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-gray-400">{count}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </section>
  );
};

/**
 * Tasks: a board by state (drag a card to move it; managers move any card, teammates their
 * own) or a list. Filters: mine, a teammate, a plan item, priority, search.
 */
const TasksView: React.FC<{ p: ProjectDetail; data: PlanData; team: Teammate[]; meId: number; onChanged: () => void; focusItem: number | null; onClearFocus: () => void; wide?: boolean }> = ({ p, data, team, meId, onChanged, focusItem, onClearFocus }) => {
  const { showToast } = useToast();
  const [view, setView] = useState<"board" | "list">("board");
  const [who, setWho] = useState<string>("all");
  const [item, setItem] = useState<string>(focusItem ? String(focusItem) : "all");
  const [q, setQ] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [modal, setModal] = useState<{ task: Task | null } | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [blocking, setBlocking] = useState<{ id: number } | null>(null);
  const [moving, setMoving] = useState(false);
  const [local, setLocal] = useState<Record<number, TaskStatus>>({});
  const opts = planOptions(data);
  const itemTitle = useMemo(() => new Map(data.items.map((i) => [i.id, i.title])), [data.items]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), useSensor(KeyboardSensor));

  const tasks = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.tasks
      .map((t) => (local[t.id] ? { ...t, status: local[t.id] } : t))
      .filter((t) => (who === "all" ? true : who === "me" ? t.assigneeId === meId : who === "none" ? !t.assigneeId : t.assigneeId === Number(who)))
      .filter((t) => (item === "all" ? true : t.planItemId === Number(item) || data.items.find((i) => i.id === t.planItemId)?.parentId === Number(item)))
      .filter((t) => !needle || t.title.toLowerCase().includes(needle) || (t.description ?? "").toLowerCase().includes(needle));
  }, [data, local, who, item, q, meId]);

  const canMoveTask = (t: Task) => p.rights.manage || t.assigneeId === meId || (!t.assigneeId && p.rights.edit);
  const move = async (id: number, to: TaskStatus, note?: string) => {
    const t = data.tasks.find((x) => x.id === id);
    if (!t || t.status === to) return;
    if (to === "BLOCKED" && !note) return setBlocking({ id });
    setLocal((l) => ({ ...l, [id]: to }));
    setMoving(true);
    try {
      await sideProjectsApi.moveTask(p.id, id, to, note);
      showToast(`${t.title}: ${TASK_META[to].label}`, "success");
      setBlocking(null);
      onChanged();
    } catch (e) {
      showToast(failure(e, "The task didn't move").message, "error");
    } finally {
      setLocal((l) => {
        const n = { ...l };
        delete n[id];
        return n;
      });
      setMoving(false);
    }
  };
  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over?.id;
    if (typeof over !== "string" || !over.startsWith("col:")) return;
    const t = data.tasks.find((x) => x.id === Number(e.active.id));
    if (!t) return;
    if (!canMoveTask(t)) return showToast("Only the assignee or a team manager can move this task", "warning");
    move(t.id, over.slice(4) as TaskStatus);
  };

  const columns: TaskStatus[] = showCancelled ? [...TASK_FLOW, "CANCELLED"] : TASK_FLOW;
  const cancelled = data.tasks.filter((t) => t.status === "CANCELLED").length;

  if (!data.items.length) {
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Plan first</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Tasks live inside the implementation plan. Add a phase or feature in Plan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1 sm:max-w-[14rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="h-9 w-full rounded-full border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
        </div>
        <button type="button" aria-pressed={who === "me"} onClick={() => setWho(who === "me" ? "all" : "me")} className={chipCls(who === "me")}>
          Mine <span className="tabular-nums opacity-80">{data.tasks.filter((t) => t.assigneeId === meId && t.status !== "DONE" && t.status !== "CANCELLED").length}</span>
        </button>
        <SelectField aria-label="Assignee" className={selectCls} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="all">Everyone</option>
          <option value="me">Me</option>
          <option value="none">Unassigned</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>
        <SelectField aria-label="Plan item" className={selectCls} value={item} onChange={(e) => (setItem(e.target.value), e.target.value === "all" && onClearFocus())}>
          <option value="all">Whole plan</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </SelectField>
        {cancelled > 0 && (
          <button type="button" aria-pressed={showCancelled} onClick={() => setShowCancelled((s) => !s)} className={chipCls(showCancelled)}>
            Cancelled {cancelled}
          </button>
        )}
        {(who !== "all" || item !== "all" || q) && (
          <button type="button" onClick={() => (setWho("all"), setItem("all"), setQ(""), onClearFocus())} className={chipCls(false)}>
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-900" role="radiogroup" aria-label="Layout">
            <button type="button" role="radio" aria-checked={view === "board"} aria-label="Board" title="Board" onClick={() => setView("board")} className={`rounded-full p-1.5 ${view === "board" ? "bg-blue-600 text-white" : "text-slate-500 dark:text-gray-400"}`}>
              <KanbanSquare className="h-4 w-4" />
            </button>
            <button type="button" role="radio" aria-checked={view === "list"} aria-label="List" title="List" onClick={() => setView("list")} className={`rounded-full p-1.5 ${view === "list" ? "bg-blue-600 text-white" : "text-slate-500 dark:text-gray-400"}`}>
              <List className="h-4 w-4" />
            </button>
          </div>
          {p.rights.edit && (
            <button type="button" className={`${primaryBtn} !min-h-[36px] !px-4 !py-1.5`} onClick={() => setModal({ task: null })}>
              <Plus className="h-4 w-4" /> Task
            </button>
          )}
        </div>
      </div>

      {view === "board" ? (
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={onDragEnd}>
          <div className={`-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] ${moving ? "cursor-progress" : ""}`}>
            {columns.map((s) => {
              const list = tasks.filter((t) => t.status === s);
              return (
                <Column key={s} status={s} count={list.length}>
                  {list.map((t) => (
                    <TaskCard key={t.id} t={t} itemTitle={itemTitle.get(t.planItemId) ?? ""} onOpen={() => setDetail(t.id)} draggable={canMoveTask(t)} />
                  ))}
                  {list.length === 0 && <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-6 text-[11px] text-slate-400 dark:border-gray-800 dark:text-gray-500">Drop here</div>}
                </Column>
              );
            })}
          </div>
        </DndContext>
      ) : (
        <div className={`${cardCls} divide-y divide-slate-100 overflow-hidden dark:divide-gray-800`}>
          {tasks.length === 0 && <p className="p-6 text-center text-sm text-slate-500 dark:text-gray-400">No task matches.</p>}
          {tasks.map((t) => (
            <button key={t.id} type="button" onClick={() => setDetail(t.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-gray-800/50">
              <StatusChip meta={TASK_META[t.status]} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-semibold ${t.status === "DONE" ? "text-slate-500 line-through dark:text-gray-400" : "text-slate-800 dark:text-gray-100"}`}>{t.title}</span>
                <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">{itemTitle.get(t.planItemId)}</span>
              </span>
              <PriorityMark priority={t.priority} />
              {t.dueDate && <span className={`hidden w-14 text-right text-[11px] tabular-nums sm:block ${t.overdue ? "font-bold text-red-700 dark:text-red-300" : "text-slate-500 dark:text-gray-400"}`}>{fmtDay(t.dueDate)}</span>}
              {t.assigneeName ? <UserAvatar name={t.assigneeName} userId={t.assigneeId ?? undefined} size={22} decorative /> : <span className="h-[22px] w-[22px] rounded-full border border-dashed border-slate-300 dark:border-gray-600" title="Unassigned" />}
            </button>
          ))}
        </div>
      )}

      <TaskModal p={p} data={data} team={team} meId={meId} open={!!modal} task={modal?.task ?? null} defaultItem={item !== "all" ? Number(item) : null} onClose={() => setModal(null)} onSaved={onChanged} />
      <TaskDetailModal p={p} data={data} team={team} meId={meId} taskId={detail} onClose={() => setDetail(null)} onChanged={onChanged} onEdit={(t) => (setDetail(null), setModal({ task: t }))} />
      <BlockedReason open={!!blocking} busy={moving} onCancel={() => setBlocking(null)} onConfirm={(r) => blocking && move(blocking.id, "BLOCKED", r)} />
    </div>
  );
};

export default TasksView;
