import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Download, FileSpreadsheet, FileText, Info, Printer } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { useIsDark } from "../../calendar/useIsDark";
import {
  apiError,
  formatYmd,
  humanize,
  officeHoursApi,
  type BreakdownRow,
  type ConsistencyReport,
  type ConsistencyRow,
  type DailySheet,
  type GroupBy,
  type ReportQuery,
  type SummaryReport,
} from "../../../api/officeHours";
import { AttendancePill, BandPill, Card, CardTitle, EmptyState, inputCls, labelCls, Muted, secondaryBtn, Spinner } from "../ohUi";
import PeriodPicker from "./PeriodPicker";
import { exportCsv, exportPdf, exportXlsx, ExportTable, pct } from "./exports";
import SelectField from "../../ui/SelectField";

/**
 * Office-hours reports (plan §14): any day, week, month, term, year or custom
 * range. Teachers see their own office hours; class teachers, programme leads
 * and leadership see their area. Every view exports to CSV, Excel and PDF.
 */
type View = "summary" | "breakdown" | "consistency" | "daily";
const SERIES = { light: "#2a78d6", dark: "#3987e5" };
const GROUPS: Array<[GroupBy, string]> = [
  ["teacher", "Teacher"],
  ["subject", "Subject"],
  ["class_group", "Class"],
  ["grade", "Grade"],
  ["program", "Programme"],
  ["weekday", "Weekday"],
  ["purpose", "Purpose"],
];

const Delta: React.FC<{ now: number | null; before: number | null | undefined; unit?: string; goodWhenUp?: boolean }> = ({ now, before, unit = "", goodWhenUp = true }) => {
  if (now === null || before === null || before === undefined) return null;
  const d = Math.round((now - before) * 10) / 10;
  if (d === 0) return <span className="text-xs text-slate-600 dark:text-slate-300">no change</span>;
  const up = d > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center text-xs font-semibold ${good ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? "+" : ""}
      {d}
      {unit} vs before
    </span>
  );
};

const Kpi: React.FC<{ label: string; value: string; delta?: React.ReactNode; hint?: string }> = ({ label, value, delta, hint }) => (
  <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700" title={hint}>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{label}</p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
    <div className="mt-1 min-h-[1rem]">{delta}</div>
  </div>
);

const ExportButtons: React.FC<{ tables: () => ExportTable[]; title: string; scope: string }> = ({ tables, title, scope }) => {
  const { showToast } = useToast();
  const run = async (fn: () => Promise<void> | void) => {
    try {
      await fn();
    } catch {
      showToast("Couldn't create the file", "error");
    }
  };
  return (
    <div className="flex flex-wrap gap-2" aria-label="Export">
      <button type="button" className={secondaryBtn} onClick={() => run(() => tables().forEach(exportCsv))}>
        <Download className="h-4 w-4" aria-hidden /> CSV
      </button>
      <button type="button" className={secondaryBtn} onClick={() => run(() => exportXlsx(tables(), title))}>
        <FileSpreadsheet className="h-4 w-4" aria-hidden /> Excel
      </button>
      <button type="button" className={secondaryBtn} onClick={() => run(() => exportPdf(tables(), title, scope))}>
        <FileText className="h-4 w-4" aria-hidden /> PDF
      </button>
    </div>
  );
};

const SCOPE_LABEL = { school: "Whole school", classGroups: "Your classes", own: "Your office hours" };

const SummaryView: React.FC<{ data: SummaryReport }> = ({ data }) => {
  const dark = useIsDark();
  const k = data.kpis;
  const p = data.previous;
  const color = dark ? SERIES.dark : SERIES.light;
  const [showTable, setShowTable] = useState(false);
  const cancelled = Object.entries(k.cancelled_by_reason);
  const tables = (): ExportTable[] => [
    {
      title: `Office hours summary · ${data.period.label}`,
      subtitle: SCOPE_LABEL[data.scope],
      columns: ["Measure", "This period", "Previous"],
      rows: [
        ["Sessions planned", k.planned, p?.planned ?? null],
        ["Registers taken", k.held, p?.held ?? null],
        ["Registers missing", k.unmarked, p?.unmarked ?? null],
        ["Cancelled", k.cancelled, p?.cancelled ?? null],
        ["Delivery rate", pct(k.delivery_rate), pct(p?.delivery_rate)],
        ["Attendance rate", pct(k.attendance_rate), pct(p?.attendance_rate)],
        ["Presence rate", pct(k.presence_rate), pct(p?.presence_rate)],
        ["Punctuality", pct(k.punctuality), pct(p?.punctuality)],
        ["Present / late / absent / excused", `${k.present} / ${k.late} / ${k.absent} / ${k.excused}`, p ? `${p.present} / ${p.late} / ${p.absent} / ${p.excused}` : null],
        ["Students: consistent / watch / chronic", `${k.bands.CONSISTENT} / ${k.bands.WATCH} / ${k.bands.CHRONIC}`, p ? `${p.bands.CONSISTENT} / ${p.bands.WATCH} / ${p.bands.CHRONIC}` : null],
        ["Drop-ins", k.drop_ins, p?.drop_ins ?? null],
      ],
    },
    { title: "By date", columns: ["Period", "Planned", "Held", "Attendance"], rows: data.series.map((s) => [s.label, s.planned, s.held, pct(s.attendance_rate)]) },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Muted>
          {SCOPE_LABEL[data.scope]} · {data.period.label}
          {data.period.previous ? ` · compared with ${data.period.previous.label}` : ""}
        </Muted>
        <ExportButtons tables={tables} title={`office-hours-summary-${data.period.from}`} scope={SCOPE_LABEL[data.scope]} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Attendance" value={pct(k.attendance_rate)} delta={<Delta now={k.attendance_rate} before={p?.attendance_rate} unit=" pts" />} hint="(present + late + excused) ÷ marked students, on sessions with a register" />
        <Kpi label="Registers taken" value={`${k.held}/${k.planned}`} delta={<Delta now={k.delivery_rate} before={p?.delivery_rate} unit=" pts" />} hint="Sessions with a register ÷ sessions that should have ended" />
        <Kpi label="Missing registers" value={String(k.unmarked)} delta={<Delta now={k.unmarked} before={p?.unmarked} goodWhenUp={false} />} />
        <Kpi label="Chronic students" value={String(k.bands.CHRONIC)} delta={<Delta now={k.bands.CHRONIC} before={p?.bands.CHRONIC} goodWhenUp={false} />} hint="Below the watch threshold with enough sessions held" />
        <Kpi label="Presence" value={pct(k.presence_rate)} hint="(present + late) ÷ marked students — excused counts as not present" />
        <Kpi label="Punctuality" value={pct(k.punctuality)} hint="present ÷ (present + late)" />
        <Kpi label="Students" value={String(k.students)} hint="Students with at least one mark" />
        <Kpi label="Places used" value={data.utilisation ? pct(data.utilisation.rate) : "—"} hint="Students assigned ÷ capacity of the office hours in this period" />
      </div>

      <Card labelledBy="oh-trend">
        <CardTitle
          id="oh-trend"
          action={
            <button type="button" className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
              {showTable ? "Chart" : "Table"}
            </button>
          }
        >
          Attendance over time
        </CardTitle>
        {data.series.length === 0 ? (
          <EmptyState title="No sessions in this period" />
        ) : showTable ? (
          <div className="relative overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  <th scope="col" className="py-2 pr-3">Period</th>
                  <th scope="col" className="py-2 pr-3 text-right">Planned</th>
                  <th scope="col" className="py-2 pr-3 text-right">Held</th>
                  <th scope="col" className="py-2 pr-3 text-right">Attendance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.series.map((s) => (
                  <tr key={s.key}>
                    <td className="py-1.5 pr-3 text-slate-800 dark:text-slate-100">{s.label}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.planned}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{s.held}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{pct(s.attendance_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-56" role="img" aria-label={`Attendance by ${data.period.bucket}: ${data.series.map((s) => `${s.label} ${pct(s.attendance_rate)}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#334155" : "#e2e8f0"} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: dark ? "#cbd5e1" : "#475569" }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: dark ? "#cbd5e1" : "#475569" }} />
                <Tooltip formatter={(v: any) => (v === null ? "—" : `${v}%`)} labelStyle={{ color: "#0f172a" }} />
                <Area type="monotone" dataKey="attendance_rate" name="Attendance" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {cancelled.length > 0 && (
        <Card labelledBy="oh-cancelled">
          <CardTitle id="oh-cancelled">Cancelled sessions</CardTitle>
          <ul className="flex flex-wrap gap-2 text-sm">
            {cancelled.map(([r, n]) => (
              <li key={r} className="rounded-full bg-slate-100 px-3 py-1 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                {humanize(r)}: {n}
              </li>
            ))}
          </ul>
          <Muted className="mt-2 text-xs">Cancelled sessions never count against students.</Muted>
        </Card>
      )}

      <details className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold">
          <Info className="h-4 w-4" aria-hidden /> How is this calculated?
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Attendance counts present, late and excused as attended (the same rule as the attendance app). Only absences lower it.</li>
          <li>Only sessions with a register count. Cancelled sessions and registers nobody took never count against a student.</li>
          <li>Consistent, watch and chronic come from each student's rate once enough sessions are held; the thresholds are in Settings.</li>
          <li>Weeks run Monday to Friday; terms and years follow the academic calendar.</li>
        </ul>
      </details>
    </div>
  );
};

const BreakdownView: React.FC<{ rows: BreakdownRow[]; groupBy: GroupBy; onGroupBy: (g: GroupBy) => void; label: string }> = ({ rows, groupBy, onGroupBy, label }) => {
  const tables = (): ExportTable[] => [
    {
      title: `Office hours by ${groupBy.replace("_", " ")} · ${label}`,
      columns: ["Group", "Planned", "Held", "Missing", "Cancelled", "Delivery", "Marked", "Attended", "Absent", "Attendance", "Students", "Chronic"],
      rows: rows.map((r) => [r.label, r.planned, r.held, r.unmarked, r.cancelled, pct(r.delivery_rate), r.expected_attendances, r.attended, r.absent, pct(r.attendance_rate), r.students, r.bands.CHRONIC]),
    },
  ];
  return (
    <Card labelledBy="oh-breakdown">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="oh-group-by" className={labelCls}>Group by</label>
          <SelectField id="oh-group-by" className={`${inputCls} w-auto`} value={groupBy} onChange={(e) => onGroupBy(e.target.value as GroupBy)}>
            {GROUPS.map(([g, l]) => (
              <option key={g} value={g}>{l}</option>
            ))}
          </SelectField>
        </div>
        <ExportButtons tables={tables} title={`office-hours-by-${groupBy}`} scope={label} />
      </div>
      <h2 id="oh-breakdown" className="sr-only">Breakdown</h2>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to show for this period" />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                <th scope="col" className="py-2 pr-3">{GROUPS.find((g) => g[0] === groupBy)?.[1]}</th>
                <th scope="col" className="py-2 pr-3 text-right">Registers</th>
                <th scope="col" className="py-2 pr-3 text-right">Missing</th>
                <th scope="col" className="py-2 pr-3 text-right">Attendance</th>
                <th scope="col" className="py-2 pr-3 text-right">Students</th>
                <th scope="col" className="py-2 pr-3">Consistency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => {
                const total = r.bands.CONSISTENT + r.bands.WATCH + r.bands.CHRONIC + r.bands.TOO_FEW || 1;
                return (
                  <tr key={r.key}>
                    <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">
                      {groupBy === "teacher" && r.key.startsWith("t") ? (
                        <Link to={`/office-hours/reports/teachers/${r.key.slice(1)}`} className="hover:underline">{r.label}</Link>
                      ) : groupBy === "purpose" ? (
                        humanize(r.label)
                      ) : (
                        r.label
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.held}/{r.planned}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${r.unmarked ? "font-semibold text-amber-800 dark:text-amber-200" : ""}`}>{r.unmarked}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{pct(r.attendance_rate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.students}</td>
                    <td className="py-2 pr-3">
                      <div className="flex h-2 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${r.bands.CONSISTENT} consistent, ${r.bands.WATCH} watch, ${r.bands.CHRONIC} chronic`}>
                        <span className="bg-emerald-600" style={{ width: `${(r.bands.CONSISTENT / total) * 100}%` }} />
                        <span className="bg-amber-500" style={{ width: `${(r.bands.WATCH / total) * 100}%` }} />
                        <span className="bg-rose-600" style={{ width: `${(r.bands.CHRONIC / total) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const ConsistencyList: React.FC<{ rows: ConsistencyRow[]; empty: string }> = ({ rows, empty }) =>
  rows.length === 0 ? (
    <Muted className="py-3">{empty}</Muted>
  ) : (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((r) => (
        <li key={r.student_id} className="flex flex-wrap items-center gap-3 py-2">
          <div className="min-w-0 flex-1">
            <Link to={`/office-hours/reports/students/${r.student_id}`} className="font-semibold text-slate-900 hover:underline dark:text-slate-100">{r.name}</Link>
            <p className="truncate text-xs text-slate-600 dark:text-slate-300">{[r.class_group_name, r.office_hours.join("; ")].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="text-sm tabular-nums text-slate-800 dark:text-slate-100">{pct(r.rate)}</span>
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {r.present + r.late}/{r.expected} attended
            {r.current_absent_streak >= 2 ? ` · missed last ${r.current_absent_streak}` : ""}
          </span>
          <BandPill band={r.band} />
        </li>
      ))}
    </ul>
  );

const ConsistencyView: React.FC<{ data: ConsistencyReport }> = ({ data }) => {
  const [tab, setTab] = useState<"chronic" | "watch" | "consistent" | "too_few">("chronic");
  const all = [...data.chronic, ...data.watch, ...data.consistent, ...data.too_few];
  const tables = (): ExportTable[] => [
    {
      title: `Office hours consistency · ${data.period.label}`,
      subtitle: `Consistent ≥ ${data.thresholds.consistent}% · watch ≥ ${data.thresholds.watch}% · at least ${data.thresholds.min_sessions} sessions`,
      columns: ["Student", "Class", "Band", "Rate", "Attended", "Absent", "Excused", "Expected", "Missed in a row", "Last attended", "Office hours"],
      rows: all.map((r) => [r.name, r.class_group_name, humanize(r.band), pct(r.rate), r.present + r.late, r.absent, r.excused, r.expected, r.current_absent_streak, r.last_attended, r.office_hours.join("; ")]),
    },
  ];
  const tabs: Array<[typeof tab, string, number]> = [
    ["chronic", "Chronic", data.chronic.length],
    ["watch", "Watch", data.watch.length],
    ["consistent", "Consistent", data.consistent.length],
    ["too_few", "Too few sessions", data.too_few.length],
  ];
  return (
    <Card labelledBy="oh-consistency">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="oh-consistency" className="text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">Who comes, who doesn't</h2>
        <ExportButtons tables={tables} title={`office-hours-consistency-${data.period.from}`} scope={data.period.label} />
      </div>
      <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Consistency bands">
        {tabs.map(([k, l, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === k ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
          >
            {l} ({n})
          </button>
        ))}
      </div>
      <ConsistencyList rows={data[tab]} empty="No students in this band." />
    </Card>
  );
};

const DailyView: React.FC<{ termId: number | null; anchor: string }> = ({ termId, anchor }) => {
  const { showToast } = useToast();
  const [date, setDate] = useState(anchor);
  const [data, setData] = useState<DailySheet | null>(null);
  useEffect(() => {
    setData(null);
    officeHoursApi
      .daily(date, termId)
      .then((r) => setData(r.data.data))
      .catch((e) => {
        setData({ date, sessions: [] });
        showToast(apiError(e, "Couldn't load the sheet"), "error");
      });
  }, [date, termId, showToast]);
  const tables = (): ExportTable[] =>
    (data?.sessions ?? []).map((s) => ({
      title: `${s.title} · ${s.start_time}`,
      subtitle: [s.location, s.host_name].filter(Boolean).join(" · "),
      columns: ["Student", "Class", "Mark"],
      rows: s.roster.map((r) => [r.name, r.class_group_name, r.status ? humanize(r.status) + (r.drop_in ? " (drop-in)" : "") : "Not marked"]),
    }));
  return (
    <Card labelledBy="oh-daily">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="oh-daily-date" className={labelCls}>Date</label>
          <input id="oh-daily-date" type="date" className={`${inputCls} w-auto`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryBtn} onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Print
          </button>
          <ExportButtons tables={tables} title={`office-hours-register-${date}`} scope={formatYmd(date, { weekday: true, year: true })} />
        </div>
      </div>
      <h2 id="oh-daily" className="sr-only">Daily register sheet</h2>
      {!data ? (
        <Spinner />
      ) : data.sessions.length === 0 ? (
        <EmptyState title="No office hours that day" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.sessions.map((s) => (
            <section key={s.session_id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700" aria-label={s.title}>
              <p className="font-semibold text-slate-900 dark:text-slate-100">{s.title}</p>
              <Muted className="text-xs">{[`${s.start_time}–${s.end_time}`, s.location, s.host_name, s.status === "CANCELLED" ? "Cancelled" : null].filter(Boolean).join(" · ")}</Muted>
              <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {s.roster.map((r) => (
                  <li key={r.student_id} className="flex items-center justify-between gap-2 py-1">
                    <span className="text-slate-800 dark:text-slate-100">
                      {r.name} <span className="text-xs text-slate-600 dark:text-slate-300">{r.class_group_name}</span>
                    </span>
                    <AttendancePill status={r.status} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
};

const OfficeHoursReports: React.FC<{ termId: number | null; mode: "teacher" | "leadership" }> = ({ termId, mode }) => {
  const { showToast } = useToast();
  const [view, setView] = useState<View>("summary");
  const [query, setQuery] = useState<ReportQuery>({ period: "week", anchor: new Date().toISOString().slice(0, 10) });
  const [groupBy, setGroupBy] = useState<GroupBy>(mode === "teacher" ? "weekday" : "teacher");
  const [summary, setSummary] = useState<SummaryReport | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[] | null>(null);
  const [consistency, setConsistency] = useState<ConsistencyReport | null>(null);
  const [loading, setLoading] = useState(false);
  // Only the Term view names a term; every other period is a plain date range.
  const q = useMemo(() => ({ ...query, term_id: query.period === "term" ? termId : undefined }), [query, termId]);

  const load = useCallback(async () => {
    if (query.period === "custom" && (!query.from || !query.to)) return;
    setLoading(true);
    try {
      if (view === "summary") setSummary((await officeHoursApi.summary(q)).data.data);
      if (view === "breakdown") setBreakdown((await officeHoursApi.breakdown({ ...q, group_by: groupBy })).data.data.rows);
      if (view === "consistency") setConsistency((await officeHoursApi.consistency(q)).data.data);
    } catch (e) {
      showToast(apiError(e, "Couldn't load the report"), "error");
    } finally {
      setLoading(false);
    }
  }, [view, q, groupBy, query.period, query.from, query.to, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const views: Array<[View, string]> = [
    ["summary", "Summary"],
    ["breakdown", "Breakdown"],
    ["consistency", "Students"],
    ["daily", "Daily sheet"],
  ];
  const label = summary?.period.label ?? consistency?.period.label;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Report views">
          {views.map(([v, l]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                view === v ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50" : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        {view !== "daily" && <PeriodPicker value={query} onChange={setQuery} label={label} />}
      </div>
      {loading && <Spinner label="Loading report" />}
      {!loading && view === "summary" && summary && <SummaryView data={summary} />}
      {!loading && view === "breakdown" && breakdown && <BreakdownView rows={breakdown} groupBy={groupBy} onGroupBy={setGroupBy} label={label ?? ""} />}
      {!loading && view === "consistency" && consistency && <ConsistencyView data={consistency} />}
      {view === "daily" && <DailyView termId={termId} anchor={query.anchor ?? new Date().toISOString().slice(0, 10)} />}
    </div>
  );
};

export default OfficeHoursReports;
