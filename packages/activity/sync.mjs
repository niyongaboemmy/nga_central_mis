#!/usr/bin/env node
/**
 * Vendors the nga-activity tracker (and optionally the relay) into a consumer:
 *
 *   node packages/activity/sync.mjs <client-dir>                 # browser SDK
 *   node packages/activity/sync.mjs --relay <server-dir>         # Node relay
 *   node packages/activity/sync.mjs --mis-catalog                # MIS catalog → MIS frontend
 *
 * Each file gets a provenance header with its sha256; the consumer's drift test
 * compares the header with the body so a hand edit is caught.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args[0] === "--mis-catalog") {
  // The backend copy is the source of truth (it is published to AnalyticsFeature on boot);
  // the frontend needs the same patterns to resolve routes. A frontend test checks equality.
  const src = join(here, "../../backend/src/services/activity/catalogs/mis.json");
  const dst = join(here, "../../frontend/src/activity/mis.catalog.json");
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, readFileSync(src, "utf8"));
  console.log(`MIS catalog copied to ${dst}`);
  process.exit(0);
}
const relay = args[0] === "--relay";
const dest = relay ? args[1] : args[0];
if (!dest) {
  console.error("usage: node packages/activity/sync.mjs [--relay] <destination-dir>");
  process.exit(1);
}
const files = relay ? ["relay.ts"] : ["index.ts", "react.ts"];
const out = resolve(dest);
mkdirSync(out, { recursive: true });
for (const f of files) {
  const body = readFileSync(join(here, "src", f), "utf8");
  const sha = createHash("sha256").update(body).digest("hex");
  const header =
    `// VENDORED from nga_central_mis/packages/activity/src/${f} -- do not edit.\n` +
    `// Re-sync with: node nga_central_mis/packages/activity/sync.mjs ${relay ? "--relay " : ""}<this dir>\n` +
    `// sha256:${sha}\n`;
  writeFileSync(join(out, f), header + body);
  console.log(`nga-activity ${f} synced to ${out} (sha256 ${sha.slice(0, 12)})`);
}
