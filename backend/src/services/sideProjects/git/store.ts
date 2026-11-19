import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { controlPool, isControlPlaneMissing } from "../../../db/platform";
import { getTenant, primaryTenantCtx, type TenantCtx } from "../../../tenancy";
import logger from "../../../utils/logger";
import { fail, many, one } from "../core";
import { coAuthors, isBot, noreplyId, suggestKey, TASK_KEY_RE } from "./refs";

/** Per-repository settings (GitRepoLink.settings). */
export interface RepoSettings {
  /** Move tasks from Git events (branch -> In progress, PR -> In review, merge -> Done). */
  automations: boolean;
  /** Submit open drafts automatically this many days after the Friday notice; null = never. */
  autoSubmitDays: number | null;
  /** Extra paths that never count as work (lockfiles etc. are built in). */
  ignoredPaths: string[];
  /** Offer the AI wording of drafts (still subject to the school AI policy). */
  aiPolish: boolean;
  /** Post a "Linked to KEY-n" check on pull requests (needs Checks: write). */
  checks: boolean;
}

export function settingsOf(raw: unknown, kind?: string | null): RepoSettings {
  let s: any = {};
  try {
    s = typeof raw === "string" && raw ? JSON.parse(raw) : raw && typeof raw === "object" ? raw : {};
  } catch {
    s = {};
  }
  const studio = kind === "DELIVERY_STUDIO";
  return {
    automations: s.automations !== false,
    // Agreed defaults: Delivery Studio auto-submits after 2 days; student projects never.
    autoSubmitDays: s.autoSubmitDays === null ? null : Number.isInteger(s.autoSubmitDays) ? Math.min(14, Math.max(1, s.autoSubmitDays)) : studio ? 2 : null,
    ignoredPaths: Array.isArray(s.ignoredPaths) ? s.ignoredPaths.map(String).filter(Boolean).slice(0, 30) : [],
    aiPolish: s.aiPolish !== false,
    checks: s.checks === true,
  };
}

export interface RepoLink {
  linkId: number;
  projectId: number;
  repoId: number;
  fullName: string;
  htmlUrl: string;
  installationId: number | null;
  defaultBranch: string;
  pathPrefix: string | null;
  settings: RepoSettings;
  taskKey: string | null;
  title: string;
  kind: string;
}

const linkSelect = sql`
  SELECT l.link_id, l.project_id, l.repo_id, l.full_name, l.html_url, l.installation_id, l.default_branch, l.path_prefix, l.settings,
         sp.task_key, sp.title, sp.kind
  FROM GitRepoLink l JOIN SideProject sp ON sp.project_id = l.project_id AND sp.deleted_at IS NULL`;

const toLink = (r: any): RepoLink => ({
  linkId: Number(r.link_id),
  projectId: Number(r.project_id),
  repoId: Number(r.repo_id),
  fullName: r.full_name,
  htmlUrl: r.html_url,
  installationId: r.installation_id ? Number(r.installation_id) : null,
  defaultBranch: r.default_branch || "main",
  pathPrefix: r.path_prefix || null,
  settings: settingsOf(r.settings, r.kind),
  taskKey: r.task_key || null,
  title: r.title,
  kind: r.kind,
});

export async function linksForRepo(repoId: number): Promise<RepoLink[]> {
  return (await many(sql`${linkSelect} WHERE l.repo_id = ${repoId} AND l.status = 'ACTIVE'`)).map(toLink);
}

export async function linkForProject(projectId: number): Promise<RepoLink | null> {
  const r = await one(sql`${linkSelect} WHERE l.project_id = ${projectId} AND l.status = 'ACTIVE'`);
  return r ? toLink(r) : null;
}

/**
 * A monorepo may feed several projects, each owning a path prefix; a commit belongs to the
 * project whose prefix matches most of its files (no prefix = the whole repository).
 */
export function pickLink(links: RepoLink[], files: string[]): RepoLink | null {
  if (!links.length) return null;
  if (links.length === 1) return links[0];
  let best: RepoLink | null = null;
  let bestScore = -1;
  for (const l of links) {
    const p = l.pathPrefix ? l.pathPrefix.replace(/^\/+/, "") : "";
    const score = p ? files.filter((f) => f.startsWith(p)).length : 0.5;
    if (score > bestScore) {
      best = l;
      bestScore = score;
    }
  }
  return best;
}

/** The project's task key, created on first use from the title (unique per tenant). */
export async function ensureTaskKey(projectId: number): Promise<string> {
  const p = await one(sql`SELECT title, task_key FROM SideProject WHERE project_id = ${projectId}`);
  if (!p) fail(404, "NOT_FOUND", "Project not found");
  if (p.task_key) return p.task_key;
  const base = suggestKey(p.title);
  for (let i = 0; i < 30; i++) {
    const key = i === 0 ? base : `${base.slice(0, 4)}${String.fromCharCode(65 + ((i - 1) % 26))}`.slice(0, 5);
    const taken = await one(sql`SELECT project_id FROM SideProject WHERE task_key = ${key}`);
    if (taken) continue;
    await db.execute(sql`UPDATE SideProject SET task_key = ${key} WHERE project_id = ${projectId} AND task_key IS NULL`);
    const now = await one(sql`SELECT task_key FROM SideProject WHERE project_id = ${projectId}`);
    return now.task_key;
  }
  const fallback = `P${projectId}`.slice(0, 5).replace(/[^A-Z]/g, "X");
  await db.execute(sql`UPDATE SideProject SET task_key = ${fallback} WHERE project_id = ${projectId} AND task_key IS NULL`);
  return fallback;
}

export async function setTaskKey(projectId: number, raw: unknown): Promise<string> {
  const key = String(raw ?? "").trim().toUpperCase();
  if (!TASK_KEY_RE.test(key)) fail(400, "VALIDATION", "Use 2 to 5 capital letters, e.g. FOP", "taskKey");
  const taken = await one(sql`SELECT project_id FROM SideProject WHERE task_key = ${key} AND project_id <> ${projectId}`);
  if (taken) fail(409, "KEY_TAKEN", "Another project already uses this key", "taskKey");
  await db.execute(sql`UPDATE SideProject SET task_key = ${key} WHERE project_id = ${projectId}`);
  return key;
}

// ─── Who made a commit ────────────────────────────────────────────────────────

export interface Author {
  login?: string | null;
  email?: string | null;
  name?: string | null;
  githubId?: number | null;
}

/** The MIS person behind a Git author, null when unknown; "ignored" for bots and ignored authors. */
export async function resolveAuthor(a: Author): Promise<number | null | "ignored"> {
  const login = (a.login || "").trim();
  const email = (a.email || "").trim().toLowerCase();
  if (isBot(login, email)) return "ignored";
  if (a.githubId) {
    const r = await one(sql`SELECT user_id FROM GitIdentity WHERE github_user_id = ${a.githubId}`);
    if (r) return Number(r.user_id);
  }
  if (login) {
    const r = await one(sql`SELECT user_id FROM GitIdentity WHERE login = ${login}`);
    if (r) return Number(r.user_id);
  }
  const nid = noreplyId(email);
  if (nid) {
    const r = await one(sql`SELECT user_id FROM GitIdentity WHERE github_user_id = ${nid}`);
    if (r) return Number(r.user_id);
  }
  if (email) {
    const r = await one(sql`SELECT user_id FROM GitIdentity WHERE emails LIKE ${`%"${email.replace(/[%_"]/g, "")}"%`}`);
    if (r) return Number(r.user_id);
    const u = await one(sql`SELECT user_id FROM User WHERE LOWER(email) = ${email} AND status = 'ACTIVE' LIMIT 2`);
    if (u) return Number(u.user_id);
  }
  for (const [type, value] of [["LOGIN", login.toLowerCase()], ["EMAIL", email]] as const) {
    if (!value) continue;
    const m = await one(sql`SELECT user_id, ignored FROM GitAuthorMap WHERE key_type = ${type} AND key_value = ${value}`);
    if (m) return Number(m.ignored) ? "ignored" : m.user_id ? Number(m.user_id) : null;
  }
  return null;
}

export async function resolveCoauthors(message: string, exclude: number | null): Promise<number[]> {
  const out = new Set<number>();
  for (const email of coAuthors(message)) {
    const u = await resolveAuthor({ email });
    if (typeof u === "number" && u !== exclude) out.add(u);
  }
  return [...out];
}

// ─── Signed state (install / OAuth round trips, push actions) ────────────────

const stateSecret = () => process.env.GITHUB_STATE_SECRET || process.env.JWT_SECRET || "nga-git-dev";

export function signState(payload: Record<string, unknown>, ttlSeconds = 15 * 60): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readState<T = any>(state: unknown): T | null {
  const [body, sig] = String(state ?? "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p as T;
  } catch {
    return null;
  }
}

// ─── Installation -> tenant (control plane) ──────────────────────────────────

export async function routeInstallation(installationId: number, tid: number, login: string | null): Promise<void> {
  try {
    await controlPool().query(
      `INSERT INTO GitHubInstallationRoute (installation_id, tenant_id, account_login, created_at, updated_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE account_login = VALUES(account_login), updated_at = UTC_TIMESTAMP()`,
      [installationId, tid, login],
    );
    const [rows]: any = await controlPool().query(`SELECT tenant_id FROM GitHubInstallationRoute WHERE installation_id = ?`, [installationId]);
    if (rows[0] && Number(rows[0].tenant_id) !== tid) fail(409, "INSTALLATION_ELSEWHERE", "This GitHub installation is already connected to another school");
  } catch (e) {
    if (isControlPlaneMissing(e)) return; // single-tenant installs: everything is the primary tenant
    throw e;
  }
}

/** The tenant an installation belongs to; the primary tenant when there is no control plane. */
export async function tenantForInstallation(installationId: number | null): Promise<TenantCtx | null> {
  if (!installationId) return null;
  try {
    const [rows]: any = await controlPool().query(`SELECT tenant_id FROM GitHubInstallationRoute WHERE installation_id = ?`, [installationId]);
    if (!rows[0]) return null;
    return (await getTenant(Number(rows[0].tenant_id))) ?? null;
  } catch (e) {
    if (isControlPlaneMissing(e)) return primaryTenantCtx();
    logger.error("[git] installation route lookup failed", { error: e });
    return null;
  }
}
