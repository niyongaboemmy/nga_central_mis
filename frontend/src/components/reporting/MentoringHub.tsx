import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import UserAvatar from "../ui/UserAvatar";
import { tupoMentorUrl } from "./MentorProfileCard";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Users,
  AlertCircle,
  Clock,
  RefreshCw,
  MessageCircle,
  MessageSquareText,
  ChevronRight,
  UserCheck,
  ClipboardList,
  Info,
  Lock,
  X,
} from "lucide-react";
import { mentorshipApi, AssignedStudent } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useUser } from "../../contexts/UserContext";
import { refreshMentorshipRole, useMentorshipRole } from "../../hooks/useMentorshipRole";
import MentorReportsView from "./MentorReportsView";
import { sortByAttention } from "./menteeAttention";

const WELLBEING_EMOJI: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED: "😟",
  NEUTRAL: "😐",
  GOOD: "🙂",
  EXCELLENT: "😄",
};

// Same visual recipe as ReportingDashboard.tsx's StatCard (gradient icon
// chip + hover lift with a colored shadow) so this screen reads as part of
// the same design system rather than a one-off.
type StatColor = "blue" | "orange" | "red" | "indigo";
const STAT_STYLES: Record<StatColor, { iconChip: string; iconText: string; hoverShadow: string; active: string }> = {
  blue: {
    iconChip: "bg-gradient-to-br from-blue-500/15 to-blue-600/5",
    iconText: "text-blue-600 dark:text-blue-400",
    hoverShadow: "hover:shadow-blue-500/10",
    active: "ring-2 ring-blue-500/60",
  },
  orange: {
    iconChip: "bg-gradient-to-br from-orange-500/15 to-orange-600/5",
    iconText: "text-orange-600 dark:text-orange-400",
    hoverShadow: "hover:shadow-orange-500/10",
    active: "ring-2 ring-orange-500/60",
  },
  red: {
    iconChip: "bg-gradient-to-br from-red-500/15 to-red-600/5",
    iconText: "text-red-600 dark:text-red-400",
    hoverShadow: "hover:shadow-red-500/10",
    active: "ring-2 ring-red-500/60",
  },
  indigo: {
    iconChip: "bg-gradient-to-br from-indigo-500/15 to-indigo-600/5",
    iconText: "text-indigo-600 dark:text-indigo-400",
    hoverShadow: "hover:shadow-indigo-500/10",
    active: "ring-2 ring-indigo-500/60",
  },
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: StatColor;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}> = ({ title, value, icon, color, hint, active, onClick }) => {
  const styles = STAT_STYLES[color];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      {...(onClick ? { type: "button", "aria-pressed": active } : {})}
      title={hint}
      className={`bg-white dark:bg-gray-800/30 p-4 rounded-3xl border border-gray-100 dark:border-gray-700/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg text-left w-full ${styles.hoverShadow} ${active ? styles.active : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${styles.iconChip} ${styles.iconText}`}>{icon}</div>
        <div className="min-w-0">
          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{title}</h4>
          <div className="text-xl font-black text-gray-800 dark:text-white">{value}</div>
        </div>
      </div>
    </Tag>
  );
};

type Focus = "all" | "overdue" | "follow_up";

/**
 * The mentor's home: every mentee, who needs attention first, and a way into
 * each one's page (/my-mentees/:id) and the check-in inbox (/my-mentees/inbox).
 * Both are real URLs, so notifications, Home and the top-bar mentees button
 * can link straight to them and the browser's back button works.
 */
const MentoringHub: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { user } = useUser();
  const { selectedYearId, selectedYear } = useAcademicPeriod();
  const role = useMentorshipRole(user?.user?.user_id, selectedYearId);

  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<Focus>("all");
  const [showReports, setShowReports] = useState(false);

  const hasFetched = useRef<number | null | undefined>(undefined);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.getAssignedStudents(selectedYearId ?? undefined);
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load your mentees", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current === selectedYearId) return;
    hasFetched.current = selectedYearId;
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYearId]);

  // The unread badge comes from the shared role answer; make it fresh here.
  useEffect(() => {
    refreshMentorshipRole();
  }, []);

  const unreadCheckIns = role?.new_checkins ?? students.reduce((n, s) => n + (s.new_checkins ?? 0), 0);

  const ordered = useMemo(() => sortByAttention(students), [students]);
  const filtered = ordered.filter((s) => {
    if (focus === "overdue" && !s.overdue) return false;
    if (focus === "follow_up" && !s.follow_up_required) return false;
    const full = `${s.first_name ?? ""} ${s.last_name ?? ""} ${s.registration_number ?? ""} ${s.class_group_name ?? ""}`.toLowerCase();
    return full.includes(search.trim().toLowerCase());
  });

  if (showReports) {
    return <MentorReportsView onBack={() => setShowReports(false)} />;
  }

  const overdueCount = students.filter((s) => s.overdue).length;
  const followUpCount = students.filter((s) => s.follow_up_required).length;
  const fromOtherYear = students.length > 0 && students.every((s) => s.from_other_year);
  const rosterYear = students[0]?.academic_year_name;
  const toggle = (f: Focus) => setFocus((cur) => (cur === f ? "all" : f));

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500/15 to-blue-600/5 text-blue-600 dark:text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">My Mentees</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {students.length} mentee{students.length !== 1 ? "s" : ""} assigned to you
              {(fromOtherYear ? rosterYear : selectedYear?.name) ? ` · ${fromOtherYear ? rosterYear : selectedYear?.name}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <button
            onClick={() => setShowReports(true)}
            title="Your sessions and mentee check-ins as a report"
            className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3.5 py-2.5 rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">My Reports</span>
          </button>

          {students.length > 0 && (
            <a
              href={tupoMentorUrl()}
              target="_blank"
              rel="noopener noreferrer"
              title="Chat with your mentees on Tupo"
              className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3.5 py-2.5 rounded-2xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              <MessageSquareText className="w-4 h-4" />
              <span className="hidden sm:inline">Message on Tupo</span>
            </a>
          )}

          <div className="relative w-full lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, class or reg. no."
              aria-label="Search mentees"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            />
          </div>
        </div>
      </div>

      {fromOtherYear && (
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 text-sm text-blue-800 dark:text-blue-200">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            You have no mentees in {selectedYear?.name ?? "the selected year"}. Showing the students you mentor now
            {rosterYear ? ` (${rosterYear})` : ""}.
          </p>
        </div>
      )}

      {/* Stat cards double as filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Assigned"
          value={students.length}
          icon={<UserCheck className="w-4 h-4" />}
          color="blue"
          active={focus === "all" && students.length > 0}
          onClick={() => setFocus("all")}
          hint="Show everyone"
        />
        <StatCard
          title="Unread messages"
          value={unreadCheckIns}
          icon={<MessageCircle className="w-4 h-4" />}
          color="indigo"
          onClick={() => navigate("/my-mentees/inbox")}
          hint="Open your check-in inbox"
        />
        <StatCard
          title="Due a session"
          value={overdueCount}
          icon={<Clock className="w-4 h-4" />}
          color="orange"
          active={focus === "overdue"}
          onClick={() => toggle("overdue")}
          hint="No session in the last 3 weeks"
        />
        <StatCard
          title="Follow-ups"
          value={followUpCount}
          icon={<AlertCircle className="w-4 h-4" />}
          color="red"
          active={focus === "follow_up"}
          onClick={() => toggle("follow_up")}
          hint="Sessions you flagged for follow-up that are not resolved"
        />
      </div>

      {focus !== "all" && (
        <div className="flex items-center gap-2 -mt-2 text-xs text-gray-500 dark:text-gray-400">
          Showing {focus === "overdue" ? "mentees due a session" : "mentees with an open follow-up"}
          <button
            onClick={() => setFocus("all")}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 font-semibold"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        </div>
      )}

      {/* Mentee list */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 py-10">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading your mentees…
        </div>
      ) : students.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40">
            <Users className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-base font-semibold text-gray-500 dark:text-gray-400">No mentees assigned yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center max-w-sm">
            Only students your school administrator assigns to you as their mentor appear here
            {selectedYear?.name ? ` for ${selectedYear.name}` : ""}. You'll get a notification when that happens.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 py-10">
          <p className="text-sm">{search ? `No mentees match "${search}".` : "Nobody here right now."}</p>
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto pb-2">
          <AnimatePresence initial={false}>
            {filtered.map((student, idx) => {
              const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
              const borderAccent = student.new_checkins
                ? "border-blue-200 dark:border-blue-800/40"
                : student.follow_up_required
                  ? "border-red-200 dark:border-red-800/40"
                  : student.overdue
                    ? "border-orange-200 dark:border-orange-800/40"
                    : "border-gray-100 dark:border-gray-700";
              return (
                <motion.li key={student.user_id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 15) * 0.02 }}>
                  <button
                    onClick={() => navigate(`/my-mentees/${student.user_id}`)}
                    className={`group w-full flex items-center gap-3 p-3 rounded-xl border bg-white dark:bg-gray-800/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${borderAccent}`}
                  >
                    <div className="relative flex-shrink-0">
                      <UserAvatar decorative userId={student.user_id} name={fullName || "?"} size={36} />
                      {student.wellbeing_status && (
                        <span
                          className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-[10px]"
                          title={`Last wellbeing: ${student.wellbeing_status.toLowerCase()}`}
                        >
                          {WELLBEING_EMOJI[student.wellbeing_status] ?? ""}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{fullName || "Unnamed"}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                        {[
                          student.registration_number,
                          student.class_group_name ?? "Not placed in a class",
                          student.session_count
                            ? `${student.session_count} session${student.session_count !== 1 ? "s" : ""}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-end gap-1.5 flex-shrink-0">
                      {!!student.new_checkins && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-600 text-white rounded-full font-semibold">
                          <MessageCircle className="w-3 h-3" />
                          {student.new_checkins} new
                        </span>
                      )}
                      {student.can_log === false && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full font-medium">
                          <Lock className="w-3 h-3" />
                          Past year
                        </span>
                      )}
                      {student.overdue && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full font-medium">
                          <Clock className="w-3 h-3" />
                          {student.last_session_date ? `${student.days_since_last_session}d ago` : "Never met"}
                        </span>
                      )}
                      {student.follow_up_required && (
                        <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full font-medium">
                          <AlertCircle className="w-3 h-3" />
                          Follow-up
                        </span>
                      )}
                      {!student.overdue && !student.follow_up_required && student.last_session_date && (
                        <span className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full">
                          {student.days_since_last_session}d ago
                        </span>
                      )}
                    </div>

                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
};

export default MentoringHub;
