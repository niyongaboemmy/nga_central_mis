import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  BookOpen,
  Users as UsersIcon,
  GraduationCap,
  CalendarDays,
  Mail,
  Phone,
  Search,
  Layers,
  Clock,
  MapPin,
  Hash,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Timer,
} from "lucide-react";
import {
  getScopedSubjectDetail,
  SubjectDetail,
  ScopedSubject,
} from "../api/users";
import { useToast } from "../contexts/ToastContext";

/**
 * Read-only detail for one subject, opened from a Class Subjects card.
 *
 * Everything shown is already narrowed to the caller's own class groups by the
 * server, so two class teachers legitimately see different rosters and
 * different timetable rows for the same subject.
 */

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const teacherName = (t: {
  first_name?: string | null;
  last_name?: string | null;
  username: string | null;
}) =>
  `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() || t.username || "Unknown";

/** "09:00"–"09:50" → 50. Returns 0 for anything unparseable. */
const minutesBetween = (start: string, end: string) => {
  const toMinutes = (t: string) => {
    const [h, m] = (t ?? "").split(":").map((n) => parseInt(n, 10));
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const diff = toMinutes(end) - toMinutes(start);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
};

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

type TabKey = "overview" | "teachers" | "students" | "schedule";

/**
 * Stat tiles double as navigation — reading "18 students" and having to hunt
 * for the tab that lists them is a wasted click.
 */
const StatTile = ({
  icon: Icon,
  value,
  label,
  onClick,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`${value} ${label}`}
    className="flex-1 min-w-[5.5rem] text-left rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 px-3 py-2.5 shadow-sm hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md hover:-translate-y-0.5 transition-all"
  >
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
      <span className="text-lg font-bold text-gray-900 dark:text-white leading-none tabular-nums">
        {value}
      </span>
    </div>
    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1 truncate">
      {label}
    </p>
  </button>
);

const Chip = ({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: React.ElementType;
}) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700/40">
    {Icon && <Icon className="w-3 h-3" />}
    {children}
  </span>
);

const Card = ({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 p-4">
    {title && (
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {title}
      </p>
    )}
    {children}
  </section>
);

const Empty = ({
  icon: Icon = BookOpen,
  children,
}: {
  icon?: React.ElementType;
  children: React.ReactNode;
}) => (
  <div className="text-center py-12 px-6">
    <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800/60 flex items-center justify-center mx-auto mb-3">
      <Icon className="w-6 h-6 text-gray-400 dark:text-gray-500" />
    </div>
    <p className="text-sm text-gray-500 dark:text-gray-400">{children}</p>
  </div>
);

const Skeleton = () => (
  <div className="space-y-3" aria-hidden="true">
    {[...Array(4)].map((_, i) => (
      <div
        key={i}
        className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800/50 animate-pulse"
      />
    ))}
  </div>
);

const SCHEME_STATUS = {
  APPROVED: {
    icon: CheckCircle2,
    pill: "bg-green-600 text-white",
    rail: "border-green-500",
    label: "Approved",
  },
  PENDING: {
    icon: AlertCircle,
    pill: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    rail: "border-amber-400",
    label: "Pending",
  },
  REJECTED: {
    icon: XCircle,
    pill: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300",
    rail: "border-rose-400",
    label: "Rejected",
  },
} as const;

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface SubjectDetailsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** The card that was clicked — renders the header instantly while detail loads. */
  summary: ScopedSubject | null;
  gradeIds?: number[];
  academicYearId?: number | null;
  /** Label for the selected period, shown so an empty timetable is unambiguous. */
  periodLabel?: string | null;
  /** Selected term from the top bar — the timetable and scheme are per-term. */
  academicTermId?: number | null;
}

const SubjectDetailsPanel: React.FC<SubjectDetailsPanelProps> = ({
  isOpen,
  onClose,
  summary,
  gradeIds,
  academicYearId,
  academicTermId,
  periodLabel,
}) => {
  const { showToast } = useToast();
  const [detail, setDetail] = React.useState<SubjectDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<TabKey>("overview");
  const [studentSearch, setStudentSearch] = React.useState("");

  const subjectId = summary?.subject_id ?? null;

  React.useEffect(() => {
    if (!isOpen || !subjectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setTab("overview");
    setStudentSearch("");

    getScopedSubjectDetail(subjectId, {
      gradeIds,
      academicYearId,
      academicTermId,
    })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message =
          err?.response?.status === 403
            ? "This subject is outside your assigned grades."
            : err?.message || "Failed to load subject details";
        setError(message);
        showToast(message, "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, subjectId, academicYearId, academicTermId]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // The drawer overlays the page, so the page behind it must not scroll with it.
  React.useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const students = React.useMemo(() => {
    const all = detail?.students ?? [];
    const needle = studentSearch.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (s) =>
        s.full_name.toLowerCase().includes(needle) ||
        (s.email ?? "").toLowerCase().includes(needle) ||
        (s.class_group_name ?? "").toLowerCase().includes(needle),
    );
  }, [detail?.students, studentSearch]);

  // Timetable rows read best grouped by weekday rather than as a flat list.
  const scheduleByDay = React.useMemo(() => {
    const groups = new Map<number, SubjectDetail["schedule"]>();
    for (const slot of detail?.schedule ?? []) {
      const list = groups.get(slot.day_of_week) ?? [];
      list.push(slot);
      groups.set(slot.day_of_week, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [detail?.schedule]);

  const weeklyMinutes = React.useMemo(
    () =>
      (detail?.schedule ?? []).reduce(
        (sum, slot) => sum + minutesBetween(slot.start_time, slot.end_time),
        0,
      ),
    [detail?.schedule],
  );

  const TABS: { key: TabKey; label: string; icon: React.ElementType; count?: number }[] =
    [
      { key: "overview", label: "Overview", icon: BookOpen },
      {
        key: "teachers",
        label: "Teachers",
        icon: UsersIcon,
        count: detail?.teachers.length ?? summary?.teachers?.length ?? 0,
      },
      {
        key: "students",
        label: "Students",
        icon: GraduationCap,
        count: detail?.students.length ?? 0,
      },
      {
        key: "schedule",
        label: "Schedule",
        icon: CalendarDays,
        count: detail?.schedule.length ?? 0,
      },
    ];

  // Arrow keys move between tabs, the way a real tablist behaves.
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const index = TABS.findIndex((t) => t.key === tab);
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : (index - 1 + TABS.length) % TABS.length;
    setTab(TABS[next].key);
  };

  if (!isOpen || !summary) return null;

  const subject = detail?.subject ?? summary;
  const teachers = detail?.teachers ?? summary.teachers ?? [];
  const classGroups = detail?.classGroups ?? summary.class_groups ?? [];

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-gray-900/70 dark:bg-black/70 backdrop-blur-sm flex justify-end"
        onClick={onClose}
      >
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${subject.name}`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-lg lg:max-w-xl h-full bg-gray-50 dark:bg-gray-900 shadow-2xl flex flex-col sm:rounded-l-3xl overflow-hidden"
        >
          {/* Header */}
          {/* Header sits on the panel's own surface rather than a saturated
              blue block -- the accent is carried by the icon tile alone, so
              the colour marks the subject instead of flooding the drawer. */}
          <header className="relative bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700/40 px-5 pt-5 pb-4 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close subject details"
              className="absolute top-5 right-5 p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3.5 pr-12">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-6 h-6" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 className="text-lg sm:text-xl font-bold leading-snug break-words text-gray-900 dark:text-white">
                  {subject.name}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {subject.code && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Hash className="w-3 h-3" />
                      {subject.code}
                    </span>
                  )}
                  {detail?.subject?.category_name && (
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      {detail.subject.category_name}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                      subject.status === "ACTIVE"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                    }`}
                  >
                    {subject.status}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Stat strip — tiles jump to their tab */}
          <div className="flex flex-wrap gap-2 px-4 sm:px-5 mt-3 flex-shrink-0">
            <StatTile
              icon={Layers}
              value={classGroups.length}
              label={classGroups.length === 1 ? "Class group" : "Class groups"}
              onClick={() => setTab("overview")}
            />
            <StatTile
              icon={UsersIcon}
              value={teachers.length}
              label="Teachers"
              onClick={() => setTab("teachers")}
            />
            <StatTile
              icon={GraduationCap}
              value={detail?.students.length ?? 0}
              label="Students"
              onClick={() => setTab("students")}
            />
          </div>

          {/* Tabs — a 4-column grid so every tab is reachable without the row
              scrolling sideways and clipping the first one. */}
          <nav
            role="tablist"
            aria-label="Subject sections"
            onKeyDown={onTabKeyDown}
            className="grid grid-cols-4 gap-1 mx-4 sm:mx-5 mt-3 p-1 rounded-2xl bg-gray-100 dark:bg-gray-800/50 flex-shrink-0"
          >
            {TABS.map(({ key, label, icon: Icon, count }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={label}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(key)}
                  className="relative flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-xl transition-colors"
                >
                  {active && (
                    <motion.span
                      layoutId="subject-tab-pill"
                      className="absolute inset-0 rounded-xl bg-blue-600 shadow-sm"
                      transition={{ type: "spring", damping: 30, stiffness: 400 }}
                    />
                  )}
                  <span
                    className={`relative flex items-center gap-1 ${
                      active
                        ? "text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {typeof count === "number" && count > 0 && (
                      <span
                        className={`text-[10px] font-bold tabular-nums px-1.5 rounded-full ${
                          active
                            ? "bg-white/25"
                            : "bg-gray-200 dark:bg-gray-700/60"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  <span
                    className={`relative text-[11px] font-semibold ${
                      active
                        ? "text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
            {error ? (
              <Empty icon={XCircle}>{error}</Empty>
            ) : loading && !detail ? (
              <Skeleton />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  role="tabpanel"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {tab === "overview" && (
                    <div className="space-y-3">
                      {subject.description && (
                        <Card title="Description">
                          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                            {subject.description}
                          </p>
                        </Card>
                      )}

                      <Card title="Runs in">
                        {classGroups.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {classGroups.map((cg: any) => (
                              <Chip key={cg.class_group_id} icon={Layers}>
                                {cg.grade_name ? `${cg.grade_name} · ` : ""}
                                {cg.name}
                              </Chip>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                            Not linked to any of your class groups.
                          </p>
                        )}
                      </Card>

                      {weeklyMinutes > 0 && (
                        <Card title="Weekly load">
                          <div className="flex items-center gap-4">
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                              <CalendarDays className="w-4 h-4 text-gray-400" />
                              {detail?.schedule.length}{" "}
                              {detail?.schedule.length === 1
                                ? "period"
                                : "periods"}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                              <Timer className="w-4 h-4 text-gray-400" />
                              {Math.floor(weeklyMinutes / 60)}h{" "}
                              {weeklyMinutes % 60}m
                            </span>
                          </div>
                        </Card>
                      )}

                      {/* Scheme of work is the thing a class teacher most often
                          opens a subject to check. */}
                      <Card title="Scheme of work">
                        {detail && detail.schemes.length > 0 ? (
                          <div className="space-y-2">
                            {detail.schemes.map((scheme) => {
                              const config =
                                SCHEME_STATUS[scheme.validation_status] ??
                                SCHEME_STATUS.PENDING;
                              const Icon = config.icon;
                              return (
                                <div
                                  key={scheme.scheme_id}
                                  className={`flex items-center gap-3 p-2.5 rounded-xl border-l-4 ${config.rail} bg-gray-50 dark:bg-gray-800/40`}
                                >
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold flex-shrink-0 ${config.pill}`}
                                  >
                                    <Icon className="w-3 h-3" />
                                    {config.label}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-sm text-gray-800 dark:text-gray-100 truncate">
                                      {scheme.class_group_name}
                                      {scheme.term_name
                                        ? ` · ${scheme.term_name}`
                                        : ""}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {scheme.teacher_name}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                            No scheme of work submitted yet.
                          </p>
                        )}
                      </Card>
                    </div>
                  )}

                  {tab === "teachers" && (
                    <div className="space-y-2">
                      {teachers.length === 0 ? (
                        <Empty icon={UsersIcon}>
                          No teacher assigned to this subject yet.
                        </Empty>
                      ) : (
                        teachers.map((t: any) => (
                          <div
                            key={t.user_id}
                            className="flex items-start gap-3 p-3 rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {initialsOf(teacherName(t))}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">
                                {teacherName(t)}
                              </p>
                              {t.class_groups?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {t.class_groups.map((cg: any) => (
                                    <Chip key={cg.class_group_id}>
                                      {cg.name}
                                    </Chip>
                                  ))}
                                </div>
                              )}
                              {/* Tap targets rather than plain text — the panel
                                  is used on a phone as often as a laptop. */}
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {t.email && (
                                  <a
                                    href={`mailto:${t.email}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-colors max-w-full"
                                  >
                                    <Mail className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{t.email}</span>
                                  </a>
                                )}
                                {t.phone_number && (
                                  <a
                                    href={`tel:${t.phone_number}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gray-100 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60 transition-colors"
                                  >
                                    <Phone className="w-3 h-3" />
                                    {t.phone_number}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {tab === "students" && (
                    <div className="space-y-2">
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          placeholder="Filter students..."
                          className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 text-sm dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-shadow"
                        />
                      </div>
                      {students.length === 0 ? (
                        <Empty icon={GraduationCap}>
                          {studentSearch
                            ? "No student matches that filter."
                            : "No students enrolled in this subject."}
                        </Empty>
                      ) : (
                        students.map((s, i) => (
                          <div
                            key={`${s.user_id}-${s.class_group_id}`}
                            className="flex items-center gap-3 p-2.5 rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                          >
                            <span className="w-6 text-[11px] font-semibold text-gray-400 tabular-nums text-right flex-shrink-0">
                              {i + 1}
                            </span>
                            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                              {initialsOf(s.full_name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {s.full_name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {s.email}
                              </p>
                            </div>
                            {s.class_group_name && (
                              <Chip>{s.class_group_name}</Chip>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {tab === "schedule" && (
                    <div className="space-y-4">
                      {periodLabel && scheduleByDay.length > 0 && (
                        <p className="text-[11px] text-gray-400 font-medium">
                          Showing {periodLabel}
                        </p>
                      )}
                      {scheduleByDay.length === 0 ? (
                        <Empty icon={CalendarDays}>
                          Not on the timetable for your class groups
                          {periodLabel ? ` in ${periodLabel}` : ""} yet.
                        </Empty>
                      ) : (
                        scheduleByDay.map(([day, slots]) => (
                          <div key={day}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {DAY_NAMES[day] ?? `Day ${day}`}
                              </span>
                              <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700/50" />
                              <span className="text-[11px] text-gray-400 tabular-nums">
                                {slots.length}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {slots.map((slot) => (
                                <div
                                  key={slot.slot_id}
                                  className="flex items-start gap-3 p-3 rounded-2xl border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-800/30 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                                >
                                  <div className="flex flex-col items-center flex-shrink-0">
                                    <span className="text-sm font-bold text-gray-600 dark:text-gray-300 tabular-nums whitespace-nowrap">
                                      {slot.start_time}–{slot.end_time}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                                      <Clock className="w-2.5 h-2.5" />
                                      {minutesBetween(
                                        slot.start_time,
                                        slot.end_time,
                                      )}
                                      m
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                      {slot.teacher_name || "Unassigned"}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-2 flex-wrap">
                                      {slot.class_group_name}
                                      {slot.location && (
                                        <span className="inline-flex items-center gap-1">
                                          <MapPin className="w-3 h-3" />
                                          {slot.location}
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          <footer className="px-5 py-3 border-t border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-900/60 flex-shrink-0">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
              Read-only view, scoped to your assigned grades.
            </p>
          </footer>
        </motion.aside>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
};

export default SubjectDetailsPanel;
