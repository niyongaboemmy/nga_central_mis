#!/usr/bin/env node
/**
 * Vendors the @nga/access core into a consumer:
 *
 *   node packages/access/sync.mjs <destination-dir>
 *
 * Writes <dir>/index.ts (the core, with a provenance header) and
 * <dir>/decision-table.json. Consumers run the decision table in their own
 * test suite, and MIS's suite fails if its own vendored copy drifts.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = process.argv[2];
if (!dest) {
  console.error("usage: node packages/access/sync.mjs <destination-dir>");
  process.exit(1);
}

const core = readFileSync(join(here, "src/index.ts"), "utf8");
const table = readFileSync(join(here, "test/decision-table.json"), "utf8");
const sha = createHash("sha256").update(core).digest("hex");
const header =
  `// VENDORED from nga_central_mis/packages/access/src/index.ts -- do not edit.\n` +
  `// Re-sync with: node nga_central_mis/packages/access/sync.mjs <this dir>\n` +
  `// sha256:${sha}\n`;

const out = resolve(dest);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.ts"), header + core);
writeFileSync(join(out, "decision-table.json"), table);
console.log(`@nga/access synced to ${out} (sha256 ${sha.slice(0, 12)})`);
