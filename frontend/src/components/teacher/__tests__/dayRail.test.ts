import { describe, it, expect } from "vitest";
import { readableInk, railEntries } from "../DayRail";

// Contrast ratios below are the WCAG 2.x figures for the returned ink against
// the given fill — the point of the helper is that it never ships a pairing a
// teacher can't read.
const contrast = (a: string, b: string) => {
  const lum = (hex: string) => {
    const v = hex.replace("#", "");
    const ch = (i: number) => {
      const c = parseInt(v.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("readableInk", () => {
  it("puts dark ink on a light subject colour", () => {
    // The tan/peach the timetable actually uses — white text on this was
    // unreadable, which is what sent me here.
    expect(readableInk("#E0A96D").ink).toBe("#0b1220");
    expect(readableInk("#fab219").ink).toBe("#0b1220");
    expect(readableInk("#84CC16").ink).toBe("#0b1220");
  });

  it("puts light ink on a dark subject colour", () => {
    expect(readableInk("#4a3aa7").ink).toBe("#ffffff");
    expect(readableInk("#d03b3b").ink).toBe("#ffffff");
  });

  it("clears 4.5:1 across the colour wheel", () => {
    const wheel = [
      "#E0A96D",
      "#84CC16",
      "#A855F7",
      "#3B82F6",
      "#10B981",
      "#fab219",
      "#d03b3b",
      "#0ca30c",
      "#ffffff",
      "#000000",
    ];
    for (const fill of wheel) {
      expect(contrast(readableInk(fill).ink, fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("accepts three-digit hex and falls back safely on junk", () => {
    expect(readableInk("#fff").ink).toBe("#0b1220");
    expect(readableInk("not-a-colour").ink).toBe("#ffffff");
  });
});

describe("railEntries", () => {
  const lesson = (over: Partial<any> = {}) => ({
    slot_id: 1,
    subject_id: 10,
    subject_name: "Maths",
    subject_code: "M",
    class_group_name: "L4. A",
    start_time: "10:00:00",
    end_time: "10:50:00",
    location: "room 1",
    color: "#3B82F6",
    ...over,
  });

  it("merges lessons and activities onto one time-ordered track", () => {
    const entries = railEntries(
      [
        lesson(),
        lesson({ slot_id: 2, start_time: "08:00:00", end_time: "08:50:00" }),
      ],
      [
        {
          activity_id: 7,
          activity_name: "Staff briefing",
          activity_type: "MEETING",
          start_time: "09:00:00",
          end_time: "09:30:00",
          location: "Hall",
          color: null,
        } as any,
      ],
    );
    expect(entries.map((e) => e.start)).toEqual([480, 540, 600]);
    expect(entries[1].kind).toBe("activity");
    // An activity with no colour of its own still gets a readable fill.
    expect(entries[1].color).toBe("#10B981");
  });
});
