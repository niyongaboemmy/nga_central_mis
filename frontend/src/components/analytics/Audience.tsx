import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { reportsApi } from "../../api/monitor";
import { useAccess } from "../../hooks/useAccess";
import { Empty, Panel, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { Toolbar } from "./Toolbar";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { BarList, DataTable, Pager, fmtDate, fmtInt, fmtMsDur } from "./charts";
import { AppDot, Segmented, placeLabel, userTypeLabel } from "./common";

/**
 * Audience (plan §14 page 4): the whole roster with usage, and the lists GA can't make
 * because it doesn't know who should be there — dormant people and people who never signed in.
 */
const FILTERS = [
  { value: "all", label: "Everyone" },
  { value: "dormant", label: "Dormant" },
  { value: "never", label: "Never signed in" },
  { value: "power", label: "Power users" },
  { value: "new", label: "New" },
  { value: "new_country", label: "New country (30 d)" },
] as const;

export default function Audience() {
  const { can } = useAccess();
  const named = can("ANALYTICS_USER_VIEW");
  const { state, update, qs } = useReportQuery();
  const [by, setBy] = useState<"program" | "grade" | "class_group" | "role">("program");
  const adoption = useReport(() => reportsApi.adoption(`${qs}&by=${by}`), `${qs}|${by}`);

  return (
    <AnalyticsShell title="Audience" subtitle="Everyone with an account: who uses the platform, who stopped, and who never started.">
      <Toolbar state={state} update={update} showCompare={false} showGran={false} showAudience={false} />
      <Panel
        title="Adoption"
        actions={
          <Segmented
            label="Group by"
            value={by}
            onChange={setBy}
            options={[
              { value: "program", label: "Programme" },
              { value: "grade", label: "Grade" },
              { value: "class_group", label: "Class" },
              { value: "role", label: "Role" },
            ]}
          />
        }
      >
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">Active people ÷ everyone placed there (students, class and subject teachers, programme leads) in the current academic year.</p>
        {adoption.error ? (
          <Empty>{adoption.error}</Empty>
        ) : (
          <BarList
            ariaLabel="Adoption"
            max={100}
            rows={(adoption.data ?? []).map((r: any) => ({
              key: String(r.id),
              label: r.name,
              value: r.adoption ?? 0,
              display: r.adoption === null ? "<5" : `${r.adoption}%`,
              hint: r.active === null ? `${fmtInt(r.eligible)} people · too few to show` : `${fmtInt(r.active)} of ${fmtInt(r.eligible)} active`,
            }))}
          />
        )}
      </Panel>
      {named ? <People qs={qs} /> : <Panel title="People"><Empty>The named list needs per-person access.</Empty></Panel>}
    </AnalyticsShell>
  );
}

const People: React.FC<{ qs: string }> = ({ qs }) => {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const listQs = `${qs}&filter=${filter}&page=${page}&limit=50${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const { data, loading } = useReport(() => reportsApi.audience(listQs), listQs);
  return (
    <Panel
      title={`People${data ? ` (${fmtInt(data.total)})` : ""}`}
      actions={
        <label className="relative">
          <span className="sr-only">Search people</span>
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
          <input className={`${inputCls} !pl-7 !py-1.5 w-40 sm:w-52`} placeholder="Name, username…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
      }
    >
      <div className="mb-3 overflow-x-auto">
        <Segmented label="List" value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
      </div>
      {filter === "dormant" && data && <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">Active before, but nothing for {data.dormant_days} days or more.</p>}
      <DataTable
        rows={data?.rows ?? []}
        rowKey={(r: any) => String(r.user_id)}
        empty={loading ? "Loading…" : "Nobody matches."}
        onExport={() => reportsApi.csv("/audience", `${qs}&filter=${filter}`, `audience-${filter}.csv`)}
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
          {
            key: "last",
            label: "Last seen",
            render: (r: any) => (
              <span>
                {r.last_seen_at ? fmtDate(r.last_seen_at, true) : r.last_login_at ? fmtDate(r.last_login_at, true) : "Never"}
                {r.last_seen_app && <span className="block"><AppDot app={r.last_seen_app} /></span>}
              </span>
            ),
          },
          { key: "days", label: "Active days", align: "right", render: (r: any) => fmtInt(r.days_active) },
          { key: "sessions", label: "Sessions", align: "right", render: (r: any) => fmtInt(r.sessions) },
          { key: "time", label: "Engaged time", align: "right", render: (r: any) => fmtMsDur(r.engagement_ms) },
          {
            key: "where",
            label: "Last IP & place",
            render: (r: any) =>
              r.last_ip ? (
                <span className="text-xs">
                  <Link to={`/analytics/ip/${r.last_ip}`} className="font-mono hover:underline">{r.last_ip}</Link>
                  <span className="block text-slate-600 dark:text-slate-300">{placeLabel(r.last_place)}</span>
                </span>
              ) : (
                "—"
              ),
          },
        ]}
      />
      {data && <Pager page={page} total={data.total} limit={data.limit} onPage={setPage} />}
    </Panel>
  );
};
