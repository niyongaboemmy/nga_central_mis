import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarSlotModal from "../CalendarSlotModal";
import CalendarGrid from "../CalendarGrid";
import type { CalendarActivity } from "../../../api/calendar";

const searchUsersMock = vi.fn((_q: string): Promise<any[]> => Promise.resolve([]));
vi.mock("../../../api/users", () => ({
  searchUsers: (q: string) => searchUsersMock(q),
}));

const activity = (over: Partial<CalendarActivity> = {}): CalendarActivity => ({
  activity_id: 42,
  academic_term_id: 3,
  class_group_id: 5,
  activity_name: "Physical Education",
  activity_type: "Sports",
  day_of_week: 4,
  start_time: "15:30",
  end_time: "16:20",
  color: "#F59E0B",
  is_recurring: 1,
  ...over,
});

const baseProps = {
  showModal: true,
  selectedSlot: null,
  formData: {
    class_group_id: "5",
    subject_id: "",
    user_id: "",
    day_of_week: "3",
    start_time: "15:30",
    end_time: "16:20",
    location: "",
  },
  formErrors: {},
  effectiveClassGroupId: 5,
  setupData: null,
  onClose: () => {},
  onSubmit: () => {},
  onFormDataChange: () => {},
  onErrorsChange: () => {},
  onDelete: () => {},
  canEdit: true,
  canViewLessonPlan: false,
  onEditClick: () => {},
  onViewLessonPlan: () => {},
};

const emptyForm = {
  activity_name: "Physical Education",
  activity_type: "Sports",
  day_of_week: "3",
  start_time: "15:30",
  end_time: "16:20",
  location: "",
  description: "",
  color: "#F59E0B",
  assignees: [],
};

describe("activity 'Assigned to' picker", () => {
  beforeEach(() => searchUsersMock.mockReset());

  // The picker is controlled through onActivityFormChange like every other
  // activity field, so the harness threads form state back in.
  const Harness: React.FC<{ initial?: any[]; onChange?: (v: any) => void }> = ({
    initial = [],
    onChange,
  }) => {
    const [form, setForm] = React.useState({ ...emptyForm, assignees: initial });
    return (
      <CalendarSlotModal
        {...baseProps}
        mode="form"
        canManageActivities
        entryKind="activity"
        activityForm={form}
        activityErrors={{}}
        onEntryKindChange={() => {}}
        onActivityFormChange={(patch) => {
          setForm((f) => ({ ...f, ...patch }));
          onChange?.(patch);
        }}
        onActivityErrorsChange={() => {}}
        onActivitySubmit={(e) => e.preventDefault()}
      />
    );
  };

  it("is optional: renders empty with a hint and no chips", () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Assign staff" });
    expect(input).toHaveAttribute("placeholder", "Optional — search staff by name");
    expect(screen.queryAllByTestId("assignee-chip")).toHaveLength(0);
    expect(screen.getByText(/optional — shows on their teaching schedule/i)).toBeInTheDocument();
  });

  it("searches as you type and adds the chosen staff member as a chip", async () => {
    searchUsersMock.mockResolvedValue([
      { user_id: 7, username: "jdoe", email: "j@x.rw", status: "ACTIVE", first_name: "Jane", last_name: "Doe", user_type: "TEACHER" },
      { user_id: 8, username: "jsmith", email: "s@x.rw", status: "ACTIVE", first_name: "John", last_name: "Smith", user_type: "TEACHER" },
    ]);
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const input = screen.getByRole("combobox", { name: "Assign staff" });
    await userEvent.type(input, "j");
    // one character is not enough to hit the server
    expect(searchUsersMock).not.toHaveBeenCalled();
    await userEvent.type(input, "a");
    await waitFor(() => expect(searchUsersMock).toHaveBeenCalledWith("ja"));

    const listbox = await screen.findByRole("listbox");
    await within(listbox).findByRole("option", { name: /Jane Doe/ });
    const options = within(listbox).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Jane Doe"),
      expect.stringContaining("John Smith"),
    ]);

    await userEvent.click(within(listbox).getByRole("option", { name: /Jane Doe/ }));

    expect(onChange).toHaveBeenLastCalledWith({
      assignees: [{ user_id: 7, first_name: "Jane", last_name: "Doe" }],
    });
    const chips = screen.getAllByTestId("assignee-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("Jane Doe");
    // the input clears and the list closes, ready for another
    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "Add another…");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("hides already-chosen staff from the suggestions and supports keyboard pick", async () => {
    searchUsersMock.mockResolvedValue([
      { user_id: 7, username: "jdoe", email: "j@x.rw", status: "ACTIVE", first_name: "Jane", last_name: "Doe" },
      { user_id: 8, username: "jsmith", email: "s@x.rw", status: "ACTIVE", first_name: "John", last_name: "Smith" },
    ]);
    render(<Harness initial={[{ user_id: 7, first_name: "Jane", last_name: "Doe" }]} />);

    const input = screen.getByRole("combobox", { name: "Assign staff" });
    await userEvent.type(input, "jo");
    const listbox = await screen.findByRole("listbox");
    await within(listbox).findByRole("option", { name: /John Smith/ });
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);

    await userEvent.keyboard("{Enter}");
    const chips = screen.getAllByTestId("assignee-chip");
    expect(chips.map((c) => c.textContent)).toEqual([
      expect.stringContaining("Jane Doe"),
      expect.stringContaining("John Smith"),
    ]);
  });

  it("removes a chip with its × button or Backspace on an empty input", async () => {
    const onChange = vi.fn();
    render(
      <Harness
        initial={[
          { user_id: 7, first_name: "Jane", last_name: "Doe" },
          { user_id: 8, first_name: "John", last_name: "Smith" },
        ]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove Jane Doe" }));
    expect(onChange).toHaveBeenLastCalledWith({
      assignees: [{ user_id: 8, first_name: "John", last_name: "Smith" }],
    });
    expect(screen.getAllByTestId("assignee-chip")).toHaveLength(1);

    await userEvent.click(screen.getByRole("combobox", { name: "Assign staff" }));
    await userEvent.keyboard("{Backspace}");
    expect(onChange).toHaveBeenLastCalledWith({ assignees: [] });
    expect(screen.queryAllByTestId("assignee-chip")).toHaveLength(0);
  });

  it("drops a stale search result that arrives after a newer query", async () => {
    let resolveFirst: (v: any[]) => void = () => {};
    searchUsersMock
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([
        { user_id: 9, username: "al", email: "a@x.rw", status: "ACTIVE", first_name: "Alice", last_name: "Long" },
      ]);
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Assign staff" });

    await userEvent.type(input, "ja");
    await waitFor(() => expect(searchUsersMock).toHaveBeenCalledTimes(1));
    await userEvent.clear(input);
    await userEvent.type(input, "al");
    await waitFor(() => expect(searchUsersMock).toHaveBeenCalledTimes(2));
    await screen.findByRole("option", { name: /Alice Long/ });

    // the first (slower) response now lands — it must not replace Alice
    resolveFirst([
      { user_id: 7, username: "jdoe", email: "j@x.rw", status: "ACTIVE", first_name: "Jane", last_name: "Doe" },
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("option", { name: /Jane Doe/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Alice Long/ })).toBeInTheDocument();
  });
});

describe("activity details view", () => {
  it("lists who the activity is assigned to", () => {
    render(
      <CalendarSlotModal
        {...baseProps}
        mode="details"
        canManageActivities={false}
        selectedActivity={activity({
          assignees: [
            { user_id: 7, first_name: "Jane", last_name: "Doe" },
            { user_id: 8, first_name: "John", last_name: "Smith" },
          ],
        })}
      />,
    );
    const list = screen.getByRole("list", { name: "Assigned staff" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Jane Doe",
      "John Smith",
    ]);
    // read-only for a teacher on their dashboard
    expect(screen.queryByRole("button", { name: /Edit Activity/ })).not.toBeInTheDocument();
  });

  it("says so when nobody is assigned", () => {
    render(
      <CalendarSlotModal
        {...baseProps}
        mode="details"
        canManageActivities
        selectedActivity={activity({ assignees: [] })}
      />,
    );
    expect(screen.getByText("Not assigned to anyone")).toBeInTheDocument();
  });
});

describe("activity hover tooltip", () => {
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date("2026-09-07T00:00:00");
    d.setDate(d.getDate() + i);
    return d;
  });
  const renderGrid = (a: CalendarActivity) =>
    render(
      <CalendarGrid
        calendarId={7}
        classGroupName="L3. Class A"
        slots={[]}
        activities={[a]}
        weekDates={weekDates}
        onSlotClick={vi.fn()}
        onEmptyCellClick={vi.fn()}
      />,
    );

  it("names the assigned staff on hover", async () => {
    renderGrid(
      activity({
        assignees: [
          { user_id: 7, first_name: "Niyongabo", last_name: "Emmanuel" },
          { user_id: 8, first_name: "Jane", last_name: "Doe" },
        ],
      }),
    );
    await userEvent.hover(within(screen.getByRole("grid")).getByText("Physical Education"));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Assigned to");
    expect(tip).toHaveTextContent("Niyongabo Emmanuel, Jane Doe");
    expect(tip).toHaveTextContent("15:30 - 16:20");
  });

  it("says when no one is assigned yet", async () => {
    renderGrid(activity({ assignees: [] }));
    await userEvent.hover(within(screen.getByRole("grid")).getByText("Physical Education"));
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(/Assigned to\s*no one yet/);
  });
});
