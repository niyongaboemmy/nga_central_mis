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

interface PwaState {
  platform: PlatformInfo;
  installed: boolean;
  /** Chromium handed us its install prompt. */
  canPrompt: boolean;
  /** <install> element (origin trial, Chrome/Edge 148+). */
  hasInstallElement: boolean;
  registration: ServiceWorkerRegistration | null;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const compute = (): PwaState => {
  const env = readEnv(Boolean(deferredPrompt));
  return {
    platform: describePlatform(env),
    installed: env.standalone || readFlag(INSTALLED_KEY),
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

// ─── lifecycle ───────────────────────────────────────────────────────────────

let started = false;

/** Wire the install events once, as early as possible (main.tsx). */
export const initPwa = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  captureLaunchMarker();
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep Chromium's mini-infobar away; we show our own, better-timed card.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    writeItem(INSTALLED_KEY, "1");
    emit();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", emit);
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
const AUTO_SNOOZE_KEY = "nga.pwa.autoPromptSnoozedUntil";
export const AUTO_SNOOZE_MS = 24 * 3_600_000;

export const snoozeAutoPrompt = (now = Date.now()) => writeItem(AUTO_SNOOZE_KEY, String(now + AUTO_SNOOZE_MS));
export const autoPromptSnoozed = (now = Date.now()) => {
  try {
    return Number(localStorage.getItem(AUTO_SNOOZE_KEY) || 0) > now;
  } catch {
    return false;
  }
};

/**
 * Does the browser say MIS is installed on this device? (manifest
 * related_applications + getInstalledRelatedApps). Remembers a yes.
 */
export const checkInstalledHere = async (): Promise<boolean> => {
  const fn = (navigator as any).getInstalledRelatedApps;
  if (typeof fn !== "function") return false;
  try {
    const apps = await fn.call(navigator);
    const yes = Array.isArray(apps) && apps.some((a: any) => a?.platform === "webapp");
    if (yes) {
      writeItem(INSTALLED_KEY, "1");
      emit();
    }
    return yes;
  } catch {
    return false;
  }
};

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
