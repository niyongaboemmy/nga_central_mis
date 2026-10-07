import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  MessageSquare,
  Calendar,
  Clock,
  CheckSquare,
  Square,
  Tag,
  BookOpen,
  ShieldAlert,
  GraduationCap,
  Lightbulb,
  Heart,
  History,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Loader2,
  Check,
  ClipboardList,
} from "lucide-react";
import {
  mentorshipApi,
  AssignedStudent,
  MentorshipSessionRecord,
  MenteeIntelligence,
  SessionStatus,
  DisciplineProgress,
  SubmitSessionPayload,
  SessionFieldsPayload,
  InstructorSubject,
} from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import SessionPrintPreview from "./SessionPrintPreview";
import SelectField from "../ui/SelectField";

const WELLBEING_OPTIONS = [
  { value: "STRUGGLING", emoji: "😢", label: "Struggling" },
  { value: "CONCERNED", emoji: "😟", label: "Concerned" },
  { value: "NEUTRAL", emoji: "😐", label: "Neutral" },
  { value: "GOOD", emoji: "🙂", label: "Good" },
  { value: "EXCELLENT", emoji: "😄", label: "Excellent" },
];

const RATING_OPTIONS = [
  { value: "GOOD", label: "Good" },
  { value: "PARTIAL", label: "Partial" },
  { value: "POOR", label: "Poor" },
];

const WELLBEING_EMOJI: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED: "😟",
  NEUTRAL: "😐",
  GOOD: "🙂",
  EXCELLENT: "😄",
};

const DISC_PROGRESS_OPTIONS: { value: DisciplineProgress; label: string; icon: React.ReactNode }[] = [
  { value: "IMPROVED", label: "Improved", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { value: "CONSISTENT", label: "Consistent", icon: <Minus className="w-3.5 h-3.5" /> },
  { value: "DECLINED", label: "Declined", icon: <TrendingDown className="w-3.5 h-3.5" /> },
];

const DISC_PROGRESS_STYLE: Record<DisciplineProgress, string> = {
  IMPROVED: "border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  CONSISTENT: "border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  DECLINED: "border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300",
};

// Harmonized with the amber convention already used across the reporting
// area for "pending / needs attention" (SubmittedReports.tsx, AdminReportDashboard.tsx),
// rather than the one-off yellow this modal previously used for OPEN.
const FOLLOWUP_STATUS_STYLE: Record<SessionStatus, string> = {
  OPEN: "border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  IN_PROGRESS: "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  RESOLVED: "border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300",
};

function percentageColor(pct: number): string {
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function percentageBg(pct: number): string {
  if (pct >= 75) return "bg-green-100 dark:bg-green-900/30";
  if (pct >= 50) return "bg-amber-100 dark:bg-amber-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

interface Props {
  student: AssignedStudent;
  lastSession: MentorshipSessionRecord | null;
  sessionHistory: MentorshipSessionRecord[];
  /** When provided, the modal opens in edit mode for this existing session instead of logging a new one. */
  editSession?: MentorshipSessionRecord | null;
  onClose: () => void;
  onSubmitted: () => void;
}

const HistoryEntry: React.FC<{ session: MentorshipSessionRecord }> = ({ session }) => {
  const [expanded, setExpanded] = useState(false);

  const dateLabel = session.session_date
    ? new Date(session.session_date + "T00:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

  const preview =
    session.academic_personal_notes ||
    session.academic_planning ||
    session.notes ||
    session.challenges_identified ||
    "";

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800/60 transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start justify-between gap-2 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
              {dateLabel}
            </span>
            {session.wellbeing_status && (
              <span className="text-sm">{WELLBEING_EMOJI[session.wellbeing_status] ?? ""}</span>
            )}
            {session.topic && (
              <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full truncate max-w-[100px]">
                {session.topic}
              </span>
            )}
            {session.dishonesty_flagged && (
              <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full font-semibold">
                ⚠ Integrity
              </span>
            )}
            {session.stress_flag && (
              <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full font-semibold">
                ⚠ Stress
              </span>
            )}
          </div>
          {!expanded && preview && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{preview}</p>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-2">
          {session.assignment_completion && (
            <Detail icon={<BookOpen className="w-3 h-3" />} label="Assignments" value={`${session.assignment_completion}${session.assignment_notes ? ` — ${session.assignment_notes}` : ""}`} />
          )}
          {session.discipline_notes && (
            <Detail icon={<ShieldAlert className="w-3 h-3" />} label="Discipline" value={session.discipline_notes} />
          )}
          {(session.academic_planning || session.academic_personal_notes) && (
            <Detail icon={<GraduationCap className="w-3 h-3" />} label="Academic" value={[session.academic_planning, session.academic_personal_notes].filter(Boolean).join(" — ")} />
          )}
          {(session.challenges_identified || session.guidance_notes) && (
            <Detail icon={<Lightbulb className="w-3 h-3" />} label="Guidance" value={[session.challenges_identified, session.guidance_notes].filter(Boolean).join(" → ")} />
          )}
          {session.wellbeing_notes && (
            <Detail icon={<Heart className="w-3 h-3" />} label="Well-being" value={session.wellbeing_notes} />
          )}
          {session.action_items && (
            <Detail icon={<CheckSquare className="w-3 h-3" />} label="Action Items" value={session.action_items} />
          )}
        </div>
      )}
    </div>
  );
};

const Detail: React.FC<{ icon: React.ReactNode; label: string; value: string | null }> = ({ icon, label, value }) => {
  if (!value) return null;
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 font-medium mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{value}</p>
    </div>
  );
};

const DRAFT_KEY = (studentId: number) => `mentorship_draft_${studentId}`;

// ─────────────────────────────────────────────────────────────────────────────
// Multi-step wizard configuration
// ─────────────────────────────────────────────────────────────────────────────
type StepId = "info" | "wellbeing" | "academic" | "wrapup";
const STEPS: { id: StepId; label: string; icon: React.ReactNode }[] = [
  { id: "info", label: "Session Info", icon: <Clock className="w-4 h-4" /> },
  { id: "wellbeing", label: "Wellbeing & Discipline", icon: <Heart className="w-4 h-4" /> },
  { id: "academic", label: "Academic & Guidance", icon: <GraduationCap className="w-4 h-4" /> },
  { id: "wrapup", label: "Wrap-up & Review", icon: <ClipboardList className="w-4 h-4" /> },
];

const StepIndicator: React.FC<{ currentIndex: number; onJump: (i: number) => void; furthestReached: number }> = ({
  currentIndex,
  onJump,
  furthestReached,
}) => (
  <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
    {STEPS.map((step, i) => {
      const isActive = i === currentIndex;
      const isDone = i < currentIndex;
      const isReachable = i <= furthestReached;
      return (
        <React.Fragment key={step.id}>
          <button
            type="button"
            disabled={!isReachable}
            onClick={() => isReachable && onJump(i)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              isActive
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                : isDone
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                : isReachable
                ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                : "bg-gray-50 dark:bg-gray-800/50 text-gray-300 dark:text-gray-600 cursor-not-allowed"
            }`}
          >
            <span
              className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] ${
                isActive
                  ? "bg-white/20"
                  : isDone
                  ? "bg-blue-100 dark:bg-blue-900/50"
                  : "bg-white dark:bg-gray-700"
              }`}
            >
              {isDone ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <span className="hidden md:inline">{step.label}</span>
          </button>
          {i < STEPS.length - 1 && (
            <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; color: string }> = ({ icon, title, color }) => (
  <div className={`flex items-center gap-2 py-2 border-b ${color} mb-3`}>
    <span className="flex-shrink-0">{icon}</span>
    <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
  </div>
);

const MentoringSessionModal: React.FC<Props> = ({
  student,
  lastSession,
  sessionHistory,
  editSession,
  onClose,
  onSubmitted,
}) => {
  const { showToast } = useToast();
  const { selectedYearId, selectedTermId } = useAcademicPeriod();
  const isEditMode = Boolean(editSession);

  const today = new Date().toISOString().split("T")[0];

  // Wizard navigation
  const [stepIndex, setStepIndex] = useState(0);
  const [furthestReached, setFurthestReached] = useState(0);

  // Intelligence data
  const [intelligence, setIntelligence] = useState<MenteeIntelligence | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(true);

  // Previous action items checklist (create mode only — irrelevant when editing a past session)
  const prevActionItems: string[] =
    !isEditMode && lastSession?.action_items
      ? lastSession.action_items.split("\n").map((s) => s.trim()).filter(Boolean)
      : [];
  const [checkedItems, setCheckedItems] = useState<boolean[]>(() => prevActionItems.map(() => false));

  // ── Form state ────────────────────────────────────────────────────────────
  const [sessionDate, setSessionDate] = useState(editSession?.session_date ?? today);
  const [topic, setTopic] = useState(editSession?.topic ?? "");
  const [subjectId, setSubjectId] = useState<number | "">(editSession?.subject_id ?? "");
  const [durationMinutes, setDurationMinutes] = useState<number | "">(editSession?.duration_minutes ?? "");

  const [wellbeingStatus, setWellbeingStatus] = useState(editSession?.wellbeing_status ?? "");
  const [wellbeingNotes, setWellbeingNotes] = useState(editSession?.wellbeing_notes ?? "");

  const [assignmentCompletion, setAssignmentCompletion] = useState(editSession?.assignment_completion ?? "");
  const [assignmentNotes, setAssignmentNotes] = useState(editSession?.assignment_notes ?? "");

  const [punctualityAttendance, setPunctualityAttendance] = useState(editSession?.punctuality_attendance ?? "");
  const [disciplineNotes, setDisciplineNotes] = useState(editSession?.discipline_notes ?? "");
  const [disciplineProgress, setDisciplineProgress] = useState<DisciplineProgress | "">(
    editSession?.discipline_progress ?? "",
  );

  const [academicPlanning, setAcademicPlanning] = useState(editSession?.academic_planning ?? "");
  const [academicPersonalNotes, setAcademicPersonalNotes] = useState(editSession?.academic_personal_notes ?? "");
  const [dishonestyFlagged, setDishonestyFlagged] = useState(editSession?.dishonesty_flagged ?? false);
  const [stressFlag, setStressFlag] = useState(editSession?.stress_flag ?? false);

  const [challengesIdentified, setChallengesIdentified] = useState(editSession?.challenges_identified ?? "");
  const [guidanceNotes, setGuidanceNotes] = useState(editSession?.guidance_notes ?? "");

  const [actionItems, setActionItems] = useState(editSession?.action_items ?? "");
  const [nextSteps, setNextSteps] = useState(editSession?.next_steps ?? "");
  const [notes, setNotes] = useState(editSession?.notes ?? "");

  const [isCompleted, setIsCompleted] = useState(editSession?.is_completed ?? false);
  const [followUpRequired, setFollowUpRequired] = useState(editSession?.follow_up_required ?? false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(editSession?.session_status ?? "OPEN");

  const [loading, setLoading] = useState(false);
  const [printSnapshot, setPrintSnapshot] = useState<(SubmitSessionPayload & { wellbeing_status?: string }) | null>(null);

  // Load intelligence on mount; restore a create-mode draft if any (editing
  // never restores/saves a localStorage draft — the session itself is the
  // durable copy once it exists).
  useEffect(() => {
    setIntelligenceLoading(true);
    mentorshipApi
      .getMenteeIntelligence(student.user_id)
      .then((res) => {
        const data = (res as any).data?.data ?? (res as any).data;
        setIntelligence(data ?? null);
      })
      .catch(() => {
        // Non-fatal: form still works without intelligence data
      })
      .finally(() => setIntelligenceLoading(false));

    if (isEditMode) return;

    try {
      const raw = localStorage.getItem(DRAFT_KEY(student.user_id));
      if (raw) {
        const d = JSON.parse(raw);
        if (d.sessionDate) setSessionDate(d.sessionDate);
        if (d.topic) setTopic(d.topic);
        if (d.subjectId) setSubjectId(d.subjectId);
        if (d.durationMinutes) setDurationMinutes(d.durationMinutes);
        if (d.wellbeingStatus) setWellbeingStatus(d.wellbeingStatus);
        if (d.wellbeingNotes) setWellbeingNotes(d.wellbeingNotes);
        if (d.assignmentCompletion) setAssignmentCompletion(d.assignmentCompletion);
        if (d.assignmentNotes) setAssignmentNotes(d.assignmentNotes);
        if (d.punctualityAttendance) setPunctualityAttendance(d.punctualityAttendance);
        if (d.disciplineNotes) setDisciplineNotes(d.disciplineNotes);
        if (d.disciplineProgress) setDisciplineProgress(d.disciplineProgress);
        if (d.academicPlanning) setAcademicPlanning(d.academicPlanning);
        if (d.academicPersonalNotes) setAcademicPersonalNotes(d.academicPersonalNotes);
        if (d.dishonestyFlagged) setDishonestyFlagged(d.dishonestyFlagged);
        if (d.stressFlag) setStressFlag(d.stressFlag);
        if (d.challengesIdentified) setChallengesIdentified(d.challengesIdentified);
        if (d.guidanceNotes) setGuidanceNotes(d.guidanceNotes);
        if (d.actionItems) setActionItems(d.actionItems);
        if (d.nextSteps) setNextSteps(d.nextSteps);
        if (d.notes) setNotes(d.notes);
        if (d.followUpRequired) setFollowUpRequired(d.followUpRequired);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.user_id]);

  // Auto-save draft every meaningful change (create mode only)
  useEffect(() => {
    if (isEditMode) return;
    const draft = {
      sessionDate, topic, subjectId, durationMinutes,
      wellbeingStatus, wellbeingNotes,
      assignmentCompletion, assignmentNotes,
      punctualityAttendance, disciplineNotes, disciplineProgress,
      academicPlanning, academicPersonalNotes, dishonestyFlagged, stressFlag,
      challengesIdentified, guidanceNotes,
      actionItems, nextSteps, notes,
      followUpRequired,
    };
    try {
      localStorage.setItem(DRAFT_KEY(student.user_id), JSON.stringify(draft));
    } catch {
      // ignore quota errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionDate, topic, subjectId, durationMinutes,
    wellbeingStatus, wellbeingNotes,
    assignmentCompletion, assignmentNotes,
    punctualityAttendance, disciplineNotes, disciplineProgress,
    academicPlanning, academicPersonalNotes, dishonestyFlagged, stressFlag,
    challengesIdentified, guidanceNotes,
    actionItems, nextSteps, notes, followUpRequired,
    student.user_id, isEditMode,
  ]);

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY(student.user_id)); } catch { /* ignore */ }
  };

  const buildFieldsPayload = (): SessionFieldsPayload => ({
    session_date: sessionDate,
    topic: topic.trim() || undefined,
    academic_year_id: selectedYearId ?? undefined,
    academic_term_id: selectedTermId ?? undefined,
    subject_id: subjectId ? Number(subjectId) : undefined,
    duration_minutes: durationMinutes ? Number(durationMinutes) : undefined,
    assignment_completion: assignmentCompletion || undefined,
    assignment_notes: assignmentNotes.trim() || undefined,
    punctuality_attendance: punctualityAttendance || undefined,
    discipline_notes: disciplineNotes.trim() || undefined,
    discipline_progress: disciplineProgress || undefined,
    academic_planning: academicPlanning.trim() || undefined,
    academic_personal_notes: academicPersonalNotes.trim() || undefined,
    dishonesty_flagged: dishonestyFlagged,
    stress_flag: stressFlag,
    challenges_identified: challengesIdentified.trim() || undefined,
    guidance_notes: guidanceNotes.trim() || undefined,
    wellbeing_status: wellbeingStatus || undefined,
    wellbeing_notes: wellbeingNotes.trim() || undefined,
    next_steps: nextSteps.trim() || undefined,
    action_items: actionItems.trim() || undefined,
    notes: notes.trim() || undefined,
    follow_up_required: followUpRequired,
    is_completed: isCompleted,
    session_status: followUpRequired ? sessionStatus : "OPEN",
  });

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionDate) { showToast("Session date is required", "error"); return; }
    if (!durationMinutes) { showToast("Duration is required", "error"); return; }
    setLoading(true);

    try {
      if (isEditMode && editSession) {
        await mentorshipApi.updateSession(editSession.mentorship_id, buildFieldsPayload());
        showToast("Session updated successfully", "success");
        onSubmitted();
        onClose();
      } else {
        const payload: SubmitSessionPayload = {
          ...buildFieldsPayload(),
          student_id: student.user_id,
          previous_session_id: lastSession?.mentorship_id ?? undefined,
        };
        await mentorshipApi.submitSession(payload);
        clearDraft();
        showToast("Session logged successfully", "success");
        onSubmitted();
        setPrintSnapshot({ ...payload, wellbeing_status: wellbeingStatus });
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message ?? "Failed to submit session", "error");
    } finally {
      setLoading(false);
    }
  };

  const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();

  // All hooks (including this useMemo) must run before the printSnapshot
  // early return below — calling a hook after a conditional return means a
  // later render (once printSnapshot is set) calls fewer hooks than the
  // first render did, which React rejects.
  const reviewRows: { label: string; value: string }[] = useMemo(
    () => [
      { label: "Date", value: sessionDate || "—" },
      { label: "Duration", value: durationMinutes ? `${durationMinutes} min` : "—" },
      { label: "Topic", value: topic || "—" },
      { label: "Wellbeing", value: wellbeingStatus ? `${WELLBEING_EMOJI[wellbeingStatus]} ${wellbeingStatus}` : "—" },
      { label: "Assignment", value: assignmentCompletion || "—" },
      { label: "Punctuality", value: punctualityAttendance || "—" },
      { label: "Discipline trend", value: disciplineProgress || "—" },
      { label: "Completed?", value: isCompleted ? "Yes" : "No" },
      { label: "Follow-up", value: followUpRequired ? sessionStatus.replace("_", " ") : "Not required" },
    ],
    [sessionDate, durationMinutes, topic, wellbeingStatus, assignmentCompletion, punctualityAttendance, disciplineProgress, isCompleted, followUpRequired, sessionStatus],
  );

  if (printSnapshot) {
    return (
      <SessionPrintPreview
        student={student}
        session={printSnapshot}
        onClose={onClose}
      />
    );
  }

  const subjects: InstructorSubject[] = intelligence?.instructor_subjects ?? [];

  const goToStep = (i: number) => {
    setStepIndex(i);
    setFurthestReached((f) => Math.max(f, i));
  };
  const goNext = () => {
    if (stepIndex === 0) {
      if (!sessionDate) { showToast("Session date is required", "error"); return; }
      if (!durationMinutes) { showToast("Duration is required", "error"); return; }
    }
    goToStep(Math.min(stepIndex + 1, STEPS.length - 1));
  };
  const goBack = () => goToStep(Math.max(stepIndex - 1, 0));

  const flaggedSummary = [dishonestyFlagged && "Integrity", stressFlag && "Stress"].filter(Boolean).join(" & ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800/30 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                {isEditMode ? "Edit Mentoring Session" : "Log Mentoring Session"}
                {isEditMode && (
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full">
                    Editing
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {fullName}{student.class_group_name ? ` · ${student.class_group_name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {!isEditMode && (
                <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">Draft auto-saved</span>
              )}
              <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <StepIndicator currentIndex={stepIndex} onJump={goToStep} furthestReached={furthestReached} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-1 overflow-hidden">
            {/* ── LEFT: Form (current step only) ────────────────────── */}
            <div className="flex-[3] overflow-y-auto px-6 py-5 space-y-5 border-r border-gray-100 dark:border-gray-700">

              {/* ── STEP 1: SESSION INFO ─────────────────────────── */}
              {stepIndex === 0 && (
                <>
                  {intelligenceLoading ? (
                    <div className="flex items-center gap-2 text-xs text-gray-400 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading student intelligence...
                    </div>
                  ) : intelligence && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-200 dark:border-blue-800/50 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                          Status at a Glance
                        </span>
                        {intelligence.flag_history.dishonesty_count > 0 && (
                          <span className="ml-auto flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            Academic Integrity ({intelligence.flag_history.dishonesty_count}×)
                          </span>
                        )}
                        {intelligence.flag_history.stress_count > 0 && (
                          <span className="flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            Stress ({intelligence.flag_history.stress_count}×)
                          </span>
                        )}
                      </div>

                      {intelligence.recent_scores.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Recent Grades</p>
                          <div className="flex flex-wrap gap-2">
                            {intelligence.recent_scores.map((score) => (
                              <div
                                key={score.score_id}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${percentageBg(score.percentage ?? 0)} ${percentageColor(score.percentage ?? 0)}`}
                              >
                                <span className="font-normal text-gray-600 dark:text-gray-400">
                                  {score.subject_name ?? "—"}
                                </span>
                                <span>{score.percentage ?? score.score}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {intelligence.open_challenges.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1.5">
                            Carry-Over Challenges (last {intelligence.open_challenges.length} session{intelligence.open_challenges.length !== 1 ? "s" : ""})
                          </p>
                          <div className="space-y-1.5">
                            {intelligence.open_challenges.map((c) => (
                              <div
                                key={c.mentorship_id}
                                className="text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2"
                              >
                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                  {c.session_date} {c.topic ? `· ${c.topic}` : ""}
                                </span>
                                {c.challenges_identified && (
                                  <p className="text-amber-800 dark:text-amber-300 mt-0.5">{c.challenges_identified}</p>
                                )}
                                {c.action_items && (
                                  <p className="text-amber-700 dark:text-amber-400 mt-0.5 italic">
                                    Actions: {c.action_items}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {intelligence.recent_scores.length === 0 && intelligence.open_challenges.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">No prior grades or challenges on record.</p>
                      )}
                    </div>
                  )}

                  {!isEditMode && lastSession && (
                    <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200 dark:border-gray-700/40 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        <MessageSquare className="w-3.5 h-3.5" />
                        Last session
                        {lastSession.topic && (
                          <span className="ml-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-semibold normal-case">
                            {lastSession.topic}
                          </span>
                        )}
                      </div>

                      {prevActionItems.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">
                            Open action items — mark completed:
                          </p>
                          <ul className="space-y-1.5">
                            {prevActionItems.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 cursor-pointer"
                                onClick={() =>
                                  setCheckedItems((prev) => {
                                    const next = [...prev];
                                    next[i] = !next[i];
                                    return next;
                                  })
                                }
                              >
                                {checkedItems[i] ? (
                                  <CheckSquare className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <Square className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                )}
                                <span className={`text-sm ${checkedItems[i] ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-300"}`}>
                                  {item}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {!prevActionItems.length && (
                        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                          {lastSession.notes || lastSession.academic_planning || "No notes from last session."}
                        </p>
                      )}

                      <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {lastSession.session_date
                          ? new Date(lastSession.session_date + "T00:00:00").toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : "Unknown date"}
                      </p>
                    </div>
                  )}

                  <div>
                    <SectionHeader
                      icon={<Clock className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />}
                      title="Session Info"
                      color="border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400"
                    />
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Session Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={sessionDate}
                          onChange={(e) => setSessionDate(e.target.value)}
                          max={today}
                          required
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Duration (minutes) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="number"
                            min={1}
                            max={240}
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(e.target.value === "" ? "" : Number(e.target.value))}
                            placeholder="30"
                            required
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Session Topic
                        </label>
                        <div className="relative">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g. Math Anxiety, Career Guidance..."
                            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Subject Context
                        </label>
                        <SelectField
                          value={subjectId}
                          onChange={(e) => setSubjectId(e.target.value === "" ? "" : Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">No specific subject</option>
                          {subjects.map((s) => (
                            <option key={s.subject_id} value={s.subject_id}>
                              {s.name}{s.code ? ` (${s.code})` : ""}
                            </option>
                          ))}
                        </SelectField>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP 2: WELLBEING & DISCIPLINE ───────────────── */}
              {stepIndex === 1 && (
                <>
                  <div>
                    <SectionHeader
                      icon={<Heart className="w-3.5 h-3.5 text-rose-500" />}
                      title="Productivity & Well-being"
                      color="border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-400"
                    />
                    <div className="flex gap-2 mb-3">
                      {WELLBEING_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setWellbeingStatus(opt.value)}
                          title={opt.label}
                          className={`flex-1 flex flex-col items-center py-2 rounded-xl border-2 text-xl transition-all ${
                            wellbeingStatus === opt.value
                              ? "border-rose-500 bg-rose-50 dark:bg-rose-900/30"
                              : "border-gray-200 dark:border-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {opt.emoji}
                          <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 hidden sm:block">
                            {opt.label}
                          </span>
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={wellbeingNotes}
                      onChange={(e) => setWellbeingNotes(e.target.value)}
                      rows={2}
                      placeholder="Rest, physical health, emotional state, motivation..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none"
                    />

                    <label className="flex items-center gap-2 mt-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={stressFlag}
                        onChange={(e) => setStressFlag(e.target.checked)}
                        className="w-4 h-4 accent-orange-500"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        Flag: Severe / Chronic Stress
                      </span>
                    </label>
                  </div>

                  <div>
                    <SectionHeader
                      icon={<ShieldAlert className="w-3.5 h-3.5 text-amber-500" />}
                      title="Punctuality, Attendance & Discipline"
                      color="border-amber-200 dark:border-amber-800/50 text-amber-600 dark:text-amber-400"
                    />
                    <SelectField
                      value={punctualityAttendance}
                      onChange={(e) => setPunctualityAttendance(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
                    >
                      <option value="">Rate punctuality...</option>
                      {RATING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </SelectField>
                    <textarea
                      value={disciplineNotes}
                      onChange={(e) => setDisciplineNotes(e.target.value)}
                      rows={2}
                      placeholder="Behavioral observations, improvements, concerns..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none mb-3"
                    />

                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Progress vs. Last Session</p>
                      <div className="flex gap-2">
                        {DISC_PROGRESS_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDisciplineProgress(disciplineProgress === opt.value ? "" : opt.value)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-full border-2 transition-all ${
                              disciplineProgress === opt.value
                                ? DISC_PROGRESS_STYLE[opt.value]
                                : "border-gray-200 dark:border-gray-600 text-gray-500"
                            }`}
                          >
                            {opt.icon}
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── STEP 3: ACADEMIC & GUIDANCE ──────────────────── */}
              {stepIndex === 2 && (
                <>
                  <div>
                    <SectionHeader
                      icon={<BookOpen className="w-3.5 h-3.5 text-blue-500" />}
                      title="Assignment Completion & Deadlines"
                      color="border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400"
                    />
                    <SelectField
                      value={assignmentCompletion}
                      onChange={(e) => setAssignmentCompletion(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                    >
                      <option value="">Rate completion...</option>
                      {RATING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </SelectField>
                    <textarea
                      value={assignmentNotes}
                      onChange={(e) => setAssignmentNotes(e.target.value)}
                      rows={2}
                      placeholder="Specific modules, delays, planning observations..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <div>
                    <SectionHeader
                      icon={<GraduationCap className="w-3.5 h-3.5 text-emerald-500" />}
                      title="Academic & Personal"
                      color="border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400"
                    />
                    <textarea
                      value={academicPlanning}
                      onChange={(e) => setAcademicPlanning(e.target.value)}
                      rows={2}
                      placeholder="Goals, study plan, subject focus..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none mb-3"
                    />
                    <textarea
                      value={academicPersonalNotes}
                      onChange={(e) => setAcademicPersonalNotes(e.target.value)}
                      rows={2}
                      placeholder="Emotional state, exam results, stress, motivation..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                    />

                    <label className="flex items-center gap-2 mt-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={dishonestyFlagged}
                        onChange={(e) => setDishonestyFlagged(e.target.checked)}
                        className="w-4 h-4 accent-red-500"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                        Flag: Academic Dishonesty / Integrity Concern
                      </span>
                    </label>
                  </div>

                  <div>
                    <SectionHeader
                      icon={<Lightbulb className="w-3.5 h-3.5 text-violet-500" />}
                      title="Challenges Identified & Guidance Provided"
                      color="border-violet-200 dark:border-violet-800/50 text-violet-600 dark:text-violet-400"
                    />
                    <textarea
                      value={challengesIdentified}
                      onChange={(e) => setChallengesIdentified(e.target.value)}
                      rows={2}
                      placeholder="What difficulties did the student mention?"
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none mb-3"
                    />
                    <textarea
                      value={guidanceNotes}
                      onChange={(e) => setGuidanceNotes(e.target.value)}
                      rows={2}
                      placeholder="Specific advice, strategies, or commitments discussed..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                    />
                  </div>
                </>
              )}

              {/* ── STEP 4: WRAP-UP & REVIEW ──────────────────────── */}
              {stepIndex === 3 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Action Items</label>
                      <textarea
                        value={actionItems}
                        onChange={(e) => setActionItems(e.target.value)}
                        rows={3}
                        placeholder="Specific tasks for the student (one per line)..."
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Next Steps</label>
                      <textarea
                        value={nextSteps}
                        onChange={(e) => setNextSteps(e.target.value)}
                        rows={3}
                        placeholder="What happens before the next session?"
                        className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Session Notes</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder="Overall session summary..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700/60 rounded-lg bg-white dark:bg-gray-800/40 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-700">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Session Completed?</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Mark Y when all objectives were achieved</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsCompleted(!isCompleted)}
                      className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                        isCompleted ? "bg-green-500 text-white" : "bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {isCompleted ? "Y" : "N"}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Follow-up Required</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Flag this student for your next check-in</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFollowUpRequired(!followUpRequired)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        followUpRequired ? "bg-amber-500" : "bg-gray-200 dark:bg-gray-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          followUpRequired ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {followUpRequired && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Follow-up Status</label>
                      <div className="flex gap-2">
                        {(["OPEN", "IN_PROGRESS", "RESOLVED"] as SessionStatus[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSessionStatus(s)}
                            className={`flex-1 py-2 text-xs font-medium rounded-full border-2 transition-all ${
                              sessionStatus === s ? FOLLOWUP_STATUS_STYLE[s] : "border-gray-200 dark:border-gray-600 text-gray-500"
                            }`}
                          >
                            {s.replace("_", " ")}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review summary */}
                  <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/40 p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <ClipboardList className="w-3.5 h-3.5" />
                      Review before submitting
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      {reviewRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">{row.label}</span>
                          <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[60%] text-right">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* ── RIGHT: History Sidebar ──────────────────────────────── */}
            <div className="flex-[2] overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 dark:bg-gray-800/40 rounded-br-2xl">
              <div className="flex items-center gap-2 mb-1">
                <History className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Session History
                </span>
                {sessionHistory.length > 0 && (
                  <span className="ml-auto text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full font-medium">
                    {sessionHistory.length}
                  </span>
                )}
              </div>

              {sessionHistory.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 dark:text-gray-500">No previous sessions</p>
                </div>
              ) : (
                sessionHistory.map((s) => (
                  <HistoryEntry key={s.mentorship_id} session={s} />
                ))
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {flaggedSummary && (
                <span className="flex items-center gap-1 text-red-500 dark:text-red-400 font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {flaggedSummary} flagged
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={loading}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                Cancel
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex items-center gap-1 px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading || !sessionDate || !durationMinutes}
                  className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-900 text-white rounded-full transition-colors"
                >
                  {loading ? "Saving..." : isEditMode ? "Save Changes" : "Log Session"}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MentoringSessionModal;
