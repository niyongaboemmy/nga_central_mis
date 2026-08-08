import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import DashboardCalendarWidget from "../DashboardCalendarWidget";

const getMyCalendarMock = vi.fn((_params: any) =>
  Promise.resolve({ slots: [], upcoming: [] }),
);
const getStudentCalendarMock = vi.fn((_params: any) =>
  Promise.resolve({ slots: [], upcoming: [] }),
);
const getMyClassGroupsMock = vi.fn((_params?: any) => Promise.resolve([]));
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
