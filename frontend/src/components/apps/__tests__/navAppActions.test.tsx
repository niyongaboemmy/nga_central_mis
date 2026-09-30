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

describe("'Open app' proves it: landing in a browser tab means not installed here", () => {
  const setStandalone = (on: boolean) =>
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (q: string) => ({ matches: on && q.includes("standalone"), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
  const original = window.matchMedia;
  afterEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: original });
    setRelatedApps(null);
    resetInstallCheckForTests();
    window.history.replaceState(null, "", "/");
  });

  it("the link lands in a tab: not installed (even if Chrome's list says so), and the install sheet is requested", async () => {
    const { captureLaunchMarker, installRequested, clearInstallRequest } = await import("../../../reminders/pwa");
    setRelatedApps([{ platform: "webapp", id: "https://mis.amashuri.com/" }]); // Chrome's list: "installed"
    setStandalone(false);
    window.history.replaceState(null, "", "/home?source=pwa&nga_open=1");
    captureLaunchMarker();
    expect(window.location.search).toBe("?source=pwa");
    expect(await refreshInstallCheck()).toBe("no");
    expect(getPwaState().installed).toBe(false);
    expect(installRequested()).toBe(true);
    clearInstallRequest();
    renderAt();
    expect(screen.queryByRole("link", { name: "Open the NGA MIS app" })).toBeNull();
  });

  it("the link opens the app window: installed, and the old verdict is cleared", async () => {
    const { captureLaunchMarker, getInstallDiagnostics } = await import("../../../reminders/pwa");
    localStorage.setItem("nga.pwa.notOpenable", "1");
    setStandalone(true);
    window.history.replaceState(null, "", "/home?source=pwa&nga_open=1");
    captureLaunchMarker();
    expect(getInstallDiagnostics().notOpenableSince).toBeNull();
    expect(await refreshInstallCheck()).toBe("yes");
  });

  it("a real install clears the verdict", async () => {
    const { initPwa } = await import("../../../reminders/pwa");
    initPwa();
    localStorage.setItem("nga.pwa.notOpenable", "1");
    await refreshInstallCheck();
    expect(getPwaState().installed).toBe(false);
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(localStorage.getItem("nga.pwa.notOpenable")).toBeNull();
    expect(getPwaState().installed).toBe(true);
  });

  it("stuck record (can't open, Chrome won't offer install) -> flagged for the repair guide; cleared once Chrome drops it", async () => {
    const { getPwaState: state } = await import("../../../reminders/pwa");
    localStorage.setItem("nga.pwa.notOpenable", "1");
    setRelatedApps([{ platform: "webapp" }]); // Chrome still lists it
    await refreshInstallCheck();
    expect(state().notOpenable).toBe(true);
    expect(state().canPrompt).toBe(false);
    setRelatedApps([]); // removed in chrome://apps
    await refreshInstallCheck();
    expect(localStorage.getItem("nga.pwa.notOpenable")).toBeNull();
    expect(state().notOpenable).toBe(false);
    expect(state().installed).toBe(false);
  });

  it("'Open app' links carry the probe", async () => {
    setRelatedApps([{ platform: "webapp" }]);
    await act(async () => {
      await refreshInstallCheck();
    });
    renderAt();
    expect(screen.getByRole("link", { name: "Open the NGA MIS app" })).toHaveAttribute("href", `${window.location.origin}/home?source=pwa&nga_open=1`);
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
    expect(open).toHaveAttribute("href", `${window.location.origin}/home?source=pwa&nga_open=1`);
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
