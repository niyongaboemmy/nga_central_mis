import React, { useState } from "react";
import { Laptop, Monitor, Smartphone, Tablet, Trash2 } from "lucide-react";
import { remindersApi, type ReminderDevice } from "../../api/reminders";
import { BROWSER_LABEL, OS_LABEL, type Browser, type OS } from "../../reminders/platform";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";

const deviceIcon = (os: string | null) => {
  switch (os) {
    case "android":
    case "ios":
      return <Smartphone className="h-5 w-5" />;
    case "ipados":
      return <Tablet className="h-5 w-5" />;
    case "macos":
      return <Laptop className="h-5 w-5" />;
    default:
      return <Monitor className="h-5 w-5" />;
  }
};

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

/** Every browser/app that receives this user's push reminders. */
export const DevicesPanel: React.FC<{
  devices: ReminderDevice[];
  thisEndpointHash: string | null;
  onChanged: () => void;
}> = ({ devices, thisEndpointHash, onChanged }) => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [removing, setRemoving] = useState<number | null>(null);

  const remove = async (device: ReminderDevice) => {
    const ok = await confirm({
      title: "Stop reminders on this device?",
      message: `${OS_LABEL[(device.platform as OS) ?? "other"] ?? "Device"} · ${BROWSER_LABEL[(device.browser as Browser) ?? "other"] ?? "Browser"} won't receive push reminders any more. You can turn them on again from that device.`,
      confirmText: "Remove device",
      tone: "danger",
    });
    if (!ok) return;
    setRemoving(device.subscription_id);
    try {
      await remindersApi.removeDevice(device.subscription_id);
      showToast("Device removed", "success");
      onChanged();
    } catch {
      showToast("Couldn't remove the device", "error");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section aria-labelledby="devices-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
      <h2 id="devices-title" className="text-base font-semibold text-slate-900 dark:text-white">
        Your devices
      </h2>
      {devices.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          No device gets push reminders yet. Turn on notifications above on your phone and computer — each one appears here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {devices.map((device) => {
            const os = (device.platform as OS) ?? "other";
            const browser = (device.browser as Browser) ?? "other";
            const isThis = thisEndpointHash === device.endpoint_hash;
            const healthy = device.failure_count === 0;
            return (
              <li key={device.subscription_id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {deviceIcon(device.platform)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {OS_LABEL[os] ?? "Device"} · {BROWSER_LABEL[browser] ?? "Browser"}
                    {isThis && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-600/20 dark:text-brand-200">
                        This device
                      </span>
                    )}
                    {Number(device.installed) === 1 && (
                      <span className="rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-100">
                        App
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <span className={`mr-1 inline-block h-2 w-2 rounded-full ${healthy ? "bg-success-500" : "bg-amber-500"}`} aria-hidden />
                    {healthy ? "Working" : `${device.failure_count} failed deliveries`} · last delivered {ago(device.last_success_at)} · seen{" "}
                    {ago(device.last_seen_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(device)}
                  disabled={removing === device.subscription_id}
                  aria-label="Remove device"
                  className="rounded-xl p-2 text-slate-500 transition dark:text-slate-300 hover:bg-danger-100 hover:text-danger-700 disabled:opacity-50 dark:hover:bg-danger-500/15"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
