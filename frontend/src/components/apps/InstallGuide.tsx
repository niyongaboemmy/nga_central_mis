import React, { useState } from "react";
import { Check, Copy, Download, ShieldCheck, Terminal } from "lucide-react";
import { INSTALL_STEPS, installCommand } from "./desktopDownload";

/**
 * How to install NGA Desktop, two ways (the /apps page):
 * - Download: the normal way, with pictures of the one-time security step
 *   (NGA isn't commercially signed yet, so macOS / Windows ask once).
 * - One command: no warning at all; the script checks the download's
 *   SHA-256 against NGA's published release before installing.
 */
export const InstallGuide: React.FC<{ os: "macos" | "windows" }> = ({ os }) => {
  const [tab, setTab] = useState<"download" | "command">("download");
  const tabBtn = (t: typeof tab, label: string, Icon: typeof Download) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
        tab === t
          ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div>
      <div role="tablist" className="inline-flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
        {tabBtn("download", "Download", Download)}
        {tabBtn("command", "No warnings: one command", Terminal)}
      </div>
      {tab === "download" ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <ol className="space-y-3">
            {INSTALL_STEPS[os].map((step, i) => (
              <li key={step} className="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div className="space-y-3" aria-label="What you'll see the first time">
            {os === "macos" ? <MacWarning /> : <WindowsWarning />}
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only the first time on each computer. Updates install by themselves, without this.
            </p>
          </div>
        </div>
      ) : (
        <CommandInstall os={os} />
      )}
    </div>
  );
};

const CommandInstall: React.FC<{ os: "macos" | "windows" }> = ({ os }) => {
  const [copied, setCopied] = useState(false);
  const cmd = installCommand(os);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* select the text by hand */
    }
  };
  const steps =
    os === "macos"
      ? ["Open Terminal (press ⌘ Space, type Terminal, press Return).", "Paste the command and press Return.", "NGA opens when it's installed."]
      : ["Open PowerShell (press Start, type PowerShell, press Enter).", "Paste the command and press Enter.", "NGA opens when it's installed."];
  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 dark:border-slate-700">
        <code data-testid="install-command" className="flex-1 overflow-x-auto whitespace-nowrap px-4 py-3 font-mono text-sm text-emerald-300">
          {cmd}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 border-l border-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s} className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <span className="mr-1 font-bold text-brand-600">{i + 1}.</span> {s}
          </li>
        ))}
      </ol>
      <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        It downloads NGA from NGA's own server and installs it only if its fingerprint (SHA-256) matches the published
        release. No admin password needed. Good for teachers and IT installing on many computers.
      </p>
    </div>
  );
};

/** A simplified picture of macOS's first-open dialog and where Open Anyway is. */
const MacWarning: React.FC = () => (
  <div className="space-y-2" data-testid="warning-guide-macos">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-sm font-semibold text-slate-900 dark:text-white">“NGA” Not Opened</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Apple could not verify “NGA” is free of malware…</p>
      <div className="mt-3 flex justify-end gap-2 text-xs font-semibold">
        <span className="rounded-md bg-slate-100 px-3 py-1 text-slate-500 dark:bg-slate-700 dark:text-slate-300">Move to Trash</span>
        <span className="rounded-md bg-brand-600 px-3 py-1 text-white ring-4 ring-brand-200 dark:ring-brand-500/30">Done</span>
      </div>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">System Settings › Privacy &amp; Security</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-slate-600 dark:text-slate-300">“NGA” was blocked to protect your Mac.</p>
        <span className="shrink-0 rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white ring-4 ring-brand-200 dark:ring-brand-500/30">
          Open Anyway
        </span>
      </div>
    </div>
  </div>
);

/** A simplified picture of SmartScreen and where Run anyway is. */
const WindowsWarning: React.FC = () => (
  <div className="space-y-2" data-testid="warning-guide-windows">
    <div className="rounded-2xl bg-[#0067b8] p-4 text-white shadow-sm">
      <p className="text-base font-semibold">Windows protected your PC</p>
      <p className="mt-1 text-xs text-white/80">Microsoft Defender SmartScreen prevented an unrecognized app from starting…</p>
      <p className="mt-2 inline-block rounded px-1 text-xs font-semibold underline ring-4 ring-white/40">More info</p>
    </div>
    <div className="rounded-2xl bg-[#0067b8] p-4 text-white shadow-sm">
      <p className="text-xs text-white/80">App: NGA_setup.exe · Publisher: Unknown publisher</p>
      <div className="mt-3 flex justify-end gap-2 text-xs font-semibold">
        <span className="rounded border border-white/80 px-3 py-1 ring-4 ring-white/40">Run anyway</span>
        <span className="rounded bg-white/15 px-3 py-1">Don't run</span>
      </div>
    </div>
  </div>
);

export default InstallGuide;
