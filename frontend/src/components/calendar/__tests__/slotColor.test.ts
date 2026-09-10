import { describe, it, expect } from "vitest";
import {
  getSlotColor,
  readableTextColor,
  slotSurface,
  SUBJECT_PALETTE,
  luminance,
} from "../slotColor";

describe("getSlotColor", () => {
  it("uses the subject's own stored colour verbatim — matching the admin swatch", () => {
    expect(
      getSlotColor({ color: "#FF0000", subject_id: 1, subject_name: "Maths" }),
    ).toBe("#FF0000");
  });

  it("keeps the seed-default blue when that is what the subject is set to", () => {
    expect(
      getSlotColor({
        color: "#3B82F6",
        subject_id: 5,
        subject_name: "Physics",
      }),
    ).toBe("#3B82F6");
  });

  it("falls back to a palette colour only when no colour is stored", () => {
    const c = getSlotColor({ subject_id: 9, subject_name: "Chemistry" });
    expect(SUBJECT_PALETTE).toContain(c);
    expect(getSlotColor({ color: "  ", subject_id: 9 })).toBe(c);
    expect(getSlotColor({ color: "not-a-hex", subject_id: 9 })).toBe(c);
  });

  it("is stable: same subject id → same colour", () => {
    const a = getSlotColor({ subject_id: 42, subject_name: "Biology" });
    const b = getSlotColor({ subject_id: 42, subject_name: "Biology renamed" });
    expect(a).toBe(b);
  });

  it("spreads uncoloured subjects across different colours", () => {
    const colors = new Set(
      Array.from({ length: 8 }, (_, i) =>
        getSlotColor({ subject_id: i + 1, subject_name: `S${i}` }),
      ),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("slotSurface", () => {
  it("gives two different subject colours two distinct backgrounds (both themes)", () => {
    for (const isDark of [false, true]) {
      const a = slotSurface("#06bc12", isDark); // green
      const b = slotSurface("#3B82F6", isDark); // blue
      expect(a.background).not.toBe(b.background);
      expect(a.text).not.toBe(b.text);
    }
  });

  it("produces opaque backgrounds so the slot does not depend on the page behind it", () => {
    expect(slotSurface("#06bc12", true).background.startsWith("rgb(")).toBe(true);
    expect(slotSurface("#06bc12", false).background.startsWith("rgb(")).toBe(
      true,
    );
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
