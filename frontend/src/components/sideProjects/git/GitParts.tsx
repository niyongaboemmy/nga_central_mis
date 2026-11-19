import React, { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, Github } from "lucide-react";
import { gitApi, type GitTaskDev, type Task } from "../../../api/sideProjects";
import { useToast } from "../../../contexts/ToastContext";
import { Skeleton, timeAgo } from "../ui";

/** Git UI pieces shared by tasks, plan, reports (GIT_AUTOMATED_REPORTING_ANALYSIS.md §10.4). */

type PrLike = { number: number; state: string; draft: boolean; reviewState?: string | null; url?: string };

export const prMeta = (pr: PrLike) => {
  if (pr.state === "MERGED") return { icon: GitMerge, label: "Merged", cls: "bg-blue-600 text-white" };
  if (pr.state === "CLOSED") return { icon: GitPullRequestClosed, label: "Closed", cls: "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300" };
  if (pr.draft) return { icon: GitPullRequestDraft, label: "Draft", cls: "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300" };
  if (pr.reviewState === "CHANGES_REQUESTED") return { icon: GitPullRequest, label: "Changes requested", cls: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200" };
  if (pr.reviewState === "APPROVED") return { icon: GitPullRequest, label: "Approved", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" };
  return { icon: GitPullRequest, label: "In review", cls: "bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200" };
};

/** "#12 · In review" on a task card or row. */
export const PrChip: React.FC<{ pr: NonNullable<Task["pr"]>; compact?: boolean }> = ({ pr, compact }) => {
  const m = prMeta(pr);
  const Icon = m.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${m.cls}`} title={`Pull request #${pr.number}: ${m.label}`}>
      <Icon className="h-3 w-3" aria-hidden />#{pr.number}
      {!compact && <span className="font-semibold">· {m.label}</span>}
    </span>
  );
};

/** "via GitHub" on a report written from a Git draft. */
export const SourceBadge: React.FC<{ source?: string }> = ({ source }) =>
  source === "GIT" || source === "GIT_AUTO" ? (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-500/10 dark:text-blue-200"
      title={source === "GIT_AUTO" ? "Written from GitHub and submitted automatically by the project's policy" : "Written from GitHub and confirmed by its author"}
    >
      <Github className="h-3 w-3" aria-hidden /> {source === "GIT_AUTO" ? "From GitHub · auto" : "From GitHub"}
    </span>
  ) : null;

/** A value with a copy button (branch name, git command). */
export const CopyField: React.FC<{ value: string; label: string; mono?: boolean }> = ({ value, label, mono = true }) => {
  const { showToast } = useToast();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      showToast(`${label} copied`, "success");
      setTimeout(() => setDone(false), 1600);
    } catch {
      showToast("Couldn't copy: select the text and copy it", "error");
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-900/[0.07] bg-white py-1 pl-3 pr-1 dark:border-white/10 dark:bg-gray-900">
      <code className={`min-w-0 flex-1 truncate text-xs text-slate-800 dark:text-gray-100 ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </code>
      <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2 text-[11px] font-semibold text-white transition hover:bg-blue-700">
        {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

/** Task detail "Development": branch name to copy, linked branch / PRs / commits. */
export const TaskDevSection: React.FC<{ projectId: number; taskId: number }> = ({ projectId, taskId }) => {
  const [d, setD] = useState<GitTaskDev | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    setD(null);
    setErr(false);
    gitApi
      .taskDev(projectId, taskId)
      .then((x) => live && setD(x))
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [projectId, taskId]);
  if (err) return null;
  return (
    <section className="rounded-2xl bg-slate-50 p-3 dark:bg-gray-800/60" aria-label="Development">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-gray-200">
        <GitBranch className="h-3.5 w-3.5" aria-hidden /> Development
        {d && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">{d.key}</span>}
      </p>
      {!d ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading development links">
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="space-y-2.5">
          <CopyField value={d.branchName} label="Branch name" />
          <CopyField value={d.command} label="Git command" />
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-gray-400">
            Work on this branch, or put <span className="font-mono font-semibold text-slate-700 dark:text-gray-200">{d.key}</span> in a commit or pull request title. {d.connected ? "The task moves on its own: branch → In progress, pull request → In review, merged → Done." : "Once the project's repository is connected (GitHub tab), the task moves on its own."}
          </p>
          {(d.prs.length > 0 || d.branches.length > 0 || d.commits.length > 0) && (
            <ul className="space-y-1.5 border-t border-slate-900/[0.05] pt-2.5 dark:border-white/[0.06]">
              {d.prs.map((pr) => {
                const m = prMeta(pr);
                return (
                  <li key={`pr${pr.number}`} className="flex items-center gap-2 text-xs">
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${m.cls}`}>
                      <m.icon className="h-3 w-3" aria-hidden /> {m.label}
                    </span>
                    <a href={pr.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-semibold text-slate-800 hover:text-blue-700 dark:text-gray-100 dark:hover:text-blue-300">
                      #{pr.number} {pr.title}
                    </a>
                    <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                  </li>
                );
              })}
              {d.branches.map((b) => (
                <li key={`b${b.name}`} className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                  <span className={`min-w-0 flex-1 truncate font-mono ${b.deleted ? "line-through opacity-60" : ""}`}>{b.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-500 dark:text-gray-400">{timeAgo(b.lastCommitAt ?? b.createdAt)}</span>
                </li>
              ))}
              {d.commits.slice(0, 5).map((c) => (
                <li key={c.sha} className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                  <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:text-blue-700 dark:hover:text-blue-300">
                      {c.title}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  )}
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">{c.sha.slice(0, 7)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
