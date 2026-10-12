import React, { useCallback, useEffect, useState } from "react";
import { CalendarOff, ChevronLeft, ChevronRight, UserCheck, Users } from "lucide-react";
import { apiError } from "../../api/desktopTools";
import { REASON_LABEL, STATUS_LABEL, coverApi, type CoverLesson, type MyAbsence, type MyCover, type PendingAbsence, type Suggestion } from "../../api/staffCover";
import { Card, CardTitle, Muted, Spinner, inputCls, labelCls, primaryBtn, secondaryBtn, dangerBtn } from "../officeHours/ohUi";
import SelectField from "../ui/SelectField";
import { useToast } from "../../contexts/ToastContext";

const todayYmd = () => new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Staff absence and cover. Every teacher: report an absence, see its cover,
 * see the lessons they cover. Cover managers (STAFF_COVER_MANAGE): approve
 * absences and assign a free colleague to each lesson, from ranked suggestions.
 */
const StaffCover: React.FC = () => {
  const [data, setData] = useState<{ absences: MyAbsence[]; covers: MyCover[]; canManage: boolean } | null>(null);
  const { showToast } = useToast();
  const load = useCallback(async () => {
    try {
      setData((await coverApi.mine()).data.data);
    } catch (e) {
      showToast(apiError(e, "Couldn't load your cover."), "error");
    }
  }, [showToast]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <div className="p-6"><Spinner label="Loading" /></div>;
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
          <CalendarOff className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden /> Staff cover
        </h1>
        <Muted className="mt-1">Report an absence and your lessons get covered. When you're asked to cover a lesson, it shows here and in your notifications.</Muted>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <ReportCard onDone={load} />
        <MineCard data={data} onChanged={load} />
      </div>
      {data.canManage && <ManageBoard onChanged={load} />}
    </div>
  );
};

const ReportCard: React.FC<{ onDone: () => void; teachers?: Array<{ id: number; name: string }>; onFor?: boolean }> = ({ onDone, teachers }) => {
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(todayYmd());
  const [reason, setReason] = useState("sick");
  const [note, setNote] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await coverApi.report({ from, to: to < from ? from : to, reason, note: note.trim() || undefined, teacherId: teacherId ? Number(teacherId) : undefined });
      showToast(teachers ? "Absence recorded and approved." : "Absence reported. The deputy head or DOS will approve it.", "success");
      setNote("");
      onDone();
    } catch (e) {
      showToast(apiError(e, "Couldn't report the absence."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card labelledBy={teachers ? "cv-record" : "cv-report"}>
      <CardTitle id={teachers ? "cv-record" : "cv-report"}>{teachers ? "Record an absence for a teacher" : "Report an absence"}</CardTitle>
      <div className="space-y-3">
        {teachers && (
          <div>
            <label htmlFor="cv-teacher" className={labelCls}>Teacher</label>
            <SelectField id="cv-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={inputCls}>
              <option value="">Choose…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`cv-from${teachers ? "-m" : ""}`} className={labelCls}>From</label>
            <input id={`cv-from${teachers ? "-m" : ""}`} type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`cv-to${teachers ? "-m" : ""}`} className={labelCls}>To</label>
            <input id={`cv-to${teachers ? "-m" : ""}`} type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor={`cv-reason${teachers ? "-m" : ""}`} className={labelCls}>Reason</label>
          <SelectField id={`cv-reason${teachers ? "-m" : ""}`} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
            {Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </SelectField>
        </div>
        <div>
          <label htmlFor={`cv-note${teachers ? "-m" : ""}`} className={labelCls}>Note for the cover teacher (optional)</label>
          <textarea id={`cv-note${teachers ? "-m" : ""}`} className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Work is in the shared folder…" />
        </div>
        <button type="button" className={primaryBtn} disabled={busy || (!!teachers && !teacherId)} onClick={() => void submit()}>
          {teachers ? "Record absence" : "Report absence"}
        </button>
      </div>
    </Card>
  );
};

const MineCard: React.FC<{ data: { absences: MyAbsence[]; covers: MyCover[] }; onChanged: () => void }> = ({ data, onChanged }) => {
  const { showToast } = useToast();
  const cancel = async (id: number) => {
    try {
      await coverApi.cancel(id);
      showToast("Absence withdrawn.", "success");
      onChanged();
    } catch (e) {
      showToast(apiError(e, "Couldn't withdraw it."), "error");
    }
  };
  return (
    <Card labelledBy="cv-mine">
      <CardTitle id="cv-mine" icon={<UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}>Mine</CardTitle>
      <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Lessons I'm covering</h3>
      {data.covers.length === 0 ? (
        <Muted>None coming up.</Muted>
      ) : (
        <ul className="mb-4 space-y-1.5" data-testid="cv-my-covers">
          {data.covers.map((c) => (
            <li key={c.id} className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-slate-800 dark:bg-blue-500/10 dark:text-gray-100">
              <strong>{dayLabel(c.date)} {c.start}</strong> · {c.subject} · {c.className}{c.location ? ` · ${c.location}` : ""} <span className="text-slate-600 dark:text-gray-300">(for {c.forTeacher})</span>
              {c.note && <span className="block text-xs text-slate-600 dark:text-gray-300">{c.note}</span>}
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-1 mt-4 text-sm font-semibold text-slate-900 dark:text-white">My absences</h3>
      {data.absences.length === 0 ? (
        <Muted>None recorded.</Muted>
      ) : (
        <ul className="space-y-1.5" data-testid="cv-my-absences">
          {data.absences.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-gray-700/50">
              <span className="font-semibold text-slate-900 dark:text-white">{a.from === a.to ? dayLabel(a.from) : `${dayLabel(a.from)} – ${dayLabel(a.to)}`}</span>
              <span className="text-slate-600 dark:text-gray-300">{REASON_LABEL[a.reason] ?? a.reason} · {STATUS_LABEL[a.status]}{a.status === "approved" ? ` · ${a.covered}/${a.lessons} covered` : ""}</span>
              {(a.status === "pending" || a.status === "approved") && (
                <button type="button" className="ml-auto text-xs font-semibold text-rose-700 underline dark:text-rose-300" onClick={() => void cancel(a.id)}>Withdraw</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const ManageBoard: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [from, setFrom] = useState(todayYmd());
  const [board, setBoard] = useState<{ from: string; to: string; pending: PendingAbsence[]; lessons: CoverLesson[]; open: number } | null>(null);
  const [teachers, setTeachers] = useState<Array<{ id: number; name: string }>>([]);
  const [picking, setPicking] = useState<number | null>(null);
  const [sugs, setSugs] = useState<Suggestion[] | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      setBoard((await coverApi.board(from)).data.data);
    } catch (e) {
      showToast(apiError(e, "Couldn't load the cover board."), "error");
    }
  }, [from, showToast]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    coverApi.teachers().then((r) => setTeachers(r.data.data), () => undefined);
  }, []);

  const decide = async (id: number, approve: boolean) => {
    try {
      await coverApi.decide(id, approve);
      showToast(approve ? "Approved. The lessons are listed below for cover." : "Declined.", "success");
      void load();
      onChanged();
    } catch (e) {
      showToast(apiError(e, "Couldn't save."), "error");
    }
  };
  const pick = async (id: number) => {
    setPicking(id);
    setSugs(null);
    try {
      setSugs((await coverApi.suggestions(id)).data.data);
    } catch (e) {
      showToast(apiError(e, "Couldn't find free teachers."), "error");
    }
  };
  const assign = async (coverId: number, teacherId: number | null) => {
    try {
      await coverApi.assign(coverId, teacherId);
      showToast(teacherId ? "Assigned. The teacher has been notified." : "Cover removed.", "success");
      setPicking(null);
      void load();
    } catch (e) {
      showToast(apiError(e, "Couldn't assign."), "error");
    }
  };

  const days = board ? Array.from(new Set(board.lessons.map((l) => l.date))) : [];
  return (
    <>
      <Card labelledBy="cv-board">
        <CardTitle
          id="cv-board"
          icon={<Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
          action={
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous week" className={secondaryBtn} onClick={() => setFrom(addDays(from, -7))}><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-2 text-sm text-slate-700 dark:text-gray-200">{board ? `${dayLabel(board.from)} – ${dayLabel(board.to)}` : ""}</span>
              <button type="button" aria-label="Next week" className={secondaryBtn} onClick={() => setFrom(addDays(from, 7))}><ChevronRight className="h-4 w-4" /></button>
            </div>
          }
        >
          Cover board
        </CardTitle>
        {!board ? (
          <Spinner label="Loading" />
        ) : (
          <div className="space-y-5">
            {board.pending.length > 0 && (
              <section aria-label="Waiting for approval" data-testid="cv-pending">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Waiting for approval</h3>
                <ul className="space-y-2">
                  {board.pending.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
                      <span className="font-semibold text-slate-900 dark:text-white">{p.teacher}</span>
                      <span className="text-slate-700 dark:text-gray-200">{p.from === p.to ? dayLabel(p.from) : `${dayLabel(p.from)} – ${dayLabel(p.to)}`} · {REASON_LABEL[p.reason] ?? p.reason} · {p.lessons} lesson{p.lessons === 1 ? "" : "s"}</span>
                      {p.note && <span className="w-full text-xs text-slate-600 dark:text-gray-300">{p.note}</span>}
                      <span className="ml-auto flex gap-2">
                        <button type="button" className={primaryBtn} onClick={() => void decide(p.id, true)}>Approve</button>
                        <button type="button" className={dangerBtn} onClick={() => void decide(p.id, false)}>Decline</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {board.lessons.length === 0 ? (
              <Muted>No lessons need cover this week.</Muted>
            ) : (
              <div data-testid="cv-lessons">
                <p className="mb-2 text-sm text-slate-700 dark:text-gray-200">{board.open} lesson{board.open === 1 ? "" : "s"} still need a teacher.</p>
                {days.map((d) => (
                  <section key={d} className="mb-3">
                    <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-gray-300">{dayLabel(d)}</h4>
                    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-gray-700/40 dark:border-gray-700/50">
                      {board.lessons.filter((l) => l.date === d).map((l) => (
                        <li key={l.id} className="px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-24 font-semibold tabular-nums text-slate-900 dark:text-white">{l.start}{l.end ? `–${l.end}` : ""}</span>
                            <span className="min-w-0 flex-1 text-slate-800 dark:text-gray-100">{l.subject} · {l.className}{l.location ? ` · ${l.location}` : ""} <span className="text-xs text-slate-600 dark:text-gray-300">({l.absentTeacher} away)</span></span>
                            {l.status === "assigned" ? (
                              <>
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">{l.coverTeacher}</span>
                                <button type="button" className="text-xs font-semibold text-slate-600 underline dark:text-gray-300" onClick={() => void assign(l.id, null)}>Remove</button>
                              </>
                            ) : (
                              <button type="button" className={secondaryBtn} onClick={() => void pick(l.id)}>Find cover</button>
                            )}
                          </div>
                          {picking === l.id && (
                            <div className="mt-2 rounded-xl bg-slate-50 p-2 dark:bg-gray-800/60" data-testid="cv-suggestions">
                              {!sugs ? (
                                <Spinner label="Finding free teachers" />
                              ) : sugs.length === 0 ? (
                                <Muted>Nobody is free then.</Muted>
                              ) : (
                                <ul className="space-y-1">
                                  {sugs.map((s) => (
                                    <li key={s.teacherId} className="flex flex-wrap items-center gap-2">
                                      <span className="font-semibold text-slate-900 dark:text-white">{s.name}</span>
                                      <span className="text-xs text-slate-600 dark:text-gray-300">{s.reasons.join(" · ")}</span>
                                      <button type="button" className={`${primaryBtn} ml-auto !px-3 !py-1 text-xs`} onClick={() => void assign(l.id, s.teacherId)}>Assign</button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
      {teachers.length > 0 && <ReportCard teachers={teachers} onDone={() => { void load(); onChanged(); }} />}
    </>
  );
};

export default StaffCover;
