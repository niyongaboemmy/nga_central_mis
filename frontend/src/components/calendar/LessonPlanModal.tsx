import React from "react";
import {
  X,
  FileText,
  Target,
  Clock,
  BookOpen,
  ClipboardList,
  MessageSquare,
  CheckCircle2,
  Calendar,
  Layers,
  MapPin,
} from "lucide-react";

interface LessonPlanModalProps {
  showModal: boolean;
  lessonPlan: any;
  onClose: () => void;
}

const LessonPlanModal: React.FC<LessonPlanModalProps> = ({
  showModal,
  lessonPlan,
  onClose,
}) => {
  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-4xl max-h-[95vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700/20 flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {lessonPlan?.is_summary
                  ? "Lesson Plan Summary"
                  : "Detailed Lesson Plan"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {lessonPlan?.module_name || "Structured Pedagogical Guide"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {lessonPlan ? (
            <>
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-1 text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">
                      Date
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">
                    {lessonPlan.lesson_date || "N/A"}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-1 text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">
                      Time
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">
                    {lessonPlan.start_time} - {lessonPlan.end_time}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-1 text-gray-500">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">
                      Sector
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">
                    {lessonPlan.sector || "N/A"}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 mb-1 text-gray-500">
                    <Layers className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">
                      Trade
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                    {lessonPlan.trade || "N/A"}
                  </p>
                </div>
              </div>

              {/* Big Question */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-2xl text-white shadow-lg">
                <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider mb-2 opacity-90">
                  <Target className="w-4 h-4" />
                  The Big Question
                </h4>
                <p className="text-xl font-medium leading-relaxed">
                  "{lessonPlan.big_question || "What will we achieve today?"}"
                </p>
              </div>

              {!lessonPlan.is_summary && <></>}

              {/* Learning Outcomes - Visible in both full and summary views */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 border-l-4 border-emerald-500 pl-4">
                  <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                    Learning Outcomes
                  </h4>
                </div>
                <div className="grid gap-4">
                  {lessonPlan.outcomes?.map((outcome: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-md">
                          {outcome.code || `LO${idx + 1}`}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          {outcome.duration_minutes || 0} min
                        </div>
                      </div>
                      <h5 className="font-bold text-gray-900 dark:text-white mb-2">
                        {outcome.title}
                      </h5>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                        {outcome.description}
                      </p>

                      {/* Activities within LO - only in full mode */}
                      {!lessonPlan.is_summary && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                          <div>
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-2">
                              Trainer Activities
                            </span>
                            <ul className="space-y-2">
                              {outcome.activities?.map(
                                (act: any, aIdx: number) => (
                                  <li
                                    key={aIdx}
                                    className="text-xs text-gray-600 dark:text-gray-400 flex gap-2"
                                  >
                                    <span className="text-blue-500">•</span>
                                    {act.trainer_activities}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest block mb-2">
                              Learner Activities
                            </span>
                            <ul className="space-y-2">
                              {outcome.activities?.map(
                                (act: any, aIdx: number) => (
                                  <li
                                    key={aIdx}
                                    className="text-xs text-gray-600 dark:text-gray-400 flex gap-2"
                                  >
                                    <span className="text-orange-500">•</span>
                                    {act.learner_activities}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {(!lessonPlan.outcomes ||
                    lessonPlan.outcomes.length === 0) && (
                    <p className="text-sm text-gray-500 italic p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
                      No specific learning outcomes defined.
                    </p>
                  )}
                </div>
              </section>

              {!lessonPlan.is_summary && (
                <>
                  {/* Lesson Flow / Sections */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 border-l-4 border-amber-500 pl-4">
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white">
                        Lesson Flow
                      </h4>
                    </div>
                    <div className="space-y-4">
                      {["Introduction", "Development", "Conclusion"].map(
                        (type) => {
                          const section = lessonPlan.sections?.find(
                            (s: any) => s.section_type === type,
                          );
                          return (
                            <div
                              key={type}
                              className="relative pl-8 pb-4 border-l-2 border-gray-100 dark:border-gray-800 last:border-0"
                            >
                              <div className="absolute -left-[9px] top-0 w-4 h-4 bg-amber-500 rounded-full border-4 border-white dark:border-gray-900 shadow-sm"></div>
                              <div className="flex justify-between items-center mb-3">
                                <h5 className="font-bold text-gray-900 dark:text-white">
                                  {type}
                                </h5>
                                {section && (
                                  <span className="text-xs text-gray-500 flex items-center gap-1 font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                                    <Clock className="w-3 h-3" />{" "}
                                    {section.duration_minutes} min
                                  </span>
                                )}
                              </div>
                              {section ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50/50 dark:bg-gray-800/30 p-4 rounded-xl">
                                  <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                                      Trainer Activities
                                    </span>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {section.trainer_activities}
                                    </p>
                                  </div>
                                  <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                                      Learner Activities
                                    </span>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {section.learner_activities}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">
                                  No details provided for this phase.
                                </p>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  </section>

                  {/* Assignments & Indicative Content */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Indicative Content */}
                    <section className="space-y-4">
                      <div className="flex items-center gap-2 border-l-4 border-purple-500 pl-4">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-purple-500" />
                          Indicative Content
                        </h4>
                      </div>
                      <div className="space-y-3">
                        {lessonPlan.indicativeContent?.map(
                          (item: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-4 bg-purple-50/30 dark:bg-purple-900/10 rounded-xl border border-purple-100/50 dark:border-purple-800/30"
                            >
                              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest block mb-1">
                                {item.category}
                              </span>
                              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                {item.content}
                              </p>
                            </div>
                          ),
                        )}
                        {(!lessonPlan.indicativeContent ||
                          lessonPlan.indicativeContent.length === 0) && (
                          <p className="text-sm text-gray-400 italic">
                            No indicative content listed.
                          </p>
                        )}
                      </div>
                    </section>

                    {/* Assignments */}
                    <section className="space-y-4">
                      <div className="flex items-center gap-2 border-l-4 border-rose-500 pl-4">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <ClipboardList className="w-5 h-5 text-rose-500" />
                          Assignments
                        </h4>
                      </div>
                      <div className="space-y-3">
                        {lessonPlan.assignments?.map(
                          (item: any, idx: number) => (
                            <div
                              key={idx}
                              className="p-4 bg-rose-50/30 dark:bg-rose-900/10 rounded-xl border border-rose-100/50 dark:border-rose-800/30 flex gap-3"
                            >
                              <div className="mt-1">
                                <CheckCircle2 className="w-4 h-4 text-rose-500" />
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {item.description}
                              </p>
                            </div>
                          ),
                        )}
                        {(!lessonPlan.assignments ||
                          lessonPlan.assignments.length === 0) && (
                          <p className="text-sm text-gray-400 italic">
                            No specific assignments given.
                          </p>
                        )}
                      </div>
                    </section>
                  </div>

                  {/* Evaluation & Footer Info */}
                  <section className="pt-8 border-t border-gray-100 dark:border-gray-800">
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
                      <div className="flex flex-col md:flex-row gap-8">
                        <div className="flex-1 space-y-3">
                          <h5 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                            <MessageSquare className="w-4 h-4 text-blue-500" />
                            Teacher's Evaluation Notes
                          </h5>
                          <p className="text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">
                            {lessonPlan.evaluation?.teacher_notes ||
                              "Continuous assessment planned during interactive development phase."}
                          </p>
                        </div>
                        <div className="w-full md:w-64 space-y-4">
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                              Prepared By
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-[10px] text-white font-bold uppercase">
                                {lessonPlan.evaluation?.prepared_by?.charAt(
                                  0,
                                ) || "T"}
                              </div>
                              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                {lessonPlan.evaluation?.prepared_by ||
                                  lessonPlan.instructor_name ||
                                  "Assigned Instructor"}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                              Status
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> VERIFIED
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-full">
                <FileText className="w-12 h-12 text-gray-300" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                  Empty Lesson Plan
                </h4>
                <p className="text-gray-500 max-w-xs mx-auto">
                  No comprehensive lesson data has been compiled for this
                  specific slot yet.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end bg-gray-50/30 dark:bg-gray-900/30">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-95"
          >
            Close Document
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonPlanModal;
