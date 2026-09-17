import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

vi.mock("../../../api/academics", () => academicsMocks);
vi.mock("../../../api/classGroups", () => ({
  classGroupsWorkspaceApi: classGroupsWorkspaceMocks,
}));
vi.mock("../../../api/users", () => ({
  searchUsers: vi.fn(async () => []),
  getAllGradeAssignments: vi.fn(async () => []),
  assignGradeToUser: vi.fn(async () => undefined),
  removeGradeFromUser: vi.fn(async () => undefined),
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));
vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: hasPermissionMock }),
}));
// PromoteStudentsModal drags in its own API surface; the lens only owns the
// button that opens it.
vi.mock("../../academics/PromoteStudentsModal", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>promotion modal</div> : null,
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

const openMatrix = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<ClassGroupsManagement />);
  await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
  await user.click(screen.getAllByText("P1A")[0]);
  await user.click(screen.getByRole("tab", { name: /Enrollments/ }));
  await screen.findByLabelText("Alice Mutesi — Mathematics");
};

describe("Enrollments lens — matrix", () => {
  beforeEach(() => {
    resetWorkspaceMocks();
    setPermissions(["*"]);
    academicsMocks.enrollmentRosterApi.get.mockImplementation(() =>
      wrapped(ROSTER),
    );
    academicsMocks.gradeSubjectsApi.getByGrade.mockImplementation(() =>
      wrapped(CURRICULUM),
    );
    academicsMocks.teacherSubjectAssignmentsApi.getAll.mockImplementation(() =>
      wrapped([]),
    );
  });

  it("renders a cell per student and subject reflecting server state", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    expect(
      screen.getByLabelText("Alice Mutesi — Mathematics"),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Bob Nkusi — English")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("stages a cell toggle without writing to the server until Apply", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    await user.click(screen.getByLabelText("Bob Nkusi — English"));

    expect(screen.getByLabelText("Bob Nkusi — English")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await screen.findByText("1 change selected")).toBeInTheDocument();
    expect(screen.getByText(/\+1 enroll · −0 remove/)).toBeInTheDocument();
    expect(academicsMocks.studentEnrollmentApi.bulkEnroll).not.toHaveBeenCalled();
  });

  it("drops a staged change that returns to the server's value", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    const cell = screen.getByLabelText("Bob Nkusi — English");
    await user.click(cell);
    await screen.findByText("1 change selected");

    await user.click(cell);
    await waitFor(() =>
      expect(screen.queryByText(/change selected/)).not.toBeInTheDocument(),
    );
  });

  it("commits the diff in one bulk call per direction", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    await user.click(screen.getByLabelText("Bob Nkusi — English"));
    await user.click(screen.getByLabelText("Alice Mutesi — Mathematics"));
    expect(await screen.findByText("2 changes selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Apply changes/ }));

    await waitFor(() =>
      expect(academicsMocks.studentEnrollmentApi.bulkEnroll).toHaveBeenCalledWith({
        user_ids: [502],
        subject_ids: [2],
        academic_year_id: 1,
      }),
    );
    expect(
      classGroupsWorkspaceMocks.bulkUnenrollStudents,
    ).toHaveBeenCalledWith({
      user_ids: [501],
      subject_ids: [1],
      academic_year_id: 1,
    });
  });

  it("column select only touches the students the filter left on screen", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    await user.type(screen.getByLabelText("Filter matrix students"), "bob");
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Alice Mutesi — English"),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /English/ }));

    // Only Bob's cell was staged; Alice, filtered out, is untouched.
    expect(await screen.findByText("1 change selected")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Filter matrix students"));
    await waitFor(() =>
      expect(
        screen.getByLabelText("Alice Mutesi — English"),
      ).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByText("1 change selected")).toBeInTheDocument();
  });

  it("row select toggles every subject for one student", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    // Alice holds everything, so her row label clears it.
    await user.click(
      screen.getByRole("button", { name: "Alice Mutesi" }),
    );

    expect(await screen.findByText("2 changes selected")).toBeInTheDocument();
    expect(screen.getByText(/\+0 enroll · −2 remove/)).toBeInTheDocument();
  });

  it("fills every remaining gap in one gesture", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    await user.click(screen.getByRole("button", { name: /Fill every gap/ }));

    // Bob's English is the only gap.
    expect(await screen.findByText("1 change selected")).toBeInTheDocument();
    expect(screen.getByText(/\+1 enroll · −0 remove/)).toBeInTheDocument();
  });

  it("discards staged changes without writing", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    await user.click(screen.getByLabelText("Bob Nkusi — English"));
    await screen.findByText("1 change selected");
    await user.click(screen.getByRole("button", { name: /Discard/ }));

    await waitFor(() =>
      expect(screen.getByLabelText("Bob Nkusi — English")).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
    expect(academicsMocks.studentEnrollmentApi.bulkEnroll).not.toHaveBeenCalled();
  });

  it("keeps staged changes when a save fails", async () => {
    const user = userEvent.setup();
    academicsMocks.studentEnrollmentApi.bulkEnroll.mockImplementation(() =>
      Promise.reject(new Error("boom")),
    );

    await openMatrix(user);
    await user.click(screen.getByLabelText("Bob Nkusi — English"));
    await user.click(screen.getByRole("button", { name: /Apply changes/ }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        "Could not save the enrollment changes",
        "error",
      ),
    );
    expect(screen.getByText("1 change selected")).toBeInTheDocument();
  });

  it("mirrors staffing gaps in the assignments rail", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    // Scoped to the rail: the navigator also renders a "none" class-teacher chip.
    const rail = screen.getByText("Assignments").closest("div")!.parentElement!;
    expect(within(rail).getByText("No class teacher")).toBeInTheDocument();
    // Neither subject is staffed in this fixture.
    expect(within(rail).getAllByText("none")).toHaveLength(2);
  });

  it("opens the promotion flow", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    await user.click(screen.getByRole("button", { name: /Promote students/ }));
    expect(await screen.findByText("promotion modal")).toBeInTheDocument();
  });

  it("refuses the matrix without MANAGE_STUDENT_ENROLLMENTS", async () => {
    setPermissions(["MANAGE_ACADEMICS"]);
    const user = userEvent.setup();

    render(<ClassGroupsManagement />);
    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("P1A")[0]);
    await user.click(screen.getByRole("tab", { name: /Enrollments/ }));

    expect(
      await screen.findByText("Enrollment data unavailable"),
    ).toBeInTheDocument();
    expect(academicsMocks.enrollmentRosterApi.get).not.toHaveBeenCalled();
  });
});
