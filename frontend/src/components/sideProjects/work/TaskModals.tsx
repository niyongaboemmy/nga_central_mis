import React, { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Check, Clock3, Flag, ListChecks, Pencil, Plus, Trash2, Undo2, UserRound } from "lucide-react";
import { failure, sideProjectsApi, type PlanData, type Priority, type ProjectDetail, type Task, type TaskDetail, type TaskStatus } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { TaskDevSection } from "../git/GitParts";
import UserAvatar from "../../ui/UserAvatar";
import SelectField from "../../ui/SelectField";
import { Field, FormModal, IconInput, TextArea } from "../form";
import { Skeleton, Spinner, inputCls, primaryBtn, secondaryBtn, timeAgo } from "../ui";
import { PRIORITIES, PRIORITY_META, PriorityMark, StatusChip, TASK_META, fmtDay, todayYmd } from "./meta";
import type { Teammate } from "./WorkPanel";

const selectCls = `${inputCls}`;

/** Options for the plan-item picker: features grouped under their phase. */
export const planOptions = (data: PlanData) => {
  const phases = data.items.filter((i) => i.kind === "PHASE");
  const out: Array<{ id: number; label: string; group: string }> = [];
  for (const ph of phases) {
    out.push({ id: ph.id, label: `${ph.title} (whole phase)`, group: ph.title });
    data.items.filter((i) => i.parentId === ph.id).forEach((f) => out.push({ id: f.id, label: f.title, group: ph.title }));
  }
  data.items.filter((i) => i.kind === "FEATURE" && !i.parentId).forEach((f) => out.push({ id: f.id, label: f.title, group: "Other" }));
  return out;
};

type Form = { title: string; description: string; planItemId: string; assigneeId: string; priority: Priority; dueDate: string; estimateHours: string };

/** Create or edit a task. Teammates create for themselves; managers assign anyone. */
export const TaskModal: React.FC<{
  p: ProjectDetail;
  data: PlanData;
  team: Teammate[];
  meId: number;
  open: boolean;
  task?: Task | null;
  defaultItem?: number | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ p, data, team, meId, open, task, defaultItem, onClose, onSaved }) => {
  const { showToast } = useToast();
  const manage = p.rights.manage;
  const [f, setF] = useState<Form>({ title: "", description: "", planItemId: "", assigneeId: "", priority: "MEDIUM", dueDate: "", estimateHours: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const opts = planOptions(data);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      task
        ? { title: task.title, description: task.description ?? "", planItemId: String(task.planItemId), assigneeId: task.assigneeId ? String(task.assigneeId) : "", priority: task.priority, dueDate: task.dueDate ?? "", estimateHours: task.estimateHours ? String(task.estimateHours) : "" }
        : { title: "", description: "", planItemId: defaultItem ? String(defaultItem) : opts.find((o) => !o.label.endsWith("(whole phase)"))?.id.toString() ?? "", assigneeId: manage ? "" : String(meId), priority: "MEDIUM", dueDate: "", estimateHours: "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, defaultItem]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 3) e.title = "At least 3 characters";
    if (!f.planItemId) e.planItemId = "Choose the plan item";
    if (f.estimateHours && (Number(f.estimateHours) < 0.5 || Number(f.estimateHours) > 999)) e.estimateHours = "Between 0.5 and 999";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = {
      title: f.title.trim(),
      description: f.description.trim(),
      planItemId: Number(f.planItemId),
      priority: f.priority,
      dueDate: f.dueDate || null,
      estimateHours: f.estimateHours ? Number(f.estimateHours) : null,
      ...(manage || !task ? { assigneeId: f.assigneeId ? Number(f.assigneeId) : null } : {}),
    };
    try {
      if (task) await sideProjectsApi.updateTask(p.id, task.id, body);
      else await sideProjectsApi.createTask(p.id, body);
      showToast(task ? "Task updated" : "Task added", "success");
      onClose();
      onSaved();
    } catch (err) {
      const x = failure(err, task ? "The task wasn't updated" : "The task wasn't added");
      if (x.field) setErrors({ [x.field]: x.message });
      showToast(x.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      busy={busy}
      size="lg"
      icon={ListChecks}
      title={task ? "Edit task" : "New task"}
      subtitle={p.title}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} {task ? "Save changes" : "Add task"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Task" htmlFor="tk-title" counter={{ value: f.title, min: 3, max: 200 }} error={errors.title}>
          <input id="tk-title" data-autofocus value={f.title} onChange={(e) => set("title", e.target.value)} className={`${inputCls} font-semibold`} placeholder="e.g. Build the sign-in page" />
        </Field>
        <Field label="Plan item" htmlFor="tk-item" error={errors.planItemId} hint="Every task belongs to a part of the plan.">
          <SelectField id="tk-item" className={selectCls} value={f.planItemId} onChange={(e) => set("planItemId", e.target.value)}>
            <option value="">Choose…</option>
            {[...new Set(opts.map((o) => o.group))].map((g) => (
              <optgroup key={g} label={g}>
                {opts.filter((o) => o.group === g).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Assignee"
            htmlFor="tk-who"
            icon={UserRound}
            error={errors.assigneeId}
            hint={!manage ? "Only managers assign others" : team.length < 2 ? "Invite teammates under Team to assign them work" : undefined}
          >
            <SelectField id="tk-who" className={selectCls} value={f.assigneeId} disabled={!manage && !!task} onChange={(e) => set("assigneeId", e.target.value)}>
              {manage && <option value="">Unassigned</option>}
              {team.filter((m) => manage || m.id === meId).map((m) => (
                <option key={m.id} value={m.id}>
                  {`${m.name}${m.id === meId ? " (me)" : ""}${m.role ? ` · ${m.role}` : ""}${m.invited ? " · invited" : ""}`}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label="Priority" icon={Flag}>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Priority">
              {PRIORITIES.map((pr) => (
                <button
                  key={pr}
                  type="button"
                  role="radio"
                  aria-checked={f.priority === pr}
                  onClick={() => set("priority", pr)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition ${f.priority === pr ? "bg-slate-900 text-white dark:bg-white dark:text-gray-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"}`}
                >
                  <PriorityMark priority={pr} /> {PRIORITY_META[pr].label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Due date" htmlFor="tk-due" icon={CalendarDays} optional error={errors.dueDate}>
            <IconInput id="tk-due" icon={CalendarDays} type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
          </Field>
          <Field label="Estimate (hours)" htmlFor="tk-est" icon={Clock3} optional error={errors.estimateHours}>
            <IconInput id="tk-est" icon={Clock3} type="number" min={0.5} step={0.5} value={f.estimateHours} onChange={(e) => set("estimateHours", e.target.value)} placeholder="e.g. 3" />
          </Field>
        </div>
        <Field label="Details" htmlFor="tk-desc" optional>
          <TextArea id="tk-desc" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What done looks like, links, notes…" />
        </Field>
      </div>
    </FormModal>
  );
};

/** The next moves offered as buttons, by state. */
const NEXT: Record<TaskStatus, TaskStatus[]> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["IN_REVIEW", "DONE", "BLOCKED"],
  IN_REVIEW: ["DONE", "IN_PROGRESS"],
  BLOCKED: ["IN_PROGRESS", "TODO", "CANCELLED"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["TODO"],
};
const MOVE_LABEL: Partial<Record<TaskStatus, string>> = { IN_PROGRESS: "Start", IN_REVIEW: "Send for review", DONE: "Mark done", BLOCKED: "Blocked", CANCELLED: "Cancel task", TODO: "Back to to do" };

/** Ask why a task is blocked (shared by the board and the detail view). */
export const BlockedReason: React.FC<{ open: boolean; busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }> = ({ open, busy, onCancel, onConfirm }) => {
  const [text, setText] = useState("");
  useEffect(() => setText(""), [open]);
  return (
    <FormModal
      open={open}
      onClose={onCancel}
      busy={busy}
      size="md"
      icon={TASK_META.BLOCKED.icon}
      title="What is blocking it?"
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onCancel} disabled={busy}>
            <Undo2 className="h-4 w-4" /> Cancel
          </button>
          <button type="button" className={primaryBtn} onClick={() => onConfirm(text.trim())} disabled={busy || text.trim().length < 3}>
            {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Mark blocked
          </button>
        </>
      }
    >
      <Field label="Reason" htmlFor="blk" counter={{ value: text, min: 3, max: 500 }} hint="Managers are told, so they can help.">
        <TextArea id="blk" data-autofocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Waiting for the API key from the school IT team" />
      </Field>
    </FormModal>
  );
};

/** One task: state and next moves, facts, work log and history. */
export const TaskDetailModal: React.FC<{
  p: ProjectDetail;
  data: PlanData;
  team: Teammate[];
  meId: number;
  taskId: number | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (t: Task) => void;
}> = ({ p, data, team, meId, taskId, onClose, onChanged, onEdit }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [t, setT] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [log, setLog] = useState({ workDate: todayYmd(), hours: 1, note: "" });

  const load = async () => {
    if (!taskId) return;
    try {
      setT(await sideProjectsApi.task(p.id, taskId));
    } catch (e) {
      showToast(failure(e, "The task couldn't load").message, "error");
      onClose();
    }
  };
  useEffect(() => {
    setT(null);
    setLog({ workDate: todayYmd(), hours: 1, note: "" });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const mine = !!t && t.assigneeId === meId;
  const canMove = !!t && (p.rights.manage || mine || (!t.assigneeId && p.rights.edit));
  const canEdit = !!t && (p.rights.manage || mine || t.createdBy === meId);
  const item = t ? data.items.find((i) => i.id === t.planItemId) : null;

  const move = async (to: TaskStatus, note?: string) => {
    if (!t) return;
    if (to === "BLOCKED" && !note) return setBlocking(true);
    setBusy(to);
    try {
      await sideProjectsApi.moveTask(p.id, t.id, to, note);
      showToast(`${TASK_META[to].label}${to === "DONE" ? ". Nice work" : ""}`, "success");
      setBlocking(false);
      await load();
      onChanged();
    } catch (e) {
      showToast(failure(e, "The task didn't move").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const addLog = async () => {
    if (!t) return;
    setBusy("log");
    try {
      await sideProjectsApi.logWork(p.id, t.id, { workDate: log.workDate, hours: log.hours, note: log.note.trim() || undefined });
      showToast(`${log.hours} h logged`, "success");
      setLog({ workDate: todayYmd(), hours: 1, note: "" });
      await load();
      onChanged();
    } catch (e) {
      showToast(failure(e, "The work wasn't logged").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!t || !(await confirm({ title: `Delete “${t.title}”?`, tone: "danger", confirmText: "Delete", message: "Its history and work log go too." }))) return;
    setBusy("delete");
    try {
      await sideProjectsApi.deleteTask(p.id, t.id);
      showToast("Task deleted", "success");
      onClose();
      onChanged();
    } catch (e) {
      showToast(failure(e, "The task wasn't deleted").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const removeLog = async (id: number) => {
    if (!t) return;
    try {
      await sideProjectsApi.deleteLog(p.id, t.id, id);
      showToast("Log removed", "success");
      await load();
      onChanged();
    } catch (e) {
      showToast(failure(e, "The log wasn't removed").message, "error");
    }
  };
  const assignee = t?.assigneeId ? team.find((m) => m.id === t.assigneeId) : null;

  return (
    <>
      <FormModal
        open={!!taskId}
        onClose={onClose}
        size="lg"
        icon={ListChecks}
        title={t?.title ?? "Task"}
        subtitle={item ? item.title : p.title}
        footer={
          t ? (
            <>
              <div className="flex gap-1">
                {canEdit && (
                  <button type="button" className={`${secondaryBtn} !px-4`} onClick={() => onEdit(t)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                )}
                {(p.rights.manage || (t.createdBy === meId && t.status === "TODO")) && (
                  <button type="button" aria-label="Delete task" className="inline-flex h-10 w-10 items-center justify-center rounded-full text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={remove} disabled={busy !== null}>
                    {busy === "delete" ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </div>
              <button type="button" className={secondaryBtn} onClick={onClose}>
                Close
              </button>
            </>
          ) : undefined
        }
      >
        {!t ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* State and next moves */}
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip meta={TASK_META[t.status]} size="md" />
              {canMove && (
                <>
                  <ArrowRight className="h-4 w-4 text-slate-400 dark:text-gray-500" aria-hidden />
                  {NEXT[t.status].map((to) => (
                    <button
                      key={to}
                      type="button"
                      onClick={() => move(to)}
                      disabled={busy !== null}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                        to === "DONE" || (to === "IN_PROGRESS" && t.status === "TODO") ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {busy === to ? <Spinner className="h-3.5 w-3.5" /> : React.createElement(TASK_META[to].icon, { className: "h-3.5 w-3.5", "aria-hidden": true })}
                      {MOVE_LABEL[to]}
                    </button>
                  ))}
                </>
              )}
            </div>
            {t.status === "BLOCKED" && t.blockedReason && (
              <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{t.blockedReason}</p>
            )}

            {/* Facts */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Assignee", assignee ? (
                  <span className="flex items-center gap-1.5"><UserAvatar name={assignee.name} userId={assignee.id} size={20} decorative /> <span className="truncate">{assignee.name.split(" ")[0]}</span></span>
                ) : "Unassigned"],
                ["Priority", <PriorityMark key="p" priority={t.priority} withLabel />],
                ["Due", t.dueDate ? <span className={t.overdue ? "font-bold text-red-700 dark:text-red-300" : ""}>{fmtDay(t.dueDate)}{t.overdue ? " · overdue" : ""}</span> : "–"],
                ["Time", `${t.spentHours}h${t.estimateHours ? ` of ${t.estimateHours}h` : ""}`],
              ].map(([k, val], i) => (
                <div key={i} className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-gray-800/60">
                  <dt className="text-[11px] font-medium text-slate-500 dark:text-gray-400">{k as string}</dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold text-slate-800 dark:text-gray-100">{val as React.ReactNode}</dd>
                </div>
              ))}
            </dl>
            {t.description && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-gray-200">{t.description}</p>}

            {/* Log work */}
            {(mine || p.rights.manage) && t.status !== "CANCELLED" && (
              <section className="rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/60" aria-label="Log work">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-gray-200">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden /> Log work
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" aria-label="Day" value={log.workDate} max={todayYmd()} onChange={(e) => setLog((l) => ({ ...l, workDate: e.target.value }))} className={`${inputCls} !min-h-[36px] !w-auto !rounded-full !px-3 !py-1.5 text-xs [color-scheme:light] dark:[color-scheme:dark]`} />
                  {[0.5, 1, 2, 3, 4].map((h) => (
                    <button key={h} type="button" aria-pressed={log.hours === h} onClick={() => setLog((l) => ({ ...l, hours: h }))} className={`min-w-[2.5rem] rounded-full px-2.5 py-1.5 text-xs font-bold tabular-nums transition ${log.hours === h ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"}`}>
                      {h}h
                    </button>
                  ))}
                  <input aria-label="What you did" value={log.note} onChange={(e) => setLog((l) => ({ ...l, note: e.target.value }))} maxLength={500} placeholder="What you did (optional)" className={`${inputCls} !min-h-[36px] min-w-[10rem] flex-1 !rounded-full !py-1.5 text-xs`} />
                  <button type="button" onClick={addLog} disabled={busy !== null} className={`${primaryBtn} !min-h-[36px] !px-4 !py-1.5`}>
                    {busy === "log" ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Log
                  </button>
                </div>
                {t.logs.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {t.logs.map((l) => (
                      <li key={l.id} className="group flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs hover:bg-white dark:hover:bg-gray-900">
                        <UserAvatar name={l.name} userId={l.userId} size={18} decorative />
                        <span className="w-14 shrink-0 font-semibold tabular-nums text-slate-600 dark:text-gray-300">{fmtDay(l.workDate)}</span>
                        <span className="w-10 shrink-0 font-bold tabular-nums text-slate-900 dark:text-white">{l.hours}h</span>
                        <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-gray-300">{l.note}</span>
                        {(l.userId === meId || p.rights.manage) && (
                          <button type="button" aria-label="Remove log" onClick={() => removeLog(l.id)} className="rounded-full p-1 text-slate-400 opacity-0 transition hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:text-gray-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Development: branch name to copy, linked branch / PRs / commits */}
            <TaskDevSection projectId={p.id} taskId={t.id} />

            {/* History */}
            <section aria-label="History">
              <p className="mb-2 text-xs font-bold text-slate-700 dark:text-gray-200">History</p>
              <ol className="space-y-2">
                {t.history.map((h) => (
                  <li key={h.id} className="flex items-start gap-2.5 text-xs">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TASK_META[h.toStatus].dot}`} aria-hidden />
                    <span className="min-w-0 flex-1 text-slate-600 dark:text-gray-300">
                      <span className="font-semibold text-slate-800 dark:text-gray-100">{h.actor || "Someone"}</span>{" "}
                      {h.fromStatus ? (
                        <>
                          moved it to <span className="font-semibold">{TASK_META[h.toStatus].label}</span>
                        </>
                      ) : (
                        "created it"
                      )}
                      {h.note && <span className="block text-slate-500 dark:text-gray-400">“{h.note}”</span>}
                    </span>
                    <span className="shrink-0 text-slate-500 dark:text-gray-400">{timeAgo(h.at)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </FormModal>
      <BlockedReason open={blocking} busy={busy === "BLOCKED"} onCancel={() => setBlocking(false)} onConfirm={(r) => move("BLOCKED", r)} />
    </>
  );
};
