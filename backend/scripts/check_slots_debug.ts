import dotenv from "dotenv";
dotenv.config();
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const [slots] = await conn.query(
    "SELECT slot_id, calendar_id, academic_term_id, class_group_id, is_active, day_of_week FROM CalendarSlot ORDER BY slot_id DESC LIMIT 30"
  );
  console.log("Recent CalendarSlot rows:", slots);
  const [countByActive] = await conn.query(
    "SELECT is_active, COUNT(*) as cnt FROM CalendarSlot GROUP BY is_active"
  );
  console.log("Slot counts by is_active:", countByActive);
  await conn.end();
}
main().catch(console.error);
