/**
 * Access engine CLI. Lives under src/ so it is compiled into dist/ and runs on
 * the server without ts-node (devDependencies are pruned there):
 *
 *   node dist/access/cli.js bootstrap            # register manifest, presets, rules
 *   node dist/access/cli.js backfill             # dry run: report only
 *   node dist/access/cli.js backfill --apply     # write grants
 *   node dist/access/cli.js sync-rules           # converge rule-owned grants
 *
 * Locally: npx ts-node src/access/cli.ts <command> [--apply]
 */
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [command] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  const { ensureAccessRegistry, accessTablesPresent } = await import(
    "../services/access/registry"
  );
  if (!(await accessTablesPresent())) {
    throw new Error("migration 090_access_v2_model.sql has not been applied");
  }

  switch (command) {
    case "bootstrap": {
      await ensureAccessRegistry();
      console.log("Registry, presets and default rules are in place.");
      break;
    }
    case "backfill": {
      await ensureAccessRegistry();
      const { backfillLegacyGrants } = await import("../services/access/backfill");
      const report = await backfillLegacyGrants({ apply });
      console.log(JSON.stringify(report, null, 2));
      if (!apply) console.log("\nDry run. Re-run with --apply to write the grants.");
      break;
    }
    case "sync-rules": {
      const { syncRuleGrants } = await import("../services/access/ruleEngine");
      console.log(JSON.stringify(await syncRuleGrants(), null, 2));
      break;
    }
    default:
      console.error("usage: cli <bootstrap|backfill [--apply]|sync-rules>");
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(`[access] ${err?.message ?? err}`);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(), 100));
