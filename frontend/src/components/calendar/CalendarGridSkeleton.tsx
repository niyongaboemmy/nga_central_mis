import React from "react";
import { DAYS, SCHEDULE_SLOTS, isTeachingRow } from "./calendarConstants";

/**
 * Placeholder timetable shown while a calendar is loading.
 *
 * It mirrors the real grid — the same time column, day headers, break bands
 * and period rows — so the page keeps its shape while the request is in
 * flight and nothing jumps when the data lands. A scattering of shimmering
 * "cards" stands in for lessons; the pattern is fixed, not random, so the
 * skeleton looks the same on every load.
 */

// Which (row, day) cells get a placeholder card, and how many rows each
// spans — a plausible-looking week, not a full one.
const PLACEHOLDER_CARDS: Record<string, number> = {
  "1:0": 2, "1:2": 2, "1:4": 1, "2:1": 1,
  "4:0": 1, "4:1": 2, "4:3": 2, "5:4": 1, "6:2": 1,
  "8:0": 2, "8:3": 1, "8:4": 2, "9:1": 1,
  "11:1": 1, "11:2": 1, "11:4": 1,
};

interface CalendarGridSkeletonProps {
  /** Compact rows for the dashboard widget; taller for the full page. */
  compact?: boolean;
  /** Show the weekday date line under each day, like the widget does. */
  showDates?: boolean;
  label?: string;
}

const CalendarGridSkeleton: React.FC<CalendarGridSkeletonProps> = ({
  compact = false,
  showDates = false,
  label = "Loading timetable",
}) => {
  // Cells already covered by a taller card above them.
  const covered = new Set<string>();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      data-testid="calendar-grid-skeleton"
      className="overflow-x-auto -mx-6 border-4 border-white dark:border-gray-800/20 motion-safe:animate-[pulse_1.8s_ease-in-out_infinite]"
    >
      <span className="sr-only">{label}…</span>
      <table className="w-full border-collapse table-fixed" aria-hidden="true">
        <thead>
          <tr className="bg-gradient-to-r from-blue-50 to-blue-100/30 dark:from-gray-800/30 dark:to-gray-800/30 border-b-4 border-white dark:border-none">
            <th className="p-2 w-20 min-w-20">
              <div className="mx-auto h-3 w-8 rounded bg-gray-200 dark:bg-gray-700/60" />
            </th>
            {DAYS.map((day) => (
              <th key={day} className="p-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="h-5 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30" />
                  {showDates && (
                    <div className="h-2.5 w-10 rounded bg-gray-200 dark:bg-gray-700/50" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="border-b border-blue-200/50 dark:border-blue-700/20">
          {SCHEDULE_SLOTS.map((row, rowIdx) => {
            const teaching = isTeachingRow(row);
            return (
              <tr
                key={`${row.start}-${row.end}`}
                className={`border-t border-gray-100 dark:border-gray-700/20 ${
                  teaching
                    ? compact
                      ? "h-14"
                      : "h-20"
                    : "h-8 bg-gray-50 dark:bg-gray-800/10"
                }`}
              >
                <th
                  className={`p-1.5 border border-blue-200/50 dark:border-blue-700/20 ${
                    teaching
                      ? "bg-gray-50 dark:bg-gray-800/20"
                      : "bg-gray-100 dark:bg-gray-800/50"
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    {teaching && (
                      <div className="h-2.5 w-5 rounded bg-blue-200/70 dark:bg-blue-800/50" />
                    )}
                    <div className="h-2 w-8 rounded bg-gray-200 dark:bg-gray-700/50" />
                    <div className="h-2 w-8 rounded bg-gray-200 dark:bg-gray-700/50" />
                  </div>
                </th>

                {!teaching && (
                  <td
                    colSpan={DAYS.length}
                    className="border-l border-gray-100 dark:border-gray-700/20"
                  >
                    <div className="mx-auto h-2.5 w-24 rounded bg-gray-200 dark:bg-gray-700/50" />
                  </td>
                )}

                {teaching &&
                  DAYS.map((_, dayIdx) => {
                    const key = `${rowIdx}:${dayIdx}`;
                    if (covered.has(key)) return null;
                    const span = PLACEHOLDER_CARDS[key];
                    if (span) {
                      for (let r = 1; r < span; r++)
                        covered.add(`${rowIdx + r}:${dayIdx}`);
                    }
                    return (
                      <td
                        key={dayIdx}
                        rowSpan={span ?? 1}
                        className="p-0 border-l border-gray-100 dark:border-gray-700/20 relative"
                      >
                        {span && (
                          <div className="absolute inset-1 rounded-md bg-gray-200/90 dark:bg-gray-700/50 overflow-hidden">
                            <div className="p-2 space-y-1.5">
                              <div className="h-3 w-4/5 rounded bg-white/60 dark:bg-white/10" />
                              <div className="h-2 w-1/2 rounded bg-white/50 dark:bg-white/10" />
                            </div>
                            <div className="absolute bottom-2 left-2 h-2 w-16 rounded bg-white/50 dark:bg-white/10" />
                            {/* shimmer sweep */}
                            <div className="pointer-events-none absolute inset-0 -translate-x-full motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-white/40 dark:via-white/10 to-transparent" />
                          </div>
                        )}
                      </td>
                    );
                  })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CalendarGridSkeleton;
