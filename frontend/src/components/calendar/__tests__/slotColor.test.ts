import { describe, it, expect } from "vitest";
import {
  getSlotColor,
  readableTextColor,
  SUBJECT_PALETTE,
  luminance,
} from "../slotColor";

describe("getSlotColor", () => {
  it("honours an explicitly chosen (non-default) subject colour", () => {
    expect(
      getSlotColor({ color: "#FF0000", subject_id: 1, subject_name: "Maths" }),
    ).toBe("#FF0000");
  });

  it("falls back to a palette colour when the subject is on the seed default", () => {
    const c = getSlotColor({
      color: "#3B82F6",
      subject_id: 5,
      subject_name: "Physics",
    });
    expect(SUBJECT_PALETTE).toContain(c);
  });

  it("falls back when no colour is set at all", () => {
    const c = getSlotColor({ subject_id: 9, subject_name: "Chemistry" });
    expect(SUBJECT_PALETTE).toContain(c);
  });

  it("is stable: same subject id → same colour", () => {
    const a = getSlotColor({ subject_id: 42, subject_name: "Biology" });
    const b = getSlotColor({ subject_id: 42, subject_name: "Biology renamed" });
    expect(a).toBe(b);
  });

  it("spreads different subjects across different colours", () => {
    const colors = new Set(
      Array.from({ length: 8 }, (_, i) =>
        getSlotColor({ subject_id: i + 1, subject_name: `S${i}` }),
      ),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("readableTextColor", () => {
  it("picks dark text on a light background", () => {
    expect(readableTextColor("#FDE047")).toBe("#1f2937");
  });
  it("picks white text on a dark background", () => {
    expect(readableTextColor("#1E3A8A")).toBe("#ffffff");
  });
  it("luminance of white is ~1 and black is 0", () => {
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 1);
    expect(luminance("#000000")).toBe(0);
  });
});
