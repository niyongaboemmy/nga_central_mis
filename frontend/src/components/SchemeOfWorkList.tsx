import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MyAssignedSubject, myAssignedSubjectsApi } from "../api/academics";
import {
  BookOpen,
  Calendar,
  ChevronRight,
  Search,
  FileText,
  TrendingUp,
  GraduationCap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SchemeOfWorkList: React.FC = () => {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadAssignedSubjects();
  }, []);

  const loadAssignedSubjects = async () => {
    try {
      const response = await myAssignedSubjectsApi.getAll();
      setSubjects(response.data.data || []);
    } catch (error) {
      console.error("Failed to load assigned subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSubjects = subjects.filter(
    (subject) =>
      subject.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.subject_code?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSelectSubject = (
    subjectId: number,
    classGroupId: number,
    termId: number,
  ) => {
    navigate(
      `/scheme-of-work/calendar?subject_id=${subjectId}&class_group_id=${classGroupId}&academic_term_id=${termId}`,
    );
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: any = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15,
      },
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 px-4 min-h-[60vh]">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="h-14 w-14 border-4 border-blue-600/20 border-t-blue-600 rounded-full mx-auto mb-6"
          />
          <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">
            Loading your subjects...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">
            <TrendingUp className="w-3 h-3" />
            Curriculum Management
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-xl">
              <FileText className="h-7 w-7 text-white" />
            </div>
            <div>
              <div>Scheme of Work</div>
              <p className="text-base text-gray-500 dark:text-gray-400 max-w-2xl font-light">
                Plan, monitor, and manage your teaching curriculum across all
                assigned subjects and classes.
              </p>
            </div>
          </h1>
        </div>

        <div className="relative group w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
          <input
            type="text"
            placeholder="Search subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl border-none bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 transition-all shadow-inner"
          />
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {filteredSubjects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="text-center py-24 bg-white dark:bg-gray-800/50 rounded-[2.5rem] border border-dashed border-gray-200 dark:border-gray-700/50"
          >
            <div className="bg-gray-50 dark:bg-gray-900/50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              No Subjects Found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
              We couldn't find any subjects matching your search criteria.
            </p>
          </motion.div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-4"
          >
            {filteredSubjects.map((subject) => (
              <motion.div
                key={subject.subject_id}
                variants={itemVariants}
                className="group relative"
              >
                {/* Subject Header (Card-like Top) */}
                <div className="bg-white dark:bg-gray-950 p-6 rounded-3xl border border-gray-100 dark:border-gray-700/50 group-hover:border-blue-500/30 transition-all duration-500">
                  <div className="flex justify-between items-start mb-6">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                        {subject.subject_code || "GEN-SC"}
                      </div>
                      <h2 className="text-base text-gray-900 dark:text-white font-bold">
                        {subject.subject_name}
                      </h2>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl group-hover:bg-blue-600 transition-colors">
                      <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:text-white" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {subject.grades.map((grade, idx) => (
                      <button
                        key={idx}
                        onClick={() =>
                          handleSelectSubject(
                            subject.subject_id,
                            grade.class_group_id,
                            grade.academic_term_id,
                          )
                        }
                        className="w-full bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-transparent hover:border-blue-500/30 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all text-left flex items-center justify-between group/btn"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center border border-gray-100 dark:border-gray-700 shadow-sm group-hover/btn:scale-110 transition-transform">
                            <GraduationCap className="w-5 h-5 text-gray-400 group-hover/btn:text-blue-500" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white text-base">
                              {grade.grade_name}
                              <span className="mx-2 text-gray-300 dark:text-gray-700 font-light">
                                |
                              </span>
                              <span className="text-sm font-medium text-gray-500">
                                {grade.class_group_name}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-1 font-semibold uppercase tracking-tighter">
                              <Calendar className="w-3 h-3" />
                              {grade.academic_term_name} •{" "}
                              {grade.academic_year_name}
                            </div>
                          </div>
                        </div>
                        <div className="p-1 rounded-full bg-transparent group-hover/btn:bg-blue-100 dark:group-hover/btn:bg-blue-900/30 transition-colors">
                          <ChevronRight className="w-5 h-5 text-gray-300 group-hover/btn:text-blue-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SchemeOfWorkList;
