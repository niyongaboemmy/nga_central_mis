import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
  Layers,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getScopedSubjects, ScopedSubject } from "../api/users";
import { useScopedGrades } from "../hooks/useScopedGrades";
import { useToast } from "../contexts/ToastContext";

const PAGE_SIZE = 24;

// Animated floating particles
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    {[...Array(8)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: `${Math.random() * 100}%`,
          y: "100%",
        }}
        animate={{
          opacity: [0, 0.3, 0],
          y: "-10%",
        }}
        transition={{
          repeat: Infinity,
          duration: 20 + Math.random() * 20,
          delay: Math.random() * 20,
          ease: "linear",
        }}
        className="absolute"
        style={{ left: `${Math.random() * 100}%` }}
      >
        <div className="w-2 h-2 bg-blue-300/30 rounded-full" />
      </motion.div>
    ))}
  </div>
);

const teacherLabel = (t: {
  first_name?: string | null;
  last_name?: string | null;
  username: string | null;
}) =>
  t.first_name && t.last_name
    ? `${t.first_name} ${t.last_name}`
    : t.username ?? "Unknown";

// Subject card component
const SubjectCard = ({
  subject,
  index,
  showGrades,
}: {
  subject: ScopedSubject;
  index: number;
  showGrades: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: Math.min(index, 12) * 0.02 }}
    className="bg-white dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-start gap-3">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: subject.color || "#3B82F6" }}
      >
        <BookOpen className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 dark:text-white text-sm truncate">
          {subject.name}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {subject.code && `Code: ${subject.code}`}
        </p>
        {subject.description && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">
            {subject.description}
          </p>
        )}

        {/* Which of the user's grades / class groups this subject runs in —
            without it, a teacher covering two grades cannot tell the cards
            apart. */}
        {showGrades && subject.class_groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-2">
            <Layers className="w-3 h-3 text-gray-400" />
            {subject.class_groups.map((cg) => (
              <span
                key={cg.class_group_id}
                className="px-2 py-0.5 bg-gray-100 dark:bg-slate-700/60 text-gray-600 dark:text-gray-300 rounded-full text-[11px]"
              >
                {cg.name}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
            <UsersIcon className="w-3 h-3" />
            Teachers
          </p>
          {subject.teachers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {subject.teachers.map((teacher) => (
                <span
                  key={teacher.user_id}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 rounded-full text-xs"
                >
                  {teacherLabel(teacher)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Not yet assigned</p>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            subject.status === "ACTIVE"
              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {subject.status}
        </span>
      </div>
    </div>
  </motion.div>
);

const EmptyState = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => (
  <div className="min-h-screen bg-gray-50 dark:bg-black overflow-hidden relative">
    <FloatingParticles />
    <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-8"
        >
          <BookOpen className="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            {title}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </motion.div>
      </div>
    </div>
  </div>
);

// Class Teacher Subjects Page
const ClassTeacherSubjectsPage: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const scope = useScopedGrades();

  const [subjects, setSubjects] = useState<ScopedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [gradeFilter, setGradeFilter] = useState<number | "all">("all");

  const canView = user?.permissions?.includes(
    "VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE",
  );
  const academicYearId = user?.currentAcademicYear?.academic_year_id ?? null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const gradeIds = useMemo(
    () => (gradeFilter === "all" ? scope.gradeIds : [gradeFilter]),
    [gradeFilter, scope.gradeIds],
  );

  // One request covering every grade in scope — search and pagination are the
  // server's job, so the page count is real rather than a slice of whatever
  // happened to be fetched.
  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    getScopedSubjects({
      gradeIds,
      academicYearId,
      page,
      limit: PAGE_SIZE,
      search: debouncedSearchTerm || undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setSubjects(result.items);
        setTotal(result.total);
      })
      .catch((error: any) => {
        if (cancelled) return;
        console.error("Failed to load subjects:", error);
        showToast(error?.message || "Failed to load subjects", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, gradeIds, academicYearId, page, debouncedSearchTerm]);

  if (!canView) {
    return (
      <EmptyState
        title="Access Denied"
        message="No permission to view class subjects."
      />
    );
  }

  if (scope.isScoped && scope.gradeIds.length === 0) {
    return (
      <EmptyState
        title="No Grades Assigned"
        message={
          scope.source === "programs"
            ? "Your programs have no grades yet."
            : "You are not assigned to any grades."
        }
      />
    );
  }

  return (
    <div className="min-h-screen overflow-hidden relative">
      <FloatingParticles />

      <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                Class Subjects
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {scope.isScoped
                  ? `Subjects in ${scope.grades
                      .map((g) => g.name)
                      .join(", ")}`
                  : "Subjects across all grades"}
              </p>
            </div>
          </motion.div>

          {/* Subjects Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Subjects in Your Grades
              </h3>
              <span className="text-sm text-gray-500">
                {total} subject{total === 1 ? "" : "s"}
              </span>
            </div>

            {/* Search + grade filter */}
            <div className="mb-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search subjects..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {scope.grades.length > 1 && (
                <select
                  value={gradeFilter}
                  onChange={(e) => {
                    setGradeFilter(
                      e.target.value === "all"
                        ? "all"
                        : Number(e.target.value),
                    );
                    setPage(1);
                  }}
                  className="px-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">All my grades</option>
                  {scope.grades.map((g) => (
                    <option key={g.grade_id} value={g.grade_id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Subjects List */}
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {subjects.length > 0 ? (
                  subjects.map((subject, index) => (
                    <SubjectCard
                      key={subject.subject_id}
                      subject={subject}
                      index={index}
                      showGrades={scope.grades.length > 1 || !scope.isScoped}
                    />
                  ))
                ) : (
                  <div className="col-span-full text-center py-6 text-sm text-gray-400">
                    No subjects found
                  </div>
                )}
              </motion.div>
            )}

            {/* Pagination */}
            {!loading && total > 0 && totalPages > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                    {Math.min(page * PAGE_SIZE, total)} of {total} subjects
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-500">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ClassTeacherSubjectsPage;
