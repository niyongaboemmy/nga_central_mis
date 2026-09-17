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

const searchUsersMock = vi.fn(async () => []);

vi.mock("../../../api/academics", () => academicsMocks);
vi.mock("../../../api/classGroups", () => ({
  classGroupsWorkspaceApi: classGroupsWorkspaceMocks,
}));
vi.mock("../../../api/users", () => ({
  searchUsers: (...args: any[]) => (searchUsersMock as any)(...args),
}));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));
vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: hasPermissionMock }),
}));

import ClassGroupsManagement from "../ClassGroupsManagement";

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

const selectP1A = async (user: ReturnType<typeof userEvent.setup>) => {
  await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
  await user.click(screen.getAllByText("P1A")[0]);
  await waitFor(() =>
    expect(academicsMocks.enrollmentRosterApi.get).toHaveBeenCalled(),
  );
};

describe("Students lens", () => {
  beforeEach(() => {
    resetWorkspaceMocks();
    setPermissions(["*"]);
    academicsMocks.enrollmentRosterApi.get.mockImplementation(() =>
      wrapped(ROSTER),
    );
    searchUsersMock.mockResolvedValue([] as any);
  });

  it("prompts for a class group before showing a roster", async () => {
    render(<ClassGroupsManagement />);
    expect(await screen.findByText("Pick a class group")).toBeInTheDocument();
  });

  it("renders the selected class group's roster with subject coverage", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);
    await selectP1A(user);

    expect(await screen.findByText("Alice Mutesi")).toBeInTheDocument();
    expect(screen.getByText("Bob Nkusi")).toBeInTheDocument();
    // Bob holds 1 of 2 curriculum subjects.
    expect(screen.getByLabelText("1/2 complete")).toBeInTheDocument();
  });

  it("select-all only picks the students the filter left on screen", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);
    await selectP1A(user);
    await screen.findByText("Alice Mutesi");

    await user.type(screen.getByLabelText("Filter roster"), "bob");
    await waitFor(() =>
      expect(screen.queryByText("Alice Mutesi")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByLabelText("Select all students in view"));

    expect(await screen.findByText("1 student selected")).toBeInTheDocument();
  });

  it("removes selected students and refreshes the roster", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);
    await selectP1A(user);
    await screen.findByText("Alice Mutesi");

    await user.click(screen.getByLabelText("Select Alice Mutesi"));
    await user.click(screen.getByRole("button", { name: /Remove from class/ }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(academicsMocks.studentClassGroupApi.remove).toHaveBeenCalledWith(
        501,
        1000,
        1,
      ),
    );
    expect(showToastMock).toHaveBeenCalledWith(
      expect.stringContaining("Removed 1 student"),
      "success",
    );
  });

  it("moves selected students into another class group", async () => {
    const user = userEvent.setup();
    academicsMocks.studentClassGroupApi.bulkAssign.mockImplementation(() =>
      wrapped({
        assigned: 2,
        reactivated: 0,
        already_active: 0,
        subjects_enrolled: 4,
        total: 2,
      }),
    );

    render(<ClassGroupsManagement />);
    await selectP1A(user);
    await screen.findByText("Alice Mutesi");

    await user.click(screen.getByLabelText("Select all students in view"));
    await user.click(screen.getByRole("button", { name: /Move to class/ }));

    await user.click(await screen.findByRole("button", { name: "P1 · P1B" }));
    await user.click(screen.getByRole("button", { name: "Move students" }));

    await waitFor(() =>
      expect(
        academicsMocks.studentClassGroupApi.bulkAssign,
      ).toHaveBeenCalledWith({
        user_ids: [501, 502],
        class_group_id: 1001,
        academic_year_id: 1,
      }),
    );
  });

  it("adds students from the unassigned tray", async () => {
    const user = userEvent.setup();
    classGroupsWorkspaceMocks.unassignedStudents.mockImplementation(() =>
      wrapped({
        students: [
          {
            user_id: 777,
            username: "cara",
            email: "cara@example.com",
            first_name: "Cara",
            last_name: "Iradukunda",
            gender: "FEMALE",
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
        academic_year_id: 1,
      }),
    );
    academicsMocks.studentClassGroupApi.bulkAssign.mockImplementation(() =>
      wrapped({
        assigned: 1,
        reactivated: 0,
        already_active: 0,
        subjects_enrolled: 2,
        total: 1,
      }),
    );

    render(<ClassGroupsManagement />);
    await selectP1A(user);
    await screen.findByText("Alice Mutesi");

    await user.click(screen.getByRole("button", { name: /Add students/ }));

    const row = await screen.findByText("Cara Iradukunda");
    await user.click(row);
    await user.click(screen.getByRole("button", { name: /Add 1 to class/ }));

    await waitFor(() =>
      expect(
        academicsMocks.studentClassGroupApi.bulkAssign,
      ).toHaveBeenCalledWith({
        user_ids: [777],
        class_group_id: 1000,
        academic_year_id: 1,
      }),
    );
  });

  it("falls back to the permission-light roster without MANAGE_STUDENT_ENROLLMENTS", async () => {
    setPermissions(["MANAGE_ACADEMICS", "ASSIGN_STUDENT_CLASS_GROUPS"]);
    academicsMocks.classGroupsApi.students.mockImplementation(() =>
      wrapped([
        {
          user_id: 501,
          username: "alice",
          email: "alice@example.com",
          first_name: "Alice",
          last_name: "Mutesi",
          gender: "FEMALE",
          academic_year_id: 1,
          enrolled_at: null,
        },
      ]),
    );

    const user = userEvent.setup();
    render(<ClassGroupsManagement />);
    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("P1A")[0]);

    expect(await screen.findByText("Alice Mutesi")).toBeInTheDocument();
    expect(academicsMocks.enrollmentRosterApi.get).not.toHaveBeenCalled();
    // No coverage column when coverage could not be read.
    expect(
      screen.queryByRole("columnheader", { name: "Subjects" }),
    ).not.toBeInTheDocument();
  });

  it("disables roster writes without ASSIGN_STUDENT_CLASS_GROUPS", async () => {
    setPermissions(["MANAGE_STUDENT_ENROLLMENTS"]);
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);
    await selectP1A(user);
    await screen.findByText("Alice Mutesi");

    expect(screen.getByRole("button", { name: /Add students/ })).toBeDisabled();
    expect(screen.getByLabelText("Select Alice Mutesi")).toBeDisabled();
    expect(
      screen.getByText(/You can view this class group's roster but not change/),
    ).toBeInTheDocument();
  });
});

describe("Structure lens", () => {
  beforeEach(() => {
    resetWorkspaceMocks();
    setPermissions(["*"]);
    academicsMocks.enrollmentRosterApi.get.mockImplementation(() =>
      wrapped(ROSTER),
    );
  });

  const openStructure = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<ClassGroupsManagement />);
    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("tab", { name: /Grades & Class Groups/ }));
  };

  it("lists grades and, once one is picked, its class groups", async () => {
    const user = userEvent.setup();
    await openStructure(user);

    const gradesPanel = screen.getByText("Grades").closest("div")!
      .parentElement!;
    expect(within(gradesPanel).getAllByText("P1").length).toBeGreaterThan(0);

    expect(await screen.findByText("Pick a grade")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /P2 Primary · level 2/ }));
    // P2A now appears both in the class-group list and the context bar select.
    expect((await screen.findAllByText("P2A")).length).toBeGreaterThan(0);
  });

  it("creates a class group under the selected grade", async () => {
    const user = userEvent.setup();
    await openStructure(user);

    await user.click(screen.getByRole("button", { name: /P2 Primary · level 2/ }));
    await user.click(await screen.findByRole("button", { name: /Class group/ }));

    await user.type(screen.getByPlaceholderText("e.g. S1A"), "P2B");
    await user.click(screen.getByRole("button", { name: "Create class group" }));

    await waitFor(() =>
      expect(academicsMocks.classGroupsApi.create).toHaveBeenCalledWith({
        name: "P2B",
        grade_id: 101,
      }),
    );
  });

  it("preflights a delete and requires acknowledgement when records are affected", async () => {
    const user = userEvent.setup();
    academicsMocks.classGroupsApi.dependencies.mockImplementation(() =>
      wrapped({
        class_group_id: 1002,
        name: "P2A",
        requires_confirmation: true,
        deletes: [{ key: "roster", label: "roster entries", count: 12, destructive: true }],
        unlinks: [{ key: "slots", label: "timetable slots", count: 3, destructive: false }],
      }),
    );

    await openStructure(user);
    await user.click(screen.getByRole("button", { name: /P2 Primary · level 2/ }));
    await user.click(await screen.findByLabelText("Delete P2A"));

    expect(await screen.findByText("roster entries")).toBeInTheDocument();
    expect(screen.getByText("timetable slots")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Delete class group" });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /cannot be undone/ }));
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    await waitFor(() =>
      expect(academicsMocks.classGroupsApi.delete).toHaveBeenCalledWith(1002, true),
    );
  });

  it("hides structural writes without MANAGE_ACADEMICS", async () => {
    setPermissions(["ASSIGN_STUDENT_CLASS_GROUPS"]);
    const user = userEvent.setup();
    await openStructure(user);

    expect(await screen.findByText(/You can view grades and class groups/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Grade$/ })).toBeDisabled();
  });
});
