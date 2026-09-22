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
 *   5. create one `dev.*` account per role, all with that same password
 *   6. point the satellite SSO clients at their localhost callbacks
 *
 * Usage:
 *   npm run db:setup                              # password: Admin@1234
 *   npm run db:setup -- --admin-password='...'    # your own
 *   npm run db:setup -- --force                   # drop and rebuild an existing DB
 *   npm run db:setup -- --refresh                 # existing DB: redo steps 4-6 only
 *
 * --refresh is what start.bat runs on every start once the database exists,
 * so accounts and SSO clients added later reach databases built earlier.
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

/**
 * One sign-in per role, so a developer can see the MIS (and every satellite,
 * which derives its own roles from these) as each kind of user without
 * borrowing a real person's account from the snapshot. They share the
 * super-admin's password. The `@nga.test` domain is reserved (RFC 2606) and
 * can never receive mail, and `dev.` usernames cannot collide with the
 * snapshot's real users.
 *
 * `links` attach the account to the current academic year's busiest class
 * group and its subjects, looked up at run time, so a dev student has a
 * register in Tendo and a dev teacher has subjects in TaskMentor.
 */
type DevLink = "class_teacher" | "teacher_subjects" | "student" | "parent_of_student" | "program_lead";
type DevAccount = {
  username: string;
  role: string;
  user_type: "STUDENT" | "TEACHER" | "ADMIN" | "PARENT" | "STAFF";
  first_name: string;
  last_name: string;
  gender: "MALE" | "FEMALE";
  links?: DevLink[];
};
const DEV_ACCOUNTS: DevAccount[] = [
  { username: "dev.admin", role: "ADMIN", user_type: "ADMIN", first_name: "Dev", last_name: "Admin", gender: "FEMALE" },
  { username: "dev.headteacher", role: "HEAD_TEACHER", user_type: "TEACHER", first_name: "Dev", last_name: "Head Teacher", gender: "MALE" },
  { username: "dev.teacher", role: "TEACHER", user_type: "TEACHER", first_name: "Dev", last_name: "Teacher", gender: "FEMALE", links: ["teacher_subjects"] },
  { username: "dev.classteacher", role: "CLASS_TEACHER", user_type: "TEACHER", first_name: "Dev", last_name: "Class Teacher", gender: "MALE", links: ["class_teacher", "teacher_subjects"] },
  { username: "dev.student", role: "STUDENT", user_type: "STUDENT", first_name: "Dev", last_name: "Student", gender: "FEMALE", links: ["student"] },
  { username: "dev.parent", role: "PARENT", user_type: "PARENT", first_name: "Dev", last_name: "Parent", gender: "MALE", links: ["parent_of_student"] },
  { username: "dev.accountant", role: "ACCOUNTANT", user_type: "STAFF", first_name: "Dev", last_name: "Accountant", gender: "FEMALE" },
  { username: "dev.staff", role: "STAFF", user_type: "STAFF", first_name: "Dev", last_name: "Staff", gender: "MALE" },
  { username: "dev.programmanager", role: "PROGRAM_MANAGER", user_type: "STAFF", first_name: "Dev", last_name: "Program Manager", gender: "FEMALE", links: ["program_lead"] },
];
const devEmailFor = (username: string) => `${username}@nga.test`;

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

/**
 * Splits a migration into the statements the server must receive one by one.
 *
 * `DELIMITER` is a directive of the mysql command-line client, not SQL: it tells
 * the client where a statement ends so that a stored procedure or trigger body,
 * which contains its own semicolons, can be sent whole. mysql2 talks to the
 * server directly and rejects the word outright, so a migration with such a
 * block (083 is the first) failed here and left a half-migrated database.
 * Honouring the directive the way the client does — track the current
 * delimiter, cut on it, drop the directive lines — lets every migration run
 * through the same driver without a mysql binary on the machine.
 *
 * Only whole-line `DELIMITER x` directives are recognised, which is how every
 * migration (and mysqldump) writes them.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let delimiter = ";";
  let current = "";
  for (const rawLine of sql.split(/\r?\n/)) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(rawLine);
    if (directive) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      delimiter = directive[1];
      continue;
    }
    current += rawLine + "\n";
    // A statement ends when the delimiter closes a line (comments aside, that
    // is where the client cuts too). Cutting mid-line is not attempted: a
    // literal ';' inside a string would otherwise split a statement.
    const trimmed = current.trimEnd();
    if (trimmed.endsWith(delimiter)) {
      const body = trimmed.slice(0, -delimiter.length).trim();
      if (body) statements.push(body);
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
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

/**
 * Where in the school the linked dev accounts go: the current academic year,
 * the class group with the most students in it, that group's grade and
 * program, and the subjects already taught in it. Everything is read from the
 * database rather than hard-coded so a refreshed snapshot still works.
 */
async function findAcademicContext(db: mysql.Connection) {
  const [[year]] = await db.query<any[]>(
    "SELECT academic_year_id FROM AcademicYear ORDER BY is_current DESC, academic_year_id DESC LIMIT 1",
  );
  if (!year) return null;
  const [[group]] = await db.query<any[]>(
    `SELECT cg.class_group_id, cg.grade_id, g.program_id
       FROM ClassGroup cg
       JOIN Grade g ON g.grade_id = cg.grade_id
       LEFT JOIN StudentClassGroup scg
         ON scg.class_group_id = cg.class_group_id AND scg.academic_year_id = ?
      GROUP BY cg.class_group_id, cg.grade_id, g.program_id
      ORDER BY COUNT(scg.user_id) DESC, cg.class_group_id ASC
      LIMIT 1`,
    [year.academic_year_id],
  );
  if (!group) return null;
  const [subjectRows] = await db.query<any[]>(
    `SELECT DISTINCT subject_id FROM TeacherSubjectAssignment
      WHERE class_group_id = ? AND academic_year_id = ? ORDER BY subject_id LIMIT 3`,
    [group.class_group_id, year.academic_year_id],
  );
  return {
    academic_year_id: year.academic_year_id as number,
    class_group_id: group.class_group_id as number,
    grade_id: group.grade_id as number,
    program_id: group.program_id as number,
    subject_ids: subjectRows.map((r) => r.subject_id as number),
  };
}

/** Creates or refreshes the `dev.*` accounts. Idempotent: safe on every run. */
async function ensureDevAccounts(db: mysql.Connection, passwordHash: string) {
  const ctx = await findAcademicContext(db);
  if (!ctx) console.log("  note: no academic year/class group in the snapshot; accounts are created without class links");

  const [roleRows] = await db.query<any[]>("SELECT role_id, name FROM Role");
  const roleId = new Map<string, number>(roleRows.map((r) => [r.name, r.role_id]));

  const ids = new Map<string, number>();
  for (const a of DEV_ACCOUNTS) {
    const rid = roleId.get(a.role);
    if (!rid) {
      console.log(`  ${a.username} ... SKIPPED (role ${a.role} does not exist)`);
      continue;
    }
    const [existing] = await db.query<any[]>("SELECT user_id FROM User WHERE username = ?", [a.username]);
    let userId: number;
    if (existing.length > 0) {
      userId = existing[0].user_id;
      await db.query("UPDATE User SET email = ?, status = 'ACTIVE' WHERE user_id = ?", [devEmailFor(a.username), userId]);
    } else {
      const [ins] = await db.query<any>("INSERT INTO User (username, email, status) VALUES (?, ?, 'ACTIVE')", [
        a.username,
        devEmailFor(a.username),
      ]);
      userId = ins.insertId;
    }
    ids.set(a.username, userId);

    const [cred] = await db.query<any[]>("SELECT auth_id FROM AuthCredential WHERE user_id = ?", [userId]);
    if (cred.length > 0) {
      await db.query(
        "UPDATE AuthCredential SET password_hash = ?, failed_attempts = 0, locked_until = NULL, force_password_change = 0 WHERE user_id = ?",
        [passwordHash, userId],
      );
    } else {
      await db.query("INSERT INTO AuthCredential (user_id, password_hash) VALUES (?, ?)", [userId, passwordHash]);
    }

    const [prof] = await db.query<any[]>("SELECT profile_id FROM UserProfile WHERE user_id = ?", [userId]);
    if (prof.length === 0) {
      await db.query(
        "INSERT INTO UserProfile (user_id, first_name, last_name, gender, user_type, registration_number) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, a.first_name, a.last_name, a.gender, a.user_type, a.user_type === "STUDENT" ? "DEV-STU-001" : null],
      );
    }
    await db.query("INSERT IGNORE INTO UserRole (user_id, role_id) VALUES (?, ?)", [userId, rid]);
    // A class teacher is also a teacher; the app treats the roles as additive.
    if (a.role === "CLASS_TEACHER" && roleId.has("TEACHER")) {
      await db.query("INSERT IGNORE INTO UserRole (user_id, role_id) VALUES (?, ?)", [userId, roleId.get("TEACHER")]);
    }
    console.log(`  ${a.username} ... ${existing.length > 0 ? "refreshed" : "created"}`);
  }

  if (!ctx) return;
  const { academic_year_id: yr, class_group_id: cg, grade_id, program_id, subject_ids } = ctx;
  for (const a of DEV_ACCOUNTS) {
    const userId = ids.get(a.username);
    if (!userId || !a.links) continue;
    for (const link of a.links) {
      switch (link) {
        case "teacher_subjects":
          for (const subject of subject_ids) {
            await db.query(
              "INSERT IGNORE INTO TeacherSubjectAssignment (user_id, subject_id, class_group_id, academic_year_id) VALUES (?, ?, ?, ?)",
              [userId, subject, cg, yr],
            );
          }
          break;
        case "class_teacher":
          await db.query(
            "INSERT IGNORE INTO UserGrade (user_id, grade_id, class_group_id, academic_year_id) VALUES (?, ?, ?, ?)",
            [userId, grade_id, cg, yr],
          );
          break;
        case "student":
          await db.query(
            "INSERT IGNORE INTO StudentClassGroup (user_id, class_group_id, academic_year_id, status) VALUES (?, ?, ?, 'ACTIVE')",
            [userId, cg, yr],
          );
          for (const subject of subject_ids) {
            await db.query(
              "INSERT IGNORE INTO StudentSubjectEnrollment (user_id, subject_id, academic_year_id, status) VALUES (?, ?, ?, 'ACTIVE')",
              [userId, subject, yr],
            );
          }
          break;
        case "parent_of_student": {
          const studentId = ids.get("dev.student");
          if (!studentId) break;
          await db.query(
            "INSERT INTO Parenting (student_id, parent_id, relationship) SELECT ?, ?, 'PARENT' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM Parenting WHERE student_id = ? AND parent_id = ?)",
            [studentId, userId, studentId, userId],
          );
          break;
        }
        case "program_lead":
          await db.query(
            "INSERT IGNORE INTO UserProgramLead (user_id, program_id, academic_year_id) VALUES (?, ?, ?)",
            [userId, program_id, yr],
          );
          break;
      }
    }
  }
}

async function main() {
  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USERNAME || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = argOf("db") || process.env.DB_NAME;
  const adminPassword = argOf("admin-password") || DEFAULT_ADMIN_PASSWORD;

  const refresh = hasFlag("refresh");

  if (!database) throw new Error("DB_NAME is not set in .env");
  if (!refresh && !fs.existsSync(DUMP_PATH)) throw new Error(`Snapshot not found: ${DUMP_PATH}`);

  const server = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  const [[version]] = await server.query<any[]>("SELECT VERSION() AS v");
  const isMariaDB = /mariadb/i.test(version.v);
  console.log(`MySQL ${host}:${port} as ${user} (server ${version.v})`);
  if (isMariaDB && !refresh) {
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
  if (refresh) {
    if (existing[0].n === 0) throw new Error(`Database \`${database}\` does not exist yet; run without --refresh to build it.`);
    await server.end();
  } else if (existing[0].n > 0) {
    if (!hasFlag("force")) {
      throw new Error(
        `Database \`${database}\` already has ${existing[0].n} tables. Re-run with --force to drop and rebuild it.`,
      );
    }
    console.log(`Dropping existing \`${database}\` (--force)`);
    await server.query(`DROP DATABASE \`${database}\``);
  }
  if (!refresh) {
    await server.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await server.end();
  }

  const db = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });

  if (!refresh) {
    try {
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
        for (const statement of splitSqlStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))) {
          await db.query(statement);
        }
        console.log("ok");
      }
    } catch (err) {
      // DDL cannot be rolled back, and a database that stops half-way through
      // its migrations is worse than none: start.bat sees its tables and calls
      // it ready, the password gets set, sign-in works, and the first request
      // that needs a missing column fails in a way that looks like a wrong OTP.
      // Removing what this run created keeps the next run a clean rebuild.
      console.log("\nBuild failed - removing the incomplete database so the next run starts clean.");
      await db.query(`DROP DATABASE IF EXISTS \`${database}\``).catch(() => undefined);
      throw err;
    }
  } else {
    console.log(`Refreshing local accounts and SSO clients in \`${database}\` (--refresh)`);
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

  // 5. one account per role, same password
  console.log("Creating dev accounts (one per role)...");
  await ensureDevAccounts(db, hash);

  // 6. SSO clients that point at localhost
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

  const width = Math.max(...DEV_ACCOUNTS.map((a) => a.username.length), admin.username.length);
  const accounts = [
    `  ${admin.username.padEnd(width)}  SUPER_ADMIN`,
    ...DEV_ACCOUNTS.map((a) => `  ${a.username.padEnd(width)}  ${a.role}`),
  ].join("\n");

  console.log(`
Done. Database \`${database}\` is ready.

  Password for every account below:  ${adminPassword}
  OTP: shown on the login page in development (no email is sent)

${accounts}

Local SSO clients — copy the secret for your module into its .env,
alongside NGA_MIS_BASE_URL=http://localhost:${process.env.PORT || 5001}:

${credentials}

Start the backend with \`npm run dev\`.`);
}

main().catch((err) => {
  console.error(`\nSetup failed: ${err.sqlMessage || err.message}`);
  process.exit(1);
});
