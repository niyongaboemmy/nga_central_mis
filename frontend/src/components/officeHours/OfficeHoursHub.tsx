import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRightLeft, CalendarClock, ClipboardCheck, Clock4, Plus, RefreshCw, Users } from "lucide-react";
import { useAcademicPeriod } from "../../contexts/AcademicPeriodContext";
import { useToast } from "../../contexts/ToastContext";
import {
  apiError,
  formatYmd,
  officeHoursApi,
  studentName,
  type MyOfficeHours,
  type OfficeHourSession,
  type OfficeHoursConfig,
  type TransferRequest,
} from "../../api/officeHours";
import ScheduleDrawer from "./ScheduleDrawer";
import RegisterSheet from "./RegisterSheet";
import { startRegisterQueueFlusher } from "./offlineQueue";
import OfficeHoursReports from "./reports/OfficeHoursReports";
import { Card, CardTitle, EmptyState, Muted, primaryBtn, secondaryBtn, SessionStatePill, Spinner } from "./ohUi";

/**
 * /office-hours -- a teacher's office hours (plan §9): today's sessions with
 * the register one tap away, missing registers, transfer requests, every
 * schedule, and reports.
 */
type Tab = "today" | "schedules" | "reports";

export const SessionRow: React.FC<{ s: OfficeHourSession; onRegister?: (s: OfficeHourSession) => void; showDate?: boolean }> = ({ s, onRegister, showDate = true }) => (
  <li className="flex flex-wrap items-center gap-3 py-3">
    <div className="w-28 flex-shrink-0">
      {showDate && <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{formatYmd(s.session_date)}</p>}
      <p className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
        {s.start_time}–{s.end_time}
      </p>
    </div>
    <div className="min-w-0 flex-1">
      <Link to={`/office-hours/schedules/${s.schedule_id}`} className="block truncate text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100">
        {s.title}
      </Link>
      <p className="truncate text-xs text-slate-600 dark:text-slate-300">
        {[s.location, `${s.expected} expected`, s.state === "held" ? `${s.attended} attended` : null].filter(Boolean).join(" · ")}
      </p>
    </div>
    <SessionStatePill state={s.state} />
    {onRegister && s.state !== "cancelled" && s.state !== "upcoming" && (
      <button type="button" className={s.state === "held" ? secondaryBtn : primaryBtn} onClick={() => onRegister(s)}>
        <ClipboardCheck className="h-4 w-4" aria-hidden /> {s.state === "held" ? "Edit register" : "Take register"}
      </button>
    )}
  </li>
);

const TransferList: React.FC<{ incoming: TransferRequest[]; outgoing: TransferRequest[]; onChanged: () => void }> = ({ incoming, outgoing, onChanged }) => {
  const { showToast } = useToast();
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showToast(ok, "success");
      onChanged();
    } catch (error) {
      showToast(apiError(error), "error");
    }
  };
  if (!incoming.length && !outgoing.length) return null;
  return (
    <Card labelledBy="oh-transfers">
      <CardTitle id="oh-transfers" icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}>Transfer requests</CardTitle>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {incoming.map((r) => (
          <li key={r.request_id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-900 dark:text-slate-100">
                <strong>{r.requested_by_name ?? "A teacher"}</strong> asks you to release <strong>{studentName(r.student)}</strong> to “{r.to_schedule.title}”.
              </p>
              {r.message && <Muted className="text-xs">“{r.message}”</Muted>}
            </div>
            <button type="button" className={primaryBtn} onClick={() => act(() => officeHoursApi.acceptTransfer(r.request_id), "Student released")}>Release</button>
            <button type="button" className={secondaryBtn} onClick={() => act(() => officeHoursApi.declineTransfer(r.request_id), "Request declined")}>Keep</button>
          </li>
        ))}
        {outgoing.map((r) => (
          <li key={r.request_id} className="flex flex-wrap items-center gap-3 py-3">
            <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
              Waiting for <strong>{r.from_schedule.teacher_name ?? "the other teacher"}</strong> to release <strong>{studentName(r.student)}</strong>.
            </p>
            <button type="button" className={secondaryBtn} onClick={() => act(() => officeHoursApi.cancelTransfer(r.request_id), "Request withdrawn")}>Withdraw</button>
          </li>
        ))}
      </ul>
    </Card>
  );
};

const OfficeHoursHub: React.FC = () => {
  const { selectedTermId } = useAcademicPeriod();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "today");
  const [config, setConfig] = useState<OfficeHoursConfig | null>(null);
  const [data, setData] = useState<MyOfficeHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDay, setDrawerDay] = useState<number | null>(null);
  const [registerFor, setRegisterFor] = useState<OfficeHourSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, m] = await Promise.all([officeHoursApi.config(selectedTermId), officeHoursApi.my(selectedTermId)]);
      setConfig(c.data.data);
      setData(m.data.data);
    } catch (error) {
      showToast(apiError(error, "Couldn't load your office hours"), "error");
    } finally {
      setLoading(false);
    }
  }, [selectedTermId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Registers saved while offline are sent as soon as the connection returns.
  useEffect(
    () =>
      startRegisterQueueFlusher((r) => {
        if (r.sent) showToast(`${r.sent} register${r.sent === 1 ? "" : "s"} saved offline ${r.sent === 1 ? "was" : "were"} sent`, "success");
        if (r.conflicts) showToast("A register saved offline clashed with a newer one — open it to check", "warning");
        void load();
      }),
    [load, showToast],
  );

  // Deep link from the timetable band: /office-hours?new=1&day=3
  useEffect(() => {
    if (params.get("new") === "1" && config) {
      const d = Number(params.get("day"));
      setDrawerDay(d >= 1 && d <= 5 ? d : null);
      setDrawerOpen(true);
      params.delete("new");
      params.delete("day");
      setParams(params, { replace: true });
    }
  }, [params, setParams, config]);

  const changeTab = (t: Tab) => {
    setTab(t);
    params.set("tab", t);
    setParams(params, { replace: true });
  };

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "today", label: "Today" },
    { key: "schedules", label: "My office hours" },
    { key: "reports", label: "Reports" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-50">
            <Clock4 className="h-6 w-6 text-blue-600" aria-hidden /> Office hours
          </h1>
          <Muted>
            Mandatory support sessions after the last period
            {config ? ` (${config.band_start}–${config.band_end})` : ""}. Assign students, then take the register each time.
          </Muted>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryBtn} onClick={() => void load()} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className={primaryBtn}
            disabled={!config?.capabilities.manage_own && !config?.capabilities.manage_any}
            onClick={() => {
              setDrawerDay(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> New office hours
          </button>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Office hours views">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => changeTab(t.key)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50" : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && !data ? (
        <Spinner label="Loading office hours" />
      ) : !data ? null : tab === "today" ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="min-w-0 space-y-5 lg:col-span-3">
            <Card labelledBy="oh-today">
              <CardTitle id="oh-today" icon={<CalendarClock className="h-4 w-4" aria-hidden />}>Today · {formatYmd(data.today)}</CardTitle>
              {data.today_sessions.length === 0 ? (
                <EmptyState title="No office hours today" body="Sessions you host — including ones you cover for a colleague — appear here." />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.today_sessions.map((s) => (
                    <SessionRow key={s.session_id} s={s} showDate={false} onRegister={setRegisterFor} />
                  ))}
                </ul>
              )}
            </Card>
            {data.unmarked.length > 0 && (
              <Card labelledBy="oh-unmarked" className="border-amber-300 dark:border-amber-500/40">
                <CardTitle id="oh-unmarked" icon={<ClipboardCheck className="h-4 w-4 text-amber-600" aria-hidden />}>Registers still missing</CardTitle>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.unmarked.map((s) => (
                    <SessionRow key={s.session_id} s={s} onRegister={setRegisterFor} />
                  ))}
                </ul>
              </Card>
            )}
          </div>
          <div className="min-w-0 space-y-5 lg:col-span-2">
            <TransferList incoming={data.transfers.incoming} outgoing={data.transfers.outgoing} onChanged={() => void load()} />
            <Card labelledBy="oh-next">
              <CardTitle id="oh-next">Coming up</CardTitle>
              {data.upcoming.length === 0 ? (
                <Muted>Nothing scheduled in the next two weeks.</Muted>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.upcoming.map((s) => (
                    <SessionRow key={s.session_id} s={s} />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      ) : tab === "schedules" ? (
        <Card labelledBy="oh-schedules">
          <CardTitle id="oh-schedules" icon={<Users className="h-4 w-4" aria-hidden />}>My office hours this term</CardTitle>
          {data.schedules.length === 0 ? (
            <EmptyState
              title="You have no office hours yet"
              body="Create them here or from the + on your timetable's office-hours row."
              action={
                <button type="button" className={primaryBtn} onClick={() => setDrawerOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> New office hours
                </button>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.schedules.map((s) => (
                <li key={s.schedule_id}>
                  <Link
                    to={`/office-hours/schedules/${s.schedule_id}`}
                    className="block rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:hover:border-blue-500/50"
                    style={s.subject_color ? { borderLeftColor: s.subject_color, borderLeftWidth: 4 } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{s.title}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {s.status === "ACTIVE" ? "Published" : s.status === "DRAFT" ? "Draft" : "Ended"}
                      </span>
                    </div>
                    <Muted className="text-xs">
                      {s.days_label} · {s.start_time}–{s.end_time}
                      {s.location ? ` · ${s.location}` : ""}
                    </Muted>
                    <Muted className="text-xs">
                      {s.assigned_count}/{s.capacity} students · until {formatYmd(s.effective_to)}
                    </Muted>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <OfficeHoursReports termId={data.term_id} mode="teacher" />
      )}

      {config && (
        <ScheduleDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          config={config}
          termId={data?.term_id ?? selectedTermId}
          initialDay={drawerDay}
          onSaved={(id) => {
            void load();
            navigate(`/office-hours/schedules/${id}`);
          }}
        />
      )}
      {registerFor && (
        <RegisterSheet
          sessionId={registerFor.session_id}
          onClose={() => setRegisterFor(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
};

export default OfficeHoursHub;
