import { describe, it, expect } from "vitest";
import {
  SCHEDULE_SLOTS,
  buildScheduleRows,
  countScheduleSlots,
  findCurrentRowIndex,
  minutesToTime,
  timeToMinutes,
} from "../calendarConstants";
import { buildGridLayout, cellKey } from "../calendarLayout";

const rows = buildScheduleRows([]);

describe("the base timetable", () => {
  // Mirrors the institution's published daily bell schedule; a drift between
  // the two puts lessons on rows the school does not actually ring for.
  it("matches the published bell schedule", () => {
    expect(
      SCHEDULE_SLOTS.filter((s) => s.type === "course").map(
        (s) => `${s.label} ${s.start}-${s.end}`,
      ),
    ).toEqual([
      "P1 08:00-08:50",
      "P2 08:50-09:40",
      "P3 10:00-10:50",
      "P4 10:50-11:40",
      "P5 11:40-12:30",
      "P6 13:30-14:20",
      "P7 14:20-15:10",
      "P8 15:30-16:20",
    ]);
    expect(
      SCHEDULE_SLOTS.filter((s) => s.type !== "course").map(
        (s) => `${s.label} ${s.start}-${s.end}`,
      ),
    ).toEqual([
      "Devotion 07:30-08:00",
      "Short Break 09:40-10:00",
      "Lunch Break 12:30-13:30",
      "Short Break 15:10-15:30",
      "Office Hours 16:20-17:20",
    ]);
  });

  it("opens with a 07:30-08:00 break and starts teaching at 08:00", () => {
    expect(SCHEDULE_SLOTS[0]).toMatchObject({
      start: "07:30",
      end: "08:00",
      type: "break",
    });
    const firstCourse = SCHEDULE_SLOTS.find((s) => s.type === "course");
    expect(firstCourse?.start).toBe("08:00");
  });

  it("leaves no gap or overlap between consecutive rows", () => {
    for (let i = 1; i < SCHEDULE_SLOTS.length; i++) {
      expect(SCHEDULE_SLOTS[i].start).toBe(SCHEDULE_SLOTS[i - 1].end);
    }
  });
});

describe("findCurrentRowIndex", () => {
  it("treats a row as half-open so a boundary minute belongs to the next row", () => {
    const idx = findCurrentRowIndex(rows, timeToMinutes("08:50"));
    expect(rows[idx]).toMatchObject({ start: "08:50" });
  });

  it("returns -1 outside the school day", () => {
    expect(findCurrentRowIndex(rows, timeToMinutes("06:00"))).toBe(-1);
    expect(findCurrentRowIndex(rows, timeToMinutes("21:00"))).toBe(-1);
  });
});

describe("minutesToTime", () => {
  it("round-trips a time string", () => {
    expect(minutesToTime(timeToMinutes("13:05"))).toBe("13:05");
  });
});

describe("a lesson recorded across a band", () => {
  it("stops its rowspan at the band rather than covering it", () => {
    // 11:40-14:20 would overlap P5, lunch and P6; lunch is drawn as one
    // week-wide band, so the lesson must stop at it.
    const idx = rows.findIndex((r) => r.start === "11:40");
    expect(countScheduleSlots("11:40", "14:20", rows, idx)).toBe(1);
  });
});

describe("buildGridLayout", () => {
  const slot = { start_time: "08:00", end_time: "09:40" };

  it("renders one cell per coordinate a rowspan does not swallow", () => {
    const layout = buildGridLayout(rows, 7, (dayIdx, start) =>
      dayIdx === 0 && start === "08:00" ? [slot] : [],
    );

    const first = layout.cells.get(cellKey(1, 0));
    expect(first).toMatchObject({ rowSpan: 2, slots: [slot] });
    // the 08:50 row on Monday is covered by that rowspan, so it renders nothing
    expect(layout.cells.has(cellKey(2, 0))).toBe(false);
    // but it still resolves to the covering cell, which is what arrow-key
    // navigation needs in order to land somewhere focusable
    expect(layout.ownerOf.get(cellKey(2, 0))).toBe(cellKey(1, 0));
    // other days are untouched
    expect(layout.cells.get(cellKey(2, 1))).toMatchObject({ rowSpan: 1 });
  });

  it("keeps every lesson that starts on the same row, not just the first", () => {
    const a = { start_time: "08:00", end_time: "08:50", id: "a" };
    const b = { start_time: "08:00", end_time: "09:40", id: "b" };
    const layout = buildGridLayout(rows, 7, (dayIdx, start) =>
      dayIdx === 0 && start === "08:00" ? [a, b] : [],
    );

    const cell = layout.cells.get(cellKey(1, 0));
    expect(cell?.slots).toEqual([a, b]);
    // the taller of the two decides the cell height
    expect(cell?.rowSpan).toBe(2);
  });

  it("never looks for a course on a break or lunch row", () => {
    const seen: string[] = [];
    buildGridLayout(rows, 7, (_d, start) => {
      seen.push(start);
      return [];
    });
    expect(seen).not.toContain("07:30");
    expect(seen).not.toContain("12:30"); // lunch
    expect(seen).not.toContain("16:20"); // office hours
  });
});
