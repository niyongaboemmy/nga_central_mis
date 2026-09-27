import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { MIS_MANIFEST } from "../access/manifest";
import { PRESETS, DEFAULT_RULES, mergePresetCaps } from "../access/presets";
import { Manifest, SCOPE_TYPES, validateManifest } from "../vendor/nga-access";

/**
 * Pure checks on the seeded presets (no database): every capability exists
 * with a supported depth, and every intended appointment chain is possible
 * under the delegation rule "you may only grant what you hold".
 */

const RANK: Record<string, number> = { summary: 1, detail: 2, sensitive: 3 };
const WORKSPACE = path.resolve(__dirname, "../../../..");
const SIBLINGS: Record<string, string> = {
  tm: "nga-task-mentor/server/src/access/manifest.ts",
  da: "nga-discipline-attendance/server/src/access/manifest.ts",
  tupo: "nga-communication-module/apps/api/src/access/manifest.ts",
};

async function loadManifests(): Promise<Record<string, Manifest>> {
  const out: Record<string, Manifest> = { mis: MIS_MANIFEST };
  for (const [app, rel] of Object.entries(SIBLINGS)) {
    const file = path.join(WORKSPACE, rel);
    if (!fs.existsSync(file)) continue; // e.g. CI with only this repo checked out
    const mod = await import(file);
    out[app] = (mod.default ?? Object.values(mod)[0]) as Manifest;
  }
  return out;
}

const split = (name: string) => (name.includes(":") ? name.split(":") : ["mis", name]);
const preset = (key: string) => PRESETS.find((p) => p.key === key)!;
const capMap = (key: string) =>
  new Map(
    preset(key).caps.map((c) => (Array.isArray(c) ? [c[0], RANK[c[1]]] : [c, RANK.detail])),
  );

describe("presets", () => {
  it("reference only real capabilities, at depths they support", async () => {
    const manifests = await loadManifests();
    for (const m of Object.values(manifests)) expect(validateManifest(m), m.app).toEqual([]);
    const problems: string[] = [];
    for (const p of PRESETS) {
      for (const c of p.caps) {
        const name = Array.isArray(c) ? c[0] : c;
        const [app, key] = split(name);
        const m = manifests[app];
        if (!m) continue; // sibling manifest not available here
        const def = m.capabilities[key];
        if (!def) {
          problems.push(`${p.key}: unknown ${name}`);
          continue;
        }
        if (Array.isArray(c)) {
          if (def.kind !== "READ") problems.push(`${p.key}: ${name} is WRITE but has a depth`);
          else if (!(def.depths ?? []).includes(c[1])) problems.push(`${p.key}: ${name} does not support ${c[1]}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("have unique keys, valid scope types and one entry per capability", () => {
    const keys = PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of PRESETS) {
      for (const s of p.scopes) expect(SCOPE_TYPES, p.key).toContain(s);
      const names = p.caps.map((c) => (Array.isArray(c) ? c[0] : c));
      expect(new Set(names).size, p.key).toBe(names.length);
    }
    for (const r of DEFAULT_RULES) expect(keys, r.key).toContain(r.preset);
  });

  it("merge duplicate capabilities keeping the deepest", () => {
    expect(mergePresetCaps([["X", "summary"], "X", ["Y", "sensitive"], ["Y", "detail"], "Z"])).toEqual([
      "X",
      ["Y", "sensitive"],
      "Z",
    ]);
    // The head teacher sees individual attendance records (discipline lead), not only summaries (insights).
    expect(capMap("head_teacher").get("da:ATTENDANCE_VIEW_ALL")).toBe(RANK.detail);
  });

  it("make every intended appointment chain possible (appointer holds all of the appointee, as deep)", () => {
    const chains: Array<[string, string]> = [
      ["head_teacher", "deputy_head_academics"],
      ["head_teacher", "director_of_studies"],
      ["head_teacher", "deputy_head_discipline"],
      ["head_teacher", "discipline_lead"],
      ["head_teacher", "head_of_department"],
      ["head_teacher", "grade_coordinator"],
      ["head_teacher", "academic_insights_viewer"],
      ["head_teacher", "counsellor"],
      ["head_teacher", "communications_officer"],
      ["deputy_head_academics", "director_of_studies"],
      ["deputy_head_academics", "head_of_department"],
      ["deputy_head_discipline", "discipline_lead"],
    ];
    const gaps: string[] = [];
    for (const [appointer, appointee] of chains) {
      const have = capMap(appointer);
      for (const [name, rank] of capMap(appointee)) {
        if ((have.get(name) ?? 0) < rank) gaps.push(`${appointer} -> ${appointee}: ${name}`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("keep content away from operations roles by default", () => {
    const content = ["VIEW_RESULTS", "VIEW_ATTENDANCE", "da:DISCIPLINE_VIEW_ALL", "da:ATTENDANCE_VIEW_ALL", "tm:COURSES_VIEW_GRADES", "tm:REPORT_CARDS_VIEW_ALL", "tupo:OVERSIGHT_VIEW_ALL"];
    for (const key of ["school_administrator", "platform_owner", "it_support", "bursar", "registrar"]) {
      const caps = capMap(key);
      for (const c of content) expect(caps.has(c), `${key} holds ${c}`).toBe(false);
    }
    // ...and the insights add-on only ever gives summaries.
    for (const [name, rank] of capMap("academic_insights_viewer")) {
      const [app] = split(name);
      if (rank > RANK.summary && app !== "mis") expect.fail(`${name} deeper than summary`);
    }
  });
});
