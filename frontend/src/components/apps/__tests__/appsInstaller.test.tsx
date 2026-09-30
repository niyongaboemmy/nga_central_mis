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

  it("lists every app and walks 'Install all' as honest one-click steps", async () => {
    render(<AppsInstallerPage />);
    for (const app of NGA_APPS) expect(screen.getByText(app.name, { selector: "p" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Install all apps/ }));
    // In jsdom this page isn't an NGA origin and has no Web Install API, so the
    // step opens the app in a tab with its install card and a way back.
    const url = new URL(open.mock.calls[0][0] as string);
    expect(url.searchParams.get("nga_install")).toBe("1");
    expect(url.searchParams.get("return")).toBe(`${window.location.origin}/apps?done=mis`);
    expect(open.mock.calls[0][1]).toBe("_blank");

    // Opening a tab is NOT installing: it waits for the app to report back.
    expect(within(card("NGA MIS")).getByText("Waiting…")).toBeInTheDocument();
    expect(screen.getByText("Finish in the NGA MIS tab")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    // The step panel animates out before the next one comes in.
    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText("Install Task Mentor", { selector: "p" })).toBeInTheDocument();
    expect(within(card("NGA MIS")).getByText("Skipped")).toBeInTheDocument();
  });

  it("updates live when an app's install card reports back", () => {
    render(<AppsInstallerPage />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", { origin: "https://taskmentor.amashuri.com", data: { type: "nga-install", app: "taskmentor", status: "installed" } }),
      );
    });
    expect(within(card("Task Mentor")).getByText("Installed")).toBeInTheDocument();
    expect(screen.getByText("Task Mentor is installed")).toBeInTheDocument();

    // A forged message from elsewhere changes nothing.
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { type: "nga-install", app: "tendo", status: "installed" } }));
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

  it("says so when the browser blocks the new tab, with a link instead", () => {
    open.mockReturnValue(null);
    render(<AppsInstallerPage />);
    fireEvent.click(screen.getByRole("button", { name: /Install all apps/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your browser blocked the new tab");
    expect(within(card("NGA MIS")).getByText("Not installed")).toBeInTheDocument();
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
