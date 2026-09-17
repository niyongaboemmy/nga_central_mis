import { Request, Response } from "express";
import crypto from "crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { IntegrationToken } from "../db/schema";

/**
 * Managing the service credentials partner systems use to pull from this MIS.
 *
 * Distinct from the System registry next door, and the difference matters
 * because the two are easy to confuse: a System is an SSO client — a
 * client_id/secret pair that lets a partner sign OUR USERS IN. An
 * IntegrationToken is a machine credential that lets a partner READ DATA with
 * no user involved. Ganzaa needs both, for different things, and neither one
 * can stand in for the other.
 *
 * These endpoints are authenticated as a PERSON (authenticate + MANAGE_SYSTEMS)
 * and therefore live under /systems, not under /integrations — everything
 * mounted there is machine-authenticated and read-only, and it is worth keeping
 * that a property of the whole router rather than a per-handler promise.
 *
 * The raw token is returned exactly ONCE, by create. Only its SHA-256 hash is
 * stored, so there is deliberately no endpoint that can read one back; a lost
 * token is replaced, not recovered.
 */

const HASH = (raw: string) =>
  crypto.createHash("sha256").update(raw, "utf8").digest("hex");

type TokenRow = typeof IntegrationToken.$inferSelect;

/** What a token looks like from the outside: identifiable, never usable. */
const present = (r: TokenRow) => ({
  token_id: r.token_id,
  name: r.name,
  // The first characters of the token. Enough to match a row against the value
  // pasted into a partner's config, useless as a credential.
  token_prefix: r.token_prefix,
  scopes: r.scopes.split(",").map((s) => s.trim()).filter(Boolean),
  status: r.revoked_at
    ? "REVOKED"
    : r.expires_at && new Date(r.expires_at) < new Date()
      ? "EXPIRED"
      : "ACTIVE",
  last_used_at: r.last_used_at,
  expires_at: r.expires_at,
  revoked_at: r.revoked_at,
  created_at: r.created_at,
});

export const listIntegrationTokens = async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(IntegrationToken)
      .orderBy(desc(IntegrationToken.token_id));
    return res.json(rows.map(present));
  } catch (error) {
    console.error("listIntegrationTokens:", error);
    return res.status(500).json({ message: "Failed to load integration tokens" });
  }
};

export const createIntegrationToken = async (req: any, res: Response) => {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ message: "A name is required — it is how you tell tokens apart later." });
    }
    if (name.length > 100) {
      return res.status(400).json({ message: "Name must be 100 characters or fewer" });
    }

    // Scopes are not free text from the client: an unknown scope would be
    // stored and then silently never match anything requireServiceToken asks
    // for, which reads as "the token does not work" with no explanation.
    const ALLOWED = new Set(["sync:read"]);
    const requested: string[] = Array.isArray(req.body?.scopes)
      ? req.body.scopes.map((s: unknown) => String(s).trim())
      : ["sync:read"];
    const scopes = requested.filter((s) => ALLOWED.has(s));
    if (scopes.length === 0) {
      return res.status(400).json({
        message: `Unknown scope. Supported: ${[...ALLOWED].join(", ")}`,
      });
    }

    let expiresAt: Date | null = null;
    const days = Number(req.body?.expires_days ?? 0);
    if (days > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
    }

    // 32 bytes of CSPRNG entropy. The `ngamis_` prefix makes a leaked token
    // greppable in logs and recognisable in a partner's configuration.
    const raw = `ngamis_${crypto.randomBytes(32).toString("hex")}`;

    const [result]: any = await db.insert(IntegrationToken).values({
      name,
      token_hash: HASH(raw),
      token_prefix: raw.slice(0, 16),
      scopes: scopes.join(","),
      expires_at: expiresAt,
      created_by: req.user?.userId ?? null,
    });

    const [row] = await db
      .select()
      .from(IntegrationToken)
      .where(eq(IntegrationToken.token_id, Number(result.insertId)));

    return res.status(201).json({
      ...present(row),
      // The one and only time this value exists outside the caller's clipboard.
      token: raw,
    });
  } catch (error) {
    console.error("createIntegrationToken:", error);
    return res.status(500).json({ message: "Failed to create the integration token" });
  }
};

export const revokeIntegrationToken = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid token id" });
    }

    // Revoke, never DELETE. last_used_at on a revoked row is the only record of
    // when a credential that has since been withdrawn was last exercised, which
    // is exactly what anyone investigating an incident needs.
    const [existing] = await db
      .select()
      .from(IntegrationToken)
      .where(
        and(eq(IntegrationToken.token_id, id), isNull(IntegrationToken.revoked_at)),
      );
    if (!existing) {
      return res.status(404).json({ message: "No active token with that id" });
    }

    await db
      .update(IntegrationToken)
      .set({ revoked_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(IntegrationToken.token_id, id));

    return res.json({ message: `Token "${existing.name}" revoked` });
  } catch (error) {
    console.error("revokeIntegrationToken:", error);
    return res.status(500).json({ message: "Failed to revoke the token" });
  }
};
