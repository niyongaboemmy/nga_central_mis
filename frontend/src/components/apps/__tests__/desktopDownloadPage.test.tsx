// /apps: NGA Desktop download page (OS-aware, counted downloads, update hint).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppsInstallerPage from "../AppsInstallerPage";
import { detectOs, downloadUrl, formatSize, isNewer, primaryPlatform, webAppInstallFits } from "../desktopDownload";

const UA = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
  win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 15000.0.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
  desktopApp: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.6 Safari/605.1.15 NGADesktop/0.2.0",
};

const release = {
  version: "0.3.0",
  pub_date: "2026-10-04T12:00:00Z",
  notes: "",
  downloads: {
    macos: { size: 94_371_840, file: "NGA_0.3.0_universal.dmg", url: "/desktop/download/macos" },
    windows: { size: 73_400_320, file: "NGA_0.3.0_x64-setup.exe", url: "/desktop/download/windows" },
    "windows-msi": { size: 75_000_000, file: "NGA_0.3.0_x64_en-US.msi", url: "/desktop/download/windows-msi" },
  },
  total_downloads: 1234,
};

function setDevice(ua: string, touch = 0) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  // jsdom has no maxTouchPoints: define it for this test.
  Object.defineProperty(navigator, "maxTouchPoints", { value: touch, configurable: true });
}
function mockApi(data: unknown, stats: unknown = null) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const u = String(url);
    if (u.endsWith("/desktop/release")) return new Response(JSON.stringify({ success: true, data }), { status: 200 });
    if (u.endsWith("/desktop/stats")) return stats ? new Response(JSON.stringify({ success: true, data: stats }), { status: 200 }) : new Response("{}", { status: 403 });
    return new Response("{}", { status: 404 });
  });
}
const renderPage = () => render(<MemoryRouter><AppsInstallerPage /></MemoryRouter>);

describe("which download fits this device", () => {
  it("detects the OS (an iPad's desktop Safari is not a Mac)", () => {
    expect(detectOs(UA.mac, 0)).toBe("macos");
    expect(detectOs(UA.win, 0)).toBe("windows");
    expect(detectOs(UA.ipad, 5)).toBe("ios");
    expect(detectOs(UA.android, 5)).toBe("android");
    expect(detectOs(UA.chromebook, 0)).toBe("chromeos");
    expect(primaryPlatform("macos")).toBe("macos");
    expect(primaryPlatform("windows")).toBe("windows");
    expect(primaryPlatform("android")).toBeNull();
  });

  it("offers web-app installs only where NGA Desktop doesn't run", () => {
    expect(webAppInstallFits(UA.android, 5)).toBe(true);
    expect(webAppInstallFits(UA.chromebook, 0)).toBe(true);
    expect(webAppInstallFits(UA.mac, 0)).toBe(false);
    expect(webAppInstallFits(UA.win, 0)).toBe(false);
    expect(webAppInstallFits(UA.desktopApp, 0)).toBe(false);
  });

  it("counts downloads through the API and formats sizes", () => {
    expect(downloadUrl("windows")).toMatch(/\/desktop\/download\/windows\?src=apps$/);
    expect(formatSize(94_371_840)).toBe("90 MB");
    expect(formatSize(5_000_000)).toBe("4.8 MB");
    expect(isNewer("0.10.0", "0.9.3")).toBe(true);
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
  });
});

describe("/apps: NGA Desktop download page", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("on a Mac, offers the macOS download first, Windows second", async () => {
    setDevice(UA.mac);
    mockApi(release);
    renderPage();
    const main = await screen.findByRole("link", { name: /Download for macOS/ });
    expect(main.getAttribute("href")).toMatch(/\/desktop\/download\/macos\?src=apps$/);
    expect(main).toHaveTextContent("Version 0.3.0 · 90 MB");
    const box = screen.getByTestId("download-box");
    expect(within(box).getByRole("link", { name: /^Windows$/ })).toBeInTheDocument();
    expect(within(box).getByText("Downloaded 1,234 times")).toBeInTheDocument();
    expect(screen.getByText("How to install on macOS")).toBeInTheDocument();
  });

  it("on Windows, offers the Windows installer (and the MSI for IT)", async () => {
    setDevice(UA.win);
    mockApi(release);
    renderPage();
    expect(await screen.findByRole("link", { name: /Download for Windows/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/desktop\/download\/windows\?src=apps$/),
    );
    expect(screen.getByRole("link", { name: /Windows \(MSI, for IT\)/ })).toBeInTheDocument();
  });

  it("on a phone, says NGA Desktop is for computers and points to the web apps", async () => {
    setDevice(UA.android, 5);
    mockApi(release);
    renderPage();
    expect(await screen.findByText(/runs on Windows and macOS computers/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download for/ })).toBeNull();
    expect(screen.getByText("Use the web apps")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Task Mentor/ })).toBeInTheDocument();
  });

  it("before the first release, says it's coming (no broken download)", async () => {
    setDevice(UA.mac);
    mockApi({ version: null });
    renderPage();
    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download for/ })).toBeNull();
  });

  it("inside NGA Desktop, shows the version and points to the in-app update", async () => {
    setDevice(UA.desktopApp);
    mockApi(release);
    renderPage();
    expect(await screen.findByText(/You're using NGA Desktop 0.2.0/)).toBeInTheDocument();
    expect(await screen.findByText(/Version 0.3.0 is ready: open Settings → Updates/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download for/ })).toBeNull();
  });

  it("shows download stats to admins only", async () => {
    setDevice(UA.win);
    mockApi(release);
    renderPage();
    await screen.findByRole("link", { name: /Download for Windows/ });
    expect(screen.queryByTestId("download-stats")).toBeNull(); // signed out: not even asked

    vi.restoreAllMocks();
    setDevice(UA.win);
    localStorage.setItem("token", "t");
    mockApi(release, {
      current_version: "0.3.0",
      downloads: { total: 40, people: 31, by_platform: [{ platform: "windows", count: 30 }, { platform: "macos", count: 10 }] },
      installs: { active_30_days: 20, on_current_version: 15, windows: 14, macos: 6 },
    });
    renderPage();
    const stats = await screen.findByTestId("download-stats");
    expect(stats).toHaveTextContent("Downloads40");
    expect(stats).toHaveTextContent("75%");
    expect(stats).toHaveTextContent("Windows: 30 · macOS: 10");
  });
});
