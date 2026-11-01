import crypto from "crypto";
import cors from "cors";
import express, { Router } from "express";
import jwt from "jsonwebtoken";
import { authenticate, getUserSessionState } from "../../middleware/auth";
import { asyncHandler } from "../../middleware/asyncHandler";
import { perMinute, rateLimitByIp } from "../../middleware/rateLimit";
import logger from "../../utils/logger";
import {
  CODE_TTL_S,
  DEFAULT_SCOPE,
  SCOPES_SUPPORTED,
  SCOPE_DRAFTS,
  SCOPE_PUPIL_NAMES,
  SCOPE_READ,
  LOOPBACK,
  isOurResource,
  mcpFrontend,
  mcpIssuer,
  mcpResource,
  parseScope,
  validRedirectUri,
} from "./config";
import { ConnectorError, assertConnectorAllowed, loadPerson } from "./gate";
import {
  consumeCode,
  createClient,
  createCode,
  findToken,
  getClient,
  issueTokens,
  listConnections,
  revokeFamily,
  revokeUserTokens,
  sameHash,
  sha256,
  spendRefresh,
  tokenLive,
  type OAuthClientRow,
} from "./oauthStore";
import { mcpNotAllowed, mcpPost, protectedResourceMetadata } from "./server";
import { forgetAppTools } from "./relay";

/**
 * The NGA connector's OAuth 2.1 authorization server and MCP endpoint
 * (REUSING_AI_SUBSCRIPTIONS_ANALYSIS.md §3.1, EXTERNAL_AI_CONTRACT.md §2).
 *
 * Public (open CORS, no cookies, mounted before the app's body parsers and request log so
 * secrets in token requests are never logged):
 *   GET  /.well-known/oauth-protected-resource[/mcp]   RFC 9728
 *   GET  /.well-known/oauth-authorization-server[/mcp] RFC 8414
 *   POST /oauth/register     RFC 7591 dynamic registration (rate-limited)
 *   GET  /oauth/authorize    checks the request, then sends the browser to the MIS consent page
 *   POST /oauth/token        authorization_code (+PKCE S256) and refresh_token (rotated)
 *   POST /oauth/revoke       RFC 7009
 *   POST /mcp                the MCP server (GET/DELETE answer 405)
 *
 * Signed-in MIS user (the consent page, frontend /oauth/authorize):
 *   GET  /oauth/consent?request=   what is being asked
 *   POST /oauth/consent            { request, decision: "allow"|"deny", pupilNames }
 *
 * My AI:
 *   GET    /my-ai/connections            the person's connected AI apps
 *   DELETE /my-ai/connections/:clientId  revoke one
 */

const CONSENT_AUD = "nga-mcp-consent";

const open = cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "Accept", "MCP-Protocol-Version", "Mcp-Session-Id", "Last-Event-ID"],
  exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id", "MCP-Protocol-Version"],
  maxAge: 600,
});
const json = express.json({ limit: "1mb" });
const form = express.urlencoded({ extended: false, limit: "64kb" });
const registerLimit = rateLimitByIp(perMinute(10), "Too many client registrations, try again in a minute.");
const tokenLimit = rateLimitByIp(perMinute(60));

const oauthError = (res: any, status: number, error: string, description: string) => {
  res.set("Cache-Control", "no-store");
  return res.status(status).json({ error, error_description: description });
};

export function authorizationServerMetadata() {
  const iss = mcpIssuer();
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/oauth/authorize`,
    token_endpoint: `${iss}/oauth/token`,
    registration_endpoint: `${iss}/oauth/register`,
    revocation_endpoint: `${iss}/oauth/revoke`,
    scopes_supported: SCOPES_SUPPORTED,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${mcpFrontend()}/my-ai`,
  };
}

// ── redirect URIs ────────────────────────────────────────────────────────

/** Loopback redirect URIs may use any port (RFC 8252 §7.3); everything else matches exactly. */
function redirectMatches(registered: string[], asked: string): boolean {
  if (registered.includes(asked)) return true;
  let a: URL;
  try {
    a = new URL(asked);
  } catch {
    return false;
  }
  if (a.protocol !== "http:" || !LOOPBACK.test(a.hostname)) return false;
  return registered.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === a.hostname && u.pathname === a.pathname && u.search === a.search;
    } catch {
      return false;
    }
  });
}

const withParams = (base: string, params: Record<string, string | undefined | null>) => {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  return u.toString();
};

// ── client authentication at the token / revoke endpoints ────────────────

async function authenticateClient(req: any): Promise<OAuthClientRow | null> {
  let clientId = typeof req.body?.client_id === "string" ? req.body.client_id : "";
  let secret = typeof req.body?.client_secret === "string" ? req.body.client_secret : "";
  const basic = /^Basic\s+(.+)$/i.exec(String(req.get("Authorization") || ""))?.[1];
  if (basic) {
    const decoded = Buffer.from(basic, "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i > 0) {
      clientId = decodeURIComponent(decoded.slice(0, i));
      secret = decodeURIComponent(decoded.slice(i + 1));
    }
  }
  const client = await getClient(clientId);
  if (!client) return null;
  if (client.authMethod !== "none") {
    if (!secret || !client.secretHash || !sameHash(sha256(secret), client.secretHash)) return null;
  }
  return client;
}

// ── the consent request (signed, so the MIS front end can carry it) ──────

interface ConsentRequest {
  cid: string;
  ru: string;
  cc: string;
  sc: string;
  rs: string;
  st?: string;
}

const signConsent = (r: ConsentRequest) =>
  jwt.sign(r, process.env.JWT_SECRET!, { expiresIn: CODE_TTL_S + 300, audience: CONSENT_AUD, issuer: "nga-mis" });

function readConsent(raw: unknown): ConsentRequest | null {
  if (typeof raw !== "string" || raw.length > 4000) return null;
  try {
    const d: any = jwt.verify(raw, process.env.JWT_SECRET!, { audience: CONSENT_AUD, issuer: "nga-mis" });
    return typeof d?.cid === "string" && typeof d?.ru === "string" && typeof d?.cc === "string" ? d : null;
  } catch {
    return null;
  }
}

/** Scopes a client may get without asking: read and drafts. pupil_names only from the consent box. */
function baseScopes(asked: string): string[] {
  const wanted = parseScope(asked).filter((s) => s === SCOPE_READ || s === SCOPE_DRAFTS);
  return wanted.length ? wanted : DEFAULT_SCOPE.split(" ");
}

const SCOPE_TEXT: Record<string, string> = {
  [SCOPE_READ]: "Read your own teaching data: timetable, subjects and classes, schemes of work, lesson notes, curriculum, and your Task Mentor courses and question bank.",
  [SCOPE_DRAFTS]: "Create drafts only (lesson notes, questions, rubrics, mail, rules). Nothing is published, sent, graded or deleted: you confirm every draft in NGA.",
};

// ── routers ──────────────────────────────────────────────────────────────

/** Public OAuth + MCP endpoints. Mount before the app's CORS and body parsers. */
export function mcpPublicRouter(): Router {
  const r = Router();
  const paths = ["/mcp", "/oauth/register", "/oauth/token", "/oauth/revoke", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"];
  r.use(paths, open);

  const prm = (_req: any, res: any) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json(protectedResourceMetadata());
  };
  r.get("/.well-known/oauth-protected-resource", prm);
  r.get("/.well-known/oauth-protected-resource/mcp", prm);
  const asm = (_req: any, res: any) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json(authorizationServerMetadata());
  };
  r.get("/.well-known/oauth-authorization-server", asm);
  r.get("/.well-known/oauth-authorization-server/mcp", asm);

  r.post(
    "/oauth/register",
    registerLimit,
    json,
    form,
    asyncHandler(async (req: any, res: any) => {
      const b = req.body ?? {};
      const uris = b.redirect_uris;
      if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) {
        return oauthError(res, 400, "invalid_redirect_uri", "redirect_uris must be 1-10 https URLs (or http://localhost for desktop apps), without fragments.");
      }
      const method = b.token_endpoint_auth_method ?? "none";
      if (!["none", "client_secret_post", "client_secret_basic"].includes(method)) {
        return oauthError(res, 400, "invalid_client_metadata", "token_endpoint_auth_method must be none, client_secret_post or client_secret_basic.");
      }
      const grants: string[] = Array.isArray(b.grant_types) ? b.grant_types : ["authorization_code", "refresh_token"];
      if (!grants.every((g) => g === "authorization_code" || g === "refresh_token") || !grants.includes("authorization_code")) {
        return oauthError(res, 400, "invalid_client_metadata", "Only the authorization_code and refresh_token grants are supported.");
      }
      const responseTypes: string[] = Array.isArray(b.response_types) ? b.response_types : ["code"];
      if (!responseTypes.every((t) => t === "code")) return oauthError(res, 400, "invalid_client_metadata", 'Only response_type "code" is supported.');
      const name = (typeof b.client_name === "string" ? b.client_name : "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120) || "AI app";
      const clientUri = typeof b.client_uri === "string" && /^https:\/\//.test(b.client_uri) ? b.client_uri.slice(0, 255) : null;
      const created = await createClient({ name, clientUri, redirectUris: uris, authMethod: method, registrationType: "dynamic" });
      logger.info(`[mcp] registered client ${created.clientId} "${name}"`);
      res.set("Cache-Control", "no-store");
      res.status(201).json({
        client_id: created.clientId,
        client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
        ...(created.clientSecret ? { client_secret: created.clientSecret, client_secret_expires_at: 0 } : {}),
        client_name: name,
        ...(clientUri ? { client_uri: clientUri } : {}),
        redirect_uris: uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: method,
        scope: DEFAULT_SCOPE,
      });
    }),
  );

  r.get(
    "/oauth/authorize",
    asyncHandler(async (req: any, res: any) => {
      const q = req.query ?? {};
      const str = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
      const client = await getClient(str("client_id"));
      if (!client) return res.status(400).type("text/plain").send("This AI app is not registered with NGA. Remove the connector and add it again.");
      let redirectUri = str("redirect_uri");
      if (!redirectUri && client.redirectUris.length === 1) redirectUri = client.redirectUris[0];
      if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) {
        return res.status(400).type("text/plain").send("The AI app sent a return address NGA does not recognise.");
      }
      const state = str("state") || undefined;
      const fail = (error: string, description: string) =>
        res.redirect(302, withParams(redirectUri, { error, error_description: description, state, iss: mcpIssuer() }));
      if (str("response_type") !== "code") return fail("unsupported_response_type", 'response_type must be "code".');
      const challenge = str("code_challenge");
      if (str("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
        return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
      }
      const resource = str("resource") || mcpResource();
      if (!isOurResource(resource)) return fail("invalid_target", `The resource must be ${mcpResource()}.`);
      const request = signConsent({ cid: client.clientId, ru: redirectUri, cc: challenge, sc: baseScopes(str("scope")).join(" "), rs: mcpResource(), st: state });
      return res.redirect(302, `${mcpFrontend()}/oauth/authorize?request=${encodeURIComponent(request)}`);
    }),
  );

  r.post(
    "/oauth/token",
    tokenLimit,
    form,
    json,
    asyncHandler(async (req: any, res: any) => {
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      const client = await authenticateClient(req);
      if (!client) return oauthError(res, 401, "invalid_client", "Unknown client or wrong client secret.");
      const b = req.body ?? {};
      const grant = b.grant_type;

      const userOk = async (userId: number) => {
        const s = await getUserSessionState(userId);
        return s && s.status === "ACTIVE" ? Number(s.token_version ?? 0) : null;
      };
      const answer = (t: Awaited<ReturnType<typeof issueTokens>>) =>
        res.json({ access_token: t.accessToken, token_type: "Bearer", expires_in: t.expiresIn, refresh_token: t.refreshToken, scope: t.scope });

      if (grant === "authorization_code") {
        if (typeof b.code !== "string" || typeof b.code_verifier !== "string") return oauthError(res, 400, "invalid_request", "code and code_verifier are required.");
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier)) return oauthError(res, 400, "invalid_grant", "The code_verifier is malformed.");
        const used = await consumeCode(b.code);
        if (!used.ok) return oauthError(res, 400, "invalid_grant", used.reason === "expired" ? "The code has expired." : "The code is invalid or was already used.");
        const g = used.grant;
        if (g.clientId !== client.clientId) return oauthError(res, 400, "invalid_grant", "The code was issued to another client.");
        if (typeof b.redirect_uri === "string" ? b.redirect_uri !== g.redirectUri : client.redirectUris.length > 1) {
          return oauthError(res, 400, "invalid_grant", "redirect_uri does not match the authorization request.");
        }
        const computed = crypto.createHash("sha256").update(b.code_verifier).digest("base64url");
        if (computed !== g.codeChallenge) return oauthError(res, 400, "invalid_grant", "PKCE verification failed.");
        if (typeof b.resource === "string" && b.resource && !isOurResource(b.resource)) return oauthError(res, 400, "invalid_target", "Unknown resource.");
        const tv = await userOk(g.userId);
        if (tv === null) return oauthError(res, 400, "invalid_grant", "The NGA account is no longer active.");
        return answer(await issueTokens({ clientId: client.clientId, userId: g.userId, scope: g.scope, resource: g.resource, familyId: g.familyId, tokenVersion: tv }));
      }

      if (grant === "refresh_token") {
        if (typeof b.refresh_token !== "string") return oauthError(res, 400, "invalid_request", "refresh_token is required.");
        const t = await findToken(b.refresh_token);
        if (!t || t.kind !== "refresh" || t.clientId !== client.clientId) return oauthError(res, 400, "invalid_grant", "The refresh token is invalid.");
        if (t.revokedAt) {
          // A spent refresh token presented again: it leaked. End the whole chain.
          await revokeFamily(t.familyId);
          return oauthError(res, 400, "invalid_grant", "The refresh token was already used.");
        }
        if (!tokenLive(t, "refresh")) return oauthError(res, 400, "invalid_grant", "The refresh token has expired. Connect NGA again.");
        if (!(await spendRefresh(t))) {
          await revokeFamily(t.familyId);
          return oauthError(res, 400, "invalid_grant", "The refresh token was already used.");
        }
        const tv = await userOk(t.userId);
        // token_version is not compared: a MIS sign-out must not disconnect the person's AI app.
        if (tv === null) {
          await revokeFamily(t.familyId);
          return oauthError(res, 400, "invalid_grant", "Your NGA sign-in has ended. Connect NGA again.");
        }
        let scope = t.scope;
        if (typeof b.scope === "string" && b.scope.trim()) {
          const asked = parseScope(b.scope);
          if (!asked.every((s) => t.scope.includes(s))) return oauthError(res, 400, "invalid_scope", "A refresh cannot add scopes.");
          scope = asked;
        }
        return answer(await issueTokens({ clientId: client.clientId, userId: t.userId, scope: scope.join(" "), resource: t.resource, familyId: t.familyId, tokenVersion: tv }));
      }

      return oauthError(res, 400, "unsupported_grant_type", "Use authorization_code or refresh_token.");
    }),
  );

  r.post(
    "/oauth/revoke",
    tokenLimit,
    form,
    json,
    asyncHandler(async (req: any, res: any) => {
      res.set("Cache-Control", "no-store");
      const client = await authenticateClient(req);
      if (!client) return oauthError(res, 401, "invalid_client", "Unknown client or wrong client secret.");
      const t = typeof req.body?.token === "string" ? await findToken(req.body.token) : null;
      if (t && t.clientId === client.clientId) {
        await revokeFamily(t.familyId);
        forgetAppTools(t.userId);
      }
      res.status(200).json({});
    }),
  );

  r.post("/mcp", json, asyncHandler(mcpPost));
  r.get("/mcp", mcpNotAllowed);
  r.delete("/mcp", mcpNotAllowed);
  return r;
}

const connectorRefusal = (res: any, e: unknown) => {
  if (e instanceof ConnectorError) return res.status(403).json({ success: false, code: e.code, message: e.message });
  throw e;
};

/** The consent page's API (signed-in MIS user). Mount at /oauth after the body parsers. */
export function mcpConsentRouter(): Router {
  const r = Router();
  r.use(authenticate);

  r.get(
    "/consent",
    asyncHandler(async (req: any, res: any) => {
      const c = readConsent(req.query?.request);
      if (!c) return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "This sign-in link has expired. Start connecting NGA again from your AI app." });
      const client = await getClient(c.cid);
      if (!client) return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "This AI app is not registered with NGA." });
      const person = await loadPerson(Number(req.user.userId));
      try {
        await assertConnectorAllowed(person);
      } catch (e) {
        return connectorRefusal(res, e);
      }
      const scopes = c.sc.split(" ").filter((s) => SCOPE_TEXT[s]);
      res.json({
        success: true,
        data: {
          client: {
            name: client.name,
            clientUri: client.clientUri,
            redirectHost: new URL(c.ru).host,
            registeredBySchool: client.registrationType === "admin",
          },
          scopes: scopes.map((s) => ({ scope: s, text: SCOPE_TEXT[s] })),
          pupilNamesOption: person.policy.external.pupilNames === "with_consent",
        },
      });
    }),
  );

  r.post(
    "/consent",
    asyncHandler(async (req: any, res: any) => {
      // JSON only: a cross-site HTML form (urlencoded) can never approve a connection.
      if (!req.is("application/json")) return res.status(415).json({ success: false, code: "BAD_REQUEST", message: "Send JSON." });
      const c = readConsent(req.body?.request);
      if (!c) return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "This sign-in link has expired. Start connecting NGA again from your AI app." });
      const client = await getClient(c.cid);
      if (!client || !redirectMatches(client.redirectUris, c.ru)) return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "This AI app is not registered with NGA." });
      if (req.body?.decision !== "allow") {
        return res.json({ success: true, data: { redirectTo: withParams(c.ru, { error: "access_denied", error_description: "The person declined.", state: c.st, iss: mcpIssuer() }) } });
      }
      const userId = Number(req.user.userId);
      const person = await loadPerson(userId);
      try {
        await assertConnectorAllowed(person);
      } catch (e) {
        return connectorRefusal(res, e);
      }
      const scopes: string[] = c.sc.split(" ").filter((s) => s === SCOPE_READ || s === SCOPE_DRAFTS);
      if (req.body?.pupilNames === true && person.policy.external.pupilNames === "with_consent") scopes.push(SCOPE_PUPIL_NAMES);
      const code = await createCode({ clientId: client.clientId, userId, redirectUri: c.ru, scope: scopes.join(" "), resource: c.rs, codeChallenge: c.cc });
      logger.info(`[mcp] user ${userId} connected client ${client.clientId} (${scopes.join(" ")})`);
      res.json({ success: true, data: { redirectTo: withParams(c.ru, { code, state: c.st, iss: mcpIssuer() }) } });
    }),
  );
  return r;
}

/** My AI -> Connected AI apps. Mount at /my-ai/connections. */
export function mcpConnectionsRouter(): Router {
  const r = Router();
  r.use(authenticate);
  r.get(
    "/",
    asyncHandler(async (req: any, res: any) => {
      const userId = Number(req.user.userId);
      const person = await loadPerson(userId);
      let available = true;
      let blocked: { code: string; message: string } | null = null;
      try {
        await assertConnectorAllowed(person);
      } catch (e) {
        if (!(e instanceof ConnectorError)) throw e;
        available = false;
        blocked = { code: e.code, message: e.message };
      }
      res.json({ success: true, data: { available, blocked, connectorUrl: mcpResource(), connections: await listConnections(userId) } });
    }),
  );
  r.delete(
    "/:clientId",
    asyncHandler(async (req: any, res: any) => {
      const userId = Number(req.user.userId);
      const revoked = await revokeUserTokens(userId, String(req.params.clientId).slice(0, 64));
      forgetAppTools(userId);
      res.json({ success: true, data: { revoked } });
    }),
  );
  return r;
}
