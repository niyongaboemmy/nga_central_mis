import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardCalendarWidget from "../DashboardCalendarWidget";

const getMyCalendarMock = vi.fn(
  (_params: any): Promise<any> =>
    Promise.resolve({ slots: [], upcoming: [] }),
);
const getStudentCalendarMock = vi.fn(
  (_params: any): Promise<any> =>
    Promise.resolve({ slots: [], upcoming: [] }),
);
const getMyClassGroupsMock = vi.fn(
  (_params?: any): Promise<any[]> => Promise.resolve([]),
);
const academicTermsGetAllMock = vi.fn();

vi.mock("../../../api/calendar", () => ({
  getMyCalendar: (params: any) => getMyCalendarMock(params),
  getStudentCalendar: (params: any) => getStudentCalendarMock(params),
  getMyClassGroups: (params: any) => getMyClassGroupsMock(params),
  getLessonPlanForSlot: vi.fn(),
}));

// Regression guard: this widget used to independently call
// academicTermsApi.getAll() and pick `is_current` itself instead of reading
// the globally selected term — assert it never calls this again.
vi.mock("../../../api/academics", () => ({
  academicTermsApi: { getAll: (...args: any[]) => academicTermsGetAllMock(...args) },
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../../contexts/UserContext", () => ({
  useUser: () => ({ user: { roles: [] } }),
}));

let periodMock: any = {
  selectedTermId: 21,
  selectedTerm: { academic_term_id: 21, name: "Term A" },
  selectedYearId: 2025,
};
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => periodMock,
}));

describe("DashboardCalendarWidget — global academic period wiring", () => {
  beforeEach(() => {
    getMyCalendarMock.mockClear();
    getStudentCalendarMock.mockClear();
    getMyClassGroupsMock.mockClear();
    academicTermsGetAllMock.mockClear();
    periodMock = {
      selectedTermId: 21,
      selectedTerm: { academic_term_id: 21, name: "Term A" },
      selectedYearId: 2025,
    };
  });

  it("loads the schedule for the globally selected term without an independent term fetch", async () => {
    render(<DashboardCalendarWidget />);

    await waitFor(() =>
      expect(getMyCalendarMock).toHaveBeenCalledWith(
        expect.objectContaining({ academic_term_id: 21 }),
      ),
    );
    expect(academicTermsGetAllMock).not.toHaveBeenCalled();
  });

  it("reloads automatically when the globally selected term changes", async () => {
    const { rerender } = render(<DashboardCalendarWidget />);
    await waitFor(() => expect(getMyCalendarMock).toHaveBeenCalledTimes(1));

    periodMock = {
      selectedTermId: 12,
      selectedTerm: { academic_term_id: 12, name: "Term 2" },
      selectedYearId: 2025,
    };
    rerender(<DashboardCalendarWidget />);

    await waitFor(() =>
      expect(getMyCalendarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ academic_term_id: 12 }),
      ),
    );
  });
});

// "All Class Groups" used to render as a single group's calendar: the grid
// looked up one slot per (day, time) with .find, so a second group teaching at
// the same time was silently dropped.
describe("DashboardCalendarWidget — class group filter", () => {
  const lesson = (over: any) => ({
    slot_id: 1,
    academic_term_id: 21,
    subject_id: 9,
    user_id: 11,
    day_of_week: 1, // Monday
    start_time: "08:00",
    end_time: "08:50",
    subject_name: "Develop Web Applications Using Frameworks",
    class_group_name: "L3. Class A",
    class_group_id: 3,
    ...over,
  });

  beforeEach(() => {
    getMyCalendarMock.mockClear();
    getMyClassGroupsMock.mockClear();
    periodMock = {
      selectedTermId: 21,
      selectedTerm: { academic_term_id: 21, name: "Term A" },
      selectedYearId: 2025,
    };
  });

  it("shows every class group at once when none is selected", async () => {
    getMyClassGroupsMock.mockResolvedValueOnce([
      { class_group_id: 3, name: "L3. Class A" },
      { class_group_id: 4, name: "L4. Class A" },
    ]);
    getMyCalendarMock.mockResolvedValueOnce({
      slots: [
        lesson({}),
        lesson({
          slot_id: 2,
          class_group_id: 4,
          class_group_name: "L4. Class A",
          subject_name: "Web3 Applications",
        }),
      ],
      upcoming: [],
    });

    render(<DashboardCalendarWidget />);

    // both lessons claim Monday 08:00 — neither may be swallowed
    await screen.findAllByText("Develop Web Applications Using Frameworks");
    const grid = within(screen.getByRole("grid"));
    expect(grid.getByText("Web3 Applications")).toBeInTheDocument();
    expect(grid.getByText("L4. Class A")).toBeInTheDocument();
    // and the whole term is requested unfiltered
    expect(getMyCalendarMock).toHaveBeenCalledWith({ academic_term_id: 21 });
  });

  it("names the group in the dropdown when the teacher only has one", async () => {
    getMyClassGroupsMock.mockResolvedValueOnce([
      { class_group_id: 3, name: "L3. Class A", grade_name: "Level 3" },
    ]);
    getMyCalendarMock.mockResolvedValue({ slots: [lesson({})], upcoming: [] });

    render(<DashboardCalendarWidget />);

    const select = (await screen.findByLabelText(
      "Filter by class group",
    )) as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe("3"));
    expect(select).toHaveDisplayValue("L3. Class A (Level 3)");
    // with nothing to filter between, "All" is not offered
    expect(screen.queryByText("All Class Groups")).not.toBeInTheDocument();
  });

  it("keeps a group selectable after filtering down to it", async () => {
    // the assignment list is empty here; only the slots name the groups
    getMyClassGroupsMock.mockResolvedValue([]);
    getMyCalendarMock.mockResolvedValueOnce({
      slots: [
        lesson({}),
        lesson({
          slot_id: 2,
          day_of_week: 2,
          class_group_id: 4,
          class_group_name: "L4. Class A",
        }),
      ],
      upcoming: [],
    });

    render(<DashboardCalendarWidget />);
    const select = (await screen.findByLabelText(
      "Filter by class group",
    )) as HTMLSelectElement;

    getMyCalendarMock.mockResolvedValueOnce({
      slots: [lesson({})],
      upcoming: [],
    });
    await userEvent.selectOptions(select, "3");

    await waitFor(() =>
      expect(getMyCalendarMock).toHaveBeenLastCalledWith({
        academic_term_id: 21,
        class_group_id: 3,
      }),
    );
    // the other group is still on offer even though its slots are gone
    expect(
      within(select).getByRole("option", { name: "L4. Class A" }),
    ).toBeInTheDocument();
  });

  it("shows the full subject name and class group on hover", async () => {
    getMyClassGroupsMock.mockResolvedValue([
      { class_group_id: 3, name: "L3. Class A" },
      { class_group_id: 4, name: "L4. Class A" },
    ]);
    getMyCalendarMock.mockResolvedValue({ slots: [lesson({})], upcoming: [] });

    render(<DashboardCalendarWidget />);
    await screen.findAllByText("Develop Web Applications Using Frameworks");
    const card = within(screen.getByRole("grid")).getByText(
      "Develop Web Applications Using Frameworks",
    );

    await userEvent.hover(card);

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Develop Web Applications Using Frameworks");
    expect(tip).toHaveTextContent("L3. Class A");
    expect(tip).toHaveTextContent("08:00 - 08:50");
  });
});

// Hovering a lesson picks out every period of that subject across the week
// and fades the rest — and only that subject, never one that merely shares a
// row or a class group.
describe("DashboardCalendarWidget — subject hover highlight", () => {
  const lesson = (over: any) => ({
    slot_id: 1,
    academic_term_id: 21,
    subject_id: 9,
    user_id: 11,
    day_of_week: 1,
    start_time: "08:00",
    end_time: "08:50",
    subject_name: "Web Application Development",
    class_group_name: "L3. Class A",
    class_group_id: 3,
    ...over,
  });

  const week = [
    lesson({}), // Mon 08:00 — Web App Dev, L3
    lesson({ slot_id: 2, day_of_week: 3, start_time: "10:00", end_time: "10:50" }), // Wed — Web App Dev, L3
    lesson({
      slot_id: 3,
      day_of_week: 5,
      subject_id: 9,
      class_group_id: 4,
      class_group_name: "L4. Class A",
    }), // Fri — Web App Dev, L4 (same subject, other group)
    lesson({
      slot_id: 4,
      day_of_week: 2,
      subject_id: 12,
      subject_name: "Web3 Applications",
    }), // Tue — different subject, same group
    lesson({
      slot_id: 5,
      day_of_week: 4,
      subject_id: 13,
      subject_name: "Development of Web User Interfaces",
      class_group_id: 4,
      class_group_name: "L4. Class A",
    }), // Thu — different subject, other group
  ];

  const cards = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        "[role=grid] [data-subject-key]",
      ),
    );
  const byState = (state: string) =>
    cards()
      .filter((c) => c.dataset.highlight === state)
      .map((c) => c.dataset.subjectKey);

  beforeEach(() => {
    getMyCalendarMock.mockClear();
    getMyClassGroupsMock.mockResolvedValue([]);
    getMyCalendarMock.mockResolvedValue({ slots: week, upcoming: [] });
    periodMock = {
      selectedTermId: 21,
      selectedTerm: { academic_term_id: 21, name: "Term A" },
      selectedYearId: 2025,
    };
  });

  it("renders every card idle until something is hovered", async () => {
    render(<DashboardCalendarWidget />);
    await screen.findAllByText("Web Application Development");
    expect(cards()).toHaveLength(5);
    expect(byState("idle")).toHaveLength(5);
  });

  it("highlights every period of the hovered subject and dims the others", async () => {
    render(<DashboardCalendarWidget />);
    const [first] = await screen.findAllByText("Web Application Development");

    await userEvent.hover(first);

    // all three Web App Dev periods (both class groups) light up…
    expect(byState("match")).toEqual(["id:9", "id:9", "id:9"]);
    // …and nothing else does, even the subject sharing the same class group
    expect(byState("dimmed").sort()).toEqual(["id:12", "id:13"]);
    expect(byState("idle")).toHaveLength(0);

    // the legend chip for that subject is the only one pressed
    const legend = screen.getByRole("list", { name: /subjects on this/i });
    const pressed = within(legend)
      .getAllByRole("listitem")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("Web Application Development");
    expect(pressed[0]).toHaveTextContent("×3");
  });

  it("only ever highlights one subject — moving to another swaps the highlight", async () => {
    render(<DashboardCalendarWidget />);
    const [webApp] = await screen.findAllByText("Web Application Development");
    const web3 = within(screen.getByRole("grid")).getByText(
      "Web3 Applications",
    );

    await userEvent.hover(webApp);
    expect(byState("match")).toEqual(["id:9", "id:9", "id:9"]);

    await userEvent.unhover(webApp);
    await userEvent.hover(web3);
    expect(byState("match")).toEqual(["id:12"]);
    expect(byState("dimmed").sort()).toEqual(["id:13", "id:9", "id:9", "id:9"]);
  });

  it("clears the highlight when the pointer leaves", async () => {
    render(<DashboardCalendarWidget />);
    const [first] = await screen.findAllByText("Web Application Development");

    await userEvent.hover(first);
    expect(byState("match")).toHaveLength(3);

    await userEvent.unhover(first);
    expect(byState("idle")).toHaveLength(5);
    expect(byState("match")).toHaveLength(0);
  });

  it("highlights from the legend as well, so a subject can be found without a slot on screen", async () => {
    render(<DashboardCalendarWidget />);
    await screen.findAllByText("Web Application Development");
    const legend = screen.getByRole("list", { name: /subjects on this/i });
    const chip = within(legend).getByRole("listitem", {
      name: /Development of Web User Interfaces/,
    });

    await userEvent.hover(chip);
    expect(byState("match")).toEqual(["id:13"]);
    expect(byState("dimmed")).toHaveLength(4);

    await userEvent.unhover(chip);
    expect(byState("idle")).toHaveLength(5);
  });

  it("highlights on keyboard focus too", async () => {
    render(<DashboardCalendarWidget />);
    await screen.findAllByText("Web Application Development");

    // the Tuesday cell holds the lone Web3 lesson
    const cell = screen.getByRole("gridcell", { name: /Web3 Applications/ });
    act(() => cell.focus());
    expect(byState("match")).toEqual(["id:12"]);
    expect(byState("dimmed")).toHaveLength(4);

    act(() => cell.blur());
    expect(byState("idle")).toHaveLength(5);
  });
});
