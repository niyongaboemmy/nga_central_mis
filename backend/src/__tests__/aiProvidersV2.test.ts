import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { AIUsageLog } from "../db/schema";
import { generateStructuredContent, AIQuotaExhaustedError, quotaSnapshot } from "../services/aiProviders";
import { installFakeAI, uninstallFakeAI } from "../test/fakeAI";

const schema = { type: "object" as const, properties: { ok: { type: "boolean" as const } } };
const quota = () => Object.assign(new Error("429 RESOURCE_EXHAUSTED"), { status: 429 });
const deadKey = () => Object.assign(new Error("Incorrect API key provided"), { status: 401 });
const waitForLogs = () => new Promise((r) => setTimeout(r, 150));

describe("AI providers v2: roles, quotas, parking, usage log", () => {
  const saved = { ...process.env };
  beforeEach(async () => {
    // Quotas are counted from the log, so start each case from an empty one (the test
    // schema is disposable). Wait out fire-and-forget writes from the previous case first.
    await waitForLogs();
    await db.delete(AIUsageLog);
    for (const k of Object.keys(process.env)) if (k.startsWith("AI_DAILY_REQUESTS_") || k.startsWith("AI_RPM_")) delete process.env[k];
  });
  afterEach(() => {
    uninstallFakeAI();
    process.env = { ...saved };
  });

  it("uses the role order: drafts go to GLM first, questions to Groq first", async () => {
    const { calls } = installFakeAI(() => ({ ok: true }));
    const draft = await generateStructuredContent({ prompt: "x", schema }, { role: "draft", feature: "t.draft" });
    const assess = await generateStructuredContent({ prompt: "x", schema }, { role: "assess", feature: "t.assess" });
    expect(draft.providerUsed).toBe("glm");
    expect(assess.providerUsed).toBe("groq");
    expect(calls.map((c) => c.provider)).toEqual(["glm", "groq"]);
  });

  it("never uses an excluded provider (verifier ≠ drafter)", async () => {
    installFakeAI(() => ({ ok: true }));
    const r = await generateStructuredContent({ prompt: "x", schema }, { role: "verify", excludeProviders: ["groq"] });
    expect(r.providerUsed).toBe("glm");
  });

  it("skips a provider over its daily quota without calling it", async () => {
    process.env.AI_DAILY_REQUESTS_GLM = "1";
    const { calls } = installFakeAI(() => ({ ok: true }));
    await generateStructuredContent({ prompt: "x", schema }, { role: "draft" });
    await generateStructuredContent({ prompt: "x", schema }, { role: "draft" });
    expect(calls.map((c) => c.provider)).toEqual(["glm", "gemini"]);
  });

  it("keeps the interactive reserve away from bulk calls", async () => {
    process.env.AI_DAILY_REQUESTS_GLM = "4";
    process.env.AI_INTERACTIVE_RESERVE_PCT = "50"; // 2 of 4 reserved
    const { calls } = installFakeAI(() => ({ ok: true }));
    for (let i = 0; i < 3; i++) await generateStructuredContent({ prompt: "x", schema }, { role: "draft", bulk: true });
    // Two bulk calls fit on GLM, the third moves on; an interactive call may still use GLM.
    expect(calls.map((c) => c.provider)).toEqual(["glm", "glm", "gemini"]);
    const interactive = await generateStructuredContent({ prompt: "x", schema }, { providerOrder: ["glm"] });
    expect(interactive.providerUsed).toBe("glm");
  });

  it("throws AIQuotaExhaustedError when every provider is out of quota", async () => {
    installFakeAI(() => {
      throw quota();
    });
    await expect(generateStructuredContent({ prompt: "x", schema }, { role: "draft", bulk: true })).rejects.toBeInstanceOf(
      AIQuotaExhaustedError,
    );
    // All three are now cooling down: the next call fails fast, still as a quota error.
    await expect(generateStructuredContent({ prompt: "x", schema })).rejects.toBeInstanceOf(AIQuotaExhaustedError);
  });

  it("parks a dead key for the hour and falls through to the next provider", async () => {
    const { calls } = installFakeAI({
      glm: () => {
        throw deadKey();
      },
      gemini: () => ({ ok: true }),
    });
    await generateStructuredContent({ prompt: "x", schema }, { role: "draft" });
    await generateStructuredContent({ prompt: "x", schema }, { role: "draft" });
    expect(calls.map((c) => c.provider)).toEqual(["glm", "gemini", "gemini"]);
  });

  it("Gemini's free-tier 429 (which mentions billing) is a quota pause, not a dead key", async () => {
    const geminiDaily = Object.assign(
      new Error('{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generate_content_free_tier_requests","status":"RESOURCE_EXHAUSTED"}}'),
      {},
    );
    const openaiNoCredit = Object.assign(new Error("429 You exceeded your current quota, please check your plan and billing details."), { status: 429, code: "insufficient_quota" });
    const { isDeadProviderError, isQuotaError } = await import("../services/aiProviders");
    expect(isDeadProviderError(geminiDaily)).toBe(false);
    expect(isQuotaError(geminiDaily)).toBe(true);
    expect(isDeadProviderError(openaiNoCredit)).toBe(true);
  });

  it("a non-quota failure is a plain 503, not a quota error", async () => {
    installFakeAI(() => {
      throw new Error("Unexpected token < in JSON");
    });
    const err = await generateStructuredContent({ prompt: "x", schema }).catch((e) => e);
    expect(err).not.toBeInstanceOf(AIQuotaExhaustedError);
    expect(err.statusCode).toBe(503);
  });

  it("logs every attempt with tokens, and quotaSnapshot reports what is left", async () => {
    process.env.AI_DAILY_REQUESTS_GROQ = "10";
    installFakeAI(() => ({ ok: true }));
    await generateStructuredContent({ prompt: "x", schema }, { role: "assess", feature: "test.usage", runId: 987654 });
    await waitForLogs();
    const rows = await db.select().from(AIUsageLog).where(eq(AIUsageLog.run_id, 987654));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "groq", feature: "test.usage", ok: 1, input_tokens: 10, output_tokens: 20 });
    const [groq] = await quotaSnapshot(["groq"]);
    expect(groq.daily_limit).toBe(10);
    expect(groq.used_today).toBeGreaterThanOrEqual(1);
    await db.delete(AIUsageLog).where(eq(AIUsageLog.run_id, 987654));
  });
});
