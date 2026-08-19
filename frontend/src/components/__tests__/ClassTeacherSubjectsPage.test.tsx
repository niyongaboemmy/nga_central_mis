import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const getScopedSubjectsMock = vi.fn();
vi.mock("../../api/users", () => ({
  getScopedSubjects: (...args: any[]) => getScopedSubjectsMock(...args),
  getScopedSubjectDetail: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../contexts/UserContext", () => ({
  useUser: () => ({
    user: {
      permissions: ["VIEW_SUBJECTS_BY_CLASS_TEACHER_GRADE"],
      currentAcademicYear: { academic_year_id: 4 },
    },
  }),
}));

vi.mock("../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => ({
    selectedYearId: 4,
    selectedTermId: 6,
    selectedYear: { name: "2026 - 2027" },
    selectedTerm: { name: "Term 1" },
  }),
}));

vi.mock("../../hooks/useScopedGrades", () => ({
  useScopedGrades: () => ({
    isScoped: true,
    source: "grades",
    gradeIds: [25],
    classGroupIds: [9],
    grades: [{ grade_id: 25, name: "Year 1" }],
    classGroups: [],
    programIds: [8],
    defaultClassGroupId: 9,
  }),
}));

import ClassTeacherSubjectsPage from "../ClassTeacherSubjectsPage";

const FACETS = {
  categories: [{ id: 3, name: "Specific Module", count: 2 }],
  classGroups: [
    { id: 9, name: "L3. Class A", count: 2 },
    { id: 10, name: "L3. Class B", count: 1 },
  ],
  grades: [{ id: 25, name: "Year 1", count: 2 }],
  teachers: [
    { id: 1, name: "Jean De Dieu", count: 1 },
    { id: 2, name: "Ndazivunnye Felix", count: 1 },
  ],
  statuses: [{ id: "ACTIVE", name: "ACTIVE", count: 2 }],
  unassigned: 1,
};

const SUBJECTS = [
  {
    subject_id: 1,
    code: "GENAP302",
    name: "Applied Physics I",
    status: "ACTIVE",
    color: "#2563eb",
    category_name: "Specific Module",
    teachers: [
      { user_id: 1, username: "jdn", first_name: "Jean", last_name: "De Dieu" },
    ],
    grades: [{ grade_id: 25, name: "Year 1" }],
    class_groups: [{ class_group_id: 9, name: "L3. Class A" }],
  },
  {
    subject_id: 2,
    code: "SFPCB302",
    name: "Computer Basics",
    status: "ACTIVE",
    color: "#2563eb",
    category_name: "Specific Module",
    teachers: [],
    grades: [{ grade_id: 25, name: "Year 1" }],
    class_groups: [{ class_group_id: 10, name: "L3. Class B" }],
  },
];

const lastCall = () =>
  getScopedSubjectsMock.mock.calls[getScopedSubjectsMock.mock.calls.length - 1][0];

describe("ClassTeacherSubjectsPage filtering", () => {
  beforeEach(() => {
    getScopedSubjectsMock.mockReset();
    getScopedSubjectsMock.mockResolvedValue({
      items: SUBJECTS,
      facets: FACETS,
      total: SUBJECTS.length,
      page: 1,
      totalPages: 1,
    });
    localStorage.clear();
  });

  it("loads the caller's grade scope and the selected year", async () => {
    render(<ClassTeacherSubjectsPage />);
    await waitFor(() => expect(getScopedSubjectsMock).toHaveBeenCalled());

    expect(lastCall()).toMatchObject({ gradeIds: [25], academicYearId: 4 });
    expect(await screen.findByText("Applied Physics I")).toBeTruthy();
  });

  it("flags a subject with no teacher rather than leaving it blank", async () => {
    render(<ClassTeacherSubjectsPage />);
    expect(await screen.findByText("No teacher yet")).toBeTruthy();
  });

  it("sends a class-group filter chosen from the facet menu", async () => {
    render(<ClassTeacherSubjectsPage />);
    await screen.findByText("Applied Physics I");

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Class group/ }));
    fireEvent.click(await screen.findByText("L3. Class B"));

    await waitFor(() =>
      expect(lastCall()).toMatchObject({ classGroupIds: [10] }),
    );
  });

  it("sends teacher, category, status and assignment filters", async () => {
    render(<ClassTeacherSubjectsPage />);
    await screen.findByText("Applied Physics I");
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));

    fireEvent.click(await screen.findByRole("button", { name: /Teacher/ }));
    fireEvent.click(await screen.findByText("Ndazivunnye Felix"));
    await waitFor(() => expect(lastCall()).toMatchObject({ teacherIds: [2] }));

    fireEvent.click(screen.getByRole("button", { name: /Category/ }));
    fireEvent.click(await screen.findByText("Specific Module"));
    await waitFor(() => expect(lastCall()).toMatchObject({ categoryIds: [3] }));

    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    await waitFor(() => expect(lastCall()).toMatchObject({ status: "DISABLED" }));

    fireEvent.click(screen.getByRole("button", { name: /Unstaffed/ }));
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ assignment: "unassigned" }),
    );
  });

  it("changes the sort order", async () => {
    render(<ClassTeacherSubjectsPage />);
    await screen.findByText("Applied Physics I");

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.change(await screen.findByLabelText("Sort by"), {
      target: { value: "name-desc" },
    });

    await waitFor(() => expect(lastCall()).toMatchObject({ sort: "name-desc" }));
  });

  it("clears every filter at once", async () => {
    render(<ClassTeacherSubjectsPage />);
    await screen.findByText("Applied Physics I");

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Teacher/ }));
    fireEvent.click(await screen.findByText("Ndazivunnye Felix"));
    await waitFor(() => expect(lastCall()).toMatchObject({ teacherIds: [2] }));

    fireEvent.click(screen.getByText("Clear all"));
    await waitFor(() => expect(lastCall()).toMatchObject({ teacherIds: [] }));
  });

  it("remembers the grid/list view choice", async () => {
    const { unmount } = render(<ClassTeacherSubjectsPage />);
    await screen.findByText("Applied Physics I");

    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(localStorage.getItem("class_subjects_view")).toBe("list");

    unmount();
    render(<ClassTeacherSubjectsPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "List view" }).getAttribute(
          "aria-pressed",
        ),
      ).toBe("true"),
    );
  });

  it("offers a way out when filters match nothing", async () => {
    getScopedSubjectsMock.mockResolvedValue({
      items: [],
      facets: FACETS,
      total: 0,
      page: 1,
      totalPages: 1,
    });
    render(<ClassTeacherSubjectsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Filters/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Teacher/ }));
    fireEvent.click(await screen.findByText("Ndazivunnye Felix"));

    expect(
      await screen.findByText("No subject matches these filters."),
    ).toBeTruthy();
    expect(screen.getByText("Clear all filters")).toBeTruthy();
  });
});
