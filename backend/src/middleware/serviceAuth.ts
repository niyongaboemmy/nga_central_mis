import crypto from "crypto";
import { and, eq, isNull, or, gt, sql } from "drizzle-orm";
import { Db, dbForTenant, primaryDb } from "../db";
import { IntegrationToken, System } from "../db/schema";
import { verifyClientSecret } from "../utils/ssoClientSecret";
import { PRIMARY_TENANT_ID, TENANT_HEADER, TenantCtx, parseTid } from "../vendor/nga-tenancy";
import { requireTenantHeader } from "../tenancy/context";
import { getTenant } from "../tenancy/registry";
import { enterTenant, sendRefusal, tenantRefusal } from "../tenancy/express";
import { isSystemAssigned } from "../tenancy/systems";
import { readSystemScopes } from "../tenancy/systemScopes";

/**
 * Authentication for machine-to-machine integration clients.
 *
 * Separate from `authenticate` (middleware/auth.ts) on purpose. That one proves
 * "a person is signed in" and loads their permission set; this one proves "a
 * registered partner system is calling" and grants a fixed, read-only scope. A
 * sync job is not a person: it has no session, must survive staff turnover, and
 * should be revocable on its own without disabling anybody's login.
 *
 * The presented token is never stored anywhere — we hash it and look the hash
 * up, so the database only ever holds a value that cannot be replayed.
 */

const HASH = (raw: string) =>
  crypto.createHash("sha256").update(raw, "utf8").digest("hex");

export interface ServiceClient {
  tokenId: number;
  name: string;
  scopes: string[];
  /** The tenant the call runs for (X-NGA-Tenant; contract §3). */
  schoolId: number | null;
  /** Set when the caller authenticated with a System's client credentials. */
  clientId?: string;
  /** The System behind client credentials (for per-tenant assignment checks). */
  systemId?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      service?: ServiceClient;
    }
  }
}

const unauthorized = (res: any, message: string) =>
  res.status(401).json({
    success: false,
    error: { code: "UNAUTHORIZED", message, details: [] },
    timestamp: new Date().toISOString(),
  });

/**
 * A registered System's OAuth client, presented as HTTP Basic.
 *
 * WHY THIS IS ACCEPTED
 *
 * The Systems screen issues a partner exactly two things: a client id and a
 * client secret. Requiring a THIRD, separately-minted credential before that
 * partner could read anything was a step every integrator had to be told about
 * and could not self-serve — Ganzaa stalled on precisely that. The System row is
 * already a registered partner whose secret we verify for SSO; letting it
 * authenticate a read is the same trust, spelled with the credential the partner
 * was actually given.
 *
 * THE TRADE, STATED PLAINLY: any ACTIVE System can now read this instance, where
 * before only a deliberately-minted token could. A partner that should sign
 * users in but NOT read the roster must therefore be given an IntegrationToken
 * and have its System kept DISABLED. Tokens remain the more precise mechanism —
 * they expire, revoke independently of anyone's login, carry per-token scopes
 * and record last-used.
 *
 * Read-only either way: nothing under /integrations writes.
 */
type ClientCheck =
  | { ok: true; client: ServiceClient; systemId: number }
  | { ok: false; status: 400 | 401 | 403; code: string; message: string };

/** bcrypt costs ~0.25 s; a spoke's sync makes many calls, so a verified
 *  (client, secret, stored hash) triple is remembered for a minute. */
const verifiedSecrets = new Map<string, number>();
const SECRET_CACHE_MS = 60_000;

async function secretMatches(clientId: string, presented: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const key = `${clientId}\u0000${HASH(presented)}\u0000${HASH(stored)}`;
  const at = verifiedSecrets.get(key);
  if (at && Date.now() - at < SECRET_CACHE_MS) return true;
  const ok = await verifyClientSecret(presented, stored);
  if (ok) {
    if (verifiedSecrets.size > 500) verifiedSecrets.clear();
    verifiedSecrets.set(key, Date.now());
  }
  return ok;
}

async function clientCredentials(header: string, scope: string, tenant: TenantCtx, defaulted = false): Promise<ClientCheck> {
  const invalid: ClientCheck = { ok: false, status: 401, code: "UNAUTHORIZED", message: "Invalid client credentials" };
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch {
    return invalid;
  }
  // Split on the FIRST colon only — a secret containing one is still valid.
  const idx = decoded.indexOf(":");
  if (idx < 0) return invalid;
  const clientId = decoded.slice(0, idx);
  const clientSecret = decoded.slice(idx + 1);
  if (!clientId || !clientSecret) return invalid;

  // System is global: it lives in the primary tenant's database.
  const rows = await primaryDb()
    .select()
    .from(System)
    .where(eq(System.client_id, clientId))
    .limit(1);
  const system = rows[0];
  if (!system || system.status !== "ACTIVE") return invalid;

  // Same check as the SSO token exchange: bcrypt when the stored secret is
  // hashed, otherwise a constant-time compare over fixed-length digests (so
  // a wrong-length secret takes the same path as an equal-length one).
  if (!(await secretMatches(clientId, clientSecret, system.client_secret))) return invalid;

  // [MIS-A11]: System.scopes, when set, is enforced; NULL (or a server without
  // migration 127) keeps the legacy grant of the scope being asked for.
  const allowed = await readSystemScopes(system.system_id);
  if (allowed && !allowed.includes(scope)) {
    return { ok: false, status: 403, code: "FORBIDDEN", message: `Client is not authorised for scope "${scope}"` };
  }

  // Contract §3: the System must be assigned to the tenant it speaks for. A call
  // without X-NGA-Tenant means tenant 1 only for a System explicitly assigned to it;
  // any other System must say which school it calls for.
  if (!(await isSystemAssigned(system.system_id, tenant))) {
    if (defaulted) return { ok: false, status: 400, code: "TENANT_REQUIRED", message: `Send the ${TENANT_HEADER} header.` };
    return { ok: false, status: 403, code: "SYSTEM_NOT_ASSIGNED", message: "This system is not enabled for that school" };
  }

  return {
    ok: true,
    systemId: system.system_id,
    client: {
      // Negative, so it can never collide with an IntegrationToken id in a log.
      tokenId: -system.system_id,
      name: `${system.name} (client credentials)`,
      scopes: allowed ?? [scope],
      schoolId: tenant.tid,
      clientId,
      systemId: system.system_id,
    },
  };
}

/**
 * May this already-authenticated service client act for `tid` too? Used by endpoints
 * whose body carries several schools (activity relay batches): the tenant must be
 * usable and the System assigned to it; an integration token only ever speaks for
 * its own school. Returns the tenant, or the refusal code.
 */
export async function serviceMayActFor(
  client: ServiceClient | undefined,
  tid: number,
): Promise<{ tenant: TenantCtx; code: null } | { tenant: null; code: string }> {
  if (!client) return { tenant: null, code: "UNAUTHORIZED" };
  const tenant = await getTenant(tid);
  const refusal = tenantRefusal(tenant);
  if (refusal) return { tenant: null, code: refusal.code };
  if (client.systemId === undefined) {
    return client.schoolId === tid ? { tenant: tenant!, code: null } : { tenant: null, code: "TENANT_MISMATCH" };
  }
  if (!(await isSystemAssigned(client.systemId, tenant!))) return { tenant: null, code: "SYSTEM_NOT_ASSIGNED" };
  return { tenant: tenant!, code: null };
}

/**
 * The tenant a service call speaks for (X-NGA-Tenant; contract §3), or the response
 * sent. `defaulted`: no header, so tenant 1 was assumed -- the caller must then be
 * explicitly assigned to tenant 1 (see clientCredentials).
 */
async function serviceTenant(req: any, res: any): Promise<{ tenant: TenantCtx; defaulted: boolean } | null> {
  const raw = req.header(TENANT_HEADER);
  let tid: number | null;
  let defaulted = false;
  if (raw === undefined || raw === "") {
    if (requireTenantHeader()) {
      sendRefusal(res, { status: 400, code: "TENANT_REQUIRED", message: `Send the ${TENANT_HEADER} header.` });
      return null;
    }
    tid = PRIMARY_TENANT_ID;
    defaulted = true;
  } else {
    tid = parseTid(raw);
    if (!tid) {
      sendRefusal(res, { status: 400, code: "TENANT_REQUIRED", message: `Invalid ${TENANT_HEADER} header.` });
      return null;
    }
  }
  const tenant = await getTenant(tid);
  const refusal = tenantRefusal(tenant);
  if (refusal) {
    sendRefusal(res, refusal);
    return null;
  }
  return { tenant: tenant!, defaulted };
}

/**
 * An integration token by hash: the primary DB (where every pre-tenancy token
 * lives), then the tenant's own DB. `homeTid` is the tenant whose database holds
 * it -- always. IntegrationToken.school_id is a School row of that same database
 * (School.school_id == tid by convention), so it can confirm the home school but
 * never select another one: a token whose school_id names a different school is
 * refused (homeTid null).
 */
async function findIntegrationToken(hash: string, tenant: TenantCtx) {
  const now = new Date();
  const where = and(
    eq(IntegrationToken.token_hash, hash),
    isNull(IntegrationToken.revoked_at),
    or(isNull(IntegrationToken.expires_at), gt(IntegrationToken.expires_at, now)),
  );
  const places: Array<[number, Db]> = [[PRIMARY_TENANT_ID, primaryDb()]];
  if (tenant.tid !== PRIMARY_TENANT_ID) places.push([tenant.tid, dbForTenant(tenant.tid)]);
  for (const [tid, tdb] of places) {
    const rows = await tdb.select().from(IntegrationToken).where(where).limit(1);
    if (rows[0]) {
      const school = rows[0].school_id;
      return { token: rows[0], tdb, homeTid: school === null || school === undefined || Number(school) === tid ? tid : null };
    }
  }
  return null;
}

/**
 * Require a registered partner carrying `scope`: an integration token as
 * `Authorization: Bearer …`, or a System's client id and secret as HTTP Basic.
 *
 * Timing note: the token lookup is by hash equality on a UNIQUE index, so an
 * invalid token costs one indexed miss and leaks nothing about which part was
 * wrong — every failure returns the same message.
 */
// Express 4 does not catch a rejected async middleware: the request would hang.
// Hand any failure to the error handler instead.
export const requireServiceToken =
  (scope: string) => (req: any, res: any, next: any) =>
    serviceTokenCheck(scope, req, res, next).catch(next);

const serviceTokenCheck = async (scope: string, req: any, res: any, next: any) => {
    const header: string | undefined = req.header("Authorization");

    // Two accepted shapes, one meaning: "a registered partner is calling".
    if (!header?.startsWith("Basic ") && !header?.startsWith("Bearer ")) {
      return unauthorized(
        res,
        "Missing credentials. Send an integration token as `Authorization: Bearer …`, " +
          "or your system's client id and secret as HTTP Basic.",
      );
    }

    const resolved = await serviceTenant(req, res);
    if (!resolved) return;
    const { tenant, defaulted } = resolved;

    if (header.startsWith("Basic ")) {
      const check = await clientCredentials(header, scope, tenant, defaulted);
      if (!check.ok) {
        if (check.status === 401) return unauthorized(res, check.message);
        return res.status(check.status).json({
          success: false,
          code: check.code,
          error: { code: check.code, message: check.message, details: [] },
          timestamp: new Date().toISOString(),
        });
      }
      req.service = check.client;
      return enterTenant(req, tenant, next);
    }

    const raw = header.slice("Bearer ".length).trim();
    if (!raw) return unauthorized(res, "Missing credentials.");

    const found = await findIntegrationToken(HASH(raw), tenant);
    if (!found) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid or revoked integration token",
          details: [],
        },
        timestamp: new Date().toISOString(),
      });
    }
    const { token, tdb, homeTid } = found;

    // A token belongs to one school (IntegrationToken.school_id, or the DB it
    // lives in): calling for another one is refused (contract §3).
    if (homeTid !== tenant.tid) {
      return res.status(403).json({
        success: false,
        code: "TENANT_MISMATCH",
        error: { code: "TENANT_MISMATCH", message: "This token belongs to another school", details: [] },
        timestamp: new Date().toISOString(),
      });
    }

    const scopes = String(token.scopes || "")
      .split(/[,\s]+/)
      .filter(Boolean);

    if (!scopes.includes(scope)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: `Token is not authorised for scope "${scope}"`,
          details: [],
        },
        timestamp: new Date().toISOString(),
      });
    }

    req.service = {
      tokenId: token.token_id,
      name: token.name,
      scopes,
      schoolId: tenant.tid,
    };

    // Last-used is observability, not correctness — a failed write here must
    // never fail the caller's sync, so it is fired and deliberately not awaited.
    tdb.update(IntegrationToken)
      .set({ last_used_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(IntegrationToken.token_id, token.token_id))
      .catch(() => undefined);

    enterTenant(req, tenant, next);
  };
