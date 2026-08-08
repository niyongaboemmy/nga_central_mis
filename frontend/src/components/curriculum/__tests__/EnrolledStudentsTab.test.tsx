import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import EnrolledStudentsTab from "../EnrolledStudentsTab";

const academicYearsGetAllMock = vi.fn();
const getEnrolledStudentsMock = vi.fn((_subjectId: number, _yearId: number) =>
  Promise.resolve({ data: { data: [] } }),
);

// Regression guard: this tab used to independently call
// academicYearsApi.getAll() and pick `is_current` itself instead of reading
// the years list + default from the global academic period context.
vi.mock("../../../api/academics", () => ({
  academicYearsApi: { getAll: (...args: any[]) => academicYearsGetAllMock(...args) },
  myAssignedSubjectsApi: {
    getEnrolledStudents: (subjectId: number, yearId: number) =>
      getEnrolledStudentsMock(subjectId, yearId),
  },
  studentEnrollmentApi: { enroll: vi.fn(), unenroll: vi.fn() },
}));

vi.mock("../../../api/documents", () => ({
  userApi: { searchUsers: vi.fn(() => Promise.resolve({ data: { data: [] } })) },
}));

vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => false }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

const periodMock = {
  years: [
    { academic_year_id: 1, name: "2024-2025", is_current: 0 },
    { academic_year_id: 2, name: "2025-2026", is_current: 1 },
  ],
  selectedYearId: 2,
  loading: false,
};
vi.mock("../../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => periodMock,
}));

describe("EnrolledStudentsTab — global academic period wiring", () => {
  beforeEach(() => {
    academicYearsGetAllMock.mockClear();
    getEnrolledStudentsMock.mockClear();
  });

  it("defaults to the globally selected academic year without an independent years fetch", async () => {
    render(<EnrolledStudentsTab subjectId={7} subjectName="Math" />);

    await waitFor(() =>
      expect(getEnrolledStudentsMock).toHaveBeenCalledWith(7, 2),
    );
    expect(academicYearsGetAllMock).not.toHaveBeenCalled();

    const yearSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    expect(yearSelect.value).toBe("2");
  });
});
