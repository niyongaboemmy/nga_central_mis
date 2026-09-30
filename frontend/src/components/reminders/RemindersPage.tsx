import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { usePermissions } from "../../hooks/usePermissions";
import { Permissions } from "../../constants/permissions";
import { currentSubscription } from "../../reminders/push";
import { useToast } from "../../contexts/ToastContext";
import { useReminders } from "./useReminders";
import { SetupCard } from "./SetupCard";
import { NowNextCard } from "./NowNextCard";
import { PreferencesPanel } from "./PreferencesPanel";
import { DevicesPanel } from "./DevicesPanel";
import { CalendarPanel } from "./CalendarPanel";
import { ReliabilityCheck } from "./ReliabilityCheck";
import { UpcomingList } from "./UpcomingList";
import { AdminDeliveryPanel } from "./AdminDeliveryPanel";
import { ChannelsPanel } from "./ChannelsPanel";

/** What Google's redirect back to /reminders?google=… means. */
const GOOGLE_RESULT: Record<string, [string, "success" | "info" | "error"]> = {
  connected: ["Google Calendar connected — your timetable is syncing", "success"],
  denied: ["Google Calendar wasn't connected — access was declined", "info"],
  error: ["Couldn't connect Google Calendar — please try again", "error"],
};

/** sha256(endpoint) -- how the server names this browser's subscription. */
const hashEndpoint = async (endpoint: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * /reminders -- the Reminder Hub for one person (REMINDERS_SOLUTION_PROPOSAL.md):
 * set up this device, see Now & Next, choose what to be reminded of, manage
 * devices and the calendar link. Admins also see school-wide delivery health.
 */
const RemindersPage: React.FC = () => {
  const r = useReminders();
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();
  const [thisHash, setThisHash] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    currentSubscription()
      .then((sub) => (sub ? hashEndpoint(sub.endpoint) : null))
      .then((h) => alive && setThisHash(h))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [r.pushStatus, r.overview?.devices.length]);

  // Back from Google's consent screen: say how it went, then tidy the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("google");
    if (!result) return;
    const [message, tone] = GOOGLE_RESULT[result] ?? GOOGLE_RESULT.error;
    showToast(message, tone);
    params.delete("google");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    await Promise.all([r.reload(), r.refreshPush()]);
  };

  const toggleReminders = async (on: boolean) => {
    try {
      await r.savePreferences({ enabled: on });
      showToast(on ? "Reminders turned on" : "Reminders turned off — nothing will be sent", on ? "success" : "info");
      await r.reload();
    } catch {
      showToast("Couldn't change that — check your connection", "error");
    }
  };

  const prefs = r.overview?.preferences;
  const remindersOn = Boolean(prefs?.enabled);
  const devices = r.overview?.devices ?? [];
  const hasWorkingDevice = devices.some((d) => d.endpoint_hash === thisHash && d.last_success_at);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      {r.error && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" role="alert">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {r.error}
          </span>
          <button type="button" onClick={refresh} className="inline-flex items-center gap-1 font-semibold underline">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      <SetupCard
        pwa={r.pwa}
        pushStatus={r.pushStatus}
        pushEnabledOnServer={r.pushEnabledOnServer}
        remindersOn={remindersOn}
        hasWorkingDevice={hasWorkingDevice}
        onChanged={refresh}
        onToggleReminders={toggleReminders}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          <NowNextCard agenda={r.agenda} loading={r.loading} offline={r.offline} />
          {prefs ? (
            <PreferencesPanel
              preferences={prefs}
              onSave={r.savePreferences}
              isTeacher={hasPermission(Permissions.TEACHER_DASHBOARD)}
            />
          ) : (
            r.loading && <div className="h-96 animate-pulse rounded-3xl bg-white shadow-soft dark:bg-slate-900" />
          )}
        </div>
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <UpcomingList jobs={r.overview?.jobs ?? []} remindersOn={remindersOn} onChanged={() => void r.reload()} />
          <DevicesPanel devices={devices} thisEndpointHash={thisHash} onChanged={() => void refresh()} />
          <CalendarPanel
            feed={r.overview?.feed ?? null}
            platform={r.pwa.platform}
            onChanged={(feed) => r.setOverview((o) => (o ? { ...o, feed } : o))}
          />
          {prefs && (
            <ChannelsPanel
              config={r.config}
              connections={r.overview?.connections}
              preferences={prefs}
              remindersOn={remindersOn}
              onSave={r.savePreferences}
              onChanged={() => void r.reload()}
            />
          )}
          {(r.pwa.platform.mobile || r.pushStatus === "on") && (
            <ReliabilityCheck platform={r.pwa.platform} pushOn={r.pushStatus === "on"} />
          )}
        </div>
      </div>

      {hasPermission(Permissions.MANAGE_SYSTEMS) && <AdminDeliveryPanel />}
    </div>
  );
};

export default RemindersPage;
