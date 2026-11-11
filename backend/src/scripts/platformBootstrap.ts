/**
 * Create / upgrade the control plane and seed tenant 1 (idempotent).
 *
 *   node dist/scripts/platformBootstrap.js          (production, after `npm run build`)
 *   npx ts-node src/scripts/platformBootstrap.ts    (local)
 *
 * Env: DB_* (a user with CREATE on PLATFORM_DB_NAME), PLATFORM_DB_NAME
 * (default amashuri_platform), DB_NAME = tenant 1's database.
 */
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const { bootstrapPlatform } = await import("../tenancy/bootstrap");
  const { closeControlPool } = await import("../db/platform");
  const { closePools } = await import("../db/pools");
  const report = await bootstrapPlatform((l) => console.log(l));
  console.log(JSON.stringify(report, null, 2));
  await closeControlPool();
  await closePools();
}

main().catch((err) => {
  console.error("platform bootstrap failed:", err?.message ?? err);
  process.exit(1);
});
