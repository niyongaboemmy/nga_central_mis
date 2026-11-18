import React, { useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertOctagon, ArrowRight, Calendar, Check, Clock3, GripVertical, MoreHorizontal, NotebookPen, Pencil, Plus, SlidersHorizontal, Target, Trash2, X,
} from "lucide-react";
import { failure, sideProjectsApi, type ProjectDetail, type Report, type ReportFile } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import UserAvatar from "../../ui/UserAvatar";
import Modal from "../../ui/Modal";
import { AssetPreview } from "./DocumentsPanel";
import ReportModal, { MOODS, PdfGlyph } from "./ReportModal";
import { EmptyArt, ProgressRing, STATUS_META, Spinner, cardCls, chipCls, inputCls, pathStage, primaryBtn, statusColor, timeAgo, useIsDark } from "../ui";

type Ms = { id: number; title: string; dueDate: string | null; doneAt: string | null; done: boolean; sort: number };
type Filter = "all" | "mine" | "blockers" | "files";

const DAY = 86_400_000;
const todayIso = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
};
const dayLabel = (iso: string) => {
  const diff = Math.round((Date.parse(`${todayIso()}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
};

const sinceLabel = (iso: string) => {
  const diff = Math.round((Date.parse(`${todayIso()}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / DAY);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : `${diff}d ago`;
};

const MilestoneRow: React.FC<{ m: Ms; canEdit: boolean; onToggle: () => void; onDelete: () => void }> = ({ m, canEdit, onToggle, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id, disabled: !canEdit });
  const overdue = !m.done && m.dueDate && m.dueDate < todayIso();
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`group flex items-center gap-2 rounded-xl px-2 py-1.5 transition ${isDragging ? "bg-white dark:bg-gray-700/50" : "hover:bg-slate-50 dark:hover:bg-gray-700/40"}`}>
      {canEdit && (
        <button type="button" className="cursor-grab text-slate-300 hover:text-slate-500 dark:text-slate-600" aria-label={`Reorder ${m.title}`} {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={m.done}
        disabled={!canEdit}
        onClick={onToggle}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${m.done ? "border-green-600 bg-green-600 text-white" : "border-slate-300 hover:border-green-600 dark:border-slate-500"}`}
        aria-label={m.title}
      >
        <AnimatePresence>
          {m.done && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
              <Check className="h-3 w-3" />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <span className={`min-w-0 flex-1 truncate text-sm ${m.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-gray-100"}`}>{m.title}</span>
      {m.dueDate && (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${overdue ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : "bg-slate-100 text-slate-600 dark:bg-gray-700/50 dark:text-gray-300"}`}>
          <Calendar className="h-3 w-3" aria-hidden />
          {new Date(`${m.dueDate}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}
        </span>
      )}
      {canEdit && (
        <button type="button" aria-label={`Delete ${m.title}`} onClick={onDelete} className="rounded-full p-1 text-slate-300 opacity-0 transition hover:text-red-600 focus:opacity-100 group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
};

/** One recorded report: who, when, how long, how it went, then done / next / blockers and PDFs. */
const ReportCard: React.FC<{ r: Report; canManage: boolean; onEdit: () => void; onDelete: () => void; onOpenFile: (f: ReportFile) => void; deleting: boolean }> = ({ r, canManage, onEdit, onDelete, onOpenFile, deleting }) => {
  const dark = useIsDark();
  const [menu, setMenu] = useState(false);
  const mood = MOODS.find((m) => m.v === r.mood);
  const S = r.stage ? STATUS_META[r.stage] : null;
  return (
    <motion.article layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className={`${cardCls} p-4 ${deleting ? "opacity-50" : ""}`}>
      <header className="flex items-start gap-3">
        <UserAvatar name={r.author} userId={r.authorId} size={36} decorative />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{r.author}</span>
            {S && r.stage && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${statusColor(r.stage, dark)}1f` }}>
                <S.icon className="h-3 w-3" style={{ color: statusColor(r.stage, dark) }} aria-hidden />
                <span className="text-slate-700 dark:text-gray-200">{S.label}</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">
            {timeAgo(r.createdAt)}
            {r.editedAt && <span title={new Date(r.editedAt).toLocaleString()}> · edited</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {r.hours !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold tabular-nums text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" title="Hours spent">
              <Clock3 className="h-3 w-3" aria-hidden /> {r.hours}h
            </span>
          )}
          {mood && (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-gray-700/50" title={mood.label}>
              <mood.icon className="h-4 w-4" style={{ color: mood.color }} aria-label={mood.label} />
            </span>
          )}
          {canManage && (
            <div className="relative">
              <button type="button" aria-label="Report actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-white">
                {deleting ? <Spinner className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 top-9 z-10 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-gray-700/60 dark:bg-gray-800" onMouseLeave={() => setMenu(false)}>
                  <button role="menuitem" type="button" onClick={() => (setMenu(false), onEdit())} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-700/50">
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button role="menuitem" type="button" onClick={() => (setMenu(false), onDelete())} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="mt-3 space-y-2">
        <div className="flex gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <Check className="h-3 w-3" aria-label="Done" />
          </span>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800 dark:text-gray-100">{r.did}</p>
        </div>
        {r.nextSteps && (
          <div className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
              <ArrowRight className="h-3 w-3" aria-label="Next" />
            </span>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-gray-300">{r.nextSteps}</p>
          </div>
        )}
        {r.blockers && (
          <div className="flex gap-2.5 rounded-2xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-label="Blocker" />
            <p className="whitespace-pre-line text-sm leading-relaxed text-amber-900 dark:text-amber-100">{r.blockers}</p>
          </div>
        )}
      </div>

      {r.files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.files.map((f) => (
            <button key={f.assetId} type="button" onClick={() => onOpenFile(f)} className="group inline-flex max-w-full items-center gap-2 rounded-2xl bg-slate-50 py-1.5 pl-1.5 pr-3 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-800/40 dark:hover:bg-gray-700/50">
              <PdfGlyph />
              <span className="min-w-0">
                <span className="block max-w-[12rem] truncate text-xs font-semibold text-slate-800 group-hover:text-blue-700 dark:text-gray-100 dark:group-hover:text-blue-300">{f.name}</span>
                <span className="block text-[10px] text-slate-500 dark:text-gray-400">Open</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </motion.article>
  );
};

const ProgressPanel: React.FC<{ p: ProjectDetail; meId: number; onChanged: () => void; wide?: boolean }> = ({ p, meId, onChanged, wide }) => {
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
  const [modal, setModal] = useState<{ report: Report | null } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [file, setFile] = useState<ReportFile | null>(null);
  useEffect(() => setMs(p.milestones), [p.milestones]);
  useEffect(() => setManual(p.progress), [p.progress]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const done = ms.filter((m) => m.done).length;
  const canEdit = p.rights.edit;

  const reports = p.updates;
  const shown = useMemo(
    () =>
      reports.filter((r) => (filter === "mine" ? r.authorId === meId : filter === "blockers" ? !!r.blockers : filter === "files" ? r.files.length > 0 : true)),
    [reports, filter, meId],
  );
  const groups = useMemo(() => {
    const out: Array<{ day: string; items: Report[]; hours: number }> = [];
    for (const r of shown) {
      const g = out[out.length - 1];
      if (g && g.day === r.workDate) (g.items.push(r), (g.hours += r.hours ?? 0));
      else out.push({ day: r.workDate, items: [r], hours: r.hours ?? 0 });
    }
    return out;
  }, [shown]);
  const totalHours = Math.round(reports.reduce((s, r) => s + (r.hours ?? 0), 0) * 10) / 10;
  const team = new Set(reports.map((r) => r.authorId)).size;
  const last = reports[0]?.workDate ?? null;

  const addMilestone = async () => {
    if (title.trim().length < 2) return;
    setAdding(true);
    try {
      await sideProjectsApi.addMilestone(p.id, { title: title.trim(), dueDate: due || null });
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
    setMs((list) => list.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)));
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
    if (!(await confirm({ title: `Delete “${m.title}”?`, tone: "danger", confirmText: "Delete" }))) return;
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
    const next = arrayMove(ms, ms.findIndex((x) => x.id === e.active.id), ms.findIndex((x) => x.id === e.over!.id));
    setMs(next);
    try {
      await sideProjectsApi.orderMilestones(p.id, next.map((x) => x.id));
    } catch (err) {
      setMs(prev);
      showToast(failure(err, "The new order wasn't saved").message, "error");
    }
  };
  const saveManual = async (v: number) => {
    setSavingManual(true);
    try {
      await sideProjectsApi.update(p.id, { progressMode: "MANUAL", progressManual: v });
      showToast(`Progress set to ${v}%`, "success");
      onChanged();
    } catch (e) {
      showToast(failure(e).message, "error");
    } finally {
      setSavingManual(false);
    }
  };
  const removeReport = async (r: Report) => {
    if (!(await confirm({ title: "Delete this report?", tone: "danger", confirmText: "Delete", message: r.files.length ? "Its PDF attachments go too." : undefined }))) return;
    setDeleting(r.id);
    try {
      await sideProjectsApi.removeUpdate(p.id, r.id);
      showToast("Report deleted", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The report wasn't deleted").message, "error");
    } finally {
      setDeleting(null);
    }
  };

  const stats = [
    { label: "Reports", value: reports.length },
    { label: "Hours", value: totalHours },
    { label: "Last report", value: last ? sinceLabel(last) : "–" },
    ...(team > 1 ? [{ label: "Reporters", value: team }] : []),
  ];

  return (
    <div className={`grid gap-4 ${wide ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
      {/* Reports */}
      <div className="min-w-0 space-y-4">
        <section className={`${cardCls} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-gray-800/40">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">{s.label}</p>
                  <p className="text-base font-extrabold tabular-nums text-slate-900 dark:text-white">{s.value}</p>
                </div>
              ))}
            </div>
            {canEdit && (
              <button type="button" className={primaryBtn} onClick={() => setModal({ report: null })}>
                <NotebookPen className="h-4 w-4" /> New report
              </button>
            )}
          </div>
          {reports.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show">
              {(
                [
                  ["all", "All", reports.length],
                  ["mine", "Mine", reports.filter((r) => r.authorId === meId).length],
                  ["blockers", "With blockers", reports.filter((r) => r.blockers).length],
                  ["files", "With PDFs", reports.filter((r) => r.files.length).length],
                ] as Array<[Filter, string, number]>
              )
                .filter(([k, , n]) => k === "all" || n > 0)
                .map(([k, label, n]) => (
                  <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={chipCls(filter === k)}>
                    {label}
                    <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${filter === k ? "bg-blue-800" : "bg-slate-100 dark:bg-gray-700/60"}`}>{n}</span>
                  </button>
                ))}
            </div>
          )}
        </section>

        {reports.length === 0 ? (
          <div className={`${cardCls} flex flex-col items-center gap-3 p-8 text-center`}>
            <EmptyArt icon={NotebookPen} />
            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">No reports yet</p>
            {canEdit && (
              <button type="button" className={primaryBtn} onClick={() => setModal({ report: null })}>
                <Plus className="h-4 w-4" /> Record the first one
              </button>
            )}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-gray-400">Nothing matches this filter.</p>
        ) : (
          groups.map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day)} className="space-y-2">
              <h4 className="flex items-center gap-2 px-1 text-xs font-bold text-slate-600 dark:text-gray-300">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                {dayLabel(g.day)}
                {g.hours > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] tabular-nums text-slate-600 dark:bg-gray-700/60 dark:text-gray-300">{Math.round(g.hours * 10) / 10}h</span>}
              </h4>
              <AnimatePresence initial={false}>
                {g.items.map((r) => (
                  <ReportCard
                    key={r.id}
                    r={r}
                    canManage={canEdit && (r.authorId === meId || p.rights.manageAny)}
                    deleting={deleting === r.id}
                    onEdit={() => setModal({ report: r })}
                    onDelete={() => removeReport(r)}
                    onOpenFile={setFile}
                  />
                ))}
              </AnimatePresence>
            </section>
          ))
        )}
      </div>

      {/* Milestones */}
      <aside className="min-w-0">
        <section className={`${cardCls} p-4 ${wide ? "lg:sticky lg:top-0" : ""}`}>
          <div className="flex items-center gap-3">
            <ProgressRing value={p.progress} size={52} stroke={5} color={statusColor(pathStage(p.status, p.pausedFrom), dark)} />
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
                    <span key={m.id} className={`h-1.5 flex-1 rounded-full ${m.done ? "bg-green-600" : "bg-slate-200 dark:bg-gray-700/50"}`} />
                  ))}
                </div>
              )}
            </div>
            {canEdit && !showAdd && (
              <button type="button" onClick={() => setShowAdd(true)} aria-label="Add milestone" title="Add milestone" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300">
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          {ms.length === 0 && canEdit && ["PLANNING", "IN_PROGRESS", "TESTING"].includes(p.status) && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/40">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden />
              <input type="range" min={0} max={99} value={manual} disabled={savingManual} onChange={(e) => setManual(Number(e.target.value))} onMouseUp={() => saveManual(manual)} onTouchEnd={() => saveManual(manual)} onKeyUp={() => saveManual(manual)} className="flex-1 accent-blue-600" aria-label="Progress" />
              <span className="flex w-10 items-center justify-end text-sm font-bold tabular-nums">{savingManual ? <Spinner className="h-3.5 w-3.5" /> : `${manual}%`}</span>
            </div>
          )}

          {ms.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ms.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                <ul className="mt-3 space-y-0.5">
                  {ms.map((m) => (
                    <MilestoneRow key={m.id} m={m} canEdit={canEdit} onToggle={() => toggle(m)} onDelete={() => removeMilestone(m)} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <AnimatePresence initial={false}>
            {canEdit && showAdd && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/40">
                  <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMilestone()} placeholder="Milestone" aria-label="New milestone" maxLength={150} className={inputCls} />
                  <div className="flex items-center gap-2">
                    <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className={`${inputCls} min-w-0 flex-1 [color-scheme:light] dark:[color-scheme:dark]`} />
                    <button type="button" onClick={() => (setShowAdd(false), setTitle(""), setDue(""))} aria-label="Cancel" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white dark:hover:bg-gray-700">
                      <X className="h-4 w-4" />
                    </button>
                    <button type="button" className={`${primaryBtn} !px-4`} onClick={addMilestone} disabled={adding || title.trim().length < 2} aria-label="Add milestone">
                      {adding ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Add
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </aside>

      <ReportModal p={p} open={!!modal} report={modal?.report ?? null} onClose={() => setModal(null)} onSaved={onChanged} />
      <Modal isOpen={!!file} onClose={() => setFile(null)} title={file?.name ?? ""} size="3xl" contentClassName="p-3">
        {file ? <AssetPreview assetId={file.assetId} name={file.name} /> : null}
      </Modal>
    </div>
  );
};

export default ProgressPanel;
