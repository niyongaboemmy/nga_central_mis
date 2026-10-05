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
} from "./testHarness";

vi.mock("../../../api/academics", () => academicsMocks);
vi.mock("../../../api/classGroups", () => ({
  classGroupsWorkspaceApi: classGroupsWorkspaceMocks,
}));
vi.mock("../../../api/users", () => ({
  searchUsers: vi.fn(async () => []),
  getUsersWithPagination: vi.fn(async () => ({
    users: [],
    total: 0,
    page: 1,
    totalPages: 1,
  })),
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

import ClassGroupsManagement from "../ClassGroupsManagement";

describe("Class Groups Management — shell, context and navigator", () => {
  beforeEach(() => {
    resetWorkspaceMocks();
    setPermissions(["*"]);
  });

  it("defaults the academic year to the current one and loads the overview for it", async () => {
    render(<ClassGroupsManagement />);

    await waitFor(() =>
      expect(classGroupsWorkspaceMocks.overview).toHaveBeenCalledWith(1),
    );
    expect(
      (screen.getByLabelText("Academic year", { selector: "select" }) as HTMLSelectElement).value,
    ).toBe("1");
  });

  it("lists every class group in the navigator, grouped under its grade", async () => {
    render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    expect(screen.getAllByText("P1B").length).toBeGreaterThan(0);
    expect(screen.getAllByText("S1A").length).toBeGreaterThan(0);
    // Grade headers.
    expect(screen.getAllByText("P1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("S1").length).toBeGreaterThan(0);
  });

  it("scores readiness per class group — P1A is complete, P1B is not", async () => {
    render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));

    // P1A passes all five checks; P1B passes only the curriculum one.
    expect(screen.getAllByLabelText("5/5 complete").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("1/5 complete").length).toBeGreaterThan(0);
  });

  it("counts incomplete class groups and filters down to them", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));

    // P1B and S1A are incomplete.
    const filter = screen.getByRole("button", { name: /Only incomplete/ });
    expect(within(filter).getByText("2")).toBeInTheDocument();

    await user.click(filter);

    await waitFor(() => expect(screen.queryByText("P1A")).not.toBeInTheDocument());
    expect(screen.getAllByText("P1B").length).toBeGreaterThan(0);
  });

  it("narrows the navigator to the selected program", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("S1A").length).toBeGreaterThan(0));

    await user.selectOptions(screen.getByLabelText("Program", { selector: "select" }), "10");

    await waitFor(() => expect(screen.queryByText("S1A")).not.toBeInTheDocument());
    expect(screen.getAllByText("P1A").length).toBeGreaterThan(0);
  });

  it("selecting a class group in the navigator back-fills its grade and program", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("S1A").length).toBeGreaterThan(0));

    await user.click(screen.getAllByText("S1A")[0]);

    await waitFor(() =>
      expect((screen.getByLabelText("Grade", { selector: "select" }) as HTMLSelectElement).value).toBe(
        "200",
      ),
    );
    expect((screen.getByLabelText("Program", { selector: "select" }) as HTMLSelectElement).value).toBe(
      "20",
    );
    expect(
      (screen.getByLabelText("Class group", { selector: "select" }) as HTMLSelectElement).value,
    ).toBe("2000");
  });

  it("clears the class group when the grade above it changes", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("P1A")[0]);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Class group", { selector: "select" }) as HTMLSelectElement).value,
      ).toBe("1000"),
    );

    await user.selectOptions(screen.getByLabelText("Grade", { selector: "select" }), "101");

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Class group", { selector: "select" }) as HTMLSelectElement).value,
      ).toBe(""),
    );
  });

  it("refetches the overview when the academic year changes", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);

    await waitFor(() =>
      expect(classGroupsWorkspaceMocks.overview).toHaveBeenCalledWith(1),
    );

    await user.selectOptions(screen.getByLabelText("Academic year", { selector: "select" }), "2");

    await waitFor(() =>
      expect(classGroupsWorkspaceMocks.overview).toHaveBeenCalledWith(2),
    );
  });

  it("restores the previous selection from storage on remount", async () => {
    const user = userEvent.setup();
    const first = render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("S1A").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("S1A")[0]);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Class group", { selector: "select" }) as HTMLSelectElement).value,
      ).toBe("2000"),
    );

    first.unmount();
    render(<ClassGroupsManagement />);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Class group", { selector: "select" }) as HTMLSelectElement).value,
      ).toBe("2000"),
    );
  });

  it("drops a persisted class group that no longer exists", async () => {
    localStorage.setItem(
      "nga.classgroups.context",
      JSON.stringify({
        academicYearId: 1,
        programId: 10,
        gradeId: 100,
        classGroupId: 999999,
        activeLens: "students",
      }),
    );

    render(<ClassGroupsManagement />);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Class group", { selector: "select" }) as HTMLSelectElement).value,
      ).toBe(""),
    );
  });

  it("switches lenses without losing the class group selection", async () => {
    const user = userEvent.setup();
    render(<ClassGroupsManagement />);

    await waitFor(() => expect(screen.getAllByText("P1A").length).toBeGreaterThan(0));
    await user.click(screen.getAllByText("P1A")[0]);

    await user.click(screen.getByRole("tab", { name: /Subjects/ }));

    expect(
      (screen.getByLabelText("Class group", { selector: "select" }) as HTMLSelectElement).value,
    ).toBe("1000");
    expect(screen.getByRole("tab", { name: /Subjects/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
