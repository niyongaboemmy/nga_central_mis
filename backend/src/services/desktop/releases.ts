import { promises as fs } from "fs";
import path from "path";

/**
 * NGA Desktop releases, as uploaded by nga-desktop's Release workflow:
 *   <dir>/<version>/release.json   (+ the installers and update packages)
 *   <dir>/current.json             {"version": "..."}: the published one (Publish workflow)
 */
export const releasesDir = () => process.env.DESKTOP_RELEASES_DIR || "/opt/apps/desktop-releases";
/** Where the files are downloaded from (this API serves releasesDir at /desktop/files). */
export const filesBaseUrl = () =>
  (process.env.DESKTOP_FILES_URL || "https://api.amashuri.com/desktop/files").replace(/\/+$/, "");

export type DownloadPlatform = "macos" | "windows" | "windows-msi";
export const DOWNLOAD_PLATFORMS: DownloadPlatform[] = ["macos", "windows", "windows-msi"];

export interface ReleaseFile {
  file: string;
  size: number;
  sha256: string;
}
export interface Release {
  version: string;
  pub_date: string;
  notes: string;
  downloads: Partial<Record<DownloadPlatform, ReleaseFile>>;
  /** Tauri updater targets ("darwin-aarch64", "windows-x86_64", ...). */
  updates: Record<string, { file: string; signature: string } | undefined>;
}

const SAFE = /^[0-9A-Za-z.+-]{1,32}$/;
let cache: { at: number; release: Release | null } | null = null;
const CACHE_MS = 30_000;

/** The published release, or null when none is (yet). Cached briefly. */
export async function currentRelease(now = Date.now()): Promise<Release | null> {
  if (cache && now - cache.at < CACHE_MS) return cache.release;
  let release: Release | null = null;
  try {
    const pointer = JSON.parse(await fs.readFile(path.join(releasesDir(), "current.json"), "utf8"));
    const version = String(pointer?.version || "");
    if (SAFE.test(version)) {
      const r = JSON.parse(await fs.readFile(path.join(releasesDir(), version, "release.json"), "utf8"));
      if (r?.version === version) release = r as Release;
    }
  } catch {
    release = null; // nothing published yet, or unreadable
  }
  cache = { at: now, release };
  return release;
}

export const clearReleaseCache = () => {
  cache = null;
};

export const fileUrl = (release: Release, file: string) =>
  `${filesBaseUrl()}/${encodeURIComponent(release.version)}/${encodeURIComponent(file)}`;

/** Semver order of x.y.z (a pre-release sorts before its release). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => parseInt(n, 10) || 0), pre: pre ?? null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}
