import React, { useEffect, useMemo, useState } from "react";
import {
  Send,
  MessageCircle,
  Heart,
  BookOpen,
  AlertTriangle,
  CalendarCheck,
  Activity,
  Flag,
  Users,
  MoreHorizontal,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock3,
  UserCircle2,
  Mail,
  ShieldAlert,
  CalendarClock,
  ClipboardList,
  BarChart3,
  Tag,
  PenSquare,
  ChevronDown,
  Check,
  Search,
  Phone,
} from "lucide-react";
import { mentorshipApi, MenteeCheckInRecord, CheckInCategory, ValidationStatus, MyMentorInfo } from "../../api/mentorship";
import { studentEnrollmentApi, StudentEnrolledSubject } from "../../api/academics";
import { useToast } from "../../contexts/ToastContext";
import { useUser } from "../../contexts/UserContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import SelectField from "../ui/SelectField";

interface CategoryDef {
  value: CheckInCategory;
  label: string;
  icon: React.ReactNode;
  // Unselected pill — tinted background, same light/dark tint language used
  // by every other badge in this app (bg-{color}-50/dark:bg-{color}-900/20 +
  // text-{color}-600/dark:text-{color}-400) so the picker and the resulting
  // history badge always read as the same color for the same category.
  tint: string;
  // Selected pill — solid saturated background + white text + matching ring.
  solid: string;
  ring: string;
}

const CATEGORIES: CategoryDef[] = [
  { value: "GENERAL", label: "General", icon: <MessageCircle className="w-4 h-4" />,
    tint: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
    solid: "bg-gray-600 dark:bg-gray-500", ring: "ring-gray-400/50" },
  { value: "APPRECIATION", label: "Appreciation", icon: <Heart className="w-4 h-4" />,
    tint: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    solid: "bg-green-600", ring: "ring-green-400/50" },
  { value: "ACADEMIC", label: "Academic", icon: <BookOpen className="w-4 h-4" />,
    tint: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    solid: "bg-blue-600", ring: "ring-blue-400/50" },
  { value: "BEHAVIORAL", label: "Behavioral", icon: <AlertTriangle className="w-4 h-4" />,
    tint: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400",
    solid: "bg-orange-600", ring: "ring-orange-400/50" },
  { value: "ATTENDANCE", label: "Attendance", icon: <CalendarCheck className="w-4 h-4" />,
    tint: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400",
    solid: "bg-cyan-600", ring: "ring-cyan-400/50" },
  { value: "WELLBEING", label: "Wellbeing", icon: <Activity className="w-4 h-4" />,
    tint: "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    solid: "bg-purple-600", ring: "ring-purple-400/50" },
  { value: "CONCERN", label: "Concern", icon: <Flag className="w-4 h-4" />,
    tint: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    solid: "bg-red-600", ring: "ring-red-400/50" },
  { value: "REQUEST_MEETING", label: "Request a Meeting", icon: <Users className="w-4 h-4" />,
    tint: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    solid: "bg-amber-600", ring: "ring-amber-400/50" },
  { value: "OTHER", label: "Other", icon: <MoreHorizontal className="w-4 h-4" />,
    tint: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
    solid: "bg-slate-600", ring: "ring-slate-400/50" },
];

// Derived from CATEGORIES so the "Your reports" badges always match the
// picker's colors exactly — one color source of truth per category.
const CATEGORY_META: Record<CheckInCategory, { label: string; className: string }> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.value]: { label: c.label, className: c.tint } }),
  {} as Record<CheckInCategory, { label: string; className: string }>,
);

const VALIDATION_BADGE: Record<ValidationStatus, { label: string; className: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "Pending review",
    className: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    icon: <Clock3 className="w-3 h-3" />,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    icon: <XCircle className="w-3 h-3" />,
  },
};

type FilterTab = "ALL" | ValidationStatus;
type PageTab = "MENTOR" | "REPORT" | "HISTORY";

// Poll for updates every 45s so an approval/rejection the mentor makes
// elsewhere shows up here without a manual page reload — the same
// badge-refresh convention already used by MentoringHub.tsx's unread count,
// since this codebase has no push/websocket notification infrastructure.
const POLL_INTERVAL_MS = 45_000;
const MESSAGE_MAX_LENGTH = 2000;

const initialsOf = (name: string | null | undefined) => {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
};

const ROLE_LABELS: Record<string, string> = {
  TEACHER: "Teacher",
  STAFF: "Staff",
  ADMIN: "Administration",
  PARENT: "Parent",
};
const roleLabel = (role: string) => ROLE_LABELS[role] ?? role.charAt(0) + role.slice(1).toLowerCase();

const formatDay = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

const QUICK_ACTIONS: { category: CheckInCategory; label: string; icon: React.ReactNode; className: string }[] = [
  { category: "GENERAL", label: "Send a message", icon: <MessageCircle className="w-4 h-4" />, className: "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" },
  { category: "CONCERN", label: "Raise a concern", icon: <Flag className="w-4 h-4" />, className: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30" },
  { category: "REQUEST_MEETING", label: "Request a meeting", icon: <Users className="w-4 h-4" />, className: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30" },
];

const MyMentor: React.FC = () => {
  const { showToast } = useToast();
  const { user } = useUser();
  const { years, selectedYearId, selectedYear } = useAcademicPeriod();
  // Mentor assignment is year-scoped (migration 047) — which mentor is shown,
  // which subjects are offered, and which mentor a new report is filed
  // against all follow the academic year the student has selected via the
  // top-nav period selector, falling back to the year flagged `is_current`
  // while that selection is still loading.
  const currentAcademicYearId = selectedYearId ?? years.find((y) => y.is_current)?.academic_year_id ?? null;

  const [activeTab, setActiveTab] = useState<PageTab>("MENTOR");
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const categoryMenuRef = React.useRef<HTMLDivElement>(null);
  const categorySearchRef = React.useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<MenteeCheckInRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");

  const [mentor, setMentor] = useState<MyMentorInfo | null>(null);
  const [mentorLoading, setMentorLoading] = useState(true);

  const [subjects, setSubjects] = useState<StudentEnrolledSubject[]>([]);

  const [category, setCategory] = useState<CheckInCategory>("GENERAL");
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await mentorshipApi.getMyCheckIns();
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      if (!silent) showToast("Failed to load your report history", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMentor = async (academicYearId: number | null) => {
    setMentorLoading(true);
    try {
      const res = await mentorshipApi.getMyMentor(academicYearId ?? undefined);
      setMentor((res as any).data?.data ?? null);
    } catch {
      setMentor(null);
      showToast("Failed to load your mentor information", "error");
    } finally {
      setMentorLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch the assigned mentor whenever the student switches academic year
  // in the top-nav period selector — mentor assignments are year-scoped, so
  // a different year can mean a different mentor (or none at all).
  useEffect(() => {
    loadMentor(currentAcademicYearId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAcademicYearId]);

  const studentUserId = user?.user.user_id;

  useEffect(() => {
    if (!studentUserId || !currentAcademicYearId) return;
    studentEnrollmentApi
      .getEnrolledSubjects(studentUserId, currentAcademicYearId)
      .then((res) => setSubjects((res as any).data?.data ?? []))
      .catch(() => {
        setSubjects([]);
        showToast("Failed to load your enrolled subjects", "error");
      });
  }, [studentUserId, currentAcademicYearId]);

  useEffect(() => {
    if (!categoryMenuOpen) {
      setCategorySearch("");
      return;
    }
    categorySearchRef.current?.focus();
    const onClickOutside = (e: MouseEvent) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
        setCategoryMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [categoryMenuOpen]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  }, [categorySearch]);

  const handleSubmit = async () => {
    if (!message.trim()) {
      showToast("Write a message before submitting", "error");
      return;
    }
    if (!mentor) {
      showToast("You don't have an assigned mentor yet", "error");
      return;
    }
    setSubmitting(true);
    try {
      await mentorshipApi.submitCheckIn({
        category,
        title: title.trim() || undefined,
        subject_id: subjectId ? parseInt(subjectId, 10) : undefined,
        academic_year_id: currentAcademicYearId ?? undefined,
        message: message.trim(),
      });
      showToast("Report sent to your mentor", "success");
      setMessage("");
      setTitle("");
      setSubjectId("");
      setCategory("GENERAL");
      load();
      setActiveTab("HISTORY");
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? "Failed to submit", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAction = (cat: CheckInCategory) => {
    setCategory(cat);
    setActiveTab("REPORT");
  };

  const selectedCategoryDef = CATEGORIES.find((c) => c.value === category) ?? CATEGORIES[0];

  const pendingCount = history.filter((h) => h.validation_status === "PENDING").length;
  const approvedCount = history.filter((h) => h.validation_status === "APPROVED").length;

  const filteredHistory = useMemo(() => {
    if (filterTab === "ALL") return history;
    return history.filter((h) => h.validation_status === filterTab);
  }, [history, filterTab]);

  const filterTabs: { value: FilterTab; label: string; count: number }[] = [
    { value: "ALL", label: "All", count: history.length },
    { value: "PENDING", label: "Pending", count: pendingCount },
    { value: "APPROVED", label: "Approved", count: approvedCount },
    { value: "REJECTED", label: "Rejected", count: history.filter((h) => h.validation_status === "REJECTED").length },
  ];

  const pageTabs: { value: PageTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { value: "MENTOR", label: "My Mentor", icon: <UserCircle2 className="w-4 h-4" /> },
    { value: "REPORT", label: "Reporting", icon: <Send className="w-4 h-4" /> },
    { value: "HISTORY", label: "My Reports", icon: <ClipboardList className="w-4 h-4" />, badge: pendingCount || undefined },
  ];

  return (
    <div className="flex flex-col h-full space-y-5 animate-in fade-in duration-500 p-3 md:p-6 max-w-6xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-500" />
            My Mentor
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Stay connected with your assigned mentor — send reports, comments, and meeting requests for review.
          </p>
        </div>
        {/* Mentor assignments are scoped per academic year — highlight which
            year's mentor/report context is currently active, since it follows
            the top-nav period selector rather than always the latest year. */}
        {selectedYear && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 px-3 py-1.5 rounded-full shrink-0">
            <CalendarClock className="w-3.5 h-3.5" />
            {selectedYear.name}
          </span>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800/60 rounded-full p-1 w-full sm:w-fit">
        {pageTabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setActiveTab(t.value)}
            className={`relative flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all border ${
              activeTab === t.value
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm border-blue-500/60 dark:border-blue-400/60"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {t.icon}
            {t.label}
            {!!t.badge && (
              <span className="ml-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── My Mentor tab ─────────────────────────────────────────── */}
      {activeTab === "MENTOR" && (
        <div className="space-y-4">
          {mentorLoading ? (
            <div className="flex items-center gap-3 bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20 shadow-sm animate-pulse">
              <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="space-y-2 flex-1">
                <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-2.5 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ) : mentor ? (
            <>
              <section
                aria-label="Your mentor"
                className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/10 dark:to-gray-800/30 rounded-2xl p-5 border border-blue-100 dark:border-blue-900/20 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
                    {initialsOf(mentor.mentor_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-blue-600 dark:text-blue-400">
                      Your mentor{selectedYear?.name ? ` · ${selectedYear.name}` : ""}
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                      {mentor.mentor_name ?? "Assigned Mentor"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {mentor.mentor_role && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                          {roleLabel(mentor.mentor_role)}
                        </span>
                      )}
                      {(mentor.teaches_you ?? []).map((subject) => (
                        <span
                          key={subject}
                          className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                          title="This mentor also teaches you this subject"
                        >
                          Teaches you {subject}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600 dark:text-gray-300">
                      {mentor.mentor_email && (
                        <a href={`mailto:${mentor.mentor_email}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 min-w-0">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{mentor.mentor_email}</span>
                        </a>
                      )}
                      {mentor.mentor_phone && (
                        <a href={`tel:${mentor.mentor_phone}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          {mentor.mentor_phone}
                        </a>
                      )}
                      {mentor.assigned_at && (
                        <span className="flex items-center gap-1">
                          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                          Your mentor since {formatDay(mentor.assigned_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-gray-800/30 rounded-xl p-3 border border-gray-100 dark:border-gray-700/20 text-center">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{mentor.session_count ?? 0}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Sessions held</p>
                </div>
                <div className="bg-white dark:bg-gray-800/30 rounded-xl p-3 border border-gray-100 dark:border-gray-700/20 text-center">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {mentor.last_session_date ? formatDay(mentor.last_session_date) : "—"}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {mentor.last_session_date ? "Last met" : "Not met yet"}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800/30 rounded-xl p-3 border border-gray-100 dark:border-gray-700/20 text-center">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{history.length}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Reports sent</p>
                </div>
                <div className="bg-white dark:bg-gray-800/30 rounded-xl p-3 border border-gray-100 dark:border-gray-700/20 text-center">
                  <p className="text-lg font-bold text-amber-500">{pendingCount}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">Pending review</p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">Quick actions</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.category}
                      onClick={() => handleQuickAction(a.category)}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-full text-sm font-semibold transition-colors ${a.className}`}
                    >
                      {a.icon}
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 border border-amber-100 dark:border-amber-900/20">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">No mentor assigned yet</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                  You don't have an active mentor for {selectedYear?.name ?? "this academic year"}. Contact your school administrator to get one assigned.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reporting tab ─────────────────────────────────────────── */}
      {activeTab === "REPORT" && (
        <div className="space-y-4">
          {!mentor && !mentorLoading && (
            <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 border border-amber-100 dark:border-amber-900/20">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
                You don't have an active mentor for {selectedYear?.name ?? "this academic year"}, so reports can't be submitted yet. Contact your school administrator.
              </p>
            </div>
          )}
          <div className={`bg-white dark:bg-gray-800/30 rounded-2xl border border-gray-100 dark:border-gray-700/20 shadow-sm overflow-hidden ${!mentor ? "opacity-60 pointer-events-none" : ""}`}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-gray-700/30 bg-gray-50/60 dark:bg-white/[0.02]">
              <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                <PenSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Compose a report</p>
                <p className="text-xs text-gray-400">Pick a category, add context, and send it for review.</p>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">What is this about?</p>
                <div className="relative" ref={categoryMenuRef}>
                  <button
                    type="button"
                    onClick={() => setCategoryMenuOpen((v) => !v)}
                    aria-haspopup="listbox"
                    aria-expanded={categoryMenuOpen}
                    className="w-full flex items-center justify-between gap-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-xl pl-3.5 pr-3 py-2.5 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${selectedCategoryDef.tint}`}>
                        {selectedCategoryDef.icon}
                      </span>
                      <span className="font-semibold">{selectedCategoryDef.label}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${categoryMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {categoryMenuOpen && (
                    <div className="absolute z-10 mt-1.5 w-full rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-900 shadow-lg overflow-hidden">
                      <div className="relative p-2 border-b border-gray-100 dark:border-gray-700/50">
                        <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        <input
                          ref={categorySearchRef}
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setCategoryMenuOpen(false);
                          }}
                          placeholder="Search categories..."
                          className="w-full text-sm pl-8 pr-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div role="listbox" className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
                        {filteredCategories.length === 0 ? (
                          <p className="text-center text-xs text-gray-400 py-4">No category matches "{categorySearch}"</p>
                        ) : (
                          filteredCategories.map((c) => {
                            const selected = category === c.value;
                            return (
                              <button
                                key={c.value}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setCategory(c.value);
                                  setCategoryMenuOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${
                                  selected
                                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold"
                                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                }`}
                              >
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${c.tint}`}>
                                  {c.icon}
                                </span>
                                <span className="flex-1">{c.label}</span>
                                {selected && <Check className="w-4 h-4 shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Subject line (optional)"
                    maxLength={150}
                    className="w-full text-sm border border-gray-200 dark:border-gray-700/60 rounded-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                  />
                </div>
                <div className="relative">
                  <BookOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <SelectField
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    disabled={!currentAcademicYearId}
                    className="w-full text-sm border border-gray-200 dark:border-gray-700/60 rounded-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none transition-shadow disabled:opacity-60"
                  >
                    <option value="">
                      {currentAcademicYearId ? "General (no specific subject)" : "No academic year selected"}
                    </option>
                    {subjects.map((s) => (
                      <option key={s.subject_id} value={s.subject_id}>
                        {s.subject_name}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>

              <div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
                  placeholder="Write your message..."
                  rows={5}
                  className="w-full text-sm border border-gray-200 dark:border-gray-700/60 rounded-2xl p-3.5 bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-shadow"
                />
                <p className={`text-[10px] text-right mt-1 font-medium ${
                  message.length >= MESSAGE_MAX_LENGTH
                    ? "text-red-500"
                    : message.length >= MESSAGE_MAX_LENGTH * 0.9
                    ? "text-amber-500"
                    : "text-gray-400"
                }`}>
                  {message.length}/{MESSAGE_MAX_LENGTH}
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !mentor}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-sm font-semibold shadow-blue-500/20 shadow-md active:scale-95 transition-all"
              >
                <Send className="w-4 h-4" />
                {submitting ? "Sending..." : "Send to Mentor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── My Reports tab ────────────────────────────────────────── */}
      {activeTab === "HISTORY" && (
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-gray-400" />
              Your reports
            </h3>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full">
                <Clock3 className="w-3 h-3" />
                {pendingCount} awaiting review
              </span>
            )}
          </div>

          {history.length > 0 && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {filterTabs.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setFilterTab(t.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    filterTab === t.value
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center text-gray-400 py-8">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400">
                {history.length === 0
                  ? "No reports yet — send your first message to your mentor above."
                  : "No reports match this filter."}
              </p>
              {history.length === 0 && (
                <button
                  onClick={() => setActiveTab("REPORT")}
                  className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-semibold transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send your first report
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map((h) => {
                const badge = VALIDATION_BADGE[h.validation_status];
                const catMeta = CATEGORY_META[h.category];
                return (
                  <div key={h.checkin_id} className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/30 transition-shadow hover:shadow-sm">
                    <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${catMeta.className}`}>
                          {catMeta.label}
                        </span>
                        {h.subject_name && (
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
                            <BookOpen className="w-2.5 h-2.5" />
                            {h.subject_name}
                          </span>
                        )}
                        <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badge.className}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">{h.submitted_at}</span>
                    </div>
                    {h.title && (
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">{h.title}</p>
                    )}
                    <p className="text-sm text-gray-700 dark:text-gray-300">{h.message}</p>
                    {h.mentor_response && (
                      <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                        <UserCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
                        <span><span className="font-semibold">Mentor: </span>{h.mentor_response}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MyMentor;
