import { sql } from "drizzle-orm";
import { db } from "../../../db";
import logger from "../../../utils/logger";
import { isVaultConfigured, keyHint, open, seal, type SealedSecret } from "../../secrets/vault";
import { fail, many, one } from "../core";
import { restGet, type ApiReply } from "./github";
import { applyEvent } from "./ingest";
import { ensureTaskKey } from "./store";

/**
 * Connect with a link (migration 141): no GitHub App, no install, no OAuth. The project lead
 * pastes the repository's address; a public repository connects at once, a private one with a
 * read-only fine-grained token. The MIS then polls GitHub every ten minutes (and on "Sync now",
 * and when someone opens their report) and feeds what it finds to the same pipeline as the
 * webhooks: branches, commits and pull requests become the same events, so automations and
 * living drafts work exactly as with the app.
 *
 * Teammates are matched by the email on their commits (their MIS email), by the GitHub username
 * they type in (claimLogin), or by "That's me" on an unmatched author (claimAuthor).
 */

export const SYNC_EVERY_MIN = 9;
/** Commits whose changed files we look up per sync (each is one API request). */
const FILE_LOOKUPS_PER_SYNC = 20;
const FIRST_SYNC_DAYS = 14;

export interface SyncState {
  v: 1;
  branches: Record<string, string>;
  pulls: Record<string, string>;
  etags: { branches?: string; pulls?: string };
}

export class SyncError extends Error {}

/** owner/repo from anything people paste: the page, the clone URL, SSH, or owner/repo. */
export function parseRepo(raw: unknown): { owner: string; repo: string } | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/^git@github\.com:/i, "https://github.com/").replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  const m = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?(?:[/?#].*)?$/.exec(s);
  if (!m || m[2] === "." || m[2] === "..") return null;
  return { owner: m[1], repo: m[2] };
}

const aad = (projectId: number) => `git-link:${projectId}`;
const packSealed = (s: SealedSecret) =>
  JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Buffer.isBuffer(v) ? (v as Buffer).toString("base64") : v])));
const unpackSealed = (raw: string): SealedSecret => {
  const o = JSON.parse(raw);
  const b = (k: string) => Buffer.from(o[k], "base64");
  return { ciphertext: b("ciphertext"), nonce: b("nonce"), tag: b("tag"), wrappedDek: b("wrappedDek"), dekNonce: b("dekNonce"), dekTag: b("dekTag"), kekVersion: Number(o.kekVersion) };
};

function tokenOf(projectId: number, sealed: string | null): string | null {
  if (!sealed) return null;
  try {
    return open(unpackSealed(sealed), aad(projectId));
  } catch (e: any) {
    throw new SyncError("The saved token can't be read any more: add it again");
  }
}

/** A DATETIME (stored in UTC) as epoch ms, whether the driver hands back a Date or a string. */
const utcMs = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(`${String(v).replace(" ", "T")}Z`));
const kigaliTime = (ms: number) => new Date(ms + 2 * 3_600_000).toISOString().slice(11, 16);

/** A refusal from GitHub, in words a project lead can act on. */
function why(r: ApiReply, hasToken: boolean): string {
  if ((r.status === 403 || r.status === 429) && r.remaining === 0) {
    return `GitHub's hourly limit is used up${r.resetAt ? `; syncing continues at ${kigaliTime(r.resetAt)}` : ""}${hasToken ? "" : ". A read-only token lifts the limit"}`;
  }
  if (r.status === 401) return "GitHub refused the token: it may have expired. Add a new one";
  if (r.status === 404 || r.status === 403) return hasToken ? "The token can't see this repository: give it access to it" : "The repository is private or was renamed";
  return `GitHub answered ${r.status}`;
}

async function get<T = any>(path: string, token: string | null, etag?: string | null): Promise<ApiReply<T>> {
  const r = await restGet<T>(path, { token, etag });
  if (r.status !== 200 && r.status !== 304) throw new SyncError(why(r, !!token));
  return r;
}

// ─── Connect ──────────────────────────────────────────────────────────────────

export interface ConnectInput {
  url?: unknown;
  token?: unknown;
  pathPrefix?: unknown;
}

/** Connects a repository by its address; syncs it straight away. Only the project's managers. */
export async function connectByUrl(projectId: number, by: number, input: ConnectInput) {
  const where = parseRepo(input.url);
  if (!where) fail(400, "VALIDATION", "Paste the repository's address, e.g. https://github.com/you/project", "url");
  const token = typeof input.token === "string" && input.token.trim() ? input.token.trim() : null;
  if (token && !/^(github_pat_|ghp_|gho_|ghs_)[A-Za-z0-9_]{20,}$/.test(token)) fail(400, "VALIDATION", "That doesn't look like a GitHub token (it starts with github_pat_)", "token");
  const r = await restGet(`/repos/${where!.owner}/${where!.repo}`, { token });
  if (r.status !== 200 || !r.data) {
    if ((r.status === 403 || r.status === 429) && r.remaining === 0) fail(429, "GITHUB_LIMIT", why(r, !!token), "url");
    if (!token) fail(400, "TOKEN_NEEDED", "This repository is private (or the address is wrong). Add a read-only token to connect it", "token");
    fail(400, "BAD_TOKEN", why(r, true), "token");
  }
  const repo = r.data;
  // The server's own token must never open someone's private repository: private needs theirs.
  if (repo.private && !token) fail(400, "TOKEN_NEEDED", "This repository is private. Add a read-only token to connect it", "token");
  if (token && !isVaultConfigured()) fail(503, "VAULT_OFF", "Private repositories can't be connected on this server yet. Make it public, or ask the administrator to set up the key vault", "token");
  const prefix = input.pathPrefix ? String(input.pathPrefix).replace(/^\/+/, "").slice(0, 255) : null;
  const shared = await many(sql`SELECT project_id, path_prefix FROM GitRepoLink WHERE repo_id = ${repo.id} AND status = 'ACTIVE' AND project_id <> ${projectId}`);
  if (shared.length && (!prefix || shared.some((s) => !s.path_prefix))) {
    fail(409, "REPO_IN_USE", "This repository is already connected to another project. Give each project a folder to share it", "pathPrefix");
  }
  const sealed = token ? packSealed(seal(token, aad(projectId))) : null;
  await db.execute(sql`
    INSERT INTO GitRepoLink (project_id, provider, repo_id, full_name, html_url, installation_id, access_mode, token_sealed, token_hint, default_branch, path_prefix, settings, status, connected_by, sync_state, synced_at, sync_error, created_at, updated_at)
    VALUES (${projectId}, 'github', ${repo.id}, ${repo.full_name}, ${repo.html_url}, NULL, 'LINK', ${sealed}, ${token ? keyHint(token) : null}, ${repo.default_branch || "main"}, ${prefix}, NULL, 'ACTIVE', ${by}, NULL, NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE repo_id = VALUES(repo_id), full_name = VALUES(full_name), html_url = VALUES(html_url), installation_id = NULL, access_mode = 'LINK',
      token_sealed = VALUES(token_sealed), token_hint = VALUES(token_hint), default_branch = VALUES(default_branch), path_prefix = VALUES(path_prefix),
      status = 'ACTIVE', connected_by = VALUES(connected_by), sync_state = NULL, synced_at = NULL, sync_error = NULL, updated_at = UTC_TIMESTAMP()`);
  await db.execute(sql`UPDATE SideProject SET github_url = ${repo.html_url} WHERE project_id = ${projectId} AND (github_url IS NULL OR github_url = '')`);
  await ensureTaskKey(projectId);
  const link = await one(sql`SELECT link_id FROM GitRepoLink WHERE project_id = ${projectId}`);
  const sync = await syncLink(Number(link!.link_id)).catch((e) => ({ error: String(e?.message ?? e) }));
  return { fullName: repo.full_name as string, private: !!repo.private, sync };
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

const ghCommit = (c: any, files: string[] | null) => ({
  id: c.sha,
  message: c.commit?.message ?? "",
  timestamp: c.commit?.author?.date ?? c.commit?.committer?.date,
  url: c.html_url,
  author: { username: c.author?.login ?? null, email: c.commit?.author?.email ?? null, name: c.commit?.author?.name ?? null },
  added: files ?? [],
  removed: [],
  modified: [],
});

/**
 * One poll of a link-mode repository. Branch heads come first (a free 304 when nothing
 * moved); only branches whose head changed are read, oldest commit first, and the default
 * branch last so a merged feature branch keeps its task. Then pull requests updated since.
 */
export async function syncLink(linkId: number, now = new Date()) {
  const l = await one(sql`SELECT link_id, project_id, repo_id, full_name, default_branch, token_sealed, sync_state, synced_at FROM GitRepoLink WHERE link_id = ${linkId} AND status = 'ACTIVE' AND access_mode = 'LINK'`);
  if (!l) fail(404, "NOT_FOUND", "This repository isn't connected with a link");
  const projectId = Number(l!.project_id);
  const repoId = Number(l!.repo_id);
  const full = String(l!.full_name);
  const defaultBranch = String(l!.default_branch || "main");
  let state: SyncState = { v: 1, branches: {}, pulls: {}, etags: {} };
  try {
    if (l!.sync_state) state = { ...state, ...JSON.parse(l!.sync_state) };
  } catch {
    /* start over */
  }
  const first = !l!.synced_at;
  // Commits are read from a day before the last sync (late pushes keep their author date).
  const since = new Date(first ? now.getTime() - FIRST_SYNC_DAYS * 86_400_000 : utcMs(l!.synced_at) - 86_400_000).toISOString();
  const out = { branches: 0, commits: 0, prs: 0 };
  const touched: Array<{ projectId: number; userId: number }> = [];
  try {
    const token = tokenOf(projectId, l!.token_sealed);
    const repo = repoId;
    // First sync: what is already there is the starting point. Only the default branch and the
    // branches of recently updated pull requests are read, so a repository with hundreds of
    // branches connects within GitHub's 60-an-hour limit; later syncs read what moved.
    const firstPulls = first ? await get<any[]>(`/repos/${full}/pulls?state=all&sort=updated&direction=desc&per_page=30`, token) : null;
    const active = new Set<string>(
      (Array.isArray(firstPulls?.data) ? firstPulls!.data : []).filter((pr: any) => new Date(pr.updated_at).toISOString() >= since).map((pr: any) => String(pr.head?.ref ?? "")),
    );
    if (first) {
      // Branches pushed to lately, from the repository's recent events (one request).
      const ev = await restGet<any[]>(`/repos/${full}/events?per_page=100`, { token }).catch(() => null);
      for (const e of Array.isArray(ev?.data) ? ev!.data : []) {
        if (!e?.created_at || new Date(e.created_at).toISOString() < since) continue;
        if (e.type === "PushEvent" && typeof e.payload?.ref === "string") active.add(e.payload.ref.replace(/^refs\/heads\//, ""));
        if (e.type === "CreateEvent" && e.payload?.ref_type === "branch" && e.payload?.ref) active.add(String(e.payload.ref));
      }
    }
    const b = await get<any[]>(`/repos/${full}/branches?per_page=100`, token, state.etags.branches);
    if (b.status === 200 && Array.isArray(b.data)) {
      state.etags.branches = b.etag ?? undefined;
      const list: any[] = [...b.data];
      // More than 100 branches: the next pages (up to 500 branches).
      for (let page = 2; page <= 5 && list.length === (page - 1) * 100; page++) {
        const more = await get<any[]>(`/repos/${full}/branches?per_page=100&page=${page}`, token);
        if (Array.isArray(more.data)) list.push(...more.data);
      }
      const heads = new Map<string, string>(list.map((x: any) => [String(x.name), String(x.commit?.sha ?? "")]));
      if (first) for (const [name, sha] of heads) if (name !== defaultBranch && !active.has(name)) state.branches[name] = sha;
      const changed = [...heads.entries()].filter(([name, sha]) => state.branches[name] !== sha).sort(([a], [z]) => (a === defaultBranch ? 1 : z === defaultBranch ? -1 : 0));
      let lookups = FILE_LOOKUPS_PER_SYNC;
      for (const [name, sha] of changed) {
        if (name !== defaultBranch && !(name in state.branches)) {
          touched.push(...(await applyEvent("create", { ref_type: "branch", ref: name, repository: { id: repo }, sender: {} })));
          out.branches++;
        }
        const list = await get<any[]>(`/repos/${full}/commits?sha=${encodeURIComponent(name)}&since=${encodeURIComponent(since)}&per_page=50`, token);
        const commits = Array.isArray(list.data) ? list.data : [];
        const shas = commits.map((c: any) => String(c.sha));
        const seen = new Set(
          shas.length ? (await many(sql`SELECT sha FROM GitCommit WHERE repo_id = ${repo} AND sha IN (${sql.join(shas.map((x) => sql`${x}`), sql`, `)})`)).map((r) => String(r.sha)) : [],
        );
        const fresh = commits.filter((c: any) => !seen.has(String(c.sha))).reverse();
        const payload = [];
        for (const c of fresh) {
          let files: string[] | null = null;
          if (lookups > 0) {
            lookups--;
            const d = await restGet(`/repos/${full}/commits/${c.sha}`, { token }).catch(() => null);
            if (d?.status === 200 && Array.isArray(d.data?.files)) files = d.data.files.map((f: any) => String(f.filename));
          }
          payload.push(ghCommit(c, files));
        }
        if (payload.length) {
          touched.push(
            ...(await applyEvent("push", {
              ref: `refs/heads/${name}`,
              repository: { id: repo },
              commits: payload,
              head_commit: payload[payload.length - 1],
              sender: { login: payload[payload.length - 1].author.username },
            })),
          );
          out.commits += payload.length;
        }
        state.branches[name] = sha;
      }
      for (const gone of Object.keys(state.branches).filter((n) => !heads.has(n))) {
        await applyEvent("delete", { ref_type: "branch", ref: gone, repository: { id: repo } });
        delete state.branches[gone];
      }
    }

    const p = firstPulls ?? (await get<any[]>(`/repos/${full}/pulls?state=all&sort=updated&direction=desc&per_page=30`, token, state.etags.pulls));
    if (p.status === 200 && Array.isArray(p.data)) {
      state.etags.pulls = p.etag ?? undefined;
      for (const pr of [...p.data].reverse()) {
        if (first && new Date(pr.updated_at).toISOString() < since) continue;
        const k = String(pr.number);
        const stamp = `${pr.updated_at}|${pr.draft ? 1 : 0}|${pr.state}`;
        const before = state.pulls[k];
        if (before === stamp) continue;
        const wasDraft = before?.split("|")[1] === "1";
        const action = pr.merged_at || pr.state === "closed" ? "closed" : !before ? "opened" : wasDraft && !pr.draft ? "ready_for_review" : "edited";
        // An already closed pull request we had seen closed needs no second "closed".
        if (action === "closed" && before?.endsWith("|closed")) {
          state.pulls[k] = stamp;
          continue;
        }
        touched.push(...(await applyEvent("pull_request", { action, pull_request: { ...pr, merged: !!pr.merged_at }, repository: { id: repo } })));
        state.pulls[k] = stamp;
        out.prs++;
      }
      // Keep the memory small.
      const keys = Object.keys(state.pulls).map(Number).sort((a, z) => z - a);
      for (const k of keys.slice(200)) delete state.pulls[String(k)];
    }
    await db.execute(sql`UPDATE GitRepoLink SET sync_state = ${JSON.stringify(state)}, synced_at = UTC_TIMESTAMP(), sync_error = NULL, last_event_at = IF(${out.commits + out.prs + out.branches} > 0, UTC_TIMESTAMP(), last_event_at) WHERE link_id = ${linkId}`);
  } catch (e: any) {
    const msg = e instanceof SyncError ? e.message : "Couldn't reach GitHub just now";
    if (!(e instanceof SyncError)) logger.warn("[git] link sync failed", { error: e?.message ?? e, linkId });
    // Whatever was read before the failure stays; the next poll goes on from there.
    await db.execute(sql`UPDATE GitRepoLink SET sync_state = ${JSON.stringify(state)}, synced_at = UTC_TIMESTAMP(), sync_error = ${msg.slice(0, 300)} WHERE link_id = ${linkId}`);
    throw e instanceof SyncError ? e : new SyncError(msg);
  } finally {
    const { refreshDraft } = await import("./drafts");
    const seen = new Set<string>();
    for (const t of touched) {
      const k = `${t.projectId}:${t.userId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await refreshDraft(t.projectId, t.userId).catch(() => undefined);
    }
  }
  return out;
}

/** Due link-mode repositories (every ten minutes from housekeeping). */
export async function syncDue(limit = 30): Promise<number> {
  const rows = await many(sql`
    SELECT link_id FROM GitRepoLink WHERE status = 'ACTIVE' AND access_mode = 'LINK'
      AND (synced_at IS NULL OR synced_at < UTC_TIMESTAMP() - INTERVAL ${SYNC_EVERY_MIN} MINUTE)
    ORDER BY synced_at IS NULL DESC, synced_at LIMIT ${limit}`);
  let n = 0;
  for (const r of rows) {
    try {
      await syncLink(Number(r.link_id));
      n++;
    } catch {
      /* stored as sync_error */
    }
  }
  return n;
}

/** Sync a project's repository when it is a link and the last sync is older than `minutes`. */
export async function syncIfStale(projectId: number, minutes = 3): Promise<boolean> {
  const l = await one(sql`
    SELECT link_id FROM GitRepoLink WHERE project_id = ${projectId} AND status = 'ACTIVE' AND access_mode = 'LINK'
      AND (synced_at IS NULL OR synced_at < UTC_TIMESTAMP() - INTERVAL ${minutes} MINUTE)`);
  if (!l) return false;
  await syncLink(Number(l.link_id)).catch(() => undefined);
  return true;
}

// ─── Who is who ───────────────────────────────────────────────────────────────

/** Gives existing unmatched commits and pull requests to the person, then refreshes their drafts. */
async function adopt(userId: number, by: { login?: string | null; email?: string | null }) {
  const login = by.login?.toLowerCase() ?? null;
  const email = by.email?.toLowerCase() ?? null;
  const match = sql`author_user_id IS NULL AND (${login ? sql`LOWER(author_login) = ${login}` : sql`0`} OR ${email ? sql`author_email = ${email}` : sql`0`})`;
  const projects = (await many(sql`SELECT DISTINCT project_id FROM GitCommit WHERE ${match}`)).map((r) => Number(r.project_id));
  await db.execute(sql`UPDATE GitCommit SET author_user_id = ${userId} WHERE ${match}`);
  if (login) await db.execute(sql`UPDATE GitPullRequest SET author_user_id = ${userId} WHERE author_user_id IS NULL AND LOWER(author_login) = ${login}`);
  const { refreshDraft } = await import("./drafts");
  for (const p of projects) await refreshDraft(p, userId).catch(() => undefined);
  return projects.length;
}

/**
 * "My GitHub username is …": no OAuth needed. GitHub confirms the account exists; one account
 * belongs to one person (taken → ask the project lead). Commits already pushed become theirs.
 */
export async function claimLogin(userId: number, raw: unknown) {
  const login = String(raw ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/.*$/, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) fail(400, "VALIDATION", "Type your GitHub username, e.g. aimee-uwera", "login");
  const r = await restGet(`/users/${login}`);
  if (r.status === 404) fail(400, "NOT_FOUND", "GitHub has no account with this username", "login");
  if (r.status !== 200 || !r.data) fail(503, "GITHUB_UNAVAILABLE", "Couldn't check the username with GitHub. Try again in a minute", "login");
  const u = r.data;
  const taken = await one(sql`SELECT user_id FROM GitIdentity WHERE (github_user_id = ${u.id} OR LOWER(login) = ${String(u.login).toLowerCase()}) AND user_id <> ${userId}`);
  if (taken) fail(409, "TAKEN", "This GitHub account is linked to someone else. Ask the project lead to check it", "login");
  await db.execute(sql`
    INSERT INTO GitIdentity (user_id, github_user_id, login, name, avatar_url, emails, prefs, source, verified_at, created_at, updated_at)
    VALUES (${userId}, ${u.id}, ${u.login}, ${u.name ?? null}, ${u.avatar_url ?? null}, NULL, NULL, 'CLAIM', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE github_user_id = VALUES(github_user_id), login = VALUES(login), name = VALUES(name), avatar_url = VALUES(avatar_url), source = 'CLAIM', updated_at = UTC_TIMESTAMP()`);
  const projects = await adopt(userId, { login: u.login });
  return { login: u.login as string, name: (u.name ?? null) as string | null, avatarUrl: (u.avatar_url ?? null) as string | null, projects };
}

/**
 * "That's me" on an author the MIS couldn't match (a commit email that isn't the MIS email).
 * Any teammate may claim an unmatched author for themself; one already mapped to someone else
 * stays theirs (the lead can still reassign it).
 */
export async function claimAuthor(projectId: number, userId: number, body: { login?: unknown; email?: unknown }) {
  const login = body.login ? String(body.login).toLowerCase().slice(0, 190) : null;
  const email = body.email ? String(body.email).toLowerCase().slice(0, 190) : null;
  if (!login && !email) fail(400, "VALIDATION", "Which author?", "login");
  const exists = await one(sql`
    SELECT 1 AS x FROM GitCommit WHERE project_id = ${projectId} AND author_user_id IS NULL
      AND (${login ? sql`LOWER(author_login) = ${login}` : sql`0`} OR ${email ? sql`author_email = ${email}` : sql`0`}) LIMIT 1`);
  if (!exists) fail(404, "NOT_FOUND", "These commits are already matched to someone");
  for (const [type, value] of [["LOGIN", login], ["EMAIL", email]] as const) {
    if (!value) continue;
    const m = await one(sql`SELECT user_id, ignored FROM GitAuthorMap WHERE key_type = ${type} AND key_value = ${value}`);
    if (m && (Number(m.ignored) || (m.user_id && Number(m.user_id) !== userId))) fail(409, "TAKEN", "This author is already matched to someone else. Ask the project lead");
    await db.execute(sql`
      INSERT INTO GitAuthorMap (key_type, key_value, user_id, ignored, created_by, created_at) VALUES (${type}, ${value}, ${userId}, 0, ${userId}, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`);
  }
  await adopt(userId, { login, email });
  return { ok: true };
}

/** Link-mode details for the panel (never the token). */
export async function linkModeInfo(projectId: number) {
  const r = await one(sql`
    SELECT access_mode, token_hint, sync_error,
           DATE_FORMAT(synced_at, '%Y-%m-%dT%H:%i:%sZ') AS synced_at
    FROM GitRepoLink WHERE project_id = ${projectId} AND status = 'ACTIVE'`);
  if (!r) return null;
  return { mode: String(r.access_mode) as "APP" | "LINK", tokenHint: r.token_hint ?? null, syncedAt: r.synced_at ?? null, syncError: r.sync_error ?? null };
}
