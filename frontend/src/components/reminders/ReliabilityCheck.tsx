import React, { useState } from "react";
import { BatteryWarning, CheckCircle2, HelpCircle, Send } from "lucide-react";
import { remindersApi } from "../../api/reminders";
import { detectOem, OEM_TIPS, type PlatformInfo } from "../../reminders/platform";

type Stage = "idle" | "sent" | "ok" | "missing" | "error";

/**
 * "Did it arrive?" (proposal §7.6). A web app can't exempt itself from a phone
 * maker's battery saver, so when a test doesn't show up we walk the user
 * through their brand's settings instead.
 */
export const ReliabilityCheck: React.FC<{ platform: PlatformInfo; pushOn: boolean }> = ({ platform, pushOn }) => {
  const [stage, setStage] = useState<Stage>("idle");
  const oem = detectOem(typeof navigator === "undefined" ? "" : navigator.userAgent);
  const tips = platform.os === "android" ? OEM_TIPS[oem] : null;

  const run = async () => {
    try {
      const report = await remindersApi.test();
      setStage(report.pushDelivered > 0 ? "sent" : "error");
    } catch {
      setStage("error");
    }
  };

  return (
    <section aria-labelledby="reliability-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
      <h2 id="reliability-title" className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        <BatteryWarning className="h-5 w-5 text-amber-500" /> Reminder reliability check
      </h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Lock your {platform.mobile ? "phone" : "screen"} after pressing the button. A notification should appear within a
        few seconds.
      </p>

      {stage === "idle" && (
        <button
          type="button"
          onClick={run}
          disabled={!pushOn}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Send className="h-4 w-4" /> {pushOn ? "Start the check" : "Turn on notifications first"}
        </button>
      )}

      {stage === "sent" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
            <HelpCircle className="h-4 w-4 text-brand-500" /> Did the notification arrive?
          </span>
          <button type="button" onClick={() => setStage("ok")} className="rounded-xl bg-success-500 px-3 py-1.5 text-sm font-semibold text-white">
            Yes
          </button>
          <button type="button" onClick={() => setStage("missing")} className="rounded-xl bg-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-800 dark:bg-slate-700 dark:text-white">
            No
          </button>
        </div>
      )}

      {stage === "ok" && (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-success-700 dark:text-success-100">
          <CheckCircle2 className="h-4 w-4" /> Great — reminders reach this device reliably.
        </p>
      )}

      {(stage === "missing" || stage === "error") && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-semibold">
            {stage === "error" ? "The server couldn't reach this device." : "Your phone is probably holding notifications back."}
          </p>
          {tips ? (
            <>
              <p className="mt-1">On {tips.name} phones:</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                {tips.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-1">
              Check that notifications for this browser are allowed in your system settings and that Focus / Do Not
              Disturb is off.
            </p>
          )}
          <p className="mt-2">
            Still nothing? Add your timetable to your calendar app below — its alarms don't depend on the browser.{" "}
            <a className="font-semibold underline" href="https://dontkillmyapp.com/" target="_blank" rel="noreferrer">
              More phone-specific help
            </a>
          </p>
          <button type="button" onClick={() => setStage("idle")} className="mt-2 text-sm font-semibold underline">
            Try again
          </button>
        </div>
      )}
    </section>
  );
};
