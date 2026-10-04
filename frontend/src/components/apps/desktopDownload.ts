// NGA Desktop: which download fits this device, and the release the API serves
// (backend routes/desktop.ts). Pure helpers, unit-tested.
import { API_BASE_URL } from "../../services/api";
import { isNgaDesktop } from "../../desktop/ngaDesktop";

export type DeviceOs = "windows" | "macos" | "linux" | "chromeos" | "ios" | "android" | "unknown";
export type DownloadPlatform = "macos" | "windows" | "windows-msi";

export interface DesktopRelease {
  version: string | null;
  pub_date?: string;
  notes?: string;
  downloads?: Partial<Record<DownloadPlatform, { size: number; file: string; url: string }>>;
  total_downloads?: number;
}

/**
 * The OS this page runs on. iPadOS Safari says "Macintosh" by default, so a
 * touch "Mac" is an iPad. Chromebooks say "CrOS".
 */
export function detectOs(
  ua: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints: number = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0,
): DeviceOs {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/CrOS/i.test(ua)) return "chromeos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return maxTouchPoints > 1 ? "ios" : "macos";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

/** The installer to offer first on this device (null: NGA Desktop doesn't run here). */
export const primaryPlatform = (os: DeviceOs): DownloadPlatform | null =>
  os === "windows" ? "windows" : os === "macos" ? "macos" : null;

/**
 * Offer to install NGA MIS as a web app (AutoInstallPrompt)? Only where NGA
 * Desktop doesn't run (phones, tablets, Chromebooks, Linux): on Windows and
 * macOS the one desktop app replaces the four web-app installs.
 */
export const webAppInstallFits = (ua?: string, touch?: number) =>
  !isNgaDesktop(ua) && primaryPlatform(detectOs(ua, touch)) === null;

export const OS_LABEL: Record<DownloadPlatform, string> = {
  macos: "macOS",
  windows: "Windows",
  "windows-msi": "Windows (MSI, for IT)",
};

export const REQUIREMENTS: Record<DownloadPlatform, string> = {
  macos: "macOS 11 or later · Apple silicon and Intel",
  windows: "Windows 10 or 11 · 64-bit",
  "windows-msi": "For installing on many school computers",
};

/** Counted on the server, then redirected to the file. */
export const downloadUrl = (platform: DownloadPlatform, source = "apps") =>
  `${API_BASE_URL.replace(/\/+$/, "")}/desktop/download/${platform}?src=${encodeURIComponent(source)}`;

export const formatSize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
};

/** x.y.z order (pre-releases before their release). */
export function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, "").split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** What to do after downloading: short, per OS. The installers aren't code-signed yet. */
export const INSTALL_STEPS: Record<"macos" | "windows", string[]> = {
  macos: [
    "Open the downloaded NGA file and drag NGA into Applications.",
    "Open NGA from Applications. The first time, macOS may say it can't check the app: open System Settings → Privacy & Security and click Open Anyway.",
    "Sign in to NGA MIS once. Task Mentor, Tendo and Tupo sign in by themselves.",
  ],
  windows: [
    "Run the downloaded NGA setup file.",
    "If Windows shows “Windows protected your PC”, click More info, then Run anyway.",
    "Sign in to NGA MIS once. Task Mentor, Tendo and Tupo sign in by themselves.",
  ],
};
