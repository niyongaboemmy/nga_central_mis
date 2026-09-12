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

  const overviewTiles = [
    {
      key: "instructor",
      label: "Instructor",
      value: plan.instructor_name || "Not specified",
      icon: User,
      color: "text-blue-500",
    },
    {
      key: "class",
      label: "Class",
      value: `${plan.class_name || "N/A"} (${plan.number_of_trainees || 0} trainees)`,
      icon: BookOpen,
      color: "text-purple-500",
    },
    {
      key: "session",
      label: "Session Code",
      value: plan.session_code || "N/A",
      icon: Target,
      color: "text-emerald-500",
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative w-full max-w-3xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800/50 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 text-white flex-shrink-0">
              <div className="absolute top-3.5 right-3.5 flex items-center gap-1">
                <div className="relative">
                  <button
                    onClick={() => setIsDownloadMenuOpen((v) => !v)}
                    disabled={!!downloadingFormat}
                    className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-white/20 rounded-full transition-colors text-xs font-semibold disabled:opacity-60"
                    title="Download"
                  >
                    {downloadingFormat ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    Download
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${isDownloadMenuOpen ? "rotate-180" : ""}`}
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
                          className="absolute right-0 mt-2 w-52 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-20 text-gray-900 dark:text-white"
                        >
                          <button
                            onClick={handleDownloadPDF}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                          >
                            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center flex-shrink-0">
                              <FileDown className="w-3.5 h-3.5 text-rose-500" />
                            </div>
                            <div>
                              <div>Download PDF</div>
                              <div className="text-[10px] text-gray-400 font-normal">
                                Print-ready, well formatted
                              </div>
                            </div>
                          </button>
                          <button
                            onClick={handleDownloadDocx}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left border-t border-gray-50 dark:border-gray-800"
                          >
                            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                              <FileText className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                            <div>
                              <div>Download Word (.docx)</div>
                              <div className="text-[10px] text-gray-400 font-normal">
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
                  className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                  title="Print"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-start gap-3 pr-24">
                <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                      Week {plan.week || "N/A"}
                    </span>
                    <span className="text-[10px] font-semibold bg-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      {plan.total_duration_minutes || getTotalDuration()} mins
                    </span>
                  </div>
                  <h2 className="text-base font-bold leading-snug">
                    {plan.module_name || plan.session_code || "Lesson Plan Details"}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/80 mt-1.5">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {new Date(plan.lesson_date).toLocaleDateString(
                          undefined,
                          { weekday: "short", month: "short", day: "numeric", year: "numeric" },
                        )}
                      </span>
                    </div>
                    {plan.start_time && plan.end_time && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {plan.start_time} - {plan.end_time}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {overviewTiles.map((tile) => (
                  <div
                    key={tile.key}
                    className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <tile.icon className={`w-3.5 h-3.5 ${tile.color}`} />
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {tile.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {tile.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Big Question */}
              {plan.big_question && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/30">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800/30 flex items-center justify-center flex-shrink-0">
                      <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold text-blue-900 dark:text-blue-100 uppercase tracking-wide mb-1">
                        Big Question / Goal
                      </h3>
                      <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed italic">
                        "{plan.big_question}"
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Learning Outcomes */}
              {plan.outcomes && plan.outcomes.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    Learning Outcomes
                  </h3>
                  <div className="space-y-2">
                    {plan.outcomes.map((outcome, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/60"
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">
                              {outcome.title}
                            </h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                              {outcome.description}
                            </p>
                            {outcome.resources && outcome.resources.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {outcome.resources.map((res, resIdx) => (
                                  <span
                                    key={resIdx}
                                    className="px-2 py-0.5 rounded-md text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 font-medium"
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
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <List className="w-3.5 h-3.5 text-orange-600" />
                    Lesson Flow
                  </h3>
                  <div className="space-y-2.5">
                    {plan.sections.map((section, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3.5 border border-gray-100 dark:border-gray-800"
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                            {section.section_type}
                          </span>
                          <span className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {section.duration_minutes} min
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase block mb-1">
                              Teacher Activity
                            </span>
                            <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                              {section.trainer_activities || "No activities specified"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase block mb-1">
                              Learner Activity
                            </span>
                            <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                              {section.learner_activities || "No activities specified"}
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
                <div className="bg-purple-50 dark:bg-purple-900/10 rounded-xl p-4 border border-purple-100 dark:border-purple-800/30">
                  <h3 className="text-xs font-bold text-purple-900 dark:text-purple-100 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    Assignments / Homework
                  </h3>
                  <div className="space-y-2">
                    {plan.assignments.map((assignment, idx) => (
                      <div key={idx} className="flex gap-2.5">
                        <div className="w-4 h-4 rounded-full bg-purple-200 dark:bg-purple-800/40 text-purple-600 flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <p className="text-xs text-purple-800 dark:text-purple-200 leading-relaxed">
                          {assignment.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div className="flex justify-between items-center">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all"
                >
                  Close
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => plan.id && onDelete(plan.id)}
                    className="px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/40 active:scale-95 transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <button
                    onClick={() => onEdit(plan)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full active:scale-95 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Edit Lesson Plan
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default LessonPlanPreviewModal;
