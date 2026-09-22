import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import {
  AlertOctagon,
  ArrowRight,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  FileEdit,
  GraduationCap,
  LayoutGrid,
  MapPin,
  PenLine,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  getTeacherOverview,
  type TeacherLesson,
  type TeacherOverview,
} from "../../api/dashboard";
import { useUser } from "../../contexts/UserContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { useCurrentTime } from "../calendar/useCurrentTime";
import DayRail, { railEntries } from "./DayRail";
import {
  CoverageChart,
  SubjectLoadChart,
  WeeklyLoadChart,
} from "./TeacherCharts";
import { coverageRows, subjectLoad, weeklyLoad } from "./analytics";
import { describeLoadError, type LoadFailure } from "./loadError";
import {
  buildActionItems,
  countsBySeverity,
  SEVERITY_LABEL,
  weekOfTerm,
  type ActionItem,
  type Severity,
} from "./urgency";

// ─── Teacher Dashboard ──────────────────────────────────────────────────────
// The teacher's working board. Three questions, in the order a teacher
// actually asks them:
//
//   1. Is anything on fire?  → the alert bar, then the blocking tier of
//                              "Needs your attention". Nothing else on this
//                              page is allowed to be red.
//   2. What is my day?       → "Your day": live status, a countdown that
//                              actually counts, and the day drawn to scale.
//   3. What is drifting?     → the analytics band — scheme coverage against
//                              the term calendar, teaching load by day, where
//                              the week goes — then the content panels.
//
// The weekly timetable grid stays on the welcome page (`/dashboard`): this
// page answers "what do I need to do", not "when do I teach".
// ─────────────────────────────────────────────────────────────────────────────

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A lesson within this many minutes is a "get moving" nudge, not an FYI. */
const IMMINENT_MINUTES = 15;
/** Silent background refresh while the page is left open. */
const AUTO_REFRESH_MS = 5 * 60 * 1000;

const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** "08:00:00" -> "08:00" — the DB keeps seconds nobody wants to read. */
const hhmm = (time: string) => time.slice(0, 5);

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
};

const relativeDate = (value: string | null) => {
  if (!value) return "";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const fallbackColor = "#3B82F6";

const SEVERITY_STYLE: Record<
  Severity,
  { chip: string; rail: string; row: string }
> = {
  blocking: {
    chip: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    rail: "bg-red-500",
    row: "border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20",
  },
  slipping: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    rail: "bg-amber-500",
    row: "border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20",
  },
  tidy: {
    chip: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",
    rail: "bg-slate-400",
    row: "border-border-light dark:border-border-dark/50 hover:bg-surface-light dark:hover:bg-surface-dark",
  },
};

// ─── Building blocks ────────────────────────────────────────────────────────

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = "",
  children,
}) => (
  <section
    className={`bg-card-light dark:bg-card-dark/30 rounded-3xl border border-border-light dark:border-border-dark/50 shadow-sm ${className}`}
  >
    {children}
  </section>
);

const CardHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ icon, title, subtitle, action }) => (
  <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
    <div className="flex items-center gap-3 min-w-0">
      <span className="flex-shrink-0 grid place-items-center w-9 h-9 rounded-2xl bg-surface-light dark:bg-surface-dark text-text-secondary-light dark:text-text-secondary-dark">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="font-semibold text-text-primary-light dark:text-text-primary-dark truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action}
  </div>
);

/**
 * Live countdown to a time of day, ticking every second so a teacher can trust
 * it at a glance. Isolated in its own component so the per-second re-render
 * never touches the rest of the page.
 */
const Countdown: React.FC<{ targetMinutes: number }> = ({ targetMinutes }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsNow =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const left = Math.max(0, targetMinutes * 60 - secondsNow);
  const imminent = left <= IMMINENT_MINUTES * 60;

  const text =
    left >= 3600
      ? formatDuration(Math.round(left / 60))
      : `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  return (
    <span
      className={`tabular-nums font-semibold ${
        imminent
          ? "text-red-600 dark:text-red-400"
          : "text-blue-600 dark:text-blue-400"
      }`}
    >
      {text}
    </span>
  );
};

/** Ratio against a limit — a meter reads faster than "3/4" on its own. */
const ProgressRing: React.FC<{
  value: number;
  total: number;
  tone: string;
}> = ({ value, total, tone }) => {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90" aria-hidden>
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="4"
        className="stroke-border-light dark:stroke-border-dark/40"
      />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className={tone}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        style={{ transition: "stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)" }}
      />
    </svg>
  );
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  to: string;
  tone: "blue" | "green" | "purple";
}> = ({ icon, label, value, hint, to, tone }) => {
  const tones = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    green:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    purple:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
  } as const;

  return (
    <Link
      to={to}
      className="group bg-card-light dark:bg-card-dark/30 rounded-3xl border border-border-light dark:border-border-dark/50 shadow-sm p-5 flex items-center gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800/50"
    >
      <span
        className={`grid place-items-center w-11 h-11 rounded-2xl flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${tones[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark truncate">
          {label}
        </p>
        <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark leading-tight">
          {value}
        </p>
        {hint && (
          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
            {hint}
          </p>
        )}
      </div>
      <ArrowRight className="w-4 h-4 flex-shrink-0 opacity-0 -translate-x-1 text-text-secondary-light dark:text-text-secondary-dark transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
    </Link>
  );
};

const QuickAction: React.FC<{
  to: string;
  icon: React.ReactNode;
  label: string;
}> = ({ to, icon, label }) => (
  <Link
    to={to}
    className="flex items-center gap-2 rounded-2xl border border-border-light dark:border-border-dark/50 bg-card-light dark:bg-card-dark/30 px-3.5 py-2.5 text-sm font-medium text-text-primary-light dark:text-text-primary-dark transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-800/60 hover:text-blue-600 dark:hover:text-blue-400"
  >
    <span className="text-text-secondary-light dark:text-text-secondary-dark">
      {icon}
    </span>
    {label}
  </Link>
);

const LessonRow: React.FC<{
  lesson: TeacherLesson;
  state: "done" | "now" | "upcoming";
}> = ({ lesson, state }) => {
  const color = lesson.color || fallbackColor;
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
        state === "now"
          ? "bg-blue-50 dark:bg-blue-900/15 ring-1 ring-blue-400/50"
          : state === "done"
            ? "opacity-55"
            : "hover:bg-surface-light dark:hover:bg-surface-dark"
      }`}
    >
      <span
        className="w-1.5 self-stretch rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <div className="w-24 flex-shrink-0 text-xs font-medium tabular-nums text-text-secondary-light dark:text-text-secondary-dark">
        {hhmm(lesson.start_time)} – {hhmm(lesson.end_time)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
          {lesson.subject_name || "Lesson"}
        </p>
        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
          {[lesson.class_group_name, lesson.location]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>
      {state === "now" && (
        <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          Now
        </span>
      )}
      {state === "upcoming" && (
        <span className="flex-shrink-0 text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
          in <Countdown targetMinutes={toMinutes(lesson.start_time)} />
        </span>
      )}
      {state === "done" && (
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-500" />
      )}
    </li>
  );
};

const ActionRow: React.FC<{ item: ActionItem }> = ({ item }) => {
  const style = SEVERITY_STYLE[item.severity];
  return (
    <Link
      to={item.to}
      className={`group flex gap-3 rounded-2xl border p-3 transition-all duration-200 hover:-translate-y-0.5 ${style.row}`}
    >
      <span
        className={`w-1 self-stretch rounded-full flex-shrink-0 ${style.rail}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark">
            {item.title}
          </p>
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
            {item.cta}
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
        <p className="mt-0.5 text-xs text-text-secondary-light dark:text-text-secondary-dark line-clamp-2">
          {item.detail}
        </p>
        <p className="mt-1 text-[11px] italic text-text-secondary-light dark:text-text-secondary-dark line-clamp-2">
          {item.why}
        </p>
      </div>
    </Link>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

const TeacherDashboard: React.FC = () => {
  const { user } = useUser();
  const { selectedYearId, selectedTermId } = useAcademicPeriod();
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications();
  const { minutes: nowMinutes, date: now } = useCurrentTime();

  const [data, setData] = useState<TeacherOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<LoadFailure | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const loadRef = useRef<(background?: boolean) => void>(() => {});

  const load = useCallback(
    async (background = false) => {
      background ? setRefreshing(true) : setLoading(true);
      try {
        const overview = await getTeacherOverview({
          academic_year_id: selectedYearId ?? undefined,
          academic_term_id: selectedTermId ?? undefined,
        });
        setData(overview);
        setLoadedAt(new Date());
        setError(null);
      } catch (err) {
        console.error("Failed to load teacher overview:", err);
        // A failed background poll keeps whatever is already on screen: the
        // teacher is mid-glance, and blanking the page over a dropped poll is
        // worse than showing figures a few minutes old.
        if (!background) {
          setError(describeLoadError(err));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedYearId, selectedTermId],
  );
  loadRef.current = load;

  useEffect(() => {
    if (!selectedYearId) return;
    load();
  }, [selectedYearId, selectedTermId, load]);

  // Keep a page left open on a staffroom screen honest, without polling a
  // hidden tab.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadRef.current(true);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const firstName =
    data?.teacher.first_name?.trim() ||
    user?.profile?.first_name?.trim() ||
    user?.user?.username ||
    "there";

  const greeting =
    now.getHours() < 12
      ? "Good morning"
      : now.getHours() < 17
        ? "Good afternoon"
        : "Good evening";

  // Live state is re-derived on the client every minute: the payload's own
  // snapshot goes stale the moment it arrives, and a teacher leaves this page
  // open through a whole period.
  const todayLessons = data?.schedule.today ?? [];
  const currentLesson =
    todayLessons.find(
      (l) =>
        toMinutes(l.start_time) <= nowMinutes &&
        toMinutes(l.end_time) > nowMinutes,
    ) ?? null;
  const nextLesson =
    todayLessons.find((l) => toMinutes(l.start_time) > nowMinutes) ?? null;
  const doneToday = todayLessons.filter(
    (l) => toMinutes(l.end_time) <= nowMinutes,
  );

  const lessonState = (lesson: TeacherLesson): "done" | "now" | "upcoming" => {
    if (toMinutes(lesson.end_time) <= nowMinutes) return "done";
    if (toMinutes(lesson.start_time) <= nowMinutes) return "now";
    return "upcoming";
  };

  const week = useMemo(
    () => weekOfTerm(data?.period.term_start_date ?? null, now),
    [data?.period.term_start_date, now],
  );

  const actionItems = useMemo(
    () => (data ? buildActionItems(data, week) : []),
    [data, week],
  );
  const counts = useMemo(() => countsBySeverity(actionItems), [actionItems]);
  const blocking = actionItems.filter((i) => i.severity === "blocking");
  const visibleItems =
    severityFilter === "all"
      ? actionItems
      : actionItems.filter((i) => i.severity === severityFilter);

  const coverage = useMemo(
    () => (data ? coverageRows(data.schemes.rows, week) : []),
    [data, week],
  );
  const loadPoints = useMemo(
    () => (data ? weeklyLoad(data.schedule.week_load, now.getDay()) : []),
    [data, now],
  );
  const subjectPoints = useMemo(
    () => (data ? subjectLoad(data.classes) : []),
    [data],
  );
  const behindCount = coverage.filter((r) => r.status !== "good").length;

  // Term progress, for the header bar.
  const termProgress = useMemo(() => {
    const start = data?.period.term_start_date;
    const end = data?.period.term_end_date;
    if (!start || !end) return null;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
    const totalWeeks = Math.max(1, Math.round((e - s) / (7 * 86_400_000)));
    const pct = Math.min(100, Math.max(0, ((Date.now() - s) / (e - s)) * 100));
    return { totalWeeks, pct };
  }, [data?.period.term_start_date, data?.period.term_end_date]);

  // ── Loading / error ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-10 w-72 rounded-2xl bg-surface-light dark:bg-surface-dark animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-56 rounded-3xl bg-surface-light dark:bg-surface-dark animate-pulse" />
          <div className="h-56 rounded-3xl bg-surface-light dark:bg-surface-dark animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-3xl bg-surface-light dark:bg-surface-dark animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    const failure = error ?? {
      message: "We couldn't load your dashboard.",
      detail: "no data",
      retryable: true,
    };
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-3xl border border-border-light dark:border-border-dark/50 bg-card-light dark:bg-card-dark/30 p-8 text-center">
          <span className="grid place-items-center w-12 h-12 mx-auto rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
            <AlertOctagon className="w-6 h-6" />
          </span>
          <p className="mt-4 text-base font-medium text-text-primary-light dark:text-text-primary-dark">
            {failure.message}
          </p>
          <p className="mt-1 text-xs text-text-secondary-light dark:text-text-secondary-dark">
            {failure.detail}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {failure.retryable && (
              <button
                onClick={() => load()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try again
              </button>
            )}
            {/* The timetable lives on its own endpoint, so it is still there
                even when this aggregate is the thing that failed. */}
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-border-light dark:border-border-dark/50 text-sm font-medium text-text-primary-light dark:text-text-primary-dark hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              Go to my timetable
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { kpis, period, schedule, schemes, lessonNotes, courses, classes } =
    data;

  const taughtMinutes = doneToday.reduce(
    (total, l) => total + (toMinutes(l.end_time) - toMinutes(l.start_time)),
    0,
  );
  const remainingToday = todayLessons.filter(
    (l) => toMinutes(l.end_time) > nowMinutes,
  );
  const remainingMinutes = remainingToday.reduce(
    (total, l) =>
      total +
      (toMinutes(l.end_time) - Math.max(nowMinutes, toMinutes(l.start_time))),
    0,
  );

  // Which day the rail draws. Today, while any of it is still ahead; once the
  // last period has ended it switches to the next teaching day, because the
  // heading above it has already moved on too — a rail still showing a
  // finished Tuesday under a "Next up: Wednesday" heading reads as Wednesday's
  // and misinforms at a glance.
  const railShowsToday = remainingToday.length > 0;
  const railDayOfWeek = railShowsToday
    ? now.getDay()
    : (schedule.next_teaching_day?.day_of_week ?? now.getDay());
  const entries = railShowsToday
    ? railEntries(todayLessons, schedule.today_activities)
    : railEntries(schedule.next_teaching_day?.lessons ?? [], []);

  // Day figures for the strip under the rail — the hero card used to stretch
  // to the height of the column beside it and show nothing but empty space.
  const dayStats = railShowsToday
    ? [
        { label: "Taught", value: formatDuration(taughtMinutes) },
        {
          label: "Left today",
          value: `${remainingToday.length} ${remainingToday.length === 1 ? "period" : "periods"}`,
        },
        { label: "Time in class", value: formatDuration(remainingMinutes) },
      ]
    : schedule.next_teaching_day
      ? [
          { label: "Taught today", value: formatDuration(taughtMinutes) },
          {
            label: DAY_NAMES[schedule.next_teaching_day.day_of_week],
            value: `${schedule.next_teaching_day.lessons.length} ${schedule.next_teaching_day.lessons.length === 1 ? "lesson" : "lessons"}`,
          },
          {
            label: "Starts",
            value: hhmm(schedule.next_teaching_day.lessons[0].start_time),
          },
        ]
      : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {period.academic_term_name ? ` · ${period.academic_term_name}` : ""}
            {period.academic_year_name ? ` · ${period.academic_year_name}` : ""}
          </p>

          {/* Term progress — "how far through am I" in one glance. */}
          {termProgress && (
            <div className="mt-3 max-w-sm">
              <div className="flex items-center justify-between text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
                <span>
                  {week ? `Week ${week} of ${termProgress.totalWeeks}` : "Term"}
                </span>
                {typeof period.days_remaining_in_term === "number" &&
                  period.days_remaining_in_term >= 0 && (
                    <span>{period.days_remaining_in_term} days left</span>
                  )}
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-700"
                  style={{ width: `${termProgress.pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {loadedAt && (
            <span className="hidden sm:block text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
              Updated{" "}
              {loadedAt.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={() => load(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-border-light dark:border-border-dark/50 px-3 py-2 text-sm text-text-secondary-light dark:text-text-secondary-dark hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
            title="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <CalendarDays className="w-4 h-4" />
            My timetable
          </Link>
        </div>
      </header>

      {/* ── Alert bar: the one thing allowed to shout ───────────────────── */}
      {blocking.length > 0 && !alertDismissed && (
        <div
          role="alert"
          className="animate-slide-up motion-reduce:animate-none rounded-3xl border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-4 flex flex-wrap items-center gap-3"
        >
          <span className="relative grid place-items-center w-9 h-9 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex-shrink-0">
            <AlertOctagon className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse motion-reduce:animate-none" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
              {blocking[0].title}
              {blocking.length > 1 && (
                <span className="font-normal">
                  {" "}
                  · and {blocking.length - 1} more blocking{" "}
                  {blocking.length - 1 === 1 ? "item" : "items"}
                </span>
              )}
            </p>
            <p className="text-xs text-red-700/80 dark:text-red-300/80 truncate">
              {blocking[0].why}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={blocking[0].to}
              className="rounded-2xl bg-red-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              {blocking[0].cta}
            </Link>
            <button
              onClick={() => setAlertDismissed(true)}
              className="rounded-2xl px-3 py-2 text-sm text-red-700/80 dark:text-red-300/80 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      )}

      {/* ── Your day + Needs your attention ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 flex flex-col">
          {currentLesson ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                <Radio className="w-3.5 h-3.5" />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse motion-reduce:animate-none" />
                In class now
              </div>
              <h2 className="mt-2 text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                {currentLesson.subject_name}
              </h2>
              <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                {currentLesson.class_group_name}
                {currentLesson.location ? ` · ${currentLesson.location}` : ""}
                {` · ${hhmm(currentLesson.start_time)}–${hhmm(currentLesson.end_time)}`}
              </p>
              {(() => {
                const start = toMinutes(currentLesson.start_time);
                const end = toMinutes(currentLesson.end_time);
                const pct = Math.min(
                  100,
                  Math.max(0, ((nowMinutes - start) / (end - start)) * 100),
                );
                return (
                  <div className="mt-4">
                    <div className="h-2 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: currentLesson.color || fallbackColor,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-text-secondary-light dark:text-text-secondary-dark">
                      {formatDuration(Math.max(0, end - nowMinutes))} remaining
                      {nextLesson &&
                        ` · then ${nextLesson.subject_name} at ${hhmm(nextLesson.start_time)}`}
                    </p>
                  </div>
                );
              })()}
            </>
          ) : nextLesson ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark">
                <Clock className="w-3.5 h-3.5" /> Up next today
              </div>
              <h2 className="mt-2 text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                {nextLesson.subject_name}
              </h2>
              <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                {nextLesson.class_group_name}
                {nextLesson.location ? ` · ${nextLesson.location}` : ""} ·
                starts {hhmm(nextLesson.start_time)}
              </p>
              <p className="mt-3 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                Starts in{" "}
                <Countdown targetMinutes={toMinutes(nextLesson.start_time)} />
              </p>
            </>
          ) : schedule.next_teaching_day ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {todayLessons.length > 0
                  ? "Teaching done for today"
                  : "No lessons today"}
              </div>
              <h2 className="mt-2 text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                Next up: {DAY_NAMES[schedule.next_teaching_day.day_of_week]}
              </h2>
              <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                {schedule.next_teaching_day.lessons.length}{" "}
                {schedule.next_teaching_day.lessons.length === 1
                  ? "lesson"
                  : "lessons"}
                , first at{" "}
                {hhmm(schedule.next_teaching_day.lessons[0].start_time)}
                {todayLessons.length > 0 &&
                  ` · you taught ${formatDuration(taughtMinutes)} today`}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark">
                <CalendarDays className="w-3.5 h-3.5" /> Schedule
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary-light dark:text-text-primary-dark">
                No lessons on your timetable yet
              </h2>
              <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                Once the academic calendar for this term is published, your
                periods will appear here.
              </p>
            </>
          )}

          {/* The day drawn to scale — where the double period is, where the
              two-hour gap is, how much is left. Named by its actual weekday so
              it can never be mistaken for the day the heading talks about. */}
          {entries.length > 0 && (
            <div className="mt-5 pt-5 border-t border-border-light dark:border-border-dark/50">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark">
                {railShowsToday
                  ? `Today · ${DAY_NAMES[railDayOfWeek]}`
                  : `${DAY_NAMES[railDayOfWeek]} at a glance`}
              </p>
              <DayRail
                entries={entries}
                nowMinutes={railShowsToday ? nowMinutes : null}
              />
            </div>
          )}

          {/* Day figures, pinned to the bottom so the card fills its column
              instead of trailing off into empty space. */}
          {dayStats.length > 0 && (
            <div className="mt-auto pt-5 grid grid-cols-3 gap-3">
              {dayStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl bg-surface-light dark:bg-slate-800/40 px-3 py-2.5"
                >
                  <p className="text-[11px] uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark truncate">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-text-primary-light dark:text-text-primary-dark truncate">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Needs your attention */}
        <Card className="flex flex-col">
          <CardHeader
            icon={<AlertOctagon className="w-4 h-4" />}
            title="Needs your attention"
            subtitle={
              actionItems.length === 0
                ? "Nothing outstanding"
                : `${counts.blocking} blocking · ${counts.slipping} slipping · ${counts.tidy} to tidy`
            }
          />

          {actionItems.length > 0 && (
            <div className="px-5 pb-3 flex flex-wrap gap-1.5">
              {(["all", "blocking", "slipping", "tidy"] as const)
                .filter(
                  (key) =>
                    key === "all" ||
                    actionItems.some((i) => i.severity === key),
                )
                .map((key) => {
                  const active = severityFilter === key;
                  const count =
                    key === "all"
                      ? counts.blocking + counts.slipping + counts.tidy
                      : counts[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setSeverityFilter(key)}
                      aria-pressed={active}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        active
                          ? "bg-blue-600 text-white"
                          : key === "all"
                            ? "bg-surface-light dark:bg-surface-dark text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark"
                            : SEVERITY_STYLE[key].chip
                      }`}
                    >
                      {key === "all" ? "All" : SEVERITY_LABEL[key]} {count}
                    </button>
                  );
                })}
            </div>
          )}

          <div className="px-5 pb-5 flex-1">
            {actionItems.length === 0 ? (
              <div className="h-full grid place-items-center py-8 text-center">
                <div>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-500" />
                  <p className="mt-2 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                    You're all caught up.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleItems.map((item) => (
                  <li key={item.key}>
                    <ActionRow item={item} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatTile
          tone="blue"
          icon={<BookOpen className="w-5 h-5" />}
          label="Assigned Subjects"
          value={kpis.assignedSubjects}
          hint={`${classes.length} subject–class ${classes.length === 1 ? "pairing" : "pairings"}`}
          to="/my-subjects"
        />
        <StatTile
          tone="green"
          icon={<Users className="w-5 h-5" />}
          label="My Students"
          value={kpis.totalStudents}
          hint={`across ${kpis.assignedClassGroups} class ${kpis.assignedClassGroups === 1 ? "group" : "groups"}`}
          to="/my-students"
        />
        <StatTile
          tone="purple"
          icon={<CalendarDays className="w-5 h-5" />}
          label="Periods This Week"
          value={kpis.weeklyPeriods}
          hint={
            kpis.weeklyMinutes > 0
              ? `${formatDuration(kpis.weeklyMinutes)} of teaching`
              : undefined
          }
          to="/dashboard"
        />
        <Link
          to="/scheme-of-work"
          className="group bg-card-light dark:bg-card-dark/30 rounded-3xl border border-border-light dark:border-border-dark/50 shadow-sm p-5 flex items-center gap-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800/50"
        >
          <span className="relative flex-shrink-0">
            <ProgressRing
              value={schemes.submitted}
              total={schemes.total}
              tone={
                schemes.rejected > 0
                  ? "stroke-red-500"
                  : schemes.pending > 0
                    ? "stroke-amber-500"
                    : "stroke-green-500"
              }
            />
            <ClipboardList className="absolute inset-0 m-auto w-4 h-4 text-text-secondary-light dark:text-text-secondary-dark" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark truncate">
              Schemes Submitted
            </p>
            <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark leading-tight">
              {schemes.submitted}/{schemes.total}
            </p>
            <p
              className={`text-xs truncate ${
                schemes.rejected > 0
                  ? "text-red-600 dark:text-red-400 font-medium"
                  : "text-text-secondary-light dark:text-text-secondary-dark"
              }`}
            >
              {schemes.rejected > 0
                ? `${schemes.rejected} sent back`
                : schemes.awaiting_validation > 0
                  ? `${schemes.awaiting_validation} awaiting validation`
                  : "all validated"}
            </p>
          </div>
        </Link>
      </div>

      {/* ── Quick actions ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <QuickAction
          to="/lesson-notes"
          icon={<PenLine className="w-4 h-4" />}
          label="Write a lesson note"
        />
        <QuickAction
          to="/scheme-of-work"
          icon={<ClipboardList className="w-4 h-4" />}
          label="Scheme of work"
        />
        <QuickAction
          to="/elearning/courses"
          icon={<Sparkles className="w-4 h-4" />}
          label="Build a course"
        />
        <QuickAction
          to="/my-students"
          icon={<Users className="w-4 h-4" />}
          label="My students"
        />
        <QuickAction
          to="/reporting"
          icon={<FileEdit className="w-4 h-4" />}
          label="Reporting"
        />
      </div>

      {/* ── Analytics band ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<TrendingUp className="w-4 h-4" />}
            title="Scheme coverage vs the calendar"
            subtitle={
              week
                ? behindCount === 0
                  ? `Every class is level with week ${week}`
                  : `${behindCount} of ${coverage.length} ${behindCount === 1 ? "class is" : "classes are"} short of week ${week}`
                : "Weeks planned per class"
            }
            action={
              <Link
                to="/scheme-of-work"
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Open schemes
              </Link>
            }
          />
          <div className="px-5 pb-5">
            <CoverageChart rows={coverage} week={week} />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<BarChart3 className="w-4 h-4" />}
            title="Where your week goes"
            subtitle={`${kpis.weeklyPeriods} ${kpis.weeklyPeriods === 1 ? "period" : "periods"} across ${subjectPoints.length} ${subjectPoints.length === 1 ? "class" : "classes"}`}
          />
          <div className="px-5 pb-5">
            <SubjectLoadChart points={subjectPoints} />
          </div>
        </Card>
      </div>

      {/* ── Today + notifications ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<Clock className="w-4 h-4" />}
            title="Today's schedule"
            subtitle={`${DAY_NAMES[now.getDay()]} · ${todayLessons.length} ${
              todayLessons.length === 1 ? "lesson" : "lessons"
            }${
              schedule.today_activities.length > 0
                ? ` · ${schedule.today_activities.length} activity`
                : ""
            }`}
            action={
              <Link
                to="/dashboard"
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Full week
              </Link>
            }
          />
          <div className="px-3 pb-4">
            {todayLessons.length === 0 &&
            schedule.today_activities.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark">
                Nothing scheduled today.
              </p>
            ) : (
              <>
                {/* Finished periods collapse out of the way — what is left to
                    do matters more than what is already done. */}
                {doneToday.length > 0 && (
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    aria-expanded={showCompleted}
                    className="mx-2 mb-1 flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs text-text-secondary-light dark:text-text-secondary-dark hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${showCompleted ? "rotate-180" : ""}`}
                    />
                    {doneToday.length} completed
                  </button>
                )}
                <ul className="space-y-1">
                  {todayLessons
                    .filter((l) => showCompleted || lessonState(l) !== "done")
                    .map((lesson) => (
                      <LessonRow
                        key={lesson.slot_id}
                        lesson={lesson}
                        state={lessonState(lesson)}
                      />
                    ))}
                  {schedule.today_activities.map((activity) => (
                    <li
                      key={`activity-${activity.activity_id}`}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                    >
                      <span
                        className="w-1.5 self-stretch rounded-full flex-shrink-0"
                        style={{ backgroundColor: activity.color || "#10B981" }}
                        aria-hidden
                      />
                      <div className="w-24 flex-shrink-0 text-xs font-medium tabular-nums text-text-secondary-light dark:text-text-secondary-dark">
                        {hhmm(activity.start_time)} – {hhmm(activity.end_time)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                          {activity.activity_name}
                        </p>
                        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
                          {activity.activity_type}
                          {activity.location ? ` · ${activity.location}` : ""}
                        </p>
                      </div>
                      {activity.location && (
                        <MapPin className="w-4 h-4 flex-shrink-0 text-text-secondary-light dark:text-text-secondary-dark" />
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="border-t border-border-light dark:border-border-dark/50 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark">
              Weekly teaching load
            </p>
            <div className="mt-2">
              <WeeklyLoadChart points={loadPoints} />
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="flex flex-col">
          <CardHeader
            icon={
              <span className="relative">
                <BellRing className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 animate-pulse motion-reduce:animate-none" />
                )}
              </span>
            }
            title="Notifications"
            subtitle={unreadCount > 0 ? `${unreadCount} unread` : "Nothing new"}
            action={
              unreadCount > 0 ? (
                <button
                  onClick={() => markAllRead()}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  Mark all read
                </button>
              ) : undefined
            }
          />
          <div className="px-3 pb-4 flex-1">
            {notifications.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark">
                No notifications yet.
              </p>
            ) : (
              <ul className="space-y-1 max-h-[26rem] overflow-y-auto">
                {notifications.slice(0, 8).map(({ notification }) => {
                  const unread = !notification.read_at;
                  const body = (
                    <div
                      className={`rounded-2xl px-3 py-2.5 transition-colors ${
                        unread
                          ? "bg-blue-50/70 dark:bg-blue-900/15 hover:bg-blue-50 dark:hover:bg-blue-900/25"
                          : "hover:bg-surface-light dark:hover:bg-surface-dark"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {unread && (
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                            {notification.title}
                          </p>
                          {notification.body && (
                            <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark line-clamp-2">
                              {notification.body}
                            </p>
                          )}
                          <p className="mt-0.5 text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
                            {relativeDate(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <li key={notification.notification_id}>
                      {notification.link ? (
                        <Link
                          to={notification.link}
                          onClick={() =>
                            unread && markRead(notification.notification_id)
                          }
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() =>
                            unread && markRead(notification.notification_id)
                          }
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* ── Classes + content ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<GraduationCap className="w-4 h-4" />}
            title="My classes this term"
            subtitle={`${classes.length} subject–class ${classes.length === 1 ? "assignment" : "assignments"}`}
            action={
              <Link
                to="/my-subjects"
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                View all
              </Link>
            }
          />
          <div className="px-5 pb-5">
            {classes.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark">
                You have no subject assignments for this academic year.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {classes.map((c) => {
                  const scheme = schemes.rows.find(
                    (s) =>
                      s.subject_id === c.subject_id &&
                      s.class_group_id === c.class_group_id,
                  );
                  return (
                    <Link
                      key={`${c.subject_id}-${c.class_group_id}`}
                      to={`/subjects/${c.subject_id}`}
                      className="group relative overflow-hidden rounded-2xl border border-border-light dark:border-border-dark/50 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-surface-light dark:hover:bg-surface-dark"
                    >
                      {/* Subject colour as a spine — recognisable at a glance
                          against the timetable's own colours. */}
                      <span
                        className="absolute left-0 top-0 bottom-0 w-1"
                        style={{
                          backgroundColor: c.subject_color || fallbackColor,
                        }}
                        aria-hidden
                      />
                      <div className="pl-2 min-w-0">
                        <p className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark truncate">
                          {c.subject_name}
                        </p>
                        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark truncate">
                          {[c.grade_name, c.class_group_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-surface-light dark:bg-surface-dark px-2 py-0.5 text-[11px] text-text-secondary-light dark:text-text-secondary-dark">
                            {c.periods_per_week}{" "}
                            {c.periods_per_week === 1 ? "period" : "periods"}
                            /week
                          </span>
                          {scheme && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                scheme.status === "pending"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300"
                                  : scheme.validation_status === "APPROVED"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/25 dark:text-green-300"
                                    : scheme.validation_status === "REJECTED"
                                      ? "bg-red-100 text-red-700 dark:bg-red-900/25 dark:text-red-300"
                                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300"
                              }`}
                            >
                              {scheme.status === "pending"
                                ? "No scheme"
                                : scheme.validation_status === "APPROVED"
                                  ? "Scheme approved"
                                  : scheme.validation_status === "REJECTED"
                                    ? "Scheme rejected"
                                    : "Awaiting validation"}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={<FileEdit className="w-4 h-4" />}
              title="Lesson notes"
              subtitle={`${lessonNotes.published} published · ${lessonNotes.drafts} ${lessonNotes.drafts === 1 ? "draft" : "drafts"}`}
              action={
                <Link
                  to="/lesson-notes"
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  Open
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {lessonNotes.recent_drafts.length === 0 ? (
                <p className="py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                  No drafts waiting.
                </p>
              ) : (
                <ul className="space-y-1">
                  {lessonNotes.recent_drafts.map((note) => (
                    <li key={note.note_id}>
                      <Link
                        to={`/lesson-notes/${note.note_id}`}
                        className="block rounded-xl px-2 py-1.5 hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                      >
                        <p className="text-sm text-text-primary-light dark:text-text-primary-dark truncate">
                          {note.title}
                        </p>
                        <p className="text-[11px] text-text-secondary-light dark:text-text-secondary-dark truncate">
                          {[note.subject_name, note.class_group_name]
                            .filter(Boolean)
                            .join(" · ")}
                          {note.updated_at
                            ? ` · edited ${relativeDate(note.updated_at)}`
                            : ""}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<LayoutGrid className="w-4 h-4" />}
              title="E-learning courses"
              subtitle={`${courses.published} published · ${courses.drafts} ${courses.drafts === 1 ? "draft" : "drafts"}`}
              action={
                <Link
                  to="/elearning/courses"
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                >
                  Open
                </Link>
              }
            />
            <div className="px-5 pb-5">
              {courses.recent.length === 0 ? (
                <p className="py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark">
                  No courses built for this term yet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {courses.recent.map((course) => (
                    <li key={course.course_id}>
                      <Link
                        to={`/elearning/courses/${course.course_id}/build`}
                        className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-text-primary-light dark:text-text-primary-dark truncate">
                            {course.title}
                          </span>
                          <span className="block text-[11px] text-text-secondary-light dark:text-text-secondary-dark truncate">
                            {[course.subject_name, course.class_group_name]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            course.status === "PUBLISHED"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/25 dark:text-green-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300"
                          }`}
                        >
                          {course.status === "PUBLISHED" ? "Live" : "Draft"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
