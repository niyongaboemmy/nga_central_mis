import { drizzle, MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "./schema";
import { PRIMARY_TENANT_ID } from "../vendor/nga-tenancy";
import { resolveDataTid } from "../tenancy/context";
import { poolEntryFor } from "./pools";

/**
 * The tenant-routed database (MULTI_TENANCY_GAP_FIX_PLAN.md §2.3, ADR-1/8).
 *
 * Every module imports this same `db` symbol, so routing it isolates all
 * ~1,400 query sites at once: each property access (`db.select`, `db.insert`,
 * `db.execute`, `db.transaction`, `db.query.X`) resolves the current tenant
 * from the AsyncLocalStorage context and forwards to that tenant's Drizzle
 * instance (one mysql2 pool per tenant database, LRU -- db/pools.ts).
 *
 * - Tenant 1 (primary) is env DB_NAME, in place.
 * - A builder is bound to the tenant at the moment it is created, and
 *   `db.transaction(fn)` resolves once, so `tx` stays in that tenant.
 * - No context: TENANCY_MODE=shadow (default) logs once per call site and uses
 *   the primary tenant; TENANCY_MODE=enforce throws TenantContextMissing.
 *   Inside runAsPlatform() it always throws.
 *
 * Control-plane tables are NOT here: use `controlDb` (db/platform.ts).
 */
export type Db = MySql2Database<typeof schema>;

export function dbForTenant(tid: number): Db {
  const entry = poolEntryFor(tid, "main");
  if (!entry.extra) entry.extra = drizzle(entry.pool, { schema, mode: "default" });
  return entry.extra as Db;
}

/** The Drizzle instance for the current context (see the rules above). */
export function currentDb(): Db {
  return dbForTenant(resolveDataTid("database access"));
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = currentDb() as any;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return prop in (currentDb() as any);
  },
});

/**
 * The primary tenant's database, whatever the current context. Only for tables
 * that are global by nature and still live in tenant 1's DB until they move to
 * the control plane: System (SSO clients), and -- for the Phase 3 agent --
 * OAuthClient and the desktop distribution tables. Never for school data.
 */
export const primaryDb = (): Db => dbForTenant(PRIMARY_TENANT_ID);
