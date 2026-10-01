import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, Download, Eye, LogOut, MessageSquare, RotateCcw, ShieldCheck, Trash2, UserX } from "lucide-react";
import { peopleApi } from "../../api/monitor";
import { useToast } from "../../contexts/ToastContext";
import { Empty, Panel, btnGhost, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { useReportQuery } from "./useReportQuery";
import { useReport } from "./useReport";
import { BarList, DataTable, fmtDate, fmtInt, fmtMsDur } from "./charts";
import { AppDot, DeviceIcon, Kpi, Segmented, StatusBadge, placeLabel, useFeatureLabels, userTypeLabel } from "./common";
import { ActivityCalendar, FixList, IpTable, ReasonDialog, Timeline } from "./PersonParts";
import { WatchDialog } from "./Watchlist";

/**
 * User 360 (plan §10.2): one person's live status, history, devices, networks and
 * sign-ins, plus the controls (§10.3). Every open is written to the access log.
 */
type Tab = "timeline" | "features" | "devices" | "network" | "security" | "watches" | "accountability";
type Ctl = null | "signout" | "suspend" | "reactivate" | "message" | "exclude" | "delete" | "watch";

export default function User360() {
  const { id: idStr = "" } = useParams();
  const id = Number(idStr);
  const { qs } = useReportQuery({ preset: "28d" });
  const { showToast } = useToast();
  const { data, loading, error, reload } = useReport(() => peopleApi.user(id, qs), `${id}|${qs}`);
  const [tab, setTab] = useState<Tab>("timeline");
  const [ctl, setCtl] = useState<Ctl>(null);
  const label = useFeatureLabels();

  if (error) return <AnalyticsShell title="Person"><Empty>{error}</Empty></AnalyticsShell>;
  if (loading && !data) return <AnalyticsShell title="Person"><Empty>Loading…</Empty></AnalyticsShell>;
  if (!data) return null;
  const p = data.profile;
  const s = data.summary;
  const can = data.can;
  const live = p.live;
  const run = async (action: "signout" | "suspend" | "reactivate" | "message" | "exclude", reason: string, values: Record<string, unknown>, done: string) => {
    await peopleApi.control(id, action, { reason, ...values });
    showToast(done, "success");
    reload();
  };

  return (
    <AnalyticsShell
      title={p.name}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {userTypeLabel(p.user_type)}
          {p.roles.filter((r: string) => r !== p.user_type).length > 0 && <span>· {p.roles.filter((r: string) => r !== p.user_type).join(", ")}</span>}
          {p.placements.length > 0 && <span>· {p.placements.join(" · ")}</span>}
          {p.status !== "ACTIVE" && <span className="px-1.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 text-xs">{p.status}</span>}
          {p.excluded && <span className="px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-xs">excluded from reports</span>}
        </span>
      }
      actions={
        <div className="flex flex-wrap gap-1.5">
          <button className={btnGhost} onClick={() => peopleApi.exportUser(id)}><Download className="w-4 h-4" aria-hidden /> Export</button>
          {can.control && (
            <>
              <button className={btnGhost} onClick={() => setCtl("watch")}><Eye className="w-4 h-4" aria-hidden /> Watch</button>
              <button className={btnGhost} onClick={() => setCtl("message")}><MessageSquare className="w-4 h-4" aria-hidden /> Message</button>
              <button className={btnGhost} onClick={() => setCtl("signout")}><LogOut className="w-4 h-4" aria-hidden /> Sign out everywhere</button>
              {p.status === "ACTIVE" ? (
                <button className={btnGhost} onClick={() => setCtl("suspend")}><UserX className="w-4 h-4" aria-hidden /> Suspend</button>
              ) : (
                <button className={btnGhost} onClick={() => setCtl("reactivate")}><RotateCcw className="w-4 h-4" aria-hidden /> Reactivate</button>
              )}
            </>
          )}
          {can.configure && (
            <>
              <button className={btnGhost} onClick={() => setCtl("exclude")}><Ban className="w-4 h-4" aria-hidden /> {p.excluded ? "Include in reports" : "Exclude from reports"}</button>
              <button className={btnGhost} onClick={() => setCtl("delete")}><Trash2 className="w-4 h-4" aria-hidden /> Delete data</button>
            </>
          )}
          <Link to={`/access-studio?user=${id}`} className={btnGhost}><ShieldCheck className="w-4 h-4" aria-hidden /> Access</Link>
        </div>
      }
    >
      <Panel title="Right now">
        {live ? (
          <ul className="space-y-1.5">
            {live.tabs.map((t: any, i: number) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <StatusBadge status={t.status} />
                <AppDot app={t.app} />
                <span className="font-medium">{label(t.feature, t.route)}</span>
                <span className="text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                  <DeviceIcon type={t.device.type} className="w-3.5 h-3.5" /> {[t.device.browser, t.device.os].filter(Boolean).join(" · ")} · {t.ip} · {placeLabel(t.geo, t.network)} · since {new Date(t.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Offline. Last seen {p.last_seen_at ? fmtDate(p.last_seen_at, true) : "never"}
            {p.last_seen_app && <> in <AppDot app={p.last_seen_app} /></>}
            {p.last_ip && <> from <Link to={`/analytics/ip/${p.last_ip}`} className="font-mono hover:underline">{p.last_ip}</Link> ({placeLabel(p.last_place)})</>}.
            {p.last_login_at && <> Last sign-in {fmtDate(p.last_login_at, true)}{p.last_login_method ? ` (${p.last_login_method.replace("_", " + ")})` : ""}.</>}
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Active days (28 d)" value={fmtInt(s.active_days)} hint={`${fmtInt(s.days)} days with any activity`} />
        <Kpi label="Visits" value={fmtInt(s.sessions)} />
        <Kpi label="Engaged time" value={fmtMsDur(s.engagement_ms)} />
        <Kpi label="Pages" value={fmtInt(s.views)} hint={`${fmtInt(s.key_events)} key actions`} />
        <Kpi label="First seen" value={<span className="text-base">{fmtDate(p.first_seen_at, false)}</span>} hint={Object.keys(p.first_seen_by_app ?? {}).join(", ")} />
      </div>

      <Panel title="Last 12 months">
        <ActivityCalendar days={s.calendar} />
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          {s.by_app.map((a: any) => (
            <span key={a.app} className="inline-flex items-center gap-1.5"><AppDot app={a.app} /> <span className="text-slate-600 dark:text-slate-300">{fmtMsDur(a.engagement_ms)} · {a.days} days</span></span>
          ))}
        </div>
      </Panel>

      <div className="overflow-x-auto">
        <Segmented
          label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "timeline", label: "Timeline" },
            { value: "features", label: "Features" },
            { value: "devices", label: "Devices" },
            { value: "network", label: "Network & location" },
            { value: "security", label: "Sign-ins" },
            { value: "watches", label: `Watches (${data.watches.filter((w: any) => w.status === "active").length})` },
            ...(can.configure ? [{ value: "accountability" as Tab, label: "Who looked" }] : []),
          ]}
        />
      </div>

      {tab === "timeline" && <TimelineTab id={id} />}
      {tab === "features" && (
        <Panel title="Most used features (28 days), against the average for their user type">
          <BarList
            ariaLabel="Most used features"
            rows={data.features.map((f: any) => ({
              key: `${f.app}|${f.feature}`,
              label: <span className="inline-flex items-center gap-2"><AppDot app={f.app} withLabel={false} />{label(f.feature)}</span>,
              value: f.views,
              display: `${fmtInt(f.views)} views`,
              hint: f.type_avg !== null ? `${userTypeLabel(p.user_type)} average: ${f.type_avg} views (${f.type_people} people)` : undefined,
            }))}
          />
        </Panel>
      )}
      {tab === "devices" && <DevicesTab id={id} />}
      {tab === "network" && <NetworkTab id={id} showFixes={can.location} />}
      {tab === "security" && <SecurityTab id={id} />}
      {tab === "watches" && (
        <Panel title="Watches on this person">
          <DataTable
            rows={data.watches}
            rowKey={(w: any) => String(w.id)}
            empty="No watches. The person is told whenever one is set."
            columns={[
              { key: "s", label: "Status", render: (w: any) => w.status },
              { key: "r", label: "Reason", render: (w: any) => w.reason },
              { key: "b", label: "Set by", render: (w: any) => w.created_by_name },
              { key: "u", label: "Until", render: (w: any) => fmtDate(w.expires_at, true) },
              { key: "a", label: "Alerts", align: "right", render: (w: any) => fmtInt(w.alerts) },
            ]}
          />
        </Panel>
      )}
      {tab === "accountability" && <AccountabilityTab id={id} />}

      <ReasonDialog open={ctl === "signout"} title={`Sign ${p.name} out everywhere`} confirmLabel="Sign out everywhere" danger
        description="Ends every session in the MIS, Task Mentor, Tendo and Tupo now. They can sign in again."
        onClose={() => setCtl(null)} onConfirm={(r, v) => run("signout", r, v, "Signed out everywhere")} />
      <ReasonDialog open={ctl === "suspend"} title={`Suspend ${p.name}`} confirmLabel="Suspend account" danger
        description="The account can no longer sign in, and every open session ends now."
        onClose={() => setCtl(null)} onConfirm={(r, v) => run("suspend", r, v, "Account suspended")} />
      <ReasonDialog open={ctl === "reactivate"} title={`Reactivate ${p.name}`} confirmLabel="Reactivate"
        description="The account can sign in again." onClose={() => setCtl(null)} onConfirm={(r, v) => run("reactivate", r, v, "Account reactivated")} />
      <ReasonDialog open={ctl === "exclude"} title={p.excluded ? "Include in reports" : "Exclude from reports"} confirmLabel="Save"
        description="Use this for test and service accounts. Their activity is still recorded, but left out of every report and of Realtime."
        onClose={() => setCtl(null)} onConfirm={(r) => run("exclude", r, { excluded: !p.excluded }, "Saved")} />
      <ReasonDialog open={ctl === "message"} title={`Message ${p.name}`} confirmLabel="Send"
        description="Arrives in their notifications, and as a push notification on devices where they turned them on."
        extra={(set, v) => (
          <>
            <label className="block"><span className="text-xs font-medium">Title</span><input className={`${inputCls} mt-1`} value={String(v.title ?? "")} onChange={(e) => set("title", e.target.value)} /></label>
            <label className="block"><span className="text-xs font-medium">Message</span><textarea className={`${inputCls} mt-1`} rows={3} value={String(v.message ?? "")} onChange={(e) => set("message", e.target.value)} required /></label>
          </>
        )}
        onClose={() => setCtl(null)} onConfirm={(r, v) => run("message", r, v, "Message sent")} />
      <ReasonDialog open={ctl === "delete"} title={`Delete ${p.name}'s activity data`} confirmLabel="Delete permanently" danger
        description="Deletes their events, visits, IP history, location fixes and daily summaries. The account itself is not touched. The access log is kept."
        onClose={() => setCtl(null)} onConfirm={async (r) => { await peopleApi.deleteUserData(id, r); showToast("Activity data deleted", "success"); reload(); }} />
      {ctl === "watch" && <WatchDialog open onClose={() => { setCtl(null); reload(); }} initialTarget={{ kind: "user", userId: id, label: p.name }} />}
    </AnalyticsShell>
  );
}

const TimelineTab: React.FC<{ id: number }> = ({ id }) => {
  const [data, setData] = useState<any>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    peopleApi.timeline(id).then(setData).catch(() => setData({ sessions: [], auth: [], next_before: null, before_sign_in: [] }));
  }, [id]);
  const loadMore = useCallback(async () => {
    if (!data?.next_before) return;
    setMore(true);
    const older = await peopleApi.timeline(id, data.next_before);
    setData((d: any) => ({ ...older, sessions: [...d.sessions, ...older.sessions], auth: [...d.auth, ...older.auth], before_sign_in: d.before_sign_in }));
    setMore(false);
  }, [data, id]);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Panel title="Timeline" className="lg:col-span-2 min-w-0">
        <Timeline data={data} onMore={loadMore} loadingMore={more} />
      </Panel>
      <Panel title="Before signing in" className="min-w-0">
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">Visits on their devices while not signed in.</p>
        {data?.before_sign_in?.length ? (
          <ul className="space-y-1.5 text-sm">
            {data.before_sign_in.map((b: any) => (
              <li key={b.session_id}>
                <Link to={`/analytics/visitors/${b.device_id}`} className="hover:underline">{fmtDate(b.started_at, true)}</Link> · {b.page_views} pages · <span className="font-mono text-xs">{b.ip}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>None.</Empty>
        )}
      </Panel>
    </div>
  );
};

const DevicesTab: React.FC<{ id: number }> = ({ id }) => {
  const { data } = useReport(() => peopleApi.devices(id), `d${id}`);
  return (
    <Panel title="Devices">
      <DataTable
        rows={data ?? []}
        rowKey={(r: any) => r.device_id}
        empty="No devices yet."
        columns={[
          { key: "d", label: "Device", render: (r: any) => <Link to={`/analytics/visitors/${r.device_id}`} className="hover:underline inline-flex items-center gap-1.5"><DeviceIcon type={r.device.type} />{[r.device.browser, r.device.os].filter(Boolean).join(" · ") || r.visitor_code}{r.pwa && <span className="text-xs px-1 rounded bg-slate-100 dark:bg-slate-800">App</span>}</Link> },
          { key: "s", label: "Visits", align: "right", render: (r: any) => fmtInt(r.sessions) },
          { key: "f", label: "First", render: (r: any) => fmtDate(r.first_seen, true) },
          { key: "l", label: "Last", render: (r: any) => fmtDate(r.last_seen, true) },
          { key: "o", label: "Also used by", render: (r: any) => (r.other_accounts.length ? r.other_accounts.map((o: any) => <Link key={o.user_id} to={`/analytics/users/${o.user_id}`} className="block hover:underline text-xs">{o.name}</Link>) : "—") },
        ]}
      />
      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-2">A device used by several accounts is usually a shared or lab computer.</p>
    </Panel>
  );
};

const NetworkTab: React.FC<{ id: number; showFixes: boolean }> = ({ id, showFixes }) => {
  const { data } = useReport(() => peopleApi.network(id), `n${id}`);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Panel title="IP addresses" className="lg:col-span-2 min-w-0">{data ? <IpTable ips={data.ips} /> : <Empty>Loading…</Empty>}</Panel>
      <Panel title="Precise location" className="min-w-0">{showFixes ? <FixList fixes={data?.fixes ?? []} /> : <Empty>Needs “See precise (browser) location fixes”.</Empty>}</Panel>
    </div>
  );
};

const SecurityTab: React.FC<{ id: number }> = ({ id }) => {
  const { data } = useReport(() => peopleApi.security(id), `s${id}`);
  return (
    <Panel title={`Sign-ins and attempts${data?.online_devices ? ` · online on ${data.online_devices} device(s) now` : ""}`}>
      <DataTable
        rows={data?.events ?? []}
        rowKey={(r: any) => `${r.at}|${r.kind}|${r.outcome}|${r.ip}`}
        empty="No sign-in activity yet."
        columns={[
          { key: "t", label: "When", render: (r: any) => fmtDate(r.at, true) },
          { key: "k", label: "What", render: (r: any) => <span className={r.outcome === "failure" ? "text-rose-700 dark:text-rose-300" : ""}>{r.kind.replace(/_/g, " ")} · {r.outcome}{r.reason ? ` (${r.reason.replace(/_/g, " ")})` : ""}{r.initiator === "admin" ? " · by admin" : ""}</span> },
          { key: "u", label: "Username tried", render: (r: any) => <span className="font-mono text-xs">{r.username_attempted ?? ""}</span> },
          { key: "f", label: "From", render: (r: any) => <span className="text-xs">{r.ip ? <Link to={`/analytics/ip/${r.ip}`} className="font-mono hover:underline">{r.ip}</Link> : "—"} {placeLabel(r.place)}{r.device_id && <> · <Link to={`/analytics/visitors/${r.device_id}`} className="hover:underline">{r.visitor_code}</Link></>}</span> },
        ]}
      />
    </Panel>
  );
};

const AccountabilityTab: React.FC<{ id: number }> = ({ id }) => {
  const { data } = useReport(() => peopleApi.accessLog(id), `al${id}`);
  return (
    <Panel title="Who looked at or acted on this person">
      <DataTable
        rows={data ?? []}
        rowKey={(r: any) => String(r.id)}
        empty="Nobody yet."
        columns={[
          { key: "t", label: "When", render: (r: any) => fmtDate(r.at, true) },
          { key: "v", label: "Who", render: (r: any) => r.viewer_name || `User ${r.viewer_id}` },
          { key: "a", label: "What", render: (r: any) => r.action.replace(/_/g, " ") },
          { key: "r", label: "Reason", render: (r: any) => r.reason ?? "" },
        ]}
      />
    </Panel>
  );
};
