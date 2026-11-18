import React, { useCallback, useRef } from "react";
import { RotateCcw } from "lucide-react";
import type { Stage } from "../../api/sideProjects";
import { STAGES, STATUS_META, STATUS_SOLID, dayWord, statusColor, useIsDark } from "./ui";

/**
 * The stage plan: the project's start..closing window split over Idea, Planning, Building and
 * Testing. Mirrors the backend (services/sideProjects/stages.ts): a default 10/20/50/20 % split,
 * at least one day per stage, Testing always ends on the closing date, at least 4 days in all.
 * Boundaries are kept as day offsets from the start (inclusive end of each of the first three).
 */

export const MIN_PROJECT_DAYS = 4;
const WEIGHTS = [0.1, 0.2, 0.5, 0.2];
const DAY = 86_400_000;
const toDay = (d: string) => Math.floor(Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY);
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Days from start to target, both included (0 when a date is missing or reversed). */
export const spanDays = (start: string, target: string) => (start && target ? Math.max(0, toDay(target) - toDay(start) + 1) : 0);
export const addDays = (d: string, n: number) => fromDay(toDay(d) + n);

/** The default ends (offsets) of Idea, Planning and Building. */
export function defaultEnds(total: number): number[] {
  const out: number[] = [];
  let cursor = 0;
  let acc = 0;
  for (let i = 0; i < 3; i++) {
    acc += WEIGHTS[i];
    let end = Math.round(total * acc) - 1;
    end = Math.max(end, cursor);
    end = Math.min(end, total - 1 - (3 - i));
    out.push(end);
    cursor = end + 1;
  }
  return out;
}

/** Keeps every stage at least one day long and inside the window. */
export function clampEnds(ends: number[], total: number): number[] {
  const out = [...ends];
  for (let i = 0; i < 3; i++) {
    const min = i === 0 ? 0 : out[i - 1] + 1;
    const max = total - 1 - (3 - i);
    out[i] = Math.max(min, Math.min(max, Math.round(out[i])));
  }
  return out;
}

/** Ends as dates, the shape the API takes (`stagePlan`). */
export const endsToDates = (start: string, ends: number[]) => ends.map((e) => addDays(start, e));
export const datesToEnds = (start: string, dates: Array<string | null | undefined>) => dates.map((d) => (d ? toDay(d) - toDay(start) : 0));

/** Per stage: [startOffset, endOffset]. */
export const rangesOf = (ends: number[], total: number): Array<[number, number]> => [
  [0, ends[0]],
  [ends[0] + 1, ends[1]],
  [ends[1] + 1, ends[2]],
  [ends[2] + 1, total - 1],
];

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

export const PlanEditor: React.FC<{
  start: string;
  target: string;
  ends: number[];
  onChange: (ends: number[]) => void;
  disabled?: boolean;
}> = ({ start, target, ends, onChange, disabled }) => {
  const dark = useIsDark();
  const total = spanDays(start, target);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const valid = total >= MIN_PROJECT_DAYS && ends.length === 3;

  const setEnd = useCallback(
    (i: number, v: number) => {
      const next = [...ends];
      next[i] = v;
      // Pushing a handle moves the ones after it along, so a drag never gets stuck.
      for (let j = i + 1; j < 3; j++) if (next[j] <= next[j - 1]) next[j] = next[j - 1] + 1;
      for (let j = i - 1; j >= 0; j--) if (next[j] >= next[j + 1]) next[j] = next[j + 1] - 1;
      onChange(clampEnds(next, total));
    },
    [ends, onChange, total],
  );

  const fromPointer = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.round(((clientX - r.left) / r.width) * total) - 1;
  };

  if (!valid) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-xs font-medium text-slate-500 dark:border-gray-700/60 dark:text-gray-400">
        Choose a start and a closing date at least {MIN_PROJECT_DAYS} days apart to plan the stages.
      </div>
    );
  }
  const ranges = rangesOf(ends, total);
  const pct = (n: number) => (n / total) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-gray-400">
        <span>{fmt(start)}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums text-slate-700 dark:bg-gray-700/60 dark:text-gray-200">{dayWord(total)}</span>
        <span>{fmt(target)}</span>
      </div>

      {/* The bar: four segments, three handles */}
      <div
        ref={bar}
        className="relative h-12 touch-none select-none"
        onPointerMove={(e) => drag.current !== null && setEnd(drag.current, fromPointer(e.clientX))}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="absolute inset-0 flex gap-[2px] overflow-hidden rounded-2xl">
          {STAGES.map((s, i) => {
            const [a, b] = ranges[i];
            const days = b - a + 1;
            const M = STATUS_META[s];
            return (
              <div key={s} className="flex min-w-0 items-center justify-center gap-1 text-white" style={{ width: `${pct(days)}%`, backgroundColor: STATUS_SOLID[s] }} title={`${M.label}: ${dayWord(days)}`}>
                <M.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {pct(days) > 12 && <span className="truncate text-[11px] font-bold tabular-nums">{days}d</span>}
              </div>
            );
          })}
        </div>
        {ends.map((e, i) => {
          const next = STATUS_META[STAGES[i + 1]].label;
          const label = `End of ${STATUS_META[STAGES[i]].label}, start of ${next}`;
          return (
            <div
              key={i}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={label}
              aria-valuemin={i === 0 ? 0 : ends[i - 1] + 1}
              aria-valuemax={total - 1 - (3 - i)}
              aria-valuenow={e}
              aria-valuetext={`${STATUS_META[STAGES[i]].label} ends ${fmt(addDays(start, e))}`}
              aria-disabled={disabled}
              onPointerDown={(ev) => {
                if (disabled) return;
                ev.preventDefault();
                (ev.currentTarget as HTMLElement).focus();
                bar.current?.setPointerCapture?.(ev.pointerId);
                drag.current = i;
              }}
              onKeyDown={(ev) => {
                if (disabled) return;
                const step = ev.shiftKey ? 7 : 1;
                if (ev.key === "ArrowRight" || ev.key === "ArrowUp") (ev.preventDefault(), setEnd(i, e + step));
                else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") (ev.preventDefault(), setEnd(i, e - step));
                else if (ev.key === "Home") (ev.preventDefault(), setEnd(i, 0));
                else if (ev.key === "End") (ev.preventDefault(), setEnd(i, total));
              }}
              className="group absolute top-1/2 z-10 flex h-14 w-6 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center focus:outline-none"
              style={{ left: `${pct(e + 1)}%` }}
            >
              <span className="h-10 w-2 rounded-full bg-white ring-2 ring-slate-900/70 transition group-hover:scale-y-110 group-focus-visible:ring-4 group-focus-visible:ring-blue-500 dark:bg-gray-100 dark:ring-white/80" />
            </div>
          );
        })}
      </div>

      {/* The same plan as rows */}
      <div className="grid gap-2 sm:grid-cols-2">
        {STAGES.map((s: Stage, i) => {
          const [a, b] = ranges[i];
          const M = STATUS_META[s];
          return (
            <div key={s} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-gray-800/40">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: statusColor(s, dark) }}>
                <M.icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 dark:text-gray-100">{M.label}</p>
                <p className="text-[11px] tabular-nums text-slate-500 dark:text-gray-400">
                  {fmt(addDays(start, a))} – {fmt(addDays(start, b))}
                </p>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-700 dark:bg-gray-700/60 dark:text-gray-200">{dayWord(b - a + 1)}</span>
            </div>
          );
        })}
      </div>
      {!disabled && (
        <button type="button" onClick={() => onChange(defaultEnds(total))} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-700/50">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Suggested split
        </button>
      )}
    </div>
  );
};

export default PlanEditor;
