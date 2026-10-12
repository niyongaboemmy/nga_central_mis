import UserAvatar from "../../ui/UserAvatar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRightLeft, BellRing, CalendarOff, ClipboardX, Clock4, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { useAcademicPeriod } from "../../../contexts/AcademicPeriodContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useToast } from "../../../contexts/ToastContext";
import {
  apiError,
  formatYmd,
  officeHoursApi,
  studentName,
  type Closure,
  type OfficeHourSchedule,
  type OfficeHoursConfig,
  type TransferRequest,
  type UnmarkedSession,
} from "../../../api/officeHours";
import { Card, CardTitle, EmptyState, inputCls, labelCls, Muted, primaryBtn, secondaryBtn, Spinner } from "../ohUi";
import OfficeHoursReports from "../reports/OfficeHoursReports";
import OverviewTab from "./OverviewTab";
import EscalationsTab from "./EscalationsTab";
import SettingsTab from "./SettingsTab";
import CoverageTab from "./CoverageTab";
import SelectField from "../../ui/SelectField";

/**
 * /office-hours/admin -- leadership console (plan §11): overview, every
 * schedule, registers nobody took, escalations, transfers, closures, reports
 * and settings. Each tab only appears when the viewer may use it.
 */
type Tab = "overview" | "schedules" | "unmarked" | "escalations" | "coverage" | "transfers" | "closures" | "reports" | "settings";

const SchedulesTab: React.FC<{ termId: number | null }> = ({ termId }) => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<OfficeHourSchedule[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  useEffect(() => {
    officeHoursApi
      .adminSchedules({ term_id: termId, status: status || undefined })
      .then((r) => setRows(r.data.data.schedules))
      .catch((e) => {
        setRows([]);
        showToast(apiError(e, "Couldn't load office hours"), "error");
      });
  }, [termId, status, showToast]);
  const shown = (rows ?? []).filter((r) => !q || `${r.title} ${r.teacher_name} ${r.subject_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card labelledBy="oh-admin-schedules">
      <CardTitle id="oh-admin-schedules" icon={<Clock4 className="h-4 w-4" aria-hidden />}>Office hours this term</CardTitle>
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="oh-admin-q" className={labelCls}>Search</label>
          <input id="oh-admin-q" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Teacher, title or subject" />
        </div>
        <div>
          <label htmlFor="oh-admin-status" className={labelCls}>Status</label>
          <SelectField id="oh-admin-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Published</option>
            <option value="DRAFT">Drafts</option>
            <option value="ENDED">Ended</option>
            <option value="">All</option>
          </SelectField>
        </div>
      </div>
      {!rows ? (
        <Spinner />
      ) : shown.length === 0 ? (
        <EmptyState title="No office hours match" />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-600 dark:text-gray-300">
                <th scope="col" className="py-2 pr-3 font-semibold">Office hours</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Teacher</th>
                <th scope="col" className="py-2 pr-3 font-semibold">When</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Students</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-gray-700/30">
              {shown.map((r) => (
                <tr key={r.schedule_id}>
                  <td className="py-2 pr-3">
                    <Link to={`/office-hours/schedules/${r.schedule_id}`} className="font-semibold text-slate-900 hover:underline dark:text-gray-100">{r.title}</Link>
                    <p className="text-xs text-slate-600 dark:text-gray-300">{r.subject_name ?? "No subject"}</p>
                  </td>
                  <td className="py-2 pr-3 text-slate-800 dark:text-gray-100">
                    <span className="inline-flex items-center gap-2">
                      <UserAvatar decorative userId={r.teacher_id} name={r.teacher_name ?? "Teacher"} size={24} />
                      {r.teacher_name}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-slate-700 dark:text-gray-200">
                    {r.days_label} · {r.start_time}–{r.end_time}
                    <br />
                    until {formatYmd(r.effective_to)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-900 dark:text-gray-100">{r.assigned_count}/{r.capacity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const UnmarkedTab: React.FC = () => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<UnmarkedSession[] | null>(null);
  const load = useCallback(() => {
    officeHoursApi
      .adminUnmarked()
      .then((r) => setRows(r.data.data))
      .catch((e) => {
        setRows([]);
        showToast(apiError(e, "Couldn't load unmarked registers"), "error");
      });
  }, [showToast]);
  useEffect(load, [load]);
  const byHost = useMemo(() => {
    const m = new Map<string, UnmarkedSession[]>();
    for (const r of rows ?? []) m.set(r.host_name ?? "Teacher", [...(m.get(r.host_name ?? "Teacher") ?? []), r]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [rows]);
  const nudge = async (sessionIds: number[]) => {
    try {
      await officeHoursApi.nudgeUnmarked(sessionIds);
      showToast("Reminder sent", "success");
    } catch (e) {
      showToast(apiError(e, "Couldn't send the reminder"), "error");
    }
  };
  return (
    <Card labelledBy="oh-admin-unmarked">
      <CardTitle id="oh-admin-unmarked" icon={<ClipboardX className="h-4 w-4" aria-hidden />}>Registers not taken (last 30 days)</CardTitle>
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="Every register is taken" body="Sessions whose register is missing after they end appear here." />
      ) : (
        <ul className="space-y-4">
          {byHost.map(([host, list]) => (
            <li key={host} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-900 dark:text-gray-100">
                  {host} · {list.length} missing
                </p>
                <button type="button" className={secondaryBtn} onClick={() => void nudge(list.map((l) => l.session_id))}>
                  <BellRing className="h-4 w-4" aria-hidden /> Remind
                </button>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-700 dark:text-gray-200">
                {list.map((s) => (
                  <li key={s.session_id}>
                    <Link to={`/office-hours/schedules/${s.schedule_id}`} className="hover:underline">
                      {formatYmd(s.session_date)} · {s.title}
                    </Link>{" "}
                    <span className="text-xs text-slate-600 dark:text-gray-300">
                      ({s.expected} expected{s.days_overdue > 0 ? `, ${s.days_overdue} day${s.days_overdue === 1 ? "" : "s"} ago` : ", today"})
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const TransfersTab: React.FC = () => {
  const { showToast } = useToast();
  const [rows, setRows] = useState<TransferRequest[] | null>(null);
  const load = useCallback(() => {
    officeHoursApi
      .adminTransfers()
      .then((r) => setRows(r.data.data.incoming))
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const decide = async (id: number, accept: boolean) => {
    try {
      await (accept ? officeHoursApi.acceptTransfer(id) : officeHoursApi.declineTransfer(id));
      showToast(accept ? "Student moved" : "Request declined", "success");
      load();
    } catch (e) {
      showToast(apiError(e), "error");
    }
  };
  return (
    <Card labelledBy="oh-admin-transfers">
      <CardTitle id="oh-admin-transfers" icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}>Pending transfer requests</CardTitle>
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No pending requests" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-gray-700/30">
          {rows.map((r) => (
            <li key={r.request_id} className="flex flex-wrap items-center gap-3 py-3">
              <p className="min-w-0 flex-1 text-sm text-slate-800 dark:text-gray-100">
                <strong>{r.requested_by_name}</strong> wants <strong>{studentName(r.student)}</strong> (now with {r.from_schedule.teacher_name}) in “{r.to_schedule.title}”.
                {r.message && <span className="block text-xs text-slate-600 dark:text-gray-300">“{r.message}”</span>}
              </p>
              <button type="button" className={primaryBtn} onClick={() => void decide(r.request_id, true)}>Move student</button>
              <button type="button" className={secondaryBtn} onClick={() => void decide(r.request_id, false)}>Decline</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const ClosuresTab: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Closure[] | null>(null);
  const [form, setForm] = useState({ start_date: "", end_date: "", reason: "" });
  const load = useCallback(() => {
    officeHoursApi
      .closures()
      .then((r) => setRows(r.data.data))
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const add = async () => {
    if (!form.start_date || !form.reason.trim()) {
      showToast("Choose a date and give a reason", "warning");
      return;
    }
    const end = form.end_date || form.start_date;
    try {
      const preview = (await officeHoursApi.previewClosure(form.start_date, end)).data.data;
      const ok = await confirm({
        title: `Close office hours ${form.start_date === end ? `on ${formatYmd(form.start_date)}` : `from ${formatYmd(form.start_date)} to ${formatYmd(end)}`}?`,
        message: `${preview.sessions_affected} session${preview.sessions_affected === 1 ? "" : "s"} will be cancelled and their students told. Cancelled sessions never count as absences.`,
        confirmText: "Add closure",
        tone: "warning",
      });
      if (!ok) return;
      const r = await officeHoursApi.createClosure({ start_date: form.start_date, end_date: end, reason: form.reason.trim() });
      showToast(`Closure added — ${r.data.data.sessions_cancelled} session(s) cancelled`, "success");
      setForm({ start_date: "", end_date: "", reason: "" });
      load();
    } catch (e) {
      showToast(apiError(e), "error");
    }
  };
  const remove = async (c: Closure) => {
    const ok = await confirm({ title: `Remove “${c.reason}”?`, message: "Sessions it cancelled are restored and students are told.", confirmText: "Remove", tone: "danger" });
    if (!ok) return;
    try {
      const r = await officeHoursApi.deleteClosure(c.closure_id);
      showToast(`Removed — ${r.data.data.restored} session(s) restored`, "success");
      load();
    } catch (e) {
      showToast(apiError(e), "error");
    }
  };
  return (
    <Card labelledBy="oh-admin-closures">
      <CardTitle id="oh-admin-closures" icon={<CalendarOff className="h-4 w-4" aria-hidden />}>School closures</CardTitle>
      <Muted className="mb-3">Holidays, exam days and events with no office hours. Enter them before the term starts so no session is ever counted as missed.</Muted>
      {canWrite && (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div>
            <label htmlFor="oh-cl-start" className={labelCls}>From</label>
            <input id="oh-cl-start" type="date" className={inputCls} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label htmlFor="oh-cl-end" className={labelCls}>Until (optional)</label>
            <input id="oh-cl-end" type="date" className={inputCls} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div>
            <label htmlFor="oh-cl-reason" className={labelCls}>Reason</label>
            <input id="oh-cl-reason" className={inputCls} value={form.reason} maxLength={150} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Mid-term break" />
          </div>
          <div className="flex items-end">
            <button type="button" className={primaryBtn} onClick={() => void add()}>Add closure</button>
          </div>
        </div>
      )}
      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No closures yet" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-gray-700/30">
          {rows.map((c) => (
            <li key={c.closure_id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-gray-100">{c.reason}</p>
                <p className="text-xs text-slate-600 dark:text-gray-300">
                  {formatYmd(c.start_date, { weekday: true, year: true })}
                  {c.end_date !== c.start_date ? ` – ${formatYmd(c.end_date, { weekday: true, year: true })}` : ""}
                </p>
              </div>
              {canWrite && (
                <button type="button" onClick={() => void remove(c)} className="rounded-full p-2 text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-300 dark:hover:bg-rose-500/10" aria-label={`Remove ${c.reason}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const OfficeHoursAdmin: React.FC = () => {
  const { selectedTermId } = useAcademicPeriod();
  const [params, setParams] = useSearchParams();
  const [config, setConfig] = useState<OfficeHoursConfig | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    officeHoursApi
      .config(selectedTermId)
      .then((r) => setConfig(r.data.data))
      .catch(() => setFailed(true));
  }, [selectedTermId]);

  const caps = config?.capabilities;
  const tabs = useMemo(() => {
    if (!caps) return [] as Array<{ key: Tab; label: string; icon: React.ReactNode }>;
    const t: Array<{ key: Tab; label: string; icon: React.ReactNode; show: boolean }> = [
      { key: "overview", label: "Overview", icon: null, show: caps.view || caps.manage_any },
      { key: "schedules", label: "Office hours", icon: null, show: caps.manage_any },
      { key: "unmarked", label: "Missing registers", icon: null, show: caps.manage_any },
      { key: "escalations", label: "Escalations", icon: <ShieldAlert className="h-3.5 w-3.5" aria-hidden />, show: caps.view || caps.manage_any },
      { key: "coverage", label: "Coverage", icon: null, show: caps.view || caps.manage_any },
      { key: "transfers", label: "Transfers", icon: null, show: caps.manage_any },
      { key: "closures", label: "Closures", icon: null, show: true },
      { key: "reports", label: "Reports", icon: null, show: caps.view || caps.manage_any },
      { key: "settings", label: "Settings", icon: <Settings2 className="h-3.5 w-3.5" aria-hidden />, show: caps.configure },
    ];
    return t.filter((x) => x.show);
  }, [caps]);
  const requested = params.get("tab") as Tab | null;
  const tab: Tab | undefined = tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key;

  if (failed) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <EmptyState title="You don't have access to office-hours oversight" />
      </div>
    );
  }
  if (!config) return <div className="mx-auto max-w-6xl px-4 py-6"><Spinner /></div>;
  const termId = config.term?.termId ?? selectedTermId;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-gray-50">
          <Clock4 className="h-6 w-6 text-blue-600" aria-hidden /> Office hours oversight
        </h1>
        <Muted>{config.term?.name ?? "This term"} · who is attending, which registers are missing, and what needs follow-up.</Muted>
      </header>
      <nav className="flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 dark:bg-gray-800/40" role="tablist" aria-label="Oversight views">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => {
              params.set("tab", t.key);
              setParams(params, { replace: true });
            }}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm dark:bg-gray-800/30 dark:text-gray-50" : "text-slate-700 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "overview" && <OverviewTab termId={termId} config={config} />}
      {tab === "schedules" && <SchedulesTab termId={termId} />}
      {tab === "unmarked" && <UnmarkedTab />}
      {tab === "escalations" && <EscalationsTab termId={termId} />}
      {tab === "coverage" && <CoverageTab termId={termId} />}
      {tab === "transfers" && <TransfersTab />}
      {tab === "closures" && <ClosuresTab canWrite={config.capabilities.manage_any || config.capabilities.configure} />}
      {tab === "reports" && <OfficeHoursReports termId={termId} mode="leadership" />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
};

export default OfficeHoursAdmin;
