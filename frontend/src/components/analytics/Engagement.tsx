import React, { useMemo, useState } from "react";
import { reportsApi } from "../../api/monitor";
import { Empty, Panel, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { BarList, ChartPanel, DataTable, SimpleBars, bucketLabel, fmtDur, fmtInt, fmtMsDur, fmtPct } from "./charts";
import { AppDot, Segmented, useFeatureLabels } from "./common";
import misCatalog from "../../activity/mis.catalog.json";

/**
 * Engagement (plan §14 page 6): which features and pages are used, how much and by how
 * many people; events; where visits start and end; key events.
 */
const moduleOf = Object.fromEntries((misCatalog as any).features.map((f: any) => [f.key, f.module]));

export default function Engagement() {
  const { state, update, qs } = useReportQuery();
  const [tab, setTab] = useState<"features" | "events" | "landing" | "key">("features");
  return (
    <AnalyticsShell title="Engagement" subtitle="Which features people use, for how long, and what they do there.">
      <Toolbar state={state} update={update} showCompare={false} />
      <Segmented
        label="View"
        value={tab}
        onChange={setTab}
        options={[
          { value: "features", label: "Features & pages" },
          { value: "events", label: "Events" },
          { value: "landing", label: "Landing & exit" },
          { value: "key", label: "Key events" },
        ]}
      />
      {tab === "features" && <Features qs={qs} />}
      {tab === "events" && <Dimension qs={qs} dim="event" title="Events" />}
      {tab === "landing" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Dimension qs={qs} dim="landing" title="Where visits start" />
          <Dimension qs={qs} dim="exit" title="Where visits end" />
        </div>
      )}
      {tab === "key" && <KeyEvents qs={qs} gran={state.gran} />}
    </AnalyticsShell>
  );
}

const Features: React.FC<{ qs: string }> = ({ qs }) => {
  const { data, loading, error } = useReport(() => reportsApi.features(qs), `f|${qs}`);
  const label = useFeatureLabels();
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r: any) => !q || `${label(r.feature)} ${r.feature}`.toLowerCase().includes(q.toLowerCase())),
    [data, q, label],
  );
  if (error) return <Empty>{error}</Empty>;
  return (
    <Panel
      title={`Features & pages${data ? ` (${fmtInt(rows.length)})` : ""}`}
      actions={<input aria-label="Filter features" className={`${inputCls} !py-1.5 w-44`} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />}
    >
      <DataTable
        rows={rows}
        rowKey={(r: any) => `${r.app}|${r.feature}`}
        empty={loading ? "Loading…" : "No page views in this range."}
        initialSort={{ key: "views", dir: "desc" }}
        onExport={() => reportsApi.csv("/engagement/features", qs, "features.csv")}
        columns={[
          {
            key: "f",
            label: "Feature",
            sortValue: (r: any) => label(r.feature),
            render: (r: any) => (
              <span className="inline-flex items-start gap-2">
                <AppDot app={r.app} withLabel={false} />
                <span>
                  {label(r.feature)}
                  {moduleOf[r.feature] && <span className="block text-xs text-slate-600 dark:text-slate-300">{moduleOf[r.feature]}</span>}
                </span>
              </span>
            ),
          },
          { key: "views", label: "Views", align: "right", sortValue: (r: any) => r.views, render: (r: any) => fmtInt(r.views) },
          { key: "people", label: "People", align: "right", sortValue: (r: any) => r.people, render: (r: any) => fmtInt(r.people) },
          { key: "vpp", label: "Views / person", align: "right", sortValue: (r: any) => r.views_per_person, render: (r: any) => r.views_per_person ?? "—" },
          { key: "eng", label: "Avg. time / person", align: "right", sortValue: (r: any) => r.avg_engagement_s, render: (r: any) => fmtDur(r.avg_engagement_s) },
          { key: "tot", label: "Total time", align: "right", sortValue: (r: any) => r.engagement_ms, render: (r: any) => fmtMsDur(r.engagement_ms) },
          { key: "reach", label: "Reach", align: "right", sortValue: (r: any) => r.reach, render: (r: any) => fmtPct(r.reach) },
          { key: "key", label: "Key events", align: "right", sortValue: (r: any) => r.key_events, render: (r: any) => fmtInt(r.key_events) },
        ]}
      />
      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2">Reach = people who opened the feature ÷ active users of that app.</p>
    </Panel>
  );
};

const Dimension: React.FC<{ qs: string; dim: string; title: string }> = ({ qs, dim, title }) => {
  const { data, loading, error } = useReport(() => reportsApi.dimension(`${qs}&dim=${dim}`), `${dim}|${qs}`);
  const label = useFeatureLabels();
  if (error) return <Empty>{error}</Empty>;
  return (
    <Panel title={title} className="min-w-0">
      {loading && !data ? (
        <Empty>Loading…</Empty>
      ) : (
        <BarList
          ariaLabel={title}
          rows={(data ?? []).map((r: any) => ({
            key: r.value,
            label: dim === "event" ? (label(r.value) !== r.value ? label(r.value) : r.value.replace(/[._]/g, " ")) : r.value,
            value: dim === "event" ? r.views : r.sessions,
            display: dim === "event" ? `${fmtInt(r.views)}` : `${fmtInt(r.sessions)} visits · ${fmtPct(r.share)}`,
          }))}
        />
      )}
    </Panel>
  );
};

const KeyEvents: React.FC<{ qs: string; gran: string }> = ({ qs, gran }) => {
  const { data, loading, error } = useReport(() => reportsApi.keyEvents(qs), `k|${qs}`);
  const label = useFeatureLabels();
  if (error) return <Empty>{error}</Empty>;
  if (loading && !data) return <Empty>Loading…</Empty>;
  if (!data?.length) return <Empty>No key events in this range. Apps mark key events (quiz submitted, register saved…) in their feature catalog.</Empty>;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {data.map((k: any) => (
        <ChartPanel
          key={`${k.app}|${k.name}`}
          title={
            <span className="inline-flex items-center gap-2">
              <AppDot app={k.app} withLabel={false} /> {label(k.name) !== k.name ? label(k.name) : k.name}
              <span className="text-xs font-normal text-slate-600 dark:text-slate-300">{fmtInt(k.count)} · in {fmtPct(k.conversion)} of visits</span>
            </span>
          }
          table={<DataTable dense rows={k.series} rowKey={(r: any) => r.bucket} columns={[{ key: "b", label: "Period", render: (r: any) => bucketLabel(r.bucket, gran) }, { key: "c", label: "Count", align: "right", render: (r: any) => fmtInt(r.count) }]} />}
        >
          <SimpleBars ariaLabel={`${k.name} over time`} height={140} data={k.series.map((s: any) => ({ x: s.bucket, y: s.count }))} xLabel={(v) => bucketLabel(v, gran)} />
        </ChartPanel>
      ))}
    </div>
  );
};
