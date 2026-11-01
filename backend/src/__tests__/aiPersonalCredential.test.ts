import { describe, it, expect, afterEach, beforeEach, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { AIUsageLog } from "../db/schema";
import { generateStructuredContent, PersonalAIError, personalAIErrorCode, quotaSnapshot } from "../services/aiProviders";
import { groqProvider } from "../services/aiProviders/groqProvider";
import { openrouterProvider } from "../services/aiProviders/openrouterProvider";
import { installFakeAI, uninstallFakeAI } from "../test/fakeAI";
import { AI_POLICY_ALL_ON, setAiPolicyForTests } from "../services/ai/policy";

// A call on a user's own key (PERSONAL_AI_PROVIDERS_PLAN.md §7.1, Phase 0): only that
// provider, no school fallback, no school quota/cooldown state, logged as route 'personal'.
const schema = { type: "object" as const, properties: { ok: { type: "boolean" as const } }, required: ["ok"] };
const waitForLogs = () => new Promise((r) => setTimeout(r, 150));
const err = (status: number, message: string) => Object.assign(new Error(message), { status });

beforeAll(() => setAiPolicyForTests(AI_POLICY_ALL_ON));
afterAll(() => setAiPolicyForTests(null));

describe("generateStructuredContent with a user's own key", () => {
  const saved = { ...process.env };
  beforeEach(async () => {
    await waitForLogs();
    await db.delete(AIUsageLog);
  });
  afterEach(() => {
    uninstallFakeAI();
    process.env = { ...saved };
  });

  it("uses only that provider and key, and logs the call as personal", async () => {
    const { calls } = installFakeAI(() => ({ ok: true }));
    const r = await generateStructuredContent(
      { prompt: "x", schema },
      { role: "draft", feature: "t.personal", actorUserId: 42, app: "tm", credential: { provider: "groq", apiKey: "sk-user", model: "my-model", credentialId: 7 } },
    );
    expect(r).toMatchObject({ providerUsed: "groq", model: "my-model", data: { ok: true } });
    // The draft role order would start with GLM; the personal key overrides it.
    expect(calls).toEqual([expect.objectContaining({ provider: "groq", apiKey: "sk-user" })]);

    await waitForLogs();
    const [row] = await db.select().from(AIUsageLog).where(eq(AIUsageLog.feature, "t.personal"));
    expect(row).toMatchObject({ provider: "groq", route: "personal", credential_id: 7, app: "tm", actor_user_id: 42, ok: 1 });
  });

  it("does not fall back to School AI and does not park the school's provider", async () => {
    const { calls } = installFakeAI((_p, _name, credential) => {
      if (credential) throw err(401, "Incorrect API key provided");
      return { ok: true };
    });
    const failure = await generateStructuredContent({ prompt: "x", schema }, { credential: { provider: "groq", apiKey: "sk-bad" } }).catch((e) => e);
    expect(failure).toBeInstanceOf(PersonalAIError);
    expect(failure.code).toBe("AI_KEY_INVALID");
    expect(failure.message).not.toContain("sk-bad");
    expect(calls.map((c) => c.provider)).toEqual(["groq"]);

    // The school's Groq key is still tried first for questions (assess order), not parked.
    const school = await generateStructuredContent({ prompt: "x", schema }, { role: "assess" });
    expect(school.providerUsed).toBe("groq");
  });

  it("personal calls do not count against the school's daily quota", async () => {
    process.env.AI_DAILY_REQUESTS_GROQ = "2";
    installFakeAI(() => ({ ok: true }));
    for (let i = 0; i < 3; i++) {
      await generateStructuredContent({ prompt: "x", schema }, { credential: { provider: "groq", apiKey: "sk-user" } });
    }
    await generateStructuredContent({ prompt: "x", schema }, { role: "assess" }); // one school call
    await waitForLogs();
    uninstallFakeAI(); // drops the in-memory count, so the next read comes from the log
    installFakeAI(() => ({ ok: true }));
    const [groq] = await quotaSnapshot(["groq"]);
    expect(groq).toMatchObject({ used_today: 1, remaining: 1 });
  });

  it("maps provider failures to codes the UI can explain", () => {
    expect(personalAIErrorCode(err(401, "Incorrect API key provided"))).toBe("AI_KEY_INVALID");
    expect(personalAIErrorCode(err(402, "Insufficient Balance"))).toBe("AI_KEY_NO_CREDIT");
    expect(personalAIErrorCode(err(429, "You exceeded your current quota: insufficient_quota"))).toBe("AI_KEY_NO_CREDIT");
    expect(personalAIErrorCode(err(429, "Rate limit reached"))).toBe("AI_KEY_RATE_LIMITED");
    expect(personalAIErrorCode(err(500, "boom"))).toBe("AI_PERSONAL_FAILED");
  });
});

describe("adapters with a per-call credential", () => {
  let lastBody: any;
  let lastAuth: string | undefined;
  let served = "a/one:free";
  let server: http.Server;
  let baseUrl = "";
  const saved = { ...process.env };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        lastBody = JSON.parse(raw);
        lastAuth = req.headers.authorization;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "x",
            object: "chat.completion",
            model: served,
            usage: { prompt_tokens: 5, completion_tokens: 2, cost: served.endsWith(":free") ? 0 : 0.01 },
            choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{\"ok\":true}" } }],
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    process.env = saved;
    await new Promise((resolve) => server.close(resolve));
  });

  it("sends the user's key and model, not the school's", async () => {
    process.env.GROQ_API_KEY = "school-key";
    process.env.GROQ_MODEL = "school-model";
    const r = await groqProvider.generateJSON({ prompt: "hi", schema }, { apiKey: "user-key", model: "user-model", baseUrl });
    expect(lastAuth).toBe("Bearer user-key");
    expect(lastBody.model).toBe("user-model");
    expect(r.data).toEqual({ ok: true });
  });

  it("OpenRouter: free-only by default, paid models only when the credential opts out", async () => {
    served = "anthropic/claude-sonnet";
    await expect(
      openrouterProvider.generateJSON({ prompt: "hi", schema }, { apiKey: "user-key", model: "anthropic/claude-sonnet", baseUrl }),
    ).rejects.toThrow(/only free models/);

    const r = await openrouterProvider.generateJSON(
      { prompt: "hi", schema },
      { apiKey: "user-key", model: "anthropic/claude-sonnet", baseUrl, freeOnly: false },
    );
    expect(lastAuth).toBe("Bearer user-key");
    expect(lastBody.models).toEqual(["anthropic/claude-sonnet"]);
    expect(r).toMatchObject({ data: { ok: true }, model: "anthropic/claude-sonnet" });
  });
});
