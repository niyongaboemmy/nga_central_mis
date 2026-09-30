import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Download, ExternalLink, FileDown, Laptop, MonitorSmartphone, ShieldCheck, SkipForward, Sparkles } from "lucide-react";
import { promptInstall, usePwa } from "../../reminders/pwa";
import { InstallGuide } from "../reminders/InstallGuide";
import Modal from "../ui/Modal";
import {
  buildMobileConfig,
  buildRegFile,
  downloadText,
  emptyProgress,
  iconUrl,
  installHandoffUrl,
  loadProgress,
  markStep,
  NGA_APPS,
  nextStep,
  saveProgress,
  startUrl,
  webInstall,
  webInstallSupported,
  type NgaApp,
  type Progress,
} from "./ngaApps";

/**
 * /apps -- install every NGA app from one place (docs/APP_LAUNCH.md).
 * Public on purpose: a new phone or laptop can set everything up before
 * anyone signs in.
 */
const AppsInstallerPage: React.FC = () => {
  const pwa = usePwa();
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<NgaApp["key"] | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const here = typeof window !== "undefined" ? window.location.origin : "";
  const canWebInstall = webInstallSupported();

  // Coming back from another app's install card (?done=<key>).
  useEffect(() => {
    const url = new URL(window.location.href);
    const done = url.searchParams.get("done") as NgaApp["key"] | null;
    if (done && NGA_APPS.some((a) => a.key === done)) {
      setProgress((p) => markStep(p, done, "done"));
      setRunning(true);
      url.searchParams.delete("done");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);

  // This app installed (now or earlier) counts as done.
  useEffect(() => {
    const self = NGA_APPS.find((a) => a.origin === here);
    if (self && pwa.installed && progress[self.key] === "todo") setProgress((p) => markStep(p, self.key, "done"));
  }, [pwa.installed, here, progress]);

  useEffect(() => saveProgress(progress), [progress]);

  const next = nextStep(progress);
  const doneCount = NGA_APPS.filter((a) => progress[a.key] !== "todo").length;
  const pct = Math.round((doneCount / NGA_APPS.length) * 100);

  const returnUrl = (app: NgaApp) => `${here}/apps?done=${app.key}`;

  /** One click = one app. Must run inside the click (browser rule). */
  const installApp = async (app: NgaApp) => {
    setBusy(app.key);
    try {
      if (app.origin === here) {
        if (pwa.installed) {
          setProgress((p) => markStep(p, app.key, "done"));
        } else if (pwa.canPrompt || (navigator as any).install) {
          const outcome = await promptInstall();
          if (outcome === "accepted") setProgress((p) => markStep(p, app.key, "done"));
          else if (outcome === "unavailable") setGuideOpen(true);
        } else {
          setGuideOpen(true);
        }
        return;
      }
      if (canWebInstall && (await webInstall(app))) {
        setProgress((p) => markStep(p, app.key, "done"));
      }
    } finally {
      setBusy(null);
    }
  };

  const skip = (app: NgaApp) => setProgress((p) => markStep(p, app.key, "skipped"));
  const restart = () => {
    setProgress(NGA_APPS.reduce((p, a) => markStep(p, a.key, a.origin === here && pwa.installed ? "done" : "todo"), emptyProgress()));
    setRunning(true);
  };

  /** Props for the button/link that installs `app` from here. */
  const installAction = (app: NgaApp) => {
    // Other apps without the Web Install API: open them with their install card.
    const handoff = app.origin !== here && !canWebInstall;
    if (handoff) {
      return {
        as: "a" as const,
        props: {
          href: installHandoffUrl(app, returnUrl(app)),
          target: "_blank",
          rel: "noopener noreferrer",
          onClick: () => window.setTimeout(() => setProgress((p) => markStep(p, app.key, "done")), 300),
        },
      };
    }
    return { as: "button" as const, props: { type: "button" as const, onClick: () => void installApp(app) } };
  };

  const stepButton = (app: NgaApp, label: string, primary = true) => {
    const action = installAction(app);
    const className = primary
      ? "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60"
      : "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
    const content = (
      <>
        <Download className="h-4 w-4" /> {busy === app.key ? "Waiting for the browser…" : label}
      </>
    );
    return action.as === "a" ? (
      <a {...action.props} className={className}>
        {content}
      </a>
    ) : (
      <button {...action.props} disabled={busy !== null} className={className}>
        {content}
      </button>
    );
  };

  const policyFiles = useMemo(
    () => [
      { label: "Windows · Chrome (.reg)", file: "nga-apps-chrome.reg", type: "text/plain", build: () => buildRegFile("chrome") },
      { label: "Windows · Edge (.reg)", file: "nga-apps-edge.reg", type: "text/plain", build: () => buildRegFile("edge") },
      { label: "Mac · Chrome (.mobileconfig)", file: "nga-apps.mobileconfig", type: "application/x-apple-aspen-config", build: () => buildMobileConfig() },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-600 to-indigo-700 p-6 text-white shadow-float sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> New Generation Academy
              </p>
              <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Get all NGA apps on this device</h1>
              <p className="mt-2 text-sm text-white/85">
                Each app opens in its own window, starts faster and sends reminders even when the browser is closed. Your
                browser asks you to confirm each app once — one click per app, all from here.
              </p>
            </div>
            <div className="w-full max-w-xs">
              <div className="flex items-center justify-between text-xs font-semibold text-white/85">
                <span>
                  {doneCount} of {NGA_APPS.length} ready
                </span>
                <span>{pct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-label="Apps installed" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <motion.div className="h-full rounded-full bg-white" initial={false} animate={{ width: `${pct}%` }} />
              </div>
              {!running && next ? (
                <button
                  type="button"
                  onClick={() => {
                    setRunning(true);
                    // This app installs inside this very click (browser rule);
                    // the others follow as one-click steps below.
                    if (next.origin === here) void installApp(next);
                  }}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-brand-700 shadow-soft transition hover:bg-brand-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                >
                  <Download className="h-4 w-4" /> Install all apps
                </button>
              ) : !next ? (
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-5 w-5" /> All set.{" "}
                  <button type="button" onClick={restart} className="underline underline-offset-2">
                    Start again
                  </button>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {running && next && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            aria-live="polite"
            className="flex flex-col gap-4 rounded-3xl border border-brand-200 bg-white p-5 shadow-soft dark:border-brand-600/40 dark:bg-slate-900 sm:flex-row sm:items-center"
          >
            <img src={iconUrl(next)} alt="" className="h-14 w-14 rounded-2xl bg-slate-100 object-contain p-1.5 dark:bg-slate-800" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-200">
                Step {NGA_APPS.indexOf(next) + 1} of {NGA_APPS.length}
              </p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">Install {next.name}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {next.origin === here
                  ? "Confirm in your browser's install dialog."
                  : canWebInstall
                    ? "Your browser installs it straight from here — confirm in its dialog."
                    : `${next.name} opens in a new tab with its install button; you'll come back here after.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stepButton(next, `Install ${next.name}`)}
              <button
                type="button"
                onClick={() => skip(next)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <SkipForward className="h-4 w-4" /> Skip
              </button>
            </div>
          </motion.section>
        )}

        <section aria-label="NGA apps" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NGA_APPS.map((app) => {
            const status = progress[app.key];
            const isHere = app.origin === here;
            return (
              <div key={app.key} className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
                <img src={iconUrl(app)} alt="" className="h-14 w-14 flex-shrink-0 rounded-2xl bg-slate-100 object-contain p-1.5 dark:bg-slate-800" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 dark:text-white">
                    {app.name}
                    {status === "done" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-[11px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-100">
                        <Check className="h-3 w-3" /> {isHere && pwa.installed ? "Installed" : "Done"}
                      </span>
                    )}
                    {status === "skipped" && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Skipped</span>
                    )}
                  </p>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">{app.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {status !== "done" && stepButton(app, "Install", false)}
                    <a
                      href={startUrl(app)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:text-brand-200 dark:hover:bg-brand-600/15"
                    >
                      <ExternalLink className="h-4 w-4" /> Open
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <ShieldCheck className="h-5 w-5 text-brand-600 dark:text-brand-200" /> School computers: install everything in one step
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            On computers the school manages (joined to the school domain, or enrolled in MDM), IT applies one file and every
            NGA app installs silently for everyone, with notifications allowed. Browsers ignore these files on personal,
            unmanaged devices — use “Install all apps” above there.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {policyFiles.map((f) => (
              <button
                key={f.file}
                type="button"
                onClick={() => downloadText(f.file, f.build(), f.type)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <FileDown className="h-4 w-4" /> {f.label}
              </button>
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex gap-2">
              <Laptop className="h-3.5 w-3.5 flex-shrink-0 translate-y-0.5" /> Windows: deploy the .reg by Group Policy / Intune (or run it as admin on a
              domain-joined PC), then restart the browser.
            </li>
            <li className="flex gap-2">
              <MonitorSmartphone className="h-3.5 w-3.5 flex-shrink-0 translate-y-0.5" /> Mac: push the .mobileconfig with your MDM, then restart Chrome.
            </li>
          </ul>
        </section>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500 dark:text-slate-400">
          {canWebInstall ? "Your browser can install the NGA apps directly from this page." : "Tip: Chrome and Edge 156+ install each app straight from this page."}
          <a href="/home" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline dark:text-brand-200">
            Go to NGA MIS <ArrowRight className="h-3 w-3" />
          </a>
        </p>
      </div>

      <Modal isOpen={guideOpen} onClose={() => setGuideOpen(false)} title="Install NGA MIS" size="md">
        <InstallGuide
          onDone={() => {
            setGuideOpen(false);
            setProgress((p) => markStep(p, "mis", "done"));
          }}
        />
      </Modal>
    </div>
  );
};

export default AppsInstallerPage;
