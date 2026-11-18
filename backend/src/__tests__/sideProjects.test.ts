// Student side projects (STUDENT_PROJECTS_IMPLEMENTATION_PLAN.md): lifecycle rules, the
// student API (create with concept, board moves, files, progress, teams), the monitor
// (scope, summary-only, supervisor), review, import, sweep — against the test database
// (migration 128) with the in-memory file-server.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
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
import { backdateActivity, sweepSideProjects } from "../services/sideProjects/sweep";
import { GITHUB_RE } from "../services/sideProjects/validate";
import { MIS_MANIFEST } from "../access/manifest";
import { isV2OnlyCapability } from "../access/v2Only";
import { featureOfCapability } from "../services/tenantMgmt/catalog";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

const viewers = new Map<number, Partial<Viewer>>();
const owners = new Set<number>();

const app = express();
app.use(express.json());
app.use(
  "/side-projects",
  sideProjectsRouter(
    (req: any, res, next) => {
      const id = Number(req.get("X-Test-User"));
      if (!id) return res.status(401).end();
      req.user = { userId: id, permissions: owners.has(id) ? ["SIDE_PROJECTS_MANAGE_OWN"] : [] };
      next();
    },
    (req: any, res, next) => (owners.has(Number(req.user.userId)) ? next() : res.status(403).json({ message: "Forbidden" })),
    async (req: any) => ({ userId: Number(req.user.userId), summary: null, detail: null, review: null, manageAny: false, ...(viewers.get(Number(req.user.userId)) ?? {}) }),
  ),
);
const as = (id: number) => ({ "X-Test-User": String(id) });

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
  const r = await request(app)
    .post("/side-projects")
    .set(as(owner))
    .field("title", title)
    .field("problemStatement", PROBLEM)
    .field("techTags", JSON.stringify(["Arduino", "C++"]))
    .field("categoryId", String((rows(await db.execute(sql`SELECT category_id FROM SideProjectCategory WHERE slug = 'iot'`)))[0].category_id))
    .field(extra)
    .attach("concept", pdf(), "concept.pdf");
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  created.push(r.body.data.id);
  return r.body.data.id as number;
}

beforeAll(async () => {
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
  const users = [alice, bob, carol, teacherA, lead, insights, supervisor, outsider];
  const ul = sql.join(users.map((i) => sql`${i}`), sql`, `);
  const ids = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id IN (${ul})`)).map((r) => Number(r.id));
  if (ids.length) {
    const pl = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    for (const t of ["SideProjectDocument", "SideProjectMedia", "SideProjectLink", "SideProjectMilestone", "SideProjectUpdate", "SideProjectEvent", "SideProjectComment", "SideProjectMember"]) {
      await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE project_id IN (${pl})`);
    }
    await db.execute(sql`DELETE FROM SideProject WHERE project_id IN (${pl})`);
  }
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
    expect(perms.map((p) => p.name)).toEqual(["SIDE_PROJECTS_MANAGE_ANY", "SIDE_PROJECTS_MANAGE_OWN", "SIDE_PROJECTS_REVIEW", "SIDE_PROJECTS_VIEW"]);
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
    const noConcept = await request(app).post("/side-projects").set(as(alice)).send({ title: "No concept", problemStatement: PROBLEM });
    expect(noConcept.status).toBe(400);
    expect(noConcept.body).toMatchObject({ code: "CONCEPT_REQUIRED", field: "concept" });
    const shortProblem = await request(app).post("/side-projects").set(as(alice)).field("title", "Short").field("problemStatement", "too short").attach("concept", pdf(), "c.pdf");
    expect(shortProblem.status).toBe(400);
    expect(shortProblem.body.field).toBe("problemStatement");
    const badFile = await request(app).post("/side-projects").set(as(alice)).field("title", "Bad file").field("problemStatement", PROBLEM).attach("concept", Buffer.from("MZ..."), "setup.exe");
    expect(badFile.status).toBe(400);
    expect(badFile.body.code).toBe("FILE_REFUSED");
    const badGit = await request(app).post("/side-projects").set(as(alice)).field("title", "Bad git").field("problemStatement", PROBLEM).field("githubUrl", "https://example.com/x").attach("concept", pdf(), "c.pdf");
    expect(badGit.body.field).toBe("githubUrl");
  });

  it("creates with the concept, stamps reg number, year and class, and shows it on the board", async () => {
    p1 = await createProject(alice, "Smart irrigation", { githubUrl: "github.com/nga/irrigation.git/" });
    const r = await request(app).get(`/side-projects/${p1}`).set(as(alice));
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d).toMatchObject({ title: "Smart irrigation", status: "IDEA", githubUrl: "https://github.com/nga/irrigation", conceptPending: false });
    expect(d.owner.regNumber).toBe(`SPA${alice}`);
    expect(d.academicYear.id).toBe(yearId);
    expect(d.class.id).toBe(classA);
    expect(d.documents.CONCEPT.current).toMatchObject({ version: 1, ext: "pdf" });
    expect(d.techTags).toEqual(["Arduino", "C++"]);
    const board = await request(app).get("/side-projects/mine").set(as(alice));
    expect(board.body.data.map((c: any) => c.id)).toContain(p1);
    const dup = await request(app).post("/side-projects").set(as(alice)).field("title", "smart  IRRIGATION").field("problemStatement", PROBLEM).attach("concept", pdf(), "c.pdf");
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_TITLE");
  });

  it("accepts a written concept instead of a file", async () => {
    const r = await request(app)
      .post("/side-projects")
      .set(as(alice))
      .send({ title: "Library finder", problemStatement: PROBLEM, conceptWritten: { users: "Students looking for books", solution: "A web app that indexes the school library shelves by QR code.", impact: "Books found in seconds" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    created.push(r.body.data.id);
    const d = (await request(app).get(`/side-projects/${r.body.data.id}`).set(as(alice))).body.data;
    expect(d.documents.CONCEPT.current).toMatchObject({ source: "WRITTEN", ext: "md" });
  });

  it("hides a project from other students (404) and refuses edits from them", async () => {
    expect((await request(app).get(`/side-projects/${p1}`).set(as(bob))).status).toBe(404);
    expect((await request(app).patch(`/side-projects/${p1}`).set(as(bob)).send({ title: "Mine now" })).status).toBe(404);
    expect((await request(app).get(`/side-projects/${p1}`).set(as(teacherA))).status).toBe(403); // not a student route user
  });

  it("moves through the board with the lifecycle rules", async () => {
    const skip = await request(app).post(`/side-projects/${p1}/transition`).set(as(alice)).send({ to: "COMPLETED", outcomeSummary: "x".repeat(40) });
    expect(skip.status).toBe(409);
    expect(skip.body.code).toBe("SKIP_NOT_ALLOWED");
    const go = await request(app).post(`/side-projects/${p1}/transition`).set(as(alice)).send({ to: "IN_PROGRESS", position: 0 });
    expect(go.status).toBe(200);
    expect(go.body.data).toMatchObject({ from: "IDEA", to: "IN_PROGRESS" });
    const order = await request(app).patch("/side-projects/board/order").set(as(alice)).send({ status: "IN_PROGRESS", ids: [p1] });
    expect(order.status).toBe(200);
    const d = (await request(app).get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.status).toBe("IN_PROGRESS");
    expect(d.startedAt).toBeTruthy();
    expect(d.events.some((e: any) => e.type === "STATUS" && e.toValue === "IN_PROGRESS")).toBe(true);
  });

  it("versions documents, keeps the concept mandatory, refuses wrong kinds", async () => {
    const srs = await request(app).post(`/side-projects/${p1}/documents/srs`).set(as(alice)).attach("file", pdf(), "srs.pdf");
    expect(srs.status, JSON.stringify(srs.body)).toBe(200);
    const v2 = await request(app).post(`/side-projects/${p1}/documents/concept`).set(as(alice)).attach("file", pdf(), "concept-v2.pdf");
    expect(v2.body.data.version).toBe(2);
    const img = await request(app).post(`/side-projects/${p1}/documents/srs`).set(as(alice)).attach("file", await png(), "srs.png");
    expect(img.status).toBe(400);
    const d = (await request(app).get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.documents.CONCEPT.versions).toHaveLength(2);
    expect(d.documents.CONCEPT.current.name).toBe("concept-v2.pdf");
    expect(d.documents.SRS.current).toBeTruthy();
  });

  it("uploads gallery files with a thumbnail and a cover, serves them only to viewers", async () => {
    const up = await request(app).post(`/side-projects/${p1}/media`).set(as(alice)).attach("files", await png(), "screen.png").attach("files", pdf(), "poster.pdf");
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    const d = (await request(app).get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.media).toHaveLength(2);
    const image = d.media.find((m: any) => m.kind === "image");
    expect(image.hasThumb).toBe(true);
    expect(d.coverAssetId).toBe(image.assetId);
    const thumb = await request(app).get(`/side-projects/files/${image.assetId}?variant=thumb`).set(as(alice));
    expect(thumb.status).toBe(200);
    expect(thumb.headers["content-type"]).toBe("image/png");
    expect((await request(app).get(`/side-projects/files/${image.assetId}`).set(as(bob))).status).toBe(404);
    expect((await request(app).get(`/side-projects/files/${image.assetId}`).set(as(teacherA))).status).toBe(200); // class teacher of A
    expect((await request(app).get(`/side-projects/files/${image.assetId}`).set(as(outsider))).status).toBe(404);
    const caption = await request(app).patch(`/side-projects/${p1}/media/${image.id}`).set(as(alice)).send({ caption: "Dashboard" });
    expect(caption.status).toBe(200);
    const exe = await request(app).post(`/side-projects/${p1}/media`).set(as(alice)).attach("files", Buffer.from("x"), "virus.bat");
    expect(exe.status).toBe(400);
  });

  it("tracks progress with milestones and updates", async () => {
    const m1 = (await request(app).post(`/side-projects/${p1}/milestones`).set(as(alice)).send({ title: "Sensor wiring" })).body.data.id;
    await request(app).post(`/side-projects/${p1}/milestones`).set(as(alice)).send({ title: "Dashboard", dueDate: "2026-12-20" });
    await request(app).patch(`/side-projects/${p1}/milestones/${m1}`).set(as(alice)).send({ done: true });
    const bad = await request(app).post(`/side-projects/${p1}/updates`).set(as(alice)).send({ did: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.field).toBe("did");
    const u = await request(app).post(`/side-projects/${p1}/updates`).set(as(alice)).send({ did: "Wired the moisture sensor", nextSteps: "Build the dashboard", mood: 4 });
    expect(u.status).toBe(200);
    const d = (await request(app).get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.progress).toBe(50);
    expect(d.updates[0].did).toBe("Wired the moisture sensor");
    expect(d.milestones[0].done).toBe(true);
  });

  it("invites a teammate who can edit after accepting, but not delete", async () => {
    const inv = await request(app).post(`/side-projects/${p1}/members`).set(as(alice)).send({ regNumber: `SPB${bob}` });
    expect(inv.status).toBe(200);
    expect((await request(app).post(`/side-projects/${p1}/members`).set(as(alice)).send({ regNumber: "NOPE" })).body.code).toBe("STUDENT_NOT_FOUND");
    const invited = (await request(app).get("/side-projects/mine").set(as(bob))).body.data.find((c: any) => c.id === p1);
    expect(invited.myRole).toBe("INVITED");
    expect((await request(app).patch(`/side-projects/${p1}`).set(as(bob)).send({ description: "x" })).status).toBe(403);
    await request(app).post(`/side-projects/invitations/${p1}`).set(as(bob)).send({ accept: true });
    const edit = await request(app).patch(`/side-projects/${p1}`).set(as(bob)).send({ description: "Bob joined the team." });
    expect(edit.status).toBe(200);
    expect((await request(app).post(`/side-projects/${p1}/archive`).set(as(bob))).status).toBe(403);
  });
});

describe("monitor, review and supervision", () => {
  let p1: number, pc: number;
  beforeAll(async () => {
    p1 = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id = ${alice} AND title = 'Smart irrigation'`))[0].id;
    pc = await createProject(carol, "Robot sorter");
  });

  it("scopes the list to the viewer's classes", async () => {
    const t = await request(app).get("/side-projects/monitor/projects").set(as(teacherA));
    expect(t.status).toBe(200);
    const ids = t.body.data.rows.map((r: any) => r.id);
    expect(ids).toContain(p1);
    expect(ids).not.toContain(pc);
    const all = await request(app).get("/side-projects/monitor/projects?pageSize=200").set(as(lead));
    expect(all.body.data.rows.map((r: any) => r.id)).toEqual(expect.arrayContaining([p1, pc]));
    const row = all.body.data.rows.find((r: any) => r.id === p1);
    expect(row.student.regNumber).toBe(`SPA${alice}`);
    expect(row.class.id).toBe(classA);
    const filtered = await request(app).get(`/side-projects/monitor/projects?status=IN_PROGRESS&classId=${classA}&pageSize=200`).set(as(lead));
    expect(filtered.body.data.rows.every((r: any) => r.status === "IN_PROGRESS" && r.class.id === classA)).toBe(true);
    expect((await request(app).get(`/side-projects/monitor/projects/${pc}`).set(as(teacherA))).status).toBe(404);
    expect((await request(app).get("/side-projects/monitor/projects").set(as(outsider))).status).toBe(403);
  });

  it("gives summary-only viewers aggregates without names or projects", async () => {
    const s = await request(app).get("/side-projects/monitor/summary").set(as(insights));
    expect(s.status).toBe(200);
    expect(s.body.data.depth).toBe("summary");
    expect(s.body.data.totals.projects).toBeGreaterThanOrEqual(2);
    expect(s.body.data.attention).toEqual([]);
    expect(s.body.data.recentCompleted).toEqual([]);
    expect(s.body.data.byClass.every((c: any) => c.students >= 5 || c.name === "Other")).toBe(true);
    expect((await request(app).get("/side-projects/monitor/projects").set(as(insights))).status).toBe(403);
    expect((await request(app).get(`/side-projects/monitor/projects/${p1}`).set(as(insights))).status).toBe(404);
    const d = await request(app).get("/side-projects/monitor/summary").set(as(lead));
    expect(d.body.data.depth).toBe("detail");
    expect(d.body.data.months).toHaveLength(12);
    expect(d.body.data.weeks).toHaveLength(16);
    expect(d.body.data.topTech.some((t: any) => t.tag === "Arduino")).toBe(true);
  });

  it("reviews: changes requested, the student answers, completion, verification", async () => {
    const vNo = await request(app).post(`/side-projects/${p1}/review`).set(as(teacherA)).send({ kind: "VERIFIED" });
    expect(vNo.body.code).toBe("NOT_COMPLETED");
    const ch = await request(app).post(`/side-projects/${p1}/review`).set(as(teacherA)).send({ kind: "CHANGES_REQUESTED", body: "Add the SRS non-functional requirements." });
    expect(ch.status).toBe(200);
    let d = (await request(app).get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.reviewState).toBe("CHANGES_REQUESTED");
    const notes = rows(await db.execute(sql`SELECT kind FROM Notification WHERE user_id = ${alice} AND kind = 'side_project_changes_requested'`));
    expect(notes.length).toBe(1);
    await request(app).post(`/side-projects/${p1}/comments`).set(as(alice)).send({ body: "Added them, thanks!" });
    d = (await request(app).get(`/side-projects/${p1}`).set(as(alice))).body.data;
    expect(d.reviewState).toBe("NONE");
    const done = await request(app).post(`/side-projects/${p1}/transition`).set(as(alice)).send({ to: "COMPLETED", outcomeSummary: "The garden waters itself and logs moisture every hour." });
    expect(done.body.data.reviewState).toBe("AWAITING_VERIFICATION");
    expect((await request(app).post(`/side-projects/${pc}/review`).set(as(teacherA)).send({ kind: "COMMENT", body: "Nice" })).status).toBe(404);
    const ver = await request(app).post(`/side-projects/${p1}/review`).set(as(teacherA)).send({ kind: "VERIFIED" });
    expect(ver.status).toBe(200);
    d = (await request(app).get(`/side-projects/monitor/projects/${p1}`).set(as(lead))).body.data;
    expect(d).toMatchObject({ status: "COMPLETED", reviewState: "VERIFIED", progress: 100 });
    expect(d.verifiedBy).toBeTruthy();
    const audit = rows(await db.execute(sql`SELECT action_type FROM ActivityLog WHERE user_id = ${lead} AND action_type = 'SIDE_PROJECT_VIEW'`));
    expect(audit.length).toBeGreaterThan(0);
  });

  it("a supervisor sees and reviews only the projects they supervise", async () => {
    expect((await request(app).get(`/side-projects/monitor/projects/${pc}`).set(as(supervisor))).status).toBe(404);
    const set = await request(app).patch(`/side-projects/${pc}`).set(as(carol)).send({ supervisorId: supervisor });
    expect(set.status).toBe(200);
    expect((await request(app).get(`/side-projects/monitor/projects/${pc}`).set(as(supervisor))).status).toBe(200);
    expect((await request(app).get(`/side-projects/monitor/projects/${p1}`).set(as(supervisor))).status).toBe(404);
    const list = await request(app).get("/side-projects/monitor/projects?scope=supervising").set(as(supervisor));
    expect(list.body.data.rows.map((r: any) => r.id)).toEqual([pc]);
    const me = await request(app).get("/side-projects/me").set(as(supervisor));
    expect(me.body.data).toMatchObject({ view: null, supervising: 1 });
    expect((await request(app).post(`/side-projects/${pc}/review`).set(as(supervisor)).send({ kind: "COMMENT", body: "Great start" })).status).toBe(200);
    const badSup = await request(app).patch(`/side-projects/${pc}`).set(as(carol)).send({ supervisorId: bob });
    expect(badSup.body.field).toBe("supervisorId");
  });

  it("exports the filtered rows and audits it", async () => {
    const csv = await request(app).get("/side-projects/monitor/export?format=csv").set(as(lead));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("Reg. number");
    expect(csv.text).toContain(`SPA${alice}`);
    expect((await request(app).get("/side-projects/monitor/export").set(as(insights))).status).toBe(403);
    const audit = rows(await db.execute(sql`SELECT 1 FROM ActivityLog WHERE user_id = ${lead} AND action_type = 'SIDE_PROJECT_EXPORT'`));
    expect(audit.length).toBe(1);
  });

  it("lets the lead correct a status with a reason, archive and delete; others can't", async () => {
    expect((await request(app).patch(`/side-projects/admin/projects/${pc}/status`).set(as(teacherA)).send({ to: "COMPLETED", reason: "x" })).status).toBe(403);
    const noReason = await request(app).patch(`/side-projects/admin/projects/${pc}/status`).set(as(lead)).send({ to: "COMPLETED" });
    expect(noReason.body.code).toBe("REASON_REQUIRED");
    const fix = await request(app).patch(`/side-projects/admin/projects/${pc}/status`).set(as(lead)).send({ to: "COMPLETED", reason: "Demoed at the fair" });
    expect(fix.status).toBe(200);
    const ev = rows(await db.execute(sql`SELECT type FROM SideProjectEvent WHERE project_id = ${pc} AND type = 'CORRECTION'`));
    expect(ev.length).toBe(1);
  });
});

describe("delete rules, import and sweep", () => {
  it("a student deletes only an unreviewed idea", async () => {
    const idea = await createProject(carol, "Throwaway idea");
    expect((await request(app).delete(`/side-projects/${idea}`).set(as(carol))).status).toBe(200);
    expect((await request(app).get(`/side-projects/${idea}`).set(as(carol))).status).toBe(404);
    // the title is free again
    await createProject(carol, "Throwaway idea");
    const p1 = rows(await db.execute(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id = ${alice} AND title = 'Smart irrigation'`))[0].id;
    expect((await request(app).delete(`/side-projects/${p1}`).set(as(alice))).body.code).toBe("DELETE_NOT_ALLOWED");
  });

  it("imports by registration number with a dry run, then asks for the concept", async () => {
    const csv = [
      "registration_number,title,status,category,github_url",
      `SPB${bob},Bus tracker,In progress,mobile,https://github.com/nga/bus`,
      `NOPE999,Ghost project,Idea,,`,
      `SPB${bob},Bus tracker,Idea,,`,
      `SPC${carol},Solar charger,Weird,,`,
    ].join("\n");
    const dry = await request(app).post("/side-projects/admin/import").set(as(lead)).attach("file", Buffer.from(csv), "list.csv");
    expect(dry.status, JSON.stringify(dry.body)).toBe(200);
    expect(dry.body.data).toMatchObject({ dryRun: true, total: 4, valid: 1, invalid: 3 });
    expect((await request(app).post("/side-projects/admin/import").set(as(teacherA)).attach("file", Buffer.from(csv), "list.csv")).status).toBe(403);
    const go = await request(app).post("/side-projects/admin/import?dryRun=0").set(as(lead)).attach("file", Buffer.from(csv), "list.csv");
    expect(go.body.data.valid).toBe(1);
    const p = rows(await db.execute(sql`SELECT project_id, status, concept_pending FROM SideProject WHERE owner_user_id = ${bob} AND title = 'Bus tracker'`))[0];
    expect(p).toMatchObject({ status: "IN_PROGRESS", concept_pending: 1 });
    // Concept pending: can't be moved forward until the concept arrives.
    await request(app).post(`/side-projects/${p.project_id}/transition`).set(as(bob)).send({ to: "IDEA" });
    const blocked = await request(app).post(`/side-projects/${p.project_id}/transition`).set(as(bob)).send({ to: "IN_PROGRESS" });
    expect(blocked.body.code).toBe("CONCEPT_REQUIRED");
    await request(app).post(`/side-projects/${p.project_id}/documents/concept`).set(as(bob)).attach("file", pdf(), "c.pdf");
    expect((await request(app).post(`/side-projects/${p.project_id}/transition`).set(as(bob)).send({ to: "IN_PROGRESS" })).status).toBe(200);
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
    const lm = await request(app).get(`/side-projects/monitor/projects?health=STALE&pageSize=200`).set(as(lead));
    expect(lm.body.data.rows.map((r: any) => r.id)).toContain(pc);
  });
});
