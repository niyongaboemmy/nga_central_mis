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
vi.mock("../../academics/PromoteStudentsModal", () => ({
  default: () => null,
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
      enrolled_subject_ids: [],
      enrolled_count: 0,
      total_subjects: 2,
    },
  ],
};

beforeEach(() => {
  resetWorkspaceMocks();
  setPermissions(["*"]);
  academicsMocks.enrollmentRosterApi.get.mockImplementation(() =>
    wrapped(ROSTER),
  );
  academicsMocks.gradeSubjectsApi.getByGrade.mockImplementation(() =>
    wrapped([]),
  );
  academicsMocks.teacherSubjectAssignmentsApi.getAll.mockImplementation(() =>
    wrapped([]),
  );
});

describe("Setup checklist", () => {
  const openChecklist = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<ClassGroupsManagement />);
    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: /Setup checklist/ }));
    return screen.getByRole("dialog", { name: "Setup checklist" });
  };

  it("badges the number of incomplete class groups on the trigger", async () => {
    render(<ClassGroupsManagement />);
    const trigger = await screen.findByRole("button", {
      name: /Setup checklist/,
    });
    // P1B and S1A are incomplete in the fixture.
    await waitFor(() => expect(within(trigger).getByText("2")).toBeInTheDocument());
  });

  it("lists only incomplete class groups with their failed checks", async () => {
    const user = userEvent.setup();
    const panel = await openChecklist(user);

    expect(within(panel).getByText("P1 · P1B")).toBeInTheDocument();
    expect(within(panel).getByText("S1 · S1A")).toBeInTheDocument();
    // P1A passes everything, so it is hidden by default.
    expect(within(panel).queryByText("P1 · P1A")).not.toBeInTheDocument();

    expect(
      within(panel).getAllByText("No students assigned for this year").length,
    ).toBeGreaterThan(0);
  });

  it("reveals complete class groups on demand", async () => {
    const user = userEvent.setup();
    const panel = await openChecklist(user);

    await user.click(within(panel).getByRole("button", { name: "Show complete" }));
    expect(await within(panel).findByText("P1 · P1A")).toBeInTheDocument();
  });

  it("summarises how many classes are ready", async () => {
    const user = userEvent.setup();
    const panel = await openChecklist(user);
    expect(
      within(panel).getByLabelText("1/3 classes ready complete"),
    ).toBeInTheDocument();
  });

  it("deep-links a failed check to the class group and lens that fixes it", async () => {
    const user = userEvent.setup();
    const panel = await openChecklist(user);

    await user.click(
      within(panel).getAllByText("Every subject is taught")[0].closest("button")!,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Setup checklist" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("tab", { name: /Teachers/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // P1B is the first incomplete class group in the fixture order.
    expect(
      (screen.getByLabelText("Class group") as HTMLSelectElement).value,
    ).toBe("1001");
  });

  it("respects the program filter", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);
    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Program"), "10");
    await user.click(screen.getByRole("button", { name: /Setup checklist/ }));

    const panel = screen.getByRole("dialog", { name: "Setup checklist" });
    expect(within(panel).getByText("P1 · P1B")).toBeInTheDocument();
    expect(within(panel).queryByText("S1 · S1A")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    await openChecklist(user);

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Setup checklist" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /Setup checklist/ }),
    ).toHaveFocus();
  });
});

describe("Enrollment matrix keyboard grid", () => {
  const openMatrix = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<ClassGroupsManagement />);
    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("P1A")[0]);
    await user.click(screen.getByRole("tab", { name: /Enrollments/ }));
    await screen.findByLabelText("Alice Mutesi — Mathematics");
  };

  it("moves focus with the arrow keys", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    const start = screen.getByLabelText("Alice Mutesi — Mathematics");
    start.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("Alice Mutesi — English")).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByLabelText("Bob Nkusi — English")).toHaveFocus();
  });

  it("does not move past the edges of the grid", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    const start = screen.getByLabelText("Alice Mutesi — Mathematics");
    start.focus();

    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(start).toHaveFocus();
  });

  it("toggles a focused cell with the space bar", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    const cell = screen.getByLabelText("Bob Nkusi — Mathematics");
    cell.focus();
    await user.keyboard(" ");

    expect(cell).toHaveAttribute("aria-checked", "true");
    expect(await screen.findByText("1 change selected")).toBeInTheDocument();
  });

  it("shift+arrow paints the moved-from value into the moved-to cell", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    // Alice's Mathematics is enrolled; extending down paints Bob's, which is not.
    const start = screen.getByLabelText("Alice Mutesi — Mathematics");
    start.focus();
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(screen.getByLabelText("Bob Nkusi — Mathematics")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await screen.findByText("1 change selected")).toBeInTheDocument();
  });

  it("announces unsaved changes politely", async () => {
    const user = userEvent.setup();
    await openMatrix(user);

    await user.click(screen.getByLabelText("Bob Nkusi — English"));

    const live = await screen.findByText(/unsaved enrollment change/);
    expect(live).toHaveAttribute("aria-live", "polite");
  });
});
