import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import { db } from "../db";
import { AIUsageLog } from "../db/schema";
import express from "express";
import jwt from "jsonwebtoken";
import { desktopToolsRouter } from "../routes/desktopTools";
import { createUser, signToken } from "../test/fixtures";
import { setTestProviders } from "../services/aiProviders/registry";
import { chatOrder, scrub, setChatClientFactory, streamChat, trimConversation, LIMITS } from "../services/aiProviders/chat";
import { blockedReason, burst, persona, systemPrompt } from "../services/desktop/assistant";

const waitForLogs = () => new Promise((r) => setTimeout(r, 150));
const quota = () => Object.assign(new Error("429 rate limit"), { status: 429 });

/** A fake OpenAI client per provider: `script[provider]` = text pieces, or an Error to throw. */
function fakeClients(script: Record<string, string[] | Error>, calls: Array<{ provider: string; body: any }> = []) {
  setChatClientFactory((t: any) => ({
    chat: {
      completions: {
        create: async (body: any) => {
          calls.push({ provider: t.name, body });
          const s = script[t.name];
          if (!s) throw Object.assign(new Error("not scripted"), { status: 500 });
          if (s instanceof Error) throw s;
          return (async function* () {
            for (const piece of s) yield { model: body.model, choices: [{ delta: { content: piece } }] };
          })();
        },
      },
    },
  }));
  return calls;
}

describe("Ask AI: chat service", () => {
  const saved = { ...process.env };
  beforeEach(async () => {
    await waitForLogs();
    await db.delete(AIUsageLog);
    setTestProviders(null); // clears cooldown / parked state
    process.env.GROQ_API_KEY = "k";
    process.env.GEMINI_API_KEY = "k";
    process.env.GLM_API_KEY = "k";
    process.env.OPENROUTER_API_KEY = "k";
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.AI_CHAT_ORDER_ADULT;
    delete process.env.AI_CHAT_ORDER_MINOR;
  });
  afterEach(() => {
    setChatClientFactory(null);
    setTestProviders(null); // leave no provider cooling down for the next test file
    burst.reset();
    process.env = { ...saved };
  });

  it("minors only ever reach providers whose terms allow them, whatever the env says", () => {
    expect(chatOrder("minor").map((t) => t.name)).toEqual(["glm"]);
    process.env.AI_CHAT_ORDER_MINOR = "groq,gemini,openrouter,glm";
    expect(chatOrder("minor").map((t) => t.name)).toEqual(["glm"]);
    expect(chatOrder("adult").map((t) => t.name)).toEqual(["groq", "gemini", "glm", "openrouter", "deepseek"]);
  });

  it("streams from the first provider and logs the usage", async () => {
    const calls = fakeClients({ groq: ["Hel", "lo"] });
    const got: string[] = [];
    const run = await streamChat({ system: "S", messages: [{ role: "user", content: "hi" }], audience: "adult", actorUserId: 7, feature: "t.chat", onText: (t) => got.push(t) });
    expect(run.provider).toBe("groq");
    expect(got.join("")).toBe("Hello");
    expect(calls[0].body.messages[0]).toEqual({ role: "system", content: "S" });
    expect(calls[0].body.stream).toBe(true);
    await waitForLogs();
    const rows = await db.select().from(AIUsageLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "groq", ok: 1, feature: "t.chat", actor_user_id: 7, role: "interactive" });
  });

  it("falls back on quota errors before the first token and cools the provider down", async () => {
    const calls = fakeClients({ groq: quota(), gemini: ["from gemini"] });
    const run = await streamChat({ system: "S", messages: [{ role: "user", content: "hi" }], audience: "adult", actorUserId: 1, feature: "t", onText: () => {} });
    expect(run.provider).toBe("gemini");
    // Cooling down: the next call skips Groq entirely.
    await streamChat({ system: "S", messages: [{ role: "user", content: "hi" }], audience: "adult", actorUserId: 1, feature: "t", onText: () => {} });
    expect(calls.map((c) => c.provider)).toEqual(["groq", "gemini", "gemini"]);
  });

  it("a minor's conversation is never sent to an 18+ provider, even if GLM fails", async () => {
    const calls = fakeClients({ glm: quota(), groq: ["nope"] });
    await expect(
      streamChat({ system: "S", messages: [{ role: "user", content: "hi" }], audience: "minor", actorUserId: 1, feature: "t", onText: () => {} }),
    ).rejects.toMatchObject({ reason: "QUOTA" });
    expect(calls.map((c) => c.provider)).toEqual(["glm"]);
  });

  it("does not start a second answer after text was sent", async () => {
    setChatClientFactory((t: any) => ({
      chat: { completions: { create: async () => (async function* () {
        if (t.name !== "groq") throw new Error("must not be called");
        yield { choices: [{ delta: { content: "part" } }] };
        throw Object.assign(new Error("socket hang up"), { status: 500 });
      })() } },
    }));
    const got: string[] = [];
    await expect(
      streamChat({ system: "S", messages: [{ role: "user", content: "hi" }], audience: "adult", actorUserId: 1, feature: "t", onText: (x) => got.push(x) }),
    ).rejects.toMatchObject({ reason: "FAILED" });
    expect(got).toEqual(["part"]);
  });

  it("says when nothing is configured", async () => {
    for (const k of ["GROQ_API_KEY", "GEMINI_API_KEY", "GLM_API_KEY", "OPENROUTER_API_KEY"]) delete process.env[k];
    fakeClients({});
    await expect(
      streamChat({ system: "S", messages: [{ role: "user", content: "hi" }], audience: "adult", actorUserId: 1, feature: "t", onText: () => {} }),
    ).rejects.toMatchObject({ reason: "UNCONFIGURED" });
  });

  it("refuses a paid OpenRouter model", async () => {
    process.env.AI_CHAT_ORDER_ADULT = "openrouter";
    setChatClientFactory(() => ({
      chat: { completions: { create: async () => (async function* () { yield { model: "openai/gpt-5", choices: [{ delta: { content: "x" } }] }; })() } },
    }));
    await expect(
      streamChat({ system: "S", messages: [{ role: "user", content: "hi" }], audience: "adult", actorUserId: 1, feature: "t", onText: () => {} }),
    ).rejects.toBeTruthy();
  });

  it("trims conversations to what fits and must end with the user", () => {
    expect(() => trimConversation([])).toThrow();
    expect(() => trimConversation([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toThrow();
    expect(() => trimConversation("nope")).toThrow();
    const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
    long.push({ role: "user", content: "last" });
    const t = trimConversation(long);
    expect(t.length).toBeLessThanOrEqual(LIMITS.messages);
    expect(t[0].role).toBe("user");
    expect(t[t.length - 1].content).toBe("last");
    const big = trimConversation([{ role: "user", content: "x".repeat(50_000) }]);
    expect(big[0].content.length).toBe(LIMITS.perMessage);
    expect(trimConversation([{ role: "system", content: "evil" }, { role: "user", content: "ok" }])).toEqual([{ role: "user", content: "ok" }]);
  });

  it("scrubs emails and phone numbers before they leave MIS", () => {
    expect(scrub("mail jean.d@nga.ac.rw or call 0788 123 456 / +250 788123456")).toBe("mail [email] or call [phone] / [phone]");
  });
});

describe("Ask AI: who and how", () => {
  it("maps personas and keeps students and parents out for now (D1)", () => {
    expect(persona("STUDENT")).toBe("student");
    expect(persona("teacher")).toBe("teacher");
    expect(persona(null)).toBe("staff");
    expect(blockedReason("student")).toBe("STUDENTS_SOON");
    expect(blockedReason("parent")).toBe("PARENTS_SOON");
    expect(blockedReason("teacher")).toBeNull();
  });

  it("builds the instructions on the server", () => {
    const p = systemPrompt("teacher", "Aline", new Date("2026-10-06T08:00:00Z"));
    expect(p).toContain("Aline, a teacher");
    expect(p).toContain("2026-10-06");
    expect(p).toContain("Rwanda");
  });
});

// The router alone, with a test sign-in (never the shared `app` or auth module:
// the suite shares one module registry and other files mock those).
const app = express();
app.use(express.json());
app.use(
  "/desktop/tools",
  desktopToolsRouter((req: any, res, next) => {
    const h = String(req.headers.authorization || "");
    try {
      const d: any = jwt.verify(h.replace(/^Bearer /, ""), process.env.JWT_SECRET!);
      req.user = { userId: Number(d.userId) };
      next();
    } catch {
      res.status(401).json({ message: "Invalid token" });
    }
  }),
);

describe("Ask AI: routes", () => {
  const saved = { ...process.env };
  beforeEach(async () => {
    await waitForLogs();
    await db.delete(AIUsageLog);
    setTestProviders(null);
    burst.reset();
    process.env.GROQ_API_KEY = "k";
    delete process.env.AI_ASSISTANT_DAILY_STAFF;
  });
  afterEach(() => {
    setChatClientFactory(null);
    setTestProviders(null); // leave no provider cooling down for the next test file
    burst.reset();
    process.env = { ...saved };
  });
  afterAll(() => setChatClientFactory(null));

  it("tells a teacher how many messages are left", async () => {
    const id = await createUser({ userType: "TEACHER" });
    const res = await request(app).get("/desktop/tools/ai/status").set("Authorization", `Bearer ${signToken(id)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ available: true, persona: "teacher", limit: 40, used: 0, remaining: 40 });
  });

  it("needs sign-in", async () => {
    const res = await request(app).get("/desktop/tools/ai/status");
    expect(res.status).toBe(401);
  });

  it("students are told it's coming (403)", async () => {
    const id = await createUser({ userType: "STUDENT" });
    const status = await request(app).get("/desktop/tools/ai/status").set("Authorization", `Bearer ${signToken(id)}`);
    expect(status.body.data).toMatchObject({ available: false, reason: "STUDENTS_SOON" });
    const res = await request(app).post("/desktop/tools/ai/chat").set("Authorization", `Bearer ${signToken(id)}`).send({ messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("STUDENTS_SOON");
  });

  it("streams NDJSON and counts the message", async () => {
    fakeClients({ groq: ["**Photo", "synthesis**"] });
    const id = await createUser({ userType: "TEACHER" });
    const res = await request(app)
      .post("/desktop/tools/ai/chat")
      .set("Authorization", `Bearer ${signToken(id)}`)
      .send({ messages: [{ role: "user", content: "Explain photosynthesis" }] });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/x-ndjson");
    expect(res.headers["x-accel-buffering"]).toBe("no");
    const lines = res.text.trim().split("\n").map((l) => JSON.parse(l));
    // Pieces are batched (~40 ms): the text arrives whole, then "done".
    expect(lines.filter((l) => "t" in l).map((l) => l.t).join("")).toBe("**Photosynthesis**");
    expect(lines[lines.length - 1]).toMatchObject({ done: true, provider: "groq", remaining: 39 });
  });

  it("reports provider trouble inside the stream", async () => {
    fakeClients({ groq: quota() });
    process.env.AI_CHAT_ORDER_ADULT = "groq";
    const id = await createUser({ userType: "TEACHER" });
    const res = await request(app).post("/desktop/tools/ai/chat").set("Authorization", `Bearer ${signToken(id)}`).send({ messages: [{ role: "user", content: "hi" }] });
    const last = JSON.parse(res.text.trim().split("\n").pop()!);
    expect(last).toMatchObject({ code: "QUOTA" });
  });

  it("refuses bad input and enforces the daily limit", async () => {
    const id = await createUser({ userType: "TEACHER" });
    const auth = { Authorization: `Bearer ${signToken(id)}` };
    expect((await request(app).post("/desktop/tools/ai/chat").set(auth).send({ messages: [] })).status).toBe(400);
    process.env.AI_ASSISTANT_DAILY_STAFF = "1";
    fakeClients({ groq: ["ok"] });
    expect((await request(app).post("/desktop/tools/ai/chat").set(auth).send({ messages: [{ role: "user", content: "1" }] })).status).toBe(200);
    await waitForLogs();
    const second = await request(app).post("/desktop/tools/ai/chat").set(auth).send({ messages: [{ role: "user", content: "2" }] });
    expect(second.status).toBe(429);
    expect(second.body.code).toBe("DAILY_LIMIT");
  });
});
