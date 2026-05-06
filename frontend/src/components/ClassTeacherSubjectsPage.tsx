import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { BookOpen, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { getSubjectsByGrade, GradeSubject } from "../api/users";
import { useToast } from "../contexts/ToastContext";

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

// Subject card component
const SubjectCard = ({
  subject,
  index,
}: {
  subject: GradeSubject;
  index: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.02 }}
    className="bg-white dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-white/50 dark:border-slate-700/30"
  >
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
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
        {subject.teachers && subject.teachers.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              Teachers:
            </p>
            <div className="flex flex-wrap gap-1">
              {subject.teachers.map((teacher) => (
                <span
                  key={teacher.user_id}
                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 rounded-full text-xs"
                >
                  {teacher.first_name && teacher.last_name
                    ? `${teacher.first_name} ${teacher.last_name}`
                    : teacher.username}
                </span>
              ))}
            </div>
          </div>
        )}
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

// Class Teacher Subjects Page
const ClassTeacherSubjectsPage: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  const [subjects, setSubjects] = useState<GradeSubject[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
  });
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  const initialLoadRef = useRef(false);
  const lastSearchRef = useRef("");

  const assignedGrades = user?.assignedGrades || [];
  const canView = user?.permissions?.includes(
    "VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE"
  );

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load subjects when component mounts or debounced search changes
  useEffect(() => {
    if (canView && assignedGrades.length > 0) {
      if (!initialLoadRef.current) {
        initialLoadRef.current = true;
        lastSearchRef.current = debouncedSearchTerm;
        setPagination((prev) => ({ ...prev, page: 1 }));
        loadSubjects(1);
      } else if (debouncedSearchTerm !== lastSearchRef.current) {
        lastSearchRef.current = debouncedSearchTerm;
        setPagination((prev) => ({ ...prev, page: 1 }));
        loadSubjects(1);
      }
    }
  }, [canView, assignedGrades, debouncedSearchTerm]);

  const loadSubjects = async (page: number = 1) => {
    if (assignedGrades.length === 0) return;

    setLoading(true);
    try {
      // Load subjects from all assigned grades
      const allSubjects: GradeSubject[] = [];
      for (const grade of assignedGrades) {
        const result = await getSubjectsByGrade(grade.grade_id, {
          page,
          limit: pagination.limit,
          search: debouncedSearchTerm || undefined,
        });
        if (result) {
          allSubjects.push(...result.subjects);
        }
      }

      // Remove duplicates based on subject_id
      const uniqueSubjects = allSubjects.filter(
        (subject, index, self) =>
          index === self.findIndex((s) => s.subject_id === subject.subject_id)
      );

      setSubjects(uniqueSubjects);
      setPagination({
        ...pagination,
        page,
        total: uniqueSubjects.length,
        totalPages: Math.ceil(uniqueSubjects.length / pagination.limit),
      });
    } catch (error) {
      console.error("Failed to load subjects:", error);
      showToast("Failed to load subjects", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, page: newPage }));
      loadSubjects(newPage);
    }
  };

  if (!canView) {
    return (
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
                Access Denied
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                No permission to view class subjects.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  if (assignedGrades.length === 0) {
    return (
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
                No Grades Assigned
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You are not assigned to any grades.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
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
                View subjects in your assigned grades
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
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {pagination.total} subjects
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                  }}
                  placeholder="Search subjects..."
                  className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-slate-700 dark:text-white rounded-[0.8rem] text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
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
                  subjects
                    .slice(
                      (pagination.page - 1) * pagination.limit,
                      pagination.page * pagination.limit
                    )
                    .map((subject, index) => (
                      <SubjectCard
                        key={subject.subject_id}
                        subject={subject}
                        index={index}
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
            {!loading && pagination.total > 0 && pagination.totalPages > 1 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                    {Math.min(
                      pagination.page * pagination.limit,
                      pagination.total
                    )}{" "}
                    of {pagination.total} subjects
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-500">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
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
