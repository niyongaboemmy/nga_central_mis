import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarGrid from "../CalendarGrid";
import {
  buildScheduleRows,
  countScheduleSlots,
  SCHEDULE_SLOTS,
} from "../calendarConstants";
import type { CalendarSlot } from "../../../api/calendar";

// The grid draws a slot only on the row whose start time matches it exactly.
// SCHEDULE_SLOTS is one institution's timetable, so any period outside it
// (a school running 08:15-09:05) matched no row and vanished from the grid
// entirely -- while the server still counted it as occupying that time, so
// re-adding it answered "a slot already exists at this time for this
// calendar" against a cell that rendered empty.
describe("calendar grid rows follow the data", () => {
  const slot = (over: Partial<CalendarSlot>): CalendarSlot =>
    ({
      slot_id: 1,
      calendar_id: 7,
      academic_term_id: 3,
      class_group_id: 5,
      subject_id: 9,
      user_id: 11,
      day_of_week: 1, // Monday
      start_time: "08:00",
      end_time: "09:40",
      subject_name: "Applied Physics I",
      class_group_name: "L4. Class A",
      ...over,
    }) as CalendarSlot;

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-09-07T00:00:00");
    d.setDate(d.getDate() + i);
    return d;
  });

  it("adds a row for a start time the standard timetable does not cover", () => {
    const rows = buildScheduleRows([
      { start_time: "08:15", end_time: "09:05" },
      { start_time: "13:05", end_time: "13:55" },
    ]);

    const starts = rows.map((r) => r.start);
    expect(starts).toContain("08:15");
    expect(starts).toContain("13:05");
    // the standard timetable is kept, not replaced
    expect(starts).toContain("08:00");
    expect(rows.length).toBe(SCHEDULE_SLOTS.length + 2);
    // and stays in chronological order
    expect(starts).toEqual([...starts].sort());
  });

  it("does not duplicate a start time the timetable already has", () => {
    const rows = buildScheduleRows([
      { start_time: "08:00", end_time: "08:50" },
      { start_time: "08:00", end_time: "08:50" },
    ]);
    expect(rows.length).toBe(SCHEDULE_SLOTS.length);
  });

  it("counts a span from the course's own row forward, not every overlap", () => {
    const rows = buildScheduleRows([{ start_time: "08:00", end_time: "09:40" }]);
    const idx = rows.findIndex((r) => r.start === "08:00");

    // 08:00-09:40 covers its own row plus 08:50-09:40; the 07:30-08:00 row
    // sits earlier and must not inflate the rowspan.
    expect(countScheduleSlots("08:00", "09:40", rows, idx)).toBe(2);
  });

  it("renders a slot whose time is outside the standard timetable", () => {
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[slot({}), slot({ slot_id: 2, start_time: "13:05", end_time: "13:55", subject_name: "Applied Math I" })]}
        activities={[]}
        weekDates={weekDates}
        onSlotClick={() => {}}
        onEmptyCellClick={() => {}}
      />,
    );

    expect(screen.getByText("Applied Physics I")).toBeInTheDocument();
    expect(screen.getByText("Applied Math I")).toBeInTheDocument();
    expect(screen.getByText("08:00 - 09:40")).toBeInTheDocument();
  });

  it("still renders slots that do sit on the standard timetable", () => {
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[slot({ start_time: "13:30", end_time: "14:20", subject_name: "Computer Basics" })]}
        activities={[]}
        weekDates={weekDates}
        onSlotClick={() => {}}
        onEmptyCellClick={() => {}}
      />,
    );

    expect(screen.getByText("Computer Basics")).toBeInTheDocument();
  });
});

// Arrow keys move a single roving tab stop rather than tabbing through every
// cell, and a course spanning two rows is one stop, not two.
describe("keyboard navigation", () => {
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-09-07T00:00:00");
    d.setDate(d.getDate() + i);
    return d;
  });

  const renderGrid = () =>
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[
          {
            slot_id: 1,
            calendar_id: 7,
            academic_term_id: 3,
            class_group_id: 5,
            subject_id: 9,
            user_id: 11,
            day_of_week: 1,
            start_time: "08:00",
            end_time: "09:40",
            subject_name: "Applied Physics I",
          } as CalendarSlot,
        ]}
        activities={[]}
        weekDates={weekDates}
        onSlotClick={() => {}}
        onEmptyCellClick={() => {}}
        canEdit
      />,
    );

  it("exposes exactly one cell in the tab order", () => {
    renderGrid();
    const stops = screen
      .getAllByRole("gridcell")
      .filter((c) => c.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
  });

  it("steps over a rowspan when moving down", async () => {
    const user = userEvent.setup();
    renderGrid();

    const monday08 = screen
      .getByText("Applied Physics I")
      .closest("td") as HTMLElement;
    monday08.focus();
    await user.keyboard("{ArrowDown}");

    // 08:00-09:40 covers the 08:50 row too, so ArrowDown lands on 09:40's
    // successor row (10:00), not back inside the same lesson.
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      expect.stringContaining("Monday P3 10:00"),
    );
  });

  it("activates a lesson with Enter", async () => {
    const user = userEvent.setup();
    const onSlotClick = vi.fn();
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[
          {
            slot_id: 1,
            calendar_id: 7,
            academic_term_id: 3,
            subject_id: 9,
            user_id: 11,
            day_of_week: 1,
            start_time: "08:00",
            end_time: "09:40",
            subject_name: "Applied Physics I",
          } as CalendarSlot,
        ]}
        activities={[]}
        weekDates={weekDates}
        onSlotClick={onSlotClick}
        onEmptyCellClick={() => {}}
      />,
    );

    (screen.getByText("Applied Physics I").closest("td") as HTMLElement).focus();
    await user.keyboard("{Enter}");
    expect(onSlotClick).toHaveBeenCalledTimes(1);
  });
});
