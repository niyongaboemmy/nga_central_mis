import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellOff, BellRing, Check, Download, Lock, Send, ShieldAlert } from "lucide-react";
import { remindersApi } from "../../api/reminders";
import { disablePush, enablePush, type PushStatus } from "../../reminders/push";
import type { usePwa } from "../../reminders/pwa";
import { BROWSER_LABEL, OS_LABEL } from "../../reminders/platform";
import { useToast } from "../../contexts/ToastContext";
import { InstallSheet } from "./InstallGuide";

type Pwa = ReturnType<typeof usePwa>;

interface Props {
  pwa: Pwa;
  pushStatus: PushStatus | null;
  pushEnabledOnServer: boolean;
  remindersOn: boolean;
  hasWorkingDevice: boolean;
  onChanged: () => Promise<void> | void;
  onToggleReminders: (on: boolean) => Promise<void>;
}

const StepDot: React.FC<{ done: boolean; n: number; active: boolean }> = ({ done, n, active }) => (
  <span
    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold transition ${
      done
        ? "bg-success-500 text-white"
        : active
          ? "bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-600/30"
          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
    }`}
  >
    {done ? <Check className="h-4 w-4" /> : n}
  </span>
);

const UnblockHelp: React.FC<{ browser: string }> = ({ browser }) => (
  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
    <p className="flex items-center gap-2 font-semibold">
      <Lock className="h-4 w-4" /> Notifications are blocked for NGA in {browser}
    </p>
    <p className="mt-1">
      Click the <strong>lock / site-settings icon</strong> next to the address (or open the app's settings), set{" "}
      <strong>Notifications → Allow</strong>, then come back and press the button again. If {browser} turned them off
      automatically, you can also restore them in its Safety Check.
    </p>
  </div>
);

/**
 * The three steps to reliable reminders on this device: install, allow
 * notifications, prove it works (REMINDERS_SOLUTION_PROPOSAL.md §7.2-7.3).
 * Permission is only requested from the button press, after our own
 * explanation -- never on load.
 */
export const SetupCard: React.FC<Props> = ({
  pwa,
  pushStatus,
  pushEnabledOnServer,
  remindersOn,
  hasWorkingDevice,
  onChanged,
  onToggleReminders,
}) => {
  const { showToast } = useToast();
  const [installOpen, setInstallOpen] = useState(false);
  const [busy, setBusy] = useState<null | "push" | "test" | "off" | "toggle">(null);
  const [blockedHint, setBlockedHint] = useState(false);
  const [tested, setTested] = useState(false);
  const { platform } = pwa;
  const browser = BROWSER_LABEL[platform.browser];

  const installDone = pwa.installed;
  const pushOn = pushStatus === "on";
  const testDone = tested || (pushOn && hasWorkingDevice);
  const installRequired = platform.pushNeedsInstall;
  const activeStep = !installDone && installRequired ? 1 : !pushOn ? 2 : !testDone ? 3 : 0;

  const turnOn = async () => {
    setBusy("push");
    setBlockedHint(false);
    try {
      const result = await enablePush();
      if (result === "on") {
        showToast("Reminders are on for this device", "success");
        await onChanged();
      } else if (result === "blocked") {
        setBlockedHint(true);
      } else if (result === "needs-install") {
        setInstallOpen(true);
      } else if (result === "no-key") {
        showToast("Push isn't set up on the server yet — you'll still get reminders in the app.", "warning");
      } else if (result === "private") {
        showToast("Private/incognito windows can't receive notifications. Open NGA in a normal window.", "warning");
      } else if (result === "unsupported") {
        showToast(`${browser} can't receive push here — add your timetable to a calendar app instead.`, "warning");
      }
    } catch {
      showToast("Couldn't turn on notifications. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    setBusy("off");
    try {
      await disablePush();
      showToast("This device won't get push reminders any more", "info");
      await onChanged();
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy("test");
    try {
      const report = await remindersApi.test();
      if (report.pushDelivered > 0) {
        setTested(true);
        showToast(`Test sent to ${report.pushDelivered} device${report.pushDelivered === 1 ? "" : "s"} — check your notifications`, "success");
      } else {
        showToast("No device accepted the test. Try turning notifications off and on again.", "warning");
      }
      await onChanged();
    } catch {
      showToast("Couldn't send the test", "error");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async () => {
    setBusy("toggle");
    try {
      await onToggleReminders(!remindersOn);
    } finally {
      setBusy(null);
    }
  };

  const headline = !remindersOn
    ? "Reminders are off"
    : pushOn
      ? "You're all set on this device"
      : "Reminders are on — finish setting up this device";

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-600 to-indigo-700 p-5 text-white shadow-float sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15">
            {remindersOn ? <BellRing className="h-6 w-6" /> : <BellOff className="h-6 w-6" />}
          </span>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{headline}</h1>
            <p className="mt-1 max-w-xl text-sm text-white/85">
              A nudge before every lesson, quiz and deadline — on this {OS_LABEL[platform.os]}, in the app and in your
              calendar. Times follow the school clock (Kigali).
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer select-none items-center gap-3 self-start rounded-full bg-white/15 px-3 py-2 text-sm font-semibold">
          <span>{remindersOn ? "On" : "Off"}</span>
          <button
            type="button"
            role="switch"
            aria-checked={remindersOn}
            aria-label="Reminders"
            disabled={busy === "toggle"}
            onClick={toggle}
            className={`relative h-6 w-11 rounded-full transition ${remindersOn ? "bg-success-500" : "bg-white/30"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${remindersOn ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </label>
      </div>

      <AnimatePresence initial={false}>
        {remindersOn && (
          <motion.ol
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="relative mt-5 grid gap-3 md:grid-cols-3"
          >
            <li className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white">
              <div className="flex items-center gap-3">
                <StepDot n={1} done={installDone} active={activeStep === 1} />
                <div className="min-w-0">
                  <p className="font-semibold">Install the app</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {installDone ? "Installed on this device" : installRequired ? "Required on iPhone/iPad" : "Recommended"}
                  </p>
                </div>
              </div>
              {!installDone && (
                <button
                  type="button"
                  onClick={() => setInstallOpen(true)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:border-brand-600/40 dark:text-brand-200 dark:hover:bg-brand-600/10"
                >
                  <Download className="h-4 w-4" /> How to install
                </button>
              )}
            </li>

            <li className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white">
              <div className="flex items-center gap-3">
                <StepDot n={2} done={pushOn} active={activeStep === 2} />
                <div className="min-w-0">
                  <p className="font-semibold">Allow notifications</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {pushOn
                      ? "This device will be notified"
                      : pushStatus === "blocked"
                        ? "Blocked in browser settings"
                        : pushStatus === "unsupported"
                          ? `${browser} can't do push here`
                          : pushStatus === "needs-install"
                            ? "Install first, then open NGA from the Home Screen"
                            : "Even when the browser is closed"}
                  </p>
                </div>
              </div>
              {!pushEnabledOnServer ? (
                <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  <ShieldAlert className="h-4 w-4" /> Push isn't configured on the server yet.
                </p>
              ) : pushOn ? (
                <button
                  type="button"
                  onClick={turnOff}
                  disabled={busy !== null}
                  className="mt-3 w-full rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {busy === "off" ? "Turning off…" : "Turn off on this device"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pushStatus === "needs-install" ? () => setInstallOpen(true) : turnOn}
                  disabled={busy !== null || pushStatus === "unsupported"}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
                >
                  <BellRing className="h-4 w-4" />
                  {busy === "push" ? "Waiting for your answer…" : pushStatus === "needs-install" ? "Install to continue" : "Turn on notifications"}
                </button>
              )}
            </li>

            <li className="rounded-2xl bg-white p-4 text-slate-900 dark:bg-slate-900 dark:text-white">
              <div className="flex items-center gap-3">
                <StepDot n={3} done={testDone} active={activeStep === 3} />
                <div className="min-w-0">
                  <p className="font-semibold">Send a test</p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{testDone ? "Delivered" : "See one arrive now"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={sendTest}
                disabled={!pushOn || busy !== null}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Send className="h-4 w-4" /> {busy === "test" ? "Sending…" : "Send test notification"}
              </button>
            </li>
          </motion.ol>
        )}
      </AnimatePresence>

      {blockedHint && <UnblockHelp browser={browser} />}
      <InstallSheet isOpen={installOpen} onClose={() => setInstallOpen(false)} />
    </section>
  );
};
