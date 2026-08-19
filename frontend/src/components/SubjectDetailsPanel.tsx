import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  BookOpen,
  Users as UsersIcon,
  GraduationCap,
  CalendarDays,
  ClipboardCheck,
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

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const StatTile = ({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
}) => (
  <div className="flex-1 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/30 px-3 py-2.5">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      <span className="text-lg font-semibold text-blue-900 dark:text-blue-100 leading-none">
        {value}
      </span>
    </div>
    <p className="text-[11px] text-blue-700/70 dark:text-blue-300/70 mt-1">
      {label}
    </p>
  </div>
);

const Tab = ({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count?: number;
}) => (
  <button
    type="button"
    onClick={onClick}
    role="tab"
    aria-selected={active}
    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
      active
        ? "bg-blue-600 text-white"
        : "text-blue-700/70 dark:text-blue-300/70 hover:bg-blue-50 dark:hover:bg-blue-950/40"
    }`}
  >
    <Icon className="w-4 h-4" />
    {label}
    {typeof count === "number" && (
      <span
        className={`text-[11px] px-1.5 py-0.5 rounded-full ${
          active
            ? "bg-white/20"
            : "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50">
    {children}
  </span>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="text-center py-10">
    <BookOpen className="w-8 h-8 text-blue-200 dark:text-blue-900 mx-auto mb-2" />
    <p className="text-sm text-blue-900/50 dark:text-blue-100/40">{children}</p>
  </div>
);

const Skeleton = () => (
  <div className="space-y-3">
    {[...Array(4)].map((_, i) => (
      <div
        key={i}
        className="h-16 rounded-xl bg-blue-50 dark:bg-blue-950/40 animate-pulse"
      />
    ))}
  </div>
);

const SCHEME_STATUS = {
  APPROVED: {
    icon: CheckCircle2,
    className:
      "bg-blue-600 text-white",
    label: "Approved",
  },
  PENDING: {
    icon: AlertCircle,
    className:
      "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
    label: "Pending",
  },
  REJECTED: {
    icon: XCircle,
    className: "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300",
    label: "Rejected",
  },
} as const;

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type TabKey = "overview" | "teachers" | "students" | "schedule";

interface SubjectDetailsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** The card that was clicked — renders the header instantly while detail loads. */
  summary: ScopedSubject | null;
  gradeIds?: number[];
  academicYearId?: number | null;
}

const SubjectDetailsPanel: React.FC<SubjectDetailsPanelProps> = ({
  isOpen,
  onClose,
  summary,
  gradeIds,
  academicYearId,
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

    getScopedSubjectDetail(subjectId, { gradeIds, academicYearId })
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
  }, [isOpen, subjectId, academicYearId]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

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
        className="fixed inset-0 z-[60] bg-blue-950/50 backdrop-blur-sm flex justify-end"
        onClick={onClose}
      >
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${subject.name}`}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
        >
          {/* Header */}
          <header className="relative bg-gradient-to-br from-blue-600 to-indigo-700 px-5 pt-5 pb-6 text-white">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close subject details"
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-4 pr-10">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-7 h-7" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold leading-tight">
                  {subject.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-white/80">
                  {subject.code && (
                    <span className="inline-flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5" />
                      {subject.code}
                    </span>
                  )}
                  {detail?.subject?.category_name && (
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      {detail.subject.category_name}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      subject.status === "ACTIVE"
                        ? "bg-white/25"
                        : "bg-rose-500/80"
                    }`}
                  >
                    {subject.status}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Stat strip */}
          <div className="flex gap-2 px-5 -mt-3 relative z-10">
            <StatTile
              icon={GraduationCap}
              value={classGroups.length}
              label={classGroups.length === 1 ? "Class group" : "Class groups"}
            />
            <StatTile icon={UsersIcon} value={teachers.length} label="Teachers" />
            <StatTile
              icon={ClipboardCheck}
              value={detail?.students.length ?? 0}
              label="Students"
            />
          </div>

          {/* Tabs */}
          <nav
            role="tablist"
            className="flex gap-1 px-5 pt-4 pb-2 overflow-x-auto border-b border-blue-100 dark:border-blue-950/60"
          >
            <Tab
              active={tab === "overview"}
              onClick={() => setTab("overview")}
              icon={BookOpen}
              label="Overview"
            />
            <Tab
              active={tab === "teachers"}
              onClick={() => setTab("teachers")}
              icon={UsersIcon}
              label="Teachers"
              count={teachers.length}
            />
            <Tab
              active={tab === "students"}
              onClick={() => setTab("students")}
              icon={GraduationCap}
              label="Students"
              count={detail?.students.length ?? 0}
            />
            <Tab
              active={tab === "schedule"}
              onClick={() => setTab("schedule")}
              icon={CalendarDays}
              label="Schedule"
              count={detail?.schedule.length ?? 0}
            />
          </nav>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {error ? (
              <Empty>{error}</Empty>
            ) : loading && !detail ? (
              <Skeleton />
            ) : (
              <>
                {tab === "overview" && (
                  <div className="space-y-4">
                    {subject.description && (
                      <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 p-4">
                        <p className="text-[11px] uppercase tracking-wide text-blue-500 mb-1">
                          Description
                        </p>
                        <p className="text-sm text-slate-700 dark:text-slate-200">
                          {subject.description}
                        </p>
                      </div>
                    )}

                    <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 p-4">
                      <p className="text-[11px] uppercase tracking-wide text-blue-500 mb-2">
                        Runs in
                      </p>
                      {classGroups.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {classGroups.map((cg: any) => (
                            <Chip key={cg.class_group_id}>
                              {cg.grade_name ? `${cg.grade_name} · ` : ""}
                              {cg.name}
                            </Chip>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-blue-900/50 dark:text-blue-100/40 italic">
                          Not linked to any of your class groups.
                        </p>
                      )}
                    </div>

                    {/* Scheme of work is the thing a class teacher most often
                        opens a subject to check. */}
                    <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 p-4">
                      <p className="text-[11px] uppercase tracking-wide text-blue-500 mb-2">
                        Scheme of work
                      </p>
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
                                className="flex items-center gap-3 p-2.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/30"
                              >
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold ${config.className}`}
                                >
                                  <Icon className="w-3 h-3" />
                                  {config.label}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                                    {scheme.class_group_name}
                                    {scheme.term_name
                                      ? ` · ${scheme.term_name}`
                                      : ""}
                                  </p>
                                  <p className="text-xs text-blue-900/50 dark:text-blue-100/40 truncate">
                                    {scheme.teacher_name}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-blue-900/50 dark:text-blue-100/40 italic">
                          No scheme of work submitted yet.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {tab === "teachers" && (
                  <div className="space-y-2">
                    {teachers.length === 0 ? (
                      <Empty>No teacher assigned to this subject yet.</Empty>
                    ) : (
                      teachers.map((t: any) => (
                        <div
                          key={t.user_id}
                          className="flex items-start gap-3 p-3 rounded-xl border border-blue-100 dark:border-blue-900/40"
                        >
                          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {initialsOf(teacherName(t))}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {teacherName(t)}
                            </p>
                            {t.email && (
                              <a
                                href={`mailto:${t.email}`}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 truncate"
                              >
                                <Mail className="w-3 h-3" />
                                {t.email}
                              </a>
                            )}
                            {t.phone_number && (
                              <a
                                href={`tel:${t.phone_number}`}
                                className="block text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                              >
                                <Phone className="w-3 h-3" />
                                {t.phone_number}
                              </a>
                            )}
                            {t.class_groups?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {t.class_groups.map((cg: any) => (
                                  <Chip key={cg.class_group_id}>{cg.name}</Chip>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tab === "students" && (
                  <div className="space-y-2">
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                      <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Filter students..."
                        className="w-full pl-10 pr-3 py-2 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-slate-800 text-sm dark:text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    {students.length === 0 ? (
                      <Empty>
                        {studentSearch
                          ? "No student matches that filter."
                          : "No students enrolled in this subject."}
                      </Empty>
                    ) : (
                      students.map((s) => (
                        <div
                          key={`${s.user_id}-${s.class_group_id}`}
                          className="flex items-center gap-3 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/40"
                        >
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[11px] font-semibold flex-shrink-0">
                            {initialsOf(s.full_name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-900 dark:text-white truncate">
                              {s.full_name}
                            </p>
                            <p className="text-xs text-blue-900/50 dark:text-blue-100/40 truncate">
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
                    {scheduleByDay.length === 0 ? (
                      <Empty>
                        This subject is not on the timetable for your class
                        groups yet.
                      </Empty>
                    ) : (
                      scheduleByDay.map(([day, slots]) => (
                        <div key={day}>
                          <p className="text-[11px] uppercase tracking-wide text-blue-500 mb-1.5">
                            {DAY_NAMES[day] ?? `Day ${day}`}
                          </p>
                          <div className="space-y-2">
                            {slots.map((slot) => (
                              <div
                                key={slot.slot_id}
                                className="flex items-center gap-3 p-3 rounded-xl border-l-4 border-blue-600 bg-blue-50/60 dark:bg-blue-950/30"
                              >
                                <div className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 flex-shrink-0">
                                  <Clock className="w-3.5 h-3.5" />
                                  {slot.start_time}–{slot.end_time}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                                    {slot.teacher_name || "Unassigned"}
                                  </p>
                                  <p className="text-xs text-blue-900/50 dark:text-blue-100/40 truncate flex items-center gap-2">
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
              </>
            )}
          </div>

          <footer className="px-5 py-3 border-t border-blue-100 dark:border-blue-950/60">
            <p className="text-[11px] text-blue-900/40 dark:text-blue-100/30 text-center">
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
