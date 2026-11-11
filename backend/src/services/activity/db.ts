import mysql from "mysql2/promise";
import { poolFor, closePools } from "../../db/pools";
import { resolveDataTid } from "../../tenancy/context";

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
export const activityPool = (): mysql.Pool => poolFor(resolveDataTid("analytics database access"), "activity");

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
  await closePools("activity");
};

/** Are the 095 tables present? Lets every entry point fail soft on an un-migrated server. */
const presence = new Map<number, { ok: boolean; at: number }>(); // per tenant database
export const activityTablesPresent = async (): Promise<boolean> => {
  const tid = resolveDataTid("analytics database access");
  const hit = presence.get(tid);
  if (hit?.ok === true) return true;
  if (hit && Date.now() - hit.at < 60_000) return false;
  let ok = false;
  try {
    const rows = await q<{ n: number }>(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('AnalyticsEvent','AnalyticsSession','AnalyticsSetting')",
    );
    ok = Number(rows[0]?.n) === 3;
  } catch {
    ok = false;
  }
  presence.set(tid, { ok, at: Date.now() });
  return ok;
};
