import { useState } from "react";
import { Eye, LogOut, ShieldQuestion } from "lucide-react";
import { peopleApi } from "../../api/monitor";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useUser } from "../../contexts/UserContext";
import { Empty, Panel, btnPrimary } from "../access/shared";
import { useReport } from "./useReport";
import { DataTable, fmtDate, fmtMsDur } from "./charts";
import { AppDot, DeviceIcon, placeLabel } from "./common";
import { IpTable } from "./PersonParts";

/**
 * My activity (plan §10.5, §13 transparency): what the platform records about me, from
 * where and on which devices, sign-in attempts on my account, and (decision D2) whether
 * anyone is monitoring me right now, who, why and until when.
 */
export default function MyActivity() {
  const { data, loading, error } = useReport(() => peopleApi.me(), "me");
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { logout } = useUser();
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold text-text-primary-light dark:text-text-primary-dark">My activity</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          What NGA's platform records about your use of the MIS, Task Mentor, Tendo and Tupo: when, from which devices, networks and approximate places. Nothing you type or read is recorded.
        </p>
      </header>
      {error && <Empty>{error}</Empty>}
      {loading && !data && <Empty>Loading…</Empty>}
      {data && (
        <>
          <Panel title={<span className="inline-flex items-center gap-1.5"><Eye className="w-4 h-4" aria-hidden />Is anyone monitoring my account?</span>}>
            {data.watches.length === 0 ? (
              <p className="text-sm">No. You are told here and by notification whenever an administrator starts or ends monitoring your account.</p>
            ) : (
              <ul className="space-y-2">
                {data.watches.map((w: any) => (
                  <li key={w.id} className="rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-950 dark:text-amber-50 px-3 py-2 text-sm">
                    <span className="font-medium">{w.created_by_name}</span> is monitoring your account activity until <span className="font-medium">{fmtDate(w.expires_at, true)}</span>.
                    <span className="block">Reason: {w.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={<span className="inline-flex items-center gap-1.5"><ShieldQuestion className="w-4 h-4" aria-hidden />Was this you?</span>}
            actions={<button className={`${btnPrimary} !bg-rose-700 hover:!bg-rose-800`} disabled={busy} onClick={signOutEverywhere}><LogOut className="w-4 h-4" aria-hidden /> Sign me out everywhere</button>}
          >
            <p className="text-sm mb-3">If you don't recognise a device, place or sign-in below, sign out everywhere and change your password.</p>
            <DataTable
              rows={data.sessions}
              rowKey={(s: any) => String(s.session_id)}
              empty="No visits recorded yet."
              columns={[
                { key: "t", label: "When", render: (s: any) => fmtDate(s.started_at, true) },
                { key: "a", label: "Apps", render: (s: any) => <span className="inline-flex gap-1.5">{s.app_path.map((a: any, i: number) => <AppDot key={i} app={a} withLabel={false} />)}</span> },
                { key: "d", label: "Device", render: (s: any) => <span className="inline-flex items-center gap-1 text-xs"><DeviceIcon type={s.device?.type} className="w-3.5 h-3.5" />{[s.device?.browser, s.device?.os].filter(Boolean).join(" · ")}</span> },
                { key: "w", label: "From", render: (s: any) => <span className="text-xs"><span className="font-mono">{s.ip}</span> · {placeLabel(s.place, s.network)}</span> },
                { key: "e", label: "Time", align: "right", render: (s: any) => fmtMsDur(s.engagement_ms) },
              ]}
            />
          </Panel>

          <div className="grid lg:grid-cols-2 gap-4">
            <Panel title="Sign-ins and attempts on my account" className="min-w-0">
              <DataTable
                dense
                rows={data.security}
                rowKey={(r: any) => `${r.at}|${r.kind}|${r.outcome}`}
                empty="None yet."
                columns={[
                  { key: "t", label: "When", render: (r: any) => fmtDate(r.at, true) },
                  { key: "k", label: "What", render: (r: any) => <span className={r.outcome === "failure" ? "text-rose-700 dark:text-rose-300" : ""}>{r.kind.replace(/_/g, " ")} · {r.outcome}{r.initiator === "admin" ? " (by an administrator)" : ""}</span> },
                  { key: "f", label: "From", render: (r: any) => <span className="text-xs"><span className="font-mono">{r.ip ?? "—"}</span> {placeLabel(r.place)}</span> },
                ]}
              />
            </Panel>
            <Panel title="My devices" className="min-w-0">
              <DataTable
                dense
                rows={data.devices}
                rowKey={(r: any) => r.device_id}
                empty="None yet."
                columns={[
                  { key: "d", label: "Device", render: (r: any) => <span className="inline-flex items-center gap-1"><DeviceIcon type={r.device.type} className="w-3.5 h-3.5" />{[r.device.browser, r.device.os].filter(Boolean).join(" · ") || "Unknown"}{r.pwa && " · app"}</span> },
                  { key: "l", label: "Last used", render: (r: any) => fmtDate(r.last_seen, true) },
                  { key: "o", label: "Also used by", render: (r: any) => (r.other_accounts.length ? `${r.other_accounts.length} other account(s)` : "—") },
                ]}
              />
            </Panel>
          </div>
          <Panel title="Networks I connected from"><IpTable ips={data.network.ips} /></Panel>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Places come from the internet address and are approximate. Records are kept for a limited time (raw activity 13 months). You can ask the school for a copy or deletion of this data. See the <a className="underline" href="/privacy">privacy notice</a>.
          </p>
        </>
      )}
    </div>
  );
}
