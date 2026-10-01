import { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { reportsApi } from "../../api/monitor";
import { Empty, Panel, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { BarList, ChartPanel, DataTable, Pager, TrendLines, bucketLabel, fmtDate, fmtInt, fmtPct } from "./charts";
import { DeviceIcon, Kpi, Segmented, placeLabel, useFeatureLabels } from "./common";

/**
 * Visitors (plan §6, §14 page 5): public, not-signed-in traffic, identified by device,
 * IP and IP-derived place (decision D1). Bots are kept apart.
 */
export default function Visitors() {
  const { state, update, qs } = useReportQuery();
  const summary = useReport(() => reportsApi.visitorSummary(qs), qs);
  const [tab, setTab] = useState<"humans" | "bots" | "converted">("humans");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const listQs = `${qs}&tab=${tab}&page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const list = useReport(() => reportsApi.visitors(listQs), listQs);
  const label = useFeatureLabels();
  const s = summary.data;

  return (
    <AnalyticsShell title="Visitors" subtitle="People on public pages who are not signed in: where they come from and what they look at.">
      <Toolbar state={state} update={update} showCompare={false} showAudience={false} showSegments={false} />
      {summary.error && <Empty>{summary.error}</Empty>}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Visitors" value={fmtInt(s.totals.humans)} hint="distinct devices, humans" />
          <Kpi label="Bots seen" value={fmtInt(s.totals.bots)} hint="excluded from every report" />
          <Kpi label="New devices" value={fmtInt(s.conversion.new_devices)} hint="first seen in range" />
          <Kpi label="Signed in later" value={fmtPct(s.conversion.rate)} hint={`${fmtInt(s.conversion.signed_in_later)} devices`} />
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-4">
        <ChartPanel
          className="lg:col-span-2"
          title={`Visitors per ${state.gran}`}
          table={
            <DataTable dense rows={s?.series ?? []} rowKey={(r: any) => r.bucket} columns={[
              { key: "b", label: "Period", render: (r: any) => bucketLabel(r.bucket, state.gran) },
              { key: "h", label: "Humans", align: "right", render: (r: any) => fmtInt(r.humans) },
              { key: "x", label: "Bots", align: "right", render: (r: any) => fmtInt(r.bots) },
            ]} />
          }
        >
          <TrendLines ariaLabel="Visitors over time" data={s?.series ?? []} x="bucket" xLabel={(v) => bucketLabel(v, state.gran)} series={[{ key: "humans", label: "Human visitors" }, { key: "bots", label: "Bots" }]} />
        </ChartPanel>
        <Panel title="Where they arrive" className="min-w-0">
          <BarList ariaLabel="Entry pages" rows={(s?.entry_pages ?? []).map((e: any) => ({ key: e.route, label: e.route, value: e.sessions }))} />
          <h3 className="text-xs font-semibold mt-4 mb-2">Referred by</h3>
          <BarList ariaLabel="Referrers" rows={(s?.referrers ?? []).map((e: any) => ({ key: e.host, label: e.host, value: e.sessions }))} />
        </Panel>
      </div>
      <Panel
        title={`Devices${list.data ? ` (${fmtInt(list.data.total)})` : ""}`}
        actions={
          <label className="relative">
            <span className="sr-only">Search IP, place, ISP or guest name</span>
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
            <input className={`${inputCls} !pl-7 !py-1.5 w-40 sm:w-56`} placeholder="IP, place, ISP, guest name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
        }
      >
        <div className="mb-3">
          <Segmented label="Show" value={tab} onChange={(v) => { setTab(v); setPage(1); }} options={[{ value: "humans", label: "People" }, { value: "converted", label: "Signed in later" }, { value: "bots", label: "Bots" }]} />
        </div>
        {list.error ? (
          <Empty>{list.error}</Empty>
        ) : (
          <DataTable
            rows={list.data?.rows ?? []}
            rowKey={(r: any) => r.device_id}
            empty={list.loading ? "Loading…" : "No visitors in this range."}
            onExport={() => reportsApi.csv("/visitors", `${qs}&tab=${tab}`, `visitors-${tab}.csv`)}
            columns={[
              {
                key: "v",
                label: "Visitor",
                render: (r: any) => (
                  <Link to={`/analytics/visitors/${r.code}`} className="hover:underline">
                    <span className="font-medium">{r.code}</span>
                    {r.guest_names?.length > 0 && <span className="block text-xs">“{r.guest_names.join("”, “")}”</span>}
                    {r.linked_user && <span className="block text-xs text-slate-600 dark:text-slate-300">→ {r.linked_user.name ?? `User ${r.linked_user.id}`}</span>}
                  </Link>
                ),
              },
              {
                key: "where",
                label: "IP & place",
                render: (r: any) => (
                  <span className="text-xs">
                    {r.ip ? <Link to={`/analytics/ip/${r.ip}`} className="font-mono hover:underline">{r.ip}</Link> : "—"}
                    <span className="block text-slate-600 dark:text-slate-300">{placeLabel(r.place)}</span>
                  </span>
                ),
              },
              {
                key: "dev",
                label: "Device",
                render: (r: any) => (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <DeviceIcon type={r.device.type} />
                    {[r.device.browser, r.device.os].filter(Boolean).join(" · ") || "Unknown"}
                  </span>
                ),
              },
              { key: "pv", label: "Pages", align: "right", render: (r: any) => fmtInt(r.page_views) },
              { key: "fail", label: "Failed sign-ins", align: "right", render: (r: any) => (r.failed_logins ? <span className="text-rose-700 dark:text-rose-300 font-medium">{r.failed_logins}</span> : "0") },
              { key: "seen", label: "Last seen", render: (r: any) => fmtDate(r.last_seen, true) },
              { key: "bot", label: "Bot score", align: "right", render: (r: any) => `${r.bot_score}${r.bot_override !== "none" ? ` (${r.bot_override})` : ""}` },
            ]}
          />
        )}
        {list.data && <Pager page={page} total={list.data.total} limit={list.data.limit} onPage={setPage} />}
      </Panel>
      <p className="text-[11px] text-slate-600 dark:text-slate-300">Places come from the IP address and are approximate (mobile networks often show Kigali wherever the person is). {label("mis.landing")} and other public pages are tracked for everyone; precise location is only collected if enabled in Settings.</p>
    </AnalyticsShell>
  );
}
