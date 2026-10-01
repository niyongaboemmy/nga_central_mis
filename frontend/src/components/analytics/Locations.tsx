import { lazy, Suspense, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { reportsApi } from "../../api/monitor";
import { useAccess } from "../../hooks/useAccess";
import { Empty, Panel, inputCls, btnPrimary } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { BarList, DataTable, Donut, fmtDate, fmtInt } from "./charts";
import { SkeletonDonut, SkeletonKpis, SkeletonMap, SkeletonPanel, SkeletonTable } from "./Skeleton";
import { AppDot, DeviceIcon, Kpi, Segmented, placeLabel, userTypeLabel } from "./common";

const MapView = lazy(() => import("./MapView"));

/**
 * Locations and IP lookup (plan §7.4, decision D3: every IP is recorded).
 * Country and ISP are reliable; cities are approximate and marked "≈".
 */
const CONN: Record<string, string> = { mobile: "Mobile network", fixed: "Fixed line", hosting: "Data centre", education: "Education network", private: "Private network", unknown: "Unknown" };

export function LocationsPage() {
  const { can } = useAccess();
  const { state, update, qs } = useReportQuery();
  const { data, loading, error } = useReport(() => reportsApi.locations(qs), qs);
  const [view, setView] = useState<"cities" | "countries" | "isps">("cities");
  const navigate = useNavigate();
  const [ip, setIp] = useState("");
  return (
    <AnalyticsShell
      title="Locations"
      refreshing={loading && !!data}
      subtitle="Where people connect from, by IP address: places, internet providers and networks."
      actions={
        can("ANALYTICS_USER_VIEW") && (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (ip.trim()) navigate(`/analytics/ip/${encodeURIComponent(ip.trim())}`); }}>
            <label className="relative">
              <span className="sr-only">Look up an IP address</span>
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
              <input className={`${inputCls} !pl-7 !py-1.5 w-44`} placeholder="Look up an IP…" value={ip} onChange={(e) => setIp(e.target.value)} />
            </label>
            <button className={btnPrimary} type="submit">Look up</button>
          </form>
        )
      }
    >
      <Toolbar state={state} update={update} showCompare={false} showGran={false} />
      {error && <Empty>{error}</Empty>}
      {loading && !data && !error && (
        <>
          <div className="grid lg:grid-cols-3 gap-4">
            <SkeletonPanel className="lg:col-span-2"><SkeletonMap /></SkeletonPanel>
            <SkeletonPanel><SkeletonDonut size={130} /></SkeletonPanel>
          </div>
          <SkeletonPanel><SkeletonTable rows={6} cols={4} /></SkeletonPanel>
        </>
      )}
      {data && (
        <>
          <div className="grid lg:grid-cols-3 gap-4">
            <Panel title="Map (visits by place)" className="lg:col-span-2 min-w-0">
              <Suspense fallback={<SkeletonMap />}>
                <MapView
                  ariaLabel="Visits by place"
                  points={data.points.map((p: any) => ({ key: `${p.country_code}|${p.region}|${p.city}`, lat: p.lat, lon: p.lon, value: p.sessions, label: `≈ ${[p.city, p.country_code].filter(Boolean).join(", ")}` }))}
                />
              </Suspense>
            </Panel>
            <Panel title="Connection type" className="min-w-0">
              <Donut size={130} ariaLabel="Connection type" centerLabel="Visits" data={data.connection.map((c: any) => ({ key: c.conn_type, label: CONN[c.conn_type] ?? c.conn_type, value: c.sessions }))} />
              <h3 className="text-xs font-semibold mt-4 mb-2">Campus / labelled networks</h3>
              {data.networks.length ? (
                <BarList ariaLabel="Networks" rows={data.networks.map((n: any) => ({ key: n.label, label: n.label === "other" ? "Elsewhere" : n.label, value: n.sessions }))} />
              ) : (
                <Empty>No network ranges labelled yet (Settings).</Empty>
              )}
            </Panel>
          </div>
          <Panel
            title="Places and providers"
            actions={<Segmented label="Group by" value={view} onChange={setView} options={[{ value: "cities", label: "City" }, { value: "countries", label: "Country" }, { value: "isps", label: "Provider" }]} />}
          >
            <DataTable
              rows={data[view]}
              rowKey={(r: any) => JSON.stringify(r).slice(0, 120)}
              initialSort={{ key: "s", dir: "desc" }}
              columns={[
                view === "isps"
                  ? { key: "n", label: "Provider", render: (r: any) => <span>{r.isp ?? "Unknown"}<span className="block text-xs text-slate-600 dark:text-slate-300">{CONN[r.conn_type] ?? r.conn_type}{r.asn ? ` · AS${r.asn}` : ""}</span></span> }
                  : view === "countries"
                    ? { key: "n", label: "Country", render: (r: any) => r.country ?? r.country_code ?? "Unknown" }
                    : { key: "n", label: "Place (approx.)", render: (r: any) => `≈ ${[r.city, r.region, r.country_code].filter(Boolean).join(", ") || "Unknown"}` },
                { key: "s", label: "Visits", align: "right", sortValue: (r: any) => r.sessions, render: (r: any) => fmtInt(r.sessions) },
                { key: "v", label: "Page views", align: "right", sortValue: (r: any) => r.views, render: (r: any) => fmtInt(r.views) },
                { key: "f", label: "Failed sign-ins", align: "right", sortValue: (r: any) => r.failed_logins, render: (r: any) => fmtInt(r.failed_logins) },
              ]}
            />
          </Panel>
          {can("ANALYTICS_USER_VIEW") && (
            <Panel title="IP addresses shared by most people">
              <DataTable
                rows={data.top_ips}
                rowKey={(r: any) => r.ip}
                columns={[
                  { key: "ip", label: "IP", render: (r: any) => <Link to={`/analytics/ip/${r.ip}`} className="font-mono hover:underline">{r.ip}</Link> },
                  { key: "p", label: "Place & provider", render: (r: any) => <span className="text-xs">{placeLabel(r.place, r.network_label)}</span> },
                  { key: "u", label: "People", align: "right", sortValue: (r: any) => r.users, render: (r: any) => fmtInt(r.users) },
                  { key: "d", label: "Devices", align: "right", sortValue: (r: any) => r.devices, render: (r: any) => fmtInt(r.devices) },
                  { key: "f", label: "Failed sign-ins", align: "right", sortValue: (r: any) => r.failed_logins, render: (r: any) => fmtInt(r.failed_logins) },
                  { key: "l", label: "Last seen", render: (r: any) => fmtDate(r.last_seen, true) },
                ]}
              />
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2">An IP used by many people is usually a shared network (the school's internet line, or a mobile carrier).</p>
            </Panel>
          )}
        </>
      )}
    </AnalyticsShell>
  );
}

export function IpLookupPage() {
  const { ip = "" } = useParams();
  const { data, loading, error } = useReport(() => reportsApi.ip(ip), ip);
  return (
    <AnalyticsShell title={`IP ${ip}`} subtitle="Everyone and every device seen on this address." back={{ fallback: "/analytics/locations" }} hideTabs refreshing={loading && !!data}>
      {error && <Empty>{error}</Empty>}
      {loading && !data && !error && (
        <>
          <SkeletonKpis />
          <div className="grid lg:grid-cols-2 gap-4">
            <SkeletonPanel><SkeletonTable rows={4} cols={3} /></SkeletonPanel>
            <SkeletonPanel><SkeletonTable rows={4} cols={3} /></SkeletonPanel>
          </div>
        </>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Place (approx.)" value={<span className="text-base">{[data.geo?.city, data.geo?.country_code].filter(Boolean).join(", ") || "Unknown"}</span>} hint={data.geo?.region} />
            <Kpi label="Provider" value={<span className="text-base">{data.geo?.isp ?? "Unknown"}</span>} hint={CONN[data.geo?.conn_type] ?? ""} />
            <Kpi label="People / devices" value={`${data.users.length} / ${data.devices.length}`} hint={data.network_label ? `network: ${data.network_label}` : undefined} />
            <Kpi label="Seen" value={<span className="text-base">{fmtDate(data.last_seen, true)}</span>} hint={data.first_seen ? `first ${fmtDate(data.first_seen, true)}` : "never"} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="People" className="min-w-0">
              <DataTable
                rows={data.users}
                rowKey={(r: any) => String(r.user_id)}
                empty="No signed-in person used this IP."
                columns={[
                  { key: "n", label: "Person", render: (r: any) => <Link className="hover:underline" to={`/analytics/users/${r.user_id}`}>{r.name ?? `User ${r.user_id}`}<span className="block text-xs text-slate-600 dark:text-slate-300">{userTypeLabel(r.user_type)}</span></Link> },
                  { key: "h", label: "Requests", align: "right", sortValue: (r: any) => r.hits, render: (r: any) => fmtInt(r.hits) },
                  { key: "l", label: "Last", render: (r: any) => fmtDate(r.last_seen, true) },
                ]}
              />
            </Panel>
            <Panel title="Devices" className="min-w-0">
              <DataTable
                rows={data.devices}
                rowKey={(r: any) => r.device_id}
                empty="No devices."
                columns={[
                  { key: "v", label: "Device", render: (r: any) => <Link className="hover:underline" to={`/analytics/visitors/${r.device_id}`}>{r.visitor_code}<span className="block text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"><DeviceIcon type={r.device.type} className="w-3 h-3" />{[r.device.browser, r.device.os].filter(Boolean).join(" · ")}</span></Link> },
                  { key: "s", label: "Signed in", render: (r: any) => (r.signed_in_as ? <Link to={`/analytics/users/${r.signed_in_as}`} className="hover:underline">yes</Link> : "no") },
                  { key: "l", label: "Last", render: (r: any) => fmtDate(r.last_seen, true) },
                ]}
              />
            </Panel>
          </div>
          <Panel title="Sign-in activity from this IP">
            <DataTable
              rows={data.auth}
              rowKey={(r: any, ) => `${r.occurred_at}|${r.kind}|${r.username_attempted}`}
              empty="None."
              columns={[
                { key: "t", label: "When", render: (r: any) => fmtDate(r.occurred_at, true) },
                { key: "k", label: "What", render: (r: any) => `${r.kind.replace(/_/g, " ")} · ${r.outcome}${r.reason ? ` (${r.reason.replace(/_/g, " ")})` : ""}` },
                { key: "u", label: "Username / person", render: (r: any) => (r.user_id ? <Link to={`/analytics/users/${r.user_id}`} className="hover:underline">{r.username_attempted ?? `User ${r.user_id}`}</Link> : <span className="font-mono">{r.username_attempted ?? "—"}</span>) },
                { key: "a", label: "App", render: (r: any) => (r.app ? <AppDot app={r.app} /> : "—") },
              ]}
            />
          </Panel>
        </>
      )}
    </AnalyticsShell>
  );
}
