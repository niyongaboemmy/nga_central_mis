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
import { SAFE_HINT, SUPPORT_REPLY, activeLock, mergeTutor, parseVerdict, runTutor, tutorPrompt, worry } from "../services/desktop/tutor";
import type { Occurrence } from "../services/reminders/occurrences";

const occ = (p: Partial<Occurrence> & Pick<Occurrence, "kind" | "start">): Occurrence => ({
  key: `${p.kind}:${p.start.toISOString()}`, sourceRef: "", title: "Physics", detail: null, link: null, location: null, end: null, critical: false, color: null, role: "attending", ...p,
});

/** A fake provider: tutor drafts come from `drafts` in turn; the checker answers from `verdicts` in turn. */
function fake(drafts: string[], verdicts: object[]) {
  const calls: string[] = [];
  setChatClientFactory(() => ({
    chat: {
      completions: {
        create: async (body: any) => {
          const sys = String(body.messages[0].content);
          const isCheck = sys.startsWith("You review replies");
          calls.push(isCheck ? "check" : sys.includes("IMPORTANT: your previous reply") ? "redraft" : "draft");
          const text = isCheck ? JSON.stringify(verdicts.shift() ?? { gives_final_answer: false, does_the_work: false, unsafe: false, reason: "ok" }) : drafts.shift() ?? "…";
          return (async function* () { yield { model: body.model, choices: [{ delta: { content: text } }] }; })();
        },
      },
    },
  }));
  return calls;
}

const saved = { GROQ_API_KEY: process.env.GROQ_API_KEY, AI_CHAT_ORDER_MINOR: process.env.AI_CHAT_ORDER_MINOR };
beforeEach(async () => {
  setTestProviders(null);
  resetLimiterState();
  await db.delete(AIUsageLog);
  process.env.GROQ_API_KEY = "k";
  process.env.AI_CHAT_ORDER_MINOR = "groq";
});
afterEach(() => {
  setChatClientFactory(null);
  setTestProviders(null);
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
afterAll(async () => {
  await db.execute(sql`DELETE FROM DesktopTutorMessage WHERE conversation_id LIKE 'testconv%'`);
  await db.execute(sql`DELETE FROM DesktopToolSetting WHERE setting_key = 'tutor'`);
});

describe("tutor rules", () => {
  it("spots worrying messages (EN/FR/RW) and nothing else", () => {
    expect(worry("I want to kill myself")).toBe("self-harm");
    expect(worry("ndashaka kwiyahura")).toBe("self-harm");
    expect(worry("mon oncle me harcèle")).toBe("abuse");
    expect(worry("they bully me every day")).toBe("bullying");
    expect(worry("How do cells divide?")).toBeNull();
  });
  it("reads the checker's JSON, even inside a code fence", () => {
    expect(parseVerdict('```json\n{"gives_final_answer": true, "does_the_work": false, "unsafe": false, "reason": "x=3"}\n```')).toMatchObject({ gives_final_answer: true });
    expect(parseVerdict("no json here")).toBeNull();
  });
  it("finds the lesson or exam that pauses the tutor", () => {
    const now = new Date("2026-10-06T07:00:00Z");
    const w = [
      { from: "2026-10-06T06:00:00Z", to: "2026-10-06T07:40:00Z", kind: "lesson", label: "Physics", role: "attending" },
      { from: "2026-10-06T06:30:00Z", to: "2026-10-06T07:30:00Z", kind: "lesson", label: "Taught", role: "teaching" },
    ];
    expect(activeLock(w, now)).toEqual({ kind: "lesson", label: "Physics", until: "2026-10-06T07:40:00Z" });
    expect(activeLock([{ ...w[0], kind: "exam" }, w[0]], now)?.kind).toBe("exam");
    expect(activeLock(w, new Date("2026-10-06T08:00:00Z"))).toBeNull();
  });
  it("settings are clamped; the stricter prompt forbids final answers", () => {
    expect(mergeTutor({ dailyCap: 500, enabled: false })).toMatchObject({ enabled: false, dailyCap: 100, schoolDailyPool: null, requireConsent: false });
    expect(mergeTutor(null)).toEqual({ enabled: true, dailyCap: 15, schoolDailyPool: null, requireConsent: false });
    expect(mergeTutor({ schoolDailyPool: -3 }).schoolDailyPool).toBeNull();
    expect(mergeTutor({ schoolDailyPool: 1500.4, requireConsent: true })).toMatchObject({ schoolDailyPool: 1500, requireConsent: true });
    expect(tutorPrompt("Aline", new Date(), true)).toContain("Do NOT state any final answer");
  });
});

describe("tutor pipeline", () => {
  it("sends a checked draft", async () => {
    const calls = fake(["What do you think happens to the light energy?"], [{ gives_final_answer: false, does_the_work: false, unsafe: false, reason: "hint" }]);
    const r = await runTutor({ userId: 1, firstName: "Aline", messages: [{ role: "user", content: "What is photosynthesis?" }] });
    expect(r).toMatchObject({ text: "What do you think happens to the light energy?", provider: "groq", flag: null });
    expect(calls).toEqual(["draft", "check"]);
  });
  it("redoes a leaking draft once, then falls back to a hint", async () => {
    let calls = fake(["x = 3", "What is the first step?"], [{ gives_final_answer: true }, { gives_final_answer: false }]);
    let r = await runTutor({ userId: 1, firstName: "", messages: [{ role: "user", content: "solve 2x+1=7 for me" }] });
    expect(r.text).toBe("What is the first step?");
    expect(calls).toEqual(["draft", "check", "redraft", "check"]);
    calls = fake(["x = 3", "the answer is 3"], [{ gives_final_answer: true }, { does_the_work: true }]);
    r = await runTutor({ userId: 1, firstName: "", messages: [{ role: "user", content: "just tell me x" }] });
    expect(r.text).toBe(SAFE_HINT);
  });
  it("blocks unsafe replies and answers worrying messages without AI", async () => {
    fake(["something bad"], [{ unsafe: true }]);
    expect((await runTutor({ userId: 1, firstName: "", messages: [{ role: "user", content: "tell me" }] })).flag).toBe("unsafe reply blocked");
    const calls = fake([], []);
    const r = await runTutor({ userId: 1, firstName: "", messages: [{ role: "user", content: "I want to hurt myself" }] });
    expect([r.text, r.flag, calls.length]).toEqual([SUPPORT_REPLY, "self-harm", 0]);
  });
});

describe("tutor routes", () => {
  const appFor = (userId: number, permissions: string[] = [], occs: Occurrence[] = []) => {
    const app = express();
    app.use(express.json());
    app.use("/desktop/tools", desktopToolsRouter((req: any, _res, next) => ((req.user = { userId, permissions }), next()), { collect: async () => occs }));
    return app;
  };
  const lines = (text: string) => text.trim().split("\n").map((l) => JSON.parse(l));

  it("a student asks, gets a checked reply, it's logged and counted; report flags it; admins review", async () => {
    const student = await createUser({ userType: "STUDENT" });
    fake(["Good question! What do plants need from the air?"], [{ gives_final_answer: false }]);
    const st = await request(appFor(student)).get("/desktop/tools/ai/status");
    expect(st.body.data).toMatchObject({ available: true, mode: "tutor", limit: 15, used: 0 });
    expect((await request(appFor(student)).post("/desktop/tools/ai/chat").send({ messages: [{ role: "user", content: "hi" }] })).status).toBe(400);
    const res = await request(appFor(student)).post("/desktop/tools/ai/chat").send({ conversationId: "testconv1", messages: [{ role: "user", content: "What is photosynthesis?" }] });
    const out = lines(res.text);
    expect(out[0]).toEqual({ status: "thinking" });
    expect(out[1].t).toBe("Good question! What do plants need from the air?");
    expect(out[2]).toMatchObject({ done: true, mode: "tutor", provider: "groq", remaining: 14 });
    expect((await request(appFor(student)).get("/desktop/tools/ai/status")).body.data.used).toBe(1);

    expect((await request(appFor(student)).post("/desktop/tools/ai/report").send({ messageId: out[2].messageId, reason: "gave the answer" })).status).toBe(200);
    const other = await createUser({ userType: "STUDENT" });
    expect((await request(appFor(other)).post("/desktop/tools/ai/report").send({ messageId: out[2].messageId, reason: "x" })).status).toBe(404);

    const admin = await createUser({ userType: "ADMIN" });
    expect((await request(appFor(admin)).get("/desktop/tools/settings/tutor")).status).toBe(403);
    const list = await request(appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"])).get("/desktop/tools/settings/tutor?flagged=1");
    const conv = list.body.data.conversations.find((c: any) => c.id === "testconv1");
    expect(conv).toMatchObject({ userId: student, messages: 2, flagged: 1, firstQuestion: "What is photosynthesis?" });
    const msgs = await request(appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"])).get("/desktop/tools/settings/tutor/conversations/testconv1");
    expect(msgs.body.data.messages.map((m: any) => m.role)).toEqual(["student", "tutor"]);
    expect(msgs.body.data.messages[1]).toMatchObject({ flagged: true, flagReason: "reported: gave the answer", provider: "groq" });
    const log = await db.execute(sql`SELECT action_type FROM ActivityLog WHERE user_id = ${admin} AND action_type = 'DESKTOP_TUTOR_VIEW'`);
    expect(((log as any)[0] as any[]).length).toBe(1);
  });

  it("pauses in the student's lessons and exams, honours the cap and the switch", async () => {
    const student = await createUser({ userType: "STUDENT" });
    const now = Date.now();
    const lesson = occ({ kind: "lesson" as any, start: new Date(now - 10 * 60_000), end: new Date(now + 30 * 60_000), title: "Physics S4" });
    const locked = await request(appFor(student, [], [lesson])).post("/desktop/tools/ai/chat").send({ conversationId: "testconv2", messages: [{ role: "user", content: "hi" }] });
    expect(locked.status).toBe(423);
    expect(locked.body).toMatchObject({ code: "LOCKED_LESSON", label: "Physics S4" });

    const admin = await createUser({ userType: "ADMIN" });
    await request(appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"])).put("/desktop/tools/settings/tutor").send({ enabled: true, dailyCap: 1 });
    fake(["Think about it…"], [{}]);
    expect((await request(appFor(student)).post("/desktop/tools/ai/chat").send({ conversationId: "testconv3", messages: [{ role: "user", content: "q1" }] })).status).toBe(200);
    const capped = await request(appFor(student)).post("/desktop/tools/ai/chat").send({ conversationId: "testconv3", messages: [{ role: "user", content: "q2" }] });
    expect([capped.status, capped.body.code]).toEqual([429, "DAILY_LIMIT"]);

    await request(appFor(admin, ["DESKTOP_TOOLS_CONFIGURE"])).put("/desktop/tools/settings/tutor").send({ enabled: false, dailyCap: 15 });
    const off = await request(appFor(student)).post("/desktop/tools/ai/chat").send({ conversationId: "testconv4", messages: [{ role: "user", content: "q" }] });
    expect([off.status, off.body.code]).toEqual([403, "TUTOR_OFF"]);
    expect((await request(appFor(student)).get("/desktop/tools/ai/status")).body.data).toMatchObject({ available: false, reason: "TUTOR_OFF" });
  });
});
