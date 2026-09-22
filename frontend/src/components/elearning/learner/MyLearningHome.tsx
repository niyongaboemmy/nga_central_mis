import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock, Clock, Flame, Library, Sparkles, User } from "lucide-react";
import { apiService } from "../../../services/api";
import { useLearningPrefs } from "./useLearningPrefs";
import { elearningApi, LearnerCourseCard, learnerRoutes } from "../../../api/elearning";
import { useUser } from "../../../contexts/UserContext";
import { useMotion } from "../../../design/motion";
import { copy } from "../copy";
import Mascot from "../ui/Mascot";
import { EmptyState, ItemTypeIcon, ProgressRing, Skeleton, SubjectCover } from "../ui/primitives";

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
  const [streak, setStreak] = useState<{ weeks: number; this_week: boolean } | null>(null);

  useEffect(() => {
    if (!prefs.streak_enabled) return;
    apiService.get("/elearning/my/streak").then((r) => setStreak(r.data.data)).catch(() => setStreak(null));
  }, [prefs.streak_enabled]);

  useEffect(() => {
    elearningApi
      .myCourses()
      .then((r) => setCards(r.data.data))
      .catch(() => setError(true));
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

  const dueSoon = useMemo(
    () =>
      (cards || [])
        .flatMap((c) => c.due_soon.map((d) => ({ ...d, course_id: c.course_id, course_title: c.subject_name })))
        .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
        .slice(0, 3),
    [cards],
  );

  const thisWeek = useMemo(() => (cards || []).filter((c) => c.current_section), [cards]);
  const keepGoing = useMemo(
    () => (cards || []).flatMap((c) => (c.near_goal || []).map((g) => ({ ...g, course_id: c.course_id, subject_name: c.subject_name, color: c.cover_color }))).slice(0, 3),
    [cards],
  );

  if (error) {
    return <EmptyState pose="thinking" title={copy.errors.generic} action={{ label: "Try again", onClick: () => window.location.reload() }} />;
  }

  return (
    <div className="pb-24 sm:pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-display text-gray-900 dark:text-white">{copy.home.title}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-lg">
            {cards === null
              ? " "
              : copy.home.greeting(firstName, hero?.subject_name, hero?.current_section?.title?.split(" — ")[0])}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {prefs.streak_enabled && streak && streak.weeks > 0 && (
            <span className="inline-flex items-center gap-1 min-h-[40px] px-3 rounded-pill bg-accent-100 text-accent-600 text-sm font-semibold" title="Your personal weekly streak — nobody else sees it">
              <Flame className="w-4 h-4" /> {streak.weeks}
            </span>
          )}
          <Link
            to="/shared-lesson-notes"
            className="hidden sm:inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <Library className="w-4 h-4" /> {copy.home.library}
          </Link>
          <Link
            to={learnerRoutes.me}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-pill text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Me"
          >
            <User className="w-4 h-4" /> <span className="hidden sm:inline">{copy.me.title}</span>
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
        <EmptyState pose="sleepy" title={copy.home.emptyTitle} body={copy.home.emptyBody} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Hero — Up next */}
          {hero && (
            <motion.section {...m("reveal")} className="md:col-span-2">
              <SubjectCover name={hero.subject_name} code={hero.subject_code} color={hero.cover_color} icon={hero.icon} size="lg" className="h-full border shadow-soft">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{copy.home.upNext}</p>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight mt-0.5 truncate">{hero.subject_name}</h2>
                {hero.current_section && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 truncate">{hero.current_section.title}</p>
                )}
                {hero.next_item ? (
                  <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-white/70 dark:bg-black/30">
                    <span className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center text-brand-600 dark:text-brand-200 shadow-soft">
                      <ItemTypeIcon type={hero.next_item.item_type} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{hero.next_item.title}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        {hero.next_item.estimated_minutes ? (
                          <>
                            <Clock className="w-3 h-3" /> {copy.course.minutes(hero.next_item.estimated_minutes)}
                          </>
                        ) : (
                          copy.builder.itemTypes[hero.next_item.item_type]
                        )}
                      </p>
                    </div>
                    <motion.button
                      {...m("tap")}
                      onClick={() => navigate(learnerRoutes.item(hero.course_id, hero.next_item!.item_id))}
                      className="min-h-[44px] px-5 rounded-pill bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft focus:outline-none focus-visible:shadow-glow inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                    >
                      {hero.next_item.state === "IN_PROGRESS" ? copy.home.continueBtn : copy.home.startBtn}
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-3">
                    <Mascot pose="cheering" size={40} />
                    <p className="text-sm text-gray-700 dark:text-gray-200">{copy.home.allCaughtUp}</p>
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
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No week is scheduled right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {thisWeek.map((c) => {
                  const done = c.required_total ? Math.round((c.required_done / c.required_total) * 100) : 0;
                  return (
                    <li key={c.course_id}>
                      <Link
                        to={learnerRoutes.course(c.course_id, c.current_section!.section_id)}
                        className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[44px]"
                      >
                        <ProgressRing value={done} size={36} stroke={4} color={c.cover_color || undefined} label="" ariaLabel={`${c.subject_name} ${done}% this week`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{c.subject_name}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{c.current_section!.title}</p>
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
                <p className="text-sm text-gray-600 dark:text-gray-300">{copy.home.nothingDue}</p>
              </div>
            ) : (
              <ul className="mt-3 space-y-1">
                {dueSoon.map((d) => (
                  <li key={d.item_id}>
                    <Link
                      to={learnerRoutes.item(d.course_id, d.item_id)}
                      className="flex items-center gap-2 p-2 -mx-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[44px]"
                    >
                      <ItemTypeIcon type={d.item_type} className="w-4 h-4 text-warning-700" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{d.title}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {d.course_title} · {new Date(d.due_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
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
              <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{copy.home.keepGoing}</h3>
              <ul className="mt-3 space-y-1">
                {keepGoing.map((g) => (
                  <li key={`${g.course_id}-${g.section_id}`}>
                    <Link to={learnerRoutes.course(g.course_id, g.section_id)} className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[44px]">
                      <span className="w-2 h-8 rounded-pill" style={{ background: g.color || "#3b6cff" }} aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-100 truncate">{copy.home.nearGoal(g.remaining, g.title.split(" — ")[0])}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{g.subject_name}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* 4. Subjects */}
          <motion.section {...m("reveal")} className={`${keepGoing.length > 0 ? "md:col-span-3" : "md:col-span-2"} el-card p-4`}>
            <h3 className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{copy.home.subjects}</h3>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cards.map((c) => (
                <li key={c.course_id}>
                  <Link
                    to={learnerRoutes.course(c.course_id)}
                    className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-brand-200 dark:hover:border-brand-700 hover:shadow-soft transition-shadow min-h-[64px]"
                  >
                    <ProgressRing value={c.percent} size={44} stroke={5} color={c.cover_color || undefined} ariaLabel={`${c.subject_name} ${c.percent}% complete`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{c.subject_name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {c.teacher_name || c.class_group_name}
                        {c.overdue_count > 0 && (
                          <span className="ml-2 inline-flex items-center px-1.5 rounded-pill bg-danger-100 text-danger-700 font-semibold">
                            {c.overdue_count} overdue
                          </span>
                        )}
                      </p>
                    </div>
                    <span aria-hidden className="text-lg">{c.icon || ""}</span>
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
