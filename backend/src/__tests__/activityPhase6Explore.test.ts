import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { AccessGrant, AccessRole, UserAccessVersion } from "../db/accessSchema";
import { createAcademicPeriod, createProgramGradeClassGroupDetailed, createStudentClassGroup, createUser, signToken } from "../test/fixtures";
import { ensureAccessRegistry } from "../services/access/registry";
import { exec } from "../services/activity/db";
import { flushActivity, resetWriter } from "../services/activity/writer";
import { resetPresence } from "../services/activity/presence";
import { resetSessions } from "../services/activity/sessionizer";
import { resetDedupe } from "../services/activity/ingest";
import { clock } from "../services/activity/runtime";
import { clearPeopleCaches } from "../services/activity/people";
import { invalidateSettings } from "../services/activity/settings";
import { deviceToken, newDeviceId, ulid } from "../services/activity/tokens";
import { todayKigali } from "../services/activity/rollup";

/**
 * Phase 6: funnels, paths and the leadership usage insights (plan §11, §14 page 12).
 *
 * Five teachers each do one visit on 2025-04-14 (Kigali):
 *   A, B, C: home → academics → calendar
 *   D:       home → academics
 *   E:            academics → calendar   (enters at step 2)
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const K = (hh: number, mm: number) => Date.UTC(2025, 3, 14, hh - 2, mm);
const tok = (u: number) => jwt.sign({ userId: u, tokenVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" });
const owner = { id: 0 };

const visit = async (user: number, pages: string[], start: number) => {
  const did = newDeviceId();
  let t = start;
  for (const f of pages) {
    clock.freeze(t);
    await request(app).post("/activity/sync").set("Content-Type", "application/json").set("User-Agent", UA).set("Authorization", `Bearer ${tok(user)}`)
      .send(JSON.stringify({ v: 1, did, dt: deviceToken(did), tab: "t", sent_at: t, events: [{ id: ulid(t), n: "page_view", t, r: `/${f}`, f: `mis.${f}` }] }));
    t += 60_000;
  }
};

const grantPreset = async (userId: number, preset: string, scopeType: string, scopeId: number | null) => {
  const roleId = (await db.select().from(AccessRole).where(eq(AccessRole.preset_key, preset)).limit(1))[0].role_id;
  await db.insert(AccessGrant).values({ user_id: userId, role_id: roleId, scope_type: scopeType as any, scope_id: scopeId, source: "MANUAL", status: "ACTIVE" });
  await db.update(UserAccessVersion).set({ access_version: sql`${UserAccessVersion.access_version} + 1` }).where(eq(UserAccessVersion.user_id, userId));
};

const RANGE = "from=2025-04-14&to=2025-04-14";

beforeAll(async () => {
  await ensureAccessRegistry();
  resetWriter(); resetPresence(); resetSessions(); resetDedupe(); clearPeopleCaches(); invalidateSettings();
  const from = new Date(Date.UTC(2025, 3, 13)), to = new Date(Date.UTC(2025, 3, 16));
  await exec("DELETE FROM AnalyticsEvent WHERE occurred_at >= ? AND occurred_at < ?", [from, to]);
  await exec("DELETE FROM AnalyticsSession WHERE started_at >= ? AND started_at < ?", [from, to]);
  owner.id = await createUser({ userType: "ADMIN" });
  await grantPreset(owner.id, "platform_owner", "PLATFORM", null);
  const t = await Promise.all([1, 2, 3, 4, 5].map(() => createUser({ userType: "TEACHER" })));
  for (let i = 0; i < 3; i++) await visit(t[i], ["home", "academics", "calendar"], K(9 + i, 0));
  await visit(t[3], ["home", "academics"], K(13, 0));
  await visit(t[4], ["academics", "calendar"], K(14, 0));
  clock.freeze(K(23, 0));
  const { sweepSessions } = await import("../services/activity/sessionizer");
  sweepSessions();
  await flushActivity();
  clock.reset();
}, 60_000);

const post = (path: string, body: object) => request(app).post(`/monitor${path}`).set("Authorization", `Bearer ${signToken(owner.id)}`).send(body);
const get = (path: string) => request(app).get(`/monitor${path}`).set("Authorization", `Bearer ${signToken(owner.id)}`);
const STEPS = [
  { type: "feature", value: "mis.home" },
  { type: "feature", value: "mis.academics" },
  { type: "feature", value: "mis.calendar" },
];

describe("Funnels", () => {
  it("closed funnel: only visits that start at step 1 count", async () => {
    const r = await post(`/funnel?${RANGE}`, { steps: STEPS, mode: "closed", within: "session" });
    expect(r.status).toBe(200);
    expect(r.body.data.steps.map((s: any) => s.reached)).toEqual([4, 4, 3]);
    expect(r.body.data.steps[2].rate_from_previous).toBe(75);
    expect(r.body.data.steps[1].median_seconds_from_start).toBe(60);
  });

  it("open funnel: people may enter at a later step", async () => {
    const r = await post(`/funnel?${RANGE}`, { steps: STEPS, mode: "open", within: "session" });
    expect(r.body.data.steps.map((s: any) => s.reached)).toEqual([4, 5, 4]);
    expect(r.body.data.steps[1].entered_here).toBe(1);
  });

  it("rejects a one-step funnel", async () => {
    expect((await post(`/funnel?${RANGE}`, { steps: STEPS.slice(0, 1) })).status).toBe(400);
  });
});

describe("Paths", () => {
  it("shows where people go after a feature, ending visits included", async () => {
    const r = await get(`/paths?${RANGE}&feature=mis.academics&direction=forward&depth=2`);
    expect(r.status).toBe(200);
    expect(r.body.data.sessions).toBe(5);
    const next = Object.fromEntries(r.body.data.levels[1].nodes.map((n: any) => [n.feature, n.n]));
    expect(next).toEqual({ "mis.calendar": 4, "(end of visit)": 1 });
  });

  it("and where they came from", async () => {
    const r = await get(`/paths?${RANGE}&feature=mis.calendar&direction=backward&depth=1`);
    const prev = Object.fromEntries(r.body.data.levels[1].nodes.map((n: any) => [n.feature, n.n]));
    expect(prev).toEqual({ "mis.academics": 4 });
  });
});

describe("Leadership usage insights (aggregates only)", () => {
  it("lets a programme coordinator see the share of their students active this week, nothing outside", async () => {
    await createAcademicPeriod();
    const prog = await createProgramGradeClassGroupDetailed();
    const other = await createProgramGradeClassGroupDetailed();
    const [{ academicYearId }] = [await createAcademicPeriod()];
    const students = await Promise.all([1, 2, 3, 4, 5, 6].map(() => createUser({ userType: "STUDENT" })));
    for (const s of students) await createStudentClassGroup({ userId: s, classGroupId: prog.classGroupId, academicYearId });
    // Three of six were active today.
    const today = todayKigali();
    for (const s of students.slice(0, 3)) await exec("INSERT INTO AnalyticsUserDay (day, user_id, app, page_views, is_active) VALUES (?, ?, 1, 3, 1)", [today, s]);
    const lead = await createUser({ userType: "ADMIN" });
    await grantPreset(lead, "programme_coordinator", "PROGRAM", prog.programId);
    const res = await request(app).get(`/access/insights/usage.student_active_rate?node=PROGRAM:${prog.programId}`).set("Authorization", `Bearer ${signToken(lead)}`);
    expect(res.status).toBe(200);
    expect(res.body.data?.total ?? res.body.total).toMatchObject({ value: 50, n: 6 });
    const elsewhere = await request(app).get(`/access/insights/usage.student_active_rate?node=PROGRAM:${other.programId}`).set("Authorization", `Bearer ${signToken(lead)}`);
    expect(elsewhere.status).toBe(403);
    const school = await request(app).get(`/access/insights/usage.student_active_rate?node=SCHOOL`).set("Authorization", `Bearer ${signToken(lead)}`);
    expect(school.status).toBe(403);
  });
});

