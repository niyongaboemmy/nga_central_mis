import { useSyncExternalStore } from "react";
import { describePlatform, readEnv, type PlatformInfo } from "./platform";

/**
 * Installable-app plumbing (REMINDERS_SOLUTION_PROPOSAL.md §7): one service
 * worker for the whole origin, the captured `beforeinstallprompt`, and a tiny
 * store React components subscribe to.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/**
 * The browser's own answer to "is NGA MIS installed here right now?"
 * (navigator.getInstalledRelatedApps + manifest related_applications with
 * the app id; desktop Chrome 140+, Android). "unknown" where the browser
 * can't say (Safari, Firefox) -- then a remembered note is the fallback.
 */
export type InstallCheck = "yes" | "no" | "unknown";

interface PwaState {
  platform: PlatformInfo;
  installed: boolean;
  /** Live, browser-confirmed install state (see InstallCheck). */
  installCheck: InstallCheck;
  /** Running in a browser tab (not the installed app window). */
  inBrowser: boolean;
  /**
   * NGA MIS is installed, but "Open app" landed in a browser tab: Chrome's
   * per-app "Open supported links" is off (Chrome 139+ turns it on by default
   * only for new installs). A page can't change it -- the person switches it
   * once in the app's Chrome settings, or uses the address bar's "Open in app".
   */
  linksOpenInBrowser: boolean;
  /** Chromium handed us its install prompt. */
  canPrompt: boolean;
  /** <install> element (origin trial, Chrome/Edge 148+). */
  hasInstallElement: boolean;
  registration: ServiceWorkerRegistration | null;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installCheck: InstallCheck = "unknown";
/**
 * Raw signals, kept for the rule below and for /apps?diag=1:
 * - lastRelated: what getInstalledRelatedApps last returned
 * - sawNotInstalled: it answered "not installed" at least once this visit
 * - bipAt: when Chrome offered installation (beforeinstallprompt)
 */
const diag = { lastRelated: "not asked yet", sawNotInstalled: false, bipAt: 0 as number, leftoverRecord: false, checks: 0 };
export const getInstallDiagnostics = () => ({
  ...diag,
  linksOpenInBrowserSince: readRaw(LINKS_IN_BROWSER_KEY),
  installCheck,
  canPrompt: Boolean(deferredPrompt),
  standalone: typeof window !== "undefined" && Boolean(window.matchMedia?.("(display-mode: standalone)").matches),
  rememberedNote: readFlag(INSTALLED_KEY),
  api: typeof navigator !== "undefined" && typeof (navigator as any).getInstalledRelatedApps === "function",
  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
});
const listeners = new Set<() => void>();

const compute = (): PwaState => {
  const env = readEnv(Boolean(deferredPrompt));
  return {
    platform: describePlatform(env),
    // A remembered note is only trusted when the browser can't answer: it
    // goes stale when the app is uninstalled (no event for that).
    // The browser's live answer decides; a remembered note only where the
    // browser can't answer (and never while Chrome offers to install).
    installed:
      env.standalone || installCheck === "yes" || (installCheck === "unknown" && !deferredPrompt && readFlag(INSTALLED_KEY)),
    installCheck: env.standalone ? "yes" : installCheck === "unknown" && deferredPrompt ? "no" : installCheck,
    inBrowser: !env.standalone,
    // Only meaningful while installed: an install offer means not installed.
    linksOpenInBrowser: !env.standalone && !deferredPrompt && Boolean(readRaw(LINKS_IN_BROWSER_KEY)),
    canPrompt: Boolean(deferredPrompt),
    hasInstallElement: typeof window !== "undefined" && "HTMLInstallElement" in window,
    registration: currentRegistration,
  };
};

let currentRegistration: ServiceWorkerRegistration | null = null;
let snapshot: PwaState | null = null;

const emit = () => {
  snapshot = compute();
  listeners.forEach((l) => l());
};

export const getPwaState = (): PwaState => {
  if (!snapshot) snapshot = compute();
  return snapshot;
};

export const subscribePwa = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePwa = () => useSyncExternalStore(subscribePwa, getPwaState, getPwaState);

// ─── storage helpers (per-viewer conveniences only) ─────────────────────────

const INSTALLED_KEY = "nga.pwa.installed";
/**
 * An "Open app" link (…&nga_open=1) that lands in a browser TAB means Chrome
 * did not open NGA MIS in its app window: either it isn't installed (then
 * Chrome offers installation) or it is installed with "Open supported links"
 * off. Cleared when MIS runs as the app, on a fresh install, or once Chrome
 * no longer lists the app.
 */
const LINKS_IN_BROWSER_KEY = "nga.pwa.linksOpenInBrowser";
/** Superseded marker from an earlier release (misread the tab as "not installed"). */
const LEGACY_NOT_OPENABLE_KEY = "nga.pwa.notOpenable";
const readRaw = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const dropKey = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};
/** The link that opens NGA MIS in its app window, and proves whether it can. */
export const openAppUrl = () => `${window.location.origin}/home?source=pwa&nga_open=1`;
const INSTALL_SNOOZE_KEY = "nga.pwa.installSnoozedUntil";
const VISITS_KEY = "nga.pwa.visits";

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
const writeItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
};

export const INSTALL_SNOOZE_DAYS = 14;

export const snoozeInstallPrompt = (now = Date.now()) =>
  writeItem(INSTALL_SNOOZE_KEY, String(now + INSTALL_SNOOZE_DAYS * 86_400_000));

export const installPromptSnoozed = (now = Date.now()) => {
  try {
    return Number(localStorage.getItem(INSTALL_SNOOZE_KEY) || 0) > now;
  } catch {
    return false;
  }
};

/** Counts app opens (once per session) -- never nag on the very first visit. */
export const countVisit = () => {
  try {
    if (sessionStorage.getItem(VISITS_KEY)) return Number(localStorage.getItem(VISITS_KEY) || 1);
    sessionStorage.setItem(VISITS_KEY, "1");
    const n = Number(localStorage.getItem(VISITS_KEY) || 0) + 1;
    localStorage.setItem(VISITS_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
};

// ─── live install check ──────────────────────────────────────────────────────

const setInstallCheck = (next: InstallCheck) => {
  if (next === "yes") writeItem(INSTALLED_KEY, "1");
  if (next === "no") {
    try {
      localStorage.removeItem(INSTALLED_KEY);
    } catch {
      /* ignore */
    }
  }
  if (next === installCheck) return;
  installCheck = next;
  emit();
};

/** Ask the browser again (on load, on return to the tab, after installing). */
export const refreshInstallCheck = async (): Promise<InstallCheck> => {
  if (typeof window === "undefined") return "unknown";
  if (window.matchMedia?.("(display-mode: standalone)").matches) {
    dropKey(LINKS_IN_BROWSER_KEY);
    setInstallCheck("yes");
    return "yes";
  }
  const fn = (navigator as any).getInstalledRelatedApps;
  if (typeof fn !== "function") return installCheck;
  try {
    const apps: Array<{ platform?: string }> = await fn.call(navigator);
    diag.checks += 1;
    diag.lastRelated = JSON.stringify(apps);
    const listed = Array.isArray(apps) && apps.some((a) => a?.platform === "webapp");
    if (!listed) {
      diag.sawNotInstalled = true;
      dropKey(LINKS_IN_BROWSER_KEY);
      diag.leftoverRecord = false;
      setInstallCheck("no");
      return "no";
    }
    // Listed as installed while Chrome also offers to install it here, and
    // it never answered "not installed" this visit: a leftover record (app
    // removed from this device, e.g. its launcher deleted, while Chrome's
    // list still has it). It can't be opened as an app -- not installed here.
    if (deferredPrompt && !diag.sawNotInstalled) {
      diag.leftoverRecord = true;
      setInstallCheck("no");
      return "no";
    }
    // Installed (or installed since this page loaded, e.g. from Chrome's
    // menu): any old install offer is dead.
    diag.leftoverRecord = false;
    deferredPrompt = null;
    setInstallCheck("yes");
    return "yes";
  } catch {
    return installCheck;
  }
};

/** Test hook. */
export const resetInstallCheckForTests = () => {
  installCheck = "unknown";
  deferredPrompt = null;
  Object.assign(diag, { lastRelated: "not asked yet", sawNotInstalled: false, bipAt: 0, leftoverRecord: false, checks: 0 });
  dropKey(LINKS_IN_BROWSER_KEY);
  emit();
};

// ─── lifecycle ───────────────────────────────────────────────────────────────

let started = false;

/** Wire the install events once, as early as possible (main.tsx). */
export const initPwa = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  clearLegacySnooze();
  captureLaunchMarker();
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chromium's mini-infobar away; we show our own, better-timed card.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    // Chromium fires this only when MIS is NOT installed here -- the
    // authoritative answer. Drop a stale "installed" note (installed once,
    // later uninstalled), or the install prompt never comes back.
    try {
      localStorage.removeItem(INSTALLED_KEY);
    } catch {
      /* ignore */
    }
    installCheck = "no";
    diag.bipAt = Date.now();
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    // A fresh install gets Chrome's default: links open in the app.
    dropKey(LINKS_IN_BROWSER_KEY);
    setInstallCheck("yes");
    emit();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", emit);
  // Installed or removed while this page was open elsewhere: re-ask when
  // the person comes back to it.
  void refreshInstallCheck();
  const recheck = () => {
    if (document.visibilityState === "visible") void refreshInstallCheck();
  };
  document.addEventListener("visibilitychange", recheck);
  window.addEventListener("focus", recheck);
  // Another MIS tab learned something (e.g. "Open app" landed in a tab).
  window.addEventListener("storage", (e) => {
    if (e.key === LINKS_IN_BROWSER_KEY || e.key === INSTALLED_KEY) void refreshInstallCheck().then(emit);
  });
  // Installed or removed while this page stays on screen (Chrome's own
  // dialog, chrome://apps): a cheap re-check every 10 s while visible.
  window.setInterval(recheck, 10_000);
  consumeLaunches();
  void registerAppServiceWorker();
};

/**
 * Links into MIS that Chrome captures into the installed app window
 * (manifest launch_handler: focus-existing) only *focus* that window; the
 * target URL arrives through the Launch Handler API. Route it inside the SPA
 * -- pushState + popstate is what React Router's BrowserRouter listens to.
 */
export const routeLaunch = (targetURL: string | undefined, loc: Location = window.location) => {
  if (!targetURL) return false;
  let url: URL;
  try {
    url = new URL(targetURL);
  } catch {
    return false;
  }
  if (url.origin !== loc.origin) return false;
  const next = url.pathname + url.search + url.hash;
  if (next === loc.pathname + loc.search + loc.hash) return false;
  window.history.pushState(null, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
  return true;
};

const consumeLaunches = () => {
  const queue = (window as any).launchQueue;
  if (!queue?.setConsumer) return;
  queue.setConsumer((params: { targetURL?: string }) => {
    routeLaunch(params?.targetURL);
  });
};

let registering: Promise<ServiceWorkerRegistration | null> | null = null;

/** Register /sw.js (the only worker for scope "/"). Safe to call repeatedly. */
export const registerAppServiceWorker = (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  if (!registering) {
    registering = navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        currentRegistration = reg;
        emit();
        return reg;
      })
      .catch(() => null);
  }
  return registering;
};

/** The registration once it is active (push subscribe needs an active worker). */
export const readyRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  const reg = await registerAppServiceWorker();
  if (!reg) return null;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
    ]);
  } catch {
    return null;
  }
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/** Show the browser's install dialog: <install>-era API first, then beforeinstallprompt. */
export const promptInstall = async (): Promise<InstallOutcome> => {
  const nav: any = navigator;
  if (!deferredPrompt && typeof nav.install === "function") {
    try {
      await nav.install();
      writeItem(INSTALLED_KEY, "1");
      emit();
      return "accepted";
    } catch {
      /* fall through */
    }
  }
  if (!deferredPrompt) return "unavailable";
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  await promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  if (outcome === "accepted") writeItem(INSTALLED_KEY, "1");
  else snoozeInstallPrompt();
  emit();
  return outcome;
};

// ─── "opened from another installed NGA app" ─────────────────────────────────
// Other apps' launchers add `nga_launch=app` when they run installed
// (docs/APP_LAUNCH.md). If MIS then lands in a browser tab, it asks to be
// installed right away instead of waiting for the usual second-visit nudge.
const LAUNCHED_FROM_APP_KEY = "nga.launchedFromApp";
const LAUNCH_ASK_DONE_KEY = "nga.launchInstallAsked";

const INSTALL_REQUESTED_KEY = "nga.installRequested";
const INSTALL_RETURN_KEY = "nga.installReturn";

/** Only ever send people back to an NGA page (never an arbitrary URL). */
export const safeReturnUrl = (raw: string | null): string | null => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const ok = url.protocol === "https:" && (url.hostname === "amashuri.com" || url.hostname.endsWith(".amashuri.com"));
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
};

export const captureLaunchMarker = () => {
  const url = new URL(window.location.href);
  let changed = false;
  try {
    if (url.searchParams.get("nga_launch") === "app") {
      sessionStorage.setItem(LAUNCHED_FROM_APP_KEY, "1");
      url.searchParams.delete("nga_launch");
      changed = true;
    }
    // "Open app" probe: in the app window = installed; in a tab = Chrome
    // couldn't open the app, so it isn't installed here -- say so and ask.
    localStorage.removeItem(LEGACY_NOT_OPENABLE_KEY);
    if (url.searchParams.get("nga_open") === "1") {
      const standalone = Boolean(window.matchMedia?.("(display-mode: standalone)").matches);
      if (standalone) localStorage.removeItem(LINKS_IN_BROWSER_KEY);
      else {
        // Landed in a tab: show the sheet -- it offers the install when MIS
        // isn't installed, or how to open it as an app when it is.
        localStorage.setItem(LINKS_IN_BROWSER_KEY, String(Date.now()));
        sessionStorage.setItem(INSTALL_REQUESTED_KEY, "1");
      }
      url.searchParams.delete("nga_open");
      changed = true;
    }
    // Sent by the NGA installer (/apps on this or another app): always ask.
    if (url.searchParams.get("nga_install") === "1") {
      sessionStorage.setItem(INSTALL_REQUESTED_KEY, "1");
      const back = safeReturnUrl(url.searchParams.get("return"));
      if (back) sessionStorage.setItem(INSTALL_RETURN_KEY, back);
      url.searchParams.delete("nga_install");
      url.searchParams.delete("return");
      changed = true;
    }
  } catch {
    /* storage blocked: markers are a convenience */
  }
  if (changed && !url.searchParams.has("code")) window.history.replaceState(window.history.state, "", url.toString());
};

export const installRequested = () => {
  try {
    return sessionStorage.getItem(INSTALL_REQUESTED_KEY) === "1";
  } catch {
    return false;
  }
};
export const installReturnUrl = () => {
  try {
    return sessionStorage.getItem(INSTALL_RETURN_KEY);
  } catch {
    return null;
  }
};
export const clearInstallRequest = () => {
  try {
    sessionStorage.removeItem(INSTALL_REQUESTED_KEY);
  } catch {
    /* ignore */
  }
};

// ─── automatic prompt on load (not installed here) ───────────────────────────
// "Not now" hides the sheet until the browser is reopened; the corner
// Install button stays available. (A 24 h snooze used to hide the only way
// to install for a day -- it is cleared on start.)
const LEGACY_AUTO_SNOOZE_KEY = "nga.pwa.autoPromptSnoozedUntil";
const AUTO_DISMISS_KEY = "nga.pwa.autoPromptDismissedThisSession";
const INSTALL_BUTTON_HIDDEN_KEY = "nga.pwa.installButtonHidden";

const sessionFlag = (key: string) => {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const setSessionFlag = (key: string) => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
};

export const snoozeAutoPrompt = () => setSessionFlag(AUTO_DISMISS_KEY);
export const autoPromptSnoozed = () => sessionFlag(AUTO_DISMISS_KEY);
export const hideInstallButton = () => setSessionFlag(INSTALL_BUTTON_HIDDEN_KEY);
export const installButtonHidden = () => sessionFlag(INSTALL_BUTTON_HIDDEN_KEY);
export const clearLegacySnooze = () => {
  try {
    localStorage.removeItem(LEGACY_AUTO_SNOOZE_KEY);
  } catch {
    /* ignore */
  }
};

/** Does the browser say MIS is installed on this device right now? (see refreshInstallCheck) */
export const checkInstalledHere = async (): Promise<boolean> => (await refreshInstallCheck()) === "yes";

/** True once per session when MIS was opened from another installed NGA app. */
export const shouldAskInstallFromLaunch = () => {
  try {
    return sessionStorage.getItem(LAUNCHED_FROM_APP_KEY) === "1" && sessionStorage.getItem(LAUNCH_ASK_DONE_KEY) !== "1";
  } catch {
    return false;
  }
};

export const markLaunchInstallAsked = () => {
  try {
    sessionStorage.setItem(LAUNCH_ASK_DONE_KEY, "1");
  } catch {
    /* ignore */
  }
};

/** Refresh the snapshot, e.g. after returning from the Share sheet. */
export const refreshPwa = emit;
