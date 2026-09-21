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
 *   5. point the satellite SSO clients at their localhost callbacks
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

/**
 * The satellite modules that sign in through this MIS, and the callback each one
 * actually sends when it runs on a developer's machine.
 *
 * `authorizeSSO` compares `redirect_uri` against this list by exact string match,
 * so these must equal `window.location.origin + <base> + '/sso/callback'` in each
 * app's dev server. Getting this wrong is the single most common reason a local
 * login dead-ends on "Redirect URI not allowed", which is why setup seeds it
 * rather than leaving every developer to discover it.
 *
 * The snapshot ships whatever the production/staging row happened to contain, so
 * the values here are rewritten on every run: a local database is disposable and
 * must describe localhost, not a deployed host.
 */
const LOCAL_SSO_CLIENTS = [
  {
    client_id: "taskmentor_app",
    name: "TaskMentor",
    description: "Assignments, quizzes and proctoring",
    redirect_uri: "http://localhost:5174/taskmentor/sso/callback",
    home_url: "http://localhost:5174/taskmentor/",
  },
  {
    client_id: "discipline_attendance",
    name: "Tendo (Discipline & Attendance)",
    description: "Student attendance, discipline logs and staff duty tracking",
    redirect_uri: "http://localhost:3000/sso/callback",
    home_url: "http://localhost:3000",
  },
  {
    client_id: "tupo",
    name: "Tupo",
    description: "Communication: chat, mail, feed and meet",
    redirect_uri: "http://localhost:5194/sso/callback",
    home_url: "http://localhost:5194",
  },
];

/**
 * Client secrets for the local database only. Deliberately readable rather than
 * random: a developer has to copy this into their module's `.env`, and a value
 * that announces itself as local can never be mistaken for a production secret
 * or quietly promoted into one.
 */
const localSecretFor = (clientId: string) => `local-dev-secret-${clientId}`;

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

/**
 * MariaDB (what XAMPP ships) does not recognise `utf8mb4_0900_ai_ci`, a collation
 * MySQL 8 introduced, and rejects the snapshot outright with "Unknown collation".
 * The snapshot already uses `utf8mb4_unicode_ci` for the large majority of its
 * tables, so mapping the stragglers over makes the import succeed and makes the
 * schema internally consistent at the same time.
 *
 * This is a compatibility shim, not an endorsement: production runs MySQL 8, and
 * the two engines sort and compare strings slightly differently. Developers who
 * can run MySQL 8 locally should, and the caller warns when this path is taken.
 */
function portCollationsToMariaDB(sql: string): { sql: string; replaced: number } {
  let replaced = 0;
  const cleaned = sql.replace(/utf8mb4_0900_ai_ci/g, () => {
    replaced += 1;
    return "utf8mb4_unicode_ci";
  });
  return { sql: cleaned, replaced };
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
  const [[version]] = await server.query<any[]>("SELECT VERSION() AS v");
  const isMariaDB = /mariadb/i.test(version.v);
  console.log(`MySQL ${host}:${port} as ${user} (server ${version.v})`);
  if (isMariaDB) {
    console.log(
      "  note: MariaDB detected. MySQL 8 collations will be mapped on import.\n" +
        "  Production runs MySQL 8 — prefer it locally if you can.",
    );
  }

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
  const { sql: stripped, removed } = stripDelimiterBlocks(fs.readFileSync(DUMP_PATH, "utf8"));
  const { sql: dumpSql, replaced } = isMariaDB
    ? portCollationsToMariaDB(stripped)
    : { sql: stripped, replaced: 0 };
  console.log(
    `Importing ${path.basename(DUMP_PATH)} (${removed} stored-procedure block(s) skipped` +
      (replaced > 0 ? `, ${replaced} collation(s) mapped` : "") +
      ")...",
  );
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

  // 5. SSO clients that point at localhost
  console.log("Registering satellite SSO clients for localhost...");
  for (const client of LOCAL_SSO_CLIENTS) {
    const secret = localSecretFor(client.client_id);
    const [rows] = await db.query<any[]>(
      "SELECT system_id FROM `System` WHERE client_id = ?",
      [client.client_id],
    );
    if (rows.length > 0) {
      await db.query(
        "UPDATE `System` SET client_secret = ?, allowed_redirect_uris = ?, home_url = ?, status = 'ACTIVE' WHERE client_id = ?",
        [secret, client.redirect_uri, client.home_url, client.client_id],
      );
      console.log(`  ${client.client_id} ... updated`);
    } else {
      // `name` is UNIQUE too, so a snapshot that already lists this module under
      // a different client_id would collide here; suffixing keeps setup working
      // instead of failing on a row the developer does not care about.
      await db.query(
        "INSERT INTO `System` (name, description, client_id, client_secret, allowed_redirect_uris, status, icon_url, home_url) " +
          "SELECT ?, ?, ?, ?, ?, 'ACTIVE', '', ? FROM DUAL " +
          "WHERE NOT EXISTS (SELECT 1 FROM `System` WHERE name = ?)",
        [
          client.name,
          client.description,
          client.client_id,
          secret,
          client.redirect_uri,
          client.home_url,
          client.name,
        ],
      );
      const [check] = await db.query<any[]>(
        "SELECT system_id FROM `System` WHERE client_id = ?",
        [client.client_id],
      );
      console.log(
        check.length > 0
          ? `  ${client.client_id} ... registered`
          : `  ${client.client_id} ... SKIPPED (a different system already uses the name "${client.name}")`,
      );
    }
  }
  await db.end();

  const credentials = LOCAL_SSO_CLIENTS.map(
    (c) =>
      `  ${c.client_id}\n` +
      `    SSO_CLIENT_SECRET=${localSecretFor(c.client_id)}\n` +
      `    callback: ${c.redirect_uri}`,
  ).join("\n");

  console.log(`
Done. Database \`${database}\` is ready.

  Login:    ${admin.username}  /  ${adminPassword}
  OTP:      shown on the login page in development (no email is sent)

Local SSO clients — copy the secret for your module into its .env,
alongside NGA_MIS_BASE_URL=http://localhost:${process.env.PORT || 5001}:

${credentials}

Start the backend with \`npm run dev\`.`);
}

main().catch((err) => {
  console.error(`\nSetup failed: ${err.sqlMessage || err.message}`);
  process.exit(1);
});
