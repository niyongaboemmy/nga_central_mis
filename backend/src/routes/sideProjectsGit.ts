import express from "express";
import { sql } from "drizzle-orm";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { db } from "../db";
import { currentTenantOrNull } from "../tenancy";
const currentTid = () => currentTenantOrNull()?.tid ?? 1;
import { accessProject, assertManage, snapshotViewer, type Viewer, type ViewerResolver } from "../services/sideProjects/access";
import { fail, fullName, iso, many, one, SideProjectError } from "../services/sideProjects/core";
import { authorizeUrl, githubEnabled, installationRepos, installUrl } from "../services/sideProjects/git/github";
import { branchName } from "../services/sideProjects/git/refs";
import { ensureTaskKey, linkForProject, settingsOf, setTaskKey, signState } from "../services/sideProjects/git/store";
import * as drafts from "../services/sideProjects/git/drafts";
import { taskIdIn } from "../services/sideProjects/work";
import { recordEditorActivity } from "../services/sideProjects/git/jobs";
import { apiUrl } from "../services/reminders/webPush";
import { aiDecisionFor } from "../services/ai/gate";
import { isVaultConfigured } from "../services/secrets/vault";
import * as linkMode from "../services/sideProjects/git/linkMode";

/**
 * Git-driven reporting, signed-in side (GIT_AUTOMATED_REPORTING_ANALYSIS.md §10).
 * Mounted at /side-projects/git (before /side-projects so "git" is never read as a project id).
 * The unsigned side (webhook, install/OAuth callbacks, push actions) is integrations/github.
 */
export function sideProjectsGitRouter(auth: express.RequestHandler = authenticate, viewerOf: ViewerResolver = snapshotViewer) {
  const router = express.Router();
  router.use(auth);
  router.use((_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  const uid = (req: any) => Number(req.user.userId);
  const num = (v: unknown, what = "id") => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) fail(404, "NOT_FOUND", `Unknown ${what}`);
    return n;
  };
  const handle =
    (fn: (req: any, res: express.Response) => Promise<unknown>) =>
    asyncHandler(async (req: any, res: express.Response) => {
      try {
        const out = await fn(req, res);
        if (out !== undefined && !res.headersSent) res.json({ success: true, data: out });
      } catch (e) {
        if (e instanceof SideProjectError) return res.status(e.status).json({ success: false, code: e.code, message: e.message, field: e.field });
        throw e;
      }
    });
  const viewer = async (req: any): Promise<Viewer> => (req._spViewer ??= await viewerOf(req));
  const projectAccess = async (req: any) => accessProject(num(req.params.id, "project"), await viewer(req).catch(() => ({ userId: uid(req) }) as any));
  // The team, or someone who manages every project (the projects lead): the GitHub tab shows them
  // the connect and settings controls, so the actions must accept them too.
  const teamAccess = async (req: any) => {
    const a = await accessProject(num(req.params.id, "project"), await viewer(req).catch(() => ({ userId: uid(req) }) as any));
    if (!a.canEdit) fail(403, "NOT_ON_TEAM", "Only the project's team can do this");
    return a;
  };
  /** Strictly the team (owner or accepted member): for "That's me" on the project's commits. */
  const ownTeam = async (req: any) => {
    const a = await accessProject(num(req.params.id, "project"), { userId: uid(req) });
    if (!a.isOwner && !a.isMember) fail(403, "NOT_ON_TEAM", "Only the project's team can do this");
    return a;
  };
  const requireGitHub = () => {
    if (!githubEnabled()) fail(503, "GITHUB_OFF", "GitHub isn't set up on this server yet");
  };

  // ── Me ────────────────────────────────────────────────────────────────────
  router.get(
    "/status",
    handle(async (req) => {
      const idt = await one(sql`SELECT login, name, avatar_url, prefs FROM GitIdentity WHERE user_id = ${uid(req)}`);
      let prefs: any = {};
      try { prefs = idt?.prefs ? JSON.parse(idt.prefs) : {}; } catch { prefs = {}; }
      // Link mode (migration 141) needs no app, so GitHub reporting is always available;
      // "Connect GitHub" (OAuth) only when the app is configured, typing the username always.
      return { enabled: true, oauth: githubEnabled(), identity: idt ? { login: idt.login, name: idt.name, avatarUrl: idt.avatar_url } : null, prefs: { aiPolish: prefs.aiPolish !== false } };
    }),
  );
  router.get(
    "/connect-url",
    handle(async (req) => {
      requireGitHub();
      const returnTo = String(req.query.returnTo ?? "/my-projects").startsWith("/") ? String(req.query.returnTo ?? "/my-projects").slice(0, 300) : "/my-projects";
      const state = signState({ k: "oauth", u: uid(req), t: currentTid(), r: returnTo });
      return { url: authorizeUrl(state, apiUrl("/integrations/github/oauth/callback")) };
    }),
  );
  router.put("/identity", handle(async (req) => linkMode.claimLogin(uid(req), req.body?.login)));
  router.delete(
    "/identity",
    handle(async (req) => {
      await db.execute(sql`DELETE FROM GitIdentity WHERE user_id = ${uid(req)}`);
      return { ok: true };
    }),
  );
  router.patch(
    "/identity/prefs",
    handle(async (req) => {
      const idt = await one(sql`SELECT prefs FROM GitIdentity WHERE user_id = ${uid(req)}`);
      if (!idt) fail(404, "NOT_CONNECTED", "Connect GitHub first");
      let prefs: any = {};
      try { prefs = idt.prefs ? JSON.parse(idt.prefs) : {}; } catch { prefs = {}; }
      if (req.body?.aiPolish !== undefined) prefs.aiPolish = req.body.aiPolish === true;
      await db.execute(sql`UPDATE GitIdentity SET prefs = ${JSON.stringify(prefs)}, updated_at = UTC_TIMESTAMP() WHERE user_id = ${uid(req)}`);
      return { aiPolish: prefs.aiPolish !== false };
    }),
  );
  router.get("/drafts", handle(async (req) => drafts.myDrafts(uid(req))));
  router.post("/editor-activity", handle(async (req) => recordEditorActivity(uid(req), req.body ?? {})));

  // ── Installations (the repository owner's own account) ─────────────────────
  router.get(
    "/installations",
    handle(async (req) => {
      const idt = await one(sql`SELECT login FROM GitIdentity WHERE user_id = ${uid(req)}`);
      const rows = await many(sql`
        SELECT installation_id, account_login, account_type, suspended_at FROM GitInstallation
        WHERE removed_at IS NULL AND (installed_by = ${uid(req)} OR (${idt?.login ?? null} IS NOT NULL AND account_login = ${idt?.login ?? ""}))`);
      return rows.map((r) => ({ id: Number(r.installation_id), account: r.account_login, type: r.account_type, suspended: !!r.suspended_at }));
    }),
  );
  const myInstallation = async (req: any, installationId: number) => {
    const idt = await one(sql`SELECT login FROM GitIdentity WHERE user_id = ${uid(req)}`);
    const inst = await one(sql`SELECT installation_id, account_login, installed_by FROM GitInstallation WHERE installation_id = ${installationId} AND removed_at IS NULL`);
    if (!inst || (Number(inst.installed_by) !== uid(req) && (!idt || idt.login.toLowerCase() !== String(inst.account_login).toLowerCase()))) fail(404, "NOT_FOUND", "Installation not found");
    return inst;
  };
  router.get(
    "/installations/:iid/repos",
    handle(async (req) => {
      requireGitHub();
      const iid = num(req.params.iid, "installation");
      await myInstallation(req, iid);
      const repos = await installationRepos(iid);
      const used = await many(sql`SELECT repo_id, project_id FROM GitRepoLink WHERE status = 'ACTIVE'`);
      return repos.map((r) => ({ ...r, projectId: Number(used.find((u) => Number(u.repo_id) === r.id)?.project_id ?? 0) || null }));
    }),
  );

  // ── A project ─────────────────────────────────────────────────────────────
  router.get(
    "/projects/:id",
    handle(async (req) => {
      const a = await projectAccess(req);
      const projectId = Number(a.project.project_id);
      const link = await linkForProject(projectId);
      const key = a.canEdit ? await ensureTaskKey(projectId) : (await one(sql`SELECT task_key FROM SideProject WHERE project_id = ${projectId}`))?.task_key ?? null;
      const team = await many(sql`
        SELECT u.user_id AS id, ${fullName("pr")} AS name, gi.login, gi.avatar_url FROM (
          SELECT owner_user_id AS user_id FROM SideProject WHERE project_id = ${projectId}
          UNION SELECT user_id FROM SideProjectMember WHERE project_id = ${projectId} AND status = 'ACCEPTED') t
        JOIN User u ON u.user_id = t.user_id LEFT JOIN UserProfile pr ON pr.user_id = u.user_id LEFT JOIN GitIdentity gi ON gi.user_id = u.user_id`);
      // Every teammate sees unmatched authors, so they can say "That's me"; managers also assign.
      const unclaimed = a.canEdit
        ? await many(sql`
            SELECT COALESCE(author_login, '') AS login, COALESCE(author_email, '') AS email, MAX(author_name) AS name, COUNT(*) AS commits, ${iso("MAX(authored_at)")} AS last
            FROM GitCommit WHERE project_id = ${projectId} AND author_user_id IS NULL AND counted = 1
            GROUP BY COALESCE(author_login, ''), COALESCE(author_email, '') ORDER BY commits DESC LIMIT 20`)
        : [];
      const prs = await many(sql`SELECT number, title, url, state, draft, review_state, author_login, ${iso("opened_at")} AS opened_at, ${iso("merged_at")} AS merged_at FROM GitPullRequest WHERE project_id = ${projectId} ORDER BY updated_at DESC LIMIT 8`);
      const commits = await many(sql`
        SELECT c.sha, c.title, c.url, ${iso("c.authored_at")} AS authored_at, c.task_id, c.author_login, c.author_user_id, ${fullName("pr")} AS person
        FROM GitCommit c LEFT JOIN UserProfile pr ON pr.user_id = c.author_user_id
        WHERE c.project_id = ${projectId} ORDER BY c.authored_at DESC LIMIT 10`);
      const stats = await one(sql`SELECT COUNT(*) AS commits, COUNT(DISTINCT task_id) AS tasks, ${iso("MAX(pushed_at)")} AS last FROM GitCommit WHERE project_id = ${projectId} AND counted = 1`);
      const links = await linkMode.linksInfo(projectId);
      const first = links[0] ?? null;
      return {
        enabled: true,
        appEnabled: githubEnabled(),
        vault: isVaultConfigured(),
        suggestedUrl: (await one(sql`SELECT github_url FROM SideProject WHERE project_id = ${projectId}`))?.github_url ?? null,
        canManage: a.canManage,
        canEdit: a.canEdit,
        taskKey: key,
        link: link
          ? { fullName: link.fullName, htmlUrl: link.htmlUrl, defaultBranch: link.defaultBranch, pathPrefix: link.pathPrefix, installationId: link.installationId, settings: link.settings,
              mode: first?.mode ?? "APP", tokenHint: first?.tokenHint ?? null, syncedAt: first?.syncedAt ?? null, syncError: first?.syncError ?? null, lastEventAt: first?.lastEventAt ?? null }
          : null,
        // Every repository of the project (migration 142); `link` stays the first one.
        links,
        settings: link?.settings ?? settingsOf(null, a.project.kind),
        team: team.map((t) => ({ id: Number(t.id), name: t.name, login: t.login ?? null, avatarUrl: t.avatar_url ?? null })),
        unclaimed: unclaimed.map((u) => ({ login: u.login || null, email: u.email || null, name: u.name, commits: Number(u.commits), last: u.last })),
        prs: prs.map((p) => ({ number: Number(p.number), title: p.title, url: p.url, state: p.state, draft: !!Number(p.draft), reviewState: p.review_state, author: p.author_login, openedAt: p.opened_at, mergedAt: p.merged_at })),
        commits: commits.map((c) => ({ sha: c.sha, title: c.title, url: c.url, at: c.authored_at, taskId: c.task_id ? Number(c.task_id) : null, author: c.person || c.author_login })),
        stats: { commits: Number(stats?.commits ?? 0), tasks: Number(stats?.tasks ?? 0), last: stats?.last ?? null },
      };
    }),
  );
  router.post(
    "/projects/:id/install-url",
    handle(async (req) => {
      requireGitHub();
      const a = await teamAccess(req);
      assertManage(a);
      return { url: installUrl(signState({ k: "install", u: uid(req), t: currentTid(), p: Number(a.project.project_id) }, 30 * 60)) };
    }),
  );
  router.post(
    "/projects/:id/connect",
    handle(async (req) => {
      requireGitHub();
      const a = await teamAccess(req);
      assertManage(a);
      const projectId = Number(a.project.project_id);
      const iid = num(req.body?.installationId, "installation");
      await myInstallation(req, iid);
      const repoId = num(req.body?.repoId, "repository");
      const repo = (await installationRepos(iid)).find((r) => r.id === repoId);
      if (!repo) fail(404, "NOT_FOUND", "That repository isn't part of this installation");
      const prefix = req.body?.pathPrefix ? String(req.body.pathPrefix).replace(/^\/+/, "").slice(0, 255) : null;
      const shared = await many(sql`SELECT project_id, path_prefix FROM GitRepoLink WHERE repo_id = ${repoId} AND status = 'ACTIVE' AND project_id <> ${projectId}`);
      if (shared.length && (!prefix || shared.some((s) => !s.path_prefix))) fail(409, "REPO_IN_USE", "This repository is already connected to another project. Give each project a folder (path prefix) to share it.", "pathPrefix");
      const inherit = (await one(sql`SELECT settings FROM GitRepoLink WHERE project_id = ${projectId} AND status = 'ACTIVE' AND repo_id <> ${repoId} ORDER BY link_id LIMIT 1`))?.settings ?? null;
      await db.execute(sql`
        INSERT INTO GitRepoLink (project_id, repo_id, full_name, html_url, installation_id, access_mode, default_branch, path_prefix, settings, status, connected_by, created_at, updated_at)
        VALUES (${projectId}, ${repoId}, ${repo!.full_name}, ${repo!.html_url}, ${iid}, 'APP', ${repo!.default_branch}, ${prefix},
                ${inherit},
                'ACTIVE', ${uid(req)}, UTC_TIMESTAMP(), UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE repo_id = VALUES(repo_id), full_name = VALUES(full_name), html_url = VALUES(html_url), installation_id = VALUES(installation_id), access_mode = 'APP',
          default_branch = VALUES(default_branch), path_prefix = VALUES(path_prefix), status = 'ACTIVE', connected_by = VALUES(connected_by), updated_at = UTC_TIMESTAMP()`);
      await db.execute(sql`UPDATE SideProject SET github_url = ${repo!.html_url} WHERE project_id = ${projectId} AND (github_url IS NULL OR github_url = '')`);
      await ensureTaskKey(projectId);
      return { ok: true, fullName: repo!.full_name };
    }),
  );
  // Connect with the repository's address (no app): public at once, private with a read-only token.
  router.post(
    "/projects/:id/connect-link",
    handle(async (req) => {
      const a = await teamAccess(req);
      assertManage(a);
      return linkMode.connectByUrl(Number(a.project.project_id), uid(req), req.body ?? {});
    }),
  );
  // "Sync now" for link-mode repositories (once every 30 seconds per project).
  const lastSync = new Map<number, number>();
  router.post(
    "/projects/:id/sync",
    handle(async (req) => {
      const a = await teamAccess(req);
      const projectId = Number(a.project.project_id);
      const any = await one(sql`SELECT COUNT(*) AS n, SUM(access_mode = 'LINK') AS links FROM GitRepoLink WHERE project_id = ${projectId} AND status = 'ACTIVE'`);
      if (!Number(any?.n)) fail(409, "NOT_CONNECTED", "Connect a repository first");
      if (!Number(any?.links)) return { ok: true, live: true };
      if (Date.now() - (lastSync.get(projectId) ?? 0) < 30_000) fail(429, "TOO_SOON", "Synced a moment ago. Try again in half a minute");
      lastSync.set(projectId, Date.now());
      const out = await linkMode.syncProject(projectId);
      if (out.errors.length && out.errors.length === out.repos) fail(502, "SYNC_FAILED", out.errors[0]);
      return { ok: true, ...out };
    }),
  );
  router.post(
    "/projects/:id/authors/claim",
    handle(async (req) => {
      const a = await ownTeam(req);
      return linkMode.claimAuthor(Number(a.project.project_id), uid(req), req.body ?? {});
    }),
  );
  router.delete(
    "/projects/:id/link",
    handle(async (req) => {
      const a = await teamAccess(req);
      assertManage(a);
      // ?linkId= disconnects one repository; without it, all of them.
      const linkId = req.query.linkId ? num(req.query.linkId, "repository") : null;
      await db.execute(sql`UPDATE GitRepoLink SET status = 'REMOVED', updated_at = UTC_TIMESTAMP()
        WHERE project_id = ${Number(a.project.project_id)} AND status = 'ACTIVE' ${linkId ? sql`AND link_id = ${linkId}` : sql``}`);
      return { ok: true };
    }),
  );
  router.patch(
    "/projects/:id/settings",
    handle(async (req) => {
      const a = await teamAccess(req);
      assertManage(a);
      const projectId = Number(a.project.project_id);
      const b = req.body ?? {};
      if (b.taskKey !== undefined) await setTaskKey(projectId, b.taskKey);
      const link = await linkForProject(projectId);
      if (link) {
        const s: any = { ...link.settings };
        if (b.automations !== undefined) s.automations = b.automations === true;
        if (b.aiPolish !== undefined) s.aiPolish = b.aiPolish === true;
        if (b.checks !== undefined) s.checks = b.checks === true;
        if (b.autoSubmitDays !== undefined) {
          const d = b.autoSubmitDays === null || b.autoSubmitDays === "" ? null : Number(b.autoSubmitDays);
          if (d !== null && (!Number.isInteger(d) || d < 1 || d > 14)) fail(400, "VALIDATION", "Auto-submit after 1 to 14 days, or never", "autoSubmitDays");
          s.autoSubmitDays = d;
        }
        if (b.ignoredPaths !== undefined) s.ignoredPaths = (Array.isArray(b.ignoredPaths) ? b.ignoredPaths : String(b.ignoredPaths).split(/[\n,]/)).map((x: string) => String(x).trim()).filter(Boolean).slice(0, 30);
        // The tab's settings are the project's: every repository gets them.
        await db.execute(sql`UPDATE GitRepoLink SET settings = ${JSON.stringify(s)}, updated_at = UTC_TIMESTAMP() WHERE project_id = ${projectId} AND status = 'ACTIVE'`);
        if (b.pathPrefix !== undefined) await db.execute(sql`UPDATE GitRepoLink SET path_prefix = ${b.pathPrefix ? String(b.pathPrefix).replace(/^\/+/, "").slice(0, 255) : null} WHERE link_id = ${link.linkId}`);
      } else if (Object.keys(b).some((k) => k !== "taskKey")) fail(409, "NOT_CONNECTED", "Connect a repository first");
      const now = await linkForProject(projectId);
      return { taskKey: (await one(sql`SELECT task_key FROM SideProject WHERE project_id = ${projectId}`))?.task_key, settings: now?.settings ?? settingsOf(null, a.project.kind) };
    }),
  );
  router.post(
    "/projects/:id/authors",
    handle(async (req) => {
      const a = await teamAccess(req);
      assertManage(a);
      const projectId = Number(a.project.project_id);
      const login = req.body?.login ? String(req.body.login).toLowerCase().slice(0, 190) : null;
      const email = req.body?.email ? String(req.body.email).toLowerCase().slice(0, 190) : null;
      if (!login && !email) fail(400, "VALIDATION", "Which author?", "login");
      const ignore = req.body?.ignore === true;
      const userId = ignore ? null : num(req.body?.userId, "person");
      if (userId) {
        const onTeam = await one(sql`SELECT 1 AS ok FROM SideProject WHERE project_id = ${projectId} AND owner_user_id = ${userId} UNION SELECT 1 FROM SideProjectMember WHERE project_id = ${projectId} AND user_id = ${userId} AND status = 'ACCEPTED'`);
        if (!onTeam) fail(400, "VALIDATION", "Pick someone on the team", "userId");
      }
      for (const [type, value] of [["LOGIN", login], ["EMAIL", email]] as const) {
        if (!value) continue;
        await db.execute(sql`
          INSERT INTO GitAuthorMap (key_type, key_value, user_id, ignored, created_by, created_at) VALUES (${type}, ${value}, ${userId}, ${ignore ? 1 : 0}, ${uid(req)}, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), ignored = VALUES(ignored)`);
      }
      const match = sql`project_id = ${projectId} AND author_user_id IS NULL AND (${login ? sql`LOWER(author_login) = ${login}` : sql`0`} OR ${email ? sql`author_email = ${email}` : sql`0`})`;
      if (ignore) await db.execute(sql`UPDATE GitCommit SET counted = 0 WHERE ${match}`);
      else await db.execute(sql`UPDATE GitCommit SET author_user_id = ${userId} WHERE ${match}`);
      if (userId) await drafts.refreshDraft(projectId, userId);
      return { ok: true };
    }),
  );
  router.get(
    "/projects/:id/tasks/:taskId",
    handle(async (req) => {
      const a = await projectAccess(req);
      const projectId = Number(a.project.project_id);
      const taskId = num(req.params.taskId, "task");
      const t = await one(sql`SELECT title FROM SideProjectTask WHERE task_id = ${taskId} AND project_id = ${projectId}`);
      if (!t) fail(404, "NOT_FOUND", "Task not found");
      const key = (await one(sql`SELECT task_key FROM SideProject WHERE project_id = ${projectId}`))?.task_key ?? (a.canEdit ? await ensureTaskKey(projectId) : null);
      const name = branchName(key, taskId, t.title);
      const branches = await many(sql`SELECT name, ${iso("created_at")} AS created_at, ${iso("last_commit_at")} AS last_commit_at, deleted_at FROM GitBranch WHERE project_id = ${projectId} AND task_id = ${taskId} ORDER BY created_at DESC LIMIT 5`);
      const prs = await many(sql`SELECT number, title, url, state, draft, review_state, ${iso("opened_at")} AS opened_at, ${iso("merged_at")} AS merged_at FROM GitPullRequest WHERE project_id = ${projectId} AND ${taskIdIn("task_ids", String(taskId))} ORDER BY opened_at DESC LIMIT 5`);
      const commits = await many(sql`
        SELECT c.sha, c.title, c.url, ${iso("c.authored_at")} AS authored_at, ${fullName("pr")} AS person, c.author_login FROM GitCommit c LEFT JOIN UserProfile pr ON pr.user_id = c.author_user_id
        WHERE c.project_id = ${projectId} AND c.task_id = ${taskId} ORDER BY c.authored_at DESC LIMIT 10`);
      return {
        key: key ? `${key}-${taskId}` : `#${taskId}`,
        branchName: name,
        command: `git switch -c ${name}`,
        connected: !!(await linkForProject(projectId)),
        branches: branches.map((b) => ({ name: b.name, createdAt: b.created_at, lastCommitAt: b.last_commit_at, deleted: !!b.deleted_at })),
        prs: prs.map((p) => ({ number: Number(p.number), title: p.title, url: p.url, state: p.state, draft: !!Number(p.draft), reviewState: p.review_state, openedAt: p.opened_at, mergedAt: p.merged_at })),
        commits: commits.map((c) => ({ sha: c.sha, title: c.title, url: c.url, at: c.authored_at, author: c.person || c.author_login })),
      };
    }),
  );

  // ── Drafts ────────────────────────────────────────────────────────────────
  const mayPolish = async (req: any, projectId: number) => {
    const link = await linkForProject(projectId);
    if (link && !link.settings.aiPolish) return false;
    const idt = await one(sql`SELECT prefs FROM GitIdentity WHERE user_id = ${uid(req)}`);
    try { if (idt?.prefs && JSON.parse(idt.prefs).aiPolish === false) return false; } catch { /* default on */ }
    try {
      return (await aiDecisionFor(req, "assist")).decision.allowed;
    } catch {
      return false;
    }
  };
  router.get(
    "/projects/:id/draft",
    handle(async (req) => {
      const a = await teamAccess(req);
      const projectId = Number(a.project.project_id);
      // A repository connected with its link is polled: catch up before the draft is built.
      await linkMode.syncIfStale(projectId, 3);
      let d = await drafts.refreshDraft(projectId, uid(req));
      const canPolish = d ? await mayPolish(req, projectId) : false;
      // Agreed default: AI wording on where the school policy allows (always editable).
      if (d && canPolish && !d.aiPolished && !d.edited && req.query.polish !== "0" && d.lines.length) d = await drafts.polishDraft(d.id, uid(req)).catch(() => d);
      return { draft: d, canPolish };
    }),
  );
  const ownDraft = async (req: any) => {
    const id = num(req.params.did, "draft");
    const d = await drafts.draftById(id);
    if (!d || d.userId !== uid(req)) fail(404, "NOT_FOUND", "Draft not found");
    return d!;
  };
  router.patch("/drafts/:did", handle(async (req) => drafts.editDraft((await ownDraft(req)).id, uid(req), req.body ?? {})));
  router.post(
    "/drafts/:did/submit",
    handle(async (req) => {
      const d = await ownDraft(req);
      if (req.body && Object.keys(req.body).some((k) => ["did", "nextSteps", "blockers", "lines"].includes(k))) await drafts.editDraft(d.id, uid(req), req.body);
      return { reportId: await drafts.submitDraft(d.id, uid(req), { workDate: req.body?.workDate }) };
    }),
  );
  router.post(
    "/drafts/:did/dismiss",
    handle(async (req) => {
      await drafts.dismissDraft((await ownDraft(req)).id, uid(req));
      return { ok: true };
    }),
  );
  router.post(
    "/drafts/:did/polish",
    handle(async (req) => {
      const d = await ownDraft(req);
      if (!(await mayPolish(req, d.projectId))) fail(403, "AI_DISABLED", "AI wording isn't available for you here");
      return drafts.polishDraft(d.id, uid(req));
    }),
  );

  return router;
}

export default sideProjectsGitRouter();
