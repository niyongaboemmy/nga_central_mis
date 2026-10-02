import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ClipboardX, ShieldAlert, Users } from "lucide-react";
import { officeHoursApi, type OfficeHoursConfig, type OverviewReport, type SummaryReport } from "../../../api/officeHours";
import { Card, CardTitle, Muted, Spinner } from "../ohUi";
import { pct } from "../reports/exports";

/**
 * Oversight landing (plan §11 Overview): what is happening today (refreshed
 * every minute), this week's figures and what needs a decision.
 */
const Tile: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string; to?: string; tone?: "warning" | "critical" }> = ({ icon, label, value, hint, to, tone }) => {
  const body = (
    <div
      className={`h-full rounded-2xl border p-4 transition ${
        tone === "critical" ? "border-rose-300 dark:border-rose-500/40" : tone === "warning" ? "border-amber-300 dark:border-amber-500/40" : "border-slate-200 dark:border-slate-700"
      } ${to ? "hover:shadow-sm" : ""}`}
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50">{value}</p>
      {hint && <Muted className="text-xs">{hint}</Muted>}
    </div>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      {body}
    </Link>
  ) : (
    body
  );
};

const OverviewTab: React.FC<{ termId: number | null; config?: OfficeHoursConfig }> = ({ termId }) => {
  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [week, setWeek] = useState<SummaryReport | null>(null);
  const load = useCallback(() => {
    officeHoursApi.overview(termId).then((r) => setOverview(r.data.data)).catch(() => undefined);
    officeHoursApi.summary({ period: "week" }).then((r) => setWeek(r.data.data)).catch(() => undefined);
  }, [termId]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!overview) return <Spinner />;
  const k = week?.kpis;
  return (
    <div className="space-y-5">
      <Card labelledBy="oh-ov-today">
        <CardTitle id="oh-ov-today" icon={<Activity className="h-4 w-4" aria-hidden />}>Today</CardTitle>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile icon={<Users className="h-3.5 w-3.5" aria-hidden />} label="Sessions" value={String(overview.today.sessions)} hint={`${overview.today.expected} students expected`} />
          <Tile icon={<Activity className="h-3.5 w-3.5" aria-hidden />} label="Registers taken" value={`${overview.today.marked}/${overview.today.sessions}`} />
          <Tile
            icon={<ClipboardX className="h-3.5 w-3.5" aria-hidden />}
            label="Missing"
            value={String(overview.today.missing)}
            to="?tab=unmarked"
            tone={overview.today.missing ? "warning" : undefined}
          />
          <Tile
            icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden />}
            label="Escalations open"
            value={String(overview.open_escalations)}
            to="?tab=escalations"
            tone={overview.open_escalations ? "critical" : undefined}
          />
        </div>
      </Card>
      <Card labelledBy="oh-ov-week">
        <CardTitle id="oh-ov-week">This week{week ? ` · ${week.period.label}` : ""}</CardTitle>
        {!k ? (
          <Spinner />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile icon={null} label="Attendance" value={pct(k.attendance_rate)} hint={week?.previous ? `last week ${pct(week.previous.attendance_rate)}` : undefined} />
            <Tile icon={null} label="Registers taken" value={`${k.held}/${k.planned}`} hint={`${pct(k.delivery_rate)} delivered`} />
            <Tile icon={null} label="Chronic students" value={String(k.bands.CHRONIC)} to="?tab=reports" tone={k.bands.CHRONIC ? "warning" : undefined} />
            <Tile icon={null} label="Places used" value={pct(week?.utilisation?.rate ?? null)} />
          </div>
        )}
      </Card>
      {!overview.names_allowed && <Muted className="text-xs">Your access shows totals only; names are hidden.</Muted>}
    </div>
  );
};

export default OverviewTab;
