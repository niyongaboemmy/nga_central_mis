import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OfficeHoursBandCells from "../OfficeHoursBandCells";
import CalendarGrid from "../../calendar/CalendarGrid";
import type { BandEntry } from "../../../api/officeHours";

const entry = (over: Partial<BandEntry> = {}): BandEntry => ({
  day_of_week: 1,
  schedule_id: 9,
  title: "Maths support",
  start_time: "16:20",
  end_time: "17:20",
  location: "B4",
  color: "#2563eb",
  role: "hosting",
  teacher_name: null,
  count: 12,
  ...over,
});

const inTable = (ui: React.ReactElement) =>
  render(
    <table>
      <tbody>
        <tr>{ui}</tr>
      </tbody>
    </table>,
  );

describe("office-hours band cells", () => {
  it("renders the classic week-wide band when the viewer has no office hours", () => {
    const { container } = inTable(<OfficeHoursBandCells label="Office Hours" entries={[]} dayCount={5} />);
    const cells = container.querySelectorAll("td");
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveAttribute("colspan", "5");
    expect(cells[0]).toHaveTextContent("Office Hours");
  });

  it("draws one cell per weekday and places each entry on its day", () => {
    inTable(
      <OfficeHoursBandCells
        label="Office Hours"
        dayCount={5}
        entries={[entry(), entry({ day_of_week: 3, title: "Physics catch-up", count: 1 })]}
      />,
    );
    expect(within(screen.getByTestId("office-band-day-1")).getByText("Maths support")).toBeInTheDocument();
    expect(within(screen.getByTestId("office-band-day-1")).getByText("12 students · B4")).toBeInTheDocument();
    expect(within(screen.getByTestId("office-band-day-3")).getByText("1 student · B4")).toBeInTheDocument();
    expect(within(screen.getByTestId("office-band-day-2")).queryByRole("button")).toBeNull();
  });

  it("shows a student who they meet and lets teachers add office hours on a free day", async () => {
    const onAdd = vi.fn();
    const onEntryClick = vi.fn();
    inTable(
      <OfficeHoursBandCells
        label="Office Hours"
        dayCount={5}
        entries={[entry({ role: "attending", teacher_name: "Ms Uwase", day_of_week: 2 })]}
        onAdd={onAdd}
        onEntryClick={onEntryClick}
      />,
    );
    expect(screen.getByText("Ms Uwase · B4")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Maths support/ }));
    expect(onEntryClick).toHaveBeenCalledWith(expect.objectContaining({ day_of_week: 2 }));
    await userEvent.click(screen.getByRole("button", { name: "Add office hours on Thursday" }));
    expect(onAdd).toHaveBeenCalledWith(4);
  });

  it("summarises a class group without naming students", () => {
    inTable(
      <OfficeHoursBandCells
        label="Office Hours"
        dayCount={5}
        entries={[entry({ role: "summary", schedule_id: null, title: "7 students in office hours", teacher_name: "Ms A, Mr B", count: 7 })]}
      />,
    );
    expect(screen.getByText("7 students in office hours")).toBeInTheDocument();
    expect(screen.getByText("Ms A, Mr B")).toBeInTheDocument();
  });
});

describe("CalendarGrid with office hours", () => {
  const weekDates = Array.from({ length: 5 }, (_, i) => new Date(2026, 2, 2 + i));

  it("keeps lessons out of the band but shows the viewer's office hours in it", () => {
    render(
      <CalendarGrid
        classGroupName="S4 MPC"
        slots={[]}
        activities={[]}
        weekDates={weekDates}
        onSlotClick={() => {}}
        onEmptyCellClick={() => {}}
        officeHours={[entry({ day_of_week: 5, title: "Chemistry clinic" })]}
      />,
    );
    expect(within(screen.getByTestId("office-band-day-5")).getByText("Chemistry clinic")).toBeInTheDocument();
    // Breaks and lunch are still week-wide bands.
    expect(screen.getByText("Lunch Break").closest("td")).toHaveAttribute("colspan", "5");
  });

  it("renders the office band unchanged when no entries are passed", () => {
    render(
      <CalendarGrid
        classGroupName="S4 MPC"
        slots={[]}
        activities={[]}
        weekDates={weekDates}
        onSlotClick={() => {}}
        onEmptyCellClick={() => {}}
      />,
    );
    expect(screen.getByText("Office Hours").closest("td")).toHaveAttribute("colspan", "5");
    expect(screen.queryByTestId("office-band-day-1")).toBeNull();
  });
});
