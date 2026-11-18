import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, CheckCircle2, Clock3, ListChecks, RefreshCw } from "lucide-react";
import { failure, sideProjectsApi, type Task, type TaskStatus } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { Skeleton, cardCls, chipCls } from "../ui";
import { PriorityMark, StatusChip, TASK_META, fmtDay, todayYmd } from "./meta";
import { StatusMenu } from "./WorkPanel";
import { BlockedReason } from "./TaskModals";

const MOVES: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];

/**
 * My tasks: everything assigned to me across my projects, grouped Overdue / Today / This week /
 * Later / No date, with quick state changes. Done in the last 14 days shows under Done.
 */
const MyTasks: React.FC<{ onOpenProject: (id: number) => void }> = ({ onOpenProject }) => {
  const { showToast } = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [blocking, setBlocking] = useState<Task | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      setTasks(await sideProjectsApi.myTasks());
    } catch (e) {
      setError(failure(e, "Your tasks couldn't load").message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const move = async (t: Task, to: TaskStatus, note?: string) => {
    if (to === "BLOCKED" && !note) return setBlocking(t);
    setBusy(t.id);
    try {
      await sideProjectsApi.moveTask(t.projectId, t.id, to, note);
      showToast(`${t.title}: ${TASK_META[to].label}`, "success");
      setBlocking(null);
      await load();
    } catch (e) {
      showToast(failure(e, "The task didn't move").message, "error");
    } finally {
      setBusy(null);
    }
  };

  const groups = useMemo(() => {
    if (!tasks) return [];
    const today = todayYmd();
    const week = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    const open = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");
    const g: Array<{ key: string; label: string; items: Task[]; tone?: "bad" }> = [
      { key: "overdue", label: "Overdue", items: open.filter((t) => t.dueDate && t.dueDate < today), tone: "bad" },
      { key: "today", label: "Due today", items: open.filter((t) => t.dueDate === today) },
      { key: "week", label: "This week", items: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= week) },
      { key: "later", label: "Later", items: open.filter((t) => t.dueDate && t.dueDate > week) },
      { key: "none", label: "No due date", items: open.filter((t) => !t.dueDate) },
    ];
    if (showDone) g.push({ key: "done", label: "Done recently", items: tasks.filter((t) => t.status === "DONE") });
    return g.filter((x) => x.items.length);
  }, [tasks, showDone]);

  if (error)
    return (
      <div className={`${cardCls} p-8 text-center`}>
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        <button type="button" onClick={load} className="mt-2 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
          Retry
        </button>
      </div>
    );
  if (!tasks)
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading your tasks">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );

  const openCount = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED").length;
  const doneCount = tasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">
          {openCount} open task{openCount === 1 ? "" : "s"}
        </span>
        {doneCount > 0 && (
          <button type="button" aria-pressed={showDone} onClick={() => setShowDone((s) => !s)} className={chipCls(showDone)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Done recently {doneCount}
          </button>
        )}
        <button type="button" onClick={load} aria-label="Refresh" title="Refresh" className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {groups.length === 0 ? (
        <div className={`${cardCls} flex flex-col items-center gap-2 p-10 text-center`}>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <ListChecks className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Nothing assigned to you</p>
          <p className="text-xs text-slate-500 dark:text-gray-400">Tasks from your projects' plans appear here when they are yours.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.label} className={`${cardCls} p-2`}>
            <h3 className={`px-3 py-2 text-xs font-bold ${g.tone === "bad" ? "text-red-700 dark:text-red-300" : "text-slate-700 dark:text-gray-200"}`}>
              {g.label} <span className="font-medium text-slate-500 dark:text-gray-400">{g.items.length}</span>
            </h3>
            <ul>
              {g.items.map((t) => (
                <motion.li layout key={t.id} className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-gray-800/50 ${busy === t.id ? "opacity-60" : ""}`}>
                  <StatusMenu value={t.status} options={MOVES} meta={TASK_META} onPick={(s) => move(t, s)} label={`Move ${t.title}`}>
                    <StatusChip meta={TASK_META[t.status]} />
                  </StatusMenu>
                  <button type="button" onClick={() => onOpenProject(t.projectId)} className="min-w-0 flex-1 text-left">
                    <span className={`block truncate text-sm font-semibold ${t.status === "DONE" ? "text-slate-500 line-through dark:text-gray-400" : "text-slate-800 dark:text-gray-100"}`}>{t.title}</span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-gray-400">
                      {t.projectTitle} · {t.planItemTitle}
                    </span>
                  </button>
                  <PriorityMark priority={t.priority} />
                  {(t.spentHours > 0 || t.estimateHours) && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-slate-500 dark:text-gray-400">
                      <Clock3 className="h-3 w-3" aria-hidden /> {t.spentHours}
                      {t.estimateHours ? `/${t.estimateHours}` : ""}h
                    </span>
                  )}
                  {t.dueDate && (
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${t.overdue ? "font-bold text-red-700 dark:text-red-300" : "text-slate-500 dark:text-gray-400"}`}>
                      <CalendarDays className="h-3 w-3" aria-hidden /> {fmtDay(t.dueDate)}
                    </span>
                  )}
                </motion.li>
              ))}
            </ul>
          </section>
        ))
      )}
      <BlockedReason open={!!blocking} busy={busy !== null} onCancel={() => setBlocking(null)} onConfirm={(r) => blocking && move(blocking, "BLOCKED", r)} />
    </div>
  );
};

export default MyTasks;
