const mysql = require("mysql2");
require("dotenv").config({ path: "./backend/.env" });

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

connection.query("DESCRIBE SchemeOfWork", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("Checking SchemeOfWork table...");
  console.table(rows);

  connection.query("DESCRIBE SchemeOfWorkEntry", (err, rowsEntry) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log("\nChecking SchemeOfWorkEntry table...");
    console.table(rowsEntry);
    connection.end();
  });
});
