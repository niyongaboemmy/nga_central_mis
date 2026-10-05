import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DAY_SHORT, isoDow, shortDate, weekStartOf, type OfficeHoursWeek } from "../../api/officeHours";

/**
 * Week picker for weekly invitations: ‹ Week of 12 Oct › plus a scrollable
 * strip of every week of the schedule, each with its seat count, so a
 * teacher sees at a glance which weeks still need students.
 */
export interface WeekNavigatorProps {
  weeks: OfficeHoursWeek[];
  /** Monday of the selected week. */
  value: string;
  onChange: (monday: string) => void;
  today: string;
  /** Students invited per week (keyed by Monday). */
  counts?: Map<string, number>;
  capacity?: number;
  /** Weeks before this Monday are greyed out (cannot be planned any more). */
  minWeek?: string;
  label?: string;
}

const WeekNavigator: React.FC<WeekNavigatorProps> = ({ weeks, value, onChange, today, counts, capacity, minWeek, label = "Week" }) => {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const index = weeks.findIndex((w) => w.start === value);
  const current = weeks[index];
  const thisWeek = weekStartOf(today);
  const usable = (w: OfficeHoursWeek) => !minWeek || w.start >= minWeek;
  const prev = weeks.slice(0, Math.max(0, index)).reverse().find(usable);
  const next = weeks.slice(index + 1).find(usable);

  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-week="${value}"]`)?.scrollIntoView?.({ block: "nearest", inline: "center" });
  }, [value]);

  if (!current) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => prev && onChange(prev.start)}
            disabled={!prev}
            aria-label="Previous week"
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 dark:border-gray-700/50 dark:text-gray-200 dark:hover:bg-gray-800/40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-[11rem] px-2" aria-live="polite">
            <p className="text-sm font-semibold text-slate-900 dark:text-gray-50">
              {label} of {shortDate(current.start)}
              {current.start === thisWeek && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-500/15 dark:text-blue-200">This week</span>}
            </p>
            <p className="text-xs text-slate-600 dark:text-gray-300">
              {current.meetings.map((d) => `${DAY_SHORT[isoDow(d)]} ${shortDate(d)}`).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => next && onChange(next.start)}
            disabled={!next}
            aria-label="Next week"
            className="grid h-9 w-9 place-items-center rounded-full border border-slate-300 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 dark:border-gray-700/50 dark:text-gray-200 dark:hover:bg-gray-800/40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {value !== thisWeek && weeks.some((w) => w.start === thisWeek) && (
          <button type="button" onClick={() => onChange(thisWeek)} className="rounded-full px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-500/10">
            Go to this week
          </button>
        )}
      </div>

      <div ref={stripRef} className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Weeks">
        {weeks.map((w) => {
          const selected = w.start === value;
          const n = counts?.get(w.start) ?? 0;
          const past = w.end < today;
          const disabled = !usable(w);
          const full = capacity !== undefined && n >= capacity;
          return (
            <button
              key={w.start}
              type="button"
              role="tab"
              data-week={w.start}
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onChange(w.start)}
              title={`Week of ${shortDate(w.start, true)}${counts ? ` · ${n} student${n === 1 ? "" : "s"}` : ""}`}
              className={`flex min-w-[4.5rem] snap-start flex-col items-center rounded-xl border px-2.5 py-1.5 text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                selected
                  ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                  : past
                    ? "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-gray-700/30 dark:bg-gray-800/30 dark:text-gray-400"
                    : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/60 dark:border-gray-700/30 dark:bg-gray-800/40 dark:text-gray-100 dark:hover:border-blue-500/50"
              }`}
            >
              <span className="font-semibold">{shortDate(w.start)}</span>
              {counts && (
                <span className={`tabular-nums ${selected ? "text-white" : n === 0 && !past ? "text-amber-700 dark:text-amber-300" : full ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-gray-300"}`}>
                  {n}
                  {capacity !== undefined ? `/${capacity}` : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default WeekNavigator;
