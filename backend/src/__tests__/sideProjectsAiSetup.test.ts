// "Set up with AI" (migration 140): the permission (never students), reading documents to text,
// the AUTO / named provider order, the draft normalised for the wizard, refinement with the owner's
// plan edits, and applying the reviewed plan to the new project — against the test database with a
// deterministic AI provider.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";
import request from "supertest";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { sql } from "drizzle-orm";
import { installFakeFileServer } from "../test/fakeFileServer";

installFakeFileServer();

import { db } from "../db";
import { createUser } from "../test/fixtures";
import { buildPdf } from "../test/pdfFixture";
import { sideProjectsRouter } from "../routes/sideProjects";
import { setTestProviders } from "../services/aiProviders/registry";
import { resetLimiterState } from "../services/aiProviders/limiter";
import { AI_POLICY_ALL_ON, setAiPolicyForTests } from "../services/ai/policy";
import { documentsBlock, normalise, parsePlan, resetSessions, type SetupFile } from "../services/sideProjects/aiSetup";
import { MIS_MANIFEST } from "../access/manifest";
import { PRESETS } from "../access/presets";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

const perms = new Map<number, string[]>();
const app = express();
app.use(express.json());
app.use(
  "/side-projects",
  sideProjectsRouter(
    (req: any, res, next) => {
      const id = Number(req.get("X-Test-User"));
      if (!id) return res.status(401).end();
      req.user = { userId: id, permissions: perms.get(id) ?? [] };
      next();
    },
    (req: any, res, next) => ((perms.get(Number(req.user.userId)) ?? []).includes("SIDE_PROJECTS_MANAGE_OWN") ? next() : res.status(403).json({ message: "Forbidden" })),
    async (req: any) => ({ userId: Number(req.user.userId), summary: null, detail: null, review: null, manageAny: false }),
    (_req: any, _res, next) => next(),
  ),
);
const as = (id: number) => ({ "X-Test-User": String(id) });
let server: http.Server;
const api = () => request(server);

/** What the fake AI saw and answers. */
const calls: Array<{ provider: string; prompt: string }> = [];
let answer: any;
const fake = (name: string, opts: { fail?: boolean } = {}) => ({
  name,
  isConfigured: () => true,
  supportsStrictSchema: true,
  generateJSON: async (params: any) => {
    calls.push({ provider: name, prompt: params.prompt });
    if (opts.fail) throw Object.assign(new Error("503 overloaded"), { status: 503 });
    return { data: typeof answer === "function" ? answer(params) : answer, model: `${name}-model` };
  },
});

const START = day(1);
const TARGET = day(80);
const AI_ANSWER = (over: Record<string, unknown> = {}) => ({
  reply: "I set up the farm orders portal from your proposal and requirements.",
  summary: "An ordering portal for Kigali Green Farms' shop customers.",
  title: "Farm Orders Portal",
  abstract: "A web portal where shops order fresh produce from Kigali Green Farms, track deliveries and pay, so the farm plans its harvest.",
  problemStatement: "Shops order by phone and WhatsApp, so orders get lost and the farm can't plan picking or deliveries for the next day.",
  description: "Phase one covers ordering and delivery tracking; payments follow.",
  users: "Shop owners and the farm's dispatch team.",
  solution: "A responsive web app with an order form, a daily orders list for the farm and delivery status updates.",
  impact: "No lost orders and a picking plan every evening.",
  techTags: ["React", "Node.js", "MySQL", "React"],
  category: "Web",
  kind: "DELIVERY_STUDIO",
  customerName: "Kigali Green Farms",
  githubUrl: "https://github.com/patrick/farm-orders.git",
  accessUrl: "http://not-https.example",
  startDate: START,
  targetDate: TARGET,
  ideaEnd: day(10),
  planningEnd: day(25),
  buildingEnd: day(65),
  startIn: "PLANNING",
  documents: [
    { file: 1, slot: "CONCEPT", why: "The proposal" },
    { file: 2, slot: "SRS", why: "Requirements" },
    { file: 3, slot: "CONCEPT", why: "a second concept is refused" },
  ],
  phases: [
    {
      title: "Discovery",
      description: "Agree the scope",
      stage: "PLANNING",
      features: [{ title: "Requirements sign-off", description: "", priority: "high", estimateHours: 6, tasks: [{ title: "Run the workshop", priority: "MEDIUM", estimateHours: 3 }, { title: "x", priority: "LOW", estimateHours: 1 }] }],
    },
    {
      title: "Build",
      description: "",
      stage: "IN_PROGRESS",
      features: [
        { title: "Order form", description: "Shops place orders", priority: "CRITICAL", estimateHours: 20, tasks: [{ title: "Build the order form", priority: "HIGH", estimateHours: 8 }, { title: "Validate quantities", priority: "MEDIUM", estimateHours: -2 }] },
        { title: "Daily list", description: "", priority: "MEDIUM", estimateHours: 0, tasks: [{ title: "List tomorrow's orders", priority: "WHATEVER", estimateHours: 4 }] },
      ],
    },
  ],
  questions: ["Do shops pay online in phase one?"],
  assumptions: ["Prices come from the farm's price list"],
  ...over,
});

let owner: number, student: number, plain: number;
const created: number[] = [];

beforeAll(async () => {
  setAiPolicyForTests(AI_POLICY_ALL_ON);
  server = await new Promise<http.Server>((resolve) => {
    const srv = http.createServer(app).listen(0, "127.0.0.1", () => resolve(srv));
  });
  owner = await createUser({ userType: "STAFF" });
  student = await createUser({ userType: "STUDENT" });
  plain = await createUser({ userType: "TEACHER" });
  perms.set(owner, ["SIDE_PROJECTS_MANAGE_OWN", "SIDE_PROJECTS_AI_SETUP"]);
  // A student account that somehow holds the permission is still refused.
  perms.set(student, ["SIDE_PROJECTS_MANAGE_OWN", "SIDE_PROJECTS_AI_SETUP"]);
  perms.set(plain, ["SIDE_PROJECTS_MANAGE_OWN"]);
});

beforeEach(() => {
  calls.length = 0;
  answer = AI_ANSWER();
  resetLimiterState();
  resetSessions();
  setTestProviders({ glm: fake("glm"), groq: fake("groq") });
});
afterEach(() => setTestProviders(null));

afterAll(async () => {
  setAiPolicyForTests(null);
  await new Promise((resolve) => server.close(resolve));
  const ul = sql.join([owner, student, plain].map((i) => sql`${i}`), sql`, `);
  const ids = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id IN (${ul})`)).map((r) => Number(r.id));
  if (ids.length) {
    const pl = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    await db.execute(sql`DELETE e FROM SideProjectTaskEvent e JOIN SideProjectTask t ON t.task_id = e.task_id WHERE t.project_id IN (${pl})`);
    for (const t of ["SideProjectTask", "SideProjectPlanItem", "SideProjectDocument", "SideProjectMedia", "SideProjectStageLog", "SideProjectStagePlan", "SideProjectEvent"]) {
      await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE project_id IN (${pl})`).catch(() => undefined);
    }
    await db.execute(sql`DELETE FROM SideProject WHERE project_id IN (${pl})`);
  }
  await db.execute(sql`DELETE FROM FileAsset WHERE owner_user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM ActivityLog WHERE user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${ul})`).catch(() => undefined);
});

async function session(who = owner) {
  const r = await api().post("/side-projects/ai-setup/sessions").set(as(who));
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.id as string;
}
const upload = (sid: string, buf: Buffer, name: string, who = owner) => api().post(`/side-projects/ai-setup/sessions/${sid}/files`).set(as(who)).attach("file", buf, name);

describe("permission (migration 140)", () => {
  it("is declared, kept out of the student preset and seeded by the migration", () => {
    const caps = MIS_MANIFEST.capabilities as Record<string, any>;
    expect(caps.SIDE_PROJECTS_AI_SETUP).toBeTruthy();
    expect(/ADMIN|TEACHER|STUDENT|SUPER|INSTRUCTOR|PARENT|STAFF/.test("SIDE_PROJECTS_AI_SETUP")).toBe(false);
    const has = (key: string) => (PRESETS as any[]).find((p) => p.key === key)?.caps.some((c: any) => (Array.isArray(c) ? c[0] : c) === "SIDE_PROJECTS_AI_SETUP");
    expect(has("student")).toBe(false);
    expect(has("teaching_staff")).toBe(true);
    expect(has("support_staff")).toBe(true);
    expect(has("parent")).toBe(true);
    const mig = fs.readFileSync(path.join(__dirname, "../../migrations/140_side_projects_ai_setup.sql"), "utf8");
    expect(mig).toMatch(/r\.`name` <> 'STUDENT'/);
    expect(mig).toMatch(/`preset_key` <> 'student'/);
  });

  it("is refused to students (even holding the permission) and to accounts without it", async () => {
    for (const who of [student, plain]) {
      const r = await api().post("/side-projects/ai-setup/sessions").set(as(who));
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("NOT_ALLOWED");
    }
    const me = async (who: number) => (await api().get("/side-projects/me").set(as(who))).body.data.aiSetup;
    expect(await me(owner)).toBe(true);
    expect(await me(student)).toBe(false);
    expect(await me(plain)).toBe(false);
  });

  it("a session belongs to the person who started it", async () => {
    const sid = await session();
    perms.set(plain, ["SIDE_PROJECTS_MANAGE_OWN", "SIDE_PROJECTS_AI_SETUP"]);
    try {
      const r = await api().get(`/side-projects/ai-setup/sessions/${sid}`).set(as(plain));
      expect(r.status).toBe(404);
      expect(r.body.code).toBe("SESSION_GONE");
    } finally {
      perms.set(plain, ["SIDE_PROJECTS_MANAGE_OWN"]);
    }
  });
});

describe("reading documents", () => {
  it("reads PDFs and Markdown, sends images to the gallery, refuses blocked files", async () => {
    const sid = await session();
    const a = await upload(sid, buildPdf("Proposal: Farm Orders Portal for Kigali Green Farms. Shops order produce online."), "proposal.pdf");
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.data).toMatchObject({ name: "proposal.pdf", status: "READ" });
    expect(a.body.data.chars).toBeGreaterThan(40);
    expect(a.body.data.text).toBeUndefined();
    const b = await upload(sid, Buffer.from("# Requirements\n\n- Shops place orders\n- The farm sees tomorrow's orders\n- Delivery status updates"), "srs.md");
    expect(b.body.data.status).toBe("READ");
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 10, g: 90, b: 200 } } }).png().toBuffer();
    const c = await upload(sid, png, "mockup.png");
    expect(c.body.data).toMatchObject({ status: "NO_TEXT", kind: "image" });
    const d = await upload(sid, Buffer.from("MZ\x90\x00binary"), "tool.exe");
    expect(d.body.data.status).toBe("REFUSED");
    const view = await api().get(`/side-projects/ai-setup/sessions/${sid}`).set(as(owner));
    expect(view.body.data.files.map((f: any) => f.status)).toEqual(["READ", "READ", "NO_TEXT", "REFUSED"]);
    const del = await api().delete(`/side-projects/ai-setup/sessions/${sid}/files/${d.body.data.id}`).set(as(owner));
    expect(del.status).toBe(200);
    expect((await api().get(`/side-projects/ai-setup/sessions/${sid}`).set(as(owner))).body.data.files).toHaveLength(3);
  });

  it("shares the text budget fairly: a long SRS can't crowd out the short brief", () => {
    const f = (id: string, text: string): SetupFile => ({ id, name: `${id}.md`, size: text.length, kind: "markdown", pages: null, chars: text.length, status: "READ", note: null, text });
    const out = documentsBlock([f("brief", "SHORT BRIEF ".repeat(10)), f("srs", "x".repeat(50_000))], 2_000);
    expect(out).toContain("SHORT BRIEF SHORT BRIEF");
    expect(out).toContain("[…cut to fit…]");
    expect(out.length).toBeLessThan(2_400);
  });
});

describe("drafting", () => {
  it("needs a document with text or an extra prompt", async () => {
    const sid = await session();
    const r = await api().post(`/side-projects/ai-setup/sessions/${sid}/draft`).set(as(owner)).send({ prompt: "", provider: "auto" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("NOTHING_TO_READ");
    expect(calls).toHaveLength(0);
  });

  it("AUTO drafts the whole project, normalised for the wizard", async () => {
    const sid = await session();
    await upload(sid, buildPdf("Proposal: Farm Orders Portal for Kigali Green Farms."), "proposal.pdf");
    await upload(sid, Buffer.from("# SRS\nShops place orders. The farm sees the daily list."), "srs.md");
    await upload(sid, Buffer.from("# Notes\nMeeting notes about payments."), "notes.md");
    const r = await api().post(`/side-projects/ai-setup/sessions/${sid}/draft`).set(as(owner)).send({ prompt: "Plan it for about 11 weeks.", provider: "auto" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const { draft, provider, issues, turns } = r.body.data;
    // AUTO = the draft role order, first configured provider answers.
    expect(provider.name).toBe("glm");
    expect(calls[0].prompt).toContain("Plan it for about 11 weeks.");
    expect(calls[0].prompt).toContain("Document 1: proposal.pdf");
    expect(calls[0].prompt).toContain("Shops place orders");
    expect(draft.title).toBe("Farm Orders Portal");
    expect(draft.techTags).toEqual(["React", "Node.js", "MySQL"]);
    expect(draft.githubUrl).toBe("https://github.com/patrick/farm-orders");
    expect(draft.accessUrl).toBe("");
    expect(draft.stageEnds).toEqual({ IDEA: day(10), PLANNING: day(25), IN_PROGRESS: day(65) });
    expect(draft.startIn).toBe("PLANNING");
    expect(draft.documents.map((d: any) => d.slot)).toEqual(["CONCEPT", "SRS", "GALLERY"]);
    // Bad hours dropped, unknown priority → MEDIUM, too-short task removed.
    expect(draft.phases[0].features[0].tasks.map((t: any) => t.title)).toEqual(["Run the workshop"]);
    expect(draft.phases[0].features[0].priority).toBe("HIGH");
    expect(draft.phases[1].features[0].tasks[1].estimateHours).toBeNull();
    expect(draft.phases[1].features[1].tasks[0].priority).toBe("MEDIUM");
    expect(issues).toEqual([]);
    expect(turns.at(-1)).toMatchObject({ role: "ai" });
  });

  it("a chosen provider goes first and the others still back it up", async () => {
    setTestProviders({ glm: fake("glm"), groq: fake("groq", { fail: true }) });
    const sid = await session();
    await upload(sid, Buffer.from("# Brief\nA farm ordering portal for shops in Kigali."), "brief.md");
    const r = await api().post(`/side-projects/ai-setup/sessions/${sid}/draft`).set(as(owner)).send({ provider: "groq" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(calls.map((c) => c.provider)).toEqual(["groq", "glm"]);
    expect(r.body.data.provider.name).toBe("glm");
    const bad = await api().post(`/side-projects/ai-setup/sessions/${sid}/draft`).set(as(owner)).send({ provider: "nope" });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("provider");
  });

  it("lists the configured providers for the picker", async () => {
    const r = await api().get("/side-projects/ai-setup/providers").set(as(owner));
    expect(r.body.data.auto).toBe(true);
    expect(r.body.data.list.map((p: any) => p.name).sort()).toEqual(["glm", "groq"]);
  });

  it("refines in conversation, starting from the owner's own plan edits", async () => {
    const sid = await session();
    await upload(sid, Buffer.from("# Brief\nA farm ordering portal for shops in Kigali."), "brief.md");
    await api().post(`/side-projects/ai-setup/sessions/${sid}/draft`).set(as(owner)).send({ provider: "auto" });
    answer = (params: any) => {
      expect(params.prompt).toContain("Make it two months");
      expect(params.prompt).toContain("My renamed phase");
      return AI_ANSWER({ reply: "Done: two months now.", targetDate: day(60), buildingEnd: "", phases: [{ title: "My renamed phase", description: "", stage: "PLANNING", features: [] }] });
    };
    const r = await api()
      .post(`/side-projects/ai-setup/sessions/${sid}/refine`)
      .set(as(owner))
      .send({ message: "Make it two months", provider: "auto", phases: [{ title: "My renamed phase", stage: "PLANNING", features: [] }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.reply).toBe("Done: two months now.");
    expect(r.body.data.draft.targetDate).toBe(day(60));
    expect(r.body.data.draft.stageEnds).toBeNull();
    expect(r.body.data.turns.map((t: any) => t.role)).toEqual(["ai", "user", "ai"]);
  });

  it("reports what still needs the owner when the AI comes back thin", () => {
    const d = normalise({ title: "X", abstract: "short", problemStatement: "", startDate: "soon", targetDate: "2000-01-01", documents: [] }, [], []);
    expect(d.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.targetDate > d.startDate).toBe(true);
    expect(d.phases).toEqual([]);
  });
});

describe("applying the plan", () => {
  it("creates phases, features and tasks once, for the owner only", async () => {
    const r = await api()
      .post("/side-projects")
      .set(as(owner))
      .field("title", `AI farm portal ${Date.now()}`)
      .field("problemStatement", "Shops order by phone, so orders get lost and the farm can't plan.")
      .field("abstract", "A web portal where shops order fresh produce from the farm and follow their deliveries.")
      .field("startDate", START)
      .field("targetDate", TARGET)
      .attach("concept", buildPdf("Concept note"), "concept.pdf");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const id = r.body.data.id as number;
    created.push(id);
    const plan = parsePlan(AI_ANSWER().phases);
    const ok = await api().post(`/side-projects/${id}/ai-plan`).set(as(owner)).send({ phases: plan });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toEqual({ phases: 2, items: 5, tasks: 4 });
    const items = rows(await db.execute(sql`SELECT kind, title, parent_id FROM SideProjectPlanItem WHERE project_id = ${id} ORDER BY item_id`));
    expect(items.map((i) => i.kind)).toEqual(["PHASE", "FEATURE", "PHASE", "FEATURE", "FEATURE"]);
    const tasks = rows(await db.execute(sql`SELECT title, assignee_user_id FROM SideProjectTask WHERE project_id = ${id}`));
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => Number(t.assignee_user_id) === owner)).toBe(true);
    const again = await api().post(`/side-projects/${id}/ai-plan`).set(as(owner)).send({ phases: plan });
    expect(again.status).toBe(409);
    const stranger = await api().post(`/side-projects/${id}/ai-plan`).set(as(student)).send({ phases: plan });
    expect(stranger.status).toBe(403);
  });
});
