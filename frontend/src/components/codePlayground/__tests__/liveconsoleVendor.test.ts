import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vendored nga-liveconsole", () => {
  for (const file of ["index.ts", "useLiveRun.ts", "LiveConsole.tsx"]) {
    const vendored = fs.readFileSync(path.resolve(__dirname, `../../../vendor/nga-liveconsole/${file}`), "utf8");
    const [, , shaLine, ...rest] = vendored.split("\n");
    const body = rest.join("\n");

    it(`${file} matches its provenance hash (no hand edits)`, () => {
      expect(shaLine).toBe(`// sha256:${crypto.createHash("sha256").update(body).digest("hex")}`);
    });

    it(`${file} is the package's current source (re-sync after editing packages/liveconsole)`, () => {
      expect(body).toBe(fs.readFileSync(path.resolve(__dirname, `../../../../../packages/liveconsole/src/${file}`), "utf8"));
    });
  }
});
