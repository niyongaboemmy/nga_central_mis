import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, History, Search, Sparkles, UserPlus, Users, X } from "lucide-react";
import {
  addDaysYmd,
  apiError,
  formatYmd,
  humanize,
  officeHoursApi,
  scheduleWeeks,
  shortDate,
  studentName,
  weekStartOf,
  type AssignResult,
  type Candidate,
  type CandidatesResponse,
  type OfficeHourSchedule,
  type Suggestion,
} from "../../api/officeHours";
import { useToast } from "../../contexts/ToastContext";
import { AvailabilityChip, EmptyState, inputCls, labelCls, Muted, primaryBtn, secondaryBtn, Spinner } from "./ohUi";
import WeekNavigator from "./WeekNavigator";
import SelectField from "../ui/SelectField";

/**
 * Student picker (plan §9.3), week by week. With a `schedule` the teacher
 * invites students for one week -- or a few, or the rest of the term -- and
 * can bring last week's group back in one click, so the people who come can
 * change every week. Without one it falls back to the whole remaining term.
 *
 * Each student carries an availability chip. Students busy with another
 * teacher that week cannot be ticked; the teacher can ask for a transfer
 * instead. The server re-checks everything, so a student taken in the
 * meantime comes back as a conflict shown inline.
 */
export interface StudentPickerProps {
  scheduleId: number;
  reasonCodes: string[];
  onAssigned?: (result: AssignResult) => void;
  /** Enables weekly invitations over this schedule's weeks. */
  schedule?: Pick<OfficeHourSchedule, "effective_from" | "effective_to" | "days">;
  /** Monday of the week to start on (default: the first week still ahead). */
  initialWeek?: string;
  today?: string;
}

type Span = "1" | "2" | "4" | "term";
const SPANS: Array<[Span, string]> = [
  ["1", "This week"],
  ["2", "2 weeks"],
  ["4", "4 weeks"],
  ["term", "Rest of term"],
];

const summarise = (r: AssignResult) => {
  const start = r.assigned[0]?.effective_from;
  const parts = [`${r.assigned.length} invited${start ? `, starting ${formatYmd(start)}` : ""}`];
  if (r.conflicts.length) parts.push(`${r.conflicts.length} already ${r.conflicts.length === 1 ? "has" : "have"} office hours`);
  if (r.over_capacity.length) parts.push(`${r.over_capacity.length} over capacity`);
  if (r.ineligible.length) parts.push(`${r.ineligible.length} not eligible`);
  if (r.already_assigned.length) parts.push(`${r.already_assigned.length} already with you`);
  return parts.join(" · ");
};

const tabCls = (on: boolean) =>
  `inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
    on ? "bg-white text-slate-900 shadow-sm dark:bg-gray-800/30 dark:text-gray-50" : "text-slate-700 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white"
  }`;

const StudentPicker: React.FC<StudentPickerProps> = ({ scheduleId, reasonCodes, onAssigned, schedule, initialWeek, today }) => {
  const { showToast } = useToast();
  const weeks = useMemo(() => (schedule ? scheduleWeeks(schedule) : []), [schedule]);
  const todayYmd = today ?? new Date().toISOString().slice(0, 10);
  const firstOpen = weeks.find((w) => w.end >= todayYmd)?.start;
  const [week, setWeek] = useState<string | null>(() => {
    if (!weeks.length) return null;
    const wanted = initialWeek && weeks.some((w) => w.start === initialWeek && w.end >= todayYmd) ? initialWeek : null;
    return wanted ?? firstOpen ?? weeks[weeks.length - 1].start;
  });
  const [span, setSpan] = useState<Span>("1");
  const range = useMemo(() => {
    if (!week) return null;
    const from = week < weekStartOf(todayYmd) ? weekStartOf(todayYmd) : week;
    return { from, to: span === "term" ? undefined : addDaysYmd(week, 7 * Number(span) - 1) };
  }, [week, span, todayYmd]);

  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [classGroupId, setClassGroupId] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"all" | "suggested" | "last">("all");
  const [suggested, setSuggested] = useState<{ task_mentor: "ok" | "unavailable"; students: Suggestion[] } | null>(null);
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
        ...(range ? { from: range.from, ...(range.to ? { to: range.to } : {}) } : {}),
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
  }, [scheduleId, classGroupId, q, range, showToast]);

  useEffect(() => {
    const t = window.setTimeout(load, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  // A new week or duration starts a fresh selection.
  useEffect(() => {
    setSelected(new Set());
    setLastResult(null);
  }, [week, span]);

  useEffect(() => {
    if (mode !== "suggested" || suggested) return;
    officeHoursApi
      .suggestions(scheduleId)
      .then((r) => setSuggested(r.data.data))
      .catch(() => setSuggested({ task_mentor: "unavailable", students: [] }));
  }, [mode, suggested, scheduleId]);

  const lastWeekIds = useMemo(() => new Set(data?.previous_week?.student_ids ?? []), [data]);
  const signalsOf = useMemo(() => new Map((suggested?.students ?? []).map((s) => [s.student_id, s.signals])), [suggested]);
  const students = useMemo(() => {
    const base = (data?.students ?? []).filter((s) => !onlyFree || s.availability.status === "FREE");
    if (mode === "last") return base.filter((s) => lastWeekIds.has(s.student_id));
    if (mode !== "suggested") return base;
    // Suggested students, strongest evidence first, with their availability.
    const order = new Map((suggested?.students ?? []).map((s, i) => [s.student_id, i]));
    return base.filter((s) => order.has(s.student_id)).sort((a, b) => order.get(a.student_id)! - order.get(b.student_id)!);
  }, [data, onlyFree, mode, suggested, lastWeekIds]);
  const selectable = (s: Candidate) => s.availability.status === "FREE" && s.eligible;
  const freeVisible = students.filter(selectable);
  const capacityLeft = data ? Math.max(0, data.capacity - data.assigned_count) : 0;
  const noSessions = Boolean(schedule && data && data.window === null);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllFree = () => setSelected(new Set(freeVisible.slice(0, capacityLeft).map((s) => s.student_id)));
  const lastWeekFree = (data?.students ?? []).filter((s) => lastWeekIds.has(s.student_id) && selectable(s));
  const pickLastWeek = () => {
    setMode("last");
    setSelected(new Set(lastWeekFree.slice(0, capacityLeft).map((s) => s.student_id)));
  };

  const assign = async () => {
    if (!selected.size) return;
    setSaving(true);
    try {
      const r = await officeHoursApi.assign(scheduleId, {
        student_ids: [...selected],
        reason_code: reason || undefined,
        reason_note: reasonNote.trim() || undefined,
        ...(range ? { effective_from: range.from, ...(range.to ? { effective_to: range.to } : {}) } : {}),
      });
      const result = r.data.data;
      setLastResult(result);
      showToast(summarise(result), result.assigned.length ? "success" : "warning");
      setSelected(new Set());
      onAssigned?.(result);
      await load();
    } catch (error) {
      showToast(apiError(error, "Couldn't invite students"), "error");
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

  const spanLabel = !range
    ? "For the rest of the term"
    : span === "term"
      ? `From the week of ${shortDate(week!)} to the end of term`
      : span === "1"
        ? `Week of ${shortDate(week!)} only`
        : `${span} weeks from ${shortDate(week!)}`;

  return (
    <div className="space-y-4">
      {schedule && week && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-gray-700/30 dark:bg-gray-800/30">
          <WeekNavigator weeks={weeks} value={week} onChange={setWeek} today={todayYmd} minWeek={firstOpen} label="Inviting for the week" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">For</span>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="How long">
              {SPANS.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={span === k}
                  onClick={() => setSpan(k)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    span === k
                      ? "border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-400/60 dark:bg-blue-500/15 dark:text-blue-100"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-gray-700/50 dark:bg-gray-800/40 dark:text-gray-200 dark:hover:bg-gray-700/50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <Muted className="text-xs">Next week you can invite the same students again, or different ones.</Muted>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-gray-800/40" role="tablist" aria-label="Which students">
            <button type="button" role="tab" aria-selected={mode === "all"} onClick={() => setMode("all")} className={tabCls(mode === "all")}>
              <Users className="h-3.5 w-3.5" aria-hidden /> All my students
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "suggested"}
              onClick={() => {
                setMode("suggested");
                setClassGroupId("");
                setQ("");
              }}
              className={tabCls(mode === "suggested")}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Suggested
            </button>
            {schedule && (
              <button type="button" role="tab" aria-selected={mode === "last"} onClick={() => setMode("last")} className={tabCls(mode === "last")}>
                <History className="h-3.5 w-3.5" aria-hidden /> Last week{lastWeekIds.size ? ` (${lastWeekIds.size})` : ""}
              </button>
            )}
          </div>
          {mode === "suggested" && (
            <Muted className="text-xs">
              Students with evidence they need support: low Task Mentor results or missing work, or low office-hours attendance before. You decide — nobody is added automatically.
              {suggested?.task_mentor === "unavailable" ? " Task Mentor results are not available right now." : ""}
            </Muted>
          )}
          {mode === "last" && (
            <Muted className="text-xs">
              {lastWeekIds.size
                ? `The ${lastWeekIds.size} student${lastWeekIds.size === 1 ? "" : "s"} invited the week of ${shortDate(data!.previous_week!.from)}. Tick who should come again.`
                : "Nobody was invited the week before."}
            </Muted>
          )}

          <div className={`grid gap-3 sm:grid-cols-[14rem_minmax(0,1fr)] ${mode === "all" ? "" : "hidden"}`}>
            <div>
              <label htmlFor="oh-picker-class" className={labelCls}>Class</label>
              <SelectField id="oh-picker-class" className={inputCls} value={classGroupId} onChange={(e) => setClassGroupId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">All my students</option>
                {(data?.class_groups ?? []).map((id) => (
                  <option key={id} value={id}>{groupNames.get(id) ?? `Class ${id}`}</option>
                ))}
              </SelectField>
            </div>
            <div>
              <label htmlFor="oh-picker-search" className={labelCls}>Search by name or registration number</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <input id="oh-picker-search" className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Uwase or 2026-0012" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-slate-800 dark:text-gray-100" aria-live="polite">
                {data ? `${data.assigned_count} / ${data.capacity} places used` : "—"}
              </span>
              {data && (
                <span className="h-2 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700/50" aria-hidden>
                  <span className="block h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (data.assigned_count / Math.max(1, data.capacity)) * 100)}%` }} />
                </span>
              )}
              <label className="inline-flex items-center gap-2 text-slate-700 dark:text-gray-200">
                <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} className="h-4 w-4 rounded border-slate-400" />
                Only students who are free
              </label>
            </div>
            <button type="button" className={secondaryBtn} onClick={selectAllFree} disabled={!freeVisible.length || !capacityLeft}>
              Select all free{capacityLeft < freeVisible.length ? ` (${capacityLeft})` : ""}
            </button>
          </div>

          {data?.lock_mode === "TERM" && (
            <Muted className="text-xs">A student goes to one teacher's office hours at a time. Students busy with another teacher {schedule ? "that week" : ""} are shown but can't be ticked.</Muted>
          )}
          {noSessions && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100" role="status">
              No session is left in this week (closures or the end of the schedule). Pick another week.
            </p>
          )}

          <div className="max-h-[46vh] overflow-y-auto rounded-2xl border border-slate-200 lg:max-h-[52vh] dark:border-gray-700/30">
            {loading && !data ? (
              <div className="px-4"><Spinner label="Loading students" /></div>
            ) : students.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={mode === "suggested" ? (suggested ? "No suggestions right now" : "Looking for suggestions…") : mode === "last" ? "No one from last week" : "No students found"}
                  body={
                    mode === "suggested"
                      ? "Nobody you teach shows signs of needing support yet."
                      : mode === "last"
                        ? "Switch to “All my students” to choose this week's group."
                        : q
                          ? "Try another name, or clear the class filter."
                          : "Students you teach this year appear here."
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-gray-700/30" aria-label="Students">
                {students.map((s) => {
                  const can = selectable(s) && !noSessions;
                  const id = `oh-pick-${s.student_id}`;
                  const on = selected.has(s.student_id);
                  return (
                    <li key={s.student_id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${on ? "bg-blue-50/70 dark:bg-blue-500/10" : can ? "hover:bg-slate-50 dark:hover:bg-gray-800/30" : "bg-slate-50/60 dark:bg-gray-800/30"}`}>
                      <input
                        id={id}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-400 disabled:opacity-40"
                        checked={on}
                        disabled={!can || (!on && selected.size >= capacityLeft)}
                        onChange={() => toggle(s.student_id)}
                      />
                      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">{studentName(s)}</span>
                          {schedule && lastWeekIds.has(s.student_id) && mode !== "last" && (
                            <span className="flex-shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-gray-800/40 dark:text-gray-300">Last week</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-600 dark:text-gray-300">
                          {[s.class_group_name, s.registration_number].filter(Boolean).join(" · ")}
                        </span>
                        {mode === "suggested" && signalsOf.get(s.student_id) && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {signalsOf.get(s.student_id)!.map((g) => (
                              <span key={g.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.source === "taskmentor" ? "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200" : "bg-slate-100 text-slate-700 dark:bg-gray-800/40 dark:text-gray-200"}`}>
                                {g.label}
                              </span>
                            ))}
                          </span>
                        )}
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
              <p className="text-sm text-slate-800 dark:text-gray-100">
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
        </div>

        <aside className="space-y-3 self-start rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-0 dark:border-gray-700/30 dark:bg-gray-800/30" aria-label="Invitation">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">Invitation</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-gray-50">{spanLabel}</p>
          </div>
          {schedule && lastWeekFree.length > 0 && capacityLeft > 0 && (
            <button type="button" className={`${secondaryBtn} w-full`} onClick={pickLastWeek}>
              <History className="h-4 w-4" aria-hidden /> Invite last week's group ({Math.min(lastWeekFree.length, capacityLeft)})
            </button>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-gray-200">
              {selected.size ? `${selected.size} selected` : "Nobody selected yet"}
              {data ? <span className="font-normal text-slate-500 dark:text-gray-400"> · {capacityLeft} place{capacityLeft === 1 ? "" : "s"} left</span> : null}
            </p>
            {selected.size > 0 && (
              <ul className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" aria-label="Selected students">
                {[...selected].map((id) => (
                  <li key={id} className="inline-flex items-center gap-1 rounded-full bg-blue-100 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-blue-900 dark:bg-blue-500/15 dark:text-blue-100">
                    {nameOf(id)}
                    <button type="button" onClick={() => toggle(id)} className="rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-500/30" aria-label={`Unselect ${nameOf(id)}`}>
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label htmlFor="oh-reason" className={labelCls}>Why these students? (staff only)</label>
            <SelectField id="oh-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">No reason given</option>
              {reasonCodes.map((c) => (
                <option key={c} value={c}>{humanize(c)}</option>
              ))}
            </SelectField>
          </div>
          <div>
            <label htmlFor="oh-reason-note" className={labelCls}>Note (staff only, optional)</label>
            <input id="oh-reason-note" className={inputCls} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} maxLength={500} />
          </div>
          <button type="button" className={`${primaryBtn} w-full`} onClick={assign} disabled={!selected.size || saving || noSessions}>
            <UserPlus className="h-4 w-4" aria-hidden />
            {saving ? "Inviting…" : selected.size ? `Invite ${selected.size} student${selected.size === 1 ? "" : "s"}` : "Invite students"}
          </button>
          <Muted className="text-xs">Students see only the teacher, subject, days and room — never the reason.</Muted>
        </aside>
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
        <p className="text-sm text-amber-800 dark:text-amber-200" role="status">No sessions remain in that window, so no one was added.</p>
      )}
    </div>
  );
};

export default StudentPicker;
