import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  academicsMocks,
  classGroupsWorkspaceMocks,
  resetWorkspaceMocks,
  showToastMock,
  hasPermissionMock,
  setPermissions,
  wrapped,
} from "./testHarness";

const searchUsersMock = vi.fn(async (): Promise<any[]> => []);
const getAllGradeAssignmentsMock = vi.fn(async (): Promise<any[]> => []);
const assignGradeToUserMock = vi.fn(async () => undefined);
const removeGradeFromUserMock = vi.fn(async () => undefined);

vi.mock("../../../api/academics", () => academicsMocks);
vi.mock("../../../api/classGroups", () => ({
  classGroupsWorkspaceApi: classGroupsWorkspaceMocks,
}));
vi.mock("../../../api/users", () => ({
  searchUsers: (...a: any[]) => (searchUsersMock as any)(...a),
  getAllGradeAssignments: (...a: any[]) =>
    (getAllGradeAssignmentsMock as any)(...a),
  assignGradeToUser: (...a: any[]) => (assignGradeToUserMock as any)(...a),
  removeGradeFromUser: (...a: any[]) => (removeGradeFromUserMock as any)(...a),
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));
vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: hasPermissionMock }),
}));

import ClassGroupsManagement from "../ClassGroupsManagement";

const CURRICULUM = [
  {
    grade_subject_id: "gs1",
    grade_id: 100,
    subject_id: 1,
    subject_name: "Mathematics",
    subject_code: "MATH",
    subject_description: null,
  },
  {
    grade_subject_id: "gs2",
    grade_id: 100,
    subject_id: 2,
    subject_name: "English",
    subject_code: "ENG",
    subject_description: null,
  },
];

// Mathematics is taught here; English is the coverage gap.
const ASSIGNMENTS = [
  {
    assignment_id: "a1",
    user_id: 900,
    teacher_name: "Ada Uwase",
    teacher_username: "ada",
    subject_id: 1,
    subject_name: "Mathematics",
    subject_code: "MATH",
    class_group_id: 1000,
    class_group_name: "P1A",
    grade_name: "P1",
    program_name: "Primary",
    academic_year_id: 1,
    academic_year_name: "2026",
    academic_year_is_current: 1,
    assigned_at: "2026-01-01",
  },
  {
    // Another class group's assignment — must never leak into this view.
    assignment_id: "a2",
    user_id: 901,
    teacher_name: "Ben Habimana",
    teacher_username: "ben",
    subject_id: 2,
    subject_name: "English",
    subject_code: "ENG",
    class_group_id: 1001,
    class_group_name: "P1B",
    grade_name: "P1",
    program_name: "Primary",
    academic_year_id: 1,
    academic_year_name: "2026",
    academic_year_is_current: 1,
    assigned_at: "2026-01-01",
  },
];

const ROSTER = {
  class_group: {
    class_group_id: 1000,
    class_group_name: "P1A",
    grade_id: 100,
    grade_name: "P1",
    program_id: 10,
    program_name: "Primary",
  },
  academic_year_id: 1,
  subjects: [
    { subject_id: 1, code: "MATH", name: "Mathematics" },
    { subject_id: 2, code: "ENG", name: "English" },
  ],
  students: [
    {
      user_id: 501,
      username: "alice",
      email: "alice@example.com",
      first_name: "Alice",
      last_name: "Mutesi",
      gender: "FEMALE",
      enrolled_subject_ids: [1, 2],
      enrolled_count: 2,
      total_subjects: 2,
    },
    {
      user_id: 502,
      username: "bob",
      email: "bob@example.com",
      first_name: "Bob",
      last_name: "Nkusi",
      gender: "MALE",
      enrolled_subject_ids: [1],
      enrolled_count: 1,
      total_subjects: 2,
    },
  ],
};

const openLens = async (
  user: ReturnType<typeof userEvent.setup>,
  tabName: RegExp,
) => {
  render(<ClassGroupsManagement />);
  await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
  await user.click(screen.getAllByText("P1A")[0]);
  await user.click(screen.getByRole("tab", { name: tabName }));
};

beforeEach(() => {
  resetWorkspaceMocks();
  setPermissions(["*"]);
  academicsMocks.gradeSubjectsApi.getByGrade.mockImplementation(() =>
    wrapped(CURRICULUM),
  );
  academicsMocks.teacherSubjectAssignmentsApi.getAll.mockImplementation(() =>
    wrapped(ASSIGNMENTS),
  );
  academicsMocks.enrollmentRosterApi.get.mockImplementation(() =>
    wrapped(ROSTER),
  );
  searchUsersMock.mockResolvedValue([]);
  getAllGradeAssignmentsMock.mockResolvedValue([]);
});

describe("Subjects lens", () => {
  it("splits the grade's curriculum from the subjects still available", async () => {
    const user = userEvent.setup();
    await openLens(user, /Subjects/);

    expect(await screen.findByText("P1 curriculum")).toBeInTheDocument();
    expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0);
    // Science is the only fixture subject not in the curriculum.
    expect(screen.getByLabelText("Add Science to curriculum")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Add Mathematics to curriculum"),
    ).not.toBeInTheDocument();
  });

  it("badges each curriculum subject with its staffing and enrollment", async () => {
    const user = userEvent.setup();
    await openLens(user, /Subjects/);

    await screen.findByText("P1 curriculum");
    // Mathematics has one teacher and both students; English has neither.
    expect(screen.getByText("1 teacher")).toBeInTheDocument();
    expect(screen.getByText("unassigned")).toBeInTheDocument();
    expect(screen.getByText("2/2 enrolled")).toBeInTheDocument();
    expect(screen.getByText("1/2 enrolled")).toBeInTheDocument();
  });

  it("adds a subject to the curriculum", async () => {
    const user = userEvent.setup();
    await openLens(user, /Subjects/);

    await user.click(
      await screen.findByLabelText("Add Science to curriculum"),
    );

    await waitFor(() =>
      expect(academicsMocks.gradeSubjectsApi.assign).toHaveBeenCalledWith({
        grade_id: 100,
        subject_id: 3,
      }),
    );
  });

  it("warns before removing a subject students are enrolled in", async () => {
    const user = userEvent.setup();
    await openLens(user, /Subjects/);

    await user.click(
      await screen.findByLabelText("Remove Mathematics from curriculum"),
    );

    expect(
      await screen.findByText("2 students are enrolled in it"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove subject" }));
    await waitFor(() =>
      expect(academicsMocks.gradeSubjectsApi.remove).toHaveBeenCalledWith(100, 1),
    );
  });
});

describe("Teachers lens", () => {
  it("shows coverage for the selected class group only", async () => {
    const user = userEvent.setup();
    await openLens(user, /Teachers/);

    expect(await screen.findByText("Subject teachers")).toBeInTheDocument();
    expect(screen.getByText("Ada Uwase")).toBeInTheDocument();
    // Ben teaches English in P1B, not here — English must read as a gap.
    expect(screen.queryByText("Ben Habimana")).not.toBeInTheDocument();
    expect(
      screen.getByText("Unassigned — add a teacher"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("1/2 complete")).toBeInTheDocument();
  });

  it("flags a missing class teacher", async () => {
    const user = userEvent.setup();
    await openLens(user, /Teachers/);

    expect(await screen.findByText("No class teacher for P1A")).toBeInTheDocument();
  });

  it("shows the class teacher when one is assigned", async () => {
    getAllGradeAssignmentsMock.mockResolvedValue([
      {
        grade_assignment_id: "ga1",
        user_id: 900,
        user_name: "Ada Uwase",
        username: "ada",
        email: "ada@example.com",
        grade_id: 100,
        grade_name: "P1",
        class_group_id: 1000,
        class_group_name: "P1A",
        program_name: "Primary",
        academic_year_id: 1,
        academic_year_name: "2026",
        academic_year_is_current: 1,
        assigned_at: "2026-01-01",
      },
    ]);

    const user = userEvent.setup();
    await openLens(user, /Teachers/);

    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Replace/ }),
    ).toBeInTheDocument();
  });

  it("staffs every gap at once with one bulk request", async () => {
    const user = userEvent.setup();
    searchUsersMock.mockResolvedValue([
      {
        user_id: 902,
        username: "cara",
        email: "cara@example.com",
        first_name: "Cara",
        last_name: "Uwera",
        status: "ACTIVE",
        user_type: "TEACHER",
      },
    ]);
    classGroupsWorkspaceMocks.bulkAssignTeacherSubjects.mockImplementation(() =>
      wrapped({ assigned: 1, skipped: 0, total: 1 }),
    );

    await openLens(user, /Teachers/);
    await screen.findByText("Subject teachers");

    await user.click(screen.getByRole("button", { name: /Staff 1 gap/ }));
    await user.type(screen.getByLabelText("Search teachers"), "cara");
    await user.click(await screen.findByText("Cara Uwera"));
    await user.click(screen.getByRole("button", { name: "Assign teacher" }));

    await waitFor(() =>
      expect(
        classGroupsWorkspaceMocks.bulkAssignTeacherSubjects,
      ).toHaveBeenCalledWith({
        user_id: 902,
        subject_ids: [2],
        class_group_id: 1000,
        academic_year_id: 1,
      }),
    );
  });

  it("unassigns a teacher from a subject", async () => {
    const user = userEvent.setup();
    await openLens(user, /Teachers/);
    await screen.findByText("Ada Uwase");

    await user.click(
      screen.getByLabelText("Remove Ada Uwase from Mathematics"),
    );

    await waitFor(() =>
      expect(
        academicsMocks.teacherSubjectAssignmentsApi.remove,
      ).toHaveBeenCalledWith(900, 1, 1000, 1),
    );
  });

  it("copies assignments from another year", async () => {
    const user = userEvent.setup();
    academicsMocks.teacherSubjectAssignmentsApi.copy.mockImplementation(() =>
      wrapped({ copied: 7, skipped: 2 }),
    );

    await openLens(user, /Teachers/);
    await user.click(await screen.findByRole("button", { name: /Copy from year/ }));

    await user.selectOptions(screen.getByLabelText("Source academic year"), "2");
    await user.click(screen.getByRole("button", { name: "Copy assignments" }));

    await waitFor(() =>
      expect(academicsMocks.teacherSubjectAssignmentsApi.copy).toHaveBeenCalledWith({
        source_academic_year_id: 2,
        target_academic_year_id: 1,
      }),
    );
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("Copied 7 assignment"),
      "success",
    );
  });

  it("replaces a class teacher by clearing the incumbent first", async () => {
    getAllGradeAssignmentsMock.mockResolvedValue([
      {
        grade_assignment_id: "ga1",
        user_id: 900,
        user_name: "Ada Uwase",
        username: "ada",
        email: "ada@example.com",
        grade_id: 100,
        grade_name: "P1",
        class_group_id: 1000,
        class_group_name: "P1A",
        program_name: "Primary",
        academic_year_id: 1,
        academic_year_name: "2026",
        academic_year_is_current: 1,
        assigned_at: "2026-01-01",
      },
    ]);
    searchUsersMock.mockResolvedValue([
      {
        user_id: 902,
        username: "cara",
        email: "cara@example.com",
        first_name: "Cara",
        last_name: "Uwera",
        status: "ACTIVE",
        user_type: "TEACHER",
      },
    ]);

    const user = userEvent.setup();
    await openLens(user, /Teachers/);
    await screen.findByText("ada@example.com");

    await user.click(screen.getByRole("button", { name: /Replace/ }));
    await user.type(screen.getByLabelText("Search teachers"), "cara");
    await user.click(await screen.findByText("Cara Uwera"));
    await user.click(
      screen.getByRole("button", { name: "Replace class teacher" }),
    );

    await waitFor(() =>
      expect(removeGradeFromUserMock).toHaveBeenCalledWith(900, 100, 1000, 1),
    );
    expect(assignGradeToUserMock).toHaveBeenCalledWith(902, 100, 1000, 1);
  });

  it("keeps every control read-only without MANAGE_ACADEMICS", async () => {
    setPermissions(["MANAGE_STUDENT_ENROLLMENTS"]);
    const user = userEvent.setup();
    await openLens(user, /Teachers/);

    await screen.findByText("Subject teachers");
    expect(screen.getByRole("button", { name: /Copy from year/ })).toBeDisabled();
    expect(screen.getByText("Unassigned — add a teacher")).toBeDisabled();
  });
});
