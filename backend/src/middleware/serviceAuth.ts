import crypto from "crypto";
import { and, eq, isNull, or, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { IntegrationToken, System } from "../db/schema";
import { verifyClientSecret } from "../utils/ssoClientSecret";

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
  schoolId: number | null;
  /** Set when the caller authenticated with a System's client credentials. */
  clientId?: string;
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
async function clientCredentials(
  header: string,
  scope: string,
): Promise<ServiceClient | null> {
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
  // Split on the FIRST colon only — a secret containing one is still valid.
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  const clientId = decoded.slice(0, idx);
  const clientSecret = decoded.slice(idx + 1);
  if (!clientId || !clientSecret) return null;

  const rows = await db
    .select()
    .from(System)
    .where(eq(System.client_id, clientId))
    .limit(1);
  const system = rows[0];
  if (!system || system.status !== "ACTIVE") return null;

  // Same check as the SSO token exchange: bcrypt when the stored secret is
  // hashed, otherwise a constant-time compare over fixed-length digests (so
  // a wrong-length secret takes the same path as an equal-length one).
  if (!(await verifyClientSecret(clientSecret, system.client_secret))) return null;

  return {
    // Negative, so it can never collide with an IntegrationToken id in a log.
    tokenId: -system.system_id,
    name: `${system.name} (client credentials)`,
    // The fixed read scope. A System carries no scope list of its own, and the
    // whole /integrations surface is read-only, so granting exactly the scope
    // being asked for is the access the route already demands — never more.
    scopes: [scope],
    schoolId: null,
    clientId,
  };
}

/**
 * Require a registered partner carrying `scope`: an integration token as
 * `Authorization: Bearer …`, or a System's client id and secret as HTTP Basic.
 *
 * Timing note: the token lookup is by hash equality on a UNIQUE index, so an
 * invalid token costs one indexed miss and leaks nothing about which part was
 * wrong — every failure returns the same message.
 */
export const requireServiceToken =
  (scope: string) => async (req: any, res: any, next: any) => {
    const header: string | undefined = req.header("Authorization");

    // Two accepted shapes, one meaning: "a registered partner is calling".
    if (header?.startsWith("Basic ")) {
      const client = await clientCredentials(header, scope);
      if (!client) return unauthorized(res, "Invalid client credentials");
      req.service = client;
      return next();
    }

    const raw = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : undefined;

    if (!raw) {
      return unauthorized(
        res,
        "Missing credentials. Send an integration token as `Authorization: Bearer …`, " +
          "or your system's client id and secret as HTTP Basic.",
      );
    }

    const now = new Date();
    const rows = await db
      .select()
      .from(IntegrationToken)
      .where(
        and(
          eq(IntegrationToken.token_hash, HASH(raw)),
          isNull(IntegrationToken.revoked_at),
          or(
            isNull(IntegrationToken.expires_at),
            gt(IntegrationToken.expires_at, now),
          ),
        ),
      )
      .limit(1);

    const token = rows[0];
    if (!token) {
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
      schoolId: token.school_id ?? null,
    };

    // Last-used is observability, not correctness — a failed write here must
    // never fail the caller's sync, so it is fired and deliberately not awaited.
    db.update(IntegrationToken)
      .set({ last_used_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(IntegrationToken.token_id, token.token_id))
      .catch(() => undefined);

    next();
  };
