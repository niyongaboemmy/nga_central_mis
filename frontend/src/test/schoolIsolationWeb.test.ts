import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATA_CACHE, SCHOOL_CHOICE_KEY, clearIdentityCaches, forgetIdentity, noteIdentity } from "../lib/tenant";
import { hashIdentifier, rememberSchool, rememberedSchool } from "../lib/schoolSwitch";
import { agendaCacheId, agendaCacheUrl, cachedAgenda, shouldUseOfflineAgenda } from "../components/reminders/agendaCache";

/** School isolation audit 2026-11-25: browser-side findings WEB-ISO-7 and WEB-ISO-9. */
describe("WEB-ISO-7: the offline agenda", () => {
  const names = new Set<string>();
  let posted: unknown[] = [];

  beforeEach(() => {
    localStorage.clear();
    names.clear();
    posted = [];
    vi.stubGlobal("caches", {
      keys: async () => [...names],
      delete: async (n: string) => names.delete(n),
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller: { postMessage: (m: unknown) => posted.push(m) } },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lives in a cache the identity clear rule drops (the shared app cache stays)", async () => {
    for (const n of ["nga-agenda-v1", "elearning-v2-api", "elearning-v2-shell", "nga-app-v1"]) names.add(n);
    expect(DATA_CACHE.test("nga-agenda-v1")).toBe(true);
    expect(DATA_CACHE.test("nga-app-v1")).toBe(false);
    await clearIdentityCaches();
    expect([...names].sort()).toEqual(["nga-app-v1"]);
    // The worker forgets the previous person's token too.
    expect(posted).toContainEqual({ type: "nga:agenda-clear" });
  });

  it("is keyed by school and person, and only read for the signed-in identity", async () => {
    expect(agendaCacheId(null)).toBeNull();
    await noteIdentity(2, 7);
    expect(agendaCacheId()).toBe("t2.u7");
    expect(agendaCacheUrl("t2.u7")).toBe("/__nga/agenda.json?id=t2.u7");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await cachedAgenda()).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith("/__nga/agenda.json?id=t2.u7");
    localStorage.clear();
    fetchMock.mockClear();
    expect(await cachedAgenda()).toBeNull(); // no identity: never asks
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the cached copy only when the server could not be reached", () => {
    expect(shouldUseOfflineAgenda({ code: "ERR_NETWORK", message: "Network Error" })).toBe(true);
    expect(shouldUseOfflineAgenda({ code: "ECONNABORTED" })).toBe(true);
    for (const status of [401, 403, 404, 500, 503]) expect(shouldUseOfflineAgenda({ response: { status } })).toBe(false);
    expect(shouldUseOfflineAgenda(null)).toBe(false);
  });
});

describe("WEB-ISO-9: the remembered sign-in school", () => {
  beforeEach(() => localStorage.clear());

  it("stores a hash of the identifier, never the identifier itself", () => {
    rememberSchool("Jane@Mail.test", "ghs");
    const raw = localStorage.getItem(SCHOOL_CHOICE_KEY) ?? "";
    expect(raw).not.toMatch(/jane|mail\.test/i);
    expect(JSON.parse(raw)).toEqual({ [hashIdentifier("jane@mail.test")]: "ghs" });
    expect(rememberedSchool(" JANE@mail.test ")).toBe("ghs");
    expect(rememberedSchool("other@mail.test")).toBeNull();
  });

  it("drops entries written in plain text by older versions", () => {
    localStorage.setItem(SCHOOL_CHOICE_KEY, JSON.stringify({ "old@mail.test": "nga" }));
    rememberSchool("new@mail.test", "ghs");
    expect(localStorage.getItem(SCHOOL_CHOICE_KEY)).not.toContain("old@mail.test");
  });

  it("is forgotten on sign-out", async () => {
    rememberSchool("jane@mail.test", "ghs");
    await noteIdentity(2, 7);
    await forgetIdentity();
    expect(localStorage.getItem(SCHOOL_CHOICE_KEY)).toBeNull();
    expect(rememberedSchool("jane@mail.test")).toBeNull();
  });
});

describe("WEB-ISO-8: the e-learning worker's learner cache", () => {
  // Load public/elearning-sw.js with a fake worker scope.
  const load = async () => {
    const fs = await import("fs");
    const path = await import("path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../public/elearning-sw.js"), "utf8");
    const listeners: Record<string, (e: any) => void> = {};
    const store = new Map<string, Response>();
    const cache = {
      match: async (req: Request | string) => store.get(typeof req === "string" ? req : req.url)?.clone(),
      put: async (req: Request | string, res: Response) => void store.set(typeof req === "string" ? req : req.url, res),
    };
    let online = true;
    const fakeFetch = vi.fn(async (req: Request) => {
      if (!online) throw new TypeError("offline");
      return new Response(`body for ${req.headers.get("Authorization")}`, { status: 200 });
    });
    const scope = { addEventListener: (t: string, f: any) => (listeners[t] = f), location: { origin: "http://localhost" }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } };
    new Function("self", "caches", "fetch", "atob", src)(scope, { open: async () => cache, keys: async () => [], delete: async () => true, match: async () => undefined }, fakeFetch, atob);
    const get = async (token: string | null) => {
      let responded: Promise<Response> | null = null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      listeners.fetch({ request: new Request("http://localhost/elearning/my/courses", { headers }), respondWith: (p: Promise<Response>) => (responded = p) });
      return responded ? await (responded as Promise<Response>).then((r) => r.text()) : null;
    };
    return { get, setOnline: (v: boolean) => (online = v), store };
  };
  const tokenFor = (tid: number, userId: number) => `x.${btoa(JSON.stringify({ userId, tid })).replace(/=+$/, "")}.y`;

  it("never hands one learner's cached page to another, and caches nothing without an identity", async () => {
    const sw = await load();
    const a = tokenFor(1, 7);
    const b = tokenFor(2, 7); // same user id, another school
    expect(await sw.get(a)).toBe(`body for Bearer ${a}`);
    await new Promise((r) => setTimeout(r, 0));
    sw.setOnline(false);
    expect(await sw.get(a)).toBe(`body for Bearer ${a}`); // own copy offline
    const other = await sw.get(b);
    expect(other).not.toContain(a);
    expect(other).toContain("offline");
    expect(await sw.get(null)).toBeNull(); // no identity: the worker stays out of it
    expect([...sw.store.keys()].every((k) => k.includes("__nga_id=t1.u7"))).toBe(true);
  });
});
