import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Clock3, GitCommitHorizontal, Github, ListChecks, Sparkles, Trash2, Wand2 } from "lucide-react";
import { failure, gitApi, type DraftLine, type PlanData, type ProjectDetail, type ReportDraft } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import SelectField from "../../ui/SelectField";
import { cardCls, primaryBtn, secondaryBtn, Skeleton, Spinner } from "../ui";
import { TextArea } from "../form";
import { prMeta } from "./GitParts";

/**
 * "Your report is ready": the living draft written from the person's GitHub work
 * (GIT_AUTOMATED_REPORTING_ANALYSIS.md §7). Review in seconds: tick lines, adjust hours,
 * pick a task for unlinked work, tweak the wording, submit.
 */
const HOURS = ["", "0.5", "1", "1.5", "2", "2.5", "3", "4", "5", "6", "8"];
const sourceWord: Record<string, string> = { GIT_ESTIMATE: "estimated", EDITOR: "editor time", COMMIT: "from #time", TYPED: "yours" };

const DraftCard: React.FC<{ p: ProjectDetail; plan: PlanData | null; meId: number; onSubmitted: () => void; focus?: boolean }> = ({ p, plan, meId, onSubmitted, focus }) => {
  const { showToast } = useToast();
  const [d, setD] = useState<ReportDraft | null>(null);
  const [canPolish, setCanPolish] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [text, setText] = useState({ did: "", nextSteps: "", blockers: "" });
  const ref = useRef<HTMLElement>(null);

  const load = async () => {
    try {
      const r = await gitApi.draft(p.id);
      setD(r.draft);
      setCanPolish(r.canPolish);
      if (r.draft) setText({ did: r.draft.did, nextSteps: r.draft.nextSteps, blockers: r.draft.blockers });
    } catch {
      setD(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);
  useEffect(() => {
    if (focus && d && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, d]);

  if (loading)
    return (
      <div className={`${cardCls} space-y-3 p-4`} aria-busy="true" aria-label="Loading your GitHub draft">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  if (!d) return null;

  const myTasks = (plan?.tasks ?? []).filter((t) => (t.assigneeId === meId || !t.assigneeId) && t.status !== "CANCELLED");
  const included = d.lines.filter((l) => l.include);
  const total = included.reduce((s, l) => s + (l.hours ?? 0), 0);
  const unlinked = included.filter((l) => !l.taskId && !l.itemId).length;

  const patchLine = async (l: DraftLine, patch: { include?: boolean; hours?: number | null; taskId?: number | null }) => {
    setBusy(`line:${l.key}`);
    try {
      const next = await gitApi.editDraft(d.id, { lines: [{ key: l.key, ...patch }] });
      setD(next);
    } catch (e) {
      showToast(failure(e).message, "error");
    } finally {
      setBusy(null);
    }
  };
  const saveText = async () => {
    if (text.did === d.did && text.nextSteps === d.nextSteps && text.blockers === d.blockers) return;
    try {
      setD(await gitApi.editDraft(d.id, text));
    } catch (e) {
      showToast(failure(e).message, "error");
    }
  };
  const submit = async () => {
    if (!included.length) return showToast("Tick at least one line to report", "warning");
    setBusy("submit");
    try {
      await gitApi.submitDraft(d.id, text);
      showToast("Report submitted from your GitHub work", "success");
      setD(null);
      onSubmitted();
    } catch (e) {
      showToast(failure(e, "Couldn't submit the report").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const polish = async () => {
    setBusy("polish");
    try {
      const next = await gitApi.polishDraft(d.id);
      setD(next);
      setText({ did: next.did, nextSteps: next.nextSteps, blockers: next.blockers });
      showToast("Reworded with AI. Check it before you submit", "success");
    } catch (e) {
      showToast(failure(e, "AI wording isn't available right now").message, "error");
    } finally {
      setBusy(null);
    }
  };
  const dismiss = async () => {
    setBusy("dismiss");
    try {
      await gitApi.dismissDraft(d.id);
      setD(null);
      showToast("Draft dismissed. New GitHub work will start a fresh one", "info");
    } catch (e) {
      showToast(failure(e).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.section ref={ref} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${cardCls} overflow-hidden`} aria-label="Report draft from GitHub">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-900/[0.05] px-4 py-3 dark:border-white/[0.06]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Github className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Your report is ready</p>
          <p className="text-xs text-slate-500 dark:text-gray-400">
            Written from your GitHub work · {d.commitCount} {d.commitCount === 1 ? "commit" : "commits"} · {included.length} {included.length === 1 ? "line" : "lines"}
            {total ? ` · ~${Math.round(total * 2) / 2} h` : ""}
            {d.aiPolished ? " · worded with AI" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {canPolish && (
            <button type="button" onClick={polish} disabled={busy !== null} className={secondaryBtn}>
              {busy === "polish" ? <Spinner className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />} {d.aiPolished ? "Reword" : "Word it with AI"}
            </button>
          )}
          <button type="button" onClick={dismiss} disabled={busy !== null} aria-label="Dismiss this draft" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800">
            {busy === "dismiss" ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <ul className="divide-y divide-slate-900/[0.05] dark:divide-white/[0.06]">
        {d.lines.map((l) => {
          const expanded = !!open[l.key];
          return (
            <li key={l.key} className={`px-4 py-3 ${l.include ? "" : "opacity-55"}`}>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={l.include}
                  onChange={(e) => patchLine(l, { include: e.target.checked })}
                  disabled={busy !== null}
                  aria-label={`Include ${l.title}`}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
                />
                <div className="min-w-0 flex-1">
                  {l.taskId || l.itemId ? (
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800 dark:text-gray-100">
                      <ListChecks className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden /> {l.title}
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">{l.title}</span>
                      <SelectField
                        aria-label={`Task for ${l.title}`}
                        value={l.suggestedTaskId && !l.taskId ? "" : ""}
                        onChange={(e) => e.target.value && patchLine(l, { taskId: Number(e.target.value) })}
                        className="min-w-[12rem] rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs dark:border-amber-500/40 dark:bg-gray-900"
                      >
                        <option value="">{l.suggestedTaskId ? `Pick a task (suggested: ${myTasks.find((t) => t.id === l.suggestedTaskId)?.title ?? "your task in progress"})` : "Pick the task this was for…"}</option>
                        {myTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  )}
                  <button type="button" onClick={() => setOpen((o) => ({ ...o, [l.key]: !expanded }))} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-300" aria-expanded={expanded}>
                    <GitCommitHorizontal className="h-3 w-3" aria-hidden /> {l.commits.length} {l.commits.length === 1 ? "commit" : "commits"}
                    {l.prs.map((pr) => ` · PR #${pr.number} ${prMeta({ ...pr, draft: false }).label.toLowerCase()}`).join("")}
                    <ChevronDown className={`h-3 w-3 transition ${expanded ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                </div>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden />
                  <SelectField
                    aria-label={`Hours on ${l.title}`}
                    value={l.hours === null ? "" : String(l.hours)}
                    onChange={(e) => patchLine(l, { hours: e.target.value ? Number(e.target.value) : null })}
                    className="w-[5.5rem] rounded-full border border-slate-900/[0.07] bg-white px-2.5 py-1 text-xs font-semibold tabular-nums dark:border-white/10 dark:bg-gray-900"
                  >
                    {HOURS.concat(l.hours !== null && !HOURS.includes(String(l.hours)) ? [String(l.hours)] : []).map((h) => (
                      <option key={h} value={h}>
                        {h ? `${h} h` : "— h"}
                      </option>
                    ))}
                  </SelectField>
                  {l.hoursSource && l.hours !== null && <span className="hidden text-[10px] sm:inline">{sourceWord[l.hoursSource]}</span>}
                </label>
                {busy === `line:${l.key}` && <Spinner className="h-3.5 w-3.5" />}
              </div>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="ml-[26px] mt-2 space-y-1 overflow-hidden pl-1">
                    {l.commits.map((c) => (
                      <li key={c.sha} className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                        <span className="font-mono text-[10px] text-slate-400">{c.sha.slice(0, 7)}</span>
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="truncate hover:text-blue-700 dark:hover:text-blue-300">
                            {c.title}
                          </a>
                        ) : (
                          <span className="truncate">{c.title}</span>
                        )}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-3 border-t border-slate-900/[0.05] p-4 dark:border-white/[0.06] md:grid-cols-3">
        <label className="md:col-span-3">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-gray-200">
            What I did {d.aiPolished && <Sparkles className="h-3 w-3 text-blue-600 dark:text-blue-400" aria-label="Worded with AI" />}
          </span>
          <TextArea rows={3} value={text.did} onChange={(e) => setText((t) => ({ ...t, did: e.target.value }))} onBlur={saveText} />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-gray-200">Next steps</span>
          <TextArea rows={2} value={text.nextSteps} onChange={(e) => setText((t) => ({ ...t, nextSteps: e.target.value }))} onBlur={saveText} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-gray-200">Blockers</span>
          <TextArea rows={2} value={text.blockers} onChange={(e) => setText((t) => ({ ...t, blockers: e.target.value }))} onBlur={saveText} placeholder="None" />
        </label>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-900/[0.05] px-4 py-3 dark:border-white/[0.06]">
        <p className="text-[11px] text-slate-500 dark:text-gray-400">
          {unlinked ? `${unlinked} ${unlinked === 1 ? "line needs" : "lines need"} a task, or untick ${unlinked === 1 ? "it" : "them"}. ` : ""}Hours from GitHub are estimates: adjust them before you submit.
        </p>
        <button type="button" onClick={submit} disabled={busy !== null} className={primaryBtn}>
          {busy === "submit" ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Submit report
        </button>
      </footer>
    </motion.section>
  );
};

export default DraftCard;
