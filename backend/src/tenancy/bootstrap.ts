/**
 * Control-plane bootstrap (plan Phase 1 task 1 / 7). Idempotent:
 *
 *   1. CREATE DATABASE PLATFORM_DB_NAME (needs CREATE on it),
 *   2. apply backend/migrations/platform/*.sql (ledger: PlatformMigration),
 *   3. seed Tenant 1 = the primary tenant (slug TENANCY_PRIMARY_SLUG or "nga",
 *      package "max", mis_db_name = env DB_NAME, ACTIVE) when missing,
 *   4. backfill AccountDirectory from tenant 1's users,
 *   5. record tenant 1's pre-ledger migrations as BASELINED,
 *   6. assign tenant 1 every System that existed before multi-tenancy (explicit
 *      TenantSystem rows -- the primary is no longer implicitly assigned all
 *      Systems). Done ONCE (ledger marker "bootstrap:tenant1-systems"): a later
 *      run must not hand tenant 1 a System made for another school.
 */
import fs from "fs";
import path from "path";
import { RowDataPacket } from "mysql2/promise";
import { PRIMARY_TENANT_ID, runWithTenant } from "../vendor/nga-tenancy";
import { closeControlPool, controlPool } from "../db/platform";
import { dbForTenant } from "../db";
import { School, System } from "../db/schema";
import { asc } from "drizzle-orm";
import { assertSafeDbName } from "./dbNames";
import { platformDbName, primaryDbName } from "./context";
import { adminConnection, executeSqlScript, sha256 } from "./sqlScript";
import { backfillDirectory } from "./directory";
import { MIGRATIONS_DIR, isPreLedger, ledgerOf, listMigrationFiles, recordMigration } from "./migrations";
import { getTenant, invalidateTenants } from "./registry";

export const PLATFORM_MIGRATIONS_DIR = path.join(MIGRATIONS_DIR, "platform");

export interface BootstrapReport {
  platformDb: string;
  platformMigrations: string[];
  primaryCreated: boolean;
  directoryEntries: number;
  baselined: number;
  /** Systems assigned to tenant 1 by this run (step 6; 0 once done). */
  primarySystemsAssigned: number;
}

const PRIMARY_SYSTEMS_MARKER = "bootstrap:tenant1-systems";

/** Step 6 (idempotent): INSERT IGNORE keeps an operator's DISABLED row as it is. */
export async function assignPrimarySystemsOnce(): Promise<number> {
  const [done] = await controlPool().query<RowDataPacket[]>("SELECT 1 FROM PlatformMigration WHERE file = ?", [PRIMARY_SYSTEMS_MARKER]);
  if (done.length > 0) return 0;
  let ids: number[] = [];
  try {
    ids = (await dbForTenant(PRIMARY_TENANT_ID).select({ id: System.system_id }).from(System)).map((r) => Number(r.id));
  } catch {
    ids = []; // no System table yet: nothing existed before tenancy
  }
  let assigned = 0;
  for (const id of ids) {
    const [r] = await controlPool().query<any>(
      "INSERT IGNORE INTO TenantSystem (tenant_id, system_id, status, source) VALUES (?, ?, 'ACTIVE', 'OVERRIDE')",
      [PRIMARY_TENANT_ID, id],
    );
    assigned += Number(r?.affectedRows ?? 0);
  }
  await controlPool().query("INSERT IGNORE INTO PlatformMigration (file, checksum) VALUES (?, ?)", [PRIMARY_SYSTEMS_MARKER, sha256(ids.join(","))]);
  return assigned;
}

export async function applyPlatformMigrations(): Promise<string[]> {
  const name = assertSafeDbName(platformDbName());
  const admin = await adminConnection();
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await admin.end().catch(() => undefined);
  }
  // A pool opened before the database existed keeps failing: start it fresh.
  await closeControlPool();

  const conn = await adminConnection(name);
  const applied: string[] = [];
  try {
    let done = new Set<string>();
    try {
      const [rows] = await conn.query<RowDataPacket[]>("SELECT file FROM PlatformMigration");
      done = new Set(rows.map((r) => String(r.file)));
    } catch {
      /* first run: the ledger table comes with 001 */
    }
    const files = fs.existsSync(PLATFORM_MIGRATIONS_DIR)
      ? fs.readdirSync(PLATFORM_MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()
      : [];
    for (const file of files) {
      if (done.has(file)) continue;
      const text = fs.readFileSync(path.join(PLATFORM_MIGRATIONS_DIR, file), "utf8");
      await executeSqlScript(conn, text);
      await conn.query("INSERT INTO PlatformMigration (file, checksum) VALUES (?, ?) ON DUPLICATE KEY UPDATE checksum = VALUES(checksum)", [
        file,
        sha256(text),
      ]);
      applied.push(file);
    }
  } finally {
    await conn.end().catch(() => undefined);
  }
  return applied;
}

async function seedPrimaryTenant(): Promise<boolean> {
  const [rows] = await controlPool().query<RowDataPacket[]>("SELECT tenant_id FROM Tenant WHERE tenant_id = ?", [PRIMARY_TENANT_ID]);
  if (rows.length > 0) return false;
  let name = "NGA";
  try {
    const [school] = await dbForTenant(PRIMARY_TENANT_ID).select({ name: School.name }).from(School).orderBy(asc(School.school_id)).limit(1);
    if (school?.name) name = school.name;
  } catch {
    /* no School table yet: keep the default */
  }
  await controlPool().query(
    "INSERT INTO Tenant (tenant_id, slug, display_name, status, is_primary, package_code, timezone, mis_db_name, activated_at) " +
      "VALUES (?, ?, ?, 'ACTIVE', 1, 'max', ?, ?, CURRENT_TIMESTAMP)",
    [
      PRIMARY_TENANT_ID,
      process.env.TENANCY_PRIMARY_SLUG || "nga",
      name,
      process.env.SCHOOL_TIMEZONE || "Africa/Kigali",
      primaryDbName(),
    ],
  );
  return true;
}

export async function bootstrapPlatform(log: (line: string) => void = () => undefined): Promise<BootstrapReport> {
  const platformMigrations = await applyPlatformMigrations();
  log(`control plane ${platformDbName()}: ${platformMigrations.length} migration(s) applied`);
  const primaryCreated = await seedPrimaryTenant();
  log(primaryCreated ? "tenant 1 (primary) created" : "tenant 1 (primary) already present");
  invalidateTenants();

  const primary = (await getTenant(PRIMARY_TENANT_ID))!;
  const directoryEntries = await runWithTenant(primary, () => backfillDirectory(PRIMARY_TENANT_ID));
  log(`account directory: ${directoryEntries} tenant-1 account(s) indexed`);

  const ledger = await ledgerOf(PRIMARY_TENANT_ID);
  let baselined = 0;
  for (const f of listMigrationFiles()) {
    if (ledger.has(f.file) || !isPreLedger(f)) continue;
    await recordMigration(PRIMARY_TENANT_ID, f.file, f.checksum, "BASELINED");
    baselined++;
  }
  log(`tenant 1 migration ledger: ${baselined} pre-ledger file(s) baselined`);
  const primarySystemsAssigned = await assignPrimarySystemsOnce();
  log(`tenant 1 systems: ${primarySystemsAssigned} pre-tenancy System(s) explicitly assigned`);
  return { platformDb: platformDbName(), platformMigrations, primaryCreated, directoryEntries, baselined, primarySystemsAssigned };
}
