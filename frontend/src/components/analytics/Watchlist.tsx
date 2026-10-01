import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Eye, Plus, ShieldOff } from "lucide-react";
import { peopleApi } from "../../api/monitor";
import type { UserSearchResult } from "../../api/users";
import { useToast } from "../../contexts/ToastContext";
import Modal from "../ui/Modal";
import { Panel, UserPicker, btnGhost, btnPrimary, inputCls } from "../access/shared";
import { AnalyticsShell } from "./AnalyticsShell";
import { useReport } from "./useReport";
import { DataTable, fmtDate, fmtInt } from "./charts";
import { APP_META, Segmented, useFeatureLabels } from "./common";
import { ReasonDialog } from "./PersonParts";

/**
 * Watchlist & alerts (plan §10.4). Decision D2: whoever is watched is told, with who set
 * it, why and until when. The dialog says so before anything is created.
 */
const RULES: { type: string; label: string; needs?: "app" | "feature" | "n" | "hours" | "name" }[] = [
  { type: "comes_online", label: "Comes online" },
  { type: "opens_app", label: "Opens an app", needs: "app" },
  { type: "opens_feature", label: "Opens a feature", needs: "feature" },
  { type: "key_event", label: "Does a key action", needs: "name" },
  { type: "login_failed", label: "Fails to sign in repeatedly", needs: "n" },
  { type: "new_device", label: "Signs in from a new device" },
  { type: "new_ip", label: "Connects from a new IP address" },
  { type: "new_country", label: "Connects from a new country" },
  { type: "off_hours", label: "Is active outside school hours" },
  { type: "concurrent_sessions", label: "Is online on several devices at once", needs: "n" },
  { type: "ip_activity", label: "Anyone is active on this IP / range" },
];

export type WatchTarget = { kind: "user"; userId: number; label: string } | { kind: "device"; deviceId: string; label: string } | { kind: "ip"; cidr: string; label: string };

export const WatchDialog: React.FC<{ open: boolean; onClose: () => void; initialTarget?: WatchTarget }> = ({ open, onClose, initialTarget }) => {
  const { showToast } = useToast();
  const [kind, setKind] = useState<"user" | "device" | "ip">(initialTarget?.kind ?? "user");
  const [person, setPerson] = useState<UserSearchResult | null>(null);
  const [value, setValue] = useState(initialTarget?.kind === "ip" ? initialTarget.cidr : initialTarget?.kind === "device" ? initialTarget.deviceId : "");
  const [rules, setRules] = useState<Record<string, any>>({ comes_online: {} });
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = useFeatureLabels();

  const toggle = (t: string) => setRules((r) => (r[t] ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== t)) : { ...r, [t]: t === "login_failed" ? { n: 3, window_min: 15 } : t === "concurrent_sessions" ? { n: 2 } : {} }));
  const setRule = (t: string, k: string, v: unknown) => setRules((r) => ({ ...r, [t]: { ...r[t], [k]: v } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let target: Record<string, unknown>;
    if (initialTarget) target = initialTarget.kind === "user" ? { kind: "user", userId: initialTarget.userId } : initialTarget.kind === "device" ? { kind: "device", deviceId: initialTarget.deviceId } : { kind: "ip", cidr: initialTarget.cidr };
    else if (kind === "user") {
      if (!person) return setError("Choose a person.");
      target = { kind: "user", userId: person.user_id };
    } else if (kind === "device") target = { kind: "device", deviceId: value.trim() };
    else target = { kind: "ip", cidr: value.trim() };
    const ruleList = Object.entries(rules).map(([type, extra]) => ({ type, ...extra }));
    if (!ruleList.length) return setError("Choose at least one thing to watch for.");
    if (reason.trim().length < 5) return setError("Give a reason. The person is told what it is.");
    setBusy(true);
    try {
      await peopleApi.createWatch({ target, rules: ruleList, days, reason: reason.trim(), channels: ["in_app", "push"] });
      showToast(target.kind === "user" ? "Watch set. The person has been told." : "Watch set.", "success");
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Couldn't create the watch.");
    } finally {
      setBusy(false);
    }
  };

  const isUser = initialTarget ? initialTarget.kind === "user" : kind === "user";
  return (
    <Modal isOpen={open} onClose={onClose} title="Watch" size="lg">
      <form onSubmit={submit} className="space-y-4 text-sm">
        {initialTarget ? (
          <p>Watching <span className="font-medium">{initialTarget.label}</span></p>
        ) : (
          <div className="space-y-2">
            <Segmented label="Watch" value={kind} onChange={setKind} options={[{ value: "user", label: "A person" }, { value: "device", label: "A visitor device" }, { value: "ip", label: "An IP or range" }]} />
            {kind === "user" ? (
              <UserPicker value={person} onChange={setPerson} />
            ) : (
              <input className={inputCls} placeholder={kind === "ip" ? "e.g. 41.186.10.20 or 41.186.0.0/16" : "Device id (from Visitors)"} value={value} onChange={(e) => setValue(e.target.value)} />
            )}
          </div>
        )}
        <fieldset>
          <legend className="text-xs font-medium mb-1.5">Tell me when they…</legend>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {RULES.filter((r) => (r.type === "ip_activity" ? (initialTarget?.kind ?? kind) === "ip" : true)).map((r) => (
              <li key={r.type} className="rounded-lg border border-border-light dark:border-slate-700 px-2 py-1.5">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={!!rules[r.type]} onChange={() => toggle(r.type)} />
                  {r.label}
                </label>
                {rules[r.type] && r.needs === "app" && (
                  <select aria-label="App" className={`${inputCls} mt-1 !py-1`} value={rules[r.type].app ?? ""} onChange={(e) => setRule(r.type, "app", e.target.value || undefined)}>
                    <option value="">Any app</option>
                    {Object.entries(APP_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                  </select>
                )}
                {rules[r.type] && r.needs === "feature" && (
                  <input aria-label="Feature key" className={`${inputCls} mt-1 !py-1`} placeholder="Feature key, e.g. mis.academics" value={rules[r.type].feature ?? ""} onChange={(e) => setRule(r.type, "feature", e.target.value)} />
                )}
                {rules[r.type] && r.needs === "name" && (
                  <input aria-label="Key action" className={`${inputCls} mt-1 !py-1`} placeholder="Any, or e.g. tm.quiz.submit" value={rules[r.type].name ?? ""} onChange={(e) => setRule(r.type, "name", e.target.value || undefined)} />
                )}
                {rules[r.type] && r.needs === "n" && (
                  <label className="flex items-center gap-1 mt-1 text-xs">
                    at least
                    <input type="number" min={1} max={100} className={`${inputCls} !w-16 !py-1`} value={rules[r.type].n ?? 2} onChange={(e) => setRule(r.type, "n", Number(e.target.value))} />
                    {r.type === "login_failed" ? "times in 15 min" : "devices"}
                  </label>
                )}
                {rules[r.type]?.feature && <span className="block text-[11px] text-slate-600 dark:text-slate-300">{label(rules[r.type].feature)}</span>}
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-xs">For
            <input type="number" min={1} max={90} className={`${inputCls} !w-20 !py-1`} value={days} onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} /> days (max 90)
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium">Reason</span>
          <textarea className={`${inputCls} mt-1`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} />
        </label>
        {isUser && (
          <p className="text-xs rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 px-3 py-2">
            The person will be notified that you are monitoring their activity, with your name, this reason and the end date. They can see the watch in My activity.
          </p>
        )}
        {error && <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={busy}>{busy ? "Saving…" : "Start watching"}</button>
        </div>
      </form>
    </Modal>
  );
};

export default function Watchlist() {
  const [tab, setTab] = useState<"watches" | "alerts" | "blocks">("alerts");
  const [creating, setCreating] = useState(false);
  const watches = useReport(() => peopleApi.watches(), `w${creating}`);
  const alerts = useReport(() => peopleApi.alerts(), "alerts");
  const blocks = useReport(() => peopleApi.blocks(), "blocks");
  const { showToast } = useToast();
  const [ending, setEnding] = useState<any>(null);
  const [blocking, setBlocking] = useState(false);
  const unacked = (alerts.data ?? []).filter((a: any) => !a.ack_at).length;
  return (
    <AnalyticsShell title="Watchlist" subtitle="Alerts about people, devices and networks you chose to watch, and platform security alerts." actions={<button className={btnPrimary} onClick={() => setCreating(true)}><Plus className="w-4 h-4" aria-hidden /> New watch</button>}>
      <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: "alerts", label: `Alerts${unacked ? ` (${unacked} new)` : ""}` }, { value: "watches", label: "Watches" }, { value: "blocks", label: "Blocks" }]} />
      {tab === "alerts" && (
        <Panel title={<span className="inline-flex items-center gap-1.5"><Bell className="w-4 h-4" aria-hidden />Alerts</span>}>
          <DataTable
            rows={alerts.data ?? []}
            rowKey={(a: any) => String(a.id)}
            empty={alerts.loading ? "Loading…" : "No alerts."}
            columns={[
              { key: "t", label: "When", render: (a: any) => fmtDate(a.fired_at, true) },
              { key: "s", label: "", render: (a: any) => <span className={`text-[11px] px-1.5 py-0.5 rounded ${a.severity === "critical" ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" : a.severity === "warning" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" : "bg-slate-100 dark:bg-slate-800"}`}>{a.severity}</span> },
              { key: "w", label: "What", render: (a: any) => <span className={a.ack_at ? "" : "font-medium"}>{a.title}</span> },
              {
                key: "o",
                label: "Open",
                render: (a: any) =>
                  a.target_user_id ? <Link className="hover:underline" to={`/analytics/users/${a.target_user_id}`}>{a.target_name || "Person"}</Link> : a.target_device_id ? <Link className="hover:underline" to={`/analytics/visitors/${a.target_device_id}`}>{a.target_visitor_code}</Link> : a.ip ? <Link className="font-mono hover:underline" to={`/analytics/ip/${a.ip}`}>{a.ip}</Link> : "—",
              },
              { key: "k", label: "", render: (a: any) => (a.ack_at ? <span className="text-xs text-slate-600 dark:text-slate-300">Seen by {a.ack_by_name}</span> : <button className="inline-flex items-center gap-1 text-xs hover:underline" onClick={async () => { await peopleApi.ackAlert(a.id); alerts.reload(); }}><Check className="w-3.5 h-3.5" aria-hidden /> Mark seen</button>) },
            ]}
          />
        </Panel>
      )}
      {tab === "watches" && (
        <Panel title={<span className="inline-flex items-center gap-1.5"><Eye className="w-4 h-4" aria-hidden />Watches</span>}>
          <DataTable
            rows={watches.data ?? []}
            rowKey={(w: any) => String(w.id)}
            empty="No watches yet."
            columns={[
              {
                key: "t",
                label: "Watching",
                render: (w: any) =>
                  w.target_kind === "user" ? <Link className="hover:underline" to={`/analytics/users/${w.target_user_id}`}>{w.target_name}</Link> : w.target_kind === "device" ? <Link className="hover:underline" to={`/analytics/visitors/${w.target_device_id}`}>Visitor {w.target_visitor_code}</Link> : <span className="font-mono">{w.target_cidr}</span>,
              },
              { key: "r", label: "For", render: (w: any) => w.rules.map((r: any) => RULES.find((x) => x.type === r.type)?.label ?? r.type).join(", ") },
              { key: "why", label: "Reason", render: (w: any) => w.reason },
              { key: "b", label: "Set by", render: (w: any) => w.created_by_name },
              { key: "u", label: "Until", render: (w: any) => fmtDate(w.expires_at, true) },
              { key: "n", label: "Told", render: (w: any) => (w.target_kind === "user" ? (w.target_notified_at ? "Yes" : "Pending") : "n/a") },
              { key: "a", label: "Alerts", align: "right", render: (w: any) => fmtInt(w.alerts) },
              { key: "s", label: "", render: (w: any) => (w.status === "active" ? <button className="text-xs hover:underline" onClick={() => setEnding(w)}>End</button> : <span className="text-xs text-slate-600 dark:text-slate-300">{w.status}</span>) },
            ]}
          />
        </Panel>
      )}
      {tab === "blocks" && (
        <Panel title={<span className="inline-flex items-center gap-1.5"><ShieldOff className="w-4 h-4" aria-hidden />Blocked devices and networks</span>} actions={<button className={btnGhost} onClick={() => setBlocking(true)}>Block an IP or range</button>}>
          <DataTable
            rows={blocks.data ?? []}
            rowKey={(b: any) => String(b.id)}
            empty="Nothing is blocked."
            columns={[
              { key: "v", label: "Blocked", render: (b: any) => (b.kind === "device" ? <Link className="hover:underline" to={`/analytics/visitors/${b.value}`}>Device</Link> : <span className="font-mono">{b.value}</span>) },
              { key: "r", label: "Reason", render: (b: any) => b.reason },
              { key: "by", label: "By", render: (b: any) => b.created_by_name },
              { key: "u", label: "Until", render: (b: any) => fmtDate(b.expires_at, true) },
              { key: "x", label: "", render: (b: any) => (!b.revoked_at && new Date(b.expires_at) > new Date() ? <button className="text-xs hover:underline" onClick={async () => { await peopleApi.removeBlock(b.id); blocks.reload(); showToast("Unblocked", "success"); }}>Unblock</button> : <span className="text-xs text-slate-600 dark:text-slate-300">ended</span>) },
            ]}
          />
        </Panel>
      )}
      {creating && <WatchDialog open onClose={() => { setCreating(false); watches.reload(); }} />}
      <ReasonDialog open={!!ending} title="End this watch" confirmLabel="End watch" description="The person (if it is a person) is told the monitoring has ended." onClose={() => setEnding(null)}
        onConfirm={async (r) => { await peopleApi.endWatch(ending.id, r); watches.reload(); showToast("Watch ended", "success"); }} />
      <ReasonDialog open={blocking} title="Block an IP or range" confirmLabel="Block" danger
        description="Sign-in and anonymous activity from it are refused until the block ends."
        extra={(set, v) => (
          <div className="flex gap-2">
            <input className={inputCls} placeholder="41.186.10.20 or 41.186.0.0/16" value={String(v.value ?? "")} onChange={(e) => set("value", e.target.value)} />
            <input type="number" min={1} max={90} aria-label="Days" className={`${inputCls} !w-24`} value={Number(v.days ?? 7)} onChange={(e) => set("days", Number(e.target.value))} />
          </div>
        )}
        onClose={() => setBlocking(false)}
        onConfirm={async (r, v) => { await peopleApi.addBlock({ kind: String(v.value ?? "").includes("/") ? "cidr" : "ip", value: v.value, days: v.days ?? 7, reason: r }); blocks.reload(); showToast("Blocked", "success"); }} />
    </AnalyticsShell>
  );
}

