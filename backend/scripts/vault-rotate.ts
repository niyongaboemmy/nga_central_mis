/**
 * Re-wrap every stored AI key under the current key-encryption key
 * (PERSONAL_AI_PROVIDERS_PLAN.md §6). Secrets themselves are not re-encrypted.
 *
 *   1. Add AI_VAULT_KEK_<n+1> (32 random bytes: `openssl rand -base64 32`) to the env,
 *      keep the old AI_VAULT_KEK_<n>, set AI_VAULT_KEK_CURRENT=<n+1>, restart the app.
 *   2. cd backend && npx ts-node scripts/vault-rotate.ts      (safe to re-run; resumable)
 *   3. When it reports 0 left on old versions, remove AI_VAULT_KEK_<n> and restart.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { currentKekVersion, rewrap } from "../src/services/secrets/vault";

const rows = (r: unknown): any[] => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : (r as any[]));

async function main() {
  const target = currentKekVersion();
  const due = rows(
    await db.execute(sql`
      SELECT credential_id, owner_user_id, provider, secret_ct, secret_nonce, secret_tag, wrapped_dek, dek_nonce, dek_tag, kek_version
      FROM AiCredential WHERE kek_version <> ${target}`),
  );
  let done = 0;
  let failed = 0;
  for (const r of due) {
    const aad = `aicred|v1|${r.credential_id}|${r.owner_user_id ?? "school"}|${r.provider}`;
    try {
      const s = rewrap(
        { ciphertext: r.secret_ct, nonce: r.secret_nonce, tag: r.secret_tag, wrappedDek: r.wrapped_dek, dekNonce: r.dek_nonce, dekTag: r.dek_tag, kekVersion: Number(r.kek_version) },
        aad,
      );
      await db.execute(sql`
        UPDATE AiCredential SET wrapped_dek = ${s.wrappedDek}, dek_nonce = ${s.dekNonce}, dek_tag = ${s.dekTag}, kek_version = ${s.kekVersion}
        WHERE credential_id = ${r.credential_id} AND kek_version = ${r.kek_version}`);
      done++;
    } catch (e: any) {
      failed++;
      console.error(`credential ${r.credential_id}: ${e?.message}`);
    }
  }
  const [{ n }] = rows(await db.execute(sql`SELECT COUNT(*) AS n FROM AiCredential WHERE kek_version <> ${target}`));
  console.log(`Re-wrapped ${done}, failed ${failed}; ${n} left on old versions (current KEK v${target}).`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
