import { describe, it, expect, vi, beforeEach } from "vitest";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createActivityRelay } from "../vendor/nga-activity-relay/relay";

/**
 * The satellite relay (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §5.2), exercised through the
 * copy vendored into this repo. The same file ships to Task Mentor, Tendo and Tupo.
 */
type Sent = { url: string; headers: Record<string, string>; body: any };
let sent: Sent[] = [];
let misStatus = 202;
let misBody: any = { accepted: 1, commands: [] };

const fetchImpl = vi.fn(async (url: string, init: any) => {
  if (misStatus === 0) throw new Error("ECONNREFUSED");
  const raw = init?.body ? (init.headers["Content-Encoding"] === "gzip" ? zlib.gunzipSync(init.body).toString() : String(init.body)) : null;
  sent.push({ url, headers: init?.headers ?? {}, body: raw ? JSON.parse(raw) : null });
  return new Response(JSON.stringify(misBody), { status: misStatus });
}) as any;

const res = () => {
  const r: any = { code: 0, json: null };
  r.status = (c: number) => ((r.code = c), r);
  r.end = () => r;
  r.json = (b: any) => ((r.body = b), r);
  r.set = () => r;
  return r;
};
const req = (body: any, h: Record<string, string> = {}, ip = "102.22.1.9") => ({
  body,
  ip,
  headers: Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])),
  get: (k: string) => h[k] ?? h[k.toLowerCase()],
  query: {},
});
const env = (did = "AAAAAAAAAAAAAAAAAAAAAA", extra: any = {}) => ({ v: 1, did, tab: "t1", sent_at: Date.now(), events: [{ id: "01J00000000000000000000000", n: "page_view", t: Date.now() }], ...extra });

const make = (userId: number | null) =>
  createActivityRelay({
    app: "tm",
    misBaseUrl: "https://api.example/",
    clientId: "taskmentor_app",
    clientSecret: "s3cret",
    origins: ["https://taskmentor.amashuri.com"],
    getUserId: () => userId,
    flushMs: 60_000,
    fetchImpl,
    logger: { warn: () => undefined, error: () => undefined },
  });

beforeEach(() => {
  sent = [];
  misStatus = 202;
  misBody = { accepted: 1, commands: [] };
  fetchImpl.mockClear();
});

describe("activity relay", () => {
  it("stamps the session's MIS user id and real IP, ignoring any user_id in the body", async () => {
    const relay = make(412);
    const r = res();
    await relay.handler(req({ ...env(), user_id: 999 }, { "User-Agent": "UA/1" }), r);
    expect(r.code).toBe(204);
    await relay.flush();
    expect(sent[0].url).toBe("https://api.example/activity/ingest");
    expect(sent[0].headers.Authorization).toBe(`Basic ${Buffer.from("taskmentor_app:s3cret").toString("base64")}`);
    const b = sent[0].body.batches[0];
    expect(b).toMatchObject({ user_id: 412, ip: "102.22.1.9", ua: "UA/1" });
    expect(b.envelope.user_id).toBeUndefined();
    await relay.stop();
  });

  it("drops anonymous batches from foreign origins and rate-limits public traffic per IP", async () => {
    const relay = make(null);
    await relay.handler(req(env(), { Origin: "https://evil.example" }), res());
    expect(relay._queue().batches).toBe(0);
    for (let i = 0; i < 40; i++) await relay.handler(req(env(`AAAAAAAAAAAAAAAAAAAA${String(i).padStart(2, "0")}`), { Origin: "https://taskmentor.amashuri.com" }, "41.186.1.1"), res());
    expect(relay._queue().batches).toBe(30);
    await relay.stop();
  });

  it("keeps only the newest presence beat per tab", async () => {
    const relay = make(7);
    for (let i = 0; i < 5; i++) await relay.handler(req({ v: 1, did: "BBBBBBBBBBBBBBBBBBBBBB", tab: "t1", sent_at: Date.now(), events: [], beat: { vis: "visible", n: i } }), res());
    expect(relay._queue().batches).toBe(1);
    await relay.stop();
  });

  it("keeps batches for a retry when MIS is down, and drops them on a 4xx config error", async () => {
    const relay = make(1);
    misStatus = 0;
    await relay.handler(req(env()), res());
    await relay.flush();
    expect(relay._queue().batches).toBe(1);
    misStatus = 403;
    await relay.flush();
    expect(relay._queue().batches).toBe(0);
    expect(relay.stats.dropped).toBe(1);
    await relay.stop();
  });

  it("forwards server-side key events and hands MIS commands back to the right browser", async () => {
    const relay = make(5);
    relay.track(5, "CCCCCCCCCCCCCCCCCCCCCC", "tm.quiz.submit", { quiz_id: 3 });
    relay.track(5, null, "Bad Name");
    misBody = { accepted: 1, commands: [{ did: "CCCCCCCCCCCCCCCCCCCCCC", cmd: { type: "end" } }] };
    await relay.flush();
    expect(sent[0].body.server_events).toHaveLength(1);
    expect(sent[0].body.server_events[0]).toMatchObject({ n: "tm.quiz.submit", user_id: 5, did: "CCCCCCCCCCCCCCCCCCCCCC" });
    const r = res();
    await relay.handler(req(env("CCCCCCCCCCCCCCCCCCCCCC")), r);
    expect(r.code).toBe(202);
    expect(r.body.cmd).toEqual({ type: "end" });
    await relay.stop();
  });

  it("proxies config and degrades to 'disabled' when MIS is unreachable", async () => {
    const relay = make(null);
    misStatus = 0;
    const r = res();
    await relay.configHandler({ query: { did: "x" } }, r);
    expect(r.body).toEqual({ enabled: false, v: 1 });
    await relay.stop();
  });

  it("reads the shared device id from the header or the cookie", () => {
    const relay = make(null);
    expect(relay.deviceIdOf({ headers: { cookie: "a=1; nga_did=DDDDDDDDDDDDDDDDDDDDDD" } })).toBe("DDDDDDDDDDDDDDDDDDDDDD");
    expect(relay.deviceIdOf({ headers: { "x-nga-device": "bad" } })).toBeNull();
    void relay.stop();
  });

  it("vendored copy matches its provenance hash", () => {
    const text = fs.readFileSync(path.resolve(__dirname, "../vendor/nga-activity-relay/relay.ts"), "utf8");
    const [, , shaLine, ...rest] = text.split("\n");
    expect(shaLine).toBe(`// sha256:${crypto.createHash("sha256").update(rest.join("\n")).digest("hex")}`);
  });
});
