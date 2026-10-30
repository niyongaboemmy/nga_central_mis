#!/usr/bin/env node
/**
 * Vendors nga-webrun into a consumer:
 *
 *   node packages/webrun/sync.mjs <destination-dir>
 *
 * The file gets a provenance header with its sha256; the consumer's drift test
 * compares the header with the body so a hand edit is caught.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = process.argv[2];
if (!dest) {
  console.error("usage: node packages/webrun/sync.mjs <destination-dir>");
  process.exit(1);
}
const out = resolve(dest);
mkdirSync(out, { recursive: true });
const body = readFileSync(join(here, "src", "index.ts"), "utf8");
const sha = createHash("sha256").update(body).digest("hex");
const header =
  `// VENDORED from nga_central_mis/packages/webrun/src/index.ts -- do not edit.\n` +
  `// Re-sync with: node nga_central_mis/packages/webrun/sync.mjs <this dir>\n` +
  `// sha256:${sha}\n`;
writeFileSync(join(out, "index.ts"), header + body);
console.log(`nga-webrun synced to ${out} (sha256 ${sha.slice(0, 12)})`);
