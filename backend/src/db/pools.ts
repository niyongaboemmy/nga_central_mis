import mysql from "mysql2/promise";
import { PRIMARY_TENANT_ID } from "../vendor/nga-tenancy";
import { assertSafeDbName, misDbNameFor } from "../tenancy/dbNames";

/**
 * Lazily created mysql2 pools, one per (kind, tenant database), kept in a
 * small LRU (ADR-10: same MySQL server, no extra infrastructure).
 *
 *   kind "main"      the Drizzle pool behind `db` (DB_CONNECTION_LIMIT, default 1)
 *   kind "activity"  the analytics raw pool (services/activity/db.ts)
 *
 * Pools idle for TENANCY_POOL_IDLE_MS (default 5 min) are closed by a sweep;
 * when more than TENANCY_MAX_POOLS (default 16) exist, the least recently used
 * idle one is closed. The primary tenant's pools are never evicted.
 */
export type PoolKind = "main" | "activity";

interface Entry {
  key: string;
  tid: number;
  kind: PoolKind;
  database: string;
  pool: mysql.Pool;
  lastUsed: number;
  /** Kind-specific companion (e.g. the Drizzle instance), built once per pool. */
  extra?: unknown;
}

const entries = new Map<string, Entry>();
let sweeper: NodeJS.Timeout | null = null;

const idleMs = () => parseInt(process.env.TENANCY_POOL_IDLE_MS || "300000", 10);
const maxPools = () => parseInt(process.env.TENANCY_MAX_POOLS || "16", 10);

function baseOptions(): mysql.PoolOptions {
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}

function optionsFor(kind: PoolKind, database: string): mysql.PoolOptions {
  if (kind === "activity") {
    return {
      ...baseOptions(),
      database,
      connectionLimit: parseInt(process.env.ACTIVITY_DB_CONNECTION_LIMIT || "2", 10),
      // UTC on the wire and in the session -- see services/activity/db.ts.
      timezone: "Z",
      supportBigNumbers: true,
      bigNumberStrings: false,
      idleTimeout: 60_000,
    };
  }
  return {
    ...baseOptions(),
    database,
    // A single shared connection is deliberately conservative for the
    // production host's connection cap; tests raise it (src/test/setupEnv.ts).
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || "1", 10),
    idleTimeout: 60000,
  };
}

function createPool(kind: PoolKind, database: string): mysql.Pool {
  const pool = mysql.createPool(optionsFor(kind, database));
  if (kind === "activity") {
    (pool as any).pool?.on?.("connection", (conn: any) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

function ensureSweeper() {
  if (sweeper) return;
  sweeper = setInterval(sweepIdle, Math.max(10_000, Math.min(idleMs(), 60_000)));
  sweeper.unref?.();
}

function closeEntry(e: Entry) {
  entries.delete(e.key);
  void e.pool.end().catch(() => undefined);
}

/** Close pools of non-primary tenants unused for TENANCY_POOL_IDLE_MS. */
export function sweepIdle(now = Date.now()): number {
  let closed = 0;
  for (const e of Array.from(entries.values())) {
    if (e.tid === PRIMARY_TENANT_ID) continue;
    if (now - e.lastUsed >= idleMs()) {
      closeEntry(e);
      closed++;
    }
  }
  return closed;
}

function evictIfFull() {
  if (entries.size < maxPools()) return;
  const candidates = Array.from(entries.values())
    .filter((e) => e.tid !== PRIMARY_TENANT_ID && Date.now() - e.lastUsed > 30_000)
    .sort((a, b) => a.lastUsed - b.lastUsed);
  if (candidates[0]) closeEntry(candidates[0]);
  // Otherwise every pool is busy: allow a temporary overflow rather than fail.
}

/** The pool entry for a tenant (created on first use). */
export function poolEntryFor(tid: number, kind: PoolKind): Entry {
  const database = assertSafeDbName(misDbNameFor(tid));
  const key = `${kind}:${database}`;
  let e = entries.get(key);
  if (!e) {
    evictIfFull();
    e = { key, tid, kind, database, pool: createPool(kind, database), lastUsed: Date.now() };
    entries.set(key, e);
    ensureSweeper();
  }
  e.lastUsed = Date.now();
  return e;
}

export function poolFor(tid: number, kind: PoolKind = "main"): mysql.Pool {
  return poolEntryFor(tid, kind).pool;
}

/** Close every pool of a kind (or all). Tests and graceful shutdown. */
export async function closePools(kind?: PoolKind): Promise<void> {
  const list = Array.from(entries.values()).filter((e) => !kind || e.kind === kind);
  for (const e of list) entries.delete(e.key);
  await Promise.all(list.map((e) => e.pool.end().catch(() => undefined)));
}

/** Diagnostics: which pools are open. */
export function openPools(): Array<{ kind: PoolKind; tid: number; database: string; idleMs: number }> {
  return Array.from(entries.values()).map((e) => ({ kind: e.kind, tid: e.tid, database: e.database, idleMs: Date.now() - e.lastUsed }));
}

/** Close one tenant's pools (after its database was dropped or renamed). */
export async function closeTenantPools(tid: number): Promise<void> {
  const list = Array.from(entries.values()).filter((e) => e.tid === tid);
  for (const e of list) entries.delete(e.key);
  await Promise.all(list.map((e) => e.pool.end().catch(() => undefined)));
}
