import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Pencil,
} from "lucide-react";
import { LineChart, Line, Tooltip, ResponsiveContainer } from "recharts";
import {
  mentorshipApi,
  AssignedStudent,
  MenteeIntelligence,
  MentorshipSessionRecord,
  SessionStatus,
} from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import MentoringSessionModal from "./MentoringSessionModal";
import AIInsightsCard from "./AIInsightsCard";
import SelectField from "../ui/SelectField";

const WELLBEING_SCALE: Record<string, number> = {
  STRUGGLING: 1,
  CONCERNED: 2,
  NEUTRAL: 3,
  GOOD: 4,
  EXCELLENT: 5,
};

const WELLBEING_EMOJI: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED: "😟",
  NEUTRAL: "😐",
  GOOD: "🙂",
  EXCELLENT: "😄",
};

// Harmonized on amber for "open/pending" (matches the convention used
// elsewhere in the reporting area, e.g. SubmittedReports.tsx), replacing the
// one-off yellow this used to use for the OPEN status.
const STATUS_STYLE: Record<SessionStatus, string> = {
  OPEN: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  IN_PROGRESS: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  RESOLVED: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
};

const DISC_ICON: Record<string, React.ReactNode> = {
  IMPROVED:   <TrendingUp   className="w-3 h-3 text-green-500" />,
  CONSISTENT: <Minus        className="w-3 h-3 text-blue-400" />,
  DECLINED:   <TrendingDown className="w-3 h-3 text-red-400" />,
};

function pctColor(pct: number) {
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
function pctBg(pct: number) {
  if (pct >= 75) return "bg-green-100 dark:bg-green-900/30";
  if (pct >= 50) return "bg-amber-100 dark:bg-amber-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

interface Props {
  student: AssignedStudent;
  onBack: () => void;
}

const StudentSupportProfile: React.FC<Props> = ({ student, onBack }) => {
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<MentorshipSessionRecord[]>([]);
  const [intelligence, setIntelligence] = useState<MenteeIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSession, setEditingSession] = useState<MentorshipSessionRecord | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const hasFetched = useRef(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [histRes, intRes] = await Promise.all([
        mentorshipApi.getStudentHistory(student.user_id),
        mentorshipApi.getMenteeIntelligence(student.user_id),
      ]);
      const hist = (histRes as any).data?.data ?? (histRes as any).data ?? [];
      const intel = (intRes as any).data?.data ?? (intRes as any).data ?? null;
      setSessions(Array.isArray(hist) ? hist : []);
      setIntelligence(intel);
    } catch {
      showToast("Failed to load session history", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [student.user_id]);

  const handleStatusChange = async (sessionId: number, status: SessionStatus) => {
    setUpdatingId(sessionId);
    try {
      await mentorshipApi.updateStatus(sessionId, status);
      setSessions((prev) =>
        prev.map((s) =>
          s.mentorship_id === sessionId ? { ...s, session_status: status } : s,
        ),
      );
      showToast(`Follow-up status set to ${status.replace("_", " ")}`, "success");
    } catch {
      showToast("Failed to update status", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSessionSubmitted = () => {
    hasFetched.current = false;
    fetchData();
  };

  const fullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();

  const chartData = [...sessions]
    .filter((s) => s.wellbeing_status && WELLBEING_SCALE[s.wellbeing_status])
    .slice(0, 5)
    .reverse()
    .map((s, i) => ({
      idx: i + 1,
      score: WELLBEING_SCALE[s.wellbeing_status!] ?? null,
    }));

  // Alert flags from last 3 sessions
  const recentSessions = sessions.slice(0, 3);
  const dishonestyCount = recentSessions.filter((s) => s.dishonesty_flagged).length;
  const stressCount = recentSessions.filter((s) => s.stress_flag).length;
  const hasAlerts = dishonestyCount > 0 || stressCount > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{fullName}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {student.registration_number
                ? [student.registration_number, student.class_group_name].filter(Boolean).join(" · ")
                : student.class_group_name ?? "Not placed in a class"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log Session
        </button>
      </div>

      {/* Alert banner — only shown when flags are present in recent sessions */}
      {hasAlerts && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-xl"
        >
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-red-700 dark:text-red-300">
            Attention — recent sessions flagged:
          </span>
          {dishonestyCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full font-medium">
              Academic Integrity ({dishonestyCount}×)
            </span>
          )}
          {stressCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded-full font-medium">
              Severe Stress ({stressCount}×)
            </span>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Left column: status cards */}
        <div className="md:col-span-1 space-y-4 overflow-y-auto">
          {/* Current Status card */}
          <div className="bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Current Status
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Wellbeing</span>
                <span className="text-xl">
                  {student.wellbeing_status
                    ? WELLBEING_EMOJI[student.wellbeing_status] ?? "—"
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Last seen</span>
                <span
                  className={`text-sm font-medium ${
                    student.overdue ? "text-orange-500" : "text-gray-800 dark:text-gray-200"
                  }`}
                >
                  {student.last_session_date
                    ? `${student.days_since_last_session}d ago`
                    : "Never"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Sessions</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {sessions.length}
                </span>
              </div>
              {student.follow_up_required && (
                <div className="flex items-center gap-1.5 text-red-500 text-xs mt-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Follow-up required
                </div>
              )}
            </div>
          </div>

          {/* AI Insights card */}
          <AIInsightsCard studentId={student.user_id} />

          {/* Grade snapshot card */}
          {intelligence && intelligence.recent_scores.length > 0 && (
            <div className="bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 className="w-3.5 h-3.5 text-indigo-500" />
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Recent Grades
                </p>
              </div>
              <div className="space-y-2">
                {intelligence.recent_scores.map((score) => (
                  <div key={score.score_id} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">
                      {score.subject_name ?? "Unknown"}
                      {score.title && (
                        <span className="text-gray-400 dark:text-gray-500"> · {score.title}</span>
                      )}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        pctBg(score.percentage ?? 0)
                      } ${pctColor(score.percentage ?? 0)}`}
                    >
                      {score.percentage !== null ? `${score.percentage}%` : `${score.score}/${score.max_score}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wellbeing trend sparkline */}
          {chartData.length >= 2 && (
            <div className="bg-white dark:bg-gray-800/30 rounded-2xl p-5 border border-gray-100 dark:border-gray-700/20">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Wellbeing Trend
              </p>
              <ResponsiveContainer width="100%" height={60}>
                <LineChart data={chartData}>
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                  />
                  <Tooltip
                    formatter={(val: string | number | undefined) => {
                      if (val === undefined) return ["—", "Wellbeing"];
                      const n = Number(val);
                      const label = Object.keys(WELLBEING_SCALE).find(
                        (k) => WELLBEING_SCALE[k] === n,
                      );
                      return [label ?? val, "Wellbeing"] as [string | number, string];
                    }}
                    contentStyle={{
                      fontSize: "12px",
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>😢</span>
                <span>😄</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Timeline */}
        <div className="md:col-span-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading history...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Clock className="w-8 h-8" />
              <p className="text-sm">No sessions logged yet.</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-blue-500 hover:underline text-sm"
              >
                Log the first session
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

              <AnimatePresence initial={false}>
                {sessions.map((session, idx) => (
                  <motion.div
                    key={session.mentorship_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="relative pl-10 pb-6"
                  >
                    {/* Timeline dot */}
                    <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white dark:bg-gray-800 border-2 border-blue-400 flex items-center justify-center text-base">
                      {session.wellbeing_status
                        ? WELLBEING_EMOJI[session.wellbeing_status] ?? "📝"
                        : "📝"}
                    </div>

                    <div
                      className={`bg-white dark:bg-gray-800/30 rounded-2xl p-4 border shadow-sm ${
                        session.dishonesty_flagged
                          ? "border-red-300 dark:border-red-700"
                          : session.stress_flag
                          ? "border-orange-300 dark:border-orange-700"
                          : "border-gray-100 dark:border-gray-700"
                      }`}
                    >
                      {/* Session header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {session.session_date
                              ? new Date(session.session_date + "T00:00:00").toLocaleDateString(
                                  "en-GB",
                                  { day: "numeric", month: "long", year: "numeric" },
                                )
                              : "Unknown date"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {session.duration_minutes && (
                              <p className="text-xs text-gray-400">{session.duration_minutes} min</p>
                            )}
                            {session.topic && (
                              <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
                                {session.topic}
                              </span>
                            )}
                            {session.discipline_progress && (
                              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                {DISC_ICON[session.discipline_progress]}
                                {session.discipline_progress.charAt(0) +
                                  session.discipline_progress.slice(1).toLowerCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          {/* Alert badges */}
                          {session.dishonesty_flagged && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full font-semibold">
                              <AlertTriangle className="w-3 h-3" />
                              Integrity
                            </span>
                          )}
                          {session.stress_flag && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full font-semibold">
                              <AlertTriangle className="w-3 h-3" />
                              Stress
                            </span>
                          )}
                          {session.follow_up_required && (
                            <SelectField
                              value={session.session_status}
                              disabled={updatingId === session.mentorship_id}
                              onChange={(e) =>
                                handleStatusChange(
                                  session.mentorship_id,
                                  e.target.value as SessionStatus,
                                )
                              }
                              className={`text-xs px-2.5 py-1 rounded-full font-medium border-0 cursor-pointer ${
                                STATUS_STYLE[session.session_status]
                              }`}
                            >
                              <option value="OPEN">OPEN</option>
                              <option value="IN_PROGRESS">IN PROGRESS</option>
                              <option value="RESOLVED">RESOLVED</option>
                            </SelectField>
                          )}
                          {!session.follow_up_required &&
                            session.session_status === "RESOLVED" && (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Resolved
                              </span>
                            )}
                          <button
                            type="button"
                            onClick={() => setEditingSession(session)}
                            title="Edit this session"
                            className="flex items-center gap-1 text-xs px-2 py-0.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                        {(session.academic_planning || session.academic_personal_notes) && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Academic & Personal:{" "}
                            </span>
                            {[session.academic_planning, session.academic_personal_notes]
                              .filter(Boolean)
                              .join(" — ")}
                          </div>
                        )}
                        {(session.challenges_identified || session.guidance_notes) && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Challenges & Guidance:{" "}
                            </span>
                            {session.challenges_identified}
                            {session.guidance_notes && (
                              <span className="text-violet-600 dark:text-violet-400">
                                {" "}→ {session.guidance_notes}
                              </span>
                            )}
                          </div>
                        )}
                        {session.discipline_notes && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Discipline:{" "}
                            </span>
                            {session.discipline_notes}
                          </div>
                        )}
                        {session.wellbeing_notes && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Well-being:{" "}
                            </span>
                            {session.wellbeing_notes}
                          </div>
                        )}
                        {session.action_items && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                            <span className="font-medium text-amber-700 dark:text-amber-400">
                              Action items:{" "}
                            </span>
                            <span className="text-amber-800 dark:text-amber-300">
                              {session.action_items}
                            </span>
                          </div>
                        )}
                        {session.next_steps && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Next steps:{" "}
                            </span>
                            {session.next_steps}
                          </div>
                        )}
                        {session.notes && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              Notes:{" "}
                            </span>
                            {session.notes}
                          </div>
                        )}
                      </div>

                      {/* Tags row */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {session.assignment_completion && (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                            Assignment: {session.assignment_completion}
                          </span>
                        )}
                        {session.punctuality_attendance && (
                          <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 rounded-full text-amber-600 dark:text-amber-400">
                            Attendance: {session.punctuality_attendance}
                          </span>
                        )}
                        {session.is_completed && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 rounded-full text-green-600 dark:text-green-400 font-semibold">
                            ✓ Completed
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {(showModal || editingSession) && (
        <MentoringSessionModal
          student={student}
          lastSession={sessions[0] ?? null}
          sessionHistory={sessions}
          editSession={editingSession}
          onClose={() => {
            setShowModal(false);
            setEditingSession(null);
          }}
          onSubmitted={handleSessionSubmitted}
        />
      )}
    </div>
  );
};

export default StudentSupportProfile;
