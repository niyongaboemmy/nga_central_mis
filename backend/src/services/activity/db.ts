import mysql from "mysql2/promise";

/**
 * A dedicated connection pool for platform activity (USAGE_ANALYTICS_IMPLEMENTATION_PLAN.md §5.3).
 *
 * The main Drizzle pool runs with ONE connection in production (src/db/index.ts), so
 * every analytics insert, rollup or report query on it would queue in front of real user
 * requests. Analytics gets its own small pool instead.
 *
 * `timezone: "Z"` makes mysql2 write and read DATETIME as UTC. That removes the Reminder
 * Hub trap where a bare Date in raw SQL was formatted in the host zone. Every column in
 * migration 095 is UTC.
 */
let pool: mysql.Pool | null = null;

export const activityPool = (): mysql.Pool => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: parseInt(process.env.ACTIVITY_DB_CONNECTION_LIMIT || "2", 10),
      waitForConnections: true,
      queueLimit: 0,
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: false,
      enableKeepAlive: true,
      idleTimeout: 60_000,
    });
    // The session zone must be UTC too, or UNIX_TIMESTAMP()/FROM_UNIXTIME()/NOW() in SQL
    // would read our UTC DATETIMEs in the server's local zone.
    (pool as any).pool?.on?.("connection", (conn: any) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
};

export type Row = Record<string, any>;

/** Run a parameterised query and return its rows (SELECT) or result header. */
export const q = async <T = Row>(sql: string, params: any[] = []): Promise<T[]> => {
  const [rows] = await activityPool().query(sql, params);
  return rows as T[];
};

export const exec = async (sql: string, params: any[] = []): Promise<mysql.ResultSetHeader> => {
  const [res] = await activityPool().query(sql, params);
  return res as mysql.ResultSetHeader;
};

/** Close the pool (tests / graceful shutdown). */
export const closeActivityPool = async () => {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => undefined);
  }
};

/** Are the 095 tables present? Lets every entry point fail soft on an un-migrated server. */
let tablesPresent: boolean | null = null;
let checkedAt = 0;
export const activityTablesPresent = async (): Promise<boolean> => {
  if (tablesPresent === true) return true;
  if (tablesPresent === false && Date.now() - checkedAt < 60_000) return false;
  try {
    const rows = await q<{ n: number }>(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('AnalyticsEvent','AnalyticsSession','AnalyticsSetting')",
    );
    tablesPresent = Number(rows[0]?.n) === 3;
  } catch {
    tablesPresent = false;
  }
  checkedAt = Date.now();
  return tablesPresent;
};
