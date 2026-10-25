import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  KeyRound,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { peopleApi } from "../../api/monitor";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useUser } from "../../contexts/UserContext";
import { useReport } from "./useReport";
import { DataTable, fmtDate, fmtMsDur } from "./charts";
import { AppDot, DeviceIcon, placeLabel } from "./common";
import { IpTable } from "./PersonParts";
import { Skel } from "./Skeleton";

/**
 * My activity (plan §10.5, §13 transparency): what the platform records about me, from
 * where and on which devices, sign-in attempts on my account, and (decision D2) whether
 * anyone is monitoring me right now, who, why and until when.
 *
 * Written for someone who has never seen an IP address: it answers "is my account
 * fine?" first, then lists sign-ins, devices and visits as sentences. The raw log and
 * the network table stay available under "Technical details".
 */

type Security = { at: string; kind: string; outcome: string; initiator: string | null; method: string | null; ip: string | null; place: any };
type Session = { session_id: number; started_at: string; app_path: string[]; page_views: number; engagement_ms: number; ip: string; place: any; network: string | null; device: { browser: string | null; os: string | null; type: string | null } | null };

const DAY_MS = 864e5;
const SIGN_INS_SHOWN = 8;
const VISITS_SHOWN = 6;

const KIND_LABEL: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  otp: "Sign-in code sent",
  app_launch: "Opened an app",
  notice_ack: "Read the activity notice",
  password_change: "Password changed",
  password_reset: "Password reset",
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const deviceName = (d: Session["device"]) =>
  d && (d.browser || d.os) ? [d.browser, d.os].filter(Boolean).join(" on ") : "An unknown browser";

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** "Today", "Yesterday", or "Wed 7 Oct". */
const dayOf = (iso: string, now = new Date()) => {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

const whenOf = (iso: string) => `${dayOf(iso)} at ${timeOf(iso)}`;

/** For mid-sentence use: "today at 1:44 PM", "on Wed 7 Oct at 9:10 AM". */
const whenInSentence = (iso: string) => {
  const day = dayOf(iso);
  return `${day === "Today" || day === "Yesterday" ? day.toLowerCase() : `on ${day}`} at ${timeOf(iso)}`;
};

/** Groups rows (already newest first) under day headings, keeping order. */
function byDay<T>(rows: T[], at: (r: T) => string): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const r of rows) {
    const day = dayOf(at(r));
    if (out[out.length - 1]?.day === day) out[out.length - 1].rows.push(r);
    else out.push({ day, rows: [r] });
  }
  return out;
}

const Card: React.FC<{ title: string; description?: string; className?: string; children: React.ReactNode }> = ({ title, description, className = "", children }) => (
  <section className={`rounded-2xl border border-gray-200/80 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 ${className}`}>
    <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
    {description && <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
);

const ShowMore: React.FC<{ shown: number; total: number; expanded: boolean; onToggle: () => void; noun: string }> = ({ shown, total, expanded, onToggle, noun }) =>
  total > shown ? (
    <button type="button" onClick={onToggle} className="mt-3 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
      {expanded ? "Show fewer" : `Show all ${total} ${noun}`}
    </button>
  ) : null;

const Check: React.FC<{ ok: boolean; icon: React.ElementType; children: React.ReactNode }> = ({ ok, icon: Icon, children }) => (
  <li className="flex items-start gap-3">
    <span
      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        ok ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </span>
    <div className="min-w-0 pt-1 text-sm text-gray-700 dark:text-gray-200">{children}</div>
  </li>
);

const LoadingState = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading your activity">
    <Skel className="h-40 rounded-2xl" />
    <div className="grid gap-4 lg:grid-cols-3">
      <Skel className="h-72 rounded-2xl lg:col-span-2" />
      <Skel className="h-72 rounded-2xl" />
    </div>
  </div>
);

export default function MyActivity() {
  const { data, loading, error } = useReport(() => peopleApi.me(), "me");
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { logout } = useUser();
  const [busy, setBusy] = useState(false);
  const [allSignIns, setAllSignIns] = useState(false);
  const [allVisits, setAllVisits] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const security: Security[] = data.security ?? [];
    const sessions: Session[] = data.sessions ?? [];
    const signIns = security.filter((r) => r.kind === "login");
    const monthAgo = Date.now() - 30 * DAY_MS;
    const failed = signIns.filter((r) => r.outcome === "failure" && new Date(r.at).getTime() >= monthAgo);
    const lastSignIn = signIns.find((r) => r.outcome === "success");

    // One row per kind of device (browser + system), not per browser profile: the raw
    // list repeats "Unknown" once for every cleared cookie jar.
    const devices = new Map<string, { device: Session["device"]; last: string; visits: number }>();
    for (const s of sessions) {
      const key = [s.device?.browser, s.device?.os, s.device?.type].join("|");
      const seen = devices.get(key);
      if (!seen) devices.set(key, { device: s.device, last: s.started_at, visits: 1 });
      else seen.visits += 1;
    }
    const shared = (data.devices ?? []).filter((d: any) => d.other_accounts?.length).length;

    return { signIns, failed, lastSignIn, sessions, devices: [...devices.values()], shared, watches: data.watches ?? [], security };
  }, [data]);

  const signOutEverywhere = async () => {
    const ok = await confirm({
      title: "Sign out everywhere?",
      message: "This ends every session of your account on every device, in the MIS and in Task Mentor, Tendo and Tupo, including this one.",
      confirmText: "Sign out everywhere",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await peopleApi.meSignOutEverywhere();
      showToast("Signed out everywhere", "success");
      logout();
      window.location.assign("/login");
    } finally {
      setBusy(false);
    }
  };

  const allClear = !!view && view.watches.length === 0 && view.failed.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 pt-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">My activity</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          When and where your account was used across NGA MIS, Task Mentor, Tendo and Tupo, so you can spot anything that wasn't you. Nothing you type or
          read is recorded.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-200">
          Your activity couldn't be loaded: {error}. Refresh the page to try again.
        </p>
      )}
      {loading && !data && !error && <LoadingState />}

      {view && (
        <>
          {/* The answer first: is my account fine? */}
          <section
            className={`rounded-2xl border p-5 sm:p-6 ${
              allClear
                ? "border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-900/40 dark:from-emerald-950/40 dark:to-gray-900"
                : "border-amber-200/80 bg-gradient-to-br from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/40 dark:to-gray-900"
            }`}
            aria-labelledby="account-status"
          >
            <div className="flex items-center gap-3">
              {allClear ? (
                <ShieldCheck className="h-7 w-7 text-emerald-600 dark:text-emerald-300" aria-hidden />
              ) : (
                <ShieldAlert className="h-7 w-7 text-amber-600 dark:text-amber-300" aria-hidden />
              )}
              <h2 id="account-status" className="text-lg font-semibold text-gray-900 dark:text-white">
                {allClear ? "Your account looks fine" : "Take a look at your account"}
              </h2>
            </div>
            <ul className="mt-4 grid gap-4 md:grid-cols-3">
              <Check ok={view.watches.length === 0} icon={Eye}>
                {view.watches.length === 0 ? (
                  <>
                    <p className="font-medium text-gray-900 dark:text-white">No one is monitoring your account</p>
                    <p className="text-gray-500 dark:text-gray-400">You'd be told here and by notification if that changed.</p>
                  </>
                ) : (
                  view.watches.map((w: any) => (
                    <p key={w.id}>
                      <span className="font-medium text-gray-900 dark:text-white">{w.created_by_name} is monitoring your account</span> until{" "}
                      {fmtDate(w.expires_at, true)}. Reason: {w.reason}
                    </p>
                  ))
                )}
              </Check>
              <Check ok icon={LogIn}>
                <p className="font-medium text-gray-900 dark:text-white">
                  {view.lastSignIn ? `Last signed in ${whenInSentence(view.lastSignIn.at)}` : "No sign-ins recorded yet"}
                </p>
                {view.lastSignIn && <p className="text-gray-500 dark:text-gray-400">{placeLabel(view.lastSignIn.place)}</p>}
              </Check>
              <Check ok={view.failed.length === 0} icon={KeyRound}>
                <p className="font-medium text-gray-900 dark:text-white">
                  {view.failed.length === 0
                    ? "No failed sign-in attempts"
                    : `${view.failed.length} failed sign-in attempt${view.failed.length === 1 ? "" : "s"}`}
                </p>
                <p className="text-gray-500 dark:text-gray-400">In the last 30 days</p>
              </Check>
            </ul>
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Recent sign-ins" description="Each time someone signed in to your account." className="lg:col-span-2">
              {view.signIns.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No sign-ins recorded yet.</p>
              ) : (
                <>
                  <div className="space-y-4">
                    {byDay(allSignIns ? view.signIns : view.signIns.slice(0, SIGN_INS_SHOWN), (r) => r.at).map(({ day, rows }) => (
                      <div key={day}>
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{day}</h3>
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                          {rows.map((r, i) => {
                            const failedAttempt = r.outcome === "failure";
                            return (
                              <li key={`${r.at}-${i}`} className="flex items-center gap-3 py-2.5">
                                {failedAttempt ? (
                                  <XCircle className="h-5 w-5 shrink-0 text-rose-500" aria-hidden />
                                ) : (
                                  <LogIn className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-medium ${failedAttempt ? "text-rose-700 dark:text-rose-300" : "text-gray-900 dark:text-white"}`}>
                                    {failedAttempt ? "Failed sign-in attempt" : "Signed in"}
                                    {r.initiator === "admin" && <span className="font-normal text-gray-500"> · by an administrator</span>}
                                  </p>
                                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{placeLabel(r.place)}</p>
                                </div>
                                <time dateTime={r.at} className="shrink-0 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                                  {timeOf(r.at)}
                                </time>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <ShowMore shown={SIGN_INS_SHOWN} total={view.signIns.length} expanded={allSignIns} onToggle={() => setAllSignIns((v) => !v)} noun="sign-ins" />
                </>
              )}
            </Card>

            <div className="space-y-5">
              <Card title="Your devices">
                {view.devices.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">None recorded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {view.devices.map((d) => (
                      <li key={[d.device?.browser, d.device?.os, d.device?.type].join("|")} className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          <DeviceIcon type={d.device?.type} className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{deviceName(d.device)}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Last used {whenInSentence(d.last)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {view.shared > 0 && (
                  <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    {view.shared === 1 ? "One of your devices was" : `${view.shared} of your devices were`} also used by other accounts. If it's a shared
                    computer, always sign out when you finish.
                  </p>
                )}
              </Card>

              <section className="rounded-2xl border border-gray-200/80 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">See something that wasn't you?</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Sign out of every device, then{" "}
                  <Link to="/profile" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                    change your password
                  </Link>
                  .
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={signOutEverywhere}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out everywhere
                </button>
              </section>
            </div>
          </div>

          <Card title="Recent visits" description="Which apps you used, for how long, and from which browser.">
            {view.sessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No visits recorded yet.</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {(allVisits ? view.sessions : view.sessions.slice(0, VISITS_SHOWN)).map((s) => {
                    const apps = [...new Set(s.app_path)];
                    return (
                      <li key={s.session_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-gray-900 dark:text-white">
                          {apps.map((a) => (
                            <AppDot key={a} app={a as any} />
                          ))}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {deviceName(s.device)} · {fmtMsDur(s.engagement_ms)} active
                        </span>
                        <time dateTime={s.started_at} className="w-36 shrink-0 text-right text-sm tabular-nums text-gray-500 dark:text-gray-400">
                          {whenOf(s.started_at)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
                <ShowMore shown={VISITS_SHOWN} total={view.sessions.length} expanded={allVisits} onToggle={() => setAllVisits((v) => !v)} noun="visits" />
              </>
            )}
          </Card>

          <details className="group rounded-2xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-900">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-base font-semibold text-gray-900 dark:text-white">Technical details</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">The full account log and the internet addresses you connected from.</span>
              </span>
              <ChevronDown className="h-5 w-5 shrink-0 text-gray-400 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-6 border-t border-gray-100 p-5 dark:border-gray-800">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Account log</h3>
                <DataTable
                  dense
                  rows={view.security}
                  rowKey={(r: Security) => `${r.at}|${r.kind}|${r.outcome}`}
                  empty="Nothing recorded yet."
                  columns={[
                    { key: "t", label: "When", render: (r: Security) => fmtDate(r.at, true) },
                    {
                      key: "k",
                      label: "What happened",
                      render: (r: Security) => (
                        <span className={r.outcome === "failure" ? "text-rose-700 dark:text-rose-300" : ""}>
                          {kindLabel(r.kind)}
                          {r.outcome === "failure" ? " (failed)" : ""}
                          {r.initiator === "admin" ? " · by an administrator" : ""}
                        </span>
                      ),
                    },
                    { key: "f", label: "From", render: (r: Security) => <span className="text-xs"><span className="font-mono">{r.ip ?? "—"}</span> · {placeLabel(r.place)}</span> },
                  ]}
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">Networks you connected from</h3>
                <IpTable ips={data.network?.ips ?? []} />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Places come from the internet address and are approximate.</p>
            </div>
          </details>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Records are kept for a limited time (raw activity 13 months). You can ask the school for a copy or deletion of this data. See the{" "}
            <a className="underline" href="/privacy">
              privacy notice
            </a>
            .
          </p>
        </>
      )}
    </div>
  );
}
