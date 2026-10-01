import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, KeyRound, LogIn, LogOut, ShieldAlert, Star, AppWindow, MapPin } from "lucide-react";
import Modal from "../ui/Modal";
import { useTheme } from "../../contexts/ThemeContext";
import { Empty, btnGhost, btnPrimary, inputCls } from "../access/shared";
import { AppDot, DeviceIcon, placeLabel, useFeatureLabels } from "./common";
import { DataTable, fmtDate, fmtInt, fmtMsDur } from "./charts";
import type { AppKey } from "../../api/monitor";

/**
 * Pieces shared by User 360, Visitor 360 and My activity: the session timeline (User
 * Explorer), the 12-month calendar, the IP history table, and the reason dialog every
 * control goes through.
 */
const ENTRY: Record<string, string> = { direct: "direct", sso_launch: "from another app", pwa: "installed app", push_click: "notification", referral: "link", campaign: "campaign" };

const authText = (a: any) => {
  const what =
    a.kind === "login" || a.kind === "google"
      ? a.outcome === "success" ? `Signed in (${a.method === "google" || a.kind === "google" ? "Google" : "password + code"})` : `Failed sign-in${a.reason ? `: ${String(a.reason).replace(/_/g, " ")}` : ""}`
      : a.kind === "otp"
        ? a.outcome === "failure" ? "Wrong email code" : "Password accepted, code sent"
        : a.kind === "app_launch"
          ? `Opened ${a.app && a.app !== "mis" ? a.app : a.method ?? "an app"}`
          : a.kind === "logout"
            ? a.initiator === "admin" ? "Signed out by an administrator" : "Signed out"
            : a.kind === "password_reset" ? "Password reset" : a.kind === "password_change" ? "Changed password" : a.kind === "suspend" ? "Account suspended" : a.kind === "reactivate" ? "Account reactivated" : a.kind;
  return what;
};
const AuthIcon = (a: any) => (a.outcome === "failure" ? ShieldAlert : a.kind === "logout" ? LogOut : a.kind === "app_launch" ? AppWindow : a.kind.startsWith("password") ? KeyRound : LogIn);

export const Timeline: React.FC<{ data: { sessions: any[]; auth: any[]; next_before: string | null } | null; onMore?: () => void; loadingMore?: boolean; showPlaces?: boolean }> = ({
  data,
  onMore,
  loadingMore,
  showPlaces = true,
}) => {
  const label = useFeatureLabels();
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!data) return <Empty>Loading…</Empty>;
  // Interleave sign-in activity with sessions, newest first.
  const items: { at: string; kind: "session" | "auth"; v: any }[] = [
    ...data.sessions.map((s) => ({ at: s.started_at, kind: "session" as const, v: s })),
    ...data.auth.filter((a) => !(a.kind === "otp" && a.outcome === "info")).map((a) => ({ at: a.at, kind: "auth" as const, v: a })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  if (!items.length) return <Empty>No activity recorded yet.</Empty>;
  let lastDay = "";
  return (
    <div>
      <ol className="space-y-1.5">
        {items.map((it, idx) => {
          const day = new Date(it.at).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
          const header = day !== lastDay ? ((lastDay = day), <li key={`d${idx}`} className="pt-3 pb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{day}</li>) : null;
          if (it.kind === "auth") {
            const a = it.v;
            const Icon = AuthIcon(a);
            return (
              <React.Fragment key={`a${idx}`}>
                {header}
                <li className={`flex items-start gap-2 text-sm px-2 py-1 ${a.outcome === "failure" ? "text-rose-700 dark:text-rose-300" : ""}`}>
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="tabular-nums text-xs text-slate-600 dark:text-slate-300 mr-2">{new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {authText(a)}
                    {a.username_attempted && a.outcome === "failure" && <span className="font-mono text-xs"> “{a.username_attempted}”</span>}
                    {showPlaces && a.ip && (
                      <span className="block text-xs text-slate-600 dark:text-slate-300">
                        {a.ip} · {placeLabel(a.place as any)}
                        {a.visitor_code && <> · device {a.visitor_code}</>}
                      </span>
                    )}
                  </span>
                </li>
              </React.Fragment>
            );
          }
          const s = it.v;
          const isOpen = !!open[s.session_id];
          return (
            <React.Fragment key={`s${s.session_id}`}>
              {header}
              <li className="rounded-xl border border-border-light dark:border-slate-700 bg-white/60 dark:bg-slate-900/40">
                <button className="w-full flex items-start gap-2 text-left px-3 py-2" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.session_id]: !isOpen }))}>
                  {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="tabular-nums">
                        {new Date(s.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–{new Date(s.ended_at ?? s.last_activity_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {s.app_path.map((a: AppKey, i: number) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span aria-hidden>→</span>}
                            <AppDot app={a} />
                          </React.Fragment>
                        ))}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-300">
                        {fmtInt(s.page_views)} pages · {fmtMsDur(s.engagement_ms)} engaged{s.engaged ? "" : " · not engaged"} · {ENTRY[s.entry_kind] ?? s.entry_kind}
                        {s.stitched_at && " · signed in during the visit"}
                      </span>
                    </span>
                    {showPlaces && (
                      <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        <DeviceIcon type={s.device?.type} className="w-3 h-3 inline -mt-0.5" /> {[s.device?.browser, s.device?.os].filter(Boolean).join(" · ")} · {s.ip ?? "—"} · {placeLabel(s.place as any, s.network)}
                      </span>
                    )}
                  </span>
                </button>
                {isOpen && (
                  <ol className="px-3 pb-2 ml-6 border-l border-border-light dark:border-slate-700 space-y-1">
                    {s.items.map((e: any, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-2 pl-3">
                        <span className="tabular-nums text-slate-600 dark:text-slate-300 w-14 shrink-0">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                        <AppDot app={e.app} withLabel={false} />
                        <span className="min-w-0">
                          {e.name === "page_view" ? (
                            <>Opened <span className="font-medium">{label(e.feature, e.route)}</span> <span className="text-slate-600 dark:text-slate-300">{e.route}</span></>
                          ) : (
                            <>
                              {e.key_event && <Star className="w-3 h-3 inline -mt-0.5 mr-0.5" aria-label="key event" />}
                              <span className="font-medium">{label(e.name) !== e.name ? label(e.name) : e.name.replace(/[._]/g, " ")}</span>
                              {e.params && Object.keys(e.params).length > 0 && <span className="text-slate-600 dark:text-slate-300"> {Object.entries(e.params).filter(([k]) => !["nav", "ref_route", "standalone"].includes(k)).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>}
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                    {!s.items.length && <li className="text-xs text-slate-600 dark:text-slate-300 pl-3">No detailed events kept for this visit.</li>}
                  </ol>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
      {data.next_before && onMore && (
        <div className="flex justify-center mt-3">
          <button className={btnGhost} onClick={onMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Older activity"}</button>
        </div>
      )}
    </div>
  );
};

/** 12 months of days, GitHub-style: one hue, darker = more engaged time. */
export const ActivityCalendar: React.FC<{ days: { day: string; engagement_ms: number; views: number; active: boolean }[] }> = ({ days }) => {
  const { theme } = useTheme();
  const rgb = theme === "dark" ? "57,135,229" : "42,120,214";
  const byDay = new Map(days.map((d) => [d.day, d]));
  const max = Math.max(1, ...days.map((d) => d.engagement_ms));
  const today = new Date(Date.now() + 2 * 3600_000);
  const start = new Date(today.getTime() - 364 * 86_400_000);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const weeks: string[][] = [];
  for (let d = new Date(start); d <= today; d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10);
    if ((d.getUTCDay() + 6) % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push(iso);
  }
  return (
    <div className="overflow-x-auto relative">
      <div className="flex gap-[3px]" role="img" aria-label={`Activity over the last 12 months: active on ${days.filter((d) => d.active).length} days`}>
        {weeks.map((w, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {w.map((d) => {
              const v = byDay.get(d);
              const a = v ? 0.15 + 0.85 * (v.engagement_ms / max) : 0;
              return <span key={d} title={`${d}: ${v ? `${fmtMsDur(v.engagement_ms)} engaged, ${v.views} pages` : "no activity"}`} className="block w-[10px] h-[10px] rounded-[2px]" style={{ background: v ? `rgba(${rgb},${a.toFixed(2)})` : theme === "dark" ? "#1e293b" : "#e2e8f0" }} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export const IpTable: React.FC<{ ips: any[] }> = ({ ips }) => (
  <DataTable
    rows={ips}
    rowKey={(r: any) => r.ip}
    empty="No IP addresses recorded yet."
    columns={[
      { key: "ip", label: "IP address", render: (r: any) => <Link to={`/analytics/ip/${r.ip}`} className="font-mono hover:underline">{r.ip}</Link> },
      {
        key: "p",
        label: "Place & provider",
        render: (r: any) => (
          <span className="text-xs">
            {placeLabel(r.place, r.network_label)}
            {r.new_country && <span className="ml-1 px-1 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">new country</span>}
            {r.new_isp && !r.new_country && <span className="ml-1 px-1 rounded bg-slate-100 dark:bg-slate-800">new provider</span>}
          </span>
        ),
      },
      { key: "s", label: "Shared with", align: "right", render: (r: any) => (r.shared_with ? `${r.shared_with} others` : "—") },
      { key: "f", label: "First", render: (r: any) => fmtDate(r.first_seen, true) },
      { key: "l", label: "Last", render: (r: any) => fmtDate(r.last_seen, true) },
    ]}
  />
);

export const FixList: React.FC<{ fixes: any[] }> = ({ fixes }) =>
  fixes.length ? (
    <ul className="space-y-1 text-sm">
      {fixes.slice(0, 20).map((f, i) => (
        <li key={i} className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5" aria-hidden />
          <a className="hover:underline font-mono text-xs" href={`https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lon}#map=16/${f.lat}/${f.lon}`} target="_blank" rel="noreferrer">{f.lat}, {f.lon}</a>
          <span className="text-xs text-slate-600 dark:text-slate-300">±{f.accuracy_m ?? "?"} m · {fmtDate(f.at, true)}</span>
        </li>
      ))}
    </ul>
  ) : (
    <Empty>No precise location collected (it is off unless enabled in Settings, and the browser always asks).</Empty>
  );

/** Every control asks for a reason; it lands in the access log. */
export const ReasonDialog: React.FC<{
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  extra?: (set: (k: string, v: unknown) => void, values: Record<string, unknown>) => React.ReactNode;
  onClose: () => void;
  onConfirm: (reason: string, values: Record<string, unknown>) => Promise<void>;
}> = ({ open, title, description, confirmLabel, danger, extra, onClose, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) return setError("Give a reason (at least 5 characters). It is recorded in the access log.");
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), values);
      setReason("");
      setValues({});
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "That didn't work.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="md">
      <form onSubmit={submit} className="space-y-3 text-sm">
        <div className="text-slate-700 dark:text-slate-200">{description}</div>
        {extra?.((k, v) => setValues((s) => ({ ...s, [k]: v })), values)}
        <label className="block">
          <span className="text-xs font-medium">Reason (recorded)</span>
          <textarea className={`${inputCls} mt-1`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} />
        </label>
        {error && <p className="text-rose-700 dark:text-rose-300 text-xs" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy} className={danger ? `${btnPrimary} !bg-rose-700 hover:!bg-rose-800` : btnPrimary}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
};
