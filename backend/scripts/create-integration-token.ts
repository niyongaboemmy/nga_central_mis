/**
 * Mints an IntegrationToken for a partner system (e.g. Ganzaa).
 *
 * The raw token is printed ONCE and never stored — only its SHA-256 hash goes
 * to the database. If it is lost, mint another and revoke the old one; there is
 * deliberately no way to read it back.
 *
 * Usage:
 *   npx ts-node scripts/create-integration-token.ts --name="Ganzaa production"
 *   npx ts-node scripts/create-integration-token.ts --name="Ganzaa staging" --expires-days=365
 *   npx ts-node scripts/create-integration-token.ts --list
 *   npx ts-node scripts/create-integration-token.ts --revoke=3
 */
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { db } from "../src/db";
import { IntegrationToken } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  if (process.argv.includes("--list")) {
    const rows = await db.select().from(IntegrationToken);
    if (rows.length === 0) {
      console.log("No integration tokens.");
      return;
    }
    for (const r of rows) {
      const state = r.revoked_at
        ? "REVOKED"
        : r.expires_at && new Date(r.expires_at) < new Date()
          ? "EXPIRED"
          : "active";
      console.log(
        `#${r.token_id}  ${r.token_prefix}…  ${state.padEnd(7)}  ${r.scopes.padEnd(12)}  last used: ${r.last_used_at ?? "never"}  ${r.name}`,
      );
    }
    return;
  }

  const revokeId = arg("revoke");
  if (revokeId) {
    await db
      .update(IntegrationToken)
      .set({ revoked_at: sql`CURRENT_TIMESTAMP` })
      .where(eq(IntegrationToken.token_id, Number(revokeId)));
    console.log(`Token #${revokeId} revoked.`);
    return;
  }

  const name = arg("name");
  if (!name) {
    console.error(
      'Usage: create-integration-token.ts --name="Ganzaa production" [--expires-days=365] [--scopes=sync:read]',
    );
    process.exit(1);
  }

  const scopes = arg("scopes") ?? "sync:read";
  const expiresDays = arg("expires-days");

  // 32 bytes of CSPRNG entropy. The `ngamis_` prefix makes a leaked token
  // greppable in logs and recognisable in a partner's config file.
  const raw = `ngamis_${crypto.randomBytes(32).toString("hex")}`;
  const hash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");

  let expiresAt: Date | null = null;
  if (expiresDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(expiresDays));
  }

  await db.insert(IntegrationToken).values({
    name,
    token_hash: hash,
    token_prefix: raw.slice(0, 14),
    scopes,
    expires_at: expiresAt,
  });

  console.log("\nIntegration token created. Copy it now — it is not recoverable.\n");
  console.log(`  ${raw}\n`);
  console.log(`  name:    ${name}`);
  console.log(`  scopes:  ${scopes}`);
  console.log(`  expires: ${expiresAt ? expiresAt.toISOString() : "never"}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
