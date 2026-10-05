import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, BellRing, CheckCircle2, ChevronDown, Download, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { API_BASE_URL } from "../../services/api";
import { isNgaDesktop, ngaDesktopVersion } from "../../desktop/ngaDesktop";
import { NGA_APPS, iconUrl, startUrl } from "./ngaApps";
import { InstallGuide } from "./InstallGuide";
import {
  OS_LABEL,
  REQUIREMENTS,
  detectOs,
  downloadUrl,
  formatSize,
  isNewer,
  primaryPlatform,
  type DesktopRelease,
  type DownloadPlatform,
} from "./desktopDownload";

/**
 * /apps: get NGA Desktop, the one app for NGA MIS, Task Mentor, Tendo and
 * Tupo on Windows and macOS (nga-desktop). The download fitting this
 * computer comes first; every download is counted by the API
 * (/desktop/download/:platform) and installed apps update themselves.
 * Phones, tablets, Chromebooks and Linux keep the web apps.
 */

const AppleLogo = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
    <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-2.99-.79-1.54.02-2.96.9-3.75 2.27-1.6 2.78-.41 6.89 1.15 9.14.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.41-3.66ZM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.76-.95 2.79 1.01.08 2.04-.51 2.67-1.27Z" />
  </svg>
);
const WindowsLogo = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={p.className}>
    <path d="M3 5.1 10.4 4v7.1H3V5.1Zm8.3-1.2L21 2.5v8.6h-9.7V3.9ZM3 12.9h7.4V20L3 18.9v-6Zm8.3 0H21v8.6l-9.7-1.4v-7.2Z" />
  </svg>
);
const osLogo = (p: DownloadPlatform, cls: string) =>
  p === "macos" ? <AppleLogo className={cls} /> : <WindowsLogo className={cls} />;

const FEATURES = [
  { icon: KeyRound, text: "Sign in once for all four apps" },
  { icon: BellRing, text: "Notifications from every app" },
  { icon: RefreshCw, text: "Updates itself" },
];

interface Stats {
  current_version: string | null;
  downloads: { total: number; people: number; by_platform: { platform: string; count: number }[] };
  installs: { active_30_days: number; on_current_version: number; windows: number; macos: number };
}

/** Admins (Usage analytics) only; anyone else gets nothing back and sees nothing. */
function useDownloadStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    // Plain fetch: the shared API client toasts on 403 and signs out on 401.
    fetch(`${API_BASE_URL.replace(/\/+$/, "")}/desktop/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data && setStats(j.data))
      .catch(() => {});
  }, []);
  return stats;
}

/** What NGA Desktop (bridge.js) offers MIS pages: 0.2.3 and later. */
interface NgaDesktopBridge {
  version: string;
  installUpdate: () => Promise<void>;
}
const desktopBridge = (): NgaDesktopBridge | null => {
  const b = (window as unknown as { ngaDesktop?: NgaDesktopBridge }).ngaDesktop;
  return b && typeof b.installUpdate === "function" ? b : null;
};

/**
 * Inside NGA Desktop: the version, and when a newer one is out, one click to
 * update (NGA installs its own signed update and restarts). Versions before
 * 0.2.3 can't be asked from a page: they point at the Update button instead.
 */
export const DesktopStatus: React.FC<{ current: string | null; latest: string | null }> = ({ current, latest }) => {
  const [state, setState] = useState<"idle" | "updating" | "failed">("idle");
  const [error, setError] = useState("");
  const outdated = !!(latest && current && isNewer(latest, current));
  const bridge = desktopBridge();
  const update = async () => {
    if (!bridge) return;
    setState("updating");
    try {
      await bridge.installUpdate(); // NGA restarts when done
    } catch (e) {
      setState("failed");
      const msg = String(e);
      setError(msg.startsWith("busy") ? msg.replace(/^busy:\s*/, "") + "." : "Try again, or use the Update button at the top of NGA.");
    }
  };
  return (
    <div className="rounded-2xl bg-white/15 p-5 backdrop-blur" role="status" data-testid="desktop-status">
      <p className="flex items-center gap-2 text-lg font-semibold">
        <CheckCircle2 className="h-5 w-5" /> You're using NGA Desktop{current ? ` ${current}` : ""}
      </p>
      {!outdated ? (
        <p className="mt-1 text-sm text-white/85">It updates itself. Nothing to download.</p>
      ) : bridge ? (
        <>
          <p className="mt-1 text-sm text-white/85">Version {latest} is ready.</p>
          <button
            type="button"
            onClick={update}
            disabled={state === "updating"}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-brand-700 shadow-lg transition hover:-translate-y-0.5 disabled:opacity-80"
          >
            {state === "updating" ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Updating… NGA restarts by itself
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> Update to {latest} now
              </>
            )}
          </button>
          {state === "failed" && <p className="mt-2 text-xs text-white/90">Couldn't update: {error}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-white/85">
          Version {latest} is ready: click <strong>Update</strong> at the top right of this window (next to the bell). NGA
          downloads it and restarts.
        </p>
      )}
    </div>
  );
};

export const AppsInstallerPage: React.FC = () => {
  const navigate = useNavigate();
  const os = useMemo(() => detectOs(), []);
  const primary = primaryPlatform(os);
  const inDesktop = isNgaDesktop();
  const desktopVersion = ngaDesktopVersion();
  const [release, setRelease] = useState<DesktopRelease | null>(null);
  const [failed, setFailed] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const stats = useDownloadStats();

  useEffect(() => {
    fetch(`${API_BASE_URL.replace(/\/+$/, "")}/desktop/release`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => setRelease(j.data))
      .catch(() => setFailed(true));
  }, []);

  const files = release?.downloads ?? {};
  const available = (Object.keys(files) as DownloadPlatform[]).filter((p) => files[p]);
  const offered: DownloadPlatform[] = primary && files[primary] ? [primary] : [];
  const others = available.filter((p) => !offered.includes(p));
  const stepsFor = primary === "macos" ? "macos" : "windows";

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/home"));
  const card = "rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </button>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">NGA Desktop</p>
          <a href="/home" className="rounded-xl px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-slate-100 dark:text-brand-200 dark:hover:bg-slate-800">
            Open NGA MIS
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-600 p-6 text-white shadow-xl sm:p-10">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="mb-4 flex -space-x-2">
                {NGA_APPS.map((a) => (
                  <img key={a.key} src={iconUrl(a)} alt={a.name} title={a.name} className="h-11 w-11 rounded-2xl bg-white p-1.5 shadow-md ring-2 ring-brand-600" />
                ))}
              </div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">All NGA apps in one desktop app</h1>
              <p className="mt-3 text-base text-white/85">
                NGA MIS, Task Mentor, Tendo and Tupo in one window, for Windows and macOS.
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {FEATURES.map(({ icon: Icon, text }) => (
                  <li key={text} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur">
                    <Icon className="h-4 w-4" /> {text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="w-full max-w-sm shrink-0 space-y-3" data-testid="download-box">
              {inDesktop ? (
                <DesktopStatus current={desktopVersion} latest={release?.version ?? null} />
              ) : !release && !failed ? (
                <div className="h-[132px] animate-pulse rounded-2xl bg-white/15" aria-label="Loading" />
              ) : failed || !release?.version ? (
                <div className="rounded-2xl bg-white/15 p-5 backdrop-blur" role="status">
                  <p className="text-lg font-semibold">{failed ? "Downloads are unavailable right now" : "Coming soon"}</p>
                  <p className="mt-1 text-sm text-white/85">
                    {failed ? "Try again in a moment." : "The first version of NGA Desktop is being prepared."} Until then, use the web apps below.
                  </p>
                </div>
              ) : (
                <>
                  {offered.map((p) => (
                    <a
                      key={p}
                      href={downloadUrl(p)}
                      className="group flex items-center gap-4 rounded-2xl bg-white px-5 py-4 text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
                      onClick={() => setShowSteps(true)}
                    >
                      {osLogo(p, "h-8 w-8 text-slate-900")}
                      <span className="flex-1">
                        <span className="block text-base font-bold">Download for {OS_LABEL[p]}</span>
                        <span className="block text-xs text-slate-500">
                          Version {release.version}
                          {formatSize(files[p]?.size) ? ` · ${formatSize(files[p]?.size)}` : ""}
                        </span>
                      </span>
                      <Download className="h-5 w-5 text-brand-600 transition group-hover:translate-y-0.5" />
                    </a>
                  ))}
                  {offered[0] && <p className="px-1 text-xs text-white/80">{REQUIREMENTS[offered[0]]}</p>}
                  {offered[0] === "macos" && (
                    <p className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white/85" data-testid="damaged-hint">
                      Saw “NGA is damaged and can't be opened”? That was an earlier download: download again, or use the
                      one-command install below.
                    </p>
                  )}
                  {!primary && (
                    <p className="rounded-2xl bg-white/15 p-4 text-sm backdrop-blur" role="status">
                      NGA Desktop runs on Windows and macOS computers. On this device, use the web apps below.
                    </p>
                  )}
                  {others.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1 text-sm">
                      <span className="text-white/75">{primary ? "Also for" : "Download for"}</span>
                      {others.map((p) => (
                        <a key={p} href={downloadUrl(p)} className="inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
                          {osLogo(p, "h-3.5 w-3.5")} {OS_LABEL[p]}
                        </a>
                      ))}
                    </div>
                  )}
                  {!!release.total_downloads && (
                    <p className="px-1 text-xs text-white/70">Downloaded {release.total_downloads.toLocaleString()} times</p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* How to install: download (one-time security step) or one command (no warning) */}
        {!inDesktop && primary && release?.version && (
          <section className={card}>
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              aria-expanded={showSteps}
              onClick={() => setShowSteps((s) => !s)}
            >
              <span className="text-base font-semibold text-slate-900 dark:text-white">How to install on {OS_LABEL[primary]}</span>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition ${showSteps ? "rotate-180" : ""}`} />
            </button>
            {showSteps && (
              <div className="mt-4">
                <InstallGuide os={stepsFor} />
              </div>
            )}
          </section>
        )}

        {/* Web apps (phones, tablets, Chromebooks, or the browser by choice) */}
        <section className={card}>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{primary ? "Prefer the browser?" : "Use the web apps"}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every NGA app also works in any browser, on any device.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {NGA_APPS.map((a) => (
              <a
                key={a.key}
                href={startUrl(a).replace("?source=pwa", "")}
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2.5 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <img src={iconUrl(a)} alt="" className="h-7 w-7 rounded-lg" />
                {a.name}
              </a>
            ))}
          </div>
        </section>

        {/* Admins: how many downloaded, how many use it */}
        {stats && (
          <section className={card} data-testid="download-stats">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              <BarChart3 className="h-5 w-5 text-brand-600" /> Downloads and installs
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Downloads", stats.downloads.total],
                ["People / devices", stats.downloads.people],
                ["Active installs (30 days)", stats.installs.active_30_days],
                [
                  `On ${stats.current_version ?? "latest"}`,
                  stats.installs.active_30_days
                    ? `${Math.round((stats.installs.on_current_version / stats.installs.active_30_days) * 100)}%`
                    : "–",
                ],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{typeof value === "number" ? value.toLocaleString() : value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {stats.downloads.by_platform.map((p) => `${OS_LABEL[p.platform as DownloadPlatform] ?? p.platform}: ${p.count}`).join(" · ") || "No downloads yet"}
              {" · "}Installs: Windows {stats.installs.windows}, macOS {stats.installs.macos}
            </p>
          </section>
        )}

        <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Downloads come from NGA's own server. Updates are signed and checked before they install.
        </p>
      </main>
    </div>
  );
};

export default AppsInstallerPage;
