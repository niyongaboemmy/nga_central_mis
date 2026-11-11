import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { db } from "../db";
import { Notification, System, User } from "../db/schema";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { installFakeAI, uninstallFakeAI } from "../test/fakeAI";
import { invalidateAiPolicy, setAiPolicy, setAiPolicyForTests } from "../services/ai/policy";
import { generateStructuredContent } from "../services/aiProviders";
import { PersonalAIError } from "../services/aiProviders/errors";
import { setChatClientFactory } from "../services/aiProviders/chat";
import { isVaultConfigured, keyHint, open, rewrap, seal, VaultNotConfiguredError } from "../services/secrets/vault";
import { checkEndpointUrl, isBlockedAddress, safeLookup, UnsafeUrlError } from "../services/ai/personal/safeFetch";
import { setValidationFetch, validateKey } from "../services/ai/personal/validate";
import { personalWhoFromUserId } from "../services/ai/personal/routes";
import { completeOpenRouterConnect, setOpenRouterOAuthFetch, startOpenRouterConnect } from "../services/ai/personal/openrouterOAuth";
import { AI_POLICY_DEFAULT, decidePersonalRoute, normalizeAiPolicy, type AiPersonalRoute, type AiPolicy } from "../vendor/nga-access";
import { assignTestSystems } from "../test/systems";

/**
 * My AI (PERSONAL_AI_PROVIDERS_PLAN.md): the vault, the route decision, the SSRF guard, key
 * validation, the /my-ai API, routing real AI calls, and the gateway the other apps use.
 */

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const auth = (id: number) => ({ Authorization: `Bearer ${signToken(id)}` });
const waitForLogs = () => new Promise((r) => setTimeout(r, 150));
const KEY = "sk-test-0123456789abcdefWXYZ";

const savedEnv = { ...process.env };
const POLICY_ON = {
  enabled: true,
  features: { grading: true },
  personal: { enabled: true, staff: { allowed: true, providers: [], customEndpoints: false }, students: { allowed: true, providers: ["openrouter"], maxDailyRequests: 2 } },
} as unknown as Partial<AiPolicy>;

/** Every provider answers like a healthy /models (or /key, /user/balance) endpoint. */
const healthyProviders = () =>
  setValidationFetch((async (url: any) => {
    const u = String(url);
    if (u.endsWith("/key")) return new Response(JSON.stringify({ data: { limit: null, limit_remaining: null, usage: 0, is_free_tier: true } }), { status: 200 });
    if (u.endsWith("/user/balance")) return new Response(JSON.stringify({ is_available: true, balance_infos: [] }), { status: 200 });
    return new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }, { id: "claude-haiku-5-5" }, { id: "openrouter/free" }] }), { status: 200 });
  }) as typeof fetch);

async function staffWithMyAi(userType: "TEACHER" | "STUDENT" = "TEACHER") {
  const id = await createUser({ userType });
  const caps = userType === "STUDENT" ? ["AI_USE", "AI_PERSONAL_PROVIDERS_STUDENT"] : ["AI_USE", "AI_PERSONAL_PROVIDERS"];
  await assignRole(id, await createRoleWithPermissions("MY_AI_TEST", caps));
  return id;
}

async function addKey(userId: number, body: Record<string, unknown> = {}) {
  const res = await request(app).post("/my-ai/credentials").set(auth(userId)).send({ provider: "openai", apiKey: KEY, ...body });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data;
}

beforeAll(() => {
  process.env.AI_VAULT_KEK_1 = crypto.randomBytes(32).toString("base64");
  process.env.AI_VAULT_KEK_CURRENT = "1";
});

afterAll(() => {
  process.env = { ...savedEnv };
  setAiPolicyForTests(null);
  setValidationFetch(null);
  setChatClientFactory(null);
});

describe("vault", () => {
  it("seals and opens, and refuses tampering, a wrong row or a missing key", () => {
    const s = seal("secret-value", "aicred|v1|1|7|openai");
    expect(open(s, "aicred|v1|1|7|openai")).toBe("secret-value");
    expect(s.ciphertext.toString("utf8")).not.toContain("secret");
    expect(() => open(s, "aicred|v1|1|8|openai")).toThrow();
    const tampered = { ...s, ciphertext: Buffer.from(s.ciphertext) };
    tampered.ciphertext[0] ^= 1;
    expect(() => open(tampered, "aicred|v1|1|7|openai")).toThrow();

    const saved = process.env.AI_VAULT_KEK_1;
    delete process.env.AI_VAULT_KEK_1;
    expect(isVaultConfigured()).toBe(false);
    expect(() => seal("x", "a")).toThrow(VaultNotConfiguredError);
    process.env.AI_VAULT_KEK_1 = saved;
  });

  it("rotation re-wraps the data key; the old KEK can then be removed", () => {
    const s = seal("rotate-me", "row");
    process.env.AI_VAULT_KEK_2 = crypto.randomBytes(32).toString("base64");
    process.env.AI_VAULT_KEK_CURRENT = "2";
    const r = rewrap(s, "row");
    expect(r.kekVersion).toBe(2);
    expect(r.ciphertext.equals(s.ciphertext)).toBe(true);
    const old = process.env.AI_VAULT_KEK_1;
    delete process.env.AI_VAULT_KEK_1;
    expect(open(r, "row")).toBe("rotate-me");
    process.env.AI_VAULT_KEK_1 = old;
    process.env.AI_VAULT_KEK_CURRENT = "1";
    delete process.env.AI_VAULT_KEK_2;
  });

  it("shows only a hint of a key", () => {
    expect(keyHint("sk-proj-abcdefghijklmnop1234")).toBe("sk-…1234");
    expect(keyHint("AIzaSyD-abcdefghij9876")).toBe("…9876");
  });
});

describe("decidePersonalRoute", () => {
  const route = (over: Partial<AiPersonalRoute> = {}): AiPersonalRoute => ({ app: "*", task: "*", credentialId: 1, provider: "openai", model: "m", fallback: "school", status: "active", ...over });
  const policy = (personal: Record<string, unknown> = {}) =>
    normalizeAiPolicy({ ...AI_POLICY_DEFAULT, enabled: true, personal: { enabled: true, students: { allowed: true, providers: ["openrouter", "gemini"] }, ...personal } });
  const staff = { app: "tm" as const, task: "author" as const, isStudent: false, hasPersonalCap: true };

  it("uses the person's key only when every rule allows it", () => {
    expect(decidePersonalRoute(policy(), staff, [route()]).reason).toBe("PERSONAL");
    expect(decidePersonalRoute(normalizeAiPolicy(AI_POLICY_DEFAULT), staff, [route()]).reason).toBe("PERSONAL_OFF");
    expect(decidePersonalRoute(policy({ apps: { tm: false } }), staff, [route()]).reason).toBe("APP_OFF");
    expect(decidePersonalRoute(policy(), { ...staff, system: true }, [route()]).reason).toBe("SYSTEM_CALL");
    expect(decidePersonalRoute(policy(), { ...staff, inAssessment: true }, [route()]).reason).toBe("IN_ASSESSMENT");
    expect(decidePersonalRoute(policy({ inAssessments: "allowed" }), { ...staff, inAssessment: true }, [route()]).reason).toBe("PERSONAL");
    expect(decidePersonalRoute(policy(), { ...staff, hasPersonalCap: false }, [route()]).reason).toBe("NOT_ALLOWED");
    expect(decidePersonalRoute(policy(), staff, []).reason).toBe("NO_ROUTE");
    expect(decidePersonalRoute(policy(), staff, [route({ status: "no_credit" })]).reason).toBe("KEY_NOT_ACTIVE");
    expect(decidePersonalRoute(policy(), staff, [route({ allowedApps: ["mis"] })]).reason).toBe("APP_NOT_ALLOWED_FOR_KEY");
    expect(decidePersonalRoute(policy({ staff: { providers: ["anthropic"] } }), staff, [route()]).reason).toBe("PROVIDER_BLOCKED");
  });

  it("never lets a student use Gemini or DeepSeek, whatever the allowlist says", () => {
    const student = { ...staff, isStudent: true };
    expect(decidePersonalRoute(policy(), student, [route({ provider: "gemini" })]).reason).toBe("PROVIDER_BLOCKED");
    expect(decidePersonalRoute(policy(), student, [route({ provider: "openrouter" })]).reason).toBe("PERSONAL");
  });

  it("picks the most specific route, and fallback needs both the policy and the route", () => {
    const routes = [route({ credentialId: 1 }), route({ task: "author", credentialId: 2 }), route({ app: "tm", credentialId: 3 }), route({ app: "tm", task: "author", credentialId: 4, fallback: "none" })];
    const d = decidePersonalRoute(policy(), staff, routes);
    expect(d.route?.credentialId).toBe(4);
    expect(d.fallbackToSchool).toBe(false);
    expect(decidePersonalRoute(policy(), { ...staff, task: "assist" }, routes).route?.credentialId).toBe(3);
    expect(decidePersonalRoute(policy(), { ...staff, app: "da" }, routes).route?.credentialId).toBe(2);
    expect(decidePersonalRoute(policy({ fallbackToSchool: false }), staff, [route()]).fallbackToSchool).toBe(false);
  });
});

describe("SSRF guard for custom endpoints", () => {
  it("refuses private, loopback, metadata and odd addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });

  it("accepts only https on the standard port with no credentials in the URL", () => {
    expect(checkEndpointUrl("https://api.example.com/v1").hostname).toBe("api.example.com");
    for (const bad of ["http://api.example.com", "https://localhost/v1", "https://x.internal", "https://api.example.com:8443", "https://u:p@api.example.com", "https://10.0.0.5/v1", "not a url"]) {
      expect(() => checkEndpointUrl(bad), bad).toThrow(UnsafeUrlError);
    }
  });

  it("refuses at connect time when a name resolves to a private address", async () => {
    const err = await new Promise<any>((resolve) => safeLookup("127.0.0.1", {}, (e) => resolve(e)));
    expect(err?.code).toBe("UNSAFE_URL");
  });
});

describe("key validation", () => {
  afterEach(() => setValidationFetch(null));
  const reply = (status: number, body: unknown) => setValidationFetch((async () => new Response(JSON.stringify(body), { status })) as typeof fetch);

  it("maps each provider's answer to a status a person understands", async () => {
    reply(200, { data: [{ id: "gpt-4o-mini" }] });
    expect(await validateKey("openai", KEY)).toMatchObject({ status: "active", models: ["gpt-4o-mini"] });
    reply(401, { error: { message: "Incorrect API key" } });
    expect((await validateKey("openai", KEY)).status).toBe("invalid");
    reply(429, {});
    expect((await validateKey("groq", KEY)).status).toBe("rate_limited");
    reply(400, { error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } });
    expect((await validateKey("gemini", KEY)).status).toBe("invalid");
    reply(200, { is_available: false, balance_infos: [] });
    expect((await validateKey("deepseek", KEY)).status).toBe("no_credit");
  });

  it("never reaches a private custom endpoint", async () => {
    const r = await validateKey("custom", KEY, "https://localhost/v1");
    expect(r.status).toBe("unreachable");
  });
});

describe("/my-ai", () => {
  beforeEach(() => {
    setAiPolicyForTests(POLICY_ON);
    healthyProviders();
  });
  afterEach(() => uninstallFakeAI());

  it("explains why it is closed while My AI is off", async () => {
    setAiPolicyForTests({ enabled: true });
    const id = await staffWithMyAi();
    const res = await request(app).get("/my-ai").set(auth(id));
    expect(res.status).toBe(200);
    expect(res.body.data.blocked.code).toBe("PERSONAL_OFF");
    const add = await request(app).post("/my-ai/credentials").set(auth(id)).send({ provider: "openai", apiKey: KEY });
    expect(add.status).toBe(403);
  });

  it("stores a key sealed, never returns it, and lists it with a hint only", async () => {
    const id = await staffWithMyAi();
    const created = await addKey(id, { label: "Work OpenAI" });
    expect(JSON.stringify(created)).not.toContain(KEY);
    expect(created).toMatchObject({ provider: "openai", label: "Work OpenAI", keyHint: "sk-…WXYZ", status: "active" });

    const [row] = rows(await db.execute(sql`SELECT secret_ct, key_hint FROM AiCredential WHERE credential_id = ${created.id}`));
    expect(Buffer.from(row.secret_ct).toString("utf8")).not.toContain("0123456789");

    const me = await request(app).get("/my-ai").set(auth(id));
    expect(me.body.data.blocked).toBeNull();
    expect(JSON.stringify(me.body)).not.toContain(KEY);
    expect(me.body.data.credentials).toHaveLength(1);
  });

  it("does not store a key the provider refuses", async () => {
    const id = await staffWithMyAi();
    setValidationFetch((async () => new Response("{}", { status: 401 })) as typeof fetch);
    const res = await request(app).post("/my-ai/credentials").set(auth(id)).send({ provider: "openai", apiKey: KEY });
    expect(res.status).toBe(400);
    const [{ n }] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM AiCredential WHERE owner_user_id = ${id}`));
    expect(Number(n)).toBe(0);
  });

  it("keeps students to the allowed providers", async () => {
    const id = await staffWithMyAi("STUDENT");
    const gemini = await request(app).post("/my-ai/credentials").set(auth(id)).send({ provider: "gemini", apiKey: KEY });
    expect(gemini.status).toBe(403);
    expect(gemini.body.message).toMatch(/18/);
    const or = await addKey(id, { provider: "openrouter", freeOnly: false });
    expect(or.freeOnly).toBe(true);
  });

  it("saves what answers what, resolves it, and deleting a key removes its routes", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    const put = await request(app).put("/my-ai/routes").set(auth(id)).send({ routes: [{ app: "*", task: "author", credentialId: c.id, model: "gpt-4o-mini" }] });
    expect(put.status).toBe(200);
    const resolved = await request(app).get("/my-ai/resolved").set(auth(id));
    expect(resolved.body.data.byTask.author).toMatchObject({ route: "personal", credentialId: c.id, model: "gpt-4o-mini" });
    expect(resolved.body.data.byTask.assist.route).toBe("school");

    const other = await staffWithMyAi();
    const theirs = await request(app).put("/my-ai/routes").set(auth(other)).send({ routes: [{ app: "*", task: "*", credentialId: c.id, model: "x" }] });
    expect(theirs.status).toBe(400);

    expect((await request(app).delete(`/my-ai/credentials/${c.id}`).set(auth(id))).status).toBe(200);
    const after = await request(app).get("/my-ai").set(auth(id));
    expect(after.body.data.routes).toEqual([]);
  });

  it("an AI call answers with the person's key and says so", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    await request(app).put("/my-ai/routes").set(auth(id)).send({ routes: [{ app: "mis", task: "author", credentialId: c.id, model: "gpt-4o-mini" }] });
    const { calls } = installFakeAI({ openai: () => ({ ok: true }), groq: () => ({ ok: true }), glm: () => ({ ok: true }) });
    const who = await personalWhoFromUserId(id);
    const r = await generateStructuredContent({ prompt: "x", schema: { type: "object" } }, { personal: { app: "mis", task: "author", who }, actorUserId: id });
    expect(r.ai).toMatchObject({ route: "personal", credentialId: c.id, provider: "openai", model: "gpt-4o-mini" });
    expect(calls).toEqual([expect.objectContaining({ provider: "openai", apiKey: KEY })]);

    const school = await generateStructuredContent({ prompt: "x", schema: { type: "object" } }, { personal: { app: "mis", task: "assist", who }, role: "assess" });
    expect(school.ai).toMatchObject({ route: "school", reason: "NO_ROUTE" });
  });

  it("a refused key falls back to School AI visibly, is marked, and the owner is told once", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    await request(app).put("/my-ai/routes").set(auth(id)).send({ routes: [{ app: "*", task: "*", credentialId: c.id, model: "gpt-4o-mini" }] });
    installFakeAI({
      openai: (_p, _n, cred) => {
        if (cred) throw Object.assign(new Error("Incorrect API key provided"), { status: 401 });
        return { ok: true };
      },
      groq: () => ({ ok: true }),
    });
    const who = await personalWhoFromUserId(id);
    const r = await generateStructuredContent({ prompt: "x", schema: { type: "object" } }, { personal: { app: "mis", task: "author", who }, role: "assess" });
    expect(r.ai).toMatchObject({ route: "school", fallbackFrom: "AI_KEY_INVALID", credentialId: c.id });
    const [cred] = rows(await db.execute(sql`SELECT status FROM AiCredential WHERE credential_id = ${c.id}`));
    expect(cred.status).toBe("invalid");
    const notes = await db.select().from(Notification).where(eq(Notification.user_id, id));
    expect(notes.filter((n) => n.kind === "ai_key_problem")).toHaveLength(1);
  });

  it("with fallback switched off the failure reaches the person", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    await request(app).put("/my-ai/routes").set(auth(id)).send({ routes: [{ app: "*", task: "*", credentialId: c.id, model: "gpt-4o-mini", fallback: "none" }] });
    installFakeAI({ openai: () => Promise.reject(Object.assign(new Error("Insufficient Balance"), { status: 402 })), groq: () => ({ ok: true }) });
    const who = await personalWhoFromUserId(id);
    const err = await generateStructuredContent({ prompt: "x", schema: { type: "object" } }, { personal: { app: "mis", task: "author", who } }).catch((e) => e);
    expect(err).toBeInstanceOf(PersonalAIError);
    expect(err.code).toBe("AI_KEY_NO_CREDIT");
  });

  it("the daily re-check marks a key the provider now refuses", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    await db.execute(sql`UPDATE AiCredential SET last_used_at = UTC_TIMESTAMP(), last_validated_at = NULL WHERE credential_id = ${c.id}`);
    setValidationFetch((async () => new Response("{}", { status: 401 })) as typeof fetch);
    const { sweepCredentials } = await import("../services/ai/personal/credentials");
    const r = await sweepCredentials(500);
    expect(r.checked).toBeGreaterThanOrEqual(1);
    const [row] = rows(await db.execute(sql`SELECT status FROM AiCredential WHERE credential_id = ${c.id}`));
    expect(row.status).toBe("invalid");
  });

  it("a deactivated account's keys stop", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    const { disableCredentialsOf } = await import("../services/ai/personal/credentials");
    await disableCredentialsOf(id);
    const [row] = rows(await db.execute(sql`SELECT status FROM AiCredential WHERE credential_id = ${c.id}`));
    expect(row.status).toBe("disabled");
  });
});

describe("Settings -> AI: the personal block", () => {
  let saved: { value: string } | null = null;
  beforeAll(async () => {
    const [r] = rows(await db.execute(sql`SELECT CAST(value AS CHAR) AS value FROM PlatformSetting WHERE setting_key = 'ai_policy'`));
    saved = r ?? null;
  });
  afterAll(async () => {
    if (saved) await db.execute(sql`UPDATE PlatformSetting SET value = CAST(${saved.value} AS JSON) WHERE setting_key = 'ai_policy'`);
    invalidateAiPolicy();
  });

  it("validates strictly and keeps the change", async () => {
    setAiPolicyForTests(null);
    const actor = await createUser({ userType: "ADMIN" });
    await expect(setAiPolicy({ personal: { staff: { providers: ["openai", "nope"] } } }, actor)).rejects.toThrow(/providers/);
    const p = await setAiPolicy({ personal: { enabled: true, students: { allowed: true, maxDailyRequests: 10 }, apps: { tupo: false } } }, actor);
    expect(p.personal).toMatchObject({ enabled: true, students: { allowed: true, maxDailyRequests: 10 }, apps: { tupo: false } });
    expect(p.personal.staff.allowed).toBe(true);
  });
});

describe("gateway for Task Mentor, Tupo and Tendo", () => {
  const clientId = `test_tm_${Date.now()}`;
  const basic = { Authorization: `Basic ${Buffer.from(`${clientId}:s3cret`).toString("base64")}` };

  beforeAll(async () => {
    process.env.ACCESS_APP_CLIENTS = `tm=${clientId}`;
    await db.insert(System).values({ name: `My AI ${clientId}`, client_id: clientId, client_secret: "s3cret", icon_url: "x", home_url: "x", status: "ACTIVE" } as any);
    await assignTestSystems(clientId);
  });
  afterAll(async () => {
    await db.delete(System).where(eq(System.client_id, clientId));
    delete process.env.ACCESS_APP_CLIENTS;
  });
  beforeEach(() => {
    setAiPolicyForTests(POLICY_ON);
    healthyProviders();
  });
  afterEach(() => {
    uninstallFakeAI();
    setChatClientFactory(null);
  });

  const schema = { type: "object", properties: { ok: { type: "boolean" } } };

  it("knows the calling app from its client id, and refuses inactive people", async () => {
    const id = await staffWithMyAi();
    const unknown = await request(app)
      .post("/integrations/ai/gateway/json")
      .set({ Authorization: `Basic ${Buffer.from("nobody:x").toString("base64")}` })
      .set("X-Nga-On-Behalf-Of", String(id))
      .send({ task: "author", prompt: "x", schema });
    expect(unknown.status).toBe(401);

    await db.update(User).set({ status: "INACTIVE" }).where(eq(User.user_id, id));
    const inactive = await request(app).post("/integrations/ai/gateway/json").set(basic).set("X-Nga-On-Behalf-Of", String(id)).send({ task: "author", prompt: "x", schema });
    expect(inactive.body.code).toBe("AI_GATEWAY_USER_INACTIVE");
  });

  it("says 'use your school AI' when the person has no route, and answers with their key when they do", async () => {
    const id = await staffWithMyAi();
    const none = await request(app).post("/integrations/ai/gateway/json").set(basic).set("X-Nga-On-Behalf-Of", String(id)).send({ task: "author", prompt: "x", schema });
    expect(none.status).toBe(409);
    expect(none.body).toMatchObject({ code: "AI_USE_SCHOOL", reason: "NO_ROUTE" });

    const c = await addKey(id, { allowedApps: ["tm"] });
    await request(app).put("/my-ai/routes").set(auth(id)).send({ routes: [{ app: "tm", task: "author", credentialId: c.id, model: "gpt-4o-mini" }] });
    installFakeAI({ openai: () => ({ ok: true }) });

    const routes = await request(app).get("/integrations/ai/routes").set(basic).set("X-Nga-On-Behalf-Of", String(id));
    expect(routes.body.data.byTask.author).toMatchObject({ route: "personal", credentialId: c.id });
    expect(routes.body.data.choices).toEqual([expect.objectContaining({ credentialId: c.id })]);
    expect(JSON.stringify(routes.body)).not.toContain(KEY);

    const ok = await request(app).post("/integrations/ai/gateway/json").set(basic).set("X-Nga-On-Behalf-Of", String(id)).send({ task: "author", feature: "tm.test", prompt: "x", schema });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ data: { ok: true }, ai: { route: "personal", credentialId: c.id } });
    expect(JSON.stringify(ok.body)).not.toContain(KEY);

    await waitForLogs();
    const [log] = rows(await db.execute(sql`SELECT app, route, credential_id FROM AIUsageLog WHERE feature = 'tm.test' ORDER BY usage_id DESC LIMIT 1`));
    expect(log).toMatchObject({ app: "tm", route: "personal", credential_id: c.id });
  });

  it("a key failure tells the app whether it may fall back", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    await request(app).put("/my-ai/routes").set(auth(id)).send({ routes: [{ app: "*", task: "*", credentialId: c.id, model: "gpt-4o-mini" }] });
    installFakeAI({ openai: () => Promise.reject(Object.assign(new Error("Rate limit reached"), { status: 429 })) });
    const res = await request(app).post("/integrations/ai/gateway/json").set(basic).set("X-Nga-On-Behalf-Of", String(id)).send({ task: "author", prompt: "x", schema });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: "AI_KEY_RATE_LIMITED", fallbackAllowed: true });
  });

  it("streams chat on the person's key as server-sent events", async () => {
    const id = await staffWithMyAi();
    const c = await addKey(id);
    await request(app).put("/my-ai/routes").set(auth(id)).send({ routes: [{ app: "*", task: "assist", credentialId: c.id, model: "gpt-4o-mini" }] });
    let usedKey = "";
    setChatClientFactory((t: any) => {
      usedKey = t.apiKey();
      return {
        chat: {
          completions: {
            create: async () =>
              (async function* () {
                yield { choices: [{ delta: { content: "Hel" } }] };
                yield { choices: [{ delta: { content: "lo" } }] };
              })(),
          },
        },
      };
    });
    const res = await request(app)
      .post("/integrations/ai/gateway/chat")
      .set(basic)
      .set("X-Nga-On-Behalf-Of", String(id))
      .send({ task: "assist", system: "s", messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(200);
    expect(usedKey).toBe(KEY);
    expect(res.text).toContain('event: delta\ndata: {"text":"Hel"}');
    expect(res.text).toContain("event: done");
    expect(res.text).not.toContain(KEY);
  });

  it("refuses everything while the school's AI is off", async () => {
    setAiPolicyForTests({ enabled: false });
    const id = await staffWithMyAi();
    const res = await request(app).post("/integrations/ai/gateway/json").set(basic).set("X-Nga-On-Behalf-Of", String(id)).send({ task: "author", prompt: "x", schema });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("AI_DISABLED");
  });
});

describe("OpenRouter one-click connect", () => {
  afterEach(() => setOpenRouterOAuthFetch(null));

  it("sends a PKCE challenge, and only the same person can finish within ten minutes", async () => {
    process.env.FRONTEND_URL = "https://mis.example.org";
    const { url } = startOpenRouterConnect(41, "https://mis.example.org/my-ai/openrouter-callback");
    const u = new URL(url);
    expect(u.origin).toBe("https://openrouter.ai");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    const state = new URL(u.searchParams.get("callback_url")!).searchParams.get("state")!;

    let sentVerifier = "";
    setOpenRouterOAuthFetch((async (_url: any, init: any) => {
      sentVerifier = JSON.parse(init.body).code_verifier;
      return new Response(JSON.stringify({ key: "sk-or-v1-new" }), { status: 200 });
    }) as typeof fetch);
    expect(await completeOpenRouterConnect(41, "code-1", state)).toBe("sk-or-v1-new");
    const challenge = crypto.createHash("sha256").update(sentVerifier).digest("base64url");
    expect(u.searchParams.get("code_challenge")).toBe(challenge);

    await expect(completeOpenRouterConnect(42, "code-1", state)).rejects.toThrow(/invalid or expired/);
    expect(() => startOpenRouterConnect(41, "https://evil.example.com/cb")).toThrow(/callback/);
  });
});
