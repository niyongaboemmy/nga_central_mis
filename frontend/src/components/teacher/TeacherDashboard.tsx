import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileEdit,
  GraduationCap,
  LayoutGrid,
  MapPin,
  Radio,
  RefreshCw,
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

// ─── Teacher Dashboard ──────────────────────────────────────────────────────
// The teacher's working board: what is happening right now, what is next, and
// what has fallen behind. The weekly timetable grid deliberately stays on the
// welcome page (`/dashboard`) — this page answers "what do I need to do",
// not "when do I teach".
//
// Everything below one `/dashboard/teacher-overview` call; the notification
// feed comes from NotificationContext, which the whole app already polls.

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "HH:MM[:SS]" -> minutes since midnight. */
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

// ─── Building blocks ────────────────────────────────────────────────────────

const Card: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className = "", children }) => (
  <section
    className={`bg-card-light dark:bg-card-dark/30 rounded-3xl border border-white dark:border-border-dark/30 shadow-sm ${className}`}
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
      <span className="flex-shrink-0 grid place-items-center w-9 h-9 rounded-2xl bg-surface-light dark:bg-surface-dark text-text-secondary-light dark:text-text-secondary-dark/70">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="font-semibold text-text-primary-light dark:text-text-primary-dark truncate">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action}
  </div>
);

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  to?: string;
  tone: "blue" | "green" | "purple" | "amber";
}> = ({ icon, label, value, hint, to, tone }) => {
  const tones = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    green:
      "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    purple:
      "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    amber:
      "bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
  } as const;

  const body = (
    <div className="flex items-center gap-4 p-5">
      <span
        className={`grid place-items-center w-11 h-11 rounded-2xl ${tones[tone]}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
          {label}
        </p>
        <p className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark leading-tight">
          {value}
        </p>
        {hint && (
          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/60 truncate">
            {hint}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Card className={to ? "transition-shadow hover:shadow-md" : ""}>
      {to ? (
        <Link to={to} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
};

const LessonRow: React.FC<{
  lesson: TeacherLesson;
  state: "done" | "now" | "upcoming";
}> = ({ lesson, state }) => {
  const color = lesson.color || fallbackColor;
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
        state === "now"
          ? "bg-surface-light dark:bg-surface-dark ring-1 ring-blue-400/50"
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
      <div className="w-24 flex-shrink-0 text-xs font-medium tabular-nums text-text-secondary-light dark:text-text-secondary-dark/70">
        {hhmm(lesson.start_time)} – {hhmm(lesson.end_time)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
          {lesson.subject_name || "Lesson"}
        </p>
        <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
          {[lesson.class_group_name, lesson.location]
            .filter(Boolean)
            .join(" · ") || "—"}
        </p>
      </div>
      {state === "now" && (
        <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-semibold text-white">
          <Radio className="w-3 h-3" /> Now
        </span>
      )}
      {state === "done" && (
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-green-500" />
      )}
    </li>
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
  const [error, setError] = useState<string | null>(null);

  const load = async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    try {
      const overview = await getTeacherOverview({
        academic_year_id: selectedYearId ?? undefined,
        academic_term_id: selectedTermId ?? undefined,
      });
      setData(overview);
      setError(null);
    } catch (err) {
      console.error("Failed to load teacher overview:", err);
      setError("We couldn't load your dashboard. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!selectedYearId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId, selectedTermId]);

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

  // The lesson happening right now (and the one after it) are re-derived on
  // the client every minute: the payload's own snapshot goes stale the moment
  // it arrives, and a teacher leaves this page open through a whole period.
  const todayLessons = data?.schedule.today ?? [];
  const currentLesson =
    todayLessons.find(
      (l) =>
        toMinutes(l.start_time) <= nowMinutes &&
        toMinutes(l.end_time) > nowMinutes,
    ) ?? null;
  const nextLesson =
    todayLessons.find((l) => toMinutes(l.start_time) > nowMinutes) ?? null;

  const lessonState = (lesson: TeacherLesson): "done" | "now" | "upcoming" => {
    if (toMinutes(lesson.end_time) <= nowMinutes) return "done";
    if (toMinutes(lesson.start_time) <= nowMinutes) return "now";
    return "upcoming";
  };

  // ── Action items: the whole point of the page ────────────────────────────
  const attention = useMemo(() => {
    if (!data)
      return [] as {
        key: string;
        tone: "danger" | "warning" | "info";
        title: string;
        detail: string;
        to: string;
        cta: string;
      }[];

    const items: {
      key: string;
      tone: "danger" | "warning" | "info";
      title: string;
      detail: string;
      to: string;
      cta: string;
    }[] = [];

    const rejected = data.schemes.rows.filter(
      (s) => s.status === "submitted" && s.validation_status === "REJECTED",
    );
    if (rejected.length > 0) {
      items.push({
        key: "schemes-rejected",
        tone: "danger",
        title: `${rejected.length} scheme${rejected.length > 1 ? "s" : ""} sent back for revision`,
        detail: rejected
          .map((s) => `${s.subject_name} · ${s.class_group_name}`)
          .join(", "),
        to: "/scheme-of-work",
        cta: "Revise",
      });
    }

    const missing = data.schemes.rows.filter((s) => s.status === "pending");
    if (missing.length > 0) {
      items.push({
        key: "schemes-missing",
        tone: "warning",
        title: `${missing.length} scheme${missing.length > 1 ? "s" : ""} of work not submitted`,
        detail: missing
          .map((s) => `${s.subject_name} · ${s.class_group_name}`)
          .join(", "),
        to: "/scheme-of-work",
        cta: "Submit",
      });
    }

    const empty = data.schemes.rows.filter(
      (s) => s.status === "submitted" && s.entries_count === 0,
    );
    if (empty.length > 0) {
      items.push({
        key: "schemes-empty",
        tone: "warning",
        title: `${empty.length} scheme${empty.length > 1 ? "s" : ""} started but still empty`,
        detail: empty
          .map((s) => `${s.subject_name} · ${s.class_group_name}`)
          .join(", "),
        to: "/scheme-of-work",
        cta: "Add weeks",
      });
    }

    if (data.lessonNotes.drafts > 0) {
      items.push({
        key: "note-drafts",
        tone: "info",
        title: `${data.lessonNotes.drafts} lesson note${data.lessonNotes.drafts > 1 ? "s" : ""} still in draft`,
        detail: data.lessonNotes.recent_drafts
          .map((n) => n.title)
          .slice(0, 3)
          .join(", "),
        to: "/lesson-notes",
        cta: "Finish",
      });
    }

    if (data.courses.drafts > 0) {
      items.push({
        key: "course-drafts",
        tone: "info",
        title: `${data.courses.drafts} e-learning course${data.courses.drafts > 1 ? "s" : ""} unpublished`,
        detail: data.courses.recent
          .filter((c) => c.status === "DRAFT")
          .map((c) => c.title)
          .slice(0, 3)
          .join(", "),
        to: "/elearning/courses",
        cta: "Publish",
      });
    }

    return items;
  }, [data]);

  const maxWeekLoad = Math.max(
    1,
    ...(data?.schedule.week_load.map((d) => d.periods) ?? [1]),
  );

  // Mon–Fri always, plus a weekend day only when something is actually
  // timetabled on it — otherwise a Saturday period would be counted in the
  // weekly total but missing from the chart that explains it.
  const weekLoadDays = (data?.schedule.week_load ?? []).filter(
    (d) => (d.day_of_week >= 1 && d.day_of_week <= 5) || d.periods > 0,
  );

  // ── Loading / error ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-10 w-72 rounded-2xl bg-surface-light dark:bg-surface-dark animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 rounded-3xl bg-surface-light dark:bg-surface-dark animate-pulse"
            />
          ))}
        </div>
        <div className="h-72 rounded-3xl bg-surface-light dark:bg-surface-dark animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          onClick={() => load()}
          className="px-4 py-2 rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const { kpis, period, schedule, schemes, lessonNotes, courses, classes } =
    data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
            {now.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {period.academic_term_name ? ` · ${period.academic_term_name}` : ""}
            {period.academic_year_name ? ` · ${period.academic_year_name}` : ""}
            {typeof period.days_remaining_in_term === "number" &&
            period.days_remaining_in_term >= 0
              ? ` · ${period.days_remaining_in_term} days left in term`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-border-light dark:border-border-dark/30 px-3 py-2 text-sm text-text-secondary-light dark:text-text-secondary-dark/70 hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
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

      {/* ── Hero: now / next + what needs attention ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Now / Up next */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="p-6">
            {currentLesson ? (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                  <Radio className="w-3.5 h-3.5" /> In class now
                </div>
                <h2 className="mt-2 text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {currentLesson.subject_name}
                </h2>
                <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
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
                    <div className="mt-5">
                      <div className="h-2 rounded-full bg-surface-light dark:bg-surface-dark overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              currentLesson.color || fallbackColor,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-text-secondary-light dark:text-text-secondary-dark/70">
                        {formatDuration(Math.max(0, end - nowMinutes))}{" "}
                        remaining
                      </p>
                    </div>
                  );
                })()}
              </>
            ) : nextLesson ? (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark/70">
                  <Clock className="w-3.5 h-3.5" /> Up next today
                </div>
                <h2 className="mt-2 text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  {nextLesson.subject_name}
                </h2>
                <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                  {nextLesson.class_group_name}
                  {nextLesson.location ? ` · ${nextLesson.location}` : ""}
                </p>
                <p className="mt-5 text-sm font-medium text-blue-600 dark:text-blue-400">
                  Starts at {hhmm(nextLesson.start_time)} — in{" "}
                  {formatDuration(
                    toMinutes(nextLesson.start_time) - nowMinutes,
                  )}
                </p>
              </>
            ) : schedule.next_teaching_day ? (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark/70">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {todayLessons.length > 0
                    ? "Teaching done for today"
                    : "No lessons today"}
                </div>
                <h2 className="mt-2 text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  Next: {DAY_NAMES[schedule.next_teaching_day.day_of_week]}
                </h2>
                <ul className="mt-4 space-y-1.5">
                  {schedule.next_teaching_day.lessons.slice(0, 3).map((l) => (
                    <li
                      key={l.slot_id}
                      className="flex items-center gap-2 text-sm text-text-secondary-light dark:text-text-secondary-dark/70"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: l.color || fallbackColor }}
                      />
                      <span className="tabular-nums">{hhmm(l.start_time)}</span>
                      <span className="truncate">
                        {l.subject_name} · {l.class_group_name}
                      </span>
                    </li>
                  ))}
                  {schedule.next_teaching_day.lessons.length > 3 && (
                    <li className="text-xs text-text-secondary-light dark:text-text-secondary-dark/60">
                      +{schedule.next_teaching_day.lessons.length - 3} more
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark/70">
                  <CalendarDays className="w-3.5 h-3.5" /> Schedule
                </div>
                <h2 className="mt-2 text-xl font-bold text-text-primary-light dark:text-text-primary-dark">
                  No lessons on your timetable yet
                </h2>
                <p className="mt-1 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                  Once the academic calendar for this term is published, your
                  periods will appear here.
                </p>
              </>
            )}
          </div>
        </Card>

        {/* Needs your attention */}
        <Card className="flex flex-col">
          <CardHeader
            icon={<AlertTriangle className="w-4 h-4" />}
            title="Needs your attention"
            subtitle={
              attention.length === 0
                ? "Nothing outstanding"
                : `${attention.length} item${attention.length > 1 ? "s" : ""}`
            }
          />
          <div className="px-5 pb-5 flex-1">
            {attention.length === 0 ? (
              <div className="h-full grid place-items-center py-6 text-center">
                <div>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-500" />
                  <p className="mt-2 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                    You're all caught up.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="space-y-2">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      className={`block rounded-2xl border p-3 transition-colors ${
                        item.tone === "danger"
                          ? "border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20"
                          : item.tone === "warning"
                            ? "border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            : "border-border-light dark:border-border-dark/30 hover:bg-surface-light dark:hover:bg-surface-dark"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
                          {item.title}
                        </p>
                        <ArrowRight className="w-4 h-4 flex-shrink-0 text-text-secondary-light dark:text-text-secondary-dark/70" />
                      </div>
                      {item.detail && (
                        <p className="mt-0.5 text-xs text-text-secondary-light dark:text-text-secondary-dark/70 line-clamp-2">
                          {item.detail}
                        </p>
                      )}
                    </Link>
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
          to="/my-subjects"
        />
        <StatTile
          tone="green"
          icon={<Users className="w-5 h-5" />}
          label="My Students"
          value={kpis.totalStudents}
          hint={`across ${kpis.assignedClassGroups} class group${kpis.assignedClassGroups === 1 ? "" : "s"}`}
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
        <StatTile
          tone="amber"
          icon={<ClipboardList className="w-5 h-5" />}
          label="Schemes Submitted"
          value={`${schemes.submitted}/${schemes.total}`}
          hint={
            schemes.rejected > 0
              ? `${schemes.rejected} sent back`
              : schemes.awaiting_validation > 0
                ? `${schemes.awaiting_validation} awaiting validation`
                : "all validated"
          }
          to="/scheme-of-work"
        />
      </div>

      {/* ── Today + notifications ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<Clock className="w-4 h-4" />}
            title="Today's schedule"
            subtitle={`${DAY_NAMES[now.getDay()]} · ${todayLessons.length} lesson${todayLessons.length === 1 ? "" : "s"}${
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
              <p className="px-2 py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                Nothing scheduled today.
              </p>
            ) : (
              <ul className="space-y-1">
                {todayLessons.map((lesson) => (
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
                    <div className="w-24 flex-shrink-0 text-xs font-medium tabular-nums text-text-secondary-light dark:text-text-secondary-dark/70">
                      {hhmm(activity.start_time)} – {hhmm(activity.end_time)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark truncate">
                        {activity.activity_name}
                      </p>
                      <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
                        {activity.activity_type}
                        {activity.location ? ` · ${activity.location}` : ""}
                      </p>
                    </div>
                    {activity.location && (
                      <MapPin className="w-4 h-4 flex-shrink-0 text-text-secondary-light dark:text-text-secondary-dark/50" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Weekly teaching load */}
          <div className="border-t border-border-light dark:border-border-dark/30 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary-light dark:text-text-secondary-dark/70">
              Weekly teaching load
            </p>
            <div className="mt-3 flex items-end gap-2">
              {weekLoadDays.map((d) => (
                <div key={d.day_of_week} className="flex-1 text-center">
                  <div className="h-16 flex items-end">
                    <div
                      className={`w-full rounded-t-lg transition-all ${
                        d.day_of_week === now.getDay()
                          ? "bg-blue-600"
                          : "bg-blue-200 dark:bg-blue-900/40"
                      }`}
                      style={{
                        height: `${Math.max(6, (d.periods / maxWeekLoad) * 100)}%`,
                      }}
                      title={`${d.periods} period${d.periods === 1 ? "" : "s"}`}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-text-secondary-light dark:text-text-secondary-dark/70">
                    {DAY_SHORT[d.day_of_week]}
                  </p>
                  <p className="text-[11px] font-semibold text-text-primary-light dark:text-text-primary-dark">
                    {d.periods}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="flex flex-col">
          <CardHeader
            icon={<BellRing className="w-4 h-4" />}
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
              <p className="px-2 py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
                No notifications yet.
              </p>
            ) : (
              <ul className="space-y-1 max-h-96 overflow-y-auto">
                {notifications.slice(0, 8).map(({ notification }) => {
                  const unread = !notification.read_at;
                  const body = (
                    <div
                      className={`rounded-2xl px-3 py-2.5 transition-colors ${
                        unread
                          ? "bg-blue-50/70 dark:bg-blue-900/15"
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
                            <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 line-clamp-2">
                              {notification.body}
                            </p>
                          )}
                          <p className="mt-0.5 text-[11px] text-text-secondary-light dark:text-text-secondary-dark/60">
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

      {/* ── Classes + scheme status + content ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My classes */}
        <Card className="lg:col-span-2">
          <CardHeader
            icon={<GraduationCap className="w-4 h-4" />}
            title="My classes this term"
            subtitle={`${classes.length} subject–class assignment${classes.length === 1 ? "" : "s"}`}
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
              <p className="py-8 text-center text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
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
                      className="group rounded-2xl border border-border-light dark:border-border-dark/30 p-4 hover:bg-surface-light dark:hover:bg-surface-dark transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: c.subject_color || fallbackColor,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text-primary-light dark:text-text-primary-dark truncate">
                            {c.subject_name}
                          </p>
                          <p className="text-xs text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
                            {[c.grade_name, c.class_group_name]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-surface-light dark:bg-surface-dark px-2 py-0.5 text-[11px] text-text-secondary-light dark:text-text-secondary-dark/70">
                              {c.periods_per_week} period
                              {c.periods_per_week === 1 ? "" : "s"}/week
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
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Content workspace */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={<FileEdit className="w-4 h-4" />}
              title="Lesson notes"
              subtitle={`${lessonNotes.published} published · ${lessonNotes.drafts} draft${lessonNotes.drafts === 1 ? "" : "s"}`}
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
                <p className="py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
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
                        <p className="text-[11px] text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
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
              subtitle={`${courses.published} published · ${courses.drafts} draft${courses.drafts === 1 ? "" : "s"}`}
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
                <p className="py-3 text-sm text-text-secondary-light dark:text-text-secondary-dark/70">
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
                          <span className="block text-[11px] text-text-secondary-light dark:text-text-secondary-dark/70 truncate">
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
