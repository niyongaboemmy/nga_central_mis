import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { createUser, signToken } from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";
import { exec, q } from "../services/activity/db";
import { flushActivity, resetWriter } from "../services/activity/writer";
import { resetPresence } from "../services/activity/presence";
import { resetSessions } from "../services/activity/sessionizer";
import { resetDedupe } from "../services/activity/ingest";
import { clock } from "../services/activity/runtime";
import { clearPeopleCaches } from "../services/activity/people";
import { invalidateSettings } from "../services/activity/settings";
import { setGeoProvider, UNKNOWN_GEO } from "../services/activity/geoip";
import { clearDimCaches } from "../services/activity/dims";
import { deviceToken, newDeviceId, ulid } from "../services/activity/tokens";
import { maintainPartitions, rollupRange } from "../services/activity/rollup";
import { recordAuthEvent } from "../services/activity/authEvents";

/**
 * Phase 3–4: rollups and reports reconcile with a known fixture (plan §17, §18).
 * Everything happens in March 2025 so nothing else in the shared test DB overlaps.
 *
 * Kigali days (UTC+2). Monday 2025-03-10 … Sunday 2025-03-16, then 2025-03-17.
 *  T1 (teacher): active 10, 11, 12, 17          (engaged: 2+ page views)
 *  T2 (teacher): active 10 only                 (engaged)
 *  S1 (student): one single-page, 3 s visit on 11 → accessed but NOT active
 *  V  (visitor): public pages on 10 and 12, plus a failed sign-in on 12
 * Midnight edge: T2 also has a page view at 23:59:30 Kigali on the 10th, and
 * T1 one at 00:00:30 on the 11th — they land on their own Kigali days.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const K = (day: string, hh: number, mm = 0, ss = 0) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hh - 2, mm, ss);

let owner: number, support: number, t1: number, t2: number, s1: number;
const visitorDid = newDeviceId();
const tokenFor = (u: number) => jwt.sign({ userId: u, tokenVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" });

const sendAt = async (at: number, body: any, opts: { token?: string; ip: string; ua?: string }) => {
  clock.freeze(at);
  let r = request(app).post("/activity/sync").set("Content-Type", "application/json").set("Origin", "https://mis.amashuri.com")
    .set("User-Agent", opts.ua ?? UA).set("X-Forwarded-For", opts.ip);
  if (opts.token) r = r.set("Authorization", `Bearer ${opts.token}`);
  const res = await r.send(JSON.stringify({ v: 1, tab: "t", dt: deviceToken(body.did), sent_at: at, ...body }));
  expect(res.status).toBe(202);
  return res.body;
};
const pv = (at: number, route: string, f: string, extra: any = {}) => ({ id: ulid(at), n: "page_view", t: at, r: route, f, ...extra });

const visit = async (user: number | null, did: string, day: string, hh: number, pages: [string, string][], opts: { ip: string; ua?: string; engageMs?: number; minuteGap?: number }) => {
  let t = K(day, hh);
  for (const [route, f] of pages) {
    await sendAt(t, { did, events: [pv(t, route, f)] }, { token: user ? tokenFor(user) : undefined, ip: opts.ip, ua: opts.ua });
    t += (opts.minuteGap ?? 2) * 60_000;
  }
  if (opts.engageMs) await sendAt(t, { did, events: [{ id: ulid(t), n: "user_engagement", t, p: { ms: opts.engageMs } }] }, { token: user ? tokenFor(user) : undefined, ip: opts.ip, ua: opts.ua });
};

const presetRole = async (key: string) => (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;
const grant = async (userId: number, preset: string) => {
  await db.insert(AccessGrant).values({ user_id: userId, role_id: await presetRole(preset), scope_type: "PLATFORM" as any, scope_id: null, source: "MANUAL", status: "ACTIVE" });
  await db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }).where(eq(UserAccessVersion.user_id, userId));
};

const RANGE = "from=2025-03-10&to=2025-03-17";
const get = (path: string, user = owner) => request(app).get(`/monitor${path}`).set("Authorization", `Bearer ${signToken(user)}`);

beforeAll(async () => {
  await ensureAccessRegistry();
  // A clean March 2025 in every analytics table.
  const from = new Date(Date.UTC(2025, 1, 1)), to = new Date(Date.UTC(2025, 4, 1));
  await exec("DELETE FROM AnalyticsEvent WHERE occurred_at >= ? AND occurred_at < ?", [from, to]);
  await exec("DELETE FROM AnalyticsSession WHERE started_at >= ? AND started_at < ?", [from, to]);
  await exec("DELETE FROM AuthEvent WHERE occurred_at >= ? AND occurred_at < ?", [from, to]);
  await exec("DELETE FROM AnalyticsUserState WHERE first_seen_at >= ? AND first_seen_at < ?", [from, to]);
  for (const t of ["AnalyticsUserDay", "AnalyticsDeviceDay", "AnalyticsFeatureDay", "AnalyticsDimDay", "AnalyticsGeoDay", "AnalyticsHourly"])
    await exec(`DELETE FROM ${t} WHERE day >= '2025-02-01' AND day < '2025-05-01'`);
  resetWriter(); resetPresence(); resetSessions(); resetDedupe(); clearPeopleCaches(); clearDimCaches(); invalidateSettings();
  setGeoProvider((ip) =>
    ip.startsWith("102.22.")
      ? { ...UNKNOWN_GEO, country_code: "RW", country: "Rwanda", region: "Kigali", city: "Kigali", lat: -1.95, lon: 30.06, asn: 1, isp: "Liquid Telecommunications Rwanda", conn_type: "fixed" }
      : { ...UNKNOWN_GEO, country_code: "RW", country: "Rwanda", region: "Southern Province", city: "Huye", lat: -2.6, lon: 29.74, asn: 2, isp: "MTN RWANDACELL", conn_type: "mobile" },
  );

  owner = await createUser({ userType: "ADMIN" });
  await grant(owner, "platform_owner");
  support = await createUser({ userType: "ADMIN" });
  await grant(support, "it_support");
  t1 = await createUser({ userType: "TEACHER" });
  t2 = await createUser({ userType: "TEACHER" });
  s1 = await createUser({ userType: "STUDENT" });

  const d1 = newDeviceId(), d2 = newDeviceId(), d3 = newDeviceId();
  for (const day of ["2025-03-10", "2025-03-11", "2025-03-12", "2025-03-17"])
    await visit(t1, d1, day, 9, [["/home", "mis.home"], ["/academics", "mis.academics"]], { ip: "102.22.1.10", engageMs: 30_000 });
  await visit(t2, d2, "2025-03-10", 14, [["/home", "mis.home"], ["/calendar", "mis.calendar"]], { ip: "102.22.1.11" });
  // Midnight edge.
  await sendAt(K("2025-03-10", 23, 59, 30), { did: d2, events: [pv(K("2025-03-10", 23, 59, 30), "/calendar", "mis.calendar")] }, { token: tokenFor(t2), ip: "102.22.1.11" });
  await sendAt(K("2025-03-11", 0, 0, 30), { did: d1, events: [pv(K("2025-03-11", 0, 0, 30), "/home", "mis.home")] }, { token: tokenFor(t1), ip: "102.22.1.10" });
  // S1: a single 3-second page view → accessed, not engaged.
  await visit(s1, d3, "2025-03-11", 10, [["/my-learning", "mis.my_learning"]], { ip: "41.186.5.5", ua: UA_IPHONE, engageMs: 3_000 });
  // Visitor on public pages, then a failed sign-in.
  await visit(null, visitorDid, "2025-03-10", 8, [["/", "mis.landing"], ["/login", "mis.login"]], { ip: "41.186.9.9", ua: UA_IPHONE });
  await visit(null, visitorDid, "2025-03-12", 8, [["/login", "mis.login"]], { ip: "41.186.9.9", ua: UA_IPHONE });
  clock.freeze(K("2025-03-12", 8, 5));
  await recordAuthEvent(
    { ip: "41.186.9.9", get: (h: string) => (h === "User-Agent" ? UA_IPHONE : h === "X-NGA-Device" ? visitorDid : undefined), headers: { "x-nga-device": visitorDid } },
    { kind: "login", outcome: "failure", reason: "bad_password", userId: t1, usernameAttempted: "teacher.one" },
  );
  clock.freeze(K("2025-03-18", 12)); // well after: all sessions time out
  const { sweepSessions } = await import("../services/activity/sessionizer");
  sweepSessions();
  await flushActivity();
  await rollupRange("2025-03-09", "2025-03-18");
  clock.reset();
});

afterAll(() => {
  setGeoProvider(null);
  clock.reset();
});

describe("Overview (GA4 definitions)", () => {
  it("counts accessed vs active users, sessions, engagement and new users exactly", async () => {
    const r = await get(`/overview?${RANGE}`);
    expect(r.status).toBe(200);
    const t = r.body.data.totals;
    expect(t.accessed_users).toBe(3); // T1, T2, S1
    expect(t.active_users).toBe(2); // S1 had no engaged session
    expect(t.new_users).toBe(3);
    expect(t.visitors).toBe(1);
    // Sessions: T1 = 5 (four 2-page visits + the 00:00:30 one, which arrived late and must
    // not join the open session of the 17th), T2 = 2 (14:00 and 23:59:30), S1 = 1, visitor = 2.
    expect(t.sessions).toBe(10);
    // Not engaged: T1 00:00:30 and T2 23:59:30 (1 page), S1 (1 page, 3 s), visitor on the 12th.
    expect(t.engaged_sessions).toBe(6);
    expect(t.engagement_rate).toBe(60);
  });

  it("puts events on either side of Kigali midnight on their own days", async () => {
    const rows = await q<any>("SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, page_views FROM AnalyticsUserDay WHERE user_id = ? ORDER BY day", [t2]);
    expect(rows).toEqual([{ day: "2025-03-10", page_views: 3 }]);
    const t1rows = await q<any>("SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, page_views FROM AnalyticsUserDay WHERE user_id = ? ORDER BY day", [t1]);
    expect(t1rows.map((r) => [r.day, r.page_views])).toEqual([["2025-03-10", 2], ["2025-03-11", 3], ["2025-03-12", 2], ["2025-03-17", 2]]);
  });

  it("computes DAU / WAU / MAU as rolling windows", async () => {
    const r = await get(`/overview?${RANGE}`);
    const byDay = Object.fromEntries(r.body.data.series.daily.map((d: any) => [d.day, d]));
    expect(byDay["2025-03-10"]).toMatchObject({ dau: 2, wau: 2, mau: 2 });
    expect(byDay["2025-03-11"]).toMatchObject({ dau: 1, wau: 2, mau: 2, accessed: 2 });
    expect(byDay["2025-03-16"]).toMatchObject({ dau: 0, wau: 2, mau: 2 });
    expect(byDay["2025-03-17"]).toMatchObject({ dau: 1, wau: 1, mau: 2 }); // T2's 10th is out of the 7-day window
    expect(byDay["2025-03-17"].stickiness).toBe(50);
  });

  it("measures adoption against the eligible roster per user type", async () => {
    const r = await get(`/overview?${RANGE}`);
    const teachers = r.body.data.adoption.find((a: any) => a.type === "TEACHER");
    expect(teachers.active).toBe(2);
    expect(teachers.eligible).toBeGreaterThanOrEqual(2);
  });

  it("compares with the previous period", async () => {
    const r = await get(`/overview?${RANGE}&compare=prev`);
    expect(r.body.data.compare).toEqual({ from: "2025-03-02", to: "2025-03-09" });
    expect(r.body.data.previous.active_users).toBe(0);
    expect(r.body.data.deltas.active_users).toBeNull(); // from zero: no percentage
  });
});

describe("Access & logins", () => {
  it("lists who accessed, with days active, sessions, apps and last IP/place", async () => {
    const r = await get(`/access/users?${RANGE}&sort=days&dir=desc`);
    expect(r.status).toBe(200);
    const mine = r.body.data.rows.filter((x: any) => [t1, t2, s1].includes(x.user_id));
    expect(mine.map((x: any) => [x.user_id, x.days_active])).toEqual([[t1, 4], [t2, 1], [s1, 1]]);
    const row = mine[0];
    expect(row).toMatchObject({ apps: ["mis"], last_ip: "102.22.1.10" });
    expect(row.last_place).toMatchObject({ city: "Kigali", isp: "Liquid Telecommunications Rwanda" });
  });

  it("exports the list as CSV and records the export in the access log", async () => {
    const r = await get(`/access/users?${RANGE}&format=csv`);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.text.split("\n")[0]).toContain("user_id");
    const log = await q<any>("SELECT action FROM MonitorAccessLog WHERE viewer_id = ? ORDER BY id DESC LIMIT 1", [owner]);
    expect(log[0].action).toBe("export");
  });

  it("shows the failed sign-in with the username tried, IP, place and visitor device", async () => {
    const r = await get(`/access/failed?${RANGE}`);
    const f = r.body.data.rows.find((x: any) => x.username_attempted === "teacher.one");
    expect(f).toMatchObject({ ip: "41.186.9.9", reason: "bad_password", count: 1 });
    expect(f.place).toMatchObject({ city: "Huye", isp: "MTN RWANDACELL" });
    expect(f.visitor_code).toMatch(/^V-/);
  });

  it("builds an hour × weekday heatmap in Kigali time", async () => {
    const r = await get(`/access/heatmap?${RANGE}`);
    const grid = r.body.data;
    expect(grid).toHaveLength(7);
    expect(grid[0][9].users).toBeGreaterThanOrEqual(1); // Monday 09:00 — T1
    expect(grid[0][23].users).toBe(1); // Monday 23:59 — T2
    expect(grid[1][0].users).toBe(1); // Tuesday 00:00 — T1
  });
});

describe("Engagement, technology, retention, locations", () => {
  it("ranks features with views and distinct people", async () => {
    const r = await get(`/engagement/features?${RANGE}&aud=user`);
    const home = r.body.data.rows.find((x: any) => x.feature === "mis.home");
    expect(home.views).toBe(6); // T1 ×5, T2 ×1
    expect(home.people).toBe(2);
  });

  it("splits sessions by browser, device type and connection type", async () => {
    const r = await get(`/technology?${RANGE}`);
    const browsers = Object.fromEntries(r.body.data.browser.map((b: any) => [b.value, b.sessions]));
    expect(browsers.Chrome).toBe(7);
    expect(browsers.Safari).toBe(3);
    const conns = Object.fromEntries(r.body.data.connection.map((b: any) => [b.value, b.sessions]));
    expect(conns.mobile).toBe(3);
  });

  it("builds weekly cohorts by first active week", async () => {
    const r = await get(`/retention?from=2025-03-10&to=2025-03-23&gran=week`);
    const c = r.body.data.cohorts.find((x: any) => x.start === "2025-03-10");
    expect(c.size).toBe(2); // T1, T2 first active that week
    expect(c.periods[0]).toMatchObject({ active: 2, rate: 100 });
    expect(c.periods[1]).toMatchObject({ active: 1, rate: 50 }); // T1 came back on the 17th
  });

  it("reports places and ISPs, and looks an IP up to every person and device on it", async () => {
    const r = await get(`/locations?${RANGE}`);
    const cities = r.body.data.cities.map((c: any) => c.city);
    expect(cities).toEqual(expect.arrayContaining(["Kigali", "Huye"]));
    expect(r.body.data.points.length).toBeGreaterThanOrEqual(2);
    const ip = await get(`/ip/41.186.9.9`);
    expect(ip.status).toBe(200);
    expect(ip.body.data.geo).toMatchObject({ city: "Huye" });
    expect(ip.body.data.devices.some((d: any) => d.device_id === visitorDid)).toBe(true);
    expect(ip.body.data.auth.some((a: any) => a.username_attempted === "teacher.one")).toBe(true);
  });

  it("never ties a visitor's session to the account a failed sign-in targeted", async () => {
    const rows = await q<any>("SELECT user_id FROM AnalyticsSession WHERE device_id = ?", [visitorDid]);
    expect(rows.every((r) => r.user_id === null)).toBe(true);
  });

  it("lists the public visitor with place, pages and the failed attempt", async () => {
    const r = await get(`/visitors?${RANGE}`);
    const v = r.body.data.rows.find((x: any) => x.device_id === visitorDid);
    expect(v).toMatchObject({ failed_logins: 1, place: { city: "Huye" } });
    expect(v.page_views).toBe(3);
  });
});

describe("Access rules", () => {
  it("lets IT support see aggregates but not named lists, IPs or IP lookup", async () => {
    expect((await get(`/overview?${RANGE}`, support)).status).toBe(200);
    expect((await get(`/access/users?${RANGE}`, support)).status).toBe(403);
    expect((await get(`/ip/41.186.9.9`, support)).status).toBe(403);
    const loc = await get(`/locations?${RANGE}`, support);
    expect(loc.body.data.top_ips).toEqual([]);
  });

  it("hides groups under 5 people from viewers without per-person access", async () => {
    const r = await get(`/audience/adoption?${RANGE}&by=role`, support);
    expect(r.status).toBe(200);
    for (const row of r.body.data) if (row.eligible < 5) expect(row.active).toBeNull();
  });

  it("refuses everything to a user with no analytics capability", async () => {
    const plain = await createUser();
    expect((await get(`/overview?${RANGE}`, plain)).status).toBe(403);
  });
});

describe("Partition maintenance", () => {
  it("keeps the next months split out of pmax and is idempotent", async () => {
    await maintainPartitions();
    const again = await maintainPartitions();
    expect(again.added).toEqual([]);
    const parts = await q<any>(
      "SELECT PARTITION_NAME AS name FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'AnalyticsEvent' ORDER BY PARTITION_ORDINAL_POSITION",
    );
    const now = new Date();
    const want = `p${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(parts.map((p) => p.name)).toContain(want);
    expect(parts[parts.length - 1].name).toBe("pmax");
  });
});
