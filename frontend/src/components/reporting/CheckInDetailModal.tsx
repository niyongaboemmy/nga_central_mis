import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Send, ThumbsDown } from "lucide-react";
import Modal from "../ui/Modal";
import UserAvatar from "../ui/UserAvatar";
import { mentorshipApi, MenteeCheckInRecord } from "../../api/mentorship";
import { useToast } from "../../contexts/ToastContext";
import { refreshMentorshipRole } from "../../hooks/useMentorshipRole";
import { categoryMeta, CHECKIN_STATUS_LABEL, formatDay, VALIDATION_LABEL } from "./checkInMeta";

interface Props {
  checkin: MenteeCheckInRecord | null;
  onClose: () => void;
  /** Called with the fields that changed, so the caller can update its list in place. */
  onChanged: (checkinId: number, patch: Partial<MenteeCheckInRecord>) => void;
  /** Offer a link to the mentee's page (hidden when already on it). */
  showProfileLink?: boolean;
}

/**
 * One check-in, read and answered in place. Opening an unread one marks it
 * seen (the student's history shows "Seen"; no notification for that alone).
 * Sending a reply, approving or rejecting notifies the student — the backend
 * does that, this only says so.
 */
const CheckInDetailModal: React.FC<Props> = ({ checkin, onClose, onChanged, showProfileLink = true }) => {
  const { showToast } = useToast();
  const [reply, setReply] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState<"reply" | "approve" | "reject" | null>(null);
  const markedSeen = useRef<number | null>(null);

  useEffect(() => {
    setReply(checkin?.mentor_response ?? "");
    setRejecting(false);
    if (!checkin || checkin.status !== "NEW" || markedSeen.current === checkin.checkin_id) return;
    markedSeen.current = checkin.checkin_id;
    mentorshipApi
      .updateCheckIn(checkin.checkin_id, { status: "ACKNOWLEDGED" })
      .then(() => {
        onChanged(checkin.checkin_id, { status: "ACKNOWLEDGED" });
        refreshMentorshipRole();
      })
      .catch(() => {
        /* still readable; it stays unread and is retried next time */
        markedSeen.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkin?.checkin_id]);

  if (!checkin) return <Modal isOpen={false} onClose={onClose} title="">{null}</Modal>;

  const name = checkin.student_name ?? "Student";
  const firstName = name.split(" ")[0];
  const category = categoryMeta(checkin.category);
  const validation = VALIDATION_LABEL[checkin.validation_status];
  const trimmed = reply.trim();
  const replyChanged = trimmed !== "" && trimmed !== (checkin.mentor_response ?? "").trim();

  const act = async (kind: "reply" | "approve" | "reject") => {
    if (kind === "reject" && !trimmed) {
      showToast("Tell the student why — a reason is required to send it back", "error");
      return;
    }
    setBusy(kind);
    try {
      const payload =
        kind === "reply"
          ? { mentor_response: trimmed }
          : { validation_status: kind === "approve" ? ("APPROVED" as const) : ("REJECTED" as const), mentor_response: trimmed || undefined };
      await mentorshipApi.updateCheckIn(checkin.checkin_id, payload);
      onChanged(checkin.checkin_id, {
        mentor_response: trimmed || checkin.mentor_response,
        ...(kind === "reply"
          ? { status: checkin.status === "NEW" ? "ACKNOWLEDGED" : checkin.status }
          : { validation_status: kind === "approve" ? "APPROVED" : "REJECTED", status: "ADDRESSED" }),
        responded_at: new Date().toISOString().slice(0, 10),
      });
      refreshMentorshipRole();
      showToast(
        kind === "reply"
          ? `Reply sent — ${firstName} has been notified`
          : kind === "approve"
            ? `Approved — ${firstName} has been notified`
            : `Sent back to ${firstName} with your reason`,
        "success",
      );
      onClose();
    } catch {
      showToast("Couldn't save that. Check your connection and try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      contentClassName="p-0"
      title={
        <span className="flex items-center gap-2.5">
          <UserAvatar decorative userId={checkin.student_id} name={name} size={32} />
          <span className="truncate">{name}</span>
        </span>
      }
    >
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-semibold">
          <span className={`px-2 py-0.5 rounded-full ${category.className}`}>{category.label}</span>
          <span className={`px-2 py-0.5 rounded-full ${validation.className}`}>{validation.label}</span>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
            {CHECKIN_STATUS_LABEL[checkin.status]}
          </span>
          <span className="ml-auto font-normal text-gray-500 dark:text-gray-400">
            Sent {formatDay(checkin.submitted_at)}
            {checkin.subject_name ? ` · ${checkin.subject_name}` : ""}
          </span>
        </div>

        <div className="rounded-2xl bg-gray-50 dark:bg-gray-800/60 p-4">
          {checkin.title && <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{checkin.title}</p>}
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{checkin.message}</p>
        </div>

        {checkin.mentor_response && (
          <div className="rounded-2xl border border-blue-100 dark:border-blue-900/40 p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">
              Your last reply{checkin.responded_at ? ` · ${formatDay(checkin.responded_at)}` : ""}
            </p>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{checkin.mentor_response}</p>
          </div>
        )}

        <div>
          <label htmlFor="checkin-reply" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
            {rejecting ? `Why are you sending this back? ${firstName} will see this.` : `Reply to ${firstName}`}
          </label>
          <textarea
            id="checkin-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={rejecting ? "A reason is required" : "Write a reply — they get a notification"}
            className={`w-full text-sm rounded-xl p-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white border focus:outline-none focus:ring-2 ${
              rejecting ? "border-red-300 dark:border-red-800 focus:ring-red-500" : "border-gray-200 dark:border-gray-700 focus:ring-blue-500"
            }`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700/60 flex-wrap">
        {showProfileLink && (
          <Link
            to={`/my-mentees/${checkin.student_id}`}
            onClick={onClose}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 mr-auto"
          >
            Open {firstName}'s page
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
        <div className={`flex items-center gap-2 flex-wrap ${showProfileLink ? "" : "ml-auto"}`}>
          {rejecting ? (
            <>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                className="px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!!busy || !trimmed}
                onClick={() => act("reject")}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50"
              >
                <ThumbsDown className="w-3.5 h-3.5" />
                {busy === "reject" ? "Sending…" : "Send back"}
              </button>
            </>
          ) : (
            <>
              {checkin.validation_status !== "REJECTED" && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => setRejecting(true)}
                  className="px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl disabled:opacity-50"
                >
                  Reject…
                </button>
              )}
              <button
                type="button"
                disabled={!!busy || !replyChanged}
                onClick={() => act("reply")}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-xl disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {busy === "reply" ? "Sending…" : "Send reply"}
              </button>
              {checkin.validation_status !== "APPROVED" && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => act("approve")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {busy === "approve" ? "Approving…" : trimmed && replyChanged ? "Approve & reply" : "Approve"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default CheckInDetailModal;
