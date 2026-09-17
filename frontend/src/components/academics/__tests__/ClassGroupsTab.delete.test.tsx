import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClassGroupsTab from "../ClassGroupsTab";

const dependenciesMock = vi.fn();

vi.mock("../../../api/academics", () => ({
  classGroupsApi: { dependencies: (id: number) => dependenciesMock(id) },
}));

vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

// The tab renders PromoteStudentsModal, which needs a ToastProvider it has
// no reason to pull into a delete-flow test.
vi.mock("../PromoteStudentsModal", () => ({ default: () => null }));

const CLASS_GROUP = { class_group_id: 9, grade_id: 1, name: "L3. Class B" };

const report = (overrides: any = {}) => ({
  data: {
    data: {
      class_group_id: 9,
      name: "L3. Class B",
      requires_confirmation: false,
      deletes: [],
      unlinks: [],
      ...overrides,
    },
  },
});

const renderTab = (onDelete = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <ClassGroupsTab
      data={[CLASS_GROUP]}
      academicYears={[
        {
          academic_year_id: 1,
          name: "2026",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          is_current: 1,
        } as any,
      ]}
      grades={[{ grade_id: 1, program_id: 1, name: "Year 1" } as any]}
      loading={false}
      onRefresh={vi.fn()}
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={onDelete}
      onPromote={vi.fn()}
    />,
  );
  return onDelete;
};

const openDeleteModal = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Delete" }));
};

/** The row's Delete action opens the modal; the modal's Delete confirms it. */
const confirmButton = () => {
  const buttons = screen.getAllByRole("button", { name: "Delete" });
  return buttons[buttons.length - 1];
};

describe("ClassGroupsTab delete flow", () => {
  beforeEach(() => {
    dependenciesMock.mockReset();
  });

  it("deletes a class group that nothing references", async () => {
    dependenciesMock.mockResolvedValue(report());
    const onDelete = renderTab();

    await openDeleteModal();
    await waitFor(() => expect(dependenciesMock).toHaveBeenCalledWith(9));

    await userEvent.click(confirmButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(9, true));
  });

  it("lists what the delete removes and goes ahead once confirmed", async () => {
    dependenciesMock.mockResolvedValue(
      report({
        requires_confirmation: true,
        deletes: [
          {
            key: "students",
            label: "student assignment(s)",
            count: 12,
            destructive: true,
          },
        ],
      }),
    );
    const onDelete = renderTab();

    await openDeleteModal();
    expect(
      await screen.findByText("12 student assignment(s)"),
    ).toBeInTheDocument();

    await userEvent.click(confirmButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(9, true));
  });

  it("still allows the delete when schemes and reports are involved", async () => {
    dependenciesMock.mockResolvedValue(
      report({
        requires_confirmation: true,
        deletes: [
          {
            key: "schemes_of_work",
            label: "scheme(s) of work",
            count: 2,
            destructive: true,
          },
        ],
        unlinks: [
          {
            key: "instructor_reports",
            label: "instructor report(s)",
            count: 41,
            destructive: false,
          },
        ],
      }),
    );
    const onDelete = renderTab();

    await openDeleteModal();
    expect(await screen.findByText("2 scheme(s) of work")).toBeInTheDocument();
    // Reports survive the delete, so they are listed separately from the
    // things it destroys.
    expect(screen.getByText("41 instructor report(s)")).toBeInTheDocument();
    expect(
      screen.getByText(
        "These are kept, but will no longer be linked to a class group:",
      ),
    ).toBeInTheDocument();

    expect(confirmButton()).not.toBeDisabled();
    await userEvent.click(confirmButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(9, true));
  });

  it("surfaces the server's reason when the delete fails", async () => {
    dependenciesMock.mockResolvedValue(report());
    const onDelete = vi.fn().mockRejectedValue({
      response: { data: { message: "Still has 2 lesson report(s)." } },
    });
    renderTab(onDelete);

    await openDeleteModal();
    await waitFor(() => expect(dependenciesMock).toHaveBeenCalled());

    await userEvent.click(confirmButton());

    expect(
      await screen.findByText("Still has 2 lesson report(s)."),
    ).toBeInTheDocument();
  });
});
