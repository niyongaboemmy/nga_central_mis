import { describe, it, expect } from "vitest";
import {
  SCHEDULE_SLOTS,
  buildScheduleRows,
  findCurrentRowIndex,
  minutesToTime,
  timeToMinutes,
} from "../calendarConstants";
import { buildGridLayout, cellKey } from "../calendarLayout";

const rows = buildScheduleRows([]);

describe("the base timetable", () => {
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

describe("buildGridLayout", () => {
  const slot = { start_time: "08:00", end_time: "09:40" };

  it("renders one cell per coordinate a rowspan does not swallow", () => {
    const layout = buildGridLayout(rows, 7, (dayIdx, start) =>
      dayIdx === 0 && start === "08:00" ? slot : undefined,
    );

    const first = layout.cells.get(cellKey(1, 0));
    expect(first).toMatchObject({ rowSpan: 2, slot });
    // the 08:50 row on Monday is covered by that rowspan, so it renders nothing
    expect(layout.cells.has(cellKey(2, 0))).toBe(false);
    // but it still resolves to the covering cell, which is what arrow-key
    // navigation needs in order to land somewhere focusable
    expect(layout.ownerOf.get(cellKey(2, 0))).toBe(cellKey(1, 0));
    // other days are untouched
    expect(layout.cells.get(cellKey(2, 1))).toMatchObject({ rowSpan: 1 });
  });

  it("never looks for a course on a break or lunch row", () => {
    const seen: string[] = [];
    buildGridLayout(rows, 7, (_d, start) => {
      seen.push(start);
      return undefined;
    });
    expect(seen).not.toContain("07:30");
    expect(seen).not.toContain("11:40"); // lunch
  });
});
