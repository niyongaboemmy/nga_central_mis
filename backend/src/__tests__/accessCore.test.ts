import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import {
  AccessSnapshot,
  decide,
  depthSatisfies,
  groupByAllowed,
  parseNode,
  scopeFor,
  suppressSmallCohorts,
  validateManifest,
  Manifest,
} from "../vendor/nga-access";

/**
 * The shared @nga/access decision table (packages/access/test) -- every app
 * runs the same cases against its vendored copy of the core.
 */
const PKG = path.resolve(__dirname, "../../../packages/access");
const VENDOR = path.resolve(__dirname, "../vendor/nga-access");
const table = JSON.parse(
  fs.readFileSync(path.join(PKG, "test/decision-table.json"), "utf8"),
);
const snapshot = table.snapshot as AccessSnapshot;

describe("@nga/access vendored copy", () => {
  it("is byte-identical to packages/access (re-run packages/access/sync.mjs)", () => {
    const core = fs.readFileSync(path.join(PKG, "src/index.ts"), "utf8");
    const vendored = fs.readFileSync(path.join(VENDOR, "index.ts"), "utf8");
    const sha = createHash("sha256").update(core).digest("hex");
    expect(vendored).toContain(`sha256:${sha}`);
    expect(vendored.endsWith(core)).toBe(true);
    expect(fs.readFileSync(path.join(VENDOR, "decision-table.json"), "utf8")).toBe(
      fs.readFileSync(path.join(PKG, "test/decision-table.json"), "utf8"),
    );
  });
});

describe("@nga/access decision table", () => {
  for (const c of table.cases) {
    it(c.name, () => {
      const d = decide(snapshot, c.cap, c.target, c.minDepth ?? null);
      expect(d.allowed).toBe(c.allowed);
      if ("depth" in c) expect(d.depth).toEqual(c.depth);
      if ("via" in c) expect(d.via).toEqual(c.via);
    });
  }

  for (const c of table.scopeFor) {
    it(`scopeFor: ${c.name}`, () => {
      expect(scopeFor(snapshot, c.cap, c.minDepth ?? null)).toEqual(c.expect);
    });
  }

  it("fails closed on a missing snapshot", () => {
    expect(decide(null, "DISCIPLINE_VIEW", {}).allowed).toBe(false);
    expect(scopeFor(undefined, "DISCIPLINE_VIEW")).toBeNull();
  });
});

describe("@nga/access helpers", () => {
  it("orders depths", () => {
    expect(depthSatisfies("sensitive", "detail")).toBe(true);
    expect(depthSatisfies("summary", "detail")).toBe(false);
    expect(depthSatisfies(null, "summary")).toBe(false);
    expect(depthSatisfies(null, null)).toBe(true);
  });

  it("keeps summary groupings at or above class level", () => {
    expect(groupByAllowed("summary", "CLASS_GROUP")).toBe(true);
    expect(groupByAllowed("summary", "STUDENT")).toBe(false);
    expect(groupByAllowed("detail", "student")).toBe(true);
    expect(groupByAllowed(null, "SCHOOL")).toBe(false);
  });

  it("suppresses small cohorts", () => {
    const rows = suppressSmallCohorts(
      [
        { key: "a", n: 12, value: 71.5 },
        { key: "b", n: 3, value: 40 },
      ],
      5,
    );
    expect(rows[0]).toMatchObject({ value: 71.5, suppressed: false });
    expect(rows[1]).toMatchObject({ value: null, suppressed: true });
  });

  it("parses nodes", () => {
    expect(parseNode("SCHOOL")).toEqual({ type: "SCHOOL", target: {} });
    expect(parseNode("program:2")).toEqual({ type: "PROGRAM", target: { programId: 2 } });
    expect(parseNode("SUBJECT_CLASS:31/12")).toEqual({
      type: "SUBJECT_CLASS",
      target: { subjectId: 31, classGroupId: 12 },
    });
    expect(parseNode("GRADE:x")).toBeNull();
    expect(parseNode("SUBJECT_CLASS:31")).toBeNull();
    expect(parseNode("NOPE:1")).toBeNull();
  });

  it("validates manifests", () => {
    const good: Manifest = {
      app: "da",
      name: "Discipline",
      capabilities: {
        DISCIPLINE_VIEW: {
          label: "View discipline",
          domain: "DISCIPLINE",
          kind: "READ",
          depths: ["summary", "detail", "sensitive"],
          restricted: ["sensitive"],
        },
        DISCIPLINE_LOG: { label: "Log", domain: "DISCIPLINE", kind: "WRITE" },
      },
      insights: {
        "discipline.incidents": {
          label: "Incidents",
          capability: "DISCIPLINE_VIEW",
          minDepth: "summary",
          levels: ["SCHOOL", "PROGRAM"],
        },
      },
      aliases: { DISCIPLINE_VIEW_ALL: "DISCIPLINE_VIEW" },
    };
    expect(validateManifest(good)).toEqual([]);

    const bad: any = {
      app: "DA!",
      name: "",
      capabilities: {
        lower: { label: "x", domain: "NOPE", kind: "READ" },
        W: { label: "w", domain: "SYSTEM", kind: "WRITE", depths: ["detail"] },
      },
      insights: { i: { label: "i", capability: "W", minDepth: "summary", levels: ["MOON"] } },
      aliases: { W: "missing" },
    };
    const errors = validateManifest(bad);
    expect(errors.length).toBeGreaterThanOrEqual(8);
  });
});
