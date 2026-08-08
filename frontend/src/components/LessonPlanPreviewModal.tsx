import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Calendar,
  Clock,
  BookOpen,
  Target,
  CheckCircle,
  Edit,
  FileText,
  User,
  Printer,
  List,
  Trash2,
  Download,
  FileDown,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { LessonPlan } from "../api/lessonPlan";
import { LessonPlanDocumentService } from "../services/LessonPlanDocumentService";
import { useToast } from "../contexts/ToastContext";

interface LessonPlanPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: LessonPlan | null;
  onEdit: (plan: LessonPlan) => void;
  onDelete: (id: number) => void;
}

const LessonPlanPreviewModal: React.FC<LessonPlanPreviewModalProps> = ({
  isOpen,
  onClose,
  plan,
  onEdit,
  onDelete,
}) => {
  const { showToast } = useToast();
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [downloadingFormat, setDownloadingFormat] = useState<"pdf" | "docx" | null>(null);

  if (!plan) return null;

  const handleDownloadPDF = () => {
    setIsDownloadMenuOpen(false);
    setDownloadingFormat("pdf");
    try {
      LessonPlanDocumentService.downloadPDF(plan);
      showToast("Lesson plan PDF downloaded", "success");
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      showToast("Failed to generate PDF", "error");
    } finally {
      setDownloadingFormat(null);
    }
  };

  const handleDownloadDocx = async () => {
    setIsDownloadMenuOpen(false);
    setDownloadingFormat("docx");
    try {
      await LessonPlanDocumentService.downloadDocx(plan);
      showToast("Lesson plan Word document downloaded", "success");
    } catch (error) {
      console.error("Failed to generate Word document:", error);
      showToast("Failed to generate Word document", "error");
    } finally {
      setDownloadingFormat(null);
    }
  };

  const getTotalDuration = () => {
    const outcomesDuration =
      plan.outcomes?.reduce((sum, o) => sum + (o.duration_minutes || 0), 0) ||
      0;
    const sectionsDuration =
      plan.sections?.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) ||
      0;
    return outcomesDuration + sectionsDuration;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed -top-8 inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", duration: 0.5 }}
                className="relative w-full max-w-5xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 px-8 py-5 text-white">
                  <div className="absolute top-6 right-6 flex items-center gap-2">
                    <div className="relative">
                      <button
                        onClick={() => setIsDownloadMenuOpen((v) => !v)}
                        disabled={!!downloadingFormat}
                        className="flex items-center gap-1.5 px-3 py-2 hover:bg-white/20 rounded-full transition-colors text-sm font-semibold disabled:opacity-60"
                        title="Download"
                      >
                        {downloadingFormat ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Download
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${isDownloadMenuOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      <AnimatePresence>
                        {isDownloadMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setIsDownloadMenuOpen(false)}
                            />
                            <motion.div
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-20 text-gray-900 dark:text-white"
                            >
                              <button
                                onClick={handleDownloadPDF}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                              >
                                <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                                  <FileDown className="w-4 h-4 text-red-500" />
                                </div>
                                <div>
                                  <div>Download PDF</div>
                                  <div className="text-xs text-gray-400 font-normal">
                                    Print-ready, well formatted
                                  </div>
                                </div>
                              </button>
                              <button
                                onClick={handleDownloadDocx}
                                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-t border-gray-50 dark:border-gray-800"
                              >
                                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                                  <FileText className="w-4 h-4 text-blue-500" />
                                </div>
                                <div>
                                  <div>Download Word (.docx)</div>
                                  <div className="text-xs text-gray-400 font-normal">
                                    Editable document
                                  </div>
                                </div>
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                    <button
                      onClick={() => window.print()}
                      className="p-2 hover:bg-white/20 rounded-full transition-colors"
                      title="Print"
                    >
                      <Printer className="w-5 h-5" />
                    </button>
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-white/20 rounded-full transition-colors"
                      title="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex items-start gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1.5 rounded-full">
                          Lesson Plan • Week {plan.week || "N/A"}
                        </span>
                        <span className="text-xs font-medium bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {plan.total_duration_minutes ||
                            getTotalDuration()}{" "}
                          mins
                        </span>
                      </div>
                      <div className="flex flex-row items-center gap-2">
                        <h2 className="text-2xl font-bold">
                          {plan.module_name ||
                            plan.session_code ||
                            "Lesson Plan Details"}
                        </h2>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {new Date(plan.lesson_date).toLocaleDateString(
                                undefined,
                                {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          </div>
                          {plan.start_time && plan.end_time && (
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>
                                {plan.start_time} - {plan.end_time}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div
                  className="p-8 space-y-8 overflow-y-auto"
                  style={{ height: "calc(100vh - 240px)" }}
                >
                  {/* Overview Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Instructor
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {plan.instructor_name || "Not specified"}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="w-4 h-4 text-purple-500" />
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Class
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {plan.class_name || "N/A"} (
                        {plan.number_of_trainees || 0} Trainees)
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Session Code
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {plan.session_code || "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Big Question */}
                  {plan.big_question && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-800/30">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-800/30 flex items-center justify-center flex-shrink-0">
                          <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-blue-900 dark:text-blue-100 mb-2">
                            Big Question / Goal
                          </h3>
                          <p className="text-lg text-blue-800 dark:text-blue-200 leading-relaxed italic">
                            "{plan.big_question}"
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Learning Outcomes */}
                  {plan.outcomes && plan.outcomes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        Learning Outcomes
                      </h3>
                      <div className="space-y-4">
                        {plan.outcomes.map((outcome, idx) => (
                          <div
                            key={idx}
                            className="p-5 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-800 transition-colors bg-white dark:bg-gray-900 shadow-sm"
                          >
                            <div className="flex items-start gap-4">
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 flex items-center justify-center text-sm font-bold">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <h4 className="font-bold text-gray-900 dark:text-white mb-1">
                                  {outcome.title}
                                </h4>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                  {outcome.description}
                                </p>
                                {outcome.resources &&
                                  outcome.resources.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                      {outcome.resources.map((res, resIdx) => (
                                        <span
                                          key={resIdx}
                                          className="px-2 py-1 rounded-md text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 font-medium"
                                        >
                                          {res.resource_name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lesson Flow */}
                  {plan.sections && plan.sections.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide mb-4 flex items-center gap-2">
                        <List className="w-4 h-4 text-orange-600" />
                        Lesson Flow
                      </h3>
                      <div className="space-y-6">
                        {plan.sections.map((section, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-50 dark:bg-gray-800/30 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50"
                          >
                            <div className="flex items-center justify-between mb-4">
                              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                                {section.section_type}
                              </span>
                              <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {section.duration_minutes} min
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase block mb-2">
                                  Teacher Activity
                                </span>
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                  {section.trainer_activities ||
                                    "No activities specified"}
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase block mb-2">
                                  Learner Activity
                                </span>
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                  {section.learner_activities ||
                                    "No activities specified"}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assignments */}
                  {plan.assignments && plan.assignments.length > 0 && (
                    <div className="bg-purple-50 dark:bg-purple-900/10 rounded-2xl p-6 border border-purple-100 dark:border-purple-800/30">
                      <h3 className="text-sm font-bold text-purple-900 dark:text-purple-100 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-600" />
                        Assignments / Homework
                      </h3>
                      <div className="space-y-3">
                        {plan.assignments.map((assignment, idx) => (
                          <div key={idx} className="flex gap-3">
                            <div className="w-5 h-5 rounded-full bg-purple-200 dark:bg-purple-800/40 text-purple-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                              {idx + 1}
                            </div>
                            <p className="text-sm text-purple-800 dark:text-purple-200">
                              {assignment.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => plan.id && onDelete(plan.id)}
                      className="px-6 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Plan
                    </button>
                    <button
                      onClick={() => onEdit(plan)}
                      className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <Edit className="w-4 h-4" />
                      Edit Lesson Plan
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default LessonPlanPreviewModal;
