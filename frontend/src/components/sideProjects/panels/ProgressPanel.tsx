import React, { useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  Check,
  GripVertical,
  Plus,
  SlidersHorizontal,
  Target,
  Trash2,
  X,
} from "lucide-react";
import {
  failure,
  sideProjectsApi,
  type ProjectDetail,
} from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import ReportsFeed from "./ReportsFeed";
import {
  ProgressRing,
  Spinner,
  cardCls,
  inputCls,
  pathStage,
  primaryBtn,
  statusColor,
  useIsDark,
} from "../ui";

type Ms = {
  id: number;
  title: string;
  dueDate: string | null;
  doneAt: string | null;
  done: boolean;
  sort: number;
};

const todayIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString()
    .slice(0, 10);
};


const MilestoneRow: React.FC<{
  m: Ms;
  canEdit: boolean;
  onToggle: () => void;
  onDelete: () => void;
}> = ({ m, canEdit, onToggle, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: m.id, disabled: !canEdit });
  const overdue = !m.done && m.dueDate && m.dueDate < todayIso();
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${isDragging ? "bg-white dark:bg-gray-700/50" : "hover:bg-slate-50 dark:hover:bg-gray-700/40"}`}
    >
      {canEdit && (
        <button
          type="button"
          className="cursor-grab text-slate-300 hover:text-slate-500 dark:text-slate-600"
          aria-label={`Reorder ${m.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={m.done}
        disabled={!canEdit}
        onClick={onToggle}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${m.done ? "border-green-600 bg-green-600 text-white" : "border-slate-900/10 hover:border-green-600 dark:border-slate-500"}`}
        aria-label={m.title}
      >
        <AnimatePresence>
          {m.done && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              <Check className="h-3 w-3" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <span
        className={`min-w-0 flex-1 truncate text-sm ${m.done ? "text-slate-500 line-through dark:text-gray-400" : "text-slate-700 dark:text-gray-100"}`}
      >
        {m.title}
      </span>
      {m.dueDate && (
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${overdue ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-gray-700/50 dark:text-gray-300"}`}
        >
          <Calendar className="h-3 w-3" aria-hidden />
          {new Date(`${m.dueDate}T00:00:00Z`).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          })}
        </span>
      )}
      {canEdit && (
        <button
          type="button"
          aria-label={`Delete ${m.title}`}
          onClick={onDelete}
          className="rounded-full p-1 text-slate-300 opacity-0 transition hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:text-gray-600 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
};

const ProgressPanel: React.FC<{
  p: ProjectDetail;
  meId: number;
  onChanged: () => void;
  wide?: boolean;
}> = ({ p, meId, onChanged, wide }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const dark = useIsDark();
  const [ms, setMs] = useState<Ms[]>(p.milestones);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [manual, setManual] = useState<number>(p.progress);
  const [savingManual, setSavingManual] = useState(false);
  useEffect(() => setMs(p.milestones), [p.milestones]);
  useEffect(() => setManual(p.progress), [p.progress]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const done = ms.filter((m) => m.done).length;
  const canEdit = p.rights.edit;

  const addMilestone = async () => {
    if (title.trim().length < 2) return;
    setAdding(true);
    try {
      await sideProjectsApi.addMilestone(p.id, {
        title: title.trim(),
        dueDate: due || null,
      });
      setTitle("");
      setDue("");
      showToast("Milestone added", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The milestone wasn't added").message, "error");
    } finally {
      setAdding(false);
    }
  };
  const toggle = async (m: Ms) => {
    setMs((list) =>
      list.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)),
    );
    try {
      await sideProjectsApi.updateMilestone(p.id, m.id, { done: !m.done });
      showToast(m.done ? "Milestone reopened" : "Milestone done", "success");
      onChanged();
    } catch (e) {
      setMs(p.milestones);
      showToast(failure(e).message, "error");
    }
  };
  const removeMilestone = async (m: Ms) => {
    if (
      !(await confirm({
        title: `Delete “${m.title}”?`,
        tone: "danger",
        confirmText: "Delete",
      }))
    )
      return;
    try {
      await sideProjectsApi.removeMilestone(p.id, m.id);
      showToast("Milestone deleted", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The milestone wasn't deleted").message, "error");
    }
  };
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const prev = ms;
    const next = arrayMove(
      ms,
      ms.findIndex((x) => x.id === e.active.id),
      ms.findIndex((x) => x.id === e.over!.id),
    );
    setMs(next);
    try {
      await sideProjectsApi.orderMilestones(
        p.id,
        next.map((x) => x.id),
      );
    } catch (err) {
      setMs(prev);
      showToast(failure(err, "The new order wasn't saved").message, "error");
    }
  };
  const saveManual = async (v: number) => {
    setSavingManual(true);
    try {
      await sideProjectsApi.update(p.id, {
        progressMode: "MANUAL",
        progressManual: v,
      });
      showToast(`Progress set to ${v}%`, "success");
      onChanged();
    } catch (e) {
      showToast(failure(e).message, "error");
    } finally {
      setSavingManual(false);
    }
  };
  return (
    <div
      className={`grid gap-4 ${wide ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}
    >
      {/* Reports */}
      <div className="min-w-0">
        <ReportsFeed p={p} meId={meId} onChanged={onChanged} />
      </div>

      {/* Milestones */}
      <aside className="min-w-0">
        <section
          className={`${cardCls} p-4 ${wide ? "lg:sticky lg:top-0" : ""}`}
        >
          <div className="flex items-center gap-3">
            <ProgressRing
              value={p.progress}
              size={52}
              stroke={5}
              color={statusColor(pathStage(p.status, p.pausedFrom), dark)}
            />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white">
                <Target className="h-4 w-4" aria-hidden /> Milestones
                <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-gray-400">
                  {done}/{ms.length}
                </span>
              </p>
              {ms.length > 0 && (
                <div className="mt-1.5 flex gap-0.5" aria-hidden>
                  {ms.map((m) => (
                    <span
                      key={m.id}
                      className={`h-1.5 flex-1 rounded-full ${m.done ? "bg-green-600" : "bg-slate-200 dark:bg-gray-700/50"}`}
                    />
                  ))}
                </div>
              )}
            </div>
            {canEdit && !showAdd && (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                aria-label="Add milestone"
                title="Add milestone"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          {ms.length === 0 &&
            canEdit &&
            ["PLANNING", "IN_PROGRESS", "TESTING"].includes(p.status) && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/40">
                <SlidersHorizontal
                  className="h-4 w-4 text-slate-500"
                  aria-hidden
                />
                <input
                  type="range"
                  min={0}
                  max={99}
                  value={manual}
                  disabled={savingManual}
                  onChange={(e) => setManual(Number(e.target.value))}
                  onMouseUp={() => saveManual(manual)}
                  onTouchEnd={() => saveManual(manual)}
                  onKeyUp={() => saveManual(manual)}
                  className="flex-1 accent-blue-600"
                  aria-label="Progress"
                />
                <span className="flex w-10 items-center justify-end text-sm font-bold tabular-nums">
                  {savingManual ? (
                    <Spinner className="h-3.5 w-3.5" />
                  ) : (
                    `${manual}%`
                  )}
                </span>
              </div>
            )}

          {ms.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={ms.map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="mt-3 space-y-0.5">
                  {ms.map((m) => (
                    <MilestoneRow
                      key={m.id}
                      m={m}
                      canEdit={canEdit}
                      onToggle={() => toggle(m)}
                      onDelete={() => removeMilestone(m)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <AnimatePresence initial={false}>
            {canEdit && showAdd && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/40">
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addMilestone()}
                    placeholder="Milestone"
                    aria-label="New milestone"
                    maxLength={150}
                    className={inputCls}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                      aria-label="Due date"
                      className={`${inputCls} min-w-0 flex-1 [color-scheme:light] dark:[color-scheme:dark]`}
                    />
                    <button
                      type="button"
                      onClick={() => (
                        setShowAdd(false),
                        setTitle(""),
                        setDue("")
                      )}
                      aria-label="Cancel"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white dark:hover:bg-gray-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={`${primaryBtn} !px-4`}
                      onClick={addMilestone}
                      disabled={adding || title.trim().length < 2}
                      aria-label="Add milestone"
                    >
                      {adding ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}{" "}
                      Add
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </aside>
    </div>
  );
};

export default ProgressPanel;
