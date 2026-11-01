import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import logger from "../../utils/logger";
import { ACCESS_TTL_S, CODE_TTL_S, REFRESH_TTL_S } from "./config";

/**
 * Storage for the connector's OAuth server (migration 126). Codes, tokens and client
 * secrets are random values the MIS shows once; only their SHA-256 is stored.
 * Timestamps are written and compared as JS dates (one clock, whatever the DB's zone).
 */

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));
const affected = (r: unknown): number => Number((Array.isArray(r) ? (r[0] as any) : (r as any))?.affectedRows ?? 0);
const missingTable = (e: any) => e?.code === "ER_NO_SUCH_TABLE" || e?.cause?.code === "ER_NO_SUCH_TABLE";

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const random = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

/** Constant-time comparison of two hex digests. */
export const sameHash = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ── Clients ──────────────────────────────────────────────────────────────

export interface OAuthClientRow {
  clientId: string;
  name: string;
  clientUri: string | null;
  redirectUris: string[];
  authMethod: "none" | "client_secret_post" | "client_secret_basic";
  secretHash: string | null;
  registrationType: "dynamic" | "admin";
  status: string;
}

const parseJson = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

export async function getClient(clientId: string): Promise<OAuthClientRow | null> {
  if (!clientId || clientId.length > 64) return null;
  const [r] = rows(await db.execute(sql`SELECT * FROM OAuthClient WHERE client_id = ${clientId} LIMIT 1`));
  if (!r || r.status !== "active") return null;
  const uris = parseJson(r.redirect_uris);
  return {
    clientId: r.client_id,
    name: r.client_name,
    clientUri: r.client_uri ?? null,
    redirectUris: Array.isArray(uris) ? uris.map(String) : [],
    authMethod: r.token_endpoint_auth_method,
    secretHash: r.client_secret_hash ?? null,
    registrationType: r.registration_type === "admin" ? "admin" : "dynamic",
    status: r.status,
  };
}

export async function createClient(input: {
  name: string;
  clientUri?: string | null;
  redirectUris: string[];
  authMethod: OAuthClientRow["authMethod"];
  registrationType: "dynamic" | "admin";
  createdBy?: number | null;
}): Promise<{ clientId: string; clientSecret: string | null; createdAt: Date }> {
  const clientId = `nga_${random(18)}`;
  const clientSecret = input.authMethod === "none" ? null : random(32);
  const createdAt = new Date();
  await db.execute(sql`
    INSERT INTO OAuthClient (client_id, client_secret_hash, client_name, client_uri, redirect_uris, token_endpoint_auth_method, registration_type, created_by, status, created_at)
    VALUES (${clientId}, ${clientSecret ? sha256(clientSecret) : null}, ${input.name}, ${input.clientUri ?? null}, ${JSON.stringify(input.redirectUris)},
            ${input.authMethod}, ${input.registrationType}, ${input.createdBy ?? null}, 'active', ${createdAt})`);
  return { clientId, clientSecret, createdAt };
}

// ── Authorization codes ──────────────────────────────────────────────────

export interface CodeGrant {
  clientId: string;
  userId: number;
  redirectUri: string;
  scope: string;
  resource: string;
  codeChallenge: string;
}

export async function createCode(g: CodeGrant): Promise<string> {
  const code = random(32);
  await db.execute(sql`
    INSERT INTO OAuthAuthCode (code_hash, client_id, user_id, redirect_uri, scope, resource, code_challenge, family_id, expires_at, created_at)
    VALUES (${sha256(code)}, ${g.clientId}, ${g.userId}, ${g.redirectUri}, ${g.scope}, ${g.resource}, ${g.codeChallenge},
            ${crypto.randomBytes(16).toString("hex")}, ${later(CODE_TTL_S)}, ${new Date()})`);
  return code;
}

export type CodeUse =
  | { ok: true; grant: CodeGrant & { familyId: string } }
  | { ok: false; reason: "unknown" | "expired" | "replayed" };

/**
 * Spend a code once. A second use is treated as theft (OAuth 2.1 §4.1.3): the tokens the
 * first use issued are revoked.
 */
export async function consumeCode(code: string): Promise<CodeUse> {
  const hash = sha256(code);
  const [r] = rows(await db.execute(sql`SELECT * FROM OAuthAuthCode WHERE code_hash = ${hash} LIMIT 1`));
  if (!r) return { ok: false, reason: "unknown" };
  const now = new Date();
  const spent = affected(await db.execute(sql`UPDATE OAuthAuthCode SET used_at = ${now} WHERE code_hash = ${hash} AND used_at IS NULL`));
  if (!spent) {
    await revokeFamily(r.family_id);
    return { ok: false, reason: "replayed" };
  }
  if (new Date(r.expires_at).getTime() < now.getTime()) return { ok: false, reason: "expired" };
  return {
    ok: true,
    grant: {
      clientId: r.client_id,
      userId: Number(r.user_id),
      redirectUri: r.redirect_uri,
      scope: r.scope,
      resource: r.resource,
      codeChallenge: r.code_challenge,
      familyId: r.family_id,
    },
  };
}

// ── Tokens ───────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export async function issueTokens(p: {
  clientId: string;
  userId: number;
  scope: string;
  resource: string;
  familyId: string;
  tokenVersion: number;
}): Promise<TokenPair> {
  const accessToken = `nga_at_${random(32)}`;
  const refreshToken = `nga_rt_${random(32)}`;
  const now = new Date();
  const insert = (hash: string, kind: string, expires: Date) =>
    db.execute(sql`
      INSERT INTO OAuthToken (token_hash, kind, client_id, user_id, scope, resource, family_id, token_version, expires_at, created_at)
      VALUES (${hash}, ${kind}, ${p.clientId}, ${p.userId}, ${p.scope}, ${p.resource}, ${p.familyId}, ${p.tokenVersion}, ${expires}, ${now})`);
  await insert(sha256(accessToken), "access", later(ACCESS_TTL_S));
  await insert(sha256(refreshToken), "refresh", later(REFRESH_TTL_S));
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S, scope: p.scope };
}

export interface StoredToken {
  tokenId: number;
  kind: "access" | "refresh";
  clientId: string;
  userId: number;
  scope: string[];
  resource: string;
  familyId: string;
  tokenVersion: number;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export async function findToken(token: string): Promise<StoredToken | null> {
  if (!token || token.length > 200) return null;
  let r: any;
  try {
    [r] = rows(await db.execute(sql`SELECT * FROM OAuthToken WHERE token_hash = ${sha256(token)} LIMIT 1`));
  } catch (e) {
    if (missingTable(e)) return null;
    throw e;
  }
  if (!r) return null;
  return {
    tokenId: Number(r.token_id),
    kind: r.kind,
    clientId: r.client_id,
    userId: Number(r.user_id),
    scope: String(r.scope).split(/\s+/).filter(Boolean),
    resource: r.resource,
    familyId: r.family_id,
    tokenVersion: Number(r.token_version),
    expiresAt: new Date(r.expires_at),
    revokedAt: r.revoked_at ? new Date(r.revoked_at) : null,
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : null,
  };
}

/** A token is usable when it is the right kind, unrevoked and unexpired. */
export const tokenLive = (t: StoredToken | null, kind: StoredToken["kind"]): t is StoredToken =>
  !!t && t.kind === kind && !t.revokedAt && t.expiresAt.getTime() > Date.now();

/**
 * Spend a refresh token (rotation). Returns false when it was already spent: a replayed
 * refresh token means it leaked, so the whole chain is revoked.
 */
export async function spendRefresh(t: StoredToken): Promise<boolean> {
  const n = affected(await db.execute(sql`UPDATE OAuthToken SET revoked_at = ${new Date()}, last_used_at = ${new Date()} WHERE token_id = ${t.tokenId} AND revoked_at IS NULL`));
  return n > 0;
}

export async function revokeFamily(familyId: string): Promise<void> {
  await db.execute(sql`UPDATE OAuthToken SET revoked_at = ${new Date()} WHERE family_id = ${familyId} AND revoked_at IS NULL`);
}

/** Note when a token was last used, at most once a minute per token. */
export async function touchToken(t: StoredToken): Promise<void> {
  if (t.lastUsedAt && Date.now() - t.lastUsedAt.getTime() < 60_000) return;
  await db.execute(sql`UPDATE OAuthToken SET last_used_at = ${new Date()} WHERE token_id = ${t.tokenId}`).catch(() => undefined);
}

/** Revoke every connector token a person holds (deactivation), or those of one client (Revoke in My AI). */
export async function revokeUserTokens(userId: number, clientId?: string): Promise<number> {
  try {
    const r = clientId
      ? await db.execute(sql`UPDATE OAuthToken SET revoked_at = ${new Date()} WHERE user_id = ${userId} AND client_id = ${clientId} AND revoked_at IS NULL`)
      : await db.execute(sql`UPDATE OAuthToken SET revoked_at = ${new Date()} WHERE user_id = ${userId} AND revoked_at IS NULL`);
    return affected(r);
  } catch (e) {
    if (missingTable(e)) return 0;
    logger.error(`[mcp] revoking tokens of user ${userId} failed: ${(e as any)?.message ?? e}`);
    throw e;
  }
}

export interface Connection {
  clientId: string;
  name: string;
  clientUri: string | null;
  scopes: string[];
  connectedAt: string;
  lastUsedAt: string | null;
}

/** The person's connected AI apps: clients with a live refresh token. */
export async function listConnections(userId: number): Promise<Connection[]> {
  try {
    const now = new Date();
    const r = rows(
      await db.execute(sql`
        SELECT t.client_id, c.client_name, c.client_uri,
               MIN(t.created_at) AS connected_at,
               MAX(t.last_used_at) AS last_used_at,
               SUBSTRING_INDEX(GROUP_CONCAT(t.scope ORDER BY t.token_id DESC SEPARATOR '|'), '|', 1) AS scope
        FROM OAuthToken t JOIN OAuthClient c ON c.client_id = t.client_id
        WHERE t.user_id = ${userId}
          AND t.family_id IN (SELECT family_id FROM (
                SELECT family_id FROM OAuthToken
                WHERE user_id = ${userId} AND kind = 'refresh' AND revoked_at IS NULL AND expires_at > ${now}) live)
        GROUP BY t.client_id, c.client_name, c.client_uri
        ORDER BY last_used_at DESC, connected_at DESC`),
    );
    const iso = (v: unknown) => (v ? new Date(v as any).toISOString() : null);
    return r.map((x) => ({
      clientId: x.client_id,
      name: x.client_name,
      clientUri: x.client_uri ?? null,
      scopes: String(x.scope ?? "").split(/\s+/).filter(Boolean),
      connectedAt: iso(x.connected_at)!,
      lastUsedAt: iso(x.last_used_at),
    }));
  } catch (e) {
    if (missingTable(e)) return [];
    throw e;
  }
}

// ── Audit ────────────────────────────────────────────────────────────────

/** One row per tools/call. Never the arguments or the result. Never throws. */
export async function auditToolCall(a: { userId: number; clientId: string; tool: string; ok: boolean; errorCode?: string | null; durationMs: number }) {
  try {
    await db.execute(sql`
      INSERT INTO McpAuditLog (user_id, client_id, tool_name, ok, error_code, duration_ms, created_at)
      VALUES (${a.userId}, ${a.clientId.slice(0, 64)}, ${a.tool.slice(0, 80)}, ${a.ok ? 1 : 0}, ${a.errorCode ? a.errorCode.slice(0, 40) : null},
              ${Math.max(0, Math.round(a.durationMs))}, ${new Date()})`);
  } catch (e) {
    logger.warn(`[mcp] audit write failed: ${(e as any)?.message ?? e}`);
  }
}
