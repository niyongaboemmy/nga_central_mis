// NGA Desktop distribution: the /apps page's release info, counted downloads,
// the in-app updater endpoint, and the admin stats.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nga-desktop-releases-"));
process.env.DESKTOP_RELEASES_DIR = dir;
process.env.DESKTOP_FILES_URL = "https://api.example.test/desktop/files";

const db = vi.hoisted(() => ({ exec: vi.fn(), q: vi.fn() }));
vi.mock("../services/activity/db", () => db);
vi.mock("../middleware/activityAuth", () => ({ resolveActivityUser: vi.fn().mockResolvedValue(42) }));
const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("../middleware/auth", () => ({ authenticate: (_req: any, _res: any, next: any) => next() }));
vi.mock("../services/access/policy", () => ({
  requireCapability: () => (_req: any, res: any, next: any) => (access.allowed ? next() : res.status(403).json({ message: "Forbidden" })),
}));

import desktopRoutes from "../routes/desktop";
import { clearReleaseCache, compareVersions } from "../services/desktop/releases";

const app = express();
app.set("trust proxy", "loopback");
app.use("/desktop", desktopRoutes);

const release = (version: string) => ({
  version,
  pub_date: "2026-10-04T12:00:00Z",
  notes: "Faster quiz page.",
  downloads: {
    macos: { file: `NGA_${version}_universal.dmg`, size: 90_000_000, sha256: "a".repeat(64) },
    windows: { file: `NGA_${version}_x64-setup.exe`, size: 70_000_000, sha256: "b".repeat(64) },
  },
  updates: {
    "darwin-aarch64": { file: `NGA_${version}_universal.app.tar.gz`, signature: "sig-mac" },
    "darwin-x86_64": { file: `NGA_${version}_universal.app.tar.gz`, signature: "sig-mac" },
    "windows-x86_64": { file: `NGA_${version}_x64-setup.exe`, signature: "sig-win" },
  },
});

function publish(version: string | null) {
  clearReleaseCache();
  if (version === null) return fs.rmSync(path.join(dir, "current.json"), { force: true });
  fs.mkdirSync(path.join(dir, version), { recursive: true });
  fs.writeFileSync(path.join(dir, version, "release.json"), JSON.stringify(release(version)));
  fs.writeFileSync(path.join(dir, version, `NGA_${version}_universal.dmg`), "dmg-bytes");
  fs.writeFileSync(path.join(dir, "current.json"), JSON.stringify({ version }));
}

describe("NGA Desktop distribution", () => {
  beforeAll(() => publish(null));
  beforeEach(() => {
    db.exec.mockReset().mockResolvedValue({});
    db.q.mockReset().mockResolvedValue([{ n: 7 }]);
    access.allowed = true;
  });

  it("says when nothing is published yet", async () => {
    publish(null);
    const r = await request(app).get("/desktop/release");
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ version: null });
    expect((await request(app).get("/desktop/download/macos")).status).toBe(404);
  });

  it("describes the published release for the download page", async () => {
    publish("0.2.0");
    const r = await request(app).get("/desktop/release");
    expect(r.body.data.version).toBe("0.2.0");
    expect(r.body.data.downloads.macos).toMatchObject({ size: 90_000_000, url: "/desktop/download/macos" });
    expect(r.body.data.downloads.windows.url).toBe("/desktop/download/windows");
    expect(r.body.data.total_downloads).toBe(7);
  });

  it("counts a download, then redirects to the file", async () => {
    publish("0.2.0");
    const r = await request(app).get("/desktop/download/windows?src=apps").set("User-Agent", "Mozilla/5.0 (Windows NT 10.0)");
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe("https://api.example.test/desktop/files/0.2.0/NGA_0.2.0_x64-setup.exe");
    const [sql, params] = db.exec.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO `DesktopDownload`/);
    expect(params.slice(0, 3)).toEqual(["windows", "0.2.0", 42]);
    expect(params[3]).toMatch(/^[0-9a-f]{16}$/); // hashed IP, never the IP itself
    expect(params[5]).toBe("apps");
  });

  it("still downloads when counting fails, and 404s an unknown platform", async () => {
    publish("0.2.0");
    db.exec.mockRejectedValueOnce(new Error("table missing"));
    expect((await request(app).get("/desktop/download/macos")).status).toBe(302);
    expect((await request(app).get("/desktop/download/linux")).status).toBe(404);
  });

  it("offers the update to an older app, with the signed package", async () => {
    publish("0.2.0");
    const r = await request(app).get("/desktop/update/darwin/aarch64/0.1.0").set("X-NGA-Install", "0123456789abcdef0123456789abcdef");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      version: "0.2.0",
      notes: "Faster quiz page.",
      pub_date: "2026-10-04T12:00:00Z",
      url: "https://api.example.test/desktop/files/0.2.0/NGA_0.2.0_universal.app.tar.gz",
      signature: "sig-mac",
    });
    const [sql, params] = db.exec.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO `DesktopInstall`[\s\S]*ON DUPLICATE KEY UPDATE/);
    expect(params).toEqual(["0123456789abcdef0123456789abcdef", "darwin", "aarch64", "0.1.0"]);
  });

  it("answers 204 when the app is current (or newer, or the target has no package)", async () => {
    publish("0.2.0");
    expect((await request(app).get("/desktop/update/windows/x86_64/0.2.0")).status).toBe(204);
    expect((await request(app).get("/desktop/update/windows/x86_64/0.3.0")).status).toBe(204);
    expect((await request(app).get("/desktop/update/linux/x86_64/0.1.0")).status).toBe(204);
  });

  it("ignores a malformed install id (still answers the check)", async () => {
    publish("0.2.0");
    const r = await request(app).get("/desktop/update/windows/x86_64/0.1.0").set("X-NGA-Install", "'; DROP TABLE x; --");
    expect(r.status).toBe(200);
    expect(r.body.signature).toBe("sig-win");
    expect(db.exec).not.toHaveBeenCalled();
  });

  it("serves the release files", async () => {
    publish("0.2.0");
    const r = await request(app).get("/desktop/files/0.2.0/NGA_0.2.0_universal.dmg");
    expect(r.status).toBe(200);
    expect(r.text || r.body.toString()).toContain("dmg-bytes");
    expect((await request(app).get("/desktop/files/../../etc/passwd")).status).toBe(404);
  });

  it("gives admins download and install stats, and nobody else", async () => {
    publish("0.2.0");
    db.q
      .mockResolvedValueOnce([{ n: 12, people: 9 }])
      .mockResolvedValueOnce([{ platform: "windows", n: 8 }, { platform: "macos", n: 4 }])
      .mockResolvedValueOnce([{ day: "2026-10-04", n: 12 }])
      .mockResolvedValueOnce([{ version: "0.1.0", n: 2 }, { version: "0.2.0", n: 5 }])
      .mockResolvedValueOnce([{ active: 7, all_time: 9, windows: 5, macos: 2 }]);
    const r = await request(app).get("/desktop/stats");
    expect(r.status).toBe(200);
    expect(r.body.data.downloads).toMatchObject({ total: 12, people: 9 });
    expect(r.body.data.installs).toMatchObject({ active_30_days: 7, on_current_version: 5 });
    expect(r.body.data.installs.by_version[0]).toEqual({ version: "0.2.0", count: 5 });
    access.allowed = false;
    expect((await request(app).get("/desktop/stats")).status).toBe(403);
  });

  it("orders versions like semver", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("v0.2.0", "0.2.0")).toBe(0);
  });
});
