#!/usr/bin/env node
/**
 * Vendors the @nga/tenancy core into a consumer:
 *
 *   node packages/tenancy/sync.mjs <destination-dir>
 *
 * Writes <dir>/index.ts with a provenance header. Consumers keep a test that
 * recomputes the sha256 of the body so a hand-edited copy fails CI.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = process.argv[2];
if (!dest) {
  console.error("usage: node packages/tenancy/sync.mjs <destination-dir>");
  process.exit(1);
}

const core = readFileSync(join(here, "src/index.ts"), "utf8");
const sha = createHash("sha256").update(core).digest("hex");
const header =
  `// VENDORED from nga_central_mis/packages/tenancy/src/index.ts -- do not edit.\n` +
  `// Re-sync with: node nga_central_mis/packages/tenancy/sync.mjs <this dir>\n` +
  `// sha256:${sha}\n`;

const out = resolve(dest);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.ts"), header + core);
console.log(`@nga/tenancy synced to ${out} (sha256 ${sha.slice(0, 12)})`);
