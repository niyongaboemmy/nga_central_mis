import React, { useEffect, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, ArrowRight, Calendar, Check, Frown, GripVertical, Laugh, Meh, Plus, Send, Smile, Annoyed, Trash2, Target, SlidersHorizontal } from "lucide-react";
import { failure, sideProjectsApi, type ProjectDetail } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import UserAvatar from "../../ui/UserAvatar";
import { CharMeter } from "../fields";
import { FieldError, ProgressRing, inputCls, inputErrCls, primaryBtn, Spinner, statusColor, timeAgo, useIsDark, cardCls } from "../ui";

type Ms = { id: number; title: string; dueDate: string | null; doneAt: string | null; done: boolean; sort: number };
const MOODS = [
  { v: 1, icon: Frown, label: "Struggling", color: "#d03b3b" },
  { v: 2, icon: Annoyed, label: "Hard", color: "#ec835a" },
  { v: 3, icon: Meh, label: "Okay", color: "#fab219" },
  { v: 4, icon: Smile, label: "Good", color: "#1baf7a" },
  { v: 5, icon: Laugh, label: "Great", color: "#0ca30c" },
];

const Row: React.FC<{ m: Ms; canEdit: boolean; onToggle: () => void; onDelete: () => void }> = ({ m, canEdit, onToggle, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id, disabled: !canEdit });
  const overdue = !m.done && m.dueDate && m.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group flex items-center gap-2 rounded-xl px-2 py-2 transition ${isDragging ? "bg-white shadow-float dark:bg-gray-700/50" : "hover:bg-slate-50 dark:hover:bg-gray-700/40"}`}>
      {canEdit && (
        <button type="button" className="cursor-grab text-slate-300 hover:text-slate-500 dark:text-slate-600" aria-label="Reorder" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={m.done}
        disabled={!canEdit}
        onClick={onToggle}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${m.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-emerald-500 dark:border-slate-500"}`}
        aria-label={m.title}
      >
        <AnimatePresence>{m.done && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check className="h-3.5 w-3.5" /></motion.span>}</AnimatePresence>
      </button>
      <span className={`flex-1 text-sm ${m.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-gray-100"}`}>{m.title}</span>
      {m.dueDate && (
        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${overdue ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-gray-700/50 dark:text-gray-300"}`}>
          <Calendar className="h-3 w-3" />
          {new Date(`${m.dueDate}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}
        </span>
      )}
      {canEdit && (
        <button type="button" aria-label="Delete milestone" onClick={onDelete} className="rounded p-1 text-slate-300 opacity-0 transition hover:text-red-600 group-hover:opacity-100 focus:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
};

const ProgressPanel: React.FC<{ p: ProjectDetail; onChanged: () => void }> = ({ p, onChanged }) => {
  const { showToast } = useToast();
  const dark = useIsDark();
  const [ms, setMs] = useState<Ms[]>(p.milestones);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);
  const [u, setU] = useState({ did: "", nextSteps: "", blockers: "", mood: null as number | null });
  const [uErr, setUErr] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [manual, setManual] = useState<number>(p.progress);
  useEffect(() => setMs(p.milestones), [p.milestones]);
  useEffect(() => setManual(p.progress), [p.progress]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const done = ms.filter((m) => m.done).length;

  const add = async () => {
    if (title.trim().length < 2) return;
    setAdding(true);
    try {
      await sideProjectsApi.addMilestone(p.id, { title: title.trim(), dueDate: due || null });
      setTitle("");
      setDue("");
      onChanged();
    } catch (e) {
      showToast(failure(e).message, "error");
    } finally {
      setAdding(false);
    }
  };
  const toggle = async (m: Ms) => {
    setMs((list) => list.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)));
    try {
      await sideProjectsApi.updateMilestone(p.id, m.id, { done: !m.done });
      onChanged();
    } catch (e) {
      setMs(p.milestones);
      showToast(failure(e).message, "error");
    }
  };
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(ms, ms.findIndex((x) => x.id === e.active.id), ms.findIndex((x) => x.id === e.over!.id));
    setMs(next);
    await sideProjectsApi.orderMilestones(p.id, next.map((x) => x.id)).catch(() => setMs(ms));
  };
  const post = async () => {
    if (u.did.trim().length < 5) {
      setUErr("At least 5 characters");
      return;
    }
    setPosting(true);
    setUErr(null);
    try {
      await sideProjectsApi.addUpdate(p.id, { did: u.did.trim(), nextSteps: u.nextSteps.trim() || undefined, blockers: u.blockers.trim() || undefined, mood: u.mood });
      setU({ did: "", nextSteps: "", blockers: "", mood: null });
      showToast("Update posted", "success");
      onChanged();
    } catch (e) {
      setUErr(failure(e).message);
    } finally {
      setPosting(false);
    }
  };
  const saveManual = async (v: number) => {
    await sideProjectsApi.update(p.id, { progressMode: "MANUAL", progressManual: v }).catch((e) => showToast(failure(e).message, "error"));
    onChanged();
  };

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="mb-3 flex items-center gap-4">
          <ProgressRing value={p.progress} size={64} stroke={6} color={statusColor(p.status, dark)} />
          <div className="flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-white"><Target className="h-4 w-4" /> {done}/{ms.length}</p>
            <div className="mt-1 flex gap-0.5" aria-hidden>
              {ms.map((m) => <span key={m.id} className={`h-2 flex-1 rounded-full ${m.done ? "bg-emerald-500" : "bg-slate-200 dark:bg-gray-700/50"}`} />)}
            </div>
          </div>
        </div>
        {ms.length === 0 && p.rights.edit && p.status === "IN_PROGRESS" && (
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-gray-700/40">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden />
            <input type="range" min={0} max={99} value={manual} onChange={(e) => setManual(Number(e.target.value))} onMouseUp={() => saveManual(manual)} onTouchEnd={() => saveManual(manual)} onKeyUp={() => saveManual(manual)} className="flex-1 accent-blue-600" aria-label="Progress" />
            <span className="w-10 text-right text-sm font-bold tabular-nums">{manual}%</span>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ms.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-0.5">
              {ms.map((m) => (
                <Row key={m.id} m={m} canEdit={p.rights.edit} onToggle={() => toggle(m)} onDelete={async () => (await sideProjectsApi.removeMilestone(p.id, m.id).catch(() => undefined), onChanged())} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {p.rights.edit && (
          <div className="mt-2 flex items-center gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New milestone" aria-label="New milestone" maxLength={150} className={`${inputCls} flex-1`} />
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className={`${inputCls} w-40`} />
            <button type="button" className={primaryBtn} onClick={add} disabled={adding || title.trim().length < 2} aria-label="Add milestone">{adding ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</button>
          </div>
        )}
      </section>

      {p.rights.edit && (
        <section className={`${cardCls} space-y-3 p-4`}>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="How is it going?">
            {MOODS.map((m) => (
              <button key={m.v} type="button" role="radio" aria-checked={u.mood === m.v} aria-label={m.label} title={m.label} onClick={() => setU((x) => ({ ...x, mood: x.mood === m.v ? null : m.v }))} className={`rounded-full p-1.5 transition ${u.mood === m.v ? "scale-125" : "opacity-50 grayscale hover:opacity-100 hover:grayscale-0"}`}>
                <m.icon className="h-6 w-6" style={{ color: m.color }} />
              </button>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between"><label htmlFor="up-did" className="text-xs font-semibold text-slate-600 dark:text-gray-300"><Check className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />Done</label><CharMeter value={u.did} min={5} max={1000} /></div>
            <textarea id="up-did" rows={2} value={u.did} onChange={(e) => setU((x) => ({ ...x, did: e.target.value }))} className={`${inputCls} ${uErr ? inputErrCls : ""}`} />
            <FieldError message={uErr} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="up-next" className="text-xs font-semibold text-slate-600 dark:text-gray-300"><ArrowRight className="mr-1 inline h-3.5 w-3.5 text-blue-600" />Next</label>
              <textarea id="up-next" rows={2} value={u.nextSteps} onChange={(e) => setU((x) => ({ ...x, nextSteps: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label htmlFor="up-block" className="text-xs font-semibold text-slate-600 dark:text-gray-300"><AlertOctagon className="mr-1 inline h-3.5 w-3.5 text-orange-600" />Blockers</label>
              <textarea id="up-block" rows={2} value={u.blockers} onChange={(e) => setU((x) => ({ ...x, blockers: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" className={primaryBtn} onClick={post} disabled={posting}>{posting ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Post</button>
          </div>
        </section>
      )}

      <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5 dark:border-gray-700/40">
        {p.updates.map((x) => {
          const mood = MOODS.find((m) => m.v === x.mood);
          return (
            <motion.li key={x.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative">
              <span className="absolute -left-[31px] top-1 rounded-full bg-white p-0.5 dark:bg-gray-900">
                <UserAvatar name={x.author} userId={x.authorId} size={20} decorative />
              </span>
              <div className={`${cardCls} p-3`}>
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                  <span className="font-semibold text-slate-700 dark:text-gray-200">{x.author}</span>
                  <span className="flex items-center gap-1">{mood && <mood.icon className="h-4 w-4" style={{ color: mood.color }} aria-label={mood.label} />}{timeAgo(x.createdAt)}</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-gray-100"><Check className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />{x.did}</p>
                {x.nextSteps && <p className="mt-1 text-sm text-slate-600 dark:text-gray-300"><ArrowRight className="mr-1 inline h-3.5 w-3.5 text-blue-600" />{x.nextSteps}</p>}
                {x.blockers && <p className="mt-1 rounded-lg bg-orange-50 px-2 py-1 text-sm text-orange-900 dark:bg-orange-500/10 dark:text-orange-100"><AlertOctagon className="mr-1 inline h-3.5 w-3.5" />{x.blockers}</p>}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
};

export default ProgressPanel;
