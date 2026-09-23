import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  Library,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  User,
} from "lucide-react";
import { apiService } from "../../../services/api";
import { useLearningPrefs } from "./useLearningPrefs";
import {
  elearningApi,
  LearnerCourseCard,
  learnerRoutes,
} from "../../../api/elearning";
import { useUser } from "../../../contexts/UserContext";
import { useMotion } from "../../../design/motion";
import { copy } from "../copy";
import Mascot from "../ui/Mascot";
import {
  EmptyState,
  ItemTypeIcon,
  ProgressBar,
  ProgressRing,
  Skeleton,
  SubjectCover,
} from "../ui/primitives";

/**
 * Student home — "what's next" as a bento grid (UX plan §3.1). Four tiles: Up next (hero),
 * This week, Due soon, Subjects. Library ("all notes") is a link, not a separate hub.
 */
const MyLearningHome: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const m = useMotion();
  const [cards, setCards] = useState<LearnerCourseCard[] | null>(null);
  const [error, setError] = useState(false);
  const { prefs } = useLearningPrefs();
  const [streak, setStreak] = useState<{
    weeks: number;
    this_week: boolean;
  } | null>(null);

  useEffect(() => {
    if (!prefs.streak_enabled) return;
    apiService
      .get("/elearning/my/streak")
      .then((r) => setStreak(r.data.data))
      .catch(() => setStreak(null));
  }, [prefs.streak_enabled]);

  useEffect(() => {
    const load = () =>
      elearningApi
        .myCourses()
        .then((r) => setCards(r.data.data))
        .catch(() => setError(true));
    load();
    // Coming back from a lesson (or another tab) must never show yesterday's progress.
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, []);

  const firstName = (user as any)?.profile?.first_name as string | undefined;

  const hero = useMemo(() => {
    if (!cards) return null;
    // The course with a current week and something left to do; else anything with a next item.
    return (
      cards.find((c) => c.current_section && c.next_item) ||
      cards.find((c) => c.next_item) ||
      cards.find((c) => c.resume_item) ||
      cards[0] ||
      null
    );
  }, [cards]);

  /** Totals across every subject — the numbers the header and the stat strip must agree on. */
  const totals = useMemo(() => {
    const list = cards || [];
    const requiredTotal = list.reduce((n, c) => n + c.required_total, 0);
    const requiredDone = list.reduce((n, c) => n + c.required_done, 0);
    return {
      requiredTotal,
      requiredDone,
      pending: Math.max(requiredTotal - requiredDone, 0),
      overdue: list.reduce((n, c) => n + c.overdue_count, 0),
      dueSoon: list.reduce((n, c) => n + c.due_soon.length, 0),
      sectionsDone: list.reduce((n, c) => n + c.sections_completed, 0),
      sectionsTotal: list.reduce((n, c) => n + c.sections_total, 0),
      criteriaCovered: list.reduce((n, c) => n + c.criteria_covered, 0),
      criteriaTotal: list.reduce((n, c) => n + c.criteria_total, 0),
      percent: requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 0,
      // Weeks that are open right now and still have something in them.
      openWeeks: list.filter((c) => c.current_section && c.next_item).length,
    };
  }, [cards]);

  /** Nothing left in any open week — the hero must say that instead of "Up next". */
  const caughtUp = !!cards && cards.length > 0 && !cards.some((c) => c.next_item);
  const resume = useMemo(
    () => (cards || []).find((c) => c.resume_item) || null,
    [cards],
  );

  const dueSoon = useMemo(
    () =>
      (cards || [])
        .flatMap((c) =>
          c.due_soon.map((d) => ({
            ...d,
            course_id: c.course_id,
            course_title: c.subject_name,
          })),
        )
        .sort(
          (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
        )
        .slice(0, 3),
    [cards],
  );

  const thisWeek = useMemo(
    () => (cards || []).filter((c) => c.current_section),
    [cards],
  );
  const keepGoing = useMemo(
    () =>
      (cards || [])
        .flatMap((c) =>
          (c.near_goal || []).map((g) => ({
            ...g,
            course_id: c.course_id,
            subject_name: c.subject_name,
            color: c.cover_color,
          })),
        )
        .slice(0, 3),
    [cards],
  );

  if (error) {
    return (
      <EmptyState
        pose="thinking"
        title={copy.errors.generic}
        action={{ label: "Try again", onClick: () => window.location.reload() }}
      />
    );
  }

  return (
    <div className="pt-6 pb-24 sm:pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-display text-gray-900 dark:text-white">
            {copy.home.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
            {cards === null
              ? " "
              : copy.home.greeting(
                  firstName,
                  hero?.subject_name,
                  hero?.current_section?.title?.split(" — ")[0],
                  totals.pending,
                  totals.overdue,
                )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {prefs.streak_enabled && streak && streak.weeks > 0 && (
            <span
              className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill bg-accent-100 dark:bg-accent-500/15 text-accent-600 dark:text-accent-400 text-sm font-semibold"
              title={copy.home.streakHint}
            >
              <Flame className={`w-4 h-4 ${streak.this_week ? "animate-pulse" : ""}`} />
              <span className="hidden sm:inline">{copy.home.streakLabel(streak.weeks)}</span>
              <span className="sm:hidden">{streak.weeks}</span>
            </span>
          )}
          <Link
            to="/shared-lesson-notes"
            className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
          >
            <Library className="w-4 h-4" /> {copy.home.library}
          </Link>
          <Link
            to={learnerRoutes.me}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.06]"
            aria-label="Me"
          >
            <User className="w-4 h-4" />{" "}
            <span className="hidden sm:inline">{copy.me.title}</span>
          </Link>
        </div>
      </div>

      {cards === null ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="md:col-span-2 h-52" />
          <Skeleton className="h-52" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          pose="sleepy"
          title={copy.home.emptyTitle}
          body={copy.home.emptyBody}
        />
      ) : (
        <>
        {/* Needs you — the one line that tells a student whether to worry, before any
            card does. Overdue is loud, due-soon is amber, everything else is calm. */}
        <motion.div
          {...m("reveal")}
          className={`mb-4 flex flex-wrap items-center gap-2 px-4 py-3 rounded-2xl border ${
            totals.overdue > 0
              ? "bg-danger-100/70 dark:bg-danger-500/10 border-danger-500/30"
              : totals.dueSoon > 0
                ? "bg-warning-100/70 dark:bg-warning-500/10 border-warning-500/30"
                : "bg-success-100/60 dark:bg-success-500/[0.08] border-success-500/25"
          }`}
          role="status"
        >
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
              totals.overdue > 0
                ? "text-danger-700 dark:text-danger-500"
                : totals.dueSoon > 0
                  ? "text-warning-700 dark:text-warning-500"
                  : "text-success-700 dark:text-success-500"
            }`}
          >
            {totals.overdue > 0 ? (
              <AlertTriangle className="w-4 h-4" />
            ) : totals.dueSoon > 0 ? (
              <CalendarClock className="w-4 h-4" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {totals.overdue > 0
              ? copy.home.overdueOne(totals.overdue)
              : totals.dueSoon > 0
                ? copy.home.dueSoonCount(totals.dueSoon)
                : copy.home.allClear}
          </span>
          {totals.overdue > 0 && totals.dueSoon > 0 && (
            <span className="text-[11px] text-gray-600 dark:text-gray-300">
              · {copy.home.dueSoonCount(totals.dueSoon)}
            </span>
          )}
          {totals.openWeeks > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-pill bg-white/70 dark:bg-white/[0.08] text-gray-700 dark:text-gray-200">
              <Sparkles className="w-3 h-3" /> {copy.home.newWeek(totals.openWeeks)}
            </span>
          )}
          <span className="flex-1" />
          {totals.requiredTotal > 0 && (
            <span className="text-[11px] text-gray-600 dark:text-gray-300 font-medium">
              {totals.requiredDone}/{totals.requiredTotal} done
            </span>
          )}
        </motion.div>

        {/* At a glance — real numbers, so the page stops being three "nothing" boxes. */}
        <motion.div {...m("reveal")} className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              icon: TrendingUp,
              label: copy.home.statOverall,
              value: `${totals.percent}%`,
              sub: `${totals.requiredDone} of ${totals.requiredTotal} required`,
              bar: totals.percent,
            },
            {
              icon: Rocket,
              label: copy.home.statWeeks,
              value: `${totals.sectionsDone}/${totals.sectionsTotal || 0}`,
              sub: "weeks completed",
              bar: totals.sectionsTotal
                ? Math.round((totals.sectionsDone / totals.sectionsTotal) * 100)
                : 0,
            },
            {
              icon: Target,
              label: copy.home.statSkills,
              value: `${totals.criteriaCovered}/${totals.criteriaTotal || 0}`,
              sub: "skills evidenced",
              bar: totals.criteriaTotal
                ? Math.round((totals.criteriaCovered / totals.criteriaTotal) * 100)
                : 0,
            },
            {
              icon: Library,
              label: copy.home.subjects,
              value: String(cards.length),
              sub: cards.length === 1 ? "course open" : "courses open",
              bar: null as number | null,
            },
          ].map((stat) => (
            <div key={stat.label} className="el-card p-3.5">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <stat.icon className="w-3.5 h-3.5" /> {stat.label}
              </p>
              <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white tabular-nums">
                {stat.value}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{stat.sub}</p>
              {stat.bar !== null && (
                <ProgressBar value={stat.bar} className="mt-2" ariaLabel={`${stat.label} ${stat.bar}%`} />
              )}
            </div>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Hero — Up next */}
          {hero && (
            <motion.section {...m("reveal")} className="md:col-span-2">
              <SubjectCover
                name={hero.subject_name}
                code={hero.subject_code}
                color={hero.cover_color}
                icon={hero.icon}
                size="lg"
                className="h-full border shadow-soft"
              >
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                  {/* "Up next" over an empty state read as a bug — say which state this is. */}
                  {hero.next_item
                    ? copy.home.upNext
                    : resume
                      ? copy.home.resumeLabel
                      : copy.home.caughtUpEyebrow}
                </p>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mt-0.5 truncate">
                  {hero.subject_name}
                </h2>
                {hero.current_section && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 truncate">
                    {hero.current_section.title}
                  </p>
                )}
                {hero.required_total > 0 && (
                  <div className="mt-3">
                    <ProgressBar
                      value={Math.round((hero.required_done / hero.required_total) * 100)}
                      color={hero.cover_color || undefined}
                      ariaLabel={`${hero.subject_name} ${hero.required_done} of ${hero.required_total} done`}
                    />
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      {hero.required_done}/{hero.required_total} done ·{" "}
                      {hero.sections_completed}/{hero.sections_total} weeks
                    </p>
                  </div>
                )}
                {hero.next_item ? (
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-white/70 dark:bg-black/30">
                    <span className="w-9 h-9 rounded-lg bg-white dark:bg-white/[0.08] flex items-center justify-center text-brand-600 dark:text-brand-200 shadow-soft">
                      <ItemTypeIcon
                        type={hero.next_item.item_type}
                        className="w-4 h-4"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {hero.next_item.title}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        {hero.next_item.estimated_minutes ? (
                          <>
                            <Clock className="w-3 h-3" />{" "}
                            {copy.course.minutes(
                              hero.next_item.estimated_minutes,
                            )}
                          </>
                        ) : (
                          copy.builder.itemTypes[hero.next_item.item_type]
                        )}
                      </p>
                    </div>
                    <motion.button
                      {...m("tap")}
                      onClick={() =>
                        navigate(
                          learnerRoutes.item(
                            hero.course_id,
                            hero.next_item!.item_id,
                          ),
                        )
                      }
                      className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                    >
                      {hero.next_item.state === "IN_PROGRESS"
                        ? copy.home.continueBtn
                        : copy.home.startBtn}
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                ) : (
                  // Nothing queued: celebrate it, then still offer a way forward. An
                  // "Up next" card with no next step was the emptiest part of this page.
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-white/70 dark:bg-black/30">
                    <Mascot pose="cheering" size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {caughtUp ? copy.home.caughtUpTitle : copy.home.allCaughtUp}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {copy.home.caughtUpBody(
                          Math.max(totals.sectionsTotal - totals.sectionsDone, 0),
                        )}
                      </p>
                    </div>
                    <motion.button
                      {...m("tap")}
                      onClick={() =>
                        navigate(
                          resume?.resume_item
                            ? learnerRoutes.item(resume.course_id, resume.resume_item.item_id)
                            : learnerRoutes.course(hero.course_id),
                        )
                      }
                      className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow inline-flex items-center justify-center gap-1.5 w-full sm:w-auto flex-shrink-0"
                    >
                      {resume?.resume_item ? copy.home.reviewBtn : copy.home.browseBtn}
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                )}
              </SubjectCover>
            </motion.section>
          )}

          {/* 2. This week */}
          <motion.section {...m("reveal")} className="el-card p-4">
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> {copy.home.thisWeek}
            </h3>
            {thisWeek.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                No week is scheduled right now.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {thisWeek.map((c) => {
                  const done = c.required_total
                    ? Math.round((c.required_done / c.required_total) * 100)
                    : 0;
                  return (
                    <li key={c.course_id}>
                      <Link
                        to={learnerRoutes.course(
                          c.course_id,
                          c.current_section!.section_id,
                        )}
                        className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[44px]"
                      >
                        <ProgressRing
                          value={done}
                          size={36}
                          stroke={4}
                          color={c.cover_color || undefined}
                          label=""
                          ariaLabel={`${c.subject_name} ${done}% this week`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                            {c.subject_name}
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {c.current_section!.title}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.section>

          {/* 3. Due soon */}
          <motion.section {...m("reveal")} className="el-card p-4">
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" /> {copy.home.dueSoon}
            </h3>
            {dueSoon.length === 0 ? (
              <div className="mt-3 flex items-center gap-3">
                <Mascot pose="sleepy" size={36} />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {copy.home.nothingDue}
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-1">
                {dueSoon.map((d) => (
                  <li key={d.item_id}>
                    <Link
                      to={learnerRoutes.item(d.course_id, d.item_id)}
                      className="flex items-center gap-2 p-2 -mx-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[44px]"
                    >
                      <ItemTypeIcon
                        type={d.item_type}
                        className="w-4 h-4 text-warning-700 dark:text-warning-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                          {d.title}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {d.course_title} ·{" "}
                          {new Date(d.due_at).toLocaleDateString("en-GB", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {/* 5. Keep going — near-goal nudges only (Phase 2) */}
          {keepGoing.length > 0 && (
            <motion.section {...m("reveal")} className="el-card p-4">
              <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                {copy.home.keepGoing}
              </h3>
              <ul className="mt-3 space-y-1">
                {keepGoing.map((g) => (
                  <li key={`${g.course_id}-${g.section_id}`}>
                    <Link
                      to={learnerRoutes.course(g.course_id, g.section_id)}
                      className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[44px]"
                    >
                      <span
                        className="w-2 h-8 rounded-pill"
                        style={{ background: g.color || "#3b6cff" }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                          {copy.home.nearGoal(
                            g.remaining,
                            g.title.split(" — ")[0],
                          )}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {g.subject_name}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* 4. Subjects */}
          <motion.section
            {...m("reveal")}
            className={`${keepGoing.length > 0 ? "md:col-span-3" : "md:col-span-2"} el-card p-4`}
          >
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
              {copy.home.subjects}
            </h3>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cards.map((c) => (
                <li key={c.course_id}>
                  <Link
                    to={
                      c.next_item
                        ? learnerRoutes.item(c.course_id, c.next_item.item_id)
                        : learnerRoutes.course(c.course_id)
                    }
                    className="group flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-white/[0.06] hover:border-brand-300 dark:hover:border-brand-500/40 hover:shadow-soft hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 transition-all min-h-[64px]"
                  >
                    <ProgressRing
                      value={c.percent}
                      size={44}
                      stroke={5}
                      color={c.cover_color || undefined}
                      ariaLabel={`${c.subject_name} ${c.percent}% complete`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                        {c.subject_name}
                      </p>
                      {/* What the card is actually for: the next thing to do in it. */}
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                        {c.next_item ? (
                          <>
                            <ItemTypeIcon type={c.next_item.item_type} className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{c.next_item.title}</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0 text-success-500" />
                            <span className="truncate">
                              {c.teacher_name || c.class_group_name}
                            </span>
                          </>
                        )}
                      </p>
                      {c.overdue_count > 0 && (
                        <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-pill el-chip-danger text-[10px] font-semibold">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {c.overdue_count} overdue
                        </span>
                      )}
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>
        </>
      )}
    </div>
  );
};

export default MyLearningHome;
