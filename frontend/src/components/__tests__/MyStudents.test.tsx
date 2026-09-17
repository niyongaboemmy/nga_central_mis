import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MyStudents from "../MyStudents";

const getAllMock = vi.fn();

vi.mock("../../api/academics", () => ({
  myStudentsApi: { getAll: (params: any) => getAllMock(params) },
}));

let periodMock: any;
let scopeMock: any;

vi.mock("../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => periodMock,
}));

vi.mock("../../hooks/useScopedGrades", () => ({
  useScopedGrades: () => scopeMock,
}));

const RESPONSE = (overrides: any = {}) => ({
  data: {
    data: {
      students: [],
      filters: {
        subjects: [{ subject_id: 1, subject_name: "Maths", subject_code: "M1" }],
        class_groups: [
          {
            class_group_id: 26,
            class_group_name: "L4. Class A",
            grade_name: "Year 2",
            program_name: "Coding",
          },
          {
            class_group_id: 9,
            class_group_name: "L3. Class B",
            grade_name: "Year 1",
            program_name: "Coding",
          },
        ],
      },
      academic_year_id: 4,
      total: 0,
      ...overrides,
    },
  },
});

const lastCall = () => getAllMock.mock.calls[getAllMock.mock.calls.length - 1][0];

describe("MyStudents default class group", () => {
  beforeEach(() => {
    getAllMock.mockReset();
    getAllMock.mockResolvedValue(RESPONSE());
    periodMock = { selectedYearId: 4 };
    scopeMock = { defaultClassGroupId: null, isScoped: false };
  });

  it("shows all class groups when the profile has none assigned", async () => {
    render(<MyStudents />);
    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(lastCall().classGroupId).toBeUndefined(),
    );
  });

  it("preselects the profile's class group when the teacher teaches there", async () => {
    scopeMock = { defaultClassGroupId: 26, isScoped: true };
    render(<MyStudents />);

    // first load is unfiltered, then it settles on the profile's group
    await waitFor(() => expect(lastCall().classGroupId).toBe(26));
    const select = (await screen.findByDisplayValue(
      /L4\. Class A/,
    )) as HTMLSelectElement;
    expect(select.value).toBe("26");
  });

  it("stays on all groups when the profile's group is not one the teacher teaches", async () => {
    // A class-teacher assignment is not a teaching assignment: group 11 is
    // absent from the options, so defaulting to it would show an empty roster
    // behind a filter the teacher never chose.
    scopeMock = { defaultClassGroupId: 11, isScoped: true };
    render(<MyStudents />);

    await waitFor(() => expect(getAllMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(lastCall().classGroupId).toBeUndefined();
  });

  it("passes the selected academic year through to the request", async () => {
    render(<MyStudents />);
    await waitFor(() => expect(lastCall().academicYearId).toBe(4));
  });
});
