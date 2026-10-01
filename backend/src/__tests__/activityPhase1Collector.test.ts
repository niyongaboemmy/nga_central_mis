import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import http from "http";
import jwt from "jsonwebtoken";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { System, User } from "../db/schema";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { createUser, signToken } from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";
import { isV2OnlyCapability } from "../access/v2Only";
import { q } from "../services/activity/db";
import { flushActivity, resetWriter } from "../services/activity/writer";
import { resetPresence, listPeople, sweepPresence, presenceCounts } from "../services/activity/presence";
import { resetSessions } from "../services/activity/sessionizer";
import { resetDedupe, occurredAt } from "../services/activity/ingest";
import { clock } from "../services/activity/runtime";
import { clearPeopleCaches } from "../services/activity/people";
import { invalidateSettings } from "../services/activity/settings";
import { setGeoProvider, UNKNOWN_GEO } from "../services/activity/geoip";
import { clearDimCaches } from "../services/activity/dims";
import { deviceToken, newDeviceId, ulid } from "../services/activity/tokens";
import { ipToBuffer, ipToString, normalizeIp, parseCidr, cidrContains, isPrivateIp } from "../services/activity/ip";
import { parseUa } from "../services/activity/ua";
import { sanitizeRoute } from "../services/activity/schema";
import { redactBody } from "../middleware/requestLogger";
import { invalidateActivityAuth } from "../middleware/activityAuth";

/**
 * USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md — Phase 0 + Phase 1 (collector, sessions,
 * presence, relay ingest, auth events, capability gates, G1/G4/G5 fixes).
 */
const ORIGIN = "https://mis.amashuri.com";
const UA_CHROME_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const tokenFor = (userId: number) =>
  jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" });

const envelope = (did: string, events: any[], extra: Record<string, unknown> = {}) => ({
  v: 1,
  did,
  dt: deviceToken(did),
  tab: "tab1",
  sent_at: clock.now(),
  events,
  ...extra,
});
const ev = (n: string, extra: Record<string, unknown> = {}, at = clock.now()) => ({ id: ulid(at), n, t: at, ...extra });

const sync = (body: unknown, opts: { token?: string; ip?: string; origin?: string | null; ua?: string } = {}) => {
  let r = request(app).post("/activity/sync").set("Content-Type", "application/json").set("User-Agent", opts.ua ?? UA_CHROME_WIN);
  if (opts.origin !== null) r = r.set("Origin", opts.origin ?? ORIGIN);
  if (opts.token) r = r.set("Authorization", `Bearer ${opts.token}`);
  if (opts.ip) r = r.set("X-Forwarded-For", opts.ip);
  return r.send(JSON.stringify(body));
};

/** Open an SSE stream on an ephemeral server and resolve once `marker` has arrived. */
const readSse = (path: string, marker: string) =>
  new Promise<string>((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      let buf = "";
      const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
        res.on("data", (d: Buffer) => {
          buf += d.toString();
          if (buf.includes(marker)) {
            req.destroy();
            server.close();
            resolve(buf);
          }
        });
      });
      req.on("error", () => undefined);
      setTimeout(() => {
        req.destroy();
        server.close();
        reject(new Error(`no ${marker} in: ${buf.slice(0, 200)}`));
      }, 5_000);
    });
  });

const presetRole = async (key: string) =>
  (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;
async function grant(userId: number, preset: string) {
  await db.insert(AccessGrant).values({
    user_id: userId, role_id: await presetRole(preset), scope_type: "PLATFORM" as any, scope_id: null, source: "MANUAL", status: "ACTIVE",
  });
  await db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }).where(eq(UserAccessVersion.user_id, userId));
}

beforeAll(async () => {
  await ensureAccessRegistry();
});

beforeEach(() => {
  resetWriter();
  resetPresence();
  resetSessions();
  resetDedupe();
  clock.reset();
  clearPeopleCaches();
  clearDimCaches();
  invalidateSettings();
  setGeoProvider((ip) =>
    ip.startsWith("102.22.")
      ? { ...UNKNOWN_GEO, country_code: "RW", country: "Rwanda", region: "Kigali", city: "Kigali", lat: -1.95, lon: 30.06, asn: 37228, isp: "Liquid Telecommunications Rwanda", conn_type: "fixed" }
      : ip.startsWith("41.186.")
        ? { ...UNKNOWN_GEO, country_code: "RW", country: "Rwanda", region: "Southern Province", city: "Huye", asn: 36924, isp: "MTN RWANDACELL", conn_type: "mobile" }
        : UNKNOWN_GEO,
  );
});

afterAll(() => {
  setGeoProvider(null);
  clock.reset();
});

describe("Phase 0 helpers", () => {
  it("normalises and round-trips IPv4, IPv4-mapped, IPv6 and forwarded lists", () => {
    expect(normalizeIp("::ffff:102.22.1.9")).toBe("102.22.1.9");
    expect(normalizeIp("102.22.1.9, 10.0.0.1")).toBe("102.22.1.9");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(ipToString(ipToBuffer("102.22.1.9"))).toBe("102.22.1.9");
    expect(ipToBuffer("102.22.1.9")!.length).toBe(4);
    expect(ipToString(ipToBuffer("2001:db8:0:0:0:0:0:1"))).toBe("2001:db8::1");
    expect(ipToBuffer("2001:db8::1")!.length).toBe(16);
  });

  it("matches CIDR ranges and flags private networks", () => {
    const c = parseCidr("102.22.0.0/16")!;
    expect(cidrContains(c, ipToBuffer("102.22.200.1"))).toBe(true);
    expect(cidrContains(c, ipToBuffer("102.23.0.1"))).toBe(false);
    expect(cidrContains(parseCidr("2001:db8::/32")!, ipToBuffer("2001:db8:ffff::1"))).toBe(true);
    expect(isPrivateIp(ipToBuffer("192.168.1.4"))).toBe(true);
    expect(isPrivateIp(ipToBuffer("102.22.1.9"))).toBe(false);
  });

  it("parses common user agents and recognises bots", () => {
    expect(parseUa(UA_CHROME_WIN)).toMatchObject({ browser: "Chrome", browser_ver: "140", os: "Windows", device_type: "desktop", is_bot_ua: false });
    const iphone = parseUa("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1");
    expect(iphone).toMatchObject({ browser: "Safari", os: "iOS", os_ver: "18", device_type: "mobile" });
    expect(parseUa("Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36 EdgA/139.0")).toMatchObject({ browser: "Edge", os: "Android", device_type: "mobile" });
    expect(parseUa("facebookexternalhit/1.1").is_bot_ua).toBe(true);
    expect(parseUa("Mozilla/5.0 HeadlessChrome/120.0").is_bot_ua).toBe(true);
    expect(parseUa("curl/8.4.0").device_type).toBe("bot");
  });

  it("keeps only route patterns, never ids, emails or query strings", () => {
    expect(sanitizeRoute("/courses/:id/grades?tab=2#x")).toBe("/courses/:id/grades");
    expect(sanitizeRoute("/students/120823")).toBe("(invalid)");
    expect(sanitizeRoute("/users/jane@nga.ac.rw")).toBe("(invalid)");
    expect(sanitizeRoute("/x/3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe("(invalid)");
  });

  it("makes event time deterministic so retries collide", () => {
    const recv = 1_800_000_000_000;
    expect(occurredAt(recv - 5_000, recv - 1_000, recv)).toBe(recv - 5_000); // small skew ignored
    const skewed = occurredAt(recv - 10 * 60_000 - 5_000, recv - 10 * 60_000, recv); // client 10 min slow
    expect(skewed).toBe(recv - 5_000);
    expect(occurredAt(recv - 100 * 3600_000, recv, recv)).toBe(recv - 72 * 3600_000); // 72 h clamp
    expect(occurredAt(recv + 3600_000, recv, recv)).toBe(recv); // never in the future
  });

  it("redacts credentials from logged request bodies (G4)", () => {
    expect(redactBody({ username: "a", password: "p", nested: { otp: "123", ok: 1 } })).toEqual({
      username: "a",
      password: "[redacted]",
      nested: { otp: "[redacted]", ok: 1 },
    });
  });

  it("runs the activity pool's MySQL session in UTC", async () => {
    const rows = await q<any>("SELECT @@session.time_zone AS tz");
    expect(rows[0].tz).toBe("+00:00");
  });

  it("keeps every ANALYTICS_* capability out of legacy permission outputs", () => {
    for (const c of ["ANALYTICS_VIEW", "ANALYTICS_LIVE_VIEW", "ANALYTICS_USER_VIEW", "ANALYTICS_LOCATION_VIEW", "ANALYTICS_USER_CONTROL", "ANALYTICS_CONFIGURE"])
      expect(isV2OnlyCapability(c)).toBe(true);
  });

  it("only lets a user read their own activity feed unless they manage users (G5)", async () => {
    const me = await createUser();
    const other = await createUser();
    const own = await request(app).get(`/users/${me}/activities`).set("Authorization", `Bearer ${signToken(me)}`);
    expect(own.status).not.toBe(403);
    const theirs = await request(app).get(`/users/${other}/activities`).set("Authorization", `Bearer ${signToken(me)}`);
    expect(theirs.status).toBe(403);
  });
});

describe("Collector: /activity/config and /activity/sync", () => {
  it("issues a device token, and refuses to resume a device with history without its token", async () => {
    const fresh = newDeviceId();
    const r1 = await request(app).get(`/activity/config?did=${fresh}`);
    expect(r1.status).toBe(200);
    expect(r1.body.did).toBe(fresh);
    expect(r1.body.dt).toBe(deviceToken(fresh));

    // Give the device some history, then try to claim it without the token.
    await sync(envelope(fresh, [ev("page_view", { r: "/login", f: "mis.login" })]), { ip: "41.186.10.10" });
    await flushActivity();
    const r2 = await request(app).get(`/activity/config?did=${fresh}`);
    expect(r2.body.did).not.toBe(fresh);
  });

  it("accepts anonymous public-page events from allowed origins only, and filters non-public events", async () => {
    const did = newDeviceId();
    const bad = await sync(envelope(did, [ev("page_view", { r: "/" })]), { origin: "https://evil.example" });
    expect(bad.status).toBe(202);
    expect(bad.body.error).toBe("origin");

    const ok = await sync(envelope(did, [ev("page_view", { r: "/login", f: "mis.login" }), ev("tm.quiz.submit")]), { ip: "41.186.10.10" });
    expect(ok.status).toBe(202);
    expect(ok.body.accepted).toBe(1);
    expect(ok.body.rejected).toBe(1);
    await flushActivity();

    const rows = await q<any>("SELECT name, user_id, route, feature, INET6_NTOA(ip) AS ip FROM AnalyticsEvent WHERE device_id = ? AND name = 'page_view'", [did]);
    expect(rows).toEqual([{ name: "page_view", user_id: null, route: "/login", feature: "mis.login", ip: "41.186.10.10" }]);
    // Full IP is stored (D3) with its geo/ISP.
    const dev = await q<any>(
      "SELECT INET6_NTOA(d.last_ip) AS ip, g.city, g.isp, g.conn_type FROM AnalyticsDevice d JOIN AnalyticsGeo g ON g.geo_id = d.last_geo_id WHERE d.device_id = ?",
      [did],
    );
    expect(dev[0]).toMatchObject({ ip: "41.186.10.10", city: "Huye", isp: "MTN RWANDACELL", conn_type: "mobile" });
  });

  it("re-keys an anonymous batch whose device token is forged", async () => {
    const did = newDeviceId();
    const r = await sync({ ...envelope(did, [ev("page_view", { r: "/" })]), dt: "forged" }, { ip: "41.186.1.1" });
    expect(r.body.did).toBeTruthy();
    expect(r.body.did).not.toBe(did);
    expect(r.body.dt).toBe(deviceToken(r.body.did));
  });

  it("attributes signed-in batches to the token's user, never to a user_id in the body", async () => {
    const userId = await createUser({ userType: "TEACHER" });
    const someoneElse = await createUser();
    const did = newDeviceId();
    const r = await sync(
      { ...envelope(did, [ev("page_view", { r: "/dashboard", f: "mis.dashboard", pv: "p1" })]), user_id: someoneElse },
      { token: tokenFor(userId), ip: "102.22.1.9" },
    );
    expect(r.status).toBe(202);
    expect(r.body.accepted).toBe(1);
    expect(typeof r.body.ticket).toBe("string");
    await flushActivity();
    const rows = await q<any>("SELECT user_id FROM AnalyticsEvent WHERE device_id = ? AND name = 'page_view'", [did]);
    expect(rows.map((x) => Number(x.user_id))).toEqual([userId]);
    const st = await q<any>("SELECT INET6_NTOA(last_ip) AS ip, JSON_EXTRACT(first_seen_by_app, '$.mis') IS NOT NULL AS first FROM AnalyticsUserState WHERE user_id = ?", [userId]);
    expect(st[0]).toMatchObject({ ip: "102.22.1.9", first: 1 });
    const ui = await q<any>("SELECT INET6_NTOA(ip) AS ip FROM AnalyticsUserIp WHERE user_id = ?", [userId]);
    expect(ui.map((x) => x.ip)).toEqual(["102.22.1.9"]);
  });

  it("treats a revoked token (logout) as anonymous", async () => {
    const userId = await createUser();
    const token = tokenFor(userId);
    await db.update(User).set({ token_version: 1 }).where(eq(User.user_id, userId));
    invalidateActivityAuth(userId);
    const did = newDeviceId();
    const r = await sync(envelope(did, [ev("page_view", { r: "/dashboard" })]), { token });
    expect(r.body.ticket).toBeUndefined();
    await flushActivity();
    const rows = await q<any>("SELECT user_id FROM AnalyticsEvent WHERE device_id = ? AND name='page_view'", [did]);
    expect(rows[0].user_id).toBeNull();
  });

  it("drops a retried event (same ULID) instead of storing it twice", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    const e = ev("page_view", { r: "/home", f: "mis.home" });
    await sync(envelope(did, [e]), { token: tokenFor(userId) });
    const again = await sync(envelope(did, [e]), { token: tokenFor(userId) });
    expect(again.body.accepted).toBe(0);
    await flushActivity();
    const rows = await q<any>("SELECT COUNT(*) AS n FROM AnalyticsEvent WHERE event_id = ?", [e.id]);
    expect(Number(rows[0].n)).toBe(1);
  });

  it("records the real client IP from X-Forwarded-For (trust proxy, G1)", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    await sync(envelope(did, [ev("page_view", { r: "/home" })]), { token: tokenFor(userId), ip: "102.22.7.7" });
    await flushActivity();
    const rows = await q<any>("SELECT INET6_NTOA(ip) AS ip FROM AnalyticsEvent WHERE device_id = ? AND name='page_view'", [did]);
    expect(rows[0].ip).toBe("102.22.7.7");
  });
});

describe("Sessionizer", () => {
  it("keeps one session within 30 min of inactivity and starts a new one after it (no midnight split)", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    const token = tokenFor(userId);
    const t0 = Date.UTC(2026, 9, 1, 21, 50); // 23:50 Kigali — crosses local midnight
    clock.freeze(t0);
    await sync(envelope(did, [ev("page_view", { r: "/a" }, t0)]), { token });
    clock.freeze(t0 + 29 * 60_000 + 59_000);
    await sync(envelope(did, [ev("page_view", { r: "/b" }, clock.now())]), { token });
    clock.freeze(t0 + 29 * 60_000 + 59_000 + 30 * 60_000 + 1_000);
    await sync(envelope(did, [ev("page_view", { r: "/c" }, clock.now())]), { token });
    await flushActivity();
    const sessions = await q<any>("SELECT page_views, is_engaged, ended_at IS NOT NULL AS ended FROM AnalyticsSession WHERE device_id = ? ORDER BY started_at", [did]);
    expect(sessions.map((s) => Number(s.page_views))).toEqual([2, 1]);
    expect(sessions[0]).toMatchObject({ is_engaged: 1, ended: 1 });
    expect(sessions[1].is_engaged).toBe(0);
  });

  it("marks a session engaged after 10 s of engagement even with a single page view", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    await sync(envelope(did, [ev("page_view", { r: "/a", pv: "p1" }), ev("user_engagement", { pv: "p1", p: { ms: 12_000 } })]), { token: tokenFor(userId) });
    await flushActivity();
    const s = await q<any>("SELECT is_engaged, engagement_ms FROM AnalyticsSession WHERE device_id = ?", [did]);
    expect(s[0]).toMatchObject({ is_engaged: 1, engagement_ms: 12_000 });
  });

  it("stitches a visitor to the account they sign in with, in the same session", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    await sync(envelope(did, [ev("page_view", { r: "/login", f: "mis.login" })]), { ip: "41.186.3.3" });
    await sync(envelope(did, [ev("page_view", { r: "/home", f: "mis.home" })]), { token: tokenFor(userId), ip: "41.186.3.3" });
    await flushActivity();
    const s = await q<any>("SELECT user_id, stitched_at IS NOT NULL AS stitched, page_views FROM AnalyticsSession WHERE device_id = ?", [did]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ stitched: 1, page_views: 2 });
    expect(Number(s[0].user_id)).toBe(userId);
    const d = await q<any>("SELECT first_user_id, linked_user_ids FROM AnalyticsDevice WHERE device_id = ?", [did]);
    expect(Number(d[0].first_user_id)).toBe(userId);
  });

  it("starts a new session when a different person signs in on the same (shared) device", async () => {
    const a = await createUser();
    const b = await createUser();
    const did = newDeviceId();
    await sync(envelope(did, [ev("page_view", { r: "/home" })]), { token: tokenFor(a) });
    await sync(envelope(did, [ev("page_view", { r: "/home" })]), { token: tokenFor(b) });
    await flushActivity();
    const s = await q<any>("SELECT user_id FROM AnalyticsSession WHERE device_id = ? ORDER BY session_id", [did]);
    expect(s.map((r) => Number(r.user_id))).toEqual([a, b]);
  });
});

describe("Relay ingest (/activity/ingest)", () => {
  let clientId: string;
  const secret = "relay-secret-123";
  beforeAll(async () => {
    clientId = `tm_relay_${Date.now()}`;
    process.env.ACTIVITY_SOURCE_CLIENTS = `${clientId}=tm,discipline_attendance=tendo,tupo=tupo`;
    await db.insert(System).values({
      name: `TM relay test ${clientId}`, client_id: clientId, client_secret: secret, allowed_redirect_uris: "http://localhost",
      icon_url: "x", home_url: "http://localhost", status: "ACTIVE",
    } as any);
  });
  afterAll(() => {
    delete process.env.ACTIVITY_SOURCE_CLIENTS;
  });
  const basic = (id: string, s: string) => `Basic ${Buffer.from(`${id}:${s}`).toString("base64")}`;

  it("refuses clients that are not on the activity allowlist", async () => {
    process.env.ACTIVITY_SOURCE_CLIENTS = "someone_else=tm";
    const r = await request(app).post("/activity/ingest").set("Authorization", basic(clientId, secret)).set("Content-Type", "application/json").send(JSON.stringify({ batches: [] }));
    expect(r.status).toBe(403);
    process.env.ACTIVITY_SOURCE_CLIENTS = `${clientId}=tm,discipline_attendance=tendo,tupo=tupo`;
  });

  it("joins MIS and Task Mentor activity on one device into one cross-app session", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    await sync(envelope(did, [ev("page_view", { r: "/home", f: "mis.home" })]), { token: tokenFor(userId), ip: "102.22.1.9" });
    const r = await request(app)
      .post("/activity/ingest")
      .set("Authorization", basic(clientId, secret))
      .set("Content-Type", "application/json")
      .send(JSON.stringify({
        app: "tupo", // ignored: the client id decides the app
        batches: [{ user_id: userId, ip: "102.22.1.9", ua: UA_CHROME_WIN, envelope: envelope(did, [ev("page_view", { r: "/courses/:id/grades", f: "tm.course.grades" })], { beat: { vis: "visible", r: "/courses/:id/grades", f: "tm.course.grades" } }) }],
        server_events: [{ id: ulid(), n: "tm.quiz.submit", t: clock.now(), user_id: userId, did, p: { quiz_id: 5 } }],
      }));
    expect(r.status).toBe(202);
    expect(r.body.accepted).toBe(2);
    await flushActivity();
    const s = await q<any>("SELECT app_path, apps_mask, page_views, events FROM AnalyticsSession WHERE device_id = ?", [did]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ app_path: "mis>tm", apps_mask: 3, page_views: 2 });
    const tmEvents = await q<any>("SELECT name FROM AnalyticsEvent WHERE device_id = ? AND app = 2 ORDER BY occurred_at", [did]);
    expect(tmEvents.map((e) => e.name)).toEqual(expect.arrayContaining(["page_view", "tm.quiz.submit", "first_visit"]));
    // Presence shows the person on the TM gradebook.
    const people = listPeople();
    const me = people.find((p) => p.user?.id === userId)!;
    expect(me.tabs.some((t) => t.app === "tm" && t.feature === "tm.course.grades")).toBe(true);
  });

  it("re-keys anonymous relay batches without a valid device token", async () => {
    const did = newDeviceId();
    await request(app)
      .post("/activity/ingest")
      .set("Authorization", basic(clientId, secret))
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ batches: [{ user_id: null, ip: "41.186.9.9", envelope: { ...envelope(did, [ev("page_view", { r: "/login" })]), dt: undefined } }] }));
    await flushActivity();
    const rows = await q<any>("SELECT COUNT(*) AS n FROM AnalyticsEvent WHERE device_id = ?", [did]);
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe("Presence", () => {
  it("moves a tab active → idle → background → offline", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    const token = tokenFor(userId);
    const t0 = Date.now();
    clock.freeze(t0);
    await sync(envelope(did, [], { beat: { vis: "visible", r: "/home", f: "mis.home" } }), { token });
    expect(listPeople().find((p) => p.user?.id === userId)?.status).toBe("active");

    await sync(envelope(did, [], { beat: { vis: "visible", idle: true, r: "/home" } }), { token });
    expect(listPeople().find((p) => p.user?.id === userId)?.status).toBe("idle");

    await sync(envelope(did, [], { beat: { vis: "hidden", r: "/home" } }), { token });
    expect(listPeople().find((p) => p.user?.id === userId)?.status).toBe("background");
    expect(presenceCounts().background).toBe(1);

    clock.freeze(t0 + 11 * 60_000);
    sweepPresence();
    expect(listPeople().find((p) => p.user?.id === userId)).toBeUndefined();
  });

  it("drops a visible tab whose beats stop for 90 s", async () => {
    const did = newDeviceId();
    const t0 = Date.now();
    clock.freeze(t0);
    await sync(envelope(did, [], { beat: { vis: "visible", r: "/" } }), { ip: "41.186.2.2" });
    expect(presenceCounts().visitors).toBe(1);
    clock.freeze(t0 + 91_000);
    sweepPresence();
    expect(presenceCounts().online).toBe(0);
  });

  it("counts one person with two tabs once, and replaces the visitor entry when the device signs in", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    await sync(envelope(did, [], { beat: { vis: "visible", r: "/login" } }), { ip: "41.186.2.3" });
    expect(presenceCounts().visitors).toBe(1);
    const token = tokenFor(userId);
    await sync({ ...envelope(did, [], { beat: { vis: "visible", r: "/home" } }), tab: "a" }, { token });
    await sync({ ...envelope(did, [], { beat: { vis: "visible", r: "/academics" } }), tab: "b" }, { token });
    const c = presenceCounts();
    expect(c.visitors).toBe(0);
    expect(c.users).toBe(1);
    expect(listPeople().find((p) => p.user?.id === userId)!.tabs).toHaveLength(2);
  });

  it("ignores a 'hidden' beat that arrives after the tab's 'gone' but was sent before it", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    const token = tokenFor(userId);
    const t0 = clock.now();
    await sync({ ...envelope(did, [], { beat: { vis: "visible", r: "/home" } }), sent_at: t0 }, { token });
    expect(listPeople().some((p) => p.user?.id === userId)).toBe(true);
    // Unload sends "hidden" (t0+1000) then "gone" (t0+1001); they arrive in reverse.
    await sync({ ...envelope(did, [], { beat: { vis: "gone" } }), sent_at: t0 + 1001 }, { token });
    await sync({ ...envelope(did, [], { beat: { vis: "hidden", r: "/home" } }), sent_at: t0 + 1000 }, { token });
    expect(listPeople().some((p) => p.user?.id === userId)).toBe(false);
    // Chrome fires pagehide BEFORE visibilitychange on navigation: a later "hidden" stays ignored.
    await sync({ ...envelope(did, [], { beat: { vis: "hidden", r: "/home" } }), sent_at: t0 + 1002 }, { token });
    expect(listPeople().some((p) => p.user?.id === userId)).toBe(false);
    // The same tab coming back later (bfcache restore) is live again.
    await sync({ ...envelope(did, [], { beat: { vis: "visible", r: "/home" } }), sent_at: t0 + 5000 }, { token });
    expect(listPeople().some((p) => p.user?.id === userId)).toBe(true);
  });

  it("logout removes the person from presence at once", async () => {
    const userId = await createUser();
    const did = newDeviceId();
    const token = tokenFor(userId);
    await sync(envelope(did, [], { beat: { vis: "visible", r: "/home" } }), { token });
    expect(listPeople().some((p) => p.user?.id === userId)).toBe(true);
    const r = await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(listPeople().some((p) => p.user?.id === userId)).toBe(false);
  });
});

describe("Monitor API access", () => {
  it("refuses /monitor/live without an ANALYTICS capability", async () => {
    const plain = await createUser();
    const r = await request(app).get("/monitor/live").set("Authorization", `Bearer ${signToken(plain)}`);
    expect(r.status).toBe(403);
  });

  it("gives a platform owner the named live roster, with app, feature, IP and place", async () => {
    const owner = await createUser({ userType: "ADMIN" });
    await grant(owner, "platform_owner");
    const teacher = await createUser({ userType: "TEACHER" });
    const did = newDeviceId();
    await sync(envelope(did, [ev("page_view", { r: "/academics", f: "mis.academics" })], { beat: { vis: "visible", r: "/academics", f: "mis.academics" } }), { token: tokenFor(teacher), ip: "102.22.4.4" });

    const r = await request(app).get("/monitor/live").set("Authorization", `Bearer ${signToken(owner)}`);
    expect(r.status).toBe(200);
    expect(r.body.data.named).toBe(true);
    const p = r.body.data.people.find((x: any) => x.user?.id === teacher);
    expect(p.user.type).toBe("TEACHER");
    expect(p.tabs[0]).toMatchObject({ app: "mis", feature: "mis.academics", ip: "102.22.4.4" });
    expect(p.tabs[0].geo).toMatchObject({ city: "Kigali", isp: "Liquid Telecommunications Rwanda" });
    expect(r.body.data.counts.users).toBeGreaterThanOrEqual(1);
    expect(r.body.data.minutes).toHaveLength(30);
  });

  it("streams a snapshot over SSE with a single-use ticket", async () => {
    const owner = await createUser({ userType: "ADMIN" });
    await grant(owner, "platform_owner");
    const t = await request(app).post("/monitor/live/ticket").set("Authorization", `Bearer ${signToken(owner)}`);
    const ticket = t.body.data.ticket;
    const body = await readSse(`/monitor/live/stream?ticket=${encodeURIComponent(ticket)}`, '"type":"snapshot"');
    expect(body).toContain('"type":"snapshot"');
    const reuse = await request(app).get(`/monitor/live/stream?ticket=${encodeURIComponent(ticket)}`);
    expect(reuse.status).toBe(401);
  });
});

describe("Auth events", () => {
  it("records a failed sign-in with the username typed, the full IP and the device", async () => {
    const did = newDeviceId();
    const name = `nobody_${Date.now()}`;
    const r = await request(app)
      .post("/auth/login")
      .set("X-Forwarded-For", "41.186.77.1")
      .set("X-NGA-Device", did)
      .send({ username: name, password: "x" });
    expect(r.status).toBe(401);
    // trackAuth is fire-and-forget: give it a moment.
    for (let i = 0; i < 20; i++) {
      const rows = await q<any>("SELECT * FROM AuthEvent WHERE username_attempted = ?", [name]);
      if (rows.length) break;
      await new Promise((res) => setTimeout(res, 50));
    }
    const rows = await q<any>("SELECT kind, outcome, reason, device_id, INET6_NTOA(ip) AS ip FROM AuthEvent WHERE username_attempted = ?", [name]);
    expect(rows[0]).toMatchObject({ kind: "login", outcome: "failure", reason: "unknown_user", device_id: did, ip: "41.186.77.1" });
  });
});
