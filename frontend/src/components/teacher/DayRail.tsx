import React, { useMemo, useState } from "react";
import type {
  TeacherLesson,
  TeacherOverviewActivity,
} from "../../api/dashboard";

// ─── DayRail ────────────────────────────────────────────────────────────────
// One horizontal track for a teaching day: every period drawn to scale, the
// gaps between them left empty so free time reads as free time, and a live
// marker for the current moment.
//
// This replaces the block of dead space the hero card used to be on a day
// with nothing left to teach. A list of three lessons tells a teacher what
// they teach; the rail tells them what their *day* looks like — where the
// double period is, where the two-hour gap is, how much is left.
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK = "#3B82F6";
const ACTIVITY_COLOR = "#10B981";

const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Minutes since midnight -> "HH:MM". */
const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Whole-hour tick label. */
const labelFor = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`;

export interface DayRailEntry {
  id: string;
  name: string;
  sub: string | null;
  start: number;
  end: number;
  color: string;
  kind: "lesson" | "activity";
}

export const railEntries = (
  lessons: TeacherLesson[],
  activities: TeacherOverviewActivity[],
): DayRailEntry[] =>
  [
    ...lessons.map((l) => ({
      id: `lesson-${l.slot_id}`,
      name: l.subject_name || "Lesson",
      sub: [l.class_group_name, l.location].filter(Boolean).join(" · ") || null,
      start: toMinutes(l.start_time),
      end: toMinutes(l.end_time),
      color: l.color || FALLBACK,
      kind: "lesson" as const,
    })),
    ...activities.map((a) => ({
      id: `activity-${a.activity_id}`,
      name: a.activity_name,
      sub: [a.activity_type, a.location].filter(Boolean).join(" · ") || null,
      start: toMinutes(a.start_time),
      end: toMinutes(a.end_time),
      color: a.color || ACTIVITY_COLOR,
      kind: "activity" as const,
    })),
  ].sort((a, b) => a.start - b.start);

const DayRail: React.FC<{
  entries: DayRailEntry[];
  /** Minutes since midnight, or null when the rail isn't showing today. */
  nowMinutes: number | null;
}> = ({ entries, nowMinutes }) => {
  const [hovered, setHovered] = useState<string | null>(null);

  const { from, to, ticks } = useMemo(() => {
    if (entries.length === 0) return { from: 0, to: 0, ticks: [] as number[] };
    // Snap to whole hours either side so the tick labels line up with the
    // track edges, and leave a little room for the "now" marker to sit in.
    const first =
      Math.floor(Math.min(...entries.map((e) => e.start)) / 60) * 60;
    const last = Math.ceil(Math.max(...entries.map((e) => e.end)) / 60) * 60;
    const start = first;
    const end = Math.max(last, start + 60);
    const hours: number[] = [];
    for (let m = start; m <= end; m += 60) hours.push(m);
    return { from: start, to: end, ticks: hours };
  }, [entries]);

  if (entries.length === 0) return null;

  const span = to - from;
  const pct = (minutes: number) => ((minutes - from) / span) * 100;
  const nowInRange =
    nowMinutes !== null && nowMinutes >= from && nowMinutes <= to;

  return (
    <div className="select-none">
      <div className="relative h-14 rounded-2xl bg-surface-light dark:bg-surface-dark/60 overflow-hidden">
        {/* Hour gridlines — quiet structure behind the blocks. */}
        {ticks.slice(1, -1).map((m) => (
          <div
            key={`grid-${m}`}
            className="absolute top-0 bottom-0 w-px bg-border-light/70 dark:bg-border-dark/30"
            style={{ left: `${pct(m)}%` }}
            aria-hidden
          />
        ))}

        {entries.map((entry) => {
          const isPast = nowMinutes !== null && entry.end <= nowMinutes;
          const isLive =
            nowMinutes !== null &&
            entry.start <= nowMinutes &&
            entry.end > nowMinutes;
          return (
            <button
              key={entry.id}
              type="button"
              onMouseEnter={() => setHovered(entry.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(entry.id)}
              onBlur={() => setHovered(null)}
              className={`absolute top-2 bottom-2 rounded-xl px-2 text-left overflow-hidden transition-[transform,opacity,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                isPast ? "opacity-40" : "opacity-100"
              } ${isLive ? "ring-2 ring-white/70 dark:ring-white/40 shadow-lg" : ""} hover:-translate-y-0.5`}
              style={{
                left: `${pct(entry.start)}%`,
                width: `${Math.max(pct(entry.end) - pct(entry.start), 2.5)}%`,
                backgroundColor: entry.color,
              }}
              title={`${entry.name} · ${clock(entry.start)}–${clock(entry.end)}`}
              aria-label={`${entry.name}, ${clock(entry.start)} to ${clock(entry.end)}`}
            >
              <span className="block text-[11px] font-semibold leading-tight text-white/95 truncate">
                {entry.name}
              </span>
              {entry.sub && (
                <span className="block text-[10px] leading-tight text-white/75 truncate">
                  {entry.sub}
                </span>
              )}
            </button>
          );
        })}

        {/* Live "now" marker. */}
        {nowInRange && (
          <div
            className="absolute top-0 bottom-0 z-10 w-0.5 bg-red-500 pointer-events-none"
            style={{ left: `${pct(nowMinutes!)}%` }}
            aria-hidden
          >
            <span className="absolute -top-0.5 -left-[3px] block w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/30 animate-pulse" />
          </div>
        )}
      </div>

      <div className="relative mt-1 h-4">
        {ticks.map((m) => (
          <span
            key={`tick-${m}`}
            className="absolute -translate-x-1/2 text-[10px] tabular-nums text-text-secondary-light dark:text-text-secondary-dark/60"
            style={{ left: `${pct(m)}%` }}
          >
            {labelFor(m)}
          </span>
        ))}
      </div>

      {/* Hovering a block names it in full, so a narrow period is still
          readable without a tooltip library. */}
      <p className="mt-1 h-4 text-xs text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
        {(() => {
          const entry = entries.find((e) => e.id === hovered);
          if (!entry) return "";
          return `${clock(entry.start)}–${clock(entry.end)} · ${entry.name}${entry.sub ? ` · ${entry.sub}` : ""}`;
        })()}
      </p>
    </div>
  );
};

export default DayRail;
