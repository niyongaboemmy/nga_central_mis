import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  buildMobileConfig,
  buildRegFile,
  emptyProgress,
  installHandoffUrl,
  manifestId,
  loadProgress,
  markStep,
  readReportCookies,
  reconcileSelfStatus,
  NGA_APPS,
  nextStep,
  readInstallReport,
  saveProgress,
  startUrl,
} from "../ngaApps";
import { shouldAutoOffer, shouldShowInstallButton } from "../AutoInstallPrompt";
import AppsInstallerPage from "../AppsInstallerPage";
import { safeReturnUrl } from "../../../reminders/pwa";

const byKey = (k: string) => NGA_APPS.find((a) => a.key === k)!;

describe("NGA app list", () => {
  it("covers all four apps with https origins and a manifest id of origin + /", () => {
    expect(NGA_APPS.map((a) => a.key)).toEqual(["mis", "taskmentor", "tendo", "tupo"]);
    for (const app of NGA_APPS) {
      expect(app.origin).toMatch(/^https:\/\/[a-z]+\.amashuri\.com$/);
      expect(manifestId(app)).toBe(`${app.origin}/`);
    }
    expect(startUrl(byKey("tupo"))).toBe("https://tupo.amashuri.com/app");
  });

  it("hands off to another app with its install card forced and a way back", () => {
    const url = new URL(installHandoffUrl(byKey("taskmentor"), "https://mis.amashuri.com/apps?done=taskmentor"));
    expect(url.origin).toBe("https://taskmentor.amashuri.com");
    expect(url.searchParams.get("nga_install")).toBe("1");
    expect(url.searchParams.get("return")).toBe("https://mis.amashuri.com/apps?done=taskmentor");
  });

  it("keeps a waiting app as the current step; only installed/skipped move on", () => {
    let p = markStep(emptyProgress(), "mis", "already");
    p = markStep(p, "taskmentor", "waiting");
    expect(nextStep(p)?.key).toBe("taskmentor");
    expect(nextStep(markStep(p, "taskmentor", "done"))?.key).toBe("tendo");
  });

  it("forgets a stale 'waiting' on reload (the tab may be gone) instead of calling it done", () => {
    saveProgress(markStep(emptyProgress(), "tupo", "waiting"));
    expect(loadProgress().tupo).toBe("todo");
  });

  it("accepts an install report only from the app's own origin, for its own key", () => {
    const ok = { origin: "https://taskmentor.amashuri.com", data: { type: "nga-install", app: "taskmentor", status: "installed" } };
    expect(readInstallReport(ok)).toEqual({ key: "taskmentor", status: "done" });
    expect(readInstallReport({ ...ok, data: { ...ok.data, status: "already" } })).toEqual({ key: "taskmentor", status: "already" });
    expect(readInstallReport({ ...ok, data: { ...ok.data, status: "skipped" } })).toEqual({ key: "taskmentor", status: "skipped" });
    // Another NGA app can't report for Task Mentor, and strangers can't at all.
    expect(readInstallReport({ ...ok, origin: "https://tupo.amashuri.com" })).toBeNull();
    expect(readInstallReport({ ...ok, origin: "https://evil.example" })).toBeNull();
    expect(readInstallReport({ ...ok, data: { ...ok.data, status: "hacked" } })).toBeNull();
    expect(readInstallReport({ ...ok, data: "nga-install" })).toBeNull();
  });

  it("reads the apps' report cookies (the channel that works without an opener)", () => {
    const found = readReportCookies("theme=dark; nga_inst_taskmentor=installed.1700000000000; nga_inst_tupo=already.5; nga_inst_evil=installed.1; nga_inst_tendo=hacked.1");
    expect(found).toEqual([
      { key: "taskmentor", status: "done", at: 1700000000000 },
      { key: "tupo", status: "already", at: 5 },
    ]);
  });

  it("NGA MIS's own status follows the browser live -- a saved 'installed' can't outlive an uninstall", () => {
    const removed = { installed: false, installCheck: "no" as const, canPrompt: true };
    expect(reconcileSelfStatus("already", removed)).toBe("todo");
    expect(reconcileSelfStatus("done", { ...removed, canPrompt: false })).toBe("todo");
    expect(reconcileSelfStatus("todo", { installed: true, installCheck: "yes", canPrompt: false })).toBe("already");
    // Can't tell (Safari/Firefox): keep what we have; skipped stays skipped.
    expect(reconcileSelfStatus("already", { installed: false, installCheck: "unknown", canPrompt: false })).toBe("already");
    expect(reconcileSelfStatus("skipped", removed)).toBe("skipped");
  });

  it("walks the steps in order, skipping done and skipped apps", () => {
    let p = emptyProgress();
    expect(nextStep(p)?.key).toBe("mis");
    p = markStep(p, "mis", "done");
    p = markStep(p, "taskmentor", "skipped");
    expect(nextStep(p)?.key).toBe("tendo");
    p = markStep(markStep(p, "tendo", "done"), "tupo", "done");
    expect(nextStep(p)).toBeNull();
  });
});

describe("managed-device policy files", () => {
  it("Chrome .reg force-installs every app and allows their notifications", () => {
    const reg = buildRegFile("chrome");
    expect(reg.startsWith("Windows Registry Editor Version 5.00\r\n")).toBe(true);
    expect(reg).toContain("[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome]");
    const line = reg.split("\r\n").find((l) => l.startsWith('"WebAppInstallForceList"='))!;
    const json = JSON.parse(line.slice('"WebAppInstallForceList"="'.length, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    expect(json.map((e: any) => e.url)).toEqual(NGA_APPS.map(startUrl));
    expect(json.every((e: any) => e.default_launch_container === "window")).toBe(true);
    expect(reg).toContain('"4"="https://tupo.amashuri.com"');
  });

  it("Edge .reg targets the Edge policy key", () => {
    expect(buildRegFile("edge")).toContain("[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge]");
  });

  it("Mac profile is a well-formed plist listing every app", () => {
    let n = 0;
    const xml = buildMobileConfig(NGA_APPS, () => `UUID-${++n}`);
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    const urls = Array.from(doc.querySelectorAll("key"))
      .filter((k) => k.textContent === "url")
      .map((k) => k.nextElementSibling?.textContent);
    expect(urls).toEqual(NGA_APPS.map(startUrl));
    expect(xml).toContain("<string>com.google.Chrome</string>");
  });
});

describe("automatic install prompt on load", () => {
  const base = { installed: false, installMethod: "prompt", forced: false, snoozed: false, onInstallerPage: false };
  it("asks on load until installed, respecting 'Not now' unless the installer asked", () => {
    expect(shouldAutoOffer(base)).toBe(true);
    expect(shouldAutoOffer({ ...base, installed: true })).toBe(false);
    expect(shouldAutoOffer({ ...base, installMethod: "none" })).toBe(false);
    expect(shouldAutoOffer({ ...base, snoozed: true })).toBe(false);
    expect(shouldAutoOffer({ ...base, snoozed: true, forced: true })).toBe(true);
    expect(shouldAutoOffer({ ...base, onInstallerPage: true })).toBe(false);
  });

  it("only sends people back to an NGA https page", () => {
    expect(safeReturnUrl("https://mis.amashuri.com/apps")).toBe("https://mis.amashuri.com/apps");
    expect(safeReturnUrl("https://evil.example/apps")).toBeNull();
    expect(safeReturnUrl("https://amashuri.com.evil.example/")).toBeNull();
    expect(safeReturnUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("/apps installer page", () => {
  let open: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    try {
      localStorage.removeItem("nga.installer.progress");
    } catch {
      /* ignore */
    }
    window.history.replaceState(null, "", "/apps");
    open = vi.spyOn(window, "open").mockImplementation(() => ({ focus: vi.fn(), closed: false }) as unknown as Window);
  });
  afterEach(() => open.mockRestore());

  const card = (name: string) => screen.getByText(name, { selector: "p" }).closest("[id^='app-']") as HTMLElement;

  it("lists every app and walks 'Install all' as real links -- installed apps open straight in their window", async () => {
    render(<AppsInstallerPage />);
    for (const app of NGA_APPS) expect(screen.getByText(app.name, { selector: "p" })).toBeInTheDocument();

    // In jsdom this page isn't an NGA origin and has no Web Install API, so
    // every app is reached by a real link (Chrome sends a clicked link into an
    // installed app's window -- only without an opener; window.open never
    // is). The app reports back through a short .amashuri.com cookie.
    const start = screen.getByRole("link", { name: /Install all apps/ });
    const url = new URL(start.getAttribute("href")!);
    expect(url.searchParams.get("nga_install")).toBe("1");
    expect(url.searchParams.get("return")).toBe(`${window.location.origin}/apps?done=mis`);
    expect(start).toHaveAttribute("target", "_blank");
    expect(start).toHaveAttribute("rel", "noopener");
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(start);
    // Opening is NOT installing: it waits for the app to report back.
    expect(within(card("NGA MIS")).getByText("Waiting…")).toBeInTheDocument();
    expect(screen.getByText("Finish in NGA MIS")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText("Install Task Mentor", { selector: "p" })).toBeInTheDocument();
    expect(within(card("NGA MIS")).getByText("Skipped")).toBeInTheDocument();
    expect(within(card("Task Mentor")).getByRole("link", { name: /Install & open/ })).toHaveAttribute("rel", "noopener");
  });

  it("updates live when an app's install card reports back", () => {
    render(<AppsInstallerPage />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { origin: "https://taskmentor.amashuri.com", data: { type: "nga-install", app: "taskmentor", status: "installed" } }),
      );
    });
    expect(within(card("Task Mentor")).getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("Task Mentor is installed and open")).toBeInTheDocument();

    // A forged message from elsewhere changes nothing.
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { type: "nga-install", app: "tendo", status: "installed" } }));
    });
    expect(within(card("Tendo")).getByText("Not installed")).toBeInTheDocument();
  });

  it("updates from an app's report cookie when you come back to this tab, and clears it", () => {
    render(<AppsInstallerPage />);
    document.cookie = `nga_inst_tupo=already.${Date.now()}; path=/`;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(within(card("Tupo")).getByText("Already installed")).toBeInTheDocument();
    expect(screen.getByText("Tupo is installed — opened in its own window")).toBeInTheDocument();
    expect(document.cookie).not.toContain("nga_inst_tupo=already");

    // A report left over from long before this visit is ignored.
    document.cookie = `nga_inst_tendo=installed.${Date.now() - 3_600_000}; path=/`;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(within(card("Tendo")).getByText("Not installed")).toBeInTheDocument();
  });

  it("marks an app installed -- or skipped -- when its card sends the user back here", () => {
    window.history.replaceState(null, "", "/apps?done=tendo&skipped=tupo");
    render(<AppsInstallerPage />);
    expect(window.location.search).toBe("");
    expect(within(card("Tendo")).getByText("Installed")).toBeInTheDocument();
    expect(within(card("Tupo")).getByText("Skipped")).toBeInTheDocument();
  });

  it("back on this tab with no report: asks whether the app opened as an app, in one click", async () => {
    render(<AppsInstallerPage />);
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    fireEvent.click(screen.getByRole("link", { name: /Install all apps/ }));
    clock.mockReturnValue(now + 5000);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText(/Did NGA MIS open in its own app window/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, it opened as an app" }));
    expect(within(card("NGA MIS")).getByText("Already installed")).toBeInTheDocument();
    clock.mockRestore();
  });

  it("has a Back button that leaves for NGA MIS when there's nowhere to go back to", () => {
    const assign = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { value: { ...original, assign, origin: original.origin, href: original.href }, configurable: true });
    try {
      render(<AppsInstallerPage />);
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(assign).toHaveBeenCalledWith("/home");
    } finally {
      Object.defineProperty(window, "location", { value: original, configurable: true });
    }
  });

  it("offers the managed-device files", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    render(<AppsInstallerPage />);
    fireEvent.click(screen.getByRole("button", { name: /Windows · Chrome/ }));
    expect(create).toHaveBeenCalledTimes(1);
    create.mockRestore();
  });
});

describe("a stale 'installed' note can't hide the prompt", () => {
  it("MIS forgets it as soon as the browser says the app is installable", async () => {
    const { initPwa, getPwaState } = await import("../../../reminders/pwa");
    try {
      localStorage.setItem("nga.pwa.installed", "1");
    } catch {
      /* ignore */
    }
    initPwa();
    const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: "dismissed" }) });
    window.dispatchEvent(e);
    expect(getPwaState().installed).toBe(false);
    expect(getPwaState().canPrompt).toBe(true);
  });
});

describe("an install button is always within reach", () => {
  const base = { installed: false, canPrompt: true, installMethod: "prompt", sheetOpen: false, hidden: false, onInstallerPage: false };
  it("shows whenever the browser says MIS is installable and the sheet is closed", () => {
    expect(shouldShowInstallButton(base)).toBe(true);
    expect(shouldShowInstallButton({ ...base, sheetOpen: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, hidden: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, installed: true })).toBe(false);
    expect(shouldShowInstallButton({ ...base, onInstallerPage: true })).toBe(false);
  });
  it("on Chromium waits for the browser's own signal; elsewhere shows until installed", () => {
    expect(shouldShowInstallButton({ ...base, canPrompt: false, installMethod: "manual" })).toBe(false);
    expect(shouldShowInstallButton({ ...base, canPrompt: false, installMethod: "ios" })).toBe(true);
    expect(shouldShowInstallButton({ ...base, canPrompt: false, installMethod: "mac-dock" })).toBe(true);
    expect(shouldShowInstallButton({ ...base, canPrompt: false, installMethod: "none" })).toBe(false);
  });
  it("an old 24-hour snooze no longer hides anything", async () => {
    const { clearLegacySnooze, autoPromptSnoozed } = await import("../../../reminders/pwa");
    try {
      localStorage.setItem("nga.pwa.autoPromptSnoozedUntil", String(Date.now() + 3_600_000));
      sessionStorage.removeItem("nga.pwa.autoPromptDismissedThisSession");
    } catch {
      /* ignore */
    }
    clearLegacySnooze();
    expect(autoPromptSnoozed()).toBe(false);
  });
});
