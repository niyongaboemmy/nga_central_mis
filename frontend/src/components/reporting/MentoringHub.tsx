import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { mentorshipApi, AssignedStudent } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import StudentSupportProfile from "./StudentSupportProfile";

const WELLBEING_EMOJI: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED: "😟",
  NEUTRAL: "😐",
  GOOD: "🙂",
  EXCELLENT: "😄",
};

interface Props {
  academicTermId?: number | null;
}

const MentoringHub: React.FC<Props> = () => {
  const { showToast } = useToast();

  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<AssignedStudent | null>(null);

  const hasFetched = useRef(false);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await mentorshipApi.getAssignedStudents();
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load assigned students", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStudents();
  }, []);

  const handleBack = () => {
    setSelectedStudent(null);
    // Refresh directory after returning so badges update
    hasFetched.current = false;
    fetchStudents();
  };

  if (selectedStudent) {
    return (
      <StudentSupportProfile student={selectedStudent} onBack={handleBack} />
    );
  }

  const filtered = students.filter((s) => {
    const full = `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  const overdueCount = students.filter((s) => s.overdue).length;
  const followUpCount = students.filter((s) => s.follow_up_required).length;

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* Top bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Mentoring Hub
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {students.length} student{students.length !== 1 ? "s" : ""} assigned
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick stats */}
          {overdueCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-3 py-1.5 rounded-full">
              <Clock className="w-3.5 h-3.5" />
              {overdueCount} overdue
            </span>
          )}
          {followUpCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-3 py-1.5 rounded-full">
              <AlertCircle className="w-3.5 h-3.5" />
              {followUpCount} follow-up
            </span>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search students..."
              className="pl-9 pr-4 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>
        </div>
      </div>

      {/* Student grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading students...
        </div>
      ) : students.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
          <Users className="w-12 h-12" />
          <p className="text-base font-medium">No students assigned</p>
          <p className="text-sm">Students appear here once you are assigned to a class group.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <p className="text-sm">No students match "{search}".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pb-2">
          <AnimatePresence initial={false}>
            {filtered.map((student, idx) => {
              const fullName =
                `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
              return (
                <motion.button
                  key={student.user_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => setSelectedStudent(student)}
                  className={`text-left w-full bg-white dark:bg-gray-800 rounded-2xl p-4 border-2 transition-all hover:shadow-md ${
                    student.overdue
                      ? "border-orange-300 dark:border-orange-700"
                      : student.follow_up_required
                      ? "border-red-200 dark:border-red-800"
                      : "border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-700"
                  }`}
                >
                  {/* Avatar + name */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold text-sm flex-shrink-0">
                        {(student.first_name?.[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {fullName || "Unnamed"}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {student.class_group_name}
                        </p>
                      </div>
                    </div>
                    <span className="text-xl flex-shrink-0">
                      {student.wellbeing_status
                        ? WELLBEING_EMOJI[student.wellbeing_status] ?? ""
                        : ""}
                    </span>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1.5">
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
