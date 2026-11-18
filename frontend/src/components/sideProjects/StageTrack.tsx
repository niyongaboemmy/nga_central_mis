import React from "react";
import { motion } from "framer-motion";
import { Check, PauseCircle, PlayCircle } from "lucide-react";
import type { ProjectDetail, Status } from "../../api/sideProjects";
import { PATH, STATUS_META, STATUS_SOLID, dayWord, pathStage, statusColor, useIsDark } from "./ui";

/**
 * The project's path as one segmented track: five stages, the current one filled, each with
 * its days (spent for past stages, "day X of Y" for the current one, planned for the next).
 * A paused project keeps its place on the track, dimmed, with a Resume action below.
 */
const StageTrack: React.FC<{
  p: ProjectDetail;
  canMove: boolean;
  onStep: (to: Status) => void;
}> = ({ p, canMove, onStep }) => {
  const dark = useIsDark();
  const paused = p.status === "ON_HOLD";
  const at = pathStage(p.status, p.pausedFrom);
  const idx = PATH.indexOf(at);
  const view = new Map(p.period?.stages.map((s) => [s.stage as Status, s]) ?? []);
  const pausedDays = paused ? (p.stage?.daysIn ?? 0) : 0;

  const caption = (s: Status, i: number) => {
    const v = view.get(s);
    if (s === "COMPLETED") return p.completedAt ? new Date(p.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : p.targetDate ? `by ${new Date(`${p.targetDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "";
    if (!v) return "";
    if (i < idx) return v.state === "skipped" ? "skipped" : dayWord(Math.max(1, Math.round(v.actualDays)));
    if (i === idx) {
      if (v.daysIn === null) return v.plannedDays ? `${dayWord(v.plannedDays)} planned` : "";
      return v.plannedDays ? `day ${v.daysIn + 1} of ${v.plannedDays}` : `day ${v.daysIn + 1}`;
    }
    return v.plannedDays ? dayWord(v.plannedDays) : "";
  };

  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-5 gap-1 rounded-[1.25rem] bg-slate-100 p-1 dark:bg-gray-800" aria-label="Stages">
        {PATH.map((s, i) => {
          const M = STATUS_META[s];
          const current = i === idx;
          const done = i < idx;
          const v = view.get(s);
          const over = current && !paused && (v?.overrunDays ?? 0) > 0;
          const clickable = canMove && !(current && !paused) && !(paused && s === "COMPLETED");
          const cap = caption(s, i);
          return (
            <li key={s} className="relative min-w-0">
              {current && (
                <motion.span
                  layoutId="sp-status"
                  className={`absolute inset-0 rounded-2xl ${paused ? "opacity-60" : ""}`}
                  style={{ backgroundColor: STATUS_SOLID[s] }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStep(s)}
                aria-current={current ? "step" : undefined}
                title={clickable ? (paused ? `Resume in ${M.label}` : `Move to ${M.label}`) : M.label}
                className={`relative flex w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default ${
                  current ? "text-white" : done ? `${M.text} enabled:hover:bg-white dark:enabled:hover:bg-gray-700` : "text-slate-600 enabled:hover:bg-white enabled:hover:text-slate-900 dark:text-gray-300 dark:enabled:hover:bg-gray-700 dark:enabled:hover:text-white"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1">
                  {done ? (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: statusColor(s, dark) }}>
                      <Check className="h-2.5 w-2.5" aria-hidden />
                    </span>
                  ) : current && paused ? (
                    <PauseCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : (
                    <M.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="hidden truncate sm:inline">{M.label}</span>
                  <span className="sr-only sm:hidden">{M.label}</span>
                </span>
                <span className={`h-3.5 truncate text-[10px] font-semibold tabular-nums ${current ? "text-white/90" : "text-slate-600 dark:text-gray-300"} ${over ? "!text-white" : ""}`}>
                  {over ? `${dayWord(v!.overrunDays)} over` : cap}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {paused ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-100 px-3 py-2 dark:bg-gray-800">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-gray-200">
            <PauseCircle className="h-4 w-4 text-slate-500" aria-hidden />
            On hold for {dayWord(pausedDays)} · the {STATUS_META[at].label} clock is stopped
          </span>
          {canMove && (
            <button type="button" onClick={() => onStep(at)} className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900">
              <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Resume
            </button>
          )}
        </div>
      ) : (
        canMove &&
        p.status !== "COMPLETED" && (
          <div className="flex justify-end">
            <button type="button" onClick={() => onStep("ON_HOLD")} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
              <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Put on hold
            </button>
          </div>
        )
      )}
    </div>
  );
};

export default StageTrack;
