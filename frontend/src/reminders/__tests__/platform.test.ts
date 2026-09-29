import { describe, it, expect } from "vitest";
import { describePlatform, detectBrowser, detectOem, detectOS, type Env } from "../platform";
import { urlBase64ToUint8Array } from "../push";

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; TECNO KJ7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  winEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0",
};

const env = (userAgent: string, overrides: Partial<Env> = {}): Env => ({
  userAgent,
  platform: "",
  maxTouchPoints: 0,
  standalone: false,
  hasPushManager: true,
  hasServiceWorker: true,
  hasNotification: true,
  canPrompt: false,
  ...overrides,
});

describe("platform detection", () => {
  it("recognises the OS, including iPad pretending to be a Mac", () => {
    expect(detectOS(UA.androidChrome)).toBe("android");
    expect(detectOS(UA.iphoneSafari)).toBe("ios");
    expect(detectOS(UA.ipadDesktopMode, "MacIntel", 5)).toBe("ipados");
    expect(detectOS(UA.macSafari, "MacIntel", 0)).toBe("macos");
    expect(detectOS(UA.winEdge)).toBe("windows");
  });

  it("recognises the browser", () => {
    expect(detectBrowser(UA.samsung)).toBe("samsung");
    expect(detectBrowser(UA.winEdge)).toBe("edge");
    expect(detectBrowser(UA.iphoneChrome)).toBe("chrome");
    expect(detectBrowser(UA.macSafari)).toBe("safari");
    expect(detectBrowser(UA.winFirefox)).toBe("firefox");
  });

  it("knows the phone maker for the battery-saver tips", () => {
    expect(detectOem(UA.androidChrome)).toBe("tecno");
    expect(detectOem(UA.samsung)).toBe("samsung");
    expect(detectOem(UA.winEdge)).toBe("other");
  });
});

describe("install and push capability", () => {
  it("Android Chrome with a captured prompt installs in one tap and can push without installing", () => {
    const p = describePlatform(env(UA.androidChrome, { canPrompt: true }));
    expect(p.installMethod).toBe("prompt");
    expect(p.pushCapable).toBe(true);
    expect(p.pushNeedsInstall).toBe(false);
  });

  it("Chromium without the event yet falls back to the menu", () => {
    expect(describePlatform(env(UA.winEdge)).installMethod).toBe("manual");
  });

  it("iPhone must install (any browser) before push works", () => {
    const tab = describePlatform(env(UA.iphoneChrome));
    expect(tab.installMethod).toBe("ios");
    expect(tab.pushNeedsInstall).toBe(true);
    expect(tab.pushCapable).toBe(false);
    const installed = describePlatform(env(UA.iphoneSafari, { standalone: true }));
    expect(installed.pushCapable).toBe(true);
  });

  it("Safari on Mac adds to the Dock; Firefox depends on OS and version", () => {
    expect(describePlatform(env(UA.macSafari, { platform: "MacIntel" })).installMethod).toBe("mac-dock");
    expect(describePlatform(env(UA.winFirefox)).installMethod).toBe("firefox-taskbar");
    expect(describePlatform(env(UA.linuxFirefox)).installMethod).toBe("none");
  });

  it("no service worker means no push", () => {
    expect(describePlatform(env(UA.winEdge, { hasServiceWorker: false })).pushCapable).toBe(false);
  });
});

describe("VAPID key decoding", () => {
  it("decodes URL-safe base64 without padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID-_8"))).toEqual([1, 2, 3, 251, 255]);
    expect(urlBase64ToUint8Array("BMUUyP3lro5EMWx3alrXTrOVzTJiQ72KgfKiffHEG-l6KvuxPWCQpFeUU-Y2c2-HrDwRgOiDarxC8qLj1XLtvz4")).toHaveLength(65);
  });
});
