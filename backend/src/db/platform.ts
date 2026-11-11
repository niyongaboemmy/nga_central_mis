import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as platformSchema from "./platformSchema";
import { platformDbName } from "../tenancy/context";

/**
 * The control plane (database PLATFORM_DB_NAME, default `amashuri_platform`):
 * Tenant, AccountDirectory, TenantSystem, TenantMigration, PlatformAudit.
 *
 * A separate, explicit pool -- it is never tenant-routed, and the tenant `db`
 * can never reach these tables. Lazy, so env set by tests applies.
 */
let pool: mysql.Pool | null = null;
let instance: MySql2Database<typeof platformSchema> | null = null;
let poolDb: string | null = null;

export function controlPool(): mysql.Pool {
  const name = platformDbName();
  if (pool && poolDb !== name) {
    // PLATFORM_DB_NAME changed (tests): start over.
    void pool.end().catch(() => undefined);
    pool = null;
    instance = null;
  }
  if (!pool) {
    poolDb = name;
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: name,
      connectionLimit: parseInt(process.env.PLATFORM_DB_CONNECTION_LIMIT || "2", 10),
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 10000,
      idleTimeout: 60000,
      enableKeepAlive: true,
    });
  }
  return pool;
}

export type ControlDb = MySql2Database<typeof platformSchema>;

function control(): ControlDb {
  const p = controlPool();
  if (!instance) instance = drizzle(p, { schema: platformSchema, mode: "default" });
  return instance;
}

/** The control-plane Drizzle instance (same lazy-proxy shape as `db`). */
export const controlDb: ControlDb = new Proxy({} as ControlDb, {
  get(_t, prop) {
    const real = control() as any;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closeControlPool(): Promise<void> {
  const p = pool;
  pool = null;
  instance = null;
  if (p) await p.end().catch(() => undefined);
}

/** MySQL errors meaning "the control plane has not been provisioned here". */
export function isControlPlaneMissing(err: any): boolean {
  const code = err?.code ?? err?.cause?.code;
  return code === "ER_BAD_DB_ERROR" || code === "ER_NO_SUCH_TABLE" || code === "ER_DBACCESS_DENIED_ERROR";
}
