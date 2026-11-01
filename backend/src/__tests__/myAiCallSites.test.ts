import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import app from "../app";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { installFakeAI, uninstallFakeAI } from "../test/fakeAI";
import { setAiPolicyForTests } from "../services/ai/policy";
import { setValidationFetch } from "../services/ai/personal/validate";
import type { AiPolicy } from "../vendor/nga-access";

/**
 * My AI at the MIS call sites (PERSONAL_AI_PROVIDERS_PLAN.md §10.3, §9.3): an interactive AI
 * endpoint answers with the person's own key when their route says so, and returns `ai` for
 * the "via …" chip. Uses the scheme-of-work "Generate with AI" entry suggestion as the
 * representative endpoint (authenticate + requireAi("author"), nothing else to set up).
 */

const auth = (id: number) => ({ Authorization: `Bearer ${signToken(id)}` });
const KEY = "sk-test-0123456789abcdefWXYZ";
const ENTRY = { topic: "Variables", objective: "Declare variables", methodology: "Demo", resources: "PCs", evaluation: "Quiz" };
const savedEnv = { ...process.env };

const POLICY_ON = {
  enabled: true,
  features: { grading: true },
  personal: { enabled: true, staff: { allowed: true, providers: [], customEndpoints: false } },
} as unknown as Partial<AiPolicy>;

async function teacherWithKey() {
  const id = await createUser({ userType: "TEACHER" });
  await assignRole(id, await createRoleWithPermissions("MY_AI_CALLSITE", ["AI_USE", "AI_PERSONAL_PROVIDERS"]));
  const add = await request(app).post("/my-ai/credentials").set(auth(id)).send({ provider: "openai", apiKey: KEY });
  expect(add.status, JSON.stringify(add.body)).toBe(201);
  const put = await request(app)
    .put("/my-ai/routes")
    .set(auth(id))
    .send({ routes: [{ app: "mis", task: "author", credentialId: add.body.data.id, model: "gpt-4o-mini" }] });
  expect(put.status, JSON.stringify(put.body)).toBe(200);
  return { id, credentialId: add.body.data.id as number };
}

const suggest = (id: number, extra: Record<string, unknown> = {}) =>
  request(app).post("/scheme-of-work/entries/ai-suggest").set(auth(id)).send({ subject_name: "Programming", week_label: "Week 1", prompt: "Intro to variables", ...extra });

beforeAll(() => {
  process.env.AI_VAULT_KEK_1 = crypto.randomBytes(32).toString("base64");
  process.env.AI_VAULT_KEK_CURRENT = "1";
  setValidationFetch((async () => new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }), { status: 200 })) as typeof fetch);
});

afterAll(() => {
  process.env = { ...savedEnv };
  setAiPolicyForTests(null);
  setValidationFetch(null);
});

describe("My AI at MIS call sites", () => {
  beforeEach(() => setAiPolicyForTests(POLICY_ON));
  afterEach(() => uninstallFakeAI());

  it("answers with the teacher's own key and says so in `ai`", async () => {
    const { id, credentialId } = await teacherWithKey();
    const { calls } = installFakeAI({ openai: () => ENTRY, groq: () => ENTRY, glm: () => ENTRY });

    const res = await suggest(id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.topic).toBe("Variables");
    expect(res.body.data.ai).toMatchObject({ route: "personal", reason: "PERSONAL", credentialId, provider: "openai", model: "gpt-4o-mini" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ provider: "openai", apiKey: KEY, schemaName: "scheme_entry" });
  });

  it("a per-request aiRoute=school override uses the school's AI", async () => {
    const { id } = await teacherWithKey();
    const { calls } = installFakeAI({ openai: () => ENTRY, groq: () => ENTRY, glm: () => ENTRY });

    const res = await suggest(id, { aiRoute: "school" });
    expect(res.status).toBe(200);
    expect(res.body.data.ai).toMatchObject({ route: "school" });
    // The fake "openai" also sits in the school chain; a school call never carries the user's key.
    expect(calls.every((c) => !c.apiKey)).toBe(true);
  });

  it("with My AI off, behaves exactly as before: school AI, `ai` null", async () => {
    const { id } = await teacherWithKey();
    setAiPolicyForTests({ enabled: true, features: { grading: true } } as unknown as Partial<AiPolicy>);
    const { calls } = installFakeAI({ openai: () => ENTRY, groq: () => ENTRY, glm: () => ENTRY });

    const res = await suggest(id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ topic: "Variables", ai: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].apiKey).toBeUndefined();
  });
});
