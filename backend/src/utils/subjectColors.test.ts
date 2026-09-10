import { describe, it, expect } from "vitest";
import {
  assignUniqueSubjectColors,
  nextSubjectColor,
  hslToHex,
  hexToHue,
  DEFAULT_SUBJECT_COLOR,
} from "./subjectColors";

const HEX = /^#[0-9a-f]{6}$/;

describe("hslToHex / hexToHue", () => {
  it("round-trips a hue within a degree", () => {
    for (const h of [0, 40, 137, 210, 300, 359]) {
      const hex = hslToHex(h, 0.6, 0.5);
      expect(hex).toMatch(HEX);
      expect(Math.abs((hexToHue(hex) ?? -1) - h)).toBeLessThan(2);
    }
  });

  it("returns null for unparseable input", () => {
    expect(hexToHue(undefined)).toBeNull();
    expect(hexToHue("blue")).toBeNull();
    expect(hexToHue("#12")).toBeNull();
  });
});

describe("assignUniqueSubjectColors", () => {
  const subjects = (n: number, color: string | null = DEFAULT_SUBJECT_COLOR) =>
    Array.from({ length: n }, (_, i) => ({ subject_id: i + 1, color }));

  it("gives every default-coloured subject a distinct colour", () => {
    const out = assignUniqueSubjectColors(subjects(12));
    expect(out).toHaveLength(12);
    const colors = out.map((a) => a.color);
    expect(new Set(colors).size).toBe(12);
    colors.forEach((c) => expect(c).toMatch(HEX));
  });

  it("keeps every colour distinct even at a large count", () => {
    const out = assignUniqueSubjectColors(subjects(120));
    expect(out).toHaveLength(120);
    expect(new Set(out.map((a) => a.color)).size).toBe(120);
  });

  it("is deterministic and stable as subjects are appended", () => {
    const first = assignUniqueSubjectColors(subjects(5));
    const grown = assignUniqueSubjectColors(subjects(8));
    // the first five keep the exact colours they already had
    for (const a of first) {
      const g = grown.find((x) => x.subject_id === a.subject_id)!;
      expect(g.color).toBe(a.color);
    }
  });

  it("preserves a hand-picked colour and routes generated ones around it", () => {
    const mixed = [
      { subject_id: 1, color: DEFAULT_SUBJECT_COLOR },
      { subject_id: 2, color: "#ff0000" }, // hand-picked red (hue 0)
      { subject_id: 3, color: DEFAULT_SUBJECT_COLOR },
    ];
    const out = assignUniqueSubjectColors(mixed);
    expect(out.find((a) => a.subject_id === 2)).toBeUndefined(); // untouched
    for (const a of out) {
      expect(Math.min(hexToHue(a.color)!, 360 - hexToHue(a.color)!)).toBeGreaterThan(
        10,
      ); // clears the reserved red hue
    }
  });

  it("force reassigns hand-picked colours too", () => {
    const out = assignUniqueSubjectColors(
      [{ subject_id: 1, color: "#ff0000" }],
      { force: true },
    );
    expect(out).toHaveLength(1);
    expect(out[0].color).not.toBe("#ff0000");
  });

  it("does not report a subject whose colour is unchanged", () => {
    const stable = assignUniqueSubjectColors(subjects(3));
    const rerun = assignUniqueSubjectColors(
      stable.map((a) => ({ subject_id: a.subject_id, color: a.color })),
    );
    expect(rerun).toHaveLength(0);
  });
});

describe("nextSubjectColor", () => {
  it("returns a hex clear of every colour already in use", () => {
    const taken = ["#ff0000", "#00ff00", "#0000ff"];
    const next = nextSubjectColor(taken);
    expect(next).toMatch(HEX);
    const hue = hexToHue(next)!;
    for (const t of taken) {
      const d = Math.abs(hue - hexToHue(t)!);
      expect(Math.min(d, 360 - d)).toBeGreaterThan(10);
    }
  });
});
