import React, { useState } from "react";
import { Check, Copy, RotateCcw, Wrench } from "lucide-react";

/**
 * Chrome still lists NGA MIS as installed but can't open it as an app (its
 * launcher is gone), so it won't offer to install it again and no web page
 * can fix that. Only the person can clear the stuck entry in chrome://apps --
 * web pages can't open chrome:// addresses, so we hand them the address.
 */
export const RepairChromeApp: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
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
      role="alert"
      className={`rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 ${compact ? "p-3 text-sm" : "p-4 text-sm"}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        <Wrench className="h-4 w-4 flex-shrink-0" /> Repair NGA MIS in Chrome
      </p>
      <p className="mt-1 text-amber-800 dark:text-amber-200/90">
        Chrome still has an old NGA MIS entry but can't open it as an app, so it won't install it again. Clear it once:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Copy{" "}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-0.5 font-mono text-xs font-semibold text-amber-900 ring-1 ring-amber-300 transition hover:bg-white dark:bg-slate-900/60 dark:text-amber-100 dark:ring-amber-500/40"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} chrome://apps
          </button>{" "}
          and paste it into the address bar.
        </li>
        <li>
          Right-click <strong>NGA</strong> → <strong>Remove from Chrome</strong> (or Uninstall).
        </li>
        <li>Come back here and install again.</li>
      </ol>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
      >
        <RotateCcw className="h-4 w-4" /> I removed it — install now
      </button>
    </div>
  );
};

export default RepairChromeApp;
