#!/usr/bin/env node
/**
 * Vendors nga-liveconsole (the live run console) into a React app:
 *
 *   node packages/liveconsole/sync.mjs <destination-dir>
 *
 * Copies index.ts (core), useLiveRun.ts (React state) and LiveConsole.tsx (the
 * console). Each file gets a provenance header with its sha256; the consumer's
 * drift test compares the header with the body so a hand edit is caught.
 * Needs react and lucide-react; colours are Tailwind classes (LiveConsole's `theme`).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FILES = ["index.ts", "useLiveRun.ts", "LiveConsole.tsx"];

const here = dirname(fileURLToPath(import.meta.url));
const dest = process.argv[2];
if (!dest) {
  console.error("usage: node packages/liveconsole/sync.mjs <destination-dir>");
  process.exit(1);
}
const out = resolve(dest);
mkdirSync(out, { recursive: true });
for (const f of FILES) {
  const body = readFileSync(join(here, "src", f), "utf8");
  const sha = createHash("sha256").update(body).digest("hex");
  const header =
    `// VENDORED from nga_central_mis/packages/liveconsole/src/${f} -- do not edit.\n` +
    `// Re-sync with: node nga_central_mis/packages/liveconsole/sync.mjs <this dir>\n` +
    `// sha256:${sha}\n`;
  writeFileSync(join(out, f), header + body);
  console.log(`nga-liveconsole ${f} synced to ${out} (sha256 ${sha.slice(0, 12)})`);
}
