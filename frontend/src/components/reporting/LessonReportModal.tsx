import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
  Sparkles,
  Check,
} from "lucide-react";
import { reportsApi, ReportableLesson, ReportCategory } from "../../api/reports";
import { myAssignedSubjectsApi, MyAssignedSubject } from "../../api/academics";
import { useToast } from "../../contexts/ToastContext";
import SelectField from "../ui/SelectField";

interface Props {
  lesson: ReportableLesson;
  academicTermId: number | null;
  onClose: () => void;
  onSubmitted: () => void;
  /** Ad-hoc mode: no CalendarSlot/lesson plan behind this occurrence — the
   * instructor picks the subject/class-group directly instead of inheriting
   * them from a scheduled lesson, and status is fixed to UNPLANNED. */
  isAdHoc?: boolean;
  /** Every other reportable occurrence already on this same day — used in
   * ad-hoc create mode to detect that the subject/class-group just picked
   * already has a submitted report, and switch into editing it instead of
   * letting the instructor create a duplicate. */
  existingDayLessons?: ReportableLesson[];
}

const STATUS_OPTIONS: {
  value: "DELIVERED" | "PARTIAL" | "MISSED";
  label: string;
  icon: React.ReactNode;
  activePill: string;
}[] = [
  {
    value: "DELIVERED",
    label: "Delivered",
    icon: <CheckCircle2 className="w-4 h-4" />,
    activePill: "bg-green-600 text-white shadow-sm",
  },
  {
    value: "PARTIAL",
    label: "Partial",
    icon: <Clock className="w-4 h-4" />,
    activePill: "bg-yellow-500 text-white shadow-sm",
  },
  {
    value: "MISSED",
    label: "Missed",
    icon: <AlertCircle className="w-4 h-4" />,
    activePill: "bg-red-600 text-white shadow-sm",
  },
];

const LessonReportModal: React.FC<Props> = ({
  lesson,
  academicTermId,
  onClose,
  onSubmitted,
  isAdHoc = false,
  existingDayLessons = [],
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

  // Editing an already-submitted report: `lesson.lesson_report` is set when
  // this occurrence was opened from a REPORTED day (see
  // LessonReportingCalendar's day-click handling). Full detail (including
  // category selections, which the reportable-lessons summary doesn't carry)
  // is fetched once known and used to prefill the form below.
  const initialReportId = lesson.lesson_report?.lesson_report_id ?? null;
  const [resolvedReportId, setResolvedReportId] = useState<number | null>(initialReportId);
  const existingReportId = resolvedReportId;
  const isEditing = existingReportId !== null;
  const [loadingDetail, setLoadingDetail] = useState(isEditing);
  const [existingSubjectId, setExistingSubjectId] = useState<number | null>(null);
  const [existingClassGroupId, setExistingClassGroupId] = useState<number | null>(null);

  // Ad-hoc mode only: subject/class-group picker, populated from the
  // instructor's own TeacherSubjectAssignment list.
  const [assignedSubjects, setAssignedSubjects] = useState<MyAssignedSubject[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "">("");
  const [selectedClassGroupId, setSelectedClassGroupId] = useState<number | "">("");

  // Categorized Support Needed / Challenges (Phase 4) — available in both
  // scheduled and ad-hoc mode, additive alongside the free-text reflection.
  const [supportCategories, setSupportCategories] = useState<ReportCategory[]>([]);
  const [challengeCategories, setChallengeCategories] = useState<ReportCategory[]>([]);
  const [selectedSupportCategoryIds, setSelectedSupportCategoryIds] = useState<number[]>([]);
  const [selectedChallengeCategoryIds, setSelectedChallengeCategoryIds] = useState<number[]>([]);

  useEffect(() => {
    reportsApi
      .getSupportRequestCategories()
      .then((res: any) => setSupportCategories(res.data?.data ?? res.data ?? []))
      .catch(() => setSupportCategories([]));
    reportsApi
      .getChallengeCategories()
      .then((res: any) => setChallengeCategories(res.data?.data ?? res.data ?? []))
      .catch(() => setChallengeCategories([]));
  }, []);

  const toggleSupportCategory = (id: number) => {
    setSelectedSupportCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };
  const toggleChallengeCategory = (id: number) => {
    setSelectedChallengeCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  useEffect(() => {
    if (!existingReportId) return;
    setLoadingDetail(true);
    reportsApi
      .getLessonReportById(existingReportId)
      .then((res: any) => {
        const detail = res.data?.data ?? res.data;
        if (!detail) return;
        if (detail.status !== "UNPLANNED") {
          setStatus(detail.status);
        }
        setAttendanceCount(detail.attendance_count ?? "");
        setCompletionRate(detail.completion_rate ?? 100);
        setReflectionNotes(detail.reflection_notes ?? "");
        setEvidenceUrl(detail.evidence_url ?? "");
        setSelectedSupportCategoryIds(detail.support_request_category_ids ?? []);
        setSelectedChallengeCategoryIds(detail.challenge_category_ids ?? []);
        setExistingSubjectId(detail.subject_id ?? null);
        setExistingClassGroupId(detail.class_group_id ?? null);
      })
      .catch(() => showToast("Failed to load report details", "error"))
      .finally(() => setLoadingDetail(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingReportId]);

  useEffect(() => {
    if (!isAdHoc) return;
    setLoadingAssignments(true);
    myAssignedSubjectsApi
      .getAll(academicTermId ?? undefined)
      .then((res: any) => setAssignedSubjects(res.data?.data ?? res.data ?? []))
      .catch(() => setAssignedSubjects([]))
      .finally(() => setLoadingAssignments(false));
  }, [isAdHoc, academicTermId]);

  const classGroupOptions =
    assignedSubjects.find((s) => s.subject_id === selectedSubjectId)?.grades ?? [];

  // Ad-hoc create mode only: as soon as the picked subject (and, if there's
  // more than one candidate, class group) matches a report already logged
  // for this day, switch into editing that report instead of letting the
  // instructor submit a duplicate.
  useEffect(() => {
    if (initialReportId !== null || !isAdHoc || selectedSubjectId === "") return;
    const candidates = existingDayLessons.filter(
      (l) => l.is_ad_hoc && l.subject_id === selectedSubjectId && l.lesson_report,
    );
    const match =
      candidates.length === 1
        ? selectedClassGroupId === "" || candidates[0].class_group_id === selectedClassGroupId
          ? candidates[0]
          : null
        : candidates.find((l) => l.class_group_id === selectedClassGroupId) ?? null;

    if (match && match.class_group_id != null && selectedClassGroupId === "") {
      setSelectedClassGroupId(match.class_group_id);
    }
    setResolvedReportId(match?.lesson_report?.lesson_report_id ?? null);
  }, [selectedSubjectId, selectedClassGroupId, isAdHoc, existingDayLessons, initialReportId]);

  // Names for the read-only ad-hoc identity shown when editing (subject/class
  // group are immutable once a report exists) — resolved from the same
  // TeacherSubjectAssignment list used to populate the create-mode pickers.
  const existingSubjectName =
    assignedSubjects.find((s) => s.subject_id === existingSubjectId)?.subject_name
      ?? (existingSubjectId ? `Subject #${existingSubjectId}` : null);
  const existingClassGroupName =
    assignedSubjects
      .flatMap((s) => s.grades)
      .find((g) => g.class_group_id === existingClassGroupId)?.class_group_name
      ?? (existingClassGroupId ? `Class Group #${existingClassGroupId}` : null);

  const canSubmitAdHoc = isEditing || (selectedSubjectId !== "" && selectedClassGroupId !== "");

  // Used to flag subjects/class-groups in the ad-hoc picker that already
  // have a report logged for this day, before the instructor even selects
  // them (matches the switch-to-edit behavior above).
  const reportedAdHocLessons = existingDayLessons.filter((l) => l.is_ad_hoc && l.lesson_report);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdHoc && !canSubmitAdHoc) return;
    setLoading(true);
    try {
      if (isEditing && existingReportId) {
        await reportsApi.updateLessonReport(existingReportId, {
          status: isAdHoc ? undefined : status,
          attendance_count: attendanceCount !== "" ? Number(attendanceCount) : undefined,
          completion_rate: completionRate,
          reflection_notes: reflectionNotes.trim() || undefined,
          evidence_url: evidenceUrl.trim() || undefined,
          support_request_category_ids: selectedSupportCategoryIds,
          challenge_category_ids: selectedChallengeCategoryIds,
        });
      } else {
        await reportsApi.submitLessonReport(
          isAdHoc
            ? {
                delivery_date:    lesson.date,
                subject_id:       selectedSubjectId as number,
                class_group_id:   selectedClassGroupId as number,
                reflection_notes: reflectionNotes.trim() || undefined,
                evidence_url:     evidenceUrl.trim()      || undefined,
                academic_term_id: academicTermId ?? undefined,
                support_request_category_ids: selectedSupportCategoryIds.length ? selectedSupportCategoryIds : undefined,
                challenge_category_ids: selectedChallengeCategoryIds.length ? selectedChallengeCategoryIds : undefined,
              }
            : {
                lesson_id:        lesson.lesson_id ?? undefined,
                entry_id:         lesson.entry_id  ?? undefined,
                // Fallback identity for a scheduled occurrence whose slot has
                // no LO_Lesson plan entry yet for this specific date (so
                // lesson_id/entry_id are both null) — the backend can still
                // place the report correctly using these instead.
                subject_id:       lesson.subject_id ?? undefined,
                class_group_id:   lesson.class_group_id ?? undefined,
                is_scheduled_slot: true,
                delivery_date:    lesson.date,
                status,
                attendance_count: attendanceCount !== "" ? Number(attendanceCount) : undefined,
                completion_rate:  completionRate,
                reflection_notes: reflectionNotes.trim() || undefined,
                evidence_url:     evidenceUrl.trim()      || undefined,
                academic_term_id: academicTermId ?? undefined,
                support_request_category_ids: selectedSupportCategoryIds.length ? selectedSupportCategoryIds : undefined,
                challenge_category_ids: selectedChallengeCategoryIds.length ? selectedChallengeCategoryIds : undefined,
              },
        );
      }
      showToast(
        isEditing
          ? "Report updated successfully"
          : isAdHoc
          ? "Unscheduled activity logged successfully"
          : "Lesson report submitted successfully",
        "success",
      );
      onSubmitted();
      onClose();
    } catch (err: any) {
      showToast(
        err?.response?.data?.message ?? "Failed to save report",
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

  // Portaled directly to <body> — rendering this deep inside the page's own
  // component tree left it subject to ancestor stacking-context quirks (the
  // fixed-position Navbar shares the same z-50 layer), which showed up as a
  // rendering artifact at the very top edge of the backdrop. A portal makes
  // the modal's stacking independent of where it's mounted in the tree.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800/30 dark:backdrop-blur-xl border border-transparent dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-white/10 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {isEditing
                ? isAdHoc ? "Edit Unscheduled Activity" : "Edit Lesson Report"
                : isAdHoc ? "Unscheduled Activity" : "Lesson Report"}
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
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-all active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {isAdHoc ? (
            isEditing ? (
              <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4 flex items-start gap-2.5 text-sm">
                <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-blue-700 dark:text-blue-300">
                  <p>Unscheduled activity — the subject and class group can't be changed after logging.</p>
                  <p className="mt-1 font-semibold">
                    {existingSubjectName ?? "—"} · {existingClassGroupName ?? "—"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-4 flex items-start gap-2.5 text-sm">
                <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-blue-700 dark:text-blue-300">
                  No lesson plan was scheduled for this day. Pick the subject and
                  class group this activity was for — it will be logged as{" "}
                  <span className="font-semibold">unscheduled</span> activity.
                </p>
              </div>
            )
          ) : (
          <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-3 text-sm">
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
          )}

          {/* Delivery status / ad-hoc subject picker */}
          <form id="lesson-report-form" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isAdHoc && !isEditing ? (
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Subject
                    </label>
                    <SelectField
                      value={selectedSubjectId}
                      onChange={(e) => {
                        setSelectedSubjectId(e.target.value ? Number(e.target.value) : "");
                        setSelectedClassGroupId("");
                      }}
                      disabled={loadingAssignments}
                      className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-white/5 ring-1 ring-inset ring-gray-200 dark:ring-white/10 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="">
                        {loadingAssignments ? "Loading…" : "Select a subject"}
                      </option>
                      {assignedSubjects.map((s) => (
                        <option key={s.subject_id} value={s.subject_id}>
                          {s.subject_name}
                          {reportedAdHocLessons.some((l) => l.subject_id === s.subject_id)
                            ? " (already logged)"
                            : ""}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      Class Group
                    </label>
                    <SelectField
                      value={selectedClassGroupId}
                      onChange={(e) =>
                        setSelectedClassGroupId(e.target.value ? Number(e.target.value) : "")
                      }
                      disabled={selectedSubjectId === "" || classGroupOptions.length === 0}
                      className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-white/5 ring-1 ring-inset ring-gray-200 dark:ring-white/10 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="">Select a class group</option>
                      {classGroupOptions.map((g) => (
                        <option key={g.class_group_id} value={g.class_group_id}>
                          {g.class_group_name}
                          {reportedAdHocLessons.some(
                            (l) => l.subject_id === selectedSubjectId && l.class_group_id === g.class_group_id,
                          )
                            ? " (already logged)"
                            : ""}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {!loadingAssignments && assignedSubjects.length === 0 && (
                    <p className="col-span-full text-xs text-amber-600 dark:text-amber-400">
                      No subject assignments found for you in this term.
                    </p>
                  )}
                </div>
              ) : !isAdHoc ? (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  Delivery Status
                </label>
                <div className="inline-flex gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-full">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStatus(opt.value)}
                      className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        status === opt.value
                          ? opt.activePill
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              ) : null}

              {/* Attendance + Completion Rate — grouped into one panel so
                  the two "how did it go" metrics read as a unit. */}
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-white/5 rounded-xl p-4">
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
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-white/5 ring-1 ring-inset ring-gray-200 dark:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

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
              </div>

              {/* Reflection */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Reflection / Challenges
                </label>
                <textarea
                  rows={3}
                  value={reflectionNotes}
                  onChange={(e) => setReflectionNotes(e.target.value)}
                  placeholder="What worked well? Any challenges encountered?"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-white/5 ring-1 ring-inset ring-gray-200 dark:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Support Needed + Challenges Encountered — grouped into one
                  panel, matching the metrics panel above. */}
              {(supportCategories.length > 0 || challengeCategories.length > 0) && (
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-gray-50 dark:bg-white/5 rounded-xl p-4">
                  {supportCategories.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                        Support Needed{" "}
                        <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {supportCategories.map((cat) => {
                          const active = selectedSupportCategoryIds.includes(cat.category_id);
                          return (
                            <button
                              key={cat.category_id}
                              type="button"
                              onClick={() => toggleSupportCategory(cat.category_id)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                active
                                  ? "bg-blue-600 text-white"
                                  : "bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
                              }`}
                            >
                              {active && <Check className="w-3 h-3 flex-shrink-0" />}
                              {cat.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {challengeCategories.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                        Challenges Encountered{" "}
                        <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {challengeCategories.map((cat) => {
                          const active = selectedChallengeCategoryIds.includes(cat.category_id);
                          return (
                            <button
                              key={cat.category_id}
                              type="button"
                              onClick={() => toggleChallengeCategory(cat.category_id)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                active
                                  ? "bg-red-600 text-white"
                                  : "bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10"
                              }`}
                            >
                              {active && <Check className="w-3 h-3 flex-shrink-0" />}
                              {cat.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Evidence URL */}
              <div className="md:col-span-2">
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
                  className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-white/5 ring-1 ring-inset ring-gray-200 dark:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-white/10 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-all active:scale-95"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="lesson-report-form"
            disabled={loading || loadingDetail || (isAdHoc && !canSubmitAdHoc)}
            className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:active:scale-100 text-white rounded-full shadow-sm hover:shadow transition-all active:scale-95"
          >
            {loading
              ? "Saving…"
              : isEditing
              ? "Update Report"
              : isAdHoc
              ? "Log Activity"
              : "Submit Report"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LessonReportModal;
