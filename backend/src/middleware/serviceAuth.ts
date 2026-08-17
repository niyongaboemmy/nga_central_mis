import crypto from "crypto";
import { and, eq, isNull, or, gt, sql } from "drizzle-orm";
import { db } from "../db";
import { IntegrationToken } from "../db/schema";

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
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      service?: ServiceClient;
    }
  }
}

/**
 * Require a valid, unexpired, unrevoked integration token carrying `scope`.
 *
 * Timing note: the lookup is by hash equality on a UNIQUE index, so an invalid
 * token costs one indexed miss and leaks nothing about which part was wrong —
 * every failure returns the same message.
 */
export const requireServiceToken =
  (scope: string) => async (req: any, res: any, next: any) => {
    const header: string | undefined = req.header("Authorization");
    const raw = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : undefined;

    if (!raw) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Missing integration token",
          details: [],
        },
        timestamp: new Date().toISOString(),
      });
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
