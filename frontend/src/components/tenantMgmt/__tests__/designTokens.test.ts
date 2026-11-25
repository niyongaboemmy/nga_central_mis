import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// TENANT_MANAGEMENT_UI_CONSISTENCY_PLAN.md Phase 6: tenant screens keep the MIS look.
// One blue (blue-*, not the e-learning brand-* tokens), gray neutrals, dark borders with
// alpha (a solid gray-700 outline draws a bright line on the black canvas), no shadows,
// no accent strips. Fix the class, don't widen the rule: see design/surfaces.ts.
const SRC = path.resolve(__dirname, "../../..");

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });

const RULES: Array<[string, RegExp]> = [
  ["brand-* accent (use blue-*)", /\b(?:bg|text|border|ring|from|to|via|stroke|fill|divide|outline)-brand-\d/],
  ["slate neutral (use gray)", /-slate-\d/],
  ["off-palette hue", /-(?:violet|indigo|purple|fuchsia|sky|cyan)-\d/],
  ["dark border without alpha (add /30 or /40)", /dark:(?:hover:|focus:|focus-within:|group-hover:)?border-gray-(?:600|700|800)(?![\/\d])/],
  ["dark divider without alpha", /dark:divide-gray-\d+(?![\/\d])/],
  ["shadow (borders give depth)", /(?<![\w:-])shadow(?:-(?:sm|md|lg|xl|2xl|inner|soft|float|glow))?(?=[\s"'`])/],
  ["accent strip on a card edge", /\bborder-[lt]-(?:2|4|8)\b/],
];

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

const scan = (files: string[], rules: Array<[string, RegExp]>) =>
  files.flatMap((f) =>
    strip(fs.readFileSync(f, "utf8"))
      .split("\n")
      .flatMap((line, i) => rules.filter(([, re]) => re.test(line)).map(([why]) => `${path.relative(SRC, f)}:${i + 1} ${why}`)),
  );

describe("tenant management design tokens", () => {
  it("tenantMgmt and the shared person picker follow the MIS surface rules", () => {
    const files = [...walk(path.join(SRC, "components/tenantMgmt")), ...walk(path.join(SRC, "components/people"))];
    expect(files.length).toBeGreaterThan(20);
    expect(scan(files, RULES)).toEqual([]);
  });

  it("Create user has no navy (slate) dark surfaces", () => {
    const files = [path.join(SRC, "components/CreateUserModal.tsx")];
    expect(scan(files, [["dark slate surface", /dark:(?:hover:)?(?:bg|border)-slate-\d/]])).toEqual([]);
  });
});
