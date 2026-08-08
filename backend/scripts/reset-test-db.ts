/**
 * Clones the current dev database's table structure (no data) into a
 * disposable `${DB_NAME}_test` schema on the same MySQL server, so backend
 * tests run against a real MySQL engine instead of a mock/SQLite shim.
 *
 * A handful of small, static lookup tables are also seeded with their real
 * data (not just structure) — tests rely on these existing, the same way
 * production does, rather than re-inventing fixture rows for admin-managed
 * reference lists.
 *
 * Usage: npm run test:db:reset
 */
import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2/promise";

const LOOKUP_TABLES_WITH_DATA = ["SupportRequestCategory", "ChallengeCategory"];

async function main() {
  const host = process.env.DB_HOST || "localhost";
  const port = parseInt(process.env.DB_PORT || "3306", 10);
  const user = process.env.DB_USERNAME || "root";
  const password = process.env.DB_PASSWORD || "";
  const sourceDb = process.env.DB_NAME || "nga_central_mis";
  const testDb = `${sourceDb}_test`;

  const admin = await mysql.createConnection({ host, port, user, password });

  console.log(`Recreating schema ${testDb} from ${sourceDb}...`);
  await admin.query(`DROP DATABASE IF EXISTS \`${testDb}\``);
  await admin.query(`CREATE DATABASE \`${testDb}\``);

  const source = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: sourceDb,
  });
  const [tables] = await source.query<mysql.RowDataPacket[]>("SHOW TABLES");
  const tableNames = tables.map((row) => Object.values(row)[0] as string);

  const target = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database: testDb,
    multipleStatements: true,
  });
  await target.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const table of tableNames) {
    const [rows] = await source.query<mysql.RowDataPacket[]>(
      `SHOW CREATE TABLE \`${table}\``,
    );
    const createSql = rows[0]["Create Table"] as string;
    await target.query(createSql);
  }

  for (const table of LOOKUP_TABLES_WITH_DATA) {
    if (!tableNames.includes(table)) continue;
    const [rows] = await source.query<mysql.RowDataPacket[]>(`SELECT * FROM \`${table}\``);
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0]);
    const placeholders = `(${columns.map(() => "?").join(", ")})`;
    const values = rows.map((row) => columns.map((col) => row[col]));
    await target.query(
      `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES ${rows.map(() => placeholders).join(", ")}`,
      values.flat(),
    );
  }

  await target.query("SET FOREIGN_KEY_CHECKS = 1");

  console.log(`Cloned ${tableNames.length} tables into ${testDb}.`);

  await admin.end();
  await source.end();
  await target.end();
}

main().catch((err) => {
  console.error("Failed to reset test DB:", err);
  process.exit(1);
});
