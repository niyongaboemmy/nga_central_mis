/**
 * Applies every migrations/*.sql file that hasn't been applied yet, tracked in a
 * `_schema_migrations` table (filename -> applied_at) on the target database. Safe to run on
 * every deploy: already-applied files are skipped, so it only ever runs what's new.
 *
 * Usage:
 *   npx ts-node scripts/migrate-all.ts [--db=name]
 *   npx ts-node scripts/migrate-all.ts --seed-only [--db=name]   # mark all current files as
 *     already applied WITHOUT running them — for bootstrapping the tracking table on a database
 *     whose schema already reflects some/all of these migrations from being applied by hand.
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
// Resolve .env relative to this file, not process.cwd() -- so `npm run migrate:all` works the
// same regardless of which directory it's invoked from.
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const dbArg = process.argv.find((a) => a.startsWith("--db="));
  const database = dbArg ? dbArg.split("=")[1] : process.env.DB_NAME;
  const seedOnly = process.argv.includes("--seed-only");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
    multipleStatements: true,
  });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const [rows] = await conn.query("SELECT filename FROM _schema_migrations");
  const applied = new Set((rows as { filename: string }[]).map((r) => r.filename));
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`No pending migrations for ${database}.`);
    await conn.end();
    return;
  }

  console.log(
    `${pending.length} pending migration(s) for ${database}: ${pending.join(", ")}`,
  );

  for (const file of pending) {
    if (seedOnly) {
      await conn.query("INSERT INTO _schema_migrations (filename) VALUES (?)", [
        file,
      ]);
      console.log(`Seeded as already-applied (not run): ${file}`);
      continue;
    }
    console.log(`Applying ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await conn.query(sql);
    await conn.query("INSERT INTO _schema_migrations (filename) VALUES (?)", [
      file,
    ]);
    console.log(`Applied ${file}`);
  }

  await conn.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration run failed:", err.message);
  process.exit(1);
});
