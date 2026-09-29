/**
 * Which device/browser are we on, and how can the NGA app be installed here?
 * (REMINDERS_SOLUTION_PROPOSAL.md §7.2). Pure functions over a user-agent
 * snapshot so every branch is unit-testable.
 */

export type OS = "android" | "ios" | "ipados" | "windows" | "macos" | "linux" | "chromeos" | "other";
export type Browser = "chrome" | "edge" | "samsung" | "opera" | "firefox" | "safari" | "brave" | "other";

/**
 * - prompt:  Chromium's own install dialog (beforeinstallprompt / <install>)
 * - ios:     Share -> Add to Home Screen -> "Open as Web App"
 * - mac-dock: Safari File -> Add to Dock
 * - firefox-taskbar: Firefox 143+ on Windows, "Add to taskbar"
 * - manual:  installable from the browser menu, but no event fired (yet)
 * - none:    this browser can't install web apps (e.g. desktop Firefox on macOS/Linux)
 */
export type InstallMethod = "prompt" | "ios" | "mac-dock" | "firefox-taskbar" | "manual" | "none";

export interface PlatformInfo {
  os: OS;
  browser: Browser;
  mobile: boolean;
  /** Web Push can work in this context right now. */
  pushCapable: boolean;
  /** Push needs the app installed first (iOS/iPadOS). */
  pushNeedsInstall: boolean;
  installMethod: InstallMethod;
}

export interface Env {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  hasNotification: boolean;
  /** beforeinstallprompt has fired and was captured. */
  canPrompt: boolean;
}

export const detectOS = (ua: string, platform = "", touchPoints = 0): OS => {
  if (/android/i.test(ua)) return "android";
  if (/iPad/.test(ua)) return "ipados";
  // iPadOS 13+ reports itself as a Mac; touch support gives it away.
  if (/Macintosh/.test(ua) && touchPoints > 1) return "ipados";
  if (/iPhone|iPod/.test(ua)) return "ios";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua) || /Mac/i.test(platform)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
};

export const detectBrowser = (ua: string): Browser => {
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//.test(ua)) return "edge";
  if (/OPR\/|Opera/.test(ua)) return "opera";
  if (/Firefox|FxiOS/.test(ua)) return "firefox";
  if (/Brave/i.test(ua)) return "brave";
  if (/Chrome|CriOS|Chromium/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safari";
  return "other";
};

const firefoxMajor = (ua: string) => Number(/Firefox\/(\d+)/.exec(ua)?.[1] ?? 0);

export const describePlatform = (env: Env): PlatformInfo => {
  const os = detectOS(env.userAgent, env.platform, env.maxTouchPoints);
  const browser = detectBrowser(env.userAgent);
  const mobile = os === "android" || os === "ios" || os === "ipados";
  const apple = os === "ios" || os === "ipados";
  const pushNeedsInstall = apple;
  const pushCapable =
    env.hasServiceWorker && env.hasPushManager && env.hasNotification && (!pushNeedsInstall || env.standalone);

  let installMethod: InstallMethod;
  if (apple) installMethod = "ios"; // every iOS browser installs through the Share sheet
  else if (env.canPrompt) installMethod = "prompt";
  else if (os === "macos" && browser === "safari") installMethod = "mac-dock";
  else if (browser === "firefox") {
    if (os === "windows" && firefoxMajor(env.userAgent) >= 143) installMethod = "firefox-taskbar";
    else if (os === "android") installMethod = "manual";
    else installMethod = "none";
  } else if (["chrome", "edge", "samsung", "opera", "brave"].includes(browser)) installMethod = "manual";
  else installMethod = "none";

  return { os, browser, mobile, pushCapable, pushNeedsInstall, installMethod };
};

export const readEnv = (canPrompt: boolean): Env => {
  const nav: any = typeof navigator === "undefined" ? {} : navigator;
  const win: any = typeof window === "undefined" ? {} : window;
  const standalone =
    Boolean(nav.standalone) ||
    (typeof win.matchMedia === "function" &&
      (win.matchMedia("(display-mode: standalone)").matches ||
        win.matchMedia("(display-mode: window-controls-overlay)").matches ||
        win.matchMedia("(display-mode: fullscreen)").matches));
  return {
    userAgent: String(nav.userAgent || ""),
    platform: String(nav.userAgentData?.platform || nav.platform || ""),
    maxTouchPoints: Number(nav.maxTouchPoints || 0),
    standalone,
    hasPushManager: typeof win.PushManager !== "undefined",
    hasServiceWorker: Boolean(nav.serviceWorker),
    hasNotification: typeof win.Notification !== "undefined",
    canPrompt,
  };
};

export const OS_LABEL: Record<OS, string> = {
  android: "Android",
  ios: "iPhone",
  ipados: "iPad",
  windows: "Windows",
  macos: "Mac",
  linux: "Linux",
  chromeos: "Chromebook",
  other: "Device",
};

export const BROWSER_LABEL: Record<Browser, string> = {
  chrome: "Chrome",
  edge: "Edge",
  samsung: "Samsung Internet",
  opera: "Opera",
  firefox: "Firefox",
  safari: "Safari",
  brave: "Brave",
  other: "Browser",
};

/**
 * Android phone makers whose battery savers are known to delay background
 * notifications (dontkillmyapp.com), and where to look to fix it.
 */
export const OEM_TIPS: Record<string, { name: string; steps: string[] }> = {
  tecno: {
    name: "Tecno / Infinix / itel",
    steps: [
      "Open Settings → Apps → Chrome (or NGA) → Battery, and choose “No restrictions”.",
      "In Phone Master → App auto-start, allow Chrome (and NGA).",
      "Settings → Notifications → Chrome: allow “Pop-up / Floating notifications”.",
    ],
  },
  xiaomi: {
    name: "Xiaomi / Redmi / POCO",
    steps: [
      "Settings → Apps → Manage apps → Chrome → Autostart: on.",
      "Same screen → Battery saver: “No restrictions”.",
      "Notifications → Chrome: allow “Floating notifications” and “Lock screen”.",
    ],
  },
  samsung: {
    name: "Samsung",
    steps: [
      "Settings → Apps → Chrome (or NGA) → Battery → “Unrestricted”.",
      "Settings → Battery → Background usage limits: make sure Chrome isn't in “Sleeping apps”.",
    ],
  },
  huawei: {
    name: "Huawei / Honor",
    steps: [
      "Settings → Battery → App launch → Chrome: switch to “Manage manually” and allow all three.",
      "Settings → Notifications → Chrome: allow banners and lock screen.",
    ],
  },
  oppo: {
    name: "OPPO / realme / OnePlus / vivo",
    steps: [
      "Settings → Battery → App battery management → Chrome: “Allow background activity”.",
      "Settings → Apps → Auto launch: allow Chrome.",
    ],
  },
  other: {
    name: "Other Android phones",
    steps: [
      "Settings → Apps → Chrome (or NGA) → Battery: “Unrestricted” / “No restrictions”.",
      "Settings → Notifications → Chrome: allow notifications, pop-ups and lock screen.",
    ],
  },
};

export const detectOem = (ua: string): keyof typeof OEM_TIPS => {
  if (/TECNO|Infinix|itel/i.test(ua)) return "tecno";
  if (/Redmi|POCO|Xiaomi|\bMi \d|MIX/i.test(ua)) return "xiaomi";
  if (/SM-|Samsung/i.test(ua)) return "samsung";
  if (/HUAWEI|HONOR|\bHRY-|\bJNY-/i.test(ua)) return "huawei";
  if (/OPPO|CPH\d|RMX\d|OnePlus|vivo|\bV\d{4}/i.test(ua)) return "oppo";
  return "other";
};
