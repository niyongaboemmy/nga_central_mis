import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { remindersApi, type AdminOverview } from "../../api/reminders";
import { BROWSER_LABEL, OS_LABEL, type Browser, type OS } from "../../reminders/platform";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
    {hint && <p className="text-xs text-slate-600 dark:text-slate-300">{hint}</p>}
  </div>
);

/** School-wide delivery health for admins (proposal §11, success metrics). */
export const AdminDeliveryPanel: React.FC = () => {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    remindersApi.adminOverview().then(setData).catch(() => setError(true));
  }, []);

  if (error) return null;

  const sent = data?.byStatus.filter((s) => ["sent", "acked"].includes(s.status)).reduce((a, s) => a + s.count, 0) ?? 0;
  const installed = data?.devices.filter((d) => d.installed).reduce((a, d) => a + d.count, 0) ?? 0;
  const devices = data?.devices.reduce((a, d) => a + d.count, 0) ?? 0;
  const maxDevices = Math.max(1, ...(data?.devices.map((d) => d.count) ?? [1]));

  return (
    <section aria-labelledby="admin-delivery-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
      <h2 id="admin-delivery-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        <Activity className="h-5 w-5 text-brand-600 dark:text-brand-200" /> School-wide delivery (last 7 days)
      </h2>
      {!data ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <>
          {!data.push.enabled && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              Web Push is disabled: set REMINDERS_VAPID_PUBLIC_KEY / REMINDERS_VAPID_PRIVATE_KEY on the API server.
            </p>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="People with reminders on" value={String(data.optedInUsers)} />
            <Stat label="Reminders delivered" value={String(sent)} />
            <Stat label="On time (≤ 60 s)" value={pct(data.onTimeRate)} hint="Target ≥ 95%" />
            <Stat label="Seen / acknowledged" value={pct(data.ackRate)} />
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Devices: {devices} · installed app on {installed} ({devices ? Math.round((installed / devices) * 100) : 0}%)
            </p>
            <ul className="mt-2 space-y-1.5">
              {data.devices
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((d, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-44 flex-shrink-0 truncate text-slate-700 dark:text-slate-200">
                      {OS_LABEL[(d.platform as OS) ?? "other"] ?? d.platform} · {BROWSER_LABEL[(d.browser as Browser) ?? "other"] ?? d.browser}
                      {d.installed ? " (app)" : ""}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(d.count / maxDevices) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-slate-600 dark:text-slate-300">{d.count}</span>
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
};
