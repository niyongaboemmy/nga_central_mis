/**
 * Replaces every plaintext System.client_secret with a bcrypt hash.
 *
 * Safe to run at any time: the SSO token exchange and the /integrations Basic
 * auth accept both formats (src/utils/ssoClientSecret.ts), so the spoke apps
 * keep working with the secret they already hold. After hashing, the secret
 * can no longer be displayed in the Systems screen -- rotate it there to issue
 * a new one.
 *
 * Dry run by default; pass --apply to write.
 *
 * Usage: npx ts-node scripts/hash-sso-client-secrets.ts [--apply] [--db=name]
 */
import dotenv from "dotenv";
import path from "path";
import mysql from "mysql2/promise";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { hashClientSecret, isHashedClientSecret } from "../src/utils/ssoClientSecret";

async function main() {
  const apply = process.argv.includes("--apply");
  const dbArg = process.argv.find((a) => a.startsWith("--db="));
  const database = dbArg ? dbArg.split("=")[1] : process.env.DB_NAME;

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
  });

  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT system_id, name, client_id, client_secret FROM `System` WHERE client_secret IS NOT NULL AND client_secret <> ''",
  );

  let pending = 0;
  for (const row of rows) {
    if (isHashedClientSecret(row.client_secret)) {
      console.log(`= ${row.name} (${row.client_id}): already hashed`);
      continue;
    }
    pending++;
    if (!apply) {
      console.log(`~ ${row.name} (${row.client_id}): would hash`);
      continue;
    }
    const hashed = await hashClientSecret(row.client_secret);
    await conn.query("UPDATE `System` SET client_secret = ? WHERE system_id = ?", [
      hashed,
      row.system_id,
    ]);
    console.log(`+ ${row.name} (${row.client_id}): hashed`);
  }

  console.log(
    apply
      ? `Done: ${pending} secret(s) hashed in ${database}.`
      : `Dry run: ${pending} secret(s) would be hashed in ${database}. Re-run with --apply.`,
  );
  await conn.end();
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
