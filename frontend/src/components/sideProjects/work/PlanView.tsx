import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Check, ChevronDown, Layers, ListChecks, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Undo2, Wand2, Zap } from "lucide-react";
import { failure, sideProjectsApi, type PlanData, type PlanItem, type PlanStatus, type PlanTemplate, type Priority, type ProjectDetail, type Stage } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import UserAvatar from "../../ui/UserAvatar";
import SelectField from "../../ui/SelectField";
import { Field, FormModal, IconInput, TextArea } from "../form";
import { ProgressRing, STAGES, STATUS_META, Skeleton, Spinner, cardCls, inputCls, primaryBtn, secondaryBtn, statusColor, useIsDark } from "../ui";
import { PLAN_FLOW, PLAN_META, PRIORITIES, PRIORITY_META, PriorityMark, StatusChip, TASK_META, fmtDay, todayYmd } from "./meta";
import { StatusMenu, type Teammate } from "./WorkPanel";
import { TaskDetailModal, TaskModal } from "./TaskModals";

type ItemForm = { kind: "PHASE" | "FEATURE"; parentId: string; title: string; description: string; priority: Priority; ownerId: string; stage: string; startDate: string; dueDate: string; estimateHours: string };

/** Create or edit a phase or feature. */
const ItemModal: React.FC<{ p: ProjectDetail; data: PlanData; team: Teammate[]; open: boolean; item: PlanItem | null; preset: Partial<ItemForm> | null; onClose: () => void; onSaved: () => void }> = ({ p, data, team, open, item, preset, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [f, setF] = useState<ItemForm>({ kind: "FEATURE", parentId: "", title: "", description: "", priority: "MEDIUM", ownerId: "", stage: "", startDate: "", dueDate: "", estimateHours: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const phases = data.items.filter((i) => i.kind === "PHASE");
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      item
        ? { kind: item.kind, parentId: item.parentId ? String(item.parentId) : "", title: item.title, description: item.description ?? "", priority: item.priority, ownerId: item.ownerId ? String(item.ownerId) : "", stage: item.stage ?? "", startDate: item.startDate ?? "", dueDate: item.dueDate ?? "", estimateHours: item.estimateHours ? String(item.estimateHours) : "" }
        : { kind: "FEATURE", parentId: "", title: "", description: "", priority: "MEDIUM", ownerId: "", stage: "", startDate: "", dueDate: "", estimateHours: "", ...preset },
    );
  }, [open, item, preset]);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 2) e.title = "At least 2 characters";
    if (f.startDate && f.dueDate && f.dueDate < f.startDate) e.dueDate = "Before the start";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = {
      title: f.title.trim(),
      description: f.description.trim(),
      priority: f.priority,
      ownerId: f.ownerId ? Number(f.ownerId) : null,
      stage: f.stage || null,
      startDate: f.startDate || null,
      dueDate: f.dueDate || null,
      estimateHours: f.estimateHours ? Number(f.estimateHours) : null,
      ...(item ? {} : { kind: f.kind, parentId: f.kind === "FEATURE" && f.parentId ? Number(f.parentId) : null }),
    };
    try {
      if (item) await sideProjectsApi.updatePlanItem(p.id, item.id, body);
      else await sideProjectsApi.createPlanItem(p.id, body);
      showToast(item ? "Saved" : f.kind === "PHASE" ? "Phase added" : "Feature added", "success");
      onClose();
      onSaved();
    } catch (err) {
      const x = failure(err, "The plan item wasn't saved");
      if (x.field) setErrors({ [x.field]: x.message });
      showToast(x.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const kind = item?.kind ?? f.kind;
  return (
    <FormModal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={kind === "PHASE" ? Layers : ListChecks}
      title={item ? `Edit ${kind === "PHASE" ? "phase" : "feature"}` : kind === "PHASE" ? "New phase" : "New feature"}
      subtitle={p.title}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {!item && (
          <div className="inline-flex rounded-full bg-slate-100 p-1 dark:bg-gray-800" role="radiogroup" aria-label="Type">
            {(["PHASE", "FEATURE"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => set("kind", k)} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${f.kind === k ? "bg-white text-slate-900 dark:bg-gray-950 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white"}`}>
                {k === "PHASE" ? "Phase" : "Feature"}
              </button>
            ))}
          </div>
        )}
        <Field label={kind === "PHASE" ? "Phase name" : "Feature"} htmlFor="pi-title" counter={{ value: f.title, min: 2, max: 150 }} error={errors.title}>
          <input id="pi-title" data-autofocus value={f.title} onChange={(e) => set("title", e.target.value)} className={`${inputCls} font-semibold`} placeholder={kind === "PHASE" ? "e.g. Build" : "e.g. Sign-in and accounts"} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "FEATURE" && !item && (
            <Field label="Phase" htmlFor="pi-parent" error={errors.parentId}>
              <SelectField id="pi-parent" className={inputCls} value={f.parentId} onChange={(e) => set("parentId", e.target.value)}>
                <option value="">No phase</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.title}
                  </option>
                ))}
              </SelectField>
            </Field>
          )}
          <Field label="Accountable" htmlFor="pi-owner" hint="One person answers for it.">
            <SelectField id="pi-owner" className={inputCls} value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)}>
              <option value="">Nobody yet</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Stage" htmlFor="pi-stage" optional>
            <SelectField id="pi-stage" className={inputCls} value={f.stage} onChange={(e) => set("stage", e.target.value)}>
              <option value="">Any stage</option>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Priority">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((pr) => (
                <button key={pr} type="button" role="radio" aria-checked={f.priority === pr} onClick={() => set("priority", pr)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition ${f.priority === pr ? "bg-slate-900 text-white dark:bg-white dark:text-gray-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"}`}>
                  <PriorityMark priority={pr} /> {PRIORITY_META[pr].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Start" htmlFor="pi-start" optional>
            <IconInput id="pi-start" icon={CalendarDays} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
          <Field label="Due" htmlFor="pi-due" optional error={errors.dueDate}>
            <IconInput id="pi-due" icon={CalendarDays} type="date" value={f.dueDate} invalid={!!errors.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
        </div>
        <Field label="Description" htmlFor="pi-desc" optional>
          <TextArea id="pi-desc" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What it covers, acceptance criteria…" />
        </Field>
      </div>
    </FormModal>
  );
};

/** Pick a template; the plan is generated and dated from the stage plan. */
const GenerateModal: React.FC<{ p: ProjectDetail; open: boolean; append: boolean; onClose: () => void; onDone: () => void }> = ({ p, open, append, onClose, onDone }) => {
  const { showToast } = useToast();
  const [data, setData] = useState<{ suggested: string; templates: PlanTemplate[] } | null>(null);
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setData(null);
    sideProjectsApi
      .planTemplates(p.id)
      .then((d) => (setData(d), setPick(d.suggested)))
      .catch((e) => (showToast(failure(e, "Templates couldn't load").message, "error"), onClose()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const chosen = data?.templates.find((t) => t.key === pick);
  const go = async () => {
    setBusy(true);
    try {
      const r = await sideProjectsApi.generatePlan(p.id, pick, append);
      showToast(`Plan ready: ${r.created} items`, "success");
      onClose();
      onDone();
    } catch (e) {
      showToast(failure(e, "The plan wasn't generated").message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormModal
      open={open}
      onClose={onClose}
      busy={busy}
      size="xl"
      icon={Wand2}
      title="Generate the implementation plan"
      subtitle="Phases follow your stages and are dated from your stage plan. Edit anything afterwards."
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={go} disabled={busy || !chosen}>
            {busy ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />} {append ? "Add to the plan" : "Generate plan"}
          </button>
        </>
      }
    >
      {!data ? (
        <div className="grid gap-3 sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-1.5" role="radiogroup" aria-label="Template">
            {data.templates.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={pick === t.key}
                onClick={() => setPick(t.key)}
                className={`flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  pick === t.key ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-800 hover:bg-slate-100 dark:bg-gray-800/60 dark:text-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {t.label}
                {t.key === data.suggested && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${pick === t.key ? "bg-blue-800 text-white" : "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"}`}>Suggested</span>}
              </button>
            ))}
          </div>
          {chosen && (
            <ol className="space-y-3">
              {chosen.phases.map((ph, i) => (
                <li key={i} className="rounded-2xl border border-slate-900/[0.07] p-3 dark:border-white/[0.06]">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg text-white" style={{ backgroundColor: statusColor(ph.stage, false) }}>
                      {React.createElement(STATUS_META[ph.stage].icon, { className: "h-3.5 w-3.5", "aria-hidden": true })}
                    </span>
                    {ph.title}
                    <span className="text-[11px] font-medium text-slate-500 dark:text-gray-400">· {STATUS_META[ph.stage].label}</span>
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {ph.features.map((f) => (
                      <li key={f} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-gray-800 dark:text-gray-200">
                        {f}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </FormModal>
  );
};

const ItemMenu: React.FC<{ onEdit: () => void; onDelete: () => void; onAddFeature?: () => void; onAddTask?: () => void }> = ({ onEdit, onDelete, onAddFeature, onAddTask }) => {
  const [open, setOpen] = useState(false);
  const entries: Array<[React.ElementType, string, () => void, boolean?]> = [
    ...(onAddFeature ? ([[Plus, "Add feature", onAddFeature]] as Array<[React.ElementType, string, () => void]>) : []),
    ...(onAddTask ? ([[ListChecks, "Add task", onAddTask]] as Array<[React.ElementType, string, () => void]>) : []),
    [Pencil, "Edit", onEdit],
    [Trash2, "Delete", onDelete, true],
  ];
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-2xl border border-slate-900/[0.07] bg-white p-1.5 dark:border-white/10 dark:bg-gray-900">
          {entries.map(([Icon, label, fn, danger]) => (
            <button key={label} role="menuitem" type="button" onClick={(e) => (e.stopPropagation(), setOpen(false), fn())} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${danger ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-slate-700 hover:bg-slate-50 dark:text-gray-100 dark:hover:bg-gray-800"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Plan view: phases with their features, each with an accountable person, dates, a status (auto
 * from its tasks unless set by hand) and its tasks. Managers edit; everyone sees it.
 */
const PlanView: React.FC<{ p: ProjectDetail; data: PlanData; team: Teammate[]; meId: number; onChanged: () => void; onOpenTasks: (itemId: number) => void }> = ({ p, data, team, meId, onChanged, onOpenTasks }) => {
  const dark = useIsDark();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const manage = p.rights.manage;
  const [itemModal, setItemModal] = useState<{ item: PlanItem | null; preset: Partial<ItemForm> | null } | null>(null);
  const [gen, setGen] = useState<{ append: boolean } | null>(null);
  const [taskModal, setTaskModal] = useState<{ itemId: number } | null>(null);
  const [detail, setDetail] = useState<number | null>(null);
  const [editTask, setEditTask] = useState<import("../../../api/sideProjects").Task | null>(null);
  const [closed, setClosed] = useState<Set<number>>(new Set());
  const [openFeature, setOpenFeature] = useState<number | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const today = todayYmd();

  const phases = data.items.filter((i) => i.kind === "PHASE");
  const loose = data.items.filter((i) => i.kind === "FEATURE" && !i.parentId);
  const features = data.items.filter((i) => i.kind === "FEATURE" && i.status !== "CANCELLED");
  const done = features.filter((i) => i.status === "DONE").length;
  const pct = features.length ? Math.round((done / features.length) * 100) : 0;
  const counts = useMemo(() => {
    const c: Partial<Record<PlanStatus, number>> = {};
    features.forEach((f) => (c[f.status] = (c[f.status] ?? 0) + 1));
    return c;
  }, [features]);
  const tasksOf = (itemId: number) => data.tasks.filter((t) => t.planItemId === itemId);

  const setStatus = async (it: PlanItem, status: PlanStatus) => {
    try {
      await sideProjectsApi.updatePlanItem(p.id, it.id, { status });
      showToast(`${it.title}: ${PLAN_META[status].label}`, "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "The status wasn't changed").message, "error");
    }
  };
  const setAuto = async (it: PlanItem) => {
    try {
      await sideProjectsApi.updatePlanItem(p.id, it.id, { statusMode: "AUTO" });
      showToast("Status follows its tasks again", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e).message, "error");
    }
  };
  const remove = async (it: PlanItem) => {
    if (!(await confirm({ title: `Delete “${it.title}”?`, tone: "danger", confirmText: "Delete", message: it.kind === "FEATURE" && it.parentId ? "Its tasks move to the phase." : undefined }))) return;
    try {
      await sideProjectsApi.deletePlanItem(p.id, it.id);
      showToast("Deleted", "success");
      onChanged();
    } catch (e) {
      showToast(failure(e, "It wasn't deleted").message, "error");
    }
  };

  if (!data.items.length) {
    return (
      <section className={`${cardCls} p-6 sm:p-8`}>
        <div className="mx-auto max-w-lg text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <Layers className="h-6 w-6" aria-hidden />
          </span>
          <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-white">No implementation plan yet</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Break the project into phases and features. Tasks then go inside them, and progress follows automatically.</p>
          {manage ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button type="button" className={primaryBtn} onClick={() => setGen({ append: false })}>
                <Wand2 className="h-4 w-4" /> Generate from a template
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setItemModal({ item: null, preset: { kind: "PHASE" } })}>
                <Plus className="h-4 w-4" /> Start from scratch
              </button>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500 dark:text-gray-400">The project owner or a team manager sets up the plan.</p>
          )}
        </div>
        <ItemModal p={p} data={data} team={team} open={!!itemModal} item={itemModal?.item ?? null} preset={itemModal?.preset ?? null} onClose={() => setItemModal(null)} onSaved={onChanged} />
        <GenerateModal p={p} open={!!gen} append={!!gen?.append} onClose={() => setGen(null)} onDone={onChanged} />
      </section>
    );
  }

  const renderFeature = (it: PlanItem) => {
    const ts = tasksOf(it.id);
    const tDone = ts.filter((t) => t.status === "DONE").length;
    const late = it.dueDate && it.dueDate < today && it.status !== "DONE" && it.status !== "CANCELLED";
    const owner = it.ownerId ? team.find((m) => m.id === it.ownerId) : null;
    const isOpen = openFeature === it.id;
    if (hideDone && it.status === "DONE") return null;
    return (
      <li key={it.id} className="rounded-xl transition hover:bg-slate-50 dark:hover:bg-gray-800/40">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <StatusMenu value={it.status} options={PLAN_FLOW} meta={PLAN_META} onPick={(s) => setStatus(it, s)} disabled={!manage} label={`Status of ${it.title}`}>
            <StatusChip meta={PLAN_META[it.status]} />
          </StatusMenu>
          <button type="button" onClick={() => setOpenFeature(isOpen ? null : it.id)} className="min-w-0 flex-1 text-left" aria-expanded={isOpen}>
            <span className={`block truncate text-sm font-semibold ${it.status === "DONE" ? "text-slate-500 line-through dark:text-gray-400" : "text-slate-800 dark:text-gray-100"}`}>{it.title}</span>
          </button>
          {it.statusMode === "AUTO" ? (
            <span className="hidden items-center gap-0.5 text-[10px] font-semibold text-slate-500 sm:inline-flex dark:text-gray-400" title="Status follows its tasks">
              <Zap className="h-3 w-3" aria-hidden /> auto
            </span>
          ) : (
            manage && (
              <button type="button" onClick={() => setAuto(it)} className="hidden text-[10px] font-semibold text-blue-700 hover:underline sm:inline dark:text-blue-300" title="Let the status follow its tasks">
                set auto
              </button>
            )
          )}
          <PriorityMark priority={it.priority} />
          {ts.length > 0 && (
            <button type="button" onClick={() => onOpenTasks(it.id)} className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700" title="Open its tasks">
              {tDone}/{ts.length}
            </button>
          )}
          {it.dueDate && <span className={`hidden shrink-0 text-[11px] font-medium tabular-nums sm:inline ${late ? "font-bold text-red-700 dark:text-red-300" : "text-slate-500 dark:text-gray-400"}`}>{fmtDay(it.dueDate)}</span>}
          {owner ? <UserAvatar name={owner.name} userId={owner.id} size={22} decorative /> : <span className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-slate-900/10 dark:border-gray-600" title="Nobody accountable" />}
          {manage && <ItemMenu onEdit={() => setItemModal({ item: it, preset: null })} onDelete={() => remove(it)} onAddTask={() => setTaskModal({ itemId: it.id })} />}
        </div>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-1 pb-2 pl-4 pr-2 sm:pl-24">
                {it.description && <p className="pb-1 text-xs text-slate-600 dark:text-gray-300">{it.description}</p>}
                {ts.map((t) => (
                  <button key={t.id} type="button" onClick={() => setDetail(t.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white dark:hover:bg-gray-900">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${TASK_META[t.status].dot}`} aria-hidden />
                    <span className={`min-w-0 flex-1 truncate ${t.status === "DONE" ? "text-slate-500 line-through dark:text-gray-400" : "text-slate-700 dark:text-gray-200"}`}>{t.title}</span>
                    <span className="text-slate-500 dark:text-gray-400">{TASK_META[t.status].label}</span>
                    {t.assigneeName && <UserAvatar name={t.assigneeName} userId={t.assigneeId ?? undefined} size={18} decorative />}
                  </button>
                ))}
                {p.rights.edit && (
                  <button type="button" onClick={() => setTaskModal({ itemId: it.id })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10">
                    <Plus className="h-3.5 w-3.5" /> Add task
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <section className={`${cardCls} flex flex-wrap items-center gap-4 p-4`}>
        <ProgressRing value={pct} size={56} stroke={5} label={`${pct}% of features done`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {done} of {features.length} features done
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PLAN_FLOW.filter((s) => counts[s]).map((s) => (
              <span key={s} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_META[s].chip}`}>
                {PLAN_META[s].label} <span className="tabular-nums">{counts[s]}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600 dark:text-gray-300">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-4 w-4 rounded accent-blue-600" /> Hide done
          </label>
          {manage && (
            <>
              <button type="button" className={`${secondaryBtn} !min-h-[36px] !px-3.5 !py-1.5`} onClick={() => setGen({ append: true })} title="Add a template's phases">
                <Wand2 className="h-4 w-4" /> Template
              </button>
              <button type="button" className={`${primaryBtn} !min-h-[36px] !px-4 !py-1.5`} onClick={() => setItemModal({ item: null, preset: { kind: "PHASE" } })}>
                <Plus className="h-4 w-4" /> Phase
              </button>
            </>
          )}
        </div>
      </section>

      {/* Phases */}
      {phases.map((ph) => {
        const fs = data.items.filter((i) => i.parentId === ph.id);
        const live = fs.filter((f) => f.status !== "CANCELLED");
        const fDone = live.filter((f) => f.status === "DONE").length;
        const isClosed = closed.has(ph.id);
        const stageColor = ph.stage ? statusColor(ph.stage as Stage, dark) : null;
        return (
          <section key={ph.id} className={`${cardCls} p-2 sm:p-3`} aria-label={ph.title}>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <button
                type="button"
                aria-expanded={!isClosed}
                aria-label={isClosed ? `Expand ${ph.title}` : `Collapse ${ph.title}`}
                onClick={() => setClosed((c) => {
                  const n = new Set(c);
                  if (n.has(ph.id)) n.delete(ph.id);
                  else n.add(ph.id);
                  return n;
                })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-800"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${isClosed ? "-rotate-90" : ""}`} />
              </button>
              {stageColor && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: stageColor }} title={STATUS_META[ph.stage as Stage].label}>
                  {React.createElement(STATUS_META[ph.stage as Stage].icon, { className: "h-3.5 w-3.5", "aria-hidden": true })}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">{ph.title}</h4>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  {fDone}/{live.length} features
                  {ph.startDate && ph.dueDate ? ` · ${fmtDay(ph.startDate)} – ${fmtDay(ph.dueDate)}` : ph.dueDate ? ` · due ${fmtDay(ph.dueDate)}` : ""}
                </p>
              </div>
              <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 sm:block dark:bg-gray-800" aria-hidden>
                <motion.div className="h-full rounded-full bg-green-600 dark:bg-green-500" initial={{ width: 0 }} animate={{ width: `${live.length ? (fDone / live.length) * 100 : 0}%` }} />
              </div>
              <StatusMenu value={ph.status} options={PLAN_FLOW} meta={PLAN_META} onPick={(s) => setStatus(ph, s)} disabled={!manage} label={`Status of ${ph.title}`}>
                <StatusChip meta={PLAN_META[ph.status]} />
              </StatusMenu>
              {manage && <ItemMenu onEdit={() => setItemModal({ item: ph, preset: null })} onDelete={() => remove(ph)} onAddFeature={() => setItemModal({ item: null, preset: { kind: "FEATURE", parentId: String(ph.id), stage: ph.stage ?? "", dueDate: ph.dueDate ?? "" } })} />}
            </div>
            <AnimatePresence initial={false}>
              {!isClosed && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <ul className="mt-1 space-y-0.5">
                    {fs.map((f) => renderFeature(f))}
                  </ul>
                  {manage && (
                    <button type="button" onClick={() => setItemModal({ item: null, preset: { kind: "FEATURE", parentId: String(ph.id), stage: ph.stage ?? "", dueDate: ph.dueDate ?? "" } })} className="ml-2 mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                      <Plus className="h-3.5 w-3.5" /> Feature
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
      {loose.length > 0 && (
        <section className={`${cardCls} p-2 sm:p-3`} aria-label="Other features">
          <h4 className="px-2 py-1.5 text-sm font-bold text-slate-900 dark:text-white">Other features</h4>
          <ul className="space-y-0.5">
            {loose.map((f) => renderFeature(f))}
          </ul>
        </section>
      )}

      <ItemModal p={p} data={data} team={team} open={!!itemModal} item={itemModal?.item ?? null} preset={itemModal?.preset ?? null} onClose={() => setItemModal(null)} onSaved={onChanged} />
      <GenerateModal p={p} open={!!gen} append={!!gen?.append} onClose={() => setGen(null)} onDone={onChanged} />
      <TaskModal p={p} data={data} team={team} meId={meId} open={!!taskModal || !!editTask} task={editTask} defaultItem={taskModal?.itemId ?? null} onClose={() => (setTaskModal(null), setEditTask(null))} onSaved={onChanged} />
      <TaskDetailModal p={p} data={data} team={team} meId={meId} taskId={detail} onClose={() => setDetail(null)} onChanged={onChanged} onEdit={(t) => (setDetail(null), setEditTask(t))} />
    </div>
  );
};

export default PlanView;
