// Student side projects (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md): lifecycle rules, the
// student API (create with concept, board moves, files, progress, teams), the monitor
// (scope, summary-only, supervisor), review, import, sweep — against the test database
// (migration 128) with the in-memory file-server.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import http from "http";
import request from "supertest";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import { installFakeFileServer } from "../test/fakeFileServer";

installFakeFileServer();

import { db } from "../db";
import { createAcademicPeriod, createProgramGradeClassGroupDetailed, createStudentClassGroup, createUser } from "../test/fixtures";
import { buildPdf } from "../test/pdfFixture";
import { sideProjectsRouter } from "../routes/sideProjects";
import type { Viewer } from "../services/sideProjects/access";
import { healthOf, progressOf, transition } from "../services/sideProjects/lifecycle";
import { rollupStatus } from "../services/sideProjects/work";
import { backdateActivity, sweepSideProjects } from "../services/sideProjects/sweep";
import { GITHUB_RE } from "../services/sideProjects/validate";
import { MIS_MANIFEST } from "../access/manifest";
import { isV2OnlyCapability } from "../access/v2Only";
import { featureOfCapability } from "../services/tenantMgmt/catalog";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

const viewers = new Map<number, Partial<Viewer>>();
const owners = new Set<number>();
const assignedOk = new Set<number>();
const classifiers = new Set<number>();
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const ABSTRACT = "A low-cost sensor kit and web dashboard that shows soil moisture so gardens are watered only when needed.";
// Every create sends an abstract (required since migration 136); spread with the dates.
const DATES = { startDate: day(0), targetDate: day(60), abstract: ABSTRACT };

const app = express();
app.use(express.json());
app.use(
  "/side-projects",
  sideProjectsRouter(
    (req: any, res, next) => {
      const id = Number(req.get("X-Test-User"));
      if (!id) return res.status(401).end();
      req.user = { userId: id, permissions: [...(owners.has(id) ? ["SIDE_PROJECTS_MANAGE_OWN"] : []), ...(classifiers.has(id) ? ["SIDE_PROJECTS_CLASSIFY"] : [])] };
      next();
    },
    (req: any, res, next) => (owners.has(Number(req.user.userId)) ? next() : res.status(403).json({ message: "Forbidden" })),
    async (req: any) => ({ userId: Number(req.user.userId), summary: null, detail: null, review: null, manageAny: false, ...(viewers.get(Number(req.user.userId)) ?? {}) }),
    (req: any, res, next) => (assignedOk.has(Number(req.user.userId)) ? next() : res.status(403).json({ message: "Forbidden" })),
  ),
);
const as = (id: number) => ({ "X-Test-User": String(id) });

// One server for the whole file, bound to 127.0.0.1. api() would open a fresh server on
// every call listening on all interfaces with a random port; another local process holding the
// same port number on IPv4 then answers instead (phantom 401/404s seen on a busy dev machine).
let server: http.Server;
const api = () => request(server);

let yearId: number, prevCurrent: number[];
let classA: number, classB: number, gradeA: number, programA: number;
let alice: number, bob: number, carol: number, teacherA: number, lead: number, insights: number, supervisor: number, outsider: number;
const created: number[] = [];

const pdf = () => buildPdf("Concept: a smart irrigation controller for school gardens.");
const PROBLEM = "School gardens waste water because nobody can see the soil moisture in real time.";

async function png(): Promise<Buffer> {
  // A unique colour per run: derivatives are cached by content hash in the (persistent) test
  // database, while the fake file-server's store lives only as long as this process.
  const c = () => Math.floor(Math.random() * 256);
  return sharp({ create: { width: 800, height: 500, channels: 3, background: { r: c(), g: c(), b: c() } } }).png().toBuffer();
}

async function createProject(owner: number, title: string, extra: Record<string, string> = {}) {
  const r = await api()
    .post("/side-projects")
    .set(as(owner))
    .field("title", title)
    .field("problemStatement", PROBLEM)
    .field("startDate", DATES.startDate)
    .field("targetDate", DATES.targetDate)
    .field("abstract", ABSTRACT)
    .field("techTags", JSON.stringify(["Arduino", "C++"]))
    .field("categoryId", String((rows(await db.execute(sql`SELECT category_id FROM SideProjectCategory WHERE slug = 'iot'`)))[0].category_id))
    .field(extra)
    .attach("concept", pdf(), "concept.pdf");
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  created.push(r.body.data.id);
  return r.body.data.id as number;
}

beforeAll(async () => {
  server = await new Promise<http.Server>((resolve) => {
    const srv = http.createServer(app).listen(0, "127.0.0.1", () => resolve(srv));
  });
  prevCurrent = rows(await db.execute(sql`SELECT academic_year_id AS id FROM AcademicYear WHERE is_current = 1`)).map((r) => Number(r.id));
  ({ academicYearId: yearId } = await createAcademicPeriod());
  await db.execute(sql`UPDATE AcademicYear SET is_current = IF(academic_year_id = ${yearId}, 1, 0)`);
  const a = await createProgramGradeClassGroupDetailed();
  classA = a.classGroupId;
  gradeA = a.gradeId;
  programA = a.programId;
  classB = (await createProgramGradeClassGroupDetailed()).classGroupId;
  alice = await createUser({ userType: "STUDENT" });
  bob = await createUser({ userType: "STUDENT" });
  carol = await createUser({ userType: "STUDENT" });
  teacherA = await createUser({ userType: "TEACHER" });
  lead = await createUser({ userType: "ADMIN" });
  insights = await createUser({ userType: "STAFF" });
  supervisor = await createUser({ userType: "TEACHER" });
  outsider = await createUser({ userType: "TEACHER" });
  for (const [u, reg] of [[alice, `SPA${alice}`], [bob, `SPB${bob}`], [carol, `SPC${carol}`]] as const) {
    await db.execute(sql`UPDATE UserProfile SET registration_number = ${reg} WHERE user_id = ${u}`);
    owners.add(u);
  }
  await createStudentClassGroup({ userId: alice, classGroupId: classA, academicYearId: yearId });
  await createStudentClassGroup({ userId: bob, classGroupId: classA, academicYearId: yearId });
  await createStudentClassGroup({ userId: carol, classGroupId: classB, academicYearId: yearId });
  viewers.set(teacherA, { detail: { class_groups: [classA] }, summary: { class_groups: [classA] }, review: { class_groups: [classA] } });
  viewers.set(lead, { detail: { all: true }, summary: { all: true }, review: { all: true }, manageAny: true });
  viewers.set(insights, { summary: { all: true } });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  const users = [alice, bob, carol, teacherA, lead, insights, supervisor, outsider];
  const ul = sql.join(users.map((i) => sql`${i}`), sql`, `);
  const ids = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id IN (${ul})`)).map((r) => Number(r.id));
  if (ids.length) {
    const pl = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    const tl = rows(await db.execute(sql`SELECT task_id AS id FROM SideProjectTask WHERE project_id IN (${pl})`)).map((r) => Number(r.id));
    if (tl.length) {
      const tj = sql.join(tl.map((i) => sql`${i}`), sql`, `);
      await db.execute(sql`DELETE FROM SideProjectTaskLog WHERE task_id IN (${tj})`);
      await db.execute(sql`DELETE FROM SideProjectTaskEvent WHERE task_id IN (${tj})`);
    }
    for (const t of ["SideProjectTask", "SideProjectPlanItem", "SideProjectDocument", "SideProjectMedia", "SideProjectLink", "SideProjectMilestone", "SideProjectUpdate", "SideProjectEvent", "SideProjectComment", "SideProjectMember"]) {
      await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE project_id IN (${pl})`);
    }
    await db.execute(sql`DELETE FROM SideProject WHERE project_id IN (${pl})`);
  }
  await db.execute(sql`DELETE FROM SideProjectCustomer WHERE created_by IN (${ul})`);
  await db.execute(sql`DELETE FROM FileAsset WHERE owner_user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM ActivityLog WHERE user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM StudentClassGroup WHERE user_id IN (${ul})`);
  await db.execute(sql`UPDATE AcademicYear SET is_current = 0 WHERE academic_year_id = ${yearId}`);
  if (prevCurrent.length) await db.execute(sql`UPDATE AcademicYear SET is_current = 1 WHERE academic_year_id IN (${sql.join(prevCurrent.map((i) => sql`${i}`), sql`, `)})`);
});

describe("permissions and seeding", () => {
  it("declares the four capabilities, v2-only except MANAGE_OWN, behind the feature key", () => {
    const caps = MIS_MANIFEST.capabilities as Record<string, any>;
    for (const c of ["SIDE_PROJECTS_MANAGE_OWN", "SIDE_PROJECTS_VIEW", "SIDE_PROJECTS_REVIEW", "SIDE_PROJECTS_MANAGE_ANY"]) {
      expect(caps[c], c).toBeTruthy();
      expect(featureOfCapability("mis", c)).toBe("feature.student_projects");
      // No spoke-app role keyword in the name.
      expect(/ADMIN|TEACHER|STUDENT|SUPER|INSTRUCTOR|PARENT|STAFF/.test(c)).toBe(false);
    }
    expect(caps.SIDE_PROJECTS_VIEW.depths).toEqual(["summary", "detail"]);
    expect(caps.SIDE_PROJECTS_MANAGE_ANY.restricted).toBe(true);
    expect(isV2OnlyCapability("SIDE_PROJECTS_MANAGE_OWN")).toBe(false);
    expect(isV2OnlyCapability("SIDE_PROJECTS_VIEW")).toBe(true);
    expect(isV2OnlyCapability("SIDE_PROJECTS_REVIEW")).toBe(true);
    expect(isV2OnlyCapability("SIDE_PROJECTS_MANAGE_ANY")).toBe(true);
  });

  it("migration 128 seeded the permissions, the student and super-admin grants and the categories", async () => {
    const perms = rows(await db.execute(sql`SELECT name, depths, scopeable, restricted FROM Permission WHERE name LIKE 'SIDE_PROJECTS_%' ORDER BY name`));
    expect(perms.map((p) => p.name)).toEqual(["SIDE_PROJECTS_ASSIGNED", "SIDE_PROJECTS_CLASSIFY", "SIDE_PROJECTS_MANAGE_ANY", "SIDE_PROJECTS_MANAGE_OWN", "SIDE_PROJECTS_REVIEW", "SIDE_PROJECTS_VIEW"]);
    const grants = rows(await db.execute(sql`
      SELECT r.name AS role, p.name AS perm FROM RolePermission rp JOIN Role r ON r.role_id = rp.role_id JOIN Permission p ON p.perm_id = rp.perm_id
      WHERE p.name LIKE 'SIDE_PROJECTS_%' AND r.name IN ('STUDENT', 'SUPER_ADMIN')`));
    const has = (role: string, perm: string) => grants.some((g) => g.role === role && g.perm === perm);
    if (grants.some((g) => g.role === "STUDENT")) expect(has("STUDENT", "SIDE_PROJECTS_MANAGE_OWN")).toBe(true);
    if (grants.some((g) => g.role === "SUPER_ADMIN")) expect(has("SUPER_ADMIN", "SIDE_PROJECTS_MANAGE_ANY")).toBe(true);
    const links = rows(await db.execute(sql`SELECT preset_key, perm_name FROM AccessPresetLink WHERE perm_name LIKE 'SIDE_PROJECTS_%'`));
    expect(links.some((l) => l.preset_key === "side_projects_lead" && l.perm_name === "SIDE_PROJECTS_MANAGE_ANY")).toBe(true);
    expect(links.some((l) => l.preset_key === "student" && l.perm_name === "SIDE_PROJECTS_MANAGE_OWN")).toBe(true);
    const cats = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM SideProjectCategory`));
    expect(Number(cats[0].n)).toBeGreaterThanOrEqual(9);
    const sqlText = fs.readFileSync(path.join(__dirname, "../../migrations/128_student_projects.sql"), "utf8");
    expect(sqlText).toMatch(/access_version/);
  });
});

describe("lifecycle rules", () => {
  const base = { status: "IDEA" as const, review_state: "NONE" as const, archived: false, hasConcept: true };
  it("moves one step at a time and never skips to completed", () => {
    expect(transition(base, { to: "IN_PROGRESS" })).toMatchObject({ ok: true, status: "IN_PROGRESS", setStarted: true });
    expect(transition(base, { to: "COMPLETED", outcomeSummary: "x".repeat(30) })).toMatchObject({ ok: false, code: "SKIP_NOT_ALLOWED" });
    expect(transition({ ...base, hasConcept: false }, { to: "IN_PROGRESS" })).toMatchObject({ ok: false, code: "CONCEPT_REQUIRED" });
    expect(transition({ ...base, archived: true }, { to: "IN_PROGRESS" })).toMatchObject({ ok: false, code: "ARCHIVED" });
    expect(transition(base, { to: "IDEA" })).toMatchObject({ ok: false, code: "SAME_STATUS" });
  });
  it("completing needs an outcome and asks for verification; reopening needs a reason", () => {
    const ip = { ...base, status: "IN_PROGRESS" as const };
    expect(transition(ip, { to: "COMPLETED", outcomeSummary: "short" })).toMatchObject({ ok: false, code: "OUTCOME_REQUIRED", field: "outcomeSummary" });
    expect(transition(ip, { to: "COMPLETED", outcomeSummary: "It waters the garden on its own now." })).toMatchObject({ ok: true, review_state: "AWAITING_VERIFICATION", setCompleted: true });
    const done = { ...base, status: "COMPLETED" as const, review_state: "VERIFIED" as const };
    expect(transition(done, { to: "IN_PROGRESS" })).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(transition(done, { to: "IN_PROGRESS", reason: "Adding a mobile app" })).toMatchObject({ ok: true, review_state: "NONE", clearCompleted: true });
  });
  it("a staff correction may skip steps but always needs a reason", () => {
    expect(transition(base, { to: "COMPLETED", correction: true })).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    expect(transition(base, { to: "COMPLETED", correction: true, reason: "Finished last year" })).toMatchObject({ ok: true });
  });
  it("computes progress and health", () => {
    expect(progressOf({ status: "IN_PROGRESS", progress_mode: "AUTO", progress_manual: null }, { total: 4, done: 1 })).toBe(25);
    expect(progressOf({ status: "IN_PROGRESS", progress_mode: "MANUAL", progress_manual: 70 }, { total: 4, done: 1 })).toBe(70);
    expect(progressOf({ status: "COMPLETED", progress_mode: "AUTO", progress_manual: null }, { total: 4, done: 1 })).toBe(100);
    expect(progressOf({ status: "IDEA", progress_mode: "MANUAL", progress_manual: 90 }, { total: 0, done: 0 })).toBe(20);
    expect(progressOf({ status: "IDEA", progress_mode: "AUTO", progress_manual: null }, { total: 2, done: 2 })).toBe(20);
    const now = new Date("2026-11-18T10:00:00Z");
    const ip = { status: "IN_PROGRESS" as const, last_activity_at: "2026-11-17T10:00:00Z", target_date: null };
    expect(healthOf(ip, { overdueMilestones: 0, lastUpdateBlocked: false }, now, 21)).toBe("ON_TRACK");
    expect(healthOf({ ...ip, last_activity_at: "2026-10-01T10:00:00Z" }, { overdueMilestones: 0, lastUpdateBlocked: false }, now, 21)).toBe("STALE");
    expect(healthOf({ ...ip, target_date: "2026-11-01" }, { overdueMilestones: 0, lastUpdateBlocked: false }, now, 21)).toBe("OVERDUE");
    expect(healthOf(ip, { overdueMilestones: 0, lastUpdateBlocked: true }, now, 21)).toBe("BLOCKED");
  });
  it("accepts only GitHub repository links", () => {
    expect(GITHUB_RE.test("https://github.com/nga/irrigation")).toBe(true);
    expect(GITHUB_RE.test("https://github.com/nga")).toBe(false);
    expect(GITHUB_RE.test("http://github.com/nga/x")).toBe(false);
    expect(GITHUB_RE.test("https://gitlab.com/nga/x")).toBe(false);
  });
});

describe("student projects", () => {
  let p1: number;

  it("refuses a project without a concept note, and without a real problem statement", async () => {
    const noConcept = await api().post("/side-projects").set(as(alice)).send({ title: "No concept", problemStatement: PROBLEM, ...DATES });
    expect(noConcept.status).toBe(400);
    expect(noConcept.body).toMatchObject({ code: "CONCEPT_REQUIRED", field: "concept" });
    const shortProblem = await api().post("/side-projects").set(as(alice)).field("title", "Short").field("problemStatement", "too short").field(DATES).attach("concept", pdf(), "c.pdf");
    expect(shortProblem.status).toBe(400);
    expect(shortProblem.body.field).toBe("problemStatement");
    const badFile = await api().post("/side-projects").set(as(alice)).field("title", "Bad file").field("problemStatement", PROBLEM).field(DATES).attach("concept", Buffer.from("MZ..."), "setup.exe");
    expect(badFile.status).toBe(400);
    expect(badFile.body.code).toBe("FILE_REFUSED");
    const badGit = await api().post("/side-projects").set(as(alice)).field("title", "Bad git").field("problemStatement", PROBLEM).field(DATES).field("githubUrl", "https://example.com/x").attach("concept", pdf(), "c.pdf");
    expect(badGit.body.field).toBe("githubUrl");
  });

  it("creates with the concept, stamps reg number, year and class, and shows it on the board", async () => {
    p1 = await createProject(alice, "Smart irrigation", { githubUrl: "github.com/nga/irrigation.git/" });
    const r = await api().get(`/side-projects/${p1}`).set(as(alice));
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ title: "Smart irrigation", status: "IDEA", githubUrl: "https://github.com/nga/irrigation", conceptPending: false });
    expect(d.owner.regNumber).toBe(`SPA${alice}`);
    expect(d.academicYear.id).toBe(yearId);
    expect(d.class.id).toBe(classA);
    expect(d.documents.CONCEPT.current).toMatchObject({ version: 1, ext: "pdf" });
    expect(d.techTags).toEqual(["Arduino", "C++"]);
    const board = await api().get("/side-projects/mine").set(as(alice));
    expect(board.body.data.map((c: any) => c.id)).toContain(p1);
    const dup = await api().post("/side-projects").set(as(alice)).field("title", "smart  IRRIGATION").field("problemStatement", PROBLEM).field(DATES).attach("concept", pdf(), "c.pdf");
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_TITLE");
  });

  it("accepts a written concept instead of a file", async () => {
    const r = await api()
      .post("/side-projects")
      .set(as(alice))
      .send({ title: "Library finder", problemStatement: PROBLEM, ...DATES, conceptWritten: { users: "Students looking for books", solution: "A web app that indexes the school library shelves by QR code.", impact: "Books found in seconds" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    created.push(r.body.data.id);
    const d = (await api().get(`/side-projects/${r.body.data.id}`).set(as(alice))).body.data;
    expect(d.documents.CONCEPT.current).toMatchObject({ source: "WRITTEN", ext: "md" });
  });

  it("hides a project from other students (404) and refuses edits from them", async () => {
    expect((await api().get(`/side-projects/${p1}`).set(as(bob))).status).toBe(404);
    expect((await api().patch(`/side-projects/${p1}`).set(as(bob)).send({ title: "Mine now" })).status).toBe(404);
    expect((await api().get(`/side-projects/${p1}`).set(as(teacherA))).status).toBe(403); // not a student route user
  });

  it("moves through the board with the lifecycle rules", async () => {
    const skip = await api().post(`/side-projects/${p1}/transition`).set(as(alice)).send({ to: "COMPLETED", outcomeSummary: "x".repeat(40) });
    expect(skip.status).toBe(409);
    expect(skip.body.code).toBe("SKIP_NOT_ALLOWED");
    const go = await api().post(`/side-projects/${p1}/transition`).set(as(alice)).send({ to: "IN_PROGRESS", position: 0 });
    expect(go.status).toBe(200);
    expect(go.body.data).toMatchObject({ from: "IDEA", to: "IN_PROGRESS" });
    const order = await api().patch("/side-projects/board/order").set(as(alice)).send({ status: "IN_PROGRESS", ids: [p1] });
    expect(order.status).toBe(200);
    const d = (await api().get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.status).toBe("IN_PROGRESS");
    expect(d.startedAt).toBeTruthy();
    expect(d.events.some((e: any) => e.type === "STATUS" && e.toValue === "IN_PROGRESS")).toBe(true);
  });

  it("versions documents, keeps the concept mandatory, refuses wrong kinds", async () => {
    const srs = await api().post(`/side-projects/${p1}/documents/srs`).set(as(alice)).attach("file", pdf(), "srs.pdf");
    expect(srs.status, JSON.stringify(srs.body)).toBe(200);
    const v2 = await api().post(`/side-projects/${p1}/documents/concept`).set(as(alice)).attach("file", pdf(), "concept-v2.pdf");
    expect(v2.body.data.version).toBe(2);
    const img = await api().post(`/side-projects/${p1}/documents/srs`).set(as(alice)).attach("file", await png(), "srs.png");
    expect(img.status).toBe(400);
    const d = (await api().get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.documents.CONCEPT.versions).toHaveLength(2);
    expect(d.documents.CONCEPT.current.name).toBe("concept-v2.pdf");
    expect(d.documents.SRS.current).toBeTruthy();
  });

  it("uploads gallery files with a thumbnail and a cover, serves them only to viewers", async () => {
    const up = await api().post(`/side-projects/${p1}/media`).set(as(alice)).attach("files", await png(), "screen.png").attach("files", pdf(), "poster.pdf");
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    const d = (await api().get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.media).toHaveLength(2);
    const image = d.media.find((m: any) => m.kind === "image");
    expect(image.hasThumb).toBe(true);
    expect(d.coverAssetId).toBe(image.assetId);
    const thumb = await api().get(`/side-projects/files/${image.assetId}?variant=thumb`).set(as(alice));
    expect(thumb.status).toBe(200);
    expect(thumb.headers["content-type"]).toBe("image/png");
    expect((await api().get(`/side-projects/files/${image.assetId}`).set(as(bob))).status).toBe(404);
    expect((await api().get(`/side-projects/files/${image.assetId}`).set(as(teacherA))).status).toBe(200); // class teacher of A
    expect((await api().get(`/side-projects/files/${image.assetId}`).set(as(outsider))).status).toBe(404);
    const caption = await api().patch(`/side-projects/${p1}/media/${image.id}`).set(as(alice)).send({ caption: "Dashboard" });
    expect(caption.status).toBe(200);
    const exe = await api().post(`/side-projects/${p1}/media`).set(as(alice)).attach("files", Buffer.from("x"), "virus.bat");
    expect(exe.status).toBe(400);
  });

  it("tracks progress with milestones and updates", async () => {
    const m1 = (await api().post(`/side-projects/${p1}/milestones`).set(as(alice)).send({ title: "Sensor wiring" })).body.data.id;
    await api().post(`/side-projects/${p1}/milestones`).set(as(alice)).send({ title: "Dashboard", dueDate: "2026-12-20" });
    await api().patch(`/side-projects/${p1}/milestones/${m1}`).set(as(alice)).send({ done: true });
    const bad = await api().post(`/side-projects/${p1}/updates`).set(as(alice)).send({ did: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("did");
    const u = await api().post(`/side-projects/${p1}/updates`).set(as(alice)).send({ did: "Wired the moisture sensor", nextSteps: "Build the dashboard", mood: 4 });
    expect(u.status).toBe(200);
    const d = (await api().get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.progress).toBe(50);
    expect(d.updates[0].did).toBe("Wired the moisture sensor");
    expect(d.milestones[0].done).toBe(true);
  });

  it("invites a teammate who can edit after accepting, but not delete", async () => {
    const inv = await api().post(`/side-projects/${p1}/members`).set(as(alice)).send({ regNumber: `SPB${bob}` });
    expect(inv.status).toBe(200);
    expect((await api().post(`/side-projects/${p1}/members`).set(as(alice)).send({ regNumber: "NOPE" })).body.code).toBe("PERSON_NOT_FOUND");
    const invited = (await api().get("/side-projects/mine").set(as(bob))).body.data.find((c: any) => c.id === p1);
    expect(invited.myRole).toBe("INVITED");
    expect((await api().patch(`/side-projects/${p1}`).set(as(bob)).send({ description: "x" })).status).toBe(403);
    await api().post(`/side-projects/invitations/${p1}`).set(as(bob)).send({ accept: true });
    const edit = await api().patch(`/side-projects/${p1}`).set(as(bob)).send({ description: "Bob joined the team." });
    expect(edit.status).toBe(200);
    expect((await api().post(`/side-projects/${p1}/archive`).set(as(bob))).status).toBe(403);
  });
});

describe("monitor, review and supervision", () => {
  let p1: number, pc: number;
  beforeAll(async () => {
    p1 = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id = ${alice} AND title = 'Smart irrigation'`))[0].id;
    pc = await createProject(carol, "Robot sorter");
  });

  it("scopes the list to the viewer's classes", async () => {
    const t = await api().get("/side-projects/monitor/projects").set(as(teacherA));
    expect(t.status).toBe(200);
    const ids = t.body.data.rows.map((r: any) => r.id);
    expect(ids).toContain(p1);
    expect(ids).not.toContain(pc);
    const all = await api().get("/side-projects/monitor/projects?pageSize=200").set(as(lead));
    expect(all.body.data.rows.map((r: any) => r.id)).toEqual(expect.arrayContaining([p1, pc]));
    const row = all.body.data.rows.find((r: any) => r.id === p1);
    expect(row.student.regNumber).toBe(`SPA${alice}`);
    expect(row.class.id).toBe(classA);
    const filtered = await api().get(`/side-projects/monitor/projects?status=IN_PROGRESS&classId=${classA}&pageSize=200`).set(as(lead));
    expect(filtered.body.data.rows.every((r: any) => r.status === "IN_PROGRESS" && r.class.id === classA)).toBe(true);
    expect((await api().get(`/side-projects/monitor/projects/${pc}`).set(as(teacherA))).status).toBe(404);
    expect((await api().get("/side-projects/monitor/projects").set(as(outsider))).status).toBe(403);
  });

  it("gives summary-only viewers aggregates without names or projects", async () => {
    const s = await api().get("/side-projects/monitor/summary").set(as(insights));
    expect(s.status).toBe(200);
    expect(s.body.data.depth).toBe("summary");
    expect(s.body.data.totals.projects).toBeGreaterThanOrEqual(2);
    expect(s.body.data.attention).toEqual([]);
    expect(s.body.data.recentCompleted).toEqual([]);
    expect(s.body.data.byClass.every((c: any) => c.students >= 5 || c.name === "Other")).toBe(true);
    expect((await api().get("/side-projects/monitor/projects").set(as(insights))).status).toBe(403);
    expect((await api().get(`/side-projects/monitor/projects/${p1}`).set(as(insights))).status).toBe(404);
    const d = await api().get("/side-projects/monitor/summary").set(as(lead));
    expect(d.body.data.depth).toBe("detail");
    expect(d.body.data.months).toHaveLength(12);
    expect(d.body.data.weeks).toHaveLength(16);
    expect(d.body.data.topTech.some((t: any) => t.tag === "Arduino")).toBe(true);
  });

  it("reviews: changes requested, the student answers, completion, verification", async () => {
    const vNo = await api().post(`/side-projects/${p1}/review`).set(as(teacherA)).send({ kind: "VERIFIED" });
    expect(vNo.body.code).toBe("NOT_COMPLETED");
    const ch = await api().post(`/side-projects/${p1}/review`).set(as(teacherA)).send({ kind: "CHANGES_REQUESTED", body: "Add the SRS non-functional requirements." });
    expect(ch.status).toBe(200);
    let d = (await api().get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.reviewState).toBe("CHANGES_REQUESTED");
    const notes = rows(await db.execute(sql`SELECT kind FROM Notification WHERE user_id = ${alice} AND kind = 'side_project_changes_requested'`));
    expect(notes.length).toBe(1);
    await api().post(`/side-projects/${p1}/comments`).set(as(alice)).send({ body: "Added them, thanks!" });
    d = (await api().get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.reviewState).toBe("NONE");
    const done = await api().post(`/side-projects/${p1}/transition`).set(as(alice)).send({ to: "COMPLETED", outcomeSummary: "The garden waters itself and logs moisture every hour." });
    expect(done.body.data.reviewState).toBe("AWAITING_VERIFICATION");
    expect((await api().post(`/side-projects/${pc}/review`).set(as(teacherA)).send({ kind: "COMMENT", body: "Nice" })).status).toBe(404);
    const ver = await api().post(`/side-projects/${p1}/review`).set(as(teacherA)).send({ kind: "VERIFIED" });
    expect(ver.status).toBe(200);
    d = (await api().get(`/side-projects/monitor/projects/${p1}`).set(as(lead))).body.data;
    expect(d).toMatchObject({ status: "COMPLETED", reviewState: "VERIFIED", progress: 100 });
    expect(d.verifiedBy).toBeTruthy();
    const audit = rows(await db.execute(sql`SELECT action_type FROM ActivityLog WHERE user_id = ${lead} AND action_type = 'SIDE_PROJECT_VIEW'`));
    expect(audit.length).toBeGreaterThan(0);
  });

  it("a supervisor sees and reviews only the projects they supervise", async () => {
    expect((await api().get(`/side-projects/monitor/projects/${pc}`).set(as(supervisor))).status).toBe(404);
    const set = await api().patch(`/side-projects/${pc}`).set(as(carol)).send({ supervisorId: supervisor });
    expect(set.status).toBe(200);
    expect((await api().get(`/side-projects/monitor/projects/${pc}`).set(as(supervisor))).status).toBe(200);
    expect((await api().get(`/side-projects/monitor/projects/${p1}`).set(as(supervisor))).status).toBe(404);
    const list = await api().get("/side-projects/monitor/projects?scope=supervising").set(as(supervisor));
    expect(list.body.data.rows.map((r: any) => r.id)).toEqual([pc]);
    const me = await api().get("/side-projects/me").set(as(supervisor));
    expect(me.body.data).toMatchObject({ view: null, supervising: 1 });
    expect((await api().post(`/side-projects/${pc}/review`).set(as(supervisor)).send({ kind: "COMMENT", body: "Great start" })).status).toBe(200);
    const badSup = await api().patch(`/side-projects/${pc}`).set(as(carol)).send({ supervisorId: bob });
    expect(badSup.body.field).toBe("supervisorId");
  });

  it("exports the filtered rows and audits it", async () => {
    const csv = await api().get("/side-projects/monitor/export?format=csv").set(as(lead));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("Reg. number");
    expect(csv.text).toContain(`SPA${alice}`);
    expect((await api().get("/side-projects/monitor/export").set(as(insights))).status).toBe(403);
    const audit = rows(await db.execute(sql`SELECT 1 FROM ActivityLog WHERE user_id = ${lead} AND action_type = 'SIDE_PROJECT_EXPORT'`));
    expect(audit.length).toBe(1);
  });

  it("lets the lead correct a status with a reason, archive and delete; others can't", async () => {
    expect((await api().patch(`/side-projects/admin/projects/${pc}/status`).set(as(teacherA)).send({ to: "COMPLETED", reason: "x" })).status).toBe(403);
    const noReason = await api().patch(`/side-projects/admin/projects/${pc}/status`).set(as(lead)).send({ to: "COMPLETED" });
    expect(noReason.body.code).toBe("REASON_REQUIRED");
    const fix = await api().patch(`/side-projects/admin/projects/${pc}/status`).set(as(lead)).send({ to: "COMPLETED", reason: "Demoed at the fair" });
    expect(fix.status).toBe(200);
    const ev = rows(await db.execute(sql`SELECT type FROM SideProjectEvent WHERE project_id = ${pc} AND type = 'CORRECTION'`));
    expect(ev.length).toBe(1);
  });
});

describe("projects for everyone (not only students)", () => {
  let tp: number;
  beforeAll(() => {
    owners.add(teacherA);
    owners.add(supervisor);
  });

  it("migration 129 grants SIDE_PROJECTS_MANAGE_OWN to every role and recolours violet categories", async () => {
    // Other test files create roles after the migration ran on this shared database: apply the
    // migration's grant statement again (it is idempotent), then every role must hold the cap.
    const text = fs.readFileSync(path.join(__dirname, "../../migrations/129_side_projects_everyone.sql"), "utf8");
    const grant = text.slice(text.indexOf("INSERT INTO `RolePermission`"), text.indexOf(";", text.indexOf("INSERT INTO `RolePermission`")));
    await db.execute(sql.raw(grant));
    await db.execute(sql.raw(grant));
    const [r] = rows(await db.execute(sql`
      SELECT (SELECT COUNT(*) FROM Role) AS roles,
             (SELECT COUNT(DISTINCT rp.role_id) FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id WHERE p.name = 'SIDE_PROJECTS_MANAGE_OWN') AS holders`));
    expect(Number(r.holders)).toBe(Number(r.roles));
    const colours = rows(await db.execute(sql`SELECT color FROM SideProjectCategory WHERE color IN ('#8b5cf6', '#a855f7')`));
    expect(colours).toHaveLength(0);
  });

  it("a teacher creates and runs their own project, with no class stamped", async () => {
    tp = await createProject(teacherA, "Staff robotics kit");
    const d = (await api().get(`/side-projects/${tp}`).set(as(teacherA))).body.data;
    expect(d.owner).toMatchObject({ id: teacherA, type: "TEACHER" });
    expect(d.class).toBeNull();
    expect((await api().post(`/side-projects/${tp}/transition`).set(as(teacherA)).send({ to: "IN_PROGRESS" })).status).toBe(200);
    const board = (await api().get("/side-projects/mine").set(as(teacherA))).body.data;
    expect(board.map((c: any) => c.id)).toContain(tp);
  });

  it("invites anyone to the team: a staff member by id, a student by registration number", async () => {
    const people = await api().get("/side-projects/people?q=Test").set(as(teacherA));
    expect(people.status).toBe(200);
    expect(people.body.data.some((p: any) => p.type && p.type !== "STUDENT")).toBe(true);
    expect((await api().post(`/side-projects/${tp}/members`).set(as(teacherA)).send({ userId: supervisor })).status).toBe(200);
    expect((await api().post(`/side-projects/${tp}/members`).set(as(teacherA)).send({ regNumber: `SPC${carol}` })).status).toBe(200);
    await api().post(`/side-projects/invitations/${tp}`).set(as(supervisor)).send({ accept: true });
    expect((await api().patch(`/side-projects/${tp}`).set(as(supervisor)).send({ description: "Co-owned by staff." })).status).toBe(200);
    expect((await api().post(`/side-projects/${tp}/members`).set(as(teacherA)).send({ userId: 999999999 })).body.code).toBe("PERSON_NOT_FOUND");
  });

  it("the monitor shows the owner type, filters by it, and class scopes don't reach staff projects", async () => {
    const staff = await api().get("/side-projects/monitor/projects?ownerType=STAFF&pageSize=200").set(as(lead));
    expect(staff.body.data.rows.map((r: any) => r.id)).toContain(tp);
    expect(staff.body.data.rows.every((r: any) => r.student.type !== "STUDENT")).toBe(true);
    const studs = await api().get("/side-projects/monitor/projects?ownerType=STUDENT&pageSize=200").set(as(lead));
    expect(studs.body.data.rows.map((r: any) => r.id)).not.toContain(tp);
    const cls = await api().get("/side-projects/monitor/projects?pageSize=200").set(as(teacherA));
    expect(cls.body.data.rows.map((r: any) => r.id)).not.toContain(tp);
    const sum = (await api().get("/side-projects/monitor/summary").set(as(lead))).body.data;
    expect(sum.totals.staffProjects).toBeGreaterThanOrEqual(1);
    expect(sum.byClass.some((c: any) => c.name === "Staff & others")).toBe(true);
    const csv = await api().get("/side-projects/monitor/export?format=csv&ownerType=STAFF").set(as(lead));
    expect(csv.text).toContain("Owner type");
    expect(csv.text).toContain("Staff robotics kit");
  });

  it("imports a staff member's project by email", async () => {
    const [u] = rows(await db.execute(sql`SELECT email FROM User WHERE user_id = ${supervisor}`));
    const csv = `email,title,status\n${u.email},Teachers' lab booking,Idea\n`;
    const r = await api().post("/side-projects/admin/import?dryRun=0").set(as(lead)).attach("file", Buffer.from(csv), "list.csv");
    expect(r.body.data).toMatchObject({ valid: 1, invalid: 0 });
  });
});

describe("stages and period management", () => {
  let sp: number;
  it("requires the start and closing dates and builds a default stage plan", async () => {
    const noDates = await api().post("/side-projects").set(as(carol)).field("title", "No dates").field("problemStatement", PROBLEM).attach("concept", pdf(), "c.pdf");
    expect(noDates.status).toBe(400);
    expect(noDates.body.field).toBe("startDate");
    const tooShort = await api().post("/side-projects").set(as(carol)).field("title", "Too short").field("problemStatement", PROBLEM).field({ startDate: day(0), targetDate: day(1) }).attach("concept", pdf(), "c.pdf");
    expect(tooShort.body.field).toBe("targetDate");
    sp = await createProject(carol, "Stage tracker");
    const d = (await api().get(`/side-projects/${sp}`).set(as(carol))).body.data;
    expect(d.period.stages.map((x: any) => x.stage)).toEqual(["IDEA", "PLANNING", "IN_PROGRESS", "TESTING"]);
    expect(d.period.stages[0]).toMatchObject({ plannedStart: DATES.startDate, state: "current" });
    expect(d.period.stages[3].plannedEnd).toBe(DATES.targetDate);
    const planned = d.period.stages.map((x: any) => x.plannedDays);
    expect(planned.reduce((a: number, b: number) => a + b, 0)).toBe(61);
    expect(planned[2]).toBeGreaterThan(planned[1]);
    expect(d.stage.plannedEnd).toBe(d.period.stages[0].plannedEnd);
    // the Gantt draws every real stay: one open stay in Idea so far
    expect(d.stays).toHaveLength(1);
    expect(d.stays[0]).toMatchObject({ stage: "IDEA", leftAt: null });
  });

  it("moves through Planning, pauses with a reason, resumes and logs every stay", async () => {
    expect((await api().post(`/side-projects/${sp}/transition`).set(as(carol)).send({ to: "PLANNING" })).status).toBe(200);
    const noReason = await api().post(`/side-projects/${sp}/transition`).set(as(carol)).send({ to: "ON_HOLD" });
    expect(noReason.body.code).toBe("REASON_REQUIRED");
    expect((await api().post(`/side-projects/${sp}/transition`).set(as(carol)).send({ to: "ON_HOLD", reason: "Exams week" })).status).toBe(200);
    let d = (await api().get(`/side-projects/${sp}`).set(as(carol))).body.data;
    expect(d).toMatchObject({ status: "ON_HOLD", pausedFrom: "PLANNING", health: "PAUSED" });
    expect(d.period.paused).toBe(true);
    const done = await api().post(`/side-projects/${sp}/transition`).set(as(carol)).send({ to: "COMPLETED", outcomeSummary: "x".repeat(30) });
    expect(done.body.code).toBe("RESUME_FIRST");
    expect((await api().post(`/side-projects/${sp}/transition`).set(as(carol)).send({ to: "TESTING" })).status).toBe(200);
    d = (await api().get(`/side-projects/${sp}`).set(as(carol))).body.data;
    expect(d.pausedFrom).toBeNull();
    expect(d.period.stages.find((x: any) => x.stage === "IN_PROGRESS").state).toBe("skipped");
    expect(d.period.stages.find((x: any) => x.stage === "TESTING").state).toBe("current");
    const logs = rows(await db.execute(sql`SELECT stage, left_at IS NULL AS open FROM SideProjectStageLog WHERE project_id = ${sp} ORDER BY log_id`));
    expect(logs.map((l) => l.stage)).toEqual(["IDEA", "PLANNING", "ON_HOLD", "TESTING"]);
    expect(logs.filter((l) => Number(l.open) === 1)).toHaveLength(1);
    const fromIdea = transition({ status: "IDEA", review_state: "NONE", archived: false, hasConcept: true }, { to: "COMPLETED", outcomeSummary: "x".repeat(30) });
    expect(fromIdea).toMatchObject({ ok: false, code: "SKIP_NOT_ALLOWED" });
  });

  it("edits the plan with validation and flags a stage past its window as overdue", async () => {
    const bad = await api().put(`/side-projects/${sp}/plan`).set(as(carol)).send({ stagePlan: [day(10), day(5), day(40)] });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("plan.PLANNING");
    const ok = await api().put(`/side-projects/${sp}/plan`).set(as(carol)).send({ startDate: day(-30), targetDate: day(30), stagePlan: [day(-25), day(-15), day(-5)] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.plan.map((r: any) => r.end)).toEqual([day(-25), day(-15), day(-5), day(30)]);
    await db.execute(sql`UPDATE SideProjectStage SET planned_end = ${day(-2)} WHERE project_id = ${sp} AND stage = 'TESTING'`);
    const d = (await api().get(`/side-projects/${sp}`).set(as(carol))).body.data;
    expect(d.health).toBe("OVERDUE");
    expect(d.period.stages.find((x: any) => x.stage === "TESTING").overrunDays).toBe(2);
    expect(d.stage.overrunDays).toBe(2);
    expect((await api().put(`/side-projects/${sp}/plan`).set(as(bob)).send({ stagePlan: [day(-25), day(-15), day(-5)] })).status).toBe(404);
  });

  it("gives admins time per stage, the bottleneck and stuck projects", async () => {
    const s = (await api().get("/side-projects/monitor/summary").set(as(lead))).body.data;
    expect(s.stages.stages.map((x: any) => x.stage)).toEqual(["IDEA", "PLANNING", "IN_PROGRESS", "TESTING"]);
    expect(s.stages.stuck.some((r: any) => r.id === sp)).toBe(true);
    expect(s.totals.byStatus).toHaveProperty("PLANNING");
    expect(s.totals.byStatus).toHaveProperty("ON_HOLD");
    expect(s.reporting).toHaveProperty("reportsThisWeek");
    const list = await api().get("/side-projects/monitor/projects?sort=stage&pageSize=200").set(as(lead));
    expect(list.body.data.rows[0].stage).toHaveProperty("daysIn");
  });
});

describe("progress reports and activity", () => {
  let rp: number, reportId: number;
  it("records a report with a PDF, refuses other files and future dates", async () => {
    rp = await createProject(alice, "Report tracker");
    const future = await api().post(`/side-projects/${rp}/updates`).set(as(alice)).field("did", "Did a lot of work").field("workDate", day(2));
    expect(future.body.field).toBe("workDate");
    const png = await api().post(`/side-projects/${rp}/updates`).set(as(alice)).field("did", "Did a lot of work").attach("files", Buffer.from("x"), "photo.png");
    expect(png.status).toBe(400);
    const ok = await api().post(`/side-projects/${rp}/updates`).set(as(alice)).field("did", "Wired the sensors and wrote the first test").field("hours", "2.5").field("workDate", day(-1)).field("mood", "4").attach("files", pdf(), "notes.pdf");
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    reportId = ok.body.data.id;
    const d = (await api().get(`/side-projects/${rp}`).set(as(alice))).body.data;
    const r = d.updates.find((u: any) => u.id === reportId);
    expect(r).toMatchObject({ hours: 2.5, workDate: day(-1), stage: "IDEA" });
    expect(r.files).toHaveLength(1);
    expect((await api().get(`/side-projects/files/${r.files[0].assetId}`).set(as(alice))).status).toBe(200);
  });

  it("edits a report: fields, removes a PDF and adds another; only the author may", async () => {
    const d0 = (await api().get(`/side-projects/${rp}`).set(as(alice))).body.data;
    const oldAsset = d0.updates.find((u: any) => u.id === reportId).files[0].assetId;
    const res = await api().patch(`/side-projects/${rp}/updates/${reportId}`).set(as(alice)).field("did", "Wired the sensors, wrote two tests").field("hours", "3").field("workDate", day(-1)).field("removeFiles", JSON.stringify([oldAsset])).attach("files", pdf(), "v2.pdf");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const r = (await api().get(`/side-projects/${rp}`).set(as(alice))).body.data.updates.find((u: any) => u.id === reportId);
    expect(r).toMatchObject({ did: "Wired the sensors, wrote two tests", hours: 3 });
    expect(r.editedAt).toBeTruthy();
    expect(r.files.map((f: any) => f.name)).toEqual(["v2.pdf"]);
    await api().post(`/side-projects/${rp}/members`).set(as(alice)).send({ regNumber: `SPB${bob}` });
    await api().post(`/side-projects/invitations/${rp}`).set(as(bob)).send({ accept: true });
    const notMine = await api().patch(`/side-projects/${rp}/updates/${reportId}`).set(as(bob)).field("did", "Hijacked report text");
    expect(notMine.status).toBe(403);
  });

  it("returns daily activity with streaks for the contribution graph", async () => {
    await api().post(`/side-projects/${rp}/updates`).set(as(alice)).field("did", "Second day of work on it").field("hours", "1");
    const a = (await api().get(`/side-projects/${rp}/activity?days=90`).set(as(alice))).body.data;
    expect(a.days).toBe(90);
    expect(a.activity.find((x: any) => x.date === day(-1))).toMatchObject({ reports: 1, hours: 3 });
    expect(a.stats.reports).toBe(2);
    expect(a.stats.currentStreak).toBeGreaterThanOrEqual(2);
    expect((await api().get(`/side-projects/${rp}/activity`).set(as(outsider))).status).toBe(404);
  });

  it("deletes a report with its files", async () => {
    expect((await api().delete(`/side-projects/${rp}/updates/${reportId}`).set(as(alice))).status).toBe(200);
    const links = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM SideProjectUpdateFile WHERE update_id = ${reportId}`));
    expect(Number(links[0].n)).toBe(0);
  });
});

describe("assigned projects", () => {
  it("migration 131 grants SIDE_PROJECTS_ASSIGNED to every role except students' and parents'", async () => {
    const text = fs.readFileSync(path.join(__dirname, "../../migrations/131_side_projects_stages_reports.sql"), "utf8");
    const at = text.indexOf("INSERT INTO `RolePermission`");
    await db.execute(sql.raw(text.slice(at, text.indexOf(";", at))));
    const [r] = rows(await db.execute(sql`
      SELECT (SELECT COUNT(*) FROM Role WHERE name NOT IN ('STUDENT','PARENT') AND (preset_key IS NULL OR preset_key NOT IN ('student','parent'))) AS eligible,
             (SELECT COUNT(DISTINCT rp.role_id) FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id JOIN Role ro ON ro.role_id = rp.role_id
               WHERE p.name = 'SIDE_PROJECTS_ASSIGNED' AND ro.name NOT IN ('STUDENT','PARENT')) AS holders,
             (SELECT COUNT(*) FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id JOIN Role ro ON ro.role_id = rp.role_id
               WHERE p.name = 'SIDE_PROJECTS_ASSIGNED' AND ro.name IN ('STUDENT','PARENT')) AS students`));
    expect(Number(r.holders)).toBe(Number(r.eligible));
    expect(Number(r.students)).toBe(0);
  });

  it("lists what I supervise and what I help build, with counts; needs the permission", async () => {
    assignedOk.add(supervisor);
    const res = await api().get("/side-projects/assigned").set(as(supervisor));
    expect(res.status).toBe(200);
    expect(res.body.data.counts.supervising).toBeGreaterThanOrEqual(1);
    expect(res.body.data.rows.every((r: any) => r.relation === "SUPERVISOR" || r.relation === "MEMBER")).toBe(true);
    expect(res.body.data.rows.some((r: any) => r.relation === "MEMBER")).toBe(true); // the staff project's team
    expect(res.body.data.rows.every((r: any) => r.student.id !== supervisor)).toBe(true);
    expect((await api().get("/side-projects/assigned").set(as(outsider))).status).toBe(403);
  });
});

describe("classification (migration 132)", () => {
  beforeAll(() => {
    owners.add(teacherA);
    classifiers.add(teacherA);
    classifiers.add(alice); // even if a student somehow held the permission, the service refuses
  });

  it("migration 132 grants SIDE_PROJECTS_CLASSIFY to every role except students' and parents'", async () => {
    const text = fs.readFileSync(path.join(__dirname, "../../migrations/132_side_projects_kind.sql"), "utf8");
    const at = text.indexOf("INSERT INTO `RolePermission`");
    await db.execute(sql.raw(text.slice(at, text.indexOf(";", at))));
    const [r] = rows(await db.execute(sql`
      SELECT (SELECT COUNT(*) FROM Role WHERE name NOT IN ('STUDENT','PARENT') AND (preset_key IS NULL OR preset_key NOT IN ('student','parent'))) AS eligible,
             (SELECT COUNT(DISTINCT rp.role_id) FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id JOIN Role ro ON ro.role_id = rp.role_id
               WHERE p.name = 'SIDE_PROJECTS_CLASSIFY' AND ro.name NOT IN ('STUDENT','PARENT') AND (ro.preset_key IS NULL OR ro.preset_key NOT IN ('student','parent'))) AS holders,
             (SELECT COUNT(*) FROM RolePermission rp JOIN Permission p ON p.perm_id = rp.perm_id JOIN Role ro ON ro.role_id = rp.role_id
               WHERE p.name = 'SIDE_PROJECTS_CLASSIFY' AND ro.name IN ('STUDENT','PARENT')) AS students`));
    expect(Number(r.holders)).toBe(Number(r.eligible));
    expect(Number(r.students)).toBe(0);
  });

  it("a student's project is always a Student project and the student can't change it", async () => {
    const id = await createProject(alice, "Kind student", { kind: "DELIVERY_STUDIO" });
    const d = (await api().get(`/side-projects/${id}`).set(as(alice))).body.data;
    expect(d.kind).toBe("STUDENT");
    const me = (await api().get("/side-projects/me").set(as(alice))).body.data;
    expect(me.classify).toBe(false);
    const r = await api().patch(`/side-projects/${id}/kind`).set(as(alice)).send({ kind: "INDIVIDUAL" });
    expect(r.status).toBe(403);
  });

  it("staff choose the type when creating (default Individual) and can change it later", async () => {
    const a = await createProject(teacherA, "Kind default");
    expect((await api().get(`/side-projects/${a}`).set(as(teacherA))).body.data.kind).toBe("INDIVIDUAL");
    const b = await createProject(teacherA, "Kind studio", { kind: "DELIVERY_STUDIO" });
    expect((await api().get(`/side-projects/${b}`).set(as(teacherA))).body.data.kind).toBe("DELIVERY_STUDIO");
    expect((await api().get("/side-projects/me").set(as(teacherA))).body.data.classify).toBe(true);
    const bad = await api().patch(`/side-projects/${a}/kind`).set(as(teacherA)).send({ kind: "NOPE" });
    expect(bad.status).toBe(400);
    const ok = await api().patch(`/side-projects/${a}/kind`).set(as(teacherA)).send({ kind: "DELIVERY_STUDIO" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.kind).toBe("DELIVERY_STUDIO");
    const ev = rows(await db.execute(sql`SELECT from_value, to_value FROM SideProjectEvent WHERE project_id = ${a} AND type = 'KIND'`));
    expect(ev[0]).toMatchObject({ from_value: "INDIVIDUAL", to_value: "DELIVERY_STUDIO" });
  });

  it("without the permission a staff member can't choose a type", async () => {
    classifiers.delete(teacherA);
    const r = await api().post("/side-projects").set(as(teacherA)).field("title", "Kind refused").field("problemStatement", PROBLEM).field(DATES).field("kind", "DELIVERY_STUDIO").attach("concept", pdf(), "c.pdf");
    expect(r.status).toBe(403);
    expect(r.body.field).toBe("kind");
    classifiers.add(teacherA);
  });

  it("the projects lead reclassifies a student's project, and the monitor filters by type", async () => {
    const id = await createProject(alice, "Kind lead change");
    classifiers.add(lead);
    const r = await api().patch(`/side-projects/${id}/kind`).set(as(lead)).send({ kind: "DELIVERY_STUDIO" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const list = (await api().get("/side-projects/monitor/projects").query({ kind: "DELIVERY_STUDIO", pageSize: 200 }).set(as(lead))).body.data;
    expect(list.rows.some((x: any) => x.id === id)).toBe(true);
    expect(list.rows.every((x: any) => x.kind === "DELIVERY_STUDIO")).toBe(true);
    const sum = (await api().get("/side-projects/monitor/summary").set(as(lead))).body.data;
    expect(sum.totals.byKind.DELIVERY_STUDIO).toBeGreaterThan(0);
  });
});

describe("teams, implementation plan and tasks (migration 133)", () => {
  let tp: number;
  let feature: number;
  let phase: number;
  let bobTask: number;
  let aliceTask: number;

  it("rolls plan status up from tasks (pure rules)", () => {
    expect(rollupStatus([], "PLANNED")).toBe("PLANNED");
    expect(rollupStatus([], "BACKLOG")).toBe("BACKLOG");
    expect(rollupStatus(["TODO", "TODO"], "PLANNED")).toBe("PLANNED");
    expect(rollupStatus(["TODO", "IN_PROGRESS"], "PLANNED")).toBe("IN_PROGRESS");
    expect(rollupStatus(["TODO", "DONE"], "PLANNED")).toBe("IN_PROGRESS");
    expect(rollupStatus(["BLOCKED", "TODO"], "PLANNED")).toBe("BLOCKED");
    expect(rollupStatus(["IN_REVIEW", "DONE"], "PLANNED")).toBe("IN_REVIEW");
    expect(rollupStatus(["DONE", "DONE", "CANCELLED"], "PLANNED")).toBe("DONE");
    expect(rollupStatus(["CANCELLED"], "IN_PROGRESS")).toBe("PLANNED");
  });

  it("invites make a team project; roles, responsibilities and manager rights are set by the owner", async () => {
    tp = await createProject(alice, "Team delivery");
    let d = (await api().get(`/side-projects/${tp}`).set(as(alice))).body.data;
    expect(d.teamMode).toBe("PERSONAL");
    expect(d.rights.manage).toBe(true);
    expect((await api().post(`/side-projects/${tp}/members`).set(as(alice)).send({ userId: bob })).status).toBe(200);
    expect((await api().post(`/side-projects/invitations/${tp}`).set(as(bob)).send({ accept: true })).status).toBe(200);
    d = (await api().get(`/side-projects/${tp}`).set(as(alice))).body.data;
    expect(d.teamMode).toBe("TEAM");
    expect((await api().patch(`/side-projects/${tp}/team`).set(as(alice)).send({ mode: "PERSONAL" })).status).toBe(409);
    expect((await api().patch(`/side-projects/${tp}/members/${bob}`).set(as(bob)).send({ isManager: true })).status).toBe(403);
    const r = await api().patch(`/side-projects/${tp}/members/${bob}`).set(as(alice)).send({ roleKey: "DEVELOPER", roleTitle: "Frontend developer", responsibilities: "Sign-in and dashboard screens" });
    expect(r.status).toBe(200);
    const bm = (await api().get(`/side-projects/${tp}`).set(as(bob))).body.data;
    const me = bm.members.find((m: any) => m.id === bob);
    expect(me).toMatchObject({ roleKey: "DEVELOPER", roleTitle: "Frontend developer", isManager: false });
    expect(bm.rights).toMatchObject({ edit: true, manage: false });
    expect((await api().patch(`/side-projects/${tp}/members/${bob}`).set(as(alice)).send({ roleKey: "WIZARD" })).status).toBe(400);
  });

  it("generates a plan from a template, dated from the stage plan; only managers plan", async () => {
    expect((await api().post(`/side-projects/${tp}/plan/items`).set(as(bob)).send({ kind: "PHASE", title: "Nope" })).status).toBe(403);
    const t = (await api().get(`/side-projects/${tp}/plan/templates`).set(as(bob))).body.data;
    expect(t.suggested).toBe("iot");
    const g = await api().post(`/side-projects/${tp}/plan/generate`).set(as(alice)).send({ template: "web" });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    expect(g.body.data.created).toBeGreaterThan(10);
    expect((await api().post(`/side-projects/${tp}/plan/generate`).set(as(alice)).send({ template: "web" })).status).toBe(409);
    const plan = (await api().get(`/side-projects/${tp}/plan`).set(as(bob))).body.data;
    const phases = plan.items.filter((i: any) => i.kind === "PHASE");
    expect(phases.map((p: any) => p.stage)).toEqual(["IDEA", "PLANNING", "IN_PROGRESS", "TESTING"]);
    const d = (await api().get(`/side-projects/${tp}`).set(as(alice))).body.data;
    expect(phases[0].dueDate).toBe(d.period.stages[0].plannedEnd);
    expect(phases[3].dueDate).toBe(DATES.targetDate);
    phase = phases[2].id;
    feature = plan.items.find((i: any) => i.parentId === phase).id;
    expect((await api().get(`/side-projects/${tp}/plan`).set(as(outsider))).status).toBe(404);
  });

  it("teammates create tasks for themselves; only managers assign others", async () => {
    const outsiderTask = await api().post(`/side-projects/${tp}/tasks`).set(as(bob)).send({ planItemId: feature, title: "Pick colours", assigneeId: carol });
    expect(outsiderTask.status).toBe(403);
    const toAlice = await api().post(`/side-projects/${tp}/tasks`).set(as(bob)).send({ planItemId: feature, title: "Write the API", assigneeId: alice });
    expect(toAlice.status).toBe(403);
    expect(toAlice.body.code).toBe("NOT_MANAGER");
    const noItem = await api().post(`/side-projects/${tp}/tasks`).set(as(bob)).send({ title: "Floating task" });
    expect(noItem.body.field).toBe("planItemId");
    const own = await api().post(`/side-projects/${tp}/tasks`).set(as(bob)).send({ planItemId: feature, title: "Build the sign-in page", priority: "HIGH", estimateHours: 4 });
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    bobTask = own.body.data.id;
    const byOwner = await api().post(`/side-projects/${tp}/tasks`).set(as(alice)).send({ planItemId: feature, title: "Design the database", assigneeId: alice, dueDate: day(-2) });
    aliceTask = byOwner.body.data.id;
    const notTeam = await api().post(`/side-projects/${tp}/tasks`).set(as(alice)).send({ planItemId: feature, title: "Ask Carol", assigneeId: carol });
    expect(notTeam.status).toBe(400);
    const plan = (await api().get(`/side-projects/${tp}/plan`).set(as(bob))).body.data;
    expect(plan.tasks.find((x: any) => x.id === bobTask)).toMatchObject({ assigneeId: bob, status: "TODO", priority: "HIGH" });
    expect(plan.tasks.find((x: any) => x.id === aliceTask).overdue).toBe(true);
  });

  it("moves tasks through their states and rolls the plan up automatically", async () => {
    expect((await api().post(`/side-projects/${tp}/tasks/${aliceTask}/status`).set(as(bob)).send({ to: "IN_PROGRESS" })).status).toBe(403);
    expect((await api().post(`/side-projects/${tp}/tasks/${bobTask}/status`).set(as(bob)).send({ to: "BLOCKED" })).body.field).toBe("note");
    expect((await api().post(`/side-projects/${tp}/tasks/${bobTask}/status`).set(as(bob)).send({ to: "IN_PROGRESS" })).status).toBe(200);
    let plan = (await api().get(`/side-projects/${tp}/plan`).set(as(bob))).body.data;
    expect(plan.items.find((i: any) => i.id === feature).status).toBe("IN_PROGRESS");
    expect(plan.items.find((i: any) => i.id === phase).status).toBe("IN_PROGRESS");
    expect((await api().post(`/side-projects/${tp}/tasks/${bobTask}/status`).set(as(bob)).send({ to: "IN_REVIEW" })).status).toBe(200);
    expect((await api().post(`/side-projects/${tp}/tasks/${bobTask}/status`).set(as(alice)).send({ to: "DONE" })).status).toBe(200);
    expect((await api().post(`/side-projects/${tp}/tasks/${aliceTask}/status`).set(as(alice)).send({ to: "CANCELLED" })).status).toBe(200);
    plan = (await api().get(`/side-projects/${tp}/plan`).set(as(bob))).body.data;
    expect(plan.items.find((i: any) => i.id === feature).status).toBe("DONE");
    const t = (await api().get(`/side-projects/${tp}/tasks/${bobTask}`).set(as(bob))).body.data;
    expect(t.history.map((h: any) => h.toStatus)).toEqual(["DONE", "IN_REVIEW", "IN_PROGRESS", "TODO"]);
    expect(t.startedAt).toBeTruthy();
    expect(t.completedAt).toBeTruthy();
    const card = (await api().get(`/side-projects/${tp}`).set(as(alice))).body.data;
    expect(card.plan.done).toBe(1);
    expect(card.progress).toBe(Math.min(20, Math.round((1 / card.plan.total) * 100)));
  });

  it("manual status takes an item off auto until set back", async () => {
    expect((await api().patch(`/side-projects/${tp}/plan/items/${feature}`).set(as(alice)).send({ status: "IN_REVIEW" })).status).toBe(200);
    let it = (await api().get(`/side-projects/${tp}/plan`).set(as(alice))).body.data.items.find((i: any) => i.id === feature);
    expect(it).toMatchObject({ status: "IN_REVIEW", statusMode: "MANUAL" });
    expect((await api().patch(`/side-projects/${tp}/plan/items/${feature}`).set(as(alice)).send({ statusMode: "AUTO" })).status).toBe(200);
    it = (await api().get(`/side-projects/${tp}/plan`).set(as(alice))).body.data.items.find((i: any) => i.id === feature);
    expect(it).toMatchObject({ status: "DONE", statusMode: "AUTO" });
  });

  it("logs work on a task (assignee or manager) and counts it", async () => {
    expect((await api().post(`/side-projects/${tp}/tasks/${bobTask}/logs`).set(as(bob)).send({ hours: 2, workDate: day(1) })).body.field).toBe("workDate");
    expect((await api().post(`/side-projects/${tp}/tasks/${bobTask}/logs`).set(as(bob)).send({ hours: 0.3 })).body.field).toBe("hours");
    expect((await api().post(`/side-projects/${tp}/tasks/${bobTask}/logs`).set(as(bob)).send({ hours: 2, note: "Sign-in form" })).status).toBe(200);
    const t = (await api().get(`/side-projects/${tp}/tasks/${bobTask}`).set(as(bob))).body.data;
    expect(t.spentHours).toBe(2);
    expect(t.logs[0]).toMatchObject({ hours: 2, note: "Sign-in form", userId: bob });
  });

  it("a teammate made manager can assign; managers reassign", async () => {
    await api().patch(`/side-projects/${tp}/members/${bob}`).set(as(alice)).send({ isManager: true });
    const r = await api().post(`/side-projects/${tp}/tasks`).set(as(bob)).send({ planItemId: feature, title: "Review the colours", assigneeId: alice });
    expect(r.status).toBe(200);
    expect((await api().patch(`/side-projects/${tp}/tasks/${r.body.data.id}`).set(as(bob)).send({ assigneeId: bob })).status).toBe(200);
    await api().patch(`/side-projects/${tp}/members/${bob}`).set(as(alice)).send({ isManager: false });
  });

  it("insights: KPIs, burndown, throughput, time in status and one row per teammate", async () => {
    const d = (await api().get(`/side-projects/${tp}/delivery`).set(as(bob))).body.data;
    expect(d.kpis.done).toBe(1);
    expect(d.kpis.byStatus.CANCELLED).toBe(1);
    expect(d.kpis.avgCycleDays).not.toBeNull();
    expect(d.burndown).toHaveLength(30);
    expect(d.throughput).toHaveLength(8);
    expect(d.throughput[7].done).toBe(1);
    expect(d.statusTime.map((x: any) => x.status)).toEqual(["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"]);
    const b = d.members.find((m: any) => m.id === bob);
    expect(b).toMatchObject({ done: 1, hoursLogged: 2, roleTitle: "Frontend developer" });
    expect(d.members.find((m: any) => m.id === alice).owner).toBe(true);
  });

  it("my tasks lists the caller's tasks across projects", async () => {
    const mine = (await api().get("/side-projects/my-tasks").set(as(bob))).body.data;
    expect(mine.some((t: any) => t.id === bobTask && t.projectTitle === "Team delivery" && t.planItemTitle)).toBe(true);
    expect(mine.every((t: any) => t.assigneeId === bob)).toBe(true);
  });

  it("deleting a feature moves its tasks to the phase; a phase with features stays", async () => {
    expect((await api().delete(`/side-projects/${tp}/plan/items/${phase}`).set(as(alice))).status).toBe(409);
    expect((await api().delete(`/side-projects/${tp}/plan/items/${feature}`).set(as(alice))).status).toBe(200);
    const plan = (await api().get(`/side-projects/${tp}/plan`).set(as(alice))).body.data;
    expect(plan.tasks.find((t: any) => t.id === bobTask).planItemId).toBe(phase);
  });

  it("the monitor summary carries a delivery block, and the sweep nudges overdue tasks", async () => {
    const sum = (await api().get("/side-projects/monitor/summary").set(as(lead))).body.data;
    expect(sum.delivery).toBeTruthy();
    expect(sum.delivery.total).toBeGreaterThan(0);
    expect(sum.delivery.teamProjects).toBeGreaterThan(0);
    const late = await api().post(`/side-projects/${tp}/tasks`).set(as(alice)).send({ planItemId: phase, title: "Late one", assigneeId: bob, dueDate: day(-3) });
    expect(late.status).toBe(200);
    const { sweepSideProjects } = await import("../services/sideProjects/sweep");
    const res = await sweepSideProjects();
    expect(res.tasksOverdue).toBeGreaterThan(0);
    const n = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM Notification WHERE user_id = ${bob} AND kind = 'side_project_task_overdue'`));
    expect(Number(n[0].n)).toBeGreaterThan(0);
  });
});

describe("customers shared across projects (migration 133)", () => {
  let cid: number;
  // Every production role holds SIDE_PROJECTS_MANAGE_OWN (migration 129); the lead and staff too.
  beforeAll(() => {
    owners.add(lead);
    owners.add(teacherA);
  });
  const png = async () => (await import("sharp")).default({ create: { width: 40, height: 40, channels: 3, background: "#2a78d6" } }).png().toBuffer();
  const ids = async (who: number) => ((await api().get("/side-projects/customers").set(as(who))).body.data as any[]).map((c) => c.id);

  it("registers a customer once (with a logo); duplicates are refused", async () => {
    const r = await api().post("/side-projects/customers").set(as(teacherA)).field("name", "Kigali Green Farms").field("kind", "COMPANY").field("email", "info@greenfarms.rw").attach("logo", await png(), "logo.png");
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    cid = r.body.data.id;
    expect(r.body.data).toMatchObject({ name: "Kigali Green Farms", kind: "COMPANY", projects: 0 });
    expect(r.body.data.logoAssetId).toBeTruthy();
    const staffDupe = await api().post("/side-projects/customers").set(as(lead)).field("name", "  kigali   green farms ");
    expect(staffDupe.status).toBe(409);
    expect(staffDupe.body.message ?? staffDupe.body.error?.message ?? JSON.stringify(staffDupe.body)).toMatch(/pick it from the list/);
    // A student who can't see the school's record is told who can attach it, not shown it.
    const studentDupe = await api().post("/side-projects/customers").set(as(carol)).field("name", "Kigali Green Farms");
    expect(studentDupe.status).toBe(409);
    expect(JSON.stringify(studentDupe.body)).toMatch(/staff member/);
    expect((await api().post("/side-projects/customers").set(as(carol)).field("name", "Bad mail").field("email", "nope")).body.field).toBe("email");
    expect((await api().post("/side-projects/customers").set(as(carol)).field("name", "Svg Co").attach("logo", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "logo.svg")).status).toBe(400);
    const logo = await api().get(`/side-projects/customers/${cid}/logo`).set(as(lead));
    expect(logo.status).toBe(200);
    expect(String(logo.headers["content-type"])).toMatch(/image/);
  });

  it("students see only their own customers and those of projects they are in", async () => {
    expect(await ids(teacherA)).toContain(cid);
    expect(await ids(lead)).toContain(cid);
    expect(await ids(carol)).not.toContain(cid);
    expect((await api().get(`/side-projects/customers/${cid}`).set(as(carol))).status).toBe(404);
    expect((await api().get(`/side-projects/customers/${cid}/logo`).set(as(carol))).status).toBe(404); // unused school customer
    const sneak = await api().post("/side-projects").set(as(carol)).field("title", "Sneaky pick").field("problemStatement", PROBLEM).field(DATES).field("customerMode", "CUSTOMER").field("customerId", String(cid)).attach("concept", pdf(), "c.pdf");
    expect(sneak.status).toBe(400);
    expect(sneak.body.field).toBe("customerId");

    const mine = (await api().post("/side-projects/customers").set(as(carol)).field("name", "Carol's Bakery")).body.data;
    expect(await ids(carol)).toContain(mine.id);
    expect(await ids(alice)).not.toContain(mine.id);
    const aliceOwn = await createProject(alice, "Alice idea");
    expect((await api().patch(`/side-projects/${aliceOwn}`).set(as(alice)).send({ customerMode: "CUSTOMER", customerId: mine.id })).body.field).toBe("customerId");

    // A staff teammate attaches the school customer to Carol's project: now it is hers to see (and only hers).
    const p = await createProject(carol, "Farm sensors", { customerMode: "CUSTOMER", customerId: String(mine.id) });
    await db.execute(sql`INSERT INTO SideProjectMember (project_id, user_id, status, invited_by, added_at, responded_at) VALUES (${p}, ${teacherA}, 'ACCEPTED', ${carol}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    const attach = await api().patch(`/side-projects/${p}`).set(as(teacherA)).send({ customerMode: "CUSTOMER", customerId: cid });
    expect(attach.status, JSON.stringify(attach.body)).toBe(200);
    expect(await ids(carol)).toContain(cid);
    expect((await api().get(`/side-projects/customers/${cid}`).set(as(carol))).body.data.projects).toBe(1);
    expect(await ids(alice)).not.toContain(cid);
    expect((await api().get(`/side-projects/customers/${cid}/logo`).set(as(alice))).status).toBe(200); // shown on its project card
    // Carol saves other fields with the staff-chosen customer in place.
    expect((await api().patch(`/side-projects/${p}`).set(as(carol)).send({ customerMode: "CUSTOMER", customerId: cid, description: "Soil sensors for farms" })).status).toBe(200);
  });

  it("any project can pick a customer it may see", async () => {
    const list = (await api().get("/side-projects/customers").query({ q: "green" }).set(as(carol))).body.data;
    expect(list.some((c: any) => c.id === cid)).toBe(true);
    const missing = await api().post("/side-projects").set(as(carol)).field("title", "No customer chosen").field("problemStatement", PROBLEM).field(DATES).field("customerMode", "CUSTOMER").attach("concept", pdf(), "c.pdf");
    expect(missing.body.field).toBe("customerId");
    const p = await createProject(teacherA, "Farm dashboard", { customerMode: "CUSTOMER", customerId: String(cid) });
    const before = (await api().get(`/side-projects/customers/${cid}`).set(as(teacherA))).body.data.projects;
    const d = (await api().get(`/side-projects/${p}`).set(as(teacherA))).body.data;
    expect(d.customerMode).toBe("CUSTOMER");
    expect(d.customerDetail).toMatchObject({ id: cid, name: "Kigali Green Farms" });
    expect(d.customer).toMatchObject({ id: cid, name: "Kigali Green Farms" });
    const own = await createProject(alice, "Own idea");
    expect((await api().get(`/side-projects/${own}`).set(as(alice))).body.data.customerMode).toBe("OWN");
    expect(before).toBe(2); // Carol's project and this one
    const mon = (await api().get("/side-projects/monitor/projects").query({ customerId: cid, pageSize: 50 }).set(as(lead))).body.data;
    expect(mon.rows.length).toBe(2);
  });

  it("only the registrar (or the lead) edits; a customer in use is archived, not deleted", async () => {
    expect((await api().patch(`/side-projects/customers/${cid}`).set(as(carol)).field("phone", "+250 788 000 000")).status).toBe(403);
    const ok = await api().patch(`/side-projects/customers/${cid}`).set(as(teacherA)).field("phone", "+250 788 000 000").field("contactName", "Jeanne");
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ phone: "+250 788 000 000", contactName: "Jeanne" });
    const rm = await api().delete(`/side-projects/customers/${cid}`).set(as(teacherA));
    expect(rm.body.data.archived).toBe(true);
    expect(await ids(teacherA)).not.toContain(cid);
    const pick = await api().post("/side-projects").set(as(teacherA)).field("title", "Archived pick").field("problemStatement", PROBLEM).field(DATES).field("customerMode", "CUSTOMER").field("customerId", String(cid)).attach("concept", pdf(), "c.pdf");
    expect(pick.body.field).toBe("customerId");
    expect((await api().post(`/side-projects/customers/${cid}/restore`).set(as(lead))).status).toBe(200);
    const fresh = (await api().post("/side-projects/customers").set(as(carol)).field("name", "Temporary Ltd")).body.data;
    expect((await api().delete(`/side-projects/customers/${fresh.id}`).set(as(carol))).body.data.archived).toBe(false);
  });
});

describe("project cover and logo (migration 133)", () => {
  const png = async (color = "#2a78d6") => (await import("sharp")).default({ create: { width: 60, height: 60, channels: 3, background: color } }).png().toBuffer();
  let bp: number;
  beforeAll(() => owners.add(teacherA));

  it("the team adds an optional logo and cover; others can't, SVG is refused", async () => {
    bp = await createProject(teacherA, "Branded project");
    let d = (await api().get(`/side-projects/${bp}`).set(as(teacherA))).body.data;
    expect(d.logoAssetId).toBeNull();
    expect(d.coverAssetId).toBeNull();
    expect((await api().post(`/side-projects/${bp}/branding/logo`).set(as(carol)).attach("file", await png(), "l.png")).status).toBe(404);
    expect((await api().post(`/side-projects/${bp}/branding/logo`).set(as(teacherA)).attach("file", Buffer.from("<svg/>"), "l.svg")).status).toBe(400);
    expect((await api().post(`/side-projects/${bp}/branding/banner`).set(as(teacherA)).attach("file", await png(), "l.png")).status).toBe(404);
    const logo = await api().post(`/side-projects/${bp}/branding/logo`).set(as(teacherA)).attach("file", await png(), "logo.png");
    expect(logo.status, JSON.stringify(logo.body)).toBe(200);
    const cover = await api().post(`/side-projects/${bp}/branding/cover`).set(as(teacherA)).attach("file", await png("#eb6834"), "cover.png");
    expect(cover.status).toBe(200);
    d = (await api().get(`/side-projects/${bp}`).set(as(teacherA))).body.data;
    expect(d.logoAssetId).toBe(logo.body.data.assetId);
    expect(d.coverAssetId).toBe(cover.body.data.assetId);
    expect(d.media.some((m: any) => m.assetId === cover.body.data.assetId)).toBe(true);
    expect((await api().get(`/side-projects/files/${d.logoAssetId}`).set(as(teacherA))).status).toBe(200);
    const mine = (await api().get("/side-projects/mine").set(as(teacherA))).body.data.find((c: any) => c.id === bp);
    expect(mine.logoAssetId).toBe(d.logoAssetId);
  });

  it("replacing or removing the logo retires the old file", async () => {
    const before = (await api().get(`/side-projects/${bp}`).set(as(teacherA))).body.data.logoAssetId;
    await api().post(`/side-projects/${bp}/branding/logo`).set(as(teacherA)).attach("file", await png("#1baf7a"), "logo2.png");
    const gone = rows(await db.execute(sql`SELECT deleted_at FROM FileAsset WHERE asset_id = ${before}`));
    expect(gone[0].deleted_at).not.toBeNull();
    expect((await api().delete(`/side-projects/${bp}/branding/logo`).set(as(teacherA))).status).toBe(200);
    expect((await api().delete(`/side-projects/${bp}/branding/cover`).set(as(teacherA))).status).toBe(200);
    const d = (await api().get(`/side-projects/${bp}`).set(as(teacherA))).body.data;
    expect(d.logoAssetId).toBeNull();
    expect(d.coverAssetId).toBeNull();
  });
});

describe("delete rules, import and sweep", () => {
  it("a student deletes only an unreviewed idea", async () => {
    const idea = await createProject(carol, "Throwaway idea");
    expect((await api().delete(`/side-projects/${idea}`).set(as(carol))).status).toBe(200);
    expect((await api().get(`/side-projects/${idea}`).set(as(carol))).status).toBe(404);
    // the title is free again
    await createProject(carol, "Throwaway idea");
    const p1 = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id = ${alice} AND title = 'Smart irrigation'`))[0].id;
    expect((await api().delete(`/side-projects/${p1}`).set(as(alice))).body.code).toBe("DELETE_NOT_ALLOWED");
  });

  it("imports by registration number with a dry run, then asks for the concept", async () => {
    const csv = [
      "registration_number,title,status,category,github_url",
      `SPB${bob},Bus tracker,In progress,mobile,https://github.com/nga/bus`,
      `NOPE999,Ghost project,Idea,,`,
      `SPB${bob},Bus tracker,Idea,,`,
      `SPC${carol},Solar charger,Weird,,`,
    ].join("\n");
    const dry = await api().post("/side-projects/admin/import").set(as(lead)).attach("file", Buffer.from(csv), "list.csv");
    expect(dry.status, JSON.stringify(dry.body)).toBe(200);
    expect(dry.body.data).toMatchObject({ dryRun: true, total: 4, valid: 1, invalid: 3 });
    expect((await api().post("/side-projects/admin/import").set(as(teacherA)).attach("file", Buffer.from(csv), "list.csv")).status).toBe(403);
    const go = await api().post("/side-projects/admin/import?dryRun=0").set(as(lead)).attach("file", Buffer.from(csv), "list.csv");
    expect(go.body.data.valid).toBe(1);
    const p = rows(await db.execute(sql`SELECT project_id, status, concept_pending FROM SideProject WHERE owner_user_id = ${bob} AND title = 'Bus tracker'`))[0];
    expect(p).toMatchObject({ status: "IN_PROGRESS", concept_pending: 1 });
    // Concept pending: can't be moved forward until the concept arrives.
    await api().post(`/side-projects/${p.project_id}/transition`).set(as(bob)).send({ to: "IDEA" });
    const blocked = await api().post(`/side-projects/${p.project_id}/transition`).set(as(bob)).send({ to: "IN_PROGRESS" });
    expect(blocked.body.code).toBe("CONCEPT_REQUIRED");
    await api().post(`/side-projects/${p.project_id}/documents/concept`).set(as(bob)).attach("file", pdf(), "c.pdf");
    expect((await api().post(`/side-projects/${p.project_id}/transition`).set(as(bob)).send({ to: "IN_PROGRESS" })).status).toBe(200);
  });

  it("nudges stale projects once and supervisors get a digest", async () => {
    const pc = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id = ${carol} AND title = 'Robot sorter'`))[0].id;
    await db.execute(sql`UPDATE SideProject SET status = 'IN_PROGRESS' WHERE project_id = ${pc}`);
    await backdateActivity(pc, 40);
    const first = await sweepSideProjects();
    expect(first.stale).toBeGreaterThanOrEqual(1);
    const again = await sweepSideProjects();
    const staleAgain = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM SideProjectEvent WHERE project_id = ${pc} AND type = 'NUDGE_STALE'`));
    expect(Number(staleAgain[0].n)).toBe(1);
    expect(again.stale).toBe(0);
    const sup = rows(await db.execute(sql`SELECT kind FROM Notification WHERE user_id = ${supervisor} AND kind = 'side_project_digest'`));
    expect(sup.length).toBe(1);
    const lm = await api().get(`/side-projects/monitor/projects?health=STALE&pageSize=200`).set(as(lead));
    expect(lm.body.data.rows.map((r: any) => r.id)).toContain(pc);
  });
});

describe("supervising is its own role (migration 134)", () => {
  beforeAll(() => owners.add(teacherA));
  const ids = (r: any) => (r.body.data as any[]).map((x) => x.id);

  it("the owner can't supervise their own project, and isn't offered as a candidate", async () => {
    const create = await api().post("/side-projects").set(as(teacherA)).field("title", "Self supervised").field("problemStatement", PROBLEM).field(DATES).field("supervisorId", String(teacherA)).attach("concept", pdf(), "c.pdf");
    expect(create.status).toBe(400);
    expect(create.body.code).toBe("SUPERVISOR_IS_OWNER");
    const p = await createProject(teacherA, "Staff tool");
    const patch = await api().patch(`/side-projects/${p}`).set(as(teacherA)).send({ supervisorId: teacherA });
    expect(patch.body.code).toBe("SUPERVISOR_IS_OWNER");
    expect(ids(await api().get("/side-projects/supervisors").set(as(teacherA)))).not.toContain(teacherA);
    expect(ids(await api().get("/side-projects/supervisors").query({ projectId: p }).set(as(lead)))).not.toContain(teacherA);
  });

  it("a teammate can't supervise, and the supervisor can't join the team", async () => {
    const p = await createProject(teacherA, "Team with a supervisor");
    expect((await api().post(`/side-projects/${p}/members`).set(as(teacherA)).send({ userId: outsider })).status).toBe(200);
    expect(ids(await api().get("/side-projects/supervisors").query({ projectId: p }).set(as(teacherA)))).not.toContain(outsider);
    const asSup = await api().patch(`/side-projects/${p}`).set(as(teacherA)).send({ supervisorId: outsider });
    expect(asSup.body.code).toBe("SUPERVISOR_IS_MEMBER");
    expect((await api().patch(`/side-projects/${p}`).set(as(teacherA)).send({ supervisorId: supervisor })).status).toBe(200);
    const inv = await api().post(`/side-projects/${p}/members`).set(as(teacherA)).send({ userId: supervisor });
    expect(inv.status).toBe(409);
    expect(inv.body.code).toBe("IS_SUPERVISOR");
  });

  it("the supervising badge matches the Assigned page (own projects never count)", async () => {
    const p = await createProject(teacherA, "Legacy self supervision");
    assignedOk.add(teacherA);
    await db.execute(sql`UPDATE SideProject SET supervisor_user_id = ${teacherA} WHERE project_id = ${p}`); // as old data had it
    const me = (await api().get("/side-projects/me").set(as(teacherA))).body.data;
    const assigned = (await api().get("/side-projects/assigned").set(as(teacherA))).body.data;
    expect(me.supervising).toBe(assigned.counts.supervising);
    expect(assigned.rows.map((r: any) => r.id)).not.toContain(p);
  });
});

describe("All projects is for leadership and explicit grants (migration 135)", () => {
  it("class teachers and mentors no longer hold SIDE_PROJECTS_VIEW or REVIEW", async () => {
    const r = rows(await db.execute(sql`
      SELECT COUNT(*) AS n FROM RolePermission rp JOIN Role r ON r.role_id = rp.role_id JOIN Permission p ON p.perm_id = rp.perm_id
      WHERE p.name IN ('SIDE_PROJECTS_VIEW', 'SIDE_PROJECTS_REVIEW') AND (r.preset_key IN ('class_teacher', 'mentor') OR r.name IN ('CLASS_TEACHER', 'Mentor'))`));
    expect(Number(r[0].n)).toBe(0);
    const lead = rows(await db.execute(sql`
      SELECT COUNT(*) AS n FROM RolePermission rp JOIN Role r ON r.role_id = rp.role_id JOIN Permission p ON p.perm_id = rp.perm_id
      WHERE p.name = 'SIDE_PROJECTS_VIEW' AND r.preset_key IN ('platform_owner', 'side_projects_lead')`));
    expect(Number(lead[0].n)).toBeGreaterThanOrEqual(1);
  });

  it("without the view permission the school-wide endpoints refuse, and options expose no customers", async () => {
    for (const path of ["/side-projects/monitor/projects", "/side-projects/monitor/board", "/side-projects/monitor/export", "/side-projects/monitor/summary"]) {
      expect((await api().get(path).set(as(alice))).status, path).toBe(403);
    }
    const opts = (await api().get("/side-projects/monitor/options").set(as(alice))).body.data;
    expect(opts.customers).toEqual([]);
    expect(opts.classes).toEqual([]);
    expect((await api().get("/side-projects/monitor/options").set(as(lead))).body.data.customers.length).toBeGreaterThan(0);
  });
});

describe("project abstract (migration 136)", () => {
  it("is required and brief on create, returned first-class, and editable", async () => {
    const base = () => api().post("/side-projects").set(as(alice)).field("title", `Abstract check ${Date.now()}`).field("problemStatement", PROBLEM).field({ startDate: day(0), targetDate: day(60) });
    const missing = await base().attach("concept", pdf(), "c.pdf");
    expect(missing.status).toBe(400);
    expect(missing.body.field).toBe("abstract");
    const short = await base().field("abstract", "Too short.").attach("concept", pdf(), "c.pdf");
    expect(short.body.field).toBe("abstract");
    const long = await base().field("abstract", "x".repeat(401)).attach("concept", pdf(), "c.pdf");
    expect(long.body.field).toBe("abstract");
    const p = await createProject(alice, "Abstract shown");
    expect((await api().get(`/side-projects/${p}`).set(as(alice))).body.data.abstract).toBe(ABSTRACT);
    const next = "A shared map of lost items on campus so that students find their things within a day.";
    expect((await api().patch(`/side-projects/${p}`).set(as(alice)).send({ abstract: next })).status).toBe(200);
    expect((await api().get(`/side-projects/${p}`).set(as(alice))).body.data.abstract).toBe(next);
    expect((await api().patch(`/side-projects/${p}`).set(as(alice)).send({ abstract: "" })).body.field).toBe("abstract");
  });
});
