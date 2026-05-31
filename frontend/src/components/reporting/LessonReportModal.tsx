import React, { useState } from "react";
import {
  X,
  BookOpen,
  Users,
  Target,
  CheckCircle2,
  AlertCircle,
  Clock,
  Link,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { reportsApi, ReportableLesson } from "../../api/reports";
import { useToast } from "../../contexts/ToastContext";

interface Props {
  lesson: ReportableLesson;
  academicTermId: number | null;
  onClose: () => void;
  onSubmitted: () => void;
}

const STATUS_OPTIONS: {
  value: "DELIVERED" | "PARTIAL" | "MISSED";
  label: string;
  icon: React.ReactNode;
  active: string;
  inactive: string;
}[] = [
  {
    value: "DELIVERED",
    label: "Delivered",
    icon: <CheckCircle2 className="w-4 h-4" />,
    active:
      "bg-green-600 text-white border-green-600 shadow-sm",
    inactive:
      "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-green-400 hover:text-green-600",
  },
  {
    value: "PARTIAL",
    label: "Partial",
    icon: <Clock className="w-4 h-4" />,
    active:
      "bg-yellow-500 text-white border-yellow-500 shadow-sm",
    inactive:
      "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-yellow-400 hover:text-yellow-600",
  },
  {
    value: "MISSED",
    label: "Missed",
    icon: <AlertCircle className="w-4 h-4" />,
    active:
      "bg-red-600 text-white border-red-600 shadow-sm",
    inactive:
      "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-red-400 hover:text-red-600",
  },
];

const LessonReportModal: React.FC<Props> = ({
  lesson,
  academicTermId,
  onClose,
  onSubmitted,
}) => {
  const { showToast } = useToast();

  const [status, setStatus] = useState<"DELIVERED" | "PARTIAL" | "MISSED">(
    "DELIVERED",
  );
  const [attendanceCount, setAttendanceCount] = useState<number | "">("");
  const [completionRate, setCompletionRate] = useState(100);
  const [reflectionNotes, setReflectionNotes] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOutcomes, setShowOutcomes] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await reportsApi.submitLessonReport({
        lesson_id:        lesson.lesson_id ?? undefined,
        entry_id:         lesson.entry_id  ?? undefined,
        delivery_date:    lesson.date,
        status,
        attendance_count: attendanceCount !== "" ? Number(attendanceCount) : undefined,
        completion_rate:  completionRate,
        reflection_notes: reflectionNotes.trim() || undefined,
        evidence_url:     evidenceUrl.trim()      || undefined,
        academic_term_id: academicTermId ?? undefined,
      });
      showToast("Lesson report submitted successfully", "success");
      onSubmitted();
      onClose();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Failed to submit report",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const formattedDate = new Date(lesson.date + "T00:00:00").toLocaleDateString(
    "en-GB",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              Lesson Report
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {formattedDate}
              {lesson.start_time && lesson.end_time && (
                <span className="ml-2">
                  · {lesson.start_time}–{lesson.end_time}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Read-only context */}
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <BookOpen className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {lesson.module_code ?? lesson.subject_code ?? "—"}
                </span>
                {lesson.subject_name && (
                  <span className="text-gray-500 dark:text-gray-400 ml-2">
                    · {lesson.subject_name}
                  </span>
                )}
              </div>
            </div>

            {lesson.topic && (
              <div className="pl-6">
                <p className="text-gray-700 dark:text-gray-300 font-medium">
                  {lesson.topic}
                </p>
                {lesson.sub_topic && (
                  <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                    {lesson.sub_topic}
                  </p>
                )}
              </div>
            )}

            {lesson.big_question && (
              <div className="pl-6 italic text-gray-500 dark:text-gray-400 text-xs border-l-2 border-blue-200 dark:border-blue-800">
                {lesson.big_question}
              </div>
            )}

            {lesson.learning_outcomes && lesson.learning_outcomes.length > 0 && (
              <div className="pl-6">
                <button
                  type="button"
                  onClick={() => setShowOutcomes((p) => !p)}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Target className="w-3.5 h-3.5" />
                  {lesson.learning_outcomes.length} Learning Outcome
                  {lesson.learning_outcomes.length !== 1 ? "s" : ""}
                  {showOutcomes ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                {showOutcomes && (
                  <ul className="mt-2 space-y-1">
                    {lesson.learning_outcomes.map((lo, i) => (
                      <li
                        key={i}
                        className="text-xs text-gray-600 dark:text-gray-400"
                      >
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {lo.code ?? `LO${i + 1}`}
                        </span>
                        {lo.title && ` — ${lo.title}`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Delivery status */}
          <form id="lesson-report-form" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Delivery Status
                </label>
                <div className="flex gap-2">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        status === opt.value ? opt.active : opt.inactive
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Attendance */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Attendance Count
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={attendanceCount}
                  onChange={(e) =>
                    setAttendanceCount(
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
                  }
                  placeholder="Number of students present"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Completion rate */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Completion Rate —{" "}
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    {completionRate}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={completionRate}
                  onChange={(e) => setCompletionRate(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Reflection */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Reflection / Challenges
                </label>
                <textarea
                  rows={3}
                  value={reflectionNotes}
                  onChange={(e) => setReflectionNotes(e.target.value)}
                  placeholder="What worked well? Any challenges encountered?"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Evidence URL */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  <span className="flex items-center gap-1.5">
                    <Link className="w-3.5 h-3.5" />
                    Evidence URL
                    <span className="text-gray-400 font-normal normal-case tracking-normal">
                      (optional)
                    </span>
                  </span>
                </label>
                <input
                  type="url"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="lesson-report-form"
            disabled={loading}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {loading ? "Submitting…" : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonReportModal;
