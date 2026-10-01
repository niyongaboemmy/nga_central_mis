import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { User } from "../db/schema";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";
import { q } from "../services/activity/db";
import { flushActivity, resetWriter } from "../services/activity/writer";
import { listPeople, resetPresence } from "../services/activity/presence";
import { resetSessions } from "../services/activity/sessionizer";
import { resetDedupe } from "../services/activity/ingest";
import { clock } from "../services/activity/runtime";
import { clearPeopleCaches } from "../services/activity/people";
import { invalidateSettings } from "../services/activity/settings";
import { setGeoProvider, UNKNOWN_GEO } from "../services/activity/geoip";
import { clearDimCaches } from "../services/activity/dims";
import { deviceToken, newDeviceId, ulid } from "../services/activity/tokens";
import { refreshBlocks } from "../services/activity/blocklist";
import { refreshWatches, resetWatchState, startWatchMatcher } from "../services/activity/watches";
import { setMonitorPushSender } from "../services/activity/notify";
import { invalidateActivityAuth } from "../middleware/activityAuth";

/**
 * Phase 5: User 360 / Visitor 360, controls, watches with target notification (D2),
 * alerts, blocks, export/delete, the access log, and My activity.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const tokenFor = async (u: number) => {
  const [r] = await q<any>("SELECT token_version FROM User WHERE user_id = ?", [u]);
  return jwt.sign({ userId: u, tokenVersion: Number(r.token_version ?? 0) }, process.env.JWT_SECRET!, { expiresIn: "1h" });
};
const sync = async (did: string, body: any, opts: { token?: string; ip?: string } = {}) => {
  let r = request(app).post("/activity/sync").set("Content-Type", "application/json").set("Origin", "https://mis.amashuri.com").set("User-Agent", UA).set("X-Forwarded-For", opts.ip ?? "102.22.5.5");
  if (opts.token) r = r.set("Authorization", `Bearer ${opts.token}`);
  return r.send(JSON.stringify({ v: 1, did, dt: deviceToken(did), tab: "t1", sent_at: clock.now(), events: [], ...body }));
};
const pv = (route: string, f: string) => ({ id: ulid(), n: "page_view", t: clock.now(), r: route, f });
const presetRole = async (key: string) => (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, key)).limit(1))[0].role_id;
const grantRole = async (userId: number, roleId: number) => {
  await db.insert(AccessGrant).values({ user_id: userId, role_id: roleId, scope_type: "PLATFORM" as any, scope_id: null, source: "MANUAL", status: "ACTIVE" });
  await db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }).where(eq(UserAccessVersion.user_id, userId));
};
const waitFor = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 4000): Promise<T | null> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v as T;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
};
const notes = (userId: number, kind: string) =>
  q<any>("SELECT title, body FROM Notification WHERE user_id = ? AND kind = ? ORDER BY notification_id", [userId, kind]);

let owner: number, owner2: number, viewerOnly: number, teacher: number, student: number;
const pushes: string[] = [];
const as = (u: number) => ({ get: (p: string) => request(app).get(`/monitor${p}`).set("Authorization", `Bearer ${signToken(u)}`), post: (p: string, b: any = {}) => request(app).post(`/monitor${p}`).set("Authorization", `Bearer ${signToken(u)}`).send(b), del: (p: string, b: any = {}) => request(app).delete(`/monitor${p}`).set("Authorization", `Bearer ${signToken(u)}`).send(b) });

beforeAll(async () => {
  await ensureAccessRegistry();
  startWatchMatcher();
  setMonitorPushSender(async (_sub, payload) => {
    pushes.push(payload);
    return { ok: true, statusCode: 201 };
  });
  owner = await createUser({ userType: "ADMIN" });
  await grantRole(owner, await presetRole("platform_owner"));
  owner2 = await createUser({ userType: "ADMIN" });
  await grantRole(owner2, await presetRole("platform_owner"));
  // A viewer who may open people but is not an analytics administrator.
  viewerOnly = await createUser({ userType: "ADMIN" });
  await grantRole(viewerOnly, await createRoleWithPermissions("analytics_viewer", ["ANALYTICS_VIEW", "ANALYTICS_USER_VIEW", "ANALYTICS_USER_CONTROL"]));
  teacher = await createUser({ userType: "TEACHER" });
  student = await createUser({ userType: "STUDENT" });
}, 60_000);

beforeEach(async () => {
  resetWriter(); resetPresence(); resetSessions(); resetDedupe(); clock.reset(); clearPeopleCaches(); clearDimCaches(); invalidateSettings(); resetWatchState();
  await refreshWatches(true);
  await refreshBlocks(true);
  setGeoProvider((ip) => (ip.startsWith("102.22.") ? { ...UNKNOWN_GEO, country_code: "RW", city: "Kigali", isp: "Liquid", conn_type: "fixed" } : { ...UNKNOWN_GEO, country_code: "UG", city: "Kampala", isp: "MTN Uganda", conn_type: "mobile" }));
});

afterAll(() => {
  setGeoProvider(null);
  setMonitorPushSender(null);
});

describe("User 360 access rules", () => {
  it("opens a person's 360 and records the view in the access log", async () => {
    const did = newDeviceId();
    await sync(did, { events: [pv("/home", "mis.home"), pv("/academics", "mis.academics")] }, { token: await tokenFor(teacher) });
    await flushActivity();
    const r = await as(owner).get(`/users/${teacher}`);
    expect(r.status).toBe(200);
    expect(r.body.data.profile).toMatchObject({ user_id: teacher, user_type: "TEACHER", last_ip: "102.22.5.5" });
    expect(r.body.data.profile.live).not.toBeNull();
    const log = await q<any>("SELECT action FROM MonitorAccessLog WHERE viewer_id = ? AND target_user_id = ? ORDER BY id DESC LIMIT 1", [owner, teacher]);
    expect(log[0].action).toBe("view_user");
    const tl = await as(owner).get(`/users/${teacher}/timeline`);
    expect(tl.body.data.sessions[0].items.map((i: any) => i.feature)).toEqual(expect.arrayContaining(["mis.home", "mis.academics"]));
  });

  it("sends people to My activity for themselves", async () => {
    const r = await as(owner).get(`/users/${owner}`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("SELF");
  });

  it("lets only analytics administrators open another analytics administrator", async () => {
    expect((await as(viewerOnly).get(`/users/${teacher}`)).status).toBe(200);
    const blocked = await as(viewerOnly).get(`/users/${owner}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PROTECTED");
    expect((await as(owner2).get(`/users/${owner}`)).status).toBe(200);
  });
});

describe("Controls", () => {
  it("requires a reason, then signs the person out everywhere", async () => {
    const did = newDeviceId();
    const tok = await tokenFor(student);
    await sync(did, { beat: { vis: "visible", r: "/home" } }, { token: tok });
    expect(listPeople().some((p) => p.user?.id === student)).toBe(true);
    expect((await as(owner).post(`/users/${student}/signout`, {})).status).toBe(400);
    const r = await as(owner).post(`/users/${student}/signout`, { reason: "Lost phone reported" });
    expect(r.status).toBe(200);
    expect(listPeople().some((p) => p.user?.id === student)).toBe(false);
    // The old token is dead everywhere.
    const verify = await request(app).get("/auth/verify").set("Authorization", `Bearer ${tok}`);
    expect(verify.status).toBe(401);
    const ev = await waitFor(async () => (await q<any>("SELECT initiator FROM AuthEvent WHERE user_id = ? AND kind = 'logout' ORDER BY id DESC LIMIT 1", [student]))[0]);
    expect(ev).toMatchObject({ initiator: "admin" });
    const log = await q<any>("SELECT reason FROM MonitorAccessLog WHERE action = 'signout_everywhere' AND target_user_id = ? ORDER BY id DESC LIMIT 1", [student]);
    expect(log[0].reason).toBe("Lost phone reported");
  });

  it("suspends and reactivates an account", async () => {
    const u = await createUser({ userType: "STUDENT" });
    expect((await as(owner).post(`/users/${u}/suspend`, { reason: "Investigation" })).status).toBe(200);
    expect((await db.select().from(User).where(eq(User.user_id, u)))[0].status).toBe("SUSPENDED");
    expect((await as(owner).post(`/users/${u}/reactivate`, { reason: "Cleared" })).status).toBe(200);
    expect((await db.select().from(User).where(eq(User.user_id, u)))[0].status).toBe("ACTIVE");
  });

  it("messages a person in the app and by push", async () => {
    const r = await as(owner).post(`/users/${teacher}/message`, { reason: "Support follow-up", title: "Please update your app", message: "Your Task Mentor app is out of date." });
    expect(r.status).toBe(200);
    const n = await notes(teacher, "monitor_message");
    expect(n[n.length - 1].body).toContain("out of date");
  });

  it("exports and deletes a person's analytics data", async () => {
    const u = await createUser({ userType: "TEACHER" });
    await sync(newDeviceId(), { events: [pv("/home", "mis.home")] }, { token: await tokenFor(u) });
    await flushActivity();
    const ex = await as(owner).get(`/users/${u}/export`);
    expect(ex.status).toBe(200);
    expect(ex.body.events.length).toBeGreaterThan(0);
    const del = await as(owner).del(`/users/${u}/data`, { reason: "Subject asked for deletion" });
    expect(del.status).toBe(200);
    const left = await q<any>("SELECT COUNT(*) AS n FROM AnalyticsEvent WHERE user_id = ?", [u]);
    expect(Number(left[0].n)).toBe(0);
  });
});

describe("Watches (D2: the person is told) and alerts", () => {
  it("notifies the target with who, why and until when; alerts the watcher; tells the target when it ends", async () => {
    const target = await createUser({ userType: "TEACHER" });
    const r = await as(owner).post("/watches", { target: { kind: "user", userId: target }, reason: "Exam integrity check", rules: [{ type: "comes_online" }, { type: "opens_feature", feature: "mis.academics" }], days: 7 });
    expect(r.status).toBe(201);
    const told = await notes(target, "monitor_watch");
    expect(told[0].title).toBe("Your account activity is being monitored");
    expect(told[0].body).toContain("Exam integrity check");
    expect(told[0].body).toMatch(/until \d{4}-\d{2}-\d{2}/);

    // The target appears online → the watcher is alerted.
    await sync(newDeviceId(), { events: [pv("/academics", "mis.academics")] }, { token: await tokenFor(target) });
    const alerted = await waitFor(async () => (await notes(owner, "monitor_alert")).find((n) => n.title.includes("came online")));
    expect(alerted).toBeTruthy();
    const feature = await waitFor(async () => (await notes(owner, "monitor_alert")).find((n) => n.title.includes("opened mis.academics")));
    expect(feature).toBeTruthy();
    const alerts = await as(owner).get("/alerts");
    expect(alerts.body.data.some((a: any) => a.target_user_id === target && a.rule === "comes_online")).toBe(true);

    // My activity shows the watch to the person being watched.
    const mine = await request(app).get("/monitor/me/activity").set("Authorization", `Bearer ${signToken(target)}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data.watches[0]).toMatchObject({ reason: "Exam integrity check" });

    const end = await as(owner).del(`/watches/${r.body.data.id}`, { reason: "Exam over" });
    expect(end.status).toBe(200);
    const after = await notes(target, "monitor_watch");
    expect(after.some((n) => n.title === "Monitoring of your account has ended")).toBe(true);
  });

  it("refuses watches without a reason or on yourself", async () => {
    expect((await as(owner).post("/watches", { target: { kind: "user", userId: teacher }, rules: [{ type: "comes_online" }] })).status).toBe(400);
    expect((await as(owner).post("/watches", { target: { kind: "user", userId: owner }, reason: "testing self", rules: [{ type: "comes_online" }] })).status).toBe(400);
  });

  it("raises a platform alert for brute force on one username", async () => {
    const name = `bf_${Date.now()}`;
    for (let i = 0; i < 10; i++) await request(app).post("/auth/login").set("X-Forwarded-For", "41.1.1.1").send({ username: name, password: "x" });
    const a = await waitFor(async () => (await q<any>("SELECT title FROM AnalyticsAlert WHERE rule = 'brute_force' AND title LIKE ?", [`%${name}%`]))[0], 6000);
    expect(a).toBeTruthy();
    const told = await waitFor(async () => (await notes(owner, "monitor_alert")).find((n) => n.title.includes(name)));
    expect(told).toBeTruthy();
  });
});

describe("Blocks and visitors", () => {
  it("blocks an IP for sign-in and anonymous collection", async () => {
    const r = await as(owner).post("/blocks", { kind: "ip", value: "41.99.0.0/16", reason: "Credential stuffing source", days: 1 });
    expect(r.status).toBe(201);
    const login = await request(app).post("/auth/login").set("X-Forwarded-For", "41.99.3.4").send({ username: "anyone", password: "x" });
    expect(login.status).toBe(401);
    expect(login.body.message ?? login.body.error?.message ?? "").toMatch(/blocked/i);
    const did = newDeviceId();
    const s = await sync(did, { events: [pv("/login", "mis.login")] }, { ip: "41.99.3.4" });
    expect(s.body.accepted ?? 0).toBe(0);
    await as(owner).del(`/blocks/${r.body.data.id}`);
    await refreshBlocks(true);
  });

  it("opens a visitor device and overrides its bot classification", async () => {
    const did = newDeviceId();
    await sync(did, { events: [pv("/", "mis.landing")] }, { ip: "41.5.5.5" });
    await flushActivity();
    const r = await as(owner).get(`/visitors/device/${did}`);
    expect(r.status).toBe(200);
    expect(r.body.data.profile).toMatchObject({ device_id: did, last_ip: "41.5.5.5", place: { city: "Kampala" } });
    expect((await as(owner).post(`/visitors/device/${did}/bot`, { override: "bot", reason: "Scripted crawler" })).status).toBe(200);
    const [d] = await q<any>("SELECT bot_override FROM AnalyticsDevice WHERE device_id = ?", [did]);
    expect(d.bot_override).toBe("bot");
  });
});

describe("Accountability", () => {
  it("lists who looked at whom, for analytics administrators only", async () => {
    const r = await as(owner).get(`/access-log?target=${teacher}`);
    expect(r.status).toBe(200);
    expect(r.body.data.some((x: any) => x.action === "view_user" && x.viewer_id === owner)).toBe(true);
    expect((await as(viewerOnly).get("/access-log")).status).toBe(403);
  });

  it("lets anyone sign themselves out everywhere from My activity", async () => {
    const u = await createUser();
    const tok = await tokenFor(u);
    const r = await request(app).post("/monitor/me/signout-everywhere").set("Authorization", `Bearer ${tok}`);
    expect(r.status).toBe(200);
    invalidateActivityAuth(u);
    expect((await request(app).get("/auth/verify").set("Authorization", `Bearer ${tok}`)).status).toBe(401);
  });
});

