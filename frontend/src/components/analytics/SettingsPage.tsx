import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Save } from "lucide-react";
import { monitorApi, peopleApi } from "../../api/monitor";
import { useToast } from "../../contexts/ToastContext";
import { Empty, Panel, btnGhost, btnPrimary, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { useReport } from "./useReport";
import { DataTable, fmtDate, fmtInt } from "./charts";
import { APPS, AppDot, Segmented } from "./common";

/**
 * Settings (plan §14 page 15, ANALYTICS_CONFIGURE): thresholds, retention, network labels,
 * precise-location policy (with a recorded reason), collection switch, ingest and
 * catalog health, and the accountability log.
 */
const NUM: { key: string; label: string; hint: string; min: number; max: number }[] = [
  { key: "session_timeout_min", label: "Visit ends after (minutes idle)", hint: "GA4 default 30", min: 5, max: 475 },
  { key: "engaged_seconds", label: "Engaged after (seconds)", hint: "GA4 default 10", min: 10, max: 60 },
  { key: "idle_after_s", label: "Idle after (seconds without input)", hint: "", min: 30, max: 1800 },
  { key: "offline_after_s", label: "Offline after (seconds without heartbeat)", hint: "", min: 45, max: 600 },
  { key: "background_ttl_s", label: "Hidden tab counts as present for (seconds)", hint: "", min: 60, max: 3600 },
  { key: "raw_retention_months", label: "Keep detailed events (months)", hint: "max 13", min: 1, max: 13 },
  { key: "session_retention_months", label: "Keep visits, IPs and locations (months)", hint: "max 25", min: 1, max: 25 },
  { key: "dormant_days", label: "Dormant after (days)", hint: "", min: 1, max: 365 },
  { key: "bot_threshold", label: "Bot score threshold", hint: "0–100", min: 10, max: 100 },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<"settings" | "health" | "log">("settings");
  return (
    <AnalyticsShell title="Settings" subtitle="How activity is measured and kept, collection health, and who looked at what.">
      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: "settings", label: "Settings" }, { value: "health", label: "Health" }, { value: "log", label: "Access log" }]} />
      {tab === "settings" && <SettingsForm />}
      {tab === "health" && <Health />}
      {tab === "log" && <AccessLog />}
    </AnalyticsShell>
  );
}

const SettingsForm = () => {
  const { showToast } = useToast();
  const { data, reload } = useReport(() => monitorApi.settings(), "settings");
  const [form, setForm] = useState<any>(null);
  const [cidrs, setCidrs] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!data) return;
    setForm(data.settings);
    setCidrs((data.settings.campus_cidrs ?? []).map((c: any) => (typeof c === "string" ? c : `${c.cidr}${c.label && c.label !== "campus" ? ` ${c.label}` : ""}`)).join("\n"));
  }, [data]);
  if (!form) return <Empty>Loading…</Empty>;
  const save = async () => {
    setSaving(true);
    try {
      const campus_cidrs = cidrs.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
        const [cidr, ...rest] = l.split(/\s+/);
        return { cidr, label: rest.join(" ") || "campus" };
      });
      await monitorApi.saveSettings({ ...Object.fromEntries(NUM.map((n) => [n.key, form[n.key]])), collect_enabled: form.collect_enabled, precise_location: form.precise_location, campus_cidrs, school_hours: form.school_hours }, reason || undefined);
      showToast("Settings saved", "success");
      setReason("");
      reload();
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel title="Measurement" className="min-w-0">
        <div className="grid sm:grid-cols-2 gap-3">
          {NUM.map((n) => (
            <label key={n.key} className="block text-sm">
              <span className="text-xs font-medium">{n.label}</span>
              <input type="number" min={n.min} max={n.max} className={`${inputCls} mt-1`} value={form[n.key]} onChange={(e) => setForm({ ...form, [n.key]: Number(e.target.value) })} />
              {n.hint && <span className="text-[11px] text-slate-600 dark:text-slate-300">{n.hint}</span>}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 mt-4 text-sm">
          <input type="checkbox" checked={form.collect_enabled} onChange={(e) => setForm({ ...form, collect_enabled: e.target.checked })} />
          Collect activity (turning this off stops every app within 10 minutes)
        </label>
      </Panel>
      <Panel title="Networks, hours and location" className="min-w-0">
        <label className="block text-sm">
          <span className="text-xs font-medium">Campus / named networks (one per line: IP or range, then an optional name)</span>
          <textarea className={`${inputCls} mt-1 font-mono text-xs`} rows={4} placeholder={"196.12.150.0/24 campus\n41.186.10.20 staff room"} value={cidrs} onChange={(e) => setCidrs(e.target.value)} />
          <span className="text-[11px] text-slate-600 dark:text-slate-300">Labels only: every IP is recorded either way.</span>
        </label>
        <div className="flex flex-wrap gap-3 mt-3 text-sm">
          <label className="block"><span className="text-xs font-medium">School day starts</span><input type="time" className={`${inputCls} mt-1`} value={form.school_hours.from} onChange={(e) => setForm({ ...form, school_hours: { ...form.school_hours, from: e.target.value } })} /></label>
          <label className="block"><span className="text-xs font-medium">ends</span><input type="time" className={`${inputCls} mt-1`} value={form.school_hours.to} onChange={(e) => setForm({ ...form, school_hours: { ...form.school_hours, to: e.target.value } })} /></label>
        </div>
        <label className="block mt-3 text-sm">
          <span className="text-xs font-medium">Precise (browser) location</span>
          <select className={`${inputCls} mt-1`} value={form.precise_location} onChange={(e) => setForm({ ...form, precise_location: e.target.value })}>
            <option value="off">Off (recommended)</option>
            <option value="staff">Staff only</option>
            <option value="known_users">Everyone signed in</option>
            <option value="everyone">Everyone, including public visitors</option>
          </select>
          <span className="text-[11px] text-slate-600 dark:text-slate-300">Browsers always ask the person first. Turning this on needs a reason and must be in the privacy notice.</span>
        </label>
        <label className="block mt-3 text-sm">
          <span className="text-xs font-medium">Reason for this change (recorded)</span>
          <input className={`${inputCls} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="flex justify-end mt-4"><button className={btnPrimary} onClick={save} disabled={saving}><Save className="w-4 h-4" aria-hidden /> {saving ? "Saving…" : "Save settings"}</button></div>
      </Panel>
    </div>
  );
};

const Health = () => {
  const { data, reload } = useReport(() => monitorApi.ingestHealth(), "health");
  const cat = useReport(() => monitorApi.catalogHealth(), "cat");
  if (!data) return <Empty>Loading…</Empty>;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {APPS.map((a) => {
          const series: number[] = data.events_per_minute[a] ?? [];
          const last = data.last_event_at[a];
          const recent = series.slice(-10).reduce((x, y) => x + y, 0);
          return (
            <Panel key={a} title={<AppDot app={a} />}>
              <p className="text-sm"><span className="text-2xl font-semibold tabular-nums">{fmtInt(recent)}</span> events in 10 min</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">Last event {last ? fmtDate(last, true) : "never (since restart)"} · {fmtInt(data.catalog[a] ?? 0)} catalogued features</p>
            </Panel>
          );
        })}
      </div>
      <Panel title="Collector" actions={<button className={btnGhost} onClick={reload}>Refresh</button>}>
        <dl className="grid sm:grid-cols-3 gap-3 text-sm">
          <div><dt className="text-xs text-slate-600 dark:text-slate-300">Written since restart</dt><dd className="tabular-nums">{fmtInt(data.writer.flushed)}</dd></div>
          <div><dt className="text-xs text-slate-600 dark:text-slate-300">Waiting to be written</dt><dd className="tabular-nums">{fmtInt(data.buffer.events)} events</dd></div>
          <div><dt className="text-xs text-slate-600 dark:text-slate-300">Last write</dt><dd>{data.writer.lastFlushAt ? `${fmtDate(data.writer.lastFlushAt, true)} (${data.writer.lastFlushMs} ms)` : "—"}</dd></div>
          <div><dt className="text-xs text-slate-600 dark:text-slate-300">Dropped / write failures</dt><dd className="tabular-nums">{fmtInt(data.writer.dropped)} / {fmtInt(data.writer.failures)}</dd></div>
          <div><dt className="text-xs text-slate-600 dark:text-slate-300">Rejected / duplicates / blocked</dt><dd className="tabular-nums">{fmtInt(data.rejected)} / {fmtInt(data.duplicates)} / {fmtInt(data.blocked)}</dd></div>
          <div><dt className="text-xs text-slate-600 dark:text-slate-300">Open visits · live consoles</dt><dd className="tabular-nums">{fmtInt(data.open_sessions)} · {fmtInt(data.live_streams)}</dd></div>
          <div className="sm:col-span-3"><dt className="text-xs text-slate-600 dark:text-slate-300">IP location database</dt><dd>{data.geoip.provider ? `${data.geoip.provider}, updated ${fmtDate(data.geoip.updated_at, true)} (${data.geoip.age_days} days old)` : `Not installed in ${data.geoip.dir}: places and providers will show as unknown. Run scripts/geoip-update.sh.`}</dd></div>
          {data.writer.lastError && <div className="sm:col-span-3 text-rose-700 dark:text-rose-300 text-xs">Last error: {data.writer.lastError}</div>}
        </dl>
      </Panel>
      <Panel title="Pages without a feature name (last 7 days)">
        <DataTable rows={cat.data ?? []} rowKey={(r: any) => `${r.app}|${r.route}`} empty="Every page seen this week has a name." columns={[
          { key: "a", label: "App", render: (r: any) => <AppDot app={(["mis", "tm", "tendo", "tupo"] as const)[r.app - 1]} /> },
          { key: "r", label: "Route", render: (r: any) => <span className="font-mono text-xs">{r.route}</span> },
          { key: "v", label: "Views", align: "right", render: (r: any) => fmtInt(r.views) },
          { key: "l", label: "Last", render: (r: any) => fmtDate(r.last_seen, true) },
        ]} />
      </Panel>
    </div>
  );
};

const AccessLog = () => {
  const [action, setAction] = useState("");
  const { data, loading } = useReport(() => peopleApi.accessLog2(action ? `action=${action}` : ""), `log${action}`);
  return (
    <Panel title="Who looked at whom" actions={
      <select aria-label="Action" className={`${inputCls} !w-auto !py-1.5`} value={action} onChange={(e) => setAction(e.target.value)}>
        <option value="">All actions</option>
        {["view_user", "view_timeline", "view_device", "ip_lookup", "export", "export_user", "signout_everywhere", "suspend", "reactivate", "message", "watch_create", "watch_revoke", "block", "delete_user_data", "settings_update"].map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
      </select>
    }>
      <DataTable
        rows={data ?? []}
        rowKey={(r: any) => String(r.id)}
        empty={loading ? "Loading…" : "Nothing yet."}
        columns={[
          { key: "t", label: "When", render: (r: any) => fmtDate(r.at, true) },
          { key: "v", label: "Who", render: (r: any) => r.viewer_name || `User ${r.viewer_id}` },
          { key: "a", label: "Action", render: (r: any) => r.action.replace(/_/g, " ") },
          { key: "on", label: "On", render: (r: any) => (r.target_user_id ? <Link className="hover:underline" to={`/analytics/users/${r.target_user_id}`}>{r.target_name || `User ${r.target_user_id}`}</Link> : r.target_device_id ? <Link className="hover:underline" to={`/analytics/visitors/${r.target_device_id}`}>Device</Link> : r.target_ip ? <span className="font-mono">{r.target_ip}</span> : "—") },
          { key: "r", label: "Reason", render: (r: any) => r.reason ?? "" },
          { key: "ip", label: "From", render: (r: any) => <span className="font-mono text-xs">{r.viewer_ip ?? ""}</span> },
        ]}
      />
    </Panel>
  );
};
