import { describe, it, expect, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { createUser } from "../test/fixtures";
import { desktopToolsRouter } from "../routes/desktopTools";
import { placeholders, sourceHash } from "../services/desktop/translations";
import { setChatClientFactory } from "../services/aiProviders/chat";
import { MIS_MANIFEST } from "../access/manifest";
import { PRESETS } from "../access/presets";
import { isV2OnlyCapability } from "../access/v2Only";
import { ALL_PERMISSIONS } from "../utils/permissions";

const appFor = (userId: number, permissions: string[]) => {
  const app = express();
  app.use(express.json());
  app.use("/desktop/tools", desktopToolsRouter((req: any, _res, next) => ((req.user = { userId, permissions }), next()), { collect: async () => [] }));
  return app;
};
const P = ["TOOLS_TRANSLATIONS_MANAGE"];

describe("translation helpers", () => {
  it("hashes like the desktop (FNV-1a, 8 hex)", () => {
    // Same value as nga-desktop src/tools/games/seed.ts hash("abc") (440920331) in hex.
    expect(sourceHash("abc")).toBe((440920331).toString(16).padStart(8, "0"));
    expect(sourceHash("")).toBe("811c9dc5");
  });
  it("compares placeholders as a multiset", () => {
    expect(placeholders("{n} of {total}")).toBe(placeholders("{total} sur {n}"));
    expect(placeholders("{n}")).not.toBe(placeholders("n"));
  });
  it("declares TOOLS_TRANSLATIONS_MANAGE for the admin presets only", () => {
    const cap = "TOOLS_TRANSLATIONS_MANAGE";
    expect((MIS_MANIFEST.capabilities as Record<string, unknown>)[cap]).toBeTruthy();
    expect(isV2OnlyCapability(cap)).toBe(false);
    expect(ALL_PERMISSIONS).toContain(cap);
    for (const k of ["MANAGE_USER", "MANAGE_ROLE", "MANAGE_STAFF", "MANAGE_SYSTEM", "MANAGE_SCHOOL", "ADMIN", "STUDENT", "VIEW_ATTENDANCE", "TEACHER"]) expect(cap.includes(k)).toBe(false);
    const holders = PRESETS.filter((p) => p.caps.some((c) => (Array.isArray(c) ? c[0] : c) === cap)).map((p) => p.key).sort();
    expect(holders).toEqual(["platform_owner", "school_administrator"]);
  });
});

describe("translation workspace routes", () => {
  const clean = () => db.execute(sql`DELETE FROM DesktopToolTranslation WHERE string_key LIKE 'test.%'`);
  beforeEach(clean);
  afterAll(async () => {
    await clean();
    setChatClientFactory(null);
  });

  it("needs the permission (the published strings don't)", async () => {
    const u = await createUser({ userType: "STUDENT" });
    expect((await request(appFor(u, [])).get("/desktop/tools/i18n/workspace/fr")).status).toBe(403);
    expect((await request(appFor(u, [])).post("/desktop/tools/i18n/edit").send({})).status).toBe(403);
    expect((await request(appFor(u, [])).get("/desktop/tools/i18n/fr")).status).toBe(200);
    expect((await request(appFor(u, [])).get("/desktop/tools/i18n/de")).status).toBe(400);
  });

  it("edit → approve → publish reaches every desktop; unchanged; rollback; revert", async () => {
    const admin = await createUser({ userType: "ADMIN" });
    const a = appFor(admin, P);
    const bad = await request(a).post("/desktop/tools/i18n/edit").send({ lang: "fr", key: "test.count", en: "{n} pages", text: "pages", status: "draft" });
    expect(bad.body.code).toBe("PLACEHOLDERS");
    const draft = await request(a).post("/desktop/tools/i18n/edit").send({ lang: "fr", key: "test.count", en: "{n} pages", text: "{n} feuilles", status: "draft" });
    expect(draft.body.data).toMatchObject({ key: "test.count", status: "draft", sourceHash: sourceHash("{n} pages") });
    // Drafts are not published.
    let pub = await request(a).post("/desktop/tools/i18n/publish").send({ lang: "fr" });
    let live = await request(appFor(admin, [])).get("/desktop/tools/i18n/fr");
    expect(live.body.data.strings["test.count"]).toBeUndefined();

    await request(a).post("/desktop/tools/i18n/edit").send({ lang: "fr", key: "test.count", en: "{n} pages", text: "{n} pages (relu)", status: "approved" });
    pub = await request(a).post("/desktop/tools/i18n/publish").send({ lang: "fr", note: "test" });
    expect(pub.body.data.count).toBeGreaterThanOrEqual(1);
    live = await request(appFor(admin, [])).get("/desktop/tools/i18n/fr");
    expect(live.body.data).toMatchObject({ release: pub.body.data.id });
    expect(live.body.data.strings["test.count"]).toEqual({ t: "{n} pages (relu)", h: sourceHash("{n} pages") });
    expect((await request(appFor(admin, [])).get(`/desktop/tools/i18n/fr?since=${pub.body.data.id}`)).body.data).toEqual({ release: pub.body.data.id, unchanged: true });

    const ws = await request(a).get("/desktop/tools/i18n/workspace/fr");
    expect(ws.body.data.entries["test.count"]).toMatchObject({ status: "approved", text: "{n} pages (relu)" });
    expect(ws.body.data.releases[0]).toMatchObject({ id: pub.body.data.id, note: "test" });

    // Revert, publish (string gone), then roll back to the earlier release (string back).
    expect((await request(a).post("/desktop/tools/i18n/revert").send({ lang: "fr", key: "test.count" })).body.data.reverted).toBe(true);
    const pub2 = await request(a).post("/desktop/tools/i18n/publish").send({ lang: "fr" });
    expect((await request(appFor(admin, [])).get("/desktop/tools/i18n/fr")).body.data.strings["test.count"]).toBeUndefined();
    const back = await request(a).post("/desktop/tools/i18n/rollback").send({ lang: "fr", release: pub.body.data.id });
    expect(back.body.data.id).toBeGreaterThan(pub2.body.data.id);
    expect((await request(appFor(admin, [])).get("/desktop/tools/i18n/fr")).body.data.strings["test.count"].t).toBe("{n} pages (relu)");

    const log = await db.execute(sql`SELECT action_type FROM ActivityLog WHERE user_id = ${admin} AND action_type LIKE 'DESKTOP_TRANSLATION_%' ORDER BY 1`);
    expect(new Set(((log as any)[0] as any[]).map((r) => r.action_type))).toEqual(new Set(["DESKTOP_TRANSLATION_APPROVE", "DESKTOP_TRANSLATION_EDIT", "DESKTOP_TRANSLATION_PUBLISH", "DESKTOP_TRANSLATION_REVERT", "DESKTOP_TRANSLATION_ROLLBACK"]));
  });

  it("suggests with AI, keeping placeholders", async () => {
    const saved = { GROQ_API_KEY: process.env.GROQ_API_KEY, AI_CHAT_ORDER_ADULT: process.env.AI_CHAT_ORDER_ADULT };
    process.env.GROQ_API_KEY = "k";
    process.env.AI_CHAT_ORDER_ADULT = "groq";
    let answer = "« {n} pages restantes »";
    setChatClientFactory(() => ({
      chat: { completions: { create: async (body: any) => (async function* () { yield { model: body.model, choices: [{ delta: { content: answer } }] }; })() } },
    }));
    const admin = await createUser({ userType: "ADMIN" });
    const ok = await request(appFor(admin, P)).post("/desktop/tools/i18n/suggest").send({ lang: "fr", en: "{n} pages left", key: "test.left" });
    expect(ok.body.data.text).toBe("{n} pages restantes");
    answer = "pages restantes";
    const bad = await request(appFor(admin, P)).post("/desktop/tools/i18n/suggest").send({ lang: "fr", en: "{n} pages left", key: "test.left" });
    expect(bad.status).toBe(422);
    // Restore only what this test changed (replacing process.env breaks other files: isolate is off).
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
});
