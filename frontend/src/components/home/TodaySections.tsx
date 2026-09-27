import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock,
  ExternalLink,
  MapPin,
  PartyPopper,
  PlayCircle,
  XCircle,
} from "lucide-react";
import type { HomeOverview, TodayLesson } from "./contract";
import { Card, CardHeader, CtaLink, TIER_ICON } from "./ui";
import { type Audience, formatDuration, type Hero, lessonState, nextLessonKey, TIER_LABEL } from "./merge";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Next up ────────────────────────────────────────────────────────────────

export const NextUpHero: React.FC<{ hero: Hero; audience: Audience }> = ({
  hero,
  audience,
}) => {
  if (hero.kind === "item") {
    const { item } = hero;
    const blocking = item.tier === "blocking";
    return (
      <section
        aria-label="Next up"
        className={`rounded-3xl border p-5 sm:p-6 shadow-sm ${
          blocking
            ? "border-red-200 bg-gradient-to-br from-red-50 to-white dark:border-red-900/40 dark:from-red-950/30 dark:to-card-dark/20"
            : "border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/20 dark:to-card-dark/20"
        }`}
      >
        <p
          className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
            blocking ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {TIER_ICON[item.tier]} Next up · {TIER_LABEL[audience][item.tier]}
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-text-primary-light dark:text-text-primary-dark">{item.title}</h2>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.why}</p>
          </div>
          <CtaLink
            href={item.cta.href}
            external={!!item.cta.external}
            className={`inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              blocking ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500" : "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500"
            }`}
          >
            {item.cta.label}
            {item.cta.external ? <ExternalLink className="w-4 h-4" aria-hidden /> : <ArrowRight className="w-4 h-4" aria-hidden />}
          </CtaLink>
        </div>
      </section>
    );
  }

  if (hero.kind === "lesson") {
    const { lesson, state, minutesAway } = hero;
    return (
      <section
        aria-label="Next up"
        className="rounded-3xl border border-blue-200 dark:border-blue-900/40 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-card-dark/20 p-5 sm:p-6 shadow-sm"
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
          {state === "now" ? (
            <>
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse motion-reduce:animate-none" aria-hidden /> Happening now
            </>
          ) : (
            <>
              <Clock className="w-4 h-4" aria-hidden /> Next lesson · in {formatDuration(minutesAway)}
            </>
          )}
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-text-primary-light dark:text-text-primary-dark">
              {lesson.subject_name ?? "Lesson"}
              {lesson.class_group_name ? ` · ${lesson.class_group_name}` : ""}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
              <span className="tabular-nums">
                {lesson.start_time} – {lesson.end_time}
              </span>
              {lesson.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" aria-hidden /> {lesson.location}
                </span>
              )}
              {lesson.teacher_name && <span>with {lesson.teacher_name}</span>}
            </p>
          </div>
          {lesson.kind === "teaching" && lesson.plan === "missing" && (
            <Link
              to="/dashboard"
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              Plan this lesson <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Next up"
      className="rounded-3xl border border-green-200 dark:border-green-900/40 bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-card-dark/20 p-5 sm:p-6 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <PartyPopper className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0" aria-hidden />
        <div>
          <h2 className="text-lg font-bold text-text-primary-light dark:text-text-primary-dark">You're all caught up</h2>
          <p className="text-sm text-text-secondary-light dark:text-text-secondary-dark">
            {hero.nextTeachingDay
              ? `Next: ${hero.nextTeachingDay.lessons} ${hero.nextTeachingDay.lessons === 1 ? "lesson" : "lessons"} on ${DAYS[hero.nextTeachingDay.day_of_week]}.`
              : "Nothing needs you right now. Enjoy the calm."}
          </p>
        </div>
      </div>
    </section>
  );
};

// ─── Today ──────────────────────────────────────────────────────────────────

/**
 * One status chip on a lesson. Red is reserved for what is actually late
 * (a register not taken for a lesson that has started); a missing plan or a
 * report still to write is "to do", amber -- otherwise every future lesson
 * would glow red and the one that matters would drown.
 */
const Mark: React.FC<{
  label: string;
  state: "done" | "missing" | "pending" | "upcoming" | undefined;
  severe?: boolean;
}> = ({ label, state, severe = false }) => {
  if (!state) return null;
  const late = { icon: <XCircle className="w-3.5 h-3.5" aria-hidden />, cls: "text-red-800 bg-red-50 dark:text-red-200 dark:bg-red-900/30", text: "missing" };
  const todo = { icon: <CircleDashed className="w-3.5 h-3.5" aria-hidden />, cls: "text-amber-800 bg-amber-50 dark:text-amber-200 dark:bg-amber-900/30", text: "to do" };
  const map = {
    done: { icon: <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />, cls: "text-green-800 bg-green-50 dark:text-green-200 dark:bg-green-900/30", text: "done" },
    missing: severe ? late : { ...todo, text: "missing" },
    pending: todo,
    upcoming: { icon: <Circle className="w-3.5 h-3.5" aria-hidden />, cls: "text-slate-600 bg-surface-light dark:text-slate-300 dark:bg-surface-dark", text: "later" },
  }[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map.cls}`}
      aria-label={`${label}: ${map.text}`}
      title={`${label}: ${map.text}`}
    >
      {map.icon}
      {label}
    </span>
  );
};

const LessonRow: React.FC<{
  lesson: TodayLesson;
  state: ReturnType<typeof lessonState>;
  register?: "done" | "missing" | "upcoming";
}> = ({ lesson, state, register }) => (
  <li
    className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-3 py-2.5 sm:flex-nowrap ${
      state === "now"
        ? "bg-blue-50 dark:bg-blue-900/15 ring-1 ring-blue-400/50"
        : ""
    }`}
    aria-current={state === "now" ? "time" : undefined}
  >
    <span className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: lesson.color || "#3B82F6" }} aria-hidden />
    <div className="w-[5.5rem] flex-shrink-0 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
      {lesson.start_time} – {lesson.end_time}
    </div>
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-1.5 text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
        <span className="truncate">{lesson.subject_name ?? "Lesson"}</span>
        {/* Finished lessons keep full contrast; a check says "done" instead of fading them. */}
        {state === "done" && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-green-600 dark:text-green-400" aria-label="finished" />}
      </p>
      <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
        {[lesson.class_group_name, lesson.location, lesson.teacher_name].filter(Boolean).join(" · ") || "—"}
      </p>
    </div>
    {lesson.kind === "teaching" ? (
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1 max-sm:basis-full max-sm:pl-[calc(5.5rem+1.125rem)] sm:justify-end">
        <Mark label="Register" state={register} severe />
        <Mark label="Plan" state={lesson.plan} />
        <Mark label="Report" state={lesson.report} />
      </div>
    ) : state === "now" ? (
      <span className="flex-shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">Now</span>
    ) : null}
  </li>
);

export const TodayCard: React.FC<{
  today: HomeOverview["today"];
  nowMinutes: number;
  teaching: boolean;
  /** lesson_key -> register status (Discipline & Attendance). */
  registerMarks?: Record<string, "done" | "missing" | "upcoming">;
}> = ({ today, nowMinutes, teaching, registerMarks = {} }) => {
  const nextKey = nextLessonKey(today.lessons, nowMinutes);
  const done = today.lessons.filter((l) => lessonState(l, nowMinutes, nextKey) === "done").length;
  return (
    <Card aria-labelledby="home-today">
      <CardHeader
        id="home-today"
        icon={<CalendarClock className="w-4 h-4" />}
        title="Today"
        subtitle={
          today.lessons.length
            ? `${today.lessons.length} ${today.lessons.length === 1 ? "lesson" : "lessons"} · ${done} done`
            : "No lessons today"
        }
        action={
          <Link
            to={teaching ? "/dashboard" : "/my-enrolled-subjects"}
            className="inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Full timetable →
          </Link>
        }
      />
      <div className="px-3 pb-4">
        {today.lessons.length === 0 && today.activities.length === 0 ? (
          <p className="px-2 pb-2 text-sm text-text-secondary-light dark:text-text-secondary-dark">
            {today.next_teaching_day
              ? `Your next lessons are on ${DAYS[today.next_teaching_day.day_of_week]} (${today.next_teaching_day.lessons}).`
              : "Nothing on your timetable today."}
          </p>
        ) : (
          <ol className="space-y-1">
            {today.lessons.map((l) => (
              <LessonRow
                key={l.lesson_key}
                lesson={l}
                state={lessonState(l, nowMinutes, nextKey)}
                register={registerMarks[l.lesson_key]}
              />
            ))}
            {today.activities.map((a) => (
              <li key={`act-${a.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                <span className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#8B5CF6" }} aria-hidden />
                <div className="w-[5.5rem] flex-shrink-0 text-xs font-medium tabular-nums text-slate-600 dark:text-slate-300">
                  {a.start_time ? `${a.start_time} – ${a.end_time ?? ""}` : "All day"}
                </div>
                <p className="min-w-0 flex-1 truncate text-sm text-text-primary-light dark:text-text-primary-dark">
                  <PlayCircle className="mr-1 inline w-3.5 h-3.5 text-violet-500" aria-hidden />
                  {a.title}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
};
