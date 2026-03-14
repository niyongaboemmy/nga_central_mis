import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Calendar,
  Target,
  BookOpen,
  CheckCircle2,
  FileText,
  Clock,
  Edit,
  Trash2,
} from "lucide-react";
import { SchemeEntry } from "../api/schemeOfWork";
import { LessonPlan } from "../api/lessonPlan";

interface SchemeOfWorkPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: SchemeEntry | null;
  lessonPlans?: LessonPlan[];
  onLessonPlanClick?: (plan: LessonPlan) => void;
  onEdit?: (entry: SchemeEntry) => void;
  onDelete?: (id: number) => void;
}

const SchemeOfWorkPreviewModal: React.FC<SchemeOfWorkPreviewModalProps> = ({
  isOpen,
  onClose,
  entry,
  lessonPlans = [],
  onLessonPlanClick,
  onEdit,
  onDelete,
}) => {
  if (!entry) return null;

  const getStatusBadge = () => {
    const plans = lessonPlans || [];
    const today = new Date();
    const endDate = new Date(entry.end_date);

    if (plans.length === 0) {
      const status = endDate < today ? "missing" : "incomplete";
      return status === "missing" ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-full">
          <Clock className="w-3 h-3" />
          Missing Plans
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1 rounded-full">
          <Clock className="w-3 h-3" />
          In Progress
        </span>
      );
    }

    const hasCompletePlan = plans.some(
      (p) =>
        p.big_question ||
        (p.outcomes && p.outcomes.length > 0) ||
        (p.sections && p.sections.length > 0),
    );

    return hasCompletePlan ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        Complete
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1 rounded-full">
        <Clock className="w-3 h-3" />
        In Progress
      </span>
    );
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
          <div className="fixed -top-8 inset-0 z-50 overflow-y-auto">
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
                <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 px-8 py-6 text-white">
                  <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>

                  <div className="flex items-start gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1.5 rounded-full">
                          Week {entry.week_number}
                        </span>
                        {getStatusBadge()}
                      </div>
                      <h2 className="text-2xl font-bold mb-2">{entry.topic}</h2>
                      {entry.sub_topic && (
                        <p className="text-base text-white/90 mb-3">
                          {entry.sub_topic}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-white/80">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {new Date(entry.start_date).toLocaleDateString(
                            undefined,
                            {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}{" "}
                          -{" "}
                          {new Date(entry.end_date).toLocaleDateString(
                            undefined,
                            {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-8 space-y-8 max-h-[calc(100vh-22rem)] overflow-y-auto">
                  {/* Main Objective */}
                  {entry.objective && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-800/30">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-800/30 flex items-center justify-center flex-shrink-0">
                          <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base font-bold text-blue-900 dark:text-blue-100 mb-2">
                            Learning Objective
                          </h3>
                          <p className="text-base text-blue-800 dark:text-blue-200 leading-relaxed">
                            {entry.objective}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Details Grid */}
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Methodology */}
                    {entry.methodology && (
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-800/30 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          </div>
                          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Methodology
                          </h3>
                        </div>
                        <p className="text-base text-gray-900 dark:text-white leading-relaxed">
                          {entry.methodology}
                        </p>
                      </div>
                    )}

                    {/* Resources */}
                    {entry.resources && (
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-800/30 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-green-600 dark:text-green-400" />
                          </div>
                          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Resources
                          </h3>
                        </div>
                        <p className="text-base text-gray-900 dark:text-white leading-relaxed">
                          {entry.resources}
                        </p>
                      </div>
                    )}

                    {/* Evaluation */}
                    {entry.evaluation && (
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-800/30 rounded-2xl p-6 border border-gray-200 dark:border-gray-700/50 hover:shadow-md transition-shadow md:col-span-2">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                            Evaluation
                          </h3>
                        </div>
                        <p className="text-base text-gray-900 dark:text-white leading-relaxed">
                          {entry.evaluation}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Lesson Plans */}
                  {lessonPlans.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          Lesson Plans
                        </h3>
                        <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
                          {lessonPlans.length}{" "}
                          {lessonPlans.length === 1 ? "Plan" : "Plans"}
                        </span>
                      </div>
                      <div className="grid gap-3">
                        {lessonPlans.map((plan) => (
                          <button
                            key={plan.id}
                            onClick={() => onLessonPlanClick?.(plan)}
                            className="flex items-center justify-between p-5 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-800/30 hover:from-blue-50 hover:to-blue-100/50 dark:hover:from-blue-900/20 dark:hover:to-blue-900/10 border border-gray-200 dark:border-gray-700/50 hover:border-blue-300 dark:hover:border-blue-700 rounded-2xl transition-all group hover:shadow-md"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                                <FileText className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div className="text-left">
                                <div className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                                  {new Date(
                                    plan.lesson_date,
                                  ).toLocaleDateString(undefined, {
                                    weekday: "long",
                                    month: "long",
                                    day: "numeric",
                                  })}
                                </div>
                                {plan.big_question && (
                                  <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                                    {plan.big_question}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg
                                className="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <button
                      onClick={onClose}
                      className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Close
                    </button>
                    <div className="flex items-center gap-3">
                      {onDelete && (
                        <button
                          onClick={() => onDelete(entry.entry_id)}
                          className="px-6 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete Entry
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(entry)}
                          className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
                        >
                          <Edit className="w-4 h-4" />
                          Edit Entry
                        </button>
                      )}
                    </div>
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

export default SchemeOfWorkPreviewModal;
