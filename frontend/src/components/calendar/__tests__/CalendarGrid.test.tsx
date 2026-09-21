import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

    const grid = within(screen.getByRole("grid"));
    expect(grid.getByText("Applied Physics I")).toBeInTheDocument();
    expect(grid.getByText("Applied Math I")).toBeInTheDocument();
    expect(grid.getByText("08:00 - 09:40")).toBeInTheDocument();
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

    expect(
      within(screen.getByRole("grid")).getByText("Computer Basics"),
    ).toBeInTheDocument();
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

    const monday08 = within(screen.getByRole("grid"))
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

    (
      within(screen.getByRole("grid"))
        .getByText("Applied Physics I")
        .closest("td") as HTMLElement
    ).focus();
    await user.keyboard("{Enter}");
    expect(onSlotClick).toHaveBeenCalledTimes(1);
  });
});

// Hovering a lesson on the class calendar picks out every period of that
// subject across the week and fades the rest. Custom activities (events)
// group by name, never with a lesson — they carry subject_id 0, which must
// not make every event look like one subject.
describe("calendar grid subject hover highlight", () => {
  const slot = (over: Partial<CalendarSlot>): CalendarSlot =>
    ({
      slot_id: 1,
      calendar_id: 7,
      academic_term_id: 3,
      class_group_id: 5,
      subject_id: 9,
      user_id: 11,
      day_of_week: 1,
      start_time: "08:00",
      end_time: "08:50",
      subject_name: "Applied Math I",
      class_group_name: "L3. Class A",
      ...over,
    }) as CalendarSlot;

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-09-07T00:00:00");
    d.setDate(d.getDate() + i);
    return d;
  });

  const activity = (over: any) => ({
    activity_id: 1,
    academic_term_id: 3,
    class_group_id: 5,
    activity_name: "Supervised Self Study",
    activity_type: "Study",
    day_of_week: 1,
    start_time: "11:40",
    end_time: "12:30",
    color: "#64748B",
    ...over,
  });

  const slots = [
    slot({}), // Mon — Applied Math I
    slot({ slot_id: 2, day_of_week: 3, start_time: "13:30", end_time: "15:10" }), // Wed — Applied Math I
    slot({ slot_id: 3, day_of_week: 2, subject_id: 10, subject_name: "Computer Basics" }), // Tue
    slot({ slot_id: 4, day_of_week: 4, subject_id: 11, subject_name: "Applied Physics I" }), // Thu
  ];
  const activities = [
    activity({}),
    activity({ activity_id: 2, day_of_week: 5, activity_name: "supervised self-study" }),
    activity({ activity_id: 3, day_of_week: 5, start_time: "10:00", end_time: "10:50", activity_name: "Student Led clubs" }),
  ];

  const cards = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>("[role=grid] [data-subject-key]"),
    );
  const byState = (state: string) =>
    cards()
      .filter((c) => c.dataset.highlight === state)
      .map((c) => c.dataset.subjectKey)
      .sort();

  const renderGrid = () =>
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L3. Class A"
        slots={slots}
        activities={activities as any}
        weekDates={weekDates}
        onSlotClick={vi.fn()}
        onEmptyCellClick={vi.fn()}
        canEdit
      />,
    );

  it("starts with every card idle", () => {
    renderGrid();
    expect(cards()).toHaveLength(7);
    expect(byState("idle")).toHaveLength(7);
  });

  it("highlights only the hovered subject's periods and marks everything else as other", async () => {
    renderGrid();
    const grid = within(screen.getByRole("grid"));
    const [math] = grid.getAllByText("Applied Math I");

    await userEvent.hover(math);
    expect(byState("match")).toEqual(["id:9", "id:9"]);
    expect(byState("other")).toHaveLength(5);
    // the near-namesake "Applied Physics I" is not swept in
    expect(byState("other")).toContain("id:11");

    await userEvent.unhover(math);
    expect(byState("idle")).toHaveLength(7);
  });

  it("groups events by name rather than treating every event as one subject", async () => {
    renderGrid();
    const grid = within(screen.getByRole("grid"));
    const study = grid.getByText("Supervised Self Study");

    await userEvent.hover(study);
    // the differently-cased Friday copy lights up with it; the club does not
    expect(byState("match")).toEqual([
      "activity:supervised self study",
    ]);
    expect(byState("other")).toContain("activity:student led clubs");
    expect(byState("other")).toHaveLength(6);
  });

  it("highlights from the legend, which shows a period count per subject", async () => {
    renderGrid();
    const legend = screen.getByRole("list", { name: /subjects on this/i });
    const chip = within(legend).getByRole("listitem", { name: /Applied Math I/ });
    expect(chip).toHaveTextContent("×2");
    // events are not subjects and stay out of the legend
    expect(within(legend).queryByText(/Self Study/i)).not.toBeInTheDocument();

    await userEvent.hover(chip);
    expect(byState("match")).toEqual(["id:9", "id:9"]);
    expect(chip).toHaveAttribute("aria-pressed", "true");

    await userEvent.unhover(chip);
    expect(byState("idle")).toHaveLength(7);
  });
});

// The hovered subject gets a focus ring; every other card keeps its normal
// look — no dimming, no fading — so the rest of the week stays readable.
describe("subject highlight leaves other cards untouched", () => {
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-09-07T00:00:00");
    d.setDate(d.getDate() + i);
    return d;
  });
  const slot = (over: Partial<CalendarSlot>): CalendarSlot =>
    ({
      slot_id: 1, calendar_id: 7, academic_term_id: 3, class_group_id: 5,
      subject_id: 9, user_id: 11, day_of_week: 1, start_time: "08:00",
      end_time: "08:50", subject_name: "Advanced Database",
      class_group_name: "L4. Class A", color: "#16A34A", ...over,
    }) as CalendarSlot;

  it("rings the match and changes nothing on the rest", async () => {
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L4. Class A"
        slots={[slot({}), slot({ slot_id: 2, day_of_week: 2, subject_id: 10, subject_name: "Advanced Java", color: "#DB2777" })]}
        activities={[]}
        weekDates={weekDates}
        onSlotClick={vi.fn()}
        onEmptyCellClick={vi.fn()}
      />,
    );
    const grid = within(screen.getByRole("grid"));
    const db = grid.getByText("Advanced Database").closest("[data-subject-key]") as HTMLElement;
    const java = grid.getByText("Advanced Java").closest("[data-subject-key]") as HTMLElement;
    const before = { bg: java.style.getPropertyValue("--slot-bg"), shadow: java.style.boxShadow, cls: java.className };

    await userEvent.hover(db);

    // the match wears the accent focus ring (5px ring in the subject colour)
    expect(db.dataset.highlight).toBe("match");
    expect(db.style.boxShadow).toContain("0 0 0 5px #16A34A");
    // the other card is byte-for-byte as it was: same fill, no shadow, no opacity class
    expect(java.dataset.highlight).toBe("other");
    expect(java.style.getPropertyValue("--slot-bg")).toBe(before.bg);
    expect(java.style.boxShadow).toBe(before.shadow);
    expect(java.className).toBe(before.cls);
    expect(java.className).not.toMatch(/opacity|saturate/);
  });
});
