import React, { useState } from "react";
import { AppWindow, Check, Copy } from "lucide-react";
import { openAppUrl } from "../../reminders/pwa";

/**
 * NGA MIS is installed, but Chrome opens its links in the browser: the app's
 * "Open supported links" setting is off (Chrome 139+ turns it on by default
 * only for new installs). No web page can change a Chrome setting or open a
 * chrome:// page, so: one switch, explained -- or Chrome's own "Open in app"
 * button in the address bar right now.
 */
export const OpenInAppGuide: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText("chrome://apps");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div
      role="status"
      className={`rounded-2xl border border-brand-200 bg-brand-50 text-slate-800 dark:border-brand-600/40 dark:bg-brand-600/10 dark:text-slate-100 ${compact ? "p-3 text-sm" : "p-4 text-sm"}`}
    >
      <p className="flex items-center gap-2 font-semibold text-brand-800 dark:text-brand-100">
        <AppWindow className="h-4 w-4 flex-shrink-0" /> Open NGA MIS in its app window
      </p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        NGA MIS is installed, but Chrome is set to open its links in the browser. Switch it once:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Copy{" "}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-0.5 font-mono text-xs font-semibold text-brand-800 ring-1 ring-brand-200 transition hover:bg-brand-50 dark:bg-slate-900/60 dark:text-brand-100 dark:ring-brand-600/40"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} chrome://apps
          </button>{" "}
          into the address bar, right-click <strong>NGA</strong> → <strong>App settings</strong>.
        </li>
        <li>
          Turn on <strong>Open supported links</strong>.
        </li>
      </ol>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Right now: click <strong>Open in app</strong> at the right of the address bar.
      </p>
      <a
        href={openAppUrl()}
        target="_blank"
        rel="noopener"
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200"
      >
        <AppWindow className="h-4 w-4" /> Done — open the app
      </a>
    </div>
  );
};

export default OpenInAppGuide;
