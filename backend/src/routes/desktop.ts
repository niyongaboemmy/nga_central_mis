import crypto from "crypto";
import express from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticate } from "../middleware/auth";
import { resolveActivityUser } from "../middleware/activityAuth";
import { perMinute, rateLimitByIp } from "../middleware/rateLimit";
import { requireCapability } from "../services/access/policy";
import { exec, q } from "../services/activity/db";
import {
  DOWNLOAD_PLATFORMS,
  compareVersions,
  currentRelease,
  fileUrl,
  releasesDir,
  type DownloadPlatform,
} from "../services/desktop/releases";
import { macInstallScript, windowsInstallScript } from "../services/desktop/installScripts";

/**
 * NGA Desktop distribution (public, no sign-in needed):
 *   GET /desktop/release                 the published version, for the /apps page
 *   GET /desktop/download/:platform      counts a download, then redirects to the file
 *   GET /desktop/update/:target/:arch/:v Tauri's updater: 204 = up to date, else the package
 *   GET /desktop/files/<version>/<file>  the installers and packages themselves
 *   GET /desktop/install.sh | install.ps1 one-line installers (checksum-pinned)
 * And for admins (Usage analytics permission):
 *   GET /desktop/stats                   downloads and active installs
 * NGA Tools endpoints live in routes/desktopTools.ts (/desktop/tools/…).
 */
const router = express.Router();

const ipHash = (ip: string | undefined) =>
  ip ? crypto.createHash("sha256").update(`${process.env.JWT_SECRET || ""}:${ip}`).digest("hex").slice(0, 16) : null;

const isPlatform = (p: string): p is DownloadPlatform => (DOWNLOAD_PLATFORMS as string[]).includes(p);

/**
 * How the app's last update went, sent on its next check (updates.rs `report`):
 * `X-NGA-Update-Report: <downloaded|installed|failed> <version>[ <why>]`.
 * A PC that downloads updates but never gets past an old version shows up on /apps.
 */
export function parseUpdateReport(header: string | undefined): { outcome: string; to: string; error: string | null } | null {
  const m = String(header || "").match(/^(downloaded|installed|failed) (\d+\.\d+\.\d+[\w.-]*)(?: (.*))?$/s);
  if (!m) return null;
  const error = m[1] === "failed" ? (m[3] || "unknown").replace(/\s+/g, " ").trim().slice(0, 255) || "unknown" : null;
  return { outcome: m[1], to: m[2].slice(0, 32), error };
}

router.get(
  "/release",
  asyncHandler(async (_req, res) => {
    const release = await currentRelease();
    res.set("Cache-Control", "public, max-age=60");
    if (!release) return res.json({ success: true, data: { version: null } });
    let total = 0;
    try {
      const [row] = await q<{ n: number }>("SELECT COUNT(*) AS n FROM `DesktopDownload`");
      total = Number(row?.n ?? 0);
    } catch {
      /* table not migrated yet: no count */
    }
    res.json({
      success: true,
      data: {
        version: release.version,
        pub_date: release.pub_date,
        notes: release.notes,
        downloads: Object.fromEntries(
          Object.entries(release.downloads)
            .filter(([, f]) => !!f)
            .map(([platform, f]) => [platform, { size: f!.size, file: f!.file, sha256: f!.sha256, url: `/desktop/download/${platform}` }]),
        ),
        total_downloads: total,
      },
    });
  }),
);

router.get(
  "/download/:platform",
  rateLimitByIp(perMinute(20), "Too many downloads, try again in a minute."),
  asyncHandler(async (req, res) => {
    const platform = String(req.params.platform);
    if (!isPlatform(platform)) return res.status(404).json({ success: false, message: "Unknown platform" });
    const release = await currentRelease();
    const file = release?.downloads[platform];
    if (!release || !file) return res.status(404).json({ success: false, message: "No release for this platform yet" });
    try {
      await exec(
        "INSERT INTO `DesktopDownload` (platform, version, user_id, ip_hash, user_agent, source, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
        [
          platform,
          release.version,
          await resolveActivityUser(req),
          ipHash(req.ip),
          (req.get("User-Agent") || "").slice(0, 255) || null,
          String(req.query.src || "").replace(/[^\w-]/g, "").slice(0, 32) || null,
        ],
      );
    } catch {
      /* counting must never block a download */
    }
    res.set("Cache-Control", "no-store");
    res.redirect(302, fileUrl(release, file.file));
  }),
);

// One-line installers (no browser download, so no Gatekeeper/SmartScreen
// warning), pinned to the published release's SHA-256 (installScripts.ts).
router.get(
  "/install.sh",
  asyncHandler(async (_req, res) => {
    res.set("Content-Type", "text/x-shellscript; charset=utf-8");
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(macInstallScript(await currentRelease()));
  }),
);
router.get(
  "/install.ps1",
  asyncHandler(async (_req, res) => {
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(windowsInstallScript(await currentRelease()));
  }),
);

// Tauri updater dynamic endpoint (nga-desktop src-tauri/src/updates.rs).
router.get(
  "/update/:target/:arch/:current",
  rateLimitByIp(perMinute(30)),
  asyncHandler(async (req, res) => {
    const target = String(req.params.target).slice(0, 16);
    const arch = String(req.params.arch).slice(0, 16);
    const current = String(req.params.current).slice(0, 32);
    const installId = String(req.get("X-NGA-Install") || "");
    // CI installer smoke tests (X-NGA-CI) get the answer but aren't counted as installs.
    if (/^[0-9a-f]{32}$/.test(installId) && !req.get("X-NGA-CI")) {
      try {
        await exec(
          "INSERT INTO `DesktopInstall` (install_id, platform, arch, version, first_seen, last_seen, checks) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 1) " +
            "ON DUPLICATE KEY UPDATE platform = VALUES(platform), arch = VALUES(arch), version = VALUES(version), last_seen = UTC_TIMESTAMP(), checks = checks + 1",
          [installId, target, arch, current],
        );
        const report = parseUpdateReport(req.get("X-NGA-Update-Report"));
        if (report) {
          await exec(
            "UPDATE `DesktopInstall` SET last_update_to = ?, last_update_outcome = ?, last_update_error = ?, last_update_at = UTC_TIMESTAMP() WHERE install_id = ?",
            [report.to, report.outcome, report.error, installId],
          );
        }
      } catch {
        /* never block an update check (report columns: migration 111) */
      }
    }
    res.set("Cache-Control", "no-store");
    const release = await currentRelease();
    const pkg = release?.updates[`${target}-${arch}`];
    if (!release || !pkg || compareVersions(release.version, current) <= 0) return res.status(204).end();
    res.json({
      version: release.version,
      notes: release.notes,
      pub_date: release.pub_date,
      url: fileUrl(release, pkg.file),
      signature: pkg.signature,
    });
  }),
);

// The files (in production nginx may serve this path directly).
let files: { dir: string; serve: express.RequestHandler } | null = null;
router.use("/files", (req, res, next) => {
  const dir = releasesDir();
  if (files?.dir !== dir) {
    files = { dir, serve: express.static(dir, { dotfiles: "ignore", index: false, fallthrough: false, maxAge: "1d" }) };
  }
  files.serve(req, res, next);
});

router.get(
  "/stats",
  authenticate,
  requireCapability("ANALYTICS_VIEW", (() => ({ type: "SCHOOL" })) as any),
  asyncHandler(async (_req, res) => {
    const release = await currentRelease();
    const [total] = await q<{ n: number; people: number }>(
      "SELECT COUNT(*) AS n, COUNT(DISTINCT COALESCE(CAST(user_id AS CHAR), ip_hash)) AS people FROM `DesktopDownload`",
    );
    const byPlatform = await q<{ platform: string; n: number }>(
      "SELECT platform, COUNT(*) AS n FROM `DesktopDownload` GROUP BY platform ORDER BY n DESC",
    );
    const daily = await q<{ day: string; n: number }>(
      "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS n FROM `DesktopDownload` " +
        "WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY day ORDER BY day",
    );
    const versions = await q<{ version: string; n: number }>(
      "SELECT version, COUNT(*) AS n FROM `DesktopInstall` WHERE last_seen >= UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY version",
    );
    const [installs] = await q<{ active: number; all_time: number; windows: number; macos: number }>(
      "SELECT SUM(last_seen >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS active, COUNT(*) AS all_time, " +
        "SUM(platform = 'windows' AND last_seen >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS windows, " +
        "SUM(platform = 'darwin' AND last_seen >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS macos FROM `DesktopInstall`",
    );
    // Active installs not on the published version, and why (their last update report).
    let behind: Array<{ version: string; outcome: string | null; error: string | null; n: number }> = [];
    if (release) {
      try {
        behind = await q(
          "SELECT version, last_update_outcome AS outcome, last_update_error AS error, COUNT(*) AS n FROM `DesktopInstall` " +
            "WHERE last_seen >= UTC_TIMESTAMP() - INTERVAL 7 DAY AND version <> ? GROUP BY version, outcome, error ORDER BY n DESC LIMIT 20",
          [release.version],
        );
      } catch {
        /* columns not migrated yet */
      }
    }
    const active = Number(installs?.active ?? 0);
    const onCurrent = release ? versions.filter((v) => v.version === release.version).reduce((s, v) => s + Number(v.n), 0) : 0;
    res.json({
      success: true,
      data: {
        current_version: release?.version ?? null,
        downloads: {
          total: Number(total?.n ?? 0),
          people: Number(total?.people ?? 0),
          by_platform: byPlatform.map((r) => ({ platform: r.platform, count: Number(r.n) })),
          last_30_days: daily.map((r) => ({ day: r.day, count: Number(r.n) })),
        },
        installs: {
          active_30_days: active,
          all_time: Number(installs?.all_time ?? 0),
          windows: Number(installs?.windows ?? 0),
          macos: Number(installs?.macos ?? 0),
          on_current_version: onCurrent,
          by_version: versions
            .map((v) => ({ version: v.version, count: Number(v.n) }))
            .sort((a, b) => compareVersions(b.version, a.version)),
          behind: behind.map((r) => ({ version: r.version, outcome: r.outcome ?? null, error: r.error ?? null, count: Number(r.n) })),
        },
      },
    });
  }),
);

export default router;
