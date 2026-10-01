import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Search } from "lucide-react";
import { reportsApi } from "../../api/monitor";
import { useAccess } from "../../hooks/useAccess";
import { Empty, Panel, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { BarList, ChartPanel, DataTable, Heatmap, Pager, TrendLines, appLabel, bucketLabel, fmtDate, fmtInt, fmtMsDur } from "./charts";
import { AppDot, Segmented, placeLabel, userTypeLabel } from "./common";

/**
 * Access & Logins (plan §14 page 3): who accessed the platform by day, week or month,
 * sign-ins over time, when people use it, failed sign-ins and app launches.
 */
export default function AccessLogins() {
  const { can } = useAccess();
  const named = can("ANALYTICS_USER_VIEW");
  const { state, update, qs } = useReportQuery();
  const series = useReport(() => reportsApi.accessSeries(qs), qs);
  const heat = useReport(() => reportsApi.heatmap(qs), qs);
  const [metric, setMetric] = useState<"users" | "logins" | "visitors">("users");

  return (
    <AnalyticsShell title="Access & logins" subtitle="Who used the platform, when, and how they signed in.">
      <Toolbar state={state} update={update} showCompare={false} />
      {series.error && <Empty>{series.error}</Empty>}

      <div className="grid lg:grid-cols-2 gap-4">
        <ChartPanel
          title={`People who accessed the platform, per ${state.gran}`}
          table={
            <DataTable
              dense
              rows={series.data?.access ?? []}
              rowKey={(r: any) => r.bucket}
              columns={[
                { key: "b", label: "Period", render: (r: any) => bucketLabel(r.bucket, state.gran) },
                { key: "a", label: "Accessed", align: "right", render: (r: any) => fmtInt(r.accessed) },
                { key: "x", label: "Active", align: "right", render: (r: any) => fmtInt(r.active) },
                { key: "v", label: "Visitors", align: "right", render: (r: any) => fmtInt(r.visitors) },
              ]}
            />
          }
        >
          <TrendLines
            ariaLabel="People who accessed the platform"
            data={series.data?.access ?? []}
            x="bucket"
            xLabel={(v) => bucketLabel(v, state.gran)}
            series={[
              { key: "accessed", label: "Accessed (signed in)" },
              { key: "active", label: "Active (engaged)" },
              { key: "visitors", label: "Public visitors" },
            ]}
          />
        </ChartPanel>
        <ChartPanel
          title="Sign-ins: successful and failed"
          table={
            <DataTable
              dense
              rows={series.data?.series ?? []}
              rowKey={(r: any) => r.bucket}
              columns={[
                { key: "b", label: "Period", render: (r: any) => bucketLabel(r.bucket, state.gran) },
                { key: "s", label: "Successful", align: "right", render: (r: any) => fmtInt(r.success) },
                { key: "f", label: "Failed", align: "right", render: (r: any) => fmtInt(r.failed) },
              ]}
            />
          }
        >
          <TrendLines
            ariaLabel="Successful and failed sign-ins"
            data={series.data?.series ?? []}
            x="bucket"
            xLabel={(v) => bucketLabel(v, state.gran)}
            series={[
              { key: "success", label: "Successful sign-ins" },
              { key: "failed", label: "Failed attempts" },
            ]}
          />
        </ChartPanel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel
          className="lg:col-span-2 min-w-0"
          title="When people use it"
          actions={
            <Segmented
              label="Measure"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "users", label: "People" },
                { value: "logins", label: "Sign-ins" },
                { value: "visitors", label: "Visitors" },
              ]}
            />
          }
        >
          {heat.data ? <Heatmap grid={heat.data} metric={metric} /> : <Empty>Loading…</Empty>}
        </Panel>
        <Panel title="App launches from the MIS" className="min-w-0">
          <BarList
            ariaLabel="App launches"
            rows={Object.entries(series.data?.launches ?? {}).map(([k, v]) => ({ key: k, label: ["tm", "tendo", "tupo"].includes(k) ? <AppDot app={k as any} /> : k, value: v as number }))}
          />
          <h3 className="text-xs font-semibold mt-4 mb-2 text-text-primary-light dark:text-text-primary-dark">Sign-in method</h3>
          <BarList
            ariaLabel="Sign-in methods"
            rows={Object.entries(series.data?.methods ?? {}).map(([k, v]) => ({ key: k, label: k === "google" ? "Google" : k === "password_otp" ? "Password + email code" : k, value: v as number }))}
          />
        </Panel>
      </div>

      {named ? (
        <>
          <AccessedUsers qs={qs} gran={state.gran} />
          <FailedSignIns qs={qs} />
        </>
      ) : (
        <Panel title="Who accessed">
          <Empty>The named list needs “Open a person's or visitor's activity, IPs and devices”.</Empty>
        </Panel>
      )}
    </AnalyticsShell>
  );
}

const AccessedUsers: React.FC<{ qs: string; gran: string }> = ({ qs }) => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("last");
  const listQs = `${qs}&page=${page}&limit=50&sort=${sort}&dir=desc${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data, loading } = useReport(() => reportsApi.accessUsers(listQs), listQs);
  return (
    <Panel
      title={`Who accessed the platform${data ? ` (${fmtInt(data.total)})` : ""}`}
      actions={
        <div className="flex items-center gap-2">
          <select aria-label="Sort by" className={`${inputCls} !w-auto !py-1.5`} value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="last">Most recent</option>
            <option value="days">Most days active</option>
            <option value="sessions">Most sessions</option>
            <option value="engagement">Most time</option>
            <option value="first">Earliest first visit</option>
          </select>
          <label className="relative">
            <span className="sr-only">Search people</span>
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
            <input className={`${inputCls} !pl-7 !py-1.5 w-40 sm:w-52`} placeholder="Name, username…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </label>
        </div>
      }
    >
      <DataTable
        rows={data?.rows ?? []}
        rowKey={(r: any) => String(r.user_id)}
        empty={loading ? "Loading…" : "Nobody accessed the platform in this range."}
        onExport={() => reportsApi.csv("/access/users", qs, "accessed-users.csv")}
        columns={[
          {
            key: "name",
            label: "Person",
            render: (r: any) => (
              <Link to={`/analytics/users/${r.user_id}`} className="hover:underline">
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-300">{userTypeLabel(r.user_type)}</span>
              </Link>
            ),
          },
          { key: "first", label: "First", render: (r: any) => fmtDate(r.first_at, true) },
          { key: "last", label: "Last", render: (r: any) => fmtDate(r.last_at, true) },
          { key: "days", label: "Days active", align: "right", render: (r: any) => fmtInt(r.days_active) },
          { key: "sessions", label: "Sessions", align: "right", render: (r: any) => (r.partial && !r.sessions ? "—" : fmtInt(r.sessions)) },
          { key: "time", label: "Engaged time", align: "right", render: (r: any) => fmtMsDur(r.engagement_ms) },
          { key: "apps", label: "Apps", render: (r: any) => <span className="flex flex-wrap gap-2">{r.apps.map((a: any) => <AppDot key={a} app={a} withLabel={false} />)}<span className="sr-only">{r.apps.map(appLabel).join(", ")}</span></span> },
          {
            key: "ip",
            label: "Last IP & place",
            render: (r: any) => (
              <span className="text-xs">
                {r.last_ip ? <Link to={`/analytics/ip/${r.last_ip}`} className="font-mono hover:underline">{r.last_ip}</Link> : "—"}
                <span className="block text-slate-600 dark:text-slate-300">{r.last_place?.city || r.last_place?.isp ? placeLabel(r.last_place as any) : ""}</span>
              </span>
            ),
          },
        ]}
      />
      {data && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      {data?.rows?.some((r: any) => r.partial) && (
        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2">Before go-live only sign-ins were recorded: those days show no sessions or time.</p>
      )}
    </Panel>
  );
};

const FailedSignIns: React.FC<{ qs: string }> = ({ qs }) => {
  const { data, loading } = useReport(() => reportsApi.failed(qs), `f-${qs}`);
  const rows = data?.rows ?? [];
  return (
    <Panel title={<span className="inline-flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" aria-hidden />Failed sign-ins</span>}>
      <DataTable
        rows={rows}
        rowKey={(r: any) => `${r.username_attempted}|${r.ip}|${r.reason}|${r.kind}`}
        empty={loading ? "Loading…" : "No failed sign-ins in this range."}
        onExport={() => reportsApi.csv("/access/failed", qs, "failed-sign-ins.csv")}
        columns={[
          {
            key: "u",
            label: "Username tried",
            render: (r: any) => (
              <span>
                <span className="font-mono">{r.username_attempted ?? "—"}</span>
                {r.user && <Link to={`/analytics/users/${r.user.id}`} className="block text-xs hover:underline">{r.user.name ?? `User ${r.user.id}`}</Link>}
              </span>
            ),
          },
          { key: "reason", label: "Why", render: (r: any) => String(r.reason ?? r.kind).replace(/_/g, " ") },
          { key: "n", label: "Attempts", align: "right", sortValue: (r: any) => r.count, render: (r: any) => fmtInt(r.count) },
          {
            key: "ip",
            label: "From",
            render: (r: any) => (
              <span className="text-xs">
                {r.ip ? <Link to={`/analytics/ip/${r.ip}`} className="font-mono hover:underline">{r.ip}</Link> : "—"}
                <span className="block text-slate-600 dark:text-slate-300">{placeLabel(r.place)}</span>
                {r.visitor_code && <Link to={`/analytics/visitors/${r.visitor_code}`} className="block hover:underline">Visitor {r.visitor_code}</Link>}
              </span>
            ),
          },
          { key: "last", label: "Last attempt", sortValue: (r: any) => r.last_at, render: (r: any) => fmtDate(r.last_at, true) },
          {
            key: "flag",
            label: "Flags",
            render: (r: any) => (
              <span className="flex flex-wrap gap-1 text-[11px]">
                {r.brute_force && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">Brute force</span>}
                {r.stuffing_ip && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{r.stuffing_ip} usernames from this IP</span>}
              </span>
            ),
          },
        ]}
      />
    </Panel>
  );
};

