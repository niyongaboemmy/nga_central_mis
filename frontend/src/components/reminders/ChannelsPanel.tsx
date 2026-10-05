import React, { useEffect, useState } from "react";
import { CalendarCheck, Mail, RefreshCw, Send, Unlink } from "lucide-react";
import {
  remindersApi,
  type ChannelChoices,
  type ReminderConfig,
  type ReminderConnections,
  type ReminderPreferences,
} from "../../api/reminders";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";
import { isNgaDesktop } from "../../desktop/ngaDesktop";

/**
 * More ways to be reminded (proposal §6): a Telegram chat, the person's own
 * Google Calendar, and an email when an important reminder went unopened.
 * Each row explains itself and says plainly when the school hasn't set a
 * channel up yet, instead of hiding it.
 */

const since = (iso: string | null) => {
  if (!iso) return "never";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString();
};

const Switch: React.FC<{ checked: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }> = ({
  checked,
  disabled,
  label,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
      checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-600"
    }`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
  </button>
);

const Row: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; aside?: React.ReactNode }> = ({
  icon,
  title,
  children,
  aside,
}) => (
  <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
    <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {aside}
      </div>
      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </div>
  </li>
);

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-60";
const primary = `${buttonClass} bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100`;
const quiet = `${buttonClass} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`;
const danger = `${buttonClass} text-danger-700 hover:bg-danger-100 dark:text-red-300 dark:hover:bg-danger-500/15`;

export const ChannelsPanel: React.FC<{
  config: ReminderConfig | null;
  connections: ReminderConnections | undefined;
  preferences: ReminderPreferences;
  remindersOn: boolean;
  onSave: (patch: Partial<ReminderPreferences>) => Promise<unknown>;
  onChanged: () => void;
}> = ({ config, connections, preferences, remindersOn, onSave, onChanged }) => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  // NGA Desktop: Google's consent page opens in the person's browser, not here.
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);
  const channels: ChannelChoices = preferences.channels ?? { telegram: true, email: false, googleCalendar: true };
  const telegram = connections?.telegram ?? null;
  const google = connections?.googleCalendar ?? null;

  // While the Telegram link is open in another tab/app, look for the link landing.
  useEffect(() => {
    if (!telegramUrl || telegram) return;
    const id = window.setInterval(onChanged, 4000);
    const stop = window.setTimeout(() => setTelegramUrl(null), 15 * 60_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [telegramUrl, telegram, onChanged]);

  useEffect(() => {
    if (telegram && telegramUrl) {
      setTelegramUrl(null);
      showToast("Telegram connected — reminders will arrive there too", "success");
    }
  }, [telegram, telegramUrl, showToast]);

  const toggle = async (key: keyof ChannelChoices, value: boolean) => {
    setBusy(key);
    try {
      await onSave({ channels: { ...channels, [key]: value } });
    } catch {
      showToast("Couldn't save that — check your connection", "error");
    } finally {
      setBusy(null);
    }
  };

  const connectTelegram = async () => {
    setBusy("telegram-link");
    try {
      const { url } = await remindersApi.telegramLink();
      setTelegramUrl(url);
      window.open(url, "_blank", "noopener");
    } catch {
      showToast("Couldn't start the Telegram connection", "error");
    } finally {
      setBusy(null);
    }
  };

  const disconnectTelegram = async () => {
    const ok = await confirm({
      title: "Disconnect Telegram?",
      message: "Reminders stop arriving in your Telegram chat. You can connect again any time.",
      confirmText: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("telegram-unlink");
    try {
      await remindersApi.telegramUnlink();
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  // Same wait for Google when it was opened in the browser (NGA Desktop).
  const googleActive = google?.status === "active";
  useEffect(() => {
    if (!googleUrl || googleActive) return;
    const id = window.setInterval(onChanged, 4000);
    const stop = window.setTimeout(() => setGoogleUrl(null), 15 * 60_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [googleUrl, googleActive, onChanged]);

  useEffect(() => {
    if (googleActive && googleUrl) {
      setGoogleUrl(null);
      showToast("Google Calendar connected", "success");
    }
  }, [googleActive, googleUrl, showToast]);

  const connectGoogle = async () => {
    setBusy("google-connect");
    try {
      const { url } = await remindersApi.googleConnectUrl();
      if (isNgaDesktop()) {
        // The desktop app hands Google's pages to the browser, so this page
        // stays here: wait for the connection instead of leaving.
        setGoogleUrl(url);
        window.open(url, "_blank", "noopener");
        setBusy(null);
        return;
      }
      window.location.assign(url);
    } catch {
      showToast("Couldn't reach Google — try again", "error");
      setBusy(null);
    }
  };

  const syncGoogle = async () => {
    setBusy("google-sync");
    try {
      const result = await remindersApi.googleSync();
      showToast(result.last_error ? `Google said: ${result.last_error}` : "Google Calendar is up to date", result.last_error ? "warning" : "success");
      onChanged();
    } catch {
      showToast("Couldn't sync right now", "error");
    } finally {
      setBusy(null);
    }
  };

  const disconnectGoogle = async () => {
    const ok = await confirm({
      title: "Disconnect Google Calendar?",
      message: "The “NGA · My Timetable” calendar is removed from your Google account and NGA loses access to it.",
      confirmText: "Disconnect",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("google-disconnect");
    try {
      await remindersApi.googleDisconnect();
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const telegramReady = Boolean(config?.telegram?.enabled);
  const googleReady = Boolean(config?.googleCalendar?.enabled);
  const notSetUp = <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Not set up on this server yet — ask the school IT team.</p>;

  return (
    <section
      aria-labelledby="channels-title"
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900"
    >
      <h2 id="channels-title" className="text-base font-semibold text-slate-900 dark:text-white">
        More ways to be reminded
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        On top of notifications in NGA{remindersOn ? "" : " (turn reminders on first)"}.
      </p>

      <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
        <Row
          icon={<Send className="h-4 w-4" />}
          title="Telegram"
          aside={
            telegram ? (
              <Switch
                checked={channels.telegram}
                disabled={busy === "telegram"}
                label="Send reminders to Telegram"
                onChange={(v) => void toggle("telegram", v)}
              />
            ) : undefined
          }
        >
          {telegram ? (
            <>
              <p>
                Connected{telegram.username ? <> as <strong>@{telegram.username}</strong></> : null}. Every reminder
                also arrives in the chat, with Got it / Snooze buttons.
              </p>
              <button type="button" onClick={disconnectTelegram} disabled={busy !== null} className={`${danger} mt-2 -ml-3`}>
                <Unlink className="h-4 w-4" /> Disconnect
              </button>
            </>
          ) : (
            <>
              <p>Reminders on any phone or computer with Telegram — even with NGA closed. Free.</p>
              {telegramReady ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={connectTelegram} disabled={busy !== null} className={primary}>
                    <Send className="h-4 w-4" /> {busy === "telegram-link" ? "Opening…" : "Connect Telegram"}
                  </button>
                  {telegramUrl && (
                    <span className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
                      Press <strong>Start</strong> in Telegram.{" "}
                      <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                        Open again
                      </a>
                    </span>
                  )}
                </div>
              ) : (
                notSetUp
              )}
            </>
          )}
        </Row>

        <Row
          icon={<CalendarCheck className="h-4 w-4" />}
          title="Google Calendar"
          aside={
            google?.status === "active" ? (
              <Switch
                checked={channels.googleCalendar}
                disabled={busy === "googleCalendar"}
                label="Keep my Google Calendar in sync"
                onChange={(v) => void toggle("googleCalendar", v)}
              />
            ) : undefined
          }
        >
          {google?.status === "active" ? (
            <>
              <p>
                Synced to “NGA · My Timetable”{google.email ? <> in <strong>{google.email}</strong></> : null} · updated{" "}
                {since(google.last_sync_at)}. Your phone's calendar rings each reminder, even offline.
              </p>
              {google.last_error && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300" role="status">
                  Last sync had a problem: {google.last_error}
                </p>
              )}
              <div className="mt-2 -ml-3 flex flex-wrap gap-1">
                <button type="button" onClick={syncGoogle} disabled={busy !== null} className={quiet}>
                  <RefreshCw className={`h-4 w-4 ${busy === "google-sync" ? "animate-spin" : ""}`} /> Sync now
                </button>
                <button type="button" onClick={disconnectGoogle} disabled={busy !== null} className={danger}>
                  <Unlink className="h-4 w-4" /> Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <p>
                {google?.status === "revoked"
                  ? "Access was removed in your Google account. Connect again to resume syncing."
                  : "Adds your timetable and deadlines, with alarms, to a separate calendar in your own Google account. NGA can only see the calendar it creates."}
              </p>
              {googleReady ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={connectGoogle} disabled={busy !== null} className={primary}>
                    <CalendarCheck className="h-4 w-4" /> {busy === "google-connect" ? "Opening Google…" : "Connect Google Calendar"}
                  </button>
                  {googleUrl && (
                    <span className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
                      Finish in your browser, then come back here.{" "}
                      <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                        Open again
                      </a>
                    </span>
                  )}
                </div>
              ) : (
                notSetUp
              )}
            </>
          )}
        </Row>

        <Row
          icon={<Mail className="h-4 w-4" />}
          title="Email for missed important reminders"
          aside={
            <Switch
              checked={channels.email}
              disabled={busy === "email"}
              label="Email me when I miss an important reminder"
              onChange={(v) => void toggle("email", v)}
            />
          }
        >
          <p>
            If a quiz or assignment deadline reminder isn't opened within {config?.email?.escalateAfterMinutes ?? 10} minutes,
            we email it once.
          </p>
        </Row>
      </ul>
    </section>
  );
};
