import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Hourglass, Loader2, Pause, Play, RotateCcw, Server, Square, Wifi, WifiOff } from "lucide-react";
import type { RunDetail, RunWeek } from "../../../api/studio";
import { useMotion } from "../../../design/motion";
import { ProgressBar } from "../ui/primitives";
import { autoRetry, isRunActive, kindLabel, relativeTime, RUN_STATUS_LABEL, runProgress, skipLabel, STAGE_LABEL, weekStage, WeekStage } from "./studioModel";

const STAGE_STYLE: Record<WeekStage, { icon: React.ElementType; cls: string; spin?: boolean }> = {
  queued: { icon: Clock, cls: "text-slate-600 dark:text-slate-300" },
  reading: { icon: Loader2, cls: "text-brand-600 dark:text-brand-200", spin: true },
  writing: { icon: Loader2, cls: "text-brand-600 dark:text-brand-200", spin: true },
  questions: { icon: Loader2, cls: "text-brand-600 dark:text-brand-200", spin: true },
  ready: { icon: CheckCircle2, cls: "text-success-700 dark:text-success-500" },
  failed: { icon: AlertTriangle, cls: "text-danger-700 dark:text-danger-500" },
  skipped: { icon: CheckCircle2, cls: "text-slate-600 dark:text-slate-300" },
  waiting: { icon: Hourglass, cls: "text-warning-700 dark:text-warning-500" },
};

const PROVIDER_NAME: Record<string, string> = { glm: "GLM", groq: "Groq", gemini: "Gemini", openai: "OpenAI" };
const providerName = (p?: string | null) => (p ? PROVIDER_NAME[p] ?? p : null);

function digestLine(week: RunWeek): string[] {
  const out: string[] = [];
  for (const t of week.tasks) {
    const d = t.output_digest || {};
    if (t.status === "SKIPPED") {
      if (t.kind !== "REUSE_PLACEMENT" || t.skip_reason !== "NOTHING_TO_PLACE") out.push(`${kindLabel(t.kind)}: ${skipLabel(t.skip_reason)}`);
      continue;
    }
    if (t.status !== "SUCCEEDED") continue;
    if (t.kind === "REUSE_PLACEMENT") out.push(`Placed ${d.placed} of your note${d.placed === 1 ? "" : "s"}`);
    if (t.kind === "CORE_LESSON")
      out.push(
        [`Lesson · ${Number(d.words || 0).toLocaleString()} words`, d.interactions ? `${d.interactions} activities` : null, d.practical ? "practical task" : null, providerName(t.provider_used) && `by ${providerName(t.provider_used)}`]
          .filter(Boolean)
          .join(" · "),
      );
    if (t.kind === "ASSESSMENT_PACK")
      out.push(
        [d.questions ? `${d.questions} questions` : null, d.exit_ticket ? "exit ticket" : null, d.flashcards ? `${d.flashcards} cards` : null, d.video ? "video slot" : null, d.verified_by ? `checked by ${providerName(d.verified_by)}` : null]
          .filter(Boolean)
          .join(" · "),
      );
  }
  return out;
}

export const GenerationBoard: React.FC<{
  run: RunDetail;
  connected: boolean;
  busy: boolean;
  onControl: (action: "pause" | "resume" | "cancel" | "retry-failed") => void;
  onReviewWeek: (sectionId: number) => void;
  /** Leave the Studio while the run carries on (the course page shows its status). */
  onLeave?: () => void;
}> = ({ run, connected, busy, onControl, onReviewWeek, onLeave }) => {
  const m = useMotion();
  const r = run.run;
  const pct = runProgress(r.totals);
  const failed = r.totals.FAILED ?? 0;
  const active = isRunActive(r.status);
  const retry = autoRetry(run.weeks.flatMap((w) => w.tasks));
  const runningNow = (r.totals.RUNNING ?? 0) > 0;
  return (
    <div className="space-y-4">
      <div className="el-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {RUN_STATUS_LABEL[r.status]}
              {active && (
                <span className="inline-flex items-center gap-1 px-1.5 rounded-pill el-chip text-[11px] font-medium" title="The school server does the work — closing this page or logging out doesn't stop it">
                  <Server className="w-3 h-3" aria-hidden /> on the server
                </span>
              )}
              {active && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${connected ? "text-success-700 dark:text-success-500" : "text-slate-600 dark:text-slate-300"}`} title={connected ? "Live updates" : "Updating every few seconds"}>
                  {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {connected ? "live" : "refreshing"}
                </span>
              )}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
              {r.status === "PAUSED_QUOTA" && r.not_before
                ? `Today's free AI quota is used up — carries on ${relativeTime(r.not_before)}. You can leave this page.`
                : r.status === "PLANNED" && r.not_before
                  ? `Starts ${relativeTime(r.not_before)}, when the AI is quiet.`
                  : r.status === "READY_FOR_REVIEW"
                    ? "Everything is drafted. Students see nothing until you approve it."
                    : active && retry.count && !runningNow && retry.at
                      ? `${retry.count} part${retry.count === 1 ? "" : "s"} hit a problem — re-run by itself ${relativeTime(retry.at)}. You can leave this page.`
                      : active
                        ? "You can leave this page or log out — the server keeps drafting, waits out quota limits and re-runs failed parts. You'll get a notification."
                      : `${pct}% done`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(r.status === "RUNNING" || r.status === "PAUSED_QUOTA" || r.status === "PLANNED") && (
              <button disabled={busy} onClick={() => onControl("pause")} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium">
                <Pause className="w-4 h-4" /> Pause
              </button>
            )}
            {(r.status === "PAUSED" || r.status === "PAUSED_QUOTA" || r.status === "PLANNED") && (
              <button disabled={busy} onClick={() => onControl("resume")} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill bg-brand-600 text-white text-sm font-semibold">
                <Play className="w-4 h-4" /> {r.status === "PLANNED" ? "Start now" : "Resume"}
              </button>
            )}
            {failed > 0 && (
              <button disabled={busy} onClick={() => onControl("retry-failed")} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium">
                <RotateCcw className="w-4 h-4" /> Re-run {failed} failed
              </button>
            )}
            {active && onLeave && (
              <button onClick={onLeave} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium">
                <ArrowLeft className="w-4 h-4" /> Back to the course
              </button>
            )}
            {active && (
              <button disabled={busy} onClick={() => onControl("cancel")} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill el-chip text-sm font-medium text-danger-700 dark:text-danger-500">
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            )}
          </div>
        </div>
        <ProgressBar value={pct} className="mt-3" ariaLabel="Run progress" />
      </div>

      <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3" aria-label="Weeks in this run">
        {run.weeks.map((w) => {
          const stage = weekStage(w.tasks, r.status);
          const S = STAGE_STYLE[stage];
          const lines = digestLine(w);
          const err = w.tasks.find((t) => t.status === "FAILED" || (t.status === "QUEUED" && t.error))?.error;
          return (
            <motion.li key={w.section_id} layout {...m("reveal")} className="el-card p-3 flex flex-col">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300">{w.week_number || "Week"}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">{w.title.replace(/^.*?—\s*/, "")}</p>
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${S.cls}`}>
                  <S.icon className={`w-4 h-4 ${S.spin ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
                  <span className="sr-only sm:not-sr-only">{STAGE_LABEL[stage]}</span>
                </span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-300 flex-1">
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
                {err && <li className="text-danger-700 dark:text-danger-500">{err}</li>}
              </ul>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {w.criteria.map((c) => {
                  const covered = !w.coverage.gaps.includes(c.criteria_number);
                  return (
                    <span key={c.criteria_id} title={c.description} className={`px-1.5 rounded-pill text-[11px] font-semibold ${covered ? "el-chip-success" : "el-chip"}`}>
                      {c.criteria_number} {covered ? "✓" : ""}
                    </span>
                  );
                })}
                <span className="flex-1" />
                {w.pending_review > 0 && (
                  <button onClick={() => onReviewWeek(w.section_id)} className="min-h-[34px] px-3 rounded-pill bg-brand-600 text-white text-xs font-semibold">
                    Review {w.pending_review}
                  </button>
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
};

export default GenerationBoard;
