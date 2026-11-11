/**
 * Create and/or provision a tenant's MIS database (idempotent).
 *
 *   node dist/scripts/tenantProvision.js --tid=2
 *   node dist/scripts/tenantProvision.js --create --slug=gs-kicukiro --name="GS Kicukiro" [--status=ACTIVE] [--pkg=starter] [--tid=2]
 *   npx ts-node src/scripts/tenantProvision.ts ...   (local)
 *
 * Runs the control-plane bootstrap first (no-op when current).
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
  const { bootstrapPlatform } = await import("../tenancy/bootstrap");
  const { createTenantRow, provisionMisTenant } = await import("../tenancy/provision");
  const { getTenantBySlug, invalidateTenants } = await import("../tenancy/registry");
  const { closeControlPool } = await import("../db/platform");
  const { closePools } = await import("../db/pools");

  await bootstrapPlatform((l) => console.log(l));
  let tid = arg("tid") ? Number(arg("tid")) : undefined;
  if (arg("create")) {
    const slug = arg("slug");
    const name = arg("name");
    if (!slug || !name) throw new Error("--create needs --slug and --name");
    invalidateTenants();
    const existing = await getTenantBySlug(slug);
    tid = existing
      ? existing.tid
      : await createTenantRow({ slug, name, tid, status: (arg("status") as any) ?? "PENDING", pkg: arg("pkg") });
    console.log(existing ? `tenant ${tid} (${slug}) already exists` : `tenant ${tid} (${slug}) created`);
  }
  if (!tid) throw new Error("usage: --tid=<n> or --create --slug=<slug> --name=<name>");
  const result = await provisionMisTenant(tid);
  console.log(JSON.stringify(result, null, 2));
  await closeControlPool();
  await closePools();
}

main().catch((err) => {
  console.error("tenant provisioning failed:", err?.message ?? err);
  process.exit(1);
});
