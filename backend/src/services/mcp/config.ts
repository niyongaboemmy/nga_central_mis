import { publicApiBase } from "../avatar/urls";

/**
 * Addresses of the NGA connector (EXTERNAL_AI_CONTRACT.md §2). Read per call so tests and
 * deployments can change them without a restart.
 *
 *   issuer    the OAuth authorization server: the public API origin (https://api.amashuri.com)
 *   resource  the MCP endpoint and token audience (https://api.amashuri.com/mcp)
 *   frontend  where the consent page lives (FRONTEND_URL, the MIS web app)
 */

const trim = (s: string) => s.trim().replace(/\/+$/, "");

export const mcpIssuer = () => trim(process.env.MCP_ISSUER || publicApiBase());
export const mcpResource = () => trim(process.env.MCP_RESOURCE_URL || `${mcpIssuer()}/mcp`);
export const mcpFrontend = () => trim(process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173");

export const SCOPE_READ = "nga.read";
export const SCOPE_DRAFTS = "nga.drafts";
export const SCOPE_PUPIL_NAMES = "pupil_names";
export const SCOPES_SUPPORTED = [SCOPE_READ, SCOPE_DRAFTS, SCOPE_PUPIL_NAMES];
export const DEFAULT_SCOPE = `${SCOPE_READ} ${SCOPE_DRAFTS}`;

export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 30 * 24 * 60 * 60;
export const CODE_TTL_S = 10 * 60;

/** The resource a client named (RFC 8707) is ours, with or without a trailing slash. */
export const isOurResource = (r: string) => trim(r) === mcpResource();

/** Parse a space-separated scope string into known scopes, keeping order and dropping repeats. */
export function parseScope(raw: unknown): string[] {
  const parts = typeof raw === "string" ? raw.split(/\s+/).filter(Boolean) : [];
  return [...new Set(parts)];
}

export const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** https anywhere, or http on this machine only (desktop clients). No fragments. */
export function validRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK.test(u.hostname);
}
