import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import {
  apiError,
  formatYmd,
  humanize,
  officeHoursApi,
  type ReportQuery,
  type StudentReport,
  type TeacherReport,
} from "../../../api/officeHours";
import { ATTENDANCE_META, BandPill, Card, CardTitle, EmptyState, Muted, Spinner } from "../ohUi";
import PeriodPicker from "./PeriodPicker";
import { exportPdf, exportXlsx, pct } from "./exports";

/**
 * Student 360 and Teacher 360 (plan §14.3). The student view is a calendar of
 * every session coloured by the mark, the assignments and any escalations;
 * the teacher view is delivery: registers on time, roster size, attendance.
 */
const cellColor: Record<string, string> = {
  PRESENT: "bg-emerald-600",
  LATE: "bg-amber-500",
  ABSENT: "bg-rose-600",
  EXCUSED: "bg-sky-600",
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-2xl border border-slate-200 p-3 dark:border-gray-700/30">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-gray-300">{label}</p>
    <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-gray-50">{value}</p>
  </div>
);

export const Student360: React.FC = () => {
  const { id } = useParams();
  const { showToast } = useToast();
  const [query, setQuery] = useState<ReportQuery>({ period: "year", anchor: new Date().toISOString().slice(0, 10) });
  const [data, setData] = useState<StudentReport | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null);
    officeHoursApi
      .studentReport(Number(id), query)
      .then((r) => setData(r.data.data))
      .catch((e) => {
        setFailed(true);
        showToast(apiError(e, "Couldn't load this student"), "error");
      });
  }, [id, query, showToast]);

  if (failed) return <div className="mx-auto max-w-6xl px-4 py-6"><EmptyState title="You can't see this student's office hours" /></div>;
  if (!data) return <div className="mx-auto max-w-6xl px-4 py-6"><Spinner /></div>;
  const s = data.stats;
  const exportRows = data.timeline.map((t) => [t.session_date, t.title, t.session_status === "CANCELLED" ? `Cancelled (${humanize(t.cancel_reason)})` : t.status ? humanize(t.status) : "Not marked", t.note]);
  const table = { title: `${data.name} · ${data.period.label}`, columns: ["Date", "Office hours", "Mark", "Note"], rows: exportRows };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <Link to="/office-hours/admin?tab=reports" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Reports
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-50">{data.name}</h1>
          <Muted>Office hours · {data.period.label}</Muted>
        </div>
        <PeriodPicker value={query} onChange={setQuery} label={data.period.label} />
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Attendance" value={pct(s.rate)} />
        <Stat label="Attended" value={`${s.present + s.late}/${s.expected}`} />
        <Stat label="Missed" value={String(s.absent)} />
        <Stat label="Missed in a row" value={String(s.current_absent_streak)} />
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 p-3 dark:border-gray-700/30">
          <BandPill band={s.band} />
        </div>
      </div>

      <Card labelledBy="oh-360-calendar">
        <CardTitle
          id="oh-360-calendar"
          action={
            <div className="flex gap-2">
              <button type="button" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={() => void exportXlsx([table], `office-hours-${data.name}`)}>Excel</button>
              <button type="button" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={() => void exportPdf([table], `office-hours-${data.name}`, data.period.label)}>PDF</button>
            </div>
          }
        >
          Every session
        </CardTitle>
        {data.timeline.length === 0 ? (
          <EmptyState title="No sessions in this period" />
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5" aria-label="Sessions by date">
              {data.timeline.map((t) => {
                const cancelled = t.session_status === "CANCELLED";
                const label = `${formatYmd(t.session_date)}: ${cancelled ? "cancelled" : t.status ? ATTENDANCE_META[t.status].label : "not marked"}`;
                return (
                  <li
                    key={t.session_id}
                    title={label}
                    aria-label={label}
                    className={`h-6 w-6 rounded-md ${cancelled ? "border border-dashed border-slate-400 bg-transparent" : t.status ? cellColor[t.status] : "bg-slate-200 dark:bg-gray-700/50"}`}
                  />
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-700 dark:text-gray-200">
              {Object.entries(cellColor).map(([k, c]) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={`h-3 w-3 rounded-sm ${c}`} aria-hidden /> {humanize(k)}
                </span>
              ))}
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-slate-200 dark:bg-gray-700/50" aria-hidden /> Not marked</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-dashed border-slate-400" aria-hidden /> Cancelled</span>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card labelledBy="oh-360-assignments">
          <CardTitle id="oh-360-assignments">Office hours</CardTitle>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-gray-700/30">
            {data.assignments.map((a) => (
              <li key={a.assignment_id} className="py-2">
                <p className="font-semibold text-slate-900 dark:text-gray-100">
                  {a.title} <span className="font-normal text-slate-600 dark:text-gray-300">· {a.teacher_name}</span>
                </p>
                <p className="text-xs text-slate-600 dark:text-gray-300">
                  {formatYmd(a.effective_from)} – {formatYmd(a.effective_to)}
                  {a.reason_code ? ` · ${humanize(a.reason_code)}` : ""}
                  {a.status === "ENDED" && a.end_reason_code ? ` · ended: ${humanize(a.end_reason_code)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
        {data.escalations.length > 0 && (
          <Card labelledBy="oh-360-escalations">
            <CardTitle id="oh-360-escalations">Escalations</CardTitle>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-gray-700/30">
              {data.escalations.map((e) => (
                <li key={e.escalation_id} className="flex justify-between py-2">
                  <span>Level {e.level} · {humanize(e.trigger_code)}</span>
                  <span className="text-xs text-slate-600 dark:text-gray-300">{e.acknowledged_at ? "Followed up" : "Open"}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
};

export const Teacher360: React.FC = () => {
  const { id } = useParams();
  const { showToast } = useToast();
  const [query, setQuery] = useState<ReportQuery>({ period: "term", anchor: new Date().toISOString().slice(0, 10) });
  const [data, setData] = useState<TeacherReport | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setData(null);
    officeHoursApi
      .teacherReport(Number(id), query)
      .then((r) => setData(r.data.data))
      .catch((e) => {
        setFailed(true);
        showToast(apiError(e, "Couldn't load this teacher"), "error");
      });
  }, [id, query, showToast]);
  if (failed) return <div className="mx-auto max-w-6xl px-4 py-6"><EmptyState title="You can't see this teacher's office hours" /></div>;
  if (!data) return <div className="mx-auto max-w-6xl px-4 py-6"><Spinner /></div>;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <Link to="/office-hours/admin?tab=reports" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Reports
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-gray-50">{data.name}</h1>
          <Muted>Office hours delivery · {data.period.label}</Muted>
        </div>
        <PeriodPicker value={query} onChange={setQuery} label={data.period.label} />
      </header>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Registers taken" value={`${data.held}/${data.planned}`} />
        <Stat label="Missing" value={String(data.unmarked)} />
        <Stat label="Taken the same day" value={pct(data.on_time_registers)} />
        <Stat label="Students' attendance" value={pct(data.attendance_rate)} />
        <Stat label="Cancelled" value={String(data.cancelled)} />
        <Stat label="Average roster" value={String(data.average_roster)} />
        <Stat label="Presence" value={pct(data.presence_rate)} />
        <Stat label="Delivery" value={pct(data.delivery_rate)} />
      </div>
      <Card labelledBy="oh-t360-schedules">
        <CardTitle id="oh-t360-schedules">Office hours</CardTitle>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-gray-700/30">
          {data.schedules.map((s) => (
            <li key={s.schedule_id} className="flex justify-between py-2">
              <Link to={`/office-hours/schedules/${s.schedule_id}`} className="font-semibold text-slate-900 hover:underline dark:text-gray-100">{s.title}</Link>
              <span className="text-xs text-slate-600 dark:text-gray-300">{humanize(s.status)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};
