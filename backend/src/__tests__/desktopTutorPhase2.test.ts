import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { desktopToolsRouter } from "../routes/desktopTools";
import { setChatClientFactory } from "../services/aiProviders/chat";
import { setTestProviders } from "../services/aiProviders/registry";
import { resetLimiterState } from "../services/aiProviders/limiter";
import { AIUsageLog } from "../db/schema";
import { allowance, DEFAULT_TUTOR } from "../services/desktop/tutor";
import { cacheKey, isConceptQuestion, languageOf, normalise } from "../services/desktop/tutorCache";
import { EVAL_PROMPTS, runEvals, score } from "../services/desktop/tutorEval";

const KEYS = ["GROQ_API_KEY", "GEMINI_API_KEY", "GLM_API_KEY", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "AI_CHAT_ORDER_MINOR"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
beforeEach(async () => {
  setTestProviders(null);
  resetLimiterState();
  await db.delete(AIUsageLog);
  for (const k of KEYS) delete process.env[k];
  process.env.GROQ_API_KEY = "k";
  process.env.GLM_API_KEY = "k";
});
afterEach(() => {
  setChatClientFactory(null);
  setTestProviders(null);
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const cleanAll = async () => {
  await db.execute(sql`DELETE FROM DesktopTutorMessage WHERE conversation_id LIKE 'ptwo%'`);
  await db.execute(sql`DELETE FROM DesktopTutorCache`);
  await db.execute(sql`DELETE FROM DesktopTutorEval`);
  await db.execute(sql`DELETE FROM DesktopToolSetting WHERE setting_key = 'tutor'`);
};
afterAll(cleanAll);

/** Fake providers: `drafts` by provider; the checker says "leaked" when the draft contains "ANSWER". */
function fake(drafts: Record<string, string>) {
  const calls: Array<{ provider: string; kind: string }> = [];
  setChatClientFactory((t: any) => ({
    chat: {
      completions: {
        create: async (body: any) => {
          const sys = String(body.messages[0].content);
          const isCheck = sys.startsWith("You review replies");
          calls.push({ provider: t.name, kind: isCheck ? "check" : "draft" });
          const text = isCheck
            ? JSON.stringify({ gives_final_answer: String(body.messages[1].content).includes("ANSWER"), does_the_work: false, unsafe: false, reason: "t" })
            : drafts[t.name] ?? "What do you already know about it?";
          return (async function* () { yield { model: body.model, choices: [{ delta: { content: text } }] }; })();
        },
      },
    },
  }));
  return calls;
}

describe("answer cache rules", () => {
  it("shares first-turn concept questions only, never homework", () => {
    const one = (content: string) => [{ role: "user" as const, content }];
    expect(isConceptQuestion(one("What is photosynthesis?"))).toBe(true);
    expect(isConceptQuestion(one("Explique la photosynthèse"))).toBe(true);
    expect(isConceptQuestion(one("Sobanura fotosentezi"))).toBe(true);
    expect(isConceptQuestion(one("What is 3x + 5 = 20?"))).toBe(false);
    expect(isConceptQuestion(one("Explain my homework question about cells"))).toBe(false);
    expect(isConceptQuestion(one("Write an essay on water"))).toBe(false);
    expect(isConceptQuestion([{ role: "user", content: "What is a cell?" }, { role: "assistant", content: "…" }, { role: "user", content: "What is a cell?" }])).toBe(false);
  });
  it("normalises questions and keeps languages apart", () => {
    expect(normalise("  What IS   Photosynthesis?! ")).toBe("what is photosynthesis");
    expect(cacheKey("What is photosynthesis?")).toBe(cacheKey("what is photosynthesis"));
    expect(languageOf("Qu'est-ce qu'une cellule ?")).toBe("fr");
    expect(languageOf("Sobanura fotosentezi ni iki")).toBe("rw");
  });
});

describe("fair share", () => {
  it("splits the school's pool across yesterday's students, between 2 and the daily cap", () => {
    expect(allowance({ ...DEFAULT_TUTOR, schoolDailyPool: null }, 500)).toBe(15);
    expect(allowance({ ...DEFAULT_TUTOR, schoolDailyPool: 1500 }, 300)).toBe(5);
    expect(allowance({ ...DEFAULT_TUTOR, schoolDailyPool: 100 }, 500)).toBe(2);
    expect(allowance({ ...DEFAULT_TUTOR, schoolDailyPool: 9000 }, 10)).toBe(15);
    expect(allowance({ ...DEFAULT_TUTOR, schoolDailyPool: 50 }, 0)).toBe(15);
  });
});

describe("provider tests", () => {
  it("scores: passes when enough homework drafts held back the answer", () => {
    const hw = EVAL_PROMPTS.filter((p) => p.kind === "homework");
    const ok = score("glm", "m", hw.map((p) => ({ prompt: p.text, kind: "homework", leaked: false })));
    expect([ok.noLeakPct, ok.passed]).toEqual([100, true]);
    const bad = score("groq", "m", hw.map((p, i) => ({ prompt: p.text, kind: "homework", leaked: i < 6 })));
    expect(bad.passed).toBe(false);
    const thin = score("x", "m", hw.map((p, i) => ({ prompt: p.text, kind: "homework", leaked: i < 2 ? false : null })));
    expect(thin.passed).toBe(false); // too few answered to judge
  });

  it("a provider that gives answers away is left out of student drafts", async () => {
    const calls = fake({ groq: "The ANSWER is 5.", glm: "What could you do first?" });
    const results = await runEvals(1);
    const by = Object.fromEntries(results.map((r) => [r.provider, r]));
    expect(by.groq.passed).toBe(false);
    expect(by.glm.passed).toBe(true);
    // Each draft is judged by the OTHER provider.
    expect(calls.filter((c) => c.kind === "check").every((c, i, a) => a.length > 0)).toBe(true);

    calls.length = 0;
    const student = await createUser({ userType: "STUDENT" });
    const app = appFor(student);
    const res = await request(app).post("/desktop/tools/ai/chat").send({ conversationId: "ptwo01", messages: [{ role: "user", content: "Help me with 2x + 1 = 9" }] });
    const done = lines(res.text).find((l) => l.done);
    expect(done.provider).toBe("glm");
    expect(calls.filter((c) => c.kind === "draft").map((c) => c.provider)).toEqual(["glm"]);
  });
});

const appFor = (userId: number, permissions: string[] = []) => {
  const app = express();
  app.use(express.json());
  app.use("/desktop/tools", desktopToolsRouter((req: any, _res, next) => ((req.user = { userId, permissions }), next()), { collect: async () => [] }));
  return app;
};
const lines = (text: string) => text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

describe("cache, consent and fair share in the tutor", () => {
  beforeEach(cleanAll);

  it("caches a concept answer: the next student gets it free; a report forgets it", async () => {
    const calls = fake({ groq: "Plants use sunlight to make sugar. What do you think the sugar is for?" });
    const a = await createUser({ userType: "STUDENT" });
    const b = await createUser({ userType: "STUDENT" });
    const first = lines((await request(appFor(a)).post("/desktop/tools/ai/chat").send({ conversationId: "ptwoaa", messages: [{ role: "user", content: "What is photosynthesis?" }] })).text);
    expect(first.find((l) => l.done)).toMatchObject({ provider: "groq", remaining: 14 });
    const drafts = calls.filter((c) => c.kind === "draft").length;
    const second = lines((await request(appFor(b)).post("/desktop/tools/ai/chat").send({ conversationId: "ptwobb", messages: [{ role: "user", content: "what is photosynthesis" }] })).text);
    const done = second.find((l) => l.done);
    expect(done).toMatchObject({ provider: "cache", cached: true, remaining: 15 });
    expect(second.find((l) => l.t).t).toContain("Plants use sunlight");
    expect(calls.filter((c) => c.kind === "draft").length).toBe(drafts); // no AI call
    expect((await request(appFor(b)).get("/desktop/tools/ai/status")).body.data.used).toBe(0); // free

    expect((await request(appFor(b)).post("/desktop/tools/ai/report").send({ messageId: done.messageId, reason: "wrong" })).status).toBe(200);
    const third = lines((await request(appFor(b)).post("/desktop/tools/ai/chat").send({ conversationId: "ptwobb", messages: [{ role: "user", content: "What is photosynthesis?" }] })).text);
    expect(third.find((l) => l.done).provider).toBe("groq");
  });

  it("requires a linked parent's consent when the school asks for it", async () => {
    fake({});
    const admin = await createUser({ userType: "ADMIN" });
    await request(appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"])).put("/desktop/tools/settings/tutor").send({ ...DEFAULT_TUTOR, requireConsent: true });
    const kid = await createUser({ userType: "STUDENT" });
    const parent = await createUser({ userType: "TEACHER" });
    await db.execute(sql`UPDATE UserProfile SET user_type = 'PARENT' WHERE user_id = ${parent}`);
    const stranger = await createUser({ userType: "TEACHER" });
    await db.execute(sql`UPDATE UserProfile SET user_type = 'PARENT' WHERE user_id = ${stranger}`);
    await db.execute(sql`INSERT INTO Parenting (student_id, parent_id) VALUES (${kid}, ${parent})`);

    expect((await request(appFor(kid)).get("/desktop/tools/ai/status")).body.data).toMatchObject({ available: false, reason: "CONSENT_NEEDED" });
    const blocked = await request(appFor(kid)).post("/desktop/tools/ai/chat").send({ conversationId: "ptwocc", messages: [{ role: "user", content: "hi" }] });
    expect([blocked.status, blocked.body.code]).toEqual([403, "CONSENT_NEEDED"]);

    const fam = await request(appFor(parent)).get("/desktop/tools/family/tutor");
    expect(fam.body.data).toMatchObject({ requireConsent: true });
    expect(fam.body.data.children.map((c: any) => c.id)).toEqual([kid]);
    expect((await request(appFor(stranger)).put("/desktop/tools/family/tutor").send({ studentId: kid, granted: true })).status).toBe(404);
    expect((await request(appFor(kid)).get("/desktop/tools/family/tutor")).status).toBe(403);
    expect((await request(appFor(parent)).put("/desktop/tools/family/tutor").send({ studentId: kid, granted: true })).status).toBe(200);
    expect((await request(appFor(kid)).get("/desktop/tools/ai/status")).body.data).toMatchObject({ available: true });
    expect((await request(appFor(kid)).post("/desktop/tools/ai/chat").send({ conversationId: "ptwocc", messages: [{ role: "user", content: "hi" }] })).status).toBe(200);
    await db.execute(sql`DELETE FROM Parenting WHERE student_id = ${kid}`);
    await db.execute(sql`DELETE FROM DesktopTutorConsent WHERE student_id = ${kid}`);
  });

  it("the school pool sets today's allowance; admins see tests and cache stats", async () => {
    const admin = await createUser({ userType: "ADMIN" });
    await request(appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"])).put("/desktop/tools/settings/tutor").send({ ...DEFAULT_TUTOR, dailyCap: 10, schoolDailyPool: 4 });
    const kid = await createUser({ userType: "STUDENT" });
    // Nobody asked yesterday: the pool (4) is shared by one, capped by the daily cap (10).
    expect((await request(appFor(kid)).get("/desktop/tools/ai/status")).body.data.limit).toBe(4);
    const s = await request(appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"])).get("/desktop/tools/settings/tutor");
    expect(s.body.data).toMatchObject({ allowanceToday: 4, cache: { entries: 0 }, evalRunning: false, passMark: 75 });
    expect(s.body.data.providers).toEqual(expect.arrayContaining(["groq", "glm"]));
    expect((await request(appFor(kid)).post("/desktop/tools/settings/tutor/evals/run")).status).toBe(403);
  });
});
