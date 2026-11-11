/**
 * Apply backend/migrations/*.sql to every tenant database (plan §2.4).
 *
 *   node dist/scripts/tenantMigrate.js [--dry-run] [--tid=2,3] [--file=127_system_scopes.sql] [--baseline]
 *
 * Files tagged `-- @tenant: primary-only` run on tenant 1 only. The ledger is
 * the control plane's TenantMigration table (run platformBootstrap first).
 * Exit code 1 when any tenant failed.
 */
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const arg = (name: string) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true";
};

async function main() {
  const { runTenantMigrations } = await import("../tenancy/migrations");
  const { closeControlPool } = await import("../db/platform");
  const { closePools } = await import("../db/pools");
  const reports = await runTenantMigrations({
    dryRun: !!arg("dry-run"),
    baseline: !!arg("baseline"),
    file: arg("file"),
    tids: arg("tid") ? arg("tid")!.split(",").map(Number) : undefined,
    log: (l) => console.log(l),
  });
  for (const r of reports) {
    console.log(
      `t${r.tid} ${r.slug} (${r.database}): applied ${r.applied.length}, skipped ${r.skipped.length}, baselined ${r.baselined.length}` +
        (r.changedChecksum.length ? `, CHANGED since recorded: ${r.changedChecksum.join(", ")}` : "") +
        (r.error ? `, FAILED at ${r.error.file}: ${r.error.message}` : ""),
    );
  }
  await closeControlPool();
  await closePools();
  if (reports.some((r) => r.error)) process.exit(1);
}

main().catch((err) => {
  console.error("tenant migration failed:", err?.message ?? err);
  process.exit(1);
});
