// Connect with a link (migration 141): no GitHub App on the server. Public and private (token)
// repositories, the polling sync (branches, commits, pull requests, ETags, rate limits), matching
// people by MIS email / typed username / "That's me", task suggestions and "pick once", and the
// draft catching up when it is opened — against the test database with a fake GitHub REST API.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import express from "express";
import http from "http";
import request from "supertest";
import { sql } from "drizzle-orm";
import { installFakeFileServer } from "../test/fakeFileServer";

installFakeFileServer();

import { db } from "../db";
import { createUser } from "../test/fixtures";
import { buildPdf } from "../test/pdfFixture";
import { sideProjectsRouter } from "../routes/sideProjects";
import { sideProjectsGitRouter } from "../routes/sideProjectsGit";
import type { Viewer } from "../services/sideProjects/access";
import { setGitHubFetch } from "../services/sideProjects/git/github";
import { syncDue } from "../services/sideProjects/git/linkMode";
import { suggestAuthor } from "../routes/sideProjectsGit";
import { findRefs } from "../services/sideProjects/git/refs";
import { roleOrder, setTestProviders } from "../services/aiProviders/registry";
import { AI_POLICY_ALL_ON, setAiPolicyForTests } from "../services/ai/policy";
import * as drafts from "../services/sideProjects/git/drafts";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const q = async (s: any) => rows(await db.execute(s));
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// ── a fake GitHub REST API (no app) ─────────────────────────────────────────
const APP_ENV = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_API_URL", "GITHUB_TOKEN", "AI_VAULT_KEK_CURRENT", "AI_VAULT_KEK_1"];
const savedEnv = Object.fromEntries(APP_ENV.map((k) => [k, process.env[k]]));
const PUB = { id: 810001, full_name: "aimee/orders-public", html_url: "https://github.com/aimee/orders-public", default_branch: "main", private: false };
const BIG = { id: 810003, full_name: "studio/big-monorepo", html_url: "https://github.com/studio/big-monorepo", default_branch: "main", private: false };
const MOB = { id: 810004, full_name: "aimee/orders-mobile", html_url: "https://github.com/aimee/orders-mobile", default_branch: "main", private: false };
const PRIV = { id: 810002, full_name: "studio/orders-private", html_url: "https://github.com/studio/orders-private", default_branch: "main", private: true };
const TOKEN = "github_pat_11AAAAAAA0123456789_abcdefghijklmnopqrstuvwxyz";
type FakeRepo = { branches: Array<{ name: string; sha: string }>; commits: Record<string, any[]>; pulls: any[]; files: Record<string, string[]>; events: any[] };
const fake: Record<string, FakeRepo> = {
  [PUB.full_name]: { branches: [], commits: {}, pulls: [], files: {}, events: [] },
  [PRIV.full_name]: { branches: [], commits: {}, pulls: [], files: {}, events: [] },
  [BIG.full_name]: { branches: [], commits: {}, pulls: [], files: {}, events: [] },
  [MOB.full_name]: { branches: [], commits: {}, pulls: [], files: {}, events: [] },
};
const calls: Array<{ url: string; auth: string | null; etag: string | null }> = [];
let limitHit = false;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const etagOf = (body: unknown) => `"${crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex")}"`;
const ghFetch = (async (input: any, init: any = {}) => {
  const url = new URL(String(input));
  const auth = init.headers?.Authorization ?? null;
  const inm = init.headers?.["If-None-Match"] ?? null;
  calls.push({ url: url.pathname + url.search, auth, etag: inm });
  if (limitHit) return json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 1800) });
  const m = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(url.pathname);
  if (url.pathname.startsWith("/users/")) {
    const login = url.pathname.slice(7);
    if (login === "nobody-here") return json({ message: "Not Found" }, 404);
    return json({ id: login === "jkarenzi" ? 5501 : 5502, login, name: login, avatar_url: null });
  }
  if (!m) return json({ message: "Not Found" }, 404);
  const meta = m[1] === PUB.full_name ? PUB : m[1] === PRIV.full_name ? PRIV : m[1] === BIG.full_name ? BIG : m[1] === MOB.full_name ? MOB : null;
  if (!meta || (meta.private && auth !== `Bearer ${TOKEN}`)) return json({ message: "Not Found" }, 404);
  const r = fake[meta.full_name];
  const rest = m[2] ?? "";
  if (!rest) return json(meta);
  const withEtag = (body: unknown) => {
    const e = etagOf(body);
    return inm === e ? new Response(null, { status: 304, headers: { etag: e } }) : json(body, 200, { etag: e });
  };
  if (rest === "/branches") {
    const page = Number(url.searchParams.get("page") || 1);
    const all = r.branches.map((b) => ({ name: b.name, commit: { sha: b.sha } }));
    const slice = all.slice((page - 1) * 100, page * 100);
    return page === 1 ? withEtag(slice) : json(slice);
  }
  if (rest === "/events") return json(r.events);
  if (rest === "/pulls") return withEtag(r.pulls);
  const one = /^\/commits\/([0-9a-f]+)$/.exec(rest);
  if (one) return json({ sha: one[1], files: (r.files[one[1]] ?? ["src/app.ts"]).map((filename) => ({ filename })) });
  if (rest === "/commits") return json([...(r.commits[url.searchParams.get("sha") ?? "main"] ?? [])].reverse());
  return json({ message: "Not Found" }, 404);
}) as any;

const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
/** Push commits onto a fake branch (newest last), moving its head. */
function push(repo: string, branch: string, list: Array<{ msg: string; login?: string | null; email: string; files?: string[]; minsAgo?: number }>) {
  const r = fake[repo];
  r.commits[branch] ??= [];
  for (const c of list) {
    const id = sha(`${repo}${branch}${c.msg}${Math.random()}`);
    r.commits[branch].push({
      sha: id,
      html_url: `https://github.com/${repo}/commit/${id}`,
      author: c.login ? { login: c.login } : null,
      commit: { message: c.msg, author: { name: c.login ?? c.email, email: c.email, date: new Date(Date.now() - (c.minsAgo ?? 30) * 60_000).toISOString() } },
    });
    if (c.files) r.files[id] = c.files;
  }
  const head = r.commits[branch][r.commits[branch].length - 1].sha;
  r.events.unshift({ type: "PushEvent", created_at: new Date().toISOString(), payload: { ref: `refs/heads/${branch}` } });
  const b = r.branches.find((x) => x.name === branch);
  if (b) b.sha = head;
  else r.branches.push({ name: branch, sha: head });
  return head;
}

// ── app under test ─────────────────────────────────────────────────────────
const users: number[] = [];
const testAuth = (req: any, res: any, next: any) => {
  const id = Number(req.get("X-Test-User"));
  if (!id) return res.status(401).end();
  req.user = { userId: id, permissions: ["SIDE_PROJECTS_MANAGE_OWN"] };
  next();
};
const managers = new Set<number>();
const viewerOf = async (req: any) => ({ userId: Number(req.user.userId), summary: null, detail: null, review: null, manageAny: managers.has(Number(req.user.userId)) }) as Viewer;
const app = express();
app.use(express.json());
app.use("/side-projects/git", sideProjectsGitRouter(testAuth, viewerOf));
app.use("/side-projects", sideProjectsRouter(testAuth, (_req, _res, next) => next(), viewerOf, (_req, _res, next) => next()));
app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ success: false, message: String(err?.message ?? err), sql: err?.sqlMessage }));
let server: http.Server;
const api = () => request(server);
const as = (id: number) => ({ "X-Test-User": String(id) });

let lead: number, dev: number, freelancer: number, projectsLead: number;
let pubProject: number, privProject: number, key: string;
const tasks: Record<string, number> = {};

async function createProject(by: number, title: string) {
  const r = await api()
    .post("/side-projects")
    .set(as(by))
    .field("title", title)
    .field("problemStatement", "Shops order by phone and WhatsApp so orders get lost and deliveries are late.")
    .field("abstract", "A web app where shops order vegetables online and farmers see each day's orders in one place.")
    .field("startDate", day(-20))
    .field("targetDate", day(60))
    .field("status", "IN_PROGRESS")
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
const status = async (id: number) => (await q(sql`SELECT status FROM SideProjectTask WHERE task_id = ${id}`))[0]?.status;

beforeAll(async () => {
  for (const k of APP_ENV) delete process.env[k];
  process.env.GITHUB_API_URL = "https://gh-rest.test";
  process.env.AI_VAULT_KEK_CURRENT = "1";
  process.env.AI_VAULT_KEK_1 = crypto.randomBytes(32).toString("base64");
  setGitHubFetch(ghFetch);
  server = await new Promise<http.Server>((resolve) => {
    const srv = http.createServer(app).listen(0, "127.0.0.1", () => resolve(srv));
  });
  lead = await createUser({ userType: "STAFF" });
  dev = await createUser({ userType: "STAFF" });
  freelancer = await createUser({ userType: "STAFF" });
  projectsLead = await createUser({ userType: "STAFF" });
  managers.add(projectsLead);
  users.push(lead, dev, freelancer, projectsLead);
  await db.execute(sql`UPDATE User SET email = ${`dev${dev}@studio.test`} WHERE user_id = ${dev}`);
  pubProject = await createProject(lead, `Orders public ${Date.now()}`);
  privProject = await createProject(lead, `Orders private ${Date.now()}`);
  for (const pid of [pubProject, privProject]) {
    await api().post(`/side-projects/${pid}/plan/generate`).set(as(lead)).send({ template: "web" });
    for (const u of [dev, freelancer]) {
      expect((await api().post(`/side-projects/${pid}/members`).set(as(lead)).send({ userId: u, roleKey: "DEVELOPER", roleTitle: "Developer" })).status).toBe(200);
      expect((await api().post(`/side-projects/invitations/${pid}`).set(as(u)).send({ accept: true })).status).toBe(200);
    }
  }
  tasks.form = await addTask(pubProject, lead, "Build the shop order form", dev);
  tasks.list = await addTask(pubProject, lead, "Farmer's daily orders list", dev);
  tasks.pay = await addTask(pubProject, lead, "Mobile money payments", dev);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  setGitHubFetch(null);
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const ul = sql.join(users.map((i) => sql`${i}`), sql`, `);
  const ids = (await q(sql`SELECT project_id AS id FROM SideProject WHERE owner_user_id IN (${ul})`)).map((r) => Number(r.id));
  if (ids.length) {
    const pl = sql.join(ids.map((i) => sql`${i}`), sql`, `);
    const tl = (await q(sql`SELECT task_id AS id FROM SideProjectTask WHERE project_id IN (${pl})`)).map((r) => Number(r.id));
    if (tl.length) await db.execute(sql`DELETE FROM SideProjectTaskEvent WHERE task_id IN (${sql.join(tl.map((i) => sql`${i}`), sql`, `)})`);
    for (const t of ["GitCommit", "GitBranch", "GitPullRequest", "GitRepoLink", "SideProjectReportDraft", "SideProjectTask", "SideProjectPlanItem", "SideProjectDocument", "SideProjectUpdate", "SideProjectEvent", "SideProjectMember", "SideProjectStageLog"]) {
      await db.execute(sql`DELETE FROM ${sql.raw(t)} WHERE project_id IN (${pl})`).catch(() => undefined);
    }
    await db.execute(sql`DELETE FROM SideProject WHERE project_id IN (${pl})`);
  }
  await db.execute(sql`DELETE FROM GitIdentity WHERE user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM GitAuthorMap WHERE key_value IN ('jean@laptop.local', 'jkarenzi')`);
  await db.execute(sql`DELETE FROM FileAsset WHERE owner_user_id IN (${ul})`);
  await db.execute(sql`DELETE FROM Notification WHERE user_id IN (${ul})`).catch(() => undefined);
});

describe("connect with a link (no app)", () => {
  it("the panel works without the app: link mode on, no app, project link suggested", async () => {
    await api().patch(`/side-projects/${pubProject}`).set(as(lead)).send({ githubUrl: PUB.html_url });
    const r = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(lead));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ enabled: true, appEnabled: false, vault: true, suggestedUrl: PUB.html_url, link: null });
    const s = await api().get("/side-projects/git/status").set(as(dev));
    expect(s.body.data).toMatchObject({ enabled: true, oauth: false });
  });

  it("a public repository connects at once and the first sync links branches, commits and people", async () => {
    key = (await q(sql`SELECT task_key FROM SideProject WHERE project_id = ${pubProject}`))[0]?.task_key;
    // Before connecting: the developer branches off for a task, and works on a branch without a key.
    push(PUB.full_name, "main", [{ msg: "Initial commit", email: "lead@else.test" }]);
    push(PUB.full_name, `feat/${key ?? "KEY"}-${tasks.form}-order-form`, [
      { msg: "Order form fields", email: `dev${dev}@studio.test`, minsAgo: 90 },
      { msg: "Validate quantities", email: `dev${dev}@studio.test`, minsAgo: 60 },
      { msg: "Update lockfile", email: `dev${dev}@studio.test`, files: ["package-lock.json"], minsAgo: 50 },
    ]);
    push(PUB.full_name, "feat/daily-list", [{ msg: "Daily orders list page", email: `dev${dev}@studio.test`, minsAgo: 20 }]);
    push(PUB.full_name, "feat/ui-polish", [{ msg: "Tidy the header", login: "jkarenzi", email: "jean@laptop.local", minsAgo: 10 }]);
    fake[PUB.full_name].pulls = [];

    const notManager = await api().post(`/side-projects/git/projects/${pubProject}/connect-link`).set(as(dev)).send({ url: PUB.html_url });
    expect(notManager.status).toBe(403);
    const r = await api().post(`/side-projects/git/projects/${pubProject}/connect-link`).set(as(lead)).send({ url: "github.com/aimee/orders-public.git" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.fullName).toBe(PUB.full_name);
    expect(r.body.data.sync.commits).toBeGreaterThanOrEqual(5);
    // Public: no token sent anywhere.
    expect(calls.every((c) => !c.auth)).toBe(true);

    key = (await q(sql`SELECT task_key FROM SideProject WHERE project_id = ${pubProject}`))[0].task_key;
    expect(await status(tasks.form)).toBe("IN_PROGRESS");
    const commits = await q(sql`SELECT title, author_user_id, task_id, counted, branch FROM GitCommit WHERE project_id = ${pubProject} ORDER BY commit_id`);
    const byTitle = Object.fromEntries(commits.map((c) => [c.title, c]));
    // Matched by the MIS email, no OAuth.
    expect(Number(byTitle["Order form fields"].author_user_id)).toBe(dev);
    expect(Number(byTitle["Order form fields"].task_id)).toBe(tasks.form);
    // Lockfile-only commit is not work (files were looked up).
    expect(Number(byTitle["Update lockfile"].counted)).toBe(0);
    expect(byTitle["Tidy the header"].author_user_id).toBeNull();

    const panel = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(freelancer));
    expect(panel.body.data.link).toMatchObject({ fullName: PUB.full_name, mode: "LINK", syncError: null });
    expect(panel.body.data.link.syncedAt).toBeTruthy();
    // Every teammate sees unmatched authors (to say "That's me").
    expect(panel.body.data.unclaimed.some((u: any) => u.login === "jkarenzi")).toBe(true);
  });

  it("the draft suggests the task for the unkeyed branch, and one pick links later commits", async () => {
    const d = await api().get(`/side-projects/git/projects/${pubProject}/draft?polish=0`).set(as(dev));
    expect(d.status, JSON.stringify(d.body)).toBe(200);
    const line = d.body.data.draft.lines.find((l: any) => l.key === "u:feat/daily-list");
    expect(line.suggestedTaskId).toBe(tasks.list);
    const e = await api().patch(`/side-projects/git/drafts/${d.body.data.draft.id}`).set(as(dev)).send({ lines: [{ key: line.key, taskId: tasks.list }] });
    expect(e.status, JSON.stringify(e.body)).toBe(200);
    expect(Number((await q(sql`SELECT task_id FROM GitBranch WHERE project_id = ${pubProject} AND name = 'feat/daily-list'`))[0].task_id)).toBe(tasks.list);
    // A later push on that branch needs no key and no pick.
    push(PUB.full_name, "feat/daily-list", [{ msg: "Sort the list by farmer", email: `dev${dev}@studio.test`, minsAgo: 1 }]);
    const s = await api().post(`/side-projects/git/projects/${pubProject}/sync`).set(as(dev));
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.data.commits).toBe(1);
    expect(Number((await q(sql`SELECT task_id FROM GitCommit WHERE project_id = ${pubProject} AND title = 'Sort the list by farmer'`))[0].task_id)).toBe(tasks.list);
    const again = await api().post(`/side-projects/git/projects/${pubProject}/sync`).set(as(dev));
    expect(again.status).toBe(429);
  });

  it("unchanged branches and pull requests cost a free 304; pull requests move tasks", async () => {
    calls.length = 0;
    await db.execute(sql`UPDATE GitRepoLink SET synced_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE project_id = ${pubProject}`);
    await syncDue();
    const branchCall = calls.find((c) => c.url.startsWith(`/repos/${PUB.full_name}/branches`));
    expect(branchCall?.etag).toBeTruthy();
    expect(calls.some((c) => c.url.includes("/commits?"))).toBe(false);

    fake[PUB.full_name].pulls = [
      { number: 4, title: `${key}-${tasks.form} Shop order form`, body: "", html_url: `${PUB.html_url}/pull/4`, state: "open", draft: false, merged_at: null, user: { login: null, id: null }, head: { ref: `feat/${key}-${tasks.form}-order-form`, sha: "f".repeat(40) }, base: { ref: "main" }, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), closed_at: null },
    ];
    await db.execute(sql`UPDATE GitRepoLink SET synced_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE project_id = ${pubProject}`);
    await syncDue();
    const pr = (await q(sql`SELECT state, task_ids FROM GitPullRequest WHERE project_id = ${pubProject} AND number = 4`))[0];
    expect(pr.state).toBe("OPEN");
    expect(JSON.parse(pr.task_ids)).toEqual([tasks.form]);
  });

  it("people match themselves: a typed GitHub username, or That's me on an email", async () => {
    const bad = await api().put("/side-projects/git/identity").set(as(freelancer)).send({ login: "nobody-here" });
    expect(bad.status).toBe(400);
    const ok = await api().put("/side-projects/git/identity").set(as(freelancer)).send({ login: "@jkarenzi" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(Number((await q(sql`SELECT author_user_id FROM GitCommit WHERE project_id = ${pubProject} AND title = 'Tidy the header'`))[0].author_user_id)).toBe(freelancer);
    // One GitHub account, one person.
    const taken = await api().put("/side-projects/git/identity").set(as(dev)).send({ login: "jkarenzi" });
    expect(taken.status).toBe(409);

    push(PUB.full_name, "feat/ui-polish", [{ msg: "Footer links", login: null, email: "jean@laptop.local", minsAgo: 1 }]);
    await db.execute(sql`UPDATE GitRepoLink SET synced_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE project_id = ${pubProject}`);
    await syncDue();
    const claim = await api().post(`/side-projects/git/projects/${pubProject}/authors/claim`).set(as(freelancer)).send({ email: "jean@laptop.local" });
    expect(claim.status, JSON.stringify(claim.body)).toBe(200);
    expect(Number((await q(sql`SELECT author_user_id FROM GitCommit WHERE project_id = ${pubProject} AND title = 'Footer links'`))[0].author_user_id)).toBe(freelancer);
    // Someone else can't take it now.
    push(PUB.full_name, "feat/ui-polish", [{ msg: "More footer", login: null, email: "jean@laptop.local", minsAgo: 1 }]);
    const steal = await api().post(`/side-projects/git/projects/${pubProject}/authors/claim`).set(as(dev)).send({ email: "jean@laptop.local" });
    expect([404, 409]).toContain(steal.status);
  });

  it("a private repository asks for a token, keeps it sealed, and uses it", async () => {
    push(PRIV.full_name, "main", [{ msg: "Start", email: `dev${dev}@studio.test` }]);
    const without = await api().post(`/side-projects/git/projects/${privProject}/connect-link`).set(as(lead)).send({ url: PRIV.html_url });
    expect(without.status).toBe(400);
    expect(without.body).toMatchObject({ code: "TOKEN_NEEDED", field: "token" });
    const junk = await api().post(`/side-projects/git/projects/${privProject}/connect-link`).set(as(lead)).send({ url: PRIV.html_url, token: "hello" });
    expect(junk.body.field).toBe("token");
    calls.length = 0;
    const r = await api().post(`/side-projects/git/projects/${privProject}/connect-link`).set(as(lead)).send({ url: PRIV.html_url, token: TOKEN });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.private).toBe(true);
    expect(calls.filter((c) => c.url.startsWith(`/repos/${PRIV.full_name}`)).every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
    const stored = (await q(sql`SELECT token_sealed, token_hint FROM GitRepoLink WHERE project_id = ${privProject}`))[0];
    expect(stored.token_sealed).not.toContain(TOKEN);
    const panel = await api().get(`/side-projects/git/projects/${privProject}`).set(as(lead));
    expect(JSON.stringify(panel.body)).not.toContain(TOKEN);
    expect(panel.body.data.link.tokenHint).toBeTruthy();
  });

});

describe("a repository with many branches", () => {
  it("connects within the hourly limit: old branches are the starting point, later pushes are read", async () => {
    const r = fake[BIG.full_name];
    // 150 branches nobody touched lately (no events), on a fresh repository.
    for (let i = 0; i < 150; i++) r.branches.push({ name: `old/feature-${i}`, sha: sha(`old${i}`) });
    r.events = [];
    push(BIG.full_name, "main", [{ msg: "Recent fix on main", email: `dev${dev}@studio.test` }]);
    const bigProject = await createProject(lead, `Big monorepo ${Date.now()}`);
    calls.length = 0;
    const c = await api().post(`/side-projects/git/projects/${bigProject}/connect-link`).set(as(lead)).send({ url: BIG.html_url });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const commitLists = calls.filter((x) => x.url.startsWith(`/repos/${BIG.full_name}/commits?`));
    // Only main was read, not 150 branches; the second page of branches was fetched.
    expect(commitLists.map((x) => new URLSearchParams(x.url.split("?")[1]).get("sha"))).toEqual(["main"]);
    expect(calls.some((x) => x.url.includes("/branches?per_page=100&page=2"))).toBe(true);
    expect(calls.length).toBeLessThan(15);
    // A push to an old branch afterwards is read on the next sync.
    push(BIG.full_name, "old/feature-7", [{ msg: "Back to feature 7", email: `dev${dev}@studio.test` }]);
    await db.execute(sql`UPDATE GitRepoLink SET synced_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE project_id = ${bigProject}`);
    await syncDue();
    expect((await q(sql`SELECT title FROM GitCommit WHERE project_id = ${bigProject} ORDER BY commit_id`)).map((x) => x.title)).toEqual(["Recent fix on main", "Back to feature 7"]);
  });
});

describe("an ecosystem of repositories", () => {
  it("connects several repositories to one project, applies settings to all, disconnects one", async () => {
    push(MOB.full_name, "main", [{ msg: "Mobile order screen", email: `dev${dev}@studio.test` }]);
    // The projects lead isn't on the team but manages every project: no more "Project not found".
    const r = await api().post(`/side-projects/git/projects/${pubProject}/connect-link`).set(as(projectsLead)).send({ url: MOB.html_url });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const panel = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(lead));
    expect(panel.body.data.links.map((l: any) => l.fullName)).toEqual([PUB.full_name, MOB.full_name]);
    expect(panel.body.data.link.fullName).toBe(PUB.full_name);
    expect(panel.body.data.links[1].commits).toBe(1);
    expect((await q(sql`SELECT COUNT(*) AS n FROM GitCommit WHERE project_id = ${pubProject} AND title = 'Mobile order screen'`))[0].n).toBe(1);
    // Settings are the project's: both repositories get them.
    const st = await api().patch(`/side-projects/git/projects/${pubProject}/settings`).set(as(lead)).send({ automations: false });
    expect(st.status, JSON.stringify(st.body)).toBe(200);
    const all = await q(sql`SELECT settings FROM GitRepoLink WHERE project_id = ${pubProject} AND status = 'ACTIVE'`);
    expect(all.length).toBe(2);
    expect(all.every((x) => JSON.parse(x.settings).automations === false)).toBe(true);
    await api().patch(`/side-projects/git/projects/${pubProject}/settings`).set(as(lead)).send({ automations: true });
    // Sync now covers every repository.
    push(MOB.full_name, "main", [{ msg: "Mobile cart", email: `dev${dev}@studio.test` }]);
    await new Promise((res) => setTimeout(res, 31_000));
    const s = await api().post(`/side-projects/git/projects/${pubProject}/sync`).set(as(dev));
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.body.data.repos).toBe(2);
    expect(s.body.data.commits).toBeGreaterThanOrEqual(1);
    // Disconnect just the mobile repository.
    const mobId = panel.body.data.links[1].linkId;
    expect((await api().delete(`/side-projects/git/projects/${pubProject}/link?linkId=${mobId}`).set(as(lead))).status).toBe(200);
    const after = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(lead));
    expect(after.body.data.links.map((l: any) => l.fullName)).toEqual([PUB.full_name]);
    // "That's me" stays the team's own.
    expect([403, 404]).toContain((await api().post(`/side-projects/git/projects/${pubProject}/authors/claim`).set(as(projectsLead)).send({ email: "x@y.test" })).status);
  }, 60_000);
});

describe("teammates' GitHub usernames", () => {
  const author = async (title: string) => (await q(sql`SELECT author_user_id FROM GitCommit WHERE project_id = ${pubProject} AND title = ${title}`))[0]?.author_user_id ?? null;
  const resync = async () => {
    await db.execute(sql`UPDATE GitRepoLink SET synced_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE project_id = ${pubProject}`);
    await syncDue();
  };

  it("the lead sets a member's username; their pushed commits become theirs", async () => {
    push(PUB.full_name, "main", [{ msg: "Delivery slots API", login: "kezo-dev", email: "kezo@home.test", minsAgo: 2 }]);
    await resync();
    expect(await author("Delivery slots API")).toBeNull();

    // A member can't set someone else's; nobody can for a person off the team.
    expect((await api().put(`/side-projects/git/projects/${pubProject}/team/${dev}/github`).set(as(freelancer)).send({ login: "kezo-dev" })).status).toBe(403);
    expect((await api().put(`/side-projects/git/projects/${pubProject}/team/${projectsLead}/github`).set(as(lead)).send({ login: "kezo-dev" })).status).toBe(404);
    expect((await api().put(`/side-projects/git/projects/${pubProject}/team/${freelancer}/github`).set(as(lead)).send({ login: "not a login!" })).status).toBe(400);

    const ok = await api().put(`/side-projects/git/projects/${pubProject}/team/${freelancer}/github`).set(as(lead)).send({ login: "https://github.com/kezo-dev" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data).toMatchObject({ login: "kezo-dev", verified: true });
    expect(Number(await author("Delivery slots API"))).toBe(freelancer);

    const panel = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(lead));
    const me = panel.body.data.team.find((t: any) => t.id === freelancer);
    expect(me).toMatchObject({ login: "kezo-dev", source: "LEAD", role: "MEMBER", verified: true });
    expect(me.commits).toBeGreaterThan(0);
    expect(panel.body.data.team.find((t: any) => t.id === lead).role).toBe("OWNER");
  });

  it("an account someone connected themself is theirs; they may change it", async () => {
    await db.execute(sql`
      INSERT INTO GitIdentity (user_id, github_user_id, login, source, verified_at, created_at, updated_at)
      VALUES (${dev}, 990001, 'dev-oauth', 'OAUTH', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE github_user_id = 990001, login = 'dev-oauth', source = 'OAUTH'`);
    const lead409 = await api().put(`/side-projects/git/projects/${pubProject}/team/${dev}/github`).set(as(lead)).send({ login: "someone-else" });
    expect(lead409.status).toBe(409);
    expect((await api().delete(`/side-projects/git/projects/${pubProject}/team/${dev}/github`).set(as(lead))).status).toBe(409);
    expect((await api().delete(`/side-projects/git/projects/${pubProject}/team/${dev}/github`).set(as(dev))).status).toBe(200);
  });

  it("links from pushed commits while GitHub's limit is used up, unverified", async () => {
    push(PUB.full_name, "main", [{ msg: "Ghost commit", login: "dev-ghost", email: "ghost@home.test", minsAgo: 1 }]);
    await resync();
    limitHit = true;
    try {
      const seen = await api().put(`/side-projects/git/projects/${pubProject}/team/${dev}/github`).set(as(lead)).send({ login: "dev-ghost" });
      expect(seen.status, JSON.stringify(seen.body)).toBe(200);
      expect(seen.body.data.verified).toBe(false);
      expect(Number(await author("Ghost commit"))).toBe(dev);
      const unseen = await api().put(`/side-projects/git/projects/${pubProject}/team/${dev}/github`).set(as(lead)).send({ login: "never-pushed" });
      expect(unseen.status).toBe(503);
    } finally {
      limitHit = false;
    }
    const panel = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(lead));
    expect(panel.body.data.team.find((t: any) => t.id === dev)).toMatchObject({ login: "dev-ghost", verified: false });
  });

  it("unlinking gives back the commits matched only through that username", async () => {
    expect((await api().delete(`/side-projects/git/projects/${pubProject}/team/${freelancer}/github`).set(as(lead))).status).toBe(200);
    expect(await author("Delivery slots API")).toBeNull();
    const panel = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(lead));
    expect(panel.body.data.team.find((t: any) => t.id === freelancer).login).toBeNull();
    expect(panel.body.data.unclaimed.some((u: any) => u.login === "kezo-dev")).toBe(true);
  });
});

describe("confirming and precedence", () => {
  const author = async (title: string) => (await q(sql`SELECT author_user_id FROM GitCommit WHERE project_id = ${pubProject} AND title = ${title}`))[0]?.author_user_id ?? null;
  const resync = async () => {
    await db.execute(sql`UPDATE GitRepoLink SET synced_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE project_id = ${pubProject}`);
    await syncDue();
  };

  it("an unconfirmed username is confirmed from its noreply commit email at the next sync", async () => {
    // dev is @dev-ghost, linked unverified in the previous block.
    expect(Number((await q(sql`SELECT github_user_id FROM GitIdentity WHERE user_id = ${dev}`))[0].github_user_id)).toBeLessThan(0);
    push(PUB.full_name, "main", [{ msg: "Ghost via web", login: "dev-ghost", email: "88001+dev-ghost@users.noreply.github.com", minsAgo: 1 }]);
    await resync();
    expect(Number((await q(sql`SELECT github_user_id FROM GitIdentity WHERE user_id = ${dev}`))[0].github_user_id)).toBe(88001);
    const panel = await api().get(`/side-projects/git/projects/${pubProject}`).set(as(lead));
    expect(panel.body.data.team.find((t: any) => t.id === dev).verified).toBe(true);
  });

  it("a linked GitHub login wins over a commit email that belongs to another MIS account", async () => {
    // The lead's MIS email is someone's personal git email: their commits went to the lead.
    const leadEmail = `lead${lead}@studio.test`;
    await db.execute(sql`UPDATE User SET email = ${leadEmail} WHERE user_id = ${lead}`);
    push(PUB.full_name, "main", [{ msg: "Second account work", login: "kezo-dev", email: leadEmail, minsAgo: 1 }]);
    await resync();
    expect(Number(await author("Second account work"))).toBe(lead);
    const ok = await api().put(`/side-projects/git/projects/${pubProject}/team/${freelancer}/github`).set(as(lead)).send({ login: "kezo-dev" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(Number(await author("Second account work"))).toBe(freelancer);
  });

  it("an unknown AI role falls back to the default order instead of crashing (Word it with AI)", () => {
    expect(roleOrder("assist" as any)).toBeUndefined();
    expect(roleOrder("draft")?.length).toBeGreaterThan(0);
  });

  it("Word it with AI writes the draft with the draft role, and survives a provider failure", async () => {
    setAiPolicyForTests(AI_POLICY_ALL_ON);
    const seen: string[] = [];
    const provider = (name: string, fail = false) => ({
      name,
      isConfigured: () => true,
      supportsStrictSchema: true,
      generateJSON: async () => {
        seen.push(name);
        if (fail) throw Object.assign(new Error("503 overloaded"), { status: 503 });
        return { data: { did: "I added delivery slots and tidied the footer.", nextSteps: "Finish payments." }, model: `${name}-m` };
      },
    });
    try {
      const got = await api().get(`/side-projects/git/projects/${pubProject}/draft?polish=0`).set(as(freelancer));
      expect(got.status, JSON.stringify(got.body)).toBe(200);
      const id = got.body.data.draft.id;
      setTestProviders({ glm: provider("glm", true), gemini: provider("gemini") } as any);
      const d = await drafts.polishDraft(id, freelancer);
      expect(d.did).toBe("I added delivery slots and tidied the footer.");
      expect(d.aiPolished).toBe(true);
      expect(seen).toEqual(["glm", "gemini"]); // the draft role's order, glm first
      setTestProviders({ glm: provider("glm", true) } as any);
      await db.execute(sql`UPDATE SideProjectReportDraft SET ai_polished = 0 WHERE draft_id = ${id}`);
      await expect(drafts.polishDraft(id, freelancer)).rejects.toBeTruthy();
    } finally {
      setTestProviders(null);
      setAiPolicyForTests(null);
    }
  });

  it("GitHub's pull request numbers are not task references", () => {
    expect(findRefs("Merge pull request #56 from niyongaboemmy/feat/multi-tenancy", "ANCM", { allowBare: true })).toEqual([]);
    expect(findRefs("feat(side-projects): several repositories (#141)", "ANCM", { allowBare: true })).toEqual([]);
    expect(findRefs("Fix the form for #27 (#141)", "ANCM", { allowBare: true })).toEqual([27]);
    expect(findRefs("Merge pull request #12 from x/feat/ANCM-27-form", "ANCM", { allowBare: true })).toEqual([27]);
  });
});

describe("suggestAuthor", () => {
  const unclaimed = [
    { login: "niyongaboemmy", email: null, name: "Niyongabo Emmanuel", commits: 17 },
    { login: "random-bot", email: null, name: "random-bot", commits: 3 },
  ];
  it("matches the same name in any order, or a login made of the names", () => {
    expect(suggestAuthor("Niyongabo Emmanuel", unclaimed)).toMatchObject({ login: "niyongaboemmy", commits: 17 });
    expect(suggestAuthor("Emmanuel Niyongabo (Super)", unclaimed)?.login).toBe("niyongaboemmy");
    expect(suggestAuthor("Niyongabo Emmanuel", [{ login: "niyongaboemmy", email: null, name: null, commits: 2 }])?.login).toBe("niyongaboemmy");
    expect(suggestAuthor("Aimee Uwera", unclaimed)).toBeNull();
  });
});

describe("rate limit", () => {
  it("is stored on the link and shown to the team", async () => {
    limitHit = true;
    try {
      await db.execute(sql`UPDATE GitRepoLink SET synced_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE project_id = ${privProject}`);
      await syncDue();
      const panel = await api().get(`/side-projects/git/projects/${privProject}`).set(as(dev));
      expect(panel.body.data.link.syncError).toMatch(/hourly limit/);
    } finally {
      limitHit = false;
    }
  });
});
