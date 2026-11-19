// Git-driven reporting (GIT_AUTOMATED_REPORTING_ANALYSIS.md, migration 139): task keys and refs,
// hour estimates, the signed webhook with a fake GitHub, repository connection and identity,
// status automations (and the own-work rule), living drafts and their submission, the Friday
// notice / auto-submit / one-tap action, reconcile, TMCode editor time and the MCP tools.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import express from "express";
import http from "http";
import request from "supertest";
import { sql } from "drizzle-orm";
import { installFakeFileServer } from "../test/fakeFileServer";

installFakeFileServer();

import { db } from "../db";
import { createAcademicPeriod, createProgramGradeClassGroupDetailed, createStudentClassGroup, createUser } from "../test/fixtures";
import { buildPdf } from "../test/pdfFixture";
import { sideProjectsRouter } from "../routes/sideProjects";
import { sideProjectsGitRouter } from "../routes/sideProjectsGit";
import { githubIntegrationRouter } from "../routes/githubIntegration";
import type { Viewer } from "../services/sideProjects/access";
import { branchName, cleanTitle, closingRefs, findRefs, isBot, isIgnoredPath, noreplyId, parseCommands, suggestKey } from "../services/sideProjects/git/refs";
import { dayMinutes, estimateByTask } from "../services/sideProjects/git/hours";
import { setGitHubFetch, verifySignature } from "../services/sideProjects/git/github";
import { pickLink, readState, routeInstallation, settingsOf, signState } from "../services/sideProjects/git/store";
import { controlPool } from "../db/platform";
import { processPending } from "../services/sideProjects/git/ingest";
import { autoSubmitDrafts, isFridayNoticeTime, notifyDrafts, reconcile } from "../services/sideProjects/git/jobs";
import { tasksOf } from "../services/sideProjects/work";
import { misTool } from "../services/mcp/tools";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const q = async (s: any) => rows(await db.execute(s));
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// ── a fake GitHub ──────────────────────────────────────────────────────────
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const SECRET = "test-webhook-secret";
process.env.GITHUB_APP_ID = "12345";
process.env.GITHUB_APP_SLUG = "nga-projects-test";
process.env.GITHUB_APP_PRIVATE_KEY = (privateKey as string).replace(/\n/g, "\\n");
process.env.GITHUB_WEBHOOK_SECRET = SECRET;
process.env.GITHUB_CLIENT_ID = "client";
process.env.GITHUB_CLIENT_SECRET = "client-secret";
process.env.GITHUB_API_URL = "https://gh.test";
process.env.GITHUB_WEB_URL = "https://ghweb.test";

const INST = 900001;
const REPO = { id: 700001, full_name: "aimee/farm-orders", html_url: "https://github.com/aimee/farm-orders", default_branch: "main", private: true };
const ghCalls: string[] = [];
const fakeCommits: any[] = [];
const fakePulls: any[] = [];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
setGitHubFetch((async (input: any, init: any = {}) => {
  const url = String(input);
  ghCalls.push(`${init.method ?? "GET"} ${url}`);
  if (url.endsWith(`/app/installations/${INST}/access_tokens`)) return json({ token: "inst-token" });
  if (url.endsWith(`/app/installations/${INST}`)) return json({ id: INST, account: { id: 1, login: "aimee", type: "User" } });
  if (url.includes("/installation/repositories")) return json({ repositories: [REPO] });
  if (url.includes(`/repos/${REPO.full_name}/commits`)) return json(fakeCommits);
  if (url.includes(`/repos/${REPO.full_name}/pulls`)) return json(fakePulls);
  if (url.includes("/check-runs")) return json({ id: 1 }, 201);
  if (url.endsWith("/login/oauth/access_token")) return json({ access_token: "user-token" });
  if (url.endsWith("/user")) return json({ id: 4242, login: "member-gh", name: "Member", avatar_url: null });
  if (url.endsWith("/user/emails")) return json([{ email: "member@dev.test", verified: true }]);
  return json({ message: "not found" }, 404);
}) as any);

// ── app under test ─────────────────────────────────────────────────────────
const owners = new Set<number>();
const viewers = new Map<number, Partial<Viewer>>();
const testAuth = (req: any, res: any, next: any) => {
  const id = Number(req.get("X-Test-User"));
  if (!id) return res.status(401).end();
  req.user = { userId: id, permissions: [...(owners.has(id) ? ["SIDE_PROJECTS_MANAGE_OWN"] : []), "SIDE_PROJECTS_CLASSIFY"] };
  next();
};
const viewerOf = async (req: any) => ({ userId: Number(req.user.userId), summary: null, detail: null, review: null, manageAny: false, ...(viewers.get(Number(req.user.userId)) ?? {}) }) as Viewer;
const app = express();
app.use("/integrations/github", githubIntegrationRouter());
app.use(express.json());
app.use("/side-projects/git", sideProjectsGitRouter(testAuth, viewerOf));
app.use("/side-projects", sideProjectsRouter(testAuth, (req: any, res, next) => (owners.has(Number(req.user.userId)) ? next() : res.status(403).end()), viewerOf, (_req, _res, next) => next()));
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ success: false, message: String(err?.message ?? err), sql: err?.sqlMessage }));
let server: http.Server;
const api = () => request(server);
const as = (id: number) => ({ "X-Test-User": String(id) });

const sign = (body: string) => `sha256=${crypto.createHmac("sha256", SECRET).update(body).digest("hex")}`;
let deliveries = 0;
async function deliver(event: string, payload: any, opts: { delivery?: string } = {}) {
  const body = JSON.stringify({ installation: { id: INST }, repository: { id: REPO.id, full_name: REPO.full_name }, ...payload });
  const delivery = opts.delivery ?? `d-${Date.now()}-${++deliveries}`;
  const r = await api().post("/integrations/github/webhook").set("Content-Type", "application/json").set("X-GitHub-Event", event).set("X-GitHub-Delivery", delivery).set("X-Hub-Signature-256", sign(body)).send(body);
  for (let i = 0; i < 60; i++) {
    const [ev] = await q(sql`SELECT processed_at FROM GitEvent WHERE delivery_id = ${delivery}`);
    if (!ev || ev.processed_at) break;
    await new Promise((res) => setTimeout(res, 50));
  }
  await processPending();
  return r;
}

let yearId: number, prevCurrent: number[];
let owner: number, member: number, other: number, outsider: number, staffLead: number, staffDev: number;
let projectId: number, studioId: number, key: string;
const tasks: Record<string, number> = {};
const users: number[] = [];

async function createProject(by: number, title: string) {
  const cat = (await q(sql`SELECT category_id FROM SideProjectCategory WHERE slug = 'web'`))[0]?.category_id ?? (await q(sql`SELECT category_id FROM SideProjectCategory LIMIT 1`))[0].category_id;
  const r = await api()
    .post("/side-projects")
    .set(as(by))
    .field("title", title)
    .field("problemStatement", "Shops order by phone and WhatsApp so orders get lost and deliveries are late.")
    .field("abstract", "A web app where shops order vegetables online and farmers see each day's orders in one place.")
    .field("startDate", day(-20))
    .field("targetDate", day(60))
    .field("status", "IN_PROGRESS")
    .field("categoryId", String(cat))
    .attach("concept", buildPdf("Concept: farm orders portal."), "concept.pdf");
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.id as number;
}
async function addTask(pid: number, by: number, title: string, assigneeId: number | null) {
  const plan = await api().get(`/side-projects/${pid}/plan`).set(as(by));
  const feature = plan.body.data.items.find((i: any) => i.kind === "FEATURE");
  const r = await api().post(`/side-projects/${pid}/tasks`).set(as(by)).send({ title, planItemId: feature.id, assigneeId, priority: "MEDIUM" });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.id as number;
}
const taskStatus = async (id: number) => (await q(sql`SELECT status, assignee_user_id FROM SideProjectTask WHERE task_id = ${id}`))[0];
const commit = (id: string, message: string, extra: any = {}) => ({
  id: id.padEnd(40, "0"),
  message,
  timestamp: extra.timestamp ?? new Date().toISOString(),
  url: `https://github.com/${REPO.full_name}/commit/${id}`,
  author: { username: extra.username ?? "member-gh", email: extra.email ?? "member@dev.test", name: extra.name ?? "Member" },
  added: extra.added ?? ["src/order.ts"],
  removed: [],
  modified: extra.modified ?? [],
});

beforeAll(async () => {
  server = await new Promise<http.Server>((resolve) => {
    const srv = http.createServer(app).listen(0, "127.0.0.1", () => resolve(srv));
  });
  prevCurrent = (await q(sql`SELECT academic_year_id AS id FROM AcademicYear WHERE is_current = 1`)).map((r) => Number(r.id));
  ({ academicYearId: yearId } = await createAcademicPeriod());
  await db.execute(sql`UPDATE AcademicYear SET is_current = IF(academic_year_id = ${yearId}, 1, 0)`);
  const cls = (await createProgramGradeClassGroupDetailed()).classGroupId;
  owner = await createUser({ userType: "STUDENT" });
  member = await createUser({ userType: "STUDENT" });
  other = await createUser({ userType: "STUDENT" });
  outsider = await createUser({ userType: "STUDENT" });
  staffLead = await createUser({ userType: "STAFF" });
  staffDev = await createUser({ userType: "STAFF" });
  users.push(owner, member, other, outsider, staffLead, staffDev);
  for (const u of users) owners.add(u);
  for (const u of [owner, member, other, outsider]) {
    await db.execute(sql`UPDATE UserProfile SET registration_number = ${`GIT${u}`} WHERE user_id = ${u}`);
    await createStudentClassGroup({ userId: u, classGroupId: cls, academicYearId: yearId });
  }
  projectId = await createProject(owner, `Farm orders ${Date.now()}`);
  await api().post(`/side-projects/${projectId}/plan/generate`).set(as(owner)).send({ template: "web" });
  for (const u of [member, other]) {
    expect((await api().post(`/side-projects/${projectId}/members`).set(as(owner)).send({ userId: u, roleKey: "DEVELOPER", roleTitle: "Developer" })).status).toBe(200);
    expect((await api().post(`/side-projects/invitations/${projectId}`).set(as(u)).send({ accept: true })).status).toBe(200);
  }
  tasks.form = await addTask(projectId, owner, "Build the shop order form", member);
  tasks.list = await addTask(projectId, owner, "Farmer's daily orders list", null);
  tasks.others = await addTask(projectId, owner, "Delivery board", other);
  tasks.review = await addTask(projectId, owner, "Order history page", member);
  // The install flow routes the installation to this tenant (a no-op without a control plane).
  await routeInstallation(INST, 1, "aimee");
  // The member installed the app on their own account (personal account, no organisation).
  await db.execute(sql`INSERT INTO GitInstallation (installation_id, account_login, account_type, installed_by, created_at, updated_at)
                       VALUES (${INST}, 'aimee', 'User', ${owner}, UTC_TIMESTAMP(), UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE installed_by = VALUES(installed_by), removed_at = NULL`);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  setGitHubFetch(null);
  const ul = sql.join(users.map((i) => sql`${i}`), sql`, `);
  const ids = (await q(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id IN (${ul})`)).map((r) => Number(r.id));
  if (ids.length) {
    const pl = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    const tl = (await q(sql`SELECT task_id AS id FROM SideProjectTask WHERE project_id IN (${pl})`)).map((r) => Number(r.id));
    if (tl.length) {
      const tj = sql.join(tl.map((i) => sql`${i}`), sql`, `);
      await db.execute(sql`DELETE FROM SideProjectTaskLog WHERE task_id IN (${tj})`);
      await db.execute(sql`DELETE FROM SideProjectTaskEvent WHERE task_id IN (${tj})`);
    }
    const ups = (await q(sql`SELECT update_id AS id FROM SideProjectUpdate WHERE project_id IN (${pl})`)).map((r) => Number(r.id));
    if (ups.length) await db.execute(sql`DELETE FROM SideProjectUpdateWork WHERE update_id IN (${sql.join(ups.map((i) => sql`${i}`), sql`, `)})`);
    for (const t of ["GitCommit", "GitBranch", "GitPullRequest", "GitRepoLink", "GitEditorActivity", "SideProjectReportDraft", "SideProjectTask", "SideProjectPlanItem", "SideProjectDocument", "SideProjectUpdate", "SideProjectEvent", "SideProjectComment", "SideProjectMember", "SideProjectStageLog"]) {
      await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE project_id IN (${pl})`).catch(() => undefined);
    }
    await db.execute(sql`DELETE FROM SideProject WHERE project_id IN (${pl})`);
  }
  await db.execute(sql`DELETE FROM GitIdentity WHERE user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM GitInstallation WHERE installation_id = ${INST}`);
  await controlPool().query("DELETE FROM GitHubInstallationRoute WHERE installation_id = ?", [INST]).catch(() => undefined);
  await db.execute(sql`DELETE FROM GitEvent WHERE installation_id = ${INST} OR repo_id = ${REPO.id}`);
  await db.execute(sql`DELETE FROM GitAuthorMap WHERE key_value IN ('stranger@else.test', 'stranger-gh')`);
  await db.execute(sql`DELETE FROM FileAsset WHERE owner_user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM StudentClassGroup WHERE user_id IN (${ul})`);
  await db.execute(sql`UPDATE AcademicYear SET is_current = 0 WHERE academic_year_id = ${yearId}`);
  if (prevCurrent.length) await db.execute(sql`UPDATE AcademicYear SET is_current = 1 WHERE academic_year_id IN (${sql.join(prevCurrent.map((i) => sql`${i}`), sql`, `)})`);
});

describe("task keys, references and commands", () => {
  it("finds KEY-n (any case), bare #n only when allowed, and closing words", () => {
    expect(findRefs("feat/FOP-27-order-form", "FOP")).toEqual([27]);
    expect(findRefs("fop-27 and FOP-128, not XFOP-9", "FOP")).toEqual([27, 128]);
    expect(findRefs("fix #12 now", "FOP")).toEqual([]);
    expect(findRefs("fix #12 now", "FOP", { allowBare: true })).toEqual([12]);
    expect(closingRefs("Closes FOP-27, fixes #30", "FOP").sort()).toEqual([27, 30]);
  });
  it("parses commit commands", () => {
    expect(parseCommands("FOP-1 add form #time 1h30m").timeHours).toBe(1.5);
    expect(parseCommands("#time 45m").timeHours).toBe(1); // rounded to half hours
    expect(parseCommands("FOP-1 #blocked waiting for the API key").blocked).toBe("waiting for the API key");
    expect(parseCommands("done it #done").done).toBe(true);
    expect(parseCommands("#review please").review).toBe(true);
  });
  it("builds branch names, clean titles and keys", () => {
    expect(branchName("FOP", 27, "Build the shop order form!")).toBe("feat/FOP-27-build-the-shop-order-form");
    expect(branchName(null, 5, "Café menu")).toBe("feat/task-5-cafe-menu");
    expect(cleanTitle("feat(api): FOP-27 add quantity validation. #time 1h", "FOP")).toBe("Add quantity validation");
    expect(suggestKey("Farm Orders Portal")).toBe("FOP");
    expect(suggestKey("the app")).toMatch(/^[A-Z]{2,5}$/);
    expect(noreplyId("12345+someone@users.noreply.github.com")).toBe(12345);
    expect(isBot("dependabot[bot]")).toBe(true);
    expect(isIgnoredPath("package-lock.json")).toBe(true);
    expect(isIgnoredPath("web/dist/app.js")).toBe(true);
    expect(isIgnoredPath("src/app.ts")).toBe(false);
    expect(isIgnoredPath("docs/gen/a.md", ["docs/gen/"])).toBe(true);
  });
  it("defaults: Delivery Studio auto-submits after 2 days, students never", () => {
    expect(settingsOf(null, "DELIVERY_STUDIO").autoSubmitDays).toBe(2);
    expect(settingsOf(null, "STUDENT").autoSubmitDays).toBeNull();
    expect(settingsOf(JSON.stringify({ autoSubmitDays: null }), "DELIVERY_STUDIO").autoSubmitDays).toBeNull();
    expect(settingsOf(null, "STUDENT").automations).toBe(true);
  });
  it("routes monorepo commits by path prefix", () => {
    const base = { linkId: 1, repoId: 1, fullName: "a/b", htmlUrl: "", installationId: 1, defaultBranch: "main", settings: settingsOf(null), taskKey: "A", title: "x", kind: "STUDENT" };
    const web = { ...base, projectId: 1, pathPrefix: "web/" };
    const api2 = { ...base, projectId: 2, pathPrefix: "api/" };
    expect(pickLink([web, api2], ["api/x.ts", "api/y.ts"])?.projectId).toBe(2);
    expect(pickLink([web], ["anything"])?.projectId).toBe(1);
  });
});

describe("hour estimates", () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 18, h, m));
  it("sessions: gaps up to 2 h continue, each session adds 30 min, capped at 10 h", () => {
    expect(dayMinutes([at(8)])).toBe(30);
    expect(dayMinutes([at(8), at(9)])).toBe(90);
    expect(dayMinutes([at(8), at(9), at(13)])).toBe(120); // 30 + 60 + new session 30
    expect(dayMinutes(Array.from({ length: 30 }, (_, i) => at(0, i * 30)))).toBe(600);
  });
  it("shares a day across tasks by weight, in half hours", () => {
    const m = estimateByTask([
      { at: at(8), taskKey: "1", weight: 1 },
      { at: at(9), taskKey: "1", weight: 1 },
      { at: at(10), taskKey: "2", weight: 2 },
    ]);
    expect(m.get("1")).toBe(1.5); // 150 min * 2/4 = 75 min -> 1.5 h
    expect(m.get("2")).toBe(1.5);
  });
});

describe("signatures and signed state", () => {
  it("verifies X-Hub-Signature-256 in constant time", () => {
    const raw = Buffer.from('{"a":1}');
    expect(verifySignature(raw, sign('{"a":1}'), SECRET)).toBe(true);
    expect(verifySignature(raw, sign('{"a":2}'), SECRET)).toBe(false);
    expect(verifySignature(raw, undefined, SECRET)).toBe(false);
  });
  it("signs and expires state", () => {
    const s = signState({ k: "oauth", u: 7 });
    expect(readState(s)?.u).toBe(7);
    expect(readState(s.replace(/.$/, s.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(readState(signState({ u: 1 }, -5))).toBeNull();
  });
});

describe("webhook endpoint", () => {
  it("refuses bad signatures, answers ping, ignores repeats", async () => {
    const bad = await api().post("/integrations/github/webhook").set("Content-Type", "application/json").set("X-GitHub-Event", "push").set("X-GitHub-Delivery", "x1").set("X-Hub-Signature-256", "sha256=00").send("{}");
    expect(bad.status).toBe(401);
    const ping = await api().post("/integrations/github/webhook").set("Content-Type", "application/json").set("X-GitHub-Event", "ping").set("X-GitHub-Delivery", "x2").set("X-Hub-Signature-256", sign("{}")).send("{}");
    expect(ping.status).toBe(200);
    const first = await deliver("delete", { ref_type: "tag", ref: "v1" }, { delivery: "dup-delivery" });
    expect(first.body.queued).toBe(true);
    const again = await deliver("delete", { ref_type: "tag", ref: "v1" }, { delivery: "dup-delivery" });
    expect(again.status).toBe(202);
    expect(again.body.queued).toBe(false);
  });
});

describe("connecting the repository and people", () => {
  it("only the owner or a manager connects; the key is created from the title", async () => {
    const m1 = await api().post(`/side-projects/git/projects/${projectId}/connect`).set(as(member)).send({ installationId: INST, repoId: REPO.id });
    expect(m1.status, JSON.stringify(m1.body)).toBe(403);
    const r = await api().post(`/side-projects/git/projects/${projectId}/connect`).set(as(owner)).send({ installationId: INST, repoId: REPO.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const panel = await api().get(`/side-projects/git/projects/${projectId}`).set(as(owner));
    expect(panel.body.data.link.fullName).toBe(REPO.full_name);
    key = panel.body.data.taskKey;
    expect(key).toMatch(/^[A-Z]{2,5}$/);
    expect((await api().get(`/side-projects/git/projects/${projectId}`).set(as(outsider))).status).toBe(404); // not on the team: not even shown
  });
  it("validates the task key", async () => {
    expect((await api().patch(`/side-projects/git/projects/${projectId}/settings`).set(as(owner)).send({ taskKey: "x1" })).status).toBe(400);
    const r = await api().patch(`/side-projects/git/projects/${projectId}/settings`).set(as(owner)).send({ taskKey: key });
    expect(r.status).toBe(200);
  });
  it("Connect GitHub: OAuth round trip stores the identity (no token kept)", async () => {
    const u = await api().get("/side-projects/git/connect-url").query({ returnTo: `/my-projects?project=${projectId}&tab=github` }).set(as(member));
    expect(u.status).toBe(200);
    const state = new URL(u.body.data.url).searchParams.get("state")!;
    const cb = await api().get("/integrations/github/oauth/callback").query({ code: "abc", state });
    expect(cb.status, cb.text.slice(0, 600)).toBe(302);
    expect(cb.headers.location).toContain("github=connected");
    const [idt] = await q(sql`SELECT login, emails FROM GitIdentity WHERE user_id = ${member}`);
    expect(idt.login).toBe("member-gh");
    expect(JSON.parse(idt.emails)).toEqual(["member@dev.test"]);
    expect((await api().get("/integrations/github/oauth/callback").query({ code: "abc", state: "forged.sig" })).status).toBe(400);
  });
  it("task Development info: branch name and command", async () => {
    const r = await api().get(`/side-projects/git/projects/${projectId}/tasks/${tasks.form}`).set(as(member));
    expect(r.body.data.key).toBe(`${key}-${tasks.form}`);
    expect(r.body.data.branchName).toBe(`feat/${key}-${tasks.form}-build-the-shop-order-form`);
    expect(r.body.data.command).toBe(`git switch -c ${r.body.data.branchName}`);
  });
});

describe("automations", () => {
  it("a branch for a task starts it (and an unassigned task becomes yours)", async () => {
    await deliver("create", { ref_type: "branch", ref: `feat/${key}-${tasks.form}-order-form`, sender: { login: "member-gh", id: 4242 } });
    expect((await taskStatus(tasks.form)).status).toBe("IN_PROGRESS");
    await deliver("create", { ref_type: "branch", ref: `feat/${key}-${tasks.list}-daily-list`, sender: { login: "member-gh", id: 4242 } });
    const t = await taskStatus(tasks.list);
    expect(t.status).toBe("IN_PROGRESS");
    expect(Number(t.assignee_user_id)).toBe(member);
  });
  it("own-work rule: someone else's task never moves", async () => {
    await deliver("create", { ref_type: "branch", ref: `feat/${key}-${tasks.others}-board`, sender: { login: "member-gh", id: 4242 } });
    expect((await taskStatus(tasks.others)).status).toBe("TODO");
  });
  it("push: commits link to tasks; bots, lockfile-only and unknown authors are handled", async () => {
    const now = Date.now();
    await deliver("push", {
      ref: `refs/heads/feat/${key}-${tasks.form}-order-form`,
      sender: { login: "member-gh", id: 4242 },
      commits: [
        commit("a1", "Add product list", { timestamp: new Date(now - 90 * 60_000).toISOString() }),
        commit("a2", `Quantity validation #time 1h30m`, { timestamp: new Date(now - 30 * 60_000).toISOString() }),
        commit("a3", "Update lockfile", { added: [], modified: ["package-lock.json"] }),
        commit("a4", "Bump deps", { username: "dependabot[bot]", email: "49699333+dependabot[bot]@users.noreply.github.com" }),
        commit("a5", `${key}-${tasks.form} tweak styles`, { username: "stranger-gh", email: "stranger@else.test", name: "Stranger" }),
      ],
    });
    const c = await q(sql`SELECT sha, author_user_id, task_id, counted, time_hint FROM GitCommit WHERE project_id = ${projectId} ORDER BY sha`);
    const by = (p: string) => c.find((x) => x.sha.startsWith(p));
    expect(Number(by("a1").author_user_id)).toBe(member);
    expect(Number(by("a1").task_id)).toBe(tasks.form);
    expect(Number(by("a2").time_hint)).toBe(1.5);
    expect(Number(by("a3").counted)).toBe(0);
    expect(Number(by("a4").counted)).toBe(0);
    expect(by("a5").author_user_id).toBeNull();
    expect(Number(by("a5").counted)).toBe(1);
  });
  it("a rebased copy of a commit isn't counted twice", async () => {
    const [orig] = await q(sql`SELECT authored_at FROM GitCommit WHERE sha LIKE 'a1%' AND project_id = ${projectId}`);
    await deliver("push", { ref: `refs/heads/feat/${key}-${tasks.form}-order-form`, sender: { login: "member-gh" }, commits: [commit("b1", "Add product list", { timestamp: new Date(String(orig.authored_at).replace(" ", "T") + (String(orig.authored_at).endsWith("Z") ? "" : "Z")).toISOString() })] });
    const [b1] = await q(sql`SELECT counted FROM GitCommit WHERE sha LIKE 'b1%' AND project_id = ${projectId}`);
    expect(Number(b1.counted)).toBe(0);
  });
  it("pull request: opened → In review, changes requested → In progress (author told), merged → Done", async () => {
    const pr = { number: 12, title: `${key}-${tasks.form} Shop order form`, body: `Closes ${key}-${tasks.review}`, html_url: "https://github.com/x/pull/12", draft: false, state: "open", user: { login: "member-gh", id: 4242 }, head: { ref: `feat/${key}-${tasks.form}-order-form`, sha: "f".repeat(40) }, base: { ref: "main" }, created_at: new Date().toISOString() };
    await deliver("pull_request", { action: "opened", pull_request: pr });
    expect((await taskStatus(tasks.form)).status).toBe("IN_REVIEW");
    const plan = await tasksOf(sql`t.task_id = ${tasks.form}`);
    expect(plan[0].pr).toMatchObject({ number: 12, state: "OPEN" });
    await deliver("pull_request_review", { action: "submitted", pull_request: pr, review: { state: "changes_requested", body: "Validate negative quantities", user: { login: "owner-gh" } } });
    expect((await taskStatus(tasks.form)).status).toBe("IN_PROGRESS");
    const notes = await q(sql`SELECT kind FROM Notification WHERE user_id = ${member} AND kind = 'side_project_git_changes'`);
    expect(notes.length).toBeGreaterThan(0);
    await deliver("pull_request", { action: "ready_for_review", pull_request: pr });
    expect((await taskStatus(tasks.form)).status).toBe("IN_REVIEW");
    await deliver("pull_request", { action: "closed", pull_request: { ...pr, state: "closed", merged: true, merged_at: new Date().toISOString() } });
    expect((await taskStatus(tasks.form)).status).toBe("DONE");
    expect((await taskStatus(tasks.review)).status).toBe("DONE"); // closing words
  });
  it("commit commands block a task", async () => {
    await deliver("push", { ref: `refs/heads/feat/${key}-${tasks.list}-daily-list`, sender: { login: "member-gh" }, commits: [commit("c1", `${key}-${tasks.list} start list #blocked waiting for the orders API`)] });
    const t = await q(sql`SELECT status, blocked_reason FROM SideProjectTask WHERE task_id = ${tasks.list}`);
    expect(t[0].status).toBe("BLOCKED");
    expect(t[0].blocked_reason).toBe("waiting for the orders API");
  });
  it("automations can be switched off", async () => {
    await api().patch(`/side-projects/git/projects/${projectId}/settings`).set(as(owner)).send({ automations: false });
    const extra = await addTask(projectId, owner, "Invoice export", member);
    await deliver("create", { ref_type: "branch", ref: `feat/${key}-${extra}-invoices`, sender: { login: "member-gh", id: 4242 } });
    expect((await taskStatus(extra)).status).toBe("TODO");
    await api().patch(`/side-projects/git/projects/${projectId}/settings`).set(as(owner)).send({ automations: true });
  });
});

describe("unclaimed authors", () => {
  it("the owner maps an unknown author to a teammate", async () => {
    const panel = await api().get(`/side-projects/git/projects/${projectId}`).set(as(owner));
    const u = panel.body.data.unclaimed.find((x: any) => x.email === "stranger@else.test");
    expect(u.commits).toBe(1);
    expect((await api().post(`/side-projects/git/projects/${projectId}/authors`).set(as(member)).send({ email: u.email, userId: other })).status).toBe(403);
    const r = await api().post(`/side-projects/git/projects/${projectId}/authors`).set(as(owner)).send({ login: u.login, email: u.email, userId: other });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [c] = await q(sql`SELECT author_user_id FROM GitCommit WHERE sha LIKE 'a5%' AND project_id = ${projectId}`);
    expect(Number(c.author_user_id)).toBe(other);
  });
});

describe("drafts", () => {
  let draftId: number;
  it("the member's living draft groups work by task, with estimated hours and next steps", async () => {
    const r = await api().get(`/side-projects/git/projects/${projectId}/draft`).set(as(member));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const d = r.body.data.draft;
    draftId = d.id;
    expect(d.commitCount).toBeGreaterThanOrEqual(3);
    const form = d.lines.find((l: any) => l.taskId === tasks.form);
    expect(form.commits.map((c: any) => c.sha.slice(0, 2))).toEqual(expect.arrayContaining(["a1", "a2"]));
    expect(form.prs[0].number).toBe(12);
    expect(form.hours).toBe(2.5); // #time 1.5 h on a2, plus a1's share (1 h) of the session it shares with the list commit
    expect(form.hoursSource).toBe("COMMIT");
    expect(d.did).toContain("Build the shop order form");
    expect(d.did).toContain("Add product list");
    expect(d.did).not.toMatch(/#time/);
    expect(r.body.data.canPolish).toBe(false); // AI policy is off in tests
    // Only the person's own draft.
    expect((await api().patch(`/side-projects/git/drafts/${draftId}`).set(as(other)).send({ did: "x" })).status).toBe(404);
  });
  it("edits keep the person's choices across refreshes", async () => {
    const form = (await api().get(`/side-projects/git/projects/${projectId}/draft`).set(as(member))).body.data.draft.lines.find((l: any) => l.taskId === tasks.form);
    const r = await api().patch(`/side-projects/git/drafts/${draftId}`).set(as(member)).send({ did: "Built the order form and its validation.", lines: [{ key: form.key, hours: 3 }] });
    expect(r.status).toBe(200);
    expect((await api().patch(`/side-projects/git/drafts/${draftId}`).set(as(member)).send({ lines: [{ key: form.key, hours: 0.7 }] })).status).toBe(400);
    await deliver("push", { ref: `refs/heads/feat/${key}-${tasks.form}-order-form`, sender: { login: "member-gh" }, commits: [commit("d1", "Polish the form layout")] });
    const d = (await api().get(`/side-projects/git/projects/${projectId}/draft`).set(as(member))).body.data.draft;
    expect(d.did).toBe("Built the order form and its validation.");
    const line = d.lines.find((l: any) => l.taskId === tasks.form);
    expect(line.hours).toBe(3);
    expect(line.commits.some((c: any) => c.sha.startsWith("d1"))).toBe(true);
  });
  it("submitting writes a GIT report with evidence through the normal pipeline", async () => {
    const r = await api().post(`/side-projects/git/drafts/${draftId}/submit`).set(as(member)).send({});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const id = r.body.data.reportId;
    const [u] = await q(sql`SELECT source, did, hours FROM SideProjectUpdate WHERE update_id = ${id}`);
    expect(u.source).toBe("GIT");
    const work = await q(sql`SELECT task_id, hours, evidence, hours_source FROM SideProjectUpdateWork WHERE update_id = ${id}`);
    const line = work.find((w) => Number(w.task_id) === tasks.form);
    expect(Number(line.hours)).toBe(3);
    expect(line.hours_source).toBe("TYPED");
    expect(JSON.parse(line.evidence).prs).toEqual([12]);
    const logs = await q(sql`SELECT hours FROM SideProjectTaskLog WHERE update_id = ${id} AND task_id = ${tasks.form}`);
    expect(Number(logs[0].hours)).toBe(3);
    const [dr] = await q(sql`SELECT status, open_key FROM SideProjectReportDraft WHERE draft_id = ${draftId}`);
    expect(dr.status).toBe("SUBMITTED");
    expect(dr.open_key).toBeNull();
    // The feed shows where it came from.
    const detail = await api().get(`/side-projects/${projectId}`).set(as(owner));
    expect(detail.status, JSON.stringify(detail.body).slice(0, 400)).toBe(200);
    const rep = detail.body.data.updates.find((x: any) => x.id === id);
    expect(rep.source).toBe("GIT");
    expect(rep.work.find((w: any) => w.taskId === tasks.form).evidence.prs).toEqual([12]);
    // Nothing new since: no draft.
    expect((await api().get(`/side-projects/git/projects/${projectId}/draft`).set(as(member))).body.data.draft).toBeNull();
  });
  it("TMCode editing time becomes the hours of a line", async () => {
    await deliver("push", { ref: `refs/heads/feat/${key}-${tasks.form}-order-form`, sender: { login: "member-gh" }, commits: [commit("e1", "Fix rounding", { timestamp: new Date(Date.now() + 1000).toISOString() })] });
    expect((await api().post("/side-projects/git/editor-activity").set(as(outsider)).send({ repo: REPO.full_name, branch: "x", minutes: 30 })).status).toBe(403);
    const r = await api().post("/side-projects/git/editor-activity").set(as(member)).send({ repo: `https://github.com/${REPO.full_name}`, branch: `feat/${key}-${tasks.form}-order-form`, minutes: 125 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.taskId).toBe(tasks.form);
    const d = (await api().get(`/side-projects/git/projects/${projectId}/draft`).set(as(member))).body.data.draft;
    const line = d.lines.find((l: any) => l.taskId === tasks.form);
    expect(line.hoursSource).toBe("EDITOR");
    expect(line.hours).toBe(2);
  });
  it("Friday notice carries a signed one-tap submit that works without signing in", async () => {
    const friday = new Date("2026-11-20T15:00:00Z"); // 17:00 Kigali
    expect(isFridayNoticeTime(friday)).toBe(true);
    expect(isFridayNoticeTime(new Date("2026-11-18T15:00:00Z"))).toBe(false);
    expect(await notifyDrafts(new Date("2026-11-18T15:00:00Z"))).toBe(0);
    const sent = await notifyDrafts(friday);
    expect(sent).toBeGreaterThan(0);
    const [n] = await q(sql`SELECT title, link FROM Notification WHERE user_id = ${member} AND kind = 'side_project_git_draft' ORDER BY notification_id DESC LIMIT 1`);
    expect(n.title).toContain("Your report is ready");
    expect(await notifyDrafts(friday)).toBe(0); // once a week
    const [dr] = await q(sql`SELECT draft_id FROM SideProjectReportDraft WHERE project_id = ${projectId} AND user_id = ${member} AND status = 'OPEN'`);
    const token = signState({ d: Number(dr.draft_id), u: member, t: 1, a: "submit" });
    expect((await api().post("/integrations/github/drafts/action").query({ token: "nope.nope" })).status).toBe(400);
    const r = await api().post("/integrations/github/drafts/action").query({ token });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [u] = await q(sql`SELECT source FROM SideProjectUpdate WHERE update_id = ${r.body.data.reportId}`);
    expect(u.source).toBe("GIT");
    expect((await api().post("/integrations/github/drafts/action").query({ token })).status).toBe(404); // already submitted
  });
  it("Delivery Studio drafts auto-submit two days after the notice; student ones don't", async () => {
    studioId = await createProject(staffLead, `Studio portal ${Date.now()}`);
    await db.execute(sql`UPDATE SideProject SET kind = 'DELIVERY_STUDIO' WHERE project_id = ${studioId}`);
    await api().post(`/side-projects/${studioId}/plan/generate`).set(as(staffLead)).send({ template: "web" });
    await api().post(`/side-projects/${studioId}/members`).set(as(staffLead)).send({ userId: staffDev, roleKey: "DEVELOPER", roleTitle: "Developer" });
    await api().post(`/side-projects/invitations/${studioId}`).set(as(staffDev)).send({ accept: true });
    const t = await addTask(studioId, staffLead, "Orders API", staffDev);
    await db.execute(sql`INSERT INTO GitRepoLink (project_id, repo_id, full_name, html_url, installation_id, default_branch, status, created_at, updated_at)
                         VALUES (${studioId}, 700002, 'lead/studio', 'https://github.com/lead/studio', ${INST}, 'main', 'ACTIVE', UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    const k = (await api().get(`/side-projects/git/projects/${studioId}`).set(as(staffLead))).body.data.taskKey;
    await db.execute(sql`INSERT INTO GitIdentity (user_id, github_user_id, login, verified_at, created_at, updated_at) VALUES (${staffDev}, 5151, 'staff-dev', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())`);
    const body = JSON.stringify({ installation: { id: INST }, repository: { id: 700002 }, ref: `refs/heads/feat/${k}-${t}-api`, sender: { login: "staff-dev" }, commits: [commit("s1", "Orders endpoint", { username: "staff-dev", email: "dev@studio.test" })] });
    await api().post("/integrations/github/webhook").set("Content-Type", "application/json").set("X-GitHub-Event", "push").set("X-GitHub-Delivery", `studio-${Date.now()}`).set("X-Hub-Signature-256", sign(body)).send(body);
    await new Promise((r) => setTimeout(r, 300));
    await processPending();
    const d = (await api().get(`/side-projects/git/projects/${studioId}/draft`).set(as(staffDev))).body.data.draft;
    expect(d.lines[0].taskId).toBe(t);
    await db.execute(sql`UPDATE SideProjectReportDraft SET notified_at = UTC_TIMESTAMP() - INTERVAL 3 DAY WHERE draft_id = ${d.id}`);
    // The student project's open draft (if any) is also old, but never auto-submits.
    await db.execute(sql`UPDATE SideProjectReportDraft SET notified_at = UTC_TIMESTAMP() - INTERVAL 9 DAY WHERE project_id = ${projectId} AND status = 'OPEN'`);
    await autoSubmitDrafts();
    const [s] = await q(sql`SELECT status, auto_submitted, update_id FROM SideProjectReportDraft WHERE draft_id = ${d.id}`);
    expect(s.status).toBe("SUBMITTED");
    expect(Number(s.auto_submitted)).toBe(1);
    const [u] = await q(sql`SELECT source FROM SideProjectUpdate WHERE update_id = ${s.update_id}`);
    expect(u.source).toBe("GIT_AUTO");
    const studentOpen = await q(sql`SELECT status FROM SideProjectReportDraft WHERE project_id = ${projectId} AND auto_submitted = 1`);
    expect(studentOpen.length).toBe(0);
  });
});

describe("reconcile and MCP", () => {
  it("fills commits and merges missed by webhooks", async () => {
    const t = await addTask(projectId, owner, "Search orders", member);
    await db.execute(sql`UPDATE SideProjectTask SET status = 'IN_REVIEW' WHERE task_id = ${t}`);
    fakeCommits.splice(0, fakeCommits.length, { sha: "9".repeat(40), html_url: "https://github.com/x/c/9", commit: { message: `${key}-${t} search box`, author: { date: new Date().toISOString(), email: "member@dev.test", name: "Member" } }, author: { login: "member-gh" } });
    fakePulls.splice(0, fakePulls.length, { number: 31, title: `${key}-${t} Search`, body: "", html_url: "https://github.com/x/pull/31", draft: false, state: "closed", merged_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_at: new Date().toISOString(), user: { login: "member-gh", id: 4242 }, head: { ref: `feat/${key}-${t}-search` }, base: { ref: "main" } });
    await db.execute(sql`UPDATE GitRepoLink SET reconciled_at = NULL WHERE project_id = ${projectId}`);
    expect(await reconcile()).toBeGreaterThan(0);
    const [c] = await q(sql`SELECT task_id, author_user_id FROM GitCommit WHERE sha = ${"9".repeat(40)}`);
    expect(Number(c.task_id)).toBe(t);
    expect(Number(c.author_user_id)).toBe(member);
    expect((await taskStatus(t)).status).toBe("DONE");
  });
  it("MCP: read drafts and reword one, never submit", async () => {
    const list = await misTool("mis_get_my_project_report_drafts")!.run({ userId: member } as any, {});
    const drafts = list.result as any[];
    expect(Array.isArray(drafts)).toBe(true);
    if (drafts.length) {
      const out = await misTool("mis_update_project_report_draft")!.run({ userId: member } as any, { draft_id: drafts[0].draft_id, what_i_did: "Worked on search and the order form." });
      expect((out.result as any).submitted).toBe(false);
      const [d] = await q(sql`SELECT did, status FROM SideProjectReportDraft WHERE draft_id = ${drafts[0].draft_id}`);
      expect(d.did).toBe("Worked on search and the order form.");
      expect(d.status).toBe("OPEN");
    }
    await expect(misTool("mis_update_project_report_draft")!.run({ userId: outsider } as any, { draft_id: 999999999, what_i_did: "x" })).rejects.toThrow();
  });
});
