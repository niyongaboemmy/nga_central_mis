import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Clock3, MapPin, Sparkles, WifiOff } from "lucide-react";
import type { Agenda, AgendaItem } from "../../api/reminders";
import { useCurrentTime } from "../calendar/useCurrentTime";
import { computeNowNext, formatCountdown, kigaliClock, KIND_META } from "./agendaUtils";

const dot = (item: AgendaItem) => item.color || (item.kind === "lesson" ? "#3b6cff" : item.kind === "activity" ? "#10b981" : "#f59e0b");

const TimelineRow: React.FC<{ item: AgendaItem }> = ({ item }) => (
  <li className="flex items-center gap-3 py-2">
    <span className="w-12 flex-shrink-0 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
      {kigaliClock(item.start)}
    </span>
    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: dot(item) }} aria-hidden />
    <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">
      {item.title}
      {item.detail && <span className="text-slate-500 dark:text-slate-400"> · {item.detail}</span>}
    </span>
    {item.kind !== "lesson" && item.kind !== "activity" && (
      <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200 sm:inline">
        {KIND_META[item.kind]?.label ?? item.kind}
      </span>
    )}
  </li>
);

/**
 * "Now & Next" (REMINDERS_SOLUTION_PROPOSAL.md §6.6): what's on now, what's
 * next with a live countdown, and the rest of today. Works from the cached
 * agenda when offline.
 */
export const NowNextCard: React.FC<{ agenda: Agenda | null; loading: boolean; offline?: boolean }> = ({
  agenda,
  loading,
  offline,
}) => {
  const { date } = useCurrentTime();
  const state = useMemo(() => computeNowNext(agenda?.items ?? [], date), [agenda, date]);

  if (loading && !agenda) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900" aria-busy>
        <div className="h-4 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        <div className="mt-3 h-10 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </section>
    );
  }

  const nothing = !state.current && !state.next;

  return (
    <section
      aria-labelledby="now-next-title"
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="now-next-title" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <CalendarClock className="h-4 w-4" /> Now &amp; Next
        </h2>
        <span className="flex items-center gap-2 text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {offline && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              <WifiOff className="h-3 w-3" /> offline copy
            </span>
          )}
          {kigaliClock(date)} Kigali
        </span>
      </div>

      {nothing ? (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
          <Sparkles className="h-5 w-5 text-brand-500" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Nothing else on your timetable today{state.doneToday ? ` — ${state.doneToday} done` : ""}. Enjoy the calm.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {state.current ? (
            <motion.div
              layout
              className="min-w-0 rounded-2xl p-4 text-white"
              style={{ background: `linear-gradient(135deg, ${dot(state.current)}, #1e293b)` }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Now</p>
              <p className="mt-1 truncate text-lg font-bold">{state.current.title}</p>
              <p className="truncate text-sm text-white/85">
                {kigaliClock(state.current.start)}
                {state.current.end ? `–${kigaliClock(state.current.end)}` : ""}
                {state.current.detail ? ` · ${state.current.detail}` : ""}
              </p>
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25"
                role="progressbar"
                aria-label="Lesson progress"
                aria-valuenow={Math.round(state.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${state.progress * 100}%` }} />
              </div>
            </motion.div>
          ) : (
            <div className="min-w-0 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Now</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Free — nothing scheduled right now.</p>
            </div>
          )}

          {state.next && (
            <motion.div layout className="min-w-0 rounded-2xl bg-brand-50 p-4 dark:bg-brand-600/15">
              <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-200">
                Next
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] normal-case tracking-normal text-brand-700 shadow-sm dark:bg-slate-900 dark:text-brand-200" aria-live="polite">
                  <Clock3 className="h-3 w-3" /> {formatCountdown(state.untilNext)}
                </span>
              </p>
              <p className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-white">{state.next.title}</p>
              <p className="flex items-center gap-1 truncate text-sm text-slate-600 dark:text-slate-300">
                {kigaliClock(state.next.start)}
                {state.next.location && (
                  <>
                    <MapPin className="ml-1 h-3.5 w-3.5" /> {state.next.location}
                  </>
                )}
                {!state.next.location && state.next.detail ? ` · ${state.next.detail}` : ""}
              </p>
            </motion.div>
          )}
        </div>
      )}

      {state.laterToday.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Later today</p>
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {state.laterToday.slice(0, 6).map((item) => (
              <TimelineRow key={item.key} item={item} />
            ))}
          </ul>
          {state.laterToday.length > 6 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">+{state.laterToday.length - 6} more</p>
          )}
        </div>
      )}
    </section>
  );
};
