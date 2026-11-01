import { describe, it, expect, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { assignRole, createRoleWithPermissions, createUser, signToken } from "../test/fixtures";
import { installFakeAI, uninstallFakeAI } from "../test/fakeAI";
import { setAiPolicyForTests } from "../services/ai/policy";
import { generateStructuredContent } from "../services/aiProviders";
import { chatHandoffPrompt, jsonHandoffPrompt, readPastedJson } from "../services/ai/handoff";
import { personalWhoFromUserId } from "../services/ai/personal/routes";
import type { AiPolicy } from "../vendor/nga-access";

/**
 * "Open in Claude / ChatGPT" + "Paste the answer" (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3.2):
 * any AI endpoint returns its exact prompt instead of calling a provider, and accepts the
 * person's pasted answer as if a provider had returned it.
 */

const auth = (id: number) => ({ Authorization: `Bearer ${signToken(id)}` });
const ENTRY = { topic: "Variables", objective: "Declare variables", methodology: "Demo", resources: "PCs", evaluation: "Quiz" };
const ON = { enabled: true, external: { connector: false, handoff: true, pupilNames: "with_consent" } } as unknown as Partial<AiPolicy>;

async function teacher(caps = ["AI_USE", "AI_EXTERNAL_CONNECT"]) {
  const id = await createUser({ userType: "TEACHER" });
  await assignRole(id, await createRoleWithPermissions("HANDOFF_TEST", caps));
  return id;
}

const suggest = (id: number, aiHandoff?: unknown) =>
  request(app).post("/scheme-of-work/entries/ai-suggest").set(auth(id)).send({ subject_name: "Programming", week_label: "Week 1", prompt: "Intro to variables", aiHandoff });

afterAll(() => setAiPolicyForTests(null));

describe("AI hand-off on a real endpoint", () => {
  beforeEach(() => setAiPolicyForTests(ON));
  afterEach(() => uninstallFakeAI());

  it("returns the exact prompt and calls no provider", async () => {
    const id = await teacher();
    const { calls } = installFakeAI(() => ENTRY);
    const res = await suggest(id, { mode: "prompt" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.handoff).toMatchObject({ expects: "json", schemaName: "scheme_entry" });
    expect(res.body.handoff.prompt).toContain("Intro to variables");
    expect(res.body.handoff.prompt).toContain("```json");
    expect(calls).toHaveLength(0);
  });

  it("uses a pasted answer like a provider's, and says it was pasted", async () => {
    const id = await teacher();
    const { calls } = installFakeAI(() => ({ topic: "WRONG" }));
    const pasted = `Sure! Here it is:\n\n\`\`\`json\n${JSON.stringify(ENTRY)}\n\`\`\`\nHope that helps.`;
    const res = await suggest(id, { mode: "import", text: pasted });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.topic).toBe("Variables");
    expect(res.body.data.ai).toMatchObject({ route: "handoff" });
    expect(calls).toHaveLength(0);
  });

  it("explains a paste in the wrong shape", async () => {
    const id = await teacher();
    const res = await suggest(id, { mode: "import", text: "I can't help with that." });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expected format/);
  });

  it("is off unless the school turns it on, and staff-only", async () => {
    setAiPolicyForTests({ enabled: true });
    const id = await teacher();
    const off = await suggest(id, { mode: "prompt" });
    expect(off.status).toBe(403);
    expect(off.body.code).toBe("AI_HANDOFF_OFF");

    setAiPolicyForTests(ON);
    const noCap = await teacher(["AI_USE"]);
    const refused = await suggest(noCap, { mode: "prompt" });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe("AI_HANDOFF_NOT_ALLOWED");
  });
});

describe("pupil data needs the policy and the person's consent", () => {
  afterEach(() => setAiPolicyForTests(null));

  const run = async (policy: Partial<AiPolicy>, consent: boolean) => {
    setAiPolicyForTests(policy);
    const id = await teacher();
    const who = await personalWhoFromUserId(id);
    return generateStructuredContent(
      { prompt: "Mentee record of Aline U.", schema: { type: "object" } },
      { pupilData: true, personal: { app: "mis", task: "author", who, handoff: { mode: "prompt", pupilConsent: consent } } },
    ).catch((e) => e);
  };

  it("refuses without consent, allows with it, and never when the school says never", async () => {
    expect((await run(ON, false)).code).toBe("AI_HANDOFF_PUPIL_CONSENT");
    expect((await run(ON, true)).code).toBe("AI_HANDOFF_PROMPT");
    const never = { ...ON, external: { connector: false, handoff: true, pupilNames: "never" } } as unknown as Partial<AiPolicy>;
    expect((await run(never, true)).code).toBe("AI_HANDOFF_PUPIL_CONSENT");
  });
});

describe("hand-off helpers", () => {
  const schema = { type: "object" as const, properties: { ok: { type: "boolean" as const } }, required: ["ok"] };

  it("finds the JSON in a chatty answer, preferring the last fenced block", () => {
    expect(readPastedJson('```json\n{"ok":false,"x":1}\n```\nfixed:\n```json\n{"ok":true}\n```', schema)).toEqual({ ok: true });
    expect(readPastedJson('Here: {"ok": true} done', schema)).toEqual({ ok: true });
    expect(() => readPastedJson('{"nope": 1}', schema)).toThrow(/expected format/);
  });

  it("builds prompts a chat model can follow", () => {
    expect(jsonHandoffPrompt("Make a quiz", schema)).toMatch(/Make a quiz[\s\S]*```json[\s\S]*"required":\["ok"\]/);
    expect(chatHandoffPrompt("Be brief.", [{ role: "user", content: "Hi" }])).toBe("Be brief.\n\nMe: Hi\n\nYou:");
  });
});
