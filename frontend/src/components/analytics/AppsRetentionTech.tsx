import React from "react";
import { reportsApi } from "../../api/monitor";
import { useTheme } from "../../contexts/ThemeContext";
import { Empty, Panel } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { BarList, ChartPanel, DataTable, Donut, TrendLines, appLabel, bucketLabel, fmtDate, fmtDur, fmtInt, fmtPct } from "./charts";
import { SkeletonDonut, SkeletonKpis, SkeletonList, SkeletonPanel, SkeletonTable } from "./Skeleton";
import { AppDot, useAppColors, useFeatureLabels } from "./common";
import type { AppKey } from "../../api/monitor";

/**
 * Apps, Retention and Technology (plan §14 pages 7, 8, 11).
 */
export function AppsPage() {
  const { state, update, qs } = useReportQuery();
  const { data, loading, error } = useReport(() => reportsApi.apps(qs), qs);
  const appColor = useAppColors();
  return (
    <AnalyticsShell title="Apps" subtitle="The four NGA apps side by side, and how people move between them." refreshing={loading && !!data}>
      <Toolbar state={state} update={update} showCompare={false} showGran={false} showAudience={false} />
      {error && <Empty>{error}</Empty>}
      {loading && !data && (
        <>
          <SkeletonKpis count={4} className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3" />
          <div className="grid lg:grid-cols-2 gap-4">
            <SkeletonPanel><SkeletonList rows={6} /></SkeletonPanel>
            <SkeletonPanel><SkeletonList rows={6} /></SkeletonPanel>
          </div>
        </>
      )}
      {data && (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {(["mis", "tm", "tendo", "tupo"] as AppKey[]).map((a) => {
              const c = data.apps.find((x: any) => x.app === a);
              return (
                <Panel key={a} title={<AppDot app={a} />} className="min-w-0 an-rise relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft">
                  <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: appColor(a) }} />
                  {c ? (
                    <dl className="grid grid-cols-2 gap-y-1 text-sm">
                      <dt className="text-slate-600 dark:text-slate-300">Active users</dt><dd className="text-right tabular-nums font-semibold">{fmtInt(c.active)}</dd>
                      <dt className="text-slate-600 dark:text-slate-300">Accessed</dt><dd className="text-right tabular-nums">{fmtInt(c.accessed)}</dd>
                      <dt className="text-slate-600 dark:text-slate-300">Visitors</dt><dd className="text-right tabular-nums">{fmtInt(c.visitors)}</dd>
                      <dt className="text-slate-600 dark:text-slate-300">Visits touching it</dt><dd className="text-right tabular-nums">{fmtInt(c.sessions)}</dd>
                      <dt className="text-slate-600 dark:text-slate-300">Page views</dt><dd className="text-right tabular-nums">{fmtInt(c.views)}</dd>
                      <dt className="text-slate-600 dark:text-slate-300">Avg. time / user</dt><dd className="text-right tabular-nums">{fmtDur(c.avg_engagement_s)}</dd>
                      <dt className="text-slate-600 dark:text-slate-300">Key events</dt><dd className="text-right tabular-nums">{fmtInt(c.key_events)}</dd>
                    </dl>
                  ) : (
                    <Empty>No activity yet.</Empty>
                  )}
                </Panel>
              );
            })}
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Moving between apps" className="min-w-0">
              <p className="text-sm mb-3">
                <span className="text-2xl font-semibold tabular-nums">{fmtPct(data.multi_app_share)}</span>{" "}
                <span className="text-slate-600 dark:text-slate-300">of {fmtInt(data.total_sessions)} visits used two or more apps.</span>
              </p>
              <FlowList links={data.flows.links} />
            </Panel>
            <Panel title="Most common journeys" className="min-w-0">
              <BarList
                ariaLabel="App journeys"
                rows={data.flows.paths.slice(0, 12).map((p: any) => ({ key: p.path.join(">"), label: p.path.map(appLabel).join(" → "), value: p.sessions }))}
              />
              <h3 className="text-xs font-semibold mt-4 mb-2">How visits start</h3>
              <BarList
                ariaLabel="Entry kinds"
                rows={data.flows.entry_kinds.map((e: any) => ({ key: e.value, label: ENTRY[e.value] ?? e.value, value: e.sessions, display: `${fmtInt(e.sessions)} · ${fmtPct(e.share)}` }))}
              />
            </Panel>
          </div>
        </>
      )}
    </AnalyticsShell>
  );
}
const ENTRY: Record<string, string> = { direct: "Opened directly", sso_launch: "Launched from another app (SSO)", pwa: "Installed app", push_click: "Notification tap", referral: "Link from another site", campaign: "Campaign link" };

/** App → app transitions as weighted links (a table-shaped Sankey that stays readable on phones). */
const FlowList: React.FC<{ links: { from: string; to: string; sessions: number }[] }> = ({ links }) => {
  const color = useAppColors();
  if (!links.length) return <Empty>No visits moved between apps in this range.</Empty>;
  const max = Math.max(...links.map((l) => l.sessions));
  return (
    <ul className="space-y-2" aria-label="Transitions between apps">
      {links.slice(0, 12).map((l) => (
        <li key={`${l.from}>${l.to}`} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <AppDot app={l.from as AppKey} /> <span aria-hidden>→</span><span className="sr-only">to</span> <AppDot app={l.to as AppKey} />
            </span>
            <span className="tabular-nums">{fmtInt(l.sessions)}</span>
          </div>
          <div className="flex h-1.5 mt-1 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800" aria-hidden>
            <div style={{ width: `${(l.sessions / max) * 50}%`, background: color(l.from as AppKey) }} />
            <div style={{ width: `${(l.sessions / max) * 50}%`, background: color(l.to as AppKey) }} />
          </div>
        </li>
      ))}
    </ul>
  );
};

export function RetentionPage() {
  const { state, update, qs } = useReportQuery({ preset: "90d", gran: "week" });
  const { data, loading, error } = useReport(() => reportsApi.retention(qs), qs);
  const { theme } = useTheme();
  const rgb = theme === "dark" ? "57,135,229" : "42,120,214";
  return (
    <AnalyticsShell title="Retention" subtitle="Do people come back? Cohorts by the week (or month) they were first active." refreshing={loading && !!data}>
      <Toolbar state={state} update={update} showCompare={false} showAudience={false} />
      {error && <Empty>{error}</Empty>}
      {loading && !data && (
        <>
          <SkeletonPanel><SkeletonTable rows={8} cols={8} /></SkeletonPanel>
          <SkeletonPanel />
        </>
      )}
      {data && (
        <>
          <Panel title={`Cohorts (${data.gran === "month" ? "monthly" : "weekly"})`} className="min-w-0">
            {data.cohorts.length === 0 ? (
              <Empty>Nobody was first active in this range.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs border-separate" style={{ borderSpacing: 2 }}>
                  <thead>
                    <tr className="text-slate-600 dark:text-slate-300">
                      <th className="text-left font-medium pr-3">First active</th>
                      <th className="text-right font-medium pr-3">People</th>
                      {data.cohorts[0].periods.map((_: any, i: number) => (
                        <th key={i} className="font-medium px-1">{data.gran === "month" ? "Month" : "Week"} {i}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.cohorts.map((c: any) => (
                      <tr key={c.start}>
                        <td className="pr-3 whitespace-nowrap">{bucketLabel(c.start, data.gran)}</td>
                        <td className="pr-3 text-right tabular-nums">{fmtInt(c.size)}</td>
                        {c.periods.map((p: any, i: number) => (
                          <td
                            key={i}
                            className="px-2 py-1.5 text-center tabular-nums rounded min-w-[52px] transition-transform hover:scale-110 hover:ring-2 hover:ring-slate-500/50 cursor-default"
                            style={{ background: p.rate ? `rgba(${rgb},${(0.08 + 0.5 * (p.rate / 100)).toFixed(2)})` : undefined }}
                            title={`${p.active} of ${c.size} active`}
                          >
                            {p.rate === null ? "" : `${p.rate}%`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <ChartPanel
            title={`New vs returning active users, per ${state.gran}`}
            table={
              <DataTable dense rows={data.new_vs_returning} rowKey={(r: any) => r.bucket} columns={[
                { key: "b", label: "Period", render: (r: any) => bucketLabel(r.bucket, state.gran) },
                { key: "n", label: "New", align: "right", render: (r: any) => fmtInt(r.new) },
                { key: "r", label: "Returning", align: "right", render: (r: any) => fmtInt(r.returning) },
              ]} />
            }
          >
            <TrendLines ariaLabel="New vs returning" data={data.new_vs_returning} x="bucket" xLabel={(v) => bucketLabel(v, state.gran)} series={[{ key: "new", label: "New" }, { key: "returning", label: "Returning" }]} />
          </ChartPanel>
        </>
      )}
    </AnalyticsShell>
  );
}

export function TechnologyPage() {
  const { state, update, qs } = useReportQuery();
  const { data, loading, error } = useReport(() => reportsApi.technology(qs), qs);
  const label = useFeatureLabels();
  const donut = (rows: any[], title: string, map?: (v: string) => string) => (
    <Panel title={title} className="min-w-0 an-rise">
      <Donut size={140} ariaLabel={title} centerLabel="Visits" data={(rows ?? []).map((r) => ({ key: r.value, label: map ? map(r.value) : r.value, value: r.sessions }))} />
    </Panel>
  );
  const bars = (rows: any[], title: string, map?: (v: string) => string) => (
    <Panel title={title} className="min-w-0 an-rise">
      <BarList ariaLabel={title} rows={(rows ?? []).map((r) => ({ key: r.value, label: map ? map(r.value) : r.value, value: r.sessions, display: `${fmtInt(r.sessions)} · ${fmtPct(r.share)}` }))} />
    </Panel>
  );
  return (
    <AnalyticsShell title="Technology" subtitle="Browsers, devices, installed app vs browser tab, app versions, speed and errors." refreshing={loading && !!data}>
      <Toolbar state={state} update={update} showCompare={false} showGran={false} showSegments={false} />
      {error && <Empty>{error}</Empty>}
      {loading && !data && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <SkeletonPanel key={`d${i}`}><SkeletonDonut size={130} /></SkeletonPanel>)}
          {[0, 1, 2].map((i) => <SkeletonPanel key={`l${i}`}><SkeletonList rows={5} /></SkeletonPanel>)}
        </div>
      )}
      {data && (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {donut(data.device_type, "Device type", (v) => v.charAt(0).toUpperCase() + v.slice(1))}
            {donut(data.standalone, "Installed app or browser tab")}
            {donut(data.connection, "Connection", (v) => ({ mobile: "Mobile network", fixed: "Fixed line", hosting: "Data centre", education: "Education network", private: "Private network", unknown: "Unknown" })[v] ?? v)}
            {bars(data.browser, "Browser")}
            {bars(data.os, "Operating system")}
            {bars(data.release, "App release (page views)")}
          </div>
          <Panel title="Speed (Core Web Vitals, 75th percentile)">
            <DataTable
              rows={data.vitals}
              rowKey={(r: any) => `${r.app}|${r.metric}`}
              empty="No measurements yet."
              columns={[
                { key: "app", label: "App", render: (r: any) => <AppDot app={r.app} /> },
                { key: "m", label: "Metric", render: (r: any) => ({ LCP: "Largest content shown", INP: "Response to input", CLS: "Layout shift", TTFB: "Server response" } as any)[r.metric] ?? r.metric },
                { key: "v", label: "p75", align: "right", render: (r: any) => (r.metric === "CLS" ? r.p75 : `${fmtInt(Math.round(r.p75))} ms`) },
                {
                  key: "r",
                  label: "Rating",
                  render: (r: any) => (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.rating === "good" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : r.rating === "poor" ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"}`}>
                      {r.rating === "good" ? "Good" : r.rating === "poor" ? "Poor" : "Needs improvement"}
                    </span>
                  ),
                },
                { key: "n", label: "Samples", align: "right", render: (r: any) => fmtInt(r.samples) },
              ]}
            />
          </Panel>
          <Panel title="JavaScript errors">
            <DataTable
              rows={data.errors}
              rowKey={(r: any) => `${r.app}|${r.message}`}
              empty="No errors reported in this range."
              columns={[
                { key: "app", label: "App", render: (r: any) => <AppDot app={r.app} withLabel={false} /> },
                { key: "m", label: "Message", render: (r: any) => <span className="font-mono text-xs break-all">{r.message}</span> },
                { key: "f", label: "Where", render: (r: any) => label(r.feature) },
                { key: "c", label: "Times", align: "right", sortValue: (r: any) => r.count, render: (r: any) => fmtInt(r.count) },
                { key: "p", label: "People", align: "right", sortValue: (r: any) => r.people, render: (r: any) => fmtInt(r.people) },
                { key: "l", label: "Last", render: (r: any) => fmtDate(r.last_at, true) },
              ]}
            />
          </Panel>
        </>
      )}
    </AnalyticsShell>
  );
}

