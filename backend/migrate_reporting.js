const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config({ path: path.join(__dirname, ".env") });

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  console.log("Cleaning up partial migration...");
  try {
    await connection.query("DROP TABLE IF EXISTS `ReportTopic`, `ReportReflection`, `ReportProjectUpdate`, `ReportLesson`, `MentorshipSession`, `InstructorReport` CASCADE");
  } catch (e) {
    console.log("Cleanup note:", e.message);
  }

  const sqlPath = path.join(__dirname, "migrations/0003_clumsy_white_tiger.sql");
  const sqlContent = fs.readFileSync(sqlPath, "utf8");
  const statements = sqlContent.split("--> statement-breakpoint");

  console.log(`Running migration with ${statements.length} statements...`);
  try {
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement.trim());
      }
    }
    console.log("Migration successful!");
  } catch (error) {
    console.error("Migration failed:", error.message);
    console.error("At statement:", error.sql);
  } finally {
    await connection.end();
  }
}

migrate();
