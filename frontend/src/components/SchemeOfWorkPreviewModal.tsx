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
  ChevronRight,
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

  // `week_number` is sometimes stored pre-formatted (e.g. "Week 2") and
  // sometimes as a bare number ("2") depending on how the entry was created.
  // Only prefix "Week" when the value doesn't already say so, otherwise it
  // renders as "WEEK WEEK 2" once the uppercase style is applied.
  const weekLabel = /^week\b/i.test(String(entry.week_number))
    ? String(entry.week_number)
    : `Week ${entry.week_number}`;

  const getStatusBadge = () => {
    const plans = lessonPlans || [];
    const today = new Date();
    const endDate = new Date(entry.end_date);

    if (plans.length === 0) {
      const status = endDate < today ? "missing" : "incomplete";
      return status === "missing" ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full whitespace-nowrap">
          <Clock className="w-3 h-3" />
          Missing Plans
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full whitespace-nowrap">
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
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        <CheckCircle2 className="w-3 h-3" />
        Complete
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        <Clock className="w-3 h-3" />
        In Progress
      </span>
    );
  };

  const infoTiles = [
    {
      key: "methodology",
      label: "Methodology",
      value: entry.methodology,
      icon: BookOpen,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-900/20",
    },
    {
      key: "resources",
      label: "Resources",
      value: entry.resources,
      icon: BookOpen,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      key: "evaluation",
      label: "Evaluation",
      value: entry.evaluation,
      icon: CheckCircle2,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-50 dark:bg-orange-900/20",
      span: true,
    },
  ].filter((t) => t.value);

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
            className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800/50 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4 text-white flex-shrink-0">
              <button
                onClick={onClose}
                className="absolute top-3.5 right-3.5 p-1.5 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 pr-8">
                <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {weekLabel}
                    </span>
                    {getStatusBadge()}
                  </div>
                  <h2 className="text-base font-bold leading-snug">
                    {entry.topic}
                  </h2>
                  {entry.sub_topic && (
                    <p className="text-xs text-white/85 mt-1">
                      {entry.sub_topic}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] text-white/75 mt-2">
                    <Calendar className="w-3 h-3" />
                    <span>
                      {new Date(entry.start_date).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}{" "}
                      –{" "}
                      {new Date(entry.end_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Main Objective */}
              {entry.objective && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/30">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-800/30 flex items-center justify-center flex-shrink-0">
                      <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-bold text-blue-900 dark:text-blue-100 uppercase tracking-wide mb-1">
                        Learning Objective
                      </h3>
                      <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                        {entry.objective}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Details Grid */}
              {infoTiles.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {infoTiles.map((tile) => (
                    <div
                      key={tile.key}
                      className={`bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-800 ${
                        tile.span ? "sm:col-span-2" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className={`w-7 h-7 rounded-lg ${tile.bg} flex items-center justify-center flex-shrink-0`}
                        >
                          <tile.icon className={`w-3.5 h-3.5 ${tile.color}`} />
                        </div>
                        <h3 className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          {tile.label}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                        {tile.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Lesson Plans */}
              {lessonPlans.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-500" />
                      Lesson Plans
                    </h3>
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                      {lessonPlans.length}{" "}
                      {lessonPlans.length === 1 ? "plan" : "plans"}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {lessonPlans.map((plan) => (
                      <button
                        key={plan.id}
                        onClick={() => onLessonPlanClick?.(plan)}
                        className="w-full flex items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-100 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl transition-all group hover:-translate-y-0.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="text-left min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {new Date(plan.lesson_date).toLocaleDateString(
                                undefined,
                                { weekday: "long", month: "short", day: "numeric" },
                              )}
                            </div>
                            {plan.big_question && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {plan.big_question}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                      </button>
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
                  {onDelete && (
                    <button
                      onClick={() => onDelete(entry.entry_id)}
                      className="px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-full hover:bg-rose-100 dark:hover:bg-rose-950/40 active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={() => onEdit(entry)}
                      className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full active:scale-95 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Edit Entry
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SchemeOfWorkPreviewModal;
