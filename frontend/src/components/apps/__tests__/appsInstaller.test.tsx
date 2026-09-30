import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  buildMobileConfig,
  buildRegFile,
  emptyProgress,
  installHandoffUrl,
  manifestId,
  markStep,
  NGA_APPS,
  nextStep,
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
  beforeEach(() => {
    try {
      localStorage.removeItem("nga.installer.progress");
    } catch {
      /* ignore */
    }
    window.history.replaceState(null, "", "/apps");
  });

  it("lists every app and walks 'Install all' as one-click steps", () => {
    render(<AppsInstallerPage />);
    for (const app of NGA_APPS) expect(screen.getByText(app.name, { selector: "p" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Install all apps/ }));
    // In jsdom this page isn't one of the NGA origins and there is no Web
    // Install API, so each step hands off to the app with its install card.
    const step = screen.getByText("Step 1 of 4").closest("section")!;
    const link = step.querySelector("a[href*='nga_install=1']") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.target).toBe("_blank");
    expect(new URL(link.href).searchParams.get("return")).toBe(`${window.location.origin}/apps?done=mis`);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText("Install Task Mentor", { selector: "p" })).toBeInTheDocument();
  });

  it("marks an app done when its install card sends the user back", () => {
    window.history.replaceState(null, "", "/apps?done=tendo");
    render(<AppsInstallerPage />);
    expect(window.location.search).toBe("");
    const tendoCard = screen.getByText("Tendo", { selector: "p" }).closest("div")!;
    expect(tendoCard.textContent).toContain("Done");
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
