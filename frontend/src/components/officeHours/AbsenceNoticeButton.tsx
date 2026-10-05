import React, { useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { apiError, humanize, officeHoursApi, type StudentSessionView } from "../../api/officeHours";
import { inputCls, labelCls, primaryBtn, secondaryBtn } from "./ohUi";
import SelectField from "../ui/SelectField";

/**
 * "I can't come" (plan §10.1): before a session, the student tells the
 * teacher why. It shows on the register as a suggestion to excuse; the
 * teacher still decides.
 */
const REASONS = ["SICK", "SCHOOL_ACTIVITY", "FAMILY", "PERMISSION", "OTHER"];

const AbsenceNoticeButton: React.FC<{ session: StudentSessionView; onSent?: () => void }> = ({ session, onSent }) => {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("SICK");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (session.notice) {
    return (
      <div className="mt-3 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-500/10 dark:text-sky-100">
        You told your teacher you can't come ({humanize(session.notice.reason).toLowerCase()}).
        <button
          type="button"
          className="ml-2 font-semibold underline"
          onClick={async () => {
            try {
              await officeHoursApi.withdrawAbsenceNotice(session.session_id);
              showToast("Notice withdrawn — you're expected after all", "info");
              onSent?.();
            } catch (e) {
              showToast(apiError(e), "error");
            }
          }}
        >
          I can come after all
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className={`${secondaryBtn} mt-3`} onClick={() => setOpen(true)}>
        <MessageSquareWarning className="h-4 w-4" aria-hidden /> I can't come
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-2 rounded-2xl border border-slate-200 p-3 dark:border-slate-700"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await officeHoursApi.sendAbsenceNotice(session.session_id, reason, note.trim() || undefined);
          showToast("Your teacher has been told", "success");
          setOpen(false);
          onSent?.();
        } catch (err) {
          showToast(apiError(err, "Couldn't send it"), "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor={`oh-abs-${session.session_id}`} className={labelCls}>Why?</label>
        <SelectField id={`oh-abs-${session.session_id}`} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => (
            <option key={r} value={r}>{humanize(r)}</option>
          ))}
        </SelectField>
      </div>
      <div>
        <label htmlFor={`oh-abs-note-${session.session_id}`} className={labelCls}>Message (optional)</label>
        <input id={`oh-abs-note-${session.session_id}`} className={inputCls} value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryBtn} disabled={busy}>Tell my teacher</button>
        <button type="button" className={secondaryBtn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
};

export default AbsenceNoticeButton;
