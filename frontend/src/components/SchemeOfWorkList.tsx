import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MyAssignedSubject,
  myAssignedSubjectsApi,
  academicTermsApi,
} from "../api/academics";
import { useToast } from "../contexts/ToastContext";
import { useAcademicPeriod } from "../contexts/AcademicPeriodContext";
import {
  BookOpen,
  Calendar,
  ChevronRight,
  Search,
  FileText,
  TrendingUp,
  Info,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SubjectItemCard from "./subjects/SubjectItemCard";

const SchemeOfWorkList: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selectedYearId, selectedTermId, selectedYear, selectedTerm } =
    useAcademicPeriod();
  const [subjects, setSubjects] = useState<MyAssignedSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedValidation, setSelectedValidation] = useState<{
    status: string;
    comment: string | null;
    subjectName: string;
  } | null>(null);
  const [navigatingKey, setNavigatingKey] = useState<string | null>(null);

  useEffect(() => {
    loadAssignedSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTermId]);

  const loadAssignedSubjects = async () => {
    try {
      const response = await myAssignedSubjectsApi.getAll(
        selectedTermId ?? undefined,
      );
      setSubjects(response.data.data || []);
    } catch (error) {
      console.error("Failed to load assigned subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  // Only show assignments for the globally selected academic year
  const yearFilteredSubjects = subjects
    .map((subject) => ({
      ...subject,
      grades: selectedYearId
        ? subject.grades.filter((g) => g.academic_year_id === selectedYearId)
        : subject.grades,
    }))
    .filter((subject) => subject.grades.length > 0);

  const filteredSubjects = yearFilteredSubjects.filter(
    (subject) =>
      subject.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.subject_code?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSelectSubject = async (
    subjectId: number,
    classGroupId: number,
    academicYearId: number,
  ) => {
    const key = `${subjectId}-${classGroupId}`;
    setNavigatingKey(key);
    try {
      let termId: number | undefined;

      // Prefer the globally selected term when it belongs to this assignment's year
      if (selectedYearId === academicYearId && selectedTermId) {
        termId = selectedTermId;
      } else {
        const resp = await academicTermsApi.getAll(academicYearId);
        const raw = resp.data as any;
        const terms = Array.isArray(raw) ? raw : raw?.data || [];
        const currentTerm =
          terms.find((t: any) => t.is_current === 1) || terms[0];
        termId = currentTerm?.academic_term_id;
      }

      if (!termId) {
        showToast(
          "No academic term is configured for this academic year yet.",
          "error",
        );
        return;
      }

      navigate(
        `/scheme-of-work/calendar?subject_id=${subjectId}&class_group_id=${classGroupId}&academic_term_id=${termId}`,
      );
    } catch (error) {
      console.error("Failed to resolve academic term:", error);
      showToast("Could not load the academic term for this subject.", "error");
    } finally {
      setNavigatingKey(null);
    }
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
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
              <TrendingUp className="w-3 h-3" />
              Curriculum Management
            </div>
            {(selectedYear || selectedTerm) && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold uppercase tracking-wider">
                <Calendar className="w-3 h-3" />
                {selectedYear?.name}
                {selectedTerm ? ` · ${selectedTerm.name}` : ""}
              </div>
            )}
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
            className="w-full pl-12 pr-4 py-3 rounded-2xl border-none bg-white dark:bg-gray-800/80 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {filteredSubjects.length === 0 ? (
          <motion.div
            key="empty"
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
            key="list"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {filteredSubjects.map((subject) => {
              // A subject with exactly one class assignment (the common case) is
              // navigable by clicking anywhere on its row, not just its grade chip.
              const singleGrade =
                subject.grades.length === 1 ? subject.grades[0] : null;
              const keyFor = (classGroupId: number) =>
                `${subject.subject_id}-${classGroupId}`;

              return (
                <SubjectItemCard
                  key={subject.subject_id}
                  subjectName={subject.subject_name}
                  subjectCode={subject.subject_code}
                  animationVariants={itemVariants}
                  isCardNavigating={
                    !!singleGrade &&
                    navigatingKey === keyFor(singleGrade.class_group_id)
                  }
                  onCardClick={
                    singleGrade
                      ? () =>
                          handleSelectSubject(
                            subject.subject_id,
                            singleGrade.class_group_id,
                            singleGrade.academic_year_id,
                          )
                      : undefined
                  }
                  rightMeta={
                    <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                      <Calendar className="w-3.5 h-3.5" />
                      {subject.grades[0]?.academic_year_name}
                    </div>
                  }
                  grades={subject.grades.map((grade) => ({
                    key: keyFor(grade.class_group_id),
                    grade_name: grade.grade_name,
                    class_group_name: grade.class_group_name,
                    isNavigating: navigatingKey === keyFor(grade.class_group_id),
                    onClick: singleGrade
                      ? undefined
                      : () =>
                          handleSelectSubject(
                            subject.subject_id,
                            grade.class_group_id,
                            grade.academic_year_id,
                          ),
                    badge:
                      grade.validation_status !== "PENDING"
                        ? {
                            label: grade.validation_status,
                            tone:
                              grade.validation_status === "APPROVED"
                                ? "success"
                                : "danger",
                          }
                        : null,
                    onInfoClick:
                      grade.validation_status !== "PENDING"
                        ? () =>
                            setSelectedValidation({
                              status: grade.validation_status,
                              comment: grade.validation_comment,
                              subjectName: subject.subject_name,
                            })
                        : undefined,
                    belowContent:
                      grade.validation_status === "REJECTED" ? (
                        <div className="mx-1 p-2.5 bg-rose-50/50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/50 rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs font-medium">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />A
                          scheme of work of that subject has rejected.
                        </div>
                      ) : undefined,
                  }))}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Status Details Modal */}
      <AnimatePresence>
        {selectedValidation && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-gray-900 rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div
                className={`p-6 flex items-center justify-between ${
                  selectedValidation.status === "APPROVED"
                    ? "bg-emerald-600"
                    : "bg-rose-600"
                } text-white`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <Info className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold leading-tight">
                      Validation Status
                    </h3>
                    <p className="text-xs text-white/80">
                      {selectedValidation.subjectName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedValidation(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <ChevronRight className="w-5 h-5 rotate-90" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                      selectedValidation.status === "APPROVED"
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                        : "bg-rose-100 dark:bg-rose-900/30 text-rose-600"
                    }`}
                  >
                    {selectedValidation.status === "APPROVED" ? (
                      <TrendingUp className="w-8 h-8" />
                    ) : (
                      <AlertCircle className="w-8 h-8" />
                    )}
                  </div>
                  <h4
                    className={`text-2xl font-black uppercase tracking-tighter ${
                      selectedValidation.status === "APPROVED"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {selectedValidation.status}
                  </h4>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    Your scheme of work has been reviewed.
                  </p>
                </div>

                {selectedValidation.comment && (
                  <div className="p-5 bg-gray-50 dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Feedback Comment
                    </div>
                    <p className="text-gray-700 dark:text-gray-300 italic text-sm leading-relaxed">
                      "{selectedValidation.comment}"
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setSelectedValidation(null)}
                  className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold transition-transform active:scale-95 shadow-lg"
                >
                  Close Details
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SchemeOfWorkList;
