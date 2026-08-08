import React, { useEffect, useRef, useState } from "react";
import {
  X,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle2,
  Tag,
  User as UserIcon,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { reportsApi, AdminStudentTimelineSession, WellbeingTrendPoint } from "../../api/reports";
import { useToast } from "../../contexts/ToastContext";

const WELLBEING_EMOJI: Record<string, string> = {
  STRUGGLING: "😢",
  CONCERNED:  "😟",
  NEUTRAL:    "😐",
  GOOD:       "🙂",
  EXCELLENT:  "😄",
};

const WELLBEING_COLOR: Record<string, string> = {
  STRUGGLING: "#EF4444",
  CONCERNED:  "#F97316",
  NEUTRAL:    "#EAB308",
  GOOD:       "#22C55E",
  EXCELLENT:  "#3B82F6",
};

// Harmonized on amber for "open/pending" (matches the rest of the
// mentorship/reporting area's session_status rendering).
const STATUS_STYLE: Record<string, string> = {
  OPEN:        "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  IN_PROGRESS: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  RESOLVED:    "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
};

interface Props {
  studentId:   number;
  studentName: string;
  onClose:     () => void;
}

const AdminStudentSupportModal: React.FC<Props> = ({ studentId, studentName, onClose }) => {
  const { showToast } = useToast();
  const [sessions, setSessions]   = useState<AdminStudentTimelineSession[]>([]);
  const [trend, setTrend]         = useState<WellbeingTrendPoint[]>([]);
  const [loading, setLoading]     = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    (async () => {
      try {
        const res = await reportsApi.getAdminStudentTimeline(studentId);
        const data = (res as any).data?.data ?? (res as any).data ?? {};
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
        setTrend(Array.isArray(data.wellbeing_trend) ? data.wellbeing_trend : []);
      } catch {
        showToast("Failed to load student timeline", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  const latestWellbeing = sessions.length > 0 ? sessions[sessions.length - 1].wellbeing_status : null;

  const formatDate = (d: string | null) => {
    if (!d) return "Unknown date";
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800/30 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold text-sm flex-shrink-0">
              <UserIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {studentName || "Student"} — Support Profile
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {sessions.length} session{sessions.length !== 1 ? "s" : ""} on record
                {latestWellbeing && (
                  <span className="ml-2">
                    · Current: {WELLBEING_EMOJI[latestWellbeing]} {latestWellbeing}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Loading timeline...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <Clock className="w-8 h-8" />
              <p className="text-sm">No mentorship sessions recorded for this student.</p>
            </div>
          ) : (
            <>
              {/* Wellbeing trend chart */}
              {trend.length >= 2 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                    Wellbeing Trend
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) =>
                          new Date(v + "T00:00:00").toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })
                        }
                      />
                      <YAxis
                        domain={[1, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) =>
                          ["", "😢", "😟", "😐", "🙂", "😄"][v] ?? ""
                        }
                        width={28}
                      />
                      <Tooltip
                        formatter={(_val: any, _name: any, props: any) => [
                          `${props.payload.label} ${WELLBEING_EMOJI[props.payload.label] ?? ""}`,
                          "Wellbeing",
                        ]}
                        labelFormatter={(label) =>
                          new Date(label + "T00:00:00").toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        }
                        contentStyle={{
                          fontSize: "12px",
                          borderRadius: "8px",
                          border: "none",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        dot={(props: any) => {
                          const { cx, cy, payload } = props;
                          return (
                            <circle
                              key={`dot-${props.index}`}
                              cx={cx}
                              cy={cy}
                              r={5}
                              fill={WELLBEING_COLOR[payload.label] ?? "#3b82f6"}
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          );
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Session timeline */}
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-4">
                  {[...sessions].reverse().map((session) => (
                    <div key={session.mentorship_id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white dark:bg-gray-800/30 border-2 border-blue-400 flex items-center justify-center text-base">
                        {session.wellbeing_status
                          ? WELLBEING_EMOJI[session.wellbeing_status] ?? "📝"
                          : "📝"}
                      </div>

                      <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm">
                        {/* Header row */}
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                              {formatDate(session.session_date)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {session.instructor_name}
                              {session.duration_minutes
                                ? ` · ${session.duration_minutes} min`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {session.follow_up_required && (
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  STATUS_STYLE[session.session_status] ??
                                  STATUS_STYLE.OPEN
                                }`}
                              >
                                {session.session_status.replace("_", " ")}
                              </span>
                            )}
                            {!session.follow_up_required && session.session_status === "RESOLVED" && (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                        </div>

                        {/* Topic badge */}
                        {session.topic && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full font-medium mb-2">
                            <Tag className="w-3 h-3" />
                            {session.topic}
                          </span>
                        )}

                        {/* Content fields */}
                        <div className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                          {session.notes && (
                            <p>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Notes: </span>
                              {session.notes}
                            </p>
                          )}
                          {session.challenges_identified && (
                            <p>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Challenges: </span>
                              {session.challenges_identified}
                            </p>
                          )}
                          {session.action_items && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mt-1">
                              <span className="font-medium text-amber-700 dark:text-amber-400">Action items: </span>
                              <span className="text-amber-800 dark:text-amber-300">
                                {session.action_items}
                              </span>
                            </div>
                          )}
                          {session.next_steps && (
                            <p>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Next steps: </span>
                              {session.next_steps}
                            </p>
                          )}
                        </div>

                        {/* Follow-up warning */}
                        {session.follow_up_required && session.session_status !== "RESOLVED" && (
                          <div className="flex items-center gap-1.5 text-red-500 text-xs mt-2">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Follow-up still open
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminStudentSupportModal;
