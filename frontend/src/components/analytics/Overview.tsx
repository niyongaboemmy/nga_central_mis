import { useState } from "react";
import { Link } from "react-router-dom";
import { Info, TrendingDown, TrendingUp, Radio } from "lucide-react";
import { reportsApi, monitorApi } from "../../api/monitor";
import { Empty, Panel } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { AppStackedBars, BarList, ChartPanel, DataTable, Delta, TrendLines, bucketLabel, fmtDur, fmtInt, fmtPct, appLabel } from "./charts";
import { AppDot, Segmented, useFeatureLabels, userTypeLabel } from "./common";

/**
 * Overview (plan §14 page 1). Definitions follow GA4 (plan §9.2) and are explained
 * in place, so a number never has to be taken on trust.
 */
const DEFS: Record<string, string> = {
  accessed_users: "People with at least one session (any activity, including just signing in).",
  active_users: "People with at least one engaged session: 10 s+ of engagement, 2+ pages, or a key event (GA4 'active users').",
  new_users: "People seen for the first time in this period.",
  visitors: "Devices on public pages that never signed in during the day. Bots are excluded.",
  sessions: "Visits. A visit ends after 30 minutes without activity; one visit can span several apps.",
  engagement_rate: "Engaged sessions ÷ sessions. Bounce rate is the rest.",
  avg_engagement_s_per_user: "Time with the page visible, focused and in use, per active user.",
  views: "Page views (route changes count as pages).",
  login_success_rate: "Successful sign-ins ÷ all sign-in attempts.",
};

export default function Overview() {
  const { state, update, qs } = useReportQuery();
  const { data, loading, error } = useReport(() => reportsApi.overview(qs), qs);
  const [line, setLine] = useState<"active" | "stickiness">("active");
  const label = useFeatureLabels();
  const live = useReport(() => monitorApi.live({}), "live-mini");

  const t = data?.totals;
  const d = data?.deltas ?? {};
  const kpis: { key: string; label: string; value: string; invert?: boolean }[] = t
    ? [
        { key: "accessed_users", label: "Accessed", value: fmtInt(t.accessed_users) },
        { key: "active_users", label: "Active users", value: fmtInt(t.active_users) },
        { key: "new_users", label: "New users", value: fmtInt(t.new_users) },
        { key: "visitors", label: "Public visitors", value: fmtInt(t.visitors) },
        { key: "sessions", label: "Sessions", value: fmtInt(t.sessions) },
        { key: "engagement_rate", label: "Engagement rate", value: fmtPct(t.engagement_rate) },
        { key: "avg_engagement_s_per_user", label: "Avg. engagement / user", value: fmtDur(t.avg_engagement_s_per_user) },
        { key: "login_success_rate", label: "Sign-in success", value: fmtPct(t.login_success_rate) },
      ]
    : [];

  return (
    <AnalyticsShell title="Overview" subtitle="How the platform is used across the MIS, Task Mentor, Tendo and Tupo.">
      <Toolbar state={state} update={update} />
      {error && <Empty>{error}</Empty>}
      {loading && !data && <Empty>Loading…</Empty>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3" aria-busy={loading}>
            {kpis.map((k) => (
              <div key={k.key} className="rounded-2xl border border-white/60 dark:border-slate-700/30 bg-white/70 dark:bg-slate-800/50 px-3 py-3 min-w-0">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <span className="truncate">{k.label}</span>
                  <button type="button" className="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-brand-600" title={DEFS[k.key]} aria-label={`How is ${k.label} calculated? ${DEFS[k.key]}`}>
                    <Info className="w-3 h-3" aria-hidden />
                  </button>
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-text-primary-light dark:text-text-primary-dark">{k.value}</div>
                {data.previous && <Delta value={d[k.key]} />}
              </div>
            ))}
          </div>

          {data.callouts?.length > 0 && (
            <Panel title="Worth a look">
              <ul className="space-y-1.5">
                {data.callouts.map((c: any, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    {c.kind === "up" ? <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-300" aria-hidden /> : <TrendingDown className="w-4 h-4 text-rose-700 dark:text-rose-300" aria-hidden />}
                    {c.text}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="grid lg:grid-cols-3 gap-4">
            <ChartPanel
              className="lg:col-span-2"
              title={line === "active" ? "Active users: daily, 7-day and 28-day" : "Stickiness (DAU ÷ MAU)"}
              actions={
                <Segmented
                  label="Measure"
                  value={line}
                  onChange={setLine}
                  options={[
                    { value: "active", label: "DAU / WAU / MAU" },
                    { value: "stickiness", label: "Stickiness" },
                  ]}
                />
              }
              table={
                <DataTable
                  dense
                  rows={data.series.daily}
                  rowKey={(r: any) => r.day}
                  columns={[
                    { key: "day", label: "Day", render: (r: any) => bucketLabel(r.day, "day") },
                    { key: "accessed", label: "Accessed", align: "right", render: (r: any) => fmtInt(r.accessed) },
                    { key: "dau", label: "DAU", align: "right", render: (r: any) => fmtInt(r.dau) },
                    { key: "wau", label: "WAU", align: "right", render: (r: any) => fmtInt(r.wau) },
                    { key: "mau", label: "MAU (28d)", align: "right", render: (r: any) => fmtInt(r.mau) },
                    { key: "st", label: "DAU/MAU", align: "right", render: (r: any) => fmtPct(r.stickiness) },
                  ]}
                />
              }
            >
              {line === "active" ? (
                <TrendLines
                  ariaLabel="Daily, weekly and monthly active users"
                  data={data.series.daily}
                  x="day"
                  xLabel={(v) => bucketLabel(v, "day")}
                  series={[
                    { key: "dau", label: "Daily active (DAU)" },
                    { key: "wau", label: "7-day active (WAU)" },
                    { key: "mau", label: "28-day active (MAU)" },
                  ]}
                />
              ) : (
                <TrendLines ariaLabel="Stickiness" data={data.series.daily} x="day" xLabel={(v) => bucketLabel(v, "day")} series={[{ key: "stickiness", label: "DAU ÷ MAU", unit: "%" }]} />
              )}
            </ChartPanel>

            <Panel title="Right now" className="min-w-0" actions={<Link to="/analytics/realtime" className="text-xs hover:underline">Open Realtime</Link>}>
              {live.data ? (
                <div className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <Radio className="w-4 h-4 text-emerald-600" aria-hidden />
                    <span className="text-3xl font-semibold tabular-nums">{live.data.counts.online}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-300">online · {live.data.counts.visitors} visitors</span>
                  </div>
                  <ul className="space-y-1">
                    {(["mis", "tm", "tendo", "tupo"] as const).map((a) => (
                      <li key={a} className="flex justify-between text-sm">
                        <AppDot app={a} />
                        <span className="tabular-nums">{live.data!.counts.by_app[a] ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Empty>—</Empty>
              )}
            </Panel>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <ChartPanel
              title={`Active users by app, per ${state.gran}`}
              table={
                <DataTable
                  dense
                  rows={data.series.buckets}
                  rowKey={(r: any) => r.bucket}
                  columns={[
                    { key: "b", label: "Period", render: (r: any) => bucketLabel(r.bucket, state.gran) },
                    ...(["mis", "tm", "tendo", "tupo"] as const).map((a) => ({ key: a, label: appLabel(a), align: "right" as const, render: (r: any) => fmtInt(r.apps[a] ?? 0) })),
                    { key: "t", label: "Active (distinct)", align: "right", render: (r: any) => fmtInt(r.active) },
                  ]}
                />
              }
            >
              <AppStackedBars ariaLabel="Active users by app" data={data.series.buckets} gran={state.gran} />
            </ChartPanel>

            <Panel title="Adoption by user type" className="min-w-0">
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">Active users ÷ all active accounts of that type.</p>
              <BarList
                ariaLabel="Adoption by user type"
                max={100}
                rows={data.adoption.map((a: any) => ({
                  key: a.type,
                  label: `${userTypeLabel(a.type)}s`,
                  value: a.adoption ?? 0,
                  display: a.adoption === null ? "<5" : `${a.adoption}%`,
                  hint: a.active === null ? "Group too small to show" : `${fmtInt(a.active)} of ${fmtInt(a.eligible)} active`,
                }))}
              />
            </Panel>
          </div>

          <Panel title="Most used features" actions={<Link to={`/analytics/engagement?${qs}`} className="text-xs hover:underline">All features</Link>}>
            <BarList
              ariaLabel="Most used features"
              rows={data.top_features.map((f: any) => ({
                key: `${f.app}|${f.feature}`,
                label: (
                  <span className="inline-flex items-center gap-2">
                    <AppDot app={f.app} withLabel={false} />
                    {label(f.feature)}
                  </span>
                ),
                value: f.views,
                display: `${fmtInt(f.views)} views`,
              }))}
            />
          </Panel>
        </>
      )}
    </AnalyticsShell>
  );
}
