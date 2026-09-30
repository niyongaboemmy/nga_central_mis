import { describe, it, expect, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getPwaState, refreshInstallCheck, resetInstallCheckForTests } from "../../../reminders/pwa";
import NavAppActions from "../NavAppActions";

/**
 * "Is NGA MIS installed?" comes from the browser (getInstalledRelatedApps),
 * live -- a remembered note goes stale when the app is uninstalled. The top
 * bar shows "Open app" only when that answer is yes, in a browser tab.
 */
const setRelatedApps = (apps: unknown[] | null) => {
  if (apps === null) delete (navigator as any).getInstalledRelatedApps;
  else (navigator as any).getInstalledRelatedApps = async () => apps;
};

const renderAt = (path = "/home") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NavAppActions />
    </MemoryRouter>,
  );

describe("live install detection", () => {
  afterEach(() => {
    setRelatedApps(null);
    try {
      localStorage.removeItem("nga.pwa.installed");
    } catch {
      /* ignore */
    }
    resetInstallCheckForTests();
  });

  it("an uninstalled app is not 'installed', even with an old remembered note", async () => {
    localStorage.setItem("nga.pwa.installed", "1");
    setRelatedApps([]);
    expect(await refreshInstallCheck()).toBe("no");
    expect(getPwaState().installed).toBe(false);
    expect(localStorage.getItem("nga.pwa.installed")).toBeNull();
  });

  it("trusts the browser's yes", async () => {
    setRelatedApps([{ platform: "webapp", id: "https://mis.amashuri.com/", url: "https://mis.amashuri.com/manifest.webmanifest" }]);
    expect(await refreshInstallCheck()).toBe("yes");
    expect(getPwaState().installed).toBe(true);
  });

  it("falls back to the remembered note only where the browser can't answer", async () => {
    localStorage.setItem("nga.pwa.installed", "1");
    resetInstallCheckForTests();
    expect(await refreshInstallCheck()).toBe("unknown");
    expect(getPwaState().installed).toBe(true);
  });
});

describe("a leftover record: listed as installed, but Chrome offers to install it here", () => {
  afterEach(() => {
    setRelatedApps(null);
    resetInstallCheckForTests();
  });

  it("counts as NOT installed -- no 'Open app' that would just open a browser tab", async () => {
    // The removed app is still in Chrome's list...
    setRelatedApps([{ platform: "webapp", id: "https://mis.amashuri.com/" }]);
    const { initPwa, getInstallDiagnostics } = await import("../../../reminders/pwa");
    initPwa();
    // ...and Chrome offers to install it on this device.
    act(() => {
      window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: "dismissed" }) }));
    });
    expect(await refreshInstallCheck()).toBe("no");
    expect(getPwaState().installed).toBe(false);
    expect(getPwaState().canPrompt).toBe(true);
    expect(getInstallDiagnostics().leftoverRecord).toBe(true);
    renderAt();
    expect(screen.queryByRole("link", { name: "Open the NGA MIS app" })).toBeNull();
    // Stays that way on the periodic re-check.
    expect(await refreshInstallCheck()).toBe("no");
  });
});

describe("installed or removed outside the installer", () => {
  afterEach(() => {
    setRelatedApps(null);
    resetInstallCheckForTests();
  });

  it("installed from Chrome's menu after the page offered it: the live answer wins, the old offer is dropped", async () => {
    const { initPwa } = await import("../../../reminders/pwa");
    initPwa();
    act(() => {
      window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: "dismissed" }) }));
    });
    setRelatedApps([]);
    expect(await refreshInstallCheck()).toBe("no");
    expect(getPwaState().canPrompt).toBe(true);

    setRelatedApps([{ platform: "webapp", id: "https://mis.amashuri.com/" }]);
    expect(await refreshInstallCheck()).toBe("yes");
    expect(getPwaState().installed).toBe(true);
    expect(getPwaState().canPrompt).toBe(false);
  });

  it("removed via chrome://apps while the page is open: goes back to not installed", async () => {
    setRelatedApps([{ platform: "webapp" }]);
    expect(await refreshInstallCheck()).toBe("yes");
    setRelatedApps([]);
    expect(await refreshInstallCheck()).toBe("no");
    expect(getPwaState().installed).toBe(false);
  });
});

describe("top-bar app controls", () => {
  afterEach(() => {
    setRelatedApps(null);
    resetInstallCheckForTests();
  });

  it("installed (confirmed) in a browser tab: a short 'Open app' link into the app window", async () => {
    setRelatedApps([{ platform: "webapp" }]);
    await act(async () => {
      await refreshInstallCheck();
    });
    renderAt();
    const open = screen.getByRole("link", { name: "Open the NGA MIS app" });
    expect(open).toHaveAttribute("href", `${window.location.origin}/home?source=pwa`);
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener"); // required for Chrome to open it in the app
    expect(screen.getByRole("link", { name: "Install the NGA apps" })).toHaveAttribute("href", "/apps");
  });

  it("not installed: no 'Open app'; the install icon carries a dot", async () => {
    setRelatedApps([]);
    await act(async () => {
      await refreshInstallCheck();
    });
    renderAt();
    expect(screen.queryByRole("link", { name: "Open the NGA MIS app" })).toBeNull();
    expect(screen.getByRole("link", { name: /Install the NGA apps \(NGA MIS isn't installed/ })).toBeInTheDocument();
  });

  it("unknown (browser can't say): never claims installed", () => {
    renderAt();
    expect(screen.queryByRole("link", { name: "Open the NGA MIS app" })).toBeNull();
  });

  it("stays out of the way on the installer page itself", () => {
    renderAt("/apps");
    expect(screen.queryByRole("link", { name: /Install the NGA apps/ })).toBeNull();
  });
});
