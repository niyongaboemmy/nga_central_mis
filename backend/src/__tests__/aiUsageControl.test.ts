import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { IntegrationToken, Role, System } from "../db/schema";
import {
  assignRole,
  createRoleWithPermissions,
  createUser,
  grantAiUse,
  signToken,
} from "../test/fixtures";
import { installFakeAI, uninstallFakeAI } from "../test/fakeAI";
import {
  AI_POLICY_ALL_ON,
  AiDisabledError,
  getAiPolicy,
  invalidateAiPolicy,
  policyDiff,
  setAiPolicy,
  setAiPolicyForTests,
} from "../services/ai/policy";
import { generateStructuredContent } from "../services/aiProviders";
import { MIS_MANIFEST } from "../access/manifest";
import { isV2OnlyCapability } from "../access/v2Only";
import { PRESETS } from "../access/presets";
import { normalizeAiPolicy } from "../vendor/nga-access";

/**
 * AI usage control, MIS side (AI_USAGE_CONTROL_PLAN.md §3–§4, migration 121): the school
 * policy store, Settings -> AI routes, the spoke endpoint, the verify carrier, the provider
 * chokepoint and the route guards.
 */

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const auth = (id: number) => ({ Authorization: `Bearer ${signToken(id)}` });

let savedRow: { value: string; updated_by: number | null } | null = null;

async function roleId(name: string): Promise<number> {
  const [r] = await db.select({ id: Role.role_id }).from(Role).where(eq(Role.name, name)).limit(1);
  if (r) return r.id;
  return createRoleWithPermissions(name, []);
}

beforeAll(async () => {
  setAiPolicyForTests(null);
  const [r] = rows(await db.execute(sql`SELECT CAST(value AS CHAR) AS value, updated_by FROM PlatformSetting WHERE setting_key = 'ai_policy'`));
  savedRow = r ? { value: r.value, updated_by: r.updated_by } : null;
});

afterAll(async () => {
  // Leave the shared table as we found it.
  if (savedRow)
    await db.execute(sql`UPDATE PlatformSetting SET value = CAST(${savedRow.value} AS JSON), updated_by = ${savedRow.updated_by} WHERE setting_key = 'ai_policy'`);
  else await db.execute(sql`DELETE FROM PlatformSetting WHERE setting_key = 'ai_policy'`);
  setAiPolicyForTests(null);
  invalidateAiPolicy();
  uninstallFakeAI();
});

describe("capabilities", () => {
  it("AI_USE and AI_POLICY_MANAGE reach the legacy permission list (not v2-only); the manage one is restricted", () => {
    expect(MIS_MANIFEST.capabilities.AI_USE).toBeTruthy();
    expect(MIS_MANIFEST.capabilities.AI_POLICY_MANAGE.restricted).toBe(true);
    expect(isV2OnlyCapability("AI_USE")).toBe(false);
    expect(isV2OnlyCapability("AI_POLICY_MANAGE")).toBe(false);
  });

  it("presets follow plan §3.2: teaching and leadership get AI_USE, learners and support staff don't", () => {
    const caps = (key: string) => (PRESETS.find((p) => p.key === key)?.caps ?? []).map((c) => (Array.isArray(c) ? c[0] : c));
    for (const k of ["platform_owner", "head_teacher", "teaching_staff", "subject_teacher", "class_teacher", "mentor", "counsellor", "school_administrator"])
      expect(caps(k), k).toContain("AI_USE");
    for (const k of ["student", "parent", "support_staff", "bursar", "registrar", "it_support", "discipline_lead", "safeguarding_lead"])
      expect(caps(k), k).not.toContain("AI_USE");
    expect(caps("platform_owner")).toContain("AI_POLICY_MANAGE");
    expect(PRESETS.filter((p) => caps(p.key).includes("AI_POLICY_MANAGE")).map((p) => p.key)).toEqual(["platform_owner"]);
    expect(caps("teaching_staff")).toContain("tm:AI_USE");
    expect(caps("student")).not.toContain("tm:AI_USE");
  });
});

describe("policy service", () => {
  beforeEach(() => {
    setAiPolicyForTests(null);
    invalidateAiPolicy();
  });

  it("reads the seeded row, fails closed on junk, and caches for 30 s", async () => {
    await db.execute(sql`
      INSERT INTO PlatformSetting (setting_key, value) VALUES ('ai_policy', CAST('{"v": 3, "enabled": false}' AS JSON))
      ON DUPLICATE KEY UPDATE value = VALUES(value)`);
    invalidateAiPolicy();
    const p = await getAiPolicy();
    expect(p).toMatchObject({ v: 3, enabled: false, assessments: "teacher", thirdPartyExtensions: false, features: { grading: false } });
    expect(p.apps.mis).toBe(true);
    // A policy stored before thirdPartyExtensionsStaff existed reads it as on.
    expect(p.thirdPartyExtensionsStaff).toBe(true);
    expect(normalizeAiPolicy({ v: 2, enabled: true, thirdPartyExtensions: true }).thirdPartyExtensionsStaff).toBe(true);
    expect(normalizeAiPolicy({ thirdPartyExtensionsStaff: false }).thirdPartyExtensionsStaff).toBe(false);

    // Changed behind the cache's back: still the cached copy.
    await db.execute(sql`UPDATE PlatformSetting SET value = CAST('{"v": 4, "enabled": true}' AS JSON) WHERE setting_key = 'ai_policy'`);
    expect((await getAiPolicy()).v).toBe(3);
    invalidateAiPolicy();
    expect((await getAiPolicy()).enabled).toBe(true);

    // Anything that isn't a literal true stays off.
    expect(normalizeAiPolicy({ enabled: "yes", apps: { mis: 0 } })).toMatchObject({ enabled: false, apps: { mis: true } });
  });

  it("setAiPolicy validates, bumps v, stamps who/when and writes the audit log", async () => {
    const actor = await createUser({ userType: "ADMIN" });
    const before = await getAiPolicy();
    const after = await setAiPolicy({ enabled: true, apps: { tupo: false }, features: { grading: true }, assessments: "always_off" }, actor);
    expect(after.v).toBe(Math.max(1, before.v) + 1);
    expect(after).toMatchObject({ enabled: true, apps: { tupo: false, mis: true }, features: { grading: true }, assessments: "always_off", updated_by: actor });
    expect(after.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect((await getAiPolicy()).v).toBe(after.v); // cache invalidated

    const [log] = rows(await db.execute(sql`SELECT action_type, metadata FROM ActivityLog WHERE actor_id = ${actor} ORDER BY activity_id DESC LIMIT 1`));
    expect(log.action_type).toBe("AI_POLICY_UPDATE");
    const meta = JSON.parse(log.metadata);
    expect(meta.v).toBe(after.v);
    expect(meta.diff.map((d: any) => d.field)).toEqual(expect.arrayContaining(["apps.tupo", "features.grading", "assessments"]));

    await expect(setAiPolicy({ enabled: "on" }, actor)).rejects.toThrow(/enabled must be true or false/);
    await expect(setAiPolicy({ apps: { word: true } }, actor)).rejects.toThrow(/Unknown app/);
    await expect(setAiPolicy({ assessments: "sometimes" }, actor)).rejects.toThrow(/assessments/);
    await expect(setAiPolicy({ thirdPartyExtensionsStaff: "no" }, actor)).rejects.toThrow(/thirdPartyExtensionsStaff must be true or false/);
    expect((await getAiPolicy()).v).toBe(after.v); // refused changes write nothing
  });

  it("policyDiff names only what changed", () => {
    const a = normalizeAiPolicy({ enabled: false });
    const b = normalizeAiPolicy({ enabled: true, apps: { da: false } });
    expect(policyDiff(a, b).map((d) => d.field)).toEqual(["enabled", "apps.da"]);
    const c = normalizeAiPolicy({ enabled: true, apps: { da: false }, thirdPartyExtensionsStaff: false });
    expect(policyDiff(b, c)).toEqual([{ field: "thirdPartyExtensionsStaff", from: true, to: false }]);
  });
});

describe("routes", () => {
  let superAdmin: number;
  let admin: number;
  let teacher: number;
  let student: number;

  beforeAll(async () => {
    setAiPolicyForTests(null);
    superAdmin = await createUser({ userType: "ADMIN" });
    await assignRole(superAdmin, await roleId("SUPER_ADMIN"));
    admin = await createUser({ userType: "ADMIN" });
    await assignRole(admin, await roleId("ADMIN"));
    // ADMIN may hold every legacy permission but AI_POLICY_MANAGE in some databases.
    await assignRole(admin, await createRoleWithPermissions("AIP_ADMIN", ["AI_POLICY_MANAGE"]));
    teacher = await createUser({ userType: "TEACHER" });
    await grantAiUse(teacher);
    student = await createUser({ userType: "STUDENT" });
    await assignRole(student, await createRoleWithPermissions("AIP_STUDENT", ["VIEW_MY_COURSES", "VIEW_SHARED_LESSON_NOTES"]));
  });

  it("GET /ai-policy tells anyone signed in the policy and what they may do", async () => {
    expect((await request(app).get("/ai-policy")).status).toBe(401);
    const s = await request(app).get("/ai-policy").set(auth(student));
    expect(s.status).toBe(200);
    expect(s.body.data.policy).toHaveProperty("enabled");
    expect(s.body.data.me).toEqual({ hasAiUse: false, canManage: false });
    const t = await request(app).get("/ai-policy").set(auth(teacher));
    expect(t.body.data.me).toEqual({ hasAiUse: true, canManage: false });
    const sa = await request(app).get("/ai-policy").set(auth(superAdmin));
    expect(sa.body.data.me).toEqual({ hasAiUse: true, canManage: true });
  });

  it("PUT /ai-policy: 403 for ADMIN (even holding the permission), 200 for SUPER_ADMIN", async () => {
    const no = await request(app).put("/ai-policy").set(auth(admin)).send({ enabled: true });
    expect(no.status).toBe(403);
    const before = (await request(app).get("/ai-policy").set(auth(superAdmin))).body.data.policy;
    const ok = await request(app).put("/ai-policy").set(auth(superAdmin)).send({ enabled: true, thirdPartyExtensions: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.policy).toMatchObject({ enabled: true, thirdPartyExtensions: true, v: Math.max(1, before.v) + 1, updated_by: superAdmin });
    expect(ok.body.data.updatedByName).toMatch(/^Test /);
    const bad = await request(app).put("/ai-policy").set(auth(superAdmin)).send({ enabled: 1 });
    expect(bad.status).toBe(400);
  });

  it("PUT /ai-policy: thirdPartyExtensionsStaff is validated, stored, audited and returned by GET", async () => {
    const off = await request(app).put("/ai-policy").set(auth(superAdmin)).send({ thirdPartyExtensionsStaff: false });
    expect(off.status).toBe(200);
    expect(off.body.data.policy.thirdPartyExtensionsStaff).toBe(false);
    const got = await request(app).get("/ai-policy").set(auth(teacher));
    expect(got.body.data.policy.thirdPartyExtensionsStaff).toBe(false);
    const [log] = rows(await db.execute(sql`SELECT metadata FROM ActivityLog WHERE actor_id = ${superAdmin} AND action_type = 'AI_POLICY_UPDATE' ORDER BY activity_id DESC LIMIT 1`));
    const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
    expect(meta.diff).toContainEqual({ field: "thirdPartyExtensionsStaff", from: true, to: false });
    expect(meta.after.thirdPartyExtensionsStaff).toBe(false);
    const bad = await request(app).put("/ai-policy").set(auth(superAdmin)).send({ thirdPartyExtensionsStaff: "off" });
    expect(bad.status).toBe(400);
    const on = await request(app).put("/ai-policy").set(auth(superAdmin)).send({ thirdPartyExtensionsStaff: true });
    expect(on.body.data.policy.thirdPartyExtensionsStaff).toBe(true);
  });

  it("GET /auth/verify carries ai_policy_v", async () => {
    const policy = await getAiPolicy();
    const res = await request(app).get("/auth/verify").set(auth(teacher));
    expect(res.status).toBe(200);
    expect(res.body.data.ai_policy_v).toBe(policy.v);
  });

  it("GET /integrations/ai-policy needs a partner credential", async () => {
    expect((await request(app).get("/integrations/ai-policy")).status).toBe(401);

    const raw = `test_${crypto.randomBytes(16).toString("hex")}`;
    await db.insert(IntegrationToken).values({
      name: "AI policy test",
      token_hash: crypto.createHash("sha256").update(raw, "utf8").digest("hex"),
      token_prefix: raw.slice(0, 8),
      scopes: "sync:read",
    });
    expect((await request(app).get("/integrations/ai-policy").set("Authorization", `Bearer ${raw}`)).status).toBe(403);

    // What the spokes use: their SSO client id and secret as HTTP Basic.
    const clientId = `aip_${crypto.randomBytes(6).toString("hex")}`;
    await db.insert(System).values({ name: `AI policy ${clientId}`, client_id: clientId, client_secret: "s3cret", icon_url: "x", home_url: "x", status: "ACTIVE" } as any);
    const basic = (secret: string) => `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`;
    expect((await request(app).get("/integrations/ai-policy").set("Authorization", basic("wrong"))).status).toBe(401);
    const ok = await request(app).get("/integrations/ai-policy").set("Authorization", basic("s3cret"));
    expect(ok.status).toBe(200);
    expect(ok.body.data.policy).toMatchObject({ v: (await getAiPolicy()).v });
  });

  describe("route guards", () => {
    afterAll(() => setAiPolicyForTests(null));

    it("policy on: a student is refused with ROLE_OFF on the lesson-plan and scheme AI routes (no check before)", async () => {
      setAiPolicyForTests(AI_POLICY_ALL_ON);
      for (const [path, body] of [
        ["/lesson-plans/ai-generate", { entry_id: 1 }],
        ["/scheme-of-work/entries/ai-suggest", { prompt: "x" }],
        ["/scheme-of-work/entries/suggest-criteria", { content: "x" }],
        ["/scheme-of-work/schemes/1/bulk-suggest-criteria", {}],
      ] as const) {
        const res = await request(app).post(path).set(auth(student)).send(body);
        expect(res.status, path).toBe(403);
        expect(res.body, path).toEqual({ success: false, code: "AI_DISABLED", reason: "ROLE_OFF", message: "Your role does not include AI tools." });
      }
    });

    it("master switch off: GLOBAL_OFF for everyone, the course tutor and the note reader too", async () => {
      setAiPolicyForTests({ enabled: false });
      const lp = await request(app).post("/lesson-plans/ai-generate").set(auth(teacher)).send({ entry_id: 1 });
      expect(lp.status).toBe(403);
      expect(lp.body).toMatchObject({ code: "AI_DISABLED", reason: "GLOBAL_OFF", message: "AI is turned off for the school." });

      const tutor = await request(app).post("/elearning/my/courses/999999/ask").set(auth(student)).send({ question: "why?" });
      expect(tutor.status).toBe(403);
      expect(tutor.body.reason).toBe("GLOBAL_OFF");
      const sugg = await request(app).get("/elearning/my/courses/999999/ask/suggestions").set(auth(student));
      expect(sugg.body.reason).toBe("GLOBAL_OFF");
    });

    it("the app switch: mis off refuses MIS tools but leaves the desktop decision to its own switch", async () => {
      setAiPolicyForTests({ enabled: true, apps: { mis: false } });
      const res = await request(app).post("/lesson-plans/ai-generate").set(auth(teacher)).send({ entry_id: 1 });
      expect(res.body).toMatchObject({ code: "AI_DISABLED", reason: "APP_OFF" });
      const st = await request(app).get("/desktop/tools/ai/status").set(auth(teacher));
      expect(st.body.data).toMatchObject({ available: true, reason: null });

      setAiPolicyForTests({ enabled: false });
      const off = await request(app).get("/desktop/tools/ai/status").set(auth(teacher));
      expect(off.body.data).toMatchObject({ available: false, reason: "GLOBAL_OFF", message: "AI is turned off for the school.", mode: "assistant" });
      const chat = await request(app).post("/desktop/tools/ai/chat").set(auth(teacher)).send({ messages: [{ role: "user", content: "hi" }] });
      expect(chat.status).toBe(403);
      expect(chat.body).toMatchObject({ code: "AI_DISABLED", reason: "GLOBAL_OFF" });
    });

    it("policy on: students without AI_USE get ROLE_OFF from the desktop tutor (owner decision 3)", async () => {
      setAiPolicyForTests(AI_POLICY_ALL_ON);
      const st = await request(app).get("/desktop/tools/ai/status").set(auth(student));
      expect(st.body.data).toMatchObject({ available: false, reason: "ROLE_OFF", mode: "tutor" });
      const parent = await createUser({ userType: "PARENT" });
      await grantAiUse(parent);
      const p = await request(app).get("/desktop/tools/ai/status").set(auth(parent));
      expect(p.body.data).toMatchObject({ available: false, reason: "PARENTS_SOON" }); // parents stay blocked
    });
  });
});

describe("provider chokepoint", () => {
  afterAll(() => {
    setAiPolicyForTests(null);
    uninstallFakeAI();
  });

  it("refuses before any provider is called while AI is off, and passes when on", async () => {
    const { calls } = installFakeAI(() => ({ ok: true }));
    setAiPolicyForTests({ enabled: false });
    const err = await generateStructuredContent({ schemaName: "t", schema: { type: "object" }, prompt: "p" }).catch((e) => e);
    expect(err).toBeInstanceOf(AiDisabledError);
    expect(err).toMatchObject({ statusCode: 403, code: "AI_DISABLED", reason: "GLOBAL_OFF" });

    setAiPolicyForTests({ enabled: true, apps: { mis: false } });
    expect(await generateStructuredContent({ schemaName: "t", schema: { type: "object" }, prompt: "p" }).catch((e) => e.reason)).toBe("APP_OFF");
    expect(calls).toHaveLength(0);

    setAiPolicyForTests(AI_POLICY_ALL_ON);
    const ok = await generateStructuredContent({ schemaName: "t", schema: { type: "object" }, prompt: "p" });
    expect(ok.data).toEqual({ ok: true });
  });
});
