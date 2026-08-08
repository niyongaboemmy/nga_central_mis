import React, { useEffect, useState, useCallback } from "react";
import { MessageCircle, RefreshCw, X, Check, ThumbsDown, Clock3, CheckCircle2, XCircle } from "lucide-react";
import { mentorshipApi, MenteeCheckInRecord, CheckInStatus, ValidationStatus } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";

const CATEGORY_LABEL: Record<string, string> = {
  APPRECIATION: "Appreciation",
  CONCERN: "Concern",
  REQUEST_MEETING: "Meeting Request",
  GENERAL: "General",
};

const CATEGORY_COLOR: Record<string, string> = {
  APPRECIATION: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
  CONCERN: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  REQUEST_MEETING: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
  GENERAL: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

const VALIDATION_BADGE: Record<ValidationStatus, { label: string; className: string; icon: React.ReactNode }> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    icon: <Clock3 className="w-3 h-3" />,
  },
  APPROVED: {
    label: "Approved",
    className: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    icon: <XCircle className="w-3 h-3" />,
  },
};

// Same polling cadence as MyMentor.tsx's badge refresh — no push/websocket
// infra exists in this codebase, so a periodic re-fetch is how "new since
// last look" stays fresh without a manual reload.
const POLL_INTERVAL_MS = 45_000;

interface MentorCheckInInboxProps {
  onUnreadCountChange?: (count: number) => void;
}

const MentorCheckInInbox: React.FC<MentorCheckInInboxProps> = ({ onUnreadCountChange }) => {
  const { showToast } = useToast();
  const [checkIns, setCheckIns] = useState<MenteeCheckInRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MenteeCheckInRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<CheckInStatus | "">("");
  const [rejectMode, setRejectMode] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await mentorshipApi.getCheckInInbox(statusFilter || undefined);
      const data = (res as any).data?.data ?? (res as any).data ?? [];
      const list = Array.isArray(data) ? data : [];
      setCheckIns(list);
      onUnreadCountChange?.(list.filter((c: MenteeCheckInRecord) => c.status === "NEW").length);
    } catch {
      if (!silent) showToast("Failed to load check-ins", "error");
    } finally {
      if (!silent) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleRespond = async (checkin: MenteeCheckInRecord, status: CheckInStatus, response?: string) => {
    try {
      await mentorshipApi.updateCheckIn(checkin.checkin_id, { status, mentor_response: response });
      showToast("Check-in updated", "success");
      setSelected(null);
      load();
    } catch {
      showToast("Failed to update check-in", "error");
    }
  };

  const handleReview = async (checkin: MenteeCheckInRecord, validation_status: ValidationStatus, comment?: string) => {
    if (validation_status === "REJECTED" && !comment?.trim()) {
      showToast("A comment is required when rejecting a report", "error");
      return;
    }
    setActionLoading(true);
    try {
      await mentorshipApi.updateCheckIn(checkin.checkin_id, {
        validation_status,
        mentor_response: comment,
      });
      showToast(validation_status === "APPROVED" ? "Report approved" : "Report rejected", "success");
      setSelected(null);
      setRejectMode(false);
      load();
    } catch {
      showToast("Failed to submit review", "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-blue-500" />
          Mentee Reports & Check-ins
        </h3>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CheckInStatus | "")}
          className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800"
        >
          <option value="">All</option>
          <option value="NEW">New</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="ADDRESSED">Addressed</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center text-gray-400 py-8">
          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
          Loading...
        </div>
      ) : checkIns.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No check-ins from your mentees yet.</p>
      ) : (
        <div className="space-y-2">
          {checkIns.map((c) => {
            const badge = VALIDATION_BADGE[c.validation_status];
            return (
              <button
                key={c.checkin_id}
                onClick={() => setSelected(c)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  c.status === "NEW"
                    ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10"
                    : "border-gray-100 dark:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{c.student_name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CATEGORY_COLOR[c.category]}`}>
                      {CATEGORY_LABEL[c.category]}
                    </span>
                    <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.icon}
                      {badge.label}
                    </span>
                  </div>
                </div>
                {c.title && <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-0.5">{c.title}</p>}
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{c.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{c.submitted_at} — {c.status}</p>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">{selected.student_name}</h3>
              <button onClick={() => { setSelected(null); setRejectMode(false); }}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CATEGORY_COLOR[selected.category]}`}>
                  {CATEGORY_LABEL[selected.category]}
                </span>
                <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${VALIDATION_BADGE[selected.validation_status].className}`}>
                  {VALIDATION_BADGE[selected.validation_status].icon}
                  {VALIDATION_BADGE[selected.validation_status].label}
                </span>
              </div>
              {selected.title && <p className="text-sm font-semibold text-gray-900 dark:text-white">{selected.title}</p>}
              <p className="text-sm text-gray-700 dark:text-gray-300">{selected.message}</p>
              {selected.mentor_response && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400">
                  <span className="font-semibold">Your response: </span>{selected.mentor_response}
                </div>
              )}
              <textarea
                id="mentor-response-textarea"
                placeholder={rejectMode ? "Explain why this report is being rejected (required)..." : "Write a response (optional)..."}
                defaultValue={selected.mentor_response ?? ""}
                className="w-full text-sm border border-gray-200 dark:border-gray-600 rounded-xl p-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex-wrap">
              <button
                onClick={() => {
                  const el = document.getElementById("mentor-response-textarea") as HTMLTextAreaElement | null;
                  handleRespond(selected, "ACKNOWLEDGED", el?.value);
                }}
                className="px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl"
              >
                Acknowledge
              </button>
              <button
                disabled={actionLoading}
                onClick={() => {
                  const el = document.getElementById("mentor-response-textarea") as HTMLTextAreaElement | null;
                  if (rejectMode) {
                    handleReview(selected, "REJECTED", el?.value);
                  } else {
                    setRejectMode(true);
                  }
                }}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl disabled:opacity-50"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                {rejectMode ? "Confirm Reject" : "Reject"}
              </button>
              <button
                disabled={actionLoading}
                onClick={() => {
                  const el = document.getElementById("mentor-response-textarea") as HTMLTextAreaElement | null;
                  handleReview(selected, "APPROVED", el?.value);
                }}
                className="flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MentorCheckInInbox;
