/**
 * The NGA app family and the one-place installer (docs/APP_LAUNCH.md).
 *
 * Why the installer can't be literally "one click for everything" on a
 * personal device: every browser install needs the user's confirmation in the
 * browser's own dialog, and each dialog needs its own click (a user gesture).
 * What this module gives instead:
 * - Personal devices: one guided flow. This app installs with the browser's
 *   dialog; each other app is installed either directly from here with the
 *   Web Install API (`navigator.install`, Chrome/Edge 156+) or by opening it
 *   with `nga_install=1`, which makes its install card appear at once and
 *   links back here. One click per app, all from one place.
 * - School-managed devices: policy files (WebAppInstallForceList) that IT
 *   applies once and every app installs silently -- the true one-click path.
 *   Chrome/Edge honour it only on domain-joined / MDM-managed machines.
 */

export interface NgaApp {
  key: "mis" | "taskmentor" | "tendo" | "tupo";
  name: string;
  description: string;
  /** Origin, no trailing slash. */
  origin: string;
  /** Where the installed app starts. */
  startPath: string;
  icon: string;
  color: string;
}

const env = (import.meta as any).env ?? {};
const origin = (value: string | undefined, fallback: string) => (value || fallback).replace(/\/+$/, "");

export const NGA_APPS: NgaApp[] = [
  {
    key: "mis",
    name: "NGA MIS",
    description: "Timetable, lessons, reminders, reports",
    origin: origin(env.VITE_APP_ORIGIN_MIS, "https://mis.amashuri.com"),
    startPath: "/home?source=pwa",
    icon: "/android-chrome-192x192.png",
    color: "#2f56d9",
  },
  {
    key: "taskmentor",
    name: "Task Mentor",
    description: "Quizzes, assignments, marks and report cards",
    origin: origin(env.VITE_APP_ORIGIN_TASKMENTOR, "https://taskmentor.amashuri.com"),
    startPath: "/dashboard?source=pwa",
    icon: "/android-chrome-192x192.png",
    color: "#3b82f6",
  },
  {
    key: "tendo",
    name: "Tendo",
    description: "Attendance and discipline",
    origin: origin(env.VITE_APP_ORIGIN_TENDO, "https://tendo.amashuri.com"),
    startPath: "/",
    icon: "/pwa-192x192.png",
    color: "#1e6fd9",
  },
  {
    key: "tupo",
    name: "Tupo",
    description: "Chat, meetings, mail and the school feed",
    origin: origin(env.VITE_APP_ORIGIN_TUPO, "https://tupo.amashuri.com"),
    startPath: "/app",
    icon: "/icon-192.png",
    color: "#005EF9",
  },
];

export const iconUrl = (app: NgaApp) => `${app.origin}${app.icon}`;
export const startUrl = (app: NgaApp) => `${app.origin}${app.startPath}`;
/** Every NGA manifest declares `"id": "/"`, so the computed id is the origin + "/". */
export const manifestId = (app: NgaApp) => `${app.origin}/`;

/** Open `app` so its own install card shows at once, with a way back here. */
export const installHandoffUrl = (app: NgaApp, returnUrl: string) => {
  const url = new URL(app.startPath, app.origin);
  url.searchParams.set("nga_install", "1");
  url.searchParams.set("return", returnUrl);
  return url.toString();
};

// ─── Guided "install all" progress ───────────────────────────────────────────

/**
 * - todo: not installed yet
 * - waiting: the app's tab is open with its install card; we wait for it to
 *   report back (desktop browsers never tell one site whether another site's
 *   app is installed -- only the app itself can)
 * - done: installed now; already: it reported it was installed before
 * - skipped: the person chose not to
 */
export type StepStatus = "todo" | "waiting" | "done" | "already" | "skipped";
export type Progress = Record<NgaApp["key"], StepStatus>;

export const emptyProgress = (): Progress => ({ mis: "todo", taskmentor: "todo", tendo: "todo", tupo: "todo" });

export const isInstalled = (s: StepStatus) => s === "done" || s === "already";
export const isFinished = (s: StepStatus) => isInstalled(s) || s === "skipped";

/** The app to work on now, in list order (a waiting one stays current); null when finished. */
export const nextStep = (progress: Progress, apps: NgaApp[] = NGA_APPS): NgaApp | null =>
  apps.find((a) => !isFinished(progress[a.key])) ?? null;

export const markStep = (progress: Progress, key: NgaApp["key"], status: StepStatus): Progress => ({ ...progress, [key]: status });

export const installedCount = (progress: Progress, apps: NgaApp[] = NGA_APPS) => apps.filter((a) => isInstalled(progress[a.key])).length;

/**
 * The status of the app this installer page belongs to (NGA MIS) follows the
 * browser's live answer both ways: a saved "installed" from an earlier visit
 * must not outlive an uninstall (the install icon in the address bar and
 * beforeinstallprompt both mean "not installed here").
 */
export const reconcileSelfStatus = (
  current: StepStatus,
  live: { installed: boolean; installCheck: "yes" | "no" | "unknown"; canPrompt: boolean },
): StepStatus => {
  const notInstalled = !live.installed && (live.installCheck === "no" || live.canPrompt);
  if (live.installed && !isInstalled(current)) return "already";
  if (notInstalled && isInstalled(current)) return "todo";
  return current;
};

// ─── Live reports from the apps' install cards ───────────────────────────────

/**
 * Report cookies (ngaInstall.tsx `writeReportCookie`): `nga_inst_<key>=<status>.<ms>`
 * on .amashuri.com. The main channel, because the links that let Chrome open
 * an installed app in its own window can't keep an opener to message.
 */
export const readReportCookies = (cookie: string, apps: NgaApp[] = NGA_APPS) => {
  const found: Array<InstallReport & { at: number }> = [];
  for (const part of cookie.split(";")) {
    const [name, value = ""] = part.trim().split("=");
    const app = apps.find((a) => name === `nga_inst_${a.key}`);
    if (!app) continue;
    const [raw, ts] = value.split(".");
    const status = raw === "installed" ? "done" : raw === "already" ? "already" : raw === "skipped" ? "skipped" : null;
    const at = Number(ts);
    if (status && Number.isFinite(at)) found.push({ key: app.key, status, at });
  }
  return found;
};

export const clearReportCookie = (key: NgaApp["key"], host = typeof window !== "undefined" ? window.location.hostname : "") => {
  const domain = host === "amashuri.com" || host.endsWith(".amashuri.com") ? "; domain=.amashuri.com; secure" : "";
  try {
    document.cookie = `nga_inst_${key}=; path=/; max-age=0; samesite=lax${domain}`;
  } catch {
    /* ignore */
  }
};


export interface InstallReport {
  key: NgaApp["key"];
  status: "done" | "already" | "skipped";
}

/**
 * Validate a postMessage from an app's install card (ngaInstall.tsx in each
 * app). Accepted only from that app's own origin, for its own key.
 */
export const readInstallReport = (event: { origin: string; data: unknown }, apps: NgaApp[] = NGA_APPS): InstallReport | null => {
  const data = event.data as { type?: unknown; app?: unknown; status?: unknown } | null;
  if (!data || data.type !== "nga-install") return null;
  const app = apps.find((a) => a.key === data.app);
  if (!app || app.origin !== event.origin) return null;
  const status = data.status === "installed" ? "done" : data.status === "already" ? "already" : data.status === "skipped" ? "skipped" : null;
  return status ? { key: app.key, status } : null;
};

const PROGRESS_KEY = "nga.installer.progress";
/** Progress survives the hops to other apps and back (a day at most). */
export const loadProgress = (now = Date.now()): Progress => {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
    if (raw && raw.at && now - raw.at < 86_400_000) {
      const progress: Progress = { ...emptyProgress(), ...raw.progress };
      // A tab we were waiting on may be long gone: ask again rather than
      // pretend it finished.
      for (const k of Object.keys(progress) as NgaApp["key"][]) if (progress[k] === "waiting") progress[k] = "todo";
      return progress;
    }
  } catch {
    /* ignore */
  }
  return emptyProgress();
};
export const saveProgress = (progress: Progress, now = Date.now()) => {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ at: now, progress }));
  } catch {
    /* ignore */
  }
};

// ─── Web Install API (Chrome/Edge 156+; earlier behind a flag) ──────────────

export const webInstallSupported = () => typeof navigator !== "undefined" && typeof (navigator as any).install === "function";

/**
 * Install (or, if already installed, open) another NGA app from this page.
 * Needs a user gesture; resolves true when the browser completed it.
 */
export const webInstall = async (app: NgaApp): Promise<boolean> => {
  if (!webInstallSupported()) return false;
  try {
    await (navigator as any).install(startUrl(app), manifestId(app));
    return true;
  } catch {
    return false;
  }
};

// ─── Managed-device policy files ─────────────────────────────────────────────

const forceListJson = (apps: NgaApp[]) =>
  JSON.stringify(
    apps.map((a) => ({ url: startUrl(a), default_launch_container: "window", create_desktop_shortcut: true })),
  );

const regString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/**
 * Windows .reg for Chrome or Edge: installs every NGA app silently, allows
 * their notifications, and keeps the browser running in the background so
 * push reminders arrive. Honoured on domain-joined / MDM-managed Windows.
 */
export const buildRegFile = (browser: "chrome" | "edge", apps: NgaApp[] = NGA_APPS) => {
  const root = browser === "chrome" ? "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome" : "HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge";
  const lines = [
    "Windows Registry Editor Version 5.00",
    "",
    `; NGA apps for ${browser === "chrome" ? "Google Chrome" : "Microsoft Edge"} -- generated by ${apps[0]?.origin ?? ""}/apps`,
    "; Installs every NGA app silently on this (managed) computer.",
    "",
    `[${root}]`,
    `"WebAppInstallForceList"="${regString(forceListJson(apps))}"`,
    `"BackgroundModeEnabled"=dword:00000001`,
    "",
    `[${root}\\NotificationsAllowedForUrls]`,
    ...apps.map((a, i) => `"${i + 1}"="${regString(a.origin)}"`),
    "",
  ];
  return lines.join("\r\n");
};

const xml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** macOS configuration profile (Chrome) for MDM-managed Macs. */
export const buildMobileConfig = (apps: NgaApp[] = NGA_APPS, uuid = () => crypto.randomUUID().toUpperCase()) => {
  const appDicts = apps
    .map(
      (a) => `          <dict>
            <key>url</key><string>${xml(startUrl(a))}</string>
            <key>default_launch_container</key><string>window</string>
            <key>create_desktop_shortcut</key><true/>
          </dict>`,
    )
    .join("\n");
  const origins = apps.map((a) => `          <string>${xml(a.origin)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>PayloadContent</key>
    <array>
      <dict>
        <key>PayloadType</key><string>com.google.Chrome</string>
        <key>PayloadIdentifier</key><string>rw.ac.nga.apps.chrome</string>
        <key>PayloadUUID</key><string>${uuid()}</string>
        <key>PayloadVersion</key><integer>1</integer>
        <key>PayloadDisplayName</key><string>NGA apps for Chrome</string>
        <key>WebAppInstallForceList</key>
        <array>
${appDicts}
        </array>
        <key>NotificationsAllowedForUrls</key>
        <array>
${origins}
        </array>
        <key>BackgroundModeEnabled</key><true/>
      </dict>
    </array>
    <key>PayloadDisplayName</key><string>NGA apps</string>
    <key>PayloadDescription</key><string>Installs the New Generation Academy apps in Google Chrome.</string>
    <key>PayloadIdentifier</key><string>rw.ac.nga.apps</string>
    <key>PayloadOrganization</key><string>New Generation Academy</string>
    <key>PayloadType</key><string>Configuration</string>
    <key>PayloadUUID</key><string>${uuid()}</string>
    <key>PayloadVersion</key><integer>1</integer>
  </dict>
</plist>
`;
};

export const downloadText = (filename: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
