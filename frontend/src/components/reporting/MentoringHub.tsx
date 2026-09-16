import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Users,
  AlertCircle,
  Clock,
  RefreshCw,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  ClipboardList,
} from "lucide-react";
import { mentorshipApi, AssignedStudent } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import StudentSupportProfile from "./StudentSupportProfile";
import MentorCheckInInbox from "./MentorCheckInInbox";
import MentorReportsView from "./MentorReportsView";

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
const STAT_STYLES: Record<StatColor, { iconChip: string; iconText: string; hoverShadow: string }> = {
  blue: {
    iconChip: "bg-gradient-to-br from-blue-500/15 to-blue-600/5",
    iconText: "text-blue-600 dark:text-blue-400",
    hoverShadow: "hover:shadow-blue-500/10",
  },
  orange: {
    iconChip: "bg-gradient-to-br from-orange-500/15 to-orange-600/5",
    iconText: "text-orange-600 dark:text-orange-400",
    hoverShadow: "hover:shadow-orange-500/10",
  },
  red: {
    iconChip: "bg-gradient-to-br from-red-500/15 to-red-600/5",
    iconText: "text-red-600 dark:text-red-400",
    hoverShadow: "hover:shadow-red-500/10",
  },
  indigo: {
    iconChip: "bg-gradient-to-br from-indigo-500/15 to-indigo-600/5",
    iconText: "text-indigo-600 dark:text-indigo-400",
    hoverShadow: "hover:shadow-indigo-500/10",
  },
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: StatColor;
  onClick?: () => void;
}> = ({ title, value, icon, color, onClick }) => {
  const styles = STAT_STYLES[color];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`bg-white dark:bg-gray-800/30 p-4 rounded-3xl border border-gray-100 dark:border-gray-700/20 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg text-left w-full ${styles.hoverShadow}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${styles.iconChip} ${styles.iconText}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">
            {title}
          </h4>
          <div className="text-xl font-black text-gray-800 dark:text-white">{value}</div>
        </div>
      </div>
    </Tag>
  );
};

const MentoringHub: React.FC = () => {
  const { showToast } = useToast();
  const { selectedYearId } = useAcademicPeriod();

  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<AssignedStudent | null>(null);
  const [showInbox, setShowInbox] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [unreadCheckIns, setUnreadCheckIns] = useState(0);

  const hasFetched = useRef<number | null | undefined>(undefined);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.getAssignedStudents(
        selectedYearId ?? undefined,
      );
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load assigned students", "error");
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

  useEffect(() => {
    const fetchUnread = () => {
      mentorshipApi
        .getCheckInInbox("NEW")
        .then((res) => {
          const data = (res as any).data?.data ?? (res as any).data ?? [];
          setUnreadCheckIns(Array.isArray(data) ? data.length : 0);
        })
        .catch(() => {});
    };
    fetchUnread();
    // Poll so a new mentee report shows up without a manual refresh — this
    // codebase has no push/websocket notification infra, so a periodic
    // re-fetch is the established pattern (mirrored in MyMentor.tsx and
    // MentorCheckInInbox.tsx).
    const interval = setInterval(fetchUnread, 45_000);
    return () => clearInterval(interval);
  }, []);

  const handleBack = () => {
    setSelectedStudent(null);
    // Refresh directory after returning so badges update
    hasFetched.current = undefined;
    fetchStudents();
  };

  if (selectedStudent) {
    return (
      <StudentSupportProfile student={selectedStudent} onBack={handleBack} />
    );
  }

  if (showInbox) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setShowInbox(false)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Mentoring Hub
        </button>
        <MentorCheckInInbox onUnreadCountChange={setUnreadCheckIns} />
      </div>
    );
  }

  if (showReports) {
    return <MentorReportsView onBack={() => setShowReports(false)} />;
  }

  const filtered = students.filter((s) => {
    const full =
      `${s.first_name ?? ""} ${s.last_name ?? ""} ${s.registration_number ?? ""}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  const overdueCount = students.filter((s) => s.overdue).length;
  const followUpCount = students.filter((s) => s.follow_up_required).length;

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500/15 to-blue-600/5 text-blue-600 dark:text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
              Mentoring Hub
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {students.length} student{students.length !== 1 ? "s" : ""} assigned to you
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => setShowReports(true)}
            className="flex-shrink-0 flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3.5 py-2.5 rounded-2xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">My Reports</span>
          </button>

          {/* Search */}
          <div className="relative w-full lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800/30 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            />
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Assigned" value={students.length} icon={<UserCheck className="w-4 h-4" />} color="blue" />
        <StatCard title="Overdue" value={overdueCount} icon={<Clock className="w-4 h-4" />} color="orange" />
        <StatCard title="Follow-ups" value={followUpCount} icon={<AlertCircle className="w-4 h-4" />} color="red" />
        <StatCard
          title="Mentee Reports"
          value={unreadCheckIns}
          icon={<MessageCircle className="w-4 h-4" />}
          color="indigo"
          onClick={() => setShowInbox(true)}
        />
      </div>

      {/* Student grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading students...
        </div>
      ) : students.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 py-16">
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40">
            <Users className="w-10 h-10 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-base font-semibold text-gray-500 dark:text-gray-400">No students assigned</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Students appear here once you are assigned to a class group.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p className="text-sm">No students match "{search}".</p>
        </div>
      ) : (
        <div className="space-y-2 overflow-y-auto pb-2">
          <AnimatePresence initial={false}>
            {filtered.map((student, idx) => {
              const fullName =
                `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
              const borderAccent = student.overdue
                ? "border-orange-200 dark:border-orange-800/40"
                : student.follow_up_required
                ? "border-red-200 dark:border-red-800/40"
                : "border-gray-100 dark:border-gray-700";
              return (
                <motion.button
                  key={student.user_id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  onClick={() => setSelectedStudent(student)}
                  className={`group w-full flex items-center gap-3 p-3 rounded-xl border bg-white dark:bg-gray-800/30 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60 ${borderAccent}`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                      {(student.first_name?.[0] ?? "?").toUpperCase()}
                    </div>
                    {student.wellbeing_status && (
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-[10px]">
                        {WELLBEING_EMOJI[student.wellbeing_status] ?? ""}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {fullName || "Unnamed"}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {student.registration_number
                        ? `${student.registration_number} · ${student.class_group_name}`
                        : student.class_group_name}
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-1.5 flex-shrink-0">
                    {student.overdue && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full font-medium">
                        <Clock className="w-3 h-3" />
                        {student.last_session_date
                          ? `${student.days_since_last_session}d ago`
                          : "Never mentored"}
                      </span>
                    )}
                    {student.follow_up_required && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full font-medium">
                        <AlertCircle className="w-3 h-3" />
                        Follow-up
                      </span>
                    )}
                    {!student.overdue && !student.follow_up_required && student.last_session_date && (
                      <span className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full">
                        {student.days_since_last_session}d ago
                      </span>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default MentoringHub;
