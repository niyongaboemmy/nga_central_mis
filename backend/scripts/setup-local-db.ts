/**
 * One-shot local database setup for developers.
 *
 * Builds a working `DB_NAME` on the MySQL server named in `.env` from the
 * committed snapshot `../ngarw_mis.sql`, then brings the schema up to date and
 * gives the seeded super-admin a password you actually know.
 *
 * Why not `bootstrap-db.ts`? That replays every migration from an empty server,
 * and several historical migrations (025, 028, 032, 033, 059) no longer apply
 * cleanly from zero. The snapshot sidesteps that: it already contains the
 * schema through migration 039, so only 040 onwards is replayed here.
 *
 * Steps:
 *   1. CREATE DATABASE (refuses to touch a non-empty one unless --force)
 *   2. import the snapshot
 *   3. apply migrations/NNN_*.sql for NNN > DUMP_MIGRATION_LEVEL, in order
 *   4. set the super-admin (user_id 1) password
 *
 * Usage:
 *   npm run db:setup                              # password: Admin@1234
 *   npm run db:setup -- --admin-password='...'    # your own
 *   npm run db:setup -- --force                   # drop and rebuild an existing DB
 *
 * The DB_USERNAME in .env needs CREATE DATABASE rights (root on a dev machine).
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

/** Highest hand-written migration already baked into ../ngarw_mis.sql. Bump when the snapshot is refreshed. */
const DUMP_MIGRATION_LEVEL = 39;
const DUMP_PATH = path.resolve(__dirname, "../../ngarw_mis.sql");
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");
const DEFAULT_ADMIN_PASSWORD = "Admin@1234";

function argOf(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

/**
 * mysql2 cannot execute `DELIMITER` (it is a client-side command of the mysql
 * CLI, not SQL). The snapshot carries one such block: a one-off stored
 * procedure from an old data migration that nothing in the app calls, so it is
 * dropped rather than translated.
 */
function stripDelimiterBlocks(sql: string): { sql: string; removed: number } {
  let removed = 0;
  const cleaned = sql.replace(/^DELIMITER \$\$[\s\S]*?^DELIMITER ;\s*$/gm, () => {
    removed += 1;
    return "";
  });
  return { sql: cleaned, removed };
}

/** Hand-written migrations newer than the snapshot, in numeric then name order. */
function pendingMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .map((f) => ({ f, m: /^(\d{3})_.*\.sql$/.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({ f: x.f, n: parseInt(x.m[1], 10) }))
    .filter((x) => x.n > DUMP_MIGRATION_LEVEL)
    .sort((a, b) => a.n - b.n || a.f.localeCompare(b.f))
    .map((x) => x.f);
}

async function main() {
  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USERNAME || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = argOf("db") || process.env.DB_NAME;
  const adminPassword = argOf("admin-password") || DEFAULT_ADMIN_PASSWORD;

  if (!database) throw new Error("DB_NAME is not set in .env");
  if (!fs.existsSync(DUMP_PATH)) throw new Error(`Snapshot not found: ${DUMP_PATH}`);

  const server = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  console.log(`MySQL ${host}:${port} as ${user}`);

  // 1. database
  const [existing] = await server.query<any[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?",
    [database],
  );
  if (existing[0].n > 0) {
    if (!hasFlag("force")) {
      throw new Error(
        `Database \`${database}\` already has ${existing[0].n} tables. Re-run with --force to drop and rebuild it.`,
      );
    }
    console.log(`Dropping existing \`${database}\` (--force)`);
    await server.query(`DROP DATABASE \`${database}\``);
  }
  await server.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await server.end();

  const db = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });

  // 2. snapshot
  const { sql: dumpSql, removed } = stripDelimiterBlocks(fs.readFileSync(DUMP_PATH, "utf8"));
  console.log(`Importing ${path.basename(DUMP_PATH)} (${removed} stored-procedure block(s) skipped)...`);
  await db.query(dumpSql);

  // 3. migrations newer than the snapshot
  const files = pendingMigrations();
  console.log(`Applying ${files.length} migrations newer than ${String(DUMP_MIGRATION_LEVEL).padStart(3, "0")}...`);
  for (const f of files) {
    process.stdout.write(`  ${f} ... `);
    await db.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
    console.log("ok");
  }

  // 4. a login you know
  const hash = await bcrypt.hash(adminPassword, 12);
  const [res] = await db.query<any>(
    `UPDATE AuthCredential
        SET password_hash = ?, failed_attempts = 0, locked_until = NULL, force_password_change = 0
      WHERE user_id = 1`,
    [hash],
  );
  if (res.affectedRows !== 1) throw new Error("Super-admin credential row (user_id 1) not found in snapshot");
  const [[admin]] = await db.query<any[]>("SELECT username, email FROM User WHERE user_id = 1");
  await db.end();

  console.log(`
Done. Database \`${database}\` is ready.

  Login:    ${admin.username}  /  ${adminPassword}
  OTP:      shown on the login page in development (no email is sent)

Start the backend with \`npm run dev\`.`);
}

main().catch((err) => {
  console.error(`\nSetup failed: ${err.sqlMessage || err.message}`);
  process.exit(1);
});
