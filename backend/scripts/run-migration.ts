/**
 * Applies a single migration SQL file to a given database on the local
 * MySQL server (dev or the disposable test schema).
 *
 * Usage: npx ts-node scripts/run-migration.ts <file> [--db=nga_central_mis_test]
 */
import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: run-migration.ts <file> [--db=name]");
    process.exit(1);
  }
  const dbArg = process.argv.find((a) => a.startsWith("--db="));
  const database = dbArg ? dbArg.split("=")[1] : process.env.DB_NAME;

  const filePath = path.isAbsolute(fileArg)
    ? fileArg
    : path.join(__dirname, "..", "migrations", fileArg);
  const sqlContent = fs.readFileSync(filePath, "utf8");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database,
    multipleStatements: true,
  });

  console.log(`Applying ${path.basename(filePath)} to ${database}...`);
  await conn.query(sqlContent);
  console.log("Migration applied successfully.");
  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
