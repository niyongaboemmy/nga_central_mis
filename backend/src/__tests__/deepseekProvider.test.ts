import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import { deepseekProvider } from "../services/aiProviders/deepseekProvider";
import { generateStructuredContent } from "../services/aiProviders";
import { AI_POLICY_ALL_ON, setAiPolicyForTests } from "../services/ai/policy";

// A local stand-in for DeepSeek. The orchestrator tests swap in fake providers, which is how
// this adapter came to return the bare JSON instead of { data, model, usage } unnoticed:
// generateStructuredContent then handed callers data: undefined whenever DeepSeek answered.
const schema = { type: "object" as const, properties: { ok: { type: "boolean" as const } }, required: ["ok"] };
let lastBody: any;
let server: http.Server;
const saved = { ...process.env };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "x",
          object: "chat.completion",
          model: "deepseek-chat",
          usage: { prompt_tokens: 20, completion_tokens: 4 },
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{\"ok\":true}" } }],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  // The SDK client is created on first use, so these must be set before any call.
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setAiPolicyForTests(AI_POLICY_ALL_ON);
});

afterAll(async () => {
  setAiPolicyForTests(null);
  process.env = saved;
  await new Promise((resolve) => server.close(resolve));
});

describe("DeepSeek provider", () => {
  it("returns { data, model, usage } and clamps max_tokens to 8192", async () => {
    const r = await deepseekProvider.generateJSON({ prompt: "hi", schema, maxOutputTokens: 20000 });
    expect(r).toEqual({ data: { ok: true }, model: "deepseek-chat", usage: { input_tokens: 20, output_tokens: 4 } });
    expect(lastBody.max_tokens).toBe(8192);
    expect(lastBody.response_format).toEqual({ type: "json_object" });
  });

  it("gives the orchestrator's caller the data when DeepSeek answers", async () => {
    const r = await generateStructuredContent({ prompt: "hi", schema }, { providerOrder: ["deepseek"] });
    expect(r.providerUsed).toBe("deepseek");
    expect(r.data).toEqual({ ok: true });
    expect(r.model).toBe("deepseek-chat");
  });
});
