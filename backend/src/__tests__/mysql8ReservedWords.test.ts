import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * SYSTEM is a reserved word since MySQL 8.0.3. Production runs 8.4, the local
 * test server 5.7 -- which accepts `FROM System` bare, so only this scan
 * catches it (2026-11-11: an unquoted raw query made every Basic-auth service
 * call fail in production).
 */
const ROOT = join(__dirname, "..");

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "__tests__" || name === "vendor" || name === "node_modules") continue;
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (name.endsWith(".ts")) yield path;
  }
}

describe("raw SQL and MySQL 8 reserved words", () => {
  it("never names the System table unquoted", () => {
    const bare = /\b(FROM|JOIN|UPDATE|INTO|TABLE)\s+System\b(?!`)/;
    const offenders: string[] = [];
    for (const file of sources(ROOT)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (bare.test(line)) offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
