/**
 * Per-tenant migration runner (plan §2.4, [MIS-A20]).
 *
 * backend/migrations/*.sql are applied to every tenant database and recorded
 * in the control plane's TenantMigration(tenant_id, app, file, checksum,
 * outcome). A file tagged `-- @tenant: primary-only` (an NGA data fix) is
 * recorded SKIPPED for every other tenant; anything else is generic.
 *
 * Tenant 1's existing files were applied by hand before this ledger existed:
 * the bootstrap records them BASELINED (every file up to BASELINE_UPTO, the
 * last migration on main before tenancy). A new tenant's schema is cloned
 * from tenant 1, so provisioning records tenant 1's ledger as its baseline.
 *
 * Plain Node (no ts-node): `node dist/scripts/tenantMigrate.js`.
 */
import fs from "fs";
import path from "path";
import { RowDataPacket } from "mysql2/promise";
import { PRIMARY_TENANT_ID, TenantCtx } from "../vendor/nga-tenancy";
import { controlPool } from "../db/platform";
import { adminConnection, executeSqlScript, sha256 } from "./sqlScript";
import { listTenants } from "./registry";
import { assertSafeDbName, misDbNameFor } from "./dbNames";

export const MIS_APP = "mis";

/** migrations/ next to src/ and dist/ alike. */
export const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

/** Highest numbered migration already on main before the tenant ledger existed. */
export const baselineUpto = () => parseInt(process.env.TENANCY_BASELINE_UPTO || "126", 10);

export interface MigrationFile {
  file: string;
  fullPath: string;
  sql: string;
  checksum: string;
  primaryOnly: boolean;
  number: number | null;
}

export const isPrimaryOnly = (sqlText: string) => /^\s*--\s*@tenant:\s*primary-only\b/im.test(sqlText);

export function listMigrationFiles(dir = MIGRATIONS_DIR): MigrationFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && fs.statSync(path.join(dir, f)).isFile())
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((file) => {
      const fullPath = path.join(dir, file);
      const sqlText = fs.readFileSync(fullPath, "utf8");
      const m = /^(\d+)_/.exec(file);
      return { file, fullPath, sql: sqlText, checksum: sha256(sqlText), primaryOnly: isPrimaryOnly(sqlText), number: m ? Number(m[1]) : null };
    });
}

/** Files the pre-ledger world already applied by hand (everything not numbered past the cutoff). */
export const isPreLedger = (f: MigrationFile) => f.number === null || f.number <= baselineUpto();

export async function ledgerOf(tid: number, app = MIS_APP): Promise<Map<string, { checksum: string; outcome: string }>> {
  const [rows] = await controlPool().query<RowDataPacket[]>(
    "SELECT file, checksum, outcome FROM TenantMigration WHERE tenant_id = ? AND app = ?",
    [tid, app],
  );
  return new Map(rows.map((r) => [String(r.file), { checksum: String(r.checksum), outcome: String(r.outcome) }]));
}

export async function recordMigration(
  tid: number,
  file: string,
  checksum: string,
  outcome: "APPLIED" | "SKIPPED" | "BASELINED",
  app = MIS_APP,
): Promise<void> {
  await controlPool().query(
    "INSERT INTO TenantMigration (tenant_id, app, file, checksum, outcome) VALUES (?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), outcome = VALUES(outcome), applied_at = CURRENT_TIMESTAMP",
    [tid, app, file, checksum, outcome],
  );
}

export interface TenantMigrationReport {
  tid: number;
  slug: string;
  database: string;
  applied: string[];
  skipped: string[];
  baselined: string[];
  changedChecksum: string[];
  error?: { file: string; message: string };
}

export interface RunOptions {
  /** Only these tenants (default: every tenant that is not ARCHIVED). */
  tids?: number[];
  /** Only this file. */
  file?: string;
  dryRun?: boolean;
  /** Record pending files as BASELINED without running them. */
  baseline?: boolean;
  dir?: string;
  app?: string;
  log?: (line: string) => void;
}

export async function runTenantMigrations(opts: RunOptions = {}): Promise<TenantMigrationReport[]> {
  const log = opts.log ?? (() => undefined);
  const app = opts.app ?? MIS_APP;
  const files = listMigrationFiles(opts.dir).filter((f) => !opts.file || f.file === opts.file);
  const tenants: TenantCtx[] = (await listTenants()).filter(
    (t) => (opts.tids ? opts.tids.includes(t.tid) : t.status !== "ARCHIVED"),
  );
  const reports: TenantMigrationReport[] = [];

  for (const tenant of tenants) {
    const database = assertSafeDbName(misDbNameFor(tenant.tid));
    const report: TenantMigrationReport = { tid: tenant.tid, slug: tenant.slug, database, applied: [], skipped: [], baselined: [], changedChecksum: [] };
    reports.push(report);
    const ledger = await ledgerOf(tenant.tid, app);
    const pending = files.filter((f) => {
      const done = ledger.get(f.file);
      if (done && done.checksum !== f.checksum) report.changedChecksum.push(f.file);
      return !done;
    });
    if (pending.length === 0) continue;

    let conn: Awaited<ReturnType<typeof adminConnection>> | null = null;
    try {
      for (const f of pending) {
        if (opts.baseline) {
          if (!opts.dryRun) await recordMigration(tenant.tid, f.file, f.checksum, "BASELINED", app);
          report.baselined.push(f.file);
          continue;
        }
        if (f.primaryOnly && tenant.tid !== PRIMARY_TENANT_ID) {
          if (!opts.dryRun) await recordMigration(tenant.tid, f.file, f.checksum, "SKIPPED", app);
          report.skipped.push(f.file);
          log(`  t${tenant.tid} skip ${f.file} (primary-only)`);
          continue;
        }
        if (opts.dryRun) {
          report.applied.push(f.file);
          log(`  t${tenant.tid} would apply ${f.file}`);
          continue;
        }
        conn ??= await adminConnection(database);
        log(`  t${tenant.tid} apply ${f.file} -> ${database}`);
        try {
          await executeSqlScript(conn, f.sql);
        } catch (err: any) {
          report.error = { file: f.file, message: err?.message ?? String(err) };
          log(`  t${tenant.tid} FAILED ${f.file}: ${report.error.message}`);
          break; // later files may depend on this one; other tenants continue
        }
        await recordMigration(tenant.tid, f.file, f.checksum, "APPLIED", app);
        report.applied.push(f.file);
      }
    } finally {
      if (conn) await conn.end().catch(() => undefined);
    }
  }
  return reports;
}
