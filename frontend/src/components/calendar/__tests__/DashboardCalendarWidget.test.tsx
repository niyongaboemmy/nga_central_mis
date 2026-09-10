import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    await screen.findByText("Develop Web Applications Using Frameworks");
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
    const card = await screen.findByText(
      "Develop Web Applications Using Frameworks",
    );

    await userEvent.hover(card);

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Develop Web Applications Using Frameworks");
    expect(tip).toHaveTextContent("L3. Class A");
    expect(tip).toHaveTextContent("08:00 - 08:50");
  });
});
