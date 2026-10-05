import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import Modal from "../../ui/Modal";
import { useToast } from "../../../contexts/ToastContext";
import { apiError, formatYmd, officeHoursApi, studentName, type Escalation, type OfficeHoursConfig } from "../../../api/officeHours";
import { Card, CardTitle, EmptyState, inputCls, labelCls, Muted, primaryBtn, secondaryBtn, Spinner } from "../ohUi";
import { NGA_APPS } from "../../apps/ngaApps";
import SelectField from "../../ui/SelectField";

/** The attendance app's "Log incident" form, prefilled (it saves nothing until the teacher submits). */
export const disciplineReferralUrl = (e: Escalation) => {
  const tendo = NGA_APPS.find((a) => a.key === "tendo");
  if (!tendo || !e.student) return null;
  const q = new URLSearchParams({
    student_id: String(e.student_id),
    ...(e.student.class_group_id ? { class_id: String(e.student.class_group_id) } : {}),
    title: "Missed mandatory office hours",
    description: `${e.title} with ${e.teacher_name ?? "their teacher"}: ${TRIGGER[e.trigger_code].toLowerCase()} (last missed ${e.last_missed}).`,
  });
  return `${tendo.origin}/discipline/log?${q.toString()}`;
};

/**
 * Escalations (plan §13.4): students whose repeated absence was escalated,
 * with who was told. Acknowledging records that someone followed up.
 */
const TRIGGER: Record<Escalation["trigger_code"], string> = {
  CONSECUTIVE_L1: "Missed sessions in a row",
  MONTH_L1: "Several absences this month",
  CONSECUTIVE_L2: "Kept missing sessions",
  RATE_BELOW: "Attendance below the watch threshold",
};

const EscalationsTab: React.FC<{ termId: number | null; config?: OfficeHoursConfig }> = ({ termId }) => {
  const { showToast } = useToast();
  const [status, setStatus] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<Escalation[] | null>(null);
  const [acking, setAcking] = useState<Escalation | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    setRows(null);
    officeHoursApi
      .escalations({ term_id: termId, status })
      .then((r) => setRows(r.data.data))
      .catch((e) => {
        setRows([]);
        showToast(apiError(e, "Couldn't load escalations"), "error");
      });
  }, [termId, status, showToast]);
  useEffect(load, [load]);

  const ack = async () => {
    if (!acking) return;
    try {
      await officeHoursApi.acknowledgeEscalation(acking.escalation_id, note.trim() || undefined);
      showToast("Marked as followed up", "success");
      setAcking(null);
      setNote("");
      load();
    } catch (e) {
      showToast(apiError(e), "error");
    }
  };

  return (
    <Card labelledBy="oh-escalations">
      <CardTitle
        id="oh-escalations"
        icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
        action={
          <SelectField aria-label="Show" className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as "open" | "all")}>
            <option value="open">Needs follow-up</option>
            <option value="all">All this term</option>
          </SelectField>
        }
      >
        Escalations
      </CardTitle>
      <Muted className="mb-3">Level 1 tells the student, their teacher and class teacher. Level 2 also tells the programme lead and, by policy, the family.</Muted>
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title={status === "open" ? "Nothing needs follow-up" : "No escalations this term"} />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-gray-700/30">
          {rows.map((e) => (
            <li key={e.escalation_id} className="flex flex-wrap items-start gap-3 py-3">
              <span
                className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${e.level >= 2 ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" : "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100"}`}
              >
                Level {e.level}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">
                  {studentName(e.student)} <span className="font-normal text-slate-600 dark:text-gray-300">· {e.student?.class_group_name}</span>
                </p>
                <p className="text-sm text-slate-700 dark:text-gray-200">
                  {TRIGGER[e.trigger_code]} — {e.title} with {e.teacher_name}, last missed {formatYmd(e.last_missed)}
                </p>
                {e.acknowledged_at && (
                  <p className="text-xs text-emerald-800 dark:text-emerald-200">
                    Followed up by {e.acknowledged_by_name ?? "staff"}
                    {e.resolution_note ? `: “${e.resolution_note}”` : ""}
                  </p>
                )}
              </div>
              {e.level >= 2 && disciplineReferralUrl(e) && (
                <a className={secondaryBtn} href={disciplineReferralUrl(e)!} target="_blank" rel="noopener noreferrer">
                  Refer to discipline
                </a>
              )}
              {!e.acknowledged_at && (
                <button type="button" className={secondaryBtn} onClick={() => setAcking(e)}>
                  Mark followed up
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal isOpen={Boolean(acking)} onClose={() => setAcking(null)} title={`Follow-up for ${studentName(acking?.student)}`}>
        <div className="space-y-3">
          <label htmlFor="oh-ack-note" className={labelCls}>What was done? (optional)</label>
          <input id="oh-ack-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Met the student and their class teacher" />
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryBtn} onClick={() => setAcking(null)}>Cancel</button>
            <button type="button" className={primaryBtn} onClick={() => void ack()}>Save</button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

export default EscalationsTab;
