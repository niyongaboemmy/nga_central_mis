import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vendored nga-webrun", () => {
  const vendored = fs.readFileSync(path.resolve(__dirname, "../../../vendor/nga-webrun/index.ts"), "utf8");
  const [, , shaLine, ...rest] = vendored.split("\n");
  const body = rest.join("\n");

  it("matches its provenance hash (no hand edits)", () => {
    expect(shaLine).toBe(`// sha256:${crypto.createHash("sha256").update(body).digest("hex")}`);
  });

  it("is the package's current source (re-sync after editing packages/webrun)", () => {
    expect(body).toBe(fs.readFileSync(path.resolve(__dirname, "../../../../../packages/webrun/src/index.ts"), "utf8"));
  });
});
