import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AcademicCalendar from "../AcademicCalendar";
import { ConfirmProvider } from "../../contexts/ConfirmContext";

const deferred = <T,>() => {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const api = {
  getMyCalendar: vi.fn(),
  getStudentCalendar: vi.fn(),
  getMyClassGroups: vi.fn(),
  getCalendarActivities: vi.fn(),
  getNotificationSettings: vi.fn(),
  checkUpcomingLessons: vi.fn(),
};
vi.mock("../../api/calendar", () => ({
  getMyCalendar: (...a: any[]) => api.getMyCalendar(...a),
  getStudentCalendar: (...a: any[]) => api.getStudentCalendar(...a),
  getMyClassGroups: (...a: any[]) => api.getMyClassGroups(...a),
  getCalendarActivities: (...a: any[]) => api.getCalendarActivities(...a),
  getNotificationSettings: (...a: any[]) => api.getNotificationSettings(...a),
  checkUpcomingLessons: (...a: any[]) => api.checkUpcomingLessons(...a),
  getCalendarSlots: vi.fn(),
  getCalendarSetupData: vi.fn(),
  getAcademicCalendars: vi.fn(),
  getCalendarClassGroups: vi.fn(),
  createCalendarSlot: vi.fn(),
  updateCalendarSlot: vi.fn(),
  deleteCalendarSlot: vi.fn(),
  createCalendarActivity: vi.fn(),
  updateCalendarActivity: vi.fn(),
  deleteCalendarActivity: vi.fn(),
  updateNotificationSettings: vi.fn(),
  getLessonPlanForSlot: vi.fn(),
  createAcademicCalendar: vi.fn(),
  updateAcademicCalendar: vi.fn(),
  deleteAcademicCalendar: vi.fn(),
  getAcademicCalendar: vi.fn(),
}));
vi.mock("../../utils/timetablePdfExport", () => ({ exportTimetablePdf: vi.fn() }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../hooks/useScopedGrades", () => ({
  useScopedGrades: () => ({ isScoped: false, defaultClassGroupId: null }),
}));
vi.mock("../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({
    years: [{ academic_year_id: 2025, name: "2026 - 2027" }],
    terms: [{ academic_term_id: 21, name: "Term 1", academic_year_id: 2025 }],
    selectedYearId: 2025,
    selectedTermId: 21,
  }),
}));
let userMock: any;
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: userMock }),
}));

const lesson = (over: any = {}) => ({
  slot_id: 1,
  academic_term_id: 21,
  subject_id: 9,
  user_id: 11,
  day_of_week: 1,
  start_time: "08:00",
  end_time: "08:50",
  subject_name: "Embedded Systems Software",
  class_group_name: "L3. Class A",
  class_group_id: 3,
  ...over,
});

describe("AcademicCalendar — loading skeleton on class-group switch", () => {
  beforeEach(() => {
    Object.values(api).forEach((m) => m.mockReset());
    api.getNotificationSettings.mockResolvedValue([]);
    api.checkUpcomingLessons.mockResolvedValue([]);
    api.getCalendarActivities.mockResolvedValue([]);
    userMock = {
      roles: [{ permissions: [{ name: "VIEW_MY_CALENDAR" }] }],
    };
  });

  it("keeps the header and selectors in place and shows a placeholder grid while the new level loads", async () => {
    api.getMyClassGroups.mockResolvedValue([
      { class_group_id: 3, name: "L3. Class A" },
      { class_group_id: 4, name: "L4. Class A" },
    ]);
    render(<ConfirmProvider><AcademicCalendar title="Class Calendar" /></ConfirmProvider>);

    // first load: nothing to frame yet, so a full-width skeleton
    expect(screen.getByTestId("calendar-grid-skeleton")).toBeInTheDocument();

    const select = await screen.findByDisplayValue("Select a class group");
    expect(screen.queryByTestId("calendar-grid-skeleton")).not.toBeInTheDocument();

    // pick L3 → schedule arrives
    api.getMyCalendar.mockResolvedValueOnce({ slots: [lesson()], upcoming: [] });
    await userEvent.selectOptions(select, "3");
    const grid = await screen.findByRole("grid");
    expect(within(grid).getByText("Embedded Systems Software")).toBeInTheDocument();

    // switch to L4 → the request hangs: header + select stay, grid → skeleton
    const pending = deferred<any>();
    api.getMyCalendar.mockReturnValueOnce(pending.promise);
    await userEvent.selectOptions(select, "4");

    const skeleton = await screen.findByTestId("calendar-grid-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    expect(screen.getByText("Class Calendar")).toBeInTheDocument();
    expect(screen.getByDisplayValue("L4. Class A")).toBe(select);

    pending.resolve({
      slots: [lesson({ subject_name: "Web3 Applications", class_group_id: 4, class_group_name: "L4. Class A" })],
      upcoming: [],
    });
    const newGrid = await screen.findByRole("grid");
    expect(within(newGrid).getByText("Web3 Applications")).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-grid-skeleton")).not.toBeInTheDocument();
  });
});

describe("AcademicCalendar — student class schedule", () => {
  beforeEach(() => {
    Object.values(api).forEach((m) => m.mockReset());
    userMock = {
      roles: [{ permissions: [{ name: "VIEW_STUDENT_CALENDAR" }] }],
    };
  });

  it("draws the class group's events that arrive with the student calendar", async () => {
    api.getStudentCalendar.mockResolvedValue({
      slots: [lesson()],
      activities: [
        {
          activity_id: 7,
          academic_term_id: 21,
          class_group_id: 3,
          class_group_name: "L3. Class A",
          activity_name: "Supervised Self Study",
          activity_type: "Study Hall",
          day_of_week: 3,
          start_time: "10:00",
          end_time: "10:50",
          color: "#64748B",
          is_recurring: 1,
          assignees: [],
        },
      ],
      upcoming: [],
    });

    render(<ConfirmProvider><AcademicCalendar /></ConfirmProvider>);
    const grid = await screen.findByRole("grid");
    expect(within(grid).getByText("Embedded Systems Software")).toBeInTheDocument();
    const cell = within(grid).getByRole("gridcell", { name: /Wednesday.*Supervised Self Study/ });
    expect(within(cell).getByText("Event")).toBeInTheDocument();
    // students never fetch the admin activities endpoint
    expect(api.getCalendarActivities).not.toHaveBeenCalled();
  });
});
