import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ClassTeacherCalendarPage from "../ClassTeacherCalendarPage";

// The page is a thin, guarded shell around the shared AcademicCalendar grid --
// stub the grid so these assert the guards, not the calendar itself.
vi.mock("../AcademicCalendar", () => ({
  default: ({ title }: { title?: string }) => (
    <div data-testid="academic-calendar">{title}</div>
  ),
}));

let scopeMock: any;
let periodMock: any;
let permissionsMock: string[];

vi.mock("../../hooks/useScopedGrades", () => ({
  useScopedGrades: () => scopeMock,
}));

vi.mock("../../contexts/AcademicPeriodContext", () => ({
  useAcademicPeriod: () => periodMock,
}));

vi.mock("../../hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p?: string) => (p ? permissionsMock.includes(p) : true),
  }),
}));

const CLASS_TEACHER_SCOPE = {
  isScoped: true,
  source: "grades" as const,
  gradeIds: [3],
  classGroupIds: [11],
  grades: [{ grade_id: 3, name: "Year 1" }],
  classGroups: [
    { class_group_id: 11, name: "L3. Class A", grade_id: 3, grade_name: "Year 1" },
  ],
  programIds: [1],
  defaultClassGroupId: 11,
};

describe("ClassTeacherCalendarPage", () => {
  beforeEach(() => {
    scopeMock = { ...CLASS_TEACHER_SCOPE };
    periodMock = {
      selectedTermId: 6,
      selectedTerm: { academic_term_id: 6, name: "Term 1" },
      selectedYear: { academic_year_id: 4, name: "2026 - 2027" },
      loading: false,
    };
    permissionsMock = ["VIEW_CALENDAR_BY_CLASS_TEACHER_GRADE"];
  });

  it("renders the calendar for an assigned class teacher", () => {
    render(<ClassTeacherCalendarPage />);
    expect(screen.getByTestId("academic-calendar")).toBeInTheDocument();
    // the grid titles itself, so the page never stacks a second header
    expect(screen.getByTestId("academic-calendar")).toHaveTextContent(
      "Class Calendar",
    );
    // and names the class group it is scoped to
    expect(screen.getByTestId("class-calendar-scope")).toHaveTextContent(
      "L3. Class A",
    );
  });

  it("refuses access without any calendar permission", () => {
    permissionsMock = [];
    render(<ClassTeacherCalendarPage />);
    expect(screen.queryByTestId("academic-calendar")).not.toBeInTheDocument();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("explains an unassigned class teacher instead of showing an empty week", () => {
    scopeMock = { ...CLASS_TEACHER_SCOPE, classGroupIds: [], classGroups: [] };
    render(<ClassTeacherCalendarPage />);
    expect(screen.queryByTestId("academic-calendar")).not.toBeInTheDocument();
    expect(screen.getByText("No class group assigned")).toBeInTheDocument();
    expect(screen.getByText(/2026 - 2027/)).toBeInTheDocument();
  });

  it("asks for a term when the period selector has none", () => {
    periodMock = { ...periodMock, selectedTermId: null };
    render(<ClassTeacherCalendarPage />);
    expect(screen.queryByTestId("academic-calendar")).not.toBeInTheDocument();
    expect(screen.getByText("No academic term selected")).toBeInTheDocument();
  });

  it("does not block a program lead, who is scoped by grade rather than class group", () => {
    scopeMock = {
      ...CLASS_TEACHER_SCOPE,
      source: "programs" as const,
      classGroupIds: [],
      classGroups: [],
    };
    render(<ClassTeacherCalendarPage />);
    expect(screen.getByTestId("academic-calendar")).toBeInTheDocument();
  });

  it("does not block an unscoped admin", () => {
    scopeMock = {
      isScoped: false,
      source: "none" as const,
      gradeIds: [],
      classGroupIds: [],
      grades: [],
      classGroups: [],
      programIds: [],
      defaultClassGroupId: null,
    };
    permissionsMock = ["MANAGE_ACADEMIC_CALENDAR"];
    render(<ClassTeacherCalendarPage />);
    expect(screen.getByTestId("academic-calendar")).toBeInTheDocument();
  });
});
