import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  initActivity,
  trackPage,
  track,
  flushActivity,
  resolveRoute,
  genericPattern,
  _resetActivityForTests,
  _trackerForTests,
} from "../vendor/nga-activity";

/**
 * nga-activity SDK (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §5.1, §18).
 */
const CATALOG = [
  { key: "mis.home", patterns: ["/home"] },
  { key: "mis.course", patterns: ["/courses/:id"] },
  { key: "mis.course.grades", patterns: ["/courses/:id/grades"] },
  { key: "mis.courses", patterns: ["/courses"] },
  { key: "mis.docs", patterns: ["/documents/*"] },
];

let vis: "visible" | "hidden" = "visible";
let focused = true;
let posts: { body: any; headers: Record<string, string> }[] = [];
let configBody: any;
let failPosts = false;

const fetchMock = vi.fn(async (url: string, init?: any) => {
  if (String(url).includes("/config")) return new Response(JSON.stringify(configBody), { status: 200 });
  if (failPosts) throw new TypeError("offline");
  posts.push({ body: JSON.parse(init.body), headers: init.headers ?? {} });
  return new Response(JSON.stringify({ ok: true }), { status: 202 });
});

const allEvents = () => posts.flatMap((p) => p.body.events);
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let token: string | null = "Bearer A";

const start = async (extra: Record<string, unknown> = {}) => {
  initActivity({
    app: "mis",
    endpoint: "https://api.example/activity/sync",
    configUrl: "https://api.example/activity/config",
    authHeader: () => token,
    userKey: () => token,
    catalog: CATALOG,
    heartbeatMs: 30_000,
    flushMs: 5_000,
    ...extra,
  });
  await vi.advanceTimersByTimeAsync(0);
  await settle();
};

beforeEach(() => {
  vi.useFakeTimers();
  vis = "visible";
  focused = true;
  posts = [];
  failPosts = false;
  token = "Bearer A";
  configBody = { enabled: true, heartbeat_s: 30, flush_s: 5, idle_after_s: 120, precise_location: "off", did: undefined, dt: "dt-token", v: 1 };
  localStorage.clear();
  sessionStorage.clear();
  document.cookie.split(";").forEach((c) => {
    document.cookie = `${c.split("=")[0].trim()}=; Max-Age=0; Path=/`;
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => vis });
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  _resetActivityForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("route patterns", () => {
  it("maps concrete paths to patterns and features", async () => {
    await start();
    const tr = _trackerForTests()!;
    expect(resolveRoute("mis", tr.compiled, "/courses/12/grades?tab=x#y")).toEqual({ route: "/courses/:id/grades", feature: "mis.course.grades" });
    expect(resolveRoute("mis", tr.compiled, "/courses/12")).toEqual({ route: "/courses/:id", feature: "mis.course" });
    expect(resolveRoute("mis", tr.compiled, "/courses")).toEqual({ route: "/courses", feature: "mis.courses" });
    expect(resolveRoute("mis", tr.compiled, "/documents/a/b/c")).toEqual({ route: "/documents/*", feature: "mis.docs" });
    expect(resolveRoute("mis", tr.compiled, "/students/120823/profile")).toEqual({ route: "/students/:id/profile", feature: "mis.other" });
  });

  it("turns ids, uuids, long tokens and emails into :id", () => {
    expect(genericPattern("/a/123/b/3fa85f64-5717-4562-b3fc-2c963f66afa6/c/jane@x.rw/d/AbCdEfGhIjKlMnOpQrStUv")).toBe("/a/:id/b/:id/c/:id/d/:id");
  });
});

describe("page views", () => {
  it("sends patterns and features, never the concrete path, and never a user id", async () => {
    await start();
    trackPage("/courses/987654/grades", "load");
    await vi.advanceTimersByTimeAsync(10);
    await flushActivity();
    const raw = JSON.stringify(posts.map((p) => p.body));
    expect(raw).not.toContain("987654");
    expect(raw).not.toContain("user_id");
    const pv = allEvents().find((e) => e.n === "page_view");
    expect(pv).toMatchObject({ r: "/courses/:id/grades", f: "mis.course.grades", p: { nav: "load" } });
    expect(posts[0].headers.Authorization).toBe("Bearer A");
    expect(posts[0].body.did).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("ignores a replace to the same page but counts a different id on the same pattern", async () => {
    await start();
    trackPage("/courses/1", "load");
    trackPage("/courses/1", "replace");
    trackPage("/courses/2", "push");
    await flushActivity();
    expect(allEvents().filter((e) => e.n === "page_view")).toHaveLength(2);
  });

  it("records the external referrer host and UTM tags on the first page view only", async () => {
    Object.defineProperty(document, "referrer", { configurable: true, get: () => "https://www.google.com/search?q=nga" });
    window.history.replaceState({}, "", "/?utm_source=newsletter&utm_medium=email");
    await start();
    trackPage("/home", "load");
    trackPage("/courses", "push");
    await flushActivity();
    const views = allEvents().filter((e) => e.n === "page_view");
    expect(views[0].p).toMatchObject({ ref_host: "www.google.com", utm_source: "newsletter", utm_medium: "email" });
    expect(views[1].p.ref_host).toBeUndefined();
    window.history.replaceState({}, "", "/");
  });
});

describe("engagement time", () => {
  it("counts only visible + focused time with recent input, and flushes it on hide", async () => {
    await start();
    trackPage("/home", "load");
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(15_000);
    window.dispatchEvent(new Event("keydown"));
    await vi.advanceTimersByTimeAsync(5_000);
    vis = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000); // hidden time never counts
    await settle();
    const eng = allEvents().filter((e) => e.n === "user_engagement");
    const total = eng.reduce((s, e) => s + e.p.ms, 0);
    expect(total).toBeGreaterThanOrEqual(19_000);
    expect(total).toBeLessThanOrEqual(21_000);
  });

  it("stops counting after the idle threshold without input", async () => {
    await start();
    trackPage("/home", "load");
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(10 * 60_000); // 10 minutes, no input
    vis = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    const total = allEvents().filter((e) => e.n === "user_engagement").reduce((s, e) => s + e.p.ms, 0);
    expect(total).toBeLessThanOrEqual(120_000 + 1_000);
    expect(total).toBeGreaterThanOrEqual(119_000);
  });

  it("does not count time while the window is blurred", async () => {
    await start();
    trackPage("/home", "load");
    window.dispatchEvent(new Event("pointerdown"));
    focused = false;
    window.dispatchEvent(new Event("blur"));
    await vi.advanceTimersByTimeAsync(30_000);
    focused = true;
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(5_000);
    vis = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    const total = allEvents().filter((e) => e.n === "user_engagement").reduce((s, e) => s + e.p.ms, 0);
    expect(total).toBeLessThan(10_000);
  });
});

describe("heartbeats", () => {
  it("beats every 30 s while visible, sends one hidden beat, then stays quiet", async () => {
    await start();
    trackPage("/home", "load");
    await settle();
    posts = [];
    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(posts.some((p) => p.body.beat?.vis === "visible" && p.body.beat.f === "mis.home")).toBe(true);
    vis = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(posts.some((p) => p.body.beat?.vis === "hidden")).toBe(true);
    posts = [];
    await vi.advanceTimersByTimeAsync(90_000);
    await settle();
    expect(posts.filter((p) => p.body.beat?.vis === "visible")).toHaveLength(0);
  });

  it("reports idle once input stops for the idle threshold", async () => {
    await start();
    trackPage("/home", "load");
    window.dispatchEvent(new Event("pointerdown"));
    posts = [];
    await vi.advanceTimersByTimeAsync(150_000);
    await settle();
    const beats = posts.map((p) => p.body.beat).filter(Boolean);
    expect(beats[beats.length - 1]).toMatchObject({ vis: "visible", idle: true });
  });
});

describe("autocapture", () => {
  it("captures data-track clicks, outbound links and downloads, without text", async () => {
    await start();
    trackPage("/home", "load");
    document.body.innerHTML = `
      <button data-track="mis.report.download"><span id="inner">Secret label</span></button>
      <a id="out" href="https://example.org/x">Out</a>
      <a id="dl" href="/files/report.pdf">PDF</a>`;
    document.getElementById("inner")!.click();
    document.getElementById("out")!.addEventListener("click", (e) => e.preventDefault());
    document.getElementById("out")!.click();
    document.getElementById("dl")!.addEventListener("click", (e) => e.preventDefault());
    document.getElementById("dl")!.click();
    await flushActivity();
    const ev = allEvents();
    expect(ev.find((e) => e.n === "click" && e.p?.key)).toMatchObject({ p: { key: "mis.report.download" } });
    expect(ev.find((e) => e.n === "click" && e.p?.outbound)).toMatchObject({ p: { outbound: true, link_host: "example.org" } });
    expect(ev.find((e) => e.n === "file_download")).toMatchObject({ p: { file_ext: "pdf" } });
    expect(JSON.stringify(ev)).not.toContain("Secret label");
  });

  it("tracks a named key event", async () => {
    await start();
    trackPage("/home", "load");
    track("mis.attendance.save", { count: 3 });
    track("Not A Valid Name");
    await flushActivity();
    expect(allEvents().filter((e) => e.n === "mis.attendance.save")).toHaveLength(1);
    expect(allEvents().some((e) => e.n === "Not A Valid Name")).toBe(false);
  });
});

describe("transport", () => {
  it("keeps events recorded under the previous account on that account's token", async () => {
    await start();
    trackPage("/home", "load");
    token = "Bearer B";
    track("mis.after.switch");
    await flushActivity();
    const pv = posts.find((p) => p.body.events.some((e: any) => e.n === "page_view"))!;
    const after = posts.find((p) => p.body.events.some((e: any) => e.n === "mis.after.switch"))!;
    expect(pv.headers.Authorization).toBe("Bearer A");
    expect(after.headers.Authorization).toBe("Bearer B");
  });

  it("persists the queue offline and resends it after a restart", async () => {
    await start();
    failPosts = true;
    trackPage("/home", "load");
    await flushActivity();
    await settle();
    expect(localStorage.getItem("nga_activity_q_mis")).toBeTruthy();
    _resetActivityForTests();
    failPosts = false;
    await start();
    await flushActivity();
    expect(allEvents().some((e) => e.n === "page_view")).toBe(true);
    expect(localStorage.getItem("nga_activity_q_mis")).toBeNull();
  });

  it("adopts a device id and token handed out by the server", async () => {
    configBody = { ...configBody, did: "AAAAAAAAAAAAAAAAAAAAAA", dt: "server-dt" };
    await start();
    trackPage("/home", "load");
    await flushActivity();
    expect(posts[0].body.did).toBe("AAAAAAAAAAAAAAAAAAAAAA");
    expect(posts[0].body.dt).toBe("server-dt");
    expect(localStorage.getItem("nga_did")).toBe("AAAAAAAAAAAAAAAAAAAAAA");
  });

  it("does nothing when the server switches collection off", async () => {
    configBody = { ...configBody, enabled: false };
    await start();
    trackPage("/home", "load");
    await vi.advanceTimersByTimeAsync(60_000);
    await flushActivity();
    expect(posts).toHaveLength(0);
  });
});

describe("vendored copies", () => {
  it("match their provenance hash (no hand edits)", () => {
    for (const f of ["index.ts", "react.ts"]) {
      const text = fs.readFileSync(path.resolve(__dirname, "../vendor/nga-activity", f), "utf8");
      const [, , shaLine, ...rest] = text.split("\n");
      const sha = crypto.createHash("sha256").update(rest.join("\n")).digest("hex");
      expect(shaLine).toBe(`// sha256:${sha}`);
    }
  });
});
