/**
 * Backfill sign-in history into Usage & Monitoring (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §12),
 * so "who accessed the platform by day / week / month" has history from day one.
 *
 *   ActivityLog LOGIN_SUCCESS → AuthEvent(login, success, source=backfill) + AnalyticsUserState.last_login_at
 *   SSOCode                   → AuthEvent(app_launch, source=backfill)
 *   both                      → AnalyticsUserDay rows (source=backfill, logins=n, sessions NULL)
 *
 * Idempotent: AuthEvent rows carry a unique source_ref, and backfill day rows never
 * overwrite live ones. Old rows have no IP or device: engagement, IP and location data
 * start at go-live, and the console says so.
 *
 * Usage (dev):        npx ts-node src/scripts/activityBackfill.ts [--db=name] [--since=YYYY-MM-DD]
 * Usage (production): node dist/scripts/activityBackfill.js        (built by `npm run build`)
 */
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

// Two levels below backend/ in both src/scripts and dist/scripts.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const APP_OF_CLIENT = new Map(
  (process.env.ACTIVITY_SOURCE_CLIENTS || "taskmentor_app=tm,discipline_attendance=tendo,tupo=tupo")
    .split(",")
    .map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
);
const APP_CODE: Record<string, number> = { mis: 1, tm: 2, tendo: 3, tupo: 4 };

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: arg("db") || process.env.DB_NAME,
    timezone: "Z",
  });
  await conn.query("SET time_zone = '+00:00'");
  const since = arg("since") || "2000-01-01";

  // Legacy CURRENT_TIMESTAMP columns hold the DB server's LOCAL time. Convert to UTC.
  const [[tz]]: any = await conn.query("SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', @@global.time_zone)) AS off, @@global.time_zone AS gz, @@system_time_zone AS sz");
  let offset = Number(tz.off);
  if (tz.gz === "SYSTEM" || tz.off === null) {
    // CONVERT_TZ can't resolve SYSTEM; ask the server for NOW() vs UTC in its own session zone.
    const c2 = await mysql.createConnection({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || "3306", 10), user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD });
    const [[r]]: any = await c2.query("SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS off");
    offset = Number(r.off);
    await c2.end();
  }
  console.log(`DB local time is UTC${offset >= 0 ? "+" : ""}${offset / 3600} h; converting legacy timestamps.`);

  const [logins] = await conn.query<any[]>(
    `INSERT IGNORE INTO AuthEvent (occurred_at, kind, outcome, method, user_id, app, source, source_ref)
     SELECT created_at - INTERVAL ? SECOND, 'login', 'success',
            IF(metadata LIKE '%GOOGLE%', 'google', 'password_otp'), user_id, 1, 'backfill', CONCAT('al:', activity_id)
       FROM ActivityLog WHERE action_type = 'LOGIN_SUCCESS' AND created_at >= ?`,
    [offset, since],
  );
  console.log(`logins: ${(logins as any).affectedRows} new`);

  const [systems] = await conn.query<any[]>("SELECT system_id, client_id FROM `System`");
  let launches = 0;
  for (const s of systems as any[]) {
    const app = APP_OF_CLIENT.get(s.client_id);
    const [r] = await conn.query<any>(
      `INSERT IGNORE INTO AuthEvent (occurred_at, kind, outcome, method, user_id, app, source, source_ref)
       SELECT created_at - INTERVAL ? SECOND, 'app_launch', 'success', LEFT(?, 20), user_id, ?, 'backfill', CONCAT('sso:', code_id)
         FROM SSOCode WHERE system_id = ? AND created_at >= ?`,
      [offset, s.client_id, app ? APP_CODE[app] : null, s.system_id, since],
    );
    launches += (r as any).affectedRows;
  }
  console.log(`app launches: ${launches} new`);

  await conn.query(
    `INSERT INTO AnalyticsUserState (user_id, last_login_at, last_login_method)
     SELECT a.user_id, MAX(a.occurred_at), 'password_otp' FROM AuthEvent a
      WHERE a.kind IN ('login','google') AND a.outcome = 'success' AND a.user_id IS NOT NULL GROUP BY a.user_id
     ON DUPLICATE KEY UPDATE last_login_at = GREATEST(COALESCE(last_login_at, VALUES(last_login_at)), VALUES(last_login_at))`,
  );

  // Day rows: one per Kigali day, user and app (sign-ins count for the MIS; launches for the app opened).
  const [days] = await conn.query<any>(
    `INSERT IGNORE INTO AnalyticsUserDay (day, user_id, app, sessions, logins, is_active, first_at, last_at, source)
     SELECT DATE(a.occurred_at + INTERVAL 2 HOUR), a.user_id, COALESCE(IF(a.kind = 'app_launch', a.app, 1), 1), NULL,
            SUM(a.kind IN ('login','google')), 0, MIN(a.occurred_at), MAX(a.occurred_at), 'backfill'
       FROM AuthEvent a
      WHERE a.source = 'backfill' AND a.outcome = 'success' AND a.user_id IS NOT NULL
        AND (a.kind IN ('login','google') OR (a.kind = 'app_launch' AND a.app IS NOT NULL))
      GROUP BY DATE(a.occurred_at + INTERVAL 2 HOUR), a.user_id, COALESCE(IF(a.kind = 'app_launch', a.app, 1), 1)`,
  );
  console.log(`day rows: ${(days as any).affectedRows} new`);
  await conn.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err.message);
  process.exit(1);
});
