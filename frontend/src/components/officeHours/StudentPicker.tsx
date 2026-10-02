import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Search, UserPlus } from "lucide-react";
import {
  apiError,
  humanize,
  officeHoursApi,
  studentName,
  type AssignResult,
  type Candidate,
  type CandidatesResponse,
} from "../../api/officeHours";
import { useToast } from "../../contexts/ToastContext";
import { AvailabilityChip, EmptyState, inputCls, labelCls, Muted, primaryBtn, secondaryBtn, Spinner } from "./ohUi";

/**
 * Student picker (plan §9.3). Lists the students the schedule's teacher may
 * assign -- by class, or by search -- each with an availability chip. Students
 * who already hold office hours elsewhere cannot be ticked; the teacher can ask
 * their holder for a transfer instead. The server re-checks everything, so a
 * student taken in the meantime comes back as a conflict shown inline.
 */
export interface StudentPickerProps {
  scheduleId: number;
  reasonCodes: string[];
  onAssigned?: (result: AssignResult) => void;
}

const summarise = (r: AssignResult) => {
  const parts = [`${r.assigned.length} assigned`];
  if (r.conflicts.length) parts.push(`${r.conflicts.length} already ${r.conflicts.length === 1 ? "has" : "have"} office hours`);
  if (r.over_capacity.length) parts.push(`${r.over_capacity.length} over capacity`);
  if (r.ineligible.length) parts.push(`${r.ineligible.length} not eligible`);
  if (r.already_assigned.length) parts.push(`${r.already_assigned.length} already with you`);
  return parts.join(" · ");
};

const StudentPicker: React.FC<StudentPickerProps> = ({ scheduleId, reasonCodes, onAssigned }) => {
  const { showToast } = useToast();
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [classGroupId, setClassGroupId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [onlyFree, setOnlyFree] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<AssignResult | null>(null);
  const [groupNames, setGroupNames] = useState<Map<number, string>>(new Map());
  const [transferFor, setTransferFor] = useState<Candidate | null>(null);
  const [transferMessage, setTransferMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await officeHoursApi.candidates(scheduleId, {
        class_group_id: classGroupId || null,
        q: q.trim().length >= 2 ? q.trim() : undefined,
      });
      setData(r.data.data);
      setGroupNames((prev) => {
        const next = new Map(prev);
        for (const s of r.data.data.students) if (s.class_group_id && s.class_group_name) next.set(s.class_group_id, s.class_group_name);
        return next;
      });
    } catch (error) {
      showToast(apiError(error, "Couldn't load students"), "error");
    } finally {
      setLoading(false);
    }
  }, [scheduleId, classGroupId, q, showToast]);

  useEffect(() => {
    const t = window.setTimeout(load, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  const students = useMemo(
    () => (data?.students ?? []).filter((s) => !onlyFree || s.availability.status === "FREE"),
    [data, onlyFree],
  );
  const selectable = (s: Candidate) => s.availability.status === "FREE" && s.eligible;
  const freeVisible = students.filter(selectable);
  const capacityLeft = data ? Math.max(0, data.capacity - data.assigned_count) : 0;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllFree = () => setSelected(new Set(freeVisible.slice(0, capacityLeft).map((s) => s.student_id)));

  const assign = async () => {
    if (!selected.size) return;
    setSaving(true);
    try {
      const r = await officeHoursApi.assign(scheduleId, {
        student_ids: [...selected],
        reason_code: reason || undefined,
        reason_note: reasonNote.trim() || undefined,
      });
      const result = r.data.data;
      setLastResult(result);
      showToast(summarise(result), result.assigned.length ? "success" : "warning");
      setSelected(new Set());
      onAssigned?.(result);
      await load();
    } catch (error) {
      showToast(apiError(error, "Couldn't assign students"), "error");
    } finally {
      setSaving(false);
    }
  };

  const requestTransfer = async () => {
    if (!transferFor) return;
    try {
      await officeHoursApi.requestTransfer({ student_id: transferFor.student_id, to_schedule_id: scheduleId, message: transferMessage.trim() || undefined });
      const h = transferFor.availability.status === "HELD_BY_OTHER" ? transferFor.availability.holders[0] : null;
      showToast(`Asked ${h?.teacher_name ?? "the other teacher"} to release ${studentName(transferFor)}`, "success");
      setTransferFor(null);
      setTransferMessage("");
    } catch (error) {
      showToast(apiError(error, "Couldn't send the request"), "error");
    }
  };

  const nameOf = (id: number) => {
    const s = data?.students.find((x) => x.student_id === id);
    return s ? studentName(s) : `Student ${id}`;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="oh-picker-class" className={labelCls}>Class</label>
          <select
            id="oh-picker-class"
            className={inputCls}
            value={classGroupId}
            onChange={(e) => setClassGroupId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">All my students</option>
            {(data?.class_groups ?? []).map((id) => (
              <option key={id} value={id}>{groupNames.get(id) ?? `Class ${id}`}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="oh-picker-search" className={labelCls}>Search by name or registration number</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input id="oh-picker-search" className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Uwase or 2026-0012" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-slate-800 dark:text-slate-100" aria-live="polite">
            {data ? `${data.assigned_count} / ${data.capacity} places used` : "—"}
          </span>
          {data && (
            <span className="h-2 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
              <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (data.assigned_count / Math.max(1, data.capacity)) * 100)}%` }} />
            </span>
          )}
          <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="h-4 w-4 rounded border-slate-400" />
            Only students who are free
          </label>
        </div>
        <button type="button" className={secondaryBtn} onClick={selectAllFree} disabled={!freeVisible.length || !capacityLeft}>
          Select all free{capacityLeft < freeVisible.length ? ` (${capacityLeft})` : ""}
        </button>
      </div>

      {data?.lock_mode === "TERM" && (
        <Muted className="text-xs">A student can hold only one set of office hours this term. Students with office hours elsewhere are shown but can't be ticked.</Muted>
      )}

      <div className="max-h-[46vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700">
        {loading && !data ? (
          <div className="px-4"><Spinner label="Loading students" /></div>
        ) : students.length === 0 ? (
          <div className="p-4"><EmptyState title="No students found" body={q ? "Try another name, or clear the class filter." : "Students you teach this year appear here."} /></div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Students">
            {students.map((s) => {
              const can = selectable(s);
              const id = `oh-pick-${s.student_id}`;
              return (
                <li key={s.student_id} className={`flex items-center gap-3 px-4 py-2.5 ${can ? "" : "bg-slate-50/60 dark:bg-slate-800/30"}`}>
                  <input
                    id={id}
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-400 disabled:opacity-40"
                    checked={selected.has(s.student_id)}
                    disabled={!can || (!selected.has(s.student_id) && selected.size >= capacityLeft)}
                    onChange={() => toggle(s.student_id)}
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{studentName(s)}</span>
                    <span className="block truncate text-xs text-slate-600 dark:text-slate-300">
                      {[s.class_group_name, s.registration_number].filter(Boolean).join(" · ")}
                    </span>
                  </label>
                  {s.clash_note && (
                    <span className="hidden text-amber-700 dark:text-amber-300 sm:inline" title={`Also scheduled: ${s.clash_note}`}>
                      <AlertTriangle className="h-4 w-4" aria-label={`Also scheduled: ${s.clash_note}`} />
                    </span>
                  )}
                  {s.not_your_student && s.eligible && (
                    <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-100 sm:inline">Not your student</span>
                  )}
                  <AvailabilityChip availability={s.availability} />
                  {s.availability.status === "HELD_BY_OTHER" && (
                    <button
                      type="button"
                      onClick={() => setTransferFor(s)}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-500/10"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden /> Ask to transfer
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {transferFor && transferFor.availability.status === "HELD_BY_OTHER" && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/30 dark:bg-blue-500/10" role="region" aria-label="Transfer request">
          <p className="text-sm text-slate-800 dark:text-slate-100">
            Ask <strong>{transferFor.availability.holders[0]?.teacher_name ?? "the other teacher"}</strong> to release{" "}
            <strong>{studentName(transferFor)}</strong> from “{transferFor.availability.holders[0]?.title}”?
          </p>
          <label htmlFor="oh-transfer-msg" className={`${labelCls} mt-3`}>Message (optional)</label>
          <input id="oh-transfer-msg" className={inputCls} value={transferMessage} onChange={(e) => setTransferMessage(e.target.value)} maxLength={500} placeholder="Why this student needs your office hours" />
          <div className="mt-3 flex gap-2">
            <button type="button" className={primaryBtn} onClick={requestTransfer}>Send request</button>
            <button type="button" className={secondaryBtn} onClick={() => setTransferFor(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="oh-reason" className={labelCls}>Why these students? (staff only)</label>
          <select id="oh-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">No reason given</option>
            {reasonCodes.map((c) => (
              <option key={c} value={c}>{humanize(c)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="oh-reason-note" className={labelCls}>Note (staff only, optional)</label>
          <input id="oh-reason-note" className={inputCls} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} maxLength={500} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Muted className="text-xs">Students see only the teacher, subject, days and room — never the reason.</Muted>
        <button type="button" className={primaryBtn} onClick={assign} disabled={!selected.size || saving}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {saving ? "Assigning…" : selected.size ? `Assign ${selected.size} student${selected.size === 1 ? "" : "s"}` : "Assign students"}
        </button>
      </div>

      {lastResult && (lastResult.conflicts.length > 0 || lastResult.over_capacity.length > 0 || lastResult.ineligible.length > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" role="status">
          <p className="font-semibold">Not everyone could be added</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {lastResult.conflicts.map((c) => (
              <li key={`c${c.student_id}`}>
                {nameOf(c.student_id)} already has office hours
                {c.holders[0] ? ` with ${c.holders[0].teacher_name ?? "another teacher"} (${c.holders[0].days_label})` : ""}.
              </li>
            ))}
            {lastResult.over_capacity.map((id) => (
              <li key={`o${id}`}>{nameOf(id)}: these office hours are full.</li>
            ))}
            {lastResult.ineligible.map((x) => (
              <li key={`i${x.student_id}`}>
                {nameOf(x.student_id)}: {x.reason === "NOT_YOUR_STUDENT" ? "you don't teach this student" : x.reason === "OUT_OF_SCOPE" ? "outside your area" : "not active in a class this year"}.
              </li>
            ))}
          </ul>
        </div>
      )}
      {lastResult?.no_remaining_sessions && (
        <p className="text-sm text-amber-800 dark:text-amber-200" role="status">No sessions remain in these office hours, so no one was added.</p>
      )}
    </div>
  );
};

export default StudentPicker;
