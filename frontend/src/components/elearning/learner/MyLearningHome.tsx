import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  Library,
  ListChecks,
  Sparkles,
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
  ProgressRing,
  Skeleton,
} from "../ui/primitives";
import { buildQueue, type QueueEntry, type QueueKind } from "./queue";

/**
 * Student home — "what do I open now?", answered above the fold.
 *
 * Rebuilt against current dashboard practice (see the notes in the PR): the
 * page is scanned, not read, so it leads with one North-Star number and one
 * action, and everything else earns its pixels.
 *
 * What changed and why:
 *  • Four equal stat tiles became one progress rail. They were not equal —
 *    "0/6 skills" was shouting as loudly as overall progress — and one of
 *    them ("Your subjects: 2") was the heading of a section further down the
 *    same page.
 *  • "This week", "Due soon" and "Keep going" became one ranked queue. Each
 *    was half empty most of the time and none was ranked against the others,
 *    so an assignment due tomorrow could sit below a week that had merely
 *    opened.
 *  • The full-width status banner folded into a pill in the header; it spent
 *    a whole row on one phrase.
 *  • Type and padding came down a step throughout (display → xl, 2xl stats →
 *    lg, p-4 → p-3), which is most of the "looks professional" difference.
 */

const KIND_STYLE: Record<
  QueueKind,
  { dot: string; label: string; meta: string }
> = {
  overdue: {
    dot: "bg-danger-500",
    label: "Overdue",
    meta: "text-danger-700 dark:text-danger-500",
  },
  due: {
    dot: "bg-warning-500",
    label: "Due",
    meta: "text-warning-700 dark:text-warning-500",
  },
  week: {
    dot: "bg-brand-500",
    label: "This week",
    meta: "text-gray-500 dark:text-gray-400",
  },
  goal: {
    dot: "bg-success-500",
    label: "Almost done",
    meta: "text-gray-500 dark:text-gray-400",
  },
};

/** A compact secondary stat: label, ratio, and a hairline meter. */
const RailStat: React.FC<{
  label: string;
  value: string;
  percent: number;
  color?: string;
}> = ({ label, value, percent, color }) => (
  // A ring per statistic, not a stack of bars. Six horizontal meters on one screen read as
  // noise and none of them carried the number they measured.
  <div className="flex min-w-0 flex-1 items-center gap-2.5">
    <ProgressRing
      value={percent}
      size={44}
      stroke={4}
      color={color}
      ariaLabel={`${label}: ${value}`}
    />
    <div className="min-w-0">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
    </div>
  </div>
);

const QueueRow: React.FC<{ entry: QueueEntry }> = ({ entry }) => {
  const style = KIND_STYLE[entry.kind];
  return (
    <Link
      to={entry.to}
      className="group flex items-center gap-2.5 rounded-xl px-2 py-2 -mx-2 min-h-[44px] hover:bg-gray-50 dark:hover:bg-white/[0.04] transition-colors"
    >
      <span
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${style.dot}`}
        aria-hidden
      />
      {entry.itemType ? (
        <ItemTypeIcon
          type={entry.itemType}
          className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
        />
      ) : (
        <Circle className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-gray-800 dark:text-gray-100">
          {entry.title}
        </span>
        <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">
          <span className="sr-only">{style.label}: </span>
          {entry.subtitle}
        </span>
      </span>
      {entry.meta && (
        <span
          className={`flex-shrink-0 text-[11px] font-medium tabular-nums ${style.meta}`}
        >
          {entry.meta}
        </span>
      )}
    </Link>
  );
};

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

  /** Totals across every subject — the numbers the header and the rail must agree on. */
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
      percent: requiredTotal
        ? Math.round((requiredDone / requiredTotal) * 100)
        : 0,
      openWeeks: list.filter((c) => c.current_section && c.next_item).length,
    };
  }, [cards]);

  /** Nothing left in any open week — the hero must say that instead of "Up next". */
  const caughtUp =
    !!cards && cards.length > 0 && !cards.some((c) => c.next_item);
  const resume = useMemo(
    () => (cards || []).find((c) => c.resume_item) || null,
    [cards],
  );

  const queue = useMemo(
    () => buildQueue(cards || [], { excludeCourseId: hero?.course_id ?? null }),
    [cards, hero],
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

  const tone =
    totals.overdue > 0 ? "danger" : totals.dueSoon > 0 ? "warning" : "success";
  const toneChip = {
    danger:
      "bg-danger-100/80 dark:bg-danger-500/10 text-danger-700 dark:text-danger-500",
    warning:
      "bg-warning-100/80 dark:bg-warning-500/10 text-warning-700 dark:text-warning-500",
    success:
      "bg-success-100/70 dark:bg-success-500/10 text-success-700 dark:text-success-500",
  }[tone];

  return (
    <div className="pt-5 pb-24 sm:pb-8">
      {/* ── Header: title, greeting, status and tools on one line ────────── */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              {copy.home.title}
            </h1>
            {/* The status used to be a full-width banner for one phrase. */}
            {cards !== null && cards.length > 0 && (
              <span
                role="status"
                className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${toneChip}`}
              >
                {tone === "danger" ? (
                  <AlertTriangle className="w-3 h-3" />
                ) : tone === "warning" ? (
                  <CalendarClock className="w-3 h-3" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                {totals.overdue > 0
                  ? copy.home.overdueOne(totals.overdue)
                  : totals.dueSoon > 0
                    ? copy.home.dueSoonCount(totals.dueSoon)
                    : copy.home.allClear}
              </span>
            )}
            {totals.openWeeks > 0 && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
                <Sparkles className="w-3 h-3" />
                {copy.home.newWeek(totals.openWeeks)}
              </span>
            )}
          </div>
          <p className="mt-0.5 max-w-2xl text-[13px] text-gray-500 dark:text-gray-400">
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

        <div className="flex flex-shrink-0 items-center gap-1">
          {prefs.streak_enabled && streak && streak.weeks > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-pill bg-accent-100 px-2.5 py-1.5 text-xs font-semibold text-accent-600 dark:bg-accent-500/15 dark:text-accent-400"
              title={copy.home.streakHint}
            >
              <Flame
                className={`w-3.5 h-3.5 ${streak.this_week ? "animate-pulse motion-reduce:animate-none" : ""}`}
              />
              <span className="hidden sm:inline">
                {copy.home.streakLabel(streak.weeks)}
              </span>
              <span className="sm:hidden">{streak.weeks}</span>
            </span>
          )}
          <Link
            to="/shared-lesson-notes"
            className="hidden items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 sm:inline-flex dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <Library className="w-3.5 h-3.5" /> {copy.home.library}
          </Link>
          <Link
            to={learnerRoutes.me}
            className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            aria-label="Me"
          >
            <User className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{copy.me.title}</span>
          </Link>
        </div>
      </div>

      {cards === null ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Skeleton className="md:col-span-2 h-36" />
            <Skeleton className="h-36" />
          </div>
          <Skeleton className="h-24" />
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          pose="sleepy"
          title={copy.home.emptyTitle}
          body={copy.home.emptyBody}
        />
      ) : (
        <div className="space-y-3">
          {/* ── Progress rail: one North-Star number, two supporting meters ── */}
          <motion.div
            {...m("reveal")}
            className="el-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <ProgressRing
                value={totals.percent}
                size={56}
                stroke={5}
                alwaysShowValue
                ariaLabel={`${copy.home.statOverall}: ${totals.percent}%`}
              />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  {copy.home.statOverall}
                </p>
                <p className="truncate text-sm font-bold text-gray-900 dark:text-white">
                  {totals.requiredDone} of {totals.requiredTotal}
                </p>
                <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">required</p>
              </div>
            </div>
            <>
              <RailStat
                label={copy.home.statWeeks}
                value={`${totals.sectionsDone}/${totals.sectionsTotal || 0}`}
                percent={
                  totals.sectionsTotal
                    ? Math.round(
                        (totals.sectionsDone / totals.sectionsTotal) * 100,
                      )
                    : 0
                }
                color="#22c55e"
              />
              <RailStat
                label={copy.home.statSkills}
                value={`${totals.criteriaCovered}/${totals.criteriaTotal || 0}`}
                percent={
                  totals.criteriaTotal
                    ? Math.round(
                        (totals.criteriaCovered / totals.criteriaTotal) * 100,
                      )
                    : 0
                }
                color="#a855f7"
              />
            </>
          </motion.div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* ── Next best action ──────────────────────────────────────── */}
            {hero && (
              <motion.section
                {...m("reveal")}
                className="el-card relative overflow-hidden p-3 md:col-span-2"
              >
                {/* No colour spine: a bare 4px bar down the edge of every card read as
                    decoration rather than information. The subject's colour now carries
                    something — its progress ring. */}
                <div className="flex items-start gap-3.5">
                  <ProgressRing
                    value={hero.required_total ? Math.round((hero.required_done / hero.required_total) * 100) : 0}
                    size={52}
                    stroke={5}
                    color={hero.cover_color || undefined}
                    className="mt-0.5"
                    ariaLabel={`${hero.subject_name} ${hero.required_done} of ${hero.required_total} done`}
                  />
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {hero.next_item
                        ? copy.home.upNext
                        : resume
                          ? copy.home.resumeLabel
                          : copy.home.caughtUpEyebrow}
                    </p>
                    {hero.subject_code && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                        {hero.subject_code}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-0.5 truncate text-[15px] font-bold leading-snug text-gray-900 dark:text-white">
                    {hero.subject_name}
                  </h2>
                  {hero.current_section && (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {hero.current_section.title}
                    </p>
                  )}

                  {hero.required_total > 0 && (
                    // The ring already shows the proportion — this says what it counts.
                    <p className="mt-1 text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                      {hero.required_done}/{hero.required_total} done ·{" "}
                      {hero.sections_completed}/{hero.sections_total} weeks
                    </p>
                  )}

                  {hero.next_item ? (
                    <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-gray-50 p-2 dark:bg-white/[0.04]">
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 shadow-soft dark:bg-white/[0.08] dark:text-brand-200">
                        <ItemTypeIcon
                          type={hero.next_item.item_type}
                          className="w-3.5 h-3.5"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                          {hero.next_item.title}
                        </p>
                        <p className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                          {hero.next_item.estimated_minutes ? (
                            <>
                              <Clock className="w-3 h-3" />
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
                        className="inline-flex min-h-[40px] flex-shrink-0 items-center justify-center gap-1.5 rounded-pill bg-brand-500 px-4 text-[13px] font-semibold text-white shadow-soft hover:bg-brand-600 focus:outline-none focus-visible:shadow-glow"
                      >
                        {hero.next_item.state === "IN_PROGRESS"
                          ? copy.home.continueBtn
                          : copy.home.startBtn}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-gray-50 p-2 dark:bg-white/[0.04]">
                      <Mascot pose="cheering" size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                          {caughtUp
                            ? copy.home.caughtUpTitle
                            : copy.home.allCaughtUp}
                        </p>
                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">
                          {copy.home.caughtUpBody(
                            Math.max(
                              totals.sectionsTotal - totals.sectionsDone,
                              0,
                            ),
                          )}
                        </p>
                      </div>
                      <motion.button
                        {...m("tap")}
                        onClick={() =>
                          navigate(
                            resume?.resume_item
                              ? learnerRoutes.item(
                                  resume.course_id,
                                  resume.resume_item.item_id,
                                )
                              : learnerRoutes.course(hero.course_id),
                          )
                        }
                        className="inline-flex min-h-[40px] flex-shrink-0 items-center justify-center gap-1.5 rounded-pill bg-brand-500 px-4 text-[13px] font-semibold text-white shadow-soft hover:bg-brand-600 focus:outline-none focus-visible:shadow-glow"
                      >
                        {resume?.resume_item
                          ? copy.home.reviewBtn
                          : copy.home.browseBtn}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </motion.button>
                    </div>
                  )}
                  </div>
                </div>
              </motion.section>
            )}

            {/* ── One ranked queue, replacing three half-empty cards ─────── */}
            <motion.section {...m("reveal")} className="el-card p-3">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <ListChecks className="w-3.5 h-3.5" />
                {copy.home.queue}
                {queue.length > 0 && (
                  <span className="ml-auto rounded-pill bg-gray-100 px-1.5 text-[10px] tabular-nums text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                    {queue.length}
                  </span>
                )}
              </h3>
              {queue.length === 0 ? (
                <div className="mt-2 flex items-center gap-2.5">
                  <Mascot pose="sleepy" size={32} />
                  <p className="text-[13px] text-gray-600 dark:text-gray-300">
                    {copy.home.nothingDue}
                  </p>
                </div>
              ) : (
                <ul className="mt-1.5">
                  {queue.map((entry) => (
                    <li key={entry.id}>
                      <QueueRow entry={entry} />
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          </div>

          {/* ── Subjects: one ring each, no spine, no bar ───────────────── */}
          <motion.section {...m("reveal")} className="el-card p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {copy.home.subjects}
            </h3>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((c) => (
                <li key={c.course_id}>
                  <Link
                    to={
                      c.next_item
                        ? learnerRoutes.item(c.course_id, c.next_item.item_id)
                        : learnerRoutes.course(c.course_id)
                    }
                    className="group flex min-h-[64px] items-center gap-3 rounded-2xl border border-gray-100 p-3 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:border-white/[0.06] dark:hover:border-brand-500/40"
                  >
                    {/* The ring carries the subject's colour and its progress at once —
                        the old spine carried the colour and nothing else. */}
                    <ProgressRing
                      value={c.percent}
                      size={44}
                      stroke={4}
                      color={c.cover_color || undefined}
                      ariaLabel={`${c.subject_name} ${c.percent}% complete`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                        {c.subject_name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
                        {c.overdue_count > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-danger-700 dark:text-danger-500">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {c.overdue_count} overdue
                          </span>
                        ) : c.next_item ? (
                          <>
                            <ItemTypeIcon
                              type={c.next_item.item_type}
                              className="w-3 h-3 flex-shrink-0"
                            />
                            <span className="truncate">
                              {c.next_item.title}
                            </span>
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
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-gray-600" />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>
      )}
    </div>
  );
};

export default MyLearningHome;
