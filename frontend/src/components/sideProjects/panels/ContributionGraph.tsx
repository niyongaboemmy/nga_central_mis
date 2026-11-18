import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity as ActivityIcon, CalendarCheck2, Clock3, Flame, RefreshCw, Trophy } from "lucide-react";
import { failure, sideProjectsApi, type Activity } from "../../../api/sideProjects";
import { Skeleton, cardCls, useIsDark } from "../ui";

/**
 * Daily work as a contribution calendar: one cell per day (weeks as columns, Monday on top),
 * shaded by how much happened: progress reports count double, other work (stage moves,
 * documents, files, milestones) once. One-hue blue ramp (dataviz sequential blue, light and
 * dark steps), an empty day stays neutral. Hover or focus a cell for the day's numbers.
 */

const DAY = 86_400_000;
const LIGHT = ["#86b6ef", "#5598e7", "#2a78d6", "#184f95"];
const DARK = ["#184f95", "#256abf", "#3987e5", "#86b6ef"];
const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

export const scoreOf = (d: { reports: number; events: number }) => d.reports * 2 + d.events;
export const levelOf = (score: number) => (score <= 0 ? 0 : score <= 1 ? 1 : score <= 3 ? 2 : score <= 5 ? 3 : 4);

const fmtLong = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

type Cell = { date: string; reports: number; events: number; hours: number; future: boolean };

/** Weeks (Mon..Sun) from the Monday on or before `since` up to today. */
export function buildWeeks(a: Activity, today = new Date()): Cell[][] {
  const by = new Map(a.activity.map((d) => [d.date, d]));
  const start = Date.parse(`${a.since}T00:00:00Z`);
  const dow = (new Date(start).getUTCDay() + 6) % 7; // 0 = Monday
  const first = start - dow * DAY;
  const end = Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const weeks: Cell[][] = [];
  for (let t = first; t <= end; t += 7 * DAY) {
    const week: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const ms = t + i * DAY;
      const date = new Date(ms).toISOString().slice(0, 10);
      const d = by.get(date);
      week.push({ date, reports: d?.reports ?? 0, events: d?.events ?? 0, hours: d?.hours ?? 0, future: ms > end || ms < start });
    }
    weeks.push(week);
  }
  return weeks;
}

const ContributionGraph: React.FC<{ projectId: number; refreshKey?: unknown }> = ({ projectId, refreshKey }) => {
  const dark = useIsDark();
  const ramp = dark ? DARK : LIGHT;
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; cell: Cell } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await sideProjectsApi.activity(projectId, 182));
    } catch (e) {
      setError(failure(e, "Activity couldn't load").message);
    }
  }, [projectId]);
  useEffect(() => {
    setData(null);
    load();
  }, [load, refreshKey]);

  const weeks = useMemo(() => (data ? buildWeeks(data) : []), [data]);
  useEffect(() => {
    // Most recent weeks first in view on small screens.
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [weeks.length]);

  const months = useMemo(() => {
    const out: Array<{ i: number; label: string }> = [];
    let last = "";
    weeks.forEach((w, i) => {
      const m = new Date(`${w[0].date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
      if (m !== last) {
        if (!out.length || i - out[out.length - 1].i >= 3) out.push({ i, label: m });
        last = m;
      }
    });
    return out;
  }, [weeks]);

  const show = (e: React.MouseEvent | React.FocusEvent, cell: Cell) => {
    const r = box.current?.getBoundingClientRect();
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (r) setTip({ x: t.left - r.left + t.width / 2, y: t.top - r.top, cell });
  };

  const CELL = 13;
  const GAP = 3;
  const s = data?.stats;

  return (
    <section className={`${cardCls} p-5`} aria-labelledby="sp-activity-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
            <ActivityIcon className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div>
            <h3 id="sp-activity-title" className="text-sm font-bold text-slate-900 dark:text-white">
              Daily work
            </h3>
            <p className="text-xs text-slate-500 dark:text-gray-400">Last 6 months</p>
          </div>
        </div>
        {error && (
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
          </button>
        )}
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { icon: CalendarCheck2, label: "Active days", value: s?.activeDays },
          { icon: Clock3, label: "Hours logged", value: s ? Math.round(s.hours * 10) / 10 : undefined },
          { icon: Flame, label: "Current streak", value: s ? `${s.currentStreak}d` : undefined },
          { icon: Trophy, label: "Longest streak", value: s ? `${s.longestStreak}d` : undefined },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-gray-800/40">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
              <t.icon className="h-3 w-3" aria-hidden /> {t.label}
            </p>
            {data ? <p className="mt-0.5 text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">{t.value}</p> : <Skeleton className="mt-1.5 h-5 w-12" />}
          </div>
        ))}
      </div>

      <div ref={box} className="relative mt-4" onMouseLeave={() => setTip(null)}>
        {error ? (
          <p className="py-6 text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        ) : !data ? (
          <Skeleton className="h-[124px] w-full" />
        ) : (
          <div className="flex gap-2">
            <div className="shrink-0 pt-5 text-[9px] font-semibold text-slate-500 dark:text-gray-400" aria-hidden>
              {WEEKDAYS.map((d, i) => (
                <div key={i} style={{ height: CELL, marginBottom: GAP, lineHeight: `${CELL}px` }}>
                  {d}
                </div>
              ))}
            </div>
            <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
              <div style={{ width: weeks.length * (CELL + GAP) }}>
                <div className="relative h-5 text-[10px] font-semibold text-slate-500 dark:text-gray-400" aria-hidden>
                  {months.map((m) => (
                    <span key={m.i} className="absolute top-0" style={{ left: m.i * (CELL + GAP) }}>
                      {m.label}
                    </span>
                  ))}
                </div>
                <div className="flex" style={{ gap: GAP }} role="grid" aria-label="Work per day">
                  {weeks.map((w, wi) => (
                    <div key={wi} className="flex flex-col" style={{ gap: GAP }} role="row">
                      {w.map((c) => {
                        const lvl = levelOf(scoreOf(c));
                        const label = `${fmtLong(c.date)}: ${c.reports ? `${c.reports} report${c.reports > 1 ? "s" : ""}` : "no report"}${c.hours ? `, ${c.hours} h` : ""}${c.events ? `, ${c.events} other update${c.events > 1 ? "s" : ""}` : ""}`;
                        return c.future ? (
                          <span key={c.date} style={{ width: CELL, height: CELL }} aria-hidden />
                        ) : (
                          <span
                            key={c.date}
                            role="gridcell"
                            tabIndex={-1}
                            aria-label={label}
                            onMouseEnter={(e) => show(e, c)}
                            onFocus={(e) => show(e, c)}
                            className={`block rounded-[3px] outline-none transition hover:scale-125 focus-visible:ring-2 focus-visible:ring-blue-500 ${lvl === 0 ? "bg-slate-100 dark:bg-gray-700/50" : ""}`}
                            style={{ width: CELL, height: CELL, backgroundColor: lvl ? ramp[lvl - 1] : undefined }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {tip && (
          <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-[11px] text-white dark:bg-gray-100 dark:text-gray-900" style={{ left: tip.x, top: tip.y - 6 }} role="tooltip">
            <p className="font-bold">{fmtLong(tip.cell.date)}</p>
            <p className="tabular-nums opacity-90">
              {tip.cell.reports} report{tip.cell.reports === 1 ? "" : "s"}
              {tip.cell.hours ? ` · ${tip.cell.hours} h` : ""}
              {tip.cell.events ? ` · ${tip.cell.events} other update${tip.cell.events === 1 ? "" : "s"}` : ""}
            </p>
          </div>
        )}
      </div>

      {data && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-slate-500 dark:text-gray-400">
          <span className="tabular-nums">
            {data.stats.reports} report{data.stats.reports === 1 ? "" : "s"} in 6 months
          </span>
          <span className="flex items-center gap-1" aria-hidden>
            Less
            <span className="h-[11px] w-[11px] rounded-[3px] bg-slate-100 dark:bg-gray-700/50" />
            {ramp.map((c) => (
              <span key={c} className="h-[11px] w-[11px] rounded-[3px]" style={{ backgroundColor: c }} />
            ))}
            More
          </span>
        </div>
      )}
    </section>
  );
};

export default ContributionGraph;
