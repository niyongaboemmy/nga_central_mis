import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCheck, ChevronDown, History, MessageSquareWarning, QrCode, Search, UserPlus } from "lucide-react";
import Modal from "../ui/Modal";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";
import {
  apiError,
  formatYmd,
  humanize,
  officeHoursApi,
  studentName,
  type AttendanceStatus,
  type RegisterData,
  type RegisterRecordInput,
  type RegisterRow,
  type StudentCard,
} from "../../api/officeHours";
import { ATTENDANCE_META, inputCls, labelCls, Muted, primaryBtn, secondaryBtn, Spinner } from "./ohUi";
import { queueRegister } from "./offlineQueue";
import { CheckInPanel } from "./CheckIn";
import { API_BASE_URL } from "../../services/api";
import { getToken } from "../../utils/auth";
import SelectField from "../ui/SelectField";

/**
 * The register (plan §12). One tap per exception: "Mark all present", then
 * change the few who were late, absent or excused. Keyboard: ↑/↓ moves
 * between students, 1-4 sets Present/Late/Absent/Excused, Ctrl/⌘+Enter saves.
 * Unsaved changes are guarded; a version clash (someone else saved) reloads
 * their marks and keeps yours on top.
 */
const STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];
const OUTCOMES: Array<[number, string]> = [
  [1, "Needs more support"],
  [2, "Progressing"],
  [3, "Goal met"],
];

type Draft = Record<number, RegisterRecordInput>;

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const fromRow = (r: RegisterRow): RegisterRecordInput => ({
  student_id: r.student_id,
  status: r.status,
  excuse_reason: r.excuse_reason,
  arrived_at: r.arrived_at,
  note: r.note,
  outcome: r.outcome,
  follow_up: r.follow_up,
});

const same = (a: RegisterRecordInput, b: RegisterRecordInput) =>
  (a.status ?? null) === (b.status ?? null) &&
  (a.note ?? null) === (b.note ?? null) &&
  (a.arrived_at ?? null) === (b.arrived_at ?? null) &&
  (a.excuse_reason ?? null) === (b.excuse_reason ?? null) &&
  (a.outcome ?? null) === (b.outcome ?? null) &&
  Boolean(a.follow_up) === Boolean(b.follow_up);

export interface RegisterSheetProps {
  sessionId: number;
  onClose: () => void;
  onSaved?: () => void;
}

const RegisterSheet: React.FC<RegisterSheetProps> = ({ sessionId, onClose, onSaved }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<RegisterData | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [clash, setClash] = useState(false);
  const [dropInQuery, setDropInQuery] = useState("");
  const [dropInResults, setDropInResults] = useState<StudentCard[]>([]);
  const [extraRows, setExtraRows] = useState<RegisterRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(0);
  const [history, setHistory] = useState<Array<{ history_id: number; student_name: string | null; previous_status: string | null; new_status: string | null; changed_by_name: string | null; changed_at: string }>>([]);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);

  const load = useCallback(
    async (keepLocal?: Draft) => {
      setLoading(true);
      try {
        const r = await officeHoursApi.register(sessionId);
        const d = r.data.data;
        setData(d);
        const base: Draft = {};
        for (const row of d.roster) base[row.student_id] = fromRow(row);
        setDraft(keepLocal ? { ...base, ...keepLocal } : base);
        setTopic(d.session.topic ?? "");
        setExtraRows([]);
      } catch (error) {
        showToast(apiError(error, "Couldn't open the register"), "error");
      } finally {
        setLoading(false);
      }
    },
    [sessionId, showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Live register (plan §16.4): QR check-ins appear as they happen. The marks
  // fill only students the teacher has not marked; the teacher still saves.
  const editableNow = Boolean(data?.can_edit);
  useEffect(() => {
    if (!editableNow || typeof EventSource === "undefined") return;
    const token = getToken();
    if (!token) return;
    const es = new EventSource(`${API_BASE_URL}/office-hours/sessions/${sessionId}/live?token=${encodeURIComponent(token)}`);
    es.addEventListener("checkin", (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent).data) as { student_id: number; status: AttendanceStatus; arrived_at: string | null; drop_in: boolean };
        setCheckedIn((n) => n + 1);
        setDraft((cur) => (cur[d.student_id]?.status ? cur : { ...cur, [d.student_id]: { ...(cur[d.student_id] ?? { student_id: d.student_id }), status: d.status, arrived_at: d.arrived_at } }));
        if (d.drop_in) void load();
      } catch {
        /* ignore a malformed event */
      }
    });
    return () => es.close();
  }, [editableNow, sessionId, load]);

  const rows = useMemo(() => [...(data?.roster ?? []), ...extraRows], [data, extraRows]);
  const original = useMemo(() => {
    const o: Draft = {};
    for (const r of data?.roster ?? []) o[r.student_id] = fromRow(r);
    return o;
  }, [data]);
  const changed = useMemo(
    () => rows.filter((r) => draft[r.student_id] && (!original[r.student_id] || !same(draft[r.student_id], original[r.student_id]))).map((r) => draft[r.student_id]),
    [rows, draft, original],
  );
  const topicChanged = (data?.session.topic ?? "") !== topic;
  const dirty = changed.length > 0 || topicChanged;
  const editable = Boolean(data?.can_edit);
  const unmarked = rows.filter((r) => !r.is_drop_in && !draft[r.student_id]?.status).length;
  const counts = STATUSES.map((s) => rows.filter((r) => draft[r.student_id]?.status === s).length);

  const setStatus = (studentId: number, status: AttendanceStatus) => {
    if (!editable) return;
    setDraft((d) => {
      const cur = d[studentId] ?? { student_id: studentId, status: null };
      return {
        ...d,
        [studentId]: {
          ...cur,
          status,
          arrived_at: status === "LATE" ? cur.arrived_at || nowHHMM() : null,
          excuse_reason: status === "EXCUSED" ? cur.excuse_reason || "OTHER" : null,
        },
      };
    });
  };
  const patch = (studentId: number, p: Partial<RegisterRecordInput>) =>
    setDraft((d) => ({ ...d, [studentId]: { ...(d[studentId] ?? { student_id: studentId, status: null }), ...p } }));

  const markAllPresent = () => {
    if (!editable) return;
    setDraft((d) => {
      const next = { ...d };
      for (const r of rows) if (!next[r.student_id]?.status) next[r.student_id] = { ...(next[r.student_id] ?? { student_id: r.student_id }), status: "PRESENT" };
      return next;
    });
  };

  const doSave = async (records: RegisterRecordInput[]) => {
    if (!data) return;
    setSaving(true);
    try {
      const r = await officeHoursApi.saveRegister(sessionId, { records, topic: topicChanged ? topic : undefined, version: data.session.version });
      setData(r.data.data);
      const base: Draft = {};
      for (const row of r.data.data.roster) base[row.student_id] = fromRow(row);
      setDraft(base);
      setExtraRows([]);
      setClash(false);
      showToast("Register saved", "success");
      onSaved?.();
    } catch (error: any) {
      const code = error?.response?.data?.errors?.[0]?.code;
      if (code === "REGISTER_CHANGED") {
        setClash(true);
      } else if (!error?.response && navigator.onLine === false) {
        await queueRegister(sessionId, { records, topic: topicChanged ? topic : undefined, version: data.session.version });
        showToast("You're offline — the register is saved on this device and will be sent when you're back online", "info");
        onSaved?.();
      } else {
        showToast(apiError(error, "Couldn't save the register"), "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!data || !editable || saving) return;
    let records = changed.length ? changed : rows.slice(0, 1).map((r) => draft[r.student_id]).filter(Boolean);
    if (unmarked > 0) {
      const markAbsent = await confirm({
        title: `${unmarked} student${unmarked === 1 ? " is" : "s are"} not marked`,
        message: "Mark them absent and save? Choose Cancel to go back and mark them.",
        confirmText: "Mark absent & save",
        tone: "warning",
      });
      if (!markAbsent) return;
      const filled = { ...draft };
      for (const r of rows) if (!r.is_drop_in && !filled[r.student_id]?.status) filled[r.student_id] = { ...(filled[r.student_id] ?? { student_id: r.student_id }), status: "ABSENT" };
      setDraft(filled);
      records = rows.map((r) => filled[r.student_id]).filter((x) => x && (!original[x.student_id] || !same(x, original[x.student_id])));
    }
    if (!records.length && !topicChanged) return;
    await doSave(records.length ? records : rows.slice(0, 1).map((r) => draft[r.student_id]));
  };

  const close = async () => {
    if (dirty && editable) {
      const ok = await confirm({ title: "Discard your changes?", message: "Marks you changed have not been saved.", confirmText: "Discard", tone: "danger" });
      if (!ok) return;
    }
    onClose();
  };

  const reloadAfterClash = async () => {
    const mine: Draft = {};
    for (const c of changed) mine[c.student_id] = c;
    await load(mine);
    setClash(false);
    showToast("Loaded the latest marks — your changes are kept on top. Check and save again.", "info");
  };

  // Keyboard: 1-4 set a status on the focused student, arrows move, Ctrl/⌘+Enter saves.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void save();
      return;
    }
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
    // The row the key was pressed in (falls back to the last focused row).
    const rowEl = target.closest<HTMLElement>("[data-row-idx]");
    const current = rowEl ? Number(rowEl.dataset.rowIdx) : focusIdx;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(rows.length - 1, current + (e.key === "ArrowDown" ? 1 : -1)));
      setFocusIdx(next);
      rowRefs.current[next]?.focus();
      return;
    }
    const idx = ["1", "2", "3", "4"].indexOf(e.key);
    if (idx >= 0 && rows[current]) {
      e.preventDefault();
      setStatus(rows[current].student_id, STATUSES[idx]);
    }
  };

  useEffect(() => {
    if (dropInQuery.trim().length < 2) {
      setDropInResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      officeHoursApi
        .searchStudents(dropInQuery.trim())
        .then((r) => setDropInResults(r.data.data.filter((s) => !rows.some((x) => x.student_id === s.student_id))))
        .catch(() => setDropInResults([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [dropInQuery, rows]);

  const addDropIn = (s: StudentCard) => {
    setExtraRows((x) => [
      ...x,
      { ...s, assignment_id: null, is_drop_in: true, status: null, excuse_reason: null, arrived_at: null, note: null, outcome: null, follow_up: false, source: "TEACHER", marked_at: null, notice: null },
    ]);
    setDraft((d) => ({ ...d, [s.student_id]: { student_id: s.student_id, status: "PRESENT" } }));
    setDropInQuery("");
    setDropInResults([]);
  };

  const toggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next) {
      try {
        setHistory((await officeHoursApi.registerHistory(sessionId)).data.data);
      } catch {
        setHistory([]);
      }
    }
  };

  const s = data?.session;
  const title = s ? `${s.title} · ${formatYmd(s.session_date)} ${s.start_time}` : "Register";

  return (
    <Modal isOpen onClose={() => void close()} title={title} size="2xl" contentClassName="p-0">
      {loading && !data ? (
        <div className="p-6"><Spinner label="Opening the register" /></div>
      ) : !data || !s ? (
        <div className="p-6"><Muted>The register could not be opened.</Muted></div>
      ) : (
        <div onKeyDown={onKeyDown} className="flex max-h-[80vh] flex-col">
          <div className="space-y-3 border-b border-slate-200 px-6 py-4 dark:border-gray-700/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Muted className="text-sm">
                {[s.location, `${rows.filter((r) => !r.is_drop_in).length} expected`, s.host_name && s.host_teacher_id !== s.teacher_id ? `covered by ${s.host_name}` : null].filter(Boolean).join(" · ")}
              </Muted>
              <div className="flex flex-wrap gap-2 text-xs font-semibold" aria-live="polite">
                {STATUSES.map((st, i) => (
                  <span key={st} className={`rounded-full bg-slate-100 px-2 py-0.5 dark:bg-gray-800/40 ${ATTENDANCE_META[st].cls}`}>
                    {counts[i]} {ATTENDANCE_META[st].label.toLowerCase()}
                  </span>
                ))}
                {unmarked > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">{unmarked} not marked</span>}
              </div>
            </div>
            {!editable && (
              <p className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-gray-800/40 dark:text-gray-200" role="note">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {data.window.not_yet
                  ? `The register opens at ${data.window.opens_at} on ${formatYmd(s.session_date)}.`
                  : s.status === "CANCELLED"
                    ? "This session was cancelled."
                    : data.window.closed
                      ? `Registers can be changed until ${formatYmd(data.window.last_edit_day)}. Ask leadership to correct this one.`
                      : "You can view this register but not change it."}
              </p>
            )}
            {s.register_saved_by_name && (
              <Muted className="text-xs">
                Last saved by {s.register_saved_by_name}
                {s.register_last_saved_at ? ` · ${new Date(s.register_last_saved_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
              </Muted>
            )}
            {clash && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100" role="alert">
                Someone else saved this register while you were marking.
                <button type="button" className={secondaryBtn} onClick={() => void reloadAfterClash()}>Load their marks, keep mine</button>
              </div>
            )}
            {editable && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={secondaryBtn} onClick={markAllPresent}>
                  <CheckCheck className="h-4 w-4" aria-hidden /> Mark all present
                </button>
                {data.qr_enabled && (
                  <button type="button" className={secondaryBtn} onClick={() => setShowCheckIn(true)}>
                    <QrCode className="h-4 w-4" aria-hidden /> Self check-in{checkedIn ? ` (${checkedIn})` : ""}
                  </button>
                )}
                <Muted className="hidden text-xs sm:block">Keys: ↑ ↓ to move · 1 Present · 2 Late · 3 Absent · 4 Excused · Ctrl/⌘+Enter to save</Muted>
              </div>
            )}
          </div>

          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto px-2 dark:divide-gray-700/30" aria-label="Students">
            {rows.length === 0 && <li className="px-4 py-6"><Muted>No students were expected at this session.</Muted></li>}
            {rows.map((r, idx) => {
              const d = draft[r.student_id] ?? { student_id: r.student_id, status: null };
              const name = studentName(r);
              const open = expanded === r.student_id;
              return (
                <li
                  key={r.student_id}
                  ref={(el) => (rowRefs.current[idx] = el)}
                  data-row-idx={idx}
                  tabIndex={idx === focusIdx ? 0 : -1}
                  onFocus={() => setFocusIdx(idx)}
                  className="rounded-xl px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={`${name}: ${d.status ? ATTENDANCE_META[d.status].label : "not marked"}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-gray-100">
                        {name}
                        {r.is_drop_in && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">Drop-in</span>}
                      </p>
                      <p className="truncate text-xs text-slate-600 dark:text-gray-300">{[r.class_group_name, r.registration_number].filter(Boolean).join(" · ")}</p>
                      {r.notice && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-sky-800 dark:text-sky-200">
                          <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden /> Said they can't come: {humanize(r.notice.reason)}
                          {r.notice.note ? ` — “${r.notice.note}”` : ""}
                        </p>
                      )}
                    </div>
                    <div role="radiogroup" aria-label={`Attendance for ${name}`} className="flex gap-1">
                      {STATUSES.map((st) => {
                        const on = d.status === st;
                        return (
                          <button
                            key={st}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={!editable || (r.is_drop_in && (st === "ABSENT" || st === "EXCUSED"))}
                            onClick={() => setStatus(r.student_id, st)}
                            title={`${ATTENDANCE_META[st].label} (${ATTENDANCE_META[st].key})`}
                            className={`min-w-[2.5rem] rounded-full border px-2 py-1 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[4.5rem] ${
                              on ? ATTENDANCE_META[st].active : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-gray-700/50 dark:bg-gray-800/40 dark:text-gray-200"
                            }`}
                          >
                            <span className="sm:hidden">{ATTENDANCE_META[st].short}</span>
                            <span className="hidden sm:inline">{ATTENDANCE_META[st].label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : r.student_id)}
                      aria-expanded={open}
                      aria-label={`More for ${name}`}
                      className="rounded-full p-1 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-800/40"
                    >
                      <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden />
                    </button>
                  </div>
                  {(d.status === "LATE" || d.status === "EXCUSED" || open) && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {d.status === "LATE" && (
                        <div>
                          <label htmlFor={`oh-arr-${r.student_id}`} className={labelCls}>Arrived</label>
                          <input id={`oh-arr-${r.student_id}`} type="time" className={inputCls} disabled={!editable} value={d.arrived_at ?? ""} onChange={(e) => patch(r.student_id, { arrived_at: e.target.value })} />
                        </div>
                      )}
                      {d.status === "EXCUSED" && (
                        <div>
                          <label htmlFor={`oh-exc-${r.student_id}`} className={labelCls}>Excuse</label>
                          <SelectField id={`oh-exc-${r.student_id}`} className={inputCls} disabled={!editable} value={d.excuse_reason ?? "OTHER"} onChange={(e) => patch(r.student_id, { excuse_reason: e.target.value })}>
                            {(data.excuse_reasons ?? ["SICK", "SCHOOL_ACTIVITY", "FAMILY", "PERMISSION", "OTHER"]).map((x) => (
                              <option key={x} value={x}>{humanize(x)}</option>
                            ))}
                          </SelectField>
                        </div>
                      )}
                      {open && (
                        <>
                          <div className="sm:col-span-2">
                            <label htmlFor={`oh-note-${r.student_id}`} className={labelCls}>Note</label>
                            <input id={`oh-note-${r.student_id}`} className={inputCls} disabled={!editable} maxLength={255} value={d.note ?? ""} onChange={(e) => patch(r.student_id, { note: e.target.value })} />
                          </div>
                          <div>
                            <label htmlFor={`oh-out-${r.student_id}`} className={labelCls}>Outcome</label>
                            <SelectField
                              id={`oh-out-${r.student_id}`}
                              className={inputCls}
                              disabled={!editable}
                              value={d.outcome ?? ""}
                              onChange={(e) => patch(r.student_id, { outcome: e.target.value ? Number(e.target.value) : null })}
                            >
                              <option value="">—</option>
                              {OUTCOMES.map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                              ))}
                            </SelectField>
                          </div>
                          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700 dark:text-gray-200">
                            <input type="checkbox" className="h-4 w-4 rounded border-slate-400" disabled={!editable} checked={Boolean(d.follow_up)} onChange={(e) => patch(r.student_id, { follow_up: e.target.checked })} />
                            Follow up next time
                          </label>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="space-y-3 border-t border-slate-200 px-6 py-4 dark:border-gray-700/30">
            {editable && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <label htmlFor="oh-dropin" className={labelCls}>Add a student who came</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                    <input id="oh-dropin" className={`${inputCls} pl-9`} value={dropInQuery} onChange={(e) => setDropInQuery(e.target.value)} placeholder="Name or registration number" />
                  </div>
                  {dropInResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-gray-700/30 dark:bg-gray-800/40">
                      {dropInResults.map((st) => (
                        <li key={st.student_id}>
                          <button type="button" onClick={() => addDropIn(st)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-gray-700/50 dark:focus:bg-gray-700/50">
                            <UserPlus className="h-4 w-4 text-slate-500" aria-hidden /> {studentName(st)}
                            <span className="text-xs text-slate-600 dark:text-gray-300">{st.class_group_name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label htmlFor="oh-topic" className={labelCls}>What did you cover? (optional)</label>
                  <input id="oh-topic" className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={255} />
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => void toggleHistory()} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300" aria-expanded={showHistory}>
                <History className="h-4 w-4" aria-hidden /> Changes
              </button>
              <div className="flex gap-2">
                <button type="button" className={secondaryBtn} onClick={() => void close()}>{editable ? "Cancel" : "Close"}</button>
                {editable && (
                  <button type="button" className={primaryBtn} onClick={() => void save()} disabled={saving || (!dirty && data.session.status === "HELD")}>
                    {saving ? "Saving…" : data.session.status === "HELD" ? "Save changes" : "Save register"}
                  </button>
                )}
              </div>
            </div>
            {showHistory && (
              <ul className="max-h-40 overflow-y-auto text-xs text-slate-700 dark:text-gray-200">
                {history.length === 0 && <li>No changes yet.</li>}
                {history.map((h) => (
                  <li key={h.history_id}>
                    {new Date(h.changed_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })} · {h.changed_by_name ?? "System"}: {h.student_name ?? "Student"} {humanize(h.previous_status) || "—"} → {humanize(h.new_status) || "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {showCheckIn && <CheckInPanel sessionId={sessionId} checkedIn={checkedIn} onClose={() => setShowCheckIn(false)} />}
    </Modal>
  );
};

export default RegisterSheet;
