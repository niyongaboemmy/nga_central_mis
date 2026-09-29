import React, { useState } from "react";
import { CalendarPlus, Copy, ExternalLink, Link2Off, RefreshCw } from "lucide-react";
import { remindersApi, type FeedUrls } from "../../api/reminders";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useToast } from "../../contexts/ToastContext";
import type { PlatformInfo } from "../../reminders/platform";

/**
 * Personal calendar feed (proposal §6.3). Apple Calendar and Outlook keep the
 * alarms on the device, so reminders fire even offline and with every browser
 * closed. Google Calendar is told honestly: it refreshes subscribed links only
 * every 8-24 h, so it's fine for viewing, not for reminders.
 */
export const CalendarPanel: React.FC<{
  feed: FeedUrls | null;
  platform: PlatformInfo;
  onChanged: (feed: FeedUrls | null) => void;
}> = ({ feed, platform, onChanged }) => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const apple = platform.os === "ios" || platform.os === "ipados" || platform.os === "macos";

  const create = async () => {
    setBusy(true);
    try {
      onChanged(await remindersApi.createFeed());
    } catch {
      showToast("Couldn't create your calendar link", "error");
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    const ok = await confirm({
      title: "Make a new calendar link?",
      message: "The old link stops working. Calendars subscribed to it will need the new one.",
      confirmText: "Make new link",
      tone: "warning",
    });
    if (ok) await create();
  };

  const turnOff = async () => {
    const ok = await confirm({
      title: "Turn off your calendar link?",
      message: "Calendars subscribed to it stop updating and stop reminding you.",
      confirmText: "Turn off",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await remindersApi.deleteFeed();
      onChanged(null);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed.https);
      showToast("Link copied — paste it into your calendar app", "success");
    } catch {
      showToast("Copy failed — select the link and copy it by hand", "warning");
    }
  };

  return (
    <section aria-labelledby="calendar-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
      <h2 id="calendar-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        <CalendarPlus className="h-5 w-5 text-brand-600 dark:text-brand-200" /> Add to your calendar app
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Your timetable and deadlines, with alarms, in Apple Calendar or Outlook. The phone rings the alarm itself — no
        internet or browser needed at that moment.
      </p>

      {!feed ? (
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          <CalendarPlus className="h-4 w-4" /> {busy ? "Creating…" : "Create my calendar link"}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pl-3 dark:border-slate-700 dark:bg-slate-800/60">
            <code className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200" title={feed.https}>
              {feed.https}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={feed.webcal}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                apple
                  ? "bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              <ExternalLink className="h-4 w-4" /> Open in Apple Calendar / Outlook
            </a>
            <button
              type="button"
              onClick={rotate}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4" /> New link
            </button>
            <button
              type="button"
              onClick={turnOff}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-danger-700 transition hover:bg-danger-100 dark:text-red-300 dark:hover:bg-danger-500/15"
            >
              <Link2Off className="h-4 w-4" /> Turn off
            </button>
          </div>
          <details className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
            <summary className="cursor-pointer font-semibold">How to add it</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              <li>
                <strong>iPhone / Mac:</strong> tap “Open in Apple Calendar”, then Subscribe. On Mac, untick “Remove
                alerts” and set Auto-refresh to every hour.
              </li>
              <li>
                <strong>Outlook:</strong> Add calendar → Subscribe from web → paste the link.
              </li>
              <li>
                <strong>Google Calendar:</strong> Other calendars → From URL → paste the link. Google refreshes it only
                every 8–24 h, so use it to see your week; rely on NGA notifications for reminders.
              </li>
            </ul>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Keep the link private — anyone with it can see your timetable. Make a new link if it was shared.
            </p>
          </details>
        </div>
      )}
    </section>
  );
};
