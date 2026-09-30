import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Download,
  ExternalLink,
  FileDown,
  HelpCircle,
  Laptop,
  Loader2,
  MonitorSmartphone,
  PartyPopper,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { getInstallDiagnostics, openAppUrl, promptInstall, refreshInstallCheck, usePwa } from "../../reminders/pwa";
import { InstallGuide } from "../reminders/InstallGuide";
import OpenInAppGuide from "./OpenInAppGuide";
import Modal from "../ui/Modal";
import {
  buildMobileConfig,
  buildRegFile,
  downloadText,
  emptyProgress,
  iconUrl,
  installedCount,
  installHandoffUrl,
  isFinished,
  isInstalled,
  clearReportCookie,
  loadProgress,
  markStep,
  NGA_APPS,
  nextStep,
  readInstallReport,
  readReportCookies,
  reconcileSelfStatus,
  saveProgress,
  startUrl,
  webInstall,
  webInstallSupported,
  type NgaApp,
  type Progress,
  type StepStatus,
} from "./ngaApps";

/**
 * /apps -- install every NGA app from one place (docs/APP_LAUNCH.md).
 * Public on purpose: a new phone or laptop can set everything up before
 * anyone signs in.
 *
 * Truthful by design: on desktop a site can't see whether another site's app
 * is installed, so each app's install card (ngaInstall.tsx) reports back --
 * live over postMessage to this tab, or via ?done= / ?skipped= when it
 * navigates back. Until it does, an app is "waiting", never "done".
 */

const STATUS_CHIP: Record<StepStatus, { label: string; className: string }> = {
  todo: { label: "Not installed", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  waiting: { label: "Waiting…", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" },
  done: { label: "Installed", className: "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-100" },
  already: { label: "Already installed", className: "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-100" },
  skipped: { label: "Skipped", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

const ProgressRing: React.FC<{ value: number; total: number }> = ({ value, total }) => {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <div className="relative h-28 w-28 flex-shrink-0" role="progressbar" aria-label="Apps installed" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-white/20" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className="stroke-white"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ type: "spring", stiffness: 80, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-2xl font-bold leading-none">
          {value}/{total}
        </span>
        <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-white/80">ready</span>
      </div>
    </div>
  );
};

const AppsInstallerPage: React.FC = () => {
  const pwa = usePwa();
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<NgaApp["key"] | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "info" | "warn" } | null>(null);
  const [helpFor, setHelpFor] = useState<NgaApp["key"] | null>(null);
  // Came back to this tab while an app was "waiting" with no report: it most
  // likely opened straight in its installed window (which can't message us).
  const [askOpened, setAskOpened] = useState<NgaApp["key"] | null>(null);
  const lastOpened = useRef<{ key: NgaApp["key"]; at: number } | null>(null);
  const here = typeof window !== "undefined" ? window.location.origin : "";
  // NGA MIS is installed but Chrome opens its links in the browser.
  const linksInBrowser = pwa.installed && pwa.linksOpenInBrowser;
  // /apps?diag=1 shows the raw install signals of this browser.
  const showDiag = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("diag");
  const [diagTick, setDiagTick] = useState(0);
  const canWebInstall = webInstallSupported();

  const set = useCallback((key: NgaApp["key"], status: StepStatus) => setProgress((p) => markStep(p, key, status)), []);
  const say = useCallback((text: string, tone: "ok" | "info" | "warn" = "ok") => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4500);
  }, []);
  const nameOf = (key: NgaApp["key"]) => NGA_APPS.find((a) => a.key === key)?.name ?? key;

  // Coming back from an app's install card in this same tab (?done= / ?skipped=).
  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const [param, status] of [
      ["done", "done"],
      ["skipped", "skipped"],
    ] as const) {
      const key = url.searchParams.get(param) as NgaApp["key"] | null;
      if (key && NGA_APPS.some((a) => a.key === key)) {
        set(key, status);
        setRunning(true);
        changed = true;
      }
      url.searchParams.delete(param);
    }
    if (changed) window.history.replaceState(window.history.state, "", url.toString());
  }, [set]);

  const applyReport = useCallback(
    (report: { key: NgaApp["key"]; status: "done" | "already" | "skipped" }) => {
      set(report.key, report.status);
      setRunning(true);
      setAskOpened((k) => (k === report.key ? null : k));
      say(
        report.status === "done"
          ? `${nameOf(report.key)} is installed and open`
          : report.status === "already"
            ? `${nameOf(report.key)} is installed — opened in its own window`
            : `${nameOf(report.key)} skipped`,
        report.status === "skipped" ? "info" : "ok",
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, say],
  );

  // Reports through the shared .amashuri.com cookie: on return to this tab,
  // and every 1.5 s while an app is being installed or opened.
  const pageStart = useRef(Date.now());
  const checkCookies = useCallback(() => {
    for (const r of readReportCookies(document.cookie)) {
      clearReportCookie(r.key);
      // Ignore leftovers from before this visit.
      if (r.at < pageStart.current - 60_000) continue;
      applyReport(r);
    }
  }, [applyReport]);
  const anyWaiting = NGA_APPS.some((a) => progress[a.key] === "waiting");
  useEffect(() => {
    checkCookies();
    const onBack = () => document.visibilityState === "visible" && checkCookies();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    const id = anyWaiting ? window.setInterval(checkCookies, 1500) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
      if (id) window.clearInterval(id);
    };
  }, [checkCookies, anyWaiting]);

  // Live messages from a card that does have an opener (older links).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const report = readInstallReport(event);
      if (!report) return;
      applyReport(report);
      window.focus();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [applyReport]);

  // This app's own status follows the browser's live answer, both ways: a
  // saved "installed" must not outlive an uninstall.
  useEffect(() => {
    const self = NGA_APPS.find((a) => a.origin === here);
    if (!self) return;
    const next = reconcileSelfStatus(progress[self.key], pwa);
    if (next !== progress[self.key]) set(self.key, next);
  }, [pwa, here, progress, set]);

  useEffect(() => saveProgress(progress), [progress]);

  const next = nextStep(progress);
  const ready = installedCount(progress);
  const finished = NGA_APPS.every((a) => isFinished(progress[a.key]));
  const returnUrl = (app: NgaApp) => `${here}/apps?done=${app.key}`;

  /**
   * Other apps are opened with a REAL link (see AppAction), never
   * window.open: Chrome sends a clicked link straight into an installed
   * app's window ("navigation capturing"), so an installed app just opens,
   * and one that isn't shows its one-click "Install & open" card. Chrome
   * only does that for links WITHOUT an opener, so apps report back through
   * a short cookie on .amashuri.com (read below), not postMessage.
   */
  const usesLink = (app: NgaApp) => app.origin !== here && !canWebInstall;
  const opened = (app: NgaApp) => {
    setRunning(true);
    setAskOpened(null);
    lastOpened.current = { key: app.key, at: Date.now() };
    set(app.key, "waiting");
  };

  // Back on this tab with no report after a while: ask, in one click.
  useEffect(() => {
    const onVisible = () => {
      const last = lastOpened.current;
      if (document.visibilityState !== "visible" || !last) return;
      window.setTimeout(() => {
        setProgress((p) => {
          if (p[last.key] === "waiting" && Date.now() - last.at > 1500) setAskOpened(last.key);
          return p;
        });
      }, 400);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  /** An install/open control for `app`: a real link for other apps, else a button. */
  const appAction = (app: NgaApp, className: string, children: React.ReactNode, disabled = false) =>
    usesLink(app) ? (
      <a href={installHandoffUrl(app, returnUrl(app))} target="_blank" rel="noopener" onClick={() => opened(app)} className={className}>
        {children}
      </a>
    ) : (
      <button type="button" onClick={() => void installApp(app)} disabled={disabled || busy !== null} className={className}>
        {children}
      </button>
    );

  /** One click = one app. Must run inside the click (browser rule). */
  const installApp = async (app: NgaApp) => {
    setRunning(true);
    if (app.origin === here) {
      if (pwa.installed && !pwa.canPrompt) {
        // Reinstall asked, but Chrome won't offer an install for an app it
        // has: explain how (remove in chrome://apps, then install here).
        set(app.key, "already");
        setHelpFor(app.key);
        say(`${app.name} is installed. To reinstall, remove it in chrome://apps first — steps below`, "info");
        return;
      }
      setBusy(app.key);
      try {
        // Removed while this page was open: Chrome hands out its install
        // dialog only on page load -- reload once to get it back.
        const chromium = ["chrome", "edge", "brave", "opera", "samsung"].includes(pwa.platform.browser);
        const reloadedOnce = (() => {
          try {
            return sessionStorage.getItem("nga.installer.reloadedForPrompt") === "1";
          } catch {
            return true;
          }
        })();
        if (!pwa.canPrompt && pwa.installCheck === "no" && chromium && !reloadedOnce) {
          try {
            sessionStorage.setItem("nga.installer.reloadedForPrompt", "1");
          } catch {
            /* ignore */
          }
          say("Getting the install ready…", "info");
          window.setTimeout(() => window.location.reload(), 500);
          return;
        }
        if (pwa.canPrompt || (navigator as any).install) {
          const outcome = await promptInstall();
          if (outcome === "accepted") {
            set(app.key, "done");
            say(`${app.name} is installed`);
          } else if (outcome === "unavailable") setGuideOpen(true);
        } else {
          setGuideOpen(true);
        }
      } finally {
        setBusy(null);
      }
      return;
    }
    if (canWebInstall) {
      setBusy(app.key);
      try {
        if (await webInstall(app)) {
          set(app.key, "done");
          say(`${app.name} is installed`);
          return;
        }
      } finally {
        setBusy(null);
      }
    }
  };

  const restart = () => {
    setProgress(NGA_APPS.reduce((p, a) => markStep(p, a.key, a.origin === here ? reconcileSelfStatus("todo", pwa) : "todo"), emptyProgress()));
    setRunning(true);
  };

  const goBack = () => {
    const sameOriginReferrer = (() => {
      try {
        return document.referrer && new URL(document.referrer).origin === window.location.origin;
      } catch {
        return false;
      }
    })();
    if (sameOriginReferrer && window.history.length > 1) window.history.back();
    else window.location.assign("/home");
  };

  const policyFiles = useMemo(
    () => [
      { label: "Windows · Chrome (.reg)", file: "nga-apps-chrome.reg", type: "text/plain", build: () => buildRegFile("chrome") },
      { label: "Windows · Edge (.reg)", file: "nga-apps-edge.reg", type: "text/plain", build: () => buildRegFile("edge") },
      { label: "Mac · Chrome (.mobileconfig)", file: "nga-apps.mobileconfig", type: "application/x-apple-aspen-config", build: () => buildMobileConfig() },
    ],
    [],
  );

  const primaryBtn =
    "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-60 dark:focus-visible:ring-brand-600/40";
  const ghostBtn =
    "inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-300 dark:hover:bg-slate-800";
  const outlineBtn =
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

  const installLabel = (app: NgaApp) => (busy === app.key ? "Waiting for the browser…" : `Install & open ${app.name}`);
  const stepHint = (app: NgaApp) =>
    app.origin === here
      ? "Your browser shows its install dialog — confirm it."
      : canWebInstall
        ? "Your browser installs it straight from here — confirm in its dialog."
        : `Already installed? It opens straight in its own window. If not, its tab asks once — “Install & open”. This page updates by itself.`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={goBack} className={ghostBtn} aria-label="Back">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </button>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">NGA apps</p>
          <a href="/home" className={`${ghostBtn} text-brand-700 dark:text-brand-200`}>
            Open NGA MIS
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-float sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0 max-w-xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" /> New Generation Academy
              </p>
              <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{finished ? "You're all set" : "Get all NGA apps on this device"}</h1>
              <p className="mt-2 text-sm text-white/85">
                {finished
                  ? "Every NGA app you chose opens in its own window and can remind you even when the browser is closed."
                  : "Each app opens in its own window, starts faster and sends reminders even when the browser is closed. Your browser asks you to confirm each app once — we'll guide you, one click per app."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {!finished && next ? (
                  progress[next.key] === "waiting" ? (
                    <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/20 px-5 py-3 text-sm font-bold">
                      <Loader2 className="h-4 w-4 animate-spin" /> Waiting for {next.name}…
                    </span>
                  ) : (
                    appAction(
                      next,
                      "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-soft transition hover:bg-brand-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:opacity-70",
                      <>
                        <Download className="h-4 w-4" /> {running ? `Continue: ${next.name}` : "Install all apps"}
                      </>,
                    )
                  )
                ) : (
                  <button
                    type="button"
                    onClick={restart}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold transition hover:bg-white/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
                  >
                    <RotateCcw className="h-4 w-4" /> Start again
                  </button>
                )}
              </div>
            </div>
            <ProgressRing value={ready} total={NGA_APPS.length} />
          </div>

          {/* Stepper */}
          <ol className="relative -mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Install steps">
            {NGA_APPS.map((app, i) => {
              const status = progress[app.key];
              const current = next?.key === app.key && running;
              return (
                <li key={app.key} className="flex-shrink-0">
                  <a
                    href={`#app-${app.key}`}
                    className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                      current ? "bg-white/20 ring-white/40" : "ring-white/15 hover:bg-white/10"
                    }`}
                    aria-current={current ? "step" : undefined}
                  >
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isInstalled(status) ? "bg-white text-brand-700" : status === "skipped" ? "bg-white/20 text-white/70" : "bg-white/15 text-white"
                      }`}
                    >
                      {isInstalled(status) ? (
                        <Check className="h-4 w-4" />
                      ) : status === "waiting" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : status === "skipped" ? (
                        <SkipForward className="h-3.5 w-3.5" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold">{app.name}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Live status */}
        <div aria-live="polite" className="min-h-0">
          <AnimatePresence>
            {notice && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ${
                  notice.tone === "ok"
                    ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-100"
                    : notice.tone === "warn"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" /> {notice.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Current step */}
        <AnimatePresence mode="wait">
          {running && next && (
            <motion.section
              key={`${next.key}-${progress[next.key]}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-3xl border border-brand-200 bg-white p-5 shadow-soft dark:border-brand-600/40 dark:bg-slate-900 sm:p-6"
            >
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <img src={iconUrl(next)} alt="" className="h-14 w-14 rounded-2xl bg-slate-100 object-contain p-2 dark:bg-slate-800 sm:h-16 sm:w-16" />
                  {progress[next.key] === "waiting" && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex h-4 w-4 rounded-full bg-amber-500" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-200">
                    Step {NGA_APPS.indexOf(next) + 1} of {NGA_APPS.length}
                  </p>
                  <p className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
                    {progress[next.key] === "waiting" ? `Finish in ${next.name}` : `Install ${next.name}`}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {progress[next.key] === "waiting" ? (
                      <>
                        Press <strong>Install &amp; open {next.name}</strong> there and confirm — it opens in its own window. If it opened as an app straight
                        away, it's already installed.
                      </>
                    ) : (
                      stepHint(next)
                    )}
                  </p>
                </div>
              </div>
              {askOpened === next.key && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800 dark:bg-brand-600/15 dark:text-brand-100"
                  role="status"
                >
                  Did {next.name} open in its own app window? Then it's already installed — confirm below.
                </motion.p>
              )}
              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:items-center">
                {progress[next.key] === "waiting" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        set(next.key, "already");
                        setAskOpened(null);
                        say(`${next.name} is installed`);
                      }}
                      className={askOpened === next.key ? primaryBtn : outlineBtn}
                    >
                      <Check className="h-4 w-4" /> {askOpened === next.key ? "Yes, it opened as an app" : "It's installed"}
                    </button>
                    {appAction(
                      next,
                      askOpened === next.key ? outlineBtn : primaryBtn,
                      <>
                        <ExternalLink className="h-4 w-4" /> Open {next.name} again
                      </>,
                    )}
                  </>
                ) : (
                  appAction(
                    next,
                    primaryBtn,
                    <>
                      {busy === next.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {installLabel(next)}
                    </>,
                  )
                )}
                <button
                  type="button"
                  onClick={() => {
                    // Also releases a browser dialog that never answered.
                    setBusy(null);
                    set(next.key, "skipped");
                  }}
                  className={`${ghostBtn} sm:ml-auto`}
                >
                  <SkipForward className="h-4 w-4" /> Skip
                </button>
              </div>
            </motion.section>
          )}
          {running && finished && (
            <motion.section
              key="finished"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-4 rounded-3xl border border-success-200 bg-success-50 p-5 dark:border-success-500/30 dark:bg-success-500/10"
            >
              <motion.span initial={{ rotate: -20, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 12 }}>
                <PartyPopper className="h-9 w-9 text-success-600 dark:text-success-100" />
              </motion.span>
              <div>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {ready === NGA_APPS.length ? "All four NGA apps are installed" : `${ready} of ${NGA_APPS.length} apps installed`}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Find them in your dock, taskbar or app launcher. You can install a skipped one below any time.
                </p>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Apps */}
        <section aria-label="NGA apps" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {NGA_APPS.map((app) => {
            const status = progress[app.key];
            const chip = STATUS_CHIP[status];
            const current = running && next?.key === app.key;
            const installedHere = isInstalled(status);
            const openHref = app.origin === here ? openAppUrl() : startUrl(app);
            const iconBtn =
              "inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-brand-200";
            return (
              <motion.article
                layout
                id={`app-${app.key}`}
                key={app.key}
                className={`flex h-full scroll-mt-24 flex-col rounded-3xl border bg-white p-5 shadow-soft transition dark:bg-slate-900 ${
                  current ? "border-brand-300 ring-2 ring-brand-200 dark:border-brand-600/60 dark:ring-brand-600/30" : "border-slate-200 dark:border-slate-700/60"
                }`}
              >
                <div className="flex items-start gap-4">
                  <img src={iconUrl(app)} alt="" className="h-14 w-14 flex-shrink-0 rounded-2xl bg-slate-100 object-contain p-1.5 dark:bg-slate-800" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{app.name}</h2>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>
                        {installedHere ? <Check className="h-3 w-3" /> : status === "waiting" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleDashed className="h-3 w-3" />}
                        {chip.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{app.description}</p>
                  </div>
                </div>

                {app.origin === here && linksInBrowser && (
                  <div className="mt-4">
                    <OpenInAppGuide compact />
                  </div>
                )}

                <div className="min-h-4 flex-1" aria-hidden />
                <div className="flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {installedHere ? (
                      <>
                        <a href={openHref} target="_blank" rel="noopener" className={`${primaryBtn} px-4 py-2.5`}>
                          <ExternalLink className="h-4 w-4" /> Open app
                        </a>
                        {appAction(
                          app,
                          `${ghostBtn} px-3 py-2.5`,
                          <>
                            <RotateCcw className="h-4 w-4" /> Reinstall
                          </>,
                        )}
                      </>
                    ) : (
                      appAction(
                        app,
                        `${primaryBtn} px-4 py-2.5`,
                        <>
                          {busy === app.key ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : status === "waiting" ? (
                            <ExternalLink className="h-4 w-4" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          {status === "waiting" ? "Open again" : "Install & open"}
                        </>,
                      )
                    )}
                  </div>
                  {!installedHere && (
                    <a href={openHref} target="_blank" rel="noopener" className={iconBtn} title={`Open ${app.name}`} aria-label={`Open ${app.name}`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setHelpFor((k) => (k === app.key ? null : app.key))}
                    aria-expanded={helpFor === app.key}
                    title="Trouble installing or opening?"
                    aria-label={`Help with ${app.name}`}
                    className={`${iconBtn} ${helpFor === app.key ? "bg-slate-100 text-brand-700 dark:bg-slate-800 dark:text-brand-200" : ""}`}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {helpFor === app.key && (
                    <motion.ul
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-3 space-y-1.5 overflow-hidden rounded-2xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"
                    >
                      <li>• Install: the install icon at the right of the address bar, or menu ⋮ → “Install {app.name}”.</li>
                      <li>
                        • Opens in a browser tab although installed? In <code className="text-xs">chrome://apps</code> right-click it → App settings → turn on “Open
                        supported links”.
                      </li>
                      <li>
                        • Reinstall: remove it in <code className="text-xs">chrome://apps</code>, then press Install &amp; open here.
                      </li>
                      {status === "waiting" && (
                        <li>
                          • Installed already?{" "}
                          <button type="button" className="font-semibold text-brand-700 underline dark:text-brand-200" onClick={() => set(app.key, "done")}>
                            Mark {app.name} as installed
                          </button>
                        </li>
                      )}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </section>

        {/* IT */}
        <details className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-700/60 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-slate-900 dark:text-white">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand-600 dark:text-brand-200" /> For IT: install everything on school computers in one step
            </span>
            <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            On computers the school manages (joined to the school domain, or enrolled in MDM), IT applies one file and every NGA app
            installs silently for everyone, with notifications allowed. Browsers ignore these files on personal, unmanaged devices.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {policyFiles.map((f) => (
              <button key={f.file} type="button" onClick={() => downloadText(f.file, f.build(), f.type)} className={outlineBtn}>
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
        </details>

        {showDiag && (
          <section aria-label="Install diagnostics" className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900 dark:text-white">Install diagnostics (this browser)</h2>
              <button
                type="button"
                className={outlineBtn}
                onClick={async () => {
                  await refreshInstallCheck();
                  setDiagTick((n) => n + 1);
                }}
              >
                <RotateCcw className="h-4 w-4" /> Re-check now
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-slate-50 p-3 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              {JSON.stringify({ ...getInstallDiagnostics(), tick: diagTick, misStatusOnThisPage: progress.mis }, null, 2)}
            </pre>
          </section>
        )}

        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          {canWebInstall ? "Your browser can install the NGA apps directly from this page." : "Tip: Chrome and Edge 156+ install each app straight from this page."}
        </p>
      </main>

      <Modal isOpen={guideOpen} onClose={() => setGuideOpen(false)} title="Install NGA MIS" size="md">
        <InstallGuide
          onDone={() => {
            setGuideOpen(false);
            set("mis", "done");
          }}
        />
      </Modal>
    </div>
  );
};

export default AppsInstallerPage;
