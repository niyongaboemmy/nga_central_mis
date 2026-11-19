import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * The "NGA Projects" GitHub App (GIT_AUTOMATED_REPORTING_ANALYSIS.md §9).
 *
 * A public app owned by a personal account (there is no GitHub organisation): each repository
 * owner installs it on their own account for the repositories they choose; teammates only
 * authorise it (user OAuth) so their commits can be matched to them.
 *
 * Environment (all required for the integration to switch on):
 *   GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY (PEM; "\n" escapes allowed),
 *   GITHUB_WEBHOOK_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET.
 * Optional: GITHUB_API_URL (tests), GITHUB_WEB_URL.
 *
 * Read-only by design: Contents, Metadata, Pull requests (read); optional Checks (write) only
 * when a repository turns "checks" on. Installation tokens are minted on demand (about one
 * hour), cached for 50 minutes and never stored.
 */

export interface GitHubConfig {
  appId: string;
  slug: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
  apiUrl: string;
  webUrl: string;
}

export function githubConfig(): GitHubConfig | null {
  const e = process.env;
  const privateKey = (e.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!e.GITHUB_APP_ID || !e.GITHUB_APP_SLUG || !privateKey || !e.GITHUB_WEBHOOK_SECRET || !e.GITHUB_CLIENT_ID || !e.GITHUB_CLIENT_SECRET) return null;
  return {
    appId: e.GITHUB_APP_ID,
    slug: e.GITHUB_APP_SLUG,
    privateKey,
    webhookSecret: e.GITHUB_WEBHOOK_SECRET,
    clientId: e.GITHUB_CLIENT_ID,
    clientSecret: e.GITHUB_CLIENT_SECRET,
    apiUrl: (e.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, ""),
    webUrl: (e.GITHUB_WEB_URL || "https://github.com").replace(/\/$/, ""),
  };
}

export const githubEnabled = () => githubConfig() !== null;

/** Webhook signature (X-Hub-Signature-256) over the raw body, compared in constant time. */
export function verifySignature(raw: Buffer, header: string | undefined, secret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`);
  const got = Buffer.from(header);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Tests replace GitHub with a fake. */
export const setGitHubFetch = (f: Fetch | null) => {
  fetchImpl = f ?? ((...a) => fetch(...a));
  tokens.clear();
};

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function appJwt(cfg: GitHubConfig): string {
  const now = Math.floor(Date.now() / 1000);
  // Issued 60 s in the past against clock drift; GitHub allows at most 10 minutes.
  return jwt.sign({ iat: now - 60, exp: now + 9 * 60, iss: cfg.appId }, cfg.privateKey, { algorithm: "RS256" });
}

async function call(cfg: GitHubConfig, path: string, init: { method?: string; token?: string; bearer?: string; body?: unknown } = {}): Promise<any> {
  const url = path.startsWith("http") ? path : `${cfg.apiUrl}${path}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nga-projects" };
  if (init.token) headers.Authorization = `token ${init.token}`;
  if (init.bearer) headers.Authorization = `Bearer ${init.bearer}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetchImpl(url, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const reset = res.headers.get("x-ratelimit-reset") || res.headers.get("retry-after");
    throw new GitHubError(res.status, `GitHub ${res.status}${reset ? ` (retry after ${reset})` : ""}: ${typeof data === "object" && data?.message ? data.message : String(text).slice(0, 120)}`);
  }
  return data;
}

const tokens = new Map<number, { token: string; until: number }>();

/** A short-lived installation token (cached 50 minutes). */
export async function installationToken(installationId: number): Promise<string> {
  const cfg = githubConfig();
  if (!cfg) throw new GitHubError(503, "GitHub isn't configured");
  const hit = tokens.get(installationId);
  if (hit && hit.until > Date.now()) return hit.token;
  const r = await call(cfg, `/app/installations/${installationId}/access_tokens`, { method: "POST", bearer: appJwt(cfg), body: {} });
  tokens.set(installationId, { token: r.token, until: Date.now() + 50 * 60_000 });
  return r.token;
}

export async function getInstallation(installationId: number): Promise<{ id: number; account: { id: number; login: string; type: string } }> {
  const cfg = githubConfig();
  if (!cfg) throw new GitHubError(503, "GitHub isn't configured");
  return call(cfg, `/app/installations/${installationId}`, { bearer: appJwt(cfg) });
}

export interface RepoInfo {
  id: number;
  full_name: string;
  html_url: string;
  default_branch: string;
  private: boolean;
}

export async function installationRepos(installationId: number): Promise<RepoInfo[]> {
  const cfg = githubConfig()!;
  const token = await installationToken(installationId);
  const out: RepoInfo[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await call(cfg, `/installation/repositories?per_page=100&page=${page}`, { token });
    out.push(...(r.repositories ?? []).map((x: any) => ({ id: x.id, full_name: x.full_name, html_url: x.html_url, default_branch: x.default_branch || "main", private: !!x.private })));
    if (!r.repositories || r.repositories.length < 100) break;
  }
  return out;
}

export async function repoGet(installationId: number, path: string): Promise<any> {
  const cfg = githubConfig()!;
  return call(cfg, path, { token: await installationToken(installationId) });
}

export async function repoPost(installationId: number, path: string, body: unknown): Promise<any> {
  const cfg = githubConfig()!;
  return call(cfg, path, { method: "POST", token: await installationToken(installationId), body });
}

/** Where to send someone to install the app (state comes back on the setup URL). */
export function installUrl(state: string): string {
  const cfg = githubConfig()!;
  return `${cfg.webUrl}/apps/${cfg.slug}/installations/new?state=${encodeURIComponent(state)}`;
}

/** User OAuth ("Connect GitHub"): who you are on GitHub, nothing more. */
export function authorizeUrl(state: string, redirectUri: string): string {
  const cfg = githubConfig()!;
  return `${cfg.webUrl}/login/oauth/authorize?client_id=${encodeURIComponent(cfg.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ user: { id: number; login: string; name: string | null; avatar_url: string | null }; emails: string[] }> {
  const cfg = githubConfig()!;
  const res = await fetchImpl(`${cfg.webUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "nga-projects" },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: redirectUri }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new GitHubError(400, data.error_description || "GitHub sign-in failed");
  const user = await call(cfg, "/user", { bearer: data.access_token });
  let emails: string[] = [];
  try {
    const list = await call(cfg, "/user/emails", { bearer: data.access_token });
    emails = (Array.isArray(list) ? list : []).filter((e: any) => e.verified).map((e: any) => String(e.email).toLowerCase());
  } catch {
    if (user.email) emails = [String(user.email).toLowerCase()];
  }
  // The token is not kept: identity is all the MIS needs.
  return { user: { id: user.id, login: user.login, name: user.name ?? null, avatar_url: user.avatar_url ?? null }, emails };
}
