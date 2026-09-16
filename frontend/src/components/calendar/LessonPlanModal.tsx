import React, { useState } from "react";
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
  Sparkles,
  PenLine,
  ArrowLeft,
} from "lucide-react";
import LessonPlanAIGenerate from "../LessonPlanAIGenerate";
import LessonPlanEditForm from "../LessonPlanModal";
import { useUser } from "../../contexts/UserContext";

interface LessonPlanModalProps {
  showModal: boolean;
  lessonPlan: any;
  onClose: () => void;
  /** Called after the AI finishes (re)generating this lesson plan, so the
   *  caller can refetch and hand back the freshly saved plan. */
  onGenerated?: () => void;
}

type ViewMode = "preview" | "editChoice" | "ai" | "manual";

const LessonPlanModal: React.FC<LessonPlanModalProps> = ({
  showModal,
  lessonPlan,
  onClose,
  onGenerated,
}) => {
  const { user } = useUser();
  const [mode, setMode] = useState<ViewMode>("preview");

  if (!showModal) return null;

  // Full-access viewers (teacher/admin) get an entry_id back even when no
  // plan has been generated yet — that's what lets AI generation happen
  // straight from this preview instead of only from the Scheme of Work page.
  const entryId: number | undefined = lessonPlan?.entry_id;
  const canGenerate = !!entryId && !lessonPlan?.is_summary;
  // has_plan === false is the explicit "nothing generated yet" signal from
  // the backend, but a stale/partial LO_Lesson row (e.g. left over from an
  // interrupted save) can come back with has_plan simply absent — a "plan"
  // with no date, no outcomes and no sections isn't actually usable, so
  // treat it the same as no plan rather than rendering a mostly-blank
  // detail view with no way to fix it. The summary payload (student view)
  // never includes outcomes/sections by design, so it's judged on lesson_date
  // alone rather than being incorrectly caught by this check.
  const hasSubstance = lessonPlan?.is_summary
    ? !!lessonPlan?.lesson_date
    : !!lessonPlan?.lesson_date &&
      ((lessonPlan?.outcomes?.length ?? 0) > 0 ||
        (lessonPlan?.sections?.length ?? 0) > 0);
  const hasPlan =
    !!lessonPlan && lessonPlan.has_plan !== false && hasSubstance;
  // A row exists but is empty (as opposed to no row/entry resolving at all)
  // gets a more accurate "incomplete" label instead of the generic one.
  const isStalePlan = !!lessonPlan && !lessonPlan.is_summary && !hasSubstance;
  const emptyStateTitle = isStalePlan
    ? "This lesson plan is incomplete"
    : "No lesson plan yet";

  // Editing an *existing* plan is restricted to whoever created it — the
  // backend enforces this too (see startAILessonGeneration/
  // createOrUpdateLessonPlan), this just keeps the UI from offering an
  // action that would only 403 anyway.
  const currentUserId: number | undefined = user?.user?.user_id;
  const isOwner = !!currentUserId && lessonPlan?.user_id === currentUserId;
  const canEdit = hasPlan && isOwner;

  const closeAndReset = () => {
    setMode("preview");
    onClose();
  };

  // Reuses the full create/edit form used elsewhere (Scheme of Work
  // calendar) so "Edit Manually" isn't a second implementation of the same
  // form — it owns its own full-screen overlay, so this renders in place of
  // (not nested inside) this modal's own chrome.
  if (mode === "manual" && entryId) {
    return (
      <LessonPlanEditForm
        isOpen={true}
        onClose={() => setMode("preview")}
        entryId={entryId}
        initialData={{
          ...lessonPlan,
          // An AI-generated plan never captures a real start_time/end_time
          // (that path saves them as null) — fall back to the actual
          // timetable slot's time rather than leaving the edit form's Time
          // Slot fields blank when the real time is right there on the
          // calendar slot this plan was opened from.
          start_time: lessonPlan?.start_time || lessonPlan?.slot_start_time,
          end_time: lessonPlan?.end_time || lessonPlan?.slot_end_time,
        }}
        onSaved={() => {
          setMode("preview");
          onGenerated?.();
        }}
      />
    );
  }

  // First-time generation (no plan yet) is open to any full-access viewer
  // tied to the entry; once a plan exists, only its creator may touch it.
  const showHeaderAction =
    mode === "preview" && ((!hasPlan && canGenerate) || canEdit);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4">
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl w-full max-w-4xl max-h-[95vh] overflow-hidden shadow-2xl shadow-black/20 border border-gray-200/80 dark:border-white/10 flex flex-col animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="relative flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/10 bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 overflow-hidden">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/25">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                {mode === "ai"
                  ? "Generate with AI"
                  : mode === "editChoice"
                    ? "Edit Lesson Plan"
                    : lessonPlan?.is_summary
                      ? "Lesson Plan Summary"
                      : "Detailed Lesson Plan"}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {lessonPlan?.module_name || "Structured Pedagogical Guide"}
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-2">
            {showHeaderAction && (
              <button
                onClick={() => setMode(canEdit ? "editChoice" : "ai")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-full shadow-sm shadow-blue-600/25 transition-all hover:-translate-y-0.5"
              >
                {canEdit ? (
                  <PenLine className="w-3.5 h-3.5" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {canEdit ? "Edit" : "Generate with AI"}
              </button>
            )}
            <button
              onClick={closeAndReset}
              className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>
          </div>
        </div>

        {mode === "editChoice" ? (
          <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center">
            <div className="w-full max-w-xl">
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
                How would you like to edit this lesson plan?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setMode("manual")}
                  className="group p-6 text-left bg-white dark:bg-gray-800/60 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl transition-all hover:-translate-y-0.5"
                >
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-3">
                    <PenLine className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="font-bold text-gray-900 dark:text-white mb-1">
                    Edit Manually
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Open the full form and adjust every field yourself.
                  </p>
                </button>
                <button
                  onClick={() => setMode("ai")}
                  className="group p-6 text-left bg-white dark:bg-gray-800/60 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-2xl transition-all hover:-translate-y-0.5"
                >
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-3">
                    <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="font-bold text-gray-900 dark:text-white mb-1">
                    Edit by AI
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Regenerate the plan — optionally steer it with your own instructions.
                  </p>
                </button>
              </div>
              <button
                onClick={() => setMode("preview")}
                className="mt-6 mx-auto flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            </div>
          </div>
        ) : mode === "ai" && entryId ? (
          <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center">
            <LessonPlanAIGenerate
              entryId={entryId}
              lessonId={hasPlan ? lessonPlan?.id : undefined}
              weekLabel={lessonPlan?.week_number ? `Week ${lessonPlan.week_number}` : undefined}
              topic={lessonPlan?.topic || lessonPlan?.module_name}
              lessonDate={lessonPlan?.lesson_date}
              onComplete={() => {
                setMode("preview");
                onGenerated?.();
              }}
              onCancel={() => setMode(canEdit ? "editChoice" : "preview")}
            />
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
          {hasPlan ? (
            <>
              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="group p-4 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/10 dark:to-gray-900 rounded-2xl border border-blue-100/70 dark:border-blue-900/30 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2 mb-1.5 text-blue-500">
                    <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Calendar className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Date
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                    {new Date(lessonPlan.lesson_date || "N/A").toUTCString()}
                  </p>
                </div>
                <div className="group p-4 bg-gradient-to-br from-violet-50 to-white dark:from-violet-900/10 dark:to-gray-900 rounded-2xl border border-violet-100/70 dark:border-violet-900/30 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2 mb-1.5 text-violet-500">
                    <div className="p-1.5 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Time
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">
                    {lessonPlan.start_time} - {lessonPlan.end_time}
                  </p>
                </div>
                <div className="group p-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/10 dark:to-gray-900 rounded-2xl border border-emerald-100/70 dark:border-emerald-900/30 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2 mb-1.5 text-emerald-500">
                    <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Sector
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100">
                    {lessonPlan.sector || "N/A"}
                  </p>
                </div>
                <div className="group p-4 bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/10 dark:to-gray-900 rounded-2xl border border-amber-100/70 dark:border-amber-900/30 hover:shadow-md hover:-translate-y-0.5 transition-all">
                  <div className="flex items-center gap-2 mb-1.5 text-amber-500">
                    <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Trade
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 truncate">
                    {lessonPlan.trade || "N/A"}
                  </p>
                </div>
              </div>

              {/* Big Question */}
              <div className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-6 rounded-2xl text-white shadow-lg shadow-indigo-600/20 overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                <h4 className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 opacity-90">
                  <Target className="w-4 h-4" />
                  The Big Question
                </h4>
                <p className="relative text-xl font-medium leading-relaxed">
                  "{lessonPlan.big_question || "What will we achieve today?"}"
                </p>
              </div>

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
                      className="p-5 bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full">
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
              <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                <FileText className="w-12 h-12 text-blue-300 dark:text-blue-500/50" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                  {emptyStateTitle}
                </h4>
                {(lessonPlan?.week_number || lessonPlan?.topic) && (
                  <p className="text-xs font-semibold text-blue-500 dark:text-blue-400 uppercase tracking-wide mt-1">
                    {lessonPlan?.week_number ? `Week ${lessonPlan.week_number}` : ""}
                    {lessonPlan?.week_number && lessonPlan?.topic ? " · " : ""}
                    {lessonPlan?.topic || ""}
                  </p>
                )}
                <p className="text-gray-500 max-w-xs mx-auto mt-1">
                  {canGenerate
                    ? "Let AI build a full, classroom-ready plan from this week's scheme of work entry."
                    : lessonPlan?.is_summary
                      ? "Your teacher hasn't finalized this lesson yet — check back closer to the date."
                      : "No scheme of work entry is linked to this subject/class yet, so there's nothing for AI to build from. Set up a scheme of work first."}
                </p>
              </div>
              {canGenerate && (
                <button
                  onClick={() => setMode("ai")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-full shadow-sm shadow-blue-600/25 transition-all hover:-translate-y-0.5"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate with AI
                </button>
              )}
            </div>
          )}
        </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-end bg-gray-50/30 dark:bg-gray-900/30">
          <button
            onClick={closeAndReset}
            className="px-6 py-2.5 bg-gray-200/50 text-black dark:text-white dark:bg-gray-800 rounded-2xl font-bold text-sm transition-all active:scale-95"
          >
            Close Document
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonPlanModal;
