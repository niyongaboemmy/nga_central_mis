import React from "react";
import { motion } from "framer-motion";
import { Check, PauseCircle, PlayCircle } from "lucide-react";
import type { ProjectDetail, Status } from "../../api/sideProjects";
import {
  PATH,
  STATUS_META,
  dayWord,
  pathStage,
  statusColor,
  useIsDark,
} from "./ui";

/**
 * The project's path as one segmented track: five stages, the current one filled, each with
 * its days (spent for past stages, "day X of Y" for the current one, planned for the next).
 * A paused project keeps its place on the track, dimmed, with a Resume action below.
 */
const StageTrack: React.FC<{
  p: ProjectDetail;
  canMove: boolean;
  onStep: (to: Status) => void;
  /** one row: the track with the pause action beside it (drawer header) */
  compact?: boolean;
}> = ({ p, canMove, onStep, compact }) => {
  const dark = useIsDark();
  const paused = p.status === "ON_HOLD";
  const at = pathStage(p.status, p.pausedFrom);
  const idx = PATH.indexOf(at);
  const view = new Map(
    p.period?.stages.map((s) => [s.stage as Status, s]) ?? [],
  );
  const pausedDays = paused ? (p.stage?.daysIn ?? 0) : 0;

  const caption = (s: Status, i: number) => {
    const v = view.get(s);
    if (s === "COMPLETED")
      return p.completedAt
        ? new Date(p.completedAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })
        : p.targetDate
          ? `by ${new Date(`${p.targetDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
          : "";
    if (!v) return "";
    if (i < idx)
      return v.state === "skipped"
        ? "skipped"
        : dayWord(Math.max(1, Math.round(v.actualDays)));
    if (i === idx) {
      if (v.daysIn === null)
        return v.plannedDays ? `${dayWord(v.plannedDays)} planned` : "";
      return v.plannedDays
        ? `day ${v.daysIn + 1} of ${v.plannedDays}`
        : `day ${v.daysIn + 1}`;
    }
    return v.plannedDays ? dayWord(v.plannedDays) : "";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <ol className="grid flex-1 grid-cols-5 gap-2" aria-label="Stages">
          {PATH.map((s, i) => {
            const M = STATUS_META[s];
            const current = i === idx;
            const done = i < idx;
            const v = view.get(s);
            const over = current && !paused && (v?.overrunDays ?? 0) > 0;
            const clickable = canMove && !(current && !paused) && !(paused && s === "COMPLETED");
            const cap = caption(s, i);
            const color = statusColor(s, dark);
            // How far through its window the current stage is (the bar fills as days pass).
            const fill = current ? (s === "COMPLETED" ? 100 : v?.plannedDays && v.daysIn !== null ? Math.max(8, Math.min(100, ((v.daysIn + 1) / v.plannedDays) * 100)) : 35) : done ? 100 : 0;
            return (
              <li key={s} className="min-w-0">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onStep(s)}
                  aria-current={current ? "step" : undefined}
                  title={clickable ? (paused ? `Resume in ${M.label}` : `Move to ${M.label}`) : M.label}
                  className="group flex w-full min-w-0 flex-col gap-1.5 rounded-lg pb-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default"
                >
                  <span className="relative h-1 w-full overflow-hidden rounded-full bg-slate-200 transition group-enabled:group-hover:bg-slate-300 dark:bg-gray-700 dark:group-enabled:group-hover:bg-gray-600" aria-hidden>
                    {fill > 0 && (
                      <motion.span
                        className={`absolute inset-y-0 left-0 rounded-full ${current && paused ? "opacity-50" : ""}`}
                        style={{ backgroundColor: over ? "#d03b3b" : color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${fill}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {done ? (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: color }}>
                        <Check className="h-2.5 w-2.5" aria-hidden />
                      </span>
                    ) : current && paused ? (
                      <PauseCircle className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    ) : (
                      <M.icon className="h-4 w-4 shrink-0" style={current ? { color } : undefined} aria-hidden />
                    )}
                    <span
                      className={`hidden truncate text-xs sm:inline ${
                        current ? "font-semibold text-slate-900 dark:text-white" : done ? "font-medium text-slate-700 dark:text-gray-200" : "font-medium text-slate-500 group-enabled:group-hover:text-slate-800 dark:text-gray-400 dark:group-enabled:group-hover:text-white"
                      }`}
                    >
                      {M.label}
                    </span>
                    <span className="sr-only sm:hidden">{M.label}</span>
                  </span>
                  <span className={`h-4 truncate text-[11px] tabular-nums ${over ? "font-semibold text-red-700 dark:text-red-300" : current ? "font-medium text-slate-600 dark:text-gray-300" : "text-slate-500 dark:text-gray-400"}`}>
                    {over ? `${dayWord(v!.overrunDays)} over` : cap}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {compact && canMove && !paused && p.status !== "COMPLETED" && (
          <button
            type="button"
            onClick={() => onStep("ON_HOLD")}
            aria-label="Put on hold"
            title="Put on hold"
            className="-mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <PauseCircle className="h-[18px] w-[18px]" aria-hidden />
          </button>
        )}
      </div>

      {paused ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-100 px-3 py-2 dark:bg-gray-800">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-gray-200">
            <PauseCircle className="h-4 w-4 text-slate-500" aria-hidden />
            On hold for {dayWord(pausedDays)} · the {STATUS_META[at].label}{" "}
            clock is stopped
          </span>
          {canMove && (
            <button
              type="button"
              onClick={() => onStep(at)}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
            >
              <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Resume
            </button>
          )}
        </div>
      ) : (
        !compact &&
        canMove &&
        p.status !== "COMPLETED" && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onStep("ON_HOLD")}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <PauseCircle className="h-3.5 w-3.5" aria-hidden /> Put on hold
            </button>
          </div>
        )
      )}
    </div>
  );
};

export default StageTrack;

/**
 * The same path as a vertical list (workspace sidebar): each stage with its days, the current
 * one highlighted, finished ones ticked; Pause / Resume underneath.
 */
export const StageList: React.FC<{ p: ProjectDetail; canMove: boolean; onStep: (to: Status) => void }> = ({ p, canMove, onStep }) => {
  const dark = useIsDark();
  const paused = p.status === "ON_HOLD";
  const at = pathStage(p.status, p.pausedFrom);
  const idx = PATH.indexOf(at);
  const view = new Map(p.period?.stages.map((s) => [s.stage as Status, s]) ?? []);
  const caption = (s: Status, i: number) => {
    const v = view.get(s);
    if (s === "COMPLETED") return p.completedAt ? new Date(p.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : p.targetDate ? `by ${new Date(`${p.targetDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "";
    if (!v) return "";
    if (i < idx) return v.state === "skipped" ? "skipped" : dayWord(Math.max(1, Math.round(v.actualDays)));
    if (i === idx) {
      if ((v.overrunDays ?? 0) > 0 && !paused) return `${dayWord(v.overrunDays)} over`;
      return v.daysIn === null ? (v.plannedDays ? `${dayWord(v.plannedDays)} planned` : "") : v.plannedDays ? `day ${v.daysIn + 1} of ${v.plannedDays}` : `day ${v.daysIn + 1}`;
    }
    return v.plannedDays ? `${dayWord(v.plannedDays)} planned` : "";
  };
  return (
    <div>
      <ol className="space-y-0.5" aria-label="Stages">
        {PATH.map((s, i) => {
          const M = STATUS_META[s];
          const current = i === idx;
          const done = i < idx;
          const color = statusColor(s, dark);
          const over = current && !paused && (view.get(s)?.overrunDays ?? 0) > 0;
          const clickable = canMove && !(current && !paused) && !(paused && s === "COMPLETED");
          return (
            <li key={s}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => onStep(s)}
                aria-current={current ? "step" : undefined}
                title={clickable ? (paused ? `Resume in ${M.label}` : `Move to ${M.label}`) : M.label}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default ${current ? "bg-slate-100 dark:bg-gray-800" : "enabled:hover:bg-slate-50 dark:enabled:hover:bg-gray-800/60"}`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "text-white" : current ? "text-white" : "border-2 border-slate-900/[0.07] text-slate-400 dark:border-white/10 dark:text-gray-500"} ${current && paused ? "opacity-60" : ""}`}
                  style={done || current ? { backgroundColor: color } : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : current && paused ? <PauseCircle className="h-3.5 w-3.5" aria-hidden /> : <M.icon className="h-3 w-3" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] ${current ? "font-semibold text-slate-900 dark:text-white" : done ? "font-medium text-slate-700 dark:text-gray-200" : "font-medium text-slate-500 dark:text-gray-400"}`}>{M.label}</span>
                </span>
                <span className={`shrink-0 text-[11px] tabular-nums ${over ? "font-semibold text-red-700 dark:text-red-300" : "text-slate-500 dark:text-gray-400"}`}>{caption(s, i)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {canMove && p.status !== "COMPLETED" && (
        <button
          type="button"
          onClick={() => onStep(paused ? at : "ON_HOLD")}
          className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${paused ? "bg-blue-600 text-white hover:bg-blue-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"}`}
        >
          {paused ? <PlayCircle className="h-3.5 w-3.5" aria-hidden /> : <PauseCircle className="h-3.5 w-3.5" aria-hidden />} {paused ? "Resume" : "Put on hold"}
        </button>
      )}
    </div>
  );
};
