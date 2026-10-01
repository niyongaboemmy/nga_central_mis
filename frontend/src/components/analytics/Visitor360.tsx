import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Ban, Bot, Eye, LogOut, Trash2, UserCheck } from "lucide-react";
import { peopleApi } from "../../api/monitor";
import { useToast } from "../../contexts/ToastContext";
import { Empty, Panel, btnGhost, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { useReport } from "./useReport";
import { DataTable, fmtDate, fmtInt } from "./charts";
import { DeviceIcon, Kpi, StatusBadge, placeLabel, useFeatureLabels } from "./common";
import { ReasonDialog, Timeline } from "./PersonParts";
import { WatchDialog } from "./Watchlist";

/**
 * Visitor 360 (plan §6, §10.2): a public, not-signed-in device. Decision D1: tracked by
 * device, full IP and IP-derived place. A visitor has no account to tell about a watch.
 */
type Ctl = null | "block" | "bot" | "human" | "signout" | "delete" | "watch";

export default function Visitor360() {
  const { code = "" } = useParams();
  const deviceId = code;
  const { showToast } = useToast();
  const { data, loading, error, reload } = useReport(() => peopleApi.device(deviceId), deviceId);
  const [ctl, setCtl] = useState<Ctl>(null);
  const [tl, setTl] = useState<any>(null);
  const [more, setMore] = useState(false);
  const label = useFeatureLabels();
  useEffect(() => {
    peopleApi.deviceTimeline(deviceId).then(setTl).catch(() => setTl({ sessions: [], auth: [], next_before: null }));
  }, [deviceId]);
  const loadMore = useCallback(async () => {
    if (!tl?.next_before) return;
    setMore(true);
    const older = await peopleApi.deviceTimeline(deviceId, tl.next_before);
    setTl((d: any) => ({ ...older, sessions: [...d.sessions, ...older.sessions], auth: [...d.auth, ...older.auth] }));
    setMore(false);
  }, [tl, deviceId]);

  if (error) return <AnalyticsShell title="Visitor"><Empty>{error}</Empty></AnalyticsShell>;
  if (loading && !data) return <AnalyticsShell title="Visitor"><Empty>Loading…</Empty></AnalyticsShell>;
  if (!data) return null;
  const p = data.profile;
  const can = data.can;
  const isBot = p.bot_override === "bot" || (p.bot_override !== "human" && p.bot_score >= 60);
  return (
    <AnalyticsShell
      title={`Visitor ${p.visitor_code}`}
      subtitle={
        <span>
          {[p.device.browser, p.device.os].filter(Boolean).join(" · ") || "Unknown device"} · first seen {fmtDate(p.first_seen, true)}
          {isBot && <span className="ml-2 px-1.5 rounded bg-slate-200 dark:bg-slate-700 text-xs">bot</span>}
          {p.blocked && <span className="ml-2 px-1.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 text-xs">blocked until {fmtDate(p.blocked.expires_at, true)}</span>}
        </span>
      }
      actions={
        can.control && (
          <div className="flex flex-wrap gap-1.5">
            <button className={btnGhost} onClick={() => setCtl("watch")}><Eye className="w-4 h-4" aria-hidden /> Watch</button>
            <button className={btnGhost} onClick={() => setCtl("block")}><Ban className="w-4 h-4" aria-hidden /> Block device</button>
            <button className={btnGhost} onClick={() => setCtl(isBot ? "human" : "bot")}>{isBot ? <UserCheck className="w-4 h-4" aria-hidden /> : <Bot className="w-4 h-4" aria-hidden />} {isBot ? "Not a bot" : "Mark as bot"}</button>
            {p.linked_users.length > 0 && <button className={btnGhost} onClick={() => setCtl("signout")}><LogOut className="w-4 h-4" aria-hidden /> Sign this device out</button>}
            {can.configure && <button className={btnGhost} onClick={() => setCtl("delete")}><Trash2 className="w-4 h-4" aria-hidden /> Delete data</button>}
          </div>
        )
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Now" value={p.live ? <StatusBadge status={p.live.status} /> : <span className="text-base">Offline</span>} hint={p.live?.tabs?.[0] ? label(p.live.tabs[0].feature, p.live.tabs[0].route) : `last ${fmtDate(p.last_seen, true)}`} />
        <Kpi label="Last IP" value={<span className="text-base font-mono">{p.last_ip ?? "—"}</span>} hint={placeLabel(p.place)} />
        <Kpi label="Visits / pages" value={`${fmtInt(p.sessions)} / ${fmtInt(p.page_views)}`} />
        <Kpi label="Failed sign-ins" value={fmtInt(p.failed_logins)} />
        <Kpi label="Bot score" value={p.bot_score} hint={p.bot_override !== "none" ? `set to ${p.bot_override} by an admin` : "≥ 60 counts as a bot"} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Timeline" className="lg:col-span-2 min-w-0"><Timeline data={tl} onMore={loadMore} loadingMore={more} /></Panel>
        <div className="space-y-4 min-w-0">
          <Panel title="Identity clues">
            <dl className="text-sm space-y-2">
              <div><dt className="text-xs text-slate-600 dark:text-slate-300">Signed in later as</dt><dd>{p.linked_users.length ? p.linked_users.map((u: any) => <Link key={u.user_id} to={`/analytics/users/${u.user_id}`} className="block hover:underline">{u.name}</Link>) : "Never signed in"}</dd></div>
              <div><dt className="text-xs text-slate-600 dark:text-slate-300">Names typed as a meeting guest</dt><dd>{p.guest_names.length ? p.guest_names.join(", ") : "—"}</dd></div>
              <div><dt className="text-xs text-slate-600 dark:text-slate-300">Device</dt><dd className="inline-flex items-center gap-1.5"><DeviceIcon type={p.device.type} />{[p.device.browser, p.device.os, p.device.screen].filter(Boolean).join(" · ")}{p.device.pwa && " · installed app"}</dd></div>
              <div><dt className="text-xs text-slate-600 dark:text-slate-300">Browser string</dt><dd className="font-mono text-[11px] break-all">{p.device.ua ?? "—"}</dd></div>
            </dl>
          </Panel>
          <Panel title="IP addresses used">
            <DataTable dense rows={p.ips} rowKey={(r: any) => r.ip} empty="None." columns={[
              { key: "ip", label: "IP", render: (r: any) => <Link className="font-mono hover:underline" to={`/analytics/ip/${r.ip}`}>{r.ip}</Link> },
              { key: "p", label: "Place", render: (r: any) => placeLabel(r.place) },
              { key: "l", label: "Last", render: (r: any) => fmtDate(r.last_seen, true) },
            ]} />
          </Panel>
        </div>
      </div>

      <ReasonDialog open={ctl === "block"} title="Block this device" confirmLabel="Block" danger description="Sign-in and activity from this device are refused until the block ends."
        extra={(set, v) => <label className="flex items-center gap-2 text-xs">For <input type="number" min={1} max={90} className={`${inputCls} !w-20`} value={Number(v.days ?? 7)} onChange={(e) => set("days", Number(e.target.value))} /> days</label>}
        onClose={() => setCtl(null)} onConfirm={async (r, v) => { await peopleApi.deviceControl(deviceId, "block", { reason: r, days: v.days ?? 7 }); showToast("Device blocked", "success"); reload(); }} />
      <ReasonDialog open={ctl === "bot" || ctl === "human"} title={ctl === "bot" ? "Mark as bot" : "Not a bot"} confirmLabel="Save" description={ctl === "bot" ? "Its activity is left out of reports and Realtime." : "Its activity counts as a person again."}
        onClose={() => setCtl(null)} onConfirm={async (r) => { await peopleApi.deviceControl(deviceId, "bot", { reason: r, override: ctl === "bot" ? "bot" : "human" }); showToast("Saved", "success"); reload(); }} />
      <ReasonDialog open={ctl === "signout"} title="Sign this device out" confirmLabel="Sign out" description="Best effort: the device is told to end its session the next time it checks in. Use “Sign out everywhere” on the person for a guarantee."
        onClose={() => setCtl(null)} onConfirm={async (r) => { await peopleApi.deviceControl(deviceId, "signout", { reason: r }); showToast("The device will be signed out", "success"); }} />
      <ReasonDialog open={ctl === "delete"} title="Delete this visitor's data" confirmLabel="Delete permanently" danger description="Deletes the device's anonymous visits, pages and IP history."
        onClose={() => setCtl(null)} onConfirm={async (r) => { await peopleApi.deleteDeviceData(deviceId, r); showToast("Deleted", "success"); reload(); }} />
      {ctl === "watch" && <WatchDialog open onClose={() => setCtl(null)} initialTarget={{ kind: "device", deviceId, label: `Visitor ${p.visitor_code}` }} />}
    </AnalyticsShell>
  );
}
