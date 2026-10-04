// One-line installers: pinned to the published release's checksum, refuse
// anything that doesn't match, and never let release data reach a shell.
import { describe, it, expect } from "vitest";
import { execFile } from "child_process";
import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { macInstallScript, windowsInstallScript } from "../services/desktop/installScripts";
import type { Release } from "../services/desktop/releases";

const sha = "15ec965776237614097049c0f1e2d3c4b5a6978877665544332211aabbccddee".slice(0, 64);
const release = (over: Partial<Release["downloads"]["macos"]> = {}): Release => ({
  version: "0.2.1",
  pub_date: "2026-10-04T19:29:00Z",
  notes: "",
  downloads: {
    macos: { file: "NGA_0.2.1_universal.dmg", size: 9_951_883, sha256: sha, ...over },
    windows: { file: "NGA_0.2.1_x64-setup.exe", size: 4_986_795, sha256: sha },
  },
  updates: {},
});

describe("one-line installers", () => {
  it("macOS: pins the version and checksum, downloads over HTTPS, counted as 'terminal'", () => {
    const s = macInstallScript(release());
    expect(s).toContain('VERSION="0.2.1"');
    expect(s).toContain(`SHA256="${sha}"`);
    expect(s).toContain('URL="https://api.amashuri.com/desktop/download/macos?src=terminal"');
    expect(s).toMatch(/\[ "\$GOT" = "\$SHA256" \] \|\| fail/);
    expect(s).toContain("xattr -dr com.apple.quarantine");
    expect(s).not.toMatch(/sudo/);
  });

  it("Windows: pins the checksum, per-user silent install, counted as 'powershell'", () => {
    const s = windowsInstallScript(release());
    expect(s).toContain(`$sha256 = '${sha}'`);
    expect(s).toContain("download/windows?src=powershell");
    expect(s).toContain("Get-FileHash -Algorithm SHA256");
    expect(s).toMatch(/if \(\$got -ne \$sha256\) \{ throw/);
    expect(s).toContain("-ArgumentList '/S'");
  });

  it("refuses to build an installer from unexpected release data", () => {
    for (const bad of [{ sha256: "not-a-checksum" }, { file: 'x"; rm -rf ~; "' }, { file: "$(whoami).dmg" }]) {
      const s = macInstallScript(release(bad));
      expect(s).toMatch(/isn't available yet/);
      expect(s).not.toContain("rm -rf ~");
      expect(s).not.toContain("$(whoami)");
    }
    expect(macInstallScript(null)).toMatch(/exit 1/);
    expect(windowsInstallScript(null)).toMatch(/isn't available yet/);
  });

  it.skipIf(process.platform !== "darwin")("stops before installing when the download doesn't match (real macOS run)", async () => {
    // A server that hands out a tampered "installer".
    const server = http.createServer((_req, res) => res.end("tampered bytes"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as any).port;
    process.env.DESKTOP_API_URL = `http://127.0.0.1:${port}`;
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nga-install-")), "install.sh");
    fs.writeFileSync(file, macInstallScript(release()));
    delete process.env.DESKTOP_API_URL;
    const result = await new Promise<{ code: number | null; out: string }>((resolve) =>
      execFile("sh", [file], { timeout: 20_000 }, (err: any, stdout, stderr) =>
        resolve({ code: err ? err.code : 0, out: stdout + stderr }),
      ),
    );
    server.close();
    expect(result.code).not.toBe(0);
    expect(result.out).toContain("doesn't match NGA's published checksum, so it was not installed");
    expect(result.out).not.toContain("Installing into");
  });

  it.skipIf(process.platform === "win32")("macOS script is valid sh", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "nga-install-")), "install.sh");
    fs.writeFileSync(file, macInstallScript(release()));
    const code = await new Promise<number>((resolve) => execFile("sh", ["-n", file], (err: any) => resolve(err ? err.code : 0)));
    expect(code).toBe(0);
  });
});
