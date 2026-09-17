/**
 * Builds a working database from an empty server.
 *
 * `run-migration.ts` applies ONE file and hands the whole thing to mysql2 with
 * multipleStatements. That cannot bootstrap from scratch, for two reasons:
 *
 *  1. The drizzle-generated files separate statements with
 *     `--> statement-breakpoint`. That is not a SQL comment — MySQL only treats
 *     `--` as one when followed by whitespace, so `-->` is a syntax error. The
 *     drizzle files have to be split on that marker and run statement by
 *     statement.
 *
 *  2. There are two migration series in this folder and their filenames do not
 *     sort into the right order on their own: the drizzle base schema
 *     (0000…0003, ordered by migrations/meta/_journal.json) must run before the
 *     hand-written series (001…064).
 *
 * Re-runnable. Every applied file is recorded in `_migration_log`, so a second
 * run is a no-op rather than a pile of "table already exists" errors.
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-db.ts
 *   npx ts-node scripts/bootstrap-db.ts --db=nga_central_mis_test
 *   npx ts-node scripts/bootstrap-db.ts --redo=064_integration_tokens.sql
 */
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MIGRATIONS = path.resolve(__dirname, "../migrations");

/**
 * Errors that mean "this was already done", which is the expected outcome when
 * a hand-written migration adds something the drizzle base schema already
 * contains. Anything NOT in this list is a real failure and is reported.
 */
const ALREADY_DONE = new Set([
  "ER_TABLE_EXISTS_ERROR", // 1050
  "ER_DUP_FIELDNAME", // 1060
  "ER_DUP_KEYNAME", // 1061
  "ER_DUP_ENTRY", // 1062
  "ER_CANT_DROP_FIELD_OR_KEY", // 1091 — dropping something already gone
  "ER_FK_DUP_NAME", // duplicate foreign key
]);

function argOf(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

/**
 * Migration files in the order they must run: the drizzle series first, in the
 * order its journal records, then the hand-written series sorted numerically.
 *
 * Numeric sort matters — a plain string sort puts 010 before 009's successor
 * and, worse, orders 064 before 100 only by accident. Files that share a
 * number (there are two 004s) keep a stable alphabetical order between them.
 */
function orderedMigrations(): { files: string[]; base: Set<string> } {
  const all = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));

  const journalPath = path.join(MIGRATIONS, "meta/_journal.json");
  const drizzleOrder: string[] = fs.existsSync(journalPath)
    ? JSON.parse(fs.readFileSync(journalPath, "utf8"))
        .entries.sort((a: any, b: any) => a.idx - b.idx)
        .map((e: any) => `${e.tag}.sql`)
        .filter((f: string) => all.includes(f))
    : [];

  const handWritten = all
    .filter((f) => !drizzleOrder.includes(f))
    .sort((a, b) => {
      const na = parseInt(a.slice(0, 3), 10);
      const nb = parseInt(b.slice(0, 3), 10);
      if (Number.isNaN(na) || Number.isNaN(nb) || na === nb) {
        return a.localeCompare(b);
      }
      return na - nb;
    });

  return {
    files: [...drizzleOrder, ...handWritten],
    base: new Set(drizzleOrder),
  };
}

/** Split a drizzle file on its breakpoint marker; other files run whole. */
function statementsOf(sql: string): string[] {
  if (sql.includes("--> statement-breakpoint")) {
    return sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [sql];
}

async function main() {
  const database = argOf("db") || process.env.DB_NAME!;
  const redo = argOf("redo");

  const base = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  };

  // Create the schema first, on a connection with no database selected.
  const root = await mysql.createConnection(base);
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await root.end();

  const conn = await mysql.createConnection({ ...base, database });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`_migration_log\` (
      \`file\`       VARCHAR(191) NOT NULL,
      \`applied_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      \`status\`     VARCHAR(20)  NOT NULL,
      \`note\`       TEXT,
      PRIMARY KEY (\`file\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  if (redo) {
    await conn.query("DELETE FROM `_migration_log` WHERE `file` = ?", [redo]);
    console.log(`Cleared log entry for ${redo}, it will run again.\n`);
  }

  const [logged] = await conn.query<any[]>(
    "SELECT `file` FROM `_migration_log`",
  );
  const done = new Set(logged.map((r) => r.file));

  const { files, base: baseSchemaFiles } = orderedMigrations();
  console.log(`Database : ${database}`);
  console.log(`Migrations: ${files.length} on disk, ${done.size} already applied\n`);

  let applied = 0;
  let skipped = 0;
  const tolerated: string[] = [];
  const failed: { file: string; message: string }[] = [];

  for (const file of files) {
    if (done.has(file)) {
      skipped++;
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    const statements = statementsOf(sql);

    let fileFailed: string | null = null;
    const toleratedHere: string[] = [];

    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err: any) {
        if (ALREADY_DONE.has(err.code)) {
          toleratedHere.push(err.code);
          continue;
        }
        fileFailed = `${err.code}: ${err.sqlMessage || err.message}`;
        break;
      }
    }

    if (fileFailed) {
      failed.push({ file, message: fileFailed });
      await conn.query(
        "INSERT INTO `_migration_log` (`file`,`status`,`note`) VALUES (?,?,?)",
        [file, "FAILED", fileFailed],
      );
      console.log(`  ✘ ${file}\n      ${fileFailed}`);

      // Every later migration assumes the drizzle base schema exists. If that
      // failed, continuing just prints thirty "referenced table 'User' doesn't
      // exist" lines and buries the one error that actually matters.
      if (baseSchemaFiles.has(file)) {
        console.log(
          `\nABORTED — ${file} is part of the base schema, so nothing after it can succeed.` +
            `\nFix the error above, drop the database, and re-run.`,
        );
        await conn.end();
        process.exit(1);
      }
    } else {
      applied++;
      const note = toleratedHere.length
        ? `tolerated: ${[...new Set(toleratedHere)].join(", ")}`
        : null;
      if (note) tolerated.push(`${file} (${note})`);
      await conn.query(
        "INSERT INTO `_migration_log` (`file`,`status`,`note`) VALUES (?,?,?)",
        [file, "APPLIED", note],
      );
      console.log(`  ✔ ${file}${note ? `  [${note}]` : ""}`);
    }
  }

  const [[tables]] = await conn.query<any[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?",
    [database],
  );

  console.log(`\n${"-".repeat(60)}`);
  console.log(`applied: ${applied}   already-logged: ${skipped}   failed: ${failed.length}`);
  console.log(`tables in ${database}: ${tables.n}`);

  if (tolerated.length) {
    console.log(`\nPartially-redundant (expected — drizzle base already had these):`);
    for (const t of tolerated) console.log(`  · ${t}`);
  }
  if (failed.length) {
    console.log(`\nFAILED — these need a look:`);
    for (const f of failed) console.log(`  · ${f.file}\n      ${f.message}`);
  }

  await conn.end();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("bootstrap failed:", err.message);
  process.exit(1);
});
