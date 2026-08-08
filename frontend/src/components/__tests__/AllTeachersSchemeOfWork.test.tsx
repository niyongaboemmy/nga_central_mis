import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AllTeachersSchemeOfWork from "../AllTeachersSchemeOfWork";

const getAllTeachersMock = vi.fn((_params: any) =>
  Promise.resolve({ data: { data: [] } }),
);

vi.mock("../../api/schemeOfWork", () => ({
  schemeOfWorkApi: {
    getAllTeachers: (params: any) => getAllTeachersMock(params),
  },
}));

// Stable function identities across renders — a fresh vi.fn() per render would
// change useCallback/useEffect dependency identities and trigger extra fetches.
const showToastMock = vi.fn();
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

const getTermsMock = vi.fn(() => Promise.resolve([]));
const getGradesMock = vi.fn(() =>
  Promise.resolve([{ grade_id: 9, name: "Grade 1" }]),
);
vi.mock("../../contexts/MetadataContext", () => ({
  useMetadata: () => ({
    years: [],
    programs: [{ program_id: 5, name: "Primary" }],
    getTerms: getTermsMock,
    getGrades: getGradesMock,
  }),
}));

const mockUser = {
  roles: [
    {
      program_id: 5,
      grade_id: 9,
      permissions: [{ name: "VIEW_ALL_TEACHERS_SCHEME_OF_WORK_LIST" }],
    },
  ],
};
vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: mockUser }),
}));

let periodMock: any = {
  selectedYearId: 2,
  selectedTermId: 21,
  selectedYear: { academic_year_id: 2, name: "2025-2026" },
  selectedTerm: { academic_term_id: 21, name: "Term A" },
};

vi.mock("../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => periodMock,
}));

describe("AllTeachersSchemeOfWork — global academic period wiring", () => {
  beforeEach(() => {
    sessionStorage.clear();
    getAllTeachersMock.mockClear();
    periodMock = {
      selectedYearId: 2,
      selectedTermId: 21,
      selectedYear: { academic_year_id: 2, name: "2025-2026" },
      selectedTerm: { academic_term_id: 21, name: "Term A" },
    };
  });

  it("fetches teachers scoped to the globally selected academic year and term", async () => {
    render(
      <MemoryRouter>
        <AllTeachersSchemeOfWork />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getAllTeachersMock).toHaveBeenCalled());
    expect(getAllTeachersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        academic_year_id: 2,
        academic_term_id: 21,
        program_id: 5,
        grade_id: 9,
      }),
    );
  });

  it("refetches automatically when the globally selected year/term changes", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <AllTeachersSchemeOfWork />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getAllTeachersMock).toHaveBeenCalledTimes(1));

    periodMock = {
      selectedYearId: 1,
      selectedTermId: 12,
      selectedYear: { academic_year_id: 1, name: "2024-2025" },
      selectedTerm: { academic_term_id: 12, name: "Term 2" },
    };
    rerender(
      <MemoryRouter>
        <AllTeachersSchemeOfWork />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(getAllTeachersMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          academic_year_id: 1,
          academic_term_id: 12,
        }),
      ),
    );
  });
});
