import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CalendarX2, Pencil, RotateCcw, Send, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import Modal from "../ui/Modal";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";
import {
  apiError,
  formatYmd,
  humanize,
  officeHoursApi,
  studentName,
  type OfficeHourSchedule,
  type OfficeHourSession,
  type OfficeHoursConfig,
  type RosterRow,
} from "../../api/officeHours";
import ScheduleDrawer from "./ScheduleDrawer";
import StudentPicker from "./StudentPicker";
import RegisterSheet from "./RegisterSheet";
import { SessionRow } from "./OfficeHoursHub";
import {
  BandPill,
  Card,
  CardTitle,
  dangerBtn,
  EmptyState,
  inputCls,
  labelCls,
  Muted,
  primaryBtn,
  RatePill,
  secondaryBtn,
  Spinner,
} from "./ohUi";

/**
 * /office-hours/schedules/:id (plan §9.4): roster with each student's
 * attendance, the session timeline, and the schedule's actions.
 */
const ScheduleDetail: React.FC = () => {
  const { id } = useParams();
  const scheduleId = Number(id);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [config, setConfig] = useState<OfficeHoursConfig | null>(null);
  const [schedule, setSchedule] = useState<OfficeHourSchedule | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [sessions, setSessions] = useState<OfficeHourSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removing, setRemoving] = useState<RosterRow | null>(null);
  const [removeReason, setRemoveReason] = useState("GOAL_MET");
  const [removeNote, setRemoveNote] = useState("");
  const [cancelling, setCancelling] = useState<OfficeHourSession | null>(null);
  const [cancelReason, setCancelReason] = useState("TEACHER_ABSENT");
  const [cancelNote, setCancelNote] = useState("");
  const [registerFor, setRegisterFor] = useState<OfficeHourSession | null>(null);
  const [showEnded, setShowEnded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([officeHoursApi.config(), officeHoursApi.schedule(scheduleId)]);
      setConfig(c.data.data);
      setSchedule(d.data.data.schedule);
      setRoster(d.data.data.roster);
      setSessions(d.data.data.sessions);
    } catch (error) {
      showToast(apiError(error, "Couldn't load these office hours"), "error");
    } finally {
      setLoading(false);
    }
  }, [scheduleId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => roster.filter((r) => r.status === "ACTIVE"), [roster]);
  const ended = useMemo(() => roster.filter((r) => r.status === "ENDED"), [roster]);
  const today = config?.today ?? "";
  const past = sessions.filter((s) => s.session_date < today || s.state === "held" || s.state === "unmarked").reverse();
  const future = sessions.filter((s) => !past.includes(s));
  const live = schedule?.status === "ACTIVE" || schedule?.status === "DRAFT";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showToast(ok, "success");
      await load();
    } catch (error) {
      showToast(apiError(error), "error");
    }
  };

  const endSchedule = async () => {
    if (!schedule) return;
    const ok = await confirm({
      title: "End these office hours?",
      message: `Future sessions are cancelled and ${active.length} student${active.length === 1 ? "" : "s"} are released and told. Past registers stay.`,
      tone: "danger",
      confirmText: "End office hours",
    });
    if (ok) await run(() => officeHoursApi.endSchedule(schedule.schedule_id), "Office hours ended");
  };

  const deleteSchedule = async () => {
    if (!schedule) return;
    const ok = await confirm({ title: "Delete these office hours?", message: "This cannot be undone.", tone: "danger", confirmText: "Delete" });
    if (!ok) return;
    try {
      await officeHoursApi.deleteSchedule(schedule.schedule_id);
      showToast("Deleted", "success");
      navigate("/office-hours?tab=schedules");
    } catch (error) {
      showToast(apiError(error), "error");
    }
  };

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-6"><Spinner label="Loading office hours" /></div>;
  if (!schedule || !config) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <EmptyState title="Office hours not found" action={<Link to="/office-hours" className={secondaryBtn}>Back to office hours</Link>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <Link to="/office-hours?tab=schedules" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Office hours
      </Link>

      <Card labelledBy="oh-detail-title" className="relative overflow-hidden">
        {schedule.subject_color && <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: schedule.subject_color }} aria-hidden />}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 id="oh-detail-title" className="text-2xl font-bold text-slate-900 dark:text-slate-50">{schedule.title}</h1>
            <Muted>
              {schedule.days_label} · {schedule.start_time}–{schedule.end_time}
              {schedule.location ? ` · ${schedule.location}` : ""}
              {schedule.subject_name ? ` · ${schedule.subject_name}` : ""}
            </Muted>
            <Muted className="text-xs">
              {formatYmd(schedule.effective_from, { year: true })} – {formatYmd(schedule.effective_to, { year: true })} · {humanize(schedule.purpose)} · run by{" "}
              {schedule.teacher_name ?? "—"}
            </Muted>
            <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {schedule.status === "ACTIVE" ? "Published" : schedule.status === "DRAFT" ? "Draft — students not told yet" : schedule.status === "ENDED" ? "Ended" : "Cancelled"}
            </span>
          </div>
          {live && (
            <div className="flex flex-wrap gap-2">
              {schedule.status === "DRAFT" && (
                <button type="button" className={primaryBtn} onClick={() => run(() => officeHoursApi.publishSchedule(schedule.schedule_id), "Published — students notified")}>
                  <Send className="h-4 w-4" aria-hidden /> Publish
                </button>
              )}
              <button type="button" className={primaryBtn} onClick={() => setPickerOpen(true)}>
                <UserPlus className="h-4 w-4" aria-hidden /> Add students
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </button>
              <button type="button" className={dangerBtn} onClick={endSchedule}>
                <Ban className="h-4 w-4" aria-hidden /> End
              </button>
              {!sessions.some((s) => s.state === "held") && (
                <button type="button" className={dangerBtn} onClick={deleteSchedule} aria-label="Delete office hours">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card labelledBy="oh-roster" className="min-w-0 lg:col-span-3">
          <CardTitle
            id="oh-roster"
            icon={<Users className="h-4 w-4" aria-hidden />}
            action={<span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{active.length}/{schedule.capacity}</span>}
          >
            Students
          </CardTitle>
          {active.length === 0 ? (
            <EmptyState title="No students yet" body="Add the students who must come to these office hours." />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    <th scope="col" className="py-2 pr-3 font-semibold">Student</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Since</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Attendance</th>
                    <th scope="col" className="py-2 pr-3 font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {active.map((r) => (
                    <tr key={r.assignment_id}>
                      <td className="py-2 pr-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{studentName(r.student)}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {[r.student.class_group_name, r.reason_code ? humanize(r.reason_code) : null].filter(Boolean).join(" · ")}
                        </p>
                        {r.clash_note && <p className="text-xs text-amber-800 dark:text-amber-200">Also scheduled: {r.clash_note}</p>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-700 dark:text-slate-200">{formatYmd(r.effective_from)}</td>
                      <td className="py-2 pr-3">
                        {r.stats ? (
                          <div className="flex items-center gap-2">
                            <RatePill rate={r.stats.rate} /> <BandPill band={r.stats.band} />
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 dark:text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {live && (
                          <button
                            type="button"
                            onClick={() => setRemoving(r)}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-500/10"
                            aria-label={`Remove ${studentName(r.student)}`}
                          >
                            <UserMinus className="h-3.5 w-3.5" aria-hidden /> Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ended.length > 0 && (
            <div className="mt-4">
              <button type="button" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={() => setShowEnded((v) => !v)} aria-expanded={showEnded}>
                {showEnded ? "Hide" : "Show"} {ended.length} former student{ended.length === 1 ? "" : "s"}
              </button>
              {showEnded && (
                <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  {ended.map((r) => (
                    <li key={r.assignment_id}>
                      {studentName(r.student)} — left {r.ended_at ? formatYmd(String(r.ended_at).slice(0, 10)) : formatYmd(r.effective_to)} ({humanize(r.end_reason_code)})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card labelledBy="oh-upcoming">
            <CardTitle id="oh-upcoming">Next sessions</CardTitle>
            {future.length === 0 ? (
              <Muted>No more sessions.</Muted>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {future.slice(0, 8).map((s) => (
                  <li key={s.session_id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className={`text-sm font-semibold ${s.state === "cancelled" ? "text-slate-500 line-through dark:text-slate-400" : "text-slate-900 dark:text-slate-100"}`}>
                        {formatYmd(s.session_date)}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {s.state === "cancelled" ? `Cancelled · ${humanize(s.cancel_reason)}` : `${s.start_time}–${s.end_time} · ${s.expected} expected`}
                        {s.host_teacher_id !== schedule.teacher_id && s.host_name ? ` · covered by ${s.host_name}` : ""}
                      </p>
                    </div>
                    {live &&
                      (s.state === "cancelled" ? (
                        s.cancel_reason !== "CLOSURE" && (
                          <button type="button" className={secondaryBtn} onClick={() => run(() => officeHoursApi.restoreSession(s.session_id), "Session restored")} aria-label={`Restore ${formatYmd(s.session_date)}`}>
                            <RotateCcw className="h-4 w-4" aria-hidden />
                          </button>
                        )
                      ) : s.state === "running" ? (
                        <button type="button" className={primaryBtn} onClick={() => setRegisterFor(s)}>Take register</button>
                      ) : (
                        <button type="button" className={secondaryBtn} onClick={() => setCancelling(s)} aria-label={`Cancel ${formatYmd(s.session_date)}`}>
                          <CalendarX2 className="h-4 w-4" aria-hidden />
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card labelledBy="oh-past">
            <CardTitle id="oh-past">Past sessions</CardTitle>
            {past.length === 0 ? (
              <Muted>None yet.</Muted>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {past.slice(0, 12).map((s) => (
                  <SessionRow key={s.session_id} s={s} onRegister={setRegisterFor} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ScheduleDrawer open={editOpen} onClose={() => setEditOpen(false)} config={config} termId={schedule.academic_term_id} schedule={schedule} onSaved={() => void load()} />

      <Modal isOpen={pickerOpen} onClose={() => { setPickerOpen(false); void load(); }} title={`Add students · ${schedule.title}`} size="2xl">
        <StudentPicker scheduleId={schedule.schedule_id} reasonCodes={config.reason_codes} onAssigned={() => void load()} />
      </Modal>

      <Modal isOpen={Boolean(removing)} onClose={() => setRemoving(null)} title={`Remove ${studentName(removing?.student)}`}>
        <div className="space-y-3">
          <div>
            <label htmlFor="oh-remove-reason" className={labelCls}>Why?</label>
            <select id="oh-remove-reason" className={inputCls} value={removeReason} onChange={(e) => setRemoveReason(e.target.value)}>
              {config.end_reason_codes.map((c) => (
                <option key={c} value={c}>{humanize(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="oh-remove-note" className={labelCls}>Note (optional)</label>
            <input id="oh-remove-note" className={inputCls} value={removeNote} onChange={(e) => setRemoveNote(e.target.value)} maxLength={500} />
          </div>
          <Muted className="text-xs">The student is told and becomes free for other teachers' office hours.</Muted>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryBtn} onClick={() => setRemoving(null)}>Cancel</button>
            <button
              type="button"
              className={primaryBtn}
              onClick={async () => {
                if (!removing) return;
                await run(() => officeHoursApi.removeAssignment(removing.assignment_id, { end_reason_code: removeReason, end_note: removeNote.trim() || undefined }), "Student removed");
                setRemoving(null);
                setRemoveNote("");
              }}
            >
              Remove student
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(cancelling)} onClose={() => setCancelling(null)} title={`Cancel ${cancelling ? formatYmd(cancelling.session_date) : ""}`}>
        <div className="space-y-3">
          <div>
            <label htmlFor="oh-cancel-reason" className={labelCls}>Reason</label>
            <select id="oh-cancel-reason" className={inputCls} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
              {config.cancel_reasons.map((c) => (
                <option key={c} value={c}>{humanize(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="oh-cancel-note" className={labelCls}>Message to students (optional)</label>
            <input id="oh-cancel-note" className={inputCls} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={255} />
          </div>
          <Muted className="text-xs">Students are told straight away. A cancelled session never counts against them.</Muted>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondaryBtn} onClick={() => setCancelling(null)}>Keep session</button>
            <button
              type="button"
              className={dangerBtn}
              onClick={async () => {
                if (!cancelling) return;
                await run(() => officeHoursApi.cancelSession(cancelling.session_id, cancelReason, cancelNote.trim() || undefined), "Session cancelled");
                setCancelling(null);
                setCancelNote("");
              }}
            >
              Cancel session
            </button>
          </div>
        </div>
      </Modal>

      {registerFor && <RegisterSheet sessionId={registerFor.session_id} onClose={() => setRegisterFor(null)} onSaved={() => void load()} />}
    </div>
  );
};

export default ScheduleDetail;
