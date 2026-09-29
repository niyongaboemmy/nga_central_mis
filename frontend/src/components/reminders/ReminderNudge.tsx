import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Download, ShieldAlert, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { remindersApi } from "../../api/reminders";
import { pushHealthCheck, enablePush, type PushStatus } from "../../reminders/push";
import { countVisit, installPromptSnoozed, promptInstall, snoozeInstallPrompt, usePwa } from "../../reminders/pwa";
import { InstallSheet } from "./InstallGuide";

type Nudge = "blocked" | "enable-device" | "install" | "try-reminders" | null;

const REMINDER_NUDGE_KEY = "nga.reminders.nudgeSnoozedUntil";
const snoozed = (key: string) => {
  try {
    return Number(localStorage.getItem(key) || 0) > Date.now();
  } catch {
    return false;
  }
};
const snooze = (key: string, days: number) => {
  try {
    localStorage.setItem(key, String(Date.now() + days * 86_400_000));
  } catch {
    /* ignore */
  }
};

/** Picks at most one, most useful card (pure, unit-tested). */
export const chooseNudge = (input: {
  remindersOn: boolean | null;
  pushStatus: PushStatus | null;
  installed: boolean;
  installMethod: string;
  visits: number;
  installSnoozed: boolean;
  reminderNudgeSnoozed: boolean;
  onRemindersPage: boolean;
}): Nudge => {
  if (input.onRemindersPage || input.remindersOn === null || input.pushStatus === null) return null;
  if (input.remindersOn && input.pushStatus === "blocked" && !input.reminderNudgeSnoozed) return "blocked";
  if (input.remindersOn && input.pushStatus === "off" && !input.reminderNudgeSnoozed) return "enable-device";
  const installable = ["prompt", "ios", "mac-dock"].includes(input.installMethod);
  if (!input.installed && installable && input.visits >= 2 && !input.installSnoozed) return "install";
  if (!input.remindersOn && input.visits >= 3 && !input.reminderNudgeSnoozed) return "try-reminders";
  return null;
};

/**
 * App-wide, gentle prompts (REMINDERS_SOLUTION_PROPOSAL.md §7.2-7.5):
 * the permission health check on every app open, plus at most one card --
 * never on the first visit, never twice in a fortnight once dismissed.
 */
export const ReminderNudge: React.FC = () => {
  const pwa = usePwa();
  const location = useLocation();
  const navigate = useNavigate();
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [visits] = useState(() => countVisit());
  const [installOpen, setInstallOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await remindersApi.me();
        if (!alive) return;
        setRemindersOn(me.preferences.enabled);
        const status = await pushHealthCheck(me.preferences.enabled);
        if (alive) setPushStatus(status);
      } catch {
        /* nudges are optional; stay quiet */
      }
    })();
    // Notification clicks can ask an open window to navigate (sw.js).
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "nga:navigate" && typeof event.data.url === "string") navigate(event.data.url);
      if (event.data?.type === "nga:resubscribe") void pushHealthCheck(true).then(setPushStatus);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      alive = false;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [navigate]);

  const nudge = dismissed
    ? null
    : chooseNudge({
        remindersOn,
        pushStatus,
        installed: pwa.installed,
        installMethod: pwa.platform.installMethod,
        visits,
        installSnoozed: installPromptSnoozed(),
        reminderNudgeSnoozed: snoozed(REMINDER_NUDGE_KEY),
        onRemindersPage: location.pathname.startsWith("/reminders"),
      });

  const close = () => {
    if (nudge === "install") snoozeInstallPrompt();
    else snooze(REMINDER_NUDGE_KEY, nudge === "try-reminders" ? 14 : 3);
    setDismissed(true);
  };

  const primary = async () => {
    setBusy(true);
    try {
      if (nudge === "install") {
        if (pwa.platform.installMethod === "prompt") {
          const outcome = await promptInstall();
          if (outcome !== "unavailable") setDismissed(true);
          else setInstallOpen(true);
        } else setInstallOpen(true);
      } else if (nudge === "enable-device") {
        const result = await enablePush();
        setPushStatus(result === "on" ? "on" : result === "blocked" ? "blocked" : "off");
        if (result === "on") setDismissed(true);
      } else {
        navigate("/reminders");
        setDismissed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const content: Record<Exclude<Nudge, null>, { icon: React.ReactNode; title: string; body: string; cta: string }> = {
    blocked: {
      icon: <ShieldAlert className="h-5 w-5" />,
      title: "Reminders are off on this device",
      body: "Notifications were blocked in the browser, so lesson and deadline reminders can't reach you here.",
      cta: "Fix it",
    },
    "enable-device": {
      icon: <BellRing className="h-5 w-5" />,
      title: "Get reminders on this device too",
      body: "You have reminders on — allow notifications here so they arrive even when NGA is closed.",
      cta: "Turn on",
    },
    install: {
      icon: <Download className="h-5 w-5" />,
      title: "Install the NGA app",
      body:
        pwa.platform.installMethod === "ios"
          ? "Add NGA to your Home Screen — iPhone only sends reminders to installed apps."
          : "One tap: its own window, faster start, and reminders even when the browser is closed.",
      cta: pwa.platform.installMethod === "prompt" ? "Install" : "Show me how",
    },
    "try-reminders": {
      icon: <BellRing className="h-5 w-5" />,
      title: "Never miss a lesson or deadline",
      body: "Get a nudge 10 minutes before lessons and before quizzes close.",
      cta: "Set up reminders",
    },
  };

  return (
    <>
      <AnimatePresence>
        {nudge && (
          <motion.aside
            key={nudge}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            role="complementary"
            aria-label={content[nudge].title}
            className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-float dark:border-slate-700 dark:bg-slate-900 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-96"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                  nudge === "blocked"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"
                    : "bg-brand-50 text-brand-600 dark:bg-brand-600/20 dark:text-brand-200"
                }`}
              >
                {content[nudge].icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{content[nudge].title}</p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{content[nudge].body}</p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={primary}
                    disabled={busy}
                    className="rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
                  >
                    {busy ? "…" : content[nudge].cta}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Not now
                  </button>
                </div>
              </div>
              <button type="button" onClick={close} aria-label="Dismiss" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <InstallSheet isOpen={installOpen} onClose={() => { setInstallOpen(false); setDismissed(true); }} />
    </>
  );
};
