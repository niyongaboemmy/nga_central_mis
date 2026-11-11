/**
 * provisionMisTenant(tid): create or repair a tenant's MIS database (plan
 * Phase 1 task 6). Idempotent; the management plan's provisioning job and the
 * `tenantProvision` CLI call it. Tenant 1 (the primary, in place) is never
 * touched.
 *
 *   1. CREATE DATABASE Tenant.mis_db_name (default `${DB_NAME}_t<tid>`),
 *   2. schema baseline: every base table of the primary tenant's database,
 *      structure only (SHOW CREATE TABLE -- no mysqldump needed, never data),
 *      for tables the tenant DB does not have yet,
 *   3. foreign keys to the global System table are dropped (System lives in
 *      the primary DB; SSOCode/assignment rows only carry its id),
 *   4. catalog rows copied when the tenant's table is still empty: Permission,
 *      Role (the shared presets, minus platform_only ones -- those belong to the
 *      platform owner, i.e. NGA, and must never exist in another school),
 *      RolePermission of those roles, AccessManifest, AccessPresetLink and lookup
 *      lists. Never users, academics, NGA's own settings (AnalyticsSetting /
 *      OfficeHourSetting rows: a new school starts on the code defaults, which
 *      both readers fall back to) or any other school data,
 *   5. the School row (school_id = tid) and `DEFAULT <tid>` on the school_id of
 *      AccessGrant / AccessRule / Department,
 *   6. the tenant's migration ledger = tenant 1's (its schema is a clone).
 *
 * Production needs the MySQL app user to hold CREATE (+ ALTER, INDEX,
 * REFERENCES) on the tenant databases and SELECT on the primary DB.
 */
import { RowDataPacket } from "mysql2/promise";
import { PRIMARY_TENANT_ID, TenantCtx } from "../vendor/nga-tenancy";
import { controlPool } from "../db/platform";
import { closeTenantPools } from "../db/pools";
import { assertSafeDbName, misDbNameFor, setTenantDbName } from "./dbNames";
import { defaultTenantDbName, primaryDbName } from "./context";
import { adminConnection } from "./sqlScript";
import { platformAudit } from "./audit";
import { MIS_APP, ledgerOf, recordMigration } from "./migrations";
import { getTenant, invalidateTenants, tenantRecord } from "./registry";

/** Catalog tables copied into a new tenant (copied only while the target is empty). */
export const CATALOG_TABLES: Array<{ table: string; where?: string }> = [
  { table: "Permission" },
  // The shared presets (legacy base roles 1-12 included); never a school's own roles,
  // never the platform owner's (platform_only) presets.
  { table: "Role", where: "is_preset = 1 AND school_id IS NULL AND platform_only = 0" },
  {
    table: "RolePermission",
    where: "role_id IN (SELECT role_id FROM `{src}`.`Role` WHERE is_preset = 1 AND school_id IS NULL AND platform_only = 0)",
  },
  { table: "AccessManifest" },
  { table: "AccessPresetLink" },
  { table: "SupportRequestCategory" },
  { table: "ChallengeCategory" },
  // NOT AnalyticsSetting / OfficeHourSetting: by now those rows are NGA's own
  // choices (retention, office-hour bands, ...), not migration defaults. A new
  // school reads the code defaults until its admin saves (both are upserts).
];

/** Columns whose `DEFAULT 1` meant "the school" (migration 090). */
const SCHOOL_DEFAULT_COLUMNS: Array<[string, string]> = [
  ["AccessGrant", "school_id"],
  ["AccessRule", "school_id"],
  ["Department", "school_id"],
];

export interface ProvisionResult {
  ok: true;
  tid: number;
  database: string;
  created: boolean;
  tablesCreated: number;
  catalogRows: Record<string, number>;
  baselined: number;
}

const q = (name: string) => `\`${assertSafeDbName(name)}\``;
const qi = (ident: string) => `\`${ident.replace(/`/g, "``")}\``;

/** Insert the Tenant row (control plane) for a new school; returns its tid. */
export async function createTenantRow(input: {
  slug: string;
  name: string;
  status?: TenantCtx["status"];
  pkg?: string;
  timezone?: string;
  tid?: number;
  misDbName?: string;
}): Promise<number> {
  const slug = String(input.slug).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) throw new Error(`Invalid tenant slug: ${input.slug}`);
  const [res]: any = await controlPool().query(
    "INSERT INTO Tenant (tenant_id, slug, display_name, status, is_primary, package_code, timezone, mis_db_name) VALUES (?, ?, ?, ?, 0, ?, ?, NULL)",
    [input.tid ?? null, slug, input.name, input.status ?? "PENDING", input.pkg ?? "starter", input.timezone ?? "Africa/Kigali"],
  );
  const tid = Number(input.tid ?? res.insertId);
  if (tid === PRIMARY_TENANT_ID) throw new Error("Tenant 1 is the primary tenant");
  const dbName = assertSafeDbName(input.misDbName ?? defaultTenantDbName(tid));
  await controlPool().query("UPDATE Tenant SET mis_db_name = ? WHERE tenant_id = ?", [dbName, tid]);
  invalidateTenants();
  await platformAudit({ action: "tenant.create", targetTid: tid, payload: { slug, name: input.name, status: input.status ?? "PENDING" } });
  return tid;
}

export async function provisionMisTenant(tid: number): Promise<ProvisionResult> {
  if (tid === PRIMARY_TENANT_ID) throw new Error("Tenant 1 is the primary tenant and is never provisioned");
  invalidateTenants();
  const tenant = await getTenant(tid);
  if (!tenant) throw new Error(`Tenant ${tid} is not in the control plane`);
  const record = tenantRecord(tid);
  const target = assertSafeDbName(record?.misDbName ?? defaultTenantDbName(tid));
  const source = assertSafeDbName(primaryDbName());
  if (target === source) throw new Error("A tenant database can't be the primary database");
  if (!record?.misDbName) {
    await controlPool().query("UPDATE Tenant SET mis_db_name = ? WHERE tenant_id = ? AND mis_db_name IS NULL", [target, tid]);
  }
  setTenantDbName(tid, target);

  const conn = await adminConnection();
  try {
    const [existsRows] = await conn.query<RowDataPacket[]>("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [target]);
    const created = existsRows.length === 0;
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${q(target)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    // --- 2. schema baseline -------------------------------------------------
    const [srcTables] = await conn.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
      [source],
    );
    const [dstTables] = await conn.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
      [target],
    );
    const have = new Set(dstTables.map((r) => String(r.t).toLowerCase()));
    await conn.query(`USE ${q(target)}`);
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    let tablesCreated = 0;
    for (const row of srcTables) {
      const table = String(row.t);
      if (have.has(table.toLowerCase())) continue;
      const [ddlRows] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE ${q(source)}.${qi(table)}`);
      const ddl = String(ddlRows[0]["Create Table"]).replace(/\sAUTO_INCREMENT=\d+/i, "");
      await conn.query(ddl);
      tablesCreated++;
    }

    // --- 3. no FKs to the global System table -------------------------------
    const [fks] = await conn.query<RowDataPacket[]>(
      "SELECT TABLE_NAME AS t, CONSTRAINT_NAME AS c FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND REFERENCED_TABLE_NAME = 'System'",
      [target],
    );
    for (const fk of fks) await conn.query(`ALTER TABLE ${qi(String(fk.t))} DROP FOREIGN KEY ${qi(String(fk.c))}`);

    // --- 4. catalogs --------------------------------------------------------
    const catalogRows: Record<string, number> = {};
    const tableSet = new Set(srcTables.map((r) => String(r.t)));
    for (const spec of CATALOG_TABLES) {
      if (!tableSet.has(spec.table)) continue;
      const [[cnt]] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${qi(spec.table)}`);
      if (Number(cnt.n) > 0) continue;
      const [cols] = await conn.query<RowDataPacket[]>(
        "SELECT d.COLUMN_NAME AS c FROM information_schema.COLUMNS d JOIN information_schema.COLUMNS s " +
          "ON s.TABLE_SCHEMA = ? AND s.TABLE_NAME = d.TABLE_NAME AND s.COLUMN_NAME = d.COLUMN_NAME " +
          "WHERE d.TABLE_SCHEMA = ? AND d.TABLE_NAME = ? AND d.EXTRA NOT LIKE '%GENERATED%' ORDER BY d.ORDINAL_POSITION",
        [source, target, spec.table],
      );
      const list = cols.map((c) => qi(String(c.c))).join(", ");
      if (!list) continue;
      const where = spec.where ? ` WHERE ${spec.where.replace(/\{src\}/g, source)}` : "";
      const [res]: any = await conn.query(
        `INSERT INTO ${qi(spec.table)} (${list}) SELECT ${list} FROM ${q(source)}.${qi(spec.table)}${where}`,
      );
      catalogRows[spec.table] = Number(res.affectedRows ?? 0);
    }

    // --- 4b. the school's own SUPER_ADMIN ------------------------------------
    // NGA's SUPER_ADMIN row doubles as the platform_owner preset, so the copy
    // above skips it. Every school still needs a super admin (ADR-6): the
    // legacy name grants all of *this* database's permissions, while platform
    // powers stay behind isPrimary checks. Same role_id as tenant 1, but a
    // plain school role: no preset link, SCHOOL scope, not platform-only.
    if (tableSet.has("Role")) {
      const [[has]] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM `Role` WHERE name = 'SUPER_ADMIN'");
      if (Number(has.n) === 0) {
        const [res]: any = await conn.query(
          "INSERT INTO `Role` (role_id, name, description, status, preset_key, category, allowed_scope_types, max_holders, platform_only, is_preset, updated_at) " +
            "SELECT role_id, name, 'Runs this school: every permission inside the school, nothing platform-wide.', 'ACTIVE', NULL, 'School', 'SCHOOL', NULL, 0, 0, NOW() " +
            `FROM ${q(source)}.\`Role\` WHERE name = 'SUPER_ADMIN' LIMIT 1`,
        );
        catalogRows.SchoolSuperAdmin = Number(res.affectedRows ?? 0);
      }
    }

    // --- 5. the school itself ----------------------------------------------
    const code = tenant.slug.replace(/[^a-z0-9]/gi, "").slice(0, 20).toUpperCase() || `T${tid}`;
    await conn.query(
      "INSERT INTO School (school_id, name, school_code, status) VALUES (?, ?, ?, 'ACTIVE') " +
        "ON DUPLICATE KEY UPDATE school_id = school_id",
      [tid, tenant.name, code],
    );
    for (const [table, column] of SCHOOL_DEFAULT_COLUMNS) {
      if (!tableSet.has(table)) continue;
      await conn.query(`ALTER TABLE ${qi(table)} ALTER COLUMN ${qi(column)} SET DEFAULT ${Number(tid)}`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    // --- 6. migration ledger ------------------------------------------------
    const primaryLedger = await ledgerOf(PRIMARY_TENANT_ID, MIS_APP);
    const mine = await ledgerOf(tid, MIS_APP);
    let baselined = 0;
    for (const [file, entry] of primaryLedger) {
      if (mine.has(file) || entry.outcome === "SKIPPED") continue;
      await recordMigration(tid, file, entry.checksum, "BASELINED", MIS_APP);
      baselined++;
    }

    invalidateTenants();
    const result = { ok: true as const, tid, database: target, created, tablesCreated, catalogRows, baselined };
    await platformAudit({ action: "tenant.provision.mis", targetTid: tid, payload: result });
    return result;
  } finally {
    await conn.end().catch(() => undefined);
  }
}

/** Tests / tooling: drop a non-primary tenant's MIS database. */
export async function dropMisTenantDatabase(tid: number): Promise<void> {
  if (tid === PRIMARY_TENANT_ID) throw new Error("Refusing to drop the primary tenant's database");
  const name = assertSafeDbName(misDbNameFor(tid));
  if (name === primaryDbName()) throw new Error("Refusing to drop the primary database");
  await closeTenantPools(tid);
  const conn = await adminConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS ${q(name)}`);
  } finally {
    await conn.end().catch(() => undefined);
  }
}
