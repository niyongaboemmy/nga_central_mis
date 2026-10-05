import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Every dropdown goes through SelectField so all of them look like the inputs
// around them and share search and keyboard behaviour. A raw <select> in a
// component brings back the small OS-drawn control.
const SRC = path.resolve(__dirname, "../../..");
const ALLOWED = new Set([path.join(SRC, "components/ui/SelectField.tsx")]);

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "node_modules" ? [] : walk(p);
    return /\.tsx$/.test(e.name) ? [p] : [];
  });

describe("dropdowns", () => {
  it("use SelectField, never a raw <select>", () => {
    const offenders = walk(SRC)
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => /<select[\s>]/.test(fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
